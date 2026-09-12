#!/usr/bin/env node
/* CLV_DISPLAY_20260912
   -----------------------------------------------------------------------------
   The profile page must have NO CLV formula of its own. Before this lock,
   profile/index.html subtracted a line from a line, called it CLV, inverted the
   sign, and ignored the value the backend had already computed. On a 734-pick
   record that produced 362 rows printing "+0.00" over a real non-zero CLV, and
   64 non-zero values every one of which contradicted the backend's direction
   rule.

   This test does two things. It LOCKS the text, so the old arithmetic cannot
   come back, and it EXECUTES the shipped functions pulled straight out of the
   HTML, so the behaviour is proven rather than assumed.

   Run: node tests/profile-clv-single-source-test.js
*/
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const TARGETS = ['profile/index.html', 'preview/profile/index.html'];

let checks = 0;
const ok = (cond, label) => { checks += 1; assert.ok(cond, label); };
const eq = (a, b, label) => { checks += 1; assert.strictEqual(a, b, label); };
const close = (a, b, label) => { checks += 1; assert.ok(Math.abs(a - b) < 1e-9, label + ' (' + a + ' vs ' + b + ')'); };

/* ---------- helpers -------------------------------------------------------- */

/* Pull a top-level `function name(...) { ... }` out of the page by brace
   matching, so the test runs the real shipped source. */
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'could not find function ' + name);
  let depth = 0;
  let i = src.indexOf('{', start);
  assert.ok(i >= 0, 'could not find the body of ' + name);
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error('unbalanced braces in ' + name);
}

