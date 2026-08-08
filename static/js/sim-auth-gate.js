/* =============================================================================
   SIM AUTH GATE (sim-auth-gate.js)                       SIM_AUTH_GATE_20260808
   -----------------------------------------------------------------------------
   Shared "create a free account to RUN this simulation" gate + state-preserving
   return path, used by every TrustMyRecord simulator (MLB, NFL, ...).

   Deliberate design constraints:

   * The simulator PAGE is never blocked. Nothing here hides, disables or
     removes markup: the visitor still lands on the page, reads it, picks a
     sport/teams/settings exactly as before. Only the RUN action is gated, and
     only while logged out. That keeps every page 100% crawlable - no markup
     changes, no noindex, no content behind auth - so SEO is untouched.

   * Zero coupling to a simulator's internals. Each page registers an adapter
     (captureState / restoreState / runNow) and the gate never reaches into
     simulator code itself. A simulator can change entirely as long as its
     adapter still answers those three questions.

   * State survives the auth round-trip. On a gated click the adapter's
     captureState() snapshot goes to localStorage, and the visitor is sent to
     /register/ or /login/ with a return path back to THIS page carrying
     ?simResume=1. On return the snapshot is re-applied and the run fires
     automatically - the visitor never re-picks anything and is never dumped on
     the homepage or their profile.

   * Kill switch: window.SIM_GATE_FLAGS = { gate:false } (set inline on the page
     BEFORE this script) turns the gate into a pass-through - the simulator goes
     back to running freely for logged-out visitors, no code change, no deploy of
     this file. { resume:false } disables only the auto-resume half.

   Analytics (GA4 via TMRAnalytics/tmrTrack, never throws, never blocks) - the
   funnel in order, so a drop-off is readable step to step:
     simulator_page_viewed              visitor reached a simulator
     simulator_configured               they touched any setting (intent)
     simulator_run_clicked_logged_out   they tried to run without an account
     simulator_gate_impression          the signup panel was actually on screen
     simulator_gate_dismissed           they closed it instead (+ dismiss_reason)
     simulator_signup_started           they left for /register/ or /login/ (+ auth_method)
     simulator_signup_completed         they came back signed up
     simulator_login_completed          they came back logged in
     simulator_state_restored           their configuration survived the round trip
     simulator_simulation_completed     a run finished
     simulator_first_simulation_completed   their first ever, as a member
     simulator_return_visit             they came back later (+ days_since_last_visit)
   The two later milestones - first verified pick, first TMR Coin - happen on
   other pages days later and are emitted by static/js/tmr-activation-funnel.js
   against the origin stamp written here.
   ============================================================================= */
