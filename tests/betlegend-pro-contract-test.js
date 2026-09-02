#!/usr/bin/env node
/**
 * BetLegend Pro shipped-contract lock.
 *
 * Static assertions over the files that actually ship, for the properties that
 * cost real money or real trust when they regress and that nothing else in CI
 * would notice. No browser, no network -- so it runs in `npm run test:ci` on
 * every push rather than in a suite somebody remembers to trigger.
 *
 * Each block names the incident it exists to prevent.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'betlegend-pro', 'app', 'index.html');
const CSS = path.join(ROOT, 'betlegend-pro', 'app', 'console.css');
const SALES = path.join(ROOT, 'betlegend-pro', 'index.html');
const SW = path.join(ROOT, 'betlegend-pro', 'sw.js');
const MANIFEST = path.join(ROOT, 'betlegend-pro', 'manifest.webmanifest');
const HOME = path.join(ROOT, 'index.html');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok   ${name}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const app = read(APP);
const css = read(CSS);
const sales = read(SALES);
const home = read(HOME);

console.log('\nFavourite column reads the number that decided the role');
// It rendered "New York Yankees +1.5" on a game the Yankees were -148 to win.
// `role` comes from the spread in NFL/NBA and from the MONEYLINE in MLB/NHL,
// where the line is a fixed +/-1.5; pairing role with the spread on those two
// sports is a cell that contradicts itself.
check('MLB and NHL are declared fixed-line sports',
  /FIXED_LINE_SPORTS\s*=\s*\{\s*MLB:\s*1,\s*NHL:\s*1\s*\}/.test(app));
check('the favourite cell branches on that set',
  /FIXED_LINE_SPORTS\[d\.sport\]/.test(app));
check('the fixed-line branch reads a moneyline, never closing_line',
  /FIXED_LINE_SPORTS\[d\.sport\][\s\S]{0,400}?g\.opponent_moneyline/.test(app));

console.log('\nResults table is sortable, and says sorting changes nothing else');
// "Sortable results" is a stated product requirement, and a table that
// reorders itself is otherwise indistinguishable from one that re-filtered.
check('sortable headers are emitted', /class="th-sort"/.test(app));
check('aria-sort is maintained', /aria-sort/.test(app) && /aria-sort/.test(css));
check('a keyboard can sort', /ev\.key !== 'Enter'[\s\S]{0,300}th\.th-sort[\s\S]{0,300}sortTableBy\(th\)/.test(app));
check('numeric columns sort on data-k, not on their text', /data-k=/.test(app));
check('the caption states that sorting does not re-query',
  /records and averages above always cover every qualifying meeting/.test(app));

console.log('\nEvery filter offered is one the sport can answer');
// The Team Trends dropdown was one hardcoded list for all four sports, so MLB
// was offered "Large spread (7+)" (matches nothing on a fixed +/-1.5 run line)
// and "Close spread (within 3)" (matches every game, and reads as a finding).
check('the situation list is loaded from the engine catalogue',
  /betlegend-pro\/situations\//.test(app));
check('unsupported options are disabled rather than removed',
  /s\.supported \? '' : ' disabled'/.test(app));
check('a catalogue failure leaves the control usable',
  /A catalogue failure must never empty the control/.test(app));

console.log('\nSimulator reports ROI and bankroll growth as two numbers');
// The tile read "Expected ROI - return on total amount staked" and carried
// (final - start) / start. At the defaults that is +10.7% where the ROI a
// record is judged on is +5.0%.
check('bankroll growth has its own tile', /'Bankroll growth'/.test(app));
check('ROI per unit staked has its own tile', /'ROI per \$ staked'/.test(app));
check('the old mislabel is gone', !/Return on total amount staked/.test(app));
check('the staking line states the fraction', /of the running bankroll/.test(app));

console.log('\nPWA installs as BetLegend Pro and cannot touch the rest of the site');
const manifest = JSON.parse(read(MANIFEST));
const sw = read(SW);
check('app name is exactly "BetLegend Pro"', manifest.name === 'BetLegend Pro',
  `got ${JSON.stringify(manifest.name)}`);
check('scope is confined to /betlegend-pro/', manifest.scope === '/betlegend-pro/',
  `got ${JSON.stringify(manifest.scope)}`);
check('start_url is inside the scope', String(manifest.start_url).startsWith(manifest.scope));
check('display is standalone', manifest.display === 'standalone');
check('theme and background colours are set',
  Boolean(manifest.theme_color && manifest.background_color));
check('a maskable icon is provided',
  manifest.icons.some((i) => String(i.purpose || '').includes('maskable')));
for (const icon of manifest.icons) {
  const file = path.join(ROOT, icon.src.replace(/^\//, ''));
  check(`icon ships: ${icon.src}`, fs.existsSync(file));
}
check('apple touch icon ships',
  fs.existsSync(path.join(ROOT, 'betlegend-pro', 'app', 'apple-touch-icon.png')));
check('offline fallback ships',
  fs.existsSync(path.join(ROOT, 'betlegend-pro', 'app', 'offline.html')));
check('the worker lives at /betlegend-pro/ so its scope cannot widen',
  fs.existsSync(SW));
check('the worker declares that scope', /SCOPE_PATH = '\/betlegend-pro\/'/.test(sw));
check('the worker never handles another origin',
  /url\.origin !== self\.location\.origin\) return;/.test(sw));
check('HTML is network-first, so a build is never pinned', /request\.mode === 'navigate'/.test(sw)
  && /fetch\(request\)[\s\S]{0,900}caches\.match\(OFFLINE_URL\)/.test(sw));
check('the worker carries its own kill switch', /KILL SWITCH/.test(sw));
check('the page registers the worker with an explicit scope',
  /register\('\/betlegend-pro\/sw\.js', \{ scope: '\/betlegend-pro\/' \}\)/.test(app));
check('install is offered, never forced',
  /beforeinstallprompt/.test(app) && /ev\.preventDefault\(\)/.test(app));

console.log('\nThe app page still declares itself, and the sales page still sells');
check('the app is noindex (private, per-account)', /name="robots" content="noindex/.test(app));
check('the sales page is NOT noindex', !/name="robots"[^>]*noindex/.test(sales));
check('the manifest is linked from the app', /rel="manifest"/.test(app));
check('console.css carries a version string',
  /console\.css\?v=[0-9a-z-]+/.test(app));

console.log('\nHomepage does not claim the paid product is free');
check('the tools card names BetLegend Pro', /Free tools \+ BetLegend Pro/.test(home));
check('the retired "Free, no account needed" claim is gone',
  !/Tools &amp; Simulators<\/h5><\/span><span class="badge2"><span class="bl"><\/span>Free, no account needed/.test(home));

console.log('\nNothing here paywalls the free tools');
// The free simulators and Trend Spotter are a separate product promise.
check('the service worker claims no scope over /tools/ or the simulators',
  !/\/tools\//.test(sw) && !/simulator/i.test(sw));
check('the manifest scope excludes the free tools',
  !String(manifest.scope).startsWith('/tools') && manifest.scope === '/betlegend-pro/');

console.log('\nThe period placeholder never reaches the engine');
// Sentry, 2026-09-02: ValueError int('__loading') on /api/matchup/preview.
// While the seasons on file are being read the period select holds a
// "__loading" option; currentPayload() sent it as `season`, the engine met
// it in int(), and every free sample preview during that window was a 500.
check('the placeholder is declared once, by name', /var PERIOD_LOADING = '__loading';/.test(app));
check('no other literal spelling of the placeholder survives',
  (app.match(/'__loading'/g) || []).length === 1);
check('a season travels only as four digits',
  /else if \(SEASON_RE\.test\(tf\)\) \{[\s\S]{0,700}body\.season = tf;/.test(app));
check('the preview waits for the period control',
  /function trailReady\(\)[\s\S]{0,300}periodReady\(\)/.test(app));
check('the report submit waits for the period control',
  /bothPicked && !periodReady\(\)\) err = /.test(app));

// The shipped functions, run against a stand-in period control.
function lift(name) {
  const m = app.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}`));
  if (!m) throw new Error(`${name} not found in the app`);
  return m[0];
}
function harness(tf, disabled, from, to) {
  const el = (value) => ({ value });
  const ctx = {
    mTimeframe: { value: tf, disabled: !!disabled },
    mSport: el('MLB'), mAway: el('New York Yankees'), mHome: el('Boston Red Sox'),
    mVenue: el('away'), mLimit: el('20'), mDateFrom: el(from || ''), mDateTo: el(to || ''),
    filterPayload: () => ({}), teamTotalPayload: () => null,
  };
  const src = `var PERIOD_LOADING = '__loading'; var SEASON_RE = /^\\d{4}$/;\n`
    + `${lift('periodReady')}\n${lift('customRangeReady')}\n${lift('trailReady')}\n${lift('currentPayload')}\n`
    + 'return { periodReady, trailReady, currentPayload };';
  return new Function(...Object.keys(ctx), src)(...Object.values(ctx));
}
for (const bad of ['__loading', '', 'null', 'undefined', 'abc', 'NaN', '20x4', 'Reading available seasons…']) {
  const h = harness(bad);
  check(`"${bad}" is never sent as a season`, !('season' in h.currentPayload()));
  check(`"${bad}" holds the preview`, h.trailReady() === false);
}
check('a disabled period control holds the preview', harness('2019', true).trailReady() === false);
check('a real season travels and runs',
  harness('2019').currentPayload().season === '2019' && harness('2019').trailReady() === true);
check('all history sends no season and runs',
  !('season' in harness('all').currentPayload()) && harness('all').trailReady() === true);
check('a custom range with dates in order sends no season and runs',
  !('season' in harness('custom', false, '2022-04-01', '2022-10-31').currentPayload())
  && harness('custom', false, '2022-04-01', '2022-10-31').trailReady() === true);
check('a custom range with one date runs', harness('custom', false, '2022-04-01', '').trailReady() === true);
check('an inverted custom range holds the preview', harness('custom', false, '2022-09-01', '2022-04-01').trailReady() === false);
check('an empty custom range holds the preview', harness('custom').trailReady() === false);

if (failures) {
  console.error(`\n${failures} BetLegend Pro contract check(s) failed.\n`);
  process.exit(1);
}
console.log('\nAll BetLegend Pro contract checks passed.\n');
