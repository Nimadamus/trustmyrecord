'use strict';
/**
 * nba-nhl-simulator-browser-proof.cjs -- drives the real NBA and NHL simulator
 * pages in a real browser, against the real API, and proves the whole user flow
 * works on desktop and on a phone.
 *
 * It starts two servers of its own so it never touches production:
 *   - the backend's public simulator routes, on a local port
 *   - a static file server over this repo, on another local port
 * The page is told to use the local API through window.TMR_SIM_API_HOST, which
 * is the only thing that differs from what a visitor loads.
 *
 *   node tests/nba-nhl-simulator-browser-proof.cjs
 *   HEADED=1 node tests/nba-nhl-simulator-browser-proof.cjs
 */
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');
const BACKEND = path.resolve(ROOT, '../trustmyrecord-backend');
const HEADED = !!process.env.HEADED;

/* ------------------------------------------------------------------ servers */

function startApi() {
  const express = require(path.join(BACKEND, 'node_modules', 'express'));
  const app = express();
  // The page is served from a different origin in this harness, so CORS has to
  // be permitted BEFORE the routers, not after them.
  app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });
  app.use('/', require(path.join(BACKEND, 'routes', 'nbaPublic')));
  app.use('/', require(path.join(BACKEND, 'routes', 'nhlPublic')));
  return new Promise((resolve) => {
    const s = app.listen(0, () => resolve({ server: s, port: s.address().port }));
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.xml': 'application/xml',
};

function startStatic() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

/* -------------------------------------------------------------------- helpers */

async function newPage(browser, apiPort, viewport) {
  const ctx = await browser.newContext(viewport);
  const errors = [];
  // CORS: the harness serves the page and the API from different ports.
  await ctx.addInitScript((port) => { window.TMR_SIM_API_HOST = 'http://127.0.0.1:' + port; }, apiPort);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.errors = errors;
  return { ctx, page, errors };
}

/** Switch to the any-two-teams pane. The page opens on the real slate. */
async function useCustomMode(page) {
  await page.click('#modebar button[data-mode="custom"]');
  await page.waitForSelector('#customPane:not([hidden])', { timeout: 10000 });
}

async function runSimulation(page, away, home) {
  await page.waitForFunction(() => document.querySelectorAll('#awayTeam option').length > 5, null, { timeout: 20000 });
  await useCustomMode(page);
  await page.selectOption('#awayTeam', { label: away });
  await page.selectOption('#homeTeam', { label: home });
  await page.click('#runBtn');
  await page.waitForSelector('#result .mh-team .pts', { timeout: 30000 });
}

/**
 * The slate is the default view, so it has to work: real games, real crests, and
 * a card that runs that matchup when it is clicked.
 */
async function checkSchedule(page, viewportName) {
  await page.waitForFunction(
    () => {
      const g = document.getElementById('games');
      return g && !/Loading the schedule/.test(g.textContent);
    },
    null,
    { timeout: 30000 },
  );
  const cards = await page.$$('#games .game');
  if (!cards.length) {
    // A genuinely empty slate must say so rather than render nothing at all.
    const text = await page.$eval('#games', (n) => n.textContent.trim());
    assert.ok(text.length > 10, viewportName + ': the slate is empty and says nothing');
    return { games: 0, note: text.slice(0, 60) };
  }
  const label = await page.$eval('#slateLabel', (n) => n.textContent.trim());
  assert.ok(label.length > 3, viewportName + ': the slate has games but no date label');

  const crests = await page.$$eval('#games .game .crest, #games .game .crest-fallback', (n) => n.length);
  assert.ok(crests >= cards.length * 2, viewportName + ': slate cards are missing team crests');

  const cardTeams = await cards[0].$$eval('.team .nm', (n) => n.map((x) => x.textContent.trim()));
  await cards[0].click();
  await page.waitForSelector('#result .mh-team .pts', { timeout: 30000 });
  const score = await readScore(page);
  assert.strictEqual(score.length, 2, viewportName + ': clicking a scheduled game did not simulate it');
  const ranTeams = await page.$$eval('#result .mh-team .nm', (n) => n.map((x) => x.textContent.trim()));
  assert.deepStrictEqual(ranTeams, cardTeams,
    viewportName + ': simulated ' + ranTeams.join(' v ') + ' after clicking ' + cardTeams.join(' v '));
  return { games: cards.length, label: label, ran: ranTeams.join(' at ') };
}

async function readScore(page) {
  return page.$$eval('#result .mh-team .pts', (n) => n.map((x) => parseInt(x.textContent, 10)));
}

/* -------------------------------------------------------------------- checks */

async function checkNba(browser, api, site, viewportName, viewport) {
  const { ctx, page, errors } = await newPage(browser, api, viewport);
  const base = 'http://127.0.0.1:' + site;
  await page.goto(base + '/nba-simulator/', { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(() => document.querySelectorAll('#awayTeam option').length > 5, null, { timeout: 20000 });
  const teamCount = await page.$$eval('#awayTeam option', (n) => n.length);
  assert.ok(teamCount >= 31, viewportName + ': NBA team selector has ' + teamCount + ' options, expected 31 (30 teams + placeholder)');

  const slate = await checkSchedule(page, viewportName + ' slate');

  await runSimulation(page, 'Los Angeles Lakers', 'Golden State Warriors');
  const score = await readScore(page);
  assert.strictEqual(score.length, 2, viewportName + ': the result header did not show two scores');
  assert.ok(score[0] > 60 && score[0] < 190, viewportName + ': impossible away score ' + score[0]);
  assert.ok(score[1] > 60 && score[1] < 190, viewportName + ': impossible home score ' + score[1]);
  assert.notStrictEqual(score[0], score[1], viewportName + ': the simulated game ended tied');

  // Quarter-by-quarter line adds to the final.
  const line = await page.$$eval('#result .linescore tbody tr', (rows) => rows.map((r) => Array.from(r.querySelectorAll('td')).map((td) => td.textContent.trim())));
  assert.strictEqual(line.length, 2, viewportName + ': the line score does not have two rows');
  line.forEach((row, i) => {
    const nums = row.slice(1).map(Number);
    const final = nums.pop();
    const sum = nums.reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, final, viewportName + ': NBA line score row ' + i + ' sums to ' + sum + ', final says ' + final);
    assert.strictEqual(final, score[i], viewportName + ': the line score final does not match the header');
  });

  // The box score reconciles in the DOM, not just in the API response.
  const boxTotals = await page.$$eval('#result .tablewrap table', (tables) => tables
    .filter((t) => /PTS/.test(t.querySelector('thead').textContent))
    .map((t) => {
      const headers = Array.from(t.querySelectorAll('thead th')).map((th) => th.textContent.trim());
      const ptsCol = headers.indexOf('PTS');
      const rows = Array.from(t.querySelectorAll('tbody tr'));
      const teamRow = rows[rows.length - 1];
      const players = rows.slice(0, -1);
      return {
        players: players.reduce((a, r) => a + Number(r.children[ptsCol].textContent.trim()), 0),
        team: Number(teamRow.children[ptsCol].textContent.replace(/[^0-9]/g, '')),
      };
    }));
  assert.strictEqual(boxTotals.length, 2, viewportName + ': expected two NBA box score tables, found ' + boxTotals.length);
  boxTotals.forEach((b, i) => assert.strictEqual(b.players, b.team,
    viewportName + ': NBA box score ' + i + ' player points sum to ' + b.players + ' but the team row says ' + b.team));
  assert.strictEqual(boxTotals[0].team + boxTotals[1].team, score[0] + score[1],
    viewportName + ': the box score totals do not add to the final score');

  // Tabs work.
  for (const label of ['Team stats', 'Why the model moved', 'Season profile', 'Availability', 'Distributions', 'Range of outcomes']) {
    await page.click('#result .tabs button:has-text("' + label + '")');
    await page.waitForTimeout(60);
    const filled = await page.$$eval('#result .tabs + div *', (n) => n.length);
    assert.ok(filled > 3, viewportName + ': the "' + label + '" tab rendered nothing');
  }
  // The distribution charts must draw real bars, not an empty frame.
  await page.click('#result .tabs button:has-text("Distributions")');
  await page.waitForSelector('#result .chartcard svg rect', { timeout: 10000 });
  const chartInfo = await page.evaluate(() => ({
    cards: document.querySelectorAll('#result .chartcard').length,
    bars: document.querySelectorAll('#result .chartcard svg rect').length,
    paths: document.querySelectorAll('#result .chartcard svg path').length,
  }));
  assert.ok(chartInfo.cards >= 3, viewportName + ': expected three chart cards, found ' + chartInfo.cards);
  assert.ok(chartInfo.bars >= 20, viewportName + ': the histograms drew only ' + chartInfo.bars + ' bars');
  assert.ok(chartInfo.paths >= 1, viewportName + ': the cover-probability curve did not draw');

  // The recap and the leaders panel have to be on the page, and the recap has
  // to agree with the scoreline the header is showing.
  const nbaRecap = await page.$eval('#result .recap', (n) => n.textContent.trim())
    .catch(() => '');
  assert.ok(nbaRecap.length > 20, viewportName + ': the NBA recap did not render');
  const nbaScores = await page.$$eval('#result .mh-team .pts',
    (n) => n.map((x) => Number(x.textContent.trim())));
  assert.strictEqual(nbaScores.length, 2, viewportName + ': the NBA header is not showing two scores');
  {
    const hi = Math.max(...nbaScores);
    const lo = Math.min(...nbaScores);
    assert.ok(nbaRecap.includes(hi + '-' + lo),
      viewportName + ': the NBA recap scoreline disagrees with the header: ' + nbaRecap.slice(0, 80));
  }
  const leaderHead = await page.$$eval('#result .sechead', (n) => n.map((x) => x.textContent));
  assert.ok(leaderHead.some((t) => /Game leaders/i.test(t)),
    viewportName + ': the NBA game leaders panel did not render');

  const crestCount = await page.$$eval('#result .mh-team img.crest, #result .mh-team .crest-fallback', (n) => n.length);
  assert.strictEqual(crestCount, 2, viewportName + ': the result header is missing team crests');

  await page.click('#result .tabs button:has-text("Box score")');

  // Simulate again is a NEW simulation, not a replay.
  const seen = new Set([score.join('-')]);
  for (let i = 0; i < 4; i += 1) {
    await page.click('#againBtn');
    await page.waitForTimeout(120);
    await page.waitForSelector('#result .mh-team .pts', { timeout: 30000 });
    seen.add((await readScore(page)).join('-'));
  }
  assert.ok(seen.size >= 3, viewportName + ': five NBA runs produced only ' + seen.size
    + ' distinct scores; Simulate again is replaying instead of resimulating');

  // The URL carries the run so it can be shared, and reloading replays it.
  const url = page.url();
  assert.ok(/away=LAL/.test(url) && /home=GS/.test(url) && /seed=\d+/.test(url),
    viewportName + ': the result URL does not carry the matchup and seed: ' + url);
  const pinned = await readScore(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#result .mh-team .pts', { timeout: 30000 });
  assert.deepStrictEqual(await readScore(page), pinned,
    viewportName + ': reloading a seeded result URL did not replay the same game');

  // Mobile layout: nothing may push the page sideways.
  // Measured accuracy must be on the page, with a real reliability curve. This
  // is the one claim on the whole tool that a visitor cannot check for himself,
  // so it must never quietly fail to render.
  await page.waitForSelector('#accuracyBody .kpi', { timeout: 20000 });
  const acc = await page.evaluate(() => {
    const body = document.getElementById('accuracyBody');
    return {
      kpis: body.querySelectorAll('.kpi').length,
      dots: body.querySelectorAll('svg circle').length,
      text: body.textContent,
    };
  });
  assert.strictEqual(acc.kpis, 4, viewportName + ': the measured-accuracy panel showed ' + acc.kpis + ' figures');
  assert.ok(acc.dots >= 5, viewportName + ': the reliability curve drew only ' + acc.dots + ' points');
  assert.ok(/games/i.test(acc.text) && /home team/i.test(acc.text),
    viewportName + ': the accuracy panel does not say what it was measured against');
  assert.ok(!/NaN|undefined/.test(acc.text), viewportName + ': the accuracy panel printed a broken value');

  // The methodology endpoint must actually be reachable from the page.
  await page.click('#methodLink');
  await page.waitForSelector('#methodBody .notecard', { timeout: 15000 });
  const methodCards = await page.$$eval('#methodBody .notecard', (n) => n.length);
  assert.ok(methodCards >= 5, viewportName + ': the methodology panel showed ' + methodCards + ' sections');

  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  assert.ok(overflow.doc <= overflow.win + 2,
    viewportName + ': the page scrolls horizontally (' + overflow.doc + ' wide in a ' + overflow.win + ' viewport)');

  assert.deepStrictEqual(errors, [], viewportName + ': console errors on the NBA simulator: ' + errors.join(' | '));
  await ctx.close();
  return { score, boxTotals, distinctReruns: seen.size, slate: slate, charts: chartInfo };
}

async function checkNhl(browser, api, site, viewportName, viewport) {
  const { ctx, page, errors } = await newPage(browser, api, viewport);
  const base = 'http://127.0.0.1:' + site;
  await page.goto(base + '/nhl-simulator/', { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(() => document.querySelectorAll('#awayTeam option').length > 5, null, { timeout: 20000 });
  const teamCount = await page.$$eval('#awayTeam option', (n) => n.length);
  assert.ok(teamCount >= 33, viewportName + ': NHL team selector has ' + teamCount + ' options, expected 33');

  const slate = await checkSchedule(page, viewportName + ' slate');
  // Picking a game off the slate must also load that team's goaltenders.
  if (slate.games) {
    await page.waitForFunction(() => {
      const g = document.getElementById('homeGoalie');
      return g && !g.disabled && g.options.length > 0;
    }, null, { timeout: 15000 });
  }

  await useCustomMode(page);
  await page.selectOption('#awayTeam', { label: 'New York Rangers' });
  await page.selectOption('#homeTeam', { label: 'Boston Bruins' });

  // The goaltender selectors must populate from the chosen teams.
  await page.waitForFunction(() => {
    const g = document.getElementById('homeGoalie');
    return g && !g.disabled && g.options.length > 0;
  }, null, { timeout: 20000 });
  const goalieNames = await page.$$eval('#homeGoalie option', (n) => n.map((o) => o.textContent));
  assert.ok(goalieNames.length >= 2, viewportName + ': the home goaltender selector has ' + goalieNames.length + ' options');
  assert.ok(/SV%/.test(goalieNames[0]), viewportName + ': the goaltender option does not show a save percentage');

  await page.click('#runBtn');
  await page.waitForSelector('#result .mh-team .pts', { timeout: 30000 });

  const score = await readScore(page);
  assert.ok(score[0] >= 0 && score[0] < 14, viewportName + ': impossible away goal total ' + score[0]);
  assert.ok(score[1] >= 0 && score[1] < 14, viewportName + ': impossible home goal total ' + score[1]);
  assert.notStrictEqual(score[0], score[1], viewportName + ': the simulated hockey game ended tied');

  // Period line and shot totals.
  const line = await page.$$eval('#result .linescore tbody tr', (rows) => rows.map((r) => Array.from(r.querySelectorAll('td')).map((td) => td.textContent.trim())));
  assert.strictEqual(line.length, 2, viewportName + ': the NHL line score does not have two rows');
  const overtime = await page.$$eval('#result .linescore thead th', (th) => th.map((x) => x.textContent.trim()));
  line.forEach((row, i) => {
    const cells = row.slice(1).map(Number);
    const shots = cells.pop();
    const final = cells.pop();
    const periods = cells;
    const sum = periods.reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, final, viewportName + ': NHL line row ' + i + ' periods sum to ' + sum + ' but the final says ' + final);
    assert.strictEqual(final, score[i], viewportName + ': the NHL line final does not match the header');
    assert.ok(shots >= final, viewportName + ': a team scored more goals than it took shots');
  });
  assert.ok(overtime.includes('Shots'), viewportName + ': the NHL line score does not show shots on goal');

  // THE WRITTEN PARTS HAVE TO BE ON THE PAGE, AND HAVE TO AGREE WITH IT.
  //
  // A recap and a scoring summary are the two things a reader checks against
  // the box score in front of them, so it is not enough that the API returns
  // them: they have to render, and what they say has to match what is shown.
  const recapText = await page.$eval('#result .recap', (n) => n.textContent.trim())
    .catch(() => '');
  assert.ok(recapText.length > 15, viewportName + ': the NHL recap did not render');
  const headScore = score.slice().sort((x, y) => y - x);
  assert.ok(recapText.includes(headScore[0] + '-' + headScore[1]),
    viewportName + ': the NHL recap scoreline disagrees with the page: ' + recapText.slice(0, 80));

  const starsText = await page.$$eval('#result .disc', (n) => n.map((x) => x.textContent))
    .then((all) => all.find((t) => /Three stars/.test(t)) || '');
  assert.ok(/Three stars/.test(starsText), viewportName + ': three stars did not render');

  // The scoring summary tab opens and its goal rows add up to the final score.
  const openedScoring = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('#result .tabs button')]
      .find((t) => /Scoring summary/i.test(t.textContent));
    if (!tab) return false;
    tab.click();
    return true;
  });
  assert.ok(openedScoring, viewportName + ': no scoring summary tab');
  await new Promise((r) => setTimeout(r, 250));
  const goalRows = await page.$$eval('#result table tbody tr', (rows) => rows
    .map((r) => [...r.children].map((c) => c.textContent.trim()))
    .filter((c) => c.length === 6 && /^(EV|PP|SH|EN)$/.test(c[4])));
  if (goalRows.length) {
    const lastScore = goalRows[goalRows.length - 1][5].split('-').map(Number);
    const summed = lastScore[0] + lastScore[1];
    assert.ok(summed <= score[0] + score[1],
      viewportName + ': the scoring summary has more goals than the final score');
  }

  // Back to the box score for the goaltender checks below.
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('#result .tabs button')]
      .find((t) => /Box score/i.test(t.textContent));
    if (tab) tab.click();
  });
  await new Promise((r) => setTimeout(r, 250));

  // The goaltender card must exist and reconcile.
  const goalies = await page.$$eval('#result .goaliecard .ln', (n) => n.map((x) => x.textContent.trim()));
  assert.ok(goalies.length >= 2, viewportName + ': no goaltender lines in the NHL result');
  const saveLine = goalies.find((t) => /saves on/.test(t));
  assert.ok(saveLine, viewportName + ': no goaltender save line: ' + goalies.join(' | '));
  const m = /(\d+) saves on (\d+) shots/.exec(saveLine);
  assert.ok(m && Number(m[1]) <= Number(m[2]), viewportName + ': a goaltender made more saves than shots faced');

  // Choosing the backup must actually change the starter shown on the result.
  const backup = await page.$eval('#homeGoalie', (s) => (s.options[1] ? s.options[1].value : null));
  if (backup) {
    await page.selectOption('#homeGoalie', backup);
    await page.click('#runBtn');
    await page.waitForSelector('#result .mh-team .pts', { timeout: 30000 });
    const shown = await page.$$eval('#result .goaliecard .nm', (n) => n.map((x) => x.textContent.trim()));
    const expected = await page.$eval('#homeGoalie option:checked', (o) => o.textContent.split(' (')[0]);
    assert.ok(shown.includes(expected),
      viewportName + ': started ' + expected + ' but the result shows ' + shown.join(', '));
  }

  const seen = new Set();
  for (let i = 0; i < 5; i += 1) {
    await page.click('#againBtn');
    await page.waitForTimeout(120);
    await page.waitForSelector('#result .mh-team .pts', { timeout: 30000 });
    seen.add((await readScore(page)).join('-'));
  }
  assert.ok(seen.size >= 2, viewportName + ': five NHL runs produced only ' + seen.size + ' distinct scores');

  const overflowN = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  assert.ok(overflowN.doc <= overflowN.win + 2,
    viewportName + ': the NHL page scrolls horizontally (' + overflowN.doc + ' in ' + overflowN.win + ')');

  // The Lineups tab must list eighteen skaters, both goaltenders, and say who is out.
  await page.click('#result .tabs button:has-text("Lineups")');
  await page.waitForSelector('#result .tabs + div table', { timeout: 10000 });
  const lineupInfo = await page.evaluate(() => {
    const body = document.querySelector('#result .tabs + div');
    return {
      tables: body.querySelectorAll('table').length,
      rows: body.querySelectorAll('tbody tr').length,
      says: /Out:|current injury designation/.test(body.textContent),
    };
  });
  assert.strictEqual(lineupInfo.tables, 4, viewportName + ': expected a skater and a goalie table per team');
  assert.ok(lineupInfo.rows >= 40, viewportName + ': the lineup tables have only ' + lineupInfo.rows + ' rows');
  assert.ok(lineupInfo.says, viewportName + ': the Lineups tab never says who is out');

  await page.click('#result .tabs button:has-text("Distributions")');
  await page.waitForSelector('#result .chartcard svg rect', { timeout: 10000 });
  const nhlCharts = await page.evaluate(() => ({
    cards: document.querySelectorAll('#result .chartcard').length,
    bars: document.querySelectorAll('#result .chartcard svg rect').length,
  }));
  assert.ok(nhlCharts.cards >= 3, viewportName + ': expected three NHL chart cards');
  assert.ok(nhlCharts.bars >= 10, viewportName + ': the NHL histograms drew only ' + nhlCharts.bars + ' bars');

  assert.deepStrictEqual(errors, [], viewportName + ': console errors on the NHL simulator: ' + errors.join(' | '));
  await ctx.close();
  return { score, distinctReruns: seen.size, slate: slate, charts: nhlCharts };
}

