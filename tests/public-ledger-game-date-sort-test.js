'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function tmrxLedgerEventMs(p) {
  const ms = Date.parse((p && (p.commence_time || p.graded_at || p.locked_at || p.created_at)) || '');
  return Number.isFinite(ms) ? ms : 0;
}

function sortLedger(rows) {
  return rows.slice().sort((a, b) => (tmrxLedgerEventMs(b) - tmrxLedgerEventMs(a)) || (Number(b.id || 0) - Number(a.id || 0)));
}

function sourceUsesGameDate(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  assert.match(src, /function tmrxLedgerEventMs/, `${filePath} defines tmrxLedgerEventMs`);
  assert.match(src, /p\.commence_time \|\| p\.graded_at \|\| p\.locked_at \|\| p\.created_at/, `${filePath} prefers game date`);
  assert.match(src, /tmrxLedgerEventMs\(b\) - tmrxLedgerEventMs\(a\)/, `${filePath} sorts Public Ledger by game date`);
  assert.doesNotMatch(
    src,
    /tmrxLedgerPicks = all[\s\S]{0,220}\.sort\(\(a, b\) => new Date\(b\.created_at \|\| b\.locked_at/,
    `${filePath} must not sort the Public Ledger by submission time`
  );
  const ledgerHead = src.slice(src.indexOf('id="tmrxTablePicks"'), src.indexOf('id="tmrxTablePicks"') + 400);
  assert.match(ledgerHead, /<th>Date<\/th>/, `${filePath} Public Ledger date column is the game date`);
  assert.doesNotMatch(ledgerHead, /<th>Submitted<\/th>/, `${filePath} Public Ledger no longer labels the game date as Submitted`);
}

const root = path.join(__dirname, '..');
sourceUsesGameDate(path.join(root, 'profile', 'index.html'));
sourceUsesGameDate(path.join(root, 'preview', 'profile', 'index.html'));

const rows = [
  { id: 7119, selection: 'King Miller Over', sport_key: 'americanfootball_ncaaf', created_at: '2026-09-19T14:02:30.000Z', commence_time: '2026-09-19T19:30:00.000Z' },
  { id: 7064, selection: 'New England Patriots', sport_key: 'americanfootball_nfl', created_at: '2026-09-19T01:10:21.000Z', commence_time: '2026-09-21T00:00:00.000Z' },
  { id: 7062, selection: 'Baltimore Ravens', sport_key: 'americanfootball_nfl', created_at: '2026-09-19T01:10:21.000Z', commence_time: '2026-09-21T00:00:00.000Z' },
  { id: 7061, selection: 'Philadelphia Eagles', sport_key: 'americanfootball_nfl', created_at: '2026-09-19T01:10:21.000Z', commence_time: '2026-09-21T00:00:00.000Z' },
  { id: 7063, selection: 'Chicago Bears', sport_key: 'americanfootball_nfl', created_at: '2026-09-19T01:10:21.000Z', commence_time: '2026-09-21T00:00:00.000Z' },
];
const ordered = sortLedger(rows);
assert.strictEqual(ordered[0].sport_key, 'americanfootball_nfl', 'Sunday NFL games sort above Saturday/Sunday college submissions');
assert.ok(ordered.slice(0, 4).every((p) => p.sport_key === 'americanfootball_nfl'), 'all four Sep 20 NFL tickets lead the ledger');
assert.strictEqual(ordered[4].id, 7119, 'later-submitted NCAAF pick is not treated as newer than Sunday NFL');

console.log('public-ledger-game-date-sort-test: ok');
