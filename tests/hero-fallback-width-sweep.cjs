#!/usr/bin/env node
/* =============================================================================
   HERO FALLBACK WIDTH SWEEP
   -----------------------------------------------------------------------------
   A single `size-adjust` cannot match a condensed face letter-for-letter: the
   two hero lines differ from each other by ~5% in how they scale. What actually
   matters is not the ratio, it is whether the headline BREAKS INTO THE SAME
   NUMBER OF LINES before and after the webfont arrives — that is the thing the
   visitor sees move.

   So: sweep every plausible phone width, render the real H1 with the fallback
   stack and then with Barlow Condensed, and count lines both times. Any width
   where the counts differ is a width where the hero will jump.

   Candidates are tried in one pass so they can be compared directly.

   Usage: node tests/hero-fallback-width-sweep.cjs [--from 320] [--to 460]
                                                   [--step 2] [--candidates 77.3,78,79.5]
   ============================================================================= */
'use strict';

const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
const FROM = Number(arg('--from', 320));
const TO = Number(arg('--to', 460));
const STEP = Number(arg('--step', 2));
const URL_ = arg('--url', 'http://127.0.0.1:8973/');
const CANDIDATES = String(arg('--candidates', '77.3,78,79.5')).split(',').map(Number);
const LOCAL = arg('--local', 'Segoe UI');   // which system face the tested @font-face wraps
const SELECTOR = arg('--selector', '.hero h1.hh');   // element whose wrapping is judged
const TARGET = arg('--target', 'Barlow Condensed');  // webfont it must agree with
const WEIGHT_ASC = Number(arg('--asc', 100));        // target ascent per 100 units of em
const WEIGHT_DESC = Number(arg('--desc', 20));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: 'networkidle' }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);

  const widths = [];
  for (let w = FROM; w <= TO; w += STEP) widths.push(w);

  const results = {};
  for (const cand of CANDIDATES) {
    await page.evaluate(([sa, local, asc, desc]) => {
      let s = document.getElementById('__sweep');
      if (!s) { s = document.createElement('style'); s.id = '__sweep'; document.head.appendChild(s); }
      // Redeclare the tested face at the candidate size-adjust. Descent/ascent
      // follow from it so the box stays right too.
      s.textContent =
        `@font-face{font-family:'SweepFallback';src:local('${local}');size-adjust:${sa}%;` +
        `ascent-override:${(asc / (sa / 100)).toFixed(1)}%;descent-override:${(desc / (sa / 100)).toFixed(1)}%;` +
        'line-gap-override:0%}';
    }, [cand, LOCAL, WEIGHT_ASC, WEIGHT_DESC]);

    const rows = [];
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: 844 });
      const r = await page.evaluate(([sel, target]) => {
        const h1 = document.querySelector(sel);
        const lh = parseFloat(getComputedStyle(h1).lineHeight);
        const real = h1.style.fontFamily;
        const count = () => Math.round(h1.getBoundingClientRect().height / lh);
        h1.style.fontFamily = "'SweepFallback', sans-serif";
        const before = count();
        const beforeH = Math.round(h1.getBoundingClientRect().height);
        h1.style.fontFamily = `'${target}'`;
        const after = count();
        const afterH = Math.round(h1.getBoundingClientRect().height);
        h1.style.fontFamily = real;
        return { before, after, beforeH, afterH };
      }, [SELECTOR, TARGET]);
      rows.push({ w, ...r, jump: r.afterH - r.beforeH });
    }
    const bad = rows.filter((r) => r.before !== r.after);
    const worst = rows.reduce((a, r) => Math.max(a, Math.abs(r.jump)), 0);
    results[cand] = { bad, worst, rows };
    console.log(`  size-adjust ${cand}%  ->  ${bad.length}/${rows.length} widths mismatch, worst jump ${worst}px` +
      (bad.length ? `  [${bad.slice(0, 12).map((r) => `${r.w}:${r.before}->${r.after}`).join(' ')}${bad.length > 12 ? ' …' : ''}]` : ''));
  }

  // Widths nobody actually holds in their hand do not matter as much as the
  // ones they do. These are the CSS widths of the phones this site sees.
  const DEVICES = [320, 360, 375, 384, 390, 393, 400, 412, 414, 428, 430];
  console.log('');
  for (const [c, r] of Object.entries(results)) {
    const dev = r.rows.filter((x) => DEVICES.includes(x.w) && x.before !== x.after);
    console.log(`  ${c}% on real device widths: ${dev.length ? dev.map((x) => `${x.w}(${x.before}->${x.after})`).join(', ') : 'ALL CLEAN'}`);
  }

  const best = Object.entries(results).sort((a, b) =>
    (a[1].bad.length - b[1].bad.length) || (a[1].worst - b[1].worst))[0];
  console.log(`\n  best (${LOCAL}): size-adjust ${best[0]}% — ${best[1].bad.length} mismatched widths, worst jump ${best[1].worst}px`);

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
