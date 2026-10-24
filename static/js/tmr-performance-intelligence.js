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

  var VERSION = 'pi-1.1.0';
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
  function clvInfo(p) {
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
      avg_clv: s.avgClv == null ? null : round(s.avgClv, s.clvUnit === 'pts' ? 2 : 4), clv_unit: s.clvUnit,
      verdict: s.verdict,
    };
  }

  /* The verdict ladder. Sample size first, then evidence strength. */
  function verdict(s) {
    if (s.n < MIN_SAMPLE) return { key: 'small_sample', label: 'Too few picks to judge', tone: 'neutral' };
    var up = s.roi >= 0;
    if (s.pValue < 0.05) return up
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
  function patterns(list) {
    var tests = [
      { name: 'Side', fn: function (p) { return p.side ? (p.side === 'over' ? 'Overs' : 'Unders') : null; } },
      { name: 'Price', fn: function (p) { return Number(p.odds) <= -121 ? 'Laid -121 or more' : 'Better than -121'; } },
      { name: 'Line movement', fn: function (p) { var d = clvDir(p); return !d ? null : (d > 0 ? 'Beat the closing line' : 'Closing line moved against the pick'); } },
      { name: 'Day', fn: function (p) { var d = dayOfWeek(p.date); return d === 0 || d === 6 ? 'Weekend' : 'Weekday'; } },
    ];
    var found = [];
    tests.forEach(function (t) {
      var parts = slices(list, t.fn).filter(function (s) { return s.n >= 15; });
      if (parts.length < 2) return;
      parts.sort(function (a, b) { return a.roi - b.roi; });
      var lo = parts[0], hi = parts[parts.length - 1];
      if (hi.roi - lo.roi >= 0.10) found.push({ dimension: t.name, worse: lo, better: hi, gap: round(hi.roi - lo.roi, 4) });
    });
    found.sort(function (a, b) { return b.gap - a.gap; });
    return found;
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

  function pct(x, d) { return (x >= 0 ? '+' : '') + (x * 100).toFixed(d == null ? 1 : d) + '%'; }
  function u(x) { return (x >= 0 ? '+' : '') + x.toFixed(1) + 'u'; }

  /* One pick, split into what was knowable before the game and what happened. */
  function reviewPick(p) {
    var c = clv(p), dir = clvDir(p);
    var before = [], verdicts = [];
    before.push({ label: 'Price taken', value: (p.line != null ? (p.side ? (p.side === 'over' ? 'Over ' : 'Under ') : '') + p.line + ' ' : '') + '(' + (p.odds > 0 ? '+' : '') + p.odds + ')' });
    before.push({ label: 'Break-even win rate at that price', value: (implied(p.odds) * 100).toFixed(1) + '%' });
    if (p.closeLine != null || p.closeOdds != null) {
      before.push({ label: 'Closing number', value: (p.closeLine != null ? p.closeLine + ' ' : '') + (p.closeOdds != null ? '(' + (p.closeOdds > 0 ? '+' : '') + p.closeOdds + ')' : '') });
    }
    if (dir != null) {
      if (dir === 0) verdicts.push(Math.abs(c) < 1e-9
        ? 'The pick closed at the same number and price it was placed at, so the market neither confirmed nor rejected it.'
        : 'The price barely moved before the game, so the market neither confirmed nor rejected it.');
      else if (dir > 0) verdicts.push('The market moved toward this pick after it was placed, so the price was better than the close. That is a sign of a sound number even though the result went the other way.');
      else verdicts.push('The market moved away from this pick before the game. The close suggests the price paid was worse than the information available at game time supported.');
      var ref = marketReference(p);
      if (ref) verdicts.push(ref);
    } else {
      verdicts.push('No closing number is on file for this pick, so the price cannot be checked against the market.');
    }
    if (p.result === 'won' && dir === -1) verdicts.push('It won, but the closing line moved against it. A win at a price the market rejected is not evidence of good handicapping.');
    if (p.result === 'lost' && dir === 1) verdicts.push('It lost, but it beat the close. Losses like this are the cost of variance, not a process failure.');
    return {
      id: p.id, date: p.date, sport: p.sport, market: p.market, matchup: p.matchup, selection: p.selection,
      result: p.result, net: round(Number(p.net) || 0, 2), clv: c == null ? null : round(c, 4),
      before_game: before,
      recorded_inputs: p.context || null,
      inputs_summary: inputsSummary(p),
      market_read: verdicts,
      after_game: p.final || null,
      checklist: checklistFor(p.sport, p.market),
    };
  }

  function odd(o) { return (o > 0 ? '+' : '') + o; }

  /* What the close says about the price, in numbers. */
  function marketReference(p) {
    if ((p.market === 'total' || p.market === 'team_total' || p.market === 'spread') && p.line != null && p.closeLine != null && Number(p.line) !== Number(p.closeLine)) {
      var gap = Math.abs(p.closeLine - p.line);
      return (p.market === 'total' ? 'The total' : p.market === 'team_total' ? 'The team total' : 'The line') + ' closed at ' + p.closeLine + ' against the ' + p.line + ' taken, ' +
        gap + (p.sport === 'MLB' && p.market !== 'spread' ? (gap === 1 ? ' run' : ' runs') : ' points') + ' apart.';
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
    var taken = p.market === 'total' ? p.side : 'for';
    if (!taken) return null;
    var leaning = f.filter(function (x) { return x.pointed && x.pointed !== 'neutral'; });
    var withPick = leaning.filter(function (x) { return x.pointed === taken; }).length;
    var against = leaning.length - withPick;
    var name = function (d) { return d === 'over' ? 'the Over' : d === 'under' ? 'the Under' : d === 'for' ? 'the side taken' : 'the other side'; };
    var otherDir = p.market === 'total' ? (taken === 'over' ? 'under' : 'over') : 'against';
    return {
      total: f.length, leaning: leaning.length, with_pick: withPick, against_pick: against,
      text: leaning.length
        ? 'Of the ' + f.length + ' pre-game inputs on record, ' + leaning.length + ' leaned one way: ' + withPick + ' toward ' + name(taken) +
          (p.market === 'total' ? ' (the side taken)' : '') + ' and ' + against + ' toward ' + name(otherDir) + '.'
        : 'None of the ' + f.length + ' pre-game inputs on record leaned clearly either way.',
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

  /* The whole report. */
  function analyze(picks, opts) {
    opts = opts || {};
    var graded = (picks || []).filter(function (p) { return p && (p.result === 'won' || p.result === 'lost' || p.result === 'push'); })
      .slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var overall = stats(graded);
    var categories = slices(graded, catKey).sort(function (a, b) { return b.net - a.net; });
    var bySport = slices(graded, function (p) { return p.sport; }).sort(function (a, b) { return b.net - a.net; });
    var byMarket = slices(graded, function (p) { return MARKET_LABEL[p.market] || p.market; }).sort(function (a, b) { return b.net - a.net; });
    var byOdds = slices(graded, function (p) { return oddsBand(p.odds); })
      .sort(function (a, b) { return BAND_ORDER.indexOf(a.key) - BAND_ORDER.indexOf(b.key); });

    /* Monthly series with a running total, for the trend chart. */
    var running = 0;
    var monthly = slices(graded, function (p) { return p.date.slice(0, 7); }).map(function (m) {
      running += m.net; m.cumulative = round(running, 2); return m;
    });

    var lastDate = graded.length ? graded[graded.length - 1].date : null;
    var cut = lastDate ? new Date(Date.parse(lastDate + 'T00:00:00Z') - 90 * 86400000).toISOString().slice(0, 10) : null;
    var recent = stats(graded.filter(function (p) { return cut && p.date > cut; }));
    var earlier = stats(graded.filter(function (p) { return cut && p.date <= cut; }));

    var strengths = categories.filter(function (c) { return c.roi > 0; })
      .sort(function (a, b) { return b.z - a.z; });
    var weaknesses = categories.filter(function (c) { return c.roi < 0; })
      .sort(function (a, b) { return a.net - b.net; });
    /* A priority has to be a real drag: enough picks to judge, and at least
       3 points of ROI under water. A category sitting at -0.3% is not
       "costing" anyone anything worth a plan. */
    var priority = weaknesses.filter(function (c) { return c.n >= MIN_SAMPLE && c.roi <= -0.03; })[0] || null;

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
      evaluation: evaluation(overall, strengths, weaknesses, priority, focus, recent, earlier),
      plan: plan(priority, focus, strengths),
      method: {
        min_sample: MIN_SAMPLE,
        significance: 'Two-sided z-test of wins against the break-even win rate implied by the prices actually paid. p < 0.05 meaningful, p < 0.20 possible, otherwise normal variance.',
        clv: 'Spreads and totals: points gained on the closing line. Moneylines and props: implied probability gained at the closing price.',
        patterns: 'Each weak category is split several ways (side, price, line movement, day). With several splits, one can look strong by chance, so a pattern is a question to research, never a rule.',
        not_claimed: 'The report never states why a pick lost. It separates information available before the game from the result.',
      },
    };
  }

  function evaluation(o, strengths, weaknesses, priority, focus, recent, earlier) {
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
      var t = priority.key + ' is costing the most: ' + u(priority.net) + ' at ' + pct(priority.roi) + ' over ' + priority.n + ' picks. ';
      t += priority.verdict.key === 'weakness' ? 'That shortfall is statistically meaningful.'
        : priority.verdict.key === 'lean_weakness' ? 'The result alone is not conclusive (p = ' + priority.p_value.toFixed(2) + '), so the closing line is the better evidence.'
          : 'The result alone is within normal variance, so the closing line is the better evidence.';
      if (priority.beat_close_pct != null && priority.clv_moved >= 20) {
        t += ' Where the number moved before the game, these picks beat the close ' + (priority.beat_close_pct * 100).toFixed(0) + '% of the time (' +
          priority.clv_moved + ' picks)' +
          (priority.beat_close_pct < 0.45 ? ', which points to a pricing problem rather than bad luck.' : priority.beat_close_pct >= 0.55
            ? ', so the process looks sounder than the results, and part of the shortfall is likely variance.' : ', about what an average bettor gets, so the close neither clears nor condemns the process.');
      }
      out.push(t);
    }
    if (focus && focus.patterns.length) {
      var pt = focus.patterns[0];
      out.push('Inside ' + priority.key + ', the biggest gap is by ' + pt.dimension.toLowerCase() + ': ' + pt.worse.key + ' ' + pct(pt.worse.roi) +
        ' (' + pt.worse.n + ' picks) against ' + pt.better.key + ' ' + pct(pt.better.roi) + ' (' + pt.better.n + '). Worth checking before the next bet in this market.');
    }
    if (recent.n >= MIN_SAMPLE && earlier.n >= MIN_SAMPLE) {
      out.push('Last 90 days: ' + u(recent.net) + ' at ' + pct(recent.roi) + ' over ' + recent.n + ' picks, against ' + pct(earlier.roi) + ' before that.');
    }
    var other = weaknesses.filter(function (w) { return w !== priority && w.verdict.key === 'variance'; });
    if (other.length) out.push(other.map(function (w) { return w.key; }).join(', ') + ' ' + (other.length > 1 ? 'are' : 'is') +
      ' negative but within normal variance. No change is needed on results alone.');
    return out;
  }

  function plan(priority, focus, strengths) {
    var steps = [];
    if (priority && focus) {
      steps.push({
        title: 'Rebuild the ' + priority.key + ' process',
        detail: 'Your ' + priority.key + ' have produced negative returns over ' + priority.n + ' graded selections (' + u(priority.net) + ', ' +
          pct(priority.roi) + ' ROI). Before your next ' + priority.key + ' wager, work through the checklist below and record the number you make before you see the market.',
        checklist: focus.checklist,
      });
      if (focus.patterns.length) {
        var pt = focus.patterns[0];
        steps.push({ title: 'Check the ' + pt.dimension.toLowerCase() + ' split', detail: pt.worse.key + ' returned ' + pct(pt.worse.roi) +
          ' over ' + pt.worse.n + ' picks. Ask what is different about those spots before betting the next one. Treat it as a question, not a rule: the split is a pattern in past results.' });
      }
      steps.push({ title: 'Track the closing line on every ' + priority.key.replace(/s$/, '') + ' pick',
        detail: 'Beating the close more than half the time is the earliest sign a process change is working. It shows up long before the win-loss record does.' });
      steps.push({ title: 'Size down while you rebuild', detail: 'Consider a smaller stake in this market until ' + MIN_SAMPLE +
        ' new picks show whether the change is working. This limits the cost of learning; it does not create an edge.' });
    }
    /* The strength worth protecting: meaningful on results, or close to it
       AND beating the closing line, which is independent evidence. */
    var keep = strengths.filter(function (s) {
      return s.verdict.key === 'strength' || (s.verdict.key === 'lean_strength' && s.beat_close_pct != null && s.beat_close_pct >= 0.55 && s.clv_moved >= 20);
    })[0];
    if (keep) steps.push({ title: 'Keep doing what works in ' + keep.key, detail: 'Write down the process behind these picks so it can be repeated on purpose. ' +
      keep.n + ' picks at ' + pct(keep.roi) + (keep.beat_close_pct != null ? ', beating the close ' + (keep.beat_close_pct * 100).toFixed(0) + '% of the time,' : '') +
      ' is the most reliable part of the record.' });
    return steps;
  }

  return { VERSION: VERSION, MIN_SAMPLE: MIN_SAMPLE, analyze: analyze, stats: stats, reviewPick: reviewPick,
    implied: implied, payout: payout, clv: clv, clvDir: clvDir, oddsBand: oddsBand, checklistFor: checklistFor };
}));
