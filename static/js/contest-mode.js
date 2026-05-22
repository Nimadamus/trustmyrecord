/**
 * Contest Mode adapter for the Make Picks sportsbook page.
 *
 * Activation: append `?contest=<contestId>` (currently only `justbet-mlb`)
 * to /sportsbook/. The adapter:
 *   - Adds `body.tmr-contest-mode` so existing CSS can theme.
 *   - Mounts a sticky banner explaining the mode and offering an Exit.
 *   - Intercepts `fetch()` POSTs to `/api/picks` and re-targets them to
 *     `/api/contests/<contestId>/picks` with the equivalent payload.
 *   - Pre-flights the user's registration via `/api/contests/<id>/my-registration`.
 *     If status is none/rejected, redirects to the register page first.
 *   - Pre-flights pick count via `/api/contests/<id>/my-status` and shows
 *     "X / 50 contest picks used".
 *
 * Without `?contest=...` the script is a no-op. Regular pick submission is
 * untouched. There is no second sportsbook page.
 */

(function () {
    'use strict';

    var qs = new URLSearchParams(window.location.search);
    var contestId = (qs.get('contest') || '').trim();
    if (!contestId) return;

    var SUPPORTED_CONTESTS = { 'justbet-mlb': { name: 'JustBet MLB', sport: 'MLB' } };
    if (!SUPPORTED_CONTESTS[contestId]) return;

    var meta = SUPPORTED_CONTESTS[contestId];
    var apiBase = (window.TMR_API_BASE || window.API_BASE_URL || 'https://trustmyrecord-api.onrender.com').replace(/\/$/, '');

    function getAuthToken() {
        var keys = ['tmr_auth_token', 'trustmyrecord_token', 'accessToken', 'access_token', 'token', 'tmr_token'];
        for (var i = 0; i < keys.length; i++) {
            try { var v = localStorage.getItem(keys[i]); if (v) return v; } catch (_) {}
        }
        return null;
    }
    function isSignedIn() {
        try {
            if (window.TMR_AUTH && window.TMR_AUTH.user) return true;
            if (localStorage.getItem('trustmyrecord_session')) return true;
        } catch (_) {}
        return !!getAuthToken();
    }
    function authHeaders(extra) {
        var h = Object.assign({}, extra || {});
        var t = getAuthToken();
        if (t) h['Authorization'] = 'Bearer ' + t;
        return h;
    }

    window.TMR_CONTEST_MODE = {
        active: true,
        contestId: contestId,
        contestName: meta.name,
        sport: meta.sport,
        picksUsed: null,
        picksMax: 50,
        registrationStatus: 'unknown',
    };

    // ---------- inject styles ----------
    var css = document.createElement('style');
    css.setAttribute('data-tmr-contest-mode-css', '');
    css.textContent = [
        'body.tmr-contest-mode { box-shadow: inset 0 0 0 3px rgba(255,184,0,0.55); }',
        '#tmr-contest-mode-banner {',
        '  position: sticky; top: 0; z-index: 9000;',
        '  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;',
        '  padding: 14px 22px;',
        '  background: linear-gradient(90deg, rgba(60,42,8,0.97) 0%, rgba(28,22,8,0.95) 100%);',
        '  border-bottom: 2px solid rgba(255,184,0,0.55);',
        '  color: #ffe4a3;',
        '  font-family: "Inter", system-ui, sans-serif;',
        '  box-shadow: 0 8px 24px rgba(0,0,0,0.35);',
        '}',
        '#tmr-contest-mode-banner .tmr-cm-icon { display:inline-flex; align-items:center; justify-content:center; width:40px; height:40px; border-radius:10px; background:linear-gradient(180deg,#f0c449,#d4a72c); color:#1a1206; font-size:1.2rem; flex-shrink:0; font-weight:900; }',
        '#tmr-contest-mode-banner .tmr-cm-text { flex:1; min-width:240px; line-height:1.45; }',
        '#tmr-contest-mode-banner .tmr-cm-title { font-family:"Barlow","Inter",sans-serif; font-weight:900; font-size:1rem; letter-spacing:0.05em; text-transform:uppercase; color:#ffe4a3; }',
        '#tmr-contest-mode-banner .tmr-cm-body { margin-top:3px; font-size:0.9rem; color:#f5e8c9; }',
        '#tmr-contest-mode-banner .tmr-cm-body strong { color:#fff; }',
        '#tmr-contest-mode-banner .tmr-cm-pillrow { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }',
        '#tmr-contest-mode-banner .tmr-cm-pill { display:inline-flex; align-items:center; gap:6px; padding:5px 11px; border-radius:999px; background:rgba(15,23,42,0.55); border:1px solid rgba(255,184,0,0.4); color:#ffe4a3; font-size:0.78rem; font-weight:800; letter-spacing:0.04em; }',
        '#tmr-contest-mode-banner .tmr-cm-exit { display:inline-flex; align-items:center; gap:8px; padding:10px 16px; border-radius:10px; background:rgba(15,23,42,0.85); color:#ffe4a3; border:1px solid rgba(255,184,0,0.45); font-weight:800; font-size:0.85rem; letter-spacing:0.03em; cursor:pointer; text-decoration:none; }',
        '#tmr-contest-mode-banner .tmr-cm-exit:hover { background:rgba(15,23,42,1); border-color:#f0c449; }',
        '#tmr-contest-mode-banner .tmr-cm-dash { display:inline-flex; align-items:center; gap:8px; padding:10px 16px; border-radius:10px; background:linear-gradient(180deg,#f0c449,#d4a72c); color:#1a1206; font-weight:900; font-size:0.85rem; letter-spacing:0.03em; cursor:pointer; text-decoration:none; border:1px solid #b4881d; }',
    ].join('\n');
    document.head.appendChild(css);

    // ---------- inject banner ----------
    function buildBanner() {
        document.body.classList.add('tmr-contest-mode');
        var existing = document.getElementById('tmr-contest-mode-banner');
        if (existing) existing.remove();
        var banner = document.createElement('aside');
        banner.id = 'tmr-contest-mode-banner';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.innerHTML =
            '<div class="tmr-cm-icon"><i class="fas fa-trophy" aria-hidden="true"></i></div>' +
            '<div class="tmr-cm-text">' +
                '<div class="tmr-cm-title">Contest Mode: ' + escapeHtml(meta.name) + '</div>' +
                '<div class="tmr-cm-body">Picks submitted here count <strong>only for the JustBet MLB contest leaderboard</strong> and <strong>will not affect your public profile record</strong>, ROI, units, or regular pick history.</div>' +
                '<div class="tmr-cm-pillrow" style="margin-top:8px;">' +
                    '<span class="tmr-cm-pill" id="tmr-cm-pill-status"><i class="fas fa-shield-halved" aria-hidden="true"></i> Registration: loading…</span>' +
                    '<span class="tmr-cm-pill" id="tmr-cm-pill-picks"><i class="fas fa-vault" aria-hidden="true"></i> Picks used: loading…</span>' +
                '</div>' +
            '</div>' +
            '<a class="tmr-cm-dash" href="/contests/' + encodeURIComponent(contestId) + '/dashboard/"><i class="fas fa-chart-line" aria-hidden="true"></i> Contest Dashboard</a>' +
            '<a class="tmr-cm-exit" href="' + buildExitHref() + '" id="tmr-cm-exit-btn" data-tmr-cm-exit><i class="fas fa-arrow-left" aria-hidden="true"></i> Exit Contest Mode</a>';
        // Insert at the very top of body.
        document.body.insertBefore(banner, document.body.firstChild);
    }
    function buildExitHref() {
        var url = new URL(window.location.href);
        url.searchParams.delete('contest');
        return url.pathname + (url.search || '') + (url.hash || '');
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    // ---------- preflight registration ----------
    function preflightRegistration() {
        var statusPill = document.getElementById('tmr-cm-pill-status');
        if (!isSignedIn()) {
            if (statusPill) statusPill.innerHTML = '<i class="fas fa-right-to-bracket"></i> Sign in to enter contest picks';
            return Promise.resolve({ status: 'anonymous' });
        }
        return fetch(apiBase + '/api/contests/' + encodeURIComponent(contestId) + '/my-registration', {
            headers: authHeaders(),
            credentials: 'include',
        }).then(function (r) { return r.ok ? r.json() : { registration: null }; })
          .then(function (data) {
            var reg = data && data.registration;
            var status = reg && reg.status ? String(reg.status) : 'none';
            window.TMR_CONTEST_MODE.registrationStatus = status;
            if (status === 'none' || status === 'rejected') {
                if (statusPill) statusPill.innerHTML = '<i class="fas fa-circle-exclamation"></i> Registration required';
                var returnTo = window.location.pathname + window.location.search;
                var registerUrl = '/contests/' + encodeURIComponent(contestId) + '/register/?return=' + encodeURIComponent(returnTo);
                // Soft redirect after a beat so the banner is visible.
                setTimeout(function () {
                    if (window.location.pathname + window.location.search === returnTo) {
                        window.location.replace(registerUrl);
                    }
                }, 1200);
                return { status: status };
            }
            var label = status === 'verified_eligible' ? 'Verified' : (status === 'pending_verification' ? 'Registered (pending)' : status);
            if (statusPill) statusPill.innerHTML = '<i class="fas fa-shield-halved"></i> Registration: ' + escapeHtml(label);
            return { status: status };
        }).catch(function () {
            if (statusPill) statusPill.textContent = 'Registration: unknown';
            return { status: 'unknown' };
        });
    }
    function preflightPickCount() {
        var picksPill = document.getElementById('tmr-cm-pill-picks');
        if (!isSignedIn()) {
            if (picksPill) picksPill.innerHTML = '<i class="fas fa-vault"></i> Picks used: —';
            return Promise.resolve(null);
        }
        return fetch(apiBase + '/api/contests/' + encodeURIComponent(contestId) + '/my-status', {
            headers: authHeaders(),
            credentials: 'include',
        }).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (!d) return null;
            window.TMR_CONTEST_MODE.picksUsed = d.picks_used;
            window.TMR_CONTEST_MODE.picksMax = d.picks_max;
            if (picksPill) picksPill.innerHTML = '<i class="fas fa-vault"></i> ' + d.picks_used + ' / ' + d.picks_max + ' contest picks used';
            return d;
        }).catch(function () { return null; });
    }

    // ---------- fetch interceptor: redirect /api/picks → /api/contests/:id/picks ----------
    var origFetch = window.fetch.bind(window);
    var PICKS_RE = /\/api\/picks(?:\/?$|\?)/;
    window.fetch = function (input, init) {
        try {
            var method = (init && init.method ? String(init.method) : (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            if (method === 'POST' && PICKS_RE.test(url)) {
                return rerouteRegularPostToContest(input, init);
            }
        } catch (_) { /* fall through to normal fetch */ }
        return origFetch(input, init);
    };

    function rerouteRegularPostToContest(input, init) {
        var bodyPromise = readBody(init);
        return bodyPromise.then(function (orig) {
            var payload = orig && typeof orig === 'object' ? orig : {};
            var transformed = {
                contest_id: contestId,
                game_id: payload.game_id || payload.gameId,
                market_type: payload.market_type || payload.marketType,
                selection: payload.selection,
                odds: numericOrSelf(payload.odds != null ? payload.odds : payload.odds_snapshot),
                units: numericOrSelf(payload.units),
                stake_mode: payload.stake_mode || payload.stakeMode || 'risk',
                attest_justbet_signup: true,
            };
            if (payload.line != null && payload.line !== '') {
                var n = Number(payload.line);
                if (Number.isFinite(n)) transformed.line = n;
            }
            var targetUrl = apiBase + '/api/contests/' + encodeURIComponent(contestId) + '/picks';
            var newInit = Object.assign({}, init || {});
            newInit.method = 'POST';
            newInit.headers = Object.assign({}, (init && init.headers) || {}, authHeaders({ 'Content-Type': 'application/json' }));
            newInit.credentials = 'include';
            newInit.body = JSON.stringify(transformed);
            return origFetch(targetUrl, newInit).then(function (resp) {
                // Bump the picks-used counter on success.
                if (resp && resp.ok) {
                    preflightPickCount();
                    showInlineSuccess();
                }
                return resp;
            });
        });
    }

    function readBody(init) {
        try {
            if (!init || init.body == null) return Promise.resolve({});
            if (typeof init.body === 'string') return Promise.resolve(JSON.parse(init.body));
            if (init.body instanceof FormData) {
                var obj = {};
                init.body.forEach(function (v, k) { obj[k] = v; });
                return Promise.resolve(obj);
            }
            return Promise.resolve(init.body);
        } catch (_) { return Promise.resolve({}); }
    }
    function numericOrSelf(v) {
        var n = Number(v);
        return Number.isFinite(n) ? n : v;
    }

    function showInlineSuccess() {
        var banner = document.getElementById('tmr-contest-mode-banner');
        if (!banner) return;
        var existing = document.getElementById('tmr-cm-flash');
        if (existing) existing.remove();
        var flash = document.createElement('span');
        flash.id = 'tmr-cm-flash';
        flash.style.cssText = 'display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border-radius:999px; background:rgba(34,197,94,0.18); border:1px solid rgba(34,197,94,0.45); color:#b6f5cd; font-size:0.78rem; font-weight:800; letter-spacing:0.04em; margin-left:6px;';
        flash.innerHTML = '<i class="fas fa-check"></i> Contest pick logged';
        banner.appendChild(flash);
        setTimeout(function () { flash.remove(); }, 4500);
    }

    function init() {
        buildBanner();
        preflightRegistration();
        preflightPickCount();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
