const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sportsbookPath = path.join(repoRoot, 'sportsbook', 'index.html');
const source = fs.readFileSync(sportsbookPath, 'utf8');

const FAILURE =
  'Approved sportsbook visual lock was changed. Do not alter sportsbook board/odds/pick-slip layout without explicit approval.';

function fail(message) {
  throw new Error(`${FAILURE}\n${message}`);
}

function assertIncludes(needle, label) {
  if (!source.includes(needle)) fail(`Missing approved marker/value: ${label || needle}`);
}

function assertRegex(regex, label) {
  if (!regex.test(source)) fail(`Missing or changed approved rule: ${label}`);
}

[
  'APPROVED_SPORTSBOOK_VISUAL_LOCK_20260509',
  'SPORTSBOOK_UI_CLEANUP_20260509',
  'ODDS_INTERNAL_ALIGNMENT_20260509',
  'FINAL_EDGE_FIT_20260509',
].forEach((marker) => assertIncludes(marker, marker));

assertRegex(
  /grid-template-columns:\s*minmax\(220px,\s*250px\)\s+minmax\(0,\s*1fr\)\s+minmax\(300px,\s*340px\)\s*!important;/,
  'desktop sportsbook grid must keep center column minmax(0, 1fr) and visible pick-slip column'
);

assertRegex(
  /\.sportsbook-picks-layout\s*\{[\s\S]*?max-width:\s*100%\s*!important;[\s\S]*?width:\s*100%\s*!important;[\s\S]*?min-width:\s*0\s*!important;[\s\S]*?box-sizing:\s*border-box\s*!important;/,
  'outer sportsbook grid must fit within the viewport'
);

assertRegex(
  /\.tmr-option-btn \.tmr-option-line,[\s\S]*?\.tmr-option-btn \.tmr-option-market\s*\{[\s\S]*?font:\s*600\s+18px\/1\.05[\s\S]*?font-variant-numeric:\s*tabular-nums/,
  'approved odds label typography must remain readable and crisp'
);

assertRegex(
  /\.tmr-option-btn \.tmr-option-odds\s*\{[\s\S]*?font:\s*600\s+16px\/1\.05[\s\S]*?font-variant-numeric:\s*tabular-nums/,
  'approved odds price typography must remain readable and centered'
);

assertRegex(
  /\.tmr-option-btn\s*\{[\s\S]*?min-height:\s*70px\s*!important;[\s\S]*?height:\s*70px\s*!important;/,
  'approved compact readable odds button height must remain locked'
);

assertRegex(
  /\.make-picks-loggedout-btn--primary\s*\{[\s\S]*?display:\s*none\s*!important;/,
  'duplicate logged-out banner Join Free button must remain hidden'
);

assertRegex(
  /\.pending-picks-compact-link\s*\{[\s\S]*?min-width:\s*236px\s*!important;[\s\S]*?min-height:\s*42px\s*!important;[\s\S]*?white-space:\s*nowrap\s*!important;/,
  'pending picks button must remain visible and unclipped'
);

assertRegex(
  /body\.tmr-site-shell\[data-tmr-route="sportsbook"\]\s+#picks,[\s\S]*?\.picks-container-modern\s*\{[\s\S]*?width:\s*100%\s*!important;[\s\S]*?max-width:\s*100%\s*!important;[\s\S]*?overflow-x:\s*hidden\s*!important;/,
  'outer sportsbook wrapper must prevent horizontal clipping'
);

assertIncludes(
  'PENDING_PICKS_NO_HORIZONTAL_OVERFLOW_20260509',
  'pending picks no-horizontal-overflow marker'
);

assertRegex(
  /\.tmr-pending-picks-panel,[\s\S]*?\.tmr-pending-pick\s*\{[\s\S]*?max-width:\s*100%\s*!important;[\s\S]*?overflow-x:\s*hidden\s*!important;/,
  'pending picks panel and cards must not create horizontal overflow'
);

assertRegex(
  /\.tmr-pending-picks-panel \*,[\s\S]*?\.tmr-pending-pick \*\s*\{[\s\S]*?max-inline-size:\s*100%\s*!important;[\s\S]*?min-width:\s*0\s*!important;[\s\S]*?overflow-wrap:\s*anywhere\s*!important;[\s\S]*?word-break:\s*break-word\s*!important;/,
  'all pending pick child text must shrink and wrap for real long pending-pick data'
);

assertRegex(
  /\.tmr-pending-picks-list\s*\{[\s\S]*?overflow:\s*hidden auto\s*!important;/,
  'pending picks list must allow vertical scrolling without a horizontal scrollbar'
);

assertRegex(
  /\.tmr-pending-pick\s*\{[\s\S]*?display:\s*flex\s*!important;[\s\S]*?flex-direction:\s*column\s*!important;/,
  'pending picks must remain a vertical card stack inside the pick slip'
);

assertRegex(
  /\.tmr-pending-pick > \*\s*\{[\s\S]*?flex:\s*0 1 auto\s*!important;[\s\S]*?width:\s*100%\s*!important;/,
  'pending pick card children must fit inside the card width'
);

assertRegex(
  /\.tmr-pending-pick-odds,[\s\S]*?\.tmr-pending-status\s*\{[\s\S]*?white-space:\s*normal\s*!important;[\s\S]*?overflow-wrap:\s*anywhere\s*!important;/,
  'pending pick odds, units, and status text must wrap instead of overflowing'
);

console.log('sportsbook approved visual lock test passed');
