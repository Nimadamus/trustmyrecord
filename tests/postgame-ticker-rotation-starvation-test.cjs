#!/usr/bin/env node
/**
 * FINAL CARDS MUST ACTUALLY ROTATE - starvation proof (Nima, 2026-08-25).
 *
 * "Colorado-Washington and Texas-Chicago show only WP/LP, with no rotating
 * game highlights." Both cards were carrying ten written highlights at the
 * time; what was broken was the clock, not the data. Measured against the live
 * homepage on 2026-08-25: over ninety seconds, no card on the row showed more
 * than TWO of its lines and six of the sixteen showed exactly ONE.
 *
 * The arithmetic behind it:
 *
 *   - a card's line dwells 14-22s, and its first countdown carries up to 4s of
 *     per-card stagger on top;
 *   - the page holding the card stayed up for 24s;
 *   - every time a page slid back in, resetVisibleDwell() restarted the
 *     countdown from full.
 *
 * So a card could advance at most ONCE per visit, the slowest cards (22s + 4s
 * against a 24s window) could never advance at all, and a card sitting on page
 * three of four was frozen on the line it happened to be showing.
 *
 * This proof pins the fix at the level a reader cares about: over one full
 * carousel cycle, EVERY final card must show several DIFFERENT lines, and no
 * card may sit on a single line the whole time. It is deliberately written
 * against outcomes rather than constants, so retuning the dwells is allowed and
 * starving the rotation is not.
 *
 *   node tests/postgame-ticker-rotation-starvation-test.cjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TMR_STARVATION_PROOF_PORT || 4197);
const FIXTURE = path.join(__dirname, 'fixtures', 'nav-mlb-slate-postgame.json');

/* HOW LONG TO WATCH is derived from the row itself once it has laid out: two
   full passes of the carousel plus slack, because the thing being proved is
   what a card does across VISITS, not what it does in some fixed number of
   seconds. A row that pages more finely takes longer to come round, and that
   is a fact about the layout rather than a reason to accept a frozen card. */
const PAGE_MS = 24000;
const SAMPLE_MS = 1000;

/* What "rotating" means, per card, inside that window. */
const MIN_DISTINCT_LINES = 3;

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

/* One reading of the row: every card, the line it is showing, and whether the
   page it sits on is the one on screen. */
function sample(page) {
  return page.evaluate(() => {
    const lane = document.querySelector('.ticker .ticker-games');
    const track = lane && lane.querySelector('.ticker-track');
    const pages = track ? [...track.children] : [];
    const visible = pages.findIndex((p) => {
      const t = (track.style.transform || '').match(/-?\d+/);
      const idx = t ? Math.abs(Number(t[0])) / 100 : 0;
      return pages.indexOf(p) === idx;
    });
    return [...document.querySelectorAll('.ticker .gm')]
      .filter((c) => !c.classList.contains('is-skel') && !c.classList.contains('is-msg'))
      .map((c) => {
        const strip = c.querySelector('.gm-in');
        const on = c.querySelector('.gm-in-l.is-on b');
        const pageEl = c.closest('.ticker-page');
        return {
          key: (c.getAttribute('data-game-pk') || c.getAttribute('data-espn-event-id')
            || [...c.querySelectorAll('.gm-top .t')].map((t) => t.textContent.trim()).join('@')),
          teams: [...c.querySelectorAll('.gm-top .t')].map((t) => t.textContent.trim()).join(' @ '),
          isFinal: !!c.querySelector('.st.is-final'),
          mode: strip ? strip.getAttribute('data-mode') : null,
          lines: strip ? strip.querySelectorAll('.gm-in-l').length : 0,
          onText: on ? on.textContent.trim() : null,
          onPage: pageEl ? pages.indexOf(pageEl) : -1,
          shownPage: visible
        };
      });
  });
}

(async () => {
  const slate = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const server = await serve();
  const browser = await chromium.launch();
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  /* Narrow enough that the row genuinely pages - which is the condition the bug
     needed. A single-page row rotates on its own and never showed the defect. */
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
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('.ticker .gm:not(.is-skel):not(.is-msg)', { timeout: 15000 });
  await page.waitForTimeout(600);

  const seen = new Map();      // card key -> { teams, isFinal, lines, texts:Set }
  const pagesSeen = new Set();

  const record = (rows) => {
    rows.forEach((r) => {
      if (!seen.has(r.key)) {
        seen.set(r.key, { teams: r.teams, isFinal: r.isFinal, lines: r.lines, texts: new Set() });
      }
      const e = seen.get(r.key);
      e.lines = Math.max(e.lines, r.lines);
      /* ONLY WHAT A READER COULD ACTUALLY HAVE READ: a line counts when the
         page holding it is the page on screen. */
      if (r.onText && r.onPage === r.shownPage) e.texts.add(r.onText);
      if (r.onPage >= 0) pagesSeen.add(r.onPage);
    });
  };

  const pageCount = await page.evaluate(() => {
    const track = document.querySelector('.ticker .ticker-track');
    return track ? track.children.length : 1;
  });
  const WATCH_MS = pageCount * PAGE_MS * 2 + 30000;

  record(await sample(page));
  for (let t = 0; t < WATCH_MS; t += SAMPLE_MS) {
    await context.clock.runFor(SAMPLE_MS);
    record(await sample(page));
  }

  const cards = [...seen.values()];
  const finals = cards.filter((c) => c.isFinal && c.lines > 1);

  check(finals.length >= 4, `expected several FINAL cards to watch, got ${finals.length}`);
  check(pagesSeen.size >= 2,
    'the row never paged during the watch - this proof only means something when it does');

  finals.forEach((c) => {
    const distinct = c.texts.size;
    check(distinct >= MIN_DISTINCT_LINES,
      `${c.teams}: showed ${distinct} distinct line(s) of ${c.lines} in ${WATCH_MS / 1000}s `
      + `- a reader watching a whole cycle would see the card as frozen. Seen: `
      + `${[...c.texts].map((t) => JSON.stringify(t)).join(', ')}`);
    check(distinct > 1,
      `${c.teams}: never advanced past its first line - this is the reported defect exactly`);
  });

  /* The header still leads: whatever else rotates, a final's FIRST line is its
     decisions/result line, so a reader arriving at any card knows the result. */
  const first = await sample(page);
  check(first.filter((r) => r.isFinal).every((r) => r.mode === 'postgame'),
    'a FINAL card is no longer in postgame mode');

  await browser.close();
  server.close();

  console.log(`\nWatched ${finals.length} FINAL cards for ${WATCH_MS / 1000}s across `
    + `${pagesSeen.size} page(s) - two full passes of the row.`);
  finals.forEach((c) => console.log(`  ${c.teams}: ${c.texts.size}/${c.lines} lines read`));

  if (failures.length) {
    console.log(`\n${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log('\nEvery final card rotated. No starvation.');
})().catch((e) => { console.error(e); process.exit(1); });
