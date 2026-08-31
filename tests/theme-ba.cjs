/* Before/after comparison: renders the same path from the pre-theme worktree and
   from this tree, saves both full-page shots and prints layout metrics so a
   restoration can be checked against what the page used to be.
     node tests/theme-ba.cjs <outdir> <path> [path...]                      */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const NEW_ROOT = path.join(__dirname, '..');
const OLD_ROOT = path.join(path.dirname(NEW_ROOT), 'tmr-pretheme');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const METRICS = () => {
  const px = (v) => Math.round(parseFloat(v) || 0);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[,\s\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);

  // how much of the first two screens is bare page ground with nothing on it
  const H = 1600, W = document.documentElement.clientWidth;
  let bare = 0, sampled = 0;
  for (let y = 90; y < H; y += 20) {
    for (let x = 20; x < W - 20; x += 40) {
      sampled++;
      const el = document.elementFromPoint(x, Math.min(y, window.innerHeight - 2));
      if (!el) { bare++; continue; }
      const tag = el.tagName;
      if (tag === 'HTML' || tag === 'BODY' || tag === 'MAIN') bare++;
    }
  }

  const surfaces = {};
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 150 || r.height < 60) continue;
    const s = getComputedStyle(el); const bc = parse(s.backgroundColor);
    if (!bc || bc.a < 0.5) continue;
    const key = s.backgroundColor;
    surfaces[key] = (surfaces[key] || 0) + 1;
  }
  const topSurfaces = Object.entries(surfaces).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map((e) => { const c = parse(e[0]); return { c: e[0], n: e[1], L: c ? +lum(c).toFixed(4) : null }; });

  const card = document.querySelector('.card, [class*="card"], section, article');
  const cs = card ? getComputedStyle(card) : null;

  return {
    docH: document.body.scrollHeight,
    bareGroundPct: Math.round((bare / Math.max(sampled, 1)) * 100),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    topSurfaces,
    sampleCard: card ? { s: card.tagName + '.' + (typeof card.className === 'string' ? card.className.trim().split(/\s+/).slice(0, 2).join('.') : ''), pad: cs.padding, radius: cs.borderRadius, border: cs.border, bg: cs.backgroundColor, w: Math.round(card.getBoundingClientRect().width) } : null,
    h1: (() => { const h = document.querySelector('h1'); if (!h) return null; const s = getComputedStyle(h);
      return { px: px(s.fontSize), lh: s.lineHeight, ff: s.fontFamily.split(',')[0], mb: s.marginBottom, color: s.color }; })(),
    h2: (() => { const h = document.querySelector('h2'); if (!h) return null; const s = getComputedStyle(h);
      return { px: px(s.fontSize), ff: s.fontFamily.split(',')[0], mb: s.marginBottom }; })(),
    body14: (() => { const p = document.querySelector('main p, .page p, p'); if (!p) return null; const s = getComputedStyle(p);
      return { px: px(s.fontSize), lh: s.lineHeight, color: s.color }; })(),
    containers: Array.prototype.slice.call(document.querySelectorAll('main > *, .page > *, .container > *')).slice(0, 8).map((e) => {
      const s = getComputedStyle(e); const r = e.getBoundingClientRect();
      return { s: e.tagName + '.' + (typeof e.className === 'string' ? e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''), w: Math.round(r.width), h: Math.round(r.height), pad: s.padding, mt: s.marginTop, bg: s.backgroundColor, bd: s.borderTopWidth + ' ' + s.borderTopColor };
    }),
  };
};

async function shoot(ctx, root, url, out, tag) {
  const p = await ctx.newPage();
  await p.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'trustmyrecord.com') return r.continue();
    let rel = decodeURIComponent(u.pathname); if (rel.endsWith('/')) rel += 'index.html';
    const e = path.extname(rel); if (!TYPES[e]) return r.continue();
    const f = path.join(root, rel); if (!f.startsWith(root) || !fs.existsSync(f)) return r.continue();
    return r.fulfill({ status: 200, headers: { 'content-type': TYPES[e] }, body: fs.readFileSync(f) });
  });
  p.on('pageerror', () => {});
  let m = null;
  try {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(5000);
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(1000);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(600);
    await p.screenshot({ path: out + '.' + tag + '.png', fullPage: true });
    m = await p.evaluate(METRICS);
  } catch (e) { m = { error: String(e.message).slice(0, 80) }; }
  await p.close();
  return m;
}

(async () => {
  const outdir = process.argv[2];
  const paths = process.argv.slice(3);
  fs.mkdirSync(outdir, { recursive: true });
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  for (const rel of paths) {
    const url = 'https://trustmyrecord.com/' + rel.replace(/^\//, '');
    const name = (rel.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home');
    const base = path.join(outdir, name);
    const oldM = fs.existsSync(path.join(OLD_ROOT, rel.replace(/^\//, ''), 'index.html')) || fs.existsSync(path.join(OLD_ROOT, rel.replace(/^\//, '')))
      ? await shoot(ctx, OLD_ROOT, url, base, 'before') : { error: 'path not in pre-theme tree' };
    const newM = await shoot(ctx, NEW_ROOT, url, base, 'after');
    console.log('=== /' + rel.replace(/^\//, ''));
    console.log('  BEFORE ' + JSON.stringify(oldM));
    console.log('  AFTER  ' + JSON.stringify(newM));
  }
  await b.close();
})();
