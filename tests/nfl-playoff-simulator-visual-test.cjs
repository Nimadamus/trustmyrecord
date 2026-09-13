/*
 * NFL Playoff Simulator: screenshots, axe, metadata, structured data, layout.
 *
 * Needs two local servers, because the point is to audit the page against the
 * REAL endpoint rather than the baked fallback:
 *   node g10srv.js                       (backend worktree, port 8199)
 *   python -m http.server 8100 --directory .
 * Then:  G10OUT=<dir> node tests/nfl-playoff-simulator-visual-test.cjs
 *
 * It writes 16 screenshots and verify.json. The checks that have caught real
 * defects so far: axe at both widths (three contrast violations), horizontal
 * overflow, sub-24px tap targets (the standings team buttons), the skip link
 * being invisible on focus, and og:image missing under a summary_large_image
 * twitter card.
 */
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const fs = require('fs'), path = require('path');
const OUT = process.env.G10OUT;
const URL = 'http://127.0.0.1:8100/nfl-playoff-simulator/';
const R = { axe: [], meta: {}, jsonld: [], errors: [], api: [], shots: [], layout: {} };

async function shoot(page, tag, i, name, sel) {
  const f = path.join(OUT, `g10-${tag}-${i}-${name}.png`);
  if (sel === 'FULL') await page.screenshot({ path: f, fullPage: true });
  else {
    const el = await page.$(sel);
    if (!el) { R.shots.push(`MISSING ${tag}/${name} (${sel})`); return; }
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(180);
    await el.screenshot({ path: f });
  }
  R.shots.push(`${tag}/${i}-${name} ${fs.statSync(f).size}b`);
}

(async () => {
  const browser = await chromium.launch();
  for (const [tag, vp] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => R.errors.push(`${tag} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') R.errors.push(`${tag} console: ${m.text().slice(0, 160)}`); });
    page.on('response', r => { if (/playoff-inputs/.test(r.url())) R.api.push(`${tag} ${r.status()} ${r.url()}`); });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('section.panel', { timeout: 20000 });
    await page.waitForTimeout(800);

    const names = ['playoff-picture', 'bracket', 'pick-the-games', 'tiebreakers'];
    await shoot(page, tag, 1, 'controls', 'section.ctl');
    const secs = await page.$$('section.panel');
    for (let i = 0; i < Math.min(secs.length, 4); i++) {
      const h2 = await secs[i].$('h2');
      R.layout[`${tag}-panel${i}`] = h2 ? (await h2.innerText()).trim() : '?';
      const f = path.join(OUT, `g10-${tag}-${i + 2}-${names[i] || 'panel' + i}.png`);
      await secs[i].scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
      await secs[i].screenshot({ path: f });
      R.shots.push(`${tag}/${i + 2}-${names[i] || 'panel' + i} ${fs.statSync(f).size}b`);
    }
    R.layout[`${tag}-panelCount`] = secs.length;
    await shoot(page, tag, 6, 'methodology', '.seo');
    await shoot(page, tag, 7, 'limitations-faq', '.faq');
    await shoot(page, tag, 8, 'FULLPAGE', 'FULL');

    // horizontal overflow + tap targets
    R.layout[`${tag}-overflow`] = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    R.layout[`${tag}-tiny-tap`] = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('button,a,select,input').forEach(e => {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && (r.height < 24 || r.width < 24)) {
          bad.push((e.tagName + ':' + (e.textContent || '').trim().slice(0, 18) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)));
        }
      });
      return bad.slice(0, 12);
    });
    R.layout[`${tag}-provisional`] = await page.evaluate(() => ({
      banners: document.querySelectorAll('.provisional-banner').length,
      chips: document.querySelectorAll('.badge.prov').length,
      fresh: (document.querySelector('.fresh') || {}).textContent || null,
    }));

    await page.keyboard.press('Tab');
    R.layout[`${tag}-skiplink-on-focus`] = await page.evaluate(() => {
      const a = document.activeElement; const r = a.getBoundingClientRect();
      return a.tagName + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)
        + ' visible=' + (r.width > 40 && r.height > 20);
    });
    const a = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    R.axe.push({ tag, violations: a.violations.map(v => `${v.id}(${v.impact}) x${v.nodes.length}: ${v.nodes[0].target}`), passes: a.passes.length });

    if (tag === 'desktop') {
      R.meta = await page.evaluate(() => ({
        title: document.title,
        titleLen: document.title.length,
        desc: (document.querySelector('meta[name=description]') || {}).content || null,
        canonical: (document.querySelector('link[rel=canonical]') || {}).href || null,
        robots: (document.querySelector('meta[name=robots]') || {}).content || null,
        og: ['og:title', 'og:description', 'og:url', 'og:image', 'og:type'].map(p =>
          p + '=' + (((document.querySelector(`meta[property="${p}"]`)) || {}).content || 'MISSING')),
        tw: (document.querySelector('meta[name="twitter:card"]') || {}).content || 'MISSING',
        h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()),
        viewport: (document.querySelector('meta[name=viewport]') || {}).content || null,
        lang: document.documentElement.lang || null,
        internalLinks: [...document.querySelectorAll('a[href^="/"]')].map(a => a.getAttribute('href')),
      }));
      R.jsonld = await page.evaluate(() =>
        [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => {
          try { const j = JSON.parse(s.textContent); return { ok: true, type: j['@type'], keys: Object.keys(j).length, ctx: j['@context'] }; }
          catch (e) { return { ok: false, err: e.message }; }
        }));
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'verify.json'), JSON.stringify(R, null, 1));
  console.log(JSON.stringify(R, null, 1));
})();
