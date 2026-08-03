#!/usr/bin/env node
// APPROVED HOMEPAGE BASELINE LOCK — owner-approved layout frozen 2026-07-30
// (commit f5ac1ca7, re-applying 835b1fe3 + b727c7be after the 7fb28b22 clobber).
// Updated 2026-07-31: hero converted to a viewport-driven flex column so the
// stats stripe (.bridge) stays flush to the hero's bottom edge at every
// desktop viewport height, not just the content height the old fixed
// margin-top happened to produce.
// Updated 2026-08-01: stats stripe (.bridge) is now full-width and flush to
// the hero's edges — the .wrap side-inset + bridge-in rounded card/shadow
// (approved 2026-07-30) were replaced per explicit owner instruction; the
// full-width flush stripe is now the required design and the rounded/inset
// version is FORBIDDEN below.
// Every rule below must exist byte-exact in index.html. If a change here is
// intentional, it requires Nima's explicit approval FIRST; then update this
// list in the same commit.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const page = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

const REQUIRED = [
  'APPROVED HOMEPAGE BASELINE',
  // 165px = measured nav(70) + live-scores ticker(95) height, the real stack
  // rendered above .hero (there is no static <nav> in this document -- see
  // the runtime measurement script below). This is a no-JS/first-paint
  // fallback only; the inline script keeps it in sync with the actual
  // rendered value once tmr-ds-nav.js has run.
  // WAS 113px, from a 43px ticker that only ever held one line of "Loading
  // today's MLB slate...". The lane now reserves a real matchup card's height
  // from the first frame, so the honest fallback is 95px of ticker. Shipping
  // the old number laid the hero out 52px too tall until JS corrected it,
  // which dropped the stats stripe and everything under it into place.
  '--header-height:165px;',
  // hero shell is a flex column filling the viewport below the injected nav,
  // so .bridge (margin-top:auto below) always lands flush on the hero's
  // bottom edge regardless of viewport height or content height
  '.hero{position:relative;overflow:hidden;padding:28px 0 0;display:flex;flex-direction:column;',
  'min-height:calc(100vh - var(--header-height));',
  'min-height:calc(100dvh - var(--header-height));',
  'min-height:calc(100svh - var(--header-height));',
  '.hero-in{position:relative;z-index:3;flex:1}',
  // runtime correction: nav is injected by tmr-ds-nav.js at runtime, so the
  // static 113px fallback above must be replaced with the actual measured
  // value once nav+ticker have rendered
  "var top = Math.round(hero.getBoundingClientRect().top + window.scrollY);",
  "document.documentElement.style.setProperty('--header-height', top + 'px');",
  '.hero-grid{display:grid;grid-template-columns:minmax(0,1fr) 520px;gap:72px;align-items:center}',
  // The typeface, size, weight, case, tracking and margins are the approved
  // ones and are locked below exactly as before. What sits between 'Barlow
  // Condensed' and Inter now is a chain of metric-compatible FALLBACK faces —
  // the same system fonts the browser was already using while the webfont
  // loads, re-declared with size-adjust so they occupy Barlow Condensed's
  // width. Nothing about the rendered headline changes; the frame before it
  // arrives just stops being 60% wider and two lines taller.
  ".hero h1.hh{color:#fff;font-family:'Barlow Condensed','Barlow Cond Fallback W','Barlow Cond Fallback A','Barlow Cond Fallback M',Inter,sans-serif;font-size:64px;line-height:1.02;font-weight:900;text-transform:uppercase;letter-spacing:.004em;margin:18px 0 16px}",
  // The fallback faces themselves, and the tuned ratios. Measured, not guessed
  // — see tests/hero-fallback-width-sweep.cjs.
  "@font-face{font-family:'Barlow Cond Fallback W';src:local('Segoe UI');",
  "size-adjust:78.8%;ascent-override:126.9%;descent-override:25.4%;line-gap-override:0%}",
  "size-adjust:70.8%;ascent-override:141.2%;descent-override:28.2%;line-gap-override:0%}",
  '.hero .cta{display:flex;align-items:center;gap:26px;margin-top:24px;flex-wrap:wrap}',
  // Capper of the Week card (.spot) — approved full-size layout
  '.spot .hd{padding:15px 24px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);background:var(--panel-2)}',
  '.spot .bd{padding:22px 24px 20px}',
  '.spot .who{display:flex;align-items:center;gap:16px;margin-bottom:18px}',
  '.spot .who .avbox{width:66px;height:66px;border-radius:12px;',
  '.spot .who b{font-size:27px;font-weight:900;letter-spacing:-.035em;line-height:1.1}',
  '.spot .sub2{display:block;font-size:14.5px;color:var(--muted);font-weight:600;margin-top:5px}',
  '.spot .g3>div{padding:18px 18px;border-right:1px solid var(--line);background:var(--panel-2);min-width:0}',
  '.spot .g3 b{display:block;font-size:26px;font-weight:900;letter-spacing:-.04em;line-height:1.1;white-space:nowrap}.spot .g3>div:first-child{padding-left:14px;padding-right:12px}.spot .g3>div:first-child b{font-size:clamp(17px,1.42vw,26px);letter-spacing:-.03em}',
  '.spot .g3 span{display:block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:6px}',
  '.sparkwrap{margin-top:18px}',
  '.sparkwrap .lb{display:flex;justify-content:space-between;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:9px}',
  '.spark{display:flex;align-items:flex-end;gap:4px;height:50px}',
  '.spot .ft{padding:15px 24px;',
  // white stats stripe (bridge) — pushed to the hero's bottom edge by
  // margin-top:auto inside the flex column (NOT a fixed offset); full-width,
  // no side margins, no rounded card (owner-requested 2026-08-01)
  '.bridge{position:relative;z-index:20;margin-top:auto;flex-shrink:0;width:100%}',
  '.bridge-in{background:var(--panel);display:grid;grid-template-columns:repeat(4,1fr) auto;align-items:stretch;padding:0 28px}',
  '<div class="bridge"',
  '<div class="bridge-in"',
  // responsive breakpoints — approved values
  '.hero-grid{grid-template-columns:minmax(0,1fr) 460px;gap:48px}',
  '.hero-grid{grid-template-columns:1fr;gap:40px}',
  '.bridge-in{grid-template-columns:repeat(2,1fr)',
];

