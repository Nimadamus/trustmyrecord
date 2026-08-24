/* =============================================================================
   SIM → SPORTSBOOK PICK HANDOFF (sim-pick-prefill.js)  simv2 20260730
   -----------------------------------------------------------------------------
   Loaded on /sportsbook/ only. Activates ONLY when the URL carries ?simpick=1
   AND a fresh pick intent exists in localStorage (written by the MLB Simulator
   pick panel). It preselects the intended moneyline through the SAME canonical
   window.selectGameBet bridge a user click uses — the slip opens prefilled, the
   user still enters units and presses the normal submit. Nothing here submits,
   auto-confirms, or touches any other sportsbook behavior; with no ?simpick=1
   this file is a no-op. Moneyline only.
   ============================================================================= */
(function () {
    'use strict';

    var KEY = 'tmr_sim_pick_intent';
    var TTL_MS = 6 * 60 * 60 * 1000;

    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    if (params.get('simpick') !== '1') return;

    var intent = null;
    try {
        intent = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch (e) { intent = null; }
    /* POLL_TOTALS_20260824: a game-total intent names a side and a line rather
       than a team, so the guard can no longer require pick_team. Everything
       else about the record is unchanged. */
    var IS_TOTAL = !!intent && (intent.market === 'over' || intent.market === 'under') &&
                   intent.line != null && isFinite(Number(intent.line));
    if (!intent || (!intent.pick_team && !IS_TOTAL) || (Date.now() - (intent.ts || 0)) > TTL_MS) {
        try { localStorage.removeItem(KEY); } catch (e) { }
        return;
    }

    function track(name, p) {
        try {
            if (window.TMRAnalytics && typeof window.TMRAnalytics.track === 'function') window.TMRAnalytics.track(name, p || {});
        } catch (e) { }
    }

    function esc(s) {
        return ('' + (s == null ? '' : s)).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* Banner so the member always knows why a selection appeared. */
    function showBanner(text, ok) {
        var el = document.createElement('div');
        el.id = 'simPickBanner';
        el.setAttribute('role', 'status');
        el.style.cssText = 'position:sticky;top:0;z-index:9999;padding:11px 16px;text-align:center;' +
            'font:600 14px Inter,system-ui,sans-serif;color:#04211F;background:linear-gradient(135deg,#2DD4BF,#7FEBDC);' +
            'display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;';
        el.innerHTML = '<span>' + esc(text) + '</span>' +
            '<button type="button" style="border:0;border-radius:7px;padding:5px 12px;font-weight:800;cursor:pointer;background:rgba(0,0,0,.18);color:#04211F" ' +
            'onclick="this.parentNode.remove()">Dismiss</button>';
        document.body.insertBefore(el, document.body.firstChild);
        if (!ok) el.style.background = 'linear-gradient(135deg,#F5C542,#E8D48B)';
    }

    function findGameIndex(games) {
        for (var i = 0; i < games.length; i++) {
            var g = games[i];
            if (!g) continue;
            if (intent.board_game_id && String(g.id) === String(intent.board_game_id)) return i;
            var home = (g.home_team || '').toLowerCase();
            var away = (g.away_team || '').toLowerCase();
            if (intent.home_team_name && intent.away_team_name &&
                home.indexOf(intent.home_team_name.toLowerCase()) !== -1 &&
                away.indexOf(intent.away_team_name.toLowerCase()) !== -1) return i;
        }
        return -1;
    }

    function mlPriceFor(game, team) {
        var books = (game && game.bookmakers) || [];
        for (var b = 0; b < books.length; b++) {
            var markets = books[b].markets || [];
            for (var m = 0; m < markets.length; m++) {
                if (markets[m].key !== 'h2h') continue;
                var outs = markets[m].outcomes || [];
                for (var o = 0; o < outs.length; o++) {
                    if ((outs[o].name || '').toLowerCase() === team.toLowerCase() &&
                        outs[o].price != null && isFinite(Number(outs[o].price))) {
                        return outs[o].price;
                    }
                }
            }
        }
        return null;
    }

    /**
     * The board's own totals market for this game, at EXACTLY the line the
     * intent carries.
     *
     * This is a SECOND exact-line check, deliberately. The server compared the
     * poll against the persisted board snapshot; by the time the member arrives
     * the live board may have moved off that number, and quoting the old one
     * would be the drift the whole feature exists to avoid. A different line
     * here means no preselection.
     */
    function totalsAtLine(game, wantLine, side) {
        var books = (game && game.bookmakers) || [];
        var want = Number(wantLine);
        for (var b = 0; b < books.length; b++) {
            var markets = books[b].markets || [];
            for (var m = 0; m < markets.length; m++) {
                if (markets[m].key !== 'totals') continue;
                var outs = markets[m].outcomes || [];
                var over = null, under = null;
                for (var o = 0; o < outs.length; o++) {
                    var nm = (outs[o].name || '').toLowerCase();
                    if (nm === 'over') over = outs[o];
                    else if (nm === 'under') under = outs[o];
                }
                if (!over || !under) continue;
                if (over.point == null || under.point == null) continue;
                if (Number(over.point) !== Number(under.point)) continue;
                if (Number(over.point) !== want) return { moved: Number(over.point) };
                var chosen = (side === 'Over') ? over : under;
                if (chosen.price == null || !isFinite(Number(chosen.price))) continue;
                return { line: want, price: Number(chosen.price) };
            }
        }
        return null;
    }

    /* Watch for a successful pick submission while the intent is active, then
       emit the funnel event and clear the intent. Observes the same
       window.api.request bridge the sportsbook submit path uses; read-only. */
    function armSubmitObserver() {
        if (!window.api || typeof window.api.request !== 'function' || window.api.__simPickPatched) return;
        var orig = window.api.request.bind(window.api);
        window.api.__simPickPatched = true;
        window.api.request = function (path, opts) {
            var p = orig(path, opts);
            try {
                var isPickPost = typeof path === 'string' && /\/picks(\?|$)/.test(path) &&
                    opts && String(opts.method || '').toUpperCase() === 'POST';
                if (isPickPost && p && typeof p.then === 'function') {
                    p.then(function (resp) {
                        if (resp) {
                            track('simulator_pick_submitted', { source: intent.source || 'mlb-simulator', sport: intent.sport || 'MLB' });
                            track('simulator_verified_pick_created', { source: intent.source || 'mlb-simulator', sport: intent.sport || 'MLB' });
                            try { localStorage.removeItem(KEY); } catch (e) { }
                        }
                    }).catch(function () { });
                }
            } catch (e) { }
            return p;
        };
    }

    var tries = 0;
    var switchedSport = false;
    // Which board to open. Written by the simulator that created the intent
    // (MLB Simulator -> 'MLB', NFL Simulator -> 'NFL'); older intents that
    // predate the field are MLB by definition.
    /* POLL_PICK_BRIDGE_20260824: the same intent record is now also written by
       static/js/poll-pick-bridge.js after a poll vote, so the banner has to say
       where the preselection came from. Everything else in this file is
       unchanged: same matching, same board price, same no-submit guarantee. */
    var ORIGIN_LABEL = (intent.source === 'poll')
        ? 'From your poll vote: '
        : 'From your simulation: ';
    var INTENT_SPORT = (intent.sport && /^[A-Z]{2,5}$/.test(intent.sport)) ? intent.sport : 'MLB';
    function attempt() {
        tries++;
        var games = (window.TMR && (window.TMR.currentGames || window.TMR._cachedGames)) || null;
        if ((!games || !games.length) && !switchedSport && tries >= 4 &&
            typeof window.selectSportAndShowGames === 'function') {
            // The board defaults to another sport's tab; open the intent's board
            // the same way the visible sport tab button does. Selection only —
            // this cannot submit anything.
            switchedSport = true;
            try { window.selectSportAndShowGames(INTENT_SPORT); } catch (e) { }
        }
        if (!games || !games.length) {
            if (tries < 100) { setTimeout(attempt, 400); return; }   // ~40s window for slow API
            showBanner('Your pick (' + (intent.pick_team ? intent.pick_team + ' ML' : (intent.side || '') + ' ' + (intent.line || '')) + ') is saved — the game board has not loaded it yet. Find the matchup below to place it.', false);
            return;
        }
        armSubmitObserver();
        var idx = findGameIndex(games);
        if (idx === -1) {
            showBanner('Your simulated matchup (' + (intent.away_team_name || '') + ' @ ' + (intent.home_team_name || '') + ') is not on the current board — it may have started or moved. Choose any game below; nothing was submitted.', false);
            return;
        }
        var game = games[idx];

        if (IS_TOTAL) {
            var side = (intent.market === 'over') ? 'Over' : 'Under';
            var found = totalsAtLine(game, intent.line, side);
            if (found && found.price != null && typeof window.selectGameBet === 'function') {
                window.selectGameBet(idx, intent.market, side, String(found.line),
                                     String(found.price), game.away_team, game.home_team);
                showBanner(ORIGIN_LABEL + side + ' ' + found.line +
                    ' is pre-selected. Set your units and confirm to lock it — nothing is submitted until you do.', true);
            } else if (found && found.moved != null) {
                showBanner('The total for this game has moved from ' + intent.line + ' to ' + found.moved +
                    ' since you voted, so nothing was pre-selected. Pick the line you want below.', false);
            } else {
                showBanner('Your poll pick (' + side + ' ' + intent.line +
                    ') is ready — the total is still loading. Select it on the board to confirm; nothing is submitted automatically.', false);
            }
            return;
        }

        var price = mlPriceFor(game, intent.pick_team);
        if (price == null) {
            var teams = [game.away_team, game.home_team];
            for (var t = 0; t < teams.length && price == null; t++) {
                if (teams[t] && teams[t].toLowerCase().indexOf(intent.pick_team.toLowerCase()) !== -1) {
                    intent.pick_team = teams[t];
                    price = mlPriceFor(game, teams[t]);
                }
            }
        }
        if (price != null && typeof window.selectGameBet === 'function') {
            window.selectGameBet(idx, 'ml', intent.pick_team, '', String(price), game.away_team, game.home_team);
            showBanner(ORIGIN_LABEL + intent.pick_team + ' ML is pre-selected. Set your units and confirm to lock it — nothing is submitted until you do.', true);
        } else {
            showBanner('Your simulated pick (' + intent.pick_team + ') is ready — moneyline price is loading. Select it on the board to confirm; nothing is submitted automatically.', false);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(attempt, 800); });
    } else {
        setTimeout(attempt, 800);
    }
})();
