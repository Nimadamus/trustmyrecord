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
 * TIEBREAKERS (OFFICIAL_TIEBREAKERS_20261030): the leagues' full published orders.
 *   NBA (NBA.com standings, paragraph L.2). Two clubs: head to head win pct,
 *   division winner, division win pct (same division only), conference win pct,
 *   win pct against playoff eligible clubs (tied for a top ten record) in own
 *   conference, then in the other conference, point differential, random draw.
 *   Three or more: division winner, win pct among the tied clubs, division pct
 *   (all in one division only), conference pct, own conference playoff eligible
 *   pct, point differential, random draw. A partial break restarts the process
 *   for the clubs still tied; division leader ties are broken first and count
 *   only for the division title.
 *   NHL (NHL.com tie-breaking procedure): points percentage, regulation wins,
 *   regulation plus overtime wins (ROW), total wins, points in the games among
 *   the tied clubs (the odd home game excluded; percentage of available points
 *   for three or more), goal differential, goals for, random draw.
 *   Finished games use their real scores. A simulated game has no score, so
 *   for the last steps (point and goal differential) a margin is drawn on a
 *   separate random stream: NBA from a normal margin consistent with the game's
 *   win probability (sd 12.5) given the winner; NHL from a fixed regulation
 *   margin mix (overtime and shootout = 1 goal, a shootout win counts one goal
 *   as the NHL does) and a Poisson loser score. Those steps decide a seed only
 *   when every earlier step is level.
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

  /* LAB_UNCERTAINTY_20261007: nobody knows a club's true strength, so each
     simulated NHL season draws one strength offset per club (goals, normal with
     sd SIGMA) and every game that season, regular or playoff, uses it. Without
     it the favourites' odds were too concentrated: backtested from Oct 15 of
     three seasons, the 80% points ranges held 67% of final totals; with sd 0.3
     they held 83% and playoff-odds log loss fell from 0.620 to 0.580.
     The sd shrinks as the season is played: 0.31 x sqrt(share of games left),
     never below half of that (0.155) because strength is never known exactly. */
  var NOISE = null;
  var LOGIT_PER_GOAL = 0.778;   // the calibration slope: one goal of margin in logit units
  function nhlSigma(inputs) {
    var total = inputs.schedule.length, left = 0;
    for (var i = 0; i < total; i++) if (!inputs.schedule[i].final) left++;
    var frac = total ? left / total : 0;
    return 0.31 * Math.sqrt(Math.max(frac, 0.25));
  }
  function shift(p, d) {
    if (!d) return p;
    var q = Math.min(0.998, Math.max(0.002, p));
    var z = Math.log(q / (1 - q)) + d;
    return 1 / (1 + Math.exp(-z));
  }

  /* NBA_SEASON_UNCERTAINTY_20261030: the same idea for the NBA, one offset
     per club per simulated season, sd NBA_SIGMA x sqrt(share of games left,
     floored at 0.25), on the PROBIT scale and MEAN PRESERVING: a game at p is
     played at Phi(Phi^-1(p) x sqrt(1 + 2 s^2) + home offset - away offset), whose
     average over the offsets is exactly p. So the projection still equals the
     sum of the printed game odds (scripts/league-sim-consistency.js) and only
     the spread widens. Without it the 80% win ranges held 58% of final totals.
     NBA_SIGMA: see the fit note at its value below. */
  /* NBA_SIGMA 0.35 (probit units, at a full season left). Fitted walk forward
     on 2022-23 to 2025-26: ratings as of opening night and days 30, 60, 90 and
     120 of each season (the live method), 2000 seasons per run, 600 club
     forecasts. Leaving each season out in turn, the other three pick 0.35 (0.30
     once); out of sample the 80% ranges hold 83.7% of final win totals (58.3%
     without), log loss of the top six and top ten odds improves by 0.059 (95% CI
     0.018 to 0.103, clustered by club season) and Brier by 0.0070 (0.0011 to
     0.0132). Evidence: program_1030/evidence_leagues/nba_sigma_*. */
  var NBA_SIGMA = 0.35;
  var NOISE_S = 0;
  function nbaSigma(inputs, full) {
    var total = inputs.schedule.length, left = 0;
    for (var i = 0; i < total; i++) if (!inputs.schedule[i].final) left++;
    var frac = total ? left / total : 0;
    return full * Math.sqrt(Math.max(frac, 0.25));
  }
  function noisy(sport, p, home, away) {
    if (!NOISE) return p;
    var d = (NOISE[home] || 0) - (NOISE[away] || 0);
    if (sport === 'nhl') return shift(p, LOGIT_PER_GOAL * d);
    var q = Math.min(0.9999, Math.max(0.0001, p));
    return normCdf(normInv(q) * Math.sqrt(1 + 2 * NOISE_S * NOISE_S) + d);
  }

  function prob(inputs, home, away) {
    var row = inputs.matchups[home];
    var c = row && row[away];
    c = c || { p: 0.5, ot: inputs.sport === 'nhl' ? 0.22 : 0 };
    if (NOISE) {
      var out = { p: noisy(inputs.sport, c.p, home, away), ot: c.ot };
      if (c.pp !== undefined && c.pp !== null) out.pp = noisy(inputs.sport, c.pp, home, away);
      return out;
    }
    return c;
  }

  /* GAME_PROB_20261030: the probability of ONE scheduled game, the only one
     any page may print or simulate. A scheduled game carries its own forecast
     (p_home, built for its date by the season inputs); the pair table is the
     fallback for a game without one and for hypothetical (playoff) pairings.
     Team pages, the hub slate, the pick board, rivalry pages and the season
     engine all read this, so the printed odds and the projection agree. */
  function gameProb(inputs, g) {
    var c = prob(inputs, g.home, g.away);
    if (typeof g.p_home === 'number') return { p: noisy(inputs.sport, g.p_home, g.home, g.away), ot: c.ot, pp: c.pp };
    return c;
  }

  /* ---------------------------------------------------------------- season */

  function blankRecord(t) {
    return { abbr: t.espn_abbr, conference: t.conference, division: t.division,
      w: 0, l: 0, otl: 0, pts: 0, rw: 0, row: 0, gp: 0, pf: 0, pa: 0, h2h: {} };
  }

  function h2hAdd(rec, opp, won, pts, home) {
    var h = rec.h2h[opp] || (rec.h2h[opp] = { w: 0, l: 0, pts: 0, games: [] });
    if (won) h.w += 1; else h.l += 1;
    h.pts += pts;
    h.games.push({ home: home, pts: pts });
  }

  /* One game into the standings. `extra`: decided after regulation; `so`: by
     shootout (NHL); `hs`/`as`: the score (real, or drawn for the differential
     steps only). */
  function applyGame(sport, recs, home, away, homeWon, extra, so, hs, as) {
    var H = recs[home], A = recs[away];
    if (!H || !A) return;
    H.gp += 1; A.gp += 1;
    var W = homeWon ? H : A, L = homeWon ? A : H;
    W.w += 1;
    if (typeof hs === 'number' && typeof as === 'number') {
      H.pf += hs; H.pa += as; A.pf += as; A.pa += hs;
    }
    if (sport === 'nhl') {
      W.pts += 2;
      if (extra) { L.otl += 1; L.pts += 1; if (!so) W.row += 1; } else { L.l += 1; W.rw += 1; W.row += 1; }
      h2hAdd(W, L.abbr, true, 2, home);
      h2hAdd(L, W.abbr, false, extra ? 1 : 0, home);
    } else {
      L.l += 1;
      h2hAdd(W, L.abbr, true, 0, home);
      h2hAdd(L, W.abbr, false, 0, home);
    }
  }

  /* ------------------------------------------- scores for simulated games */

  function normCdf(x) {
    var t = 1 / (1 + 0.2316419 * Math.abs(x));
    var d = 0.3989422804014327 * Math.exp(-x * x / 2);
    var q = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x >= 0 ? 1 - q : q;
  }
  function normInv(p) {
    p = Math.min(1 - 1e-9, Math.max(1e-9, p));
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
    var b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    var c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    var d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    var q, r;
    if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  var NBA_MARGIN_SD = 12.5;
  var NHL_REG_MARGIN = [[1, 0.36], [2, 0.31], [3, 0.18], [4, 0.09], [5, 0.04], [6, 0.02]];
  function poisson(lam, u) {
    var k = 0, p = Math.exp(-lam), c = p;
    while (u > c && k < 15) { k++; p *= lam / k; c += p; }
    return k;
  }
  /* [homeScore, awayScore] for a simulated game, drawn from `trng` only. */
  function drawScore(sport, ph, homeWon, extra, trng) {
    if (sport === 'nhl') {
      var lose = poisson(extra ? 2.4 : 2.0, trng()), m = 1;
      if (!extra) {
        var u = trng(), c = 0;
        for (var i = 0; i < NHL_REG_MARGIN.length; i++) { c += NHL_REG_MARGIN[i][1]; m = NHL_REG_MARGIN[i][0]; if (u < c) break; }
      }
      return homeWon ? [lose + m, lose] : [lose, lose + m];
    }
    var mu = NBA_MARGIN_SD * normInv(Math.min(0.995, Math.max(0.005, ph)));
    var lo = normCdf(-mu / NBA_MARGIN_SD);
    var v = trng(), u2 = homeWon ? lo + v * (1 - lo) : v * lo;
    var mg = Math.round(Math.abs(mu + NBA_MARGIN_SD * normInv(u2)));
    if (mg < 1) mg = 1;
    return homeWon ? [110 + mg, 110] : [110, 110 + mg];
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
      /* A club owed two games must not be paired with itself (that game was
         dropped, leaving it at 81): pair everything first, swapping a self
         pair with a later club or an earlier pair that has neither club. */
      for (var k = 0; k + 1 < pool.length; k += 2) {
        if (pool[k] !== pool[k + 1]) continue;
        for (var x = k + 2; x < pool.length; x++) {
          if (pool[x] !== pool[k]) { var sw = pool[k + 1]; pool[k + 1] = pool[x]; pool[x] = sw; break; }
        }
        for (var y = 0; pool[k] === pool[k + 1] && y < k; y++) {
          var mate = pool[y % 2 ? y - 1 : y + 1];
          if (pool[y] !== pool[k] && mate !== pool[k]) { var sv = pool[k + 1]; pool[k + 1] = pool[y]; pool[y] = sv; }
        }
      }
      for (k = 0; k + 1 < pool.length; k += 2) {
        var home = pool[k], away = pool[k + 1];
        if (home === away) continue;
        var cp = prob(inputs, home, away).p, cw = rng() < cp;
        var cs = drawScore('nba', cp, cw, false, recs._trng);
        applyGame('nba', recs, home, away, cw, false, false, cs[0], cs[1]);
      }
    });
  }

  /* Share of NHL extra-time games settled by shootout: 2025-26 regular season,
     shootouts 9.1% of games, overtime or shootout 24.8% (NHL.com). Only the ROW
     tiebreaker reads it. */
  var NHL_SHOOTOUT_SHARE = 0.367;

  function simulateSeason(inputs, rng, opts) {
    var sport = inputs.sport;
    var recs = {};
    inputs.teams.forEach(function (t) { recs[t.espn_abbr] = blankRecord(t); recs[t.espn_abbr].scheduled = 0; });
    /* Scores of simulated games come from their own stream, so the win and
       loss draws are unchanged by the differential tiebreakers. */
    var scored = sport === 'nba' || sport === 'nhl';   /* MLB keeps its stream exactly */
    var trng = scored ? mulberry32(Math.floor(rng() * 4294967296)) : null;
    Object.defineProperty(recs, '_trng', { value: trng, enumerable: false });
    var forced = (opts && opts.forced) || {};
    inputs.schedule.forEach(function (g) {
      if (recs[g.home]) recs[g.home].scheduled += 1;
      if (recs[g.away]) recs[g.away].scheduled += 1;
      if (g.final && g.home_score != null && g.away_score != null && g.home_score !== g.away_score) {
        applyGame(sport, recs, g.home, g.away, g.home_score > g.away_score, !!g.extra_time, !!g.shootout, g.home_score, g.away_score);
        return;
      }
      var c = gameProb(inputs, g);
      var ph = c.p;
      var homeWon = forced[g.id] ? forced[g.id] === 'home' : rng() < ph;
      var extra = sport === 'nhl' ? rng() < (c.ot || 0) : false;
      var so = extra && trng() < NHL_SHOOTOUT_SHARE;
      var sc = scored ? drawScore(sport, ph, homeWon, extra, trng) : [null, null];
      applyGame(sport, recs, g.home, g.away, homeWon, extra, so, sc[0], sc[1]);
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

  /* Win pct against the opponents `want` accepts (NBA record splits). */
  function pctVs(r, recs, want) {
    var w = 0, l = 0;
    Object.keys(r.h2h).forEach(function (k) {
      var o = recs[k];
      if (!o || !want(o)) return;
      w += r.h2h[k].w; l += r.h2h[k].l;
    });
    return w + l ? w / (w + l) : 0;
  }

  /* NHL head to head: points in games among `group`, the first game in the
     city that hosted the extra game of an odd series left out; three or more
     clubs compare the percentage of available points. */
  function nhlH2h(r, group) {
    var earned = 0, avail = 0;
    group.forEach(function (o) {
      if (o.abbr === r.abbr) return;
      var h = r.h2h[o.abbr];
      if (!h) return;
      var atR = 0, atO = 0;
      h.games.forEach(function (g) { if (g.home === r.abbr) atR++; else atO++; });
      var skip = atR === atO ? null : (atR > atO ? r.abbr : o.abbr), skipped = false;
      h.games.forEach(function (g) {
        if (skip && !skipped && g.home === skip) { skipped = true; return; }
        earned += g.pts; avail += 2;
      });
    });
    if (group.length === 2) return earned;
    return avail ? earned / avail : 0;
  }

  function nbaSteps(group, ctx) {
    var recs = ctx.recs, two = group.length === 2;
    var sameDiv = group.every(function (r) { return r.division === group[0].division; });
    var divWin = function (r) { return ctx.divWinner && ctx.divWinner[r.abbr] ? 1 : 0; };
    var h2h = function (r) { return h2hScore('nba', r, group); };
    var divPct = function (r) { return pctVs(r, recs, function (o) { return o.division === r.division; }); };
    var confPct = function (r) { return pctVs(r, recs, function (o) { return o.conference === r.conference; }); };
    var eligOwn = function (r) { return pctVs(r, recs, function (o) { return o.conference === r.conference && ctx.eligible[o.abbr]; }); };
    var eligOther = function (r) { return pctVs(r, recs, function (o) { return o.conference !== r.conference && ctx.eligible[o.abbr]; }); };
    var pd = function (r) { return r.pf - r.pa; };
    var steps = two ? [h2h, divWin] : [divWin, h2h];
    if (sameDiv) steps.push(divPct);
    steps.push(confPct, eligOwn);
    if (two) steps.push(eligOther);
    steps.push(pd);
    return steps;
  }

  function nhlSteps(group) {
    return [
      function (r) { return r.gp ? r.pts / (2 * r.gp) : 0; },
      function (r) { return r.rw; },
      function (r) { return r.row; },
      function (r) { return r.w; },
      function (r) { return nhlH2h(r, group); },
      function (r) { return r.pf - r.pa; },
      function (r) { return r.pf; },
    ];
  }

  /* Order a group level on the primary number. The first step that tells any
     of them apart splits the group; clubs still level restart the process
     among themselves (NBA L.2.c, and the NHL's head to head among the clubs
     still tied). The random draw is last. */
  function breakTie(sport, group, ctx) {
    if (group.length < 2) return group.slice();
    var steps = sport === 'nhl' ? nhlSteps(group) : nbaSteps(group, ctx);
    for (var s = 0; s < steps.length; s++) {
      var f = steps[s];
      var vals = group.map(function (r) { return { r: r, v: f(r) }; });
      var distinct = vals.some(function (x) { return x.v !== vals[0].v; });
      if (!distinct) continue;
      vals.sort(function (a, b) { return b.v - a.v; });
      var out = [];
      for (var i = 0; i < vals.length;) {
        var j = i;
        while (j + 1 < vals.length && vals[j + 1].v === vals[i].v) j++;
        var sub = vals.slice(i, j + 1).map(function (x) { return x.r; });
        out = out.concat(sub.length > 1 ? breakTie(sport, sub, ctx) : sub);
        i = j + 1;
      }
      return out;
    }
    return group.slice().sort(function (a, b) { return b._draw - a._draw; });
  }

  /* Sort by the league's primary number, then the tiebreakers. `rng` gives
     each club its random draw once, so a tie that reaches the draw is settled
     the same way wherever the same clubs meet in one season. NBA ties need
     `ctx` (all records, division winners, playoff eligible clubs); MLB keeps
     head to head then the draw. */
  function order(sport, list, rng, ctx) {
    list.forEach(function (r) { if (r._draw === undefined) r._draw = rng(); });
    var primary = sport === 'nhl' ? function (r) { return r.gp ? r.pts / (2 * r.gp) : 0; } : pctOf;
    var sorted = list.slice().sort(function (a, b) { return primary(b) - primary(a); });
    var out = [];
    for (var i = 0; i < sorted.length;) {
      var j = i;
      while (j + 1 < sorted.length && primary(sorted[j + 1]) === primary(sorted[i])) j++;
      var group = sorted.slice(i, j + 1);
      if (group.length > 1) {
        if (sport === 'nhl' || (sport === 'nba' && ctx)) group = breakTie(sport, group, ctx);
        else {
          group.sort(function (a, b) {
            var hb = h2hScore(sport, b, group), ha = h2hScore(sport, a, group);
            if (hb !== ha) return hb - ha;
            return b._draw - a._draw;
          });
        }
      }
      out = out.concat(group);
      i = j + 1;
    }
    return out;
  }

  /* NBA context: playoff eligible = tied for one of the ten best records in
     the conference; division winners from division-only tiebreaks (L.2.c). */
  function nbaContext(recs, rng) {
    var ctx = { recs: recs, eligible: {}, divWinner: {}, divOrder: {} };
    var confs = byConference(recs);
    Object.keys(confs).sort().forEach(function (c) {
      var pcts = confs[c].map(pctOf).sort(function (a, b) { return b - a; });
      var cut = pcts[Math.min(9, pcts.length - 1)];
      confs[c].forEach(function (r) { if (pctOf(r) >= cut) ctx.eligible[r.abbr] = true; });
    });
    var divs = {};
    Object.keys(recs).sort().forEach(function (k) { (divs[recs[k].division] || (divs[recs[k].division] = [])).push(recs[k]); });
    Object.keys(divs).sort().forEach(function (d) {
      var ranked = order('nba', divs[d], rng, { recs: recs, eligible: ctx.eligible, divWinner: {} });
      ctx.divOrder[d] = ranked;
      ctx.divWinner[ranked[0].abbr] = true;
    });
    Object.keys(recs).forEach(function (k) { recs[k]._ctx = ctx; });
    return ctx;
  }

  function byConference(recs) {
    var c = {};
    Object.keys(recs).forEach(function (k) { (c[recs[k].conference] || (c[recs[k].conference] = [])).push(recs[k]); });
    return c;
  }

  /* --------------------------------------------------------------- seeding */

  function seedNba(recs, rng, inputs, gameRng) {
    var ctx = nbaContext(recs, rng);
    var confs = byConference(recs), out = {};
    Object.keys(confs).sort().forEach(function (conf) {
      var ranked = order('nba', confs[conf], rng, ctx);
      var seeds = ranked.slice(0, 6);
      var s7 = ranked[6], s8 = ranked[7], s9 = ranked[8], s10 = ranked[9];
      var g1 = playGame(inputs, s7, s8, gameRng);
      var g2 = playGame(inputs, s9, s10, gameRng);
      var loser1 = g1 === s7 ? s8 : s7;
      var g3 = playGame(inputs, loser1, g2, gameRng);
      seeds.push(g1, g3);
      out[conf] = {
        ranked: ranked,
        divisionWinners: Object.keys(ctx.divOrder).filter(function (d) { return ctx.divOrder[d][0].conference === conf; })
          .sort().map(function (d) { return ctx.divOrder[d][0]; }),
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

  /* LAB_PLAYOFFS_20261007: series games are playoff games. Where the inputs
     carry a playoff probability (NHL: no 3-on-3, no shootout) it is used. */
  function playGame(inputs, home, away, rng) {
    var c = prob(inputs, home.abbr, away.abbr);
    var p = (c.pp !== undefined && c.pp !== null) ? c.pp : c.p;
    return rng() < p ? home : away;
  }

  /* Home court / ice: the better regular season record, ties by the league's
     tiebreakers (MLB: the draw). */
  function better(sport, a, b) {
    var pa = sport === 'nhl' ? a.pts : pctOf(a), pb = sport === 'nhl' ? b.pts : pctOf(b);
    if (pa !== pb) return pa > pb ? a : b;
    if (sport === 'nhl' || (sport === 'nba' && a._ctx)) return breakTie(sport, [a, b], a._ctx)[0];
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

  /* MLB_POSTSEASON_STATE_CANDIDATE (lab, not deployed): once the regular season
     is over the payload can carry inputs.postseason = { seeds: { <league>:
     [6 abbrs, official seeds 1 to 6] }, series: [ { round: 'F'|'D'|'L'|'W',
     a, b, wins: { <abbr>: n }, homes: [abbr per game number] } ] }. Official
     seeds replace the simulated seeding, a series already under way starts from
     its real wins and remaining home parks, a decided series is decided, and only
     what is left is simulated with the same per game model. */
  function psSeries(inputs, round, x, y) {
    var ps = inputs.postseason;
    if (!ps || !ps.series) return null;
    for (var i = 0; i < ps.series.length; i++) {
      var k = ps.series[i];
      if (k.round === round && ((k.a === x && k.b === y) || (k.a === y && k.b === x))) return k;
    }
    return null;
  }

  /* Higher seed under MLB rules: the better seed in the Wild Card, Division and
     League Championship Series; the better regular season record in the World
     Series. Seed lists are per league. */
  function psHigher(inputs, a, b, round) {
    var seeds = inputs.postseason.seeds;
    if (round !== 'W') {
      var sa = seeds[a.conference].indexOf(a.abbr), sb = seeds[b.conference].indexOf(b.abbr);
      return sa <= sb ? a : b;
    }
    return better('mlb', a, b);
  }

  function seriesFrom(inputs, a, b, rng, length, round) {
    var hi = psHigher(inputs, a, b, round), lo = hi === a ? b : a;
    var len = length, need = (len + 1) / 2;
    var pat = MLB_PATTERN[len];
    var known = psSeries(inputs, round, hi.abbr, lo.abbr);
    var wh = known && known.wins ? (known.wins[hi.abbr] || 0) : 0;
    var wl = known && known.wins ? (known.wins[lo.abbr] || 0) : 0;
    var games = wh + wl;
    while (wh < need && wl < need) {
      var host = known && known.homes && known.homes[games];
      var atHi = host ? host === hi.abbr : pat[games] === 1;
      var winner = atHi ? playGame(inputs, hi, lo, rng) : playGame(inputs, lo, hi, rng);
      if (winner === hi) wh++; else wl++;
      games++;
    }
    return { winner: wh === need ? hi : lo, loser: wh === need ? lo : hi, games: games, hi: hi.abbr, lo: lo.abbr, score: [Math.max(wh, wl), Math.min(wh, wl)] };
  }

  /* MLB (12 team format): in each league the three division winners by record
     take seeds 1 to 3, the three best remaining records seeds 4 to 6. Seeds 1
     and 2 skip the Wild Card Series. */
  function seedMlb(recs, rng, inputs) {
    var confs = byConference(recs), out = {};
    var official = inputs && inputs.postseason && inputs.postseason.seeds;
    Object.keys(confs).sort().forEach(function (conf) {
      var ranked = order('mlb', confs[conf], rng);
      if (official && official[conf] && official[conf].length === 6) {
        var os = official[conf].map(function (ab) { return recs[ab]; });
        out[conf] = { ranked: ranked, seeds: os, divisionWinners: os.slice(0, 3), wildcards: os.slice(3) };
        return;
      }
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
      if (sport === 'mlb' && inputs.postseason) {
        var qs = s.seeds;
        var c36 = seriesFrom(inputs, qs[2], qs[5], rng, 3, 'F');
        var c45 = seriesFrom(inputs, qs[3], qs[4], rng, 3, 'F');
        r1.push(c36, c45);
        r2.push(seriesFrom(inputs, qs[0], c45.winner, rng, 5, 'D'));
        r2.push(seriesFrom(inputs, qs[1], c36.winner, rng, 5, 'D'));
      } else if (sport === 'mlb') {
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
      cf = sport === 'mlb' && inputs.postseason ? seriesFrom(inputs, r2[0].winner, r2[1].winner, rng, 7, 'L')
        : series(inputs, r2[0].winner, r2[1].winner, rng);
      rounds[0] = rounds[0].concat(r1.map(tag(conf)));
      rounds[1] = rounds[1].concat(r2.map(tag(conf)));
      rounds[2].push(tag(conf)(cf));
      champs[conf] = cf.winner;
    });
    var fin = sport === 'mlb' && inputs.postseason ? seriesFrom(inputs, champs[confNames[0]], champs[confNames[1]], rng, 7, 'W')
      : series(inputs, champs[confNames[0]], champs[confNames[1]], rng);
    rounds[3].push(fin);
    return { rounds: rounds, champion: fin.winner };
  }

  function tag(conf) { return function (s) { s.conference = conf; return s; }; }

  /* ------------------------------------------------------------ one season */

  function runOnce(inputs, rng, opts) {
    var recs = simulateSeason(inputs, rng, opts);
    var seeding = inputs.sport === 'nba' ? seedNba(recs, rng, inputs, rng)
      : inputs.sport === 'mlb' ? seedMlb(recs, rng, inputs) : seedNhl(recs, rng);
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
    var nbaFull = sport === 'nba' ? ((opts && typeof opts.nbaSigma === 'number') ? opts.nbaSigma : NBA_SIGMA) : 0;
    var useNoise = (sport === 'nhl' || (sport === 'nba' && nbaFull > 0)) && !(opts && opts.uncertainty === false);
    var sigma = !useNoise ? 0 : sport === 'nhl' ? nhlSigma(inputs) : nbaSigma(inputs, nbaFull);
    var noiseRng = mulberry32(((seed || 1) ^ 0x9e3779b9) >>> 0);
    var gauss = function () {
      var u = 0; while (u === 0) u = noiseRng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * noiseRng());
    };
    var NOISE_PREV = null;
    for (var i = 0; i < n; i++) {
      if (useNoise) {
        /* NBA: antithetic pairs (every second season mirrors the offsets of
           the one before), so the average projection carries no extra Monte
           Carlo error from the offsets. NHL keeps its independent draws. */
        if (sport === 'nba' && i % 2 === 1 && NOISE_PREV) {
          var prev = NOISE_PREV;
          NOISE = {};
          Object.keys(prev).forEach(function (k) { NOISE[k] = -prev[k]; });
        } else {
          NOISE = {};
          inputs.teams.forEach(function (t) { NOISE[t.espn_abbr] = sigma * gauss(); });
        }
        NOISE_PREV = NOISE;
        NOISE_S = sigma;
      }
      var one;
      try { one = runOnce(inputs, rng, opts); } finally { NOISE = null; }
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
          s.divisionWinners.forEach(function (r) { acc[r.abbr].division_title++; });
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
    gameProb: gameProb,
    order: order,
    breakTie: breakTie,
    nbaContext: nbaContext,
    applyGame: applyGame,
    blankRecord: blankRecord,
    seedNba: seedNba,
    seedNhl: seedNhl,
    series: series,
    playoffs: playoffs,
    runOnce: runOnce,
    project: project,
    NBA_GAMES: NBA_GAMES,
  };
}));
