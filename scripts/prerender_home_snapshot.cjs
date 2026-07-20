#!/usr/bin/env node
/**
 * prerender_home_snapshot.cjs - bake the REAL current homepage data into index.html.
 *
 * Why: the homepage is a static GitHub Pages document with no SSR. Its live regions
 * ship placeholder em-dashes and "Loading ..." strings that only tmr-home-live.js can
 * fill, and that script cannot finish until the Render API answers - measured at ~8s
 * on a cold backend. Every visitor therefore saw a placeholder homepage first and the
 * real one several seconds later.
 *
 * This runs the page's OWN JavaScript in a headless browser against the live API,
 * waits until every live region is populated, and writes the resulting markup back
 * into index.html between <!--MK:key--> markers. The values are whatever the real API
 * returned - nothing is computed here, so this cannot invent or drift from the client.
 * On the next visit the same script still runs and refreshes these nodes in place
 * (progressive enhancement), exactly like scripts/prerender_directory.py does for
 * /handicappers/ and /leaderboards/.
 *
 * Fail-closed: if any region is still showing a placeholder when the timeout expires,
 * NOTHING is written and the process exits non-zero. A stale-but-real homepage is
 * always better than one that bakes placeholders back in.
 *
 *   node scripts/prerender_home_snapshot.cjs [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.dirname(__dirname);
const HOME = path.join(ROOT, 'index.html');
const TIMEOUT_MS = 120000;

// Region key -> selector whose innerHTML the page's own JS owns.
// `need` is a selector that MUST exist inside the region before it counts as
// populated. Without it a region holding nothing but its own <!--MK:--> comments
// reads as "non-empty" and the markers get baked in place of the real content.
const REGIONS = [
  { key: 'homeTicker', sel: '.ticker-games', need: '.gm' },
  { key: 'homeStats', sel: '.bridge-in', need: '.s b' },
  { key: 'homeCapper', sel: '.spot .bd', need: '.g3 b' },
  { key: 'homeLivePicks', sel: '.board .card:nth-of-type(1) .body', need: '*' },
  { key: 'homeLeaderboard', sel: '.board .card:nth-of-type(2) .body', need: '*' },
  { key: 'homeSportsTalk', sel: '.board .card:nth-of-type(3) .body', need: '*' },
];

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end('not found');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// A region is unusable if it is empty once its own marker comments are removed, or if
// it still carries a placeholder the client meant to replace.
function isPlaceholder(html) {
  const stripped = (html || '').replace(/<!--[\s\S]*?-->/g, '').trim();
  return !stripped || /class="loading"/.test(html) || />\s*—\s*</.test(html);
}

(async () => {
  const { chromium } = require('playwright');
  const srv = await serve();
  const port = srv.address().port;
  // channel:'chromium' launches the FULL chromium build. Without it Playwright 1.49+
  // reaches for the separate "chromium_headless_shell" download, which
  // `playwright install chromium` does not fetch - CI then dies with
  // "Executable doesn't exist at .../chromium_headless_shell-1148/...".
  const browser = await chromium.launch({ channel: 'chromium' });
  let out = null, failure = null;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });

    // Wait for the page's own scripts to fill every region.
    await page.waitForFunction((regions) => {
      return regions.every(r => {
        const el = document.querySelector(r.sel);
        if (!el) return false;
        if (r.need && !el.querySelector(r.need)) return false;
        const h = el.innerHTML;
        const stripped = h.replace(/<!--[\s\S]*?-->/g, '').trim();
        return stripped && !/class="loading"/.test(h) && !/>\s*—\s*</.test(h);
      });
    }, REGIONS, { timeout: TIMEOUT_MS });

    // outerHTML, not innerHTML: the <!--MK:--> markers wrap the element from the
    // outside, so replacing the whole element keeps exactly one marker pair forever.
    const baked = await page.evaluate((regions) => {
      const o = {};
      for (const r of regions) o[r.key] = document.querySelector(r.sel).outerHTML;
      return o;
    }, REGIONS);

    let text = fs.readFileSync(HOME, 'utf8');
    let changed = 0;
    for (const r of REGIONS) {
      const html = baked[r.key];
      // Markers sit OUTSIDE the captured element, so a capture can never contain one.
      // If that ever changes, every run would nest another pair - fail instead.
      if (html.includes(`<!--MK:${r.key}-->`) || html.includes(`<!--/MK:${r.key}-->`))
        throw new Error(`region ${r.key} captured its own marker - refusing to write`);
      if (isPlaceholder(html)) throw new Error(`region ${r.key} came back empty or as a placeholder - refusing to write`);
      const re = new RegExp(`(<!--MK:${r.key}-->)[\\s\\S]*?(<!--/MK:${r.key}-->)`);
      if (!re.test(text)) throw new Error(`marker <!--MK:${r.key}--> missing from index.html - the homepage markup lost its prerender anchor`);
      const next = text.replace(re, (_m, a, b) => a + html + b);
      if (next !== text) changed++;
      text = next;
    }

    // Never let a broken snapshot through: the document must keep its own identity.
    if (!/BEGIN HOME CRITICAL CSS/.test(text)) throw new Error('inline critical CSS block vanished - refusing to write');
    if (/tmr-home-(auth|live)\.js\?/.test(text)) throw new Error('homepage JS reverted to ?v= busting - refusing to write');

    out = { text, changed };
  } catch (e) {
    failure = e;
  } finally {
    await browser.close();
    srv.close();
  }

  if (failure) { console.error('prerender_home_snapshot FAILED:', failure.message); process.exit(1); }
  if (process.argv.includes('--dry-run')) {
    console.log(`dry-run: ${out.changed}/${REGIONS.length} regions would be rewritten`);
    return;
  }
  fs.writeFileSync(HOME, out.text, 'utf8');
  console.log(`homepage: baked real data into ${out.changed}/${REGIONS.length} live regions`);
})();
