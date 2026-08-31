const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' };
(async () => {
  const [out, url, mode] = process.argv.slice(2);
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  if (mode !== 'prod') await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== 'trustmyrecord.com') return route.continue();
    let rel = decodeURIComponent(u.pathname); if (rel.endsWith('/')) rel += 'index.html';
    const ext = path.extname(rel); if (!TYPES[ext]) return route.continue();
    const f = path.join(ROOT, rel); if (!f.startsWith(ROOT) || !fs.existsSync(f)) return route.continue();
    return route.fulfill({ status: 200, headers: { 'content-type': TYPES[ext] }, body: fs.readFileSync(f) });
  });
  const pg = await ctx.newPage();
  await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.waitForTimeout(5000);
  await pg.screenshot({ path: `${out}/top.png` });
  await pg.evaluate(() => document.querySelector('.ds-footer')?.scrollIntoView());
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: `${out}/foot.png` });
  await b.close();
})();
