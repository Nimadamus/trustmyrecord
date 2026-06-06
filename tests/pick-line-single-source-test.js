#!/usr/bin/env node
// PICK_LINE_SINGLE_SOURCE_20260605 guard.
//
// A wager display must NEVER show two different lines (e.g. pick text
// "Over 217.5" next to a LINE column of 214.5). This test loads the real
// static/js/backend-api.js formatters in a sandbox and proves:
//   1) formatPickDisplay derives the rendered line from line_snapshot ONLY,
//      stripping any stale line embedded in the selection text.
//   2) formatPickLine and formatPickDisplay can never disagree on the number.
//   3) The sentinel comments protecting this behavior are still present in
//      backend-api.js, my-pending-picks/index.html, the sportsbook
//      reliability runtime, and the backend pick-creation route is expected
//      to carry LINE_SINGLE_SOURCE_20260605 (asserted via the frontend
//      sentinels here; the backend has its own 400 LINE_SELECTION_MISMATCH).

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

// ---- sentinel presence -----------------------------------------------------
const backendApiSrc = fs.readFileSync(path.join(root, 'static', 'js', 'backend-api.js'), 'utf8');
const pendingSrc = fs.readFileSync(path.join(root, 'my-pending-picks', 'index.html'), 'utf8');
const reliabilitySrc = fs.readFileSync(path.join(root, 'static', 'js', 'sportsbook-production-fix-persist-reliability.js'), 'utf8');

assert(backendApiSrc.includes('PICK_LINE_SINGLE_SOURCE_20260605'), 'backend-api.js must keep the single-source line guard');
assert(pendingSrc.includes('PICK_LINE_SINGLE_SOURCE_20260605'), 'my-pending-picks must keep the single-source line guard');
assert(reliabilitySrc.includes('PICK_LINE_SINGLE_SOURCE_20260605'), 'sportsbook reliability runtime must keep the line fallback guard');

// ---- behavioral proof on the real formatters --------------------------------
const sandbox = { window: {}, console, URLSearchParams, localStorage: undefined };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
// backend-api.js touches localStorage/fetch at class level but the formatter
// registration block only needs `window`.
try {
  vm.runInContext(backendApiSrc, sandbox);
} catch (e) {
  // Class wiring may throw in a bare sandbox; the TMR formatters are
  // registered before any runtime-only code executes. Verify below.
}
const TMR = sandbox.window.TMR;
assert(TMR && typeof TMR.formatPickDisplay === 'function', 'TMR.formatPickDisplay must be registered');
assert(typeof TMR.formatPickLine === 'function', 'TMR.formatPickLine must be registered');

// Corrupted historical row: selection text carries a stale 217.5, the stored
// (graded/locked) line is 214.5. Display must show 214.5 in BOTH places.
const mismatched = {
  market_type: 'totals',
  selection: 'Over 217.5',
  line_snapshot: 214.5,
  away_team: 'New York Knicks',
  home_team: 'San Antonio Spurs',
};
const display = TMR.formatPickDisplay(mismatched);
const lineLabel = TMR.formatPickLine(mismatched);
assert(!display.includes('217.5'), `display must not leak the stale embedded line: "${display}"`);
assert(display.includes('214.5'), `display must carry the stored line: "${display}"`);
assert(lineLabel === '214.5', `LINE column must be the stored line: "${lineLabel}"`);
const numbersInDisplay = (display.match(/\d+(?:\.\d+)?/g) || []).filter((n) => Number(n) > 100);
assert(new Set(numbersInDisplay).size <= 1, `display must never contain two different totals: "${display}"`);

// Healthy row stays untouched.
const healthy = { market_type: 'totals', selection: 'Under 7.5', line_snapshot: 7.5 };
assert(TMR.formatPickDisplay(healthy).includes('Under 7.5'), 'healthy total renders its own line');
assert(TMR.formatPickLine(healthy) === '7.5', 'healthy LINE column matches');

// Spread mismatch: same rule.
const spread = { market_type: 'spreads', selection: 'San Antonio Spurs -7.5', line_snapshot: -6.5 };
const spreadDisplay = TMR.formatPickDisplay(spread);
assert(!spreadDisplay.includes('-7.5'), `spread display must not leak stale line: "${spreadDisplay}"`);
assert(spreadDisplay.includes('-6.5'), `spread display must carry stored line: "${spreadDisplay}"`);

// Team total mismatch.
const teamTotal = { market_type: 'team_totals', selection: 'Atlanta Braves Under 5.5', line_snapshot: 4.5 };
const ttDisplay = TMR.formatPickDisplay(teamTotal);
assert(!ttDisplay.includes('5.5') || ttDisplay.includes('4.5'), `team total must carry stored line: "${ttDisplay}"`);
assert(ttDisplay.includes('4.5'), `team total must show 4.5: "${ttDisplay}"`);

console.log('PICK LINE SINGLE SOURCE TEST PASSED');
console.log('  mismatched row renders as:', display, '| LINE:', lineLabel);
