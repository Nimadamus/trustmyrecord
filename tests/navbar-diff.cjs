/* Compare the rendered navbar of two pages, element by element.
     node tests/navbar-diff.cjs <pathA> <pathB>                              */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const GRAB = () => {
  const nav = document.querySelector('nav.ds-nav');
  if (!nav) return { missing: true };
  const props = ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'color',
    'backgroundColor', 'padding', 'margin', 'gap', 'height', 'minHeight', 'display', 'alignItems',
    'justifyContent', 'flexDirection', 'flexWrap', 'maxWidth', 'borderRadius', 'position'];
  const pick = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el); const o = {};
    for (const k of props) o[k] = s[k];
    const r = el.getBoundingClientRect();
    o._box = Math.round(r.width) + 'x' + Math.round(r.height) + ' @x' + Math.round(r.x) + ' y' + Math.round(r.y);
    return o;
  };
  const out = { nav: pick(nav) };
  for (const sel of ['.ds-nav-in', '.ds-logo', '.ds-logo .mk', '.ds-logo .wd', '.ds-nav-panel',
    '.ds-mainnav', '.ds-nav-right', '.ds-nav-cta', '.v2nav-coins', '.v2nav-bell', '.ds-btn.p.sm']) {
    out[sel] = pick(nav.querySelector(sel));
  }
  out._items = Array.prototype.map.call(nav.querySelectorAll('.ds-mainnav > *'), (el) => {
    const r = el.getBoundingClientRect();
    return (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18) +
      ' [' + Math.round(r.width) + 'x' + Math.round(r.height) + ' @x' + Math.round(r.x) + ']';
  });
  out._right = Array.prototype.map.call(nav.querySelectorAll('.ds-nav-right > *'), (el) => {
    const r = el.getBoundingClientRect();
    return (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14) +
      ' [' + Math.round(r.width) + 'x' + Math.round(r.height) + ']';
  });
  out._navHTMLlen = nav.innerHTML.length;
  return out;
};

async function grab(page, rel) {
  await page.goto('https://trustmyrecord.com/' + rel.replace(/^\//, ''), { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5500);
  return page.evaluate(GRAB);
}

(async () => {
  const [a, b] = process.argv.slice(2);
  const br = await chromium.launch({ headless: true });
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'trustmyrecord.com') return r.continue();
    let rel = decodeURIComponent(u.pathname); if (rel.endsWith('/')) rel += 'index.html';
    const e = path.extname(rel); if (!TYPES[e]) return r.continue();
    const f = path.join(ROOT, rel); if (!f.startsWith(ROOT) || !fs.existsSync(f)) return r.continue();
    return r.fulfill({ status: 200, headers: { 'content-type': TYPES[e] }, body: fs.readFileSync(f) });
  });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});
  const A = await grab(p, a), B = await grab(p, b);
  await br.close();

  console.log('A = /' + a + '   B = /' + b);
  console.log('A items : ' + JSON.stringify(A._items));
  console.log('B items : ' + JSON.stringify(B._items));
  console.log('A right : ' + JSON.stringify(A._right));
  console.log('B right : ' + JSON.stringify(B._right));
  let n = 0;
  for (const sel of Object.keys(A)) {
    if (sel.startsWith('_')) continue;
    const x = A[sel], y = B[sel];
    if (!x && !y) continue;
    if (!x || !y) { console.log('PRESENCE ' + sel + ': A=' + (x ? 'yes' : 'no') + ' B=' + (y ? 'yes' : 'no')); n++; continue; }
    for (const k of Object.keys(x)) {
      if (x[k] !== y[k]) { console.log('DIFF ' + sel + ' ' + k + ':  A=' + String(x[k]).slice(0, 46) + '   B=' + String(y[k]).slice(0, 46)); n++; }
    }
  }
  console.log(n ? ('\n' + n + ' navbar difference(s)') : '\nNAVBARS IDENTICAL');
})();
