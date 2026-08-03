/**
 * MLB_SIM_HISTORY_20260803 - records a COMPLETED MLB Simulator run to the
 * public daily-consensus feed, and adds the one new link on the simulator page.
 *
 * ADDITIVE ONLY, and deliberately built the same way as
 * static/js/mlb-simulator-conversion.js so it inherits that file's safety
 * properties:
 *
 *   - Its own file, loaded `defer` at the very bottom of the page. It never
 *     touches static/js/mlb-simulator.js, and never modifies the simulator's
 *     own DOM, state, or rendering path.
 *   - It reacts to the simulator's own completion signal: #boxScorePanel's
 *     data-box-score-state attribute flipping to 'projected' (set by
 *     mlb-simulator.js renderBoxScore()). A run that errored, was abandoned, or
 *     never finished never sets that attribute, so it is never recorded.
 *   - The POST happens AFTER the result is already painted, and is
 *     fire-and-forget. Nothing here can make the simulator slower, and a failed
 *     or blocked request is silent - the visitor's simulation is unaffected.
 *   - window.SIMULATOR_FLAGS.publicHistory === false makes this whole file a
 *     no-op. The backend independently honours SIM_HISTORY_ENABLED=false.
 *
 * The only visible change it makes to the existing page is a single
 * "View All Simulations Today" link, appended to the result card's existing
 * .result-jump-actions row using the page's existing .sim-button styling.
 */
