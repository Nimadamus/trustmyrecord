const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'pick-display-format.js'), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);

const format = context.window.TMR.formatPickDisplay;
const formatLeague = context.window.TMR.formatLeagueLabel;

assert.strictEqual(formatLeague('baseball_mlb'), 'MLB');
assert.strictEqual(formatLeague('icehockey_nhl'), 'NHL');
assert.strictEqual(formatLeague('basketball_nba'), 'NBA');
assert.strictEqual(formatLeague('americanfootball_nfl'), 'NFL');
assert.strictEqual(formatLeague('americanfootball_ncaaf'), 'College Football');
assert.strictEqual(formatLeague('basketball_ncaab'), 'College Basketball');
assert.notStrictEqual(formatLeague('baseball_mlb'), 'Baseball Mlb');

const fixtures = [
    {
        name: 'Detroit Tigers team total under',
        pick: { market_type: 'team_total', selection_label: 'Detroit Tigers Under 4.5', line_snapshot: 4.5 },
        expected: { pickLabel: 'Detroit Tigers Team Total Under 4.5', lineLabel: 'Under 4.5' }
    },
    {
        name: 'Arizona Diamondbacks team total under',
        pick: { market_type: 'team_totals', selection: 'Arizona Diamondbacks', side: 'under', line_snapshot: 4.5 },
        expected: { pickLabel: 'Arizona Diamondbacks Team Total Under 4.5', lineLabel: 'Under 4.5' }
    },
    {
        name: 'San Francisco Giants moneyline',
        pick: { market_type: 'h2h', selection: 'San Francisco Giants', line_snapshot: null },
        expected: { pickLabel: 'San Francisco Giants ML', lineLabel: 'Moneyline' }
    },
    {
        name: 'Standard spread pick',
        pick: { market_type: 'spreads', selection: 'Yankees', line_snapshot: 1.5 },
        expected: { pickLabel: 'Yankees +1.5', lineLabel: '+1.5' }
    },
    {
        name: 'Standard game total pick',
        pick: { market_type: 'totals', selection: 'Under', line_snapshot: 8.5 },
        expected: { pickLabel: 'Under 8.5', lineLabel: 'Under 8.5' }
    }
];

for (const fixture of fixtures) {
    const actual = format(fixture.pick);
    assert.strictEqual(actual.pickLabel, fixture.expected.pickLabel, fixture.name + ' pickLabel');
    assert.strictEqual(actual.lineLabel, fixture.expected.lineLabel, fixture.name + ' lineLabel');
}

console.log('pick-display-format fixtures passed');
