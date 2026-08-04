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

// ---- capper-card meta line ---------------------------------------------
const spot = blockFor('.spot .sub2');
check('a media block reserves height for .spot .sub2', !!spot);
if (spot) {
  check(
    'the capper reservation covers the 390-411px band that straddles the wrap',
    spot.bp >= 400 && spot.bp <= 430,
    `breakpoint is ${spot.bp}px; both faces agree at <=360px and at >=412px`
  );
  check(
    'it reserves four meta lines, with an em fallback',
    /\.spot \.sub2\{[^}]*min-height:\s*6em[^}]*min-height:\s*4lh/.test(spot.body),
    `block body: ${spot.body.trim().slice(0, 160)}`
  );
}

// ---- reservations must never clip --------------------------------------
for (const [sel, body] of [['.bridge .s span', bridge && bridge.body], ['.spot .sub2', spot && spot.body]]) {
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
  html.includes('.bridge .s span{display:block;font-size:11.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:6px}'),
  'the approved desktop label rule must not gain a min-height'
);
check(
  'the base .spot .sub2 rule is unchanged',
  html.includes('.spot .sub2{display:block;font-size:14.5px;color:var(--muted);font-weight:600;margin-top:5px}'),
  'the approved desktop meta-line rule must not gain a min-height'
);

console.log(
  failed
    ? `\nhomepage font-swap reflow lock FAILED (${failed} check${failed === 1 ? '' : 's'})`
    : '\nhomepage font-swap reflow lock passed (11 checks)'
);
process.exit(failed ? 1 : 0);
