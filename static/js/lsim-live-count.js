/* LSIM_LIVE_COUNT_20261127. The standings are a bake. This asks the live
   schedule how many regular season games are final and, when that count
   differs, says so under the bake stamp. It does not rebuild the table. */
(function () {
  'use strict';
  var el = document.getElementById('lsimStamp');
  if (!el || !window.fetch) return;
  var path = location.pathname;
  var sport = /\/nba-/.test(path) ? 'nba' : /\/nhl-/.test(path) ? 'nhl' : /\/nfl-/.test(path) ? 'nfl' : '';
  if (!sport) return;
  var url = sport === 'nfl'
    ? 'https://api.trustmyrecord.com/api/nfl/public/schedule?season=2026'
    : 'https://api.trustmyrecord.com/api/' + sport + '/public/season-inputs';
  function finalsOf(j) {
    var games = (j && (j.games || j.schedule)) || [];
    var total = games.length, finals = 0;
    for (var i = 0; i < games.length; i++) {
      var g = games[i] || {};
      var s = String(g.status || g.game_status || '').toLowerCase();
      if (g.final === true || s === 'final' || s === 'completed' || s === 'closed' || s === 'status_final') finals++;
    }
    return { finals: finals, total: total };
  }
  fetch(url, { credentials: 'omit', cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (j) {
    var c = finalsOf(j);
    var m = (el.textContent || '').match(/([\d,]+) of (?:the )?([\d,]+)/);
    if (!m || !c.total) return;
    var baked = Number(m[1].replace(/,/g, ''));
    var bakedTotal = Number(m[2].replace(/,/g, ''));
    if (c.total !== bakedTotal) return;
    if (c.finals === baked) { el.setAttribute('data-live-count', 'match'); return; }
    var when = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    var note = document.createElement('span');
    note.setAttribute('data-live-count', 'diff');
    note.textContent = ' Live schedule checked ' + when + ' PT: ' + c.finals.toLocaleString('en-US') + ' of ' + c.total.toLocaleString('en-US') + ' regular season games are final. The standings above were built when ' + m[1] + ' were final.';
    el.appendChild(note);
  }).catch(function () { el.setAttribute('data-live-count', 'unavailable'); });
})();
