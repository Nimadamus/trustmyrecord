#!/usr/bin/env node
// APPROVED HOMEPAGE BASELINE LOCK — owner-approved layout frozen 2026-07-30
// (commit f5ac1ca7, re-applying 835b1fe3 + b727c7be after the 7fb28b22 clobber).
// Updated 2026-07-31: hero converted to a viewport-driven flex column so the
// stats stripe (.bridge) stays flush to the hero's bottom edge at every
// desktop viewport height, not just the content height the old fixed
// margin-top happened to produce.
// Every rule below must exist byte-exact in index.html. If a change here is
// intentional, it requires Nima's explicit approval FIRST; then update this
// list in the same commit.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const page = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

const REQUIRED = [
  'APPROVED HOMEPAGE BASELINE',
  // 113px = measured nav(70) + live-scores ticker(43) height, the real stack
  // rendered above .hero (there is no static <nav> in this document -- see
  // the runtime measurement script below). This is a no-JS/first-paint
  // fallback only; the inline script overrides it with the actual rendered
  // value once tmr-ds-nav.js has run.
  '--header-height:113px;',
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
  "var top = hero.getBoundingClientRect().top + window.scrollY;",
  "document.documentElement.style.setProperty('--header-height', top + 'px');",
  '.hero-grid{display:grid;grid-template-columns:minmax(0,1fr) 520px;gap:72px;align-items:center}',
  ".hero h1.hh{color:#fff;font-family:'Barlow Condensed',Inter,sans-serif;font-size:64px;line-height:1.02;font-weight:900;text-transform:uppercase;letter-spacing:.004em;margin:18px 0 16px}",
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
  // margin-top:auto inside the flex column (NOT a fixed offset); rounded
  // corners + equal side margins via .wrap
  '.bridge{position:relative;z-index:20;margin-top:auto;flex-shrink:0}',
  '.bridge-in{background:var(--panel);border:1px solid #E3E8EF;border-radius:12px;',
  '<div class="wrap bridge"',
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
];

for (const required of REQUIRED) {
  assert(page.includes(required), `approved homepage baseline rule missing:\n  ${required}`);
}
for (const [forbidden, why] of FORBIDDEN) {
  assert(!page.includes(forbidden), `rejected layout value found (${why}):\n  ${forbidden}`);
}

console.log(`homepage approved-baseline lock passed (${REQUIRED.length} required, ${FORBIDDEN.length} forbidden)`);
