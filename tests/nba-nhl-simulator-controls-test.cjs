#!/usr/bin/env node
'use strict';

/**
 * nba-nhl-simulator-controls-test.cjs -- drive the controls a visitor actually
 * touches, against local servers so production is never involved.
 *
 * Everything checked here was, until this release, either absent from the page
 * or wired to nothing: the player-range tab told visitors to enable something no
 * control enabled, holding a player out could not be expressed at all because
 * the rotation was published without ids, and a hockey scratch had no server
 * support whatsoever. A feature that exists only in the API is not a feature, so
 * these check the click rather than the endpoint.
 */

const path = require('path');
const http = require('http');
const fs = require('fs');
const assert = require('assert');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const BACKEND = path.resolve(ROOT, '../trustmyrecord-backend');

function startApi() {
  const express = require(path.join(BACKEND, 'node_modules', 'express'));
  const app = express();
  app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });
  app.use('/', require(path.join(BACKEND, 'routes', 'nbaPublic')));
  app.use('/', require(path.join(BACKEND, 'routes', 'nhlPublic')));
  return new Promise((r) => {
    const s = app.listen(0, () => r({ server: s, port: s.address().port }));
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
};

function startStatic() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => {
    server.listen(0, () => r({ server, port: server.address().port }));
  });
}

async function openTab(page, label) {
  await page.evaluate((l) => {
    const b = [...document.querySelectorAll('#result .tabs button')]
      .find((x) => x.textContent.trim() === l);
    if (b) b.click();
  }, label);
  await page.waitForTimeout(500);
}

async function runOnce(page) {
  await page.click('#runBtn');
  await page.waitForFunction(
    () => {
      const r = document.querySelector('#result');
      return r && r.textContent.length > 800;
    },
    null, { timeout: 180000 },
  );
  await page.waitForTimeout(900);
}