/** A generated matchup page must render its projection with no JavaScript, and hand off to the live tool. */
async function checkMatchupPage(browser, api, site, url, expectHub) {
  const { ctx, page, errors } = await newPage(browser, api, { viewport: { width: 1280, height: 900 } });
  const base = 'http://127.0.0.1:' + site;

  // With JavaScript disabled the projection must still be there.
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const p2 = await noJs.newPage();
  await p2.goto(base + url, { waitUntil: 'domcontentloaded' });
  const staticScores = await p2.$$eval('.mh-team .pts', (n) => n.map((x) => x.textContent.trim()));
  assert.strictEqual(staticScores.length, 2, url + ': the projection is not in the served HTML');
  assert.ok(parseFloat(staticScores[0]) > 0, url + ': the served projection has no numbers');
  const h1 = await p2.$eval('h1', (n) => n.textContent.trim());
  assert.ok(/ vs .* Simulation/.test(h1), url + ': H1 is "' + h1 + '"');
  await noJs.close();

  await page.goto(base + url, { waitUntil: 'domcontentloaded' });
  const runHref = await page.$eval('a.btn', (a) => a.getAttribute('href'));
  assert.ok(runHref.indexOf(expectHub) === 0 && /away=/.test(runHref) && /home=/.test(runHref),
    url + ': the run button does not deep link into the simulator: ' + runHref);

  // Following it must auto-run the matchup.
  await page.click('a.btn');
  await page.waitForSelector('#result .mh-team .pts', { timeout: 30000 });
  const score = await readScore(page);
  assert.strictEqual(score.length, 2, url + ': the deep link did not auto-run the simulation');
  // A deep link is a request for that matchup, so the page must open on the pane
  // that shows it rather than on a slate the visitor did not ask for.
  const customVisible = await page.$eval('#customPane', (n) => !n.hidden);
  assert.ok(customVisible, url + ': the deep link did not open the custom matchup pane');

  assert.deepStrictEqual(errors, [], url + ': console errors: ' + errors.join(' | '));
  await ctx.close();
  return { url, staticScores, liveScore: score };
}

