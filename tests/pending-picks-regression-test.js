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

const start = html.indexOf('function fmtBareLine');
const end = html.indexOf('function statusText', start);
assert(start !== -1 && end !== -1, 'pending formatter function block must be extractable');
const formatterSource = html.slice(start, end) + '\n({ fmtBareLine, fmtLine, fmtPickLine, pickText });';
const formatters = vm.runInNewContext(formatterSource, {});

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
    pickText: 'Carolina Hurricanes at Philadelphia Flyers Full Game Total Under 5.5',
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
  assert.strictEqual(formatters.fmtPickLine(testCase.pick), testCase.line, `${testCase.name} line`);
  assert.strictEqual(formatters.pickText(testCase.pick), testCase.pickText, `${testCase.name} pick text`);
}

assert(rules.includes('Pending Picks Display Rules'), 'DEVELOPMENT_RULES must include Pending Picks Display Rules');
assert(rules.includes('Totals and team totals must never show a plus sign in the Line column.'), 'pending rules must forbid plus signs');
assert(rules.includes('Totals and team totals must never show U or O in the Line column.'), 'pending rules must forbid U/O in line');
assert(rules.includes('Full game totals must not display as only'), 'pending rules must require explicit full-game total labels');
assert(rules.includes('Summary pending count must match API count and rendered row count.'), 'pending rules must protect count parity');

const shareStart = profile.indexOf('let shareActions =');
const ownerGate = profile.indexOf('if (isOwnProfile)', shareStart);
const actionsEnd = profile.indexOf("const actions = '<div class=\"profile-actions\">'", shareStart);
const pendingShareCall = profile.indexOf('copyPendingPicksLink()', shareStart);
const pendingEmbedCall = profile.indexOf("showEmbedModal(\\'pending\\')", shareStart);
assert(shareStart !== -1 && ownerGate !== -1 && actionsEnd !== -1, 'profile share action block must be extractable');
assert(pendingShareCall > ownerGate && pendingShareCall < actionsEnd, 'profile pending share button must stay behind owner gate');
assert(pendingEmbedCall > ownerGate && pendingEmbedCall < actionsEnd, 'profile pending embed button must stay behind owner gate');
assert(
  /function\s+getPendingPicksAccess\(kind\)\s*\{[\s\S]*if\s*\(!isOwnProfile\)\s*\{[\s\S]*enabled:\s*false[\s\S]*Pending picks are private for public profile views\./.test(profile),
  'profile pending access helper must deny public/non-owner profile views'
);
assert(
  !/const\s+shareActions\s*=[\s\S]{0,800}copyPendingPicksLink\(\)/.test(profile),
  'profile public share action block must not include pending-pick sharing before owner gate'
);

console.log('pending picks regression test passed');