async function check(browser, sport, url, apiPort) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  await ctx.addInitScript((p) => { window.TMR_SIM_API_HOST = 'http://127.0.0.1:' + p; }, apiPort);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(
    () => document.querySelector('#homeTeam') && document.querySelector('#homeTeam').options.length > 5,
    null, { timeout: 120000 },
  );

  await page.evaluate(() => {
    const a = document.querySelector('#awayTeam');
    const h = document.querySelector('#homeTeam');
    const real = (s) => [...s.options].filter((o) => o.value);
    a.value = real(a)[0].value;
    h.value = real(h)[1].value;
    a.dispatchEvent(new Event('change', { bubbles: true }));
    h.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(1200);
  await runOnce(page);

  /* 1. PLAYER RANGES ARE REAL, and carry a line the visitor can type into. */
  await openTab(page, 'Player ranges');
  const props = await page.evaluate(() => {
    const host = document.querySelector('#result .tabs').nextElementSibling;
    return {
      text: host.textContent.slice(0, 200),
      rows: host.querySelectorAll('tbody tr').length,
      inputs: host.querySelectorAll('input.lineinput').length,
      markets: [...host.querySelectorAll('.propbar select option')].map((o) => o.textContent),
      anyPercent: /%/.test(host.textContent),
    };
  });
  assert.ok(!/Run a simulation with them enabled/i.test(props.text),
    sport + ' player ranges still tells the visitor to enable something');
  assert.ok(props.rows >= 5, sport + ' player ranges has only ' + props.rows + ' rows');
  assert.ok(props.inputs >= 5, sport + ' player ranges has no line inputs');
  assert.ok(props.markets.length >= 4, sport + ' offers only ' + props.markets.length + ' markets');
  assert.ok(props.anyPercent, sport + ' player ranges shows no probabilities');

  /* 2. TYPING A LOWER LINE MUST RAISE THE OVER CHANCE. */
  const moved = await page.evaluate(() => {
    const read = () => {
      const host = document.querySelector('#result .tabs').nextElementSibling;
      const row = host.querySelector('tbody tr');
      const cells = [...row.children].map((c) => c.textContent.trim());
      const pcts = cells.filter((c) => /%$/.test(c));
      return pcts.length ? parseFloat(pcts[0]) : null;
    };
    const before = read();
    const host = document.querySelector('#result .tabs').nextElementSibling;
    const input = host.querySelector('tbody tr input.lineinput');
    input.value = String(parseFloat(input.value) - 5);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return new Promise((r) => setTimeout(() => r({ before, after: read() }), 300));
  });
  assert.ok(moved.before !== null && moved.after !== null,
    sport + ' could not read an over percentage');
  assert.ok(moved.after > moved.before,
    sport + ' lowering the line did not raise the over chance ('
    + moved.before + ' -> ' + moved.after + ')');

  /* 3. HOLDING A PLAYER OUT re-runs and reports what it changed. */
  const availTab = sport === 'NBA' ? 'Availability' : 'Lineups';
  await openTab(page, availTab);
  const lenBefore = await page.evaluate(() => document.querySelector('#result').textContent.length);
  const held = await page.evaluate(() => {
    const host = document.querySelector('#result .tabs').nextElementSibling;
    const btn = host.querySelector('button.outbtn');
    if (!btn) return null;
    const name = btn.closest('tr').children[0].textContent.trim();
    btn.click();
    return name;
  });
  assert.ok(held, sport + ' has no hold-out control in ' + availTab);
  await page.waitForFunction(
    (n) => {
      const r = document.querySelector('#result');
      return r && r.textContent.length > 800 && r.textContent.length !== n;
    },
    lenBefore, { timeout: 180000 },
  );
  await page.waitForTimeout(1200);
  await openTab(page, availTab);
  const after = await page.evaluate(() => {
    const host = document.querySelector('#result .tabs').nextElementSibling;
    const all = document.querySelector('#result').textContent;
    return {
      pressed: host.querySelectorAll('button.outbtn.on').length,
      reported: /moved the projected margin by/.test(all),
      reset: !![...document.querySelectorAll('#result button')]
        .find((x) => /Put everybody back|Dress everybody/.test(x.textContent)),
    };
  });
  assert.strictEqual(after.pressed, 1, sport + ' hold-out did not stay pressed');
  assert.ok(after.reported, sport + ' never reported what holding ' + held + ' out did');
  assert.ok(after.reset, sport + ' offers no way to undo a hold-out');

  /* 4. THE HELD-OUT PLAYER IS ACTUALLY ABSENT from the game that was played. */
  await openTab(page, 'Box score');
  const stillPlayed = await page.evaluate(
    (name) => document.querySelector('#result .tabs').nextElementSibling.textContent.indexOf(name) >= 0,
    held,
  );
  assert.ok(!stillPlayed, sport + ' held ' + held + ' out and then played him anyway');

  /* 5. SINGLE-GAME MODE plays one game and refuses to invent a projection. */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#simSeg button')]
      .find((x) => x.getAttribute('data-sims') === '1');
    b.click();
  });
  await runOnce(page);
  const single = await page.evaluate(() => {
    const r = document.querySelector('#result');
    return {
      tabs: [...r.querySelectorAll('.tabs button')].map((b) => b.textContent.trim()),
      text: r.textContent,
      hasTable: !!r.querySelector('table'),
    };
  });
  for (const gone of ['Likely scores', 'Distributions', 'Range of outcomes']) {
    assert.ok(single.tabs.indexOf(gone) < 0,
      sport + ' still offers "' + gone + '" off a single game');
  }
  assert.ok(single.tabs.indexOf('Box score') >= 0, sport + ' single game has no box score tab');
  assert.ok(single.hasTable, sport + ' single game produced no table');
  assert.ok(/One game, played out/.test(single.text),
    sport + ' single-game mode does not say it played one game');
  assert.ok(!/Projected spread|Projected total/.test(single.text),
    sport + ' printed a projection off one game');

  assert.deepStrictEqual(errors, [], sport + ' threw in the browser: ' + errors.join(' | '));
  console.log('  ok  ' + sport + ': ranges answer a typed line, ' + held
    + ' held out and absent from the box score, single-game mode withholds the projection');
  await page.close();
  await ctx.close();
}

(async function main() {
  const api = await startApi();
  const stat = await startStatic();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    await check(browser, 'NBA', 'http://127.0.0.1:' + stat.port + '/nba-simulator/', api.port);
    await check(browser, 'NHL', 'http://127.0.0.1:' + stat.port + '/nhl-simulator/', api.port);
  } finally {
    await browser.close();
    api.server.close();
    stat.server.close();
  }
  console.log('PASS  every control on both simulators does what it says');
}());
