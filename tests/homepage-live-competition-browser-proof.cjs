#!/usr/bin/env node
/**
 * LIVE COMPETITION CARD — browser proof.
 *
 * Drives a real Chromium against the homepage and proves the things a static
 * test cannot: that the card rotates, that its height does not move a pixel
 * while it does, that no view overflows or clips at any width the site is used
 * at, and — the one that matters most — that every name and number on screen
 * came out of the API rather than out of the markup.
 *
 *   node tests/homepage-live-competition-browser-proof.cjs
 *   TMR_PROOF_URL=https://www.trustmyrecord.com/ node tests/homepage-live-competition-browser-proof.cjs
 *
 * Default target is the local preview server on 127.0.0.1:4180. Screenshots (one
 * per width) land in artifacts/live-competition-proof/.
 */
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('@playwright/test');

const URL_UNDER_TEST = process.env.TMR_PROOF_URL || 'http://127.0.0.1:4180/';
const OUT_DIR = path.resolve(__dirname, '..', 'artifacts', 'live-competition-proof');

/* Every width the card is laid out at, plus the breakpoints either side of each
   of its media queries. 1179/1180 is the LIVE ON TMR strip boundary, 1024 is
   the point the hero grid collapses to one column, 379/380 is where the row
   meta is dropped. */
const WIDTHS = [1600, 1440, 1400, 1399, 1280, 1180, 1179, 1100, 1025, 1024, 900, 768, 600, 520, 519, 430, 414, 390, 380, 379, 360, 320];

/* The dwell is 5200ms in static/js/tmr-home-live.js. Sample well past two of
   them so a rotation is guaranteed to have happened. */
const DWELL_MS = 5200;

const failures = [];
function check(ok, message) {
  if (!ok) failures.push(message);
  return ok;
}

