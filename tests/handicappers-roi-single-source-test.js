/**
 * Handicappers ROI: one source, one formula.
 *
 * The featured "Hottest Last 30 Days" card used to be able to show two different ROI values
 * for the same member seconds apart — observed in production as 0.1% -> 0.2%. Two independent
 * computations fed the same cell:
 *
 *   A. the server aggregate from /api/users/featured-stats (units_30d / risk_30d)
 *   B. a client-side rebuild from member.rawPicks
 *
 * They disagreed on BOTH ends of the fraction: the window (server-pinned boundary vs a rolling
 * Date.now() evaluated at render time) and the denominator (summed risk_units vs risk
 * synthesised from odds when risk_units was absent). renderFeaturedLeaders() gated on
 * `(featuredStatsSettled && featuredStatsById) || enrichmentComplete` — an OR — so whichever
 * finished first painted, and the other re-painted over it.
 *
 * This test pins the contract by parsing handicappers/index.html: only the server aggregate
 * may feed a 30-day ROI, and the grid may not paint before that request settles. It also
 * exercises the formula itself against the edge cases that matter.
 *
 * Run: node tests/handicappers-roi-single-source-test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'handicappers', 'index.html'), 'utf8');
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('  PASS  ' + name);
}

// ---- the canonical formula, mirrored from hotStats30d() --------------------
// ROI = units / risk * 100, null when risk is not a positive number.
function roiOf(units, risk) {
  return risk > 0 ? (units / risk) * 100 : null;
}

// ---- structural contract ---------------------------------------------------

function hotStatsBody() {
  const i = SRC.indexOf('function hotStats30d(member)');
  assert.ok(i > -1, 'hotStats30d() not found');
  const rest = SRC.slice(i);
  return rest.slice(0, rest.indexOf('\n        function ', 10));
}

check('hotStats30d reads ONLY the server aggregate', () => {
  const body = hotStatsBody();
  assert.ok(/featuredRowFor\(member\)/.test(body), 'must read the server row');
  assert.ok(/if \(!row\) return null;/.test(body),
    'must return null when the server row is missing, not fall back to a second computation');
  for (const banned of ['member.rawPicks', 'pickGradedTime(', 'Date.now()', 'HOT_WINDOW_DAYS']) {
    assert.ok(!body.includes(banned),
      `hotStats30d must not rebuild the window client-side (found "${banned}")`);
  }
});

check('hotStats30d uses units_30d / risk_30d and no odds synthesis', () => {
  const body = hotStatsBody();
  assert.ok(/row\.units_30d/.test(body) && /row\.risk_30d/.test(body),
    'must use the server units_30d / risk_30d fields');
  assert.ok(/roi: risk > 0 \? \(units \/ risk\) \* 100 : null/.test(body),
    'ROI must be units / risk * 100, null-guarded on zero risk');
  assert.ok(!/odds_snapshot|Math\.abs\(odds\)/.test(body),
    'must not synthesise risk from odds — that is what made the denominator diverge');
});

check('featured grid waits for featured-stats to settle before painting', () => {
  const i = SRC.indexOf('function renderFeaturedLeaders()');
  const body = SRC.slice(i, i + 2000);
  assert.ok(/if \(!featuredStatsSettled\) return;/.test(body),
    'render must be gated on featuredStatsSettled');
  assert.ok(!/\|\| enrichmentComplete\) return;/.test(body),
    'the OR with enrichmentComplete must be gone — it let a second source paint first');
});

check('exactly one 30-day ROI computation remains in the file', () => {
  const occurrences = (SRC.match(/roi: risk > 0 \? \(units \/ risk\) \* 100 : null/g) || []).length;
  assert.strictEqual(occurrences, 2,
    `expected exactly 2 "units / risk * 100" sites (lifetime + the single 30-day one), found ${occurrences}`);
});

// ---- formula behaviour -----------------------------------------------------

check('positive ROI', () => {
  assert.strictEqual(roiOf(12.5, 100), 12.5);
  assert.ok(Math.abs(roiOf(0.2, 100) - 0.2) < 1e-9);
});

check('negative ROI', () => {
  assert.strictEqual(roiOf(-8, 100), -8);
  assert.ok(roiOf(-0.5, 250) < 0);
});

check('zero risk yields null, never Infinity or NaN', () => {
  assert.strictEqual(roiOf(5, 0), null);
  assert.strictEqual(roiOf(0, 0), null);
  assert.strictEqual(roiOf(-3, 0), null);
  assert.strictEqual(roiOf(5, -1), null, 'negative risk is not a valid denominator');
});

check('zero units over positive risk is 0%, not null', () => {
  assert.strictEqual(roiOf(0, 100), 0);
});

check('partial grading: only graded picks contribute (graded_30d gates the card)', () => {
  const body = hotStatsBody();
  assert.ok(/const graded = Number\(row\.graded_30d \|\| 0\);/.test(body) &&
            /if \(!graded\) return null;/.test(body),
    'a member with no graded picks in the window must yield no Hot card');
});

check('deleted picks and test/QA accounts are excluded server-side', () => {
  // The client must not be filtering these itself — that was the old divergence. The card is
  // built purely from the aggregate, so exclusion is the server's job and the client must not
  // re-derive membership.
  const body = hotStatsBody();
  assert.ok(!/deleted_at|account_type|is_internal_test|is_public/.test(body),
    'hotStats30d must not re-implement visibility filtering; the aggregate is already filtered');
});

check('window boundaries come from the server, not a render-time clock', () => {
  const body = hotStatsBody();
  assert.ok(!/Date\.now\(\)/.test(body),
    'a render-time clock made the window move between two paints of the same card');
  assert.ok(/row\.last_graded_at/.test(body) && /row\.hot_recent/.test(body),
    'recency must come from the server row too, so ranking and display agree');
});

check('server-rendered and hydrated values cannot differ (one source)', () => {
  const body = hotStatsBody();
  const readsServerRow = /Number\(row\.(units|risk|wins|losses|graded)_30d/.test(body);
  const readsAnythingElse = /member\.(rawPicks|stats)/.test(body);
  assert.ok(readsServerRow, 'must read the aggregate');
  assert.ok(!readsAnythingElse,
    'reading member.stats/rawPicks here reintroduces a second source that can hydrate differently');
});

console.log(`\nALL PASS (${passed} checks)`);
