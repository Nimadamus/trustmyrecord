#!/usr/bin/env node
/**
 * ROTATING INTEL STRIP (matchup ticker) — browser proof.
 *
 * Static tests can read the markup. Only a real browser can prove the four
 * claims this feature actually makes:
 *
 *   1. the card shows ONE insight at a time, not all of them;
 *   2. the strip rotates, and the sentences genuinely change;
 *   3. the card does not move a pixel while it rotates — no height change, no
 *      width change, no document reflow. This is the whole reason the lines are
 *      absolutely positioned inside a fixed box;
 *   4. nothing is clipped mid-sentence at any width the site is used at, and the
 *      page never scrolls sideways.
 *
 * It also proves the negative: the two permanent recent-form rows and the
 * permanent trend row are GONE from the card.
 *
 * The slate is served from tests/fixtures/nav-mlb-slate-with-insights.json, so
 * the proof is deterministic and needs no network and no backend deploy.
 *
 *   node tests/ticker-insight-strip-browser-proof.cjs
 *
 * Screenshots land in artifacts/ticker-insight-proof/.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'artifacts', 'ticker-insight-proof');
const FIXTURE = path.join(__dirname, 'fixtures', 'nav-mlb-slate-with-insights.json');
const PORT = Number(process.env.TMR_PROOF_PORT || 4181);

/* The rotation is INSIGHT_ROTATE_MS (5000) with a per-card stagger, so a single
   card is guaranteed to have advanced inside ~6s. Sample past two of them. */
const DWELL_MS = 5200;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

/* Every width the strip is laid out at, plus both sides of its 640px media
   query and both sides of the 1179px LIVE ON TMR boundary. */
const WIDTHS = [1600, 1440, 1280, 1180, 1179, 1024, 900, 768, 700, 641, 640, 600, 430, 414, 390, 360, 320];

const failures = [];
function check(ok, message) {
  if (!ok) failures.push(message);
  return ok;
}

function serve() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

