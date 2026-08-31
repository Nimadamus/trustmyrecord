/* LOCKED PAGES. The homepage and /handicappers/ are approved and must not move. This captures two
   things and can re-run to prove neither changed:

     1. the sha256 of index.html and of every css/js asset it references
     2. a computed-style fingerprint of the nav, hero, panels and type ramp,
        rendered from this working tree

   Usage:
     node tests/homepage-lock.cjs capture <file.json>
     node tests/homepage-lock.cjs verify  <file.json>                        */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'lineHeight',
  'color', 'backgroundColor', 'backgroundImage', 'borderTopWidth', 'borderTopColor', 'borderRadius',
  'padding', 'margin', 'width', 'height', 'display', 'gap', 'boxShadow', 'textAlign'];

const SELECTORS = ['nav.ds-nav', '.ds-nav-in', '.ds-logo', '.ds-logo .mk', '.ds-logo .wd', '.ds-navitem',
  '.ds-mainnav', '.ds-nav-cta', '.ds-menu > button', 'body', 'h1', 'h2', 'h3', 'main', 'footer',
  '.hero', '.ds-footer', '.ds-footer h3', '.ds-footer a'];

function assetsOf(html) {
  const out = new Set(['index.html']);
  const re = /(?:href|src)="(\/static\/[^"?]+\.(?:css|js))[^"]*"/g;
  let m;
  while ((m = re.exec(html))) out.add(m[1].replace(/^\//, ''));
  return Array.from(out).sort();
}
const sha = (f) => { try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex').slice(0, 16); } catch (e) { return 'MISSING'; } };

(async () => {
  const mode = process.argv[2], file = process.argv[3];
  const PAGES = process.argv.slice(4);
  if (!PAGES.length) PAGES.push('', 'handicappers/');
  const files = {};
  for (const pg of PAGES) {
    const rel = (pg ? pg.replace(/^\/|\/$/g, '') + '/' : '') + 'index.html';
    files[rel] = sha(rel);
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const a of assetsOf(html)) files[a] = sha(a);
  }

  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'trustmyrecord.com') return r.continue();
    let rel = decodeURIComponent(u.pathname); if (rel.endsWith('/')) rel += 'index.html';
    const e = path.extname(rel); if (!TYPES[e]) return r.continue();
    const f = path.join(ROOT, rel); if (!f.startsWith(ROOT) || !fs.existsSync(f)) return r.continue();
    return r.fulfill({ status: 200, headers: { 'content-type': TYPES[e] }, body: fs.readFileSync(f) });
  });
  const style = {};
  for (const pg of PAGES) {
  const p = await ctx.newPage();
  p.on('pageerror', () => {});
  await p.goto('https://trustmyrecord.com/' + pg.replace(/^\//, ''), { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(6000);
  const one = await p.evaluate((args) => {
    const SELECTORS = args[0], PROPS = args[1];
    const out = {};
    for (const sel of SELECTORS) {
      const el = document.querySelector(sel);
      if (!el) { out[sel] = null; continue; }
      const s = getComputedStyle(el); const o = {};
      for (const k of PROPS) o[k] = s[k];
      const r = el.getBoundingClientRect();
      o._box = Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.x) + ',' + Math.round(r.y);
      out[sel] = o;
    }
    out._navText = (document.querySelector('nav.ds-nav') || { innerText: '' }).innerText.replace(/\s+/g, ' ').trim();
    out._docH = document.body.scrollHeight;
    return out;
  }, [SELECTORS, PROPS]);
  for (const k of Object.keys(one)) style['/' + pg + ' ' + k] = one[k];
  await p.close();
  }
  await b.close();

  const snap = { files, style };
  if (mode === 'capture') {
    fs.writeFileSync(file, JSON.stringify(snap, null, 1));
    console.log('captured ' + Object.keys(files).length + ' assets, ' + Object.keys(style).length + ' style keys over [' + PAGES.map(function(x){return '/'+x;}).join(' ') + '] -> ' + file);
    return;
  }
  const old = JSON.parse(fs.readFileSync(file, 'utf8'));
  const diffs = [];
  for (const k of new Set(Object.keys(old.files).concat(Object.keys(files)))) {
    if (old.files[k] !== files[k]) diffs.push('ASSET ' + k + ': ' + old.files[k] + ' -> ' + files[k]);
  }
  for (const key of new Set(Object.keys(old.style).concat(Object.keys(snap.style)))) {
    const a = old.style[key], c = snap.style[key];
    if (a === c) continue;
    if (a == null || c == null || typeof a !== 'object') { diffs.push('STYLE ' + key + ': ' + String(a).slice(0, 40) + ' -> ' + String(c).slice(0, 40)); continue; }
    for (const k of Object.keys(a)) if (a[k] !== c[k]) diffs.push('STYLE ' + key + ' ' + k + ': ' + String(a[k]).slice(0, 40) + ' -> ' + String(c[k]).slice(0, 40));
  }
  if (!diffs.length) console.log('LOCKED PAGES UNCHANGED (' + Object.keys(files).length + ' assets, ' + Object.keys(snap.style).length + ' style keys)');
  else { console.log('LOCKED PAGES CHANGED, ' + diffs.length + ' difference(s):'); for (const d of diffs) console.log('  ' + d); }
})();
