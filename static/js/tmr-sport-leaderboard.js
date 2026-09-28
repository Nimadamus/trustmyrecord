/* TMR sport-tracker leaderboard widget.
   Renders a live, sport-filtered verified leaderboard into any
   <div class="tmr-sport-lb" data-sport="mlb" data-label="MLB"></div>.
   data-sport accepts friendly aliases (mlb, nba, nfl, nhl, soccer). */
(function () {
  var API = (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function num(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  /* STATS_DRILLDOWN_SITEWIDE_20260927: each row opens the member's graded
     picks in this sport, through the same catalog rule the board counts with. */
  function ensureDrill() {
    if (window.TMRDrill || document.getElementById('tmr-drill-js')) return;
    var sc = document.createElement('script');
    sc.id = 'tmr-drill-js';
    sc.defer = true;
    sc.src = '/static/js/tmr-drill.js?v=98bfe9714d69';
    document.head.appendChild(sc);
  }
  function render(el, rows, label) {
    var sportId = String(el.getAttribute('data-sport') || '').toLowerCase();
    if (!rows.length) {
      el.innerHTML = '<div class="seo-card">No graded ' + esc(label) +
        ' picks on the board yet. <a href="/sportsbook/">Log the first verified ' + esc(label) +
        ' pick</a> and claim the top spot.</div>';
      return;
    }
    var h = '<div class="seo-board"><table><thead><tr>' +
      '<th>#</th><th>Member</th><th>Record</th><th>Units</th><th>ROI</th><th>Win%</th></tr></thead><tbody>';
    rows.forEach(function (u, i) {
      var pos = (Number(u.net_units) || 0) >= 0;
      var cls = pos ? 'pos' : 'neg';
      var units = (pos ? '+' : '') + num(u.net_units);
      var roi = ((Number(u.roi) || 0) >= 0 ? '+' : '') + (num(u.roi)) + '%';
      var rec = (u.wins || 0) + '-' + (u.losses || 0) + (u.pushes ? '-' + u.pushes : '');
      // CANONICAL_RANKING_20260914: the official sport rank from the API, or NR.
      // The row index is a position, never a rank.
      var official = Number(u.official_rank) > 0 ? '#' + Number(u.official_rank) : 'NR';
      h += '<tr data-drill-category="sport_filter" data-drill-bucket="' + esc(sportId) + '" data-drill-user="' + esc(u.username) + '"' +
        ' data-drill-label="' + esc((u.display_name || u.username) + ' · ' + label) + '" data-drill-context="' + esc(label + ' leaderboard') + '"' +
        ' data-drill-expect="' + esc((u.graded_picks || u.total_picks || '') + '|' + (u.wins || 0) + '-' + (u.losses || 0) + '-' + (u.pushes || 0) + '|' + (Number(u.net_units) || 0).toFixed(2)) + '"' +
        ' role="button" tabindex="0" style="cursor:pointer" title="Open every ' + esc(label) + ' pick behind this record">' +
        '<td title="' + esc(u.ranking_status || 'Not Ranked') + '">' + official + '</td>' +
        '<td><a href="/u/' + encodeURIComponent(u.username) + '/">' + esc(u.display_name || u.username) + '</a></td>' +
        '<td>' + rec + '</td>' +
        '<td class="' + cls + '">' + units + '</td>' +
        '<td class="' + cls + '">' + roi + '</td>' +
        '<td>' + num(u.win_rate) + '%</td></tr>';
    });
    h += '</tbody></table></div><p style="margin-top:10px"><a href="/handicappers/?sport=' + encodeURIComponent(label) +
      '">See the full verified ' + esc(label) + ' handicapper leaderboard &rarr;</a></p>';
    el.innerHTML = h;
    ensureDrill();
  }
  function load(el) {
    var sport = el.getAttribute('data-sport');
    var label = el.getAttribute('data-label') || sport;
    el.innerHTML = '<div class="seo-card">Loading the ' + esc(label) + ' leaderboard&hellip;</div>';
    fetch(API + '/users/leaderboard?sport=' + encodeURIComponent(sport) + '&sortBy=rank&limit=10&minPicks=1')
      .then(function (r) { return r.json(); })
      .then(function (d) { render(el, (d && d.leaderboard) || [], label); })
      .catch(function () {
        el.innerHTML = '<div class="seo-card">Leaderboard temporarily unavailable. <a href="/handicappers/?sport=' + encodeURIComponent(label) + '">View verified ' + esc(label) + ' handicappers.</a></div>';
      });
  }
  function init() {
    var nodes = document.querySelectorAll('.tmr-sport-lb');
    for (var i = 0; i < nodes.length; i++) load(nodes[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
