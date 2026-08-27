#!/usr/bin/env node
'use strict';

/**
 * mlb-pitcher-record-label-test.js -- the W-L on a pitcher label, and the
 * corrupted word boundary that silently deleted it.
 *
 * `pitcherRecord` pulled a win-loss record out of a pitcher's note so the
 * dropdown could read "Jacob deGrom, ERA 3.20, W-L 2-1". It never returned
 * anything, on any input, for an unknown length of time. The regex read
 *
 *     /<0x08>(\d{1,3})\s*-\s*(\d{1,3})<0x08>(?!\s*-\s*\d)/
 *
 * where 0x08 is a literal BACKSPACE character. Somewhere between an editor and
 * a patch, the two-character escape \b was collapsed into the single control
 * character it denotes inside a string. As a regex that is not a word boundary,
 * it is a demand for a literal backspace either side of the digits, which no
 * real note contains. So every probable starter lost its record, and nothing
 * failed: the label just quietly rendered one field short.
 *
 * The same corruption hit a second regex in the same file, /\b404\b/, used to
 * decide whether a failed request was a missing resource. It could never match
 * either, so a 404 was never recognised as one.
 *
 * These assertions exist because that failure mode is invisible by nature: a
 * regex that matches nothing throws nothing.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ENGINE = path.join(__dirname, '..', 'static', 'js', 'mlb-simulator.js');
const raw = fs.readFileSync(ENGINE);
const src = raw.toString('utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); process.stdout.write('  PASS  ' + name + '\n'); }
  catch (e) { failures += 1; process.stdout.write('  FAIL  ' + name + '\n        ' + e.message + '\n'); }
}

process.stdout.write('\n  MLB PITCHER RECORD LABEL\n\n');

check('no control characters are embedded in the engine source', () => {
  // Tab, newline and carriage return are legitimate. Nothing else is, and a
  // backspace or form feed inside a regex is always a collapsed escape.
  const bad = [];
  for (let i = 0; i < raw.length; i += 1) {
    const b = raw[i];
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) {
      bad.push('0x' + b.toString(16).padStart(2, '0') + ' at byte ' + i
        + ' near ' + JSON.stringify(raw.slice(Math.max(0, i - 30), i + 20).toString('latin1')));
    }
  }
  assert.strictEqual(bad.length, 0,
    bad.length + ' control character(s) in the source. A \b that became 0x08 is a '
    + 'regex that can never match:\n        ' + bad.slice(0, 3).join('\n        '));
});

check('the record regex uses real word boundaries', () => {
  const m = /var match = text\.match\((\/[^\n]*?\/)\);/.exec(src);
  assert.ok(m, 'pitcherRecord regex not found');
  // Built from a char code so this assertion cannot itself be collapsed the
  // way the regex was.
  var WORD_BOUNDARY = String.fromCharCode(92) + 'b';
  assert.ok(m[1].indexOf(WORD_BOUNDARY) >= 0, 'the record regex lost its word boundaries: ' + m[1]);
});

/** The shipped function, evaluated exactly as written. */
function loadPitcherRecord() {
  const body = /function pitcherRecord\(pitcher\) \{[\s\S]*?\n    \}/.exec(src);
  assert.ok(body, 'pitcherRecord not found');
  // eslint-disable-next-line no-new-func
  return new Function('return (' + body[0] + ')')();
}
const pitcherRecord = loadPitcherRecord();

check('a real ESPN record parses', () => {
  assert.strictEqual(pitcherRecord({ note: '(2-1, 3.20)' }), '2-1');
  assert.strictEqual(pitcherRecord({ note: '(2-8, 5.82)' }), '2-8');
  assert.strictEqual(pitcherRecord({ note: '12-4' }), '12-4');
});

check('a note with no record degrades to nothing, not to a wrong record', () => {
  assert.strictEqual(pitcherRecord({ note: 'Listed by ESPN as probable' }), null);
  assert.strictEqual(pitcherRecord({ note: '' }), null);
  assert.strictEqual(pitcherRecord({}), null);
  assert.strictEqual(pitcherRecord(null), null);
});

check('an ISO date is never mistaken for a win-loss record', () => {
  // The reason the stripping exists: "08-04" inside 2026-08-04 is a
  // valid-looking pair, and a season note carries the regeneration date.
  assert.strictEqual(pitcherRecord({ note: 'static profile (regenerated 2026-08-04)' }), null);
  assert.strictEqual(pitcherRecord({ note: 'Real 2026 season ERA 3.10, 7-2' }), '7-2');
});

check('the 404 detector can actually match a 404', () => {
  const m = /var absent = (\/[^\n]*?\/)\.test\(msg\);/.exec(src);
  assert.ok(m, '404 detector not found');
  // eslint-disable-next-line no-new-func
  const re = new Function('return ' + m[1])();
  assert.ok(re.test('Request failed: 404 Not Found'), 'a 404 message is not recognised: ' + m[1]);
  assert.ok(!re.test('server returned 4040 items'), 'the detector matches a number that merely contains 404');
});

process.stdout.write('\n');
if (failures) { process.stdout.write('  ' + failures + ' failed\n\n'); process.exit(1); }
process.stdout.write('  Pitcher records parse, and the boundaries are real.\n\n');
