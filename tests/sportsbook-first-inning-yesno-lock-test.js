#!/usr/bin/env node

// FI_YESNO_20260716 (Nima): locks the MLB 1st-inning market to a plain-English
// "Will there be a run in the first inning?" Yes/No card. It must NEVER regress
// back to the generic Spread/Moneyline/Total (Over/Under) grid. Yes = YRFI
// (Over 0.5), No = NRFI (Under 0.5). Bet wiring (betType firstinningover/under
// -> market_type first_inning_totals) stays intact; only the display is Yes/No.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sportsbook = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');

// Dedicated renderer exists and is routed for the 'fi' period (not the generic grid).
assert(
  /function renderFirstInningRows\s*\(/.test(sportsbook),
  'sportsbook must keep the dedicated renderFirstInningRows() renderer for the MLB 1st-inning tab'
);
assert(
  /if \(period === 'fi'\) \{ return renderFirstInningRows\(/.test(sportsbook),
  "renderPeriodRows must route period 'fi' to renderFirstInningRows (never the generic Spread/ML/Total card)"
);

// The section question header + Yes/No plain-English copy must be present.
assert(
  sportsbook.includes('Will there be a run in the first inning?'),
  'MLB 1st-inning section must show the question header "Will there be a run in the first inning?"'
);
assert(
  /YES <span[^>]*>\(YRFI\)/.test(sportsbook) && /NO <span[^>]*>\(NRFI\)/.test(sportsbook),
  'MLB 1st-inning options must be labeled YES (YRFI) and NO (NRFI)'
);
assert(
  /_fiSideBtn\(idx, over, game, 'Yes'\)/.test(sportsbook) &&
  /_fiSideBtn\(idx, under, game, 'No'\)/.test(sportsbook),
  'Yes must be wired to the Over (YRFI) item and No to the Under (NRFI) item'
);

// Bet wiring underneath must stay first_inning_totals over/under.
assert(
  /betType: isUnder \? 'firstinningunder' : 'firstinningover'/.test(sportsbook),
  'first-inning Yes/No buttons must still submit betType firstinningover/firstinningunder'
);
assert(
  sportsbook.includes("firstinningover: 'first_inning_totals'") &&
  sportsbook.includes("firstinningunder: 'first_inning_totals'"),
  'firstinningover/under must still map to market_type first_inning_totals for grading'
);

console.log('sportsbook first-inning Yes/No lock test passed');
