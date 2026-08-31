const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2];
  const urls = process.argv.slice(3);
  const b = await chromium.launch({ headless: true });
  const pg = await b.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
  for (const u of urls) {
    const name = u.replace(/^https?:\/\/[^/]+\//, '').replace(/[^a-z0-9]+/gi, '_').replace(/_$/, '') || 'home';
    try {
      await pg.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await pg.waitForTimeout(4500);
      await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await pg.waitForTimeout(1200);
      await pg.evaluate(() => window.scrollTo(0, 0));
      await pg.waitForTimeout(600);
      await pg.screenshot({ path: `${out}/${name}.png`, fullPage: true });
      const h = await pg.evaluate(() => document.body.scrollHeight);
      console.log(`${name}.png  h=${h}`);
    } catch (e) { console.log(`${name} ERROR ${e.message}`); }
  }
  await b.close();
})();
