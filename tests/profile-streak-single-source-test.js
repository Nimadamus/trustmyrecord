/**
 * Profile streaks: one chronology, shared with the backend.
 *
 * The profile's Capper panel computes Current Streak and Best Streak on the
 * client, because those cells respect the panel's sport/market/status filters
 * and so cannot just read the server aggregate. That is fine. What was not fine
 * is that it computed them with its OWN chronology:
 *
 *     capDateMs(p) = locked_at || created_at || graded_at
 *
 * The picks payload this panel receives has no locked_at, so it fell through to
 * created_at, i.e. SUBMISSION time. A member who submits a whole slate in one
 * click gives every pick in it the same timestamp, so the "streak" was really
 * the order the rows were inserted. That is the same defect that was removed
 * from routes/premium.js in the backend on 2026-08-23.
 *
 * The canonical definition lives in trustmyrecord-backend
 * services/canonicalStreak.js: order by SETTLEMENT time (graded_at), clamped
 * into [commence_time, commence_time + 6h] so timely grading orders by when the
 * result actually landed, while a late regrade cannot jump a month-old game to
 * the top of somebody's run. Pushes are neutral. This file pins the client port
 * of that rule, both as a source guard and by exercising the real behaviour,
 * including the two production reports that shaped it.
 *
 * Run: node tests/profile-streak-single-source-test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TARGETS = ['profile/index.html', 'preview/profile/index.html'];

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

// Lift the streak helpers straight out of the page so the test exercises the
// shipped code rather than a copy of it that could quietly diverge.
function loadStreakHelpers(relPath) {
  const src = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8').replace(/\r\n/g, '\n');

  const blockStart = src.indexOf('var CAP_STREAK_CLAMP_MS');
  assert.notStrictEqual(blockStart, -1,
    `${relPath}: the canonical streak order key is missing`);
  const sortTail = '        });\n    }';
  const sortEnd = src.indexOf(sortTail, src.indexOf('return (ta - tb)'));
  assert.notStrictEqual(sortEnd, -1, `${relPath}: capStreakSortAsc is malformed`);
  const block = src.slice(blockStart, sortEnd + sortTail.length);

  const bestStart = src.indexOf('    function computeBestStreak(rows) {');
  const bestTail = '        return best;\n    }';
  const bestEnd = src.indexOf(bestTail, bestStart);
  assert.ok(bestStart !== -1 && bestEnd !== -1, `${relPath}: computeBestStreak is missing`);
  const best = src.slice(bestStart, bestEnd + bestTail.length);

  const curStart = src.indexOf('            const currentStreak = (function () {');
  const curEnd = src.indexOf('})();', curStart);
  assert.ok(curStart !== -1 && curEnd !== -1, `${relPath}: the current-streak block is missing`);
  const cur = src.slice(curStart, curEnd + 5).replace('const currentStreak =', 'const value =');

  const factory = new Function(`
    ${block}
    function capStatus(p) { return String((p && p.status) || '').toLowerCase(); }
    ${best}
    function currentStreak(rows) {
      ${cur}
      return value;
    }
    return { capStreakOrderMs, capStreakSortAsc, computeBestStreak, currentStreak };
  `);
  return { src, api: factory() };
}

// A pick that settles a normal 3 hours after first pitch.
let seq = 0;
function pick(status, startIso, opts = {}) {
  const start = new Date(startIso);
  return {
    id: opts.id != null ? opts.id : ++seq,
    status,
    commence_time: start.toISOString(),
    graded_at: opts.graded_at === null
      ? null
      : new Date(opts.graded_at || start.getTime() + 3 * 3600 * 1000).toISOString(),
    // Deliberately mirrors the real payload: this endpoint does not send
    // locked_at, which is exactly why the old code fell through to created_at.
    created_at: new Date(start.getTime() - 5 * 3600 * 1000).toISOString(),
  };
}
const run = (statuses) =>
  statuses.map((s, i) => pick(s, `2026-07-${String(i + 1).padStart(2, '0')}T23:00:00Z`));

for (const relPath of TARGETS) {
  console.log(`\n${relPath}`);
  const { src, api } = loadStreakHelpers(relPath);

  // ---- source guards -------------------------------------------------------
  check('streaks are not ordered by submission time', () => {
    assert.doesNotMatch(
      src,
      /const chrono = rows\.slice\(\)\.sort\(\(a, b\) => capDateMs\(b\) - capDateMs\(a\)\)/,
      'the current-streak block must not order by capDateMs (submission time)'
    );
    assert.doesNotMatch(
      src,
      /const chrono = \(rows \|\| \[\]\)\.slice\(\)\.sort\(\(a, b\) => capDateMs\(a\) - capDateMs\(b\)\)/,
      'computeBestStreak must not order by capDateMs (submission time)'
    );
  });

  check('both streak computations go through capStreakSortAsc', () => {
    assert.match(src, /const chrono = capStreakSortAsc\(rows\);/,
      'computeBestStreak must sort with capStreakSortAsc');
    assert.match(src, /const chrono = capStreakSortAsc\(rows\)\.reverse\(\);/,
      'the current-streak block must sort with capStreakSortAsc');
  });

  check('capDateMs still exists for the ledger table it belongs to', () => {
    // The fix is scoped: date filtering and table sorting legitimately use
    // submission time. Only the STREAKS moved off it.
    assert.match(src, /function capDateMs\(p\)/);
    assert.match(src, /date_desc: \(a,b\) => capDateMs\(b\) - capDateMs\(a\)/);
  });

  // ---- the ordering key ----------------------------------------------------
  const { capStreakOrderMs, computeBestStreak, currentStreak } = api;

  check('a normally graded pick orders at its real settlement time', () => {
    const p = pick('won', '2026-07-01T23:00:00Z');
    assert.strictEqual(capStreakOrderMs(p), Date.parse('2026-07-02T02:00:00Z'));
  });

  check('a late regrade is clamped back into its own game window', () => {
    const p = pick('lost', '2026-07-01T18:50:00Z', { graded_at: '2026-08-16T23:47:00Z' });
    const start = Date.parse('2026-07-01T18:50:00Z');
    const key = capStreakOrderMs(p);
    assert.ok(key >= start && key <= start + 6 * 3600 * 1000,
      `a 46-day-late regrade must clamp into the game window, got ${new Date(key).toISOString()}`);
  });

  check('settlement time is never dragged before first pitch', () => {
    const p = pick('won', '2026-07-01T23:00:00Z', { graded_at: '2026-07-01T18:00:00Z' });
    assert.strictEqual(capStreakOrderMs(p), Date.parse('2026-07-01T23:00:00Z'));
  });

  check('an ungraded pick still yields a finite key', () => {
    const p = pick('pending', '2026-07-01T23:00:00Z', { graded_at: null });
    assert.ok(Number.isFinite(capStreakOrderMs(p)));
  });

  // ---- current streak ------------------------------------------------------
  check('W1 / W5 / L1 / L5', () => {
    assert.strictEqual(currentStreak(run(['lost', 'won'])), '1W');
    assert.strictEqual(currentStreak(run(['lost', 'won', 'won', 'won', 'won', 'won'])), '5W');
    assert.strictEqual(currentStreak(run(['won', 'lost'])), '1L');
    assert.strictEqual(currentStreak(run(['won', 'lost', 'lost', 'lost', 'lost', 'lost'])), '5L');
  });

  check('a win after a losing run resets, and a loss after a winning run resets', () => {
    assert.strictEqual(currentStreak(run(['lost', 'lost', 'lost', 'won'])), '1W');
    assert.strictEqual(currentStreak(run(['won', 'won', 'won', 'lost'])), '1L');
  });

  check('pushes are neutral', () => {
    assert.strictEqual(currentStreak(run(['won', 'push', 'won'])), '2W');
    assert.strictEqual(currentStreak(run(['won', 'won', 'push'])), '2W');
    assert.strictEqual(currentStreak(run(['push', 'push'])), '0');
  });

  check('pending, void and cancelled are not results', () => {
    assert.strictEqual(currentStreak(run(['won', 'won', 'pending'])), '2W');
    assert.strictEqual(currentStreak(run(['won', 'won', 'void'])), '2W');
    assert.strictEqual(currentStreak(run(['won', 'void', 'won'])), '2W');
    assert.strictEqual(currentStreak(run(['lost', 'cancelled', 'lost'])), '2L');
  });

  check('one graded pick, and none at all', () => {
    assert.strictEqual(currentStreak(run(['won'])), '1W');
    assert.strictEqual(currentStreak(run(['lost'])), '1L');
    assert.strictEqual(currentStreak([]), '0');
    assert.strictEqual(currentStreak(run(['pending'])), '0');
  });

  check('input order does not change the answer', () => {
    const rows = run(['lost', 'won', 'won']);
    assert.strictEqual(currentStreak(rows), '2W');
    assert.strictEqual(currentStreak(rows.slice().reverse()), '2W');
  });

  check('a slate settled in one batch resolves by pick id', () => {
    const batch = [
      { id: 10, status: 'won', commence_time: '2026-07-01T23:00:00Z', graded_at: '2026-07-02T02:00:00Z' },
      { id: 11, status: 'won', commence_time: '2026-07-01T23:00:00Z', graded_at: '2026-07-02T02:00:00Z' },
      { id: 12, status: 'lost', commence_time: '2026-07-01T23:00:00Z', graded_at: '2026-07-02T02:00:00Z' },
    ];
    assert.strictEqual(currentStreak(batch), '1L');
    assert.strictEqual(currentStreak(batch.slice().reverse()), '1L');
  });

  // ---- the two production reports -----------------------------------------
  check('2026-08-23: a game that starts earlier but finishes later is W1, not W2', () => {
    const aug22 = [
      { id: 4631, status: 'lost', commence_time: '2026-08-22T23:05:00Z', graded_at: '2026-08-23T01:45:00Z' },
      { id: 4632, status: 'lost', commence_time: '2026-08-22T23:10:00Z', graded_at: '2026-08-23T02:04:00Z' },
      { id: 4633, status: 'won', commence_time: '2026-08-22T23:15:00Z', graded_at: '2026-08-23T01:25:00Z' },
      { id: 4634, status: 'won', commence_time: '2026-08-23T00:10:00Z', graded_at: '2026-08-23T02:41:00Z' },
    ];
    assert.strictEqual(currentStreak(aug22), '1W');
  });

  check('2026-06-13: three night wins survive a day game regraded 13 hours late', () => {
    const june12 = [
      { id: 1, status: 'lost', commence_time: '2026-06-12T17:10:00Z', graded_at: '2026-06-13T06:00:00Z' },
      { id: 2, status: 'won', commence_time: '2026-06-12T23:05:00Z', graded_at: '2026-06-13T02:30:00Z' },
      { id: 3, status: 'won', commence_time: '2026-06-12T23:40:00Z', graded_at: '2026-06-13T02:55:00Z' },
      { id: 4, status: 'won', commence_time: '2026-06-13T00:10:00Z', graded_at: '2026-06-13T03:20:00Z' },
    ];
    assert.strictEqual(currentStreak(june12), '3W');
  });

  check('a submission-ordered streak would have got these wrong', () => {
    // Guards the guard: if someone reverts to created_at ordering, these
    // fixtures must actually change answer, or the tests above prove nothing.
    const byCreated = (rows) => rows.slice().sort((a, b) =>
      Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
    const rows = run(['lost', 'won', 'won']).map((p, i) =>
      // same submission timestamp for the whole slate, reversed row ids
      ({ ...p, id: 100 - i, created_at: '2026-07-01T12:00:00Z' }));
    const naive = byCreated(rows)[0];
    assert.notStrictEqual(naive.status, 'won',
      'fixture must actually differ under submission ordering');
    assert.strictEqual(currentStreak(rows), '2W');
  });

  // ---- best streak ---------------------------------------------------------
  check('best streak is the longest win run, pushes neutral', () => {
    assert.strictEqual(computeBestStreak(run(['won', 'won', 'won', 'lost', 'won'])), 3);
    assert.strictEqual(computeBestStreak(run(['won', 'push', 'won'])), 2);
    assert.strictEqual(computeBestStreak(run(['lost', 'lost'])), 0);
    assert.strictEqual(computeBestStreak([]), 0);
  });

  check('best streak is not inflated by a late regrade', () => {
    const rows = [
      { id: 1, status: 'won', commence_time: '2026-07-01T23:00:00Z', graded_at: '2026-07-02T02:00:00Z' },
      { id: 2, status: 'lost', commence_time: '2026-07-02T23:00:00Z', graded_at: '2026-08-30T02:00:00Z' },
      { id: 3, status: 'won', commence_time: '2026-07-03T23:00:00Z', graded_at: '2026-07-04T02:00:00Z' },
    ];
    assert.strictEqual(computeBestStreak(rows), 1,
      'the loss belongs between the wins; a late regrade must not merge them into W2');
  });
}

console.log(`\nprofile streak single-source: ${passed} checks passed`);
