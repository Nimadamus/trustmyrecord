/**
 * NBA_NHL_SEASON_ENGINE_20260915 -- NBA and NHL season, seeding and playoffs.
 *
 * Pure functions over the payload from /api/{nba,nhl}/public/season-inputs.
 * No DOM and no fetch, so the same file runs in the browser and under Node for
 * tests/league-season-engine-test.js.
 *
 * WHAT ONE SIMULATED SEASON IS
 *   Final games keep their real result. Every other game is drawn from the
 *   calibrated home win probability for that pairing (the number the single
 *   game NBA and NHL simulators report). Hockey also draws whether the game
 *   reached overtime, because the loser of an overtime or shootout game takes a
 *   point and a regulation win is the first tiebreaker.
 *
 * NBA FORMAT (2026-27)
 *   Conference seeds by win percentage. Seeds 1 to 6 go straight in. The play in
 *   tournament: 7 hosts 8, the winner is the 7 seed; 9 hosts 10, the loser is
 *   out; the loser of 7 v 8 hosts the winner of 9 v 10 for the 8 seed. First
 *   round 1v8, 4v5, 2v7, 3v6, bracket fixed, best of seven, 2-2-1-1-1, home
 *   court to the better regular season record.
 *
 *   The NBA schedule publishes 80 games per club in advance. Two more per club
 *   are set in December once the NBA Cup group stage is known; those two are
 *   drawn here against conference opponents and the page says so.
 *
 * NHL FORMAT (2026-27, 84 games)
 *   Points: 2 for a win, 1 for an overtime or shootout loss. Top three in each
 *   division qualify, then two wild cards per conference. The division winner
 *   with more points meets the second wild card; the other meets the first.
 *   Second and third in each division meet. Bracket fixed within the division,
 *   best of seven, 2-2-1-1-1, home ice to more points.
 *
 * TIEBREAKERS, STATED RATHER THAN FAKED
 *   NBA: head to head win percentage between the tied clubs, then a random
 *   draw. NHL: regulation wins, then head to head points, then a random draw.
 *   The leagues' later steps (division record, conference record, record
 *   against playoff teams, goal differential) are not applied; across thousands
 *   of seasons they move a seed rarely, and the page lists them as not applied.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TMRLeagueSeason = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NBA_GAMES = 82;

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function prob(inputs, home, away) {
    var row = inputs.matchups[home];
    var c = row && row[away];
    return c || { p: 0.5, ot: inputs.sport === 'nhl' ? 0.22 : 0 };
  }

  /* ---------------------------------------------------------------- season */

  function blankRecord(t) {
    return { abbr: t.espn_abbr, conference: t.conference, division: t.division,
      w: 0, l: 0, otl: 0, pts: 0, rw: 0, gp: 0, h2h: {} };
  }

  function h2hAdd(rec, opp, won, pts) {
    var h = rec.h2h[opp] || (rec.h2h[opp] = { w: 0, l: 0, pts: 0 });
    if (won) h.w += 1; else h.l += 1;
    h.pts += pts;
  }

  function applyGame(sport, recs, home, away, homeWon, extra) {
    var H = recs[home], A = recs[away];
    if (!H || !A) return;
    H.gp += 1; A.gp += 1;
    var W = homeWon ? H : A, L = homeWon ? A : H;
    W.w += 1;
    if (sport === 'nhl') {
      W.pts += 2;
      if (extra) { L.otl += 1; L.pts += 1; } else { L.l += 1; W.rw += 1; }
      h2hAdd(W, L.abbr, true, 2);
      h2hAdd(L, W.abbr, false, extra ? 1 : 0);
    } else {
      L.l += 1;
      h2hAdd(W, L.abbr, true, 0);
      h2hAdd(L, W.abbr, false, 0);
    }
  }

  /* The two December NBA games per club not yet on the schedule: paired
     within each conference, clubs short of 82 matched with each other. */
  function fillNbaCupGames(inputs, recs, rng) {
    var confs = {};
    Object.keys(recs).forEach(function (k) {
      var r = recs[k];
      var missing = NBA_GAMES - r.scheduled;
      for (var i = 0; i < missing; i++) (confs[r.conference] || (confs[r.conference] = [])).push(k);
    });
    Object.keys(confs).forEach(function (c) {
      var pool = confs[c];
      for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      for (var k = 0; k + 1 < pool.length; k += 2) {
        var home = pool[k], away = pool[k + 1];
        if (home === away) continue;
        applyGame('nba', recs, home, away, rng() < prob(inputs, home, away).p, false);
      }
    });
  }

  function simulateSeason(inputs, rng, opts) {
    var sport = inputs.sport;
    var recs = {};
    inputs.teams.forEach(function (t) { recs[t.espn_abbr] = blankRecord(t); recs[t.espn_abbr].scheduled = 0; });
    var forced = (opts && opts.forced) || {};
    inputs.schedule.forEach(function (g) {
      if (recs[g.home]) recs[g.home].scheduled += 1;
      if (recs[g.away]) recs[g.away].scheduled += 1;
      if (g.final && g.home_score != null && g.away_score != null && g.home_score !== g.away_score) {
        applyGame(sport, recs, g.home, g.away, g.home_score > g.away_score, !!g.extra_time);
        return;
      }
      var c = prob(inputs, g.home, g.away);
      /* A scheduled game can carry its own forecast for that date (rest, back
         to backs); the pair table is the fallback. */
      var ph = typeof g.p_home === 'number' ? g.p_home : c.p;
      var homeWon = forced[g.id] ? forced[g.id] === 'home' : rng() < ph;
      var extra = sport === 'nhl' ? rng() < (c.ot || 0) : false;
      applyGame(sport, recs, g.home, g.away, homeWon, extra);
    });
    if (sport === 'nba') fillNbaCupGames(inputs, recs, rng);
    return recs;
  }

  /* -------------------------------------------------------------- ordering */

  function pctOf(r) { return r.gp ? r.w / r.gp : 0.5; }

  function h2hScore(sport, r, group) {
    var w = 0, l = 0, pts = 0;
    group.forEach(function (o) {
      if (o.abbr === r.abbr) return;
      var h = r.h2h[o.abbr];
      if (h) { w += h.w; l += h.l; pts += h.pts; }
    });
    if (sport === 'nhl') return pts;
    return w + l ? w / (w + l) : 0.5;
  }

  /* Sort by the league's primary number, then the stated tiebreakers. `rng`
     settles what is still tied, and every club carries its draw so a tie is
     settled the same way wherever the same clubs meet in one season. */
  function order(sport, list, rng) {
    list.forEach(function (r) { if (r._draw === undefined) r._draw = rng(); });
    var primary = sport === 'nhl' ? function (r) { return r.pts; } : pctOf;
    var sorted = list.slice().sort(function (a, b) { return primary(b) - primary(a); });
    var out = [];
    for (var i = 0; i < sorted.length;) {
      var j = i;
      while (j + 1 < sorted.length && primary(sorted[j + 1]) === primary(sorted[i])) j++;
      var group = sorted.slice(i, j + 1);
      if (group.length > 1) {
        group.sort(function (a, b) {
          if (sport === 'nhl' && b.rw !== a.rw) return b.rw - a.rw;
          var hb = h2hScore(sport, b, group), ha = h2hScore(sport, a, group);
          if (hb !== ha) return hb - ha;
          return b._draw - a._draw;
        });
      }
      out = out.concat(group);
      i = j + 1;
    }
    return out;
  }

  function byConference(recs) {
    var c = {};
    Object.keys(recs).forEach(function (k) { (c[recs[k].conference] || (c[recs[k].conference] = [])).push(recs[k]); });
    return c;
  }

  /* --------------------------------------------------------------- seeding */

  function seedNba(recs, rng, inputs, gameRng) {
    var confs = byConference(recs), out = {};
    Object.keys(confs).sort().forEach(function (conf) {
      var ranked = order('nba', confs[conf], rng);
      var seeds = ranked.slice(0, 6);
      var s7 = ranked[6], s8 = ranked[7], s9 = ranked[8], s10 = ranked[9];
      var g1 = playGame(inputs, s7, s8, gameRng);
      var g2 = playGame(inputs, s9, s10, gameRng);
      var loser1 = g1 === s7 ? s8 : s7;
      var g3 = playGame(inputs, loser1, g2, gameRng);
      seeds.push(g1, g3);
      out[conf] = {
        ranked: ranked,
        seeds: seeds,
        playIn: [s7, s8, s9, s10],
        playInResults: [
          { home: s7.abbr, away: s8.abbr, winner: g1.abbr, for: '7 seed' },
          { home: s9.abbr, away: s10.abbr, winner: g2.abbr, for: 'stays alive' },
          { home: loser1.abbr, away: g2.abbr, winner: g3.abbr, for: '8 seed' },
        ],
      };
    });
    return out;
  }

  function seedNhl(recs, rng) {
    var confs = byConference(recs), out = {};
    Object.keys(confs).sort().forEach(function (conf) {
      var divs = {};
      confs[conf].forEach(function (r) { (divs[r.division] || (divs[r.division] = [])).push(r); });
      var divNames = Object.keys(divs).sort();
      var tops = {}, rest = [];
      divNames.forEach(function (d) {
        var ranked = order('nhl', divs[d], rng);
        tops[d] = ranked.slice(0, 3);
        rest = rest.concat(ranked.slice(3));
      });
      var wild = order('nhl', rest, rng);
      var wc1 = wild[0], wc2 = wild[1];
      var winners = order('nhl', divNames.map(function (d) { return tops[d][0]; }), rng);
      var bracket = {};
      divNames.forEach(function (d) {
        var top = tops[d][0];
        var wc = top === winners[0] ? wc2 : wc1;
        bracket[d] = [[top, wc], [tops[d][1], tops[d][2]]];
      });
      out[conf] = {
        ranked: order('nhl', confs[conf], rng),
        divisions: divNames,
        tops: tops,
        wildcards: [wc1, wc2],
        firstWinner: winners[0].division,
        bracket: bracket,
      };
    });
    return out;
  }

  /* ---------------------------------------------------------------- series */

  function playGame(inputs, home, away, rng) {
    return rng() < prob(inputs, home.abbr, away.abbr).p ? home : away;
  }

  function better(sport, a, b) {
    var pa = sport === 'nhl' ? a.pts : pctOf(a), pb = sport === 'nhl' ? b.pts : pctOf(b);
    if (pa !== pb) return pa > pb ? a : b;
    return a._draw >= b._draw ? a : b;
  }

  var PATTERN = [1, 1, 0, 0, 1, 0, 1]; // games at the higher seed's arena
  /* MLB: the Wild Card Series is best of three, every game at the higher seed;
     the Division Series best of five, 2-2-1; the LCS and World Series best of
     seven, 2-3-2. */
  var MLB_PATTERN = { 3: [1, 1, 1], 5: [1, 1, 0, 0, 1], 7: [1, 1, 0, 0, 0, 1, 1] };

  function series(inputs, a, b, rng, length) {
    var hi = better(inputs.sport, a, b), lo = hi === a ? b : a;
    var len = length || 7, need = (len + 1) / 2;
    var pat = inputs.sport === 'mlb' ? MLB_PATTERN[len] : PATTERN;
    var wh = 0, wl = 0, games = 0;
    while (wh < need && wl < need) {
      var atHi = pat[games] === 1;
      var winner = atHi ? playGame(inputs, hi, lo, rng) : playGame(inputs, lo, hi, rng);
      if (winner === hi) wh++; else wl++;
      games++;
    }
    return { winner: wh === need ? hi : lo, loser: wh === need ? lo : hi, games: games, hi: hi.abbr, lo: lo.abbr, score: [Math.max(wh, wl), Math.min(wh, wl)] };
  }

  /* MLB (12 team format): in each league the three division winners by record
     take seeds 1 to 3, the three best remaining records seeds 4 to 6. Seeds 1
     and 2 skip the Wild Card Series. */
  function seedMlb(recs, rng) {
    var confs = byConference(recs), out = {};
    Object.keys(confs).sort().forEach(function (conf) {
      var ranked = order('mlb', confs[conf], rng);
      var seen = {}, winners = [], rest = [];
      ranked.forEach(function (r) {
        if (!seen[r.division]) { seen[r.division] = true; winners.push(r); } else rest.push(r);
      });
      var seeds = winners.slice(0, 3).concat(rest.slice(0, 3));
      out[conf] = { ranked: ranked, seeds: seeds, divisionWinners: winners.slice(0, 3), wildcards: rest.slice(0, 3) };
    });
    return out;
  }

  function playoffs(inputs, seeding, rng) {
    var sport = inputs.sport, rounds = [[], [], [], []], champs = {};
    var confNames = Object.keys(seeding).sort();
    confNames.forEach(function (conf) {
      var s = seeding[conf], r1 = [], r2 = [], cf;
      if (sport === 'mlb') {
        var ms = s.seeds;
        var w36 = series(inputs, ms[2], ms[5], rng, 3);
        var w45 = series(inputs, ms[3], ms[4], rng, 3);
        r1.push(w36, w45);
        /* The 1 seed meets the 4 v 5 winner, the 2 seed the 3 v 6 winner. */
        r2.push(series(inputs, ms[0], w45.winner, rng, 5));
        r2.push(series(inputs, ms[1], w36.winner, rng, 5));
      } else if (sport === 'nba') {
        var seeds = s.seeds;
        var pairs = [[0, 7], [3, 4], [1, 6], [2, 5]];
        pairs.forEach(function (p) { r1.push(series(inputs, seeds[p[0]], seeds[p[1]], rng)); });
        r2.push(series(inputs, r1[0].winner, r1[1].winner, rng));
        r2.push(series(inputs, r1[2].winner, r1[3].winner, rng));
      } else {
        s.divisions.forEach(function (d) {
          var b = s.bracket[d];
          var a1 = series(inputs, b[0][0], b[0][1], rng);
          var a2 = series(inputs, b[1][0], b[1][1], rng);
          r1.push(a1, a2);
          r2.push(series(inputs, a1.winner, a2.winner, rng));
        });
      }
      cf = series(inputs, r2[0].winner, r2[1].winner, rng);
      rounds[0] = rounds[0].concat(r1.map(tag(conf)));
      rounds[1] = rounds[1].concat(r2.map(tag(conf)));
      rounds[2].push(tag(conf)(cf));
      champs[conf] = cf.winner;
    });
    var fin = series(inputs, champs[confNames[0]], champs[confNames[1]], rng);
    rounds[3].push(fin);
    return { rounds: rounds, champion: fin.winner };
  }

  function tag(conf) { return function (s) { s.conference = conf; return s; }; }

  /* ------------------------------------------------------------ one season */

  function runOnce(inputs, rng, opts) {
    var recs = simulateSeason(inputs, rng, opts);
    var seeding = inputs.sport === 'nba' ? seedNba(recs, rng, inputs, rng)
      : inputs.sport === 'mlb' ? seedMlb(recs, rng) : seedNhl(recs, rng);
    var po = playoffs(inputs, seeding, rng);
    return { records: recs, seeding: seeding, playoffs: po };
  }

  /* ----------------------------------------------------------- many seasons */

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    var i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
    return sorted[i];
  }

  function project(inputs, n, seed, opts) {
    var rng = mulberry32(seed || 1);
    var sport = inputs.sport;
    var acc = {};
    inputs.teams.forEach(function (t) {
      acc[t.espn_abbr] = { abbr: t.espn_abbr, name: t.name, short: t.short, logo: t.logo,
        conference: t.conference, division: t.division,
        wins: [], pts: [], division_title: 0, top_seed: 0, direct: 0, play_in: 0,
        playoffs: 0, round2: 0, conf_final: 0, final: 0, champion: 0, seeds: {} };
    });
    var sample = null;
    for (var i = 0; i < n; i++) {
      var one = runOnce(inputs, rng, opts);
      if (i === 0) sample = one;
      Object.keys(one.records).forEach(function (k) {
        var a = acc[k], r = one.records[k];
        a.wins.push(r.w);
        if (sport === 'nhl') a.pts.push(r.pts);
      });
      Object.keys(one.seeding).forEach(function (conf) {
        var s = one.seeding[conf];
        if (sport === 'mlb') {
          acc[s.ranked[0].abbr].top_seed++;
          s.divisionWinners.forEach(function (r) { acc[r.abbr].division_title++; });
          s.seeds.forEach(function (r, idx) {
            acc[r.abbr].playoffs++;
            if (idx < 2) { acc[r.abbr].direct++; acc[r.abbr].round2++; } else acc[r.abbr].play_in++;
          });
        } else if (sport === 'nba') {
          acc[s.ranked[0].abbr].top_seed++;
          s.ranked.slice(0, 6).forEach(function (r) { acc[r.abbr].direct++; });
          s.playIn.forEach(function (r) { acc[r.abbr].play_in++; });
          s.seeds.forEach(function (r, idx) { acc[r.abbr].playoffs++; acc[r.abbr].seeds[idx + 1] = (acc[r.abbr].seeds[idx + 1] || 0) + 1; });
          var divs = {};
          s.ranked.forEach(function (r) { if (!divs[r.division]) { divs[r.division] = r; acc[r.abbr].division_title++; } });
        } else {
          acc[s.ranked[0].abbr].top_seed++;
          s.divisions.forEach(function (d) {
            acc[s.tops[d][0].abbr].division_title++;
            s.tops[d].forEach(function (r) { acc[r.abbr].playoffs++; acc[r.abbr].direct++; });
          });
          s.wildcards.forEach(function (r) { acc[r.abbr].playoffs++; acc[r.abbr].play_in++; });
        }
      });
      var R = one.playoffs.rounds;
      R[0].forEach(function (x) { acc[x.winner.abbr].round2++; });
      R[1].forEach(function (x) { acc[x.winner.abbr].conf_final++; });
      R[2].forEach(function (x) { acc[x.winner.abbr].final++; });
      acc[one.playoffs.champion.abbr].champion++;
    }
    var teams = Object.keys(acc).map(function (k) {
      var a = acc[k];
      var w = a.wins.slice().sort(function (x, y) { return x - y; });
      var p = a.pts.slice().sort(function (x, y) { return x - y; });
      var mean = function (arr) { return arr.length ? arr.reduce(function (s, v) { return s + v; }, 0) / arr.length : 0; };
      var pct = function (v) { return v / n; };
      return {
        abbr: a.abbr, name: a.name, short: a.short, logo: a.logo,
        conference: a.conference, division: a.division,
        wins_mean: mean(w), wins_p10: quantile(w, 0.1), wins_p90: quantile(w, 0.9),
        points_mean: sport === 'nhl' ? mean(p) : null,
        points_p10: sport === 'nhl' ? quantile(p, 0.1) : null,
        points_p90: sport === 'nhl' ? quantile(p, 0.9) : null,
        division_title: pct(a.division_title), top_seed: pct(a.top_seed),
        direct: pct(a.direct), play_in: pct(a.play_in), playoffs: pct(a.playoffs),
        round2: pct(a.round2), conf_final: pct(a.conf_final), final: pct(a.final), champion: pct(a.champion),
      };
    });
    return { sport: sport, runs: n, seed: seed || 1, teams: teams, sample: sample };
  }

  return {
    mulberry32: mulberry32,
    simulateSeason: simulateSeason,
    order: order,
    seedNba: seedNba,
    seedNhl: seedNhl,
    series: series,
    playoffs: playoffs,
    runOnce: runOnce,
    project: project,
    NBA_GAMES: NBA_GAMES,
  };
}));
