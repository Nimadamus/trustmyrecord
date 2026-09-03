const { chromium } = require('playwright');
const { installOverlay } = require('./overlay.cjs');
(async () => {
  const out = process.argv[2], url = process.argv[3], pick = process.argv[4] === 'pick';
  const b = await chromium.launch({ headless: true });
  for (const [name, w, h] of [['desktop',1440,900],['tablet',820,1180],['mobile',390,844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await installOverlay(ctx);
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0,140)));
    p.on('console', m => { if (m.type()==='error') errs.push(m.text().slice(0,140)); });
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForSelector('#lobbyBoardRows .sb-odds', { timeout: 45000 }).catch(()=>{});
    await p.waitForTimeout(1500);
    if (pick) { await p.locator('#lobbyBoardRows .sb-odds:not(.is-empty)').first().click(); await p.waitForTimeout(800); }
    await p.screenshot({ path: `${out}/v2-${name}${pick?'-pick':''}.png` });
    console.log(name, 'sbv2=', await p.evaluate(()=>document.documentElement.className), 'errs', errs.length, JSON.stringify(errs.slice(0,4)));
    await ctx.close();
  }
  await b.close();
})();
