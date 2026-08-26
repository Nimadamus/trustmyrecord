/* nba-simulator-app.js -- the basketball half of the NBA simulator page.
 *
 * Everything that is not basketball (fetching, selectors, simulation count,
 * venue, Simulate Again, error states, table and chart primitives) lives in
 * tmr-sim-core.js. This file only says what a basketball result looks like.
 */
(function () {
  'use strict';

  var S = window.TMRSim;
  var el = S.el;
  var pct = S.pct;

  function n1(v) { return (Math.round(v * 10) / 10).toFixed(1); }

  /* ---------- box score ---------------------------------------------------- */

  var BOX_COLS = [
    { h: 'Player', fmt: function (p) {
      var wrap = el('span');
      wrap.appendChild(el('span', 'nm', p.name));
      if (p.pos) wrap.appendChild(el('span', 'pos', p.pos));
      return wrap;
    } },
    { h: 'MIN', fmt: function (p) { return n1(p.min); } },
    { h: 'PTS', k: 'pts' },
    { h: 'FG', fmt: function (p) { return p.fgm + '-' + p.fga; } },
    { h: 'FG%', fmt: function (p) { return p.fga ? p.fgPct.toFixed(1) : '--'; } },
    { h: '3PT', fmt: function (p) { return p.tpm + '-' + p.tpa; } },
    { h: '3P%', fmt: function (p) { return p.tpa ? p.threePct.toFixed(1) : '--'; } },
    { h: 'FT', fmt: function (p) { return p.ftm + '-' + p.fta; } },
    { h: 'FT%', fmt: function (p) { return p.fta ? p.ftPct.toFixed(1) : '--'; } },
    { h: 'OREB', k: 'oreb' },
    { h: 'DREB', k: 'dreb' },
    { h: 'REB', k: 'reb' },
    { h: 'AST', k: 'ast' },
    { h: 'STL', k: 'stl' },
    { h: 'BLK', k: 'blk' },
    { h: 'TO', k: 'tov' },
    { h: 'PF', fmt: function (p) { return p.fouledOut ? p.pf + ' (out)' : p.pf; } },
    { h: '+/-', fmt: function (p) { return S.signed(p.plusMinus, 0); } },
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
        colorOf: function (b) { return b.bucket + b.width / 2 > 0 ? homeColor : awayColor; },
        labelOf: function (b) {
          var lo = b.bucket;
          var hi = b.bucket + b.width - 1;
          return lo > 0 ? home.abbr + ' by ' + lo + ' to ' + hi
            : (hi < 0 ? away.abbr + ' by ' + Math.abs(hi) + ' to ' + Math.abs(lo) : 'within a possession');
        },
        tickOf: function (b) {
          if (b.bucket <= 0 && b.bucket + b.width > 0) return 'level';
          return b.bucket > 0 ? home.abbr + ' +' + b.bucket : away.abbr + ' +' + Math.abs(b.bucket + b.width - 1);
        },
      }),
      [{ color: awayColor, label: away.abbr + ' wins' }, { color: homeColor, label: home.abbr + ' wins' }],
    ));

    grid.appendChild(S.chartCard(
      'Total points',
      S.histogram(p.distributions.total, {
        title: 'Distribution of the combined score',
        colorOf: function () { return '#38bdf8'; },
        labelOf: function (b) { return b.bucket + ' to ' + (b.bucket + b.width - 1) + ' points'; },
      }),
      [{ color: '#38bdf8', label: 'Median ' + p.total.p50 }],
    ));

    grid.appendChild(S.chartCard(
      'Cover probability by line',
      S.curve(p.distributions.coverCurve.map(function (c) { return { x: c.line, y: c.homeCovers }; }), {
        title: 'How often the home team wins by more than each line',
        stroke: homeColor,
        labelOf: function (pt) {
          return home.abbr + ' by more than ' + pt.x + ': ' + pct(pt.y, 1);
        },
        tickOf: function (pt) { return pt.x > 0 ? '+' + pt.x : String(pt.x); },
      }),
      [{ color: homeColor, label: home.abbr + ' wins by more than the line' }],
    ));

    return grid;
  }

  function boxTable(side, teamName) {
    var rows = side.players.map(function (p, i) {
      var r = Object.assign({}, p);
      // The first bench player gets the visible break.
      if (i > 0 && side.players[i - 1].starter && !p.starter) r._class = 'groupsplit';
      return r;
    });
    var t = side.totals;
    var footer = {
      name: 'TEAM', min: t.min, pts: t.pts, fgm: t.fgm, fga: t.fga, fgPct: t.fgPct,
      tpm: t.tpm, tpa: t.tpa, threePct: t.threePct, ftm: t.ftm, fta: t.fta, ftPct: t.ftPct,
      oreb: t.oreb, dreb: t.dreb, reb: t.reb, ast: t.ast, stl: t.stl, blk: t.blk,
      tov: t.tov, pf: t.pf, plusMinus: 0,
    };
    var wrap = el('div');
    var head = el('div', 'teamhead');
    if (side.team) head.appendChild(S.crest(side.team, 30));
    head.appendChild(el('div', 'nm', teamName));
    head.appendChild(el('div', 'rec', t.pts + ' points on ' + t.fga + ' shots, '
      + t.teamRebounds + ' team rebounds'));
    wrap.appendChild(head);
    wrap.appendChild(S.table(BOX_COLS, rows, { footer: footer }));
    return wrap;
  }

  /* ---------- line score --------------------------------------------------- */

  function lineScore(d) {
    var q = d.result.line_score.quarters;
    var ot = d.result.line_score.overtime;
    var cols = [{ h: '' }];
    for (var i = 0; i < 4; i += 1) cols.push({ h: 'Q' + (i + 1), k: 'q' + i });
    for (var j = 0; j < ot.home.length; j += 1) cols.push({ h: 'OT' + (ot.home.length > 1 ? (j + 1) : ''), k: 'ot' + j });
    cols.push({ h: 'Final', k: 'final' });

    var mk = function (side, name) {
      var r = { name: name, final: '<b>' + d.result.final[side] + '</b>' };
      q[side].forEach(function (v, i) { r['q' + i] = v; });
      ot[side].forEach(function (v, i) { r['ot' + i] = v; });
      return r;
    };
    cols[0].fmt = function (r) { return r.name; };
    var wrap = el('div', 'linescore');
    wrap.appendChild(S.table(cols, [
      mk('away', d.matchup.away.name),
      mk('home', d.matchup.home.name),
    ]));
    return wrap;
  }

  /* ---------- team stats --------------------------------------------------- */

  function teamStats(d) {
    var a = d.result.box_score.away.totals;
    var h = d.result.box_score.home.totals;
    var wrap = el('div');
    wrap.appendChild(S.compare([
      { label: 'Points', away: a.pts, home: h.pts },
      { label: 'FG made', away: a.fgm, home: h.fgm },
      { label: 'FG%', away: a.fgPct, home: h.fgPct, fmt: function (v) { return v.toFixed(1) + '%'; } },
      { label: 'eFG%', away: a.efgPct, home: h.efgPct, fmt: function (v) { return v.toFixed(1) + '%'; } },
      { label: '3PT made', away: a.tpm, home: h.tpm },
      { label: '3PT%', away: a.threePct, home: h.threePct, fmt: function (v) { return v.toFixed(1) + '%'; } },
      { label: 'FT made', away: a.ftm, home: h.ftm },
      { label: 'FT%', away: a.ftPct, home: h.ftPct, fmt: function (v) { return v.toFixed(1) + '%'; } },
      { label: 'Off reb', away: a.oreb, home: h.oreb },
      { label: 'Def reb', away: a.dreb, home: h.dreb },
      { label: 'Rebounds', away: a.reb, home: h.reb },
      { label: 'Assists', away: a.ast, home: h.ast },
      { label: 'Steals', away: a.stl, home: h.stl },
      { label: 'Blocks', away: a.blk, home: h.blk },
      { label: 'Turnovers', away: a.tov, home: h.tov },
      { label: 'Fouls', away: a.pf, home: h.pf },
    ]));

    var s = el('div', 'statstrip');
    [
      ['Possessions', d.result.possessions],
      ['Projected pace', n1(d.matchup.projected_pace)],
      ['Away off rating', n1(d.matchup.projected_offensive_rating.away)],
      ['Home off rating', n1(d.matchup.projected_offensive_rating.home)],
    ].forEach(function (p) {
      var c = el('div', 'cell');
      c.appendChild(el('div', 'k', p[0]));
      c.appendChild(el('div', 'v', String(p[1])));
      s.appendChild(c);
    });
    wrap.appendChild(s);
    return wrap;
  }

  /* ---------- season profile ---------------------------------------------- */

  function seasonProfile(d) {
    var a = d.matchup.away.season;
    var h = d.matchup.home.season;
    var wrap = el('div');
    wrap.appendChild(el('p', 'dim',
      'Season inputs the model ran on, from the ' + d.meta.season + ' regular season.'));
    wrap.appendChild(S.compare([
      { label: 'Points', away: a.ppg, home: h.ppg, fmt: function (v) { return v.toFixed(1); } },
      { label: 'Allowed', away: a.oppPpg, home: h.oppPpg, fmt: function (v) { return v.toFixed(1); } },
      { label: 'Pace', away: a.pace, home: h.pace, fmt: function (v) { return v.toFixed(1); } },
      { label: 'Off rating', away: a.offensiveRating, home: h.offensiveRating, fmt: function (v) { return v.toFixed(1); } },
      { label: 'Def rating', away: a.defensiveRating, home: h.defensiveRating, fmt: function (v) { return v.toFixed(1); } },
      { label: '3PT rate', away: a.threePointRate, home: h.threePointRate, fmt: function (v) { return (v * 100).toFixed(1) + '%'; } },
      { label: 'TO rate', away: a.turnoverRate, home: h.turnoverRate, fmt: function (v) { return (v * 100).toFixed(1) + '%'; } },
      { label: 'Off reb rate', away: a.offensiveReboundRate, home: h.offensiveReboundRate, fmt: function (v) { return (v * 100).toFixed(1) + '%'; } },
    ]));
    return wrap;
  }

  /**
   * Who is in the rotation and who is out. The roster feed carries an injury
   * status per player and the model already removes anyone ruled out; this is
   * the page finally saying so instead of silently dropping them.
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
        block.appendChild(el('p', 'dim', 'Rotation detail is unavailable for this team.'));
        wrap.appendChild(block);
        return;
      }
      block.appendChild(S.table(
        [
          { h: 'In the rotation', fmt: function (r) { return r.name; } },
          { h: 'Pos', k: 'pos' },
          { h: 'MIN', fmt: function (r) { return r.minutes.toFixed(1); } },
          { h: 'PPG', fmt: function (r) { return r.season.ppg.toFixed(1); } },
          { h: 'RPG', fmt: function (r) { return r.season.rpg.toFixed(1); } },
          { h: 'APG', fmt: function (r) { return r.season.apg.toFixed(1); } },
          // ASKING THE QUESTION, not just reading the answer.
          //
          // The API has accepted a held-out rotation all along and recomputes
          // the whole projection around it -- minutes, shots, turnovers, the
          // lot. Nothing on the page could reach it, so the panel could only
          // report what the feed already knew and never what the visitor wanted
          // to know. This is that control.
          { h: 'Hold out', fmt: function (r) {
            var b = document.createElement('button');
            b.type = 'button';
            var held = app.scenario[pair[2]].indexOf(String(r.id)) >= 0;
            b.className = 'outbtn' + (held ? ' on' : '');
            b.textContent = held ? 'Out' : 'Hold out';
            b.setAttribute('aria-pressed', held ? 'true' : 'false');
            b.setAttribute('aria-label', (held ? 'Bring back ' : 'Hold out ') + r.name);
            b.addEventListener('click', function () { app.toggleOut(pair[2], r.id); });
            return b;
          } },
        ],
        full.rotation,
      ));
      var out = full.unavailable || [];
      block.appendChild(el('p', out.length ? 'pill warn' : 'dim',
        out.length
          ? 'Out: ' + out.map(function (x) { return x.name; }).join(', ')
          : 'Nobody in this rotation is listed out.'));
      wrap.appendChild(block);
      var sp = el('div');
      sp.style.height = '16px';
      wrap.appendChild(sp);
    });
    var eff = d.projection && d.projection.scenario_effect;
    if (eff && (app.scenario.home.length || app.scenario.away.length)) {
      var note = el('div', 'pill');
      var ch = eff.change || {};
      var wp = ch.home_win_probability;
      note.textContent = 'Holding players out moved the projected margin by '
        + S.signed(ch.projected_margin) + ' points and the home win probability by '
        + S.signed(Math.round(wp * 1000) / 10) + ' points. '
        + 'Everything on this page was recomputed from the shortened rotation.';
      wrap.appendChild(note);
      var reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'ghostbtn';
      reset.textContent = 'Put everybody back';
      reset.addEventListener('click', function () {
        if (app.clearScenario()) {
          var seed = app.lastResult && app.lastResult.meta ? app.lastResult.meta.seed : null;
          app.run(seed ? { seed: seed } : {});
        }
      });
      wrap.appendChild(reset);
    }
    wrap.appendChild(el('div', 'disc',
      'Availability comes from the roster feed at the last data refresh. A player ruled out is removed from '
      + 'the rotation and his minutes pass to the next player up. It will not know about a late scratch, '
      + 'which is what Hold out is for: it asks the same question of any player, and the projection, box '
      + 'score and player ranges are all rebuilt without him.'));
    return wrap;
  }

  /* ---------- the whole result -------------------------------------------- */

  /**
   * How the game went, in a sentence, plus who led it.
   *
   * Everything here comes from the simulated game itself -- the ordered facts the
   * engine recorded rather than a description inferred from the final score. If
   * the recap says a side led by twenty, a side led by twenty.
   */
  function recapPanel(d) {
    var wrap = el('div');
    if (d.recap) {
      var para = el('div', 'recap', d.recap);
      wrap.appendChild(para);
    }
    var f = d.result.game_flow;
    if (f) {
      var bits = [];
      if (f.lead_changes) bits.push(f.lead_changes + ' lead change' + (f.lead_changes === 1 ? '' : 's'));
      if (f.times_tied) bits.push(f.times_tied + ' tie' + (f.times_tied === 1 ? '' : 's'));
      var bl = Math.max(f.biggest_lead.home, f.biggest_lead.away);
      if (bl) bits.push('biggest lead ' + bl);
      if (bits.length) wrap.appendChild(el('div', 'disc', bits.join(' \u00b7 ')));
    }
    return wrap;
  }

  function leadersPanel(d) {
    var L = d.result.leaders;
    if (!L) return el('div');
    var rows = [];
    ['away', 'home'].forEach(function (side) {
      var team = d.matchup[side];
      var x = L[side];
      if (!x) return;
      rows.push({
        team: team.abbr,
        pts: x.points ? x.points.name + ' \u2014 ' + x.points.line : '\u2014',
        reb: x.rebounds ? x.rebounds.name + ' (' + x.rebounds.value + ')' : '\u2014',
        ast: x.assists ? x.assists.name + ' (' + x.assists.value + ')' : '\u2014',
      });
    });
    return S.table([
      { h: 'Team', fmt: function (r) { return r.team; } },
      { h: 'Points', fmt: function (r) { return r.pts; } },
      { h: 'Rebounds', fmt: function (r) { return r.reb; } },
      { h: 'Assists', fmt: function (r) { return r.ast; } },
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
      { id: 'rebounds', label: 'Rebounds' },
      { id: 'assists', label: 'Assists' },
      { id: 'threes', label: 'Threes made' },
    ],
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
  function resultBar(app, d) {
    var bar = el('div', 'resultbar');

    var share = el('button', 'btn ghost', 'Copy link to this simulation');
    share.type = 'button';
    var said = el('span', 'copied', '');
    share.addEventListener('click', function () {
      var url = window.location.href;
      var done = function () {
        said.textContent = 'Link copied. It reproduces this exact simulation.';
        share.setAttribute('aria-live', 'polite');
      };
      if (window.navigator && window.navigator.clipboard) {
        window.navigator.clipboard.writeText(url).then(done, function () {
          said.textContent = url;
        });
      } else {
        said.textContent = url;
      }
    });

    var print = el('button', 'btn ghost', 'Print or save as PDF');
    print.type = 'button';
    print.addEventListener('click', function () {
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
      window.setTimeout(function () { window.print(); }, 120);
    });

    bar.appendChild(share);
    bar.appendChild(print);
    bar.appendChild(said);
    return bar;
  }

  function render(app, d, box) {
    var p = d.projection;
    var away = d.matchup.away;
    var home = d.matchup.home;
    var otText = d.result.line_score.overtime_periods > 0
      ? (d.result.line_score.overtime_periods === 1 ? 'Overtime' : d.result.line_score.overtime_periods + ' overtimes')
      : 'Final';

    var fresh = freshnessNotice(d);
    if (fresh) box.appendChild(fresh);

    box.appendChild(resultBar(app, d));

    box.appendChild(S.matchupHeader(
      away, home,
      d.result.final.away, d.result.final.home,
      p.win_probability.away, p.win_probability.home,
      [otText, d.meta.simulations.toLocaleString() + ' simulations',
        d.meta.neutral_site ? 'Neutral site' : home.name + ' at home'],
    ));

    box.appendChild(S.kpis(p.sample_supports_projection === false ? [
      { k: 'Final', v: d.result.final.away + ' - ' + d.result.final.home,
        s: 'One game, played out possession by possession' },
      { k: 'Pregame win probability', v: pct(p.win_probability.home, 1),
        s: home.abbr + ', from the rating model rather than this game' },
      { k: 'Possessions', v: d.result.possessions || '—',
        s: 'In the game above' },
    ] : [
      { k: 'Projected score', v: n1(p.projected_score.away) + ' - ' + n1(p.projected_score.home),
        s: away.abbr + ' at ' + home.abbr },
      // spread.home is the mean margin FROM THE HOME TEAM'S POINT OF VIEW, so a
      // positive number means the home team is favoured. Getting this the wrong
      // way round printed the underdog as the favourite.
      { k: 'Projected spread',
        v: Math.abs(p.spread.home) < 0.5
          ? "Pick 'em"
          : (p.spread.home > 0 ? home.abbr : away.abbr) + ' ' + S.signed(-Math.abs(p.spread.home)),
        s: 'Margin standard deviation ' + p.spread.sd },
      { k: 'Projected total', v: n1(p.total.mean),
        s: 'Middle half ' + p.total.p25 + ' to ' + p.total.p75 },
      { k: 'Within three points', v: pct(p.close_game_share, 0),
        s: 'Share of runs decided by a possession' },
    ]));

    if (d.recap || d.result.game_flow) {
      box.appendChild(S.panel('How it played out', recapPanel(d)));
    }
    if (d.result.leaders) box.appendChild(S.panel('Game leaders', leadersPanel(d)));

    var lsPanel = S.panel('Quarter by quarter', lineScore(d));
    box.appendChild(lsPanel);

    var tabsBox = el('div', 'panel');
    var panes = [
      { id: 'box', label: 'Box score', build: function (node) {
        d.result.box_score.away.team = away;
        d.result.box_score.home.team = home;
        node.appendChild(boxTable(d.result.box_score.away, away.name));
        var spacer = el('div'); spacer.style.height = '18px'; node.appendChild(spacer);
        node.appendChild(boxTable(d.result.box_score.home, home.name));
        node.appendChild(el('div', 'disc',
          'Every team number above is the sum of the player lines beneath it, and the points total is the final score. '
          + 'Plus-minus is weighted by minutes played rather than tracked possession by possession.'));
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
      { id: 'sens', label: 'What it rests on', build: function (node) {
        node.appendChild(sensitivityPanel(d));
      } },
      { id: 'team', label: 'Team stats', build: function (node) { node.appendChild(teamStats(d)); } },
      { id: 'why', label: 'Why the model moved', build: function (node) {
        node.appendChild(S.driverCards(d.drivers));
      } },
      { id: 'season', label: 'Season profile', build: function (node) { node.appendChild(seasonProfile(d)); } },
      { id: 'avail', label: 'Availability', build: function (node) { node.appendChild(availability(app, d)); } },
      { id: 'charts', label: 'Distributions', build: function (node) {
        node.appendChild(charts(d));
        node.appendChild(el('div', 'disc',
          'Every bar is a share of the ' + d.meta.simulations.toLocaleString()
          + ' simulated games. Hover or tap a bar for its exact share.'));
      } },
      { id: 'range', label: 'Range of outcomes', build: function (node) {
        node.appendChild(S.table(
          [{ h: 'Percentile', fmt: function (r) { return r.name; } },
            { h: 'Margin', k: 'margin' }, { h: 'Total', k: 'total' }],
          [
            { name: '10th', margin: S.signed(p.spread.percentiles.p10, 0), total: p.total.p10 },
            { name: '25th', margin: S.signed(p.spread.percentiles.p25, 0), total: p.total.p25 },
            { name: 'Median', margin: S.signed(p.spread.percentiles.p50, 0), total: p.total.p50 },
            { name: '75th', margin: S.signed(p.spread.percentiles.p75, 0), total: p.total.p75 },
            { name: '90th', margin: S.signed(p.spread.percentiles.p90, 0), total: p.total.p90 },
          ],
        ));
        node.appendChild(el('div', 'disc',
          'Margin is from the home team\'s point of view across ' + d.meta.simulations.toLocaleString()
          + ' simulations. A projection is a range, not a number.'));
      } },
    ];
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
      sport: 'nba',
      homeVenueLabel: 'Home court',
      render: render,
      prerunChips: function (away, home) {
        return [
          { label: away.abbr + ' net rating', value: S.signed(away.season.netRating) },
          { label: home.abbr + ' net rating', value: S.signed(home.season.netRating) },
          { label: 'Pace', value: n1((away.season.pace + home.season.pace) / 2) },
          { label: 'Rotation', value: away.rotation.length + ' v ' + home.rotation.length + ' players' },
        ];
      },
    });
    app.mount();
    window.TMRNbaSim = app;
  });
}());