(function () {
    'use strict';

    if (window.TMRSimGate) return;

    var FLAGS = window.SIM_GATE_FLAGS || {};
    var STORE_KEY = 'tmr_sim_gate_pending';
    var VISIT_PREFIX = 'tmr_sim_visited_';
    var FIRST_PREFIX = 'tmr_sim_first_done_';
    var ORIGIN_KEY = 'tmr_sim_funnel_origin';
    var TTL_MS = 45 * 60 * 1000;
    var STYLE_ID = 'tmr-sim-gate-style';

    var cfg = null;
    var configuredFired = false;
    var modalEl = null;
    var resumeHandled = false;

    /* ------------------------------------------------------------------ */
    /* CONFIGURED-BUT-NO-RUN diagnostics                                    */
    /* ------------------------------------------------------------------ */
    /* The largest drop in the funnel is people who configure a matchup and
       never press Run. "They lost interest" is a guess; this records what was
       actually true when they left, so the reason can be attributed instead of
       assumed. Everything here is page-local state about the page's own DOM —
       no identifiers, nothing about the person. It is reported once, on the way
       out, and only when a run never happened. */
    var diag = {
        configuredAt: 0,
        firstRunAt: 0,
        runAttempts: 0,
        reconfigures: 0,      // changed their selection again after configuring
        runEverVisible: false,
        runEverInViewport: false,
        runEverEnabled: false,
        uiError: null,
        reported: false
    };

    function runControlEl() {
        try {
            var sels = (cfg && (cfg.runControlSelectors || cfg.runSelectors)) || [];
            for (var i = 0; i < sels.length; i++) {
                var el = document.querySelector(sels[i]);
                if (el) return el;
            }
        } catch (e) { }
        return null;
    }

    function inspectRunControl() {
        var el = runControlEl();
        if (!el) return { present: false, visible: false, enabled: false, inViewport: false };
        var visible = false, inViewport = false, enabled = false;
        try {
            var cs = window.getComputedStyle(el);
            var r = el.getBoundingClientRect();
            visible = cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
            inViewport = visible && r.top < (window.innerHeight || 0) && r.bottom > 0;
            enabled = !el.disabled && el.getAttribute('aria-disabled') !== 'true';
        } catch (e) { }
        return { present: true, visible: visible, enabled: enabled, inViewport: inViewport };
    }

    /* Sampled while the visitor is still on the page, because at pagehide the
       layout may already be torn down and every measurement reads false. */
    function sampleRunControl() {
        var s = inspectRunControl();
        if (!s.present) return;
        if (s.visible) diag.runEverVisible = true;
        if (s.inViewport) diag.runEverInViewport = true;
        if (s.enabled) diag.runEverEnabled = true;
    }

    /* One label, chosen from what we observed - not from what we assume. */
    function classifyNoRun(state) {
        if (diag.uiError) return 'validation_error';
        if (state.present && !state.everVisible) return 'run_not_visible';
        if (state.present && state.everVisible && !state.everEnabled) return 'run_disabled';
        if (state.present && state.everVisible && !state.everInViewport) return 'run_never_scrolled_into_view';
        if (state.navigatedAway) return 'navigation_away';
        if (state.reconfigures > 0) return 'kept_reconfiguring';
        if (state.loggedIn) return 'already_logged_in_no_run';
        return 'abandoned';
    }

    function reportConfiguredNoRun(navigatedAway) {
        if (diag.reported) return;
        if (!configuredFired) return;          // never configured: not this funnel step
        if (diag.runAttempts > 0) return;      // they ran: nothing to explain
        diag.reported = true;

        var live = inspectRunControl();
        var state = {
            present: live.present,
            everVisible: diag.runEverVisible || live.visible,
            everEnabled: diag.runEverEnabled || live.enabled,
            everInViewport: diag.runEverInViewport || live.inViewport,
            navigatedAway: !!navigatedAway,
            reconfigures: diag.reconfigures,
            loggedIn: isLoggedIn()
        };

        track('simulator_configured_no_run', {
            reason: classifyNoRun(state),
            run_present: state.present ? 'yes' : 'no',
            run_visible: state.everVisible ? 'yes' : 'no',
            run_enabled: state.everEnabled ? 'yes' : 'no',
            run_in_viewport: state.everInViewport ? 'yes' : 'no',
            reconfigured: state.reconfigures,
            gate_eligible: (FLAGS.gate !== false && !state.loggedIn) ? 'yes' : 'no',
            ui_error: diag.uiError ? String(diag.uiError).slice(0, 80) : 'none',
            seconds_since_configured: diag.configuredAt ? Math.round((Date.now() - diag.configuredAt) / 1000) : null
        });
    }

    function installDiagnostics() {
        // Sample the Run control periodically and on scroll, while the page is
        // still alive to measure.
        var sampler = setInterval(sampleRunControl, 1500);
        window.addEventListener('scroll', sampleRunControl, { passive: true });
        window.addEventListener('resize', sampleRunControl, { passive: true });

        // A page error while configuring is a real candidate explanation.
        window.addEventListener('error', function (e) {
            if (!diag.uiError) diag.uiError = (e && e.message) || 'script error';
        });

        // pagehide is the reliable end-of-session signal on mobile Safari, where
        // unload frequently never fires.
        window.addEventListener('pagehide', function () { clearInterval(sampler); reportConfiguredNoRun(true); });
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') reportConfiguredNoRun(false);
        });
    }

    /* ---------------------------------------------------------------- utils */

    function qs(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function isLoggedIn() {
        try { return !!(window.api && typeof window.api.isLoggedIn === 'function' && window.api.isLoggedIn()); }
        catch (e) { return false; }
    }

    function deviceCategory() {
        var w = window.innerWidth || document.documentElement.clientWidth || 0;
        if (w < 768) return 'mobile';
        if (w < 1024) return 'tablet';
        return 'desktop';
    }

    /* GA4 name -> server milestone. GA4 alone cannot answer "did THIS ACCOUNT
       come back on another device", so the funnel is mirrored to the backend:
       pre-account steps become anonymous daily counters, post-account steps
       become write-once timestamps on the member's own activation row. See
       services/activationFunnel.js. */
    var SERVER_PRE = {
        simulator_page_viewed: 'page_viewed',
        simulator_configured: 'configured',
        simulator_run_clicked_logged_out: 'run_clicked_logged_out',
        simulator_gate_impression: 'gate_impression',
        simulator_gate_dismissed: 'gate_dismissed',
        simulator_run_clicked: 'run_clicked',
        simulator_configured_no_run: 'configured_no_run',
        simulator_signup_started: 'signup_started'
    };
    var SERVER_POST = {
        simulator_signup_completed: 'signup_completed',
        simulator_login_completed: 'returned_to_simulator',
        simulator_state_restored: 'returned_to_simulator',
        simulator_first_simulation_completed: 'first_simulation',
        simulator_simulation_completed: 'simulation_completed'
    };

    function apiBase() {
        try { return (window.CONFIG && CONFIG.api && CONFIG.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api'; }
        catch (e) { return 'https://trustmyrecord-api.onrender.com/api'; }
    }

    function mirrorToServer(name, simulator) {
        try {
            var post = SERVER_POST[name];
            if (post && isLoggedIn() && window.api && typeof window.api.request === 'function') {
                window.api.request('/activation/milestone', {
                    method: 'POST', body: { milestone: post, simulator: simulator }
                }).catch(function () { });
                return;
            }
            var pre = SERVER_PRE[name];
            if (!pre) return;
            var body = JSON.stringify({ milestone: pre, simulator: simulator });
            // sendBeacon survives the navigation that signup_started triggers.
            if (navigator.sendBeacon) {
                navigator.sendBeacon(apiBase() + '/activation/pulse', new Blob([body], { type: 'application/json' }));
            } else {
                fetch(apiBase() + '/activation/pulse', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: body, keepalive: true
                }).catch(function () { });
            }
        } catch (e) { /* the funnel must never break a simulator */ }
    }

    function track(name, params) {
        try {
            var p = params || {};
            p.simulator = (cfg && cfg.simulator) || 'unknown';
            p.device = deviceCategory();
            p.logged_in = isLoggedIn() ? 'yes' : 'no';
            p.page_path = window.location.pathname;
            if (window.TMRAnalytics && typeof window.TMRAnalytics.track === 'function') window.TMRAnalytics.track(name, p);
            else if (typeof window.tmrTrack === 'function') window.tmrTrack(name, p);
            else if (typeof window.gtag === 'function') window.gtag('event', name, p);
            mirrorToServer(name, p.simulator);
        } catch (e) { /* analytics must never break a simulator */ }
    }

    function readStore() {
        try {
            var raw = localStorage.getItem(STORE_KEY);
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (!obj || obj.v !== 1) return null;
            if (!obj.ts || (Date.now() - obj.ts) > TTL_MS) { clearStore(); return null; }
            return obj;
        } catch (e) { return null; }
    }
    function writeStore(obj) { try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) { } }
    function clearStore() { try { localStorage.removeItem(STORE_KEY); } catch (e) { } }

    /* Attribution stamp for the later half of the funnel (first verified pick,
       first TMR Coin) which happens on other pages, days later - see
       static/js/tmr-activation-funnel.js. Written once, at the moment a
       logged-out visitor is actually asked to sign up, so those milestones can
       be traced back to the simulator that produced the account instead of
       looking like generic site activity. Never overwritten by a later gate:
       first touch wins, matching how tmr_first_touch treats signup source. */
    function stampFunnelOrigin() {
        try {
            if (localStorage.getItem(ORIGIN_KEY)) return;
            localStorage.setItem(ORIGIN_KEY, JSON.stringify({
                simulator: (cfg && cfg.simulator) || 'unknown',
                path: (cfg && cfg.returnPath) || window.location.pathname,
                ts: Date.now()
            }));
        } catch (e) { }
    }

    /* Only an on-site relative path is ever produced/honored here - same guard as
       login/index.html safeNextPath() and register/index.html's ?return= check,
       so this can never become an open redirect. */
    function returnPath() {
        var base = (cfg && cfg.returnPath) || window.location.pathname;
        if (!/^\/(?!\/)/.test(base) || base.indexOf('://') !== -1) base = window.location.pathname;
        return base + (base.indexOf('?') === -1 ? '?' : '&') + 'simResume=1';
    }

    /* ---------------------------------------------------------------- styles */

    function injectStyle() {
        if (qs(STYLE_ID)) return;
        var s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = [
            '.tsg-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;',
            'padding:20px;background:rgba(4,8,16,.78);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);',
            'font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;overflow-y:auto;}',
            '.tsg-card{width:100%;max-width:440px;box-sizing:border-box;background:#12121a;color:#e8e8f0;',
            'border:1px solid #2a2a4a;border-radius:16px;padding:28px;box-shadow:0 24px 70px rgba(0,0,0,.6);',
            'position:relative;animation:tsgIn .18s ease-out;}',
            '@keyframes tsgIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}',
            '@media (prefers-reduced-motion:reduce){.tsg-card{animation:none}}',
            '.tsg-badge{display:inline-flex;align-items:center;gap:7px;font-size:.72rem;font-weight:800;letter-spacing:.08em;',
            'text-transform:uppercase;color:#04211f;background:linear-gradient(135deg,#2DD4BF,#7FEBDC);',
            'padding:5px 11px;border-radius:999px;margin-bottom:14px;}',
            '.tsg-card h2{margin:0 0 10px;font-family:Barlow,Inter,sans-serif;font-size:1.32rem;line-height:1.25;font-weight:800;color:#fff;}',
            '.tsg-card p{margin:0 0 16px;font-size:.94rem;line-height:1.55;color:#a7b4c9;}',
            '.tsg-ctx{margin:0 0 16px;padding:11px 13px;border-radius:10px;background:#0c0c14;border:1px solid #23233a;',
            'font-size:.86rem;color:#cbd6e6;}',
            '.tsg-ctx b{color:#fff;}',
            '.tsg-list{list-style:none;margin:0 0 20px;padding:0;}',
            '.tsg-list li{position:relative;padding-left:24px;margin-bottom:8px;font-size:.88rem;color:#9fb0c7;line-height:1.45;}',
            '.tsg-list li:before{content:"";position:absolute;left:5px;top:.52em;width:7px;height:7px;border-radius:50%;background:#2DD4BF;}',
            '.tsg-actions{display:flex;flex-direction:column;gap:10px;}',
            '.tsg-btn{display:block;width:100%;box-sizing:border-box;text-align:center;text-decoration:none;cursor:pointer;',
            'border:none;border-radius:10px;padding:13px 18px;font:800 .95rem Inter,system-ui,sans-serif;transition:filter .15s ease;}',
            '.tsg-btn:hover{filter:brightness(1.08);}',
            '.tsg-btn.is-primary{background:linear-gradient(135deg,#00AEFF,#2DD4BF);color:#04121c;}',
            '.tsg-btn.is-ghost{background:transparent;color:#8fd8ff;border:1px solid rgba(0,174,255,.42);}',
            '.tsg-later{margin-top:6px;background:none;border:none;color:#6b7a94;font:600 .82rem Inter,system-ui,sans-serif;',
            'cursor:pointer;padding:8px;width:100%;}',
            '.tsg-later:hover{color:#9fb0c7;}',
            '.tsg-note{margin:14px 0 0;font-size:.78rem;color:#6b7a94;text-align:center;}',
            '.tsg-x{position:absolute;top:12px;right:12px;background:none;border:none;color:#6b7a94;font-size:1.35rem;',
            'line-height:1;cursor:pointer;padding:6px 10px;border-radius:8px;}',
            '.tsg-x:hover{color:#fff;background:rgba(255,255,255,.06);}',
            '.tsg-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:24px;z-index:100001;max-width:min(92vw,520px);',
            'box-sizing:border-box;padding:12px 18px;border-radius:12px;background:linear-gradient(135deg,#2DD4BF,#7FEBDC);',
            'color:#04211f;font:700 .88rem Inter,system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.45);text-align:center;}',
            '@media (max-width:600px){.tsg-card{padding:22px 18px;border-radius:14px;}.tsg-card h2{font-size:1.15rem;}}'
        ].join('');
        document.head.appendChild(s);
    }

    /* ----------------------------------------------------------------- modal */

    function closeModal(reason) {
        if (!modalEl) return;
        var el = modalEl;
        modalEl = null;
        document.removeEventListener('keydown', onKeydown, true);
        if (el.parentNode) el.parentNode.removeChild(el);
        if (reason) track('simulator_gate_dismissed', { dismiss_reason: reason });
    }

    function onKeydown(e) {
        if (e.key === 'Escape' || e.keyCode === 27) { e.stopPropagation(); closeModal('escape'); }
    }

    function openModal(ctxLine) {
        if (modalEl) return;
        injectStyle();

        var headline = (cfg && cfg.gateHeadline) || 'Create a free TrustMyRecord account to run your simulation and save your results.';
        var label = (cfg && cfg.label) || 'simulation';

        var overlay = document.createElement('div');
        overlay.className = 'tsg-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'tsgTitle');
        overlay.innerHTML =
            '<div class="tsg-card">' +
            '<button type="button" class="tsg-x" id="tsgClose" aria-label="Close">&times;</button>' +
            '<span class="tsg-badge">Free account &middot; unlocks now</span>' +
            '<h2 id="tsgTitle">' + esc(headline) + '</h2>' +
            (ctxLine ? '<div class="tsg-ctx">' + ctxLine + '</div>' : '') +
            '<p>Your ' + esc(label) + ' setup is already saved. Finish in about 30 seconds and it runs the moment you land back here &mdash; nothing to re-pick.</p>' +
            '<ul class="tsg-list">' +
            '<li>Run unlimited simulations, free</li>' +
            '<li>Every run saved to your simulation history</li>' +
            '<li>Turn a projection into a timestamped, auto-graded verified pick</li>' +
            '</ul>' +
            '<div class="tsg-actions">' +
            '<button type="button" class="tsg-btn is-primary" id="tsgSignup">Create Free Account &amp; Run It</button>' +
            '<a class="tsg-btn is-ghost" id="tsgLogin" href="#">I already have an account &mdash; log in</a>' +
            '</div>' +
            '<button type="button" class="tsg-later" id="tsgLater">Not right now</button>' +
            '<p class="tsg-note">No credit card. No spam. Your picks stay yours.</p>' +
            '</div>';

        document.body.appendChild(overlay);
        modalEl = overlay;

        var rp = returnPath();
        var signupHref = '/register/?return=' + encodeURIComponent(rp);
        var loginHref = '/login/?next=' + encodeURIComponent(rp);

        // simulator_signup_started is the step the whole funnel is judged on -
        // it is the denominator for "did they finish signing up". gtag batches
        // its queue, so firing an event and navigating in the SAME tick can
        // drop it, which would silently under-report exactly the number we are
        // trying to improve. Give the beacon a beat, then navigate. The delay
        // is imperceptible, and navigation still happens even if tracking threw.
        function leaveFor(href, method) {
            track('simulator_signup_started', { auth_method: method });
            setTimeout(function () { window.location.href = href; }, 160);
        }

        qs('tsgLogin').setAttribute('href', loginHref);   // real href: middle-click / open-in-new-tab still work
        qs('tsgLogin').addEventListener('click', function (e) {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;  // let the browser handle it
            e.preventDefault();
            leaveFor(loginHref, 'login');
        });
        qs('tsgSignup').addEventListener('click', function () { leaveFor(signupHref, 'register'); });
        qs('tsgClose').addEventListener('click', function () { closeModal('close_button'); });
        qs('tsgLater').addEventListener('click', function () { closeModal('not_now'); });
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal('backdrop'); });
        document.addEventListener('keydown', onKeydown, true);

        setTimeout(function () { try { qs('tsgSignup').focus(); } catch (e) { } }, 30);

        // Impression is tracked when the panel is genuinely on screen, not
        // when the click happened - the two diverge if rendering ever fails,
        // and the funnel's denominator has to be what people actually saw.
        stampFunnelOrigin();
        track('simulator_gate_impression', { has_context: ctxLine ? 'yes' : 'no' });
    }

    function toast(message) {
        injectStyle();
        var t = document.createElement('div');
        t.className = 'tsg-toast';
        t.setAttribute('role', 'status');
        t.textContent = message;
        document.body.appendChild(t);
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 6500);
    }

    /* ------------------------------------------------------------ the gate */

    function safeCapture() {
        try { return (cfg && typeof cfg.captureState === 'function') ? (cfg.captureState() || {}) : {}; }
        catch (e) { return {}; }
    }

    function contextLine() {
        try { return (cfg && typeof cfg.describeState === 'function') ? cfg.describeState() : ''; }
        catch (e) { return ''; }
    }

    /* CONFIGURE -> RUN was unmeasurable before this. simulator_run_clicked_logged_out
       only fires on the gated branch, so every run by a signed-in member was
       invisible and the gap between "configured" and "gate impression" looked
       like people refusing to press Run when much of it was simply members
       running simulations normally. noteRunAttempt fires for EVERY run attempt,
       logged in or out, so the drop-off can actually be attributed.
       Deduped: the capture-phase guard and an adapter's own requireAuth call can
       both land on one click. */
    var lastRunAttemptAt = 0;
    function noteRunAttempt(meta) {
        var now = Date.now();
        if (now - lastRunAttemptAt < 120) return;
        lastRunAttemptAt = now;
        diag.runAttempts += 1;
        diag.firstRunAt = diag.firstRunAt || now;
        track('simulator_run_clicked', Object.assign({ member: isLoggedIn() ? 'yes' : 'no' }, meta || {}));
    }

    /* Returns TRUE when the run may proceed, FALSE when it was gated. */
    function requireAuth(meta) {
        noteRunAttempt(meta);
        if (FLAGS.gate === false) return true;
        if (!cfg) return true;
        if (isLoggedIn()) return true;

        writeStore({
            v: 1,
            ts: Date.now(),
            sim: cfg.simulator,
            path: (cfg.returnPath || window.location.pathname),
            state: safeCapture(),
            autoRun: true
        });
        track('simulator_run_clicked_logged_out', meta || {});
        openModal(contextLine());
        return false;
    }

    /* --------------------------------------------------- resume after auth */

    function urlFlag(name) {
        try { return new URLSearchParams(window.location.search).get(name); }
        catch (e) { return null; }
    }

    function cleanUrl() {
        try {
            var u = new URL(window.location.href);
            ['simResume', 'signedUp', 'first_pick'].forEach(function (k) { u.searchParams.delete(k); });
            window.history.replaceState({}, '', u.toString());
        } catch (e) { }
    }

    function markFirstSimulationIfNeeded() {
        var key = FIRST_PREFIX + cfg.simulator;
        var already;
        try { already = localStorage.getItem(key); } catch (e) { already = '1'; }
        if (already) return false;
        try { localStorage.setItem(key, String(Date.now())); } catch (e) { }
        return true;
    }

    function handleResume() {
        if (resumeHandled || FLAGS.resume === false) return;
        resumeHandled = true;

        var wantsResume = urlFlag('simResume') === '1';
        var signedUp = urlFlag('signedUp') === '1';
        if (!wantsResume && !signedUp) return;

        /* register/index.html sets tmr_post_auth_redirect='picks' on every signup.
           We got here via its ?return= branch, so that flag is stale and would
           hijack the visitor's NEXT login in this tab. Drop it. */
        try { sessionStorage.removeItem('tmr_post_auth_redirect'); } catch (e) { }

        var stored = readStore();
        cleanUrl();

        if (!isLoggedIn()) return;               /* auth did not actually complete */
        track(signedUp ? 'simulator_signup_completed' : 'simulator_login_completed', {});
        if (!stored || stored.sim !== cfg.simulator || !stored.autoRun) return;

        clearStore();
        track('simulator_state_restored', {});

        var apply;
        try { apply = cfg.restoreState ? cfg.restoreState(stored.state) : null; }
        catch (e) { apply = null; }

        toast('Welcome in — your ' + ((cfg && cfg.label) || 'simulation') + ' setup was restored. Running it now.');

        Promise.resolve(apply).then(function () {
            try { if (typeof cfg.runNow === 'function') cfg.runNow(stored.state); } catch (e) { }
        }).catch(function () { });
    }

    /* ------------------------------------------------------- visit tracking */

    function trackVisit() {
        track('simulator_page_viewed', {});
        var key = VISIT_PREFIX + cfg.simulator;
        var prev = null;
        try { prev = localStorage.getItem(key); } catch (e) { }
        try { localStorage.setItem(key, String(Date.now())); } catch (e) { }
        if (!prev) return;
        var days = Math.floor((Date.now() - Number(prev)) / 86400000);
        if (!isFinite(days) || days < 0) return;
        track('simulator_return_visit', { days_since_last_visit: days, member: isLoggedIn() ? 'yes' : 'no' });
    }

    /* --------------------------------------------------- click interception */

    /* Capture-phase, document-level: fires BEFORE the simulator's own listener
       (which is always bound on the button itself, in bubble phase), so a gated
       click never reaches the simulator at all. Used by pages whose run entry
       point is not reachable as a function (e.g. the MLB simulator's IIFE). */
    function installClickGuard(selectors) {
        if (!selectors || !selectors.length) return;
        // Always-on, non-blocking: records the attempt for EVERY visitor so
        // CONFIGURE -> RUN is measurable, then the guard below decides.
        document.addEventListener('click', function (e) {
            var t0 = e.target;
            if (!t0 || !t0.closest) return;
            for (var k = 0; k < selectors.length; k++) {
                if (t0.closest(selectors[k])) { noteRunAttempt({ trigger: selectors[k] }); break; }
            }
        }, true);

        document.addEventListener('click', function (e) {
            if (isLoggedIn() || FLAGS.gate === false) return;
            var t = e.target;
            if (!t || !t.closest) return;
            for (var i = 0; i < selectors.length; i++) {
                if (t.closest(selectors[i])) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    requireAuth({ trigger: selectors[i] });
                    return;
                }
            }
        }, true);
    }

    /* ------------------------------------------------------------- public API */

    var API = {
        register: function (options) {
            cfg = options || {};
            if (!cfg.simulator) cfg.simulator = 'unknown';
            installClickGuard(cfg.runSelectors);
            var start = function () {
                trackVisit();
                installDiagnostics();
                handleResume();
            };
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
            else start();
            return API;
        },

        /* Adapters whose run path IS reachable as a function call this directly. */
        requireAuth: requireAuth,

        /* Adapters whose run path is not a click can record the attempt directly. */
        noteRunAttempt: noteRunAttempt,

        /* An adapter that catches a user-facing failure can name it, so a
           configured-but-no-run session is classified as an error rather than
           being written off as abandonment. */
        noteUiError: function (message) { if (!diag.uiError) diag.uiError = message; },

        isLoggedIn: isLoggedIn,
        track: track,
        toast: toast,

        /* Fire once per page when the visitor first touches any setting. */
        markConfigured: function (params) {
            if (configuredFired) { diag.reconfigures += 1; return; }
            configuredFired = true;
            diag.configuredAt = Date.now();
            sampleRunControl();
            track('simulator_configured', params || {});
        },

        /* Fire when a result finishes rendering. */
        markCompleted: function (params) {
            var p = params || {};
            track('simulator_simulation_completed', p);
            if (isLoggedIn() && markFirstSimulationIfNeeded()) {
                track('simulator_first_simulation_completed', p);
            }
        },

        closeModal: function () { closeModal(null); }
    };

    window.TMRSimGate = API;
})();
