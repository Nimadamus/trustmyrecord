/* =============================================================================
   SIM → SPORTSBOOK PICK HANDOFF (sim-pick-prefill.js)  simv2 20260730
   -----------------------------------------------------------------------------
   Loaded on /sportsbook/ only. Activates ONLY when the URL carries ?simpick=1
   AND a fresh pick intent exists in localStorage (written by the MLB Simulator
   pick panel). It preselects the intended moneyline through the SAME canonical
   window.selectGameBet bridge a user click uses — the slip opens prefilled, the
   user still enters units and presses the normal submit. Nothing here submits,
   auto-confirms, or touches any other sportsbook behavior; with no ?simpick=1
   this file is a no-op. Straight picks only (moneyline), never a parlay.
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
    if (!intent || !intent.pick_team || (Date.now() - (intent.ts || 0)) > TTL_MS) {
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
                            track('simulator_pick_submitted', { source: 'mlb-simulator' });
                            try { localStorage.removeItem(KEY); } catch (e) { }
                        }
                    }).catch(function () { });
                }
            } catch (e) { }
            return p;
        };
    }

    var tries = 0;
    var switchedToMlb = false;
    function attempt() {
        tries++;
        var games = (window.TMR && (window.TMR.currentGames || window.TMR._cachedGames)) || null;
        if ((!games || !games.length) && !switchedToMlb && tries >= 4 &&
            typeof window.selectSportAndShowGames === 'function') {
            // The board defaults to another sport's tab; open the MLB board the
            // same way the visible MLB tab button does. Selection only — this
            // cannot submit anything.
            switchedToMlb = true;
            try { window.selectSportAndShowGames('MLB'); } catch (e) { }
        }
        if (!games || !games.length) {
            if (tries < 100) { setTimeout(attempt, 400); return; }   // ~40s window for slow API
            showBanner('Your simulated pick (' + intent.pick_team + ' ML) is saved — the game board has not loaded it yet. Find the matchup below to place it. Picks are straight picks, submitted one at a time.', false);
            return;
        }
        armSubmitObserver();
        var idx = findGameIndex(games);
        if (idx === -1) {
            showBanner('Your simulated matchup (' + (intent.away_team_name || '') + ' @ ' + (intent.home_team_name || '') + ') is not on the current board — it may have started or moved. Choose any game below; nothing was submitted.', false);
            return;
        }
        var game = games[idx];
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
            showBanner('From your simulation: ' + intent.pick_team + ' ML is pre-selected. Set your units and confirm to lock it — nothing is submitted until you do. Straight pick only, not a parlay.', true);
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
