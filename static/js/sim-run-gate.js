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
        nfl_playoff: { label: 'NFL playoff', path: '/nfl-playoff-simulator/' },
        nfl_season: { label: 'NFL season', path: '/nfl-season-simulator/' },
        mlb_odds: { label: 'MLB playoff odds', path: '/mlb-playoff-odds/' },
        nba_season: { label: 'NBA season', path: '/nba-season-simulator/' },
        nba_playoff: { label: 'NBA playoff', path: '/nba-playoff-simulator/' },
        nhl_season: { label: 'NHL season', path: '/nhl-season-simulator/' },
        nhl_playoff: { label: 'NHL playoff', path: '/nhl-playoff-simulator/' }
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

    /* One button runs the whole simulation on these pages: guard it, the same
       way as the NFL playoff simulator. */
    if (sport === 'nfl_playoff' || sport === 'nfl_season' || sport === 'mlb_odds' || /^(nba|nhl)_(season|playoff)$/.test(sport)) {
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
        /* VALIDATE BEFORE GATING. With no teams chosen the gate used to open
           first and describe the run as "Choose a team at Choose a team". An
           incomplete or same team pick goes straight to the page's own check,
           which says "Pick two teams first" and makes no request. */
        try {
            var t = self.currentTeams ? self.currentTeams() : null;
            if (!t || !t.away || !t.home || t.away.ref === t.home.ref) return run.apply(self, args);
        } catch (e) { /* fall through to the gate as before */ }
        /* A what-if on the result already on screen (same seed, a player held
           out or a minutes cap changed) only needs the account. Any other seed,
           e.g. one carried in from a shared link, is a new run and is metered.
           ANON_RUN_SETTLE_20261030: both kinds report how the run ended, so the
           anonymous free run is spent only on a result and given back on a
           failure. */
        var shownSeed = self.lastResult && self.lastResult.meta ? self.lastResult.meta.seed : null;
        var whatIf = !!(opts && opts.seed && shownSeed != null && String(opts.seed) === String(shownSeed));
        var go = whatIf ? Promise.resolve(G.requireAuth({ sim_mode: 'rerun' }))
                        : G.authorizeRun({ sim_mode: opts && opts.fresh ? 'run' : 'again' });
        go.then(function (ok) {
            if (!ok) return;
            /* SIM_RUN_SETTLE_20261005: charged only when a NEW result lands. */
            var before = self.lastResult;
            run.apply(self, args);
            waitFor(function () { return !self.running; }, function () {
                if (self.lastResult && self.lastResult !== before) { if (G.runSucceeded) G.runSucceeded(); }
                else if (G.runFailed) G.runFailed('no result');
            }, 180000);
        });
    };

    /* SIM_TAKE_SIDES_NBA_NHL_20261101: the same post-result "Take the {team}"
       buttons NFL and MLB have. One tap writes tmr_sim_pick_intent and opens
       /sportsbook/?simpick=1 (sim-pick-prefill.js pre-selects the moneyline).
       Nothing here submits a pick. Any failure leaves the result untouched. */
    var SPORT_CODE = { nba: 'NBA', nhl: 'NHL' }[sport];
    function takeLabel(t) {
        var nick = t.common || t.nickname || String(t.name || '').trim().split(/\s+/).pop();
        return nick ? 'Take the ' + nick : 'Take this side';
    }
    function goPick(t, m) {
        try {
            localStorage.setItem('tmr_sim_pick_intent', JSON.stringify({
                v: 1, ts: Date.now(), pick_team: t.name,
                away_team_name: m.away.name, home_team_name: m.home.name,
                board_game_id: null, sport: SPORT_CODE, source: sport + '-simulator'
            }));
        } catch (e) { }
        try { G.track('simulator_pick_started', { simulation_type: sport + '_game', pick_team: t.name }); } catch (e) { }
        window.location.href = '/sportsbook/?simpick=1';
    }
    function renderTakePanel(box, d) {
        var m = d && d.matchup;
        if (!SPORT_CODE || !box || !m || !m.away || !m.home || !m.away.name || !m.home.name) return;
        if (!d.projection || !d.projection.win_probability) return;
        if (box.querySelector('#simConvertPanel')) return;
        var panel = document.createElement('div');
        panel.className = 'panel';
        panel.id = 'simConvertPanel';
        panel.style.cssText = 'margin-top:12px;border:1px solid rgba(29,127,232,.35);background:linear-gradient(180deg,rgba(29,127,232,.07),transparent)';
        panel.innerHTML = '<h3 style="margin:0 0 6px">Take a side on TMR</h3>'
            + '<p class="dim" style="font-size:.9rem;margin:0 0 12px">The sim is research. Tap a team and the sportsbook opens that moneyline. Confirm there to put it on your public record.</p>';
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px';
        [m.away, m.home].forEach(function (t) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn';
            b.setAttribute('data-sim-take-team', t.name);
            b.textContent = takeLabel(t);
            b.onclick = function () { goPick(t, m); };
            row.appendChild(b);
        });
        panel.appendChild(row);
        /* MY_SIMS_20261101: a signed-in run is saved to the member's account and
           graded against the real final on /my-sims/. Give them the reason to come back. */
        var signedIn = false;
        try { signedIn = !!(localStorage.getItem('trustmyrecord_token') || localStorage.getItem('tmr_token') || localStorage.getItem('accessToken')); } catch (e) { }
        if (signedIn) {
            var back = document.createElement('p');
            back.className = 'dim';
            back.style.cssText = 'font-size:.88rem;margin:12px 0 0';
            back.appendChild(document.createTextNode('This run is saved to your account. After the game, see how it did: '));
            var a = document.createElement('a');
            a.href = '/my-sims/?src=postrun_' + sport;
            a.textContent = 'My sims vs real results';
            a.style.fontWeight = '700';
            back.appendChild(a);
            panel.appendChild(back);
        }
        var hero = null;
        for (var i = 0; i < box.children.length; i++) {
            if (box.children[i].classList && box.children[i].classList.contains('mh')) { hero = box.children[i]; break; }
        }
        if (hero) box.insertBefore(panel, hero.nextSibling);
        else box.appendChild(panel);
    }
    /* NEXT_GAMES_20261101: 74 of 174 members who ran a sim (60 day cohort to 11/01) ran
       exactly one. The result used to end at the box score; the slate sat above it. This
       puts the rest of tonight's upcoming games right under the result. Each button is the
       same slate card the page already has (same gate, same meter), just within reach. */
    function renderNextGames(appRef, d) {
        var box = appRef && appRef.nodes && appRef.nodes.result;
        var slate = appRef && appRef.slate;
        var m = d && d.matchup;
        if (!box || !slate || !slate.games || !m || !m.away || !m.home) return;
        var old = box.querySelector('#simNextGames');
        if (old) old.parentNode.removeChild(old);
        var cur = (m.away.name || '') + '@' + (m.home.name || '');
        var games = slate.games.filter(function (g) {
            return g && g.away && g.home && g.state !== 'post' && g.state !== 'in' && (g.away.name + '@' + g.home.name) !== cur;
        }).slice(0, 4);
        if (!games.length) return;
        var cards = appRef.nodes.games ? appRef.nodes.games.querySelectorAll('.game') : [];
        var panel = document.createElement('div');
        panel.className = 'panel';
        panel.id = 'simNextGames';
        panel.style.cssText = 'margin-top:12px';
        var h = document.createElement('h3');
        h.style.cssText = 'margin:0 0 4px';
        h.textContent = 'Simulate the next game';
        panel.appendChild(h);
        var p = document.createElement('p');
        p.className = 'dim';
        p.style.cssText = 'font-size:.9rem;margin:0 0 12px';
        p.textContent = 'More ' + SPORT_CODE + ' games on this slate:';
        panel.appendChild(p);
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
        games.forEach(function (g) {
            var label = 'Simulate ' + g.away.name + ' at ' + g.home.name;
            var card = null;
            for (var i = 0; i < cards.length; i++) if (cards[i].getAttribute('aria-label') === label) { card = cards[i]; break; }
            if (!card) return;
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn ghost';
            b.style.cssText = 'min-height:44px';
            b.textContent = (g.away.abbr || g.away.name) + ' at ' + (g.home.abbr || g.home.name);
            b.onclick = function () {
                try { G.track('simulator_next_game_clicked', { simulator: sport }); } catch (e) { }
                card.click();
            };
            row.appendChild(b);
        });
        if (!row.children.length) return;
        panel.appendChild(row);
        var take = box.querySelector('#simConvertPanel');
        if (take && take.nextSibling) box.insertBefore(panel, take.nextSibling);
        else if (take) box.appendChild(panel);
        else box.appendChild(panel);
        try { G.track('simulator_next_game_shown', { simulator: sport, games: row.children.length }); } catch (e) { }
    }
    if (SPORT_CODE && S.SimApp.prototype.render) {
        var render = S.SimApp.prototype.render;
        S.SimApp.prototype.render = function (d) {
            var r = render.apply(this, arguments);
            try { renderTakePanel(this.nodes && this.nodes.result, d); } catch (e) { }
            try { renderNextGames(this, d); } catch (e) { }
            return r;
        };
    }

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
            /* An empty value is the placeholder option, not a team. */
            var name = function (sel) {
                if (!sel.value) return '';
                var o = sel.options[sel.selectedIndex];
                return o ? o.text : '';
            };
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
