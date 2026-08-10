/* =============================================================================
   The featured Game File ticker card.

   Three properties are worth locking, and they are the three that were actually
   broken while building this:

   1. FAILS SILENT. No published Game File must mean no badge, no /matchups link
      and no styling. A dead link in the ticker is worse than no link.
   2. COSTS NO LAYOUT. Featuring a card must not change the ticker's height, the
      card's width, or the position of any other game. Two earlier attempts
      reserved horizontal space for the badge and pushed the three games to the
      right of it along by 65px.
   3. RESPECTS prefers-reduced-motion.

   Runs against the built homepage over a local static server, with the slate
   coming from the real API and /api/matchups/today stubbed both ways.
   ========================================================================== */
'use strict';

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8817;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
               '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
               '.woff2': 'font/woff2', '.xml': 'application/xml' };

let failures = 0;
const ok  = (m) => console.log('  ok    ' + m);
const bad = (m) => { console.log('  FAIL  ' + m); failures++; };

function serve() {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      let u = decodeURIComponent(q.url.split('?')[0]);
      if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, u);
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); return r.end('nf'); }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        r.end(d);
      });
    });
    s.listen(PORT, () => res(s));
  });
}

function measure(page) {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('.ticker .gm')];
    const strip = document.querySelector('.ticker');
    const gf = document.querySelector('.ticker .gm--gf');
    return {
      tickerH: strip ? Math.round(strip.getBoundingClientRect().height) : null,
      geometry: all.map((c) => Math.round(c.getBoundingClientRect().x) + ':' +
                               Math.round(c.getBoundingClientRect().width)).join('|'),
      featured: !!gf,
      href: gf ? gf.getAttribute('href') : null,
      badge: gf ? !!gf.querySelector('.gm-gf') : false,
      aria: gf ? gf.getAttribute('aria-label') : null,
      matchupLinks: all.filter((c) => /\/matchups\//.test(c.getAttribute('href') || '')).length,
    };
  });
}

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch { console.log('  SKIP  playwright not installed'); process.exit(0); }

  const server = await serve();
  const browser = await chromium.launch();
  try {
    const FEATURED = {
      ok: true,
      featured: {
        status: 'published',
        url: 'https://trustmyrecord.com/matchups/mlb/mets-vs-braves-g1000/',
        away_team: 'New York Mets', home_team: 'Atlanta Braves',
        game_time_utc: '2026-08-10T23:15:00.000Z',
      },
    };

    /* ---- with a published Game File ---------------------------------- */
    let page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('**/api/matchups/today', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FEATURED) }));
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForTimeout(5000);
    const on = await measure(page);
    await page.close();

    /* ---- with none published ----------------------------------------- */
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('**/api/matchups/today', (r) => r.fulfill({ status: 404, body: '{}' }));
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForTimeout(5000);
    const off = await measure(page);
    await page.close();

    if (!on.featured) bad('a published Game File should feature its ticker card');
    else ok('published: the matching ticker card is featured');

    if (on.href === FEATURED.featured.url) ok('published: the whole card links to the canonical article');
    else bad(`published: card href is ${on.href}, expected the canonical article URL`);

    if (on.badge) ok('published: the card carries a badge');
    else bad('published: no badge on the featured card');

    if (on.aria && /Game File/i.test(on.aria)) ok('published: the link has an accessible name');
    else bad('published: featured card has no descriptive aria-label');

    if (off.featured === false && off.badge === false) ok('no Game File: no card is featured');
    else bad('no Game File: a card was featured anyway');

    if (off.matchupLinks === 0) ok('no Game File: no card links into /matchups/ (no dead link)');
    else bad('no Game File: a ticker card points at /matchups/ with nothing published');

    if (on.tickerH === off.tickerH) ok(`layout: ticker height unchanged (${on.tickerH}px)`);
    else bad(`layout: ticker height moved ${off.tickerH} -> ${on.tickerH}`);

    if (on.geometry === off.geometry) ok('layout: every card keeps its exact x and width');
    else bad('layout: featuring a card MOVED other games\n' +
             '        without: ' + off.geometry + '\n        with:    ' + on.geometry);

    /* ---- reduced motion ----------------------------------------------- */
    page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await page.route('**/api/matchups/today', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FEATURED) }));
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForTimeout(5000);
    const rm = await page.evaluate(() => {
      const gf = document.querySelector('.ticker .gm--gf');
      return gf ? { anim: getComputedStyle(gf).animationName, featured: true } : { featured: false };
    });
    await page.close();

    if (rm.featured && rm.anim === 'none') ok('reduced motion: styling kept, pulse disabled');
    else if (!rm.featured) bad('reduced motion: the card lost its featured styling entirely');
    else bad(`reduced motion: animation still running (${rm.anim})`);


    /* The bug that actually shipped. On production the ticker is server-rendered
       by the tmr-home-ssr Worker, so renderTicker() never runs and the slate
       payload it captures is never set. Matching depended on that payload, so
       the feature worked locally and did nothing live. The browser cases above
       all exercise the JS-rendered path and cannot see it, so this asserts the
       fallback exists at the source level. */
    {
      const src = fs.readFileSync(path.join(ROOT, 'static', 'js', 'tmr-home-live.js'), 'utf8');
      const fn = src.slice(src.indexOf('function applyGameFile'));
      const body = fn.slice(0, fn.indexOf('var pk = gameFilePk'));
      if (/if \(!lastSlate\)/.test(body) && /nav\/mlb-slate/.test(body))
        ok('SSR path: applyGameFile fetches the slate when the strip was not rendered by this script');
      else
        bad('SSR path: applyGameFile depends on renderTicker having run - it will no-op on production');
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\nticker Game File feature: link, badge, silence when unpublished, zero layout cost');
  if (failures) { console.error(`\n${failures} failing`); process.exit(1); }
})();
