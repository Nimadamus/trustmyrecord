'use strict';
/*
 * Lock: nothing in the hero may change height when the webfont replaces the
 * metric fallback.
 *
 * Aug 3 2026 defect. Two independent elements re-wrapped on font load:
 *
 *   .bridge .s span  — the stat labels. In the 2-column bridge a cell is about
 *     (100vw/2 - 72)px and the longest label ("Verified Cappers") needs 127px
 *     on one line, so below ~399px a label wraps. Inter is WIDER than the
 *     fallback face here, so labels that fit on one line at first paint
 *     re-wrapped to two when the webfont arrived, growing the stripe.
 *
 *   .spot .sub2  — the capper-card meta line. At 390-411px it needs 4 lines in
 *     the fallback and 3 with Inter, collapsing the card by 21.7px.
 *
 * Both are fixed by reserving the TALLER (first-paint) state up front, so the
 * first and final paints are identical. min-height only ever reserves, so
 * neither rule can clip text.
 *
 * Static source check — the live geometry proof is site-qa/_bridge_movement.cjs,
 * which holds the font files back and diffs the two paints.
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failed = 0;
const check = (name, cond, detail) => {
  if (cond) { console.log(`  ok  ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
};

// Grab a @media(max-width:NNNpx){...} block whose body matches `sel`.
const blockFor = (sel) => {
  const re = /@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[2].includes(sel)) return { bp: Number(m[1]), body: m[2] };
  }
  return null;
};

// ---- bridge stat labels -------------------------------------------------
const bridge = blockFor('.bridge .s span');
check('a media block reserves height for .bridge .s span', !!bridge);
if (bridge) {
  check(
    'the bridge reservation covers the widths where a label can wrap (>=400px)',
    bridge.bp >= 400,
    `breakpoint is ${bridge.bp}px; the longest label stops wrapping at ~399px`
  );
  check(
    'the bridge reservation stops before cells that never wrap (<=430px)',
    bridge.bp <= 430,
    `breakpoint is ${bridge.bp}px; beyond ~430px this only adds a blank line`
  );
  check(
    'it pins line-height so the lh reservation is exact',
    /\.bridge \.s span\{[^}]*line-height:\s*1\.5/.test(bridge.body)
  );
  check(
    'it reserves two label lines, with an em fallback for engines without lh',
    /\.bridge \.s span\{[^}]*min-height:\s*3em[^}]*min-height:\s*2lh/.test(bridge.body),
    `block body: ${bridge.body.trim().slice(0, 160)}`
  );
}

// ---- hero right-hand card ----------------------------------------------
// The wrapping meta line this section used to guard (.spot .sub2, the Capper of
// the Week card) no longer exists: the LIVE COMPETITION module that replaced it
// on 2026-08-16 has no wrapping prose at all. It is immune to the font swap by
// construction instead of by reservation, and these two rules are what make
// that true — so they are what is locked now.
check(
  'the competition headline can never re-wrap on font load',
  /\.comp-title\{[^}]*white-space:nowrap/.test(html),
  'the headline is the only multi-word display string in the card; if it may ' +
  'wrap, the card changes height when Barlow Condensed replaces the fallback'
);
check(
  'the rotating stage is a fixed height, not a content height',
  /\.comp-stage\{[^}]*height:\s*\d+px/.test(html),
  'row content must never set the card height — not on font load, and not when ' +
  'the view rotates'
);
check(
  'every row string is clipped to one line rather than allowed to wrap',
  /\.comp-nm\{[^}]*white-space:nowrap/.test(html) &&
  /\.comp-meta\{[^}]*white-space:nowrap/.test(html) &&
  /\.comp-num\{[^}]*white-space:nowrap/.test(html)
);

// ---- reservations must never clip --------------------------------------
for (const [sel, body] of [['.bridge .s span', bridge && bridge.body]]) {
  if (!body) continue;
  const rule = body.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'));
  check(
    `${sel} reserves without clipping`,
    !!rule && !/overflow\s*:\s*hidden|line-clamp|max-height/.test(rule[1]),
    'min-height may only reserve space; clamping would cut the text off'
  );
}

// ---- desktop must be untouched -----------------------------------------
check(
  'the base .bridge .s span rule is unchanged (desktop keeps one-line labels)',
  // Scaled 1.2x for the 2026-08-23 homepage size restore (11.5px -> 14px,
  // 6px -> 7px), then a further 1.25x for the 2026-08-24 pass (14px -> 18px,
  // 7px -> 9px, rounded to whole pixels).
  html.includes('.bridge .s span{display:block;font-size:18px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:9px}'),
  'the approved desktop label rule must not gain a min-height'
);
check(
  'the competition footer sentence reserves both of its lines',
  /\.comp-foot\{[^}]*min-height:\s*2\.64em/.test(html),
  'the skeleton bar is one line and the real sentence is two; without the ' +
  'reservation the card grows when the payload lands'
);

console.log(
  failed
    ? `\nhomepage font-swap reflow lock FAILED (${failed} check${failed === 1 ? '' : 's'})`
    : '\nhomepage font-swap reflow lock passed (12 checks)'
);
process.exit(failed ? 1 : 0);
