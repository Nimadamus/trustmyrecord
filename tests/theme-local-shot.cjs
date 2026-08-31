// Render a prod URL but serve HTML/CSS/JS from this working tree when the file exists.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' };
(async () => {
  const out = process.argv[2]; const urls = process.argv.slice(3);
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } });
  let served = 0, passed = 0;
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== 'trustmyrecord.com') return route.continue();
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const ext = path.extname(rel);
    if (!TYPES[ext]) return route.continue();
    const f = path.join(ROOT, rel);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { passed++; return route.continue(); }
    served++;
    return route.fulfill({ status: 200, headers: { 'content-type': TYPES[ext] }, body: fs.readFileSync(f) });
  });
  const pg = await ctx.newPage();
  for (const u of urls) {
    const name = u.replace(/^https?:\/\/[^/]+\//, '').replace(/[^a-z0-9]+/gi, '_').replace(/_$/, '') || 'home';
    await pg.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await pg.waitForTimeout(5000);
    await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(1200);
    await pg.evaluate(() => window.scrollTo(0, 0)); await pg.waitForTimeout(600);
    await pg.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    console.log(`${name}.png h=${await pg.evaluate(() => document.body.scrollHeight)} localFiles=${served} passthrough=${passed}`);
  }
  await b.close();
})();