(function () {
  'use strict';

  var FLAGS = window.SIMULATOR_FLAGS || {};
  if (FLAGS.publicHistory === false) return;

  var ENDPOINT = '/mlb-sim-history';
  var SESSION_KEY = 'tmr_sim_session_id';
  var SLATE_TZ = 'America/Los_Angeles';
  var MAX_BATTERS = 12;
  var MAX_PITCHERS = 9;

  function qs(id) { return document.getElementById(id); }

  /* ---------------------------------------------------------------- */
  /* Anonymous session id.                                            */
  /* A random, purely local identifier so an anonymous visitor's runs  */
  /* can be de-duplicated for consensus without anything identifying   */
  /* being sent. The server only ever stores an HMAC of it.            */
  /* ---------------------------------------------------------------- */
  function sessionId() {
    try {
      var existing = window.localStorage.getItem(SESSION_KEY);
      if (existing && /^[a-z0-9-]{8,80}$/i.test(existing)) return existing;
      var fresh = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : ('s-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
      window.localStorage.setItem(SESSION_KEY, fresh);
      return fresh;
    } catch (e) {
      // Private mode / storage disabled: the run still records, it just falls
      // back to the server's IP-derived actor key for de-duplication.
      return null;
    }
  }

  /** Today's America/Los_Angeles calendar date - the slate day the visitor sees. */
  function slateDate() {
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: SLATE_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date());
      var get = function (t) { return (parts.find(function (p) { return p.type === t; }) || {}).value; };
      return get('year') + '-' + get('month') + '-' + get('day');
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function sim() { return window.TMRMlbSimulator || null; }
  function simState() { var s = sim(); return s && s.state ? s.state : null; }

  function api(path, opts) {
    if (window.api && typeof window.api.request === 'function') {
      return window.api.request(ENDPOINT + path, opts || {});
    }
    // config.js declares a page-scope `CONFIG` const (not a window property).
    var cfg = (typeof CONFIG !== 'undefined' && CONFIG) ? CONFIG : null;
    var base = (cfg && cfg.api && cfg.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api';
    var o = opts || {};
    return fetch(base + ENDPOINT + path, {
      method: o.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: o.body ? JSON.stringify(o.body) : undefined,
      keepalive: true
    }).then(function (r) { return r.json(); });
  }

  /* ---------------------------------------------------------------- */
  /* Payload construction - read-only over the simulator's own output  */
  /* ---------------------------------------------------------------- */

  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }

  function teamLine(line) {
    if (!line) return null;
    var s = line.summaryStats || {};
    return {
      runs: num(line.runs), hits: num(line.hits), errors: num(line.errors),
      innings: Array.isArray(line.innings) ? line.innings.slice(0, 20).map(num) : [],
      doubles: num(s.doubles), triples: num(s.triples), home_runs: num(s.homeRuns),
      total_bases: num(s.totalBases), rbi: num(s.rbi), walks: num(s.walks),
      strikeouts: num(s.strikeouts), left_on_base: num(s.leftOnBase),
      stolen_bases: num(s.stolenBases), risp: s.rispText || null
    };
  }

  function batterLine(b) {
    // The engine names the position field `rawPos` (`name` already carries a
    // "(POS)" suffix, `playerName` is the plain name).
    return {
      name: b.playerName || b.name || null, pos: b.rawPos || b.position || null,
      ab: num(b.ab), r: num(b.r), h: num(b.h), hr: num(b.hr), rbi: num(b.rbi),
      bb: num(b.bb), so: num(b.so), lob: num(b.lob)
    };
  }

  function pitcherLine(p) {
    return {
      name: p.name || p.playerName || null, ip: p.ip != null ? String(p.ip) : null,
      h: num(p.h), r: num(p.r), er: num(p.er), bb: num(p.bb), so: num(p.so),
      hr: num(p.hr), pitches: num(p.pc != null ? p.pc : p.pitches)
    };
  }

  function sideStats(side) {
    if (!side) return null;
    return {
      batters: (side.batters || []).slice(0, MAX_BATTERS).map(batterLine),
      pitchers: (side.pitchers || []).slice(0, MAX_PITCHERS).map(pitcherLine),
      roster_source: side.rosterSource || null,
      lineup_status: side.lineupStatus || null
    };
  }

  function lineupOf(side) {
    if (!side || !Array.isArray(side.batters)) return [];
    return side.batters.slice(0, 9).map(function (b, i) {
      return { order: i + 1, name: b.playerName || b.name || null, pos: b.rawPos || b.position || null };
    });
  }

  /**
   * Which scheduled game did this run's inputs come from? The simulator already
   * loaded today's schedule for lineups / probables / weather; reading the
   * gamePk back out is what lets a DOUBLEHEADER be recorded against the right
   * game instead of being guessed. The server re-validates it against the real
   * schedule and refuses a value that is not there.
   */
  function gamePkFor(result) {
    var st = simState();
    var games = st && st.liveContext && Array.isArray(st.liveContext.scheduleGames)
      ? st.liveContext.scheduleGames : [];
    for (var i = 0; i < games.length; i += 1) {
      var g = games[i];
      var a = g && g.teams && g.teams.away && g.teams.away.team && g.teams.away.team.name;
      var h = g && g.teams && g.teams.home && g.teams.home.team && g.teams.home.team.name;
      if (a === result.away.name && h === result.home.name) return g.gamePk || null;
    }
    return null;
  }

  /**
   * Materially-different-settings flags. These are what stop a custom-pitcher
   * or historical-pool run from being blended into the public default average
   * on the consensus pages.
   */
  function configFlags(result) {
    var st = simState() || {};
    var mode = (st.awayPool === 'historical' || st.homePool === 'historical') ? 'historical' : 'current';
    if (st.awayPool !== st.homePool) mode = 'mixed';
    var weather = st.simWeatherCondition || 'clear';
    return {
      mode: mode,
      historical: mode !== 'current',
      custom_pitcher: !!(st.awayPitcherTouched || st.homePitcherTouched),
      custom_weather: weather !== 'clear',
      custom_lineup: false,
      custom_other: false
    };
  }

  function buildPayload(result) {
    if (!result || !result.boxScore || !result.away || !result.home) return null;
    var box = result.boxScore;
    if (!box.away || !box.home) return null;

    var awayScore = num(box.away.runs);
    var homeScore = num(box.home.runs);
    if (awayScore === null || homeScore === null) return null;

    var status = String(box.gameStatus || 'final').toLowerCase();
    if (status !== 'suspended' && status !== 'official') status = 'final';

    var st = simState() || {};
    var weather = box.simWeather || null;

    return {
      run_uid: ('sim-' + String(box.runId || (Date.now() + '-' + Math.random().toString(36).slice(2))))
        .replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 80),
      game_date: slateDate(),
      game_pk: gamePkFor(result),
      away_abbr: result.away.abbreviation,
      home_abbr: result.home.abbreviation,
      away_team_name: result.away.name,
      home_team_name: result.home.name,
      away_score: awayScore,
      home_score: homeScore,
      sim_status: status,
      total_innings: num(box.totalInnings),
      extra_innings: !!box.extraInnings,
      sim_run_count: num(st.simulationCount) || 1,
      away_pitcher: (result.awayPitcher && result.awayPitcher.name) || null,
      home_pitcher: (result.homePitcher && result.homePitcher.name) || null,
      weather_key: weather ? weather.key : null,
      weather_label: weather ? weather.label : null,
      config_flags: configFlags(result),
      session_id: sessionId(),
      team_stats: {
        away: teamLine(box.away),
        home: teamLine(box.home),
        win_probability: { away: num(result.awayWin), home: num(result.homeWin) },
        expected_runs: { away: num(result.awayRuns), home: num(result.homeRuns) },
        total_range: result.totalRange || null,
        run_environment: result.runEnvironment || null,
        confidence: result.confidence || null,
        walk_off: !!box.walkOff
      },
      player_stats: {
        away: sideStats(box.players && box.players.away),
        home: sideStats(box.players && box.players.home)
      },
      lineups: {
        away: lineupOf(box.players && box.players.away),
        home: lineupOf(box.players && box.players.home)
      },
      settings: {
        mode: (simState() || {}).awayPool || 'current',
        data_mode: result.dataMode || null,
        simulation_mode: result.simulationMode || null,
        simulation_count: num(st.simulationCount) || 1,
        away_pitcher_id: st.awayPitcherId || null,
        home_pitcher_id: st.homePitcherId || null,
        weather: (st.simWeatherCondition || 'clear')
      }
    };
  }

  /* ---------------------------------------------------------------- */
  /* Recording                                                        */
  /* ---------------------------------------------------------------- */

  var recorded = Object.create(null);   // run_uid -> true; blocks a double submit

  function recordCompletedRun() {
    var s = sim();
    var result = s && s.state ? s.state.simulation : null;
    if (!result) return;                       // nothing completed - never record

    var payload;
    try { payload = buildPayload(result); } catch (e) { payload = null; }
    if (!payload) return;
    if (recorded[payload.run_uid]) return;     // same result rendered twice
    recorded[payload.run_uid] = true;

    api('/runs', { method: 'POST', body: payload }).catch(function () {
      // Recording is a nice-to-have. A network failure, an ad blocker, or the
      // feature being switched off must never surface to the visitor or leave
      // the page in a different state than before.
    });
  }

  /* ---------------------------------------------------------------- */
  /* The one added link                                               */
  /* ---------------------------------------------------------------- */

  var LINK_ID = 'simHistoryTodayLink';

  function addTodayLink() {
    if (qs(LINK_ID)) return;
    // The result card's existing action row. Appending here keeps the page's
    // layout and design system exactly as they are - no new section, no
    // rearrangement, one more button in a row that already holds one.
    var row = document.querySelector('#resultCard .result-jump-actions');
    if (!row) return;
    var link = document.createElement('a');
    link.id = LINK_ID;
    link.className = 'sim-button secondary compact-action';
    link.href = '/mlb-simulator/simulations/';
    link.textContent = 'View All Simulations Today';
    link.setAttribute('data-sim-history-link', '1');
    row.appendChild(link);
  }

  /* ---------------------------------------------------------------- */
  /* "Run This Matchup" deep link (?simAway=ATL&simHome=ARI)          */
  /* Inert unless both params are present, so the page behaves exactly */
  /* as it always has for every other visit.                           */
  /* ---------------------------------------------------------------- */

  function fire(el, type) { if (el) el.dispatchEvent(new Event(type, { bubbles: true })); }

  function teamIdForAbbr(abbr) {
    var st = simState();
    var pool = st && st.teams && Array.isArray(st.teams.current) ? st.teams.current : [];
    var match = pool.filter(function (t) { return t.abbreviation === abbr; })[0];
    return match ? match.id : null;
  }

  function applyDeepLink() {
    var params = new URLSearchParams(window.location.search);
    var away = String(params.get('simAway') || '').toUpperCase();
    var home = String(params.get('simHome') || '').toUpperCase();
    if (!/^[A-Z]{2,3}$/.test(away) || !/^[A-Z]{2,3}$/.test(home) || away === home) return;

    var attempts = 0;
    var timer = window.setInterval(function () {
      attempts += 1;
      var awayId = teamIdForAbbr(away);
      var homeId = teamIdForAbbr(home);
      var awaySel = qs('awayTeamSelect');
      var homeSel = qs('homeTeamSelect');
      if ((!awayId || !homeId || !awaySel || !homeSel) && attempts < 25) return;
      window.clearInterval(timer);
      if (!awayId || !homeId || !awaySel || !homeSel) return;

      // Drive the page exactly the way a visitor would: set the selects and
      // dispatch the same change events their clicks produce. No internal
      // simulator function is called and no internal state is written.
      awaySel.value = awayId; fire(awaySel, 'change');
      homeSel.value = homeId; fire(homeSel, 'change');
      window.setTimeout(function () {
        var run = qs('runSimulationButton');
        if (run) run.click();
      }, 350);
    }, 200);
  }

  /* ---------------------------------------------------------------- */

  function watchForResult() {
    var target = qs('boxScorePanel');
    if (!target) return;
    var obs = new MutationObserver(function () {
      if (target.getAttribute('data-box-score-state') !== 'projected') return;
      addTodayLink();
      // Let the result finish painting first; this must never compete with the
      // simulator's own rendering for the main thread.
      window.setTimeout(recordCompletedRun, 0);
    });
    obs.observe(target, { attributes: true, attributeFilter: ['data-box-score-state'] });
  }

  function init() {
    watchForResult();
    addTodayLink();
    applyDeepLink();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
