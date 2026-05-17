#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');
const reliability = fs.readFileSync(path.join(root, 'static', 'js', 'sportsbook-production-fix-persist-reliability.js'), 'utf8');
const pendingHtml = fs.readFileSync(path.join(root, 'my-pending-picks', 'index.html'), 'utf8');

assert(reliability.includes('SPORTSBOOK_RELIABILITY_OWNERSHIP'), 'sportsbook reliability script must remain the submit-flow owner');
assert(reliability.includes('submit payload construction'), 'ownership comment must keep submit payload construction in the protected file');

assert(
  /document\.addEventListener\('click'[\s\S]*#ttSlipSubmit,#submitPickBtn,button\.submit-pick-btn,button\.lock-pick-btn,\[data-lock-pick-btn\][\s\S]*showSubmitTrace\('Lock button click captured\.'\)/.test(reliability),
  'submit clicks must stay diagnosable from every sportsbook submit button'
);

assert(
  /function selectOption\(optionId\)[\s\S]*state\.selectedOption = option;[\s\S]*pickDetailsEl\.classList\.add\('has-selection'\);[\s\S]*window\.TMR\._ttPopulateSlip\([\s\S]*gameId: option\.game_id \|\| game\.id \|\| null,[\s\S]*showSelectionFeedback\(option, active\);[\s\S]*function updatePickSummary\(\)/.test(reliability),
  'odds button selection must set selectedOption, expose the slip, populate the visible ticket, and show feedback'
);

assert(
  /function setCardFilter\(cardId, filter\)[\s\S]*card\.dataset\.marketFilter = filter;[\s\S]*card\.dataset\.scope = filter === 'first-5' \? 'f5' : 'full';/.test(reliability),
  'F5 board filters must switch the market card into f5 scope so first-five groups remain visible'
);

assert(
  /const activeCardScope = activeCardFilter === 'first-5' \? 'f5' : 'full';[\s\S]*data-scope="' \+ activeCardScope \+ '" data-market-filter="' \+ activeCardFilter/.test(reliability),
  'initial board render must align card scope with the active F5 market filter'
);

assert(
  /case 'f5_totals':[\s\S]*betType = \/under\/i\.test\(label\) \? 'f5under' : 'f5over';[\s\S]*case 'f5_spreads':[\s\S]*betType = 'f5spread';[\s\S]*case 'f5_h2h':[\s\S]*betType = 'f5ml';/.test(reliability),
  'F5 selected options must preserve F5 ML, run line, and total bet types in the ticket bridge'
);

assert(
  /case 'f5ml':[\s\S]*marketType = 'f5_h2h';[\s\S]*selectionLabel = teamRaw \+ ' F5 ML';[\s\S]*break;/.test(reliability),
  'legacy F5 moneyline clicks must submit as f5_h2h with an F5-visible label'
);

assert(
  /if \(market === 'f5_h2h'\) \{[\s\S]*selection\.replace\([\s\S]*\+ ' F5 ML';[\s\S]*if \(market === 'h2h'/.test(html),
  'saved F5 moneyline picks must display F5 in the pick title before generic h2h formatting'
);

assert(
  /if \(market === 'f5_h2h'\) return[\s\S]*\+ ' F5 ML';/.test(pendingHtml),
  'pending-picks page must display saved F5 moneylines as F5 ML, not generic moneylines'
);

assert(
  /async function lockInPick\(\)[\s\S]*if \(window\.__tmrLockInFlight\)[\s\S]*window\.__tmrLockInFlight = true;[\s\S]*const option = state\.selectedOption;/.test(reliability),
  'lockInPick must block duplicate submits and read the canonical selected option'
);

assert(
  /if \(!option\)[\s\S]*showPickSlipError\('Select a market before submitting a pick\.'\)[\s\S]*window\.__tmrLockInFlight = false;/.test(reliability),
  'submit flow must fail closed when no pick is selected'
);

assert(
  /if \(!option\.game_id \|\| \/unknown\/i\.test\(String\(option\.game_id\)\)\)[\s\S]*showPickSlipError\('That market is missing its game ID/.test(reliability),
  'submit flow must reject selections without a real game_id'
);

assert(
  /const allowed = await ensurePicksAccess\(\);[\s\S]*if \(!allowed\)[\s\S]*window\.__tmrLockInFlight = false;/.test(reliability),
  'submit flow must verify auth/access before posting'
);

assert(
  /const api = await getApiClientOrFallback\(\);[\s\S]*await ensureBackendAccessToken\(api\);[\s\S]*const stakeValues = calculateStakeValues\(stakeMode, unitsValue, oddsValue\);[\s\S]*const payload = \{[\s\S]*game_id: option\.game_id,[\s\S]*external_game_id: option\.game_id,[\s\S]*selection: submittedSelection,[\s\S]*odds_snapshot: oddsValue,[\s\S]*risk_units: stakeValues\.risk_units,[\s\S]*to_win_units: stakeValues\.win_units,[\s\S]*game_snapshot: buildSubmittedGameSnapshot\(option\),[\s\S]*\};[\s\S]*const response = await api\.createPick\(payload\);/.test(reliability),
  'submit flow must build and post the complete backend payload from the selected option'
);

assert(
  /option\.market_type === 'team_totals' \|\| option\.market_type === 'f5_team_totals'/.test(reliability),
  'submit flow must canonicalize both full-game and F5 team-total selections before posting'
);

assert(
  /window\.dispatchEvent\(new CustomEvent\('tmr:pickLocked'[\s\S]*await fetchCurrentUserPicks\(\);[\s\S]*syncRecordWidgets\(state\.currentUserPicks\);[\s\S]*showPickSlipSuccess\('Pick Locked In'/.test(reliability),
  'successful submit must notify pending widgets, refresh picks, and show confirmation'
);

assert(
  /finally\s*\{[\s\S]*resetLockButtons\(\);[\s\S]*window\.__tmrLockInFlight = false;[\s\S]*\}/.test(reliability),
  'submit flow must always clear button and in-flight state'
);

assert(html.includes('window.TMR.loadPendingPicksLobby = loadPendingPicksLobby'), 'pending-picks lobby refresh hook must be exported');
assert(
  /window\.addEventListener\('tmr:pickLocked', scheduleRefresh\);[\s\S]*window\.addEventListener\('tmr:auth-changed', loadPendingPicksLobby\);/.test(html),
  'pending-picks lobby must refresh after successful submit and auth changes'
);
assert(
  /var submit = document\.getElementById\('ttSlipSubmit'\);[\s\S]*window\.lockInPick\(\);/.test(html),
  'visible ticket submit button must route to the locked production submit handler'
);
assert(
  /window\.lockInPick = function\(\) \{[\s\S]*if \(window\.__tmrProductionLockInPick && window\.__tmrProductionLockInPick !== window\.lockInPick\) \{[\s\S]*return window\.__tmrProductionLockInPick\(\);/.test(html),
  'legacy lockInPick shim must delegate back to the protected production handler'
);

console.log('sportsbook submit flow guard test passed');
