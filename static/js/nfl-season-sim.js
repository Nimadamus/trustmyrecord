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
      try { w = new Worker('/static/js/sim-season-worker.js?v=8734b28578b2'); } catch (e) { w = null; }
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

  var API = 'https://trustmyrecord-api.onrender.com/api/nfl/public/playoff-inputs?season=';
  function start() {
    var btn = document.getElementById('runSim');
    var status = document.getElementById('lsimStatus');
    var runs = document.getElementById('lsimRuns');
    if (!btn || !window.TMRNflSeason) return;
    var cached = null;
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
        var n = Number(runs && runs.value) || 2000;
        status.textContent = 'Playing ' + n.toLocaleString('en-US') + ' seasons';
        var seed = (Math.random() * 4294967295) >>> 0;
        runOff('nfl', { inputs: d, n: n, seed: seed }, function () {
          return window.TMRNflSeason.project(d, n, seed);
        }).then(function (result) {
          document.getElementById('lsimTables').innerHTML = window.TMRNflSeason.tables(result);
          document.getElementById('lsimStamp').innerHTML = window.TMRNflSeason.stamp(result, d);
          status.textContent = 'Done. Press again for a fresh set of seasons.';
          btn.disabled = false;
        });
      }).catch(function () {
        status.textContent = 'The live schedule did not load. The projection above is the latest published one.';
        btn.disabled = false;
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
