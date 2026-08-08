/* =============================================================================
   SPORTSBOOK IN-SEASON DEFAULT BOARD              SB_DEFAULT_BOARD_20260808
   -----------------------------------------------------------------------------
   THE BUG THIS FIXES

   /sportsbook/ opens on a board hardcoded to NBA:

       <button class="sportsbook-rail-board is-active" data-sport="NBA" ...>
       <div id="lobbyBoardRows" ... data-sport="NBA">

   In August the NBA has no games, so anyone arriving directly at the
   sportsbook - and in particular a member who just signed up through the
   simulator gate to make their first pick - lands on an EMPTY board with
   nothing to click, and has to work out for themselves that a different sport
   tab has the games. To that person the sportsbook is simply broken.

   The `?simpick=1` path was masking it, because sim-pick-prefill.js selects
   the intent's sport itself. Every other route in was stranded.

   WHAT THIS DOES

   On the sportsbook lobby, if the board that is about to be shown has no
   games, pick the first sport that DOES, and select it through the page's own
   window.TMR.setSport - the identical call the visible tab makes. Nothing here
   renders a board, fetches odds into the slip, or submits anything; it clicks
   a tab the user would otherwise have had to find.

   RULES IT KEEPS

   * An explicit choice always wins. If the visitor (or a previous visit) chose
     a sport, that is honoured even if it is empty today - being sent somewhere
     you did not ask for is worse than an empty board you did.
   * ?simpick=1 is left completely alone. That flow owns the sport.
   * It runs once per page load, never re-selects behind the user, and stops at
     the first sport with games so the common case costs ONE request.
   * Everything is wrapped: if the probe fails, the page is exactly as it was.

   Kill switch: window.SB_DEFAULT_BOARD_FLAGS = { enabled:false }.
   ============================================================================= */
