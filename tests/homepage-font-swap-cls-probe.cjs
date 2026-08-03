#!/usr/bin/env node
/* =============================================================================
   HERO WEBFONT SWAP — CLS PROBE
   -----------------------------------------------------------------------------
   The hero H1 is set in Barlow Condensed 900 uppercase. Until that webfont
   arrives the browser draws it in a much WIDER system face, so on a phone the
   headline wraps to an extra line or two and then snaps back when the font
   lands — taking the CTA buttons, the capper card and the stats stripe with it.

   This measures that specific reflow: H1 height and the top of everything below
   it, sampled before the webfont is allowed to load and again after, plus the
   real CLS. Run it against any variant to compare strategies.

   Usage:
     node tests/homepage-font-swap-cls-probe.cjs [--url URL] [--widths 390,360,430]
                                                 [--delay MS] [--label NAME]
                                                 [--shots DIR]
   --delay holds the Google Fonts response back by that many ms so the pre-swap
   state is observable; the shift itself is identical, just easier to catch.
   ============================================================================= */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
const URL_ = arg('--url', 'http://127.0.0.1:8973/');
const WIDTHS = String(arg('--widths', '390,360,430')).split(',').map(Number);
const DELAY = Number(arg('--delay', 2500));
const LABEL = arg('--label', 'variant');
const SHOTS = arg('--shots', '');
const FONT_DISPLAY = arg('--font-display', '');   // rewrite the Google Fonts css2 display= param

const PROBE = `(() => {
  const g = (s) => { const e = document.querySelector(s); if (!e) return null;
    const b = e.getBoundingClientRect();
    return { top: Math.round(b.top + scrollY), h: Math.round(b.height) }; };
  const h1 = document.querySelector('.hero h1.hh');
  const cs = h1 ? getComputedStyle(h1) : {};
  return {
    h1: g('.hero h1.hh'),
    sub: g('.hero .sub'),
    cta: g('.hero .cta'),
    spot: g('.spot'),
    bridge: g('.bridge'),
    lines: h1 ? Math.round(h1.getBoundingClientRect().height / parseFloat(cs.lineHeight)) : null,
    family: h1 ? cs.fontFamily : null,
    rendered: (() => { try {
      const c = document.createElement('canvas').getContext('2d');
      c.font = getComputedStyle(document.querySelector('.hero h1.hh')).font;
      return Math.round(c.measureText('BUILD A RECORD NOBODY CAN FAKE.').width);
    } catch (e) { return null; } })(),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const rows = [];
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await ctx.newPage();

    // Optionally re-request the font stylesheet under a different font-display
    // strategy, so `swap` / `optional` can be compared on the same document.
    if (FONT_DISPLAY) {
      await page.route('**://fonts.googleapis.com/css2**', async (route) => {
        const u = new URL(route.request().url());
        u.searchParams.set('display', FONT_DISPLAY);
        return route.continue({ url: u.toString() });
      });
    }

    // Hold the webfont files back so the pre-swap frame is measurable.
    await page.route('**://fonts.gstatic.com/**', async (route) => {
      await new Promise((r) => setTimeout(r, DELAY));
      return route.continue();
    });
    await page.addInitScript(() => {
      window.__cls = 0; window.__shifts = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__cls += e.value;
        if (e.value > 0.0005) window.__shifts.push({ v: +e.value.toFixed(4),
          src: (e.sources || []).map((s) => s.node && s.node.nodeName + '.' +
            String((s.node.className && s.node.className.baseVal !== undefined
              ? s.node.className.baseVal : s.node.className) || '').split(' ')[0]) });
      } }).observe({ type: 'layout-shift', buffered: true });
    });

    await page.goto(URL_, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const before = await page.evaluate(PROBE);
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, `${LABEL}-${width}-prefont.png`) });
    }

    await page.waitForTimeout(DELAY + 4000);
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(500);
    const after = await page.evaluate(PROBE);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${LABEL}-${width}-postfont.png`) });

    const cls = await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts }));
    rows.push({ width, before, after, cls });

    console.log(`\n  ${LABEL} @ ${width}px`);
    console.log(`    H1        ${before.h1.h}px (${before.lines} lines) -> ${after.h1.h}px (${after.lines} lines)   Δ${after.h1.h - before.h1.h}`);
    console.log(`    CTA top   ${before.cta.top} -> ${after.cta.top}   Δ${after.cta.top - before.cta.top}`);
    console.log(`    stripe    ${before.bridge.top} -> ${after.bridge.top}   Δ${after.bridge.top - before.bridge.top}`);
    console.log(`    text w    ${before.rendered} -> ${after.rendered}px  (ratio ${(before.rendered / after.rendered).toFixed(4)})`);
    console.log(`    CLS       ${cls.cls.toFixed(4)}   ${JSON.stringify(cls.shifts)}`);

    await ctx.close();
  }
  await browser.close();

  const worst = rows.reduce((a, r) => Math.max(a, Math.abs(r.after.cta.top - r.before.cta.top)), 0);
  const maxCls = rows.reduce((a, r) => Math.max(a, r.cls.cls), 0);
  console.log(`\n  ${LABEL}: worst hero displacement ${worst}px, worst CLS ${maxCls.toFixed(4)}\n`);
})().catch((e) => { console.error(e); process.exit(1); });
