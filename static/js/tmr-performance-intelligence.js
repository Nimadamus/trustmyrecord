/* TMR_ULTIMATE_20261024 -- TMR Performance Intelligence engine.
   ---------------------------------------------------------------------------
   Reads a member's graded picks and answers, for every slice of the record:
   how much was risked, what came back, and whether the result is a real
   signal or ordinary variance. The report is assembled from those numbers
   alone. There is no model call and no per-view cost, so the same engine runs
   on the server for an Ultimate member and in the browser for the public
   Joe Public demo (the sales page loads a byte-identical copy of this file:
   static/js/tmr-performance-intelligence.js in the frontend repo).

   What it will not do:
     * claim why a pick lost. It separates what was knowable BEFORE the game
       (the price, the line, how the market closed, any pre-game inputs that
       were recorded with the pick) from what happened after (the result), and
       says which of those it actually has;
     * call a slice a strength or a weakness on sample size alone. Every
       verdict carries its z-score against the break-even rate of the prices
       actually paid, and small or noisy slices are labelled as such;
     * treat a win as good handicapping or a loss as bad handicapping. Closing
       line value is reported next to the result for exactly that reason.

   Pick shape (the server maps database rows to this; the demo ships it):
     { id, date: 'YYYY-MM-DD', sport: 'MLB', market: 'total'|'spread'|
       'moneyline'|'prop'|'other', side: 'over'|'under'|null, selection,
       matchup, odds: -110, risk: 1, result: 'won'|'lost'|'push', net: -1,
       line, closeLine, closeOdds, context }                                  */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TMRPerformanceIntelligence = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 'pi-2.1.0';
  var MIN_SAMPLE = 30;
  var MARKET_LABEL = { spread: 'spreads', moneyline: 'moneylines', total: 'totals', team_total: 'team totals', prop: 'props', other: 'other markets' };

  function round(x, d) { var f = Math.pow(10, d == null ? 2 : d); return Math.round(x * f) / f; }
  function implied(odds) {
    var o = Number(odds);
    if (!isFinite(o) || o === 0) return null;
    return o < 0 ? -o / (-o + 100) : 100 / (o + 100);
  }
  /* Profit per unit risked on a win. */
  function payout(odds) { var o = Number(odds); return o < 0 ? 100 / -o : o / 100; }

  /* Standard normal CDF (Abramowitz-Stegun 7.1.26, |error| < 1.5e-7). */
  function phi(z) {
    var t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
      * Math.exp(-z * z / 2);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }

  /* Closing line value, positive = the member beat the close.
       spread / total whose number moved : points gained on the closing line
       everything else (and a spread or total that closed at the same number,
       e.g. every MLB run line at 1.5) : implied probability gained at the
       closing price
     null when the close was not recorded. */
  /* Largest believable move between a pick and the close, by sport and
     market. A bigger gap means the two numbers are not the same market (an
     alternate line, or a close recorded for the other side), and comparing
     them would be fiction, so the close is ignored for that pick. */
  var MAX_MOVE = { MLB: { spread: 1, total: 1.5, team_total: 1 }, NHL: { spread: 1, total: 1.5 }, NBA: { spread: 6, total: 12 },
    WNBA: { spread: 6, total: 12 }, NCAAB: { spread: 8, total: 14 }, NFL: { spread: 6, total: 7 }, NCAAF: { spread: 10, total: 12 } };
  function closeComparable(p) {
    if (p.line == null || p.closeLine == null) return true;
    /* A close that is the exact mirror of the line taken is usually TMR's
       capture of the other side. A book close matched to the side taken
       (p.sideVerified, or a filled close with closeSource) can genuinely move
       through pick'em (-1.5 to +1.5), so it is kept. */
    if (!p.sideVerified && !p.closeSource && Number(p.line) !== 0 && Number(p.closeLine) === -Number(p.line)) return false;
    var cap = MAX_MOVE[p.sport] && MAX_MOVE[p.sport][p.market];
    if (cap != null && Math.abs(p.closeLine - p.line) > cap) return false;
    /* Points are only comparable at a standard price; -186 at -1.5 is an
       alternate line, and its points say nothing about value. */
    if (Number(p.line) !== Number(p.closeLine) && (p.odds < -135 || p.odds > 125)) return false;
    return true;
  }
  function clvInfo(p) {
    if (!closeComparable(p)) return null;
    if ((p.market === 'total' || p.market === 'team_total' || p.market === 'spread') && p.line != null && p.closeLine != null
      && Number(p.line) !== Number(p.closeLine)) {
      var pts = p.market !== 'spread'
        ? (p.side === 'under' ? p.line - p.closeLine : p.closeLine - p.line)
        : p.line - p.closeLine;
      return { v: pts, unit: 'pts' };
    }
    if (p.closeOdds != null) {
      var a = implied(p.odds), b = implied(p.closeOdds);
      if (a != null && b != null) return { v: b - a, unit: 'prob' };
    }
    if ((p.market === 'total' || p.market === 'team_total' || p.market === 'spread') && p.line != null && p.closeLine != null) return { v: 0, unit: 'pts' };
    return null;
  }
  function clv(p) { var c = clvInfo(p); return c ? c.v : null; }
  /* Direction of the close against the pick: 1 beat it, -1 lost to it, 0 no
     real move. Half a point of implied probability is the floor for a price
     move: -176 to -174 is noise, not the market disagreeing. */
  var PROB_EPS = 0.005;
  function clvDir(p) {
    var c = clvInfo(p);
    if (!c) return null;
    var eps = c.unit === 'prob' ? PROB_EPS : 1e-9;
    return c.v > eps ? 1 : c.v < -eps ? -1 : 0;
  }

  function stats(list) {
    var s = { n: list.length, w: 0, l: 0, p: 0, risked: 0, net: 0, expWins: 0, varWins: 0,
      clvN: 0, clvBeat: 0, clvWorse: 0, clvSum: 0, clvUnit: null };
    for (var i = 0; i < list.length; i++) {
      var k = list[i];
      s.risked += Number(k.risk) || 0;
      s.net += Number(k.net) || 0;
      if (k.result === 'won') s.w++; else if (k.result === 'lost') s.l++; else s.p++;
      if (k.result === 'won' || k.result === 'lost') {
        var q = implied(k.odds) || 0.5;
        s.expWins += q; s.varWins += q * (1 - q);
      }
      var ci = clvInfo(k);
      if (ci) {
        /* 1e-9: an unchanged price is a tie, not a sliver of value. */
        s.clvN++; s.clvSum += ci.v;
        var dir = clvDir(k);
        if (dir > 0) s.clvBeat++; else if (dir < 0) s.clvWorse++;
        s.clvUnit = s.clvUnit && s.clvUnit !== ci.unit ? 'mixed' : ci.unit;
      }
    }
    var decided = s.w + s.l;
    s.roi = s.risked ? s.net / s.risked : 0;
    s.winPct = decided ? s.w / decided : 0;
    s.breakEven = decided ? s.expWins / decided : 0;
    /* z of the win count against the break-even wins of the prices paid. */
    s.z = s.varWins > 0 ? (s.w - s.expWins) / Math.sqrt(s.varWins) : 0;
    s.pValue = 2 * (1 - phi(Math.abs(s.z)));
    /* Share of picks that beat the close among those where the number or the
       price actually moved; a pick that closed exactly where it was taken
       neither beat nor lost to the market. */
    s.clvMoved = s.clvBeat + s.clvWorse;
    s.beatClose = s.clvMoved ? s.clvBeat / s.clvMoved : null;
    /* Is the beat rate different from a coin flip? Binomial normal approximation. */
    s.clvP = s.clvMoved ? 2 * (1 - phi(Math.abs((s.clvBeat - s.clvMoved / 2) / Math.sqrt(s.clvMoved / 4)))) : null;
    s.avgClv = s.clvN && s.clvUnit !== 'mixed' ? s.clvSum / s.clvN : null;
    s.verdict = verdict(s);
    return pack(s);
  }

  function pack(s) {
    return {
      n: s.n, w: s.w, l: s.l, p: s.p,
      risked: round(s.risked, 2), net: round(s.net, 2), roi: round(s.roi, 4),
      win_pct: round(s.winPct, 4), break_even_pct: round(s.breakEven, 4),
      z: round(s.z, 2), p_value: round(s.pValue, 3),
      clv_n: s.clvN, clv_moved: s.clvMoved, clv_unchanged: s.clvN - s.clvMoved,
      beat_close_pct: s.beatClose == null ? null : round(s.beatClose, 3),
      clv_p_value: s.clvP == null ? null : round(s.clvP, 3),
      avg_clv: s.avgClv == null ? null : round(s.avgClv, s.clvUnit === 'pts' ? 2 : 4), clv_unit: s.clvUnit,
      verdict: s.verdict,
    };
  }

  /* Holm step-down adjustment. Testing ten categories and calling the best
     one "meaningful" at p < 0.05 is how a report cherry-picks; adjusted p
     is what the meaningful label uses. Mutates each item's p_adjusted. */
  function holm(items) {
    var m = items.length;
    var order = items.slice().sort(function (a, b) { return a.p_value - b.p_value; });
    var running = 0;
    order.forEach(function (it, i) {
      running = Math.max(running, Math.min(1, (m - i) * it.p_value));
      it.p_adjusted = round(running, 3);
    });
    return m;
  }

  /* The verdict ladder. Sample size first, then evidence strength. */
  function verdict(s) {
    if (s.n < MIN_SAMPLE) return { key: 'small_sample', label: 'Too few picks to judge', tone: 'neutral' };
    var up = s.roi >= 0;
    var pMeaningful = s.pAdjusted != null ? s.pAdjusted : s.pValue;
    if (pMeaningful < 0.05) return up
      ? { key: 'strength', label: 'Statistically meaningful strength', tone: 'pos' }
      : { key: 'weakness', label: 'Statistically meaningful weakness', tone: 'neg' };
    if (s.pValue < 0.2) return up
      ? { key: 'lean_strength', label: 'Possible strength, not yet conclusive', tone: 'pos' }
      : { key: 'lean_weakness', label: 'Possible weakness, not yet conclusive', tone: 'neg' };
    return { key: 'variance', label: 'Within normal variance', tone: 'neutral' };
  }

  function groupBy(list, keyFn) {
    var out = {}, order = [];
    for (var i = 0; i < list.length; i++) {
      var k = keyFn(list[i]);
      if (k == null) continue;
      if (!out[k]) { out[k] = []; order.push(k); }
      out[k].push(list[i]);
    }
    return order.map(function (k) { return { key: k, picks: out[k] }; });
  }

  function oddsBand(o) {
    o = Number(o);
    if (o <= -200) return 'Heavy favorite (-200 or shorter)';
    if (o <= -121) return 'Favorite (-199 to -121)';
    if (o <= 120) return 'Near even (-120 to +120)';
    if (o <= 200) return 'Underdog (+121 to +200)';
    return 'Long shot (+201 or longer)';
  }
  var BAND_ORDER = ['Heavy favorite (-200 or shorter)', 'Favorite (-199 to -121)', 'Near even (-120 to +120)',
    'Underdog (+121 to +200)', 'Long shot (+201 or longer)'];

  /* Props are split by what was bet (strikeouts, hits, shots on goal): a
     member can be sharp on one and losing on another, and "MLB props" would
     average the two into nothing. */
  function catKey(p) { return p.sport + ' ' + (p.marketName ? p.marketName : (MARKET_LABEL[p.market] || p.market)); }
  function slices(list, keyFn) {
    return groupBy(list, keyFn).map(function (g) {
      var s = stats(g.picks); s.key = g.key; return s;
    });
  }

  function dayOfWeek(d) { return new Date(d + 'T12:00:00Z').getUTCDay(); }

  /* Sub-splits of one category worth a closer look: two halves of the same
     slice whose returns differ by 10+ ROI points with 15+ picks each. They are
     PATTERNS to check, never conclusions. */
  /* Splits inside a weak category. Only three, declared in advance and the
     same for every member (side, price, home or away), so the report cannot
     go hunting. A split is shown only if its weaker half is still
     significant after a Holm adjustment over every half tested; otherwise
     the report says that nothing stood out. Day of week and closing-line
     splits were removed: the first is a classic data-mining cut, and the
     second is circular (beating the close and winning are related by
     construction). */
  var SPLITS = [
    { name: 'Side', fn: function (p) { return p.side ? (p.side === 'over' ? 'Overs' : 'Unders') : null; } },
    { name: 'Price', fn: function (p) { return Number(p.odds) <= -121 ? 'Laid -121 or more' : 'Better than -121'; } },
    { name: 'Home or away', fn: function (p) {
      if (p.side || !p.home || !(p.pickedTeam || p.selection)) return null;
      var pick = String(p.pickedTeam || p.selection).toLowerCase();
      return pick.indexOf(String(p.home).toLowerCase()) === 0 ? 'Home side' : 'Away side';
    } },
  ];
  function patterns(list) {
    var tested = [];
    var candidates = [];
    SPLITS.forEach(function (t) {
      var parts = slices(list, t.fn).filter(function (x) { return x.n >= 15; });
      if (parts.length < 2) return;
      parts.forEach(function (x) { tested.push(x); });
      parts.sort(function (a, b) { return a.roi - b.roi; });
      candidates.push({ dimension: t.name, worse: parts[0], better: parts[parts.length - 1] });
    });
    holm(tested);
    var found = candidates.filter(function (c) {
      return c.better.roi - c.worse.roi >= 0.10 && c.worse.roi < 0 && c.worse.p_adjusted < 0.10;
    }).map(function (c) { c.gap = round(c.better.roi - c.worse.roi, 4); return c; });
    found.sort(function (a, b) { return b.gap - a.gap; });
    found.tested = tested.length;
    return found;
  }

  /* Comparisons between parts of a record: the coaching the member can act
     on ("NFL sides beat NFL totals", "underdogs lag favorites"). Declared in
     advance and the same for everyone:
       within each sport, every pair of bet types with 30+ picks each
       across the record, favorites against underdogs
     Each is a Welch test on per-pick return (net / risked); every p-value is
     Holm-adjusted over all comparisons made for this member. Only a gap that
     survives (adjusted p < 0.10) is reported as a pattern worth
     investigating; the rest are listed as differences within noise. */
  function retStats(list) {
    var r = list.map(function (p) { return (Number(p.net) || 0) / (Number(p.risk) || 1); });
    var n = r.length, m = r.reduce(function (a, b) { return a + b; }, 0) / (n || 1);
    var v = n > 1 ? r.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (n - 1) : 0;
    return { n: n, mean: m, varr: v };
  }
  function compare(aName, aList, bName, bList) {
    var A = stats(aList), B = stats(bList), ra = retStats(aList), rb = retStats(bList);
    var se = Math.sqrt(ra.varr / ra.n + rb.varr / rb.n);
    var z = se > 0 ? (ra.mean - rb.mean) / se : 0;
    var better = A.roi >= B.roi;
    return { better: better ? aName : bName, worse: better ? bName : aName, better_stats: better ? A : B, worse_stats: better ? B : A,
      gap: round(Math.abs(A.roi - B.roi), 4), p_value: round(2 * (1 - phi(Math.abs(z))), 3) };
  }
  function insights(graded) {
    var out = [];
    var bySport = groupBy(graded, function (p) { return p.sport; });
    bySport.forEach(function (g) {
      var fams = groupBy(g.picks.filter(function (p) { return !p.marketName || p.market === 'prop'; }), function (p) { return MARKET_LABEL[p.market] || p.market; })
        .filter(function (f) { return f.picks.length >= MIN_SAMPLE; });
      for (var i = 0; i < fams.length; i++) for (var j = i + 1; j < fams.length; j++) {
        var c = compare(g.key + ' ' + fams[i].key, fams[i].picks, g.key + ' ' + fams[j].key, fams[j].picks);
        c.kind = 'bet_type'; c.sport = g.key; out.push(c);
      }
    });
    /* Favorite or underdog is a moneyline idea: a -110 spread is neither. */
    var favs = graded.filter(function (p) { return p.market === 'moneyline' && Number(p.odds) < 0; });
    var dogs = graded.filter(function (p) { return p.market === 'moneyline' && Number(p.odds) > 0; });
    if (favs.length >= MIN_SAMPLE && dogs.length >= MIN_SAMPLE) { var fd = compare('Moneyline favorites', favs, 'Moneyline underdogs', dogs); fd.kind = 'price_side'; out.push(fd); }
    holm(out);
    var findings = out.filter(function (c) { return c.p_adjusted < 0.10; }).sort(function (a, b) { return a.p_adjusted - b.p_adjusted; });
    var noise = out.filter(function (c) { return !(c.p_adjusted < 0.10); }).sort(function (a, b) { return b.gap - a.gap; });
    findings.forEach(function (c) {
      c.text = c.better + ' returned ' + pct(c.better_stats.roi) + ' over ' + c.better_stats.n + ' picks against ' + pct(c.worse_stats.roi) + ' over ' + c.worse_stats.n +
        ' for ' + c.worse + '. The gap held up after adjusting for the ' + out.length + ' comparisons made (adjusted p = ' + c.p_adjusted.toFixed(2) + ').';
      c.suggestion = c.kind === 'price_side'
        ? 'Consider reviewing how you choose ' + c.worse.toLowerCase() + ': the price each one needs to break even, and how often your price beat the close.'
        : 'Consider comparing how you research ' + c.worse + ' with your process for ' + c.better + ': what you check, when you bet, and the prices you take.';
    });
    noise.forEach(function (c) {
      c.text = c.better + ' (' + pct(c.better_stats.roi) + ', ' + c.better_stats.n + ' picks) against ' + c.worse + ' (' + pct(c.worse_stats.roi) + ', ' + c.worse_stats.n +
        ' picks): within what chance produces once the ' + out.length + ' comparisons are accounted for.';
    });
    return { tested: out.length, findings: findings, within_noise: noise.slice(0, 3) };
  }

  /* Research checklists, keyed by sport + market. Each item is a question the
     member can answer BEFORE the next bet, not an after-the-fact excuse. */
  var CHECKLISTS = {
    'MLB total': ['Starting pitchers: last 5 starts on underlying metrics (K-BB%, xFIP, hard-hit rate), not ERA alone',
      'Ballpark run factor and how the roof or dimensions play for this matchup',
      'Weather at first pitch: temperature, wind speed and direction (in or out)',
      'Bullpen availability: relievers used on back-to-back days and pitch counts over the last 3 days',
      'Lineups: confirmed batting orders, rest days and platoon splits against today\'s starters',
      'Price: compare your number with the market and note where the total closes'],
    'MLB moneyline': ['Starting pitcher matchup on underlying metrics', 'Bullpen availability for both clubs',
      'Lineup and rest-day news', 'Price versus your own win probability'],
    'NFL spread': ['Injury report and practice participation by position group', 'Key numbers (3, 7) relative to the line you are taking',
      'Rest and travel spot', 'Weather for outdoor games', 'Where the line closes versus where you bet it'],
    'NBA moneyline': ['Rest, travel and back-to-backs', 'Late injury and minutes-restriction news', 'Price versus your own win probability'],
    'NBA spread': ['Rest and back-to-backs', 'Rotation news and minutes limits', 'Pace matchup', 'Line movement after injury news'],
    'NHL prop': ['Projected time on ice and power-play unit', 'Opponent shot suppression and goalie', 'Price against the recent rate, not the raw count'],
  };
  var GENERIC_CHECKLIST = ['Write down the edge you see before you bet it', 'Compare your price with the market and record the close',
    'Note the information that could change the number (injuries, weather, lineups)'];
  function checklistFor(sport, market) { return CHECKLISTS[sport + ' ' + market] || GENERIC_CHECKLIST; }

  function pct(x, d) { var t = (x * 100).toFixed(d == null ? 1 : d); if (Number(t) === 0) t = t.replace('-', ''); return (Number(t) >= 0 ? '+' : '') + t + '%'; }
  function u(x) { return (x >= 0 ? '+' : '') + x.toFixed(1) + 'u'; }

  /* One pick, split into what was knowable before the game and what happened. */
  function reviewPick(p) {
    var c = clv(p), dir = clvDir(p);
    var before = [], verdicts = [];
    before.push({ label: 'Price taken', value: (p.line != null ? (p.side ? (p.side === 'over' ? 'Over ' : 'Under ') : '') + p.line + ' ' : '') + '(' + (p.odds > 0 ? '+' : '') + p.odds + ')' });
    before.push({ label: 'Break-even win rate at that price', value: (implied(p.odds) * 100).toFixed(1) + '%' });
    if (p.closeLine != null || p.closeOdds != null) {
      before.push({ label: 'Closing number' + (p.closeSource ? ' (' + p.closeSource + ')' : ''), value: (p.closeLine != null ? p.closeLine + ' ' : '') + (p.closeOdds != null ? '(' + (p.closeOdds > 0 ? '+' : '') + p.closeOdds + ')' : '') });
    }
    if (dir != null) {
      if (dir === 0) verdicts.push(Math.abs(c) < 1e-9
        ? 'The pick closed at the same number and price it was placed at, so the market neither confirmed nor rejected it.'
        : 'The price barely moved before the game, so the market neither confirmed nor rejected it.');
      else if (dir > 0) verdicts.push('The market moved toward this pick after it was placed: the price taken was better than the close.');
      else verdicts.push('The market closed against this price. One close is weak evidence on its own; across many picks, how often prices beat the close is a useful measure of pricing.');
      var ref = marketReference(p);
      if (ref) verdicts.push(ref);
    } else {
      verdicts.push('No closing number is on file for this pick, so the price cannot be checked against the market.');
    }
    if (p.result === 'won' && dir === -1) verdicts.push('It won at a price worse than the close. Over many picks, winning at worse than closing prices is hard to sustain, so a win like this is not evidence by itself.');
    if (p.result === 'lost' && dir === 1) verdicts.push('It lost at a price better than the close. On its own, a result like this says nothing against the process.');
    return {
      id: p.id, date: p.date, sport: p.sport, market: p.market, matchup: p.matchup, selection: p.selection,
      result: p.result, net: round(Number(p.net) || 0, 2), clv: c == null ? null : round(c, 4),
      before_game: before,
      recorded_inputs: p.context || null,
      inputs_summary: inputsSummary(p),
      research: p.context ? research(p) : null,
      market_read: verdicts,
      after_game: p.final || null,
      checklist: checklistFor(p.sport, p.market),
    };
  }

  function odd(o) { return (o > 0 ? '+' : '') + o; }

  /* The inputs a full review of this sport and market would have; whatever is
     missing for a given game is listed as unavailable, never guessed. */
  var EXPECTED = {
    'MLB total': ['Starting pitchers', 'Ballpark', 'Weather', 'Bullpens', 'Recent form', 'Line movement', 'TrendSpotter'],
    'MLB moneyline': ['Starting pitchers', 'Bullpens', 'Recent form', 'Line movement', 'TrendSpotter'],
    'MLB spread': ['Starting pitchers', 'Bullpens', 'Recent form', 'Line movement', 'TrendSpotter'],
    'NFL spread': ['Records', 'Recent form', 'Rest', 'Quarterbacks', 'Injury report', 'Weather', 'Line movement', 'TrendSpotter'],
    'NFL total': ['Records', 'Recent form', 'Rest', 'Quarterbacks', 'Injury report', 'Weather', 'Line movement', 'TrendSpotter'],
    'NFL moneyline': ['Records', 'Recent form', 'Rest', 'Quarterbacks', 'Injury report', 'Weather', 'Line movement', 'TrendSpotter'],
    'NBA spread': ['Records', 'Recent form', 'Rest', 'Injury absences', 'Line movement', 'TrendSpotter'],
    'NBA total': ['Records', 'Recent form', 'Rest', 'Injury absences', 'Line movement', 'TrendSpotter'],
    'NBA moneyline': ['Records', 'Recent form', 'Rest', 'Injury absences', 'Line movement', 'TrendSpotter'],
    'NHL moneyline': ['Records', 'Recent form', 'Rest', 'Goaltending', 'Line movement', 'TrendSpotter'],
    'NHL total': ['Records', 'Recent form', 'Rest', 'Goaltending', 'Line movement', 'TrendSpotter'],
    'NCAAF spread': ['Records', 'Recent form', 'Rest', 'Injury report', 'Weather', 'Line movement'],
    'NCAAF total': ['Records', 'Recent form', 'Rest', 'Injury report', 'Weather', 'Line movement'],
    'prop': ['Recent form', 'Season', 'Workload', 'Line movement'],
  };
  var DIR_NAME = { over: 'the Over', under: 'the Under', for: 'the side taken', against: 'the other side' };

  /* Research synthesis for one pick: how the inputs available at the time
     agreed or conflicted, what is uncertain or missing, how the price compared
     with the other prices on record, and the decision kept apart from the
     outcome. It never says which factor caused the result or what the member
     considered: no rationale is recorded with TMR picks. */
  function research(p) {
    var f = (p.context && p.context.factors) || [];
    var pre = f.filter(function (x) { return x.known !== 'before_game' && x.known !== 'game_time'; });
    var leaning = pre.filter(function (x) { return x.pointed && x.pointed !== 'neutral'; });
    var conflicts = [];
    for (var i = 0; i < leaning.length; i++) {
      for (var j = i + 1; j < leaning.length; j++) {
        if (leaning[i].pointed !== leaning[j].pointed && conflicts.length < 3) {
          conflicts.push(leaning[i].name + ' pointed toward ' + DIR_NAME[leaning[i].pointed] + ' while ' + leaning[j].name + ' pointed toward ' + DIR_NAME[leaning[j].pointed] + '.');
        }
      }
    }
    var key = p.market === 'prop' ? 'prop' : p.sport + ' ' + p.market;
    var have = {}; f.forEach(function (x) { have[x.name] = true; });
    var unavailable = (EXPECTED[key] || []).filter(function (n) { return !have[n]; });
    var uncertainty = [];
    var unver = pre.filter(function (x) { return x.known === 'unverified'; }).map(function (x) { return x.name; });
    if (unver.length) uncertainty.push(unver.join(' and ') + ' had no recorded publication time and may have been confirmed after the pick.');
    var later = f.filter(function (x) { return x.known === 'before_game' || x.known === 'game_time'; }).map(function (x) { return x.name; });
    if (later.length) uncertainty.push(later.join(' and ') + ' came after the pick and ' + (later.length > 1 ? 'are' : 'is') + ' shown for completeness only.');
    if (pre.length < 3) uncertainty.push('Few inputs were on record for this game, so the context is thin.');
    /* Second-half and live-segment picks are made after the start by design. */
    if (p.placedAt && p.commence && new Date(p.placedAt) > new Date(p.commence) && !/^second_half_/.test(p.marketType || '')) {
      uncertainty.push('TMR recorded this pick after the start, so no point-in-time review is possible.');
    }
    if (p.closeNote) uncertainty.push(p.closeNote + '.');

    /* Price: the number taken against the other prices on record. */
    var m = p.context && p.context.market_close;
    var price = null;
    if (m && (m.open_line != null || m.open_odds != null) && closeComparable(p)) {
      if ((p.market === 'spread' || p.market === 'total') && m.open_line != null && p.line != null && m.open_line !== p.line) {
        var openBetter = p.market === 'spread' ? m.open_line > p.line : (p.side === 'under' ? m.open_line > p.line : m.open_line < p.line);
        price = 'The opening number (' + m.open_line + ') was ' + (openBetter ? 'better' : 'worse') + ' for this side than the ' + p.line + ' taken.';
      } else if (p.market === 'moneyline' && m.open_odds != null && p.odds != null && m.open_odds !== p.odds) {
        price = 'The opening price (' + odd(m.open_odds) + ') was ' + (implied(m.open_odds) < implied(p.odds) ? 'better' : 'worse') + ' than the ' + odd(p.odds) + ' taken.';
      }
    }
    var d = clvDir(p);
    var decision;
    if (d == null) decision = 'No usable closing price, so the decision cannot be judged apart from the result.';
    else if (d > 0) decision = p.result === 'won' ? 'Price beat the close and the pick won.' : p.result === 'lost' ? 'Price beat the close and the pick lost: a sound number with a losing result.' : 'Price beat the close; the pick pushed.';
    else if (d < 0) decision = p.result === 'won' ? 'The pick won at a price worse than the close.' : p.result === 'lost' ? 'The pick lost at a price worse than the close.' : 'Price was worse than the close; the pick pushed.';
    else decision = 'The price did not move, so the close neither supports nor questions the decision.';
    return {
      agreement: leaning.length ? (leaning.every(function (x) { return x.pointed === leaning[0].pointed; }) ? 'aligned' : 'mixed') : 'none',
      conflicts: conflicts, uncertainty: uncertainty, unavailable: unavailable, price: price, decision: decision,
      rationale: 'TMR has no written rationale for this pick, so the review lists what was available at the time rather than what was used.',
    };
  }

  /* What the close says about the price, in numbers. */
  function marketReference(p) {
    if (!closeComparable(p)) return 'The close on file is for a different line or side than the one taken, so it is not compared.';
    if ((p.market === 'total' || p.market === 'team_total' || p.market === 'spread') && p.line != null && p.closeLine != null && Number(p.line) !== Number(p.closeLine)) {
      var gap = Math.abs(p.closeLine - p.line);
      return (p.market === 'total' ? 'The total' : p.market === 'team_total' ? 'The team total' : 'The line') + ' closed at ' + p.closeLine + ' against the ' + p.line + ' taken, ' +
        gap + (p.sport === 'MLB' && p.market !== 'spread' ? (gap === 1 ? ' run' : ' runs') : p.sport === 'NHL' ? (gap === 1 ? ' goal' : ' goals') : (gap === 1 ? ' point' : ' points')) + ' apart.';
    }
    if (p.closeOdds != null && p.closeOdds !== p.odds) {
      return 'The price closed at ' + odd(p.closeOdds) + ' against the ' + odd(p.odds) + ' taken: ' +
        (implied(p.closeOdds) * 100).toFixed(1) + '% implied at the close, ' + (implied(p.odds) * 100).toFixed(1) + '% at the price paid.';
    }
    return null;
  }

  /* How the recorded pre-game inputs leaned, relative to the side taken.
     Counted, never weighted: the report does not pretend to know how much
     each factor was worth. */
  function inputsSummary(p) {
    var f = p.context && p.context.factors;
    if (!f || !f.length) return null;
    var overUnder = p.market === 'total' || p.market === 'team_total' || p.market === 'prop';
    var taken = overUnder ? p.side : 'for';
    if (!taken) return null;
    /* Only inputs known when the pick was published count; a close or a
       first-pitch reading came later and is shown separately. */
    var pre = f.filter(function (x) { return x.known !== 'before_game' && x.known !== 'game_time'; });
    var later = f.length - pre.length;
    var leaning = pre.filter(function (x) { return x.pointed && x.pointed !== 'neutral'; });
    var withPick = leaning.filter(function (x) { return x.pointed === taken; }).length;
    var against = leaning.length - withPick;
    var name = function (d) { return d === 'over' ? 'the Over' : d === 'under' ? 'the Under' : d === 'for' ? 'the side taken' : 'the other side'; };
    var otherDir = overUnder ? (taken === 'over' ? 'under' : 'over') : 'against';
    var unverified = pre.filter(function (x) { return x.known === 'unverified'; }).length;
    return {
      total: pre.length, leaning: leaning.length, with_pick: withPick, against_pick: against, later: later, unverified: unverified,
      text: (leaning.length
        ? 'Point-in-time context: of the ' + pre.length + ' inputs available when the pick was made, ' + withPick + ' leaned toward ' + name(taken) +
          (overUnder ? ' (the side taken)' : '') + ', ' + against + ' toward ' + name(otherDir) + ' and ' + (pre.length - leaning.length) + ' neither way.'
        : 'Point-in-time context: none of the ' + pre.length + ' inputs available when the pick was made leaned clearly either way.') +
        (unverified ? ' ' + unverified + ' of them (such as confirmed starters or injury absences) ' + (unverified === 1 ? 'has' : 'have') + ' no recorded publication time and may have become known after the pick.' : '') +
        (later ? ' ' + later + ' more (the close, conditions at the start, anything published after the pick) ' + (later === 1 ? 'came after the pick and is' : 'came after the pick and are') + ' shown for completeness.' : '') +
        ' These are possible factors, not the reason for the result, and TMR has no record of which ones were considered.',
    };
  }

  function progressFor(list, planStartedAt) {
    if (!planStartedAt) return null;
    var before = list.filter(function (p) { return p.date < planStartedAt; });
    var after = list.filter(function (p) { return p.date >= planStartedAt; });
    var b = stats(before), a = stats(after);
    var status;
    if (a.n < MIN_SAMPLE) status = { key: 'too_early', label: 'Too early to tell (' + a.n + ' of ' + MIN_SAMPLE + ' picks since the plan began)' };
    else if (a.roi - b.roi >= 0.05 && (a.beat_close_pct == null || b.beat_close_pct == null || a.beat_close_pct >= b.beat_close_pct)) {
      status = a.n < 100 ? { key: 'early_improving', label: 'Early signs of improvement (' + a.n + ' picks; results this short can still be variance)' }
        : { key: 'improving', label: 'Improving' };
    }
    else if (b.roi - a.roi >= 0.05) status = { key: 'worse', label: 'Worse than before the plan' };
    else status = { key: 'flat', label: 'No clear change yet' };
    return { plan_started_at: planStartedAt, before: b, after: a, status: status };
  }

  /* ------------------------------------------------------------------
     Diagnostics (pi-2.1.0): what a public profile cannot show. A profile
     says WHAT happened (record, units, ROI, splits). These say how much of it
     luck explains at the prices actually paid, where the units were lost,
     how stake size and concentration shaped the result, how deep the swings
     ran, and whether the result holds up over time and without its biggest
     wins. Every figure comes from the graded picks alone; nothing here
     explains WHY a pick won or lost.                                     */

  /* Units a bettor with NO edge would win or lose at these exact prices and
     stakes: mean 0, and this standard deviation. Each pick wins with the
     break-even probability q of its price; the swing is risk * (payout + 1). */
  function noEdgeSd(list) {
    var v = 0;
    list.forEach(function (k) {
      if (k.result !== 'won' && k.result !== 'lost') return;
      var q = implied(k.odds); if (q == null) return;
      var r = Number(k.risk) || 0, b = payout(k.odds);
      v += q * (1 - q) * Math.pow(r * (b + 1), 2);
    });
    return Math.sqrt(v);
  }

  function luckBand(list, o) {
    var priced = list.filter(function (k) { return (k.result === 'won' || k.result === 'lost') && implied(k.odds) != null; }).length;
    var decided = list.filter(function (k) { return k.result === 'won' || k.result === 'lost'; }).length;
    if (!priced) return { sd: null, band_90: null, z: null, position: 'unknown', priced: 0,
      text: 'No prices were recorded with these picks, so the result cannot be compared with what luck alone produces.' };
    var sd = noEdgeSd(list);
    var net = list.reduce(function (a, k) { return a + ((k.result === 'won' || k.result === 'lost') && implied(k.odds) != null ? Number(k.net) || 0 : 0); }, 0);
    var z = sd > 0 ? net / sd : 0;
    var band = round(1.645 * sd, 1);
    var read = Math.abs(z) < 1.645 ? 'inside' : z > 0 ? 'above' : 'below';
    var missing = decided - priced;
    return { sd: round(sd, 2), band_90: band, z: round(z, 2), position: read, priced: priced, missing_prices: missing,
      net: round(net, 2),
      text: 'A bettor with no edge, betting these ' + priced + ' decided picks at the same prices and stakes, finishes within ' + MINUS_PLUS + band.toFixed(1) +
        ' units 90% of the time. These picks are ' + u(net) + ', ' +
        (read === 'inside' ? 'inside that range, so luck alone could explain it.' : read === 'above' ? 'above that range: more than luck alone usually produces.' : 'below that range: worse than luck alone usually produces.') +
        (missing ? ' ' + missing + ' decided picks had no recorded price and are left out of the range.' : '') };
  }
  var MINUS_PLUS = '\u00b1';

  /* The real side of a bet for combination cells: favorite or underdog on
     sides, over or under on totals. */
  function sideKind(p) {
    if (p.side) return p.side === 'over' ? 'overs' : 'unders';
    var o = Number(p.odds);
    if (p.market === 'moneyline') return o < 0 ? 'favorites' : o > 0 ? 'underdogs' : null;
    if (p.market === 'spread' && p.line != null && Number(p.line) !== 0) return Number(p.line) < 0 ? 'favorites' : 'underdogs';
    return null;
  }
  function comboKey(p) { var k = sideKind(p); return k ? catKey(p) + ', ' + k : null; }

  /* Where the units went: every sport, bet type and side combination, the
     losing ones ranked by units lost. Judged cells (30+ picks) get a
     Holm-adjusted verdict over every judged cell; smaller ones are shown as
     unproven. Share = this cell's loss as a part of all losses across
     losing cells. */
  function leaks(graded) {
    var cells = slices(graded, comboKey);
    var judged = cells.filter(function (c) { return c.n >= MIN_SAMPLE; });
    holm(judged);
    judged.forEach(function (c) { c.verdict = verdict({ n: c.n, roi: c.roi, pValue: c.p_value, pAdjusted: c.p_adjusted }); });
    var losing = cells.filter(function (c) { return c.net < 0 && c.n >= 10; }).sort(function (a, b) { return a.net - b.net; });
    var totalLoss = losing.reduce(function (a, c) { return a + c.net; }, 0);
    losing.forEach(function (c) { c.share_of_losses = totalLoss ? round(c.net / totalLoss, 3) : 0; });
    var winning = cells.filter(function (c) { return c.net > 0 && c.n >= 10; }).sort(function (a, b) { return b.net - a.net; });
    return { tested: judged.length, cells: cells.length, losing: losing.slice(0, 6), winning: winning.slice(0, 4),
      note: 'Cells with fewer than ' + MIN_SAMPLE + ' picks are shown but not judged. A losing cell is a place to review, not proof of a leak, unless its verdict says the shortfall is meaningful after adjusting for the ' + judged.length + ' cells tested.' };
  }

  /* Stake size. Flat ROI treats every pick as one unit; the gap between it
     and the actual ROI is what sizing did to the result. Buckets by stake. */
  function sizing(graded, o) {
    var n = 0, flat = 0, stakes = [];
    graded.forEach(function (k) { var r = Number(k.risk) || 0; if (r > 0) { n++; flat += (Number(k.net) || 0) / r; stakes.push(r); } });
    var flatRoi = n ? flat / n : 0;
    stakes.sort(function (a, b) { return a - b; });
    var mean = stakes.reduce(function (a, b) { return a + b; }, 0) / (stakes.length || 1);
    var sd = Math.sqrt(stakes.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (stakes.length || 1));
    var cv = mean ? sd / mean : 0;
    var buckets = null, cmp = null;
    if (cv >= 0.15 && stakes.length >= 2 * MIN_SAMPLE) {
      var cut = stakes[Math.floor(stakes.length / 2)];
      var small = graded.filter(function (k) { return (Number(k.risk) || 0) < cut; });
      var large = graded.filter(function (k) { return (Number(k.risk) || 0) >= cut; });
      if (small.length >= MIN_SAMPLE && large.length >= MIN_SAMPLE) {
        var label = cut.toFixed(cut % 1 ? 1 : 0);
        buckets = [Object.assign(stats(small), { key: 'Under ' + label + 'u' }), Object.assign(stats(large), { key: label + 'u and up' })];
        cmp = compare('Smaller stakes', small, 'Larger stakes', large);
      }
    }
    var effect = o.roi - flatRoi;
    var text;
    if (cv < 0.15) text = 'Stakes are close to flat (they vary ' + (cv * 100).toFixed(0) + '% around the average of ' + mean.toFixed(2) + 'u), so sizing did not shape the result.';
    else {
      text = 'Flat-stake ROI is ' + pct(flatRoi) + ' against ' + pct(o.roi) + ' actual, so stake sizing ' + (effect >= 0 ? 'added ' : 'cost ') + Math.abs(effect * 100).toFixed(1) + ' ROI points.';
      if (cmp) text += cmp.p_value < 0.05
        ? ' ' + cmp.worse + ' did worse (' + pct(cmp.worse_stats.roi) + ' over ' + cmp.worse_stats.n + ' picks against ' + pct(cmp.better_stats.roi) + '), a gap unlikely to be chance (p = ' + cmp.p_value.toFixed(2) + ').'
        : ' The gap between smaller and larger stakes (' + pct(buckets[0].roi) + ' and ' + pct(buckets[1].roi) + ') is within what chance produces (p = ' + cmp.p_value.toFixed(2) + ').';
    }
    return { flat_roi: round(flatRoi, 4), actual_roi: o.roi, sizing_effect: round(effect, 4), avg_stake: round(mean, 2), stake_cv: round(cv, 2),
      buckets: buckets, comparison: cmp ? { worse: cmp.worse, better: cmp.better, p_value: cmp.p_value } : null, text: text };
  }

  /* Swings: deepest peak-to-trough fall of the running total (in pick
     order), longest losing run, worst month, and the drawdown measured in
     average stakes so it reads the same at any unit size. */
  function risk(graded, monthly, avgStake) {
    var run = 0, peak = 0, dd = 0, ddFrom = null, ddTo = null, peakDate = graded.length ? graded[0].date : null;
    var streak = 0, worstStreak = 0;
    graded.forEach(function (k) {
      run += Number(k.net) || 0;
      if (run > peak) { peak = run; peakDate = k.date; }
      if (peak - run > dd) { dd = peak - run; ddFrom = peakDate; ddTo = k.date; }
      if (k.result === 'lost') { streak++; if (streak > worstStreak) worstStreak = streak; } else if (k.result === 'won') streak = 0;
    });
    var worst = monthly.slice().sort(function (a, b) { return a.net - b.net; })[0] || null;
    var mNets = monthly.map(function (m) { return m.net; });
    var mMean = mNets.reduce(function (a, b) { return a + b; }, 0) / (mNets.length || 1);
    var mSd = Math.sqrt(mNets.reduce(function (a, b) { return a + (b - mMean) * (b - mMean); }, 0) / (mNets.length > 1 ? mNets.length - 1 : 1));
    var inStakes = avgStake ? dd / avgStake : 0;
    return { max_drawdown: round(dd, 2), drawdown_from: ddFrom, drawdown_to: ddTo, drawdown_stakes: round(inStakes, 1),
      longest_losing_run: worstStreak, worst_month: worst ? { month: worst.key, net: worst.net, n: worst.n } : null,
      monthly_sd: round(mSd, 2), losing_months: mNets.filter(function (x) { return x < 0; }).length, months: mNets.length,
      text: 'The deepest fall from a high point was ' + dd.toFixed(1) + ' units (about ' + inStakes.toFixed(0) + ' average stakes)' +
        (ddFrom ? ', from ' + ddFrom + ' to ' + ddTo : '') + '. The longest losing run was ' + worstStreak + ' picks, and ' +
        mNets.filter(function (x) { return x < 0; }).length + ' of ' + mNets.length + ' months finished down.' };
  }

  /* Concentration: how much of the risk and of the result sits in one place,
     and what the record looks like without it. */
  function concentration(graded, categories, o) {
    if (!categories.length || !o.risked) return null;
    var byRisk = categories.slice().sort(function (a, b) { return b.risked - a.risked; });
    var top = byRisk[0];
    var hhi = categories.reduce(function (a, c) { var sh = c.risked / o.risked; return a + sh * sh; }, 0);
    var best = categories.slice().sort(function (a, b) { return b.net - a.net; })[0];
    var without = stats(graded.filter(function (p) { return catKey(p) !== best.key; }));
    return { top_category: top.key, top_share_of_risk: round(top.risked / o.risked, 3), effective_categories: round(hhi ? 1 / hhi : 0, 1),
      best_category: best.key, best_net: best.net, roi_without_best: without.roi, n_without_best: without.n,
      text: top.key + ' carries ' + (top.risked / o.risked * 100).toFixed(0) + '% of all units risked; the record behaves like ' + (hhi ? 1 / hhi : 0).toFixed(1) +
        ' equally sized categories. Without ' + best.key + ' (' + u(best.net) + '), the rest of the record is ' + pct(without.roi) + ' over ' + without.n + ' picks.' };
  }

  /* Does the result hold up? Chronological halves, and the record without
     its five biggest single wins. */
  function robustness(graded, o) {
    if (graded.length < 2 * MIN_SAMPLE) return { enough: false, text: 'Fewer than ' + (2 * MIN_SAMPLE) + ' graded picks: too few to split the record in time.' };
    var mid = Math.floor(graded.length / 2);
    var a = stats(graded.slice(0, mid)), b = stats(graded.slice(mid));
    var top5 = graded.slice().sort(function (x, y) { return (Number(y.net) || 0) - (Number(x.net) || 0); }).slice(0, 5);
    var ids = top5.map(function (x) { return x; });
    var rest = stats(graded.filter(function (x) { return ids.indexOf(x) < 0; }));
    var same = (a.roi >= 0) === (b.roi >= 0);
    var fragile = o.roi > 0 && rest.roi <= 0;
    return { enough: true, first_half: a, second_half: b, consistent_sign: same, without_top5: rest, top5_net: round(top5.reduce(function (s2, x) { return s2 + (Number(x.net) || 0); }, 0), 2), fragile: fragile,
      text: 'First half of the record (' + a.n + ' picks to ' + graded[mid - 1].date + '): ' + pct(a.roi) + '. Second half: ' + pct(b.roi) + '. ' +
        (same ? 'Both halves point the same way.' : 'The two halves point in opposite directions, so the overall figure is not yet stable.') +
        ' Without the five biggest wins the record is ' + pct(rest.roi) + (fragile ? ', so the profit rests on a handful of results.' : '.') };
  }

  function diagnostics(graded, o, categories, monthly) {
    if (!graded.length) return null;
    var sz = sizing(graded, o);
    return {
      luck: luckBand(graded, o),
      leaks: leaks(graded),
      sizing: sz,
      risk: risk(graded, monthly, sz.avg_stake),
      concentration: concentration(graded, categories, o),
      robustness: robustness(graded, o),
    };
  }

  /* Executive summary: five short lines a member can act on, each tied to a
     figure further down the report. */
  function summary(o, diag, priority, strengths) {
    if (!diag) return [];
    var out = [];
    out.push({ k: 'Result against luck', v: diag.luck.position === 'unknown' ? 'No prices' : diag.luck.position === 'inside' ? 'Within luck' : diag.luck.position === 'above' ? 'Above luck' : 'Below luck',
      tone: diag.luck.position === 'above' ? 'pos' : diag.luck.position === 'below' ? 'neg' : 'neutral', text: diag.luck.text });
    var keep = strengths.filter(function (s) { return s.n >= MIN_SAMPLE; })[0];
    if (keep) out.push({ k: 'Strongest area', v: keep.key, tone: 'pos', text: keep.key + ': ' + pct(keep.roi) + ' over ' + keep.n + ' picks. ' + keep.verdict.label + '.' });
    var leak = diag.leaks.losing[0];
    if (leak) out.push({ k: 'Largest loss driver', v: leak.key, tone: 'neg', text: leak.key + ': ' + u(leak.net) + ' over ' + leak.n + ' picks, ' + (leak.share_of_losses * 100).toFixed(0) + '% of all losses in losing areas. ' + (leak.verdict ? leak.verdict.label : 'Too few picks to judge') + '.' });
    out.push({ k: 'Deepest swing', v: diag.risk.max_drawdown.toFixed(1) + 'u', tone: 'neutral', text: diag.risk.text });
    if (diag.robustness.enough) out.push({ k: 'Holds up over time', v: diag.robustness.consistent_sign && !diag.robustness.fragile ? 'Yes' : 'Not yet', tone: diag.robustness.consistent_sign && !diag.robustness.fragile ? 'pos' : 'neutral', text: diag.robustness.text });
    if (priority) out.push({ k: 'First action', v: 'Review ' + priority.key, tone: 'neutral', text: 'See the action plan: a checklist for ' + priority.key + ', measured over the next ' + MIN_SAMPLE + ' picks.' });
    return out;
  }

  /* The whole report. */
  function analyze(picks, opts) {
    opts = opts || {};
    var graded = (picks || []).filter(function (p) { return p && (p.result === 'won' || p.result === 'lost' || p.result === 'push'); })
      .slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var overall = stats(graded);
    var categories = slices(graded, catKey).sort(function (a, b) { return b.net - a.net; });
    /* Every category big enough to judge is a separate test; the meaningful
       label uses the Holm-adjusted p across all of them. */
    function adjustFamily(list) {
      var judged = list.filter(function (c) { return c.n >= MIN_SAMPLE; });
      var m = holm(judged);
      judged.forEach(function (c) { c.verdict = verdict({ n: c.n, roi: c.roi, pValue: c.p_value, pAdjusted: c.p_adjusted }); });
      return m;
    }
    var comparisons = adjustFamily(categories);
    var bySport = slices(graded, function (p) { return p.sport; }).sort(function (a, b) { return b.net - a.net; });
    var byMarket = slices(graded, function (p) { return MARKET_LABEL[p.market] || p.market; }).sort(function (a, b) { return b.net - a.net; });
    var byOdds = slices(graded, function (p) { return oddsBand(p.odds); })
      .sort(function (a, b) { return BAND_ORDER.indexOf(a.key) - BAND_ORDER.indexOf(b.key); });
    /* The sport, bet type and price tables are each their own family of tests. */
    adjustFamily(bySport); adjustFamily(byMarket); adjustFamily(byOdds);

    /* Monthly series with a running total, for the trend chart. */
    var running = 0;
    var monthly = slices(graded, function (p) { return p.date.slice(0, 7); }).map(function (m) {
      running += m.net; m.cumulative = round(running, 2); return m;
    });

    var lastDate = graded.length ? graded[graded.length - 1].date : null;
    var cut = lastDate ? new Date(Date.parse(lastDate + 'T00:00:00Z') - 90 * 86400000).toISOString().slice(0, 10) : null;
    var recent = stats(graded.filter(function (p) { return cut && p.date > cut; }));
    var earlier = stats(graded.filter(function (p) { return cut && p.date <= cut; }));

    /* Strengths and weaknesses: categories with 10+ picks only, judged ones
       (30+) first, so a 5-pick +88% never tops the list. */
    var judgedFirst = function (a, b) { return (a.n >= MIN_SAMPLE ? 0 : 1) - (b.n >= MIN_SAMPLE ? 0 : 1); };
    var strengths = categories.filter(function (c) { return c.roi > 0 && c.n >= 10; })
      .sort(function (a, b) { return judgedFirst(a, b) || b.z - a.z; });
    var weaknesses = categories.filter(function (c) { return c.roi < 0 && c.n >= 10; })
      .sort(function (a, b) { return judgedFirst(a, b) || a.net - b.net; });
    /* A priority has to be a real drag: enough picks to judge, and at least
       3 points of ROI under water. A category sitting at -0.3% is not
       "costing" anyone anything worth a plan. */
    var priority = weaknesses.filter(function (c) { return c.n >= MIN_SAMPLE && c.roi <= -0.03; })[0] || null;

    /* One review from the strongest category too: what a winning process
       looked like before the game is as useful as what a losing one did. */
    var topStrength = strengths.filter(function (c) { return c.n >= MIN_SAMPLE; })[0] || null;
    var strengthReview = null;
    if (topStrength) {
      var slist = graded.filter(function (p) { return catKey(p) === topStrength.key; });
      var withCtx = slist.filter(function (p) { return p.context; });
      var chosen = withCtx.length ? withCtx[withCtx.length - 1] : slist[slist.length - 1];
      if (chosen) strengthReview = { category: topStrength.key, review: reviewPick(chosen) };
    }

    var ins = insights(graded);
    var diag = diagnostics(graded, overall, categories, monthly);

    var focus = null;
    if (priority) {
      var plist = graded.filter(function (p) { return catKey(p) === priority.key; });
      var sample = plist[0];
      var reviews = [];
      var losses = plist.filter(function (p) { return p.result === 'lost'; });
      var featured = plist.filter(function (p) { return p.context; });
      featured.forEach(function (p) { reviews.push(reviewPick(p)); });
      for (var i = losses.length - 1; i >= 0 && reviews.length < 3; i--) {
        if (!losses[i].context) reviews.push(reviewPick(losses[i]));
      }
      var luckyWin = plist.filter(function (p) { var c = clv(p); return p.result === 'won' && c != null && c < 0 && !p.context; }).pop();
      if (luckyWin) reviews.push(reviewPick(luckyWin));
      focus = {
        category: priority,
        sport: sample.sport, market: sample.market,
        patterns: patterns(plist),
        reviews: reviews,
        checklist: checklistFor(sample.sport, sample.market),
        progress: progressFor(plist, opts.planStartedAt || null),
      };
    }

    return {
      engine: VERSION,
      generated_from: { graded: graded.length, first: graded.length ? graded[0].date : null, last: lastDate },
      overall: overall,
      categories: categories, by_sport: bySport, by_market: byMarket, by_odds: byOdds, monthly: monthly,
      trend: { last_90_days: recent, before: earlier },
      strengths: strengths, weaknesses: weaknesses,
      focus: focus,
      strength_review: strengthReview,
      insights: ins,
      diagnostics: diag,
      summary: summary(overall, diag, priority, strengths),
      comparisons: { categories: comparisons },
      evaluation: evaluation(overall, strengths, weaknesses, priority, focus, recent, earlier, ins),
      plan: plan(priority, focus, strengths, ins, diag),
      method: {
        min_sample: MIN_SAMPLE,
        significance: 'Two-sided z-test of wins against the break-even win rate implied by the prices actually paid. p < 0.05 meaningful, p < 0.20 possible, otherwise normal variance.',
        clv: 'Spreads and totals: points gained on the closing line. Moneylines and props: implied probability gained at the closing price.',
        patterns: 'Each weak category is split several ways (side, price, line movement, day). With several splits, one can look strong by chance, so a pattern is a question to research, never a rule.',
        not_claimed: 'The report never states why a pick lost. It separates information available before the game from the result.',
      luck: 'The luck range is the 90% range of units a bettor with no edge would finish with at the same prices and stakes (each pick wins at the break-even rate of its price).',
      leaks: 'Every sport, bet type and side combination (favorites or underdogs, overs or unders) with 10+ picks; verdicts only at 30+, Holm-adjusted over every judged cell.',
      sizing: 'Flat ROI counts every pick as one unit. Stakes are split at the median stake when they vary by 15% or more; the two halves are compared with a Welch test.',
      robustness: 'The record is split into its first and second half in time, and recomputed without its five biggest wins.',
      },
    };
  }

  function evaluation(o, strengths, weaknesses, priority, focus, recent, earlier, ins) {
    var out = [];
    out.push('Across ' + o.n + ' graded picks the record is ' + o.w + '-' + o.l + (o.p ? '-' + o.p : '') + ', ' + u(o.net) + ' on ' +
      o.risked.toFixed(1) + ' units risked (' + pct(o.roi) + ' ROI). Winning ' + (o.win_pct * 100).toFixed(1) +
      '% of decided picks against a break-even rate of ' + (o.break_even_pct * 100).toFixed(1) + '% at the prices taken.');
    var real = strengths.filter(function (s) { return s.verdict.key === 'strength'; });
    var lean = strengths.filter(function (s) { return s.verdict.key === 'lean_strength'; });
    if (real.length) out.push(real[0].key + ' is the strongest part of the record: ' + u(real[0].net) + ' at ' + pct(real[0].roi) +
      ' over ' + real[0].n + ' picks, a result unlikely to be luck alone (p = ' + real[0].p_value.toFixed(2) + ').');
    if (lean.length) out.push(lean.map(function (s) { return s.key + ' (' + pct(s.roi) + ', ' + s.n + ' picks)'; }).join(' and ') +
      (lean.length > 1 ? ' look' : ' looks') + ' promising but the sample cannot yet separate skill from variance.');
    if (priority) {
      var t = priority.key + ' returned ' + pct(priority.roi) + ' over ' + priority.n + ' picks (' + u(priority.net) + '), a potential area to review. ';
      t += priority.verdict.key === 'weakness' ? 'That shortfall is statistically meaningful.'
        : priority.verdict.key === 'lean_weakness' ? 'The result alone is not conclusive (p = ' + priority.p_value.toFixed(2) + '), so the closing line is the better evidence.'
          : 'The result alone is within normal variance, so the closing line is the better evidence.';
      if (priority.beat_close_pct != null && priority.clv_moved >= 20) {
        var cp = priority.clv_p_value;
        t += ' Where the number moved before the game, these picks beat the close ' + (priority.beat_close_pct * 100).toFixed(0) + '% of the time (' +
          priority.clv_moved + ' picks)' +
          (cp != null && cp < 0.05
            ? (priority.beat_close_pct < 0.5 ? ', consistently worse than the close (p = ' + cp.toFixed(2) + '), which suggests reviewing how prices are taken in this category.'
              : ', consistently better than the close (p = ' + cp.toFixed(2) + '), so the process looks sounder than the results and part of the shortfall is likely variance.')
            : ', which is within what chance produces over that many picks (p = ' + (cp == null ? 'n/a' : cp.toFixed(2)) + '), so the close neither clears nor condemns the process.');
      }
      out.push(t);
    }
    if (focus && focus.patterns.length) {
      var pt = focus.patterns[0];
      out.push('Inside ' + priority.key + ', one split held up after accounting for the ' + focus.patterns.tested + ' comparisons made: ' + pt.worse.key + ' ' + pct(pt.worse.roi) +
        ' (' + pt.worse.n + ' picks) against ' + pt.better.key + ' ' + pct(pt.better.roi) + ' (' + pt.better.n + ').');
    } else if (focus) {
      out.push('Inside ' + priority.key + ', no split by side, price or home and away stood out once the number of comparisons is accounted for, so the review is about the category as a whole.');
    }
    if (ins && ins.findings.length) out.push('Pattern worth investigating: ' + ins.findings[0].text);
    else if (ins && ins.tested) out.push('Comparing bet types within each sport, and favorites with underdogs (' + ins.tested + ' comparisons), no gap was large enough to rule out chance.');
    if (recent.n >= MIN_SAMPLE && earlier.n >= MIN_SAMPLE) {
      out.push('Last 90 days: ' + u(recent.net) + ' at ' + pct(recent.roi) + ' over ' + recent.n + ' picks, against ' + pct(earlier.roi) + ' before that.');
    }
    var other = weaknesses.filter(function (w) { return w !== priority && w.verdict.key === 'variance'; });
    if (other.length) out.push(other.map(function (w) { return w.key; }).join(', ') + ' ' + (other.length > 1 ? 'are' : 'is') +
      ' negative but within normal variance. No change is needed on results alone.');
    return out;
  }

  function plan(priority, focus, strengths, ins, diag) {
    var steps = [];
    if (priority && focus) {
      var strong = strengths.filter(function (x) { return x.n >= MIN_SAMPLE; })[0];
      steps.push({
        title: 'Review your ' + priority.key + ' process',
        detail: priority.key + ' returned ' + pct(priority.roi) + ' over ' + priority.n + ' graded picks (' + u(priority.net) + '), a potential area to review' +
          (priority.verdict.key === 'weakness' ? '.' : ', though the result alone is not conclusive.') +
          ' Consider examining how you evaluate the items below and the price you take, and compare that process with ' +
          (strong ? 'your ' + strong.key + ' (' + pct(strong.roi) + ' over ' + strong.n + ' picks).' : 'the categories where your record is stronger.') +
          ' Write your own number down before you look at the market.',
        checklist: focus.checklist,
      });
      if (focus.patterns.length) {
        var pt = focus.patterns[0];
        steps.push({ title: 'Look at the ' + pt.dimension.toLowerCase() + ' split', detail: pt.worse.key + ' returned ' + pct(pt.worse.roi) +
          ' over ' + pt.worse.n + ' picks, and the gap held up after adjusting for multiple comparisons. Ask what is different about those spots. It is a question to research, not a rule.' });
      }
      steps.push({ title: 'Measure the next ' + MIN_SAMPLE + ' ' + priority.key + ' picks',
        detail: 'Start the plan and the report tracks every later pick in this category against the record before it: ROI, win rate against the break-even of your prices, and how often your price beats the close, which moves sooner than results.' });
      steps.push({ title: 'Consider stake size while you review', detail: 'Consider a smaller stake in this market until ' + MIN_SAMPLE +
        ' new picks show whether the change is working. This limits the cost of learning; it does not create an edge.' });
    }
    if (ins && ins.findings.length) {
      var top = ins.findings[0];
      if (!priority || (top.worse.indexOf(priority.key) < 0)) {
        steps.push({ title: 'Compare ' + top.worse + ' with ' + top.better, detail: top.text + ' ' + top.suggestion });
      }
    }
    /* Sizing: only when stakes vary and larger stakes did meaningfully worse. */
    if (diag && diag.sizing.comparison && diag.sizing.comparison.p_value < 0.05 && diag.sizing.comparison.worse === 'Larger stakes') {
      steps.push({ title: 'Check how you size up', detail: diag.sizing.text + ' Consider writing down why a pick deserves a bigger stake before placing it, and compare the next ' + MIN_SAMPLE + ' larger stakes with this record.' });
    }
    /* Fragile profit: say it plainly so a hot streak is not mistaken for an edge. */
    if (diag && diag.robustness.enough && diag.robustness.fragile) {
      steps.push({ title: 'Treat the profit as unproven', detail: diag.robustness.text + ' Consider keeping stakes steady until the record is positive without its biggest wins.' });
    }
    /* The strength worth protecting: meaningful on results, or close to it
       AND beating the closing line, which is independent evidence. */
    var keep = strengths.filter(function (s) {
      return s.verdict.key === 'strength' || (s.verdict.key === 'lean_strength' && s.beat_close_pct != null && s.beat_close_pct >= 0.55 && s.clv_moved >= 20 && s.clv_p_value < 0.05);
    })[0];
    if (keep) steps.push({ title: 'Keep doing what works in ' + keep.key, detail: 'Write down the process behind these picks so it can be repeated on purpose. ' +
      keep.n + ' picks at ' + pct(keep.roi) + (keep.beat_close_pct != null ? ', beating the close ' + (keep.beat_close_pct * 100).toFixed(0) + '% of the time,' : '') +
      ' is the most reliable part of the record.' });
    return steps;
  }

  return { VERSION: VERSION, MIN_SAMPLE: MIN_SAMPLE, analyze: analyze, stats: stats, insights: insights, diagnostics: diagnostics, reviewPick: reviewPick,
    implied: implied, payout: payout, clv: clv, clvDir: clvDir, closeComparable: closeComparable, oddsBand: oddsBand, checklistFor: checklistFor };
}));
