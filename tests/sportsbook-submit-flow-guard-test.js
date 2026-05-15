#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');
const reliability = fs.readFileSync(path.join(root, 'static', 'js', 'sportsbook-production-fix-persist-reliability.js'), 'utf8');

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
