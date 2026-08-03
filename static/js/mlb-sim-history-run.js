/**
 * MLB_SIM_HISTORY_20260803 - full detail for one recorded simulation.
 * /mlb-simulator/simulations/run/?id=<id>
 *
 * Shows exactly what the simulator produced for that run: final line score,
 * team stat lines, batter and pitcher lines, the lineups used, the starters,
 * the weather/park setting and any custom settings. Nothing identifying about
 * whoever ran it is available from the API, so nothing identifying is shown.
 */
(function () {
  'use strict';

  var ENDPOINT = '/mlb-sim-history';

  function qs(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function cell(v) { return (v === null || v === undefined || v === '') ? '—' : esc(v); }

  function api(path) {
    if (window.api && typeof window.api.request === 'function') {
      return window.api.request(ENDPOINT + path, { method: 'GET' });
    }
    var cfg = (typeof CONFIG !== 'undefined' && CONFIG) ? CONFIG : null;
    var base = (cfg && cfg.api && cfg.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api';
    return fetch(base + ENDPOINT + path, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); });
  }

  var CONFIG_LABEL = {
    'default': 'Default settings',
    custom_lineup: 'Custom lineup',
    custom_pitcher: 'Custom starting pitcher',
    custom_weather: 'Custom weather',
    custom_other: 'Custom setup',
    historical: 'Historical teams'
  };

  function teamStatCard(label, line) {
    if (!line) return '';
    return '<div class="sh-split-card"><h3>' + esc(label) + '</h3>' +
      '<div class="sh-kv"><span>Runs / Hits / Errors</span><b>' + cell(line.runs) + ' / ' + cell(line.hits) + ' / ' + cell(line.errors) + '</b></div>' +
      '<div class="sh-kv"><span>Home runs</span><b>' + cell(line.home_runs) + '</b></div>' +
      '<div class="sh-kv"><span>Total bases</span><b>' + cell(line.total_bases) + '</b></div>' +
      '<div class="sh-kv"><span>Walks / Strikeouts</span><b>' + cell(line.walks) + ' / ' + cell(line.strikeouts) + '</b></div>' +
      '<div class="sh-kv"><span>Left on base</span><b>' + cell(line.left_on_base) + '</b></div>' +
      (line.risp ? '<div class="sh-kv"><span>With runners in scoring position</span><b>' + esc(line.risp) + '</b></div>' : '') +
      '</div>';
  }

  function battersTable(label, side) {
    if (!side || !side.batters || !side.batters.length) return '';
    var rows = side.batters.map(function (b) {
      return '<tr><td>' + cell(b.name) + '</td><td>' + cell(b.pos) + '</td><td>' + cell(b.ab) + '</td><td>' + cell(b.r) +
        '</td><td>' + cell(b.h) + '</td><td>' + cell(b.hr) + '</td><td>' + cell(b.rbi) + '</td><td>' + cell(b.bb) +
        '</td><td>' + cell(b.so) + '</td></tr>';
    }).join('');
    return '<div class="sh-scroll"><table class="sh-table"><caption>' + esc(label) + ' batting</caption>' +
      '<thead><tr><th scope="col">Batter</th><th scope="col">Pos</th><th scope="col">AB</th><th scope="col">R</th>' +
      '<th scope="col">H</th><th scope="col">HR</th><th scope="col">RBI</th><th scope="col">BB</th><th scope="col">SO</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function pitchersTable(label, side) {
    if (!side || !side.pitchers || !side.pitchers.length) return '';
    var rows = side.pitchers.map(function (p) {
      return '<tr><td>' + cell(p.name) + '</td><td>' + cell(p.ip) + '</td><td>' + cell(p.h) + '</td><td>' + cell(p.r) +
        '</td><td>' + cell(p.er) + '</td><td>' + cell(p.bb) + '</td><td>' + cell(p.so) + '</td><td>' + cell(p.hr) +
        '</td><td>' + cell(p.pitches) + '</td></tr>';
    }).join('');
    return '<div class="sh-scroll"><table class="sh-table"><caption>' + esc(label) + ' pitching</caption>' +
      '<thead><tr><th scope="col">Pitcher</th><th scope="col">IP</th><th scope="col">H</th><th scope="col">R</th>' +
      '<th scope="col">ER</th><th scope="col">BB</th><th scope="col">SO</th><th scope="col">HR</th><th scope="col">P</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function lineupList(label, list) {
    if (!list || !list.length) return '';
    return '<div class="sh-split-card"><h3>' + esc(label) + ' lineup</h3>' +
      list.map(function (p) {
        return '<div class="sh-kv"><span>' + esc(p.order) + '. ' + cell(p.name) + '</span><b>' + cell(p.pos) + '</b></div>';
      }).join('') + '</div>';
  }

  function render(r) {
    var heading = (r.away_team_name || r.away_abbr) + ' at ' + (r.home_team_name || r.home_abbr);
    document.title = heading + ' Simulated Box Score | TrustMyRecord';
    var crumb = qs('shCrumbCurrent');
    if (crumb) crumb.textContent = r.away_abbr + ' @ ' + r.home_abbr;

    var ts = r.team_stats || {};
    var ps = r.player_stats || {};
    var settings = r.settings || {};
    var matchupHref = '/mlb-simulator/simulations/' + encodeURIComponent(r.game_date) + '/' + encodeURIComponent(r.slug) + '/';

    qs('shRunRoot').innerHTML = '' +
      '<header class="sh-head">' +
        '<div class="sh-teams">' +
          (r.away_logo ? '<img src="' + esc(r.away_logo) + '" alt="" width="34" height="34">' : '') +
          (r.home_logo ? '<img src="' + esc(r.home_logo) + '" alt="" width="34" height="34">' : '') +
          '<div><h1>' + esc(heading) + '</h1>' +
          '<p class="sh-sub">Simulated ' + esc(new Date(r.completed_at).toLocaleString()) + ' &middot; ' +
            esc(CONFIG_LABEL[r.config_type] || r.config_type) +
            (r.game_number > 1 ? ' &middot; Game ' + esc(r.game_number) : '') + '</p></div>' +
        '</div>' +
        '<a class="sh-btn is-primary" href="/mlb-simulator/?simAway=' + encodeURIComponent(r.away_abbr) +
          '&simHome=' + encodeURIComponent(r.home_abbr) + '">Run This Matchup</a>' +
      '</header>' +

      '<div class="sh-metrics">' +
        '<div class="sh-metric is-accent"><b>' + esc(r.away_score) + '&ndash;' + esc(r.home_score) + '</b><span>Final simulated score</span></div>' +
        '<div class="sh-metric"><b>' + esc(r.winner_abbr || 'None') + '</b><span>Simulated winner</span></div>' +
        '<div class="sh-metric"><b>' + esc(r.total_runs) + '</b><span>Total runs</span></div>' +
        '<div class="sh-metric"><b>' + esc(r.total_innings || 9) + (r.extra_innings ? '*' : '') + '</b><span>Innings</span></div>' +
      '</div>' +

      '<section class="sh-panel">' +
        '<div class="sh-panel-head"><h2>Team Statistics</h2><span class="sh-count">' + esc(r.sim_status) + '</span></div>' +
        '<div class="sh-split">' +
          teamStatCard(r.away_team_name || r.away_abbr, ts.away) +
          teamStatCard(r.home_team_name || r.home_abbr, ts.home) +
          '<div class="sh-split-card"><h3>Setup</h3>' +
            '<div class="sh-kv"><span>Away starter</span><b>' + cell(r.away_pitcher) + '</b></div>' +
            '<div class="sh-kv"><span>Home starter</span><b>' + cell(r.home_pitcher) + '</b></div>' +
            '<div class="sh-kv"><span>Weather</span><b>' + cell(r.weather_label) + '</b></div>' +
            '<div class="sh-kv"><span>Ballpark</span><b>' + cell(r.venue) + '</b></div>' +
            '<div class="sh-kv"><span>Data mode</span><b>' + cell(settings.data_mode) + '</b></div>' +
            '<div class="sh-kv"><span>Runs in batch</span><b>' + cell(r.sim_run_count) + '</b></div>' +
          '</div>' +
        '</div>' +
      '</section>' +

      ((ps.away || ps.home) ?
      '<section class="sh-panel">' +
        '<div class="sh-panel-head"><h2>Player Statistics</h2><span class="sh-count">Simulated, not official MLB stats</span></div>' +
        '<div style="padding:12px 14px;display:flex;flex-direction:column;gap:14px;">' +
          battersTable(r.away_abbr, ps.away) + pitchersTable(r.away_abbr, ps.away) +
          battersTable(r.home_abbr, ps.home) + pitchersTable(r.home_abbr, ps.home) +
        '</div>' +
      '</section>' : '') +

      ((r.lineups && ((r.lineups.away || []).length || (r.lineups.home || []).length)) ?
      '<section class="sh-panel">' +
        '<div class="sh-panel-head"><h2>Lineups Used</h2></div>' +
        '<div class="sh-split">' +
          lineupList(r.away_abbr, r.lineups.away) +
          lineupList(r.home_abbr, r.lineups.home) +
        '</div>' +
      '</section>' : '') +

      '<p class="sh-note">This is one completed run of the TrustMyRecord MLB Simulator, stored exactly as it was ' +
      'generated. Player lines are modelled output, not official MLB statistics, and nothing on this page is a ' +
      'prediction or betting advice. ' +
      '<a href="' + esc(matchupHref) + '">See every simulation of this matchup</a> or ' +
      '<a href="/mlb-simulator/simulations/?date=' + esc(r.game_date) + '">all simulations from that day</a>.</p>';
  }

  function init() {
    var id = new URLSearchParams(window.location.search).get('id');
    var root = qs('shRunRoot');
    if (!/^\d{1,19}$/.test(String(id || ''))) {
      root.innerHTML = '<section class="sh-panel"><div class="sh-empty"><b>That simulation could not be found.</b>' +
        '<div><a class="sh-btn is-primary" href="/mlb-simulator/simulations/">All simulations today</a></div></div></section>';
      return;
    }
    api('/runs/' + encodeURIComponent(id))
      .then(function (d) {
        if (!d || !d.run) throw new Error('missing');
        render(d.run);
      })
      .catch(function () {
        root.innerHTML = '<section class="sh-panel"><div class="sh-empty"><b>That simulation could not be found.</b>' +
          'It may have been recorded on a different day.' +
          '<div><a class="sh-btn is-primary" href="/mlb-simulator/simulations/">All simulations today</a></div></div></section>';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
