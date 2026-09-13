/**
 * G10_PLAYOFF_ENGINE_20260913 -- NFL standings, tiebreakers, seeding and bracket.
 *
 * Pure functions over plain data. No DOM, no fetch, no globals beyond the one
 * export, so the same file runs in the browser and under Node for the tests.
 * That is deliberate: a tiebreaker engine nobody can unit test is a tiebreaker
 * engine nobody should trust, and a wrong seed is publicly checkable.
 *
 * THE TWO RULES THAT ARE EASY TO GET WRONG, AND ARE HANDLED FIRST
 *
 *   1. ONLY THE HIGHEST-RANKED CLUB IN A DIVISION IS WILD-CARD ELIGIBLE, and
 *      that filter runs BEFORE the wild-card tiebreaker sequence, not after.
 *      Applying it afterwards is the classic implementation bug and it silently
 *      produces the wrong 7 seed.
 *   2. A TIE AMONG THREE OR MORE CLUBS REDUCES TO TWO AND THEN RESTARTS AT STEP
 *      ONE. It does not continue down the list with two clubs left.
 *
 * WHAT THIS ENGINE WILL NOT DO. Two published tiebreakers cannot be computed
 * from the data TrustMyRecord holds, and neither is faked:
 *
 *   best net touchdowns in all games -- nfl_team_game_drives counts touchdowns
 *       scored on a club's OWN drives (d_td). Defensive and return scores are
 *       stored as POINTS, not as touchdown counts, so total touchdowns is not
 *       derivable. Deliberately, per the schema comment: a defensive score "is
 *       not an offensive failure and must not be modelled as one".
 *   a coin toss -- not implementable by definition, and simulating one as a
 *       50/50 would present a coin flip as a resolved outcome.
 *
 * When the chain runs out the clubs come back TIED, carrying the step reached,
 * and the caller says so. Nothing is invented to force an order.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TMRPlayoffEngine = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ utils */

  function emptyRec() {
    return { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
  }
  function addRec(r, pf, pa) {
    r.pf += pf; r.pa += pa;
    if (pf > pa) r.w += 1; else if (pf < pa) r.l += 1; else r.t += 1;
  }
  /**
   * Win percentage with ties as half a win, the league's own convention.
   *
   * A club that has PLAYED NOTHING returns 0.5, not 0. This matters in the first
   * fortnight of a season and it is what every standings page does: after the
   * Thursday opener a club that has not kicked off yet sits BELOW the 1-0 club
   * and ABOVE the 0-1 club, because it has no result either way. Returning 0
   * instead put an 0-1 club into the same tie group as twenty-eight clubs at
   * 0-0, and the tiebreaker chain then handed the 1 seed to a team that had
   * already lost -- visible on the first render of this page with two games
   * played.
   */
  function pct(r) {
    var n = r.w + r.l + r.t;
    return n === 0 ? 0.5 : (r.w + r.t * 0.5) / n;
  }
  function recLabel(r) {
    return r.t ? (r.w + '-' + r.l + '-' + r.t) : (r.w + '-' + r.l);
  }

  /**
   * Resolve every game to a result.
   *   completed games  -> their real score, always, never overridden
   *   user picks       -> the winner the user chose
   *   simulated        -> the winner drawn for this iteration
   * Anything with no result is simply absent, which is what keeps an unplayed,
   * unpicked week out of the standings instead of counting as a loss.
   */
  function resolveResults(games, picks, sims) {
    var out = [];
    for (var i = 0; i < games.length; i++) {
      var g = games[i];
      if (g.completed) {
        out.push({ g: g, home: g.home_score, away: g.away_score, source: 'actual' });
        continue;
      }
      var w = (sims && sims[g.id]) || (picks && picks[g.id]) || null;
      if (!w) continue;
      var src = (sims && sims[g.id]) ? 'simulated' : 'pick';
      // A pick names a winner, not a score. One point to nil is enough to carry
      // a win into the standings and is never displayed as a score.
      out.push({ g: g, home: w === g.home ? 1 : 0, away: w === g.away ? 1 : 0, source: src });
    }
    return out;
  }

  /** Build every record split the tiebreakers need, in one pass. */
  function buildStandings(teams, results) {
    var byId = {};
    teams.forEach(function (t) {
      byId[t.id] = {
        team: t,
        overall: emptyRec(), division: emptyRec(), conference: emptyRec(),
        opponents: [],          // every opponent id, in order
        beaten: [],             // opponents actually beaten (for strength of victory)
        h2h: {},                // opponent id -> record against that opponent
      };
    });
    results.forEach(function (r) {
      var h = byId[r.g.home], a = byId[r.g.away];
      if (!h || !a) return;
      addRec(h.overall, r.home, r.away);
      addRec(a.overall, r.away, r.home);
      var sameConf = h.team.conference === a.team.conference;
      var sameDiv = sameConf && h.team.division === a.team.division;
      if (sameConf) { addRec(h.conference, r.home, r.away); addRec(a.conference, r.away, r.home); }
      if (sameDiv) { addRec(h.division, r.home, r.away); addRec(a.division, r.away, r.home); }
      h.opponents.push(a.team.id); a.opponents.push(h.team.id);
      if (r.home > r.away) h.beaten.push(a.team.id);
      if (r.away > r.home) a.beaten.push(h.team.id);
      if (!h.h2h[a.team.id]) h.h2h[a.team.id] = emptyRec();
      if (!a.h2h[h.team.id]) a.h2h[h.team.id] = emptyRec();
      addRec(h.h2h[a.team.id], r.home, r.away);
      addRec(a.h2h[h.team.id], r.away, r.home);
    });
    return byId;
  }

  /* ----------------------------------------------------- tiebreaker helpers */

  function h2hAmong(st, ids, id) {
    var r = emptyRec();
    ids.forEach(function (other) {
      if (other === id) return;
      var x = st[id].h2h[other];
      if (x) { r.w += x.w; r.l += x.l; r.t += x.t; }
    });
    return r;
  }

  /** True only when every club in the group has played every other. */
  function h2hApplies(st, ids) {
    for (var i = 0; i < ids.length; i++) {
      for (var j = i + 1; j < ids.length; j++) {
        if (!st[ids[i]].h2h[ids[j]]) return false;
      }
    }
    return true;
  }

  function commonOpponents(st, ids) {
    var sets = ids.map(function (id) {
      var s = {};
      st[id].opponents.forEach(function (o) { if (ids.indexOf(o) === -1) s[o] = true; });
      return s;
    });
    return Object.keys(sets[0] || {}).filter(function (o) {
      return sets.every(function (s) { return s[o]; });
    });
  }

  function recordVs(st, id, oppIds) {
    var r = emptyRec();
    oppIds.forEach(function (o) {
      var x = st[id].h2h[o];
      if (x) { r.w += x.w; r.l += x.l; r.t += x.t; r.pf += x.pf; r.pa += x.pa; }
    });
    return r;
  }

  function strengthOf(st, ids) {
    var r = emptyRec();
    ids.forEach(function (o) {
      if (!st[o]) return;
      r.w += st[o].overall.w; r.l += st[o].overall.l; r.t += st[o].overall.t;
    });
    return pct(r);
  }

  /**
   * Combined ranking in points scored and points allowed across a pool.
   *
   * COMPETITION RANKING, deliberately. An earlier cut took the index of the club
   * in a sorted array, which hands two clubs with IDENTICAL points for and
   * against two DIFFERENT ranks decided by array order. That silently resolved
   * ties this step has not actually resolved, and it is exactly the fake
   * precision this engine exists to avoid. Equal values now share a rank, so the
   * step declines to separate them and the sequence moves on.
   */
  function combinedRank(st, id, pool) {
    function rankOf(valueOf, better) {
      var mine = valueOf(id);
      var ahead = 0;
      pool.forEach(function (o) { if (better(valueOf(o), mine)) ahead += 1; });
      return ahead;
    }
    var scored = rankOf(function (x) { return st[x].overall.pf; }, function (a, b) { return a > b; });
    var allowed = rankOf(function (x) { return st[x].overall.pa; }, function (a, b) { return a < b; });
    return scored + allowed;
  }

  /**
   * The published sequences. `division` is used when every club in the tie comes
   * from the same division, `wildcard` otherwise. Each step returns a number for
   * each club; HIGHER wins, except where noted by negating inside the step.
   */
  function steps(kind, ctx) {
    var st = ctx.st, ids = ctx.ids, confPool = ctx.confPool, leaguePool = ctx.leaguePool;
    var common = commonOpponents(st, ids);
    var list = [];

    if (kind === 'division') {
      list.push({ name: 'head-to-head', applies: true, score: function (id) { return pct(h2hAmong(st, ids, id)); } });
      list.push({ name: 'division record', applies: true, score: function (id) { return pct(st[id].division); } });
    } else {
      list.push({
        name: 'head-to-head (swept)',
        applies: h2hApplies(st, ids),
        score: function (id) { return pct(h2hAmong(st, ids, id)); },
      });
      list.push({ name: 'conference record', applies: true, score: function (id) { return pct(st[id].conference); } });
    }
    list.push({
      name: 'common games (minimum four)',
      applies: common.length >= 4,
      score: function (id) { return pct(recordVs(st, id, common)); },
    });
    if (kind === 'division') {
      list.push({ name: 'conference record', applies: true, score: function (id) { return pct(st[id].conference); } });
    }
    list.push({ name: 'strength of victory', applies: true, score: function (id) { return strengthOf(st, st[id].beaten); } });
    list.push({ name: 'strength of schedule', applies: true, score: function (id) { return strengthOf(st, st[id].opponents); } });
    list.push({
      name: 'combined ranking among conference clubs in points scored and allowed',
      applies: true,
      score: function (id) { return -combinedRank(st, id, confPool); },
    });
    list.push({
      name: 'combined ranking among all clubs in points scored and allowed',
      applies: true,
      score: function (id) { return -combinedRank(st, id, leaguePool); },
    });
    list.push({
      name: 'net points in common games',
      applies: common.length > 0,
      score: function (id) { var r = recordVs(st, id, common); return r.pf - r.pa; },
    });
    list.push({
      name: 'net points in all games',
      applies: true,
      score: function (id) { return st[id].overall.pf - st[id].overall.pa; },
    });
    return list;
  }

  /**
   * Order a tied group. Returns { order: [ids], reason, unresolved, stepReached }.
   * Recursive by construction so that a group reduced to two restarts at step one.
   */
  function breakTie(kind, st, ids, ctx, depth) {
    depth = depth || 0;
    if (ids.length === 1) return { order: ids.slice(), reason: null, unresolved: false, stepReached: null };
    if (depth > 12) return { order: ids.slice(), reason: 'recursion guard', unresolved: true, stepReached: null };

    var seq = steps(kind, { st: st, ids: ids, confPool: ctx.confPool, leaguePool: ctx.leaguePool });
    for (var i = 0; i < seq.length; i++) {
      var step = seq[i];
      if (!step.applies) continue;
      var scored = ids.map(function (id) { return { id: id, v: step.score(id) }; });
      var best = Math.max.apply(null, scored.map(function (x) { return x.v; }));
      var winners = scored.filter(function (x) { return x.v === best; }).map(function (x) { return x.id; });
      if (winners.length === ids.length) continue;         // step did not separate
      var rest = ids.filter(function (id) { return winners.indexOf(id) === -1; });
      // Reduced to a smaller group: the league restarts the sequence.
      var top = winners.length === 1
        ? { order: winners, unresolved: false, stepReached: null }
        : breakTie(kind, st, winners, ctx, depth + 1);
      var bottom = breakTie(kind, st, rest, ctx, depth + 1);
      return {
        order: top.order.concat(bottom.order),
        reason: step.name,
        unresolved: top.unresolved || bottom.unresolved,
        stepReached: step.name,
      };
    }
    // Every implementable step exhausted.
    return {
      order: ids.slice(),
      reason: 'tied through net points in all games',
      unresolved: true,
      stepReached: 'net points in all games',
      remaining: ['best net touchdowns in all games', 'a coin toss'],
    };
  }

  /** Sort a pool by win percentage, breaking ties with the published sequence. */
  function rankPool(kind, st, ids, ctx) {
    var notes = [];
    var groups = {};
    ids.forEach(function (id) {
      var k = pct(st[id].overall).toFixed(6);
      (groups[k] = groups[k] || []).push(id);
    });
    var order = [];
    Object.keys(groups).sort(function (a, b) { return Number(b) - Number(a); }).forEach(function (k) {
      var g = groups[k];
      if (g.length === 1) { order.push(g[0]); return; }
      var res = breakTie(kind, st, g, ctx, 0);
      if (res.reason) {
        notes.push({
          teams: g.slice(), resolvedBy: res.reason,
          unresolved: !!res.unresolved, remaining: res.remaining || null,
        });
      }
      order = order.concat(res.order);
    });
    return { order: order, notes: notes };
  }

  /* ------------------------------------------------------------- seeding */

  function seedConference(teams, st, conference) {
    var pool = teams.filter(function (t) { return t.conference === conference; }).map(function (t) { return t.id; });
    var leaguePool = teams.map(function (t) { return t.id; });
    var ctx = { confPool: pool, leaguePool: leaguePool };
    var notes = [];

    // Division winners first.
    var divisions = {};
    teams.forEach(function (t) {
      if (t.conference !== conference) return;
      (divisions[t.division] = divisions[t.division] || []).push(t.id);
    });
    var winners = [];
    var runnersUp = [];
    Object.keys(divisions).sort().forEach(function (d) {
      var r = rankPool('division', st, divisions[d], ctx);
      notes = notes.concat(r.notes);
      winners.push(r.order[0]);
      // RULE: only the top club in a division is wild-card eligible. This is the
      // line that has to run BEFORE the wild-card sequence.
      runnersUp = runnersUp.concat(r.order.slice(1));
    });

    var w = rankPool('wildcard', st, winners, ctx);
    notes = notes.concat(w.notes);

    // Wild-card pool: every club that did not win its division. The eligibility
    // filter above already removed nobody -- every runner-up is eligible -- but
    // the ORDER matters: a division's second-placed club can only take a wild
    // card, never a division seed, whatever its record.
    var wc = rankPool('wildcard', st, runnersUp, ctx);
    notes = notes.concat(wc.notes);

    var seeds = w.order.concat(wc.order).slice(0, 7);
    return { seeds: seeds, divisionWinners: w.order, wildcards: wc.order.slice(0, 3), notes: notes };
  }

  function seedAll(teams, games, picks, sims) {
    var results = resolveResults(games, picks, sims);
    var st = buildStandings(teams, results);
    return {
      standings: st,
      results: results,
      AFC: seedConference(teams, st, 'AFC'),
      NFC: seedConference(teams, st, 'NFC'),
    };
  }

  /* -------------------------------------------------------------- bracket */

  /**
   * The 14-team bracket. The 1 seed byes; wild card is 2v7, 3v6, 4v5; every
   * later round RESEEDS, so the lowest surviving seed always visits the highest.
   * `winnerOf(home, away)` decides a game; the caller supplies picks or a draw.
   */
  function bracket(seeds, winnerOf) {
    var rounds = { wildcard: [], divisional: [], conference: [], champion: null };
    if (seeds.length < 7) return rounds;
    var wc = [[seeds[1], seeds[6]], [seeds[2], seeds[5]], [seeds[3], seeds[4]]];
    var survivors = [seeds[0]];
    wc.forEach(function (p) {
      var win = winnerOf(p[0], p[1]);
      rounds.wildcard.push({ home: p[0], away: p[1], winner: win });
      survivors.push(win);
    });
    survivors.sort(function (a, b) { return seeds.indexOf(a) - seeds.indexOf(b); });
    var d = [[survivors[0], survivors[3]], [survivors[1], survivors[2]]];
    var next = [];
    d.forEach(function (p) {
      var win = winnerOf(p[0], p[1]);
      rounds.divisional.push({ home: p[0], away: p[1], winner: win });
      next.push(win);
    });
    next.sort(function (a, b) { return seeds.indexOf(a) - seeds.indexOf(b); });
    var champ = winnerOf(next[0], next[1]);
    rounds.conference.push({ home: next[0], away: next[1], winner: champ });
    rounds.champion = champ;
    return rounds;
  }

  /* ------------------------------------------------- clinching / elimination */

  /**
   * Brute force over the games that still matter to one club, capped so the page
   * never locks up. Returns 'clinched', 'eliminated' or null, and the cap is
   * reported rather than hidden: an answer we did not finish computing is not an
   * answer.
   */
  function clinchStatus(teams, games, picks, teamId, opts) {
    opts = opts || {};
    var cap = opts.cap || 4096;
    var remaining = games.filter(function (g) { return !g.completed && !(picks && picks[g.id]); });
    if (remaining.length === 0) {
      var s = seedAll(teams, games, picks, null);
      var t = teams.filter(function (x) { return x.id === teamId; })[0];
      return { status: inSeeds(s, t, teamId) ? 'clinched' : 'eliminated', exhaustive: true, checked: 1 };
    }
    if (Math.pow(2, remaining.length) > cap) return { status: null, exhaustive: false, checked: 0, reason: 'too many outcomes' };

    var n = remaining.length, total = Math.pow(2, n);
    var anyIn = false, anyOut = false;
    var t2 = teams.filter(function (x) { return x.id === teamId; })[0];
    for (var mask = 0; mask < total; mask++) {
      var sims = {};
      for (var i = 0; i < n; i++) {
        sims[remaining[i].id] = (mask >> i) & 1 ? remaining[i].home : remaining[i].away;
      }
      var s2 = seedAll(teams, games, picks, sims);
      if (inSeeds(s2, t2, teamId)) anyIn = true; else anyOut = true;
      if (anyIn && anyOut) return { status: null, exhaustive: true, checked: mask + 1 };
    }
    return { status: anyIn ? 'clinched' : 'eliminated', exhaustive: true, checked: total };
  }

  function inSeeds(seeded, team, teamId) {
    if (!team) return false;
    return seeded[team.conference].seeds.indexOf(teamId) !== -1;
  }

  /* ------------------------------------------------------------ simulation */

  /** Deterministic PRNG so a shared link reproduces the run it describes. */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Monte Carlo the rest of the season. User picks are LOCKED and never
   * redrawn; only unpicked games are simulated, from the model's own home win
   * probability when one is available and a coin flip when it is not.
   */
  function simulateSeason(teams, games, picks, iterations, seed, opts) {
    opts = opts || {};
    var rnd = mulberry32(seed || 20260913);
    var open = games.filter(function (g) { return !g.completed && !(picks && picks[g.id]); });
    var tally = {}, seedTally = {}, champTally = {}, sbTally = {};
    teams.forEach(function (t) { tally[t.id] = 0; champTally[t.id] = 0; sbTally[t.id] = 0; seedTally[t.id] = 0; });

    for (var it = 0; it < iterations; it++) {
      var sims = {};
      for (var i = 0; i < open.length; i++) {
        var g = open[i];
        var p = typeof g.home_win_prob === 'number' ? g.home_win_prob : 0.5;
        sims[g.id] = rnd() < p ? g.home : g.away;
      }
      var s = seedAll(teams, games, picks, sims);
      ['AFC', 'NFC'].forEach(function (c) {
        s[c].seeds.forEach(function (id, idx) {
          tally[id] += 1;
          if (idx === 0) seedTally[id] += 1;
        });
      });
      if (opts.withBracket) {
        var champs = {};
        ['AFC', 'NFC'].forEach(function (c) {
          var b = bracket(s[c].seeds, function (a, bb) { return rnd() < 0.5 ? a : bb; });
          if (b.champion) { champTally[b.champion] += 1; champs[c] = b.champion; }
        });
        if (champs.AFC && champs.NFC) {
          var sb = rnd() < 0.5 ? champs.AFC : champs.NFC;
          sbTally[sb] += 1;
        }
      }
    }
    var out = {};
    teams.forEach(function (t) {
      out[t.id] = {
        playoff: tally[t.id] / iterations,
        topSeed: seedTally[t.id] / iterations,
        conference: champTally[t.id] / iterations,
        superbowl: sbTally[t.id] / iterations,
      };
    });
    return { iterations: iterations, seed: seed, probabilities: out, simulatedGames: open.length };
  }

  return {
    emptyRec: emptyRec, pct: pct, recLabel: recLabel,
    resolveResults: resolveResults, buildStandings: buildStandings,
    breakTie: breakTie, rankPool: rankPool,
    seedConference: seedConference, seedAll: seedAll,
    bracket: bracket, clinchStatus: clinchStatus,
    simulateSeason: simulateSeason, mulberry32: mulberry32,
    commonOpponents: commonOpponents, strengthOf: strengthOf,
    UNIMPLEMENTABLE: ['best net touchdowns in all games', 'a coin toss'],
  };
}));
