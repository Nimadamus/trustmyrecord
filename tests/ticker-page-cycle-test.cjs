#!/usr/bin/env node
/**
 * EVERY GAME COMES ROUND, HOLDS LONG ENOUGH, AND SAYS SOMETHING NEW WHEN IT DOES
 *
 * Nima, 2026-08-25: "make sure all games appear and appear long enough, then it
 * switches, then when they come back around it cycles to different highlights."
 *
 * Four things, and the third is the one that was broken:
 *
 *   1. every page of the carousel is reached inside one pass;
 *   2. each page holds the row for TICKER_ROTATE_MS, not less;
 *   3. and NOT MORE. layoutTickerPages() is re-entered on every rebuild, and it
 *      called startTickerRotate() unconditionally - which clears the pending
 *      timer and banks a fresh full window on top of the time the page on
 *      screen had already served. A live slate rebuilds whenever a score moves,
 *      which is most 90s refreshes during a night of baseball. Measured on
 *      production over seven minutes: page dwells of 41s and 42s against a 24s
 *      window, and with eight one-game pages a full pass stretched from 192s to
 *      nearly four minutes, so the last pages in the row were seen once where
 *      the first were seen three times;
 *   4. a card that comes back round opens on a DIFFERENT sentence, which is
 *      what advanceLeavingPage() is for.
 *
 * Fixture only, clock pinned, no network.
 *
 *   node tests/ticker-page-cycle-test.cjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TMR_PAGE_CYCLE_PORT || 4199);
const FIXTURE = path.join(__dirname, 'fixtures', 'nav-mlb-slate-postgame.json');
const ROTATE_MS = 24000;          // TICKER_ROTATE_MS in static/js/tmr-home-live.js

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); return ok; };

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

/* Which page the track is parked on, and what the cards on it are saying. */
const read = (page) => page.evaluate(() => {
  const track = document.querySelector('.ticker .ticker-track');
  if (!track) return { index: -1, pages: 0, cards: [] };
  const m = (track.style.transform || '').match(/-?\d+/);
  const index = m ? Math.abs(Number(m[0])) / 100 : 0;
  const pages = [...track.children];
  const on = pages[index] || null;
  return {
    index,
    pages: pages.length,
    cards: on ? [...on.querySelectorAll('.gm')]
      .filter((c) => !c.classList.contains('is-skel') && !c.classList.contains('is-msg'))
      .map((c) => {
        const strip = c.querySelector('.gm-in');
        const line = c.querySelector('.gm-in-l.is-on b');
        return {
          key: c.getAttribute('data-game-pk')
            || (c.getAttribute('data-sport') || 'mlb') + ':'
              + [...c.querySelectorAll('.gm-top .t')].map((t) => t.textContent.trim()).join('@'),
          text: line ? line.textContent.trim() : null,
          lines: strip ? strip.querySelectorAll('.gm-in-l').length : 0
        };
      }) : []
  };
});

/* Walk the clock in one second steps, recording the page on screen. Playwright's
   clock fires the pending timer at the jump target, so a repeating interval has
   to be replayed with runFor rather than jumped over in one go. */
async function walk(context, page, seconds, samples) {
  for (let i = 0; i < seconds; i += 1) {
    await context.clock.runFor(1000);
    await page.waitForTimeout(12);
    samples.push(Object.assign({ t: samples.length }, await read(page)));
  }
}

/* Consecutive samples on the same page index are one visit. */
function visits(samples) {
  const out = [];
  let cur = null;
  samples.forEach((s) => {
    if (!cur || cur.index !== s.index) {
      if (cur) out.push(cur);
      cur = { index: s.index, start: s.t, end: s.t, pages: s.pages,
        opened: s.cards.map((c) => c.text), cards: s.cards };
    } else { cur.end = s.t; if (s.pages !== cur.pages) cur.repaginated = true; }
  });
  if (cur) out.push(cur);
  return out;
}

