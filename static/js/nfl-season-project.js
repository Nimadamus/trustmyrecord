/**
 * NFL_SEASON_SIM_20260915 -- the NFL season projection: projected wins, the 80%
 * range, division titles, playoff berths and the 1 seed for all 32 clubs.
 *
 * Built on static/js/nfl-playoff-engine.js, so every simulated season is seeded
 * with the same real NFL tiebreakers the NFL Playoff Simulator applies. Played
 * games keep their result; every other game is drawn from its own home win
 * probability in /api/nfl/public/playoff-inputs (the TrustMyRecord NFL drive
 * model). UMD: the page builder and the browser share it.
 */
(function (root, factory) {
  var api = factory(root.TMRPlayoffEngine || (typeof require === 'function' ? require('./nfl-playoff-engine.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TMRNflSeason = api;
}(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
  }

  function project(data, n, seed) {
    var rnd = E.mulberry32(seed || 1);
    var open = data.games.filter(function (g) { return !g.completed; });
    var acc = {};
    data.teams.forEach(function (t) {
      acc[t.id] = { wins: [], division: 0, playoffs: 0, top: 0 };
    });
    for (var i = 0; i < n; i++) {
      var sims = {};
      for (var k = 0; k < open.length; k++) {
        var g = open[k];
        var p = typeof g.home_win_prob === 'number' ? g.home_win_prob : 0.5;
        sims[g.id] = rnd() < p ? g.home : g.away;
      }
      var s = E.seedAll(data.teams, data.games, {}, sims);
      data.teams.forEach(function (t) {
        var r = s.standings[t.id].overall;
        acc[t.id].wins.push(r.w + r.t / 2);
      });
      ['AFC', 'NFC'].forEach(function (c) {
        s[c].divisionWinners.forEach(function (id) { acc[id].division++; });
        s[c].seeds.forEach(function (id, idx) { acc[id].playoffs++; if (idx === 0) acc[id].top++; });
      });
    }
    var played = {};
    data.games.forEach(function (g) {
      if (!g.completed) return;
      [g.home, g.away].forEach(function (id) { played[id] = (played[id] || 0) + 1; });
    });
    var teams = data.teams.map(function (t) {
      var a = acc[t.id], w = a.wins.slice().sort(function (x, y) { return x - y; });
      return {
        id: t.id, abbr: t.abbr, name: t.name, short: t.nickname, conference: t.conference, division: t.division,
        logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/' + String(t.abbr).toLowerCase() + '.png',
        wins_mean: w.reduce(function (s2, v) { return s2 + v; }, 0) / n,
        wins_p10: quantile(w, 0.1), wins_p90: quantile(w, 0.9),
        division_title: a.division / n, playoffs: a.playoffs / n, top_seed: a.top / n,
        played: played[t.id] || 0,
      };
    });
    return { runs: n, seed: seed, open: open.length, teams: teams };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function pct(v) {
    if (!(v > 0)) return '<span class="lz">0%</span>';
    if (v >= 0.995) return '&gt;99%';
    if (v < 0.005) return '&lt;1%';
    return Math.round(v * 100) + '%';
  }
  function slug(name) {
    return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function heat(v) { return ' style="--h:' + (Math.round(Math.max(0, Math.min(1, v || 0)) * 100) / 100) + '"'; }
  function wins(v) { return (Math.round(v * 10) / 10).toFixed(1); }

  function tables(result) {
    var groups = {};
    result.teams.forEach(function (t) { (groups[t.conference + ' ' + t.division] || (groups[t.conference + ' ' + t.division] = [])).push(t); });
    return Object.keys(groups).sort().map(function (k) {
      var list = groups[k].slice().sort(function (a, b) { return b.wins_mean - a.wins_mean; });
      return '<div class="lsim-card"><h3>' + esc(k) + '</h3><div class="tscroll"><table class="lsim"><thead><tr>'
        + '<th scope="col">Team</th><th scope="col">Wins</th><th scope="col">80% range</th><th scope="col">Division</th><th scope="col">Playoffs</th><th scope="col">1 seed</th>'
        + '</tr></thead><tbody>' + list.map(function (t) {
          return '<tr><th scope="row"><a class="lt" href="/nfl-simulator/teams/' + slug(t.name) + '/"><img src="' + esc(t.logo) + '" alt="" width="22" height="22" loading="lazy"><span class="ln">' + esc(t.name) + '</span><span class="ls">' + esc(t.short) + '</span></a></th>'
            + '<td class="num">' + wins(t.wins_mean) + '</td><td class="rng">' + t.wins_p10 + ' to ' + t.wins_p90 + '</td>'
            + '<td class="p"' + heat(t.division_title) + '>' + pct(t.division_title) + '</td>'
            + '<td class="p"' + heat(t.playoffs) + '>' + pct(t.playoffs) + '</td>'
            + '<td class="p"' + heat(t.top_seed * 3) + '>' + pct(t.top_seed) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }).join('');
  }

  function stamp(result, data) {
    var when = new Date(data.generated_at || Date.now()).toLocaleString('en-US', { timeZone: 'America/Los_Angeles',
      month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' PT';
    var played = data.games.length - result.open;
    return result.runs.toLocaleString('en-US') + ' simulated ' + data.season + ' seasons, schedule and results read ' + esc(when)
      + ', ' + played + ' of ' + data.games.length + ' regular season games final.';
  }

  return { project: project, tables: tables, stamp: stamp };
}));
