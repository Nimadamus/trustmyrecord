/**
 * Sportsbook bet-slip contest toggle (JustBet MLB).
 *
 * Adds a "Submit as JustBet MLB Contest Pick" toggle to the existing
 * Pick Slip on /sportsbook/. When ON, the very next /api/picks POST is
 * rerouted to /api/contests/justbet-mlb/picks so the pick lands in the
 * contest table (tmr_contest_picks) and does NOT touch the user's public
 * profile record / ROI / units / pick history.
 *
 * No second sportsbook page. No URL param required. Normal pick flow is
 * untouched when the toggle is OFF.
 *
 * Visibility rules (HARD):
 *   - Hidden for users who are not signed in.
 *   - Hidden for users who are not registered for the contest.
 *   - Disabled if contest is not active OR starts_at is in the future
 *     (helper text: "Contest picks are not open yet.").
 *   - Disabled if contest submission window has closed.
 *   - Disabled if picks_used >= picks_max (helper text:
 *     "Contest pick limit reached: 50/50.").
 *
 * If /sportsbook/?contest=<id> is present, this script becomes a no-op
 * because contest-mode.js already handles the full-page contest flow.
 */
(function () {
    'use strict';

    var CONTEST_ID = 'justbet-mlb';
    var CONTEST_NAME = 'JustBet MLB';

    var qs = new URLSearchParams(window.location.search);
    if ((qs.get('contest') || '').trim()) {
        // Existing contest-mode.js owns the page in this case.
        return;
    }

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
            if (localStorage.getItem('tmr_is_logged_in') === 'true') return true;
        } catch (_) {}
        return !!getAuthToken();
    }
    function authHeaders(extra) {
        var h = Object.assign({}, extra || {});
        var t = getAuthToken();
        if (t) h['Authorization'] = 'Bearer ' + t;
        return h;
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    // ---------- shared state ----------
    var state = {
        signedIn: false,
        registered: false,
        contestActive: false,
        startsAt: null,
        endsAt: null,
        picksUsed: 0,
        picksMax: 50,
        toggleOn: false,
        eligibility: 'unknown', // 'eligible' | 'not_signed_in' | 'not_registered' | 'not_open' | 'closed' | 'cap_reached'
    };
    window.TMR_CONTEST_TOGGLE = state;

    // ---------- inject CSS once ----------
    (function injectCss() {
        if (document.getElementById('tmr-contest-toggle-css')) return;
        var s = document.createElement('style');
        s.id = 'tmr-contest-toggle-css';
        s.textContent = [
            '.tmr-contest-toggle-block {',
            '  margin: 10px 0 8px;',
            '  padding: 12px 14px;',
            '  border-radius: 12px;',
            '  background: linear-gradient(180deg, rgba(60,42,8,0.55) 0%, rgba(28,22,8,0.55) 100%);',
            '  border: 1px solid rgba(255,184,0,0.45);',
            '  color: #ffe4a3;',
            '  font: 600 0.86rem/1.45 "Inter", system-ui, sans-serif;',
            '}',
            '.tmr-contest-toggle-block .tmr-cgt-title {',
            '  font-family: "Barlow","Inter",sans-serif;',
            '  font-weight: 900;',
            '  font-size: 0.78rem;',
            '  letter-spacing: 0.08em;',
            '  text-transform: uppercase;',
            '  color: #ffe4a3;',
            '  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;',
            '}',
            '.tmr-contest-toggle-block .tmr-cgt-title i { color:#f0c449; }',
            '.tmr-contest-toggle-block label.tmr-cgt-row {',
            '  display: flex; align-items: flex-start; gap: 10px;',
            '  cursor: pointer; padding: 4px 0;',
            '}',
            '.tmr-contest-toggle-block input[type=checkbox] {',
            '  margin-top: 3px;',
            '  width: 16px; height: 16px;',
            '  accent-color: #f0c449;',
            '  cursor: pointer;',
            '}',
            '.tmr-contest-toggle-block input[type=checkbox]:disabled {',
            '  cursor: not-allowed;',
            '  opacity: 0.55;',
            '}',
            '.tmr-contest-toggle-block .tmr-cgt-label { color:#fff; font-weight:800; font-size:0.92rem; line-height:1.3; }',
            '.tmr-contest-toggle-block .tmr-cgt-help { color:#f5e8c9; font-size:0.78rem; margin-top:3px; }',
            '.tmr-contest-toggle-block .tmr-cgt-counter {',
            '  display:inline-flex; align-items:center; gap:6px;',
            '  margin-top:8px; padding:4px 10px; border-radius:999px;',
            '  background:rgba(15,23,42,0.55);',
            '  border:1px solid rgba(255,184,0,0.4);',
            '  color:#ffe4a3; font-size:0.74rem; font-weight:800; letter-spacing:0.04em;',
            '}',
            '.tmr-contest-toggle-block.is-disabled { opacity: 0.78; }',
            '.tmr-contest-toggle-block.is-on {',
            '  border-color:#f0c449;',
            '  box-shadow:0 0 0 1px rgba(240,196,73,0.55), 0 6px 16px rgba(240,196,73,0.18);',
            '}',
            '.tmr-contest-toggle-block .tmr-cgt-status {',
            '  margin-top:6px; padding:6px 10px; border-radius:8px;',
            '  background:rgba(220, 38, 38, 0.12); border:1px solid rgba(220,38,38,0.32);',
            '  color:#ffd1c8; font-size:0.78rem; font-weight:700;',
            '}',
            '.tmr-contest-toggle-block.is-on .sportsbook-ticket-preview-submit { background:linear-gradient(180deg,#f0c449,#d4a72c) !important; color:#1a1206 !important; }',
        ].join('\n');
        document.head.appendChild(s);
    })();

    // ---------- DOM helpers ----------
    function findSlipCard() {
        return document.querySelector('.sportsbook-ticket-preview .sportsbook-ticket-preview-card')
            || document.querySelector('.sportsbook-ticket-preview-card');
    }

    function buildBlock() {
        var block = document.createElement('div');
        block.className = 'tmr-contest-toggle-block';
        block.id = 'tmr-contest-toggle-block';
        block.innerHTML =
            '<div class="tmr-cgt-title"><i class="fas fa-trophy" aria-hidden="true"></i> ' + escapeHtml(CONTEST_NAME) + ' Contest</div>' +
            '<label class="tmr-cgt-row">' +
                '<input type="checkbox" id="tmrContestPickToggle" data-tmr-contest-toggle>' +
                '<span>' +
                    '<span class="tmr-cgt-label">Submit as ' + escapeHtml(CONTEST_NAME) + ' contest pick</span>' +
                    '<span class="tmr-cgt-help">Contest picks are tracked separately and do not affect your public TrustMyRecord profile record, ROI, units, or pick history.</span>' +
                '</span>' +
            '</label>' +
            '<div class="tmr-cgt-counter" id="tmrContestPickCounter"><i class="fas fa-vault" aria-hidden="true"></i> <span data-tmr-cgt-counter-text>Contest picks used: —/50</span></div>' +
            '<div class="tmr-cgt-status" id="tmrContestPickStatus" hidden></div>';
        return block;
    }

    function applyState() {
        var card = findSlipCard();
        if (!card) return;
        var block = document.getElementById('tmr-contest-toggle-block');

        // Hide entirely when user not signed in OR not registered.
        if (!state.signedIn || !state.registered) {
            if (block) block.remove();
            return;
        }

        if (!block) {
            block = buildBlock();
            // Insert before the submit button if possible, else append.
            var submit = card.querySelector('.sportsbook-ticket-preview-submit');
            if (submit && submit.parentNode === card) {
                card.insertBefore(block, submit);
            } else {
                card.appendChild(block);
            }
            block.querySelector('#tmrContestPickToggle').addEventListener('change', function (ev) {
                state.toggleOn = !!ev.target.checked && state.eligibility === 'eligible';
                block.classList.toggle('is-on', state.toggleOn);
                updateSubmitLabel();
            });
        }

        var cb = block.querySelector('#tmrContestPickToggle');
        var counterText = block.querySelector('[data-tmr-cgt-counter-text]');
        var status = block.querySelector('#tmrContestPickStatus');

        if (counterText) counterText.textContent = 'Contest picks used: ' + state.picksUsed + '/' + state.picksMax;

        var disabled = false;
        var statusMsg = '';

        var now = Date.now();
        var startsAt = state.startsAt ? new Date(state.startsAt).getTime() : null;
        var endsAt = state.endsAt ? new Date(state.endsAt).getTime() : null;

        if (!state.contestActive) {
            disabled = true; statusMsg = 'Contest picks are not open yet.';
            state.eligibility = 'not_open';
        } else if (startsAt && now < startsAt) {
            disabled = true; statusMsg = 'Contest picks are not open yet.';
            state.eligibility = 'not_open';
        } else if (endsAt && now >= endsAt) {
            disabled = true; statusMsg = 'Contest submission window has closed.';
            state.eligibility = 'closed';
        } else if (state.picksUsed >= state.picksMax) {
            disabled = true; statusMsg = 'Contest pick limit reached: ' + state.picksMax + '/' + state.picksMax + '.';
            state.eligibility = 'cap_reached';
        } else {
            state.eligibility = 'eligible';
        }

        cb.disabled = disabled;
        if (disabled) {
            cb.checked = false;
            state.toggleOn = false;
            block.classList.add('is-disabled');
            block.classList.remove('is-on');
        } else {
            block.classList.remove('is-disabled');
        }
        if (status) {
            if (statusMsg) {
                status.textContent = statusMsg;
                status.hidden = false;
            } else {
                status.hidden = true;
            }
        }
        updateSubmitLabel();
    }

    function updateSubmitLabel() {
        var submit = document.querySelector('.sportsbook-ticket-preview-submit, #ttSlipSubmit');
        if (!submit) return;
        if (!submit.dataset.tmrOrigLabel) submit.dataset.tmrOrigLabel = submit.textContent;
        if (state.toggleOn && state.eligibility === 'eligible') {
            submit.textContent = 'Submit Contest Pick';
        } else if (submit.dataset.tmrOrigLabel) {
            submit.textContent = submit.dataset.tmrOrigLabel;
        }
    }

    // The pick slip is re-rendered by _ttPopulateSlip each time a board
    // price is clicked. Re-apply the block on every DOM mutation under
    // the ticket preview aside.
    function watchSlip() {
        var aside = document.querySelector('.sportsbook-ticket-preview');
        if (!aside) {
            // Slip element shows up later — retry until it does.
            setTimeout(watchSlip, 500);
            return;
        }
        var mo = new MutationObserver(function () { applyState(); });
        mo.observe(aside, { childList: true, subtree: true });
        applyState();
    }

    // ---------- backend probes ----------
    function fetchJson(url) {
        return fetch(url, { headers: authHeaders(), credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    function probeAll() {
        state.signedIn = isSignedIn();
        return fetchJson(apiBase + '/api/contests/' + encodeURIComponent(CONTEST_ID)).then(function (meta) {
            if (meta) {
                state.contestActive = !!meta.is_active;
                state.startsAt = meta.starts_at || null;
                state.endsAt = meta.ends_at || null;
                if (typeof meta.picks_max === 'number') state.picksMax = meta.picks_max;
            }
            if (!state.signedIn) {
                state.registered = false;
                applyState();
                return;
            }
            return Promise.all([
                fetchJson(apiBase + '/api/contests/' + encodeURIComponent(CONTEST_ID) + '/my-registration'),
                fetchJson(apiBase + '/api/contests/' + encodeURIComponent(CONTEST_ID) + '/my-status'),
            ]).then(function (parts) {
                var reg = parts[0] && parts[0].registration;
                var status = reg && reg.status ? String(reg.status) : 'none';
                state.registered = !(status === 'none' || status === 'rejected');
                var st = parts[1];
                if (st) {
                    state.picksUsed = Number(st.picks_used) || 0;
                    if (typeof st.picks_max === 'number') state.picksMax = st.picks_max;
                }
                applyState();
            });
        });
    }

    // ---------- fetch interceptor ----------
    var origFetch = window.fetch.bind(window);
    var PICKS_RE = /\/api\/picks(?:\/?$|\?)/;

    window.fetch = function (input, init) {
        try {
            var method = (init && init.method ? String(init.method) : (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            if (method === 'POST' && PICKS_RE.test(url) && state.toggleOn && state.eligibility === 'eligible') {
                return rerouteToContest(input, init);
            }
        } catch (_) { /* fall through */ }
        return origFetch(input, init);
    };

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

    function rerouteToContest(input, init) {
        return readBody(init).then(function (orig) {
            var payload = orig && typeof orig === 'object' ? orig : {};
            var transformed = {
                contest_id: CONTEST_ID,
                game_id: payload.game_id || payload.gameId,
                market_type: payload.market_type || payload.marketType,
                selection: payload.selection,
                odds: numericOrSelf(payload.odds != null ? payload.odds : payload.odds_snapshot),
                units: numericOrSelf(payload.units),
                stake_mode: payload.stake_mode || payload.units_mode || 'risk',
                attest_justbet_signup: true,
            };
            if (payload.line_snapshot != null && payload.line_snapshot !== '') {
                var n = Number(payload.line_snapshot);
                if (Number.isFinite(n)) transformed.line = n;
            } else if (payload.line != null && payload.line !== '') {
                var n2 = Number(payload.line);
                if (Number.isFinite(n2)) transformed.line = n2;
            }
            // Mark the in-flight submission as contest so post-success
            // handlers (autoPostPickToFeed, etc.) can opt out of leaking
            // contest picks to the public feed.
            window.__tmrLastPickWasContest = true;
            var targetUrl = apiBase + '/api/contests/' + encodeURIComponent(CONTEST_ID) + '/picks';
            var newInit = Object.assign({}, init || {});
            newInit.method = 'POST';
            newInit.headers = Object.assign({}, (init && init.headers) || {}, authHeaders({ 'Content-Type': 'application/json' }));
            newInit.credentials = 'include';
            newInit.body = JSON.stringify(transformed);
            return origFetch(targetUrl, newInit).then(function (resp) {
                // Normalize success response so the existing lockInPick
                // success handler (expects { pick: { id } }) keeps working.
                if (!resp || !resp.ok) return resp;
                return resp.clone().json().then(function (data) {
                    var normalized = {
                        message: 'Contest pick submitted',
                        contest: true,
                        pick: { id: data && data.id, contest_id: CONTEST_ID, submitted_at: data && data.submitted_at, sealed_until: data && data.sealed_until },
                    };
                    // Bump the counter + reset the toggle so the next pick
                    // defaults to a normal submission.
                    state.picksUsed += 1;
                    state.toggleOn = false;
                    var cb = document.getElementById('tmrContestPickToggle');
                    if (cb) cb.checked = false;
                    var block = document.getElementById('tmr-contest-toggle-block');
                    if (block) block.classList.remove('is-on');
                    applyState();
                    // Rebuild a fresh Response that matches the /api/picks shape.
                    return new Response(JSON.stringify(normalized), {
                        status: 201,
                        statusText: 'Created',
                        headers: { 'Content-Type': 'application/json' },
                    });
                }).catch(function () { return resp; });
            });
        });
    }

    // ---------- suppress public-feed side-effects for contest picks ----------
    function wrapAutoPost() {
        var orig = window.autoPostPickToFeed;
        if (!orig || orig.__tmrCgtWrapped) return;
        window.autoPostPickToFeed = function () {
            if (window.__tmrLastPickWasContest) {
                window.__tmrLastPickWasContest = false;
                return; // do not post contest pick to the public feed
            }
            return orig.apply(this, arguments);
        };
        window.autoPostPickToFeed.__tmrCgtWrapped = true;
    }

    function init() {
        watchSlip();
        probeAll();
        // Refresh periodically so a long-open tab reflects new contest
        // start time / cap state without a full reload.
        setInterval(probeAll, 60 * 1000);
        // autoPostPickToFeed may be defined later in inline scripts.
        var tries = 0;
        var t = setInterval(function () {
            wrapAutoPost();
            if (++tries > 40 || (window.autoPostPickToFeed && window.autoPostPickToFeed.__tmrCgtWrapped)) {
                clearInterval(t);
            }
        }, 250);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
