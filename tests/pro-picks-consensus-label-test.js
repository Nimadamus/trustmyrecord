/* WD_CONSENSUS_20261121 + GRADED_25_LABEL_20261121 (no browser):
   - every inline script on /pro/picks/, /pro/board/ and /premium/ still parses
   - no member-facing "Proven" label is left (it only ever meant 25+ graded picks)
   - /pro/picks/ has a Consensus tab wired to /api/pro/watchdog/consensus
   - drawConsensus renders sides, counts and records from an API-shaped payload, escapes
     text, hides started games, and honours the league filter and the 25+ box.
   node tests/pro-picks-consensus-label-test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function inlineScripts(html) {
  const out = []; const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))) { if (!/type=["'](application\/ld\+json|application\/json|text\/template)/i.test(m[1])) out.push(m[2]); }
  return out;
}
for (const p of ['pro/picks/index.html', 'pro/board/index.html', 'premium/index.html']) {
  const html = read(p);
  inlineScripts(html).forEach((s, i) => { assert.doesNotThrow(() => new vm.Script(s), p + ' inline script ' + i + ' parses'); });
  const visible = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/>\s*Proven\b|\bProven \(25|' proven'|the proven group|How the proven handicappers/.test(visible), p + ': no member-facing "Proven" label');
}
const picks = read('pro/picks/index.html');
assert.ok(picks.includes('data-view="consensus"'), 'Consensus tab');
assert.ok(picks.includes("API + '/pro/watchdog/consensus'"), 'tab reads the Pro consensus endpoint');
assert.ok(picks.includes('> 25+ graded picks</label>'), 'filter label says what it is');

/* pull named functions out of the page script and run them in a sandbox */
const script = inlineScripts(picks).find((s) => s.includes('function drawConsensus('));
function fn(name) {
  const i = script.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'function ' + name);
  let depth = 0; let j = script.indexOf('{', i);
  for (let k = j; k < script.length; k++) {
    if (script[k] === '{') depth++;
    else if (script[k] === '}' && --depth === 0) return script.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + name);
}
const names = ['esc', 'signed', 'unitsCls', 'day', 'upcoming', 'localKick', 'consensusSide', 'consensusLine', 'loadConsensus', 'drawConsensus'];
const fetched = [];
const ctx = { API: 'https://api.example/api', boardFilter: { view: 'consensus' }, consensusCache: {}, Date, Number, String, Object, Math, isNaN,
  S: { authFetch: (u) => { fetched.push(u); return { then: () => ({ then: () => ({ catch: () => {} }) }) }; } }, drawBoard: () => {} };
vm.createContext(ctx);
vm.runInContext(names.map(fn).join('\n'), ctx);

const fut = new Date(Date.now() + 864e5).toISOString();
const past = new Date(Date.now() - 3600e3).toISOString();
const side = (n, g25, rec, units, roi, up, down, lines) => ({ handicappers: n, graded_25: g25, all: { handicappers: n, record: rec, graded: rec.w + rec.l + rec.p, units, roi, above_break_even: up, at_or_below_break_even: down }, graded_25_group: {}, lines });
const payload = { record_window: { since: '2026-09-14' }, games: [
  { league: 'NFL', home: 'Chicago <Bears>', away: 'Philadelphia Eagles', matchup: 'Philadelphia Eagles @ Chicago <Bears>', start: fut, handicappers: 5,
    markets: [{ market: 'spread', period: 'game', handicappers: 5, two_sided: 1, majority_side: 'home', majority_share: 80,
      sides: { home: side(4, 3, { w: 60, l: 50, p: 2 }, 4.25, 3.8, 3, 1, [{ line: 3, handicappers: 3 }, { line: 3.5, handicappers: 1 }]), away: side(1, 0, { w: 4, l: 6, p: 0 }, -2.5, -25, 0, 1, [{ line: -3, handicappers: 1 }]) } }] },
  { league: 'NBA', home: 'A', away: 'B', matchup: 'B @ A', start: fut, handicappers: 1, markets: [{ market: 'total', period: 'game', handicappers: 1, two_sided: 0, majority_side: 'over', majority_share: 100, sides: { over: side(1, 1, { w: 30, l: 20, p: 0 }, 7, 14, 1, 0, [{ line: 220.5, handicappers: 1 }]) } }] },
  { league: 'NFL', home: 'C', away: 'D', matchup: 'D @ C', start: past, handicappers: 1, markets: [] },
] };

/* nothing cached yet: shows loading and fetches the plain endpoint */
let r = ctx.drawConsensus({ league: 'all', proven: false });
assert.ok(/Loading consensus/.test(r.html));
assert.strictEqual(fetched[0], 'https://api.example/api/pro/watchdog/consensus');
ctx.consensusCache['0'] = { at: Date.now(), data: payload };
r = ctx.drawConsensus({ league: 'all', proven: false });
assert.ok(r.count.includes('<b>2</b> games'), 'started game hidden: ' + r.count);
assert.ok(r.html.includes('Chicago &lt;Bears&gt;') && !r.html.includes('<Bears>'), 'escaped');
assert.ok(r.html.includes('<b>4</b> on this side, 3 with 25+ graded'));
assert.ok(r.html.includes('60-50-2') && r.html.includes('+4.25u') && r.html.includes('+3.8% ROI') && r.html.includes('3 above break-even, 1 at or below'));
assert.ok(r.html.includes('+3 (3), +3.5'), 'spread lines signed, counts shown');
assert.ok(r.html.includes('1 on both sides, not counted'));
assert.ok(r.html.includes('Over') && r.html.includes('220.5'));
r = ctx.drawConsensus({ league: 'NBA', proven: false });
assert.ok(r.count.includes('<b>1</b> games') && !r.html.includes('Chicago'));
/* the 25+ box asks the server for min_graded=25 */
ctx.drawConsensus({ league: 'all', proven: true });
assert.ok(fetched.includes('https://api.example/api/pro/watchdog/consensus?min_graded=25'));
console.log('pro-picks-consensus-label-test: all checks passed');