// the rejected bed0bac1 "rebalance" layout (reverted twice: 835b1fe3, f5ac1ca7)
// must never come back — these are its signature values
const FORBIDDEN = [
  ['padding:18px 0 32px', 'rejected hero padding (dark gap below stripe)'],
  ['grid-template-columns:minmax(0,1fr) 450px', 'rejected shrunk capper-card column'],
  ['grid-template-columns:minmax(0,1fr) 400px', 'rejected shrunk capper-card column (1400px band)'],
  ['gap:72px;align-items:start', 'rejected hero-grid align-start'],
  ['margin-top:44px', 'old fixed-offset stripe positioning (content-height dependent, not viewport-flush)'],
  ['position:fixed', 'stripe/hero must scroll naturally, never position:fixed'],
  ['<div class="wrap bridge"', 'rejected wrap-constrained bridge stripe (large side margins) — must be full-width, replaced 2026-08-01'],
  ['border-radius:12px;box-shadow:0 1px 2px rgba(3,10,20,.16), 0 14px 34px rgba(3,10,20,.24);display:grid;grid-template-columns:repeat(4,1fr) auto;align-items:stretch;overflow:hidden}', 'rejected rounded-card bridge-in (replaced by full-width flush stripe 2026-08-01)'],
];

for (const required of REQUIRED) {
  assert(page.includes(required), `approved homepage baseline rule missing:\n  ${required}`);
}
for (const [forbidden, why] of FORBIDDEN) {
  assert(!page.includes(forbidden), `rejected layout value found (${why}):\n  ${forbidden}`);
}

console.log(`homepage approved-baseline lock passed (${REQUIRED.length} required, ${FORBIDDEN.length} forbidden)`);
