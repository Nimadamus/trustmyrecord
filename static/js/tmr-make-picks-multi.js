/* tmr-make-picks-multi.js — Make Picks UX upgrade (May 21, 2026)
 *
 * What it does (frontend-only, no autograder/validation/backend math touched):
 *   1) Compacts the MLB/all-sports game-row so ~10 games fit on one screen.
 *   2) Adds multi-pick selection. The right-rail "Pick Slip" becomes the ONLY
 *      review surface — multiple picks queue inside it, each row carries its
 *      own units stepper + remove button.
 *   3) "Submit Picks" runs one confirm() dialog, then calls the existing
 *      backend POST /api/picks sequentially for each queued pick. Same payload
 *      shape as window.lockInPick — backend grading/result math unchanged.
 *   4) Hides the second review style (#pickDetails step-form) so only the
 *      right-rail slip is visible. The form's odds/line inputs are no longer
 *      required because each odds-button click captures the displayed odds.
 *   5) Suppresses the auto-scroll-to-bottom on selection (overrides
 *      window.TMR._ttScrollToPickSlip with a no-op + intercepts showPickStep
 *      calls to 'pickDetails').
 *   6) Adds a visible "View Leaderboard" link near the top of the page.
 */
(function () {
    'use strict';

    var STYLE_ID = 'tmr-make-picks-multi-style';
    var SLIP_CONTAINER_CLASS = 'tmr-multi-slip';

    // ---------- CSS ----------
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var css = [
            // Compact game-row so ~10 games fit on one screen (desktop/tablet).
            '#picks .game-row { margin-bottom: 4px !important; }',
            '#picks .game-row .game-time-header { padding: 3px 14px !important; }',
            '#picks .game-row .game-time { font-size: 11px !important; }',
            '#picks .game-row .team-row { padding: 4px 14px !important; gap: 8px !important; }',
            '#picks .game-row .team-row .team-name { font-size: 14px !important; line-height: 1.15 !important; }',
            '#picks .game-row .odds-btn { min-height: 38px !important; padding: 4px 6px !important; }',
            '#picks .game-row .odds-btn .odds-line { font-size: 14px !important; margin-bottom: 1px !important; }',
            '#picks .game-row .odds-btn .odds-value { font-size: 12px !important; }',
            '#picks .game-row .team-info { gap: 8px !important; }',
            // Hide the second review surface (#pickDetails step-form) on the
            // sportsbook page — consolidates to a single review slip.
            'body[data-tmr-route="sportsbook"] #pickDetails.pick-step,',
            'body[data-tmr-route="sportsbook"] #pickDetails { display: none !important; }',
            // Multi-pick slip styling
            '.' + SLIP_CONTAINER_CLASS + ' { display: flex; flex-direction: column; gap: 8px; margin: 8px 0 12px; max-height: 50vh; overflow-y: auto; }',
            '.' + SLIP_CONTAINER_CLASS + '-row { background: #101820; border: 1px solid #243349; border-radius: 8px; padding: 8px 10px; display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; }',
            '.' + SLIP_CONTAINER_CLASS + '-row .lbl { font-size: 12px; color: #8896a8; line-height: 1.3; }',
            '.' + SLIP_CONTAINER_CLASS + '-row .sel { font-size: 14px; color: #fff; font-weight: 600; line-height: 1.3; }',
            '.' + SLIP_CONTAINER_CLASS + '-row .odds { font-size: 13px; color: #00c853; font-weight: 700; }',
            '.' + SLIP_CONTAINER_CLASS + '-row .units { display: inline-flex; align-items: center; gap: 4px; }',
            '.' + SLIP_CONTAINER_CLASS + '-row .units button { width: 22px; height: 22px; border-radius: 4px; border: 1px solid #2d3340; background: #1a1d24; color: #fff; cursor: pointer; font-size: 14px; line-height: 1; }',
            '.' + SLIP_CONTAINER_CLASS + '-row .units input { width: 32px; text-align: center; background: #0b1118; color: #fff; border: 1px solid #2d3340; border-radius: 4px; height: 22px; font-size: 13px; }',
            '.' + SLIP_CONTAINER_CLASS + '-row .rm { width: 24px; height: 24px; border-radius: 50%; border: 1px solid #5a1f1f; background: transparent; color: #ff6b6b; cursor: pointer; font-size: 14px; line-height: 1; }',
            '.' + SLIP_CONTAINER_CLASS + '-empty { color: #8896a8; font-size: 13px; padding: 20px 10px; text-align: center; }',
            // Sticky bottom slip on small screens
            '@media (max-width: 1099px) {',
            '  .sportsbook-ticket-preview { position: sticky; bottom: 0; z-index: 20; background: #0b1118; border-top: 1px solid #243349; max-height: 60vh; overflow-y: auto; }',
            '}',
            // Leaderboard button
            '.tmr-mp-leaderboard-link { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: linear-gradient(90deg,#0b6e3a,#1aa05a); color: #fff; font-weight: 600; border-radius: 8px; text-decoration: none; font-size: 13px; border: 1px solid #1aa05a; }',
            '.tmr-mp-leaderboard-link:hover { filter: brightness(1.1); }',
            '.tmr-mp-toolbar { display: flex; gap: 10px; align-items: center; justify-content: flex-end; margin: 8px 0 12px; padding: 0 14px; flex-wrap: wrap; }'
        ].join('\n');
        var s = document.createElement('style');
        s.id = STYLE_ID;
        s.appendChild(document.createTextNode(css));
        document.head.appendChild(s);
    }

    // ---------- state ----------
    window.TMR = window.TMR || {};
    window.TMR.multiSelections = window.TMR.multiSelections || [];

    function selectionKey(item) {
        return [item.gameId || '', item.market_type || '', item.selection || '', item.team || ''].join('|');
    }

    // ---------- payload derivation (mirrors lockInPick logic) ----------
    var MARKET_TYPE_MAP = { ml: 'h2h', spread: 'spreads', over: 'totals', under: 'totals', teamover: 'team_totals', teamunder: 'team_totals', f5spread: 'f5_spreads', f5ml: 'f5_h2h', f5over: 'f5_totals', f5under: 'f5_totals', f5teamover: 'f5_team_totals', f5teamunder: 'f5_team_totals' };
    var NEEDS_LINE = { spread: 1, over: 1, under: 1, teamover: 1, teamunder: 1, f5spread: 1, f5over: 1, f5under: 1, f5teamover: 1, f5teamunder: 1 };

    function fmtLine(v) {
        if (v == null || v === '') return '';
        if (window.TMR && typeof window.TMR.formatLine === 'function') return window.TMR.formatLine(v);
        var n = parseFloat(v);
        if (!Number.isFinite(n)) return '';
        var s = String(n);
        if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
        return s;
    }

    function buildItemFromSelectGameBet(pick) {
        var betType = pick.betType;
        var market_type = MARKET_TYPE_MAP[betType] || 'h2h';
        var rawTeam = String(pick.team || '').replace(/\s+(over|under)\s*$/i, '').trim();
        var lineSnapshot = null;
        if (NEEDS_LINE[betType] && pick.line && pick.line !== 'ML') {
            var parsed = parseFloat(pick.line);
            if (Number.isFinite(parsed)) lineSnapshot = parsed;
        }
        var _line = lineSnapshot != null ? fmtLine(lineSnapshot) : '';
        var selection, teamTotalSide = '';
        if (betType === 'over' || betType === 'f5over') {
            selection = _line ? ('Over ' + _line) : 'Over';
        } else if (betType === 'under' || betType === 'f5under') {
            selection = _line ? ('Under ' + _line) : 'Under';
        } else if (betType === 'teamover' || betType === 'f5teamover') {
            teamTotalSide = 'over';
            selection = (rawTeam + ' Over' + (_line ? ' ' + _line : '')).trim();
        } else if (betType === 'teamunder' || betType === 'f5teamunder') {
            teamTotalSide = 'under';
            selection = (rawTeam + ' Under' + (_line ? ' ' + _line : '')).trim();
        } else {
            selection = rawTeam;
        }

        var oddsNum = parseInt(pick.odds, 10);
        if (!Number.isFinite(oddsNum)) oddsNum = -110;

        return {
            gameId: pick.gameId || (pick.game && pick.game.id) || ('espn_' + (pick.gameIndex || 0)),
            gameIndex: pick.gameIndex,
            awayTeam: pick.awayTeam,
            homeTeam: pick.homeTeam,
            sport: pick.sport,
            gameTime: pick.gameTime,
            game: pick.game,
            betType: betType,
            team: rawTeam,
            line: pick.line,
            odds: oddsNum,
            units: 1,
            market_type: market_type,
            selection: selection,
            lineSnapshot: lineSnapshot,
            teamTotalSide: teamTotalSide,
            book: pick.book || '',
            bookKey: pick.bookKey || ''
        };
    }

    function sportKey(item) {
        var map = (window.TMR && window.TMR.sportKeyMap) || { 'NFL': 'americanfootball_nfl', 'NBA': 'basketball_nba', 'WNBA': 'basketball_wnba', 'NHL': 'icehockey_nhl', 'MLB': 'baseball_mlb', 'Soccer': 'soccer_epl', 'MLS': 'soccer_usa_mls', 'NCAAF': 'americanfootball_ncaaf', 'NCAAB': 'basketball_ncaab' };
        return map[item.sport] || item.sport || '';
    }

    function buildBackendPick(item) {
        var sk = sportKey(item);
        return {
            game_id: item.gameId,
            external_game_id: item.gameId,
            sport_key: sk,
            league: sk,
            market_type: item.market_type,
            bet_type: item.market_type === 'team_totals' ? 'team_total' : item.market_type,
            selection: item.selection,
            selection_label: item.selection,
            line_snapshot: item.lineSnapshot,
            odds_snapshot: item.odds,
            units: item.units,
            units_mode: (window.TMR && window.TMR.selectedUnitsMode) || 'risk',
            home_team: item.homeTeam,
            away_team: item.awayTeam,
            commence_time: item.gameTime || new Date().toISOString(),
            team_name: item.market_type === 'team_totals' ? item.team : '',
            opponent_name: item.market_type === 'team_totals'
                ? (item.team === item.homeTeam ? item.awayTeam : (item.team === item.awayTeam ? item.homeTeam : ''))
                : '',
            side: item.teamTotalSide || '',
            book_title: item.book || '',
            book_key: item.bookKey || '',
            source_type: 'sportsbook',
            game_snapshot: {
                id: item.gameId,
                sport_key: sk,
                home_team: item.homeTeam,
                away_team: item.awayTeam,
                commence_time: item.gameTime || new Date().toISOString(),
                bookmakers: item.game && Array.isArray(item.game.bookmakers) ? item.game.bookmakers : []
            }
        };
    }

    // ---------- selection wiring ----------
    function addOrToggleSelection(item) {
        var k = selectionKey(item);
        var arr = window.TMR.multiSelections;
        var idx = -1;
        for (var i = 0; i < arr.length; i++) {
            if (selectionKey(arr[i]) === k) { idx = i; break; }
        }
        if (idx >= 0) {
            // toggle off (user re-tapped same pick) — only if exact same item
            arr.splice(idx, 1);
        } else {
            // Replace any prior selection on the same game+market (e.g.
            // switching from away ML to home ML on the same game) — sportsbook
            // convention: one pick per market per game.
            for (var j = arr.length - 1; j >= 0; j--) {
                if (arr[j].gameId === item.gameId && arr[j].market_type === item.market_type) {
                    arr.splice(j, 1);
                }
            }
            arr.push(item);
        }
        renderSlip();
    }

    // Wrap window.selectGameBet so each click queues into multi-selections.
    // We keep the original behavior (currentSelectedPick still gets set, slip
    // gets has-selection class) but skip the step-transition + auto-scroll.
    function patchSelectGameBet() {
        var orig = window.selectGameBet;
        if (typeof orig !== 'function' || orig.__tmrMultiPatched) return;
        window.selectGameBet = function (gameIndex, betType, team, line, odds, awayTeam, homeTeam) {
            try { orig.apply(this, arguments); } catch (e) { console.error('[TMR][multi] original selectGameBet error:', e); }
            try {
                var pick = window.TMR && window.TMR.currentSelectedPick;
                if (!pick) return;
                if (!pick.odds || pick.odds === '--' || pick.odds === '' || pick.odds === 'Pick') {
                    console.warn('[TMR][multi] selection has no real odds, not queuing');
                    return;
                }
                var item = buildItemFromSelectGameBet(pick);
                addOrToggleSelection(item);
            } catch (e) {
                console.error('[TMR][multi] queue selection failed:', e);
            }
        };
        window.selectGameBet.__tmrMultiPatched = true;
    }

    // No-op the legacy scroll-to-slip behavior. Right-rail slip is sticky on
    // desktop and bottom-sticky on mobile (see CSS above) — no scroll needed.
    function suppressAutoScroll() {
        window.TMR = window.TMR || {};
        window.TMR._ttScrollToPickSlip = function () { /* intentional no-op — see tmr-make-picks-multi.js */ };
        // _ttPopulateSlip rewrites the right-rail card with a single-pick
        // form (Lock Pick / line / odds inputs). That's the duplicate review
        // surface Nima reported. Neutralize it — our multi-slip renders the
        // selection list inside the same card from selectGameBet wiring.
        window.TMR._ttPopulateSlip = function () { renderSlip(); };
    }

    // Intercept showPickStep('pickDetails') so the duplicate form never opens.
    function patchShowPickStep() {
        var orig = window.showPickStep;
        if (typeof orig !== 'function' || orig.__tmrMultiPatched) return;
        window.showPickStep = function (stepId) {
            if (stepId === 'pickDetails') return; // consolidated into right-rail slip
            return orig.apply(this, arguments);
        };
        window.showPickStep.__tmrMultiPatched = true;
    }

    // ---------- slip render ----------
    function fmtOdds(o) {
        var n = Number(o);
        if (!Number.isFinite(n)) return String(o || '');
        return n > 0 ? '+' + n : String(n);
    }

    function safe(s) {
        return String(s == null ? '' : s).replace(/[<>"']/g, function (c) {
            return ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function renderSlip() {
        var card = document.querySelector('.sportsbook-ticket-preview-card');
        if (!card) return;

        // Remove any prior multi-slip container we injected
        var existing = card.querySelector('.' + SLIP_CONTAINER_CLASS);
        if (existing) existing.remove();

        // Hide the empty-slip placeholder + note + single-pick submit button
        // — we replace them with our multi-slip UI.
        var empty = card.querySelector('.sportsbook-empty-slip');
        if (empty) empty.style.display = 'none';
        var note = card.querySelector('.sportsbook-ticket-preview-note');
        if (note) note.style.display = 'none';

        var arr = window.TMR.multiSelections || [];
        var container = document.createElement('div');
        container.className = SLIP_CONTAINER_CLASS;

        if (arr.length === 0) {
            var emptyMsg = document.createElement('div');
            emptyMsg.className = SLIP_CONTAINER_CLASS + '-empty';
            emptyMsg.textContent = 'Tap odds to add picks. You can queue multiple and submit them together.';
            container.appendChild(emptyMsg);
        } else {
            arr.forEach(function (item, idx) {
                var lineDisp = item.lineSnapshot != null ? ' ' + fmtLine(item.lineSnapshot) : '';
                var matchup = safe(item.awayTeam || '') + ' @ ' + safe(item.homeTeam || '');
                var row = document.createElement('div');
                row.className = SLIP_CONTAINER_CLASS + '-row';
                row.innerHTML =
                    '<div>' +
                    '<div class="sel">' + safe(item.selection) + lineDisp + '</div>' +
                    '<div class="lbl">' + matchup + ' &middot; <span class="odds">' + fmtOdds(item.odds) + '</span> &middot; ' + safe(item.sport || '') + '</div>' +
                    '</div>' +
                    '<div class="units" data-idx="' + idx + '">' +
                    '<button type="button" data-act="dec" aria-label="Decrease units">&minus;</button>' +
                    '<input type="number" min="1" max="5" step="1" value="' + Number(item.units || 1) + '" aria-label="Units">' +
                    '<button type="button" data-act="inc" aria-label="Increase units">+</button>' +
                    '</div>' +
                    '<button type="button" class="rm" data-act="rm" data-idx="' + idx + '" aria-label="Remove pick">&times;</button>';
                container.appendChild(row);
            });
        }

        // Insert before the existing submit button so it sits between the
        // empty-state area and the submit CTA.
        var submitBtn = card.querySelector('.sportsbook-ticket-preview-submit');
        if (submitBtn) {
            card.insertBefore(container, submitBtn);
            submitBtn.disabled = arr.length === 0;
            submitBtn.textContent = arr.length > 1
                ? 'Submit ' + arr.length + ' Picks'
                : (arr.length === 1 ? 'Submit Pick' : 'Submit Pick');
            submitBtn.onclick = onSubmitAllClick;
        } else {
            card.appendChild(container);
        }

        // Wire units stepper + remove buttons via delegation
        container.addEventListener('click', function (ev) {
            var t = ev.target;
            if (!(t instanceof HTMLElement)) return;
            var act = t.getAttribute('data-act');
            if (!act) return;
            var idxStr = t.getAttribute('data-idx') || (t.parentElement && t.parentElement.getAttribute('data-idx'));
            var idx = parseInt(idxStr, 10);
            if (!Number.isFinite(idx)) return;
            var arr2 = window.TMR.multiSelections;
            if (!arr2[idx]) return;
            if (act === 'rm') {
                arr2.splice(idx, 1);
                renderSlip();
            } else if (act === 'inc') {
                arr2[idx].units = Math.min(5, (parseInt(arr2[idx].units, 10) || 1) + 1);
                renderSlip();
            } else if (act === 'dec') {
                arr2[idx].units = Math.max(1, (parseInt(arr2[idx].units, 10) || 1) - 1);
                renderSlip();
            }
        });
        container.addEventListener('change', function (ev) {
            var t = ev.target;
            if (!(t instanceof HTMLInputElement)) return;
            var parent = t.parentElement;
            if (!parent) return;
            var idx = parseInt(parent.getAttribute('data-idx'), 10);
            var arr2 = window.TMR.multiSelections;
            if (!Number.isFinite(idx) || !arr2[idx]) return;
            var v = Math.max(1, Math.min(5, Math.round(parseFloat(t.value) || 1)));
            arr2[idx].units = v;
            renderSlip();
        });
    }

    // ---------- batch submit ----------
    function isLoggedIn() {
        try { if (window.auth && window.auth.isLoggedIn && window.auth.isLoggedIn()) return true; } catch (_) {}
        try { if (localStorage.getItem('tmr_is_logged_in') === 'true') return true; } catch (_) {}
        try { if (localStorage.getItem('trustmyrecord_session')) return true; } catch (_) {}
        return false;
    }

    function onSubmitAllClick(ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        var arr = (window.TMR.multiSelections || []).slice();
        if (arr.length === 0) return;
        if (!isLoggedIn()) {
            if (typeof window.showSection === 'function') window.showSection('login');
            else alert('Please log in to submit picks.');
            return;
        }

        // Started-game filter
        var now = Date.now();
        var stale = [];
        arr = arr.filter(function (it) {
            var ms = Date.parse(it.gameTime || '');
            if (Number.isFinite(ms) && ms <= now) { stale.push(it); return false; }
            return true;
        });
        if (stale.length) {
            alert(stale.length + ' pick(s) skipped — those games have already started.');
        }
        if (arr.length === 0) return;

        var msg = arr.length === 1
            ? 'Submit this pick to your public record?'
            : 'Submit all ' + arr.length + ' picks to your public record?';
        if (!window.confirm(msg)) return;

        if (typeof api === 'undefined' || typeof api.createPick !== 'function') {
            alert('Submit failed: pick service unavailable. Please refresh and try again.');
            return;
        }

        if (window.__tmrLockInFlight) {
            console.log('[TMR][multi] submit blocked — a submission is already in flight');
            return;
        }

        window.__tmrLockInFlight = true;
        var submitBtn = document.querySelector('.sportsbook-ticket-preview-submit');
        var origLabel = submitBtn ? submitBtn.textContent : '';
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting...'; }

        var results = { ok: 0, dup: 0, fail: 0, errors: [] };

        function submitNext(i) {
            if (i >= arr.length) {
                finishBatch();
                return;
            }
            var item = arr[i];
            var payload;
            try { payload = buildBackendPick(item); }
            catch (e) { results.fail++; results.errors.push('build error: ' + e.message); return submitNext(i + 1); }

            if (submitBtn) submitBtn.textContent = 'Submitting ' + (i + 1) + ' of ' + arr.length + '...';

            api.createPick(payload).then(function (result) {
                if (result && result.duplicate) results.dup++;
                else results.ok++;
                // Drop this item from the live queue so retry doesn't re-submit it.
                var key = selectionKey(item);
                var live = window.TMR.multiSelections;
                for (var k = live.length - 1; k >= 0; k--) {
                    if (selectionKey(live[k]) === key) live.splice(k, 1);
                }
                submitNext(i + 1);
            }).catch(function (err) {
                results.fail++;
                var msg = (err && (err.message || err.error)) || 'unknown';
                results.errors.push(item.awayTeam + ' @ ' + item.homeTeam + ' (' + item.selection + '): ' + msg);
                submitNext(i + 1);
            });
        }

        function finishBatch() {
            window.__tmrLockInFlight = false;
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origLabel; }

            try { if (typeof window.renderPicksList === 'function') window.renderPicksList(); } catch (_) {}
            try { if (typeof window.loadPicksHistory === 'function') window.loadPicksHistory(); } catch (_) {}
            try { window.dispatchEvent(new Event('tmr:pickLocked')); } catch (_) {}

            renderSlip();

            var lines = [];
            if (results.ok) lines.push(results.ok + ' pick' + (results.ok > 1 ? 's' : '') + ' locked.');
            if (results.dup) lines.push(results.dup + ' already locked previously (no duplicate created).');
            if (results.fail) {
                lines.push(results.fail + ' failed:');
                results.errors.forEach(function (e) { lines.push(' - ' + e); });
            }
            alert(lines.join('\n') || 'No picks submitted.');
        }

        submitNext(0);
    }

    // ---------- leaderboard link ----------
    function injectLeaderboardLink() {
        // Look for the make-picks header area; fall back to top of #picks.
        var picksSection = document.getElementById('picks') || document.querySelector('[data-tmr-route="sportsbook"]');
        if (!picksSection) return;
        if (picksSection.querySelector('.tmr-mp-leaderboard-link')) return;

        var header = picksSection.querySelector('.make-picks-header') || picksSection.querySelector('.sportsbook-page-topbar') || picksSection;
        var bar = document.createElement('div');
        bar.className = 'tmr-mp-toolbar';
        var a = document.createElement('a');
        a.className = 'tmr-mp-leaderboard-link';
        a.href = '/leaderboards/';
        a.innerHTML = '&#127942; View Leaderboard';
        a.title = 'See how you rank against other handicappers';
        bar.appendChild(a);

        if (header === picksSection) picksSection.insertBefore(bar, picksSection.firstChild);
        else header.parentNode.insertBefore(bar, header.nextSibling);
    }

    // ---------- bootstrap ----------
    function boot() {
        injectStyles();
        suppressAutoScroll();
        patchShowPickStep();
        patchSelectGameBet();
        renderSlip();
        injectLeaderboardLink();

        // Re-patch + re-render after sports/games re-render or auth flip —
        // selectGameBet sometimes gets re-defined by later production-fix
        // scripts, and the slip card can be re-rendered when the slip step
        // remounts. Use a MutationObserver to keep our patches sticky.
        try {
            var mo = new MutationObserver(function () {
                patchSelectGameBet();
                // If our slip container got blown away by another render, rebuild it.
                var card = document.querySelector('.sportsbook-ticket-preview-card');
                if (card && !card.querySelector('.' + SLIP_CONTAINER_CLASS)) renderSlip();
                if (!document.querySelector('.tmr-mp-leaderboard-link')) injectLeaderboardLink();
            });
            mo.observe(document.body, { childList: true, subtree: true });
        } catch (_) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
