/**
 * TrustMyRecord — PICK PROGRESSION NUDGE (pick-progress-nudge.js)
 * ==============================================================
 *
 * WHY IT EXISTS
 *
 * first-pick-onboarding.js owns the member with ZERO picks and stops the
 * moment they lock one. Measured on the 90-day signup cohort (2026-08-24):
 * 29 members made a first pick and only 18 made a second — a 38% drop with
 * nothing on the site addressing it. This file owns the member who has
 * started a record and has not finished building one.
 *
 * IT IS THE SAME STRIP, NOT A NEW COMPONENT
 *
 * It renders the existing .tmr-fp-reminder strip that first-pick-onboarding
 * already ships, in the same place, with the same styles. No new visual
 * language, no layout change, no page rearranged. If those styles have not
 * been injected (the member has picks, so the other script bailed early) a
 * copy of the strip rules only — no panel, no modal — is injected under its
 * own id.
 *
 * EVERY RUNG IS A REAL SITE MECHANIC
 *
 * The copy never invents a reward. GET /api/participation/my-progress returns
 * the next gate from the same constants the backend enforces:
 *   2 picks         a record instead of a one-off
 *   10 picks        first community milestone post (milestones.js)
 *   20 GRADED picks leaderboard eligibility (MAIN_LEADERBOARD_MIN_GRADED_PICKS)
 *   25 GRADED picks Verified Handicapper (VERIFIED_MIN_GRADED_PICKS)
 * Graded and total are different numbers and the copy says which one it means.
 *
 * IT IS QUIET
 *
 * Once per calendar day at most, per browser. Dismissing it stops it for that
 * day. It never appears for a member with zero picks (that is the other
 * script's job and showing both would be two strips), never once every gate
 * is reached, and never on the pick-entry pages themselves, where the member
 * is already doing the thing.
 *
 * Analytics (GA4 + dataLayer), so Phase 12 can test copy against behaviour:
 *   pick_progress_nudge_viewed / _clicked / _dismissed, each with { gate,
 *   picks_total, picks_graded }.
 */
