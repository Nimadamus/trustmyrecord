#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sportsbook = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');
const reliability = fs.readFileSync(path.join(root, 'static', 'js', 'sportsbook-production-fix-persist-reliability.js'), 'utf8');

assert(
  sportsbook.includes('sportsbook-production-fix-persist-reliability.js?v=20260517teamrowneat2&cb=20260517teamrowneat2'),
  'sportsbook page must load the verified team-row layout runtime cache key'
);

assert(
  /function ensureLogoBeforeName\(nameEl\)[\s\S]*nameEl\.closest\('\.tmr-team-row'\)[\s\S]*nameEl\.closest\('\.team-cell,\.team-info'\)[\s\S]*teamCell\.querySelector\('\.team-logo, \.tmr-team-logo-badge'\)/.test(sportsbook),
  'logo restore helper must not inject duplicate logos into existing sportsbook team rows or team cells'
);

assert(
  reliability.includes("'<div class=\"tmr-team-row\">' + renderTeamLogo(game.away_team") &&
  reliability.includes("'<span class=\"tmr-team-side\">Away</span><span class=\"tmr-team-name\">' + escapeHtml(game.away_team)") &&
  reliability.includes("'<div class=\"tmr-team-row\">' + renderTeamLogo(game.home_team") &&
  reliability.includes("'<span class=\"tmr-team-side\">Home</span><span class=\"tmr-team-name\">' + escapeHtml(game.home_team)"),
  'market cards must render exactly logo, side badge, and full team-name text for both teams'
);

assert(
  reliability.includes('.tmr-team-row{display:grid;grid-template-columns:30px 54px minmax(0,1fr);'),
  'sportsbook team rows must stay in the locked one-logo one-badge one-name grid'
);
assert(
  reliability.includes('.tmr-team-name{grid-column:3;min-width:0;font-size:14px;') &&
  reliability.includes('white-space:nowrap;overflow:visible;text-overflow:clip;max-width:none;'),
  'sportsbook team names must stay one-line, readable, and not ellipsized in verified market cards'
);
assert(
  reliability.includes('#picks #gamesListContainer .tmr-market-card .tmr-market-head{grid-template-columns:1fr!important;}') &&
  reliability.includes('#picks #gamesListContainer .tmr-market-card .tmr-market-side{display:grid!important;grid-template-columns:1fr!important;width:100%!important;margin-top:14px!important;}') &&
  reliability.includes('#picks #gamesListContainer .tmr-market-card .tmr-primary-market-grid{width:100%!important;max-width:none!important;min-width:0!important;}'),
  'market card odds grid must stay stacked below matchup rows and must not overlap team names'
);

assert(
  sportsbook.includes('#gamesListContainer .tmr-market-card .tmr-option-grid') &&
  sportsbook.includes('display: grid !important;') &&
  sportsbook.includes('grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)) !important;'),
  'market-card option grids must not regress to display: contents over team rows'
);

assert(
  /function getOptionTag\(option, game\)[\s\S]*option && option\.market_type === 'f5_totals'[\s\S]*if \(f5TotalSide\.indexOf\('under'\) !== -1\) return 'Under';[\s\S]*if \(f5TotalSide\.indexOf\('over'\) !== -1\) return 'Over';/.test(reliability),
  'F5 totals button tag must render Over/Under from the side, never the numeric total'
);
assert(
  /function getOptionLineText\(option\)[\s\S]*if \(option\.market_type === 'f5_totals'\) return line\.replace\(\/\^\\\+\/, ''\);[\s\S]*option\.market_type === 'f5_totals' \? match\[1\]\.replace\(\/\^\\\+\/, ''\)/.test(reliability),
  'F5 totals line display must strip the leading plus without changing the odds value'
);
assert(
  /function getOptionMarketLabel\(option\)[\s\S]*if \(option && option\.market_type === 'f5_totals'\)[\s\S]*return label\.replace\(\/\\s\+\\\+\(\\d\+\(\\\.\\d\+\)\?\)\\s\*\$\/, ' \$1'\);/.test(reliability),
  'F5 totals market label must not show +3.5 as the visible side label'
);

console.log('sportsbook F5 board layout lock test passed');
