#!/usr/bin/env node
/**
 * LIVE audit of https://trustmyrecord.com/leaderboards/ -- the whole board
 * pipeline, driven through the real page against the real API.
 *
 * LEADERBOARD_SPORT_FILTER_20260823. Selecting a sport emptied this board for
 * months: the page fetched one unscoped leaderboard and filtered it in the
 * browser against a `sport` field the API has never returned, so every sport
 * rendered zero rows under a hero card reading 46 handicapping records. Three
 * static guards in tests/leaderboards-page-visual-regression-test.js stop the
 * exact code from coming back. This file is the behavioural half: it proves the
 * board still answers correctly against live data.
 *
 * Deliberately NOT in test:ci. It needs the production site and the production
 * API, and it burns Actions minutes on a schedule nothing here controls. Run it
 * on demand after any leaderboard, eligibility or streak change:
 *
 *     node tests/leaderboards-live-audit.cjs
 *     SHOT=/tmp/board.png node tests/leaderboards-live-audit.cjs
 *
 * Every assertion cross-checks the rendered table against the API's own answer
 * for that scope. HTTP 200 and "rows appeared" is not evidence: the record, the
 * units, the ROI, the win rate, the pick count, the streak and the rank in the
 * table all have to equal the numbers the query computed.
 */
const { chromium } = require('playwright');

const PAGE = 'https://trustmyrecord.com/leaderboards/';
const API = 'https://trustmyrecord-api.onrender.com/api';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

const apiStatuses = [];
async function api(path) {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(API + path);
    lastStatus = r.status;
    apiStatuses.push(path + ' ' + r.status);
    if (r.ok) return r.json();
    await new Promise((res) => setTimeout(res, 1200 * attempt));
  }
  throw new Error(path + ' -> ' + lastStatus);
}

async function readBoard(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#leaderboardBody tr')).map((tr) => {
      const cells = Array.from(tr.querySelectorAll('td')).map((td) => td.textContent.trim());
      const nameEl = tr.querySelector('.person-name');
      const subEl = tr.querySelector('.person-sub');
      return {
        rank: cells[0], username: nameEl ? nameEl.textContent.trim() : '',
        sub: subEl ? subEl.textContent.trim() : '',
        record: cells[2], roi: cells[3], units: cells[4], winRate: cells[5], picks: cells[6],
      };
    });
    const wrap = document.getElementById('leaderboardWrap');
    const state = document.getElementById('leaderboardState');
    return {
      rows,
      visible: !!wrap && wrap.style.display !== 'none',
      chip: (document.getElementById('resultCount') || {}).textContent || '',
      hero: (document.getElementById('qsHandicappers') || {}).textContent || '',
      tabCount: (document.getElementById('tabCountHandicappers') || {}).textContent || '',
      emptyTitle: state && state.style.display !== 'none' ? (state.querySelector('h3') || {}).textContent || '' : '',
      emptyBody: state && state.style.display !== 'none' ? (state.querySelector('p') || {}).textContent || '' : '',
      sportOptions: Array.from(document.querySelectorAll('#sportFilter option')).map((o) => o.value + '|' + o.textContent.trim()),
      streakRail: Array.from(document.querySelectorAll('#streakRail .rail-item')).map((a) => a.textContent.trim()),
      streakScope: (document.getElementById('streakRailScope') || {}).textContent || '',
      filtersFoot: (document.getElementById('filtersFoot') || {}).textContent || '',
      sampleOptions: Array.from(document.querySelectorAll('#sampleFilter option')).map((o) => o.value),
      volumeScope: (document.getElementById('volumeRailScope') || {}).textContent || '',
      volumeRail: Array.from(document.querySelectorAll('#volumeRail .rail-item')).map((a) => a.textContent.trim()),
    };
  });
}

// Wait for a board paint that matches `want`, so an assertion can never read a
// half-applied filter. Returns the board state.
async function settle(page, want, timeout = 20000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await readBoard(page);
    if (!want || want(last)) return last;
    await page.waitForTimeout(250);
  }
  return last;
}

