/* Whole-site theme audit. Renders each page from this working tree and reports
   the damage classes the theme migration left behind.
     node tests/theme-audit.cjs <list-file> [startIndex] [count]            */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const AUDIT = () => {
  const parse = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[,\s\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
  const topLayer = (img) => {
    const s = String(img); let d = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '(') d++; else if (ch === ')') d--;
      else if (ch === ',' && d === 0) return s.slice(0, i);
    }
    return s;
  };
  const grad = (img) => {
    const cs = String(topLayer(img)).match(/rgba?\([^)]+\)/g); if (!cs) return null;
    const ps = cs.map(parse).filter(Boolean); return ps.length ? ps[Math.floor(ps.length / 2)] : null;
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      if ((s.webkitBackgroundClip || s.backgroundClip) === 'text') { n = n.parentElement; continue; }
      const bi = s.backgroundImage;
      if (bi && bi !== 'none' && /gradient/.test(bi)) { const g = grad(bi); if (g && g.a > 0.5) return { c: g, src: n }; }
      const bc = parse(s.backgroundColor); if (bc && bc.a >= 0.85) return { c: bc, src: n };
      n = n.parentElement;
    }
    return { c: { r: 255, g: 255, b: 255, a: 1 }, src: null };
  };
  const sel = (el) => {
    const bits = []; let n = el;
    for (let i = 0; n && n.nodeType === 1 && i < 3; i++, n = n.parentElement) {
      const cls = (typeof n.className === 'string' && n.className.trim()) ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      bits.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + cls);
    }
    return bits.join('>');
  };

  const out = { contrast: [], lightSurfaces: [], offPalette: [], shellLeak: [], hOverflow: 0 };
  out.hOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;

  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.opacity === '0' || s.display === 'none') continue;
    if ((s.webkitBackgroundClip || s.backgroundClip) === 'text') continue;
    const size = parseFloat(s.fontSize); if (!(size >= 6)) continue;
    let txt = ''; for (const n of el.childNodes) if (n.nodeType === 3) txt += n.textContent;
    txt = txt.trim(); if (!txt) continue;
    const fg0 = parse(s.color); if (!fg0) continue;
    const bg = bgOf(el); const fg = over(fg0, bg.c);
    const w = parseInt(s.fontWeight) || 400;
    const need = (size >= 24 || (size >= 18.66 && w >= 700)) ? 3 : 4.5;
    const cr = ratio(fg, bg.c);
    if (cr < need) {
      const bgs = 'rgb(' + Math.round(bg.c.r) + ',' + Math.round(bg.c.g) + ',' + Math.round(bg.c.b) + ')';
      const k = s.color + '|' + bgs + '|' + sel(el);
      if (!seen.has(k)) { seen.add(k); out.contrast.push({ r: +cr.toFixed(2), fg: s.color, bg: bgs, px: size, t: txt.slice(0, 32), s: sel(el) }); }
    }
  }
  out.contrast.sort((a, b) => a.r - b.r);

  const lseen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (r.width < 120 || r.height < 40) continue;
    const s = getComputedStyle(el); const bc = parse(s.backgroundColor);
    if (!bc || bc.a < 0.85) continue;
    if (lum(bc) < 0.45) continue;
    const k = sel(el) + '|' + s.backgroundColor; if (lseen.has(k)) continue; lseen.add(k);
    out.lightSurfaces.push({ s: sel(el), bg: s.backgroundColor, w: Math.round(r.width), h: Math.round(r.height) });
  }

  const OFF = [[83, 211, 55], [62, 180, 35], [124, 247, 231], [10, 138, 131], [23, 194, 181], [180, 241, 231], [141, 237, 224], [217, 154, 28], [184, 117, 0], [233, 185, 73], [239, 183, 95], [52, 211, 153], [16, 185, 129], [6, 182, 212], [34, 211, 238]];
  const near = (c) => OFF.some((o) => Math.abs(o[0] - c.r) < 10 && Math.abs(o[1] - c.g) < 10 && Math.abs(o[2] - c.b) < 10);
  const oseen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    const s = getComputedStyle(el);
    const props = [['color', s.color], ['bg', s.backgroundColor], ['bgi', s.backgroundImage], ['bd', s.borderColor]];
    for (const pv of props) {
      const v = pv[1]; if (!v || v === 'none') continue;
      const cs = String(v).match(/rgba?\([^)]+\)/g) || [];
      for (const c of cs) {
        const pc = parse(c); if (!pc || pc.a < 0.5 || !near(pc)) continue;
        const k = sel(el) + '|' + pv[0] + '|' + c; if (oseen.has(k)) continue; oseen.add(k);
        out.offPalette.push({ s: sel(el), p: pv[0], v: c, t: (el.textContent || '').trim().slice(0, 20) });
      }
    }
  }

  const shellEls = Array.prototype.slice.call(document.querySelectorAll('.ds-nav, .ds-nav *, .ds-footer, .ds-footer *'));
  if (shellEls.length) {
    const found = new Set();
    for (const ss of document.styleSheets) {
      if (ss.href) continue;
      let rs; try { rs = ss.cssRules; } catch (e) { continue; }
      const walk = (l) => {
        for (const r of l || []) {
          if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue; }
          if (!r.selectorText) continue;
          if (/\.ds-nav|\.ds-footer|\.tmrlh-/.test(r.selectorText)) continue;
          if (/^\s*\*\s*$/.test(r.selectorText)) continue;
          let hit = false;
          for (const el of shellEls) { try { if (el.matches(r.selectorText)) { hit = true; break; } } catch (e) { break; } }
          if (hit) found.add(r.selectorText.slice(0, 90));
        }
      };
      walk(rs);
    }
    out.shellLeak = Array.prototype.slice.call(found);
  }
  return out;
};

(async () => {
  const list = fs.readFileSync(process.argv[2], 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const start = Number(process.argv[3] || 0), count = Number(process.argv[4] || list.length);
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
  for (const rel of list.slice(start, start + count)) {
    const url = 'https://trustmyrecord.com/' + rel;
    let a = null, p = null;
    try {
      p = await ctx.newPage();
      p.on('pageerror', () => {});
      p.on('dialog', (d) => d.dismiss().catch(() => {}));
      a = await Promise.race([
        (async () => {
          await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
          await p.waitForTimeout(4200);
          return await p.evaluate(AUDIT);
        })(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('page timeout')), 60000)),
      ]);
    } catch (e) {
      console.log('PAGE /' + rel + ' ERROR ' + String(e.message).slice(0, 70));
      try { if (p) await p.close(); } catch (e2) {}
      continue;
    }
    try { await p.close(); } catch (e2) {}
    const score = a.contrast.length + a.lightSurfaces.length + a.offPalette.length + a.shellLeak.length + (a.hOverflow > 2 ? 1 : 0);
    console.log('PAGE /' + rel + ' contrast=' + a.contrast.length + ' light=' + a.lightSurfaces.length + ' offpal=' + a.offPalette.length + ' leak=' + a.shellLeak.length + ' hx=' + a.hOverflow + ' SCORE=' + score);
    if (score) console.log('   ' + JSON.stringify({ c: a.contrast.slice(0, 6), l: a.lightSurfaces.slice(0, 4), o: a.offPalette.slice(0, 6), k: a.shellLeak.slice(0, 4) }));
  }
  await b.close();
})();
