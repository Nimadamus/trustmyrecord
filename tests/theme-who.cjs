/* Who paints this? For a page, lists the winning CSS rule for a given property
   on every distinct element class that renders it.
     node tests/theme-who.cjs <path> <prop> [selectorFilter]                */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

(async () => {
  const rel = process.argv[2], prop = process.argv[3] || 'background-color', filter = process.argv[4] || '';
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'trustmyrecord.com') return r.continue();
    let p2 = decodeURIComponent(u.pathname); if (p2.endsWith('/')) p2 += 'index.html';
    const e = path.extname(p2); if (!TYPES[e]) return r.continue();
    const f = path.join(ROOT, p2); if (!f.startsWith(ROOT) || !fs.existsSync(f)) return r.continue();
    return r.fulfill({ status: 200, headers: { 'content-type': TYPES[e] }, body: fs.readFileSync(f) });
  });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});
  await p.goto('https://trustmyrecord.com/' + rel.replace(/^\//, ''), { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(5000);
  const out = await p.evaluate((args) => {
    const prop = args[0], filter = args[1];
    const camel = prop.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
    const sel = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    const winner = (el) => {
      let best = null;
      for (const ss of document.styleSheets) {
        let rs; try { rs = ss.cssRules; } catch (e) { continue; }
        const walk = (l) => {
          for (const r of l || []) {
            if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue; }
            if (!r.selectorText) continue;
            const v = r.style.getPropertyValue(prop) || r.style.getPropertyValue(prop.replace('-color', ''));
            if (!v) continue;
            let m = false; try { m = el.matches(r.selectorText); } catch (e) { continue; }
            if (!m) continue;
            best = (ss.href || 'INLINE').split('/').pop() + ' :: ' + r.selectorText.slice(0, 70) + ' { ' + v.slice(0, 60) + (r.style.getPropertyPriority(prop) ? ' !' : '') + ' }';
          }
        };
        walk(rs);
      }
      return best;
    };
    const seen = new Map();
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect(); if (r.width < 100 || r.height < 30) continue;
      const s = getComputedStyle(el);
      const val = s[camel];
      if (!val || val === 'rgba(0, 0, 0, 0)' || val === 'none') continue;
      if (filter && !sel(el).includes(filter)) continue;
      const k = sel(el) + '|' + val;
      if (seen.has(k)) continue;
      seen.set(k, { el: sel(el), val, w: Math.round(r.width), h: Math.round(r.height), rule: winner(el) });
    }
    return Array.from(seen.values()).slice(0, 40);
  }, [prop, filter]);
  for (const o of out) console.log(o.el + '  [' + o.w + 'x' + o.h + ']  ' + o.val + '\n     ' + o.rule);
  await b.close();
})();
