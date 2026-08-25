#!/usr/bin/env node
/**
 * NO HIGHLIGHT MAY FLASH PAST.
 *
 * Nima has asked for this in the same words three times: "leave each highlight
 * up a few seconds", "make sure it stays up long enough for people to be able
 * to read it", "it doesn't flash too fast". This measures it rather than
 * trusting the constants, because the number a reader actually gets is not
 * `data-dwell` - it is what survives the page window, the per-card stagger, the
 * refresh, and the half-second slide between pages.
 *
 * Two things are pinned:
 *
 *   1. EVERY line a reader sees holds for at least MIN_READ_MS while its card
 *      is on screen. A line that appears and is replaced inside a second or two
 *      is the defect, whatever produced it.
 *   2. THE PAGE SLIDING AWAY DOES NOT TURN ITS CARDS OVER IN VIEW. The leaving
 *      page advances its lines so the next visit opens on something new, and
 *      that flip must happen AFTER the slide - doing it first showed a new
 *      sentence for half a second and swept it away, which is exactly what
 *      "flashing" means here.
 *
 *   node tests/postgame-ticker-dwell-floor-test.cjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TMR_DWELL_PROOF_PORT || 4196);
const FIXTURE = path.join(__dirname, 'fixtures', 'nav-mlb-slate-postgame.json');

/* A few seconds, in his words. The band the cards are built on is 10-20s; this
   is the floor below which a line has flashed rather than been shown. */
const MIN_READ_MS = 6000;
const SAMPLE_MS = 500;
const WATCH_MS = 6 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); return ok; };

