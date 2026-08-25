#!/usr/bin/env node
'use strict';

/**
 * nba-nhl-simulator-production-verify.cjs -- drive the LIVE pages.
 *
 * The other browser proof runs the pages against servers it starts itself, which
 * proves the code works. It cannot prove the deployment works: a missing asset,
 * a stale cache-busting hash, a CORS header, or an API that was never redeployed
 * are all invisible to it and all fatal to a visitor.
 *
 * So this one touches nothing local. It loads the real URLs, in a real browser,
 * at a desktop and a phone width, presses the button a visitor presses, and
 * checks what a visitor sees -- while recording every console error and every
 * failed network request the page makes.
 */

const assert = require('assert');
const { chromium } = require('playwright');

const NBA = 'https://trustmyrecord.com/nba-simulator/';
const NHL = 'https://trustmyrecord.com/nhl-simulator/';
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844, isMobile: true, hasTouch: true };

const problems = [];

function watch(page, label) {
  const errors = [];
  const failed = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 200)));
  page.on('requestfailed', (r) => {
    failed.push(r.url().slice(0, 160) + ' :: ' + ((r.failure() && r.failure().errorText) || '?'));
  });
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(r.status() + ' ' + r.url().slice(0, 160));
  });
  page.on('requestfailed', () => {});
  return { errors, failed, label };
}

async function run(browser, url, viewport, viewName, sport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: !!viewport.isMobile,
    hasTouch: !!viewport.hasTouch,
  });
  const page = await context.newPage();
  const w = watch(page, viewName);

  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  assert.strictEqual(resp.status(), 200, viewName + ': page did not return 200');

  // The team pickers must be populated from the live API before anything else.
  await page.waitForFunction(
    () => document.querySelector('#homeTeam') && document.querySelector('#homeTeam').options.length > 5,
    null,
    { timeout: 120000 },
  );
  const teamCount = await page.$eval('#homeTeam', (s) => s.options.length);
  assert.ok(teamCount >= 30, viewName + ': only ' + teamCount + ' teams loaded');

  // Choose two teams the way a visitor does. The pickers open unset, and the
  // page correctly refuses to run without them -- a first version of this script
  // pressed the button straight away and spent three minutes waiting for a
  // result that was never coming, because the page was showing "Pick two teams
  // first."
  const picked = await page.evaluate(() => {
    const away = document.querySelector('#awayTeam');
    const home = document.querySelector('#homeTeam');
    const real = (sel) => [...sel.options].filter((o) => o.value);
    const a = real(away);
    const h = real(home);
    if (a.length < 2 || h.length < 2) return null;
    away.value = a[0].value;
    home.value = h[1].value;
    away.dispatchEvent(new Event('change', { bubbles: true }));
    home.dispatchEvent(new Event('change', { bubbles: true }));
    return { away: away.value, home: home.value };
  });
  assert.ok(picked && picked.away && picked.home && picked.away !== picked.home,
    viewName + ': could not select two different teams');

  // Press the button a visitor presses.
  await page.click('#runBtn');
  await page.waitForFunction(
    () => {
      const r = document.querySelector('#result');
      return r && /\d/.test(r.textContent) && r.textContent.length > 400;
    },
    null,
    { timeout: 180000 },
  );

  const text = await page.$eval('#result', (n) => n.textContent);

  // Nothing impossible on screen.
  assert.ok(!/NaN|Infinity|undefined|\[object Object\]/.test(text),
    viewName + ': the result contains an impossible value');

  // The pieces a reader is promised.
  const heads = await page.$$eval('#result .sechead', (n) => n.map((x) => x.textContent.trim()));
  const need = ['How it played out', 'Game leaders'];
  for (const h of need) {
    assert.ok(heads.some((t) => t.indexOf(h) === 0 || t === h),
      viewName + ': missing panel "' + h + '" (saw: ' + heads.join(' | ') + ')');
  }

  const recap = await page.$eval('#result .recap', (n) => n.textContent.trim());
  assert.ok(recap.length > 20, viewName + ': no recap on the page');

  // Header scores, and the recap has to agree with them.
  const pts = await page.$$eval('#result .mh-team .pts', (n) => n.map((x) => Number(x.textContent.trim())));
  assert.strictEqual(pts.length, 2, viewName + ': header is not showing two scores');
  const hi = Math.max(...pts);
  const lo = Math.min(...pts);
  assert.ok(recap.indexOf(hi + '-' + lo) !== -1,
    viewName + ': recap "' + recap.slice(0, 70) + '" disagrees with the header ' + hi + '-' + lo);

  // Quarter or period scoring.
  assert.ok(/Quarter by quarter|Period by period|Scoring by period/i.test(text),
    viewName + ': no period or quarter scoring panel');

  // The box score tab is the default; it must have real player rows.
  const rows = await page.$$eval('#result table tbody tr', (n) => n.length);
  assert.ok(rows >= 10, viewName + ': the box score has only ' + rows + ' rows');

  if (sport === 'nhl') {
    // Three stars ride with the recap panel.
    assert.ok(/Three stars/.test(text), viewName + ': no three stars');
    const opened = await page.evaluate(() => {
      const t = [...document.querySelectorAll('#result .tabs button')]
        .find((b) => /Scoring summary/i.test(b.textContent));
      if (!t) return false;
      t.click();
      return true;
    });
    assert.ok(opened, viewName + ': no scoring summary tab');
    await new Promise((r) => setTimeout(r, 400));
    const sum = await page.$eval('#result', (n) => n.textContent);
    assert.ok(/Penalties/i.test(sum) || /unassisted|\(/.test(sum),
      viewName + ': the scoring summary rendered nothing');
  }

  if (w.errors.length) problems.push(viewName + ' console: ' + w.errors.slice(0, 4).join(' ; '));
  // Third-party beacons are not this product; only flag our own hosts.
  const ours = w.failed.filter((f) => /trustmyrecord/.test(f));
  if (ours.length) problems.push(viewName + ' failed requests: ' + ours.slice(0, 4).join(' ; '));

  console.log('  ok  ' + viewName + ' :: ' + pts.join('-') + ' :: ' + recap.slice(0, 64));
  await page.close();
  await context.close();
}

(async function main() {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    await run(browser, NBA, DESKTOP, 'NBA desktop', 'nba');
    await run(browser, NBA, MOBILE, 'NBA mobile', 'nba');
    await run(browser, NHL, DESKTOP, 'NHL desktop', 'nhl');
    await run(browser, NHL, MOBILE, 'NHL mobile', 'nhl');
  } finally {
    await browser.close();
  }

  if (problems.length) {
    console.log('\nPROBLEMS');
    problems.forEach((p) => console.log('  ' + p));
    process.exit(1);
  }
  console.log('\nPASS  both simulators verified live on desktop and mobile, '
    + 'no console errors and no failed first-party requests');
}());