(function () {
    'use strict';

    var FLAGS = window.SB_DEFAULT_BOARD_FLAGS || {};
    if (FLAGS.enabled === false) return;

    var REMEMBER_KEY = 'tmr_sb_last_sport';
    // Tried in order; the first with games wins. Roughly the order a US sports
    // bettor would expect to see them, not alphabetical.
    var PRIORITY = ['MLB', 'NFL', 'NBA', 'NHL', 'NCAAF', 'NCAAB', 'WNBA', 'NPB', 'Soccer'];
    var MAX_WAIT_MS = 25000;

    function log() { /* intentionally silent in production */ }

    function apiBase() {
        try { return (window.CONFIG && CONFIG.api && CONFIG.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api'; }
        catch (e) { return 'https://trustmyrecord-api.onrender.com/api'; }
    }

    function remembered() {
        try { return localStorage.getItem(REMEMBER_KEY) || null; } catch (e) { return null; }
    }
    function remember(sport) {
        try { if (sport) localStorage.setItem(REMEMBER_KEY, sport); } catch (e) { }
    }

    function ready() {
        return !!(window.TMR && typeof window.TMR.setSport === 'function' && window.TMR.sportKeyMap);
    }

    function currentGameCount() {
        try { return (window.TMR.currentGames && window.TMR.currentGames.length) || 0; }
        catch (e) { return 0; }
    }

    /* How many pickable (not yet started) games a sport has right now. Uses the
       same board endpoint the page uses, so a sport that looks empty here looks
       empty on the board too. */
    function countFor(sport) {
        var key = window.TMR.sportKeyMap[sport];
        if (!key) return Promise.resolve(0);
        return fetch(apiBase() + '/games/board/' + encodeURIComponent(key), { headers: { Accept: 'application/json' } })
            .then(function (r) { return r.ok ? r.json() : { games: [] }; })
            .then(function (d) {
                var games = (d && d.games) || [];
                var now = Date.now();
                var pickable = games.filter(function (g) {
                    if (!g || g.completed) return false;
                    if (!g.commence_time) return true;
                    var ms = Date.parse(g.commence_time);
                    return !isFinite(ms) ? true : ms > now;
                });
                return pickable.length;
            })
            .catch(function () { return 0; });
    }

    /* Walks PRIORITY in order and resolves the first sport with games. Sequential
       on purpose: in season the first probe hits and we make exactly one call. */
    function firstSportWithGames(list, i) {
        i = i || 0;
        if (i >= list.length) return Promise.resolve(null);
        return countFor(list[i]).then(function (n) {
            if (n > 0) return list[i];
            return firstSportWithGames(list, i + 1);
        });
    }

    // Set while WE synthesise a click, so the remember-listener below does not
    // mistake our fallback for the visitor choosing that sport. Without this the
    // in-season default becomes sticky: default to MLB in August, and the same
    // member gets sent to an empty MLB board in December because we "remembered"
    // a choice they never made.
    var autoSelecting = false;

    function selectSport(sport) {
        autoSelecting = true;
        try {
            var btn = document.querySelector('.sportsbook-rail-board[data-sport="' + sport + '"]');
            if (btn) { btn.click(); return true; }          // exactly what a user click does
            if (typeof window.TMR.setSport === 'function') { window.TMR.setSport(sport); return true; }
        } catch (e) {
        } finally {
            setTimeout(function () { autoSelecting = false; }, 0);
        }
        return false;
    }

    /* Remember any sport the visitor picks themselves, so the next visit and a
       refresh both land where they left off instead of being re-defaulted. */
    function rememberUserChoices() {
        document.addEventListener('click', function (e) {
            if (autoSelecting) return;                     // our own fallback, not a choice
            var t = e.target;
            if (!t || !t.closest) return;
            var btn = t.closest('.sportsbook-rail-board[data-sport], .sportsbook-sport-tab');
            if (!btn) return;
            var sport = btn.getAttribute('data-sport');
            if (!sport) {
                var m = /selectSportAndShowGames\('([^']+)'\)/.exec(btn.getAttribute('onclick') || '');
                sport = m ? m[1] : null;
            }
            if (sport) remember(sport);
        }, true);
    }

    /* The activation service stores simulator names lowercase ('mlb', 'nfl');
       the sportsbook's sportKeyMap and its rail buttons are uppercase ('MLB',
       'NFL'). Without this the remembered sport silently fails every lookup and
       the member falls through to the in-season default - which is exactly the
       bug this feature exists to fix, so it would have looked like it worked. */
    function toBoardSport(name) {
        if (!name) return null;
        var want = String(name).toLowerCase();
        try {
            var keys = Object.keys(window.TMR.sportKeyMap || {});
            for (var i = 0; i < keys.length; i++) {
                if (keys[i].toLowerCase() === want) return keys[i];
            }
        } catch (e) { }
        return null;
    }

    /* The member's remembered simulator sport, from their ACCOUNT. Server-side
       so it follows them between devices, and only ever updated by a completed
       simulation - never by an incidental tab click. Resolves to null for a
       logged-out visitor or any failure, which falls through to the in-season
       probe below. */
    function accountSport() {
        try {
            if (!window.api || typeof window.api.request !== 'function') return Promise.resolve(null);
            if (typeof window.api.isLoggedIn !== 'function' || !window.api.isLoggedIn()) return Promise.resolve(null);
            return window.api.request('/activation/my-sport')
                .then(function (r) { return toBoardSport(r && r.sport); })
                .catch(function () { return null; });
        } catch (e) { return Promise.resolve(null); }
    }

    function run() {
        // The simulator handoff owns the sport on this load.
        try {
            if (new URLSearchParams(window.location.search).get('simpick') === '1') return;
        } catch (e) { }

        rememberUserChoices();

        var saved = remembered();
        if (saved) {
            // An explicit past choice on THIS device wins, even if empty today.
            if (saved !== (window.TMR.selectedSport || null)) selectSport(saved);
            return;
        }

        // Give whatever the page does on its own a chance first; only step in
        // if the board it settled on is genuinely empty.
        setTimeout(function () {
            if (currentGameCount() > 0) return;

            // Resolution order, most specific first:
            //   1. ?simpick=1 intent            (returned above)
            //   2. an explicit choice on this device (returned above)
            //   3. the member's remembered simulator sport, from their account
            //   4. the first sport that actually has games
            accountSport().then(function (mine) {
                if (currentGameCount() > 0) return;
                if (mine) {
                    return countFor(mine).then(function (n) {
                        // Honour their sport when it has games; if their league is
                        // out of season, fall through rather than showing them an
                        // empty board in the name of a preference.
                        if (n > 0) { selectSport(mine); return null; }
                        return firstSportWithGames(PRIORITY);
                    });
                }
                return firstSportWithGames(PRIORITY);
            }).then(function (sport) {
                if (!sport) return;                        // handled, or nothing in season anywhere
                if (currentGameCount() > 0) return;        // it filled in while we were probing
                selectSport(sport);
                log('defaulted board to ' + sport);
            }).catch(function () { });
        }, 2500);
    }

    function boot(waited) {
        waited = waited || 0;
        if (ready()) { try { run(); } catch (e) { } return; }
        if (waited >= MAX_WAIT_MS) return;
        setTimeout(function () { boot(waited + 250); }, 250);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(0); });
    else boot(0);
})();