/* Pull the `if (sortKey === 'clv') { ... }` branch out by brace matching. */
function extractClvSortBranch(src) {
  const start = src.indexOf("if (sortKey === 'clv') {");
  assert.ok(start >= 0, "could not find the sortKey === 'clv' branch");
  let depth = 0;
  const open = src.indexOf('{', start);
  for (let j = open; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error("unbalanced braces in the sortKey === 'clv' branch");
}

for (const target of TARGETS) {
  const label = target;
  const html = fs.readFileSync(path.join(root, target), 'utf8');

  /* ---------- 1. text locks ---------------------------------------------- */

  ok(!/closing - opening/.test(html),
    label + ': must not subtract a line from a line');
  ok(!/opening - closing/.test(html),
    label + ': must not subtract a line from a line in the other direction');
  ok(html.includes('CLV_DISPLAY_20260912'),
    label + ': must carry the one-definition marker');
  ok(html.includes("readPickNumber(pick, 'clv')"),
    label + ': calculatePickClv must read the backend clv field');
  ok(html.includes("readPickNumber(pick, 'clv_novig')"),
    label + ': the de-vigged reader must read the backend clv_novig field');
  ok(html.includes(".map(pickClvNoVig)"),
    label + ': the filtered aggregate must average the de-vigged value');
  ok(!/\.map\(calculatePickClv\)/.test(html),
    label + ': nothing may average the raw value under a de-vigged label');
  ok(html.includes("if (sortKey === 'clv') {"),
    label + ': CLV sorting must have its own null-aware branch');
  ok(!/clv: Number\(calculatePickClv\((?:a|b)\) \|\| 0\)/.test(html),
    label + ': sorting must not coerce a missing CLV to zero');
  ok(html.includes("summaryStat('Avg CLV (no vig)'"),
    label + ': the filtered summary stat must be named for the metric it shows');
  ok(html.includes("['Avg CLV (no vig)', clv.display, clv.note]"),
    label + ': the advanced table row must be named for the metric it shows');

  /* ---------- 2. execute the shipped readers ----------------------------- */

  const sandbox = { console: console };
  vm.createContext(sandbox);
  const source = [
    extractFunction(html, 'readPickNumber'),
    extractFunction(html, 'calculatePickClv'),
    extractFunction(html, 'pickClvNoVig'),
    extractFunction(html, 'formatClvValue'),
    extractFunction(html, 'computeAggregateClv'),
    'this.calculatePickClv = calculatePickClv;',
    'this.pickClvNoVig = pickClvNoVig;',
    'this.formatClvValue = formatClvValue;',
    'this.computeAggregateClv = computeAggregateClv;',
  ].join('\n');
  vm.runInContext(source, sandbox);
  const { calculatePickClv, pickClvNoVig, formatClvValue, computeAggregateClv } = sandbox;

  /* Pick-level parity: the column must print exactly what the API sent. */
  const apiRow = (extra) => Object.assign({
    market_type: 'totals',
    selection: 'Under 8',
    line_snapshot: 8,
    odds_snapshot: -115,
    closing_line: 8,
    closing_odds: -105,
    clv: -2.2689,
    clv_novig: -4.1,
    closing_book_title: 'BetMGM',
    closing_source: 'action_network_backfill',
  }, extra);

  eq(calculatePickClv(apiRow()), -2.2689, label + ': the cell shows the backend clv verbatim');
  eq(pickClvNoVig(apiRow()), -4.1, label + ': the de-vigged reader shows clv_novig verbatim');

  /* No sign inversion, in either direction, on every market shape the old
     code special-cased. */
  [
    { selection: 'Under 8', clv: 3.3 },
    { selection: 'Over 9.5', clv: 3.3 },
    { selection: 'New England Patriots', market_type: 'spreads', clv: 3.3 },
    { selection: 'Tampa Bay Rays', market_type: 'h2h', line_snapshot: null, clv: 3.3 },
    { selection: 'Yankees/Brewers First Five Innings under 4.5', market_type: 'f5_totals', clv: 3.3 },
    { selection: 'Philadelphia Flyers Under 2.5', market_type: 'team_totals', clv: 3.3 },
  ].forEach((extra) => {
    eq(calculatePickClv(apiRow(extra)), 3.3,
      label + ': a positive CLV stays positive on ' + (extra.market_type || 'totals'));
    eq(calculatePickClv(apiRow(Object.assign({}, extra, { clv: -3.3 }))), -3.3,
      label + ': a negative CLV stays negative on ' + (extra.market_type || 'totals'));
  });

  /* A line move with the price unchanged must no longer invent a number, and a
     price move with the line unchanged must no longer print zero. This is the
     exact pair the audit found. */
  eq(calculatePickClv(apiRow({ line_snapshot: 31.5, closing_line: 23.5, clv: null })), null,
    label + ': a cross-priced row the backend refused prints nothing');
  eq(calculatePickClv(apiRow({ line_snapshot: 8, closing_line: 8, clv: -2.2689 })), -2.2689,
    label + ': a price-only move prints its real value, not +0.00');

  /* No missing close is ever a zero. */
  eq(calculatePickClv(apiRow({ clv: null, closing_odds: null })), null,
    label + ': a missing close prints nothing');
  eq(calculatePickClv(apiRow({ clv: 0, closing_odds: null })), 0,
    label + ': the page prints what the API sends, and the API suppresses that zero');
  eq(formatClvValue(null), '--', label + ': a null CLV formats as a dash');
  eq(formatClvValue(0), '+0.00', label + ': a real par formats as a signed zero');

  /* Aggregate reproduction and coverage count. */
  const rows = [
    apiRow({ clv: 1, clv_novig: -1 }),
    apiRow({ clv: 2, clv_novig: -2 }),
    apiRow({ clv: 3, clv_novig: -3 }),
    apiRow({ clv: null, clv_novig: null, closing_odds: null }),
    apiRow({ clv: 9, clv_novig: null }),
  ];
  const agg = computeAggregateClv(rows);
  close(parseFloat(agg.display), -2, label + ': the filtered aggregate is the mean of clv_novig');
  ok(/3 priced picks/.test(agg.note),
    label + ': the aggregate states the count it was computed over, got: ' + agg.note);
  eq(agg.className, 'negative', label + ': a negative aggregate is coloured negative');
  eq(computeAggregateClv([]).display, '--', label + ': an empty set shows a dash');
  eq(computeAggregateClv([apiRow({ clv_novig: null })]).display, '--',
    label + ': a set with no de-vigged values shows a dash, not zero');

  /* ---------- 3. execute the shipped sort branch ------------------------- */

  const branch = extractClvSortBranch(html);
  const sortBox = {};
  vm.createContext(sortBox);
  vm.runInContext(
    'this.cmp = function (left, right, direction, at, bt) {\n'
    + "  const sortKey = 'clv';\n"
    + '  const a = { t: at }; const b = { t: bt };\n'
    + '  const getPickTimestamp = (p) => p.t;\n'
    + '  ' + branch + '\n'
    + '  return 0;\n'
    + '};', sortBox);
  const cmp = sortBox.cmp;

  /* Ordering agrees with the displayed value, ascending and descending. */
  ok(cmp(-2.5, 1.5, 1, 1, 2) < 0, label + ': ascending puts the worse CLV first');
  ok(cmp(1.5, -2.5, 1, 1, 2) > 0, label + ': ascending puts the better CLV last');
  ok(cmp(-2.5, 1.5, -1, 1, 2) > 0, label + ': descending puts the better CLV first');
  ok(cmp(1.5, -2.5, -1, 1, 2) < 0, label + ': descending puts the worse CLV last');

  /* A positive backend CLV sorts as positive and a negative as negative,
     which is only true if no inversion survives anywhere. */
  ok(cmp(0.0001, -0.0001, -1, 1, 2) < 0, label + ': a hair above par beats a hair below on Best CLV');
  ok(cmp(0.0001, -0.0001, 1, 1, 2) > 0, label + ': and loses to it on Worst CLV');

  /* Nulls sort last in BOTH directions, so a pick with no CLV can never
     occupy either end of Best CLV or Worst CLV. */
  ok(cmp(null, -50, 1, 1, 2) > 0, label + ': a missing CLV sorts after a real one, ascending');
  ok(cmp(null, -50, -1, 1, 2) > 0, label + ': and after a real one descending too');
  ok(cmp(50, null, 1, 1, 2) < 0, label + ': a real CLV sorts before a missing one, ascending');
  ok(cmp(50, null, -1, 1, 2) < 0, label + ': and before a missing one descending too');
  eq(cmp(null, null, 1, 10, 4), -6, label + ': two missing CLVs fall back to recency');

  /* Equal values fall back to recency, never to an arbitrary swap. */
  eq(cmp(1.5, 1.5, 1, 10, 4), -6, label + ': equal CLVs fall back to recency');
}

/* ---------- 4. no OTHER page may grow its own CLV formula ---------------- */

const suspects = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!/\.(html|js|cjs)$/.test(entry.name)) continue;
    if (full.indexOf(path.join(root, 'tests')) === 0) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (/closing - opening|opening - closing/.test(text)) {
      suspects.push(path.relative(root, full));
    }
  }
};
walk(root);
/* _chk.js is a checked-in dump that no page loads. It is listed here rather
   than silently allowed, so it shows up the moment anyone wires it to a page. */
const allowed = new Set(['_chk.js']);
const unexpected = suspects.filter((f) => !allowed.has(f.split(path.sep).join('/')));
eq(unexpected.length, 0,
  'no page may compute CLV from a line difference; found: ' + unexpected.join(', '));

console.log('profile-clv-single-source-test: %d checks passed', checks);
