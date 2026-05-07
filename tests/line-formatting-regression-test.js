const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'backend-api.js'), 'utf8');
const marker = '\nif (typeof window !== \'undefined\') {\n    window.TMR';
const start = source.indexOf(marker);
const end = source.indexOf('// Create global API instance');
assert(start !== -1 && end !== -1, 'formatter block should exist');

const sandbox = { window: { TMR: {} }, console };
vm.runInNewContext(source.slice(start, end), sandbox);

const format = sandbox.window.TMR.formatPickLine;
assert.strictEqual(typeof format, 'function');

const cases = [
  ['Seattle team total under', { market_type: 'team_totals', selection: 'Seattle Mariners Team Total Under 4.5', line_snapshot: 4.5 }, '4.5'],
  ['Dodgers team total under', { market_type: 'team_totals', selection: 'Los Angeles Dodgers Team Total Under 5.5', line_snapshot: 5.5 }, '5.5'],
  ['negative team total under', { market_type: 'team_totals', selection: 'Seattle Mariners Team Total Under 4.5', line_snapshot: -4.5 }, '4.5'],
  ['game total over', { market_type: 'totals', selection: 'Game Total Over 6.5', line_snapshot: 6.5 }, '6.5'],
  ['game total under', { market_type: 'totals', selection: 'Game Total Under 6.5', line_snapshot: -6.5 }, '6.5'],
  ['spread underdog', { market_type: 'spreads', selection: 'Seattle Mariners +1.5', line_snapshot: 1.5 }, '+1.5'],
  ['spread favorite', { market_type: 'spreads', selection: 'Seattle Mariners -1.5', line_snapshot: -1.5 }, '-1.5'],
  ['moneyline', { market_type: 'h2h', selection: 'Seattle Mariners Moneyline', line_snapshot: 120 }, '-'],
];

for (const [name, pick, expected] of cases) {
  assert.strictEqual(format(pick), expected, name);
}

console.log('line-formatting-regression-test: ok');