(function () {
    'use strict';

    if (window.__tmrPickProgressNudge) return;
    window.__tmrPickProgressNudge = true;

    var LS_LAST_SHOWN = 'tmr_pp_last_shown';   // YYYY-MM-DD of the last render
    var LS_DISMISSED = 'tmr_pp_dismissed';     // YYYY-MM-DD the member closed it
    var ELEMENT_ID = 'tmr-pp-strip';

    /* Pages where the member is already making or reviewing a pick. A nudge to
       make a pick on the page whose whole job is making a pick is noise. */
    var SUPPRESSED_PATHS = [
        '/sportsbook/', '/submit-pick/', '/submit/', '/make-picks/',
        '/mypicks/', '/my-pending-picks/', '/register/', '/signup/',
        '/login/', '/signin/', '/welcome/'
    ];

    /* Same page map first-pick-onboarding.js uses, so both strips report the
       surface identically. (SURFACE_GRANULARITY_20260825) */
    function surfaceName() {
        var p = (window.location.pathname || '').toLowerCase();
        if (p === '/' || p === '/index.html') return 'homepage';
        if (p.indexOf('/welcome/') === 0) return 'welcome';
        if (p.indexOf('/today/') === 0) return 'today';
        if (p.indexOf('/polls/') === 0) return 'polls';
        if (p.indexOf('/forum/') === 0) return 'forum';
        if (p.indexOf('/trivia/') === 0) return 'trivia';
        if (p.indexOf('/mlb-simulator/') === 0) return 'mlb_simulator';
        if (p.indexOf('/nfl-simulator/') === 0) return 'nfl_simulator';
        if (p.indexOf('/sportsbook/') === 0) return 'sportsbook';
        if (p.indexOf('/profile/') === 0) return 'profile';
        return 'other';
    }

    var ARRIVAL_KEY = 'tmr_activation_arrival';
    function markActivationHandoff(details) {
        try {
            sessionStorage.setItem(ARRIVAL_KEY, JSON.stringify(Object.assign({
                surface: surfaceName(), ts: Date.now()
            }, details || {})));
        } catch (e) {}
    }

    function log() {
        try { console.log.apply(console, ['[TMR PickProgress]'].concat([].slice.call(arguments))); } catch (e) {}
    }

    function track(eventName, params) {
        var payload = params || {};
        try { if (typeof window.gtag === 'function') window.gtag('event', eventName, payload); } catch (e) {}
        try {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push(Object.assign({ event: eventName }, payload));
        } catch (e) {}
    }

    function today() {
        /* Eastern, to match the site's day boundary everywhere else (coin caps,
           poll dates, the participation log). A member at 11pm ET must not get
           a second strip because UTC already rolled over. */
        try {
            return new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(new Date());
        } catch (e) {
            return new Date().toISOString().slice(0, 10);
        }
    }

    function readLS(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function writeLS(key, value) {
        try { localStorage.setItem(key, value); } catch (e) {}
    }

    /* ANOTHER COMPONENT ALREADY OWNS THIS SCREEN'S PICK CTA
       (SIM_ACTIVATION_20260825)

       Same rule first-pick-onboarding.js follows, and for the same reason. The
       MLB simulator's post-result panel renders "Make Your Official Prediction"
       pointing at the board as soon as a run finishes. For a member on one
       pick that is the same ask as this strip's "Make Pick #2", so showing
       both is two prompts for one action. The panel's CTA sits with the result
       they just produced, so it wins and this stands down.

       Before a run there is no competing CTA, so the strip still appears. The
       NFL simulator has no such panel and is unaffected. */
    function competingPickCta() {
        try {
            /* Two components can own the pick CTA on a page this nudge runs on:
               the MLB simulator's post-result panel, and the Poll -> Pick strip
               on /polls/. Both are MORE SPECIFIC than "Make Pick #2" - one sits
               with the simulation the member just ran, the other names the
               prediction they just voted for - so both win and this stands
               down. Neither is modified. */
            return !!document.querySelector('#simcConversionPanel a[href^="/sportsbook/"]')
                || !!document.getElementById('tmr-poll-bridge');
        } catch (e) { return false; }
    }

    /* The panel is built asynchronously after a simulation run. Retire an
       already-visible strip when it arrives; one observer, then disconnect. */
    function standDownWhenAnotherCtaAppears() {
        if (typeof MutationObserver !== 'function' || !document.body) return;
        var observer = new MutationObserver(function () {
            if (!competingPickCta()) return;
            observer.disconnect();
            /* This file has no remove() helper - the earlier version of this
               observer called one that does not exist here, so it threw
               instead of retiring the strip and the double prompt survived.
               Caught by the duplicate-prompt tests. */
            var bar = document.getElementById(ELEMENT_ID);
            if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
            log('another pick CTA rendered on this page - nudge retired');
        });
        try { observer.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
    }

    function suppressedPath() {
        var path = (window.location.pathname || '').toLowerCase();
        for (var i = 0; i < SUPPRESSED_PATHS.length; i++) {
            if (path.indexOf(SUPPRESSED_PATHS[i]) === 0) return true;
        }
        return false;
    }

    function hasToken() {
        try {
            if (window.api && window.api.token) return true;
            var keys = ['tmr_token', 'accessToken', 'access_token', 'tmr_access_token',
                        'trustmyrecord_token', 'token'];
            for (var i = 0; i < keys.length; i++) {
                if (localStorage.getItem(keys[i])) return true;
            }
            return false;
        } catch (e) { return false; }
    }

    // ----------------------------------------------------------------- CSS

    /* Only injected when first-pick-onboarding.js has not already put its
       stylesheet in the document. Rules are a copy of that file's reminder
       strip block and nothing else, so the two strips can never look
       different from one another. */
    function ensureStyles() {
        if (document.getElementById('tmr-fp-styles')) return;
        if (document.getElementById('tmr-pp-styles')) return;
        var css = [
            '.tmr-fp-reminder{position:relative;display:flex;align-items:center;gap:12px;flex-wrap:wrap;',
            'max-width:1180px;margin:12px auto;padding:11px 44px 11px 15px;border-radius:12px;',
            'background:linear-gradient(90deg,rgba(0,110,124,0.30),rgba(10,17,24,0.97));',
            'border:1px solid rgba(0,255,255,0.26);color:#dbe6f3;font:600 0.92rem/1.4 var(--font,Inter,sans-serif);}',
            '.tmr-fp-reminder__icon{flex:0 0 auto;width:30px;height:30px;border-radius:9px;display:flex;',
            'align-items:center;justify-content:center;background:rgba(0,255,255,0.14);color:#67e8f9;font-size:14px;}',
            '.tmr-fp-reminder__text{flex:1 1 200px;}',
            '.tmr-fp-reminder__text strong{color:#f8fafc;font-weight:800;}',
            '.tmr-fp-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;',
            'border-radius:11px;letter-spacing:.02em;cursor:pointer;border:1px solid transparent;',
            'text-decoration:none;transition:transform .14s ease,box-shadow .14s ease;}',
            '.tmr-fp-btn:hover{transform:translateY(-2px);}',
            '.tmr-fp-reminder .tmr-fp-btn{padding:9px 16px;font:800 0.85rem/1 var(--font,Inter,sans-serif);}',
            /* Id-scoped + !important for the same reason the original is: the
               sportsbook ships a body-level button background !important rule
               that out-specifies any plain class selector. */
            '#' + ELEMENT_ID + ' .tmr-fp-btn--primary{background:linear-gradient(135deg,#00ffff,#67e8f9) !important;',
            'color:#04111a !important;box-shadow:0 12px 30px rgba(0,255,255,0.24) !important;text-decoration:none !important;}',
            '.tmr-fp-reminder__close{position:absolute;top:8px;right:10px;background:transparent;border:0;',
            'color:#7f8ea6;font-size:18px;line-height:1;cursor:pointer;padding:4px 6px;}',
            '#' + ELEMENT_ID + ' .tmr-fp-reminder__close{background:transparent !important;border:0 !important;',
            'box-shadow:none !important;color:#7f8ea6 !important;}',
            '.tmr-fp-reminder__close:hover{color:#e2e8f0 !important;}',
            '.tmr-fp-reminder--light{background:#FFFFFF;background-image:none;border-color:#D2DEEA;color:#2E4459;',
            'box-shadow:0 1px 2px rgba(7,24,42,0.04);}',
            '.tmr-fp-reminder--light .tmr-fp-reminder__icon{background:rgba(12,148,140,0.12);color:#0C948C;}',
            '.tmr-fp-reminder--light .tmr-fp-reminder__text strong{color:#07182A;}',
            '#' + ELEMENT_ID + '.tmr-fp-reminder--light .tmr-fp-reminder__close{color:#6B7C8F !important;}',
            '.tmr-fp-reminder--light .tmr-fp-reminder__close:hover{color:#07182A !important;}',
            '#' + ELEMENT_ID + '.tmr-fp-reminder--light .tmr-fp-btn--primary{background:#0C948C !important;',
            'color:#FFFFFF !important;box-shadow:0 1px 2px rgba(7,24,42,0.10) !important;}',
            '@media(max-width:640px){.tmr-fp-reminder{margin:10px 12px;}.tmr-fp-reminder .tmr-fp-btn{flex:1 1 100%;}}'
        ].join('');
        var style = document.createElement('style');
        style.id = 'tmr-pp-styles';
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    // -------------------------------------------------------------- placement

    /* Identical rules to first-pick-onboarding's reminderPlacement: after the
       sitewide nav, never above it. */
    function placement() {
        var main = document.querySelector('main');
        if (main) return { parent: main, before: main.firstChild };
        var nav = document.querySelector('nav.tmr-global-nav') || document.querySelector('body > nav, body > header');
        if (nav && nav.parentNode) return { parent: nav.parentNode, before: nav.nextSibling };
        var reserve = document.getElementById('tmrNavReserve');
        if (reserve && reserve.parentNode) return { parent: reserve.parentNode, before: reserve.nextSibling };
        return { parent: document.body, before: document.body.firstChild };
    }

    // ------------------------------------------------------------------ copy

    /**
     * Copy per gate. `progress` is the server's answer, so the numbers in the
     * sentence are the numbers the backend will enforce — never a guess made
     * in the browser.
     */
    function messageFor(progress) {
        var picks = progress.picks || {};
        var gate = progress.next_gate;
        if (!gate) return null;

        var total = picks.total || 0;
        var graded = picks.graded || 0;
        var pending = picks.pending || 0;

        switch (gate.key) {
            case 'second_pick':
                return {
                    strong: 'Your verified record has started.',
                    rest: 'One pick is a guess. Add a second and it becomes a record.',
                    cta: 'Make Pick #2',
                    href: '/sportsbook/'
                };
            case 'milestone_10':
                return {
                    strong: total + (total === 1 ? ' pick locked.' : ' picks locked.'),
                    rest: gate.remaining + (gate.remaining === 1 ? ' more pick' : ' more picks')
                        + ' and your 10-pick milestone posts to the community feed.',
                    cta: 'Add a Pick',
                    href: '/sportsbook/'
                };
            case 'leaderboard':
                return {
                    strong: graded + ' graded picks.',
                    rest: gate.remaining + ' more graded '
                        + (gate.remaining === 1 ? 'pick puts' : 'picks put') + ' you on the leaderboard.'
                        + (pending > 0 ? ' You have ' + pending + ' still pending.' : ''),
                    cta: 'Add a Pick',
                    href: '/sportsbook/'
                };
            case 'verified':
                return {
                    strong: graded + ' graded picks — you are on the leaderboard.',
                    rest: gate.remaining + ' more graded '
                        + (gate.remaining === 1 ? 'pick makes' : 'picks make') + ' you a Verified Handicapper.',
                    cta: 'Add a Pick',
                    href: '/sportsbook/'
                };
            default:
                /* first_pick belongs to first-pick-onboarding.js. Two strips
                   saying the same thing is worse than one. */
                return null;
        }
    }

    // ---------------------------------------------------------------- render

    function render(progress) {
        if (document.getElementById(ELEMENT_ID)) return;
        if (competingPickCta()) {
            log('another pick CTA already on screen - not rendering the nudge');
            return;
        }
        var msg = messageFor(progress);
        if (!msg) return;

        ensureStyles();
        var spot = placement();
        if (!spot || !spot.parent) return;

        /* THEME_MATCH_20260824: same rule as first-pick-onboarding.js. This
           strip lands on /today/, /polls/ and /forum/, which are light pages,
           and the shared .tmr-fp-reminder is styled for the homepage's dark
           band. Ask the surface, not a page list. */
        var light = (function (node) {
            /* Locked dark surfaces: the homepage's dark band is a SIBLING of
               the strip, so walking up reads the light page background and
               would repaint it. /profile/ is dark throughout. */
            var path = (window.location.pathname || '').toLowerCase();
            if (path === '/' || path === '/index.html' || path.indexOf('/profile/') === 0) return false;
            try {
                var el = node;
                for (var hops = 0; el && hops < 6; hops++, el = el.parentElement) {
                    var bg = window.getComputedStyle(el).backgroundColor;
                    var m = bg && bg.match(/rgba?\(([^)]+)\)/);
                    if (!m) continue;
                    var parts = m[1].split(',').map(function (x) { return parseFloat(x); });
                    if (parts.length > 3 && parts[3] < 0.5) continue;
                    return ((0.299 * parts[0] + 0.587 * parts[1] + 0.114 * parts[2]) / 255) > 0.6;
                }
            } catch (e) {}
            return false;
        })(spot.parent);

        var picks = progress.picks || {};
        var gateKey = progress.next_gate.key;

        var bar = document.createElement('div');
        bar.id = ELEMENT_ID;
        bar.className = 'tmr-fp-reminder' + (light ? ' tmr-fp-reminder--light' : '');
        bar.setAttribute('role', 'status');
        bar.innerHTML =
            '<span class="tmr-fp-reminder__icon" aria-hidden="true">&#9673;</span>' +
            '<span class="tmr-fp-reminder__text"><strong></strong> <span class="tmr-pp-rest"></span></span>' +
            '<a class="tmr-fp-btn tmr-fp-btn--primary" id="tmr-pp-cta"></a>' +
            '<button type="button" class="tmr-fp-reminder__close" aria-label="Dismiss">&times;</button>';

        /* textContent, not innerHTML, for anything derived from server data. */
        bar.querySelector('strong').textContent = msg.strong;
        bar.querySelector('.tmr-pp-rest').textContent = msg.rest;
        var cta = bar.querySelector('#tmr-pp-cta');
        cta.textContent = msg.cta;
        cta.href = msg.href;

        spot.parent.insertBefore(bar, spot.before || null);
        writeLS(LS_LAST_SHOWN, today());

        var facts = { gate: gateKey, picks_total: picks.total || 0, picks_graded: picks.graded || 0,
                      surface: surfaceName(), cta_location: 'pick_progress_strip' };
        track('pick_progress_nudge_viewed', facts);

        cta.addEventListener('click', function () {
            track('pick_progress_nudge_clicked', facts);
            markActivationHandoff({ source: 'pick_progress_strip', cta_location: 'pick_progress_strip', gate: gateKey });
        });
        bar.querySelector('.tmr-fp-reminder__close').addEventListener('click', function () {
            writeLS(LS_DISMISSED, today());
            track('pick_progress_nudge_dismissed', facts);
            if (bar.parentNode) bar.parentNode.removeChild(bar);
        });
    }

    // ------------------------------------------------------------------ boot

    function start() {
        if (suppressedPath()) return;
        if (!hasToken()) return;

        var day = today();
        if (readLS(LS_DISMISSED) === day) return;
        if (readLS(LS_LAST_SHOWN) === day) return;

        if (!window.api || typeof window.api.request !== 'function') return;
        var ready = (window.api.ready && typeof window.api.ready.then === 'function')
            ? window.api.ready.catch(function () {})
            : Promise.resolve();

        ready.then(function () {
            return window.api.request('/participation/my-progress');
        }).then(function (data) {
            /* Never guess. A malformed or failed answer means no strip — an
               established member must not be told to make their second pick. */
            if (!data || !data.picks || typeof data.picks.total !== 'number') return;
            if (data.picks.total < 1) return;      // zero-pick members belong to the other script
            if (!data.next_gate) return;           // every gate reached
            render(data);
            standDownWhenAnotherCtaAppears();
        }).catch(function (err) {
            log('my-progress failed', (err && err.message) || err);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
