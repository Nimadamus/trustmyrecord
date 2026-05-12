#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const criticalRoutes = [
  ['/', 'index.html'],
  ['/sportsbook/', 'sportsbook/index.html'],
  ['/my-pending-picks/', 'my-pending-picks/index.html'],
  ['/profile/', 'profile/index.html'],
  ['/model-builder/', 'model-builder/index.html'],
  ['/trendspotter/', 'trendspotter/index.html'],
  ['/arena/', 'arena/index.html'],
  ['/forum/', 'forum/index.html'],
  ['/login/', 'login/index.html'],
];

for (const [route, file] of criticalRoutes) {
  const fullPath = path.join(root, file);
  assert(fs.existsSync(fullPath), `${route} must map to ${file}`);
  const html = read(file);
  assert(html.length > 300, `${route} source should not be blank`);
  assert(!/\blorem ipsum\b|preview version/i.test(visibleText(html)), `${route} must not expose placeholder copy`);
}

const sportsbook = read('sportsbook/index.html');
const reliability = read('static/js/sportsbook-production-fix-persist-reliability.js');
const sitewide = read('static/js/tmr-sitewide.js');
const feedCleanup = fs.existsSync(path.join(root, 'static/js/feed-cleanup.js')) ? read('static/js/feed-cleanup.js') : '';

[
  'id="gamesListContainer"',
  'id="lobbyBoardRows"',
  'id="pickDetails"',
  'id="pickOddsInput"',
  'id="unitsInput"',
  'id="unitsStakePreview"',
  'data-sportsbook-tab="sport"',
  'Click here to view pending picks',
  'href="/my-pending-picks/"',
].forEach((needle) => {
  assert(sportsbook.includes(needle), `sportsbook must keep ${needle}`);
});

assert(!visibleText(sportsbook).includes('My Pick History'), 'sportsbook must not show old My Pick History link text');
assert(/<input[^>]+id="pickOddsInput"[^>]+readonly/i.test(sportsbook), 'odds input markup must stay read-only');
assert(
  reliability.includes("oddsInput.readOnly = true") &&
    reliability.includes("oddsInput.setAttribute('readonly', 'readonly')") &&
    reliability.includes("oddsInput.setAttribute('aria-readonly', 'true')"),
  'odds input runtime must enforce read-only'
);
assert(reliability.includes('function renderBoardOptionButton'), 'sportsbook must keep locked board option renderer');
assert(reliability.includes('class="tmr-option-btn"'), 'sportsbook wager buttons must keep .tmr-option-btn selector');
assert(reliability.includes('window.TMR.calculateStakeValues'), 'sportsbook must keep risk/to win math owner');
assert(reliability.includes('window.TMR.updateStakeModePreview'), 'sportsbook must keep immediate stake preview updater');
assert(reliability.includes("lockFunction(window, 'tmrSelectOption'"), 'pick selection handler must remain locked');
assert(reliability.includes("lockFunction(window, 'setUnitsMode'"), 'stake mode handler must remain locked');
assert(reliability.includes("if (sportKey === 'baseball_mlb' || sportKey === 'icehockey_nhl')"), 'alternate totals must stay limited to supported sports');
assert(!/player props|props board|prop market/i.test(visibleText(sportsbook)), 'unsupported props must not appear in visible sportsbook copy');

if (feedCleanup) {
  assert(feedCleanup.includes('data-type="feed_post"'), 'article/text feed posts must keep feed_post data-type');
  assert(feedCleanup.includes('data-type="pick_activity"'), 'pick activity cards must keep pick_activity data-type');
  assert(feedCleanup.includes('post_type') && feedCleanup.includes('article'), 'article composer must stay separate from pick activity rendering');
  assert(!/data-type="pick_activity"[\s\S]{0,220}article/i.test(feedCleanup), 'article preview cards must not render as pick activity cards');
}

[
  ['/sportsbook/', 'Make Picks'],
  ['/profile/', 'Profile'],
  ['/arena/', 'Arena'],
  ['/forum/', 'Forum'],
  ['/login/', 'Log In'],
].forEach(([href, label]) => {
  assert(sitewide.includes(href), `global navigation/footer must include ${href}`);
  assert(sitewide.includes(label), `global navigation/footer must include ${label}`);
});

console.log('critical DOM/content lock test passed');
