#!/usr/bin/env node
/* MULTISLIP rollout / rollback switch (mirror of sportsbook-v2-rollout.cjs).
 *   node scripts/sportsbook-multislip-rollout.cjs 50        -> 50% of browsers
 *   node scripts/sportsbook-multislip-rollout.cjs 0         -> everyone back on
 *                                                              the single-pick slip
 *   node scripts/sportsbook-multislip-rollout.cjs 100 --push -> also commit + push
 * Edits exactly one constant in static/js/sportsbook-multislip.js. The
 * single-pick slip is never removed; users can force either side with
 * ?multislip=1 / ?multislip=0, and contest mode always stays single-pick.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'static', 'js', 'sportsbook-multislip.js');
const pct = parseInt(process.argv[2], 10);
if (!(pct >= 0 && pct <= 100)) { console.error('usage: sportsbook-multislip-rollout.cjs <0-100> [--push]'); process.exit(1); }
let src = fs.readFileSync(file, 'utf8');
const re = /var ROLLOUT_PERCENT = (\d+);/;
const m = re.exec(src);
if (!m) { console.error('ROLLOUT_PERCENT constant not found'); process.exit(1); }
const before = parseInt(m[1], 10);
src = src.replace(re, `var ROLLOUT_PERCENT = ${pct};`);
fs.writeFileSync(file, src);
console.log(`multislip ROLLOUT_PERCENT ${before} -> ${pct}`);
if (process.argv.includes('--push')) {
  const msg = pct === 0
    ? 'Sportsbook multi-pick slip: rollback to 0% (single-pick slip for everyone)'
    : `Sportsbook multi-pick slip: rollout ${before}% -> ${pct}%`;
  execSync('git pull -q --ff-only origin main', { cwd: root, stdio: 'inherit' });
  execSync(`git add static/js/sportsbook-multislip.js && git -c core.autocrlf=true commit -q -m "${msg}" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01AHp1pXkGJpw4qCMECSkfqJ" && git push -q origin main`, { cwd: root, stdio: 'inherit' });
  console.log('pushed: ' + msg);
}
