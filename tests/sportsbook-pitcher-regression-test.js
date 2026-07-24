#!/usr/bin/env node
/**
 * Sportsbook MLB probable-pitcher guard (PITCHER_DATE_FIX_20260723).
 *
 * The all-TBD outage of Jul 23 2026 happened because the lobby board asked ESPN
 * for the *default* MLB scoreboard (no ?dates=), which is always TODAY, while the
 * board itself shows the next UPCOMING slate. Result: most teams missed the map
 * and printed TBD, and teams that played both days got YESTERDAY's starter on
 * TOMORROW's game.
 *
 * This guard locks in every property of the fix so the same class of bug cannot
 * be reintroduced by an edit to sportsbook/index.html.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');

const MARKER = 'PITCHER_DATE_FIX_20260723';
const start = html.indexOf(MARKER);
assert(
  start !== -1,
  'sportsbook/index.html lost the ' + MARKER + ' probable-pitcher block. ' +
    'Do not delete it — it is the only thing populating MLB starters on the board.'
);

const end = html.indexOf('function renderRow(', start);
assert(end !== -1, 'could not find the end of the probable-pitcher block (renderRow)');
const block = html.slice(start, end);

/* ---- 1. Every ESPN request in this block must be date-scoped ------------- */
const espnUrls = block.match(/https:\/\/site\.api\.espn\.com[^'"\s]*/g) || [];
assert(espnUrls.length > 0, 'probable-pitcher block no longer calls the ESPN scoreboard');
espnUrls.forEach((u) => {
  assert(
    /scoreboard\?dates=/.test(u),
    'ESPN scoreboard call in the probable-pitcher block is missing ?dates= (' + u + '). ' +
      'A dateless call returns TODAY, not the slate the board is showing — this is the exact ' +
      'bug that made every game show TBD on Jul 23 2026.'
  );
});

/* ---- 2. The date range must come from the board's own games -------------- */
assert(
  /function _lobbyBoardDateRange\(/.test(block),
  'lost _lobbyBoardDateRange() — the ?dates= range must be derived from the board games'
);
assert(
  /_lobbyBoardDateRange\(games\)/.test(block),
  'the ESPN fetch must use the date range computed from the board games'
);

/* ---- 3. Game date is the America/New_York calendar day ------------------- */
assert(
  /function _lobbyEtDateKey\(/.test(block) && /America\/New_York/.test(block),
  'MLB game dates must be bucketed in America/New_York (a 10:15pm ET first pitch belongs ' +
    'to that ET day). Lost _lobbyEtDateKey()/the America/New_York timezone.'
);

/* ---- 4. Lookup must require team AND date to match ----------------------- */
assert(
  /function _lobbyLookup\(/.test(block),
  'lost _lobbyLookup() — the probables map must not be keyed by team name alone'
);
assert(
  /e\.dateKey !== dateKey/.test(block),
  '_lobbyLookup() no longer requires the ET date to match. Team-name-only matching is what ' +
    'printed the previous day\'s starter on the next day\'s game.'
);
assert(
  /Math\.abs\(\(e\.startMs \|\| 0\) - \(startMs \|\| 0\)\)/.test(block),
  'lost the start-time proximity tiebreak — doubleheaders will pick the wrong game'
);

/* ---- 5. Cache must be scoped to the slate it was fetched for ------------- */
assert(
  /_lobbyMlbProbable\.range === range/.test(block),
  'the probables cache is no longer scoped to the board date range. Without this, a map ' +
    'fetched for a previous slate can be reused on a new one (stale pitcher data).'
);

/* ---- 6. Probables must be re-polled all day ------------------------------ */
assert(
  /function lobbyStartPitcherRefresh\(/.test(block),
  'lost lobbyStartPitcherRefresh() — starters change all day (announcements, scratches)'
);
assert(
  /setInterval\([\s\S]{0,600}?\}, 300000\)/.test(block),
  'the probable-pitcher refresh interval is no longer 5 minutes (300000ms)'
);
assert(
  /\{ force: true \}/.test(block),
  'the refresh must force a re-fetch, otherwise the 5-minute cache swallows it'
);

/* ---- 7. Refresh repaints ONLY the pitcher lines -------------------------- */
assert(
  /function lobbyRepaintPitcherLines\(/.test(block),
  'lost lobbyRepaintPitcherLines() — the refresher must rewrite pitcher text in place, ' +
    'never repaint the row (odds/buttons/selections must not be disturbed)'
);
assert(
  /querySelectorAll\('\.sb-team-pitcher\[data-sb-pitcher-gi\]'\)/.test(block),
  'the repainter must target .sb-team-pitcher[data-sb-pitcher-gi] only'
);
assert(
  /data-sb-pitcher-side="/.test(block) && /data-sb-pitcher-gi="/.test(block),
  'lobbyPitcherHtml() must emit the data-sb-pitcher-side / data-sb-pitcher-gi hooks ' +
    'the refresher retargets'
);

/* ---- 8. TBD only when the source genuinely has no starter ---------------- */
assert(
  /\/\^tbd\$\/i\.test\(nm\.trim\(\)\)/.test(block),
  'ESPN prints a literal "TBD" athlete when no starter is named; that must be skipped ' +
    'rather than stored as a pitcher name'
);
assert(
  /nm \|\| 'TBD'/.test(block) && /nm \? _sbEsc\(nm\) : 'TBD'/.test(block),
  'the rendered fallback for a missing starter must be TBD'
);

/* ---- 9. Cache-restore path must re-enrich its OWN games ------------------ */
assert(
  /_lobbyBoardGames\[cacheKey\] = games/.test(html),
  'lost _lobbyBoardGames[cacheKey] — a restored board must re-enrich the games it was ' +
    'built from, not window.TMR.currentGames (which may hold another sport)'
);
const restoreCalls = (html.match(/lobbyStartPitcherRefresh\(/g) || []).length;
assert(
  restoreCalls >= 3,
  'lobbyStartPitcherRefresh() must be wired on both the cached-board restore path and the ' +
    'fresh-render path (found ' + restoreCalls + ' references, expected >= 3)'
);
assert(
  /v5mlbpitcherdate/.test(html),
  'the board HTML cache key must be busted past the pre-fix version (v5mlbpitcherdate)'
);

/* ---- 10. Enrichment must never block the board -------------------------- */
assert(
  /var finish = function \(\) \{ if \(finished\) return; finished = true; if \(done\) done\(\); \}/.test(block),
  'lobbyEnsureMlbPitchers() must always call done() (fail-open) so a pitcher lookup ' +
    'failure can never stop odds from rendering'
);

console.log('Sportsbook probable-pitcher guard: PASS (' + espnUrls.length + ' date-scoped ESPN call(s) checked)');
