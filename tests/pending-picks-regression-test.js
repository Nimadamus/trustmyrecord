#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'my-pending-picks', 'index.html'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'profile', 'index.html'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'DEVELOPMENT_RULES.md'), 'utf8');

assert(html.includes('PENDING_PICK_TOTAL_LINE_NUMERIC_ONLY_20260507'), 'pending page must keep numeric-only total line marker');
assert(html.includes('PENDING_PICK_RENDER_COUNT_FIX_20260507'), 'pending page must keep API/render count guard marker');
assert(html.includes('Full Game Total'), 'pending page formatter must label full-game totals clearly');
assert(html.includes('Team Total'), 'pending page formatter must label team totals clearly');
assert(!/side\s*\?\s*side\s*\+\s*['"]\s['"]\s*\+\s*line/.test(html), 'Line column formatter must not prefix totals with U/O');

const sportStart = html.indexOf('function sportLabel');
const sportEnd = html.indexOf('function marketLabel', sportStart);
assert(sportStart !== -1 && sportEnd !== -1, 'pending sport label formatter must be extractable');
const sportLabel = vm.runInNewContext(html.slice(sportStart, sportEnd) + '\nsportLabel;', { window: {} });
assert.strictEqual(sportLabel('baseball_mlb'), 'MLB', 'pending league label for MLB');
assert.strictEqual(sportLabel('icehockey_nhl'), 'NHL', 'pending league label for NHL');
assert.strictEqual(sportLabel('basketball_nba'), 'NBA', 'pending league label for NBA');
assert.strictEqual(sportLabel('americanfootball_nfl'), 'NFL', 'pending league label for NFL');
assert.strictEqual(sportLabel('americanfootball_ncaaf'), 'College Football', 'pending league label for college football');
assert.strictEqual(sportLabel('basketball_ncaab'), 'College Basketball', 'pending league label for college basketball');
assert.notStrictEqual(sportLabel('baseball_mlb'), 'Baseball Mlb', 'pending league label must not combine category and league');

/* Rewritten 2026-08-16 to test the SINGLE SOURCE, not a dead anchor.
   fmtBareLine() no longer exists (folded into fmtPickLine), so the old
   extraction silently stopped running. More importantly the page's own
   formatters delegate to window.TMR.* from static/js/backend-api.js -- that is
   what actually renders for a user -- and the local blocks are only a degraded
   fallback. This loads the real module and asserts the display rules against
   it, then separately asserts the fallback obeys the Line-column rule. */
const backendApi = fs.readFileSync(path.join(root, 'static', 'js', 'backend-api.js'), 'utf8');
const apiSandbox = {
  console, Number, String, Math, JSON, RegExp, Date, parseFloat, parseInt, isNaN, setTimeout,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
  location: { href: '', search: '', pathname: '/' },
  navigator: { userAgent: '' },
  fetch: () => Promise.reject(new Error('offline')),
};
apiSandbox.window = apiSandbox;
try { vm.runInNewContext(backendApi, apiSandbox); } catch (e) { /* CONFIG-dependent tail is not needed */ }
const TMR = apiSandbox.window.TMR || {};
assert(typeof TMR.formatPickLine === 'function', 'shared TMR.formatPickLine must exist');
assert(typeof TMR.formatPickDisplay === 'function', 'shared TMR.formatPickDisplay must exist');

const cases = [
  {
    name: 'Yankees team total under',
    pick: { market_type: 'team_totals', selection: 'New York Yankees Under 4.5', line_snapshot: 4.5, odds_snapshot: -145 },
    line: '4.5',
    pickText: 'New York Yankees Team Total Under 4.5',
  },
  {
    name: 'Reds team total under',
    pick: { market_type: 'team_totals', selection: 'Cincinnati Reds Team Total Under 3.5', line_snapshot: 3.5, odds_snapshot: -140 },
    line: '3.5',
    pickText: 'Cincinnati Reds Team Total Under 3.5',
  },
  {
    name: 'Flyers team total under',
    pick: { market_type: 'team_totals', selection: 'Philadelphia Flyers Under 2.5', line_snapshot: 2.5, odds_snapshot: -142 },
    line: '2.5',
    pickText: 'Philadelphia Flyers Team Total Under 2.5',
  },
  {
    name: 'full game total under',
    pick: { market_type: 'totals', selection: 'Under 5.5', line_snapshot: 5.5, odds_snapshot: -141, away_team: 'Carolina Hurricanes', home_team: 'Philadelphia Flyers' },
    line: '5.5',
    pickText: 'Carolina Hurricanes @ Philadelphia Flyers Under 5.5',
  },
  {
    name: 'moneyline',
    pick: { market_type: 'h2h', selection: 'New York Mets ML', line_snapshot: null, odds_snapshot: 130 },
    line: '-',
    pickText: 'New York Mets ML',
  },
  {
    name: 'spread',
    pick: { market_type: 'spreads', selection: 'New York Mets', line_snapshot: 1.5, odds_snapshot: -120 },
    line: '+1.5',
    pickText: 'New York Mets +1.5',
  },
];

for (const testCase of cases) {
  assert.strictEqual(TMR.formatPickLine(testCase.pick), testCase.line, `${testCase.name} line`);
  assert.strictEqual(TMR.formatPickDisplay(testCase.pick), testCase.pickText, `${testCase.name} pick text`);
  assert(!/^[OU]\s/.test(TMR.formatPickLine(testCase.pick)), `${testCase.name} line must not carry an O/U prefix`);
}

// A team total must name itself; a full-game total must never render as a bare side.
assert(/Team Total/.test(TMR.formatPickDisplay(cases[0].pick)), 'team totals must be labelled Team Total');
assert(!/^(Over|Under)/.test(TMR.formatPickDisplay(cases[3].pick)), 'a full-game total must not render as only Over/Under');

/* The page-local fallback (used only if backend-api.js is blocked) must obey
   the same Line-column rule: number only, no sign, no O/U prefix. */
const fbStart = html.indexOf('function fmtOdds');
const fbEnd = html.indexOf('function statusText', fbStart);
assert(fbStart !== -1 && fbEnd !== -1, 'pending formatter fallback block must be extractable');
const fallback = vm.runInNewContext(
  html.slice(fbStart, fbEnd) + '\n({ fmtLine, fmtPickLine, pickText });',
  { window: {} }
);
assert.strictEqual(fallback.fmtPickLine(cases[0].pick), '4.5', 'fallback team-total line is the bare number');
assert.strictEqual(fallback.fmtPickLine(cases[3].pick), '5.5', 'fallback full-game-total line is the bare number');
assert.strictEqual(fallback.fmtPickLine(cases[5].pick), '+1.5', 'fallback keeps the spread sign');
assert.strictEqual(fallback.fmtPickLine(cases[4].pick), '-', 'fallback shows no line for a moneyline');

assert(rules.includes('Pending Picks Display Rules'), 'DEVELOPMENT_RULES must include Pending Picks Display Rules');
assert(rules.includes('Totals and team totals must never show a plus sign in the Line column.'), 'pending rules must forbid plus signs');
assert(rules.includes('Totals and team totals must never show U or O in the Line column.'), 'pending rules must forbid U/O in line');
assert(rules.includes('Full game totals must not display as only'), 'pending rules must require explicit full-game total labels');
assert(rules.includes('Summary pending count must match API count and rendered row count.'), 'pending rules must protect count parity');

/* Rewritten 2026-08-16. These assertions gated pending-pick Share/Embed
   buttons behind isOwnProfile. Those entry points no longer exist on the
   profile at all (no copyPendingPicksLink(), no showEmbedModal('pending'), no
   getPendingPicksAccess helper), which satisfies the privacy rule more strongly
   than a gate does. The rule is now asserted as absence, plus the surviving
   owner-only Share gate. Backend-side pending privacy stays covered by
   trustmyrecord-backend/tests/profile-privacy-unit-test.js. */
assert(!/copyPendingPicksLink\(\)/.test(profile), 'profile must expose no pending-pick share link');
assert(!/showEmbedModal\(\s*['"]pending['"]\s*\)/.test(profile), 'profile must expose no pending-pick embed entry point');

const shareStart = profile.indexOf('const shareActions =');
const actionsEnd = profile.indexOf("const actions = '<div class=\"profile-actions\">'", shareStart);
assert(shareStart !== -1 && actionsEnd !== -1, 'profile share action block must be extractable');
const shareBlock = profile.slice(shareStart, actionsEnd);
assert(/isOwnProfile/.test(shareBlock), 'profile share button must stay behind the owner gate');
assert(/openShareModal\(\)/.test(shareBlock), 'owner share entry point must remain');
assert(profile.includes('PROFILE_SHARE_OWNER_ONLY_20260722'), 'owner-only share marker must remain documented');

console.log('pending picks regression test passed');
