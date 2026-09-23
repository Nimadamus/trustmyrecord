'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'profile', 'index.html'), 'utf8');
assert.match(src, /id="tmrxLedgerSportPicker"/, 'public ledger has a sport picker');
assert.match(src, /function tmrxLedgerVisible\(\)/, 'ledger visibility is one function');
assert.match(src, /const picks = visible\.slice\(start, start \+ TMRX_PICKS_PER_PAGE\)/, 'the table pages the filtered rows');
assert.match(src, /function tmrxLedgerSummary\(rows\)/, 'the count, record, and units come from one summary');
assert.match(src, /tmrxLedgerMetaText\(visible\)/, 'the header uses the same rows as the table');

function sportId(p) { return String((p && p.sport_key) || '').toLowerCase() || 'other'; }
function visible(rows, sport) {
  if (!sport) return rows;
  return rows.filter(p => sportId(p) === sport);
}
function summary(rows) {
  let w = 0, l = 0, pushes = 0, net = 0;
  rows.forEach(row => {
    const s = String(row.status || '').toLowerCase();
    const graded = s === 'won' || s === 'lost' || s === 'push' || s === 'pushed';
    if (s === 'won') w++;
    else if (s === 'lost') l++;
    else if (s === 'push' || s === 'pushed') pushes++;
    if (!graded) return;
    const n = Number(row.result_units);
    if (Number.isFinite(n)) net += n;
  });
  return { n: rows.length, w, l, pushes, net };
}

const rows = [
  { sport_key: 'baseball_mlb', status: 'won', result_units: 1 },
  { sport_key: 'baseball_mlb', status: 'lost', result_units: -1.1 },
  { sport_key: 'americanfootball_nfl', status: 'won', result_units: 2 },
  { sport_key: 'icehockey_nhl', status: 'void', result_units: 0 }
];
const all = summary(visible(rows, ''));
assert.strictEqual(all.n, 4);
assert.strictEqual(all.w, 2);
assert.strictEqual(all.l, 1);
assert.strictEqual(Number(all.net.toFixed(2)), 1.9);
const mlb = summary(visible(rows, 'baseball_mlb'));
assert.strictEqual(mlb.n, 2);
assert.strictEqual(mlb.w, 1);
assert.strictEqual(mlb.l, 1);
assert.strictEqual(Number(mlb.net.toFixed(2)), -0.1);
assert.deepStrictEqual(visible(rows, 'americanfootball_nfl').map(p => p.sport_key), ['americanfootball_nfl']);
console.log('public-ledger-sport-filter-test: ok');
