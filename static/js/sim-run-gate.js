/* =============================================================================
   SIM RUN GATE ADAPTER (sim-run-gate.js)                 SIM_RUN_METER_20260914
   -----------------------------------------------------------------------------
   Puts the NBA, NHL and NFL Playoff simulators behind the same rules as MLB and
   NFL: an account to run, one free run per simulator per day, then TMR per run
   (static/js/sim-auth-gate.js does the deciding). The page stays fully public
   and crawlable; only starting a run is gated.

   Load with defer, AFTER sim-auth-gate.js and, for NBA/NHL, after
   tmr-sim-core.js and BEFORE the sport's app script:
     <script defer src="/static/js/sim-run-gate.js" data-sport="nba"></script>

   NBA / NHL: SimApp.prototype.run is wrapped. A run with no seed is a new draw
   (Run simulation, a game card, Run again) and is metered. A run that carries
   the last result's seed is the same simulation with a player held out or a
   minutes cap changed, so it only needs the account.
   NFL Playoff: the #runSim button is guarded; the bracket picks already persist
   in localStorage, so they survive the signup round trip on their own.
   ============================================================================= */
(function () {
    'use strict';

    var script = document.currentScript;
    var sport = script && script.getAttribute('data-sport');
    var G = window.TMRSimGate;
    if (!G || !sport) return;

    var PAGES = {
        nba: { label: 'NBA matchup', path: '/nba-simulator/', global: 'TMRNbaSim' },
        nhl: { label: 'NHL matchup', path: '/nhl-simulator/', global: 'TMRNhlSim' },
        nfl_playoff: { label: 'NFL playoff', path: '/nfl-playoff-simulator/' }
    };
    var page = PAGES[sport];
    if (!page) return;

    function waitFor(test, fn, ms) {
        var until = Date.now() + (ms || 20000);
        (function poll() {
            var v = null;
            try { v = test(); } catch (e) { v = null; }
            if (v) { fn(v); return; }
            if (Date.now() < until) setTimeout(poll, 150);
        })();
    }

    if (sport === 'nfl_playoff') {
        G.register({
            simulator: sport,
            label: page.label,
            returnPath: page.path,
            runSelectors: ['#runSim'],
            runControlSelectors: ['#runSim'],
            captureState: function () { return {}; },
            runNow: function () {
                waitFor(function () { var b = document.getElementById('runSim'); return b && !b.disabled ? b : null; },
                        function (b) { b.click(); });
            }
        });
        return;
    }

    var S = window.TMRSim;
    if (!S || !S.SimApp || !S.SimApp.prototype.run) return;

    var run = S.SimApp.prototype.run;
    S.SimApp.prototype.run = function (opts) {
        var self = this;
        var args = arguments;
        if (self.running) return run.apply(self, args);
        if (opts && opts.seed) {
            if (!G.requireAuth({ sim_mode: 'rerun' })) return;
            return run.apply(self, args);
        }
        G.authorizeRun({ sim_mode: opts && opts.fresh ? 'run' : 'again' }).then(function (go) {
            if (go) run.apply(self, args);
        });
    };

    function app() { return window[page.global] || null; }

    G.register({
        simulator: sport,
        label: page.label,
        returnPath: page.path,
        runSelectors: [],
        runControlSelectors: ['#runBtn'],
        captureState: function () {
            var a = app();
            if (!a || !a.nodes) return {};
            return {
                away: a.nodes.away && a.nodes.away.value,
                home: a.nodes.home && a.nodes.home.value,
                venue: a.state && a.state.venue
            };
        },
        describeState: function () {
            var a = app();
            if (!a || !a.nodes || !a.nodes.away || !a.nodes.home) return '';
            var name = function (sel) { var o = sel.options[sel.selectedIndex]; return o ? o.text : ''; };
            var away = name(a.nodes.away), home = name(a.nodes.home);
            return away && home ? '<b>' + S.esc(away) + '</b> at <b>' + S.esc(home) + '</b>' : '';
        },
        restoreState: function (st) {
            return new Promise(function (resolve) {
                waitFor(function () {
                    var a = app();
                    return a && a.nodes && a.nodes.away && a.nodes.away.options.length > 1 ? a : null;
                }, function (a) {
                    if (st && st.away) { a.nodes.away.value = st.away; if (a.state) a.state.away = st.away; }
                    if (st && st.home) { a.nodes.home.value = st.home; if (a.state) a.state.home = st.home; }
                    if (st && st.venue && a.state) a.state.venue = st.venue;
                    resolve();
                });
            });
        },
        runNow: function () {
            waitFor(function () {
                var a = app();
                return a && a.nodes && a.nodes.away && a.nodes.away.options.length > 1 ? a : null;
            }, function (a) { a.run({ fresh: true }); });
        }
    });
})();
