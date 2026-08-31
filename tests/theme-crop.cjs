const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');const ROOT=path.join(__dirname,'..');
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
(async () => {
  const [out, url, y, h] = process.argv.slice(2);
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: Number(h)||900 } });
  await ctx.route('**/*', async r => { const u=new URL(r.request().url()); if(u.hostname!=='trustmyrecord.com')return r.continue();
    let rel=decodeURIComponent(u.pathname); if(rel.endsWith('/'))rel+='index.html'; const e=path.extname(rel); if(!TYPES[e])return r.continue();
    const f=path.join(ROOT,rel); if(!f.startsWith(ROOT)||!fs.existsSync(f))return r.continue();
    return r.fulfill({status:200,headers:{'content-type':TYPES[e]},body:fs.readFileSync(f)}); });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil:'domcontentloaded', timeout:60000 }); await p.waitForTimeout(6000);
  await p.evaluate((yy)=>window.scrollTo(0, Number(yy)), y||0); await p.waitForTimeout(700);
  await p.screenshot({ path: out });
  await b.close();
})();
