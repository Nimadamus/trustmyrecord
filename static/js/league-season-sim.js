/**
 * NBA_NHL_SEASON_SIM_UI_20260915 -- the NBA and NHL season simulator and
 * playoff simulator pages.
 *
 * The page ships with a projection already rendered into its HTML by
 * scripts/build_league_sim_pages.js, using THESE renderers, so what a crawler
 * reads and what a visitor sees after pressing Run are the same tables. Pressing
 * Run fetches the live inputs, plays the seasons in the browser with
 * static/js/league-season-engine.js and redraws the same markup.
 *
 * UMD: the renderers are required by the Node page builder; the controller only
 * starts in a browser.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TMRLeagueSeasonUI = api;
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var API = 'https://trustmyrecord-api.onrender.com/api/';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function pct(v) {
    if (!(v > 0)) return '<span class="lz">0%</span>';
    if (v >= 0.995) return '&gt;99%';
    if (v < 0.005) return '&lt;1%';
    return Math.round(v * 100) + '%';
  }
  function one(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function logo(t) {
    return t.logo ? '<img src="' + esc(t.logo) + '" alt="" width="22" height="22" loading="lazy">' : '';
  }
  function team(t) {
    return '<span class="lt">' + logo(t) + '<span class="ln">' + esc(t.name) + '</span><span class="ls">' + esc(t.short || t.abbr) + '</span></span>';
  }
  function heat(v) {
    var a = Math.max(0, Math.min(1, v || 0));
    return ' style="--h:' + (Math.round(a * 100) / 100) + '"';
  }

  /* ----------------------------------------------------------- season view */

  function seasonTables(result) {
    var nhl = result.sport === 'nhl';
    var groups = {};
    result.teams.forEach(function (t) {
      var key = nhl ? t.conference + '|' + t.division : t.conference + '|';
      (groups[key] || (groups[key] = [])).push(t);
    });
    var keys = Object.keys(groups).sort();
    var html = '';
    keys.forEach(function (k) {
      var conf = k.split('|')[0], div = k.split('|')[1];
      var list = groups[k].slice().sort(function (a, b) {
        return nhl ? b.points_mean - a.points_mean : b.wins_mean - a.wins_mean;
      });
      var title = nhl ? div + ' Division' : conf + ' Conference';
      html += '<div class="lsim-card"><h3>' + esc(title) + (nhl ? ' <small>' + esc(conf) + ' Conference</small>' : '') + '</h3>'
        + '<div class="tscroll"><table class="lsim"><thead><tr><th scope="col">Team</th>'
        + (nhl
          ? '<th scope="col">Points</th><th scope="col">80% range</th><th scope="col">Wins</th><th scope="col">Division</th><th scope="col">Playoffs</th><th scope="col">Cup</th>'
          : '<th scope="col">Wins</th><th scope="col">80% range</th><th scope="col">Top 6</th><th scope="col">Play in</th><th scope="col">Playoffs</th><th scope="col">Title</th>')
        + '</tr></thead><tbody>';
      list.forEach(function (t) {
        html += '<tr><th scope="row">' + team(t) + '</th>'
          + (nhl
            ? '<td class="num">' + one(t.points_mean) + '</td><td class="rng">' + t.points_p10 + ' to ' + t.points_p90 + '</td><td class="num">' + one(t.wins_mean) + '</td>'
              + '<td class="p"' + heat(t.division_title) + '>' + pct(t.division_title) + '</td><td class="p"' + heat(t.playoffs) + '>' + pct(t.playoffs) + '</td><td class="p"' + heat(t.champion * 4) + '>' + pct(t.champion) + '</td>'
            : '<td class="num">' + one(t.wins_mean) + '</td><td class="rng">' + t.wins_p10 + ' to ' + t.wins_p90 + ' wins</td>'
              + '<td class="p"' + heat(t.direct) + '>' + pct(t.direct) + '</td><td class="p"' + heat(t.play_in) + '>' + pct(t.play_in) + '</td><td class="p"' + heat(t.playoffs) + '>' + pct(t.playoffs) + '</td><td class="p"' + heat(t.champion * 4) + '>' + pct(t.champion) + '</td>')
          + '</tr>';
      });
      html += '</tbody></table></div></div>';
    });
    return html;
  }

  /* ---------------------------------------------------------- playoff view */

  function oddsTable(result) {
    var nhl = result.sport === 'nhl';
    var list = result.teams.slice().sort(function (a, b) {
      return b.champion - a.champion || b.final - a.final || b.playoffs - a.playoffs;
    });
    var html = '<div class="tscroll"><table class="lsim"><thead><tr><th scope="col">Team</th>'
      + '<th scope="col">Playoffs</th><th scope="col">Second round</th><th scope="col">Conference final</th>'
      + '<th scope="col">' + (nhl ? 'Cup Final' : 'NBA Finals') + '</th><th scope="col">' + (nhl ? 'Win the Cup' : 'Win the title') + '</th></tr></thead><tbody>';
    list.forEach(function (t) {
      html += '<tr><th scope="row">' + team(t) + '</th>'
        + '<td class="p"' + heat(t.playoffs) + '>' + pct(t.playoffs) + '</td>'
        + '<td class="p"' + heat(t.round2) + '>' + pct(t.round2) + '</td>'
        + '<td class="p"' + heat(t.conf_final * 1.5) + '>' + pct(t.conf_final) + '</td>'
        + '<td class="p"' + heat(t.final * 2.5) + '>' + pct(t.final) + '</td>'
        + '<td class="p"' + heat(t.champion * 4) + '>' + pct(t.champion) + '</td></tr>';
    });
    return html + '</tbody></table></div>';
  }

  function nameOf(result, abbr) {
    for (var i = 0; i < result.teams.length; i++) if (result.teams[i].abbr === abbr) return result.teams[i];
    return { abbr: abbr, name: abbr, short: abbr };
  }

  function seriesLine(result, s) {
    var w = nameOf(result, s.winner.abbr), l = nameOf(result, s.loser.abbr);
    return '<li><span class="lt">' + logo(w) + '<b>' + esc(w.short || w.name) + '</b></span> beat '
      + '<span class="lt">' + logo(l) + esc(l.short || l.name) + '</span> <span class="sc">' + s.score[0] + ' games to ' + s.score[1] + '</span></li>';
  }

  function bracket(result) {
    var smp = result.sample;
    if (!smp) return '';
    var R = smp.playoffs.rounds;
    var nhl = result.sport === 'nhl';
    var names = ['First round', 'Second round', 'Conference finals', nhl ? 'Stanley Cup Final' : 'NBA Finals'];
    var html = '';
    if (!nhl) {
      Object.keys(smp.seeding).sort().forEach(function (conf) {
        var pi = smp.seeding[conf].playInResults || [];
        html += '<div class="lsim-card"><h3>' + esc(conf) + ' Conference play in</h3><ul class="series">';
        pi.forEach(function (g) {
          var w = nameOf(result, g.winner), other = g.winner === g.home ? g.away : g.home, l = nameOf(result, other);
          html += '<li><span class="lt">' + logo(w) + '<b>' + esc(w.short) + '</b></span> beat <span class="lt">' + logo(l) + esc(l.short) + '</span> <span class="sc">' + esc(g.for) + '</span></li>';
        });
        html += '</ul></div>';
      });
    }
    R.forEach(function (round, i) {
      html += '<div class="lsim-card"><h3>' + names[i] + '</h3><ul class="series">';
      round.forEach(function (s) { html += seriesLine(result, s); });
      html += '</ul></div>';
    });
    var champ = nameOf(result, smp.playoffs.champion.abbr);
    return '<p class="champ">' + logo(champ) + ' In this simulated season the <b>' + esc(champ.name) + '</b> '
      + (nhl ? 'win the Stanley Cup.' : 'win the NBA title.') + '</p><div class="lsim-grid">' + html + '</div>';
  }

  function stamp(result, inputs) {
    var d = new Date(inputs.generated_at || Date.now());
    var when = d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric',
      year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' PT';
    return result.runs.toLocaleString('en-US') + ' simulated ' + esc(inputs.season_label) + ' seasons, schedule and results read '
      + esc(when) + ', ' + inputs.games_final.toLocaleString('en-US') + ' of the ' + inputs.schedule.length.toLocaleString('en-US') + ' scheduled regular season games final.';
  }

  var renderers = { seasonTables: seasonTables, oddsTable: oddsTable, bracket: bracket, stamp: stamp, esc: esc };

  /* ------------------------------------------------------------ controller */

  if (root && root.document && !(typeof module === 'object' && module.exports)) {
    var d = root.document;
    var start = function () {
      var el = d.getElementById('lsim');
      if (!el) return;
      var sport = el.getAttribute('data-sport');
      var mode = el.getAttribute('data-mode');
      var btn = d.getElementById('runSim');
      var status = d.getElementById('lsimStatus');
      var runsSel = d.getElementById('lsimRuns');
      var inputs = null;
      if (!btn) return;
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        btn.disabled = true;
        status.textContent = 'Reading the live schedule';
        var got = inputs ? Promise.resolve(inputs)
          : fetch(API + sport + '/public/season-inputs', { credentials: 'omit' }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          });
        got.then(function (inp) {
          inputs = inp;
          var E = root.TMRLeagueSeason;
          var n = Number(runsSel && runsSel.value) || 2000;
          var seed = (Math.random() * 4294967295) >>> 0;
          status.textContent = 'Playing ' + n.toLocaleString('en-US') + ' seasons';
          /* Yield to the browser so the status paints before the work starts. */
          setTimeout(function () {
            var result = E.project(inp, n, seed);
            if (mode === 'season') d.getElementById('lsimTables').innerHTML = seasonTables(result);
            else {
              d.getElementById('lsimOdds').innerHTML = oddsTable(result);
              d.getElementById('lsimBracket').innerHTML = bracket(result);
            }
            d.getElementById('lsimStamp').innerHTML = stamp(result, inp);
            status.textContent = 'Done. Press again for a fresh set of seasons.';
            btn.disabled = false;
          }, 30);
        }).catch(function () {
          status.textContent = 'The live schedule did not load. The projection above is the latest published one.';
          btn.disabled = false;
        });
      });
    };
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
    else start();
  }

  return renderers;
}));