/* ---------------------------------------------------------------------- run */

(async function main() {
  const api = await startApi();
  const site = await startStatic();
  const browser = await chromium.launch({ headless: !HEADED });
  const report = {};
  try {
    const desktop = { viewport: { width: 1440, height: 900 } };
    const phone = devices['iPhone 12'];

    report.nbaDesktop = await checkNba(browser, api.port, site.port, 'NBA desktop', desktop);
    report.nbaMobile = await checkNba(browser, api.port, site.port, 'NBA mobile', phone);
    report.nhlDesktop = await checkNhl(browser, api.port, site.port, 'NHL desktop', desktop);
    report.nhlMobile = await checkNhl(browser, api.port, site.port, 'NHL mobile', phone);

    report.nbaMatchup = await checkMatchupPage(browser, api.port, site.port,
      '/nba-simulator/lakers-vs-warriors/', '/nba-simulator/');
    report.nhlMatchup = await checkMatchupPage(browser, api.port, site.port,
      '/nhl-simulator/rangers-vs-bruins/', '/nhl-simulator/');

    console.log(JSON.stringify(report, null, 2));
    console.log('PASS  NBA and NHL simulators drive end to end on desktop and mobile');
  } finally {
    await browser.close();
    api.server.close();
    site.server.close();
  }
}()).catch((e) => { console.error(e); process.exit(1); });
