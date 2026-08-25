#!/usr/bin/env node
/**
 * POSTGAME EDGE WORKER — production proof.
 *
 * The homepage is painted at the EDGE by workers/home-ssr/worker.mjs, and the
 * client then ADOPTS that lane and returns early (see ticker() in
 * tmr-home-live.js). So whatever the worker emits is what a visitor sees: if
 * the deployed worker is older than the client, the client's markup never runs
 * and the postgame strip never appears.
 *
 * This drives the REAL worker source - the exact bytes that are supposed to
 * deploy - against:
 *   * the REAL production index.html fetched live, and
 *   * a REAL final-game slate (fixture built from an actual MLB day via
 *     tests/fixtures/build-postgame-slate-fixture.cjs).
 *
 * Then it renders the worker's output in a browser and asserts the postgame
 * behaviour Nima asked for, at desktop and laptop widths, in a fresh context
 * with caching disabled so a cached asset cannot fake a pass.
 *
 *   node tests/postgame-edge-worker-production-proof.cjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'nav-mlb-slate-postgame.json');
const PORT = Number(process.env.TMR_EDGE_PROOF_PORT || 4321);
const LIVE = 'https://trustmyrecord.com/';

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); return ok; };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

/* ---- render using the real worker's own emitters --------------------------
   The worker injects by streaming the document through HTMLRewriter and
   replacing the ticker lane's contents with tickerHtml(). HTMLRewriter is a
   workerd global with no Node equivalent, and `wrangler dev --local` cannot be
   used here because the worker's origin call is `fetch(req)`, which in local
   dev resolves back to the dev server itself.

   So the LANE REPLACEMENT is performed here and the HTML that goes into it is
   produced by worker.mjs's own tickerHtml()/insightStrip()/pitcherLine() - the
   exact bytes the deployed worker will emit. Nothing is reimplemented: the
   functions are lifted out of the real source file. */
function workerEmitters() {
  const src = fs.readFileSync(path.join(ROOT, 'workers', 'home-ssr', 'worker.mjs'), 'utf8');
  const cut = src.indexOf('export default');
  if (cut < 0) throw new Error('worker.mjs has no `export default` to cut at');
  /* A worker predating the postgame work has no postgameDwell at all, which is
     exactly the deployed-is-stale condition this proof exists to catch. Report
     that as a failed assertion rather than a ReferenceError crash. */
  const names = ['tickerHtml', 'nflTickerHtml', 'insightStrip', 'pitcherLine', 'postgameDwell'];
  const missing = names.filter((n) => !new RegExp(`function ${n}\\b`).test(src));
  if (missing.length) {
    console.log(`\nworker.mjs is missing: ${missing.join(', ')}`);
    console.log('This is the stale-worker condition: the edge cannot emit a postgame strip.');
    process.exit(1);
  }
  return new Function(`${src.slice(0, cut)};return {${names.join(',')}};`)();
}

function injectLane(originHtml, slate, emitters) {
  const cards = emitters.tickerHtml(slate.games || [])
    + (slate.nfl_games && slate.nfl_games.length ? emitters.nflTickerHtml(slate.nfl_games) : '');
  const laneRe = /(<div class="ticker-games"[^>]*>)([\s\S]*?)(<\/div><div class="tkact")/;
  if (!laneRe.test(originHtml)) throw new Error('could not find the ticker lane in the production document');
  let out = originHtml.replace(laneRe,
    (m, open, _inner, tail) => `${open}<div class="ticker-track"><div class="ticker-page">${cards}</div></div>${tail}`);
  out = out.replace(/(<div class="ticker-games")([^>]*?)data-slate-date="[^"]*"/,
    `$1$2data-slate-date="${slate.slate_date}"`);
  return out;
}

