#!/usr/bin/env node
/* SPORTSBOOK_NEXT_20260904 rollout / rollback switch.
 *   node scripts/sportsbook-next-rollout.cjs 10        -> 10% of browsers get the redesigned board
 *   node scripts/sportsbook-next-rollout.cjs 0         -> everyone back on the classic board (rollback)
 *   node scripts/sportsbook-next-rollout.cjs 100 --push -> also commit + push to main
 * Edits exactly one constant in static/js/sportsbook-next-embed.js. The classic page
 * is never touched; users can still force either side with ?sbnext=1 / ?sbnext=0.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'static', 'js', 'sportsbook-next-embed.js');
const pct = parseInt(process.argv[2], 10);
if (!(pct >= 0 && pct <= 100)) { console.error('usage: sportsbook-next-rollout.cjs <0-100> [--push]'); process.exit(1); }
let src = fs.readFileSync(file, 'utf8');
const re = /var ROLLOUT_PERCENT = (\d+);/;
const m = re.exec(src);
if (!m) { console.error('ROLLOUT_PERCENT constant not found'); process.exit(1); }
const before = parseInt(m[1], 10);
src = src.replace(re, `var ROLLOUT_PERCENT = ${pct};`);
fs.writeFileSync(file, src);
console.log(`ROLLOUT_PERCENT ${before} -> ${pct}`);
if (process.argv.includes('--push')) {
  const msg = pct === 0
    ? 'Sportsbook next: rollback to 0% (classic for everyone)'
    : `Sportsbook next: rollout ${before}% -> ${pct}%`;
  execSync('git pull -q --ff-only origin main', { cwd: root, stdio: 'inherit' });
  execSync(`git add static/js/sportsbook-next-embed.js && git -c core.autocrlf=true commit -q -m "${msg}" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01AHp1pXkGJpw4qCMECSkfqJ" && git push -q origin main`, { cwd: root, stdio: 'inherit' });
  console.log('pushed: ' + msg);
}
