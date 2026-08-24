#!/usr/bin/env node
/**
 * Measures the homepage's SIZE at a given viewport, from a given document.
 * Used two ways:
 *   1. against git HEAD's index.html at 1200px, which is what a 1440px screen
 *      shows at 120% browser zoom (1440 / 1.2 = 1200 CSS px), to establish the
 *      target Nima pointed at;
 *   2. against the working tree's index.html at 1440px, which is what the same
 *      screen now shows at 100%.
 * Multiply (1) by 1.2 and the two should agree.
 *
 *   node tests/homepage-scale-metrics.cjs [--baseline] [--width 1440]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TMR_SCALE_PORT || 4193);
const FIXTURE = path.join(__dirname, 'fixtures', 'nav-mlb-slate-postgame.json');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

function serve(indexHtml) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/' || rel.endsWith('/index.html')) {
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(indexHtml);
      return;
    }
    const file = path.join(ROOT, rel.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

const METRICS = `() => {
  const px = (v) => Math.round(parseFloat(v) * 100) / 100;
  const box = (sel) => {
    const n = document.querySelector(sel);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { w: px(r.width), h: px(r.height) };
  };
  const font = (sel) => {
    const n = document.querySelector(sel);
    return n ? px(getComputedStyle(n).fontSize) : null;
  };
  const card = [...document.querySelectorAll('.ticker .gm')]
    .filter((c) => !c.classList.contains('is-skel') && !c.classList.contains('is-msg'))[0];
  return {
    nav_h: box('.ds-nav') && box('.ds-nav').h,
    nav_item_font: font('.ds-mainnav .ds-navitem'),
    logo_font: font('.ds-nav .ds-logo .wd'),
    ticker_lane_h: box('.ticker-games') && box('.ticker-games').h,
    card_w: card ? px(card.getBoundingClientRect().width) : null,
    card_h: card ? px(card.getBoundingClientRect().height) : null,
    card_team_font: font('.ticker .gm .gm-top .t'),
    strip_font: font('.ticker .gm .gm-in-l b'),
    hero_h1_font: font('.hero h1.hh'),
    hero_sub_font: font('.hero p.sub'),
    cta_h: box('.hero .cta .btn') && box('.hero .cta .btn').h,
    cta_font: font('.hero .cta .btn'),
    comp_w: box('.spot.comp') && box('.spot.comp').w,
    comp_title_font: font('.comp-title'),
    comp_name_font: font('.comp-nm'),
    stats_num_font: font('.bridge-in .s b.num'),
    stats_label_font: font('.bridge-in .s span'),
    body_font: font('body'),
    doc_overflow_x: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
}`;

(async () => {
  const baseline = process.argv.includes('--baseline');
  const wIdx = process.argv.indexOf('--width');
  const width = wIdx > -1 ? Number(process.argv[wIdx + 1]) : (baseline ? 1200 : 1440);
  const html = baseline
    ? execFileSync('git', ['show', 'HEAD:index.html'], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 }).toString('utf8')
    : fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  const slate = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const server = await serve(html);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
  /* The API is on trustmyrecord-api.onrender.com, a different origin than this
     harness's 127.0.0.1 server, so even an intercepted response is still
     subject to CORS: without Access-Control-Allow-Origin the browser discards
     it and the page's fetch rejects exactly as if the network call failed. */
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  /* Playwright checks routes LIFO (last registered, first tried), so the
     specific mlb-slate stub is registered AFTER the generic catch-all - the
     catch-all would otherwise shadow it and the ticker would never see a game. */
  await ctx.route('**/api/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ ok: true })
  }));
  await ctx.route('**/api/nav/mlb-slate*', (r) => r.fulfill({
    status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(slate)
  }));
  /* The fixture's slate_date is a fixed real day (2026-08-22, the day its
     finals actually happened). tmr-home-live.js refuses any slate whose date
     does not match "today" in Pacific time, so the browser's clock is pinned
     to that same PT afternoon rather than chasing the real wall clock. */
  await ctx.clock.install({ time: new Date(`${slate.slate_date}T21:00:00-07:00`) });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.error('[pageerror]', err.message));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('.ticker .gm:not(.is-skel):not(.is-msg)', { timeout: 15000 });
  await page.waitForTimeout(600);
  const m = await page.evaluate(`(${METRICS})()`);
  console.log(JSON.stringify({ mode: baseline ? 'baseline(HEAD)' : 'working', width, metrics: m }, null, 1));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
