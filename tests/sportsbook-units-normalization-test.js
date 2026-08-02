#!/usr/bin/env node
/**
 * SPORTSBOOK_UNITS_NORMALIZATION regression test (2026-08-02)
 *
 * Root cause this locks down: the legacy lockInPick() in sportsbook/index.html
 * read the stake field with parseInt(), so a 0.5 or 1.5 unit pick was silently
 * submitted as 1 — a different answer than the ticket slip, quick-bet bar and
 * multislip produced for the same input.
 *
 * This test proves:
 *   1. the shared normalizer keeps every valid half unit intact,
 *   2. blank / malformed / out-of-range input resolves to a safe value,
 *   3. every sportsbook submit path resolves units through that ONE normalizer
 *      (no path keeps its own parse/clamp),
 *   4. the parseInt truncation cannot come back.
 *
 * Run: node tests/sportsbook-units-normalization-test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const readFile = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

const html = readFile('sportsbook', 'index.html');
const reliability = readFile('static', 'js', 'sportsbook-production-fix-persist-reliability.js');
const multislip = readFile('static', 'js', 'sportsbook-multislip.js');

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log('  ok  ' + name);
  } catch (error) {
    failures.push(name + ' -> ' + error.message);
    console.log('  FAIL ' + name + ' -> ' + error.message);
  }
}

// ---------------------------------------------------------------------------
// Extract the production normalizer from the owner script and run it for real.
// ---------------------------------------------------------------------------
function extractFunction(source, name, label) {
  const start = source.indexOf('function ' + name + '(');
  assert(start !== -1, label + ': function ' + name + ' not found');
  let i = source.indexOf('{', start);
  assert(i !== -1, label + ': malformed ' + name);
  let depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(label + ': unbalanced braces in ' + name);
}

const normalizerSource = extractFunction(reliability, 'normalizeStakeUnits', 'reliability');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  'const STAKE_UNITS_MIN = 0.5, STAKE_UNITS_MAX = 5, STAKE_UNITS_DEFAULT = 1;\n' +
    'const STAKE_UNITS_NUMERIC = /^[+-]?(?:\\d+\\.?\\d*|\\.\\d+)$/;\n' +
    normalizerSource +
    '\nthis.normalizeStakeUnits = normalizeStakeUnits;',
  sandbox
);
const normalize = sandbox.normalizeStakeUnits;
assert.strictEqual(typeof normalize, 'function', 'normalizeStakeUnits must be extractable');

console.log('normalizer behaviour');

// 1. Valid unit sizes survive EXACTLY — this is the bug the parseInt caused.
[
  ['0.5 stays 0.5', '0.5', 0.5],
  ['1 stays 1', '1', 1],
  ['1.5 stays 1.5', '1.5', 1.5],
  ['2 stays 2', '2', 2],
  ['2.5 stays 2.5', '2.5', 2.5],
  ['3 stays 3', '3', 3],
  ['3.5 stays 3.5', '3.5', 3.5],
  ['4 stays 4', '4', 4],
  ['4.5 stays 4.5', '4.5', 4.5],
  ['5 stays 5', '5', 5],
  ['numeric 1.5 stays 1.5', 1.5, 1.5],
  ['numeric 0.5 stays 0.5', 0.5, 0.5],
  ['".5" is 0.5', '.5', 0.5],
  ['padded " 1.5 " is 1.5', ' 1.5 ', 1.5],
].forEach(([name, input, expected]) => {
  check(name, () => assert.strictEqual(normalize(input), expected));
});

// 2. Blank falls back safely.
[
  ['blank string falls back to 1', '', 1],
  ['whitespace falls back to 1', '   ', 1],
  ['null falls back to 1', null, 1],
  ['undefined falls back to 1', undefined, 1],
].forEach(([name, input, expected]) => {
  check(name, () => assert.strictEqual(normalize(input), expected));
});

// 3. Below minimum clamps up, above maximum clamps down.
[
  ['0 clamps up to 0.5', '0', 0.5],
  ['0.1 clamps up to 0.5', '0.1', 0.5],
  ['0.25 clamps up to 0.5', '0.25', 0.5],
  ['negative clamps up to 0.5', '-3', 0.5],
  ['5.5 clamps down to 5', '5.5', 5],
  ['12 clamps down to 5', '12', 5],
  ['99999 clamps down to 5', '99999', 5],
].forEach(([name, input, expected]) => {
  check(name, () => assert.strictEqual(normalize(input), expected));
});

// 4. Off-step values snap to the nearest half unit, never to an integer floor.
[
  ['1.4 snaps to 1.5', '1.4', 1.5],
  ['1.24 snaps to 1', '1.24', 1],
  ['2.3 snaps to 2.5', '2.3', 2.5],
].forEach(([name, input, expected]) => {
  check(name, () => assert.strictEqual(normalize(input), expected));
});

// 5. Malformed text never yields an invalid or partially-parsed stake.
[
  ['"abc" falls back to 1', 'abc'],
  ['"1.5abc" is rejected, not truncated', '1.5abc'],
  ['"--2" falls back to 1', '--2'],
  ['"1,5" falls back to 1', '1,5'],
  ['"1e3" falls back to 1 (no exponent stakes)', '1e3'],
  ['"NaN" falls back to 1', 'NaN'],
  ['"Infinity" falls back to 1', 'Infinity'],
  ['NaN number falls back to 1', NaN],
  ['Infinity number clamps to max', Infinity],
  ['object falls back to 1', {}],
].forEach(([name, input]) => {
  check(name, () => {
    const out = normalize(input);
    assert.ok(Number.isFinite(out), 'must be finite, got ' + out);
    assert.ok(out >= 0.5 && out <= 5, 'must be inside 0.5..5, got ' + out);
    assert.strictEqual(out * 2, Math.round(out * 2), 'must land on a 0.5 step, got ' + out);
  });
});
check('"1.5abc" must NOT be read as 1.5', () => assert.strictEqual(normalize('1.5abc'), 1));

console.log('submit-path wiring');

// ---------------------------------------------------------------------------
// Every submission path must use the shared normalizer.
// ---------------------------------------------------------------------------
check('owner script exports the shared normalizer', () => {
  assert.ok(
    reliability.includes('window.TMR.normalizeStakeUnits = normalizeStakeUnits'),
    'reliability script must export normalizeStakeUnits'
  );
  assert.ok(
    reliability.includes("lockFunction(window.TMR, 'normalizeStakeUnits', normalizeStakeUnits)"),
    'reliability script must lock normalizeStakeUnits ownership'
  );
  assert.ok(
    reliability.includes('window.TMR.getSubmissionUnits = function() { return getCurrentStakeAmount(true); }'),
    'reliability script must export the single submission-units resolver'
  );
});

check('ticket-slip / reliability submit path uses the normalizer', () => {
  assert.ok(
    /function getCurrentStakeAmount\(commit\)[\s\S]{0,400}normalizeStakeUnits\(/.test(reliability),
    'getCurrentStakeAmount must resolve through normalizeStakeUnits'
  );
  assert.ok(
    reliability.includes('const unitsValue = getCurrentStakeAmount(true);'),
    'the production lock payload must take its units from getCurrentStakeAmount(true)'
  );
});

check('legacy lockInPick path uses the normalizer (no parseInt truncation)', () => {
  const legacy = html.slice(html.indexOf('SPORTSBOOK_UNITS_NORMALIZATION: units are 0.5..5'));
  assert.ok(legacy, 'legacy lockInPick units block not found');
  const block = legacy.slice(0, 900);
  assert.ok(
    block.includes('window.TMR.getSubmissionUnits()'),
    'legacy lockInPick must resolve units through getSubmissionUnits()'
  );
  assert.ok(
    !/parseInt\(\s*inp\.value/.test(html),
    'legacy lockInPick must never parseInt() the units field again'
  );
  assert.ok(
    !/units = Math\.max\(1, Math\.min\(5, Math\.round\(units\)\)\)/.test(html),
    'legacy lockInPick must not re-introduce the whole-number clamp'
  );
});

check('inline ticket-slip submit button uses the normalizer', () => {
  assert.ok(
    /ttSlipSubmit[\s\S]{0,600}window\.TMR\.getSubmissionUnits\(\)/.test(html),
    'the ticket slip Lock Pick button must use getSubmissionUnits()'
  );
});

check('inline fallback normalizer exists and matches the owner rule', () => {
  assert.ok(
    html.includes('window.TMR.normalizeStakeUnits = window.TMR.normalizeStakeUnits ||'),
    'page must ship an inline fallback normalizer'
  );
  assert.ok(
    html.includes('window.TMR.getSubmissionUnits = window.TMR.getSubmissionUnits ||'),
    'page must ship an inline fallback submission-units resolver'
  );
  const inlineStart = html.indexOf('window.TMR.normalizeStakeUnits = window.TMR.normalizeStakeUnits ||');
  const inlineSource = html.slice(inlineStart, inlineStart + 700);
  const inlineSandbox = {};
  vm.createContext(inlineSandbox);
  vm.runInContext(
    'this.fallback = ' + inlineSource.slice(inlineSource.indexOf('function(value)'), inlineSource.indexOf('};') + 1),
    inlineSandbox
  );
  const fallback = inlineSandbox.fallback;
  ['0.5', '1', '1.5', '5', '', '0.1', '12', 'abc', '1.5abc', '2.3'].forEach((input) => {
    assert.strictEqual(
      fallback(input),
      normalize(input),
      'inline fallback disagrees with the owner normalizer for "' + input + '"'
    );
  });
});

check('quick-bet bar delegates to the shared normalizer', () => {
  assert.ok(
    /function clampUnits\(v\) \{\s*return \(window\.TMR && typeof window\.TMR\.normalizeStakeUnits === 'function'\)/.test(reliability),
    'quick-bet clampUnits must delegate to window.TMR.normalizeStakeUnits'
  );
});

check('multislip + restored drafts delegate to the shared normalizer', () => {
  assert.ok(
    /function clampUnits\(v\) \{[\s\S]{0,400}I\.normalizeStakeUnits\(v\)/.test(multislip),
    'multislip clampUnits must delegate to window.TMR.normalizeStakeUnits'
  );
  assert.ok(
    multislip.includes('units: clampUnits(e.units)'),
    'restored multislip drafts must be normalized on restore'
  );
  assert.ok(
    /var units = clampUnits\(entry\.units\)/.test(multislip),
    'multislip submit must normalize each entry before building its payload'
  );
});

check('keyboard entry and spinner buttons share one rule', () => {
  // The units field commits (change/blur) through updateStakeModePreview(true),
  // which resolves via getCurrentStakeAmount -> normalizeStakeUnits, and the
  // +/- steppers go through clampUnits -> the same normalizer.
  assert.ok(
    /unitsInput\.onchange = function\(\) \{\s*updateStakeModePreview\(true\);/.test(reliability),
    'typed units must normalize on change'
  );
  assert.ok(
    /unitsInput\.onblur = function\(\) \{\s*updateStakeModePreview\(true\);/.test(reliability),
    'typed units must normalize on blur'
  );
  assert.ok(
    reliability.includes("qbUnits.value = clampUnits(parseFloat(qbUnits.value || '1') - 0.5); pushToReal();"),
    'quick-bet decrement must normalize'
  );
  assert.ok(
    reliability.includes("qbUnits.value = clampUnits(parseFloat(qbUnits.value || '1') + 0.5); pushToReal();"),
    'quick-bet increment must normalize'
  );
});

check('all submission paths produce the same number for the same input', () => {
  // Paths: ticket slip / legacy slip / quick-bet / multislip entry / restored
  // draft. Each is wired above to normalizeStakeUnits, so equality of the rule
  // is equality of the submitted value. Verified here over the full grid.
  const grid = ['0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '', '0.1', '9', 'abc', '1.5abc'];
  const multislipFallback = (() => {
    const src = extractFunction(multislip, 'clampUnits', 'multislip');
    const box = { window: {} };
    vm.createContext(box);
    vm.runInContext('var UNIT_MIN = 0.5, UNIT_MAX = 5;\n' + src + '\nthis.clampUnits = clampUnits;', box);
    return box.clampUnits;
  })();
  grid.forEach((input) => {
    assert.strictEqual(
      multislipFallback(input),
      normalize(input),
      'multislip fallback disagrees for "' + input + '"'
    );
  });
});

console.log('');
if (failures.length) {
  console.error('sportsbook-units-normalization-test: FAILED (' + failures.length + ')');
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('sportsbook-units-normalization-test: ok');
