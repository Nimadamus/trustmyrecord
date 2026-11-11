/* NFL_SEASON_SIM_20260915 -- the Run button on /nfl-season-simulator/. Reads the
   live inputs, plays the seasons with nfl-season-project.js and redraws the same
   tables the page was baked with. */
(function () {
  'use strict';
  /* Off the main thread when the browser allows it; the same engine on the
     main thread otherwise, so the button always works. */
  function runOff(kind, payload, fallback) {
    return new Promise(function (resolve, reject) {
      var w;
      try { w = new Worker('/static/js/sim-season-worker.js?v=1be26a48b7bd'); } catch (e) { w = null; }
      if (!w) { try { resolve(fallback()); } catch (err) { reject(err); } return; }
      var done = false;
      w.onmessage = function (e) {
        done = true; w.terminate();
        if (e.data && e.data.ok) resolve(e.data.result);
        else { try { resolve(fallback()); } catch (err) { reject(err); } }
      };
      w.onerror = function () {
        if (done) return; done = true; w.terminate();
        try { resolve(fallback()); } catch (err) { reject(err); }
      };
      payload.kind = kind;
      w.postMessage(payload);
    });
  }


  /* SIM_RESULT_KEEP_20261111. A finished run used to vanish on reload, and on a
     phone the result landed below the fold with nothing to say so. The result a
     visitor just produced is kept for this tab (sessionStorage, twelve hours)
     and put back when the page loads again, and the page scrolls to a fresh
     result when it is out of view. Nothing is re-run and no run is counted. */
  var KEEP_MS = 12 * 60 * 60 * 1000;
  function keepKey() { return 'tmr-sim-keep:' + location.pathname; }
  function keepSave(ids, statusText) {
    try {
      var parts = {};
      ids.forEach(function (id) { var n = document.getElementById(id); if (n) parts[id] = n.innerHTML; });
      sessionStorage.setItem(keepKey(), JSON.stringify({ at: Date.now(), parts: parts, status: statusText || '' }));
    } catch (e) { /* storage full or blocked: the result simply is not kept */ }
  }
  function keepRestore(statusNode) {
    try {
      var raw = sessionStorage.getItem(keepKey());
      if (!raw) return false;
      var k = JSON.parse(raw);
      if (!k || !k.parts || Date.now() - k.at > KEEP_MS) { sessionStorage.removeItem(keepKey()); return false; }
      var any = false;
      Object.keys(k.parts).forEach(function (id) { var n = document.getElementById(id); if (n) { n.innerHTML = k.parts[id]; any = true; } });
      if (any && statusNode) {
        var t = new Date(k.at);
        var hh = t.getHours() % 12 || 12, mm = ('0' + t.getMinutes()).slice(-2);
        statusNode.textContent = 'Showing your run from ' + hh + ':' + mm + (t.getHours() < 12 ? ' AM' : ' PM') + '. Press again for a fresh set of seasons.';
      }
      return any;
    } catch (e) { return false; }
  }
  function keepReveal(id) {
    try {
      var n = document.getElementById(id);
      if (!n || !n.getBoundingClientRect) return;
      var r = n.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      if (r.top < 0 || r.top > vh * 0.6) {
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        n.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
    } catch (e) { /* no scroll */ }
  }

  var API = 'https://api.trustmyrecord.com/api/nfl/public/playoff-inputs?season=';
  function start() {
    var btn = document.getElementById('runSim');
    var status = document.getElementById('lsimStatus');
    var runs = document.getElementById('lsimRuns');
    if (!btn || !window.TMRNflSeason) return;
    var cached = null;
    keepRestore(status);
    /* SIM_RUN_SETTLE_20261005: the TMR meter charges a run only when it finishes. */
    function settle(ok, why) {
      var G = window.TMRSimGate;
      if (!G) return;
      if (ok) { if (G.runSucceeded) G.runSucceeded(); } else if (G.runFailed) G.runFailed(why);
    }
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      btn.disabled = true;
      status.textContent = 'Reading the latest schedule and results';
      var now = new Date();
      var season = now.getUTCMonth() <= 1 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
      (cached ? Promise.resolve(cached) : fetch(API + season, { credentials: 'omit' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })).then(function (d) {
        cached = d;
        var n = Number(runs && runs.value) || 10000;   // SIM_DEFAULT_20261006: matches the published 10,000-season tables
        status.textContent = 'Playing ' + n.toLocaleString('en-US') + ' seasons';
        var seed = (Math.random() * 4294967295) >>> 0;
        /* returned, so a simulation that throws reaches the catch below and is
           settled as failed (ANON_RUN_SETTLE_20261030) */
        /* NFL_SEASON_PICKS_20261030: the visitor's picks, matched to the live games by matchup,
           are locked in for every season of this run. */
        var picks = window.TMRNflSeasonPicks ? window.TMRNflSeasonPicks.current(d.games) : {};
        return runOff('nfl', { inputs: d, n: n, seed: seed, opts: { picks: picks } }, function () {
          return window.TMRNflSeason.project(d, n, seed, { picks: picks });
        }).then(function (result) {
          document.getElementById('lsimTables').innerHTML = window.TMRNflSeason.tables(result);
          document.getElementById('lsimStamp').innerHTML = window.TMRNflSeason.stamp(result, d);
          status.textContent = 'Done' + (result.picked ? ', with your ' + result.picked + (result.picked === 1 ? ' pick' : ' picks') + ' locked in' : '') + '. Press again for a fresh set of seasons.';
          btn.disabled = false;
          settle(true);
          keepSave(['lsimTables', 'lsimStamp'], status.textContent);
          keepReveal('lsimTables');
        });
      }).catch(function () {
        status.textContent = 'The live schedule did not load. The projection above is the latest published one.';
        btn.disabled = false;
        settle(false, 'schedule or simulation failed');
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