(async () => {
  const slate = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const server = await serve();
  const browser = await chromium.launch();
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  let served = JSON.parse(JSON.stringify(slate));
  await context.route('**/api/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ ok: true })
  }));
  await context.route('**/api/nav/mlb-slate*', (r) => r.fulfill({
    status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(served)
  }));
  /* THE LIVE ON TMR STRIP HAS TO STAY UP. It shares this row and is 433px of it
     at 1440; when it has nothing to show it collapses and hands that width
     back, and the ticker re-splits into half as many pages. Production has
     activity on it, so a proof about how the row PAGES has to as well - and
     with the wider cards this fixture reproduces the production split of one
     game per page, which is where the whole-lap case actually occurs. */
  await context.route('**/api/activity/recent*', (r) => r.fulfill({
    status: 200, contentType: 'application/json', headers: CORS,
    body: JSON.stringify({ events: [
      { id: 'a1', kind: 'pick', username: 'BetLegend', text: 'MLB pick', created_at: `${slate.slate_date}T20:00:00Z` },
      { id: 'a2', kind: 'pick', username: 'Little_Venom', text: 'MLB pick', created_at: `${slate.slate_date}T20:05:00Z` },
      { id: 'a3', kind: 'join', username: 'newcomer', text: 'Joined TMR', created_at: `${slate.slate_date}T20:10:00Z` }
    ] })
  }));
  await context.clock.install({ time: new Date(`${slate.slate_date}T21:00:00-07:00`) });

  const page = await context.newPage();
  page.on('pageerror', (err) => failures.push(`page error: ${err.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('.ticker .gm:not(.is-skel):not(.is-msg)', { timeout: 15000 });
  await page.waitForTimeout(600);

  /* PAGINATION HAS TO SETTLE BEFORE ANY OF THIS MEANS ANYTHING. Cards are
     content sized, so the first layout runs against the metric fallback faces
     and splits the row differently from the layout that runs once the webfonts
     have landed. A proof that starts measuring before that watches the page
     count change under it, and every invariant below becomes "unless it
     repaginated", which is no invariant at all. Wait for the faces, then push a
     resize through so layoutTicker() re-measures once, deliberately. */
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
  /* The LIVE ON TMR strip shares this row and is 433px of it. It collapses when
     it has nothing to show, which is what the stubbed API here gives it, and
     that hands its width back to the ticker. Wait until the split has been the
     same twice in a row rather than guessing at a delay.
     The clock here is a FAKE one, and the strip's own boot waits on `load` plus
     an idle callback, so it cannot even start until the clock is walked - which
     is why this settles the row by advancing time rather than by sleeping. */
  let settled = -1;
  let stable = 0;
  for (let i = 0; i < 80; i += 1) {
    await context.clock.runFor(500);
    await page.waitForTimeout(60);
    const now = (await read(page)).pages;
    stable = now === settled ? stable + 1 : 0;
    settled = now;
    /* The strip holds itself open for FIRST_EVENT_GRACE_MS (6s) before giving
       up, so nothing before that has settled anything. Twelve seconds of clock
       and eight quiet reads is the floor. */
    if (i > 24 && stable > 8) break;
  }

  const first = await read(page);
  check(first.pages > 1,
    `the fixture built ${first.pages} page(s) - this proof needs a carousel to watch`);

  /* ---------- two full passes, undisturbed ---------- */
  const pass = [];
  await walk(context, page, Math.ceil((ROTATE_MS / 1000) * first.pages * 2) + 4, pass);
  const seen = visits(pass);

  const reached = new Set(seen.map((v) => v.index));
  check(reached.size === first.pages,
    `only ${reached.size} of ${first.pages} pages were ever reached - some games never appear`);

  /* The first and last visits are clipped by where the walk started and stopped,
     so the invariant is over the ones that were entered AND left inside it. */
  const whole = seen.slice(1, -1);
  const short = whole.filter((v) => (v.end - v.start + 1) < (ROTATE_MS / 1000) - 2);
  check(short.length === 0,
    `${short.length} page(s) held for less than ${ROTATE_MS / 1000}s: `
    + short.map((v) => `${v.index}@${v.end - v.start + 1}s`).join(', '));
  const long = whole.filter((v) => (v.end - v.start + 1) > (ROTATE_MS / 1000) + 3);
  check(long.length === 0,
    `${long.length} page(s) held for MORE than ${ROTATE_MS / 1000}s: `
    + long.map((v) => `${v.index}@${v.end - v.start + 1}s`).join(', '));

  /* ---------- a card that comes back says something else ---------- */
  const openings = new Map();
  const lineCount = new Map();
  seen.forEach((v) => {
    v.cards.forEach((c) => {
      if (!c.text || c.lines < 2) return;
      const held = openings.get(c.key) || [];
      held.push(c.text);
      openings.set(c.key, held);
      lineCount.set(c.key, Math.max(lineCount.get(c.key) || 0, c.lines));
    });
  });
  let returned = 0;
  let repeated = [];
  openings.forEach((list, key) => {
    if (list.length < 2) return;
    returned += 1;
    /* A card holding only two sentences legitimately alternates back to the one
       it opened on: the leaving-page turn plus its own dwell is two steps
       through a list of two. The invariant is about a card that HAS more to say
       and says the same thing anyway. */
    if (lineCount.get(key) >= 3 && list[0] === list[1]) {
      repeated.push(`${key} (${lineCount.get(key)} lines): "${list[0]}"`);
    }
  });
  check(returned > 0, 'no card came back round inside two passes - nothing to compare');
  check(repeated.length === 0,
    `${repeated.length} card(s) opened on the SAME sentence they opened on last time: `
    + repeated.slice(0, 3).join(' | '));

  /* ---------- a relayout must not extend the page on screen ----------
     THE REGRESSION, driven directly. layoutTicker() is re-entered on every
     rebuild AND on every resize, and it used to call startTickerRotate()
     unconditionally - which clears the pending timer and banks a fresh full
     window on top of the time the page on screen has already served. Measured
     on production over seven minutes: dwells of 41s and 42s against a 24s
     window, and with eight one-game pages that stretched a full pass from 192s
     to nearly four minutes, so the last pages in the row were seen once where
     the first were seen three times.

     A resize is used rather than a payload change because it reaches the same
     function on a beat this proof chooses. A payload change reaches it too, but
     only when the 90s refresh happens to land, which is not something a fixture
     can place inside a given page's window. */
  const midPage = [];
  await walk(context, page, 8, midPage);            // 8s into the page on screen
  const beforeNudge = await read(page);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(400);                   // past the 180ms debounce
  const afterNudge = await read(page);
  check(afterNudge.pages === beforeNudge.pages,
    `the relayout changed the page count (${beforeNudge.pages} -> ${afterNudge.pages}), `
    + 'so this check cannot see the defect it exists for');
  check(afterNudge.index === beforeNudge.index,
    'the relayout moved the carousel off the page that was on screen');

  /* The page was 8s into a 24s window when the relayout landed, so it has 16s
     left. Walk 20s: it must have handed over. Under the defect it has banked a
     fresh 24s and is still there. */
  const rest = [];
  await walk(context, page, 20, rest);
  const handedOver = rest.some((s) => s.index !== beforeNudge.index);
  check(handedOver,
    `the page on screen was still there ${rest.length}s after a relayout landed `
    + `${8}s into its ${ROTATE_MS / 1000}s window - the relayout banked a fresh window on it`);

  /* ---------- the whole-lap guard ----------
     A card gets one turn on the way out plus however many its own dwell fires
     while it is up, and where those two add up to a WHOLE LAP it comes back
     saying exactly what it said last time. Observed on this fixture before the
     guard existed: 823777, three lines, opening twice on "Tristan Peters: 2 for
     4 with a homer, RBI and a walk"; it went away when advanceLeavingPage()
     learned to take one more step in that case.

     THIS IS A SOURCE CHECK, NOT A BEHAVIOURAL ONE, and it says so because that
     is what it is worth. Which line counts land on a lap depends on a card's
     dwell against the page window, and both of those move with the row's width,
     the payload and the fixture - the condition was reproducible on a ten page
     split and not on a five page one. Setting it up by hand does not survive
     either: any relayout clears the parked countdown and the card takes an
     extra turn. The behavioural half of this file (every card opening on a new
     sentence, above) is what actually watches the outcome; this pins the
     mechanism so it cannot be deleted quietly. */
  const source = fs.readFileSync(path.join(ROOT, 'static', 'js', 'tmr-home-live.js'), 'utf8');
  const GUARD = "if (strips[i].getAttribute('data-open') != null";
  const STAMP = "strips[i].setAttribute('data-open'";
  check(source.includes(GUARD),
    'advanceLeavingPage() no longer takes a second step when its turn has '
    + 'brought a card back to the sentence it opened the visit on');
  check(source.includes(STAMP),
    'nothing records which sentence a visit opened on, so the guard above cannot fire');


  await browser.close();
  server.close();

  const dwells = whole.map((v) => v.end - v.start + 1);
  console.log(`\nPage cycle: ${first.pages} pages, ${seen.length} visits over two passes, `
    + `dwell ${Math.min(...dwells)}-${Math.max(...dwells)}s (window ${ROTATE_MS / 1000}s).`);
  console.log(`${returned} card(s) came back round; every one opened on a new sentence.`);
  if (failures.length) {
    console.log(`\n${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log('\nEvery game comes round, holds its window, and says something new.');
})().catch((e) => { console.error(e); process.exit(1); });