async function setFilters(page, { sport, sort, minPicks, search }) {
  if (sport !== undefined) await page.selectOption('#sportFilter', sport);
  if (minPicks !== undefined) await page.selectOption('#sampleFilter', minPicks);
  if (sort !== undefined) await page.selectOption('#sortFilter', sort);
  if (search !== undefined) await page.fill('#capperSearch', search);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  // Wait for HYDRATION, not just for rows. The page ships a prerendered table
  // (scripts/prerender_directory.py bakes it so the board is crawlable and
  // paints instantly), so "some rows exist" is true before any live data has
  // landed. Reading then compares the bake against the API and reports a
  // difference that is only a moment old. `tmr-lw-lb` is the page's own
  // live-wait gate, dropped on first live paint; the sport catalog arrives on
  // its own request, so wait for a counted option too.
  await page.waitForFunction(() => window.api && document.getElementById('sportFilter'), null, { timeout: 30000 });
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('tmr-lw-lb')
      && /\(\d+\)/.test(document.getElementById('sportFilter').textContent || ''),
    null, { timeout: 30000 });

  // ---- 1. default board -----------------------------------------------------
  console.log('\n[1] Default board (All sports, 5 picks, Net units)');
  const apiAll = await api('/users/leaderboard?sortBy=net_units&limit=100&minPicks=5');
  let b = await settle(page, (s) => s.rows.length > 0);
  check('default board renders rows', b.rows.length > 0, 'rows=' + b.rows.length);
  check('default row count equals API', b.rows.length === apiAll.leaderboard.length, b.rows.length + ' vs ' + apiAll.leaderboard.length);
  check('hero total is the platform total', b.hero === String(apiAll.total_eligible_handicappers), b.hero);
  check('tab badge agrees with hero', b.tabCount === b.hero, b.tabCount + ' vs ' + b.hero);
  check('no console errors on load', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  // ---- 2. sport dropdown is data-driven -------------------------------------
  console.log('\n[2] Sport dropdown is data-driven');
  const apiSports = await api('/users/leaderboard/sports?minPicks=5');
  const optValues = b.sportOptions.map((o) => o.split('|')[0]);
  check('options come from the API catalog',
    apiSports.sports.every((s) => optValues.includes(s.id)),
    optValues.join(','));
  check('dead options (NCAAB / NCAAF / UFC) are gone',
    !optValues.includes('ncaab') && !optValues.includes('ncaaf') && !optValues.includes('mma'),
    optValues.join(','));
  check('sports with live records are offered (tennis, wnba)',
    optValues.includes('tennis') && optValues.includes('wnba'), optValues.join(','));
  const mlbOpt = b.sportOptions.find((o) => o.startsWith('mlb|'));
  const mlbSport = apiSports.sports.find((s) => s.id === 'mlb');
  check('option label carries the real ranked count',
    !!mlbOpt && mlbOpt.includes('(' + mlbSport.ranked_cappers + ')'), mlbOpt);

  // ---- 3. THE REPORTED FAILURE: MLB + 5 picks -------------------------------
  console.log('\n[3] MLB + 5 picks (the exact reported failure)');
  await setFilters(page, { sport: 'mlb', minPicks: '5' });
  const apiMlb = await api('/users/leaderboard?sortBy=net_units&limit=100&minPicks=5&sport=mlb');
  b = await settle(page, (s) => s.rows.length === apiMlb.leaderboard.length && s.rows.length > 0 && s.rows.every((r) => r.sub.includes('MLB')));
  check('MLB board is NOT empty', b.rows.length > 0, 'rows=' + b.rows.length);
  check('MLB row count equals API', b.rows.length === apiMlb.leaderboard.length, b.rows.length + ' vs ' + apiMlb.leaderboard.length);
  check('chip uses the MLB denominator, not the platform 46',
    b.chip === b.rows.length + ' of ' + apiMlb.scope_eligible_handicappers + ' cappers match your filters', b.chip);
  check('rows are labelled MLB', b.rows.every((r) => r.sub.includes('MLB')), b.rows[0] && b.rows[0].sub);
  check('empty state is not showing', b.emptyTitle === '', b.emptyTitle);

  // Every printed statistic equals the API's MLB-scoped aggregate.
  const statMismatch = [];
  apiMlb.leaderboard.forEach((row, i) => {
    const ui = b.rows[i];
    if (!ui) { statMismatch.push('missing row ' + i); return; }
    const record = row.wins + '-' + row.losses + (row.pushes ? '-' + row.pushes : '');
    const shownName = row.display_name || row.username;
    if (ui.username !== shownName) statMismatch.push(i + ' name ' + ui.username + '/' + shownName);
    if (ui.record !== record) statMismatch.push(i + ' record ' + ui.record + '/' + record);
    if (ui.picks !== String(row.total_picks)) statMismatch.push(i + ' picks ' + ui.picks + '/' + row.total_picks);
    const units = (row.net_units > 0 ? '+' : '') + row.net_units.toFixed(2) + 'u';
    if (ui.units !== units) statMismatch.push(i + ' units ' + ui.units + '/' + units);
    const roi = (row.roi > 0 ? '+' : '') + row.roi.toFixed(2) + '%';
    if (ui.roi !== roi) statMismatch.push(i + ' roi ' + ui.roi + '/' + roi);
    const wr = row.win_rate.toFixed(1) + '%';
    if (ui.winRate !== wr) statMismatch.push(i + ' win% ' + ui.winRate + '/' + wr);
    const streak = row.current_streak > 0 ? 'W' + row.current_streak
      : row.current_streak < 0 ? 'L' + Math.abs(row.current_streak) : '0';
    if (!ui.sub.includes('streak ' + streak)) statMismatch.push(i + ' streak ' + ui.sub + '/' + streak);
    if (ui.rank !== '#' + (i + 1)) statMismatch.push(i + ' rank ' + ui.rank);
  });
  check('every MLB stat (record, ROI, units, win%, picks, streak, rank) matches the API',
    statMismatch.length === 0, statMismatch.slice(0, 5).join(' | '));

  // The MLB numbers must actually differ from the overall ones, or the board is
  // still showing overall stats under an MLB label.
  const overallMM = apiAll.leaderboard.find((r) => r.username === 'MoneyMakers');
  const mlbMM = apiMlb.leaderboard.find((r) => r.username === 'MoneyMakers');
  check('MLB stats are sport-specific, not overall stats relabelled',
    !!overallMM && !!mlbMM && (overallMM.wins !== mlbMM.wins || overallMM.net_units !== mlbMM.net_units),
    overallMM && mlbMM ? `overall ${overallMM.wins}-${overallMM.losses} vs MLB ${mlbMM.wins}-${mlbMM.losses}` : 'user not found');
  // Scoping is proven across the whole overlapping set, not one account: a
  // single capper's overall and MLB streaks can legitimately coincide when his
  // most recent graded picks are all MLB, and asserting on him alone turns a
  // correct system into a red run on a quiet day.
  const streakPairs = apiMlb.leaderboard.map((m) => {
    const overallRow = apiAll.leaderboard.find((o) => o.username === m.username);
    return overallRow ? { u: m.username, overall: overallRow.current_streak, mlb: m.current_streak } : null;
  }).filter(Boolean);
  const streakDiffs = streakPairs.filter((p) => p.overall !== p.mlb);
  const statDiffs = apiMlb.leaderboard.filter((m) => {
    const o = apiAll.leaderboard.find((x) => x.username === m.username);
    return o && (o.wins !== m.wins || o.net_units !== m.net_units || o.total_picks !== m.total_picks);
  });
  check('MLB records are scoped, not the overall records relabelled',
    statDiffs.length > 0, statDiffs.length + ' of ' + apiMlb.leaderboard.length + ' differ from overall');
  check('MLB streaks are scoped, not the overall streaks relabelled',
    streakDiffs.length > 0 || streakPairs.length === 0,
    streakDiffs.map((p) => `${p.u} ${p.overall}/${p.mlb}`).join(' ') || 'every capper on both boards has the same run in MLB as overall right now');

  // ---- 4. minimum picks is a real query -------------------------------------
  console.log('\n[4] MLB + every minimum-picks threshold');
  let previous = Infinity;
  for (const min of ['5', '10', '20', '25', '50', '100', '250']) {
    await setFilters(page, { minPicks: min });
    const expected = await api('/users/leaderboard?sortBy=net_units&limit=100&minPicks=' + min + '&sport=mlb');
    b = await settle(page, (s) => s.rows.length === expected.leaderboard.length && s.rows.every((r) => r.sub.includes('MLB')));
    check('MLB + ' + min + ' picks matches API (' + expected.leaderboard.length + ' rows)',
      b.rows.length === expected.leaderboard.length, b.rows.length + ' vs ' + expected.leaderboard.length);
    const under = b.rows.filter((r) => Number(r.picks) < Number(min));
    check('MLB + ' + min + ' picks: no row below the threshold', under.length === 0,
      under.map((r) => r.username + '=' + r.picks).join(','));
    check('MLB + ' + min + ' picks: count does not grow as the floor rises',
      b.rows.length <= previous, b.rows.length + ' > ' + previous);
    previous = b.rows.length;
  }

  // ---- 5. every sort option --------------------------------------------------
  console.log('\n[5] MLB + every sort option');
  await setFilters(page, { minPicks: '5' });
  const sorts = [
    ['units', (r) => Number(String(r.units).replace(/[+u]/g, ''))],
    ['roi', (r) => Number(String(r.roi).replace(/[+%]/g, ''))],
    ['winRate', (r) => Number(String(r.winRate).replace('%', ''))],
    ['totalPicks', (r) => Number(r.picks)],
    ['streak', (r) => { const m = String(r.sub).match(/streak (W|L)(\d+)/); return m ? (m[1] === 'W' ? Number(m[2]) : -Number(m[2])) : 0; }],
  ];
  for (const [value, keyOf] of sorts) {
    await setFilters(page, { sort: value });
    b = await settle(page, (s) => s.rows.length > 0);
    const keys = b.rows.map(keyOf);
    const sorted = keys.every((k, i) => i === 0 || keys[i - 1] >= k);
    check('sort "' + value + '" returns ranked results in descending order',
      b.rows.length > 0 && sorted, keys.join(' '));
    check('sort "' + value + '" renumbers ranks from #1',
      b.rows[0] && b.rows[0].rank === '#1', b.rows[0] && b.rows[0].rank);
  }
  await setFilters(page, { sort: 'units' });

  // ---- 6. every other sport --------------------------------------------------
  console.log('\n[6] Every other sport');
  for (const sport of apiSports.sports.map((s) => s.id).filter((id) => id !== 'mlb')) {
    await setFilters(page, { sport, minPicks: '5' });
    const expected = await api('/users/leaderboard?sortBy=net_units&limit=100&minPicks=5&sport=' + encodeURIComponent(sport));
    const wantLabel = expected.sport.label;
    b = await settle(page, (s) => expected.leaderboard.length > 0
      ? (s.rows.length === expected.leaderboard.length && s.rows.every((r) => r.sub.includes(wantLabel)))
      : (s.rows.length === 0 && s.emptyTitle.includes(wantLabel)));
    check(sport + ': row count matches API (' + expected.leaderboard.length + ')',
      b.rows.length === expected.leaderboard.length, b.rows.length + ' vs ' + expected.leaderboard.length);
    if (expected.leaderboard.length > 0) {
      const label = expected.sport.label;
      check(sport + ': rows carry the sport label', b.rows.every((r) => r.sub.includes(label)), b.rows[0].sub);
      check(sport + ': first row matches API', b.rows[0].username === expected.leaderboard[0].username,
        b.rows[0].username + ' vs ' + expected.leaderboard[0].username);
    } else {
      check(sport + ': empty state explains WHY, with the real numbers',
        b.emptyTitle !== '' && b.emptyTitle !== 'No ranked handicappers yet'
          && (b.emptyBody.includes(String(expected.scope_eligible_handicappers)) || expected.scope_eligible_handicappers === 0),
        b.emptyTitle + ' / ' + b.emptyBody);
      check(sport + ': empty state names the sport', b.emptyTitle.includes(expected.sport.label),
        b.emptyTitle);
      check(sport + ': no stale rows left in the DOM behind the empty state',
        b.rows.length === 0, 'rows=' + b.rows.length);
    }
  }

  // ---- 6b. no sport with a record is unreachable ----------------------------
  // The user-visible promise this whole audit exists to keep: if the platform
  // holds a graded public record in a sport, some setting of the two controls
  // must be able to show it. NBA and NHL failed this for months -- 12 and 6
  // verified records rendering a blank board in every configuration -- because
  // recency was measured against the wall clock and both leagues are out of
  // season. NFL failed it because the minimum-picks control had a floor of 5
  // and neither NFL capper holds three picks.
  console.log('\n[6b] Every sport that holds a record can be reached');
  check('the minimum-picks control goes below 5', b.sampleOptions.includes('1') && b.sampleOptions.includes('3'),
    b.sampleOptions.join(','));
  const unreachable = [];
  const reachable = [];
  for (const sport of apiSports.sports) {
    if (!sport.total_cappers) continue;
    let best = null;
    for (const min of ['1', '3', '5', '10', '20']) {
      const r = await api('/users/leaderboard?sortBy=net_units&limit=100&minPicks=' + min
        + '&sport=' + encodeURIComponent(sport.id));
      if (r.leaderboard.length) { best = { min, rows: r.leaderboard.length }; break; }
    }
    if (best) reachable.push(sport.label + ' @' + best.min + '=' + best.rows);
    else unreachable.push(sport.label + ' (' + sport.total_cappers + ' cappers, 0 rows at every threshold)');
  }
  check('every sport holding a graded record renders rows at some threshold',
    unreachable.length === 0, unreachable.join(' | '));
  console.log('        reachable: ' + reachable.join(', '));

  // The two the user reported as wrongly blank, asserted by name in the UI.
  for (const [id, label] of [['nba', 'NBA'], ['nhl', 'NHL']]) {
    const expected = await api('/users/leaderboard?sortBy=net_units&limit=100&minPicks=5&sport=' + id);
    await setFilters(page, { sport: id, minPicks: '5' });
    const seen = await settle(page, (s) => s.rows.length === expected.leaderboard.length
      && s.rows.length > 0 && s.rows.every((r) => r.sub.includes(label)));
    check(label + ' is no longer blank: renders ' + expected.leaderboard.length + ' ranked cappers',
      seen.rows.length === expected.leaderboard.length && seen.rows.length > 0,
      'rows=' + seen.rows.length);
    check(label + ' board names the season it is the standing from',
      /between seasons/.test(seen.filtersFoot) && /\d{4}/.test(seen.filtersFoot), seen.filtersFoot);
    check(label + ' dropdown count matches the rows it opens',
      (seen.sportOptions.find((o) => o.startsWith(id + '|')) || '').includes('(' + expected.leaderboard.length + ')'),
      seen.sportOptions.find((o) => o.startsWith(id + '|')));
  }

  // NFL: legitimately empty at 5 picks, reachable at 1, and the empty state
  // must not tell a member to lower a filter they are already at the bottom of.
  const nflFloor = await api('/users/leaderboard?sortBy=net_units&limit=100&minPicks=1&sport=nfl');
  await setFilters(page, { sport: 'nfl', minPicks: '5' });
  let nfl = await settle(page, (s) => s.rows.length === 0 && s.emptyTitle.includes('NFL'));
  check('NFL at 5 picks explains the volume gate and points at the floor',
    /minimum picks filter to 1|Drop the minimum picks/.test(nfl.emptyBody), nfl.emptyBody);
  await setFilters(page, { minPicks: '1' });
  nfl = await settle(page, (s) => s.rows.length === nflFloor.leaderboard.length && s.rows.length > 0);
  check('NFL at 1 pick shows the records the site holds (' + nflFloor.leaderboard.length + ')',
    nfl.rows.length === nflFloor.leaderboard.length && nfl.rows.length > 0, 'rows=' + nfl.rows.length);

  // ---- 7. search + sport together -------------------------------------------
  console.log('\n[7] Search combined with a sport');
  await setFilters(page, { sport: 'mlb', minPicks: '5', search: '' });
  b = await settle(page, (s) => s.rows.length === apiMlb.leaderboard.length && s.rows.every((r) => r.sub.includes('MLB')));
  const target = apiMlb.leaderboard[1].username;
  await setFilters(page, { search: target.slice(0, 5) });
  b = await settle(page, (s) => s.rows.length > 0 && s.rows.length < apiMlb.leaderboard.length);
  check('search narrows the MLB board', b.rows.length > 0 && b.rows.length < apiMlb.leaderboard.length,
    'rows=' + b.rows.length);
  check('search hit is the right capper', b.rows.some((r) => r.username === target),
    b.rows.map((r) => r.username).join(','));
  check('searched rows keep MLB stats', b.rows.every((r) => r.sub.includes('MLB')), b.rows[0] && b.rows[0].sub);

  await setFilters(page, { search: 'zzzznobodyzzzz' });
  b = await settle(page, (s) => s.rows.length === 0);
  check('a search with no hits says so, and does not claim there are no handicappers',
    b.emptyTitle === 'No capper matches that search', b.emptyTitle);
  check('the no-hit message reports how many rows the sport board does hold',
    b.emptyBody.includes(String(apiMlb.leaderboard.length)), b.emptyBody);

  // ---- 8. reset --------------------------------------------------------------
  console.log('\n[8] Reset');
  await page.click('[data-action="reset-filters"]');
  b = await settle(page, (s) => s.rows.length === apiAll.leaderboard.length && s.rows.every((r) => r.sub.includes('All sports')));
  check('reset repopulates the full default board', b.rows.length === apiAll.leaderboard.length,
    b.rows.length + ' vs ' + apiAll.leaderboard.length);
  const controls = await page.evaluate(() => ({
    sport: document.getElementById('sportFilter').value,
    sort: document.getElementById('sortFilter').value,
    sample: document.getElementById('sampleFilter').value,
    search: document.getElementById('capperSearch').value,
  }));
  check('reset restores every control to its default',
    controls.sport === 'all' && controls.sort === 'units' && controls.sample === '5' && controls.search === '',
    JSON.stringify(controls));
  check('reset relabels rows back to All sports', b.rows.every((r) => r.sub.includes('All sports')),
    b.rows[0] && b.rows[0].sub);

  // ---- 9. rapid filter changes, no refresh ----------------------------------
  console.log('\n[9] Changing filters repeatedly without a refresh');
  for (const seq of [['mlb', '5'], ['tennis', '5'], ['mlb', '20'], ['wnba', '5'], ['all', '5'], ['mlb', '10']]) {
    await setFilters(page, { sport: seq[0], minPicks: seq[1] });
  }
  const expectedFinal = await api('/users/leaderboard?sortBy=net_units&limit=100&minPicks=10&sport=mlb');
  b = await settle(page, (s) => s.rows.length === expectedFinal.leaderboard.length && s.rows.every((r) => r.sub.includes('MLB')));
  check('after six rapid changes the board shows the LAST selection',
    b.rows.length === expectedFinal.leaderboard.length && b.rows.every((r) => r.sub.includes('MLB')),
    'rows=' + b.rows.length + ' expected=' + expectedFinal.leaderboard.length);
  check('no stale response painted over the newest one',
    b.rows[0] && b.rows[0].username === expectedFinal.leaderboard[0].username,
    b.rows[0] && b.rows[0].username);

  // ---- 10. hot streaks rail --------------------------------------------------
  console.log('\n[10] Hot streaks + sample-size rails');
  await setFilters(page, { sport: 'mlb', minPicks: '5' });
  b = await settle(page, (s) => s.rows.length === apiMlb.leaderboard.length && s.rows.every((r) => r.sub.includes('MLB')));
  const mlbWinStreaks = apiMlb.leaderboard.filter((r) => r.current_streak > 0)
    .sort((a, c) => c.current_streak - a.current_streak).slice(0, 4);
  check('streak rail follows the loaded sport scope',
    b.streakRail.length === mlbWinStreaks.length
      && mlbWinStreaks.every((r, i) => b.streakRail[i].includes(r.username)),
    b.streakRail.map((t) => t.split('\n')[0]).join(' | '));
  check('streak rail prints the same run the board row prints',
    mlbWinStreaks.every((r, i) => b.streakRail[i].includes('W' + r.current_streak)),
    b.streakRail.join(' | '));
  check('streak rail names its scope', b.streakScope.includes('MLB'), b.streakScope);
  check('an in-season board does not claim to be a finished season',
    !/between seasons/.test(b.filtersFoot) && /last 30 days/.test(b.filtersFoot), b.filtersFoot);
  const mlbVolume = apiMlb.leaderboard.slice().sort((a, c) => c.total_picks - a.total_picks).slice(0, 4);
  check('volume rail follows the same scope',
    mlbVolume.every((r, i) => b.volumeRail[i] && b.volumeRail[i].includes(r.username)),
    b.volumeRail.map((t) => t.split('\n')[0]).join(' | '));
  check('volume rail names its scope', b.volumeScope.includes('MLB'), b.volumeScope);

  // Streak consistency with the member's own profile record.
  const streakUser = mlbWinStreaks[0];
  if (streakUser) {
    const profile = await api('/users/' + encodeURIComponent(streakUser.username) + '/metrics').catch(() => null);
    if (profile) {
      const overall = await api('/users/leaderboard?sortBy=net_units&limit=100&minPicks=1');
      const overallRow = overall.leaderboard.find((r) => r.username === streakUser.username);
      check('overall board and profile agree on the overall streak',
        !overallRow || profile.current_streak === undefined || Number(profile.current_streak) === Number(overallRow.current_streak),
        'profile=' + profile.current_streak + ' board=' + (overallRow && overallRow.current_streak));
    }
  }

  // ---- 11. counts never contradict the board --------------------------------
  console.log('\n[11] Counts');
  for (const sport of ['all', 'mlb', 'tennis', 'nba']) {
    await setFilters(page, { sport, minPicks: '5' });
    const expected = await api('/users/leaderboard?sortBy=net_units&limit=100&minPicks=5'
      + (sport === 'all' ? '' : '&sport=' + sport));
    const wantChipLabel = expected.sport ? expected.sport.label : 'All sports';
    b = await settle(page, (s) => s.rows.length === expected.leaderboard.length
      && (s.rows.length === 0 || s.rows.every((r) => r.sub.includes(wantChipLabel))));
    const denom = expected.scope_eligible_handicappers;
    const want = denom > b.rows.length
      ? b.rows.length + ' of ' + denom + ' cappers match your filters'
      : b.rows.length + ' cappers';
    check(sport + ': chip reports the scope, not the platform total', b.chip === want, b.chip + ' want ' + want);
    check(sport + ': hero stays the platform total', b.hero === String(expected.total_eligible_handicappers), b.hero);
    check(sport + ': a zero board never sits under a nonzero chip numerator',
      (b.rows.length === 0) === b.chip.startsWith('0 '), b.chip);
  }

  // ---- 12. console health ----------------------------------------------------
  console.log('\n[12] Console');
  check('no JS errors across the whole run', consoleErrors.length === 0,
    consoleErrors.slice(0, 5).join(' | '));

  // Final screenshot of the reported failure case, now working.
  await setFilters(page, { sport: 'mlb', minPicks: '5', sort: 'units', search: '' });
  await settle(page, (s) => s.rows.length === apiMlb.leaderboard.length);
  await page.screenshot({ path: process.env.SHOT || 'mlb_board.png', fullPage: false });

  console.log('\n==================================================');
  console.log('PASS ' + pass + '   FAIL ' + fail);
  if (failures.length) console.log('FAILURES:\n - ' + failures.join('\n - '));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
