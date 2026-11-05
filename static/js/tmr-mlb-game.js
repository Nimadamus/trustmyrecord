/* MLB game simulator finish, runs after tmr-sim-broadcast.js. Reads the engine's
   state and never changes a run. Moves the share and Pro blocks below the box score,
   shows the tally for multi game runs, and gives phones a core box score. */
(function (global) {
  'use strict';
  var doc = global.document;
  var CORE = { BATTER: 1, PITCHER: 1, AB: 1, R: 1, H: 1, RBI: 1, BB: 1, SO: 1, K: 1, AVG: 1, IP: 1, ER: 1, ERA: 1, HR: 1 };
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }

  function tail() {
    var box = $('#boxScorePanel');
    if (!box) return null;
    var t = $('.bc-afterbox');
    if (!t) {
      t = doc.createElement('div');
      t.className = 'bc-afterbox';
      box.parentNode.insertBefore(t, box.nextSibling);
    }
    return t;
  }

  function settle() {
    var t = tail();
    if (!t) return;
    ['#simv2PickPanel', '.tmr-take-inline', '#tpfSimLine'].forEach(function (s) {
      var n = $(s);
      if (n && n.parentNode !== t) t.appendChild(n);
    });
  }

  function tally() {
    var api = global.TMRMlbSimulator;
    var a = api && api.state && api.state.aggregate;
    var band = $('.bc-mlb-odds');
    var old = $('.bc-tally');
    var want = a && a.count > 1 && band ? a.count + ' box scores played: ' : '';
    if (old && (!want || old.getAttribute('data-for') !== String(api.state.simulation && api.state.simulation.seed) + a.awayWins)) { old.remove(); old = null; }
    if (!want || old) return;
    var p = doc.createElement('p');
    p.className = 'bc-tally';
    p.setAttribute('data-for', String(api.state.simulation && api.state.simulation.seed) + a.awayWins);
    var b = doc.createElement('b');
    b.textContent = want;
    p.appendChild(b);
    p.appendChild(doc.createTextNode(a.away.abbreviation + ' ' + a.awayWins + ', ' + a.home.abbreviation + ' ' + a.homeWins +
      '. Average score ' + a.away.abbreviation + ' ' + a.awayAverageScore + ', ' + a.home.abbreviation + ' ' + a.homeAverageScore +
      '. The score above is the last one played.'));
    band.parentNode.insertBefore(p, band.nextSibling);
  }

  function coreTables() {
    $$('.player-box-table').forEach(function (tb) {
      if (tb.getAttribute('data-bc-core')) return;
      tb.setAttribute('data-bc-core', '1');
      var heads = $$('thead th', tb).map(function (h) { return h.textContent.trim().toUpperCase(); });
      if (heads.length < 8) return;
      var keep = heads.map(function (h, i) { return i === 0 || !!CORE[h]; });
      $$('tr', tb).forEach(function (row) {
        Array.prototype.forEach.call(row.cells, function (c, i) {
          if (!keep[i] && c.colSpan === 1) c.classList.add('bc-adv');
        });
      });
      var wrap = tb.closest('.player-table-wrap') || tb;
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'bc-statsbtn';
      b.textContent = 'All stats';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        var on = tb.classList.toggle('bc-all');
        b.textContent = on ? 'Core stats' : 'All stats';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      wrap.parentNode.insertBefore(b, wrap);
    });
  }

  function after() { settle(); tally(); coreTables(); }

  function boot() {
    var top = $('#topScoreboard');
    if (!top) return;
    /* Keyed to the scoreboard only: the blocks it moves are added late by other
       scripts, so it looks again shortly after each result. */
    var timers = [];
    function soon() {
      timers.forEach(global.clearTimeout);
      timers = [60, 500, 1500, 4000].map(function (ms) { return global.setTimeout(after, ms); });
    }
    new global.MutationObserver(soon).observe(top, { childList: true });
    soon();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
}(window));