/* THE HALF SECOND THIS FILE CANNOT TIME.
   A CSS transition runs on the compositor's clock, which no fake-clock test can
   drive, so the rule that the leaving page flips its lines only once the slide
   has ENDED is checked at the source instead. It was measured the hard way: a
   fixed 560ms timer still flipped the line while the card was inside the lane,
   and the reader got that sentence for half a second. */
{
  const src = fs.readFileSync(path.join(ROOT, 'static', 'js', 'tmr-home-live.js'), 'utf8');
  const fn = src.slice(src.indexOf('function advanceLeavingPage'),
    src.indexOf('function applyTickerPage'));
  check(fn.length > 0, 'advanceLeavingPage is gone - the leaving page no longer turns over');
  /* The SUBSCRIPTION, not the word. Checking for "transitionend" anywhere in the
     function passes on a version that only ever removes the listener - which is
     exactly what a first cut of this assertion did. */
  check(/addEventListener\(\s*'transitionend'/.test(fn),
    'the leaving page flips its lines on a timer alone: a slide that runs long turns a card '
    + 'over while the reader is still looking at it');
  check(/tkPageIndex\] === page/.test(fn),
    'the flip does not check that the page is still gone - a reader on the arrows can bring it '
    + 'back before the flip lands');
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

const read = (page) => page.evaluate(() => {
  const lane = document.querySelector('.ticker .ticker-games');
  const laneBox = lane ? lane.getBoundingClientRect() : { left: 0, right: 0 };
  const track = document.querySelector('.ticker .ticker-track');
  const pages = track ? [...track.children] : [];
  const m = track ? (track.style.transform || '').match(/-?\d+/) : null;
  const shown = m ? Math.abs(Number(m[0])) / 100 : 0;
  return [...document.querySelectorAll('.ticker .gm')]
    .filter((c) => !c.classList.contains('is-skel') && !c.classList.contains('is-msg'))
    .map((c) => {
      const pageEl = c.closest('.ticker-page');
      const on = c.querySelector('.gm-in-l.is-on b');
      const r = c.getBoundingClientRect();
      return {
        key: c.getAttribute('data-game-pk')
          || (c.getAttribute('data-sport') || 'mlb') + ':'
            + [...c.querySelectorAll('.gm-top .t')].map((t) => t.textContent.trim()).join('@'),
        text: on ? on.textContent.trim() : null,
        left: (c.querySelector('.gm-in') || {}).getAttribute
          ? c.querySelector('.gm-in').getAttribute('data-left') : null,
        i: (c.querySelector('.gm-in') || {}).getAttribute
          ? c.querySelector('.gm-in').getAttribute('data-i') : null,
        onPage: pageEl ? pages.indexOf(pageEl) : -1,
        shown,
        /* ON SCREEN means the card is inside the LANE's own box, which is the
           only thing a reader can see. Page bookkeeping is not enough: during a
           slide, and for a beat after a re-layout, a card can belong to the
           page the transform names and still be sitting outside the window. */
        visible: !!lane && r.left >= laneBox.left - 2 && r.right <= laneBox.right + 2
          && r.width > 0,
        settled: true
      };
    });
});

(async () => {
  const slate = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const server = await serve();
  const browser = await chromium.launch();
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('**/api/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ ok: true })
  }));
  await context.route('**/api/nav/mlb-slate*', (r) => r.fulfill({
    status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(slate)
  }));
  await context.clock.install({ time: new Date(`${slate.slate_date}T21:00:00-07:00`) });

  const page = await context.newPage();
  page.on('pageerror', (err) => failures.push(`page error: ${err.message}`));
  /* THE SLIDE IS THE ONE THING THIS CANNOT MEASURE. A CSS transition runs on the
     compositor's real clock while everything else here runs on the installed
     fake one, so a page change that takes 500ms in a browser takes no fake time
     at all - and a card reads as still on screen long after it has gone. The
     transition is switched off so this measures the DWELL logic; the flip that
     waits for the slide is tied to `transitionend` in the page itself. */
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = '.ticker .ticker-track{transition:none !important}';
      document.head.appendChild(st);
    });
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('.ticker .gm:not(.is-skel):not(.is-msg)', { timeout: 15000 });
  await page.waitForTimeout(600);

  /* key -> { text, since } for whatever each card is currently showing to a
     reader, and the shortest hold any of them got away with. */
  const showing = new Map();
  const shortest = new Map();
  const trail = new Map();
  let t = 0;

  const sample = (rows) => {
    rows.forEach((r) => {
      if (process.env.DWELL_DEBUG) {
        if (!trail.has(r.key)) trail.set(r.key, []);
        const arr = trail.get(r.key);
        arr.push({ t, visible: r.visible, settled: r.settled, left: r.left, i: r.i, onPage: r.onPage, shown: r.shown });
        if (arr.length > 2000) arr.shift();
      }
      const live = r.visible && r.settled && r.text;
      const held = showing.get(r.key);
      if (!live) { showing.delete(r.key); return; }
      if (!held || held.text !== r.text) {
        if (held && held.text) {
          const ms = t - held.since;
          const worst = shortest.get(r.key);
          if (!worst || ms < worst.ms) shortest.set(r.key, { ms, at: t, text: held.text, next: r.text });
        }
        showing.set(r.key, { text: r.text, since: t });
      }
    });
  };

  sample(await read(page));
  for (; t < WATCH_MS; t += SAMPLE_MS) {
    await context.clock.runFor(SAMPLE_MS);
    await page.waitForTimeout(12);
    sample(await read(page));
  }

  const measured = [...shortest.entries()];
  check(measured.length >= 4,
    `expected several cards to have changed line while on screen, got ${measured.length}`);

  measured.forEach(([key, m]) => {
    check(m.ms >= MIN_READ_MS,
      `${key}: a line held for only ${(m.ms / 1000).toFixed(1)}s before being replaced `
      + `("${m.text}" -> "${m.next}") - under the ${MIN_READ_MS / 1000}s a reader needs`);
  });

  if (process.env.DWELL_DEBUG) {
    const k = measured.sort((a, b) => a[1].ms - b[1].ms)[0];
    if (k) {
      console.log(String.fromCharCode(10) + 'DEBUG trail for ' + k[0]);
      (trail.get(k[0]) || []).filter((r) => r.t > k[1].at - 8000 && r.t < k[1].at + 4000)
        .forEach((r) => console.log('  ' + (r.t / 1000).toFixed(1) + 's vis=' + r.visible
          + ' settled=' + r.settled + ' left=' + r.left + ' i=' + r.i + ' page=' + r.onPage + '/' + r.shown));
    }
  }
  const worst = measured.sort((a, b) => a[1].ms - b[1].ms)[0];
  console.log(`\nShortest hold seen on screen: ${worst ? (worst[1].ms / 1000).toFixed(1) : '-'}s `
    + `across ${measured.length} cards over ${WATCH_MS / 1000}s.`);

  await browser.close();
  server.close();

  if (failures.length) {
    console.log(`\n${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log('Every highlight stayed up long enough to read.');
})().catch((e) => { console.error(e); process.exit(1); });
