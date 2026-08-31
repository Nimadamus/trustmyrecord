// Headless contrast sweep. Usage: node tests/theme-contrast-sweep.cjs <url> [url...]
const { chromium } = require('playwright');

const AUDIT = () => {
  const parse = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[,\s\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
  const topLayer = (img) => {
    // a multi-layer background paints the FIRST layer on top; only that one is
    // the fill. Pooling every layer's stops made a padding-box fill read as its
    // border-box ring.
    const s = String(img); let d = 0, start = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '(') d++;
      else if (ch === ')') d--;
      else if (ch === ',' && d === 0) return s.slice(start, i);
    }
    return s;
  };
  const gradStop = (img) => {
    const cols = String(topLayer(img)).match(/rgba?\([^)]+\)/g); if (!cols || !cols.length) return null;
    const ps = cols.map(parse).filter(Boolean); if (!ps.length) return null;
    return ps[Math.floor(ps.length / 2)];
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      if ((s.webkitBackgroundClip || s.backgroundClip) === 'text') { n = n.parentElement; continue; }
      const bi = s.backgroundImage;
      if (bi && bi !== 'none' && /gradient/.test(bi)) { const g = gradStop(bi); if (g && g.a > 0.5) return { c: g, src: n }; }
      const bc = parse(s.backgroundColor);
      if (bc && bc.a >= 0.85) return { c: bc, src: n };
      n = n.parentElement;
    }
    return { c: { r: 255, g: 255, b: 255, a: 1 }, src: null };
  };
  const path = (el) => {
    const bits = [];
    let n = el;
    for (let i = 0; n && n.nodeType === 1 && i < 4; i++, n = n.parentElement) {
      bits.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.') : ''));
    }
    return bits.join(' > ');
  };
  const out = [];
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    let txt = '';
    for (const n of el.childNodes) if (n.nodeType === 3) txt += n.textContent;
    txt = txt.trim();
    if (!txt) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.opacity === '0' || s.display === 'none') continue;
    if ((s.webkitBackgroundClip || s.backgroundClip) === 'text') continue;
    if (parseFloat(s.fontSize) < 6) continue;
    const fg0 = parse(s.color); if (!fg0) continue;
    const bg = bgOf(el);
    const fg = over(fg0, bg.c);
    const size = parseFloat(s.fontSize); const w = parseInt(s.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && w >= 700);
    const need = large ? 3 : 4.5;
    const cr = ratio(fg, bg.c);
    if (cr < need) out.push({ ratio: +cr.toFixed(2), need, text: txt.slice(0, 48), color: s.color, bg: `rgb(${Math.round(bg.c.r)},${Math.round(bg.c.g)},${Math.round(bg.c.b)})`, size, sel: path(el), bgsrc: bg.src ? path(bg.src) : 'html' });
  }
  out.sort((a, b) => a.ratio - b.ratio);
  return out;
};

(async () => {
  const urls = process.argv.slice(2);
  const b = await chromium.launch({ headless: true });
  const pg = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  for (const u of urls) {
    let fails = [];
    try {
      await pg.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await pg.waitForTimeout(4500);
      fails = await pg.evaluate(AUDIT);
    } catch (e) { console.log(`\n### ${u}\nERROR ${e.message}`); continue; }
    const seen = new Set(); const uniq = [];
    for (const f of fails) { const k = f.color + '|' + f.bg + '|' + f.sel; if (seen.has(k)) continue; seen.add(k); uniq.push(f); }
    console.log(`\n### ${u}  fails=${fails.length} unique=${uniq.length}`);
    for (const f of uniq.slice(0, 18)) console.log(`  ${f.ratio}  ${f.color} on ${f.bg}  ${f.size}px  "${f.text}"\n      ${f.sel}\n      BG<- ${f.bgsrc}`);
  }
  await b.close();
})();
