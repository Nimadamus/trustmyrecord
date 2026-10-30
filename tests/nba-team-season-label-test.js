'use strict';
/* NBA_TEAM_PAGES_LIVE_20261030: an NBA team page may only print a won-lost
   record with its season named, and that season must be the current one. On
   2026-10-30 all 30 pages showed 2025-26 records as "this season" (read from the
   committed August snapshot). This fails on those pages. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// The season is named by the calendar year it ends in; from August on, the coming one.
const now = new Date();
const end = now.getUTCMonth() >= 7 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
const current = `${end - 1}-${String(end).slice(2)}`;

const dir = path.join(ROOT, 'nba-simulator', 'teams');
let n = 0;
for (const slug of fs.readdirSync(dir)) {
  const f = path.join(dir, slug, 'index.html');
  if (!fs.existsSync(f)) continue;
  const html = fs.readFileSync(f, 'utf8');
  n += 1;
  assert.ok(!/\b\d{1,2}-\d{1,2},? this season\b/.test(html), `${slug}: a record is labelled "this season" without naming it`);
  assert.ok(!/<p>\d{1,2}-\d{1,2}\. /.test(html), `${slug}: header record has no season`);
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  for (const m of desc.matchAll(/\b(\d{1,2})-(\d{1,2}) in (\d{4}-\d{2})\b/g)) {
    assert.strictEqual(m[3], current, `${slug}: record labelled ${m[3]}, current season is ${current}`);
    assert.ok(Number(m[1]) + Number(m[2]) <= 82, `${slug}: impossible record ${m[0]}`);
  }
  const head = (html.match(/<section class="hero">[\s\S]*?<\/section>/) || [''])[0];
  for (const m of head.matchAll(/\b(\d{1,2})-(\d{1,2}) in (\d{4}-\d{2})\b/g)) {
    assert.strictEqual(m[3], current, `${slug}: header record labelled ${m[3]}, current season is ${current}`);
  }
  // The header record and the projection block name the same season.
  const proj = (html.match(/<h2>[^<]* (\d{4}-\d{2}) season projection<\/h2>/) || [])[1];
  if (proj) assert.strictEqual(proj, current, `${slug}: projection labelled ${proj}`);
}
assert.strictEqual(n, 30, `30 NBA team pages (found ${n})`);
console.log('NBA_TEAM_SEASON_LABEL PASSED');
