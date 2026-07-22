/**
 * TrustMyRecord — New-User First-Pick Activation Flow
 * ---------------------------------------------------
 * Turns a fresh registration into an active pick maker instead of dropping
 * them on a generic page.
 *
 *   /register/  -> redirects to /sportsbook/?first_pick=1
 *   /sportsbook/ -> welcome panel + 3-step progress + CTA that scrolls to the
 *                   board and highlights the pick-entry area
 *   first lock  -> "Your first pick is locked" confirmation modal
 *   other pages -> small "Your record is waiting" reminder strip
 *
 * Eligibility is decided by the BACKEND (GET /api/picks/activation-status),
 * never by localStorage alone, so:
 *   - brand-new accounts AND existing accounts with zero picks see it
 *   - anyone who has ever submitted a pick never sees it again
 *   - clearing localStorage cannot resurrect it for an activated user
 *
 * Analytics events emitted (GA4 + dataLayer):
 *   account_created (fired by /register/), sportsbook_onboarding_viewed,
 *   first_pick_cta_clicked, first_pick_started, first_pick_submitted,
 *   first_pick_abandoned
 */
(function () {
    'use strict';

    if (window.__tmrFirstPickOnboarding) return;
    window.__tmrFirstPickOnboarding = true;

    var LS_ACTIVATED = 'tmr_has_posted_pick';   // '1' once the user has any pick
    var SS_SESSION_FLAGS = 'tmr_fp_session';    // per-tab: viewed/started/collapsed

    var state = {
        userId: null,
        eligible: false,
        onSportsbook: false,
        viewed: false,
        started: false,
        submitted: false,
        abandonSent: false
    };

    // ---------------------------------------------------------------- utils

    function log() {
        try { console.log.apply(console, ['[TMR FirstPick]'].concat([].slice.call(arguments))); } catch (e) {}
    }

    function track(eventName, params) {
        var payload = params || {};
        try {
            if (typeof window.gtag === 'function') window.gtag('event', eventName, payload);
        } catch (e) {}
        try {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push(Object.assign({ event: eventName }, payload));
        } catch (e) {}
        log('event', eventName, payload);
    }
    window.tmrFirstPickTrack = track;

    function sessionFlags() {
        try { return JSON.parse(sessionStorage.getItem(SS_SESSION_FLAGS) || '{}') || {}; } catch (e) { return {}; }
    }
    function setSessionFlag(key, value) {
        try {
            var f = sessionFlags();
            f[key] = value;
            sessionStorage.setItem(SS_SESSION_FLAGS, JSON.stringify(f));
        } catch (e) {}
    }

    function isSportsbook() {
        return /^\/sportsbook\/?$/i.test(window.location.pathname);
    }

    // NOTE: only used for logging/labels. Eligibility is decided by the
    // backend response, never by these keys — tmr_current_user has been
    // observed holding a STALE user after an account switch in the same tab.
    function getStoredUser() {
        var candidates = ['trustmyrecord_session', 'tmr_current_user', 'tmr_user'];
        for (var i = 0; i < candidates.length; i++) {
            try {
                var raw = localStorage.getItem(candidates[i]) || sessionStorage.getItem(candidates[i]);
                if (!raw) continue;
                var parsed = JSON.parse(raw);
                var u = parsed && parsed.user ? parsed.user : parsed;
                if (u && (u.id || u.username)) return u;
            } catch (e) {}
        }
        try {
            if (window.auth && typeof window.auth.getCurrentUser === 'function') {
                var au = window.auth.getCurrentUser();
                if (au && (au.id || au.username)) return au;
            }
        } catch (e) {}
        return null;
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

    // Authoritative eligibility check. Resolves { hasPicks, pickCount } or null
    // when the answer cannot be determined (never guess "eligible" on error —
    // an existing user must not be shown a new-user prompt because the API
    // hiccuped).
    function fetchActivationStatus(attempt) {
        attempt = attempt || 1;
        if (!window.api || typeof window.api.request !== 'function') return Promise.resolve(null);
        var ready = window.api.ready && typeof window.api.ready.then === 'function'
            ? window.api.ready.catch(function () {})
            : Promise.resolve();
        return ready.then(function () {
            return window.api.request('/picks/activation-status');
        }).then(function (data) {
            if (!data || typeof data.hasPicks !== 'boolean') return null;
            return data;
        }).catch(function (err) {
            var msg = (err && err.message) || '';
            log('activation-status failed (attempt ' + attempt + ')', msg);
            // Busy pages (profile especially) can trip the 120 req/min limit
            // before this call lands. One delayed retry, then give up quietly.
            if (attempt < 2 && /too many requests|429|rate/i.test(msg)) {
                return new Promise(function (resolve) {
                    setTimeout(function () { resolve(fetchActivationStatus(attempt + 1)); }, 4000);
                });
            }
            return null;
        });
    }

    // ----------------------------------------------------------------- CSS

    function injectStyles() {
        if (document.getElementById('tmr-fp-styles')) return;
        var css = [
            '.tmr-fp-panel{position:relative;margin:0 0 20px;padding:22px 24px;border-radius:16px;',
            'background:linear-gradient(135deg,rgba(0,255,255,0.10) 0%,rgba(10,17,24,0.96) 45%,rgba(10,17,24,0.96) 100%);',
            'border:1px solid rgba(0,255,255,0.34);box-shadow:0 18px 44px rgba(0,0,0,0.38);color:#e8eef6;}',
            '.tmr-fp-panel__kicker{display:inline-flex;align-items:center;gap:7px;padding:5px 11px;border-radius:999px;',
            'background:rgba(0,255,255,0.12);border:1px solid rgba(0,255,255,0.32);color:#67e8f9;',
            'font:800 10px/1 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;}',
            '.tmr-fp-panel h2{margin:12px 0 0;font-family:Barlow,Inter,sans-serif;font-weight:900;',
            'font-size:clamp(1.35rem,3vw,1.85rem);line-height:1.15;color:#f8fafc;letter-spacing:-0.01em;}',
            '.tmr-fp-panel p.tmr-fp-sub{margin:9px 0 0;max-width:640px;color:#a9b8cc;font-size:1rem;line-height:1.55;}',
            '.tmr-fp-actions{display:flex;flex-wrap:wrap;gap:11px;margin-top:18px;}',
            '.tmr-fp-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;padding:13px 22px;',
            'border-radius:11px;font:800 0.95rem/1 Barlow,Inter,sans-serif;letter-spacing:.02em;cursor:pointer;',
            'border:1px solid transparent;text-decoration:none;transition:transform .14s ease,box-shadow .14s ease;}',
            '.tmr-fp-btn:hover{transform:translateY(-2px);}',
            // ID-scoped + !important on purpose: the sportsbook ships
            // `body button:not(...):not(...) { background: ... !important }`,
            // which out-specifies any plain class rule and would repaint these
            // CTAs as flat navy. Only an id in the selector reliably wins.
            '#tmr-fp-panel .tmr-fp-btn--primary,#tmr-fp-modal .tmr-fp-btn--primary,',
            '#tmr-fp-reminder .tmr-fp-btn--primary{background:linear-gradient(135deg,#00ffff,#67e8f9) !important;',
            'color:#04111a !important;box-shadow:0 12px 30px rgba(0,255,255,0.24) !important;text-decoration:none !important;}',
            '#tmr-fp-panel .tmr-fp-btn--ghost,#tmr-fp-modal .tmr-fp-btn--ghost,',
            '#tmr-fp-reminder .tmr-fp-btn--ghost{background:rgba(255,255,255,0.05) !important;',
            'border-color:rgba(255,255,255,0.16) !important;color:#dbe6f3 !important;text-decoration:none !important;}',
            '.tmr-fp-steps{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px;padding-top:18px;',
            'border-top:1px solid rgba(255,255,255,0.08);}',
            '.tmr-fp-step{flex:1 1 190px;display:flex;align-items:flex-start;gap:10px;padding:11px 13px;border-radius:11px;',
            'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);}',
            '.tmr-fp-step__dot{flex:0 0 auto;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;',
            'justify-content:center;font:900 11px/1 Inter,sans-serif;background:rgba(255,255,255,0.08);color:#8ea0bc;',
            'border:1px solid rgba(255,255,255,0.12);}',
            '.tmr-fp-step__label{display:block;font:800 9.5px/1 Inter,sans-serif;letter-spacing:.13em;',
            'text-transform:uppercase;color:#7f8ea6;}',
            '.tmr-fp-step__name{display:block;margin-top:5px;font:700 13px/1.3 Inter,sans-serif;color:#cbd5e1;}',
            '.tmr-fp-step--done{border-color:rgba(74,222,128,0.34);background:rgba(74,222,128,0.07);}',
            '.tmr-fp-step--done .tmr-fp-step__dot{background:#22c55e;border-color:#22c55e;color:#04240f;}',
            '.tmr-fp-step--done .tmr-fp-step__label{color:#4ade80;}',
            '.tmr-fp-step--done .tmr-fp-step__name{color:#eafff1;}',
            '.tmr-fp-step--current{border-color:rgba(0,255,255,0.42);background:rgba(0,255,255,0.08);}',
            '.tmr-fp-step--current .tmr-fp-step__dot{background:linear-gradient(135deg,#00ffff,#67e8f9);',
            'border-color:transparent;color:#04111a;}',
            '.tmr-fp-step--current .tmr-fp-step__label{color:#67e8f9;}',
            '.tmr-fp-step--current .tmr-fp-step__name{color:#f8fafc;}',
            '@media(max-width:720px){',
            '.tmr-fp-panel{padding:18px 16px;border-radius:14px;}',
            '.tmr-fp-panel p.tmr-fp-sub{font-size:0.94rem;}',
            '.tmr-fp-actions{gap:9px;}.tmr-fp-btn{flex:1 1 100%;padding:14px 18px;}',
            '.tmr-fp-steps{gap:8px;}.tmr-fp-step{flex:1 1 100%;}',
            '}',
            /* highlight pulse on the pick-entry area */
            '.tmr-fp-highlight{position:relative;border-radius:14px;',
            'animation:tmrFpPulse 1.15s ease-in-out 3;outline:2px solid rgba(0,255,255,0.75);outline-offset:5px;}',
            '@keyframes tmrFpPulse{0%,100%{box-shadow:0 0 0 0 rgba(0,255,255,0.34);}',
            '50%{box-shadow:0 0 0 12px rgba(0,255,255,0);}}',
            '@media(prefers-reduced-motion:reduce){.tmr-fp-highlight{animation:none;}}',
            /* small reminder strip */
            '.tmr-fp-reminder{position:relative;display:flex;align-items:center;gap:12px;flex-wrap:wrap;',
            'max-width:1180px;margin:12px auto;padding:11px 44px 11px 15px;border-radius:12px;',
            'background:linear-gradient(90deg,rgba(0,110,124,0.30),rgba(10,17,24,0.97));',
            'border:1px solid rgba(0,255,255,0.26);color:#dbe6f3;font:600 0.92rem/1.4 Inter,sans-serif;}',
            '.tmr-fp-reminder__icon{flex:0 0 auto;width:30px;height:30px;border-radius:9px;display:flex;',
            'align-items:center;justify-content:center;background:rgba(0,255,255,0.14);color:#67e8f9;font-size:14px;}',
            '.tmr-fp-reminder__text{flex:1 1 200px;}',
            '.tmr-fp-reminder__text strong{color:#f8fafc;font-weight:800;}',
            '.tmr-fp-reminder .tmr-fp-btn{padding:9px 16px;font-size:0.85rem;}',
            '.tmr-fp-reminder__close{position:absolute;top:8px;right:10px;background:transparent;border:0;',
            'color:#7f8ea6;font-size:18px;line-height:1;cursor:pointer;padding:4px 6px;}',
            '#tmr-fp-reminder .tmr-fp-reminder__close{background:transparent !important;border:0 !important;',
            'box-shadow:none !important;color:#7f8ea6 !important;}',
            '.tmr-fp-reminder__close:hover{color:#e2e8f0 !important;}',
            '@media(max-width:640px){.tmr-fp-reminder{margin:10px 12px;}.tmr-fp-reminder .tmr-fp-btn{flex:1 1 100%;}}',
            /* confirmation modal */
            '.tmr-fp-modal{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;',
            'padding:20px;background:rgba(2,6,12,0.78);backdrop-filter:blur(4px);}',
            '.tmr-fp-modal__box{width:100%;max-width:470px;max-height:92vh;overflow-y:auto;padding:28px 26px;',
            'border-radius:18px;background:linear-gradient(160deg,rgba(16,26,36,0.99),rgba(8,12,18,0.99));',
            'border:1px solid rgba(74,222,128,0.34);box-shadow:0 30px 80px rgba(0,0,0,0.62);text-align:center;color:#e8eef6;}',
            '.tmr-fp-modal__seal{width:58px;height:58px;margin:0 auto 14px;border-radius:50%;display:flex;',
            'align-items:center;justify-content:center;background:rgba(74,222,128,0.14);',
            'border:1px solid rgba(74,222,128,0.42);color:#4ade80;font-size:26px;}',
            '.tmr-fp-modal__box h3{margin:0;font-family:Barlow,Inter,sans-serif;font-weight:900;font-size:1.5rem;color:#f8fafc;}',
            '.tmr-fp-modal__box p{margin:11px 0 0;color:#a9b8cc;font-size:0.97rem;line-height:1.55;}',
            '.tmr-fp-modal__actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px;}',
            '.tmr-fp-modal__actions .tmr-fp-btn{flex:1 1 170px;}',
            '@media(max-width:520px){.tmr-fp-modal__box{padding:24px 18px;}',
            '.tmr-fp-modal__actions .tmr-fp-btn{flex:1 1 100%;}}'
        ].join('');
        var style = document.createElement('style');
        style.id = 'tmr-fp-styles';
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    // -------------------------------------------------------- sportsbook UI

    function stepMarkup(label, name, status) {
        var mod = status === 'done' ? ' tmr-fp-step--done' : (status === 'current' ? ' tmr-fp-step--current' : '');
        var dot = status === 'done' ? '&#10003;' : (status === 'current' ? '2' : '3');
        return '<div class="tmr-fp-step' + mod + '">' +
               '<span class="tmr-fp-step__dot">' + dot + '</span>' +
               '<span><span class="tmr-fp-step__label">' + label + '</span>' +
               '<span class="tmr-fp-step__name">' + name + '</span></span></div>';
    }

    function findPanelMount() {
        return document.querySelector('.picks-container-modern') ||
               document.getElementById('picks') ||
               document.querySelector('main');
    }

    function renderPanel() {
        if (document.getElementById('tmr-fp-panel')) return;
        var mount = findPanelMount();
        if (!mount) return;

        var panel = document.createElement('section');
        panel.id = 'tmr-fp-panel';
        panel.className = 'tmr-fp-panel';
        panel.setAttribute('aria-label', 'Welcome to TrustMyRecord — submit your first pick');
        panel.innerHTML =
            '<span class="tmr-fp-panel__kicker">New here</span>' +
            '<h2>Welcome to TrustMyRecord</h2>' +
            '<p class="tmr-fp-sub">Your record starts with your first locked pick. Choose a game below to get started.</p>' +
            '<div class="tmr-fp-actions">' +
                '<button type="button" class="tmr-fp-btn tmr-fp-btn--primary" id="tmr-fp-cta-primary">Submit My First Pick</button>' +
                '<button type="button" class="tmr-fp-btn tmr-fp-btn--ghost" id="tmr-fp-cta-secondary">Explore Sportsbook</button>' +
            '</div>' +
            '<div class="tmr-fp-steps" role="list" aria-label="First pick progress">' +
                stepMarkup('Step 1', 'Create account', 'done') +
                stepMarkup('Step 2', 'Submit first pick', 'current') +
                stepMarkup('Step 3', 'Build your verified record', 'upcoming') +
            '</div>';

        // Sit above the logged-out prompt / page header, at the very top of the board.
        mount.insertBefore(panel, mount.firstChild);

        document.getElementById('tmr-fp-cta-primary').addEventListener('click', function () {
            track('first_pick_cta_clicked', { cta_location: 'sportsbook_onboarding_panel', cta: 'submit_my_first_pick' });
            goToGames();
        });
        document.getElementById('tmr-fp-cta-secondary').addEventListener('click', function () {
            track('first_pick_cta_clicked', { cta_location: 'sportsbook_onboarding_panel', cta: 'explore_sportsbook' });
            collapsePanelToReminder();
        });

        if (!state.viewed) {
            state.viewed = true;
            setSessionFlag('viewed', true);
            track('sportsbook_onboarding_viewed', { surface: 'sportsbook_panel', has_picks: 'no' });
        }
    }

    function removePanel() {
        var p = document.getElementById('tmr-fp-panel');
        if (p && p.parentNode) p.parentNode.removeChild(p);
    }

    // The pick-entry area: the live odds board in the lobby, falling back to
    // the step-flow games list if the lobby board is not mounted.
    function findGamesArea() {
        var candidates = [
            document.querySelector('.sportsbook-board-shell'),
            document.getElementById('lobbyBoardRows'),
            document.getElementById('gamesListSection'),
            document.getElementById('gamesListContainer'),
            document.getElementById('sportSelection')
        ];
        for (var i = 0; i < candidates.length; i++) {
            var el = candidates[i];
            if (el && el.offsetParent !== null) return el;
        }
        return candidates.find(function (el) { return !!el; }) || null;
    }

    function boardHasGames() {
        var body = document.getElementById('lobbyBoardRows');
        if (body && body.querySelector('.sportsbook-game-card')) return true;
        var list = document.getElementById('gamesListContainer');
        return !!(list && list.querySelector('.games-board-wrap, .sportsbook-game-card'));
    }

    // The lobby defaults to NBA, which is empty for most of the year. Telling a
    // brand-new user to "choose a game below" and then showing them an empty
    // board is the whole failure this flow exists to fix, so probe the boards
    // and switch to one that actually has games today.
    function ensureBoardWithGames() {
        if (boardHasGames()) return Promise.resolve(false);
        if (!window.api || !window.api.baseUrl) return Promise.resolve(false);

        var order = ['MLB', 'WNBA', 'NBASummer', 'NFL', 'NCAAF', 'NHL', 'NCAAB', 'NBA', 'Soccer'];
        var keyMap = (window.TMR && window.TMR.sportKeyMap) || {};
        var probes = order
            .filter(function (s) { return !!keyMap[s]; })
            .map(function (sport) {
                return fetch(window.api.baseUrl + '/games/board/' + encodeURIComponent(keyMap[sport]) + '?limit=5')
                    .then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (j) {
                        return { sport: sport, count: (j && Array.isArray(j.games)) ? j.games.length : 0 };
                    })
                    .catch(function () { return { sport: sport, count: 0 }; });
            });

        return Promise.all(probes).then(function (results) {
            var bySport = {};
            results.forEach(function (r) { bySport[r.sport] = r.count; });
            var chosen = null;
            for (var i = 0; i < order.length; i++) {
                if (bySport[order[i]] > 0) { chosen = order[i]; break; }
            }
            if (!chosen) return false;
            var btn = document.querySelector('.sportsbook-rail-board[data-sport="' + chosen + '"]');
            if (btn) { btn.click(); }
            else if (typeof window.__tmrSelectSportBoard === 'function') { window.__tmrSelectSportBoard(chosen); }
            else if (typeof window.TMR.setSport === 'function') { window.TMR.setSport(chosen); }
            else { return false; }
            log('switched board to ' + chosen + ' (' + bySport[chosen] + ' games)');
            // Give the board a moment to paint before we scroll to it.
            return new Promise(function (resolve) { setTimeout(function () { resolve(true); }, 900); });
        }).catch(function () { return false; });
    }

    function scrollAndHighlight() {
        var target = findGamesArea();
        if (!target) return;
        var highlightEl = target.closest ? (target.closest('.sportsbook-board-shell') || target) : target;
        try {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) {
            target.scrollIntoView();
        }
        highlightEl.classList.add('tmr-fp-highlight');
        setTimeout(function () { highlightEl.classList.remove('tmr-fp-highlight'); }, 4200);
    }

    function goToGames() {
        scrollAndHighlight();
        ensureBoardWithGames().then(function (switched) {
            if (switched) scrollAndHighlight();
        });
    }

    function collapsePanelToReminder() {
        setSessionFlag('collapsed', true);
        removePanel();
        renderReminder({ inline: true });
    }

    // ---------------------------------------------------------- reminder UI

    // Where the small reminder strip goes. On pages without a <main> (the
    // legacy homepage) it must land AFTER the sitewide nav, not above it.
    function reminderPlacement() {
        if (isSportsbook()) {
            var sb = findPanelMount();
            if (sb) return { parent: sb, before: sb.firstChild };
        }
        var main = document.querySelector('main');
        if (main) return { parent: main, before: main.firstChild };
        var nav = document.querySelector('nav.tmr-global-nav') || document.querySelector('body > nav, body > header');
        if (nav && nav.parentNode) return { parent: nav.parentNode, before: nav.nextSibling };
        return { parent: document.body, before: document.body.firstChild };
    }

    function renderReminder() {
        if (document.getElementById('tmr-fp-reminder')) return;
        var placement = reminderPlacement();
        if (!placement || !placement.parent) return;

        var bar = document.createElement('div');
        bar.id = 'tmr-fp-reminder';
        bar.className = 'tmr-fp-reminder';
        bar.setAttribute('role', 'status');
        bar.innerHTML =
            '<span class="tmr-fp-reminder__icon" aria-hidden="true">&#9673;</span>' +
            '<span class="tmr-fp-reminder__text"><strong>Your record is waiting.</strong> Submit your first pick.</span>' +
            (isSportsbook()
                ? '<button type="button" class="tmr-fp-btn tmr-fp-btn--primary" id="tmr-fp-reminder-cta">Choose a Game</button>'
                : '<a class="tmr-fp-btn tmr-fp-btn--primary" id="tmr-fp-reminder-cta" href="/sportsbook/?first_pick=1">Go to Sportsbook</a>') +
            '<button type="button" class="tmr-fp-reminder__close" aria-label="Dismiss reminder">&times;</button>';

        placement.parent.insertBefore(bar, placement.before || null);

        var cta = document.getElementById('tmr-fp-reminder-cta');
        cta.addEventListener('click', function () {
            track('first_pick_cta_clicked', { cta_location: 'reminder_strip', cta: 'go_to_sportsbook' });
            if (isSportsbook()) goToGames();
        });
        bar.querySelector('.tmr-fp-reminder__close').addEventListener('click', function () {
            setSessionFlag('reminderClosed', true);
            if (bar.parentNode) bar.parentNode.removeChild(bar);
        });

        if (!state.viewed) {
            state.viewed = true;
            setSessionFlag('viewed', true);
            track('sportsbook_onboarding_viewed', {
                surface: isSportsbook() ? 'sportsbook_reminder' : 'sitewide_reminder',
                has_picks: 'no'
            });
        }
    }

    function removeReminder() {
        var b = document.getElementById('tmr-fp-reminder');
        if (b && b.parentNode) b.parentNode.removeChild(b);
    }

    // ------------------------------------------------------ confirmation UI

    function showFirstPickModal() {
        if (document.getElementById('tmr-fp-modal')) return;
        injectStyles();

        var overlay = document.createElement('div');
        overlay.id = 'tmr-fp-modal';
        overlay.className = 'tmr-fp-modal';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'tmr-fp-modal-title');
        overlay.innerHTML =
            '<div class="tmr-fp-modal__box">' +
                '<div class="tmr-fp-modal__seal" aria-hidden="true">&#10003;</div>' +
                '<h3 id="tmr-fp-modal-title">Your first pick is locked.</h3>' +
                '<p>This pick is now part of your permanent verified record and cannot be edited after game time.</p>' +
                '<div class="tmr-fp-modal__actions">' +
                    '<a class="tmr-fp-btn tmr-fp-btn--primary" id="tmr-fp-modal-record" href="/my-record/">View My Record</a>' +
                    '<button type="button" class="tmr-fp-btn tmr-fp-btn--ghost" id="tmr-fp-modal-another">Submit Another Pick</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        function close() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            document.removeEventListener('keydown', onKey);
        }
        function onKey(e) { if (e.key === 'Escape') close(); }
        document.addEventListener('keydown', onKey);

        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        document.getElementById('tmr-fp-modal-another').addEventListener('click', function () {
            close();
            if (typeof window.showPickStep === 'function') {
                try { window.showPickStep('sportSelection'); } catch (e) {}
            }
            goToGames();
        });
        try { document.getElementById('tmr-fp-modal-record').focus(); } catch (e) {}
    }
    window.tmrShowFirstPickModal = showFirstPickModal;

    // ------------------------------------------------------------- funnel

    function markStarted(meta) {
        if (state.started || !state.eligible || state.submitted) return;
        state.started = true;
        setSessionFlag('started', true);
        track('first_pick_started', meta || {});
    }

    function markSubmitted(meta) {
        if (state.submitted) return;
        state.submitted = true;
        state.eligible = false;

        // analytics.js has its own first-pick detector on the POST /picks
        // response. It flips tmr_has_posted_pick to '1' right after it emits,
        // so if the flag is already set by the time the board reaches its
        // confirmation step, the event has been sent and we must not repeat it.
        var alreadySent = false;
        try { alreadySent = localStorage.getItem(LS_ACTIVATED) === '1'; } catch (e) {}
        if (window.__tmrFirstPickSubmittedSent) alreadySent = true;

        try { localStorage.setItem(LS_ACTIVATED, '1'); } catch (e) {}
        setSessionFlag('submitted', true);
        if (!alreadySent) {
            window.__tmrFirstPickSubmittedSent = true;
            track('first_pick_submitted', meta || {});
        }
        removePanel();
        removeReminder();
        showFirstPickModal();
    }

    // Abandonment = they were on the sportsbook, saw the prompt, and left
    // without locking anything. Fired at most once per session, otherwise
    // every page-to-page navigation would report another abandonment.
    function markAbandoned() {
        if (state.abandonSent || state.submitted || !state.eligible || !state.viewed) return;
        if (!isSportsbook()) return;
        if (sessionFlags().abandonSent) { state.abandonSent = true; return; }
        state.abandonSent = true;
        setSessionFlag('abandonSent', true);
        track('first_pick_abandoned', {
            reached_pick_entry: state.started ? 'yes' : 'no',
            surface: 'sportsbook'
        });
    }

    // Wrap the sportsbook's own entry points instead of duplicating their
    // logic, so the funnel can never disagree with what actually happened.
    function instrumentSportsbook() {
        // "started" = user put a selection in the slip.
        var wrapSelect = function () {
            if (typeof window.selectGameBet !== 'function' || window.selectGameBet.__tmrFpWrapped) return false;
            var original = window.selectGameBet;
            var wrapped = function () {
                var out = original.apply(this, arguments);
                try {
                    var p = window.TMR && window.TMR.currentSelectedPick;
                    markStarted({
                        sport: (p && p.sport) || (window.TMR && window.TMR.selectedSport) || 'unknown',
                        market_type: (p && (p.marketType || p.betType)) || 'unknown'
                    });
                } catch (e) {}
                return out;
            };
            wrapped.__tmrFpWrapped = true;
            window.selectGameBet = wrapped;
            return true;
        };

        // "submitted" = the board reached its own success confirmation step.
        var wrapConfirm = function () {
            if (typeof window.showPickStep !== 'function' || window.showPickStep.__tmrFpWrapped) return false;
            var original = window.showPickStep;
            var wrapped = function (stepId) {
                var out = original.apply(this, arguments);
                if (stepId === 'pickConfirmation' && state.eligible) {
                    try {
                        var p = window.TMR && window.TMR.currentSelectedPick;
                        markSubmitted({
                            sport: (p && p.sport) || (window.TMR && window.TMR.selectedSport) || 'unknown',
                            pick_type: (p && (p.marketType || p.betType)) || 'unknown'
                        });
                    } catch (e) { markSubmitted({}); }
                }
                return out;
            };
            wrapped.__tmrFpWrapped = true;
            window.showPickStep = wrapped;
            return true;
        };

        wrapSelect();
        wrapConfirm();
        // Late-loading sportsbook scripts reassign these globals; keep re-wrapping
        // for a short window after load so we end up on top of the final version.
        var tries = 0;
        var iv = setInterval(function () {
            wrapSelect();
            wrapConfirm();
            if (++tries > 40) clearInterval(iv);
        }, 500);

        // Backstop: the board also emits tmr:pickLocked on a successful lock.
        window.addEventListener('tmr:pickLocked', function () {
            if (state.eligible) markSubmitted({ sport: (window.TMR && window.TMR.selectedSport) || 'unknown' });
        });

        // Safety net for selection paths that do not route through selectGameBet.
        var startWatch = setInterval(function () {
            if (state.started || state.submitted || !state.eligible) { clearInterval(startWatch); return; }
            try {
                if (window.TMR && window.TMR.currentSelectedPick) {
                    markStarted({ sport: window.TMR.selectedSport || 'unknown', market_type: 'unknown' });
                    clearInterval(startWatch);
                }
            } catch (e) {}
        }, 700);
    }

    // ---------------------------------------------------------------- boot

    function renderForEligibleUser() {
        injectStyles();
        var flags = sessionFlags();
        if (isSportsbook() && !flags.collapsed) {
            renderPanel();
        } else if (!flags.reminderClosed) {
            renderReminder();
        }
    }

    function start() {
        state.onSportsbook = isSportsbook();

        if (!hasToken()) {
            log('no authenticated session — onboarding skipped');
            return;
        }
        var user = getStoredUser();
        state.userId = user ? (user.id || user.username) : null;

        fetchActivationStatus().then(function (status) {
            if (!status) return;               // unknown / 401 -> show nothing
            state.userId = status.userId || state.userId;
            if (status.hasPicks) {             // existing / activated user -> never show
                try { localStorage.setItem(LS_ACTIVATED, '1'); } catch (e) {}
                removePanel();
                removeReminder();
                log('user already has ' + status.pickCount + ' pick(s) — onboarding suppressed');
                return;
            }
            try { localStorage.removeItem(LS_ACTIVATED); } catch (e) {}
            state.eligible = true;
            var flags = sessionFlags();
            state.viewed = !!flags.viewed;
            state.started = !!flags.started;

            renderForEligibleUser();
            if (state.onSportsbook) instrumentSportsbook();

            window.addEventListener('pagehide', markAbandoned);
            document.addEventListener('visibilitychange', function () {
                if (document.visibilityState === 'hidden') markAbandoned();
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
