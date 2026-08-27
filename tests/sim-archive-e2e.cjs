#!/usr/bin/env node
'use strict';

/**
 * Simulation Archive - end-to-end proof.
 *
 * Renders the real archive pages, in a real browser, against the real API and a
 * real database, and asserts what a visitor would actually see. Headless, so it
 * never opens a window.
 *
 *   node tests/sim-archive-e2e.cjs
 *
 * WHAT IT DOES
 *   1. Seeds a body of synthetic simulations through the archive's own write
 *      path (synthetic clubs, synthetic engine - it shares no aggregate row
 *      with any real simulation).
 *   2. Serves the frontend repo and mounts the archive API on localhost.
 *   3. Loads the hub, the matchup page, the club page and one archived box
 *      score at desktop and phone widths.
 *   4. Asserts the numbers on screen, that nothing scrolls sideways on a phone,
 *      and that no page logged a console error.
 *   5. Deletes everything it created and proves the database is clean.
 *
 * Screenshots land in the directory given by SIM_ARCHIVE_SHOTS, if set.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require(path.join(__dirname, '..', '..', 'trustmyrecord-backend', 'node_modules', 'express'));
const { chromium } = require('playwright');

const BACKEND = path.join(__dirname, '..', '..', 'trustmyrecord-backend');
const FE = path.join(__dirname, '..');
const SHOTS = process.env.SIM_ARCHIVE_SHOTS || null;

process.env.SIM_ARCHIVE_ENABLED = 'true';
require(path.join(BACKEND, 'node_modules', 'dotenv')).config({ path: path.join(BACKEND, '.env') });

const pool = require(path.join(BACKEND, 'config', 'database'));
const archive = require(path.join(BACKEND, 'services', 'simArchive'));
const { ensureSimArchiveSchema } = require(path.join(BACKEND, 'services', 'simArchive', 'schema'));
const archiveRoutes = require(path.join(BACKEND, 'routes', 'simArchive'));

const ENGINE = 'tmr-archive-e2e-7.7.0';
const ENGINE_MAJOR = 'tmr-archive-e2e-7.7';
const UID_PREFIX = 'archive-e2e-';
const PAIR = 'ZZH-ZZV';
const SLUG = 'harriers-vs-voyagers';

let passed = 0;
let failed = 0;
const log = [];

function check(name, condition, detail) {
  if (condition) { passed += 1; log.push('  PASS  ' + name); }
  else { failed += 1; log.push('  FAIL  ' + name + (detail ? '\n          ' + detail : '')); }
}

function payload(n, over) {
  return Object.assign({
    sport: 'mlb',
    run_uid: UID_PREFIX + n,
    engine_version: ENGINE,
    away_abbr: 'ZZV', home_abbr: 'ZZH',
    away_name: 'Archive Voyagers', home_name: 'Archive Harriers',
    away_score: 5, home_score: 3,
    total_innings: 9,
    away_pitcher: 'A. Starter', home_pitcher: 'B. Starter',
    scope: 'default',
    team_stats: {
      away: { hits: 9, errors: 0, home_runs: 2, walks: 3, strikeouts: 8, left_on_base: 6, stolen_bases: 1 },
      home: { hits: 6, errors: 1, home_runs: 1, walks: 2, strikeouts: 10, left_on_base: 5, stolen_bases: 0 },
      walk_off: false,
    },
    player_stats: {
      away: {
        batters: [
          { name: 'V. Leadoff', pos: 'CF', ab: 5, r: 2, h: 3, hr: 1, rbi: 3, bb: 0, so: 1 },
          { name: 'V. Cleanup', pos: '1B', ab: 4, r: 1, h: 1, hr: 1, rbi: 2, bb: 1, so: 2 },
        ],
        pitchers: [{ name: 'A. Starter', ip: '6.0', h: 5, r: 3, er: 3, bb: 2, so: 7, hr: 1 }],
      },
      home: {
        batters: [
          { name: 'H. Leadoff', pos: 'SS', ab: 4, r: 1, h: 2, hr: 0, rbi: 1, bb: 0, so: 0 },
          { name: 'H. Cleanup', pos: 'LF', ab: 4, r: 0, h: 1, hr: 1, rbi: 2, bb: 0, so: 1 },
        ],
        pitchers: [{ name: 'B. Starter', ip: '5.2', h: 8, r: 5, er: 4, bb: 3, so: 6, hr: 2 }],
      },
    },
    lineups: {
      away: [{ order: 1, name: 'V. Leadoff', pos: 'CF' }, { order: 2, name: 'V. Cleanup', pos: '1B' }],
      home: [{ order: 1, name: 'H. Leadoff', pos: 'SS' }, { order: 2, name: 'H. Cleanup', pos: 'LF' }],
    },
    settings: { simulation_mode: 'e2e' },
    box_score: {
      away: { innings: [1, 0, 2, 0, 0, 1, 0, 1, 0] },
      home: { innings: [0, 1, 0, 0, 2, 0, 0, 0, 0] },
    },
  }, over || {});
}

async function cleanup() {
  await pool.query('DELETE FROM sim_matchup_agg WHERE engine_major = $1', [ENGINE_MAJOR]);
  await pool.query('DELETE FROM sim_team_agg WHERE engine_major = $1', [ENGINE_MAJOR]);
  await pool.query('DELETE FROM sim_daily_totals WHERE engine_major = $1', [ENGINE_MAJOR]);
  await pool.query('DELETE FROM sim_totals WHERE engine_major = $1', [ENGINE_MAJOR]);
  await pool.query('DELETE FROM sim_engine_versions WHERE engine_major = $1', [ENGINE_MAJOR]);
  await pool.query('DELETE FROM sim_matchup_daily WHERE pair_key = $1', [PAIR]);
  await pool.query('DELETE FROM sim_runs WHERE run_uid LIKE $1', ['mlb:' + UID_PREFIX + '%']);
}

async function seed() {
  const ids = [];
  for (let i = 0; i < 40; i += 1) {
    const homeWins = i % 4 === 0;
    const out = await archive.recordRun(payload(String(i), {
      away_score: homeWins ? 2 : (4 + (i % 5)),
      home_score: homeWins ? 8 : 3,
      total_innings: i % 8 === 0 ? 10 : 9,
      user_id: i % 3 === 0 ? 1 : null,
      actor_key: 's:e2e-' + i,
    }));
    if (out.id) ids.push(out.id);
  }
  return ids;
}

function localGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: body }));
    }).on('error', reject);
  });
}

function serve() {
  const app = express();
  app.use('/api/sim-archive', archiveRoutes);
  app.use(express.static(FE, { extensions: ['html'] }));
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  console.log('\nSIM ARCHIVE - end to end\n');
  await ensureSimArchiveSchema(true);
  await cleanup();
  const ids = await seed();
  const runId = ids[ids.length - 1];

  const { server, port } = await serve();
  const origin = 'http://127.0.0.1:' + port;

  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];

  async function open(url, viewport) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(url + ' :: ' + m.text()); });
    page.on('pageerror', (e) => { consoleErrors.push(url + ' :: ' + e.message); });
    // The pages ship pointing at the production API. Those calls are answered
    // from the instance under test instead of going over the network. Playwright
    // refuses to rewrite https to http, so the response is fetched here and
    // fulfilled rather than redirected.
    await page.route('**/*', async (route) => {
      const u = route.request().url();
      if (u.indexOf('/api/sim-archive') !== -1 && u.indexOf(origin) !== 0) {
        const localPath = u.slice(u.indexOf('/api/sim-archive'));
        try {
          const answer = await localGet(origin + localPath);
          return route.fulfill({
            status: answer.status,
            contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: answer.body,
          });
        } catch (e) {
          return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        }
      }
      if (u.indexOf('onrender.com') !== -1 || u.indexOf('espncdn.com') !== -1
        || u.indexOf('fonts.g') !== -1 || u.indexOf('google') !== -1) {
        // Everything else the page would fetch off-box is not what is under test.
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
      return route.continue();
    });
    await page.goto(origin + url, { waitUntil: 'domcontentloaded' });
    return { context, page };
  }

  async function shoot(page, name) {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });
  }

  const DESKTOP = { width: 1440, height: 1000 };
  const PHONE = { width: 390, height: 844 };

  /* ---------------------------------------------------------- hub */
  {
    const { context, page } = await open('/mlb-simulator/results/', DESKTOP);
    await page.waitForSelector('.sa-metric-value', { timeout: 20000 });
    const text = await page.textContent('body');
    check('hub renders the metric cards', /Simulations today/i.test(text));
    check('hub renders the all-time counter', /All-time simulations/i.test(text));
    check('hub shows the seeded matchup somewhere',
      text.indexOf('Archive Harriers') !== -1 || text.indexOf('Archive Voyagers') !== -1, text.slice(0, 300));
    const feed = await page.$$('.sa-feed-item');
    check('hub renders the recent feed', feed.length > 0, feed.length + ' items');
    const ranks = await page.$$('.sa-rank');
    check('hub renders the most-simulated board', ranks.length > 0);
    await shoot(page, 'hub-desktop');

    // Tabs
    await page.click('.sa-tab[data-window="all"]');
    await page.waitForTimeout(900);
    const afterTab = await page.textContent('.sa-panel:has(.sa-tabs)');
    check('the all-time tab loads its own board', /simulations|sims/i.test(afterTab));
    await context.close();
  }

  /* -------------------------------------------------------- mobile */
  {
    const { context, page } = await open('/mlb-simulator/results/', PHONE);
    await page.waitForSelector('.sa-metric-value', { timeout: 20000 });
    await page.waitForTimeout(1200);
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    check('the hub does not scroll sideways on a phone', overflow.doc <= overflow.win + 1,
      JSON.stringify(overflow));
    await shoot(page, 'hub-phone');
    await context.close();
  }

  /* ------------------------------------------------------ matchup */
  {
    const { context, page } = await open('/mlb-simulator/results/matchup/?matchup=' + PAIR
      + '&engine=' + ENGINE_MAJOR, DESKTOP);
    await page.waitForSelector('.sa-winbar-track', { timeout: 20000 });
    const text = await page.textContent('body');
    check('matchup page names both clubs', /Archive Harriers/.test(text) && /Archive Voyagers/.test(text));
    check('matchup page shows the simulation count', /40/.test(text), text.slice(0, 400));
    check('matchup page shows a win share bar', (await page.$$('.sa-winbar-track')).length === 1);
    check('matchup page shows sport-specific aggregate',
      /Average combined runs|Extra innings/i.test(text));
    check('matchup page charts the distribution', (await page.$$('.sa-hist-bar')).length > 1);
    // The matchup's own feed is a second request that starts once the aggregate
    // has rendered, so it is waited for rather than assumed to have landed.
    await page.waitForSelector('.sa-feed-item', { timeout: 20000 }).catch(() => {});
    check('matchup page lists individual archived simulations',
      (await page.$$('.sa-feed-item')).length > 0);
    check('matchup page publishes the engine slice', /Engine/i.test(text));
    await shoot(page, 'matchup-desktop');
    await context.close();
  }

  {
    const { context, page } = await open('/mlb-simulator/results/matchup/?matchup=' + PAIR
      + '&engine=' + ENGINE_MAJOR, PHONE);
    await page.waitForSelector('.sa-winbar-track', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
    }));
    check('the matchup page does not scroll sideways on a phone', overflow.doc <= overflow.win + 1,
      JSON.stringify(overflow));
    await shoot(page, 'matchup-phone');
    await context.close();
  }

  /* --------------------------------------------------------- club */
  {
    const { context, page } = await open('/mlb-simulator/results/team/?team=ZZH&engine='
      + ENGINE_MAJOR, DESKTOP);
    await page.waitForSelector('.sa-statgrid', { timeout: 20000 });
    const text = await page.textContent('body');
    check('club page names the club', /Archive Harriers/.test(text));
    check('club page shows a simulated record', /Simulated record/i.test(text));
    check('club page shows scored and allowed', /Average scored/i.test(text) && /Average allowed/i.test(text));
    check('club page breaks results down by opponent', /By opponent/i.test(text));
    await shoot(page, 'team-desktop');
    await context.close();
  }

  /* ----------------------------------------------- one box score */
  {
    const { context, page } = await open('/mlb-simulator/results/run/?id=' + runId, DESKTOP);
    await page.waitForSelector('.sa-team-score', { timeout: 20000 });
    const text = await page.textContent('body');
    check('the archived box score reopens', /Final/i.test(text));
    check('it shows the inning breakdown', (await page.$$('.sa-linescore')).length === 1);
    check('it shows the full player box score', /V\. Leadoff/.test(text) && /H\. Cleanup/.test(text));
    check('it shows the pitchers', /A\. Starter/.test(text));
    check('it shows the team statistics', /Team statistics/i.test(text));
    check('it shows the starting lineups', /Starting lineups/i.test(text));
    check('it names the engine that produced it', text.indexOf(ENGINE) !== -1);
    check('it never names the visitor',
      !/user_id|actor_hash|session_id/i.test(text) && /(signed-in|anonymous) visitor/i.test(text));
    await shoot(page, 'run-desktop');
    await context.close();
  }

  {
    const { context, page } = await open('/mlb-simulator/results/run/?id=' + runId, PHONE);
    await page.waitForSelector('.sa-team-score', { timeout: 20000 });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
    }));
    check('the box score does not scroll sideways on a phone', overflow.doc <= overflow.win + 1,
      JSON.stringify(overflow));
    await shoot(page, 'run-phone');
    await context.close();
  }

  /* ------------------------------------------- the simulator embed */
  {
    const { context, page } = await open('/mlb-simulator/', DESKTOP);
    await page.waitForSelector('[data-sa="panel"] .sa-metric-value', { timeout: 25000 });
    const panelText = await page.textContent('[data-sa="panel"]');
    check('the simulator page carries the archive panel', /Simulations today/i.test(panelText));
    check('the panel links to the full archive', /Open the full archive/i.test(panelText));
    const order = await page.evaluate(() => {
      var sim = document.querySelector('.sim-workspace') || document.querySelector('main');
      var pan = document.querySelector('[data-sa="panel"]');
      if (!sim || !pan) return null;
      return sim.compareDocumentPosition(pan) & Node.DOCUMENT_POSITION_FOLLOWING ? 'below' : 'above';
    });
    check('the panel sits BELOW the simulator, never above it', order === 'below', String(order));
    await shoot(page, 'simulator-embed');
    await context.close();
  }

  // Network noise from running the site off a loopback origin is not a defect in
  // this feature: config.js deliberately adds a http://localhost:3000 fallback
  // when the hostname is local, and the MLB simulator fetches ESPN and MLB
  // directly from the browser, which CORS refuses from any origin but the real
  // one. Both are the host page behaving as designed. Everything else counts.
  const IGNORABLE = /localhost:3000|ERR_CONNECTION_REFUSED|espn\.com|mlb\.com|CORS policy|ERR_FAILED|Failed to load resource/i;
  const real = consoleErrors.filter((e) => !IGNORABLE.test(e));
  check('no page logged a console error of its own', real.length === 0, real.slice(0, 3).join('\n          '));

  await browser.close();
  server.close();

  /* ------------------------------------------------------ cleanup */
  await cleanup();
  const left = await pool.query('SELECT COUNT(*)::int n FROM sim_runs WHERE run_uid LIKE $1',
    ['mlb:' + UID_PREFIX + '%']);
  check('the test leaves the database exactly as it found it', left.rows[0].n === 0);

  console.log(log.join('\n'));
  console.log('\n  ' + passed + ' passed, ' + failed + ' failed\n');
  if (SHOTS) console.log('  screenshots: ' + SHOTS + '\n');
  await pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error('\nFATAL', e);
  try { await cleanup(); } catch (e2) { console.error('cleanup failed', e2 && e2.message); }
  try { await pool.end(); } catch (e3) { /* shutting down */ }
  process.exit(1);
});
