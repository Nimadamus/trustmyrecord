/* nhl-simulator-app.js -- the hockey half of the NHL simulator page.
 *
 * Everything that is not hockey lives in tmr-sim-core.js. This file adds the two
 * goaltender selectors and says what a hockey result looks like.
 */
(function () {
  'use strict';

  var S = window.TMRSim;
  var el = S.el;
  var pct = S.pct;

  function n1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function n2(v) { return (Math.round(v * 100) / 100).toFixed(2); }

  /* ---------- goaltender selectors ---------------------------------------- */

  /**
   * Fill the two goaltender selectors. The label and the empty select are
   * SERVED IN THE HTML rather than created here, because creating them grew the
   * setup panel after first paint and shifted the whole page down; see the note
   * on buildSegments in tmr-sim-core.js.
   */
  function buildGoalieControls(app) {
    var host = app.nodes.extras;
    if (!host || !document.getElementById('homeGoalie')) return;
    var refresh = function () {
      var t = app.currentTeams();
      [['away', t.away], ['home', t.home]].forEach(function (pair) {
        var sel = document.getElementById(pair[0] + 'Goalie');
        var team = pair[1];
        sel.innerHTML = '';
        if (!team) { sel.disabled = true; return; }
        sel.disabled = false;
        team.goalies.forEach(function (g, i) {
          var o = el('option', '', g.name + ' (' + g.savePct.toFixed(3).replace(/^0/, '') + ' SV%, '
            + g.gamesStarted + ' GS)' + (g.replacementLevel ? ' - estimated' : ''));
          o.value = g.id;
          if (i === 0) o.selected = true;
          sel.appendChild(o);
        });
      });
    };
    app.nodes.away.addEventListener('change', refresh);
    app.nodes.home.addEventListener('change', refresh);
    if (app.nodes.swap) app.nodes.swap.addEventListener('click', function () { setTimeout(refresh, 0); });
    // Picking a game off the schedule, or arriving on a deep link, changes the
    // teams without firing the selects' change event, so the core calls this.
    app.refreshGoalies = refresh;
    refresh();
  }

  /* ---------- box score ---------------------------------------------------- */

  var SKATER_COLS = [
    { h: 'Player', fmt: function (p) {
      var wrap = el('span');
      wrap.appendChild(el('span', 'nm', p.name));
      wrap.appendChild(el('span', 'pos', p.pos));
      if (p.unit) wrap.appendChild(el('span', 'unit', p.unit));
      return wrap;
    } },
    { h: 'G', k: 'g' },
    { h: 'A', k: 'a' },
    { h: 'P', k: 'pts' },
    { h: 'SOG', k: 'shots' },
    { h: 'PPG', k: 'ppG' },
    { h: '+/-', fmt: function (p) { return S.signed(p.plusMinus, 0); } },
    { h: 'PIM', k: 'pim' },
    { h: 'HIT', k: 'hits' },
    { h: 'BLK', k: 'blocks' },
    { h: 'TOI', fmt: function (p) {
      var m = Math.floor(p.toi);
      var s = Math.round((p.toi - m) * 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    } },
  ];

  /* ---------- distribution charts ----------------------------------------- */

  function charts(d) {
    var p = d.projection;
    var away = d.matchup.away;
    var home = d.matchup.home;
    var awayColor = away.color || '#38bdf8';
    var homeColor = home.color || '#22d3ee';
    var grid = el('div', 'chartgrid');

    grid.appendChild(S.chartCard(
      'Margin, ' + d.meta.simulations.toLocaleString() + ' simulations',
      S.histogram(p.distributions.margin, {
        title: 'Distribution of the final margin',
        colorOf: function (b) { return b.bucket > 0 ? homeColor : awayColor; },
        labelOf: function (b) {
          return b.bucket > 0 ? home.abbr + ' by ' + b.bucket : away.abbr + ' by ' + Math.abs(b.bucket);
        },
        tickOf: function (b) {
          if (b.bucket === 0) return 'level';
          return b.bucket > 0 ? home.abbr + ' +' + b.bucket : away.abbr + ' +' + Math.abs(b.bucket);
        },
      }),
      [{ color: awayColor, label: away.abbr + ' wins' }, { color: homeColor, label: home.abbr + ' wins' }],
    ));

    grid.appendChild(S.chartCard(
      'Total goals',
      S.histogram(p.distributions.total, {
        title: 'Distribution of the combined score',
        colorOf: function () { return '#38bdf8'; },
        labelOf: function (b) { return b.bucket + ' goals'; },
      }),
      [{ color: '#38bdf8', label: 'Median ' + p.total.p50 }],
    ));

    grid.appendChild(S.chartCard(
      'Over probability by total',
      S.curve(p.distributions.totalCurve.map(function (c) { return { x: c.line, y: c.over }; }), {
        title: 'How often the game goes over each total',
        stroke: '#34d399',
        labelOf: function (pt) { return 'Over ' + pt.x + ': ' + pct(pt.y, 1); },
        tickOf: function (pt) { return String(pt.x); },
      }),
      [{ color: '#34d399', label: 'Goes over the line' }],
    ));

    return grid;
  }

  function skaterTable(side, teamName) {
    var rows = side.skaters.map(function (p, i) {
      var r = Object.assign({}, p);
      if (p.replacementLevel) r._class = 'replacement';
      // Visible break where the forwards end and the defence begins.
      if (i > 0 && side.skaters[i - 1].pos !== 'D' && p.pos === 'D') r._class = (r._class || '') + ' groupsplit';
      return r;
    });
    var t = side.totals;
    var footer = {
      name: 'TEAM', g: t.goals, a: t.assists, pts: t.goals + t.assists, shots: t.shots,
      ppG: t.powerPlayGoals, plusMinus: 0, pim: t.pim, hits: t.hits, blocks: t.blocks, toi: 300,
    };
    var wrap = el('div');
    var head = el('div', 'teamhead');
    if (side.team) head.appendChild(S.crest(side.team, 30));
    head.appendChild(el('div', 'nm', teamName));
    head.appendChild(el('div', 'rec', t.goals + ' goals on ' + t.shots + ' shots ('
      + t.shootingPct.toFixed(1) + '%), power play ' + t.powerPlayGoals + ' for ' + t.powerPlayOpportunities));
    wrap.appendChild(head);
    wrap.appendChild(S.table(SKATER_COLS, rows, { footer: footer }));

    var g = side.goalie;
    var card = el('div', 'goaliecard');
    var left = el('div');
    left.appendChild(el('div', 'nm', g.name));
    left.appendChild(el('div', 'sub',
      g.season
        ? g.season.gp + ' games, ' + g.season.savePct.toFixed(3).replace(/^0/, '') + ' save percentage, '
          + g.season.gaa.toFixed(2) + ' goals against average last season'
        : 'No qualifying season; started at replacement level'));
    card.appendChild(left);
    var ln = el('div', 'ln', g.saves + ' saves on ' + g.shotsAgainst + ' shots, '
      + (g.shotsAgainst ? g.savePct.toFixed(3).replace(/^0/, '') : '--')
      + (g.shutout ? ' shutout' : '')
      + (g.emptyNetGoalsAgainst ? ' (empty-net goal not charged)' : ''));
    card.appendChild(ln);
    wrap.appendChild(card);
    return wrap;
  }

  /* ---------- line score --------------------------------------------------- */

  function lineScore(d) {
    var ls = d.result.line_score;
    var cols = [{ h: '', fmt: function (r) { return r.name; } },
      { h: '1st', k: 'p0' }, { h: '2nd', k: 'p1' }, { h: '3rd', k: 'p2' }];
    if (ls.overtime) cols.push({ h: ls.shootout ? 'SO' : 'OT', k: 'ot' });
    cols.push({ h: 'Final', k: 'final' });
    cols.push({ h: 'Shots', k: 'shots' });

    var mk = function (side, name) {
      var r = { name: name, final: '<b>' + d.result.final[side] + '</b>' };
      ls.periods[side].forEach(function (v, i) { r['p' + i] = v; });
      if (ls.overtime) r.ot = ls.shootout ? ls.shootout_goals[side] : ls.overtime_goals[side];
      r.shots = ls.shots[side].reduce(function (x, y) { return x + y; }, 0) + ls.overtime_shots[side];
      return r;
    };
    var wrap = el('div', 'linescore');
    wrap.appendChild(S.table(cols, [
      mk('away', d.matchup.away.name),
      mk('home', d.matchup.home.name),
    ]));
    if (ls.overtime) {
      wrap.appendChild(el('div', 'dim', ls.shootout
        ? 'Decided in a shootout. The winner is credited one goal on the scoreboard, which is how the NHL records it.'
        : 'Decided in three-on-three overtime.'));
    }
    return wrap;
  }

  /* ---------- team stats --------------------------------------------------- */

  function teamStats(d) {
    var a = d.result.box_score.away.totals;
    var h = d.result.box_score.home.totals;
    var wrap = el('div');
    wrap.appendChild(S.compare([
      { label: 'Goals', away: a.goals, home: h.goals },
      { label: 'Shots', away: a.shots, home: h.shots },
      { label: 'Shooting%', away: a.shootingPct, home: h.shootingPct, fmt: function (v) { return v.toFixed(1) + '%'; } },
      { label: 'PP goals', away: a.powerPlayGoals, home: h.powerPlayGoals },
      { label: 'PP chances', away: a.powerPlayOpportunities, home: h.powerPlayOpportunities },
      { label: 'Even goals', away: a.evenStrengthGoals, home: h.evenStrengthGoals },
      { label: 'Assists', away: a.assists, home: h.assists },
      { label: 'Hits', away: a.hits, home: h.hits },
      { label: 'Blocks', away: a.blocks, home: h.blocks },
      { label: 'PIM', away: a.pim, home: h.pim },
    ]));

    var ag = d.result.box_score.away.goalie;
    var hg = d.result.box_score.home.goalie;
    var s = el('div', 'statstrip');
    [
      [d.matchup.away.abbr + ' saves', ag.saves + '/' + ag.shotsAgainst],
      [d.matchup.away.abbr + ' SV%', ag.shotsAgainst ? ag.savePct.toFixed(3).replace(/^0/, '') : '--'],
      [d.matchup.home.abbr + ' saves', hg.saves + '/' + hg.shotsAgainst],
      [d.matchup.home.abbr + ' SV%', hg.shotsAgainst ? hg.savePct.toFixed(3).replace(/^0/, '') : '--'],
    ].forEach(function (p) {
      var c = el('div', 'cell');
      c.appendChild(el('div', 'k', p[0]));
      c.appendChild(el('div', 'v', String(p[1])));
      s.appendChild(c);
    });
    wrap.appendChild(s);
    return wrap;
  }

  function seasonProfile(d) {
    var a = d.matchup.away.season;
    var h = d.matchup.home.season;
    var wrap = el('div');
    wrap.appendChild(el('p', 'dim',
      'Season inputs the model ran on, from the ' + d.meta.stats_season + ' regular season. '
      + 'Rosters are the ' + d.meta.roster_season + ' rosters.'));
    wrap.appendChild(S.compare([
      { label: 'Goals for', away: a.goalsFor, home: h.goalsFor, fmt: n2 },
      { label: 'Goals ag', away: a.goalsAgainst, home: h.goalsAgainst, fmt: n2 },
      { label: 'Shots for', away: a.shotsFor, home: h.shotsFor, fmt: n1 },
      { label: 'Shots ag', away: a.shotsAgainst, home: h.shotsAgainst, fmt: n1 },
      { label: 'Shooting%', away: a.shootingPct, home: h.shootingPct, fmt: function (v) { return v.toFixed(1) + '%'; } },
      { label: 'Power play', away: a.powerPlayPct, home: h.powerPlayPct, fmt: function (v) { return v.toFixed(1) + '%'; } },
      { label: 'Penalty kill', away: a.penaltyKillPct, home: h.penaltyKillPct, fmt: function (v) { return v.toFixed(1) + '%'; } },
      { label: 'Faceoffs', away: a.faceoffPct, home: h.faceoffPct, fmt: function (v) { return v.toFixed(1) + '%'; } },
    ]));
    var rec = el('p', 'dim');
    rec.textContent = d.matchup.away.name + ' finished ' + d.matchup.away.record.wins + '-'
      + d.matchup.away.record.losses + '-' + d.matchup.away.record.otLosses + ' with '
      + d.matchup.away.record.points + ' points. ' + d.matchup.home.name + ' finished '
      + d.matchup.home.record.wins + '-' + d.matchup.home.record.losses + '-'
      + d.matchup.home.record.otLosses + ' with ' + d.matchup.home.record.points + ' points.';
    wrap.appendChild(rec);
    return wrap;
  }

  /**
   * Who dresses and who is out. The NHL's own feed carries no injury data at all,
   * so this comes from ESPN and is only honoured when the designation is recent;
   * a months-old "Out" is history, not availability, and must not scratch a
   * healthy first-line forward.
   */
  function availability(app, d) {
    var wrap = el('div');
    var teams = app.currentTeams();
    [[teams.away, d.matchup.away], [teams.home, d.matchup.home]].forEach(function (pair) {
      var full = pair[0];
      var shown = pair[1];
      var block = el('div');
      var head = el('div', 'teamhead');
      head.appendChild(S.crest(shown, 26));
      head.appendChild(el('div', 'nm', shown.name));
      block.appendChild(head);
      if (!full) {
        block.appendChild(el('p', 'dim', 'Lineup detail is unavailable for this team.'));
        wrap.appendChild(block);
        return;
      }
      var cols = [
        { h: 'Dressed', fmt: function (r) {
          var w = el('span');
          w.appendChild(el('span', 'nm', r.name));
          if (r.replacementLevel) w.appendChild(el('span', 'pos', 'estimated'));
          return w;
        } },
        { h: 'Pos', k: 'pos' },
        { h: 'Unit', fmt: function (r) { return r.line ? 'F' + r.line : 'D' + r.pair; } },
        { h: 'TOI', fmt: function (r) { return n1(r.toi); } },
        { h: 'G', fmt: function (r) { return r.season ? r.season.g : '--'; } },
        { h: 'A', fmt: function (r) { return r.season ? r.season.a : '--'; } },
        { h: 'P', fmt: function (r) { return r.season ? r.season.pts : '--'; } },
      ];
      block.appendChild(S.table(cols, full.lineup.forwards.concat(full.lineup.defence)));

      var goalieRows = full.goalies.map(function (g, i) {
        return { name: g.name, role: i === 0 ? 'Projected starter' : 'Backup', gs: g.gamesStarted,
          sv: g.savePct.toFixed(3).replace(/^0/, ''), gaa: g.gaa.toFixed(2),
          est: g.replacementLevel ? 'estimated' : '' };
      });
      block.appendChild(S.table([
        { h: 'Goaltender', fmt: function (r) { return r.name + (r.est ? ' (' + r.est + ')' : ''); } },
        { h: 'Role', k: 'role' },
        { h: 'GS', k: 'gs' },
        { h: 'SV%', k: 'sv' },
        { h: 'GAA', k: 'gaa' },
      ], goalieRows));

      var out = full.unavailable || [];
      block.appendChild(el('p', out.length ? 'pill warn' : 'dim',
        out.length
          ? 'Out: ' + out.map(function (x) { return x.name + ' (' + x.status + ')'; }).join(', ')
          : 'Nobody on this roster carries a current injury designation.'));
      wrap.appendChild(block);
      var sp = el('div');
      sp.style.height = '16px';
      wrap.appendChild(sp);
    });
    wrap.appendChild(el('div', 'disc',
      'Availability comes from the roster feed at the last data refresh, and only designations from the last '
      + 'three weeks are honoured, because a months-old listing is history rather than news. It will not know '
      + 'about a late scratch or a game-time goaltender decision.'));
    return wrap;
  }

  /* ---------- the whole result -------------------------------------------- */

  /**
   * The game as it was played: a sentence, then the goals in order.
   *
   * The engine records every goal as it scores it -- who, when, at what strength,
   * who set it up -- so none of this is reconstructed from totals. A scoring
   * summary built by guessing at the order of goals would be fiction, and would
   * contradict the box score sitting under it.
   */
  function recapPanel(d) {
    var wrap = el('div');
    if (d.recap) wrap.appendChild(el('div', 'recap', d.recap));
    var stars = d.result.three_stars || [];
    if (stars.length) {
      var line = stars.map(function (s2) {
        return s2.star + '. ' + s2.name + ' (' + d.matchup[s2.team].abbr + ') ' + s2.line;
      }).join('  \u00b7  ');
      wrap.appendChild(el('div', 'disc', 'Three stars \u2014 ' + line));
    }
    return wrap;
  }

  function scoringSummary(d) {
    var wrap = el('div');
    var plays = d.result.scoring_plays || [];
    if (!plays.length) {
      wrap.appendChild(el('div', 'disc', 'No goals were scored in regulation or overtime.'));
    } else {
      wrap.appendChild(S.table([
        { h: 'Per', fmt: function (r) { return r.period; } },
        { h: 'Time', fmt: function (r) { return r.time; } },
        { h: 'Team', fmt: function (r) { return d.matchup[r.team].abbr; } },
        { h: 'Goal', fmt: function (r) {
          return r.scorer + (r.assists.length ? ' (' + r.assists.join(', ') + ')' : ' (unassisted)');
        } },
        { h: 'Str', fmt: function (r) { return r.strength; },
          title: 'Even strength, power play, short handed or empty net' },
        { h: 'Score', fmt: function (r) { return r.score.away + '-' + r.score.home; } },
      ], plays));
    }
    var pens = d.result.penalty_summary || [];
    if (pens.length) {
      wrap.appendChild(el('div', 'sechead', 'Penalties'));
      wrap.appendChild(S.table([
        { h: 'Per', fmt: function (r) { return r.period; } },
        { h: 'Time', fmt: function (r) { return r.time; } },
        { h: 'Team', fmt: function (r) { return d.matchup[r.team].abbr; } },
        { h: 'Player', fmt: function (r) { return r.player; } },
        { h: 'Min', fmt: function (r) { return r.minutes; } },
      ], pens));
    }
    wrap.appendChild(el('div', 'disc',
      'Every goal and penalty above is an event this simulation played, in the order it played them. '
      + 'The running score is the score after that goal.'));
    return wrap;
  }

  function leadersPanel(d) {
    var L = d.result.leaders;
    if (!L) return el('div');
    var rows = [];
    ['away', 'home'].forEach(function (side) {
      var x = L[side];
      if (!x) return;
      rows.push({
        team: d.matchup[side].abbr,
        pts: x.points ? x.points.name + ' \u2014 ' + x.points.line : '\u2014',
        sh: x.shots ? x.shots.name + ' (' + x.shots.value + ')' : '\u2014',
        toi: x.ice_time ? x.ice_time.name + ' (' + x.ice_time.value + ')' : '\u2014',
      });
    });
    return S.table([
      { h: 'Team', fmt: function (r) { return r.team; } },
      { h: 'Points', fmt: function (r) { return r.pts; } },
      { h: 'Shots', fmt: function (r) { return r.sh; } },
      { h: 'Ice time', fmt: function (r) { return r.toi; } },
    ], rows);
  }

  /**
   * The scorelines that actually came up.
   *
   * A projected score is an average, and an average is often a result that was
   * never once played: 114.9 to 106.8 is not a basketball score and 3.14 to 2.71
   * is not a hockey one. These are the exact finals the simulation produced,
   * most common first, which is the resolution the game is really decided in.
   */
  function commonScores(d) {
    var list = d.projection.most_common_scores || [];
    var wrap = el('div');
    if (!list.length) return wrap;
    var away = d.matchup.away.abbr;
    var home = d.matchup.home.abbr;
    wrap.appendChild(S.table([
      { h: 'Final', fmt: function (r) { return away + ' ' + r.away + ' \u2013 ' + r.home + ' ' + home; } },
      { h: 'Share of runs', fmt: function (r) { return (r.share * 100).toFixed(1) + '%'; } },
      { h: 'Runs', fmt: function (r) { return r.count.toLocaleString(); } },
    ], list));
    wrap.appendChild(el('div', 'disc',
      'Out of ' + d.meta.simulations.toLocaleString() + ' simulated games. '
      + 'The projected score above is an average of all of them and may itself never have been played.'));
    return wrap;
  }

  function render(app, d, box) {
    var p = d.projection;
    var away = d.matchup.away;
    var home = d.matchup.home;
    var decided = d.result.decided_in === 'regulation' ? 'Final'
      : (d.result.decided_in === 'overtime' ? 'Final in overtime' : 'Final in a shootout');

    box.appendChild(S.matchupHeader(
      away, home,
      d.result.final.away, d.result.final.home,
      p.win_probability.away, p.win_probability.home,
      [decided, d.meta.simulations.toLocaleString() + ' simulations',
        d.meta.neutral_site ? 'Neutral ice' : home.name + ' at home'],
    ));

    if (d.recap || (d.result.three_stars || []).length) {
      box.appendChild(S.panel('How it played out', recapPanel(d)));
    }
    if (d.result.leaders) box.appendChild(S.panel('Game leaders', leadersPanel(d)));

    box.appendChild(S.kpis([
      { k: 'Projected score', v: n2(p.projected_score.away) + ' - ' + n2(p.projected_score.home),
        s: away.abbr + ' at ' + home.abbr },
      { k: 'Projected total', v: n2(p.total.mean),
        s: 'Middle half ' + p.total.p25 + ' to ' + p.total.p75 },
      { k: 'Reaches overtime', v: pct(p.overtime_share, 0),
        s: pct(p.shootout_share, 0) + ' go to a shootout' },
      { k: 'Shutout in the game', v: pct(p.shutout_share, 0),
        s: 'Either goaltender' },
    ]));

    box.appendChild(S.panel('Period by period', lineScore(d)));

    var sg = d.matchup.starting_goalies;
    if (sg && sg.home && sg.away) {
      var gp = el('div', 'panel');
      gp.appendChild(el('div', 'sechead', 'Starting goaltenders'));
      [[sg.away, away.name], [sg.home, home.name]].forEach(function (pair) {
        var c = el('div', 'goaliecard');
        var left = el('div');
        left.appendChild(el('div', 'nm', pair[0].name));
        left.appendChild(el('div', 'sub', pair[1]
          + (pair[0].replacementLevel ? ' - no qualifying season, started at replacement level'
            : ' - ' + pair[0].gamesStarted + ' starts last season')));
        c.appendChild(left);
        c.appendChild(el('div', 'ln', pair[0].savePct.toFixed(3).replace(/^0/, '') + ' SV%'));
        gp.appendChild(c);
      });
      box.appendChild(gp);
    }

    var tabsBox = el('div', 'panel');
    S.tabs(tabsBox, [
      { id: 'box', label: 'Box score', build: function (node) {
        d.result.box_score.away.team = away;
        d.result.box_score.home.team = home;
        node.appendChild(skaterTable(d.result.box_score.away, away.name));
        var spacer = el('div'); spacer.style.height = '18px'; node.appendChild(spacer);
        node.appendChild(skaterTable(d.result.box_score.home, home.name));
        node.appendChild(el('div', 'disc',
          'Every team number above is the sum of the skater lines beneath it. Penalty minutes always equal twice '
          + 'the other team\'s power plays. Plus-minus is weighted by ice time rather than tracked shift by shift.'));
      } },
      { id: 'scoring', label: 'Scoring summary', build: function (node) {
        node.appendChild(scoringSummary(d));
      } },
      { id: 'scores', label: 'Likely scores', build: function (node) {
        node.appendChild(commonScores(d));
      } },
      { id: 'team', label: 'Team stats', build: function (node) { node.appendChild(teamStats(d)); } },
      { id: 'why', label: 'Why the model moved', build: function (node) {
        node.appendChild(S.driverCards(d.drivers));
      } },
      { id: 'season', label: 'Season profile', build: function (node) { node.appendChild(seasonProfile(d)); } },
      { id: 'avail', label: 'Lineups', build: function (node) { node.appendChild(availability(app, d)); } },
      { id: 'charts', label: 'Distributions', build: function (node) {
        node.appendChild(charts(d));
        node.appendChild(el('div', 'disc',
          'Every bar is a share of the ' + d.meta.simulations.toLocaleString()
          + ' simulated games. Hover or tap a bar for its exact share.'));
      } },
      { id: 'range', label: 'Range of outcomes', build: function (node) {
        node.appendChild(S.table(
          [{ h: 'Percentile', fmt: function (r) { return r.name; } }, { h: 'Total goals', k: 'total' }],
          [
            { name: '10th', total: p.total.p10 },
            { name: '25th', total: p.total.p25 },
            { name: 'Median', total: p.total.p50 },
            { name: '75th', total: p.total.p75 },
            { name: '90th', total: p.total.p90 },
          ],
        ));
        node.appendChild(S.kpis([
          { k: home.abbr + ' by two or more', v: pct(p.puckline.home_minus_1_5, 0), s: 'Covers a 1.5-goal puck line' },
          { k: away.abbr + ' by two or more', v: pct(p.puckline.away_minus_1_5, 0), s: 'Covers a 1.5-goal puck line' },
        ]));
        node.appendChild(el('div', 'disc',
          'Across ' + d.meta.simulations.toLocaleString() + ' simulations. A projection is a range, not a number.'));
      } },
    ]);
    box.appendChild(tabsBox);
  }

  /* ---------- boot --------------------------------------------------------- */

  document.addEventListener('DOMContentLoaded', function () {
    var app = new S.SimApp({
      sport: 'nhl',
      homeVenueLabel: 'Home ice',
      render: render,
      onTeamsLoaded: buildGoalieControls,
      // A schedule pick or a deep link changes the teams without touching the
      // selects' change event, so the goaltender lists are refreshed explicitly.
      onMatchupChanged: function (app) {
        if (app.refreshGoalies) app.refreshGoalies();
      },
      extraParams: function () {
        var hg = document.getElementById('homeGoalie');
        var ag = document.getElementById('awayGoalie');
        return {
          homeGoalie: hg && hg.value ? hg.value : null,
          awayGoalie: ag && ag.value ? ag.value : null,
        };
      },
      prerunChips: function (away, home) {
        return [
          { label: away.abbr + ' goals for', value: away.season.goalsFor.toFixed(2) },
          { label: home.abbr + ' goals for', value: home.season.goalsFor.toFixed(2) },
          { label: away.abbr + ' power play', value: away.season.powerPlayPct.toFixed(1) + '%' },
          { label: home.abbr + ' penalty kill', value: home.season.penaltyKillPct.toFixed(1) + '%' },
        ];
      },
    });
    app.mount();
    window.TMRNhlSim = app;
  });
}());
