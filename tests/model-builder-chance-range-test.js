/* MB_CHANCE_RANGE_20261113 + ROI_BASIS_20261113: how the Model Builder page words a backtest.
   Runs the page script's own functions on fixed server answers, new shape and old shape. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'model-builder-shell.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'model-builder', 'index.html'), 'utf8');
let n = 0; const ok = (name, c, extra) => { assert.ok(c, name + (extra ? ': ' + extra : '')); n += 1; };

/* pull the named functions out of the script and run them alone */
function grab(name) {
  const at = js.indexOf('function ' + name + '(');
  assert.ok(at > 0, name + ' exists');
  let depth = 0, i = js.indexOf('{', at);
  for (; i < js.length; i += 1) { if (js[i] === '{') depth += 1; else if (js[i] === '}') { depth -= 1; if (!depth) break; } }
  return js.slice(at, i + 1);
}
const src = ['esc', 'fmtOdds', 'fmtUnits', 'fmtPct', 'signClass', 'metricTile', 'closingMarketTiles', 'verdictHtml', 'roiCell', 'roiSub', 'comparisonRow', 'warningsHtml'].map(grab).join('\n')
  + '\nthis.out = { verdictHtml, roiCell, roiSub, comparisonRow, warningsHtml, closingMarketTiles };';
const box = {}; vm.runInNewContext(src, box);
const F = box.out;

const base = { label: 'Baseline (all verified picks, this sport)', roi: -1.55, record: '1879-1599-28', win_rate: 54, net_units: -60.1, avg_odds: -108, sample_size: 3506 };
const model = { sample_size: 240, roi: 4.2, roi_low: -7.9, roi_high: 16.3, roi_basis: 'net units / all units risked, push stakes included', push_staked_units: 6, roi_decided: 4.31, record: '130-104-6', win_rate: 55.6, net_units: 10.1, staked_units: 240, avg_odds: -112 };
const chance = { label: 'Chance range (random samples of the same size)', method: 'pool_roi_plus_minus_1.96_se_fpc', sample_size: 240, roi: -1.55, roi_low: -13.2, roi_high: 10.1, record: null, win_rate: null, net_units: null, avg_odds: null };

let v = F.verdictHtml(model, { baseline: base, random_control: chance });
ok('verdict gives the 95% range on the ROI', /95% range on that ROI is -7\.90% to 16\.30%/.test(v), v);
ok('verdict gives the chance range and says inside', /between -13\.20% and 10\.10% 95% of the time, so this result is inside the range luck alone produces/.test(v));
ok('an inside result is not painted as a win', !/verdict-pos/.test(v));
ok('no single random draw is quoted any more', !/random sample of the same picks returned/.test(v));

v = F.verdictHtml({ ...model, roi: 14.8, roi_low: 2.6, roi_high: 27 }, { baseline: base, random_control: chance });
ok('an outside result says so, for a single test', /outside that range for a single test/.test(v) && /verdict-pos/.test(v));

/* old server: one random draw, no ranges. The old wording must still come out. */
v = F.verdictHtml({ sample_size: 60, roi: 4.2 }, { baseline: base, random_control: { roi: 1.1 } });
ok('old server shape keeps the old sentence', /random sample of the same picks returned 1\.10%/.test(v) && /sample is small/.test(v));

const row = F.comparisonRow(chance.label, chance);
ok('chance row shows the range in the ROI column', /-13\.20% to 10\.10%/.test(row) && /Chance range/.test(row));
ok('baseline row still shows one ROI', /-1\.55%/.test(F.comparisonRow(base.label, base)));

ok('ROI tile states the basis and the figure without push stakes', F.roiSub(model) === 'net units / units risked, pushes included (4.31% without push stakes)');
ok('no pushes: basis only', F.roiSub({ ...model, push_staked_units: 0 }) === 'net units / units risked, pushes included');
ok('old server: old label', F.roiSub({ roi: 3 }) === 'return on risk');

const w = F.warningsHtml([{ level: 'note', text: 'x' }, { level: 'error', text: 'y' }]);
ok('note and error warnings carry classes the page styles', /warn-note/.test(w) && /warn-error/.test(w) && /\.warn-note \{/.test(html) && /\.warn-error \{/.test(html));
/* MB_BLP_DATASET_20261113: closing-market tiles (figures are the real NFL 2025 home side) */
const cm = { totals: { games: 285, record: '148-137', over_pct: 51.9, avg_closing_total: 45.12 },
  ats: { games: 285, record: '139-141-5', cover_pct: 49.6 },
  moneyline: { games: 285, roi: -5.72, net_units: -16.3, avg_price: -128 } };
const tiles = F.closingMarketTiles({ closing_market: cm }).join('');
ok('totals tile names the record, the rate, the average line and the count', /O\/U vs closing total/.test(tiles) && /148-137/.test(tiles) && /51\.9% over, avg line 45\.12, 285 games/.test(tiles), tiles.slice(0, 300));
ok('spread tile', /Against the spread/.test(tiles) && /139-141-5/.test(tiles) && /49\.6% covered, 285 games with a closing spread/.test(tiles));
ok('moneyline tile: return, units, basis and average price', /Moneyline return/.test(tiles) && /-5\.72%/.test(tiles) && /-16\.30u on 285 games, 1u each at the closing price \(avg -128\)/.test(tiles) && /neg/.test(tiles));
ok('no side asked for: only the totals tile', F.closingMarketTiles({ closing_market: { totals: cm.totals, ats: null, moneyline: null } }).length === 1);
ok('older server (no closing_market): nothing added', F.closingMarketTiles({}).length === 0);
console.log(`model-builder-chance-range-test: ${n} passed`);