async function readCard(page) {
  return page.evaluate(() => {
    const card = document.querySelector('.spot');
    const stage = document.querySelector('.comp-stage');
    if (!card || !stage) return null;
    const live = stage.querySelector('.comp-view.is-on') || stage.querySelector('.comp-view');
    const rows = [...(live ? live.querySelectorAll('.comp-row') : [])];
    const box = (el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top, left: r.left }; };
    const title = document.querySelector('.comp-title');
    const foot = document.querySelector('.comp-foot');
    return {
      cardH: Math.round(card.getBoundingClientRect().height * 100) / 100,
      cardBox: box(card),
      stageH: stage.getBoundingClientRect().height,
      category: (document.querySelector('.comp-cat') || {}).textContent?.trim() || '',
      note: (document.querySelector('.comp-note') || {}).textContent?.trim() || '',
      headline: (title || {}).textContent?.trim() || '',
      headerLabel: (document.querySelector('.spot .hd b') || {}).textContent?.trim() || '',
      footer: (foot || {}).textContent?.trim() || '',
      cta: (document.querySelector('.spot .ft .ftlinks a') || {}).textContent?.trim() || '',
      layers: stage.querySelectorAll('.comp-view').length,
      rows: rows.map((r) => ({
        text: r.textContent.replace(/\s+/g, ' ').trim(),
        name: (r.querySelector('.comp-nm, .comp-tx b') || {}).textContent?.trim() || '',
        value: (r.querySelector('.comp-num') || {}).textContent?.trim() || '',
        // What the SERVER handed us, independent of where the count-up
        // animation happens to be at the instant of the sample.
        valueFinal: (r.querySelector('.comp-num') || {}).getAttribute?.('data-text') || '',
        clipped: r.scrollWidth > r.clientWidth + 1,
        box: box(r),
      })),
      titleClipped: title ? title.scrollWidth > title.clientWidth + 1 : false,
      footClipped: foot ? foot.scrollHeight > foot.clientHeight + 1 : false,
      docOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      skeleton: !!document.querySelector('.spot.comp .bd.is-skel'),
    };
  });
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  const consoleErrors = [];
  /* A bare "Failed to load resource: 404" from the console names nothing, which
     makes the failure unactionable. Record the URL that actually failed. */
  const failedRequests = [];
  page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => failedRequests.push(`failed ${r.url()}`));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(URL_UNDER_TEST, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.spot.comp .comp-row .comp-nm, .spot.comp .comp-row .comp-tx', { timeout: 20000 });
  /* Wait for the payload to have landed rather than for a fixed beat: the card
     ships as a skeleton and settles when the request does, which on a cold
     backend is seconds, not milliseconds. Failing here is itself the assertion
     that it settles at all. */
  await page.waitForSelector('.spot.comp .bd:not(.is-skel)', { timeout: 30000 });

  /* ---- 1. the payload is the source of every row ------------------------- */
  /* Same-origin only on the local preview server, which proxies /api. Against
     production the API is a different host, and probing the site's own origin
     for it would 404 into this run's own failed-request list. */
  const api = await page.evaluate(async () => {
    const local = ['127.0.0.1', 'localhost'].includes(location.hostname);
    const url = local ? '/api/users/competition'
      : 'https://trustmyrecord-api.onrender.com/api/users/competition';
    const r = await fetch(url).catch(() => null);
    return r && r.ok ? r.json() : null;
  }).catch(() => null);

  check(api && Array.isArray(api.views) && api.views.length >= 2,
    `API returned ${api && api.views ? api.views.length : 0} competition views; the card needs at least 2 to rotate`);

  const apiNames = new Set();
  const apiValues = new Set();
  (api && api.views ? api.views : []).forEach((v) => {
    check(Array.isArray(v.rows) && v.rows.length >= 3, `view "${v.key}" shipped ${v.rows ? v.rows.length : 0} rows; views with fewer than 3 real rows must be omitted, never padded`);
    (v.rows || []).forEach((r) => {
      if (r.competitor && r.competitor.username) apiNames.add(r.competitor.username);
      if (r.value_text) apiValues.add(r.value_text);
    });
  });

  /* ---- 2. rotation, and a card height that does not move ----------------- */
  const seen = [];
  const heights = new Set();
  for (let i = 0; i < 8; i += 1) {
    const c = await readCard(page);
    check(c && !c.skeleton, 'card is still in its skeleton state after the payload landed');
    if (c) {
      heights.add(c.cardH);
      if (!seen.length || seen[seen.length - 1].category !== c.category) seen.push(c);
      check(c.layers <= 2, `stage held ${c.layers} view layers; a swap keeps two at most`);
      check(!c.docOverflowX, `document overflows horizontally at 1440 on view "${c.category}"`);
      c.rows.forEach((r, n) => check(!r.clipped, `row ${n + 1} of "${c.category}" is clipped horizontally: ${r.text}`));
      // Every visible competitor name must exist in the API payload.
      c.rows.forEach((r) => {
        if (!r.name) return;
        check(apiNames.has(r.name), `"${r.name}" is on the card but not in the API payload — the card must never render a name it was not handed`);
      });
      c.rows.forEach((r) => {
        if (!r.valueFinal) return;
        check(apiValues.has(r.valueFinal), `value "${r.valueFinal}" is on the card but not in the API payload`);
      });
    }
    await page.waitForTimeout(Math.round(DWELL_MS / 2));
  }

  /* The count-up must land on the server's own string, every time. A number
     that animates and then stops short is a wrong number on the homepage, and
     it is the exact failure a throttled requestAnimationFrame produces. */
  await page.waitForTimeout(1400);
  const settled = await readCard(page);
  (settled ? settled.rows : []).forEach((r, n) => {
    if (!r.valueFinal) return;
    check(r.value === r.valueFinal,
      `row ${n + 1} settled on "${r.value}" but the payload says "${r.valueFinal}" — the count-up did not finish`);
  });

  check(seen.length >= 2, `card showed ${seen.length} distinct view(s) over ~20s; it must rotate`);
  check(heights.size === 1, `card height changed while rotating: ${[...heights].join(', ')}px — it must be identical on every view`);

  /* ---- 3. the permanent header and footer -------------------------------- */
  const first = seen[0] || {};
  check(/live competition/i.test(first.headerLabel || ''), `header label is "${first.headerLabel}", expected LIVE COMPETITION`);
  check(/the tmr race never stops/i.test(first.headline || ''), `headline is "${first.headline}", expected THE TMR RACE NEVER STOPS`);
  check(/competitors/.test(first.footer || '') && /verified picks/.test(first.footer || '') && /standings update live/.test(first.footer || ''),
    `footer reads "${first.footer}"`);
  check(/enter the competition/i.test(first.cta || ''), `CTA reads "${first.cta}"`);
  /* Read the footer and the API in the same breath. These counts are live —
     a pick graded between the page load and this assertion legitimately moves
     the site-wide total — so comparing a footer painted at load against an API
     read twenty seconds later tests the clock, not the card. Accept either the
     load-time snapshot or the current one. */
  const footNow = await page.evaluate(async () => {
    const foot = (document.querySelector('.comp-foot') || {}).textContent || '';
    const local = ['127.0.0.1', 'localhost'].includes(location.hostname);
    const url = local ? '/api/users/competition'
      : 'https://trustmyrecord-api.onrender.com/api/users/competition';
    const r = await fetch(url).catch(() => null);
    const live = r && r.ok ? await r.json() : null;
    return { foot: foot.trim(), live: live && live.footer };
  });
  const n = (v) => Number(v).toLocaleString('en-US');
  const footerMatches = (f) => f && footNow.foot.includes(n(f.competitors)) && footNow.foot.includes(n(f.verified_picks));
  check(footerMatches(footNow.live) || footerMatches(api && api.footer),
    `footer "${footNow.foot}" matches neither the load-time counts nor the current ones`);

  /* ---- 4. every width, every view ---------------------------------------- */
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 700 ? 900 : 1000 });
    await page.waitForTimeout(350);
    const perWidth = new Set();
    for (let i = 0; i < 3; i += 1) {
      const c = await readCard(page);
      if (!c) continue;
      perWidth.add(c.cardH);
      check(!c.docOverflowX, `document overflows horizontally at ${width}px (view "${c.category}")`);
      check(!c.titleClipped, `headline is clipped at ${width}px`);
      check(!c.footClipped, `footer sentence is clipped at ${width}px`);
      c.rows.forEach((r, n) => check(!r.clipped, `row ${n + 1} clipped at ${width}px on "${c.category}": ${r.text}`));
      // Rows must not overlap each other.
      for (let k = 1; k < c.rows.length; k += 1) {
        const above = c.rows[k - 1].box;
        const below = c.rows[k].box;
        check(below.top >= above.top + above.h - 1.5,
          `rows ${k} and ${k + 1} overlap at ${width}px on "${c.category}"`);
      }
      await page.waitForTimeout(Math.round(DWELL_MS / 2) + 200);
    }
    check(perWidth.size === 1, `card height changed while rotating at ${width}px: ${[...perWidth].join(', ')}px`);
    await page.screenshot({ path: path.join(OUT_DIR, `card-${width}.png`), clip: await page.evaluate(() => {
      const r = document.querySelector('.spot').getBoundingClientRect();
      return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: Math.min(r.width + 16, innerWidth), height: r.height + 16 };
    }) }).catch(() => {});
  }

  /* ---- 5. reduced motion still rotates ----------------------------------- */
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.spot.comp .comp-row', { timeout: 20000 });
  await page.waitForSelector('.spot.comp .bd:not(.is-skel)', { timeout: 30000 });
  const rmCats = new Set();
  const rmHeights = new Set();
  for (let i = 0; i < 6; i += 1) {
    const c = await readCard(page);
    if (c) { rmCats.add(c.category); rmHeights.add(c.cardH); }
    await page.waitForTimeout(Math.round(DWELL_MS / 2));
  }
  check(rmCats.size >= 2, 'card stopped rotating under prefers-reduced-motion; the rotation is content, not decoration');
  check(rmHeights.size === 1, `card height moved under prefers-reduced-motion: ${[...rmHeights].join(', ')}px`);

  /* Avatar images are the one request on this card allowed to 404: the payload
     hands over whatever avatar_url the profile has, and a member can delete the
     image behind it at any moment. The card renders initials in its place, which
     is the designed behaviour, not a defect. Anything ELSE failing is. */
  const EXPECTED_FAILURES = [
    // A member can delete the image behind their avatar_url at any moment; the
    // card renders initials in its place, which is the designed behaviour.
    /\/api\/users\/\d+\/avatar/,
    // Analytics is blocked in a clean automation profile and is not this card.
    /google-analytics\.com|googletagmanager\.com/,
    // The LIVE ON TMR strip holds an SSE connection open; closing the page
    // aborts it, which surfaces here as a failed request every single run.
    /\/api\/activity\/stream/,
  ];
  const realFailures = failedRequests.filter((u) => !EXPECTED_FAILURES.some((re) => re.test(u)));
  check(realFailures.length === 0, `failed requests: ${realFailures.slice(0, 4).join(' | ')}`);
  const unexplained = consoleErrors.filter((m) => !/Failed to load resource/.test(m));
  check(unexplained.length === 0, `console errors: ${unexplained.slice(0, 4).join(' | ')}`);
  if (failedRequests.length !== realFailures.length) {
    console.log(`  note: ${failedRequests.length - realFailures.length} expected failure(s) ignored (avatars/analytics/SSE)`);
  }

  await browser.close();

  if (failures.length) {
    console.error(`\nlive-competition browser proof FAILED (${failures.length}):`);
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  console.log(`live-competition browser proof passed against ${URL_UNDER_TEST}`);
  console.log(`  views rotated: ${seen.map((s) => s.category).join(' -> ')}`);
  console.log(`  card height held at ${[...heights][0]}px across ${WIDTHS.length} widths`);
  console.log(`  screenshots: ${OUT_DIR}`);
})().catch((err) => {
  console.error('live-competition browser proof errored:', err);
  process.exit(1);
});
