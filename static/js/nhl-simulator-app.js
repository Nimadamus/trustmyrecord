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
    { h: 'G', k: 'g', title: 'Goals' },
    { h: 'A', k: 'a', title: 'Assists' },
    { h: 'P', k: 'pts', title: 'Points' },
    { h: 'SOG', k: 'shots', title: 'Shots on goal' },
    { h: 'S%', title: 'Shooting percentage',
      sortValue: function (p) { return p.shootingPct === null ? -1 : p.shootingPct; },
      fmt: function (p) { return p.shootingPct === null ? '--' : p.shootingPct.toFixed(1); } },
    { h: 'PPG', k: 'ppG', title: 'Power-play goals' },
    { h: 'SHG', k: 'shG', title: 'Short-handed goals' },
    { h: '+/-', title: 'Goal differential at even strength while he was on the ice',
      sortValue: function (p) { return p.plusMinus; },
      fmt: function (p) { return S.signed(p.plusMinus, 0); } },
    { h: 'PIM', k: 'pim', title: 'Penalty minutes' },
    { h: 'HIT', k: 'hits', title: 'Hits' },
    { h: 'BLK', k: 'blocks', title: 'Blocked shots' },
    { h: 'GV', k: 'giveaways', title: 'Giveaways' },
    { h: 'TK', k: 'takeaways', title: 'Takeaways' },
    { h: 'FO', title: 'Faceoffs won of faceoffs taken',
      sortValue: function (p) { return p.faceoffWins; },
      fmt: function (p) { return p.faceoffs ? p.faceoffWins + '-' + p.faceoffs : '--'; } },
    { h: 'FO%', title: 'Faceoff win percentage, for the men who took draws',
      sortValue: function (p) { return p.faceoffPct === null ? -1 : p.faceoffPct; },
      fmt: function (p) { return p.faceoffPct === null ? '--' : p.faceoffPct.toFixed(1); } },
    { h: 'TOI', title: 'Time on ice',
      sortValue: function (p) { return p.toi; },
      fmt: function (p) {
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
      shootingPct: t.shootingPct, ppG: t.powerPlayGoals, shG: t.shortHandedGoals,
      plusMinus: 0, pim: t.pim, hits: t.hits, blocks: t.blocks,
      giveaways: t.giveaways, takeaways: t.takeaways,
      faceoffWins: t.faceoffWins, faceoffs: t.faceoffs, faceoffPct: t.faceoffPct,
      toi: 300,
    };
    var wrap = el('div');
    var head = el('div', 'teamhead');
    if (side.team) head.appendChild(S.crest(side.team, 30));
    head.appendChild(el('div', 'nm', teamName));
    head.appendChild(el('div', 'rec', t.goals + ' goals on ' + t.shots + ' shots ('
      + t.shootingPct.toFixed(1) + '%), power play ' + t.powerPlayGoals + ' for ' + t.powerPlayOpportunities));
    wrap.appendChild(head);
    wrap.appendChild(S.table(SKATER_COLS, rows, {
      footer: footer, sortable: true, sticky: true,
    }));

    // WHAT THIS SHEET DOES NOT DO WELL, said on the sheet.
    //
    // Checked against real box scores by role, every column here matches except
    // one: hits and penalty minutes for the forwards who play least. Real fourth
    // lines hit MORE than first lines despite half the ice, and this engine deals
    // both from ice time, so its checking line comes out light. It is a real
    // limitation of how those two columns are generated, it is measured, and a
    // reader looking at a fourth-liner's line deserves to know rather than to
    // find out later.
    wrap.appendChild(el('div', 'disc',
      'Hits and penalty minutes are dealt from ice time and each man’s own rate. '
      + 'Measured against real box scores that holds for every role except the forwards '
      + 'who play least, where real checking lines hit more than their minutes imply and '
      + 'this simulation gives them about six tenths of a hit fewer a game. Every other '
      + 'column on this sheet matches its real distribution by role.'));

    wrap.appendChild(goalieTable(side));

    // Scratched or injured, named on the sheet where a reader looks for them,
    // and given no statistical line.
    var out = side.did_not_play || [];
    if (out.length) {
      var dnp = el('div', 'dnp');
      dnp.appendChild(el('b', '', 'Not dressed: '));
      out.forEach(function (p, i) {
        var span = el('span');
        span.appendChild(el('span', 'tag', p.status === 'scratched' ? 'SCRATCHED' : 'INACTIVE'));
        span.appendChild(document.createTextNode(p.name + ' (' + p.reason + ')'
          + (i < out.length - 1 ? ' · ' : '')));
        dnp.appendChild(span);
      });
      wrap.appendChild(dnp);
    }
    return wrap;
  }

  /**
   * THE GOALTENDER'S OWN LINE, in the columns a goaltender is actually read in.
   *
   * He was a sentence before, which is fine for a recap and useless for a box
   * score: the decision, the shots faced and the save percentage are the whole
   * of how a goaltending night is judged and none of them could be scanned.
   *
   * An empty-net goal is shown separately and is not in his goals against, which
   * is the rule -- he was on the bench for it -- and the reason the goals in the
   * scoring summary can exceed what is charged to the two goaltenders.
   */
  function goalieTable(side) {
    var g = side.goalie;
    var wrap = el('div');
    wrap.appendChild(el('div', 'sechead', 'Goaltending'));
    wrap.appendChild(S.table([
      { h: 'Goaltender', fmt: function (r) {
        var w = el('span');
        w.appendChild(el('span', 'nm', r.name));
        if (r.shutout) w.appendChild(el('span', 'unit', 'SO'));
        return w;
      } },
      { h: 'DEC', title: 'Decision: win, loss, or a loss in overtime or the shootout',
        fmt: function (r) { return r.decision || '--'; } },
      { h: 'TOI', title: 'Time on ice', fmt: function (r) {
        var m = Math.floor(r.toi);
        var sec = Math.round((r.toi - m) * 60);
        return m + ':' + (sec < 10 ? '0' : '') + sec;
      } },
      { h: 'SA', k: 'shotsAgainst', title: 'Shots against' },
      { h: 'SV', k: 'saves', title: 'Saves' },
      { h: 'GA', k: 'goalsAgainst', title: 'Goals against, not counting empty-net goals' },
      { h: 'SV%', title: 'Save percentage',
        fmt: function (r) {
          return r.shotsAgainst ? r.savePct.toFixed(3).replace(/^0/, '') : '--';
        } },
      { h: 'EN', title: 'Goals scored into his empty net, which are not charged to him',
        fmt: function (r) { return r.emptyNetGoalsAgainst || 0; } },
    ], [g], { sortable: false }));

    wrap.appendChild(el('div', 'disc',
      (g.season
        ? g.name + ' came in on ' + g.season.gp + ' games, a '
          + g.season.savePct.toFixed(3).replace(/^0/, '') + ' save percentage and a '
          + g.season.gaa.toFixed(2) + ' goals-against average.'
        : g.name + ' has no qualifying season and started at replacement level.')
      + (g.emptyNetGoalsAgainst
        ? ' The empty-net goal is not charged to him: he was on the bench for it.'
        : '')));
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
    [[teams.away, d.matchup.away, 'away'], [teams.home, d.matchup.home, 'home']].forEach(function (pair) {
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
        // SCRATCHING A SKATER, which the engine could not do at all until now.
        //
        // The ice time goes to the men who remain, the next forward or
        // defenceman up comes off the bench, and the goal projection loses the
        // difference between what the scratch scored per sixty and what his
        // position-mates score per sixty. The goaltender is chosen separately,
        // in the control above the Run button, because he is not a scratch.
        { h: 'Scratch', fmt: function (r) {
          var b = document.createElement('button');
          b.type = 'button';
          var held = app.scenario[pair[2]].indexOf(String(r.id)) >= 0;
          b.className = 'outbtn' + (held ? ' on' : '');
          b.textContent = held ? 'Scratched' : 'Scratch';
          b.setAttribute('aria-pressed', held ? 'true' : 'false');
          b.setAttribute('aria-label', (held ? 'Dress ' : 'Scratch ') + r.name);
          b.addEventListener('click', function () { app.toggleOut(pair[2], r.id); });
          return b;
        } },
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
    var eff = d.projection && d.projection.scenario_effect;
    if (eff && eff.change && (app.scenario.home.length || app.scenario.away.length)) {
      var note = el('div', 'pill');
      note.textContent = 'Scratches moved the projected margin by '
        + S.signed(eff.change.projected_margin) + ' goals and the home win probability by '
        + S.signed(Math.round(eff.change.home_win_probability * 1000) / 10) + ' points. '
        + 'The lineup, the box score and the player ranges were all rebuilt without them.';
      wrap.appendChild(note);
      var reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'ghostbtn';
      reset.textContent = 'Dress everybody';
      reset.addEventListener('click', function () {
        if (app.clearScenario()) {
          var seed = app.lastResult && app.lastResult.meta ? app.lastResult.meta.seed : null;
          app.run(seed ? { seed: seed } : {});
        }
      });
      wrap.appendChild(reset);
    }
    wrap.appendChild(el('div', 'disc',
      'Availability comes from the roster feed at the last data refresh, and only designations from the last '
      + 'three weeks are honoured, because a months-old listing is history rather than news. It will not know '
      + 'about a late scratch, which is what Scratch is for: it asks the same question of any skater and '
      + 'rebuilds the projection without him. The starting goaltender is chosen above the Run button.'));
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

  /**
   * THE SCORING SUMMARY.
   *
   * Every line is an event the simulation played, in the order it played them,
   * with the strength it was played at. The shootout winner appears as its own
   * line marked SO: it belongs to no skater and is charged to no goaltender,
   * which is the actual rule, and leaving it out meant a reader could count the
   * goals listed and come up one short of the final score.
   */
  function scoringSummary(d) {
    var wrap = el('div');
    var plays = d.result.scoring_plays || [];
    var STRENGTH = {
      EV: 'Even strength', PP: 'Power play', SH: 'Short handed',
      EN: 'Empty net', SO: 'Shootout',
    };
    if (!plays.length) {
      wrap.appendChild(el('div', 'disc', 'No goals were scored in regulation or overtime.'));
      return wrap;
    }
    plays.forEach(function (r) {
      var row = el('div', 'evrow');
      row.appendChild(el('span', 'when', r.period + (r.time === '--' ? '' : ' ' + r.time)));
      var what = el('span', 'what');
      what.appendChild(el('b', '', d.matchup[r.team].abbr + ' '));
      if (r.strength === 'SO') {
        what.appendChild(document.createTextNode(
          'wins the shootout. Charged to no skater and no goaltender.'));
      } else {
        what.appendChild(document.createTextNode(r.scorer));
        if (r.scorer_goal_number > 1) {
          what.appendChild(el('span', 'tag', 'goal ' + r.scorer_goal_number));
        }
        what.appendChild(document.createTextNode(
          r.assists.length ? ' (' + r.assists.join(', ') + ')' : ' (unassisted)'));
      }
      row.appendChild(what);
      var right = el('span', 'score');
      right.appendChild(el('span', 'tag', STRENGTH[r.strength] || r.strength));
      right.appendChild(document.createTextNode(' ' + r.score.away + '-' + r.score.home));
      row.appendChild(right);
      wrap.appendChild(row);
    });
    wrap.appendChild(el('div', 'disc',
      'Every goal above is an event this simulation played, in the order it played '
      + 'them. The running score is the score after that goal, and it reconciles '
      + 'with the final.'));
    return wrap;
  }

  /**
   * THE PENALTY SUMMARY, including what the penalty actually produced.
   *
   * The infraction is drawn from how often each minor is really called; the
   * engine simulates that a penalty happened and who took it, not what he did to
   * earn it, and that is said plainly rather than implied. The manpower is
   * counted from the penalties running at that moment, so two men in the box
   * reads as five on three rather than being assumed to be five on four.
   */
  function penaltySummary(d) {
    var wrap = el('div');
    var pens = d.result.penalty_summary || [];
    if (!pens.length) {
      wrap.appendChild(el('div', 'disc', 'No penalties were called in this game.'));
      return wrap;
    }
    pens.forEach(function (r) {
      var row = el('div', 'evrow');
      row.appendChild(el('span', 'when', r.period + ' ' + r.time));
      var what = el('span', 'what');
      what.appendChild(el('b', '', d.matchup[r.team].abbr + ' '));
      what.appendChild(document.createTextNode(r.player + ' — ' + r.infraction
        + ', ' + r.minutes + ' minutes'));
      row.appendChild(what);
      row.appendChild(el('span', 'tag', r.manpower));
      wrap.appendChild(row);
    });
    var pp = { home: d.result.box_score.home.totals, away: d.result.box_score.away.totals };
    wrap.appendChild(el('div', 'disc',
      d.matchup.away.abbr + ' ' + pp.away.powerPlayGoals + ' for ' + pp.away.powerPlayOpportunities
      + ' on the power play, ' + d.matchup.home.abbr + ' ' + pp.home.powerPlayGoals + ' for '
      + pp.home.powerPlayOpportunities + '. The infraction is drawn from how often each '
      + 'minor is really called; this engine simulates that a penalty happened and who '
      + 'took it, not what he did to earn it. Everything counted against it -- the '
      + 'minutes, the power play, any goal it conceded -- came from the game.'));
    return wrap;
  }

  /** The three stars, as the game produced them. */
  function threeStars(d) {
    var wrap = el('div');
    var stars = d.result.three_stars || [];
    if (!stars.length) {
      wrap.appendChild(el('div', 'disc', 'No stars were awarded for this game.'));
      return wrap;
    }
    stars.forEach(function (st, i) {
      var row = el('div', 'evrow');
      row.appendChild(el('span', 'when', (i + 1) + (i === 0 ? 'st' : (i === 1 ? 'nd' : 'rd'))));
      var what = el('span', 'what');
      what.appendChild(el('b', '', st.name));
      what.appendChild(document.createTextNode(' — ' + (st.line || '')));
      row.appendChild(what);
      row.appendChild(el('span', 'tag', d.matchup[st.team] ? d.matchup[st.team].abbr : ''));
      wrap.appendChild(row);
    });
    wrap.appendChild(el('div', 'disc',
      'Awarded on what happened in this game. A goaltender is judged on volume and '
      + 'rate together, so a shutout on eighteen shots does not outrank a forty-save '
      + 'night; a skater on points, with a goal worth more than an assist.'));
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

  /**
   * A notice, but only when there is something to notice.
   *
   * When the season snapshot is current this says nothing at all, because a
   * banner that is always on the page is furniture and stops being read. When
   * the data has aged past a couple of days it says so plainly, in the same
   * place, every time. The one thing this must never do is let a confident
   * scoreline imply a roster that has moved on.
   */
  function freshnessNotice(d) {
    var f = d.meta && d.meta.data_freshness;
    if (!f) return null;
    // ALWAYS SAY IT, not only when it is bad news.
    //
    // This used to render nothing while the data was current, so in the normal
    // case a visitor was never told how old the rosters were or where they came
    // from -- the label only appeared once there was something to apologise for.
    // A page that states its provenance only when embarrassed has not stated it.
    var box = el('div', 'freshness ' + (f.is_current ? 'ok' : (f.status === 'stale' ? 'stale' : 'ageing')));
    box.setAttribute('role', 'status');
    box.appendChild(el('strong', '',
      f.is_current ? 'Data' : (f.status === 'stale' ? 'Out of date' : 'Ageing data')));
    var tail = ' ' + f.label;
    if (d.meta.data_source) tail += '. Source: ' + d.meta.data_source;
    if (d.meta.season) tail += '. Season ' + d.meta.season;
    else if (d.meta.stats_season) tail += '. Stats ' + d.meta.stats_season;
    box.appendChild(el('span', '', tail + '.'));
    return box;
  }

  /**
   * The win-probability line, drawn from the game that was played.
   *
   * Every point is a state the simulation actually reached. Labelled at both
   * ends and at the extremes rather than everywhere, because a line with a
   * number on every point is a table pretending to be a chart.
   */
  function winProbChart(d) {
    var pts = d.result.win_probability_track || [];
    var wrap = el('div');
    if (pts.length < 3) return wrap;

    var W = 720, H = 200, PAD = 34;
    var svg = S.svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'wpchart',
      role: 'img', 'aria-label':
        'Win probability for ' + d.matchup.home.name + ' through the simulated game, '
        + 'starting at ' + Math.round(pts[0].home_win_probability * 100)
        + ' per cent and ending at ' + Math.round(pts[pts.length - 1].home_win_probability * 100) + ' per cent.' });

    var xOf = function (i) { return PAD + (i / (pts.length - 1)) * (W - PAD * 2); };
    var yOf = function (p) { return PAD + (1 - p) * (H - PAD * 2); };

    // The even line, so a reader can see which side of it the game sat on.
    svg.appendChild(S.svgEl('line', { x1: PAD, x2: W - PAD, y1: yOf(0.5), y2: yOf(0.5),
      class: 'wp-even' }));

    var dpath = '';
    for (var i = 0; i < pts.length; i += 1) {
      dpath += (i ? ' L ' : 'M ') + xOf(i).toFixed(1) + ' ' + yOf(pts[i].home_win_probability).toFixed(1);
    }
    svg.appendChild(S.svgEl('path', { d: dpath, class: 'wp-line' }));

    [[PAD, yOf(1), '100%'], [PAD, yOf(0.5), '50%'], [PAD, yOf(0), '0%']].forEach(function (t) {
      var lab = S.svgEl('text', { x: t[0] - 6, y: t[1] + 4, class: 'wp-axis', 'text-anchor': 'end' });
      lab.textContent = t[2];
      svg.appendChild(lab);
    });

    wrap.appendChild(svg);
    wrap.appendChild(el('div', 'disc',
      'The chance ' + d.matchup.home.name + ' wins, at each point of the simulated game shown above. '
      + 'Computed from the score and the time left with the same spread the projection uses, '
      + 'not fitted to the result afterwards.'));
    return wrap;
  }

  /**
   * THE PROP EXPLORER.
   *
   * The old panel showed a median, a range and one hard-coded line, and the line
   * was whichever round number seemed reasonable when it was written. Nobody
   * shops a 20-point line because it is round; they shop it because that is what
   * is posted, and the number posted is rarely the number that was guessed here.
   *
   * So the line is typed in. Every stat here is a count and the engine publishes
   * the whole distribution, so any line can be answered exactly by counting the
   * replays on each side of it -- no curve, no interpolation, and a push reported
   * as a push. Change the stat or the number and the whole column recomputes
   * without going back to the server, because the distribution is already here.
   */
  function propExplorer(d, cfg) {
    var pd = d.result.player_distributions;
    var wrap = el('div');
    if (!pd) {
      wrap.appendChild(el('div', 'disc',
        d.projection && d.projection.sample_supports_projection === false
          ? 'Single-game mode plays one game, so there is no distribution to describe. '
            + 'Choose 100 or more simulations to see player ranges.'
          : 'Player ranges are unavailable for this run.'));
      return wrap;
    }

    var stat = cfg.stats[0];
    var lines = {};        // player name -> the line being asked about
    var body = el('div');

    var bar = el('div', 'propbar');
    var lab = el('label', 'fld');
    lab.appendChild(el('span', '', 'Market'));
    var sel = document.createElement('select');
    cfg.stats.forEach(function (st) {
      var o = document.createElement('option');
      o.value = st.id;
      o.textContent = st.label;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      stat = cfg.stats.filter(function (x) { return x.id === sel.value; })[0] || cfg.stats[0];
      lines = {};
      draw();
    });
    lab.appendChild(sel);
    bar.appendChild(lab);
    wrap.appendChild(bar);
    wrap.appendChild(body);

    function half(v) { return Math.max(0.5, Math.round(v) - 0.5); }

    function rowsFor(side) {
      var rows = (pd[side] || []).slice();
      if (cfg.goalieStats && pd.goalies && pd.goalies[side]
        && cfg.goalieStats.indexOf(stat.id) >= 0) {
        rows = [pd.goalies[side]];
      }
      return rows.filter(function (r) { return r.stats && r.stats[stat.id]; });
    }

    function draw() {
      body.innerHTML = '';
      ['away', 'home'].forEach(function (side) {
        var rows = rowsFor(side);
        if (!rows.length) return;
        body.appendChild(el('div', 'sechead', d.matchup[side].name));
        body.appendChild(S.table([
          { h: 'Player', fmt: function (r) { return r.name; } },
          { h: 'Median', fmt: function (r) { return r.stats[stat.id].median; },
            title: 'Median across the replays' },
          { h: 'Range', fmt: function (r) {
            var v = r.stats[stat.id];
            return v.p10 + ' – ' + v.p90;
          }, title: 'Tenth to ninetieth percentile' },
          { h: 'Line', fmt: function (r) {
            var v = r.stats[stat.id];
            if (lines[r.name] === undefined) lines[r.name] = half(v.median);
            return S.lineInput(lines[r.name], function (n) {
              lines[r.name] = n;
              draw();
            });
          } },
          { h: 'Over', fmt: function (r) {
            var ou = S.overUnder(r.stats[stat.id].dist, lines[r.name]);
            return ou ? (ou.over * 100).toFixed(1) + '%' : '—';
          } },
          { h: 'Under', fmt: function (r) {
            var ou = S.overUnder(r.stats[stat.id].dist, lines[r.name]);
            return ou ? (ou.under * 100).toFixed(1) + '%' : '—';
          } },
          { h: 'Push', fmt: function (r) {
            var ou = S.overUnder(r.stats[stat.id].dist, lines[r.name]);
            if (!ou) return '—';
            return ou.push > 0 ? (ou.push * 100).toFixed(1) + '%' : '—';
          }, title: 'A whole-number line the player lands on exactly' },
        ], rows));
      });
      body.appendChild(el('div', 'disc',
        'From ' + pd.runs + ' complete replays of this matchup, counted directly: '
        + 'a probability here is the share of those replays on that side of the line, '
        + 'not a curve fitted to them. At ' + pd.runs + ' replays a stated percentage '
        + 'carries about ' + (100 / (2 * Math.sqrt(pd.runs))).toFixed(1)
        + ' points of sampling error. The replays where a player had a big night are the '
        + 'same replays where his team scored a lot, so the numbers move together the way '
        + 'they do in a real game.'));
    }
    draw();
    return wrap;
  }

  var PROP_CFG = {
    stats: [
      { id: 'points', label: 'Points' },
      { id: 'goals', label: 'Goals' },
      { id: 'assists', label: 'Assists' },
      { id: 'shots', label: 'Shots on goal' },
      { id: 'saves', label: 'Goaltender saves' },
      { id: 'goals_against', label: 'Goals against' },
    ],
    // Markets that belong to the man in net rather than the skaters. Saves is
    // the largest single prop market in the sport and the old panel did not
    // carry it at all, because the collector only ever looked at skaters.
    goalieStats: ['saves', 'goals_against', 'shots_against'],
  };

  function propsPanel(d) {
    return propExplorer(d, PROP_CFG);
  }

  /** What the projection is resting on. */
  function sensitivityPanel(d) {
    var s2 = d.projection.sensitivity;
    var wrap = el('div');
    if (!s2 || !s2.inputs || !s2.inputs.length) return wrap;
    wrap.appendChild(S.table([
      { h: 'If this is wrong', fmt: function (r) { return r.input; } },
      { h: 'By', fmt: function (r) { return r.moved_by; } },
      { h: 'Score moves', fmt: function (r) { return r.margin_swing.toFixed(1); } },
      { h: 'Win chance moves', fmt: function (r) { return (r.win_probability_swing * 100).toFixed(1) + ' pts'; } },
      { h: 'Changes the pick', fmt: function (r) { return r.flips_the_pick ? 'Yes' : 'No'; } },
    ], s2.inputs));
    wrap.appendChild(el('div', 'disc', s2.note));
    return wrap;
  }

  /**
   * Share and print.
   *
   * The page already rewrites its own address as a simulation runs, seed
   * included, so a shared link reproduces the exact game rather than a fresh
   * one -- that is the whole reason the seed is in the URL. This just makes that
   * reachable without asking a reader to know it.
   *
   * Print opens every tab first. A reader holding paper cannot click a tab, so a
   * printed report that contains only whichever one happened to be open is not a
   * report.
   */
  /**
   * The four things to do with a finished result. The print handler expands
   * every tab into the flow first, so a printed page carries the whole box
   * score rather than whichever section happened to be open.
   */
  function resultBar(app, d) {
    return S.actionBar(app, {
      beforePrint: function () {
        var host = S.$('#result');
        var bars = host ? S.$$('.tabs', host) : [];
        bars.forEach(function (barEl) {
          var buttons = S.$$('button', barEl);
          var body = barEl.nextSibling;
          if (!body || buttons.length < 2) return;
          // Render every tab into the flow, each under its own heading, so the
          // printed page carries the whole result.
          var holder = el('div', 'printonly');
          buttons.forEach(function (b) {
            if (b.classList.contains('on')) return;
            var section = el('div');
            section.appendChild(el('div', 'sechead', b.textContent));
            b.click();
            var clone = body.cloneNode(true);
            section.appendChild(clone);
            holder.appendChild(section);
          });
          // Put the originally-open tab back for the person still at the screen.
          if (buttons[0]) buttons[0].click();
          barEl.parentNode.appendChild(holder);
        });
      },
    });
  }

  /**
   * IMPORTANT EVENTS: the goals that actually changed the game.
   *
   * Every goal is in the scoring summary; this is the shorter list a reader
   * wants first -- the opener, the ones that tied it or took the lead, the
   * winner, and the empty-netter that finished it. Each is picked by what it did
   * to the score, so nothing here is a judgement the game did not make.
   */
  function importantEvents(d) {
    var wrap = el('div');
    var plays = d.result.scoring_plays || [];
    if (!plays.length) {
      wrap.appendChild(el('div', 'disc', 'Nothing was scored in this game.'));
      return wrap;
    }
    var out = [];
    var prev = { home: 0, away: 0 };
    plays.forEach(function (r, i) {
      var was = prev.home - prev.away;
      var now = r.score.home - r.score.away;
      var label = null;
      if (i === 0) label = 'opening goal';
      else if (was !== 0 && now === 0) label = 'ties it';
      else if (was < 0 && now > 0) label = 'takes the lead';
      else if (was > 0 && now < 0) label = 'takes the lead';
      if (r.strength === 'EN') label = 'empty net';
      if (r.strength === 'SO') label = 'wins it in the shootout';
      prev = { home: r.score.home, away: r.score.away };
      if (label) out.push({ r: r, label: label });
    });
    // The goal that put the winner ahead for good.
    var winner = d.result.winner;
    var decisive = null;
    for (var i = plays.length - 1; i >= 0; i -= 1) {
      var m = plays[i].score.home - plays[i].score.away;
      var ahead = winner === 'home' ? m > 0 : m < 0;
      if (!ahead) break;
      decisive = plays[i];
    }
    if (decisive && !out.some(function (x) { return x.r === decisive; })) {
      out.push({ r: decisive, label: 'the winner' });
    }
    out.sort(function (a, b) { return plays.indexOf(a.r) - plays.indexOf(b.r); });

    out.forEach(function (x) {
      var row = el('div', 'evrow');
      row.appendChild(el('span', 'when', x.r.period + (x.r.time === '--' ? '' : ' ' + x.r.time)));
      var what = el('span', 'what');
      what.appendChild(el('b', '', d.matchup[x.r.team].abbr + ' '));
      what.appendChild(document.createTextNode(
        x.r.strength === 'SO' ? 'wins the shootout' : x.r.scorer));
      row.appendChild(what);
      var right = el('span', 'score');
      right.appendChild(el('span', 'tag', x.label));
      right.appendChild(document.createTextNode(' ' + x.r.score.away + '-' + x.r.score.home));
      row.appendChild(right);
      wrap.appendChild(row);
    });
    wrap.appendChild(el('div', 'disc',
      'Chosen by what each goal did to the score -- opened it, tied it, took the '
      + 'lead, finished it -- rather than by any judgement of importance the game '
      + 'did not make. The full list is under Scoring summary.'));
    return wrap;
  }


  /** The broadcast view. See the note in the basketball app. */
  function renderBroadcast(app, d, box) {
    var away = d.matchup.away;
    var home = d.matchup.home;
    var ls = d.result.line_score;
    var winner = d.result.winner;
    var decided = d.result.decided_in || 'regulation';
    var rec = function (t) {
      return t.record
        ? t.record.wins + '-' + t.record.losses + '-' + t.record.otLosses
        : null;
    };
    var cols = ['1', '2', '3'];
    var aw = (ls.periods && ls.periods.away ? ls.periods.away.slice(0, 3) : []);
    var hm = (ls.periods && ls.periods.home ? ls.periods.home.slice(0, 3) : []);
    if (decided === 'overtime') {
      cols.push('OT');
      aw = aw.concat([ls.overtime_goals ? ls.overtime_goals.away : 0]);
      hm = hm.concat([ls.overtime_goals ? ls.overtime_goals.home : 0]);
    } else if (decided === 'shootout') {
      cols.push('OT', 'SO');
      aw = aw.concat([0, ls.shootout_goals ? ls.shootout_goals.away : 0]);
      hm = hm.concat([0, ls.shootout_goals ? ls.shootout_goals.home : 0]);
    }

    box.appendChild(S.scoreboard({
      away: away,
      home: home,
      score: { away: d.result.final.away, home: d.result.final.home },
      records: { away: rec(away), home: rec(home) },
      winner: winner,
      status: decided === 'regulation' ? 'Final'
        : (decided === 'overtime' ? 'Final/OT' : 'Final/SO'),
      subStatus: 'Simulated · ' + (d.meta.simulations || 0).toLocaleString() + ' runs',
      line: { cols: cols, away: aw, home: hm },
      footnote: rosterFootnote(d),
    }));

    box.appendChild(resultBar(app, d));

    var tabsBox = el('div', 'panel');
    S.tabs(tabsBox, [
      { id: 'summary', label: 'Game summary', build: function (node) {
        if (d.recap) node.appendChild(S.panel('How it played out', recapPanel(d)));
        if (d.result.leaders) node.appendChild(S.panel('Game leaders', leadersPanel(d)));
      } },
      { id: 'box', label: 'Box score', build: function (node) {
        d.result.box_score.away.team = away;
        d.result.box_score.home.team = home;
        node.appendChild(skaterTable(d.result.box_score.away, away.name));
        var sp = el('div'); sp.style.height = '18px'; node.appendChild(sp);
        node.appendChild(skaterTable(d.result.box_score.home, home.name));
      } },
      { id: 'team', label: 'Team stats', build: function (node) { node.appendChild(teamStats(d)); } },
      { id: 'scoring', label: 'Scoring summary', build: function (node) {
        node.appendChild(scoringSummary(d));
      } },
      { id: 'penalties', label: 'Penalty summary', build: function (node) {
        node.appendChild(penaltySummary(d));
      } },
      { id: 'goalies', label: 'Goaltenders', build: function (node) {
        ['away', 'home'].forEach(function (k) {
          var blk = el('div');
          var hd = el('div', 'teamhead');
          hd.appendChild(S.crest(d.matchup[k], 26));
          hd.appendChild(el('div', 'nm', d.matchup[k].name));
          blk.appendChild(hd);
          blk.appendChild(goalieTable(d.result.box_score[k]));
          node.appendChild(blk);
        });
      } },
      { id: 'stars', label: 'Three stars', build: function (node) {
        node.appendChild(threeStars(d));
      } },
      { id: 'events', label: 'Important events', build: function (node) {
        node.appendChild(importantEvents(d));
      } },
      { id: 'analysis', label: 'Simulation analysis', build: function (node) {
        node.appendChild(S.panel('What it rests on', sensitivityPanel(d)));
        node.appendChild(S.panel('Why the model moved', S.driverCards(d.drivers)));
      } },
    ]);
    box.appendChild(tabsBox);
  }

  /** The one line that says where the data came from and how old it is. */
  function rosterFootnote(d) {
    var r = d.meta && d.meta.roster;
    var f = d.meta && d.meta.data_freshness;
    var bits = [];
    if (f && f.label) bits.push(f.label);
    if (d.meta && d.meta.data_source) bits.push('Source: ' + d.meta.data_source);
    if (r && r.starters) bits.push('Starters ' + r.starters);
    return bits.join(' · ');
  }

  function render(app, d, box) {
    box.appendChild(S.viewToggle(app));
    if (S.currentView() === 'box') { renderBroadcast(app, d, box); return; }
    var p = d.projection;
    var away = d.matchup.away;
    var home = d.matchup.home;
    var decided = d.result.decided_in === 'regulation' ? 'Final'
      : (d.result.decided_in === 'overtime' ? 'Final in overtime' : 'Final in a shootout');

    var fresh = freshnessNotice(d);
    if (fresh) box.appendChild(fresh);

    box.appendChild(resultBar(app, d));

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

    box.appendChild(S.kpis(p.sample_supports_projection === false ? [
      { k: 'Final', v: d.result.final.away + ' - ' + d.result.final.home,
        s: 'One game, played out shift by shift'
          + (d.result.decided_in && d.result.decided_in !== 'regulation'
            ? ', decided in ' + d.result.decided_in : '') },
      { k: 'Pregame win probability', v: pct(p.win_probability.home, 1),
        s: home.abbr + ', from the rating model rather than this game' },
      { k: 'Shots in the game', v: (d.result.box_score.away.team_stats
        ? d.result.box_score.away.team_stats.shots + d.result.box_score.home.team_stats.shots
        : '—'), s: 'Both sides combined' },
    ] : [
      { k: 'Projected score', v: n2(p.projected_score.away) + ' - ' + n2(p.projected_score.home),
        s: away.abbr + ' at ' + home.abbr },
      { k: 'Projected total', v: n2(p.total.mean),
        s: 'Middle half ' + p.total.p25 + ' to ' + p.total.p75 },
      { k: 'Reaches overtime', v: pct(p.overtime_share, 0),
        s: pct(p.shootout_share, 0) + ' go to a shootout' },
      { k: 'Shutout in the game', v: pct(p.shutout_share, 0),
        s: 'Either goaltender' },
    ]));



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
    var panes = [
      // GAME SUMMARY OPENS FIRST and is complete on its own: what happened, the
      // goals in order, the stars and the period scores, without a click.
      { id: 'summary', label: 'Game summary', build: function (node) {
        if (d.result.leaders) node.appendChild(S.panel('Game leaders', leadersPanel(d)));
        node.appendChild(S.panel('Scoring summary', scoringSummary(d)));
        node.appendChild(S.panel('Three stars', threeStars(d)));
        node.appendChild(S.panel('Scoring by period', lineScore(d)));
      } },
      { id: 'penalties', label: 'Penalty summary', build: function (node) {
        node.appendChild(penaltySummary(d));
      } },
      { id: 'skaters', label: 'Skaters', build: function (node) {
        d.result.box_score.away.team = away;
        d.result.box_score.home.team = home;
        node.appendChild(skaterTable(d.result.box_score.away, away.name));
        var sp = el('div'); sp.style.height = '18px'; node.appendChild(sp);
        node.appendChild(skaterTable(d.result.box_score.home, home.name));
      } },
      { id: 'goalies', label: 'Goaltenders', build: function (node) {
        d.result.box_score.away.team = away;
        d.result.box_score.home.team = home;
        ['away', 'home'].forEach(function (k) {
          var block = el('div');
          block.appendChild(el('div', 'teamhead'));
          block.lastChild.appendChild(S.crest(d.matchup[k], 26));
          block.lastChild.appendChild(el('div', 'nm', d.matchup[k].name));
          block.appendChild(goalieTable(d.result.box_score[k]));
          node.appendChild(block);
        });
      } },
      { id: 'stars', label: 'Three stars', build: function (node) {
        node.appendChild(threeStars(d));
      } },
      { id: 'events', label: 'Important events', build: function (node) {
        node.appendChild(importantEvents(d));
      } },
      { id: 'box', label: 'Full box score', build: function (node) {
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
      { id: 'wp', label: 'Win probability', build: function (node) {
        node.appendChild(winProbChart(d));
      } },
      { id: 'props', label: 'Player ranges', build: function (node) {
        node.appendChild(propsPanel(d));
      } },
      { id: 'sens', label: 'Simulation analysis', build: function (node) {
        node.appendChild(sensitivityPanel(d));
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
    ];
    // THE ORDER THE SECTIONS ARE ASKED FOR IN.
    //
    // Sorted rather than declared in order, because the build functions above
    // are grouped by what they need and reordering them by hand invites a pane
    // being lost in the move. Anything not named here keeps its place after the
    // ones that are.
    var ORDER = ['summary', 'box', 'team', 'scoring', 'penalties', 'skaters', 'goalies',
      'stars', 'events', 'props', 'sens', 'scores', 'wp', 'charts', 'range',
      'why', 'season', 'avail'];
    panes.sort(function (a, b) {
      var ai = ORDER.indexOf(a.id);
      var bi = ORDER.indexOf(b.id);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });

    // A SINGLE GAME HAS NO DISTRIBUTION TO SHOW.
    //
    // These three panels describe the shape of many runs: the most common
    // finals, the histograms, the percentile ladder. In single-game mode the
    // engine publishes none of it, deliberately, so the tabs that would present
    // it are not offered rather than opened onto an empty box.
    if (d.projection.sample_supports_projection === false) {
      panes = panes.filter(function (t) {
        return ['scores', 'charts', 'range'].indexOf(t.id) < 0;
      });
    }
    S.tabs(tabsBox, panes);
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
