#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');
const reliability = fs.readFileSync(path.join(root, 'static', 'js', 'sportsbook-production-fix-persist-reliability.js'), 'utf8');

assert(html.includes('sportsbook-production-fix-persist-reliability.js?v='), 'sportsbook page should load current sportsbook reliability script');
assert(html.includes('SPORTSBOOK_RELIABILITY_OWNERSHIP'), 'sportsbook page should document reliability script ownership');
assert(html.includes('id="unitsInput"'), 'Pick Slip should include Units input');
assert(html.includes('id="modeRisk"'), 'Pick Slip should include Risk button');
assert(html.includes('id="modeToWin"'), 'Pick Slip should include To Win button');
assert(html.includes('id="unitsStakePreview"'), 'Pick Slip should include Risk / To Win preview');
assert(html.includes('window.TMR.loadPendingPicksLobby'), 'Pending picks panel should keep its production refresh hook');

assert(reliability.includes('SPORTSBOOK_RELIABILITY_OWNERSHIP'), 'production script should document selector ownership');
assert(reliability.includes('window.TMR.calculateStakeValues = calculateStakeValues'), 'production script should own stake value calculation');
assert(reliability.includes('window.TMR.updateStakeModePreview = updateStakeModePreview'), 'production script should own stake preview updates');
assert(reliability.includes('window.setUnitsMode = setStakeMode'), 'production script should own visible Risk / To Win selector');
assert(reliability.includes("lockFunction(window, 'setUnitsMode', setStakeMode)"), 'production script should lock Risk / To Win selector ownership');
assert(reliability.includes("lockFunction(window, 'tmrSelectOption', selectOption)"), 'production script should lock pick button selection ownership');
assert(reliability.includes("lockFunction(window.TMR, 'renderSportsbookTeamLogo', renderTeamLogo)"), 'production script should lock logo rendering ownership');
assert(reliability.includes('function renderTeamLogo'), 'production script should render team identifiers/logos');
assert(reliability.includes('function renderBoardOptionButton'), 'production script should own board option button rendering');
assert(reliability.includes('class="tmr-option-btn"'), 'board option buttons should keep the clickable selector class');
assert(reliability.includes('data-option-id'), 'board option buttons should keep option ids for pick slip selection');
assert(reliability.includes('onclick="window.tmrSelectOption(this.dataset.optionId)"'), 'board option buttons should route to locked selection handler');
assert(reliability.includes('unitsModeVisibleLabel'), 'production script should inject visible Risk / To Win selector label');
assert(reliability.includes('renderStakeSummaryHtml'), 'production script should render split Risk / To Win summary cells');
assert(reliability.includes("preview.classList.add('tmr-ticket-stake-summary')"), 'stake preview should use the polished ticket summary layout');
assert(reliability.includes("stake_mode: stakeMode"), 'submitted payload should include stake_mode');
assert(reliability.includes("units_mode: stakeMode"), 'submitted payload should include units_mode');
assert(reliability.includes("risk_units: stakeValues.risk_units"), 'submitted payload should store calculated risk units');
assert(reliability.includes("to_win_units: stakeValues.win_units"), 'submitted payload should store calculated to-win units');
assert(
  /const unitsValue = getCurrentStakeAmount\(\);[\s\S]*const stakeMode = getSelectedStakeMode\(\);[\s\S]*const stakeValues = calculateStakeValues\(stakeMode, unitsValue, oddsValue\);[\s\S]*units: unitsValue,[\s\S]*stake_mode: stakeMode,[\s\S]*units_mode: stakeMode,[\s\S]*risk_units: stakeValues\.risk_units,[\s\S]*to_win_units: stakeValues\.win_units,/.test(reliability),
  'lock payload must use the same live units input, selected stake mode, and calculated risk/to-win values'
);
assert(
  /async function lockInPick\(\)[\s\S]*if \(window\.__tmrLockInFlight\)[\s\S]*window\.__tmrLockInFlight = true;[\s\S]*const response = await api\.createPick\(payload\);[\s\S]*finally\s*\{[\s\S]*resetLockButtons\(\);[\s\S]*window\.__tmrLockInFlight = false;[\s\S]*\}/.test(reliability),
  'successful sportsbook submits must always clear the in-flight lock so users can submit another pick in the same page session'
);
assert(html.includes('tmr-ticket-stake-mode-label'), 'ticket stake mode should have non-cramped professional label styling hook');
assert(html.includes('tmr-ticket-stake-summary-cell'), 'ticket summary should render separated Risk and To Win cells');