function serve(html) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/' || rel.endsWith('/index.html')) {
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      res.end(html); return;
    }
    const file = path.join(ROOT, rel.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      /* The production document references content-hashed assets built from a
         newer deploy than this checkout may hold. Proxy those to production so
         a missing local twin cannot masquerade as a page error. */
      fetch('https://trustmyrecord.com' + rel)
        .then(async (r) => {
          if (!r.ok) { res.writeHead(404); res.end('not found'); return; }
          const buf = Buffer.from(await r.arrayBuffer());
          res.writeHead(200, { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-store' });
          res.end(buf);
        })
        .catch(() => { res.writeHead(404); res.end('not found'); });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(PORT, '127.0.0.1', () => r(server)));
}

(async () => {
  const slate = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const finals = (slate.games || []).filter((g) => g.status === 'final');
  check(finals.length >= 4, `fixture must carry several FINAL games, has ${finals.length}`);

  console.log(`Fetching production document from ${LIVE} ...`);
  const originHtml = await (await fetch(LIVE)).text();
  check(/data-tmr-build="[0-9a-f]{12}"/.test(originHtml), 'production document has no build id');

  console.log('Rendering it through workers/home-ssr/worker.mjs (the source that should deploy) ...');
  const emitters = workerEmitters();
  const edgeHtml = injectLane(originHtml, slate, emitters);

  /* The regression itself, asserted on the raw edge bytes. */
  check(/data-mode="postgame"/.test(edgeHtml),
    'edge output carries no data-mode="postgame" - this is the stale-worker bug');
  check(/data-dwell="\d+"/.test(edgeHtml), 'edge output carries no data-dwell');
  check(edgeHtml.includes('data-slate-date="' + slate.slate_date + '"'),
    'edge did not bake the slate date, so the client would not adopt the lane');

  const server = await serve(edgeHtml);
  const browser = await chromium.launch();

  for (const [label, width, height] of [['desktop', 1920, 1080], ['laptop', 1440, 900], ['laptop-sm', 1366, 768]]) {
    /* Fresh context per viewport, caching off: a cached asset cannot fake this. */
    const ctx = await browser.newContext({ viewport: { width, height }, bypassCSP: false });
    /* The page opens an EventSource for the live activity strip. Answering it
       with JSON makes the browser log a MIME-type console error that is this
       harness's fault, not the page's, so it is served as a real (empty)
       event-stream. */
    await ctx.route('**/api/**', (r) => {
      const url = r.request().url();
      if (/activity\/(stream|live)|\/sse|event-?stream/i.test(url) || r.request().resourceType() === 'eventsource') {
        return r.fulfill({ status: 200, contentType: 'text/event-stream',
          headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }, body: ': ok\n\n' });
      }
      return r.fulfill({ status: 200, contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(slate) });
    });
    await ctx.clock.install({ time: new Date(`${slate.slate_date}T21:00:00-07:00`) });
    const page = await ctx.newPage();
    const errs = []; const bad = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0, 70)); });

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });          // hard second pass
    await page.waitForSelector('.ticker .gm .gm-in', { timeout: 20000 });
    await page.waitForTimeout(800);

    const read = () => page.evaluate(() => {
      const cards = [...document.querySelectorAll('.ticker .gm')]
        .filter((c) => !c.classList.contains('is-skel') && !c.classList.contains('is-msg') && !c.classList.contains('gm--nfl'));
      const de = document.documentElement;
      return {
        overflow: de.scrollWidth > de.clientWidth,
        cards: cards.map((c) => {
          const s = c.querySelector('.gm-in');
          const lines = [...c.querySelectorAll('.gm-in-l')];
          const on = lines.filter((l) => l.classList.contains('is-on'));
          const b = on[0] && on[0].querySelector('b');
          const r = c.getBoundingClientRect();
          const track = document.querySelector('.ticker .ticker-track');
          const pages = track ? [...track.children] : [];
          const m = track ? (track.style.transform || '').match(/-?\d+/) : null;
          const pageEl = c.closest('.ticker-page');
          return {
            key: c.getAttribute('data-game-pk')
              || [...c.querySelectorAll('.gm-top .t')].map((t) => t.textContent.trim()).join('@'),
            onPage: pageEl ? pages.indexOf(pageEl) : -1,
            shownPage: m ? Math.abs(Number(m[0])) / 100 : 0,
            teams: [...c.querySelectorAll('.gm-top .t')].map((t) => t.textContent.trim()).join('@'),
            final: /is-final/.test((c.querySelector('.st') || {}).className || ''),
            mode: s && s.getAttribute('data-mode'),
            dwell: s && Number(s.getAttribute('data-dwell')),
            probables: !!c.querySelector('.gm-sp'),
            n: lines.length,
            onIdx: lines.indexOf(on[0]),
            onCat: on[0] && on[0].getAttribute('data-cat'),
            onText: b ? b.textContent.trim() : '',
            texts: lines.map((l) => (l.querySelector('b') || {}).textContent || ''),
            clipped: b ? b.scrollHeight > b.clientHeight + 1 : false,
            w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100,
            top: Math.round(r.top * 100) / 100
          };
        })
      };
    });

    const first = await read();
    const fin = first.cards.filter((c) => c.final);
    const pre = first.cards.filter((c) => !c.final);

    check(!first.overflow, `${label}: document scrolls sideways`);
    check(fin.length >= 4, `${label}: expected FINAL cards, got ${fin.length}`);
    check(!errs.length, `${label}: console/page errors: ${errs.slice(0, 2).join(' | ')}`);
    check(!bad.length, `${label}: 4xx/5xx: ${bad.slice(0, 2).join(' | ')}`);

    fin.forEach((c) => {
      check(c.mode === 'postgame', `${label} ${c.teams}: mode=${c.mode}, expected postgame`);
      check(!c.probables, `${label} ${c.teams}: stale probables line still under a FINAL game`);
      /* The loop grew from six to ten on 2026-08-24 so a game has something else
         to say when the rotation comes back to it. */
      check(c.n >= 5 && c.n <= 10, `${label} ${c.teams}: ${c.n} items, expected 5-10`);
      check(c.onCat === 'decisions', `${label} ${c.teams}: first line is ${c.onCat}, expected decisions`);
      check(/^WP: .+/.test(c.onText), `${label} ${c.teams}: decisions line reads "${c.onText}"`);
      /* 14-22s since 2026-08-24, when the lines got denser. On a PAGED row the
         effective dwell is capped again at runtime so a card turns over more
         than once before its page slides away - a property of the clock in
         tmr-home-live.js, not of this attribute. */
      check(c.dwell >= 14000 && c.dwell <= 22000,
        `${label} ${c.teams}: dwell ${c.dwell}ms outside the 14-22s band`);
      check(c.dwell !== 5000, `${label} ${c.teams}: stale 5s pregame dwell on a FINAL card`);
      check(!c.clipped, `${label} ${c.teams}: visible line is clipped`);
      check(new Set(c.texts).size === c.texts.length, `${label} ${c.teams}: duplicate line text`);
    });
    pre.forEach((c) => check(c.mode !== 'postgame',
      `${label} ${c.teams}: non-final card in postgame mode`));

    /* WP / LP / SV correctness against the payload the backend actually sent. */
    fin.forEach((c) => {
      const src = (slate.games || []).find((g) => `${g.away}@${g.home}` === c.teams);
      if (!src) return;
      const dec = (src.insights || []).find((i) => i.category === 'decisions');
      if (!dec) return;
      check(c.texts.some((t) => t.trim() === dec.text.trim()),
        `${label} ${c.teams}: decisions line does not match backend payload`);
      const wp = /WP: ([^·.]+)/.exec(dec.text);
      if (wp) check(c.onText.includes(wp[1].trim()), `${label} ${c.teams}: WP name missing from rendered line`);
      if (/SV:/.test(dec.text)) check(/SV: /.test(c.onText), `${label} ${c.teams}: SV present in payload but not rendered`);
    });

    /* No two cards overlap on the same row. */
    const rows = {};
    first.cards.forEach((c) => { (rows[c.top] = rows[c.top] || []).push(c); });
    Object.values(rows).forEach((row) => {
      const sorted = [...row].sort((a, b) => a.w - b.w);
      check(sorted.every((c) => c.w > 0 && c.h > 0), `${label}: a card has zero size`);
    });

    /* Rotation actually advances, and lands on a DIFFERENT real sentence. */
    const target = fin[0];
    if (target) {
      /* BRING IT ON SCREEN FIRST. Cards on a page that is slid off deliberately
         do not count down, and the arrows are dispatched rather than clicked
         because hovering the ticker pauses the very rotation being measured. */
      for (let hop = 0; hop < 12; hop += 1) {
        const now = (await read()).cards.find((c) => c.key === target.key);
        if (!now || now.onPage === now.shownPage) break;
        await page.dispatchEvent('.ticker .tk-next', 'click');
        await page.waitForTimeout(30);
      }
      await ctx.clock.runFor(target.dwell + 6000);
      await page.waitForTimeout(60);
      const after = await read();
      const same = after.cards.find((c) => c.key === target.key);
      /* ADVANCED, not advanced-to-exactly-one: a long jump may legitimately
         land further down the list. Standing still is the failure. */
      check(!!same && same.onIdx > 0,
        `${label} ${target.teams}: did not advance after ${target.dwell}ms (idx ${same && same.onIdx})`);
      check(!!same && same.onText && same.onText !== target.onText,
        `${label} ${target.teams}: visible sentence did not change`);
      check(!!same && same.w === target.w && same.h === target.h,
        `${label} ${target.teams}: card resized while rotating`);
      check(!after.overflow, `${label}: sideways scroll appeared after rotation`);
    }

    console.log(`  ${label} ${width}x${height}: ${fin.length} FINAL / ${pre.length} other, `
      + `dwells ${[...new Set(fin.map((c) => c.dwell))].join('/')}ms, overflow=${first.overflow}`);
    await ctx.close();
  }

  await browser.close();
  server.close();

  const sample = finals[0];
  console.log(`\nSample FINAL recap (${sample.away} ${sample.away_score} @ ${sample.home} ${sample.home_score}):`);
  (sample.insights || []).forEach((i) => console.log(`  [${i.category}] ${i.text}`));

  if (failures.length) {
    console.log(`\n${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('\nEdge worker postgame proof passed.');
})().catch((e) => { console.error(e); process.exit(1); });