/* One reading of every card in the strip. */
function readStrip(page) {
  return page.evaluate(() => {
    const round = (n) => Math.round(n * 100) / 100;
    const cards = [...document.querySelectorAll('.ticker .gm')]
      .filter((c) => !c.classList.contains('is-skel') && !c.classList.contains('is-msg'));
    return {
      docOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      laneH: round((document.querySelector('.ticker-games') || {}).getBoundingClientRect
        ? document.querySelector('.ticker-games').getBoundingClientRect().height : 0),
      staleRows: document.querySelectorAll('.ticker .gm-fm, .ticker .gm-tr').length,
      cards: cards.map((c) => {
        const r = c.getBoundingClientRect();
        const strip = c.querySelector('.gm-in');
        const lines = [...c.querySelectorAll('.gm-in-l')];
        const on = lines.filter((l) => l.classList.contains('is-on'));
        const live = on[0] || null;
        const body = live ? live.querySelector('b') : null;
        return {
          teams: [...c.querySelectorAll('.gm-top .t')].map((t) => t.textContent.trim()).join(' @ '),
          w: round(r.width), h: round(r.height), top: round(r.top),
          hasStrip: !!strip,
          stripH: strip ? round(strip.getBoundingClientRect().height) : 0,
          lineCount: lines.length,
          onCount: on.length,
          visible: body ? body.textContent.trim() : '',
          /* A sentence cut off mid-word is the failure mode a fixed box invites,
             so measure the text against the box it was given. */
          clipped: body ? body.scrollHeight > body.clientHeight + 1 : false,
          allTexts: lines.map((l) => (l.querySelector('b') || {}).textContent?.trim() || ''),
          cats: lines.map((l) => l.getAttribute('data-cat') || '')
        };
      })
    };
  });
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const slate = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const server = await serve();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

  /* The slate is the ONLY stub. Everything else on the homepage is allowed to
     fail exactly as it would offline; this proof is about the ticker. */
  await context.route('**/api/nav/mlb-slate*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(slate)
  }));
  await context.route('**/api/matchups/today*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, games: [] })
  }));

  const page = await context.newPage();
  /* Hold the slate at the door long enough to measure the RESERVED box, then
     let it through and measure the box that replaces it. If those two differ,
     the strip grows when the games land and shoves the hero down the page -
     the exact regression the reserved height exists to prevent, and the one a
     settled-state screenshot can never show. */
  let release = null;
  const gate = new Promise((r) => { release = r; });
  await page.route('**/api/nav/mlb-slate*', async (route) => {
    await gate;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(slate) });
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ticker .gm.is-skel', { timeout: 15000 });
  const reserved = await page.evaluate(() => {
    const s = document.querySelector('.ticker .gm.is-skel');
    const lane = document.querySelector('.ticker-games');
    const r = s.getBoundingClientRect();
    return {
      skelW: Math.round(r.width * 100) / 100,
      skelH: Math.round(r.height * 100) / 100,
      laneH: Math.round(lane.getBoundingClientRect().height * 100) / 100
    };
  });
  release();
  await page.waitForSelector('.ticker .gm-in', { timeout: 15000 });

  /* ---------- 1. the card shows one line, and holds the rest ---------- */
  const first = await readStrip(page);
  check(first.cards.length > 0, 'no matchup cards rendered');
  check(reserved.skelH === first.cards[0].h,
    `the skeleton reserves ${reserved.skelH}px but a real card is ${first.cards[0].h}px: ` +
    'the strip changes height when the slate lands');
  check(reserved.laneH === first.laneH,
    `the lane grew when the games arrived: ${reserved.laneH} -> ${first.laneH}`);
  /* Width is compared against the NARROWEST real card, not the first: a long
     live status ("Bottom 9th 4-4") widens that one card past the strip's fixed
     width, and the reserved box is meant to match the ordinary card. */
  const narrowest = Math.min(...first.cards.map((c) => c.w));
  check(Math.abs(reserved.skelW - narrowest) <= 2,
    `the skeleton card is ${reserved.skelW}px wide but the narrowest real card is ${narrowest}px`);
  check(first.staleRows === 0,
    `the old form/trend rows are still in the card (${first.staleRows} found)`);

  first.cards.forEach((c) => {
    check(c.hasStrip, `${c.teams}: no intel strip`);
    check(c.lineCount >= 2, `${c.teams}: only ${c.lineCount} insight(s) to rotate`);
    check(c.onCount === 1, `${c.teams}: ${c.onCount} lines visible at once, must be exactly 1`);
    check(!!c.visible, `${c.teams}: the visible line is empty`);
    check(!c.clipped, `${c.teams}: sentence is clipped: "${c.visible}"`);
    /* The point of the feature: the rotation must not be five versions of the
       same kind of fact. */
    const uniqueCats = new Set(c.cats.filter(Boolean));
    check(uniqueCats.size === c.cats.length,
      `${c.teams}: a category repeats inside one card (${c.cats.join(',')})`);
    check(uniqueCats.size >= 3,
      `${c.teams}: only ${uniqueCats.size} distinct categories (${c.cats.join(',')})`);
  });

  await page.screenshot({ path: path.join(OUT_DIR, 'desktop-1440-frame-1.png'), clip: { x: 0, y: 0, width: 1440, height: 200 } });

  /* ---------- 2 + 3. it rotates, and nothing moves while it does ---------- */
  const frames = [first];
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(DWELL_MS);
    frames.push(await readStrip(page));
  }
  await page.screenshot({ path: path.join(OUT_DIR, 'desktop-1440-frame-4.png'), clip: { x: 0, y: 0, width: 1440, height: 200 } });

  const rotated = frames[0].cards.filter((c, i) =>
    frames.some((f) => f.cards[i] && f.cards[i].visible !== c.visible)).length;
  check(rotated === frames[0].cards.length,
    `only ${rotated} of ${frames[0].cards.length} cards ever changed their line`);

  /* Every card, every frame, same box. A single pixel of drift here is the bug
     this design exists to prevent. */
  frames.forEach((f, fi) => {
    check(f.laneH === frames[0].laneH,
      `lane height moved on frame ${fi}: ${frames[0].laneH} -> ${f.laneH}`);
    f.cards.forEach((c, ci) => {
      const base = frames[0].cards[ci];
      check(c.h === base.h, `${c.teams}: height moved on frame ${fi} (${base.h} -> ${c.h})`);
      check(c.w === base.w, `${c.teams}: width moved on frame ${fi} (${base.w} -> ${c.w})`);
      check(c.top === base.top, `${c.teams}: card moved vertically on frame ${fi}`);
      check(c.onCount === 1, `${c.teams}: ${c.onCount} lines visible on frame ${fi}`);
      check(!c.clipped, `${c.teams}: clipped on frame ${fi}: "${c.visible}"`);
    });
    check(!f.docOverflowX, `the document scrolls sideways on frame ${fi}`);
  });

  /* Cards must not all flip on the same beat, or the strip is the noise it
     replaced. Across the frames, at least one pair should be out of phase. */
  const phases = frames[0].cards.map((c, i) =>
    frames.map((f) => (f.cards[i] || {}).visible).join('|'));
  check(new Set(phases).size > 1, 'every card rotated in lockstep');

  /* ---------- 3b. the hand-off is clean ----------

     A symmetric crossfade puts two different sentences on top of each other at
     roughly half opacity each, which in a one-line slot reads as a rendering
     bug. The outgoing line is given a short, undelayed exit and the incoming
     one waits for it, so at no sampled moment are two lines both legible.
     Sampled densely THROUGH a transition, not at rest. */
  const overlaps = [];
  for (let i = 0; i < 46; i++) {
    const worst = await page.evaluate(() => {
      let worstPair = 0;
      document.querySelectorAll('.ticker .gm-in').forEach((strip) => {
        const shown = [...strip.querySelectorAll('.gm-in-l')]
          .map((l) => parseFloat(getComputedStyle(l).opacity) || 0)
          .sort((a, b) => b - a);
        /* The second most visible line is the one that must be out of the way. */
        if (shown.length > 1 && shown[1] > worstPair) worstPair = shown[1];
      });
      return Math.round(worstPair * 1000) / 1000;
    });
    overlaps.push(worst);
    await page.waitForTimeout(150);
  }
  const worstOverlap = Math.max(...overlaps);
  check(worstOverlap <= 0.12,
    `two insights were legible at once (second line reached ${worstOverlap} opacity)`);

  /* ---------- 4. hover pauses, so a line can be finished ---------- */
  await page.hover('.ticker');
  const held = await readStrip(page);
  await page.waitForTimeout(DWELL_MS + 1200);
  const stillHeld = await readStrip(page);
  const moved = held.cards.filter((c, i) => stillHeld.cards[i].visible !== c.visible).length;
  check(moved === 0, `${moved} card(s) rotated while the pointer was over the ticker`);
  await page.mouse.move(0, 0);

  /* ---------- 5. every width ---------- */
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(320);
    const at = await readStrip(page);
    check(!at.docOverflowX, `document scrolls sideways at ${width}px`);
    at.cards.forEach((c) => {
      check(c.onCount === 1, `${width}px ${c.teams}: ${c.onCount} lines visible`);
      check(!c.clipped, `${width}px ${c.teams}: clipped "${c.visible}"`);
      check(c.w <= width, `${width}px ${c.teams}: card is ${c.w}px, wider than the viewport`);
    });
    if (width === 390 || width === 768 || width === 1440) {
      await page.screenshot({ path: path.join(OUT_DIR, `width-${width}.png`), clip: { x: 0, y: 0, width, height: 260 } });
    }
  }

  /* ---------- 6. reduced motion still swaps, just without travel ---------- */
  const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await rm.route('**/api/nav/mlb-slate*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(slate)
  }));
  const rmPage = await rm.newPage();
  await rmPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await rmPage.waitForSelector('.ticker .gm-in', { timeout: 15000 });
  const rmBefore = await readStrip(rmPage);
  await rmPage.waitForTimeout(DWELL_MS + 1500);
  const rmAfter = await readStrip(rmPage);
  const rmMoved = rmBefore.cards.filter((c, i) => rmAfter.cards[i].visible !== c.visible).length;
  check(rmMoved > 0, 'reduced motion stopped the rotation entirely; it should still swap');
  rmAfter.cards.forEach((c, i) => check(c.h === rmBefore.cards[i].h,
    `${c.teams}: reduced-motion height moved`));
  await rm.close();

  /* ---------- report ---------- */
  const sample = first.cards.slice(0, 3).map((c) =>
    `  ${c.teams}\n${c.allTexts.map((t, i) => `    ${i + 1}. [${c.cats[i]}] ${t}`).join('\n')}`).join('\n');
  console.log(`\nCards: ${first.cards.length}   lane ${first.laneH}px   card ${first.cards[0].h}px` +
    `   strip ${first.cards[0].stripH}px`);
  console.log(`Worst simultaneous second line: ${worstOverlap} opacity (limit 0.12)`);
  console.log(`Reserved before the slate landed: ${reserved.skelW}x${reserved.skelH}px ` +
    `(card ${first.cards[0].w}x${first.cards[0].h}px) - no growth on arrival`);
  console.log(`Insights per card: ${first.cards.map((c) => c.lineCount).join(', ')}`);
  console.log(`\nWhat a card rotates through:\n${sample}`);
  console.log(`\nScreenshots: ${path.relative(ROOT, OUT_DIR)}`);

  await browser.close();
  server.close();

  if (failures.length) {
    console.error(`\n${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log('\nticker rotating intel strip: one line at a time, rotates, zero layout movement, clean at every width\n');
})().catch((err) => { console.error(err); process.exit(1); });
