/* NFL_SEASON_SIM_20260915 -- the Run button on /nfl-season-simulator/. Reads the
   live inputs, plays the seasons with nfl-season-project.js and redraws the same
   tables the page was baked with. */
(function () {
  'use strict';
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
        setTimeout(function () {
          var result = window.TMRNflSeason.project(d, n, (Math.random() * 4294967295) >>> 0);
          document.getElementById('lsimTables').innerHTML = window.TMRNflSeason.tables(result);
          document.getElementById('lsimStamp').innerHTML = window.TMRNflSeason.stamp(result, d);
          status.textContent = 'Done. Press again for a fresh set of seasons.';
          btn.disabled = false;
        }, 30);
      }).catch(function () {
        status.textContent = 'The live schedule did not load. The projection above is the latest published one.';
        btn.disabled = false;
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