function calculateStakeValues(mode, amount, odds) {
  const stakeMode = String(mode || 'risk').toLowerCase() === 'to_win' || String(mode || '').toLowerCase() === 'towin' ? 'to_win' : 'risk';
  const units = Number(amount);
  const price = Number(odds);
  if (stakeMode === 'to_win') {
    return {
      risk_units: Math.round((price < 0 ? units * Math.abs(price) / 100 : units * 100 / price) * 100) / 100,
      win_units: Math.round(units * 100) / 100,
    };
  }
  return {
    risk_units: Math.round(units * 100) / 100,
    win_units: Math.round((price < 0 ? units * 100 / Math.abs(price) : units * price / 100) * 100) / 100,
  };
}

assert.deepStrictEqual(calculateStakeValues('risk', 2, -110), { risk_units: 2, win_units: 1.82 });
assert.deepStrictEqual(calculateStakeValues('to_win', 2, -110), { risk_units: 2.2, win_units: 2 });
assert.deepStrictEqual(calculateStakeValues('risk', 1.5, 150), { risk_units: 1.5, win_units: 2.25 });
assert.deepStrictEqual(calculateStakeValues('to_win', 1.5, 150), { risk_units: 1, win_units: 1.5 });
assert.deepStrictEqual(calculateStakeValues('risk', 3, -105), { risk_units: 3, win_units: 2.86 });
assert.deepStrictEqual(calculateStakeValues('to_win', 3, -105), { risk_units: 3.15, win_units: 3 });

function formatStakePreviewUnits(value) {
  const n = Math.round(Number(value) * 100) / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function renderStakeSummaryText(mode, amount, odds) {
  const values = calculateStakeValues(mode, amount, odds);
  return {
    riskLabel: `Risk ${formatStakePreviewUnits(values.risk_units)} units`,
    toWinLabel: `To Win ${formatStakePreviewUnits(values.win_units)} units`,
    values,
  };
}

function buildSubmitStakePayload(mode, amount, odds) {
  const stakeMode = String(mode || '').toLowerCase() === 'to_win' || String(mode || '').toLowerCase() === 'towin' ? 'to_win' : 'risk';
  const unitsValue = Number(amount);
  const stakeValues = calculateStakeValues(stakeMode, unitsValue, odds);
  return {
    units: unitsValue,
    stake_mode: stakeMode,
    units_mode: stakeMode,
    risk_units: stakeValues.risk_units,
    to_win_units: stakeValues.win_units,
  };
}

const riskPreview = renderStakeSummaryText('risk', 3, -105);
assert.strictEqual(riskPreview.riskLabel, 'Risk 3 units');
assert.strictEqual(riskPreview.toWinLabel, 'To Win 2.86 units');
assert.deepStrictEqual(buildSubmitStakePayload('risk', 3, -105), {
  units: 3,
  stake_mode: 'risk',
  units_mode: 'risk',
  risk_units: 3,
  to_win_units: 2.86,
});

const toWinPreview = renderStakeSummaryText('to_win', 3, -105);
assert.strictEqual(toWinPreview.riskLabel, 'Risk 3.15 units');
assert.strictEqual(toWinPreview.toWinLabel, 'To Win 3 units');
assert.deepStrictEqual(buildSubmitStakePayload('to_win', 3, -105), {
  units: 3,
  stake_mode: 'to_win',
  units_mode: 'to_win',
  risk_units: 3.15,
  to_win_units: 3,
});

assert.notStrictEqual(
  buildSubmitStakePayload('risk', 3, -105).risk_units,
  buildSubmitStakePayload('to_win', 3, -105).risk_units,
  'Risk and To Win modes must not collapse to the same risk amount'
);

console.log('sportsbook stake-mode UI test passed');
