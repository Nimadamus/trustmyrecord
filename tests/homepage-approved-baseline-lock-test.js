#!/usr/bin/env node
// APPROVED HOMEPAGE BASELINE LOCK — owner-approved layout frozen 2026-07-30
// (commit f5ac1ca7, re-applying 835b1fe3 + b727c7be after the 7fb28b22 clobber).
// Updated 2026-08-24 (explicit owner approval, Nima): hero compacted so the
// white stats stripe clears the fold on a laptop viewport -- hero top padding
// 43->0, h1 77->56px with 8px margins, sub 23px/1.4, cta gap 28/top 10 and a
// 62px hero button, eyebrow 8px, .spot hd/ft 14px, comp .bd 16/14, stage 170px.
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
  '--header-height:248px;',
  // hero shell is a flex column filling the viewport below the injected nav,
  // so .bridge (margin-top:auto below) always lands flush on the hero's
  // bottom edge regardless of viewport height or content height
  '.hero{position:relative;overflow:hidden;padding:0 0 0;display:flex;flex-direction:column;',
  'min-height:calc(100vh - var(--header-height));',
  'min-height:calc(100dvh - var(--header-height));',
  'min-height:calc(100svh - var(--header-height));',
  '.hero-in{position:relative;z-index:3;flex:1;display:flex;align-items:flex-start}',
  // runtime correction: nav is injected by tmr-ds-nav.js at runtime, so the
  // static fallback above must be replaced with the actual measured
  // value once nav+ticker have rendered
  "var top = Math.round(hero.getBoundingClientRect().top + window.scrollY);",
  "document.documentElement.style.setProperty('--header-height', top + 'px');",
  // Column width/gap held at the 1.2x (2026-08-23) value through the further
  // 2026-08-24 1.25x pass — see the note on the base .hero-grid rule in
  // tmr-home-v2.css. Growing it (and h1 below) further ran out of headroom
  // at common laptop widths (1366px flips the headline from 3 lines to 4-5).
  '.hero-grid{display:grid;grid-template-columns:minmax(0,1fr) 624px;gap:86px;align-items:center}',
  // The typeface, size, weight, case, tracking and margins are the approved
  // ones and are locked below exactly as before. What sits between 'Barlow
  // Condensed' and Inter now is a chain of metric-compatible FALLBACK faces —
  // the same system fonts the browser was already using while the webfont
  // loads, re-declared with size-adjust so they occupy Barlow Condensed's
  // width. Nothing about the rendered headline changes; the frame before it
  // arrives just stops being 60% wider and two lines taller.
  // font-size held at 77px (not the page's further 1.25x pass) for the same
  // wrap-headroom reason as the column width above; margin still scaled.
  ".hero h1.hh{color:#fff;font-family:'Barlow Condensed','Barlow Cond Fallback W','Barlow Cond Fallback A','Barlow Cond Fallback M',Inter,sans-serif;font-size:62px;line-height:1.04;font-weight:900;text-transform:uppercase;letter-spacing:.004em;margin:26px 0 28px}",
  // The fallback faces themselves, and the tuned ratios. Measured, not guessed
  // — see tests/hero-fallback-width-sweep.cjs.
  "@font-face{font-family:'Barlow Cond Fallback W';src:local('Segoe UI');",
  "size-adjust:78.8%;ascent-override:126.9%;descent-override:25.4%;line-gap-override:0%}",
  "size-adjust:70.8%;ascent-override:141.2%;descent-override:28.2%;line-gap-override:0%}",
  '.hero .cta{display:flex;align-items:center;gap:39px;margin-top:32px;flex-wrap:wrap}',
  // Hero right-hand card (.spot) — approved shell. The card's CONTENTS were
  // replaced on 2026-08-16 at Nima's instruction (Capper of the Week -> LIVE
  // COMPETITION), so the rules that described the old card's identity block,
  // three-up splits and sparkline are gone with it. The shell — the panel, the
  // gold rail, and the head/body/foot rows that give the card its footprint in
  // the hero grid — is unchanged and stays locked here, plus the geometry that
  // keeps the new card the same height on every view it rotates through.
  '.spot{background:var(--panel);border-radius:18px;',
  '.spot .rail{height:6px;background:linear-gradient(90deg,var(--gold-b),var(--brand-lt))}',
  '.spot .hd{padding:23px 36px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);background:var(--panel-2)}',
  '.spot .bd{padding:33px 36px 30px}',
  '.spot.comp .bd{padding:30px 36px 28px;display:flex;flex-direction:column}',
  // The fixed stage is what stops the card changing height as the view
  // rotates, which would bounce the whole vertically-centred hero column.
  '.comp-stage{position:relative;margin-top:20px;height:200px;overflow:hidden}',
  '.comp-view{position:absolute;inset:0;display:grid;grid-template-rows:repeat(3,1fr);',
  // Two-line reservation for the footer sentence. Without it the card grew
  // 13px when the payload replaced the one-line skeleton bar.
  'min-height:2.64em;',
  '.spot .ft{padding:23px 36px;',
  // white stats stripe (bridge) — pushed to the hero's bottom edge by
  // margin-top:auto inside the flex column (NOT a fixed offset); full-width,
  // no side margins, no rounded card (owner-requested 2026-08-01)
  '.bridge{position:relative;z-index:20;margin-top:auto;flex-shrink:0;width:100%}',
  '.bridge-in{background:var(--panel);display:grid;grid-template-columns:repeat(4,1fr) auto;align-items:stretch;padding:0 43px}',
  '<div class="bridge"',
  '<div class="bridge-in"',
  // responsive breakpoints — approved values
  '.hero-grid{grid-template-columns:minmax(0,1fr) 552px;gap:58px}',
  '.hero-grid{grid-template-columns:1fr;gap:48px}',
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

  // MATCHUP OF THE DAY TAKEOVER — REJECTED 2026-08-10 and removed.
  // The full-viewport homepage cover is gone; these entries stay so it cannot
  // come back, in that form or any other overlay shape. If a compact Matchup
  // module is added later it must be a normal in-flow element that does not
  // dominate the first viewport, and none of the following may appear.
  ['.motd{position:fixed', 'the cover must scroll away with the page, never overlay it'],
  ['.motd{position:sticky', 'the cover must scroll away with the page, never stick over it'],
  ['class="motd-close"', 'the cover must never have a dismiss/X control — it is not a popup'],
  ['.motd-backdrop', 'the cover must never dim or block the page behind it'],
  ['.motd{min-height:100vh', 'the cover must stay under a full viewport so the site below is visibly continuous'],
  ['min-height:100svh}\n.motd', 'the cover must stay under a full viewport on mobile'],
  ['.motd{z-index:', 'the cover must not be stacked above the navbar or the ticker'],
  ['body.motd-open', 'the cover must never lock or modify page scrolling'],
];

for (const required of REQUIRED) {
  assert(page.includes(required), `approved homepage baseline rule missing:\n  ${required}`);
}
for (const [forbidden, why] of FORBIDDEN) {
  assert(!page.includes(forbidden), `rejected layout value found (${why}):\n  ${forbidden}`);
}


console.log(`homepage approved-baseline lock passed (${REQUIRED.length} required, ${FORBIDDEN.length} forbidden)`);
