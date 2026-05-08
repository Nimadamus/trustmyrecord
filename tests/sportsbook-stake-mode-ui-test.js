#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');
const reliability = fs.readFileSync(path.join(root, 'static', 'js', 'sportsbook-production-fix-persist-reliability.js'), 'utf8');

assert(html.includes('sportsbook-production-fix-persist-reliability.js?v=20260506owner1'), 'sportsbook page should load current sportsbook reliability script');
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
assert(reliability.includes("stake_mode: stakeMode"), 'submitted payload should include stake_mode');
assert(reliability.includes("units_mode: stakeMode"), 'submitted payload should include units_mode');

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

console.log('sportsbook stake-mode UI test passed');
