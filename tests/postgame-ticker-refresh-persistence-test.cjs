#!/usr/bin/env node
/**
 * THE NINETY SECOND REFRESH MUST NOT RESTART EVERY CARD'S ROTATION.
 *
 * Measured against production on 2026-08-25, sampling the live homepage every
 * ten seconds:
 *
 *   t=70s  data-i=[2,3,3,0,...]      cards working through their lines
 *   t=90s  data-i=[0,0,0,0,...]      every card node replaced, every index 0
 *   t=180s data-i=[0,0,0,0,...]      and again
 *
 * renderTicker() replaces the lane's innerHTML, and startTickerRefresh() calls
 * it every TICKER_REFRESH_MS. So a card could never show more than the two
 * lines it got through inside one ninety second window, no matter how many were
 * written for it - which is what "Colorado-Washington shows only WP/LP" was,
 * underneath the dwell arithmetic that had already been fixed.
 *
 * This proves the two defences: an unchanged payload does not rebuild the DOM
 * at all, and a payload that DID change carries every card's sentence across
 * the rebuild.
 *
 *   node tests/postgame-ticker-refresh-persistence-test.cjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TMR_REFRESH_PROOF_PORT || 4198);
const FIXTURE = path.join(__dirname, 'fixtures', 'nav-mlb-slate-postgame.json');

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

/* Every card: which sentence it is showing, whether its node still carries the
   stamp we put on it, and where it is in its own list. */
const read = (page) => page.evaluate(() => {
  const track = document.querySelector('.ticker .ticker-track');
  const m = track ? (track.style.transform || '').match(/-?\d+/) : null;
  const shown = m ? Math.abs(Number(m[0])) / 100 : 0;
  const pages = track ? [...track.children] : [];
  return [...document.querySelectorAll('.ticker .gm')]
    .filter((c) => !c.classList.contains('is-skel') && !c.classList.contains('is-msg'))
    .map((c) => {
      const strip = c.querySelector('.gm-in');
      const on = c.querySelector('.gm-in-l.is-on b');
      const pageEl = c.closest('.ticker-page');
      return {
        key: c.getAttribute('data-game-pk')
          || (c.getAttribute('data-sport') || 'mlb') + ':'
            + [...c.querySelectorAll('.gm-top .t')].map((t) => t.textContent.trim()).join('@'),
        i: strip ? Number(strip.getAttribute('data-i') || 0) : -1,
        text: on ? on.textContent.trim() : null,
        lines: strip ? strip.querySelectorAll('.gm-in-l').length : 0,
        stamp: strip ? strip.dataset.stamp || null : null,
        visible: pageEl ? pages.indexOf(pageEl) === shown : true
      };
    });
});

const stamp = (page) => page.evaluate(() => {
  document.querySelectorAll('.ticker .gm-in').forEach((s, i) => { s.dataset.stamp = 'S' + i; });
});

(async () => {
  const slate = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const server = await serve();
  const browser = await chromium.launch();
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  /* The payload the page will be served on every refresh. Mutated later to
     prove the second defence. */
  let served = JSON.parse(JSON.stringify(slate));
  await context.route('**/api/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ ok: true })
  }));
  await context.route('**/api/nav/mlb-slate*', (r) => r.fulfill({
    status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(served)
  }));
  await context.clock.install({ time: new Date(`${slate.slate_date}T21:00:00-07:00`) });

  const page = await context.newPage();
  page.on('pageerror', (err) => failures.push(`page error: ${err.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('.ticker .gm:not(.is-skel):not(.is-msg)', { timeout: 15000 });
  await page.waitForTimeout(600);

  /* Let the visible cards get off their first line. */
  await context.clock.runFor(40000);
  await page.waitForTimeout(60);
  await stamp(page);
  const before = await read(page);
  const moved = before.filter((c) => c.i > 0);
  check(moved.length > 0, 'no card advanced before the refresh - the rotation itself is broken');

  /* ---------- 1. an unchanged payload must not rebuild anything ---------- */
  await context.clock.runFor(95000);          // past TICKER_REFRESH_MS
  await page.waitForTimeout(120);
  const after = await read(page);

  const lost = after.filter((c) => !c.stamp);
  check(lost.length === 0,
    `the refresh replaced ${lost.length} card node(s) even though the payload was identical`);

  moved.forEach((b) => {
    const a = after.find((c) => c.key === b.key);
    check(!!a && a.i >= b.i,
      `${b.key}: went backwards over the refresh (line ${b.i} -> ${a && a.i}) - `
      + 'this is the defect that made every card look frozen on WP/LP');
    check(!a || a.i !== 0 || b.i === 0,
      `${b.key}: reset to its first line over the refresh`);
  });

  /* ---------- 2. a payload that DID change carries the rotation ----------

     Measured with the clock parked either side of the refresh boundary. A card
     that is left running for another twenty seconds legitimately advances - and
     legitimately WRAPS past its last line back to its first - so the invariant
     is about the rebuild itself, not about a window of time containing one. */
  served = JSON.parse(JSON.stringify(slate));
  /* One card's score moves: the ordinary case, a game going final. */
  if (served.games && served.games.length) {
    const last = served.games[served.games.length - 1];
    last.away_score = (last.away_score || 0) + 1;
    last.status_label = 'FINAL';
  }

  /* Up to just short of the next refresh, then across it. */
  await context.clock.runFor(88000);
  await page.waitForTimeout(80);
  const justBefore = await read(page);
  await context.clock.runFor(3000);
  await page.waitForTimeout(400);            // let the mocked fetch land
  const after2 = await read(page);

  const rebuilt = after2.filter((c) => !c.stamp).length;
  check(rebuilt > 0, 'a CHANGED payload did not rebuild the row - the refresh has stopped working');

  justBefore.filter((b) => b.i > 0 && b.lines > 1).forEach((b) => {
    const a = after2.find((c) => c.key === b.key);
    if (!a) { failures.push(`${b.key}: card disappeared over the rebuild`); return; }
    /* Same sentence, or the next one or two if its own dwell came due while we
       crossed the boundary. Back to the FIRST line is the defect - unless it
       was on its last line, where advancing IS the first line. */
    const wrapped = b.i >= b.lines - 1;
    const ok = a.text === b.text || (a.i > b.i && a.i - b.i <= 2) || (wrapped && a.i <= 1);
    check(ok,
      `${b.key}: lost its place across a rebuild caused by ANOTHER card `
      + `(line ${b.i}/${b.lines} "${b.text}" -> line ${a.i} "${a.text}")`);
  });

  /* ---------- 3. and the rotation keeps running afterwards ---------- */
  const beforeRun = await read(page);
  await context.clock.runFor(30000);
  await page.waitForTimeout(80);
  const afterRun = await read(page);
  const visibleMoved = beforeRun
    .filter((c) => c.visible && c.lines > 1)
    .some((b) => {
      const a = afterRun.find((c) => c.key === b.key);
      return a && a.text !== b.text;
    });
  check(visibleMoved, 'nothing advanced after the rebuild - restoring the position stopped the clock');

  await browser.close();
  server.close();

  console.log(`\nRefresh persistence: ${before.length} cards, ${moved.length} had advanced before the first refresh.`);
  if (failures.length) {
    console.log(`\n${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log('\nThe 90s refresh preserves every card\'s place in its rotation.');
})().catch((e) => { console.error(e); process.exit(1); });
