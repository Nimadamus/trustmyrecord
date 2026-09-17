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
        // CONTEST_MARKETS_ONLY_UI_20260917 (Nima: only moneylines, run lines and totals, no alternates, no props).
        // In Contest Mode the board shows Game Lines and Team Totals only. Alt lines, first 5, halves,
        // specials and props are hidden, and the server refuses them anyway.
        'body.tmr-contest-mode .tmr-group:not([data-category="game-lines"]):not([data-category="team-totals"]):not([data-category="first-5"]) { display: none !important; }',
        'body.tmr-contest-mode .tmr-filter-pill[data-filter]:not([data-filter="game-lines"]):not([data-filter="team-totals"]):not([data-filter="first-5"]):not([data-filter="all"]), body.tmr-contest-mode .tmr-card-filter-tab[data-filter]:not([data-filter="game-lines"]):not([data-filter="team-totals"]):not([data-filter="first-5"]):not([data-filter="all"]), body.tmr-contest-mode .tmr-family-tab[data-filter]:not([data-filter="game-lines"]):not([data-filter="team-totals"]):not([data-filter="first-5"]):not([data-filter="all"]) { display: none !important; }',
        'body.tmr-contest-mode .sbn-drow--prop, body.tmr-contest-mode .sbn-dprops, body.tmr-contest-mode .prop-notice { display: none !important; }',
        '#tmr-contest-mode-banner .tmr-cm-rules { margin: 8px 0 0; padding-left: 18px; font-size: 0.86rem; color: #f5e8c9; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 22px; row-gap: 2px; }',
        '#tmr-contest-mode-banner .tmr-cm-rules strong { color: #fff; }',
        '@media (max-width: 720px) { #tmr-contest-mode-banner .tmr-cm-rules { grid-template-columns: 1fr; } }',
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
                '<div class="tmr-cm-body" style="margin-top:6px; opacity:.92;">Every contest pick stays sealed from everyone until that game’s first pitch, then reveals in full. Contest scoring pays your units to win at a minus price and risks your units at a plus price. Pushes and postponed games score 0.</div>' +
                '<ol class="tmr-cm-rules">' +
                    '<li><strong>Contest rules.</strong> Contest runs Sept 17 through <strong>Sept 30</strong> (last picks before 12:00 AM PT Oct 1).</li>' +
                    '<li><strong>50 picks</strong> per entrant. MLB only.</li>' +
                    '<li><strong>Moneylines, run lines, totals, team totals, First 5 lines and First 5 totals.</strong> Posted lines only: <strong>no alt lines, no alt totals, no props</strong>.</li>' +
                    '<li><strong>No correlated picks:</strong> one side and one total per game (one of moneyline / run line / F5 line, and one of game total / team total / F5 total). Every pick is final: no edits, no deletes.</li>' +
                    '<li><strong>Half a unit minimum.</strong> Win up to 5 units on a favorite, risk up to 5 units on an underdog.</li>' +
                    '<li>Picks must be in before first pitch and stay sealed until the game starts.</li>' +
                    '<li><strong>Most units won wins.</strong> Ties: win %, then earliest first pick.</li>' +
                    '<li>Pushes, postponed and cancelled games score 0. Prizes $1,500 / $750 / $250.</li>' +
                '</ol>' +
                '<div class="tmr-cm-pillrow" style="margin-top:8px;">' +
                    '<span class="tmr-cm-pill" id="tmr-cm-pill-status"><i class="fas fa-shield-halved" aria-hidden="true"></i> Registration: loading…</span>' +
                    '<span class="tmr-cm-pill" id="tmr-cm-pill-picks"><i class="fas fa-vault" aria-hidden="true"></i> Picks used: loading…</span>' +
                '</div>' +
            '</div>' +
            '<a class="tmr-cm-dash" href="/contests/' + encodeURIComponent(contestId) + '/leaderboard/"><i class="fas fa-trophy" aria-hidden="true"></i> Leaderboard</a>' +
            '<a class="tmr-cm-exit" href="/contests/' + encodeURIComponent(contestId) + '/dashboard/"><i class="fas fa-chart-line" aria-hidden="true"></i> Contest Board</a>' +
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

    // Markets this contest accepts. Kept in step with SUPPORTED_MARKETS in
    // routes/contests.js: a market is only offered if the contest grader can
    // actually settle it from the final team score. The f5_* family was offered
    // for months and could never grade.
    var CONTEST_MARKETS = ['h2h', 'spreads', 'totals', 'team_totals', 'f5_h2h', 'f5_spreads', 'f5_totals'];
    var LINE_MARKETS = ['spreads', 'totals', 'team_totals', 'f5_spreads', 'f5_totals'];

    // Shape a local refusal like a fetch Response so the sportsbook's existing
    // .then(result)/.catch(err) handling shows the message unchanged.
    function contestError(message) {
        return new Response(JSON.stringify({ error: message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
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
            var oddsVal = numericOrSelf(payload.odds != null ? payload.odds : payload.odds_snapshot);
            var marketType = payload.market_type || payload.marketType;
            var transformed = {
                contest_id: contestId,
                game_id: payload.game_id || payload.gameId,
                market_type: marketType,
                selection: payload.selection,
                odds: oddsVal,
                units: numericOrSelf(payload.units),
                // CONTEST_STAKE_CONVENTION_20260829.
                //
                // The regular /api/picks route converts the user's chosen stake
                // mode (RISK or TO-WIN) before storing, and grades from that. The
                // contest grader does NOT read stake_mode at all: it always pays
                // TO-WIN on a minus price and RISKING on a plus price, which is
                // the published TrustMyRecord unit convention. This reroute used
                // to drop units_mode entirely and hardcode stake_mode:'risk', so
                // every contest row recorded a convention the grader never used
                // and the sportsbook showed the entrant a different number than
                // the contest would pay (a RISK 3u winner at -110 previewed
                // +2.73u and scored +3.00u).
                //
                // The stored value now describes what the contest actually does,
                // so the column stops lying and a later reader cannot mis-derive
                // the P/L from it.
                stake_mode: (Number(oddsVal) < 0) ? 'to_win' : 'risk',
                attest_justbet_signup: true,
            };
            if (payload.line != null && payload.line !== '') {
                var n = Number(payload.line);
                if (Number.isFinite(n)) transformed.line = n;
            }
            // Fall back to the sportsbook's own snapshot field name so a line
            // never arrives as null on a market that cannot grade without one.
            if (transformed.line == null && payload.line_snapshot != null && payload.line_snapshot !== '') {
                var n2 = Number(payload.line_snapshot);
                if (Number.isFinite(n2)) transformed.line = n2;
            }


            // CONTEST_UNITS_RULE_20260916 (Nima): minimum half a unit; risk up to 5 on a dog,
            // win up to 5 on a favorite. The contest stores units as TO WIN on a minus price
            // and RISK on a plus price, so a stake entered the other way is converted first.
            (function () {
                var O = Number(oddsVal);
                var U = Number(payload.units);
                var mode = String(payload.stake_mode || payload.units_mode || payload.unitsMode || '').toLowerCase().replace('towin', 'to_win');
                if (Number.isFinite(O) && Number.isFinite(U) && Math.abs(O) >= 100) {
                    if (O < 0 && mode === 'risk') U = U * 100 / Math.abs(O);
                    if (O > 0 && mode === 'to_win') U = U * 100 / O;
                    transformed.units = Math.round(U * 100) / 100;
                }
            })();
            if (!(Number(transformed.units) >= 0.5 && Number(transformed.units) <= 5)) {
                var favorite = Number(oddsVal) < 0;
                return Promise.resolve(contestError(
                    'Contest picks are half a unit minimum. ' + (favorite
                        ? 'On a favorite you can win up to 5 units (this pick would win ' + transformed.units + ').'
                        : 'On an underdog you can risk up to 5 units (this pick would risk ' + transformed.units + ').')));
            }
            // Client-side guard so an entrant gets a plain sentence instead of a
            // raw 400 from the API. The server enforces all of this again; this
            // is only for the message.
            if (CONTEST_MARKETS.indexOf(marketType) === -1) {
                return Promise.resolve(contestError(
                    'That market is not part of this contest. Contest picks are moneyline, run line, total, team total, First 5 moneyline, First 5 run line and First 5 total on MLB games.'));
            }
            if (LINE_MARKETS.indexOf(marketType) !== -1 && transformed.line == null) {
                return Promise.resolve(contestError(
                    'That pick is missing its line, so it could never be graded. Reselect the number and try again.'));
            }
            var targetUrl = apiBase + '/api/contests/' + encodeURIComponent(contestId) + '/picks';
            var newInit = Object.assign({}, init || {});
            newInit.method = 'POST';
            newInit.headers = Object.assign({}, (init && init.headers) || {}, authHeaders({ 'Content-Type': 'application/json' }));
            newInit.credentials = 'include';
            newInit.body = JSON.stringify(transformed);
            return origFetch(targetUrl, newInit).then(function (resp) {
                if (!resp || !resp.ok) return resp;
                // Bump the picks-used counter on success.
                preflightPickCount();
                showInlineSuccess();
                // CONTEST_RESPONSE_SHAPE_20260917: the sportsbook confirms a save only when the reply
                // carries pick.id (the regular /api/picks shape). The contest endpoint answers
                // { ok, id, submitted_at, sealed_until }, so a SAVED contest pick was shown as
                // "Pick could not be submitted" (Nima, 2026-09-17 09:03 PDT; pick 559 was saved).
                return resp.clone().json().then(function (j) {
                    var pick = Object.assign({}, transformed, {
                        id: j && j.id != null ? j.id : null,
                        submitted_at: j && j.submitted_at,
                        sealed_until: j && j.sealed_until,
                        status: 'pending',
                        contest_id: contestId
                    });
                    var body = Object.assign({}, j, { ok: true, pick: pick, contest_pick: true });
                    return new Response(JSON.stringify(body), { status: resp.status, headers: { 'Content-Type': 'application/json' } });
                }).catch(function () { return resp; });
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
