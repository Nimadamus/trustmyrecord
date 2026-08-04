'use strict';
/*
 * Lock: the homepage must not overflow horizontally on very narrow phones.
 *
 * Aug 3 2026 defect — `section.final` carries `padding: 44px 44px`, so at a
 * 320px viewport its content box is only 176px wide. The closing CTA
 * (`a.btn.p.lg`) is `white-space: nowrap` with `padding: 0 32px`, giving it a
 * min-content width of ~250px. A flex item cannot shrink below min-content, so
 * the button spilled past both the navy panel and the viewport, leaving the
 * document 2px wider than the screen (scrollWidth 322 vs clientWidth 320).
 *
 * This is a static source check so it runs in `test:unit` with no browser.
 * The live geometry proof is site-qa/_ov320.cjs.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');

let failed = 0;
const check = (name, cond, detail) => {
  if (cond) { console.log(`  ok  ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
};

// Pull the narrow-phone media block that guards the closing CTA.
const block = html.match(/@media\s*\(\s*max-width\s*:\s*3[0-4]\d\s*px\s*\)\s*\{([\s\S]*?)\n\}/);

check(
  'a narrow-phone media block (max-width <= 340px) exists',
  !!block,
  'the .final CTA overflows the viewport at 320px without it'
);

if (block) {
  const body = block[1];

  check(
    'it relaxes .final side padding',
    /\.final\s*\{[^}]*padding\s*:/.test(body),
    `block body: ${body.trim().slice(0, 200)}`
  );

  check(
    'it lets the closing CTA use the full content box',
    /\.final\s+\.btn\.lg\s*\{[^}]*width\s*:\s*100%/.test(body),
    'without width:100% the nowrap button keeps its ~250px min-content width'
  );

  check(
    'it reduces the CTA horizontal padding below the default 32px',
    (() => {
      const m = body.match(/\.final\s+\.btn\.lg\s*\{[^}]*padding\s*:\s*0\s+(\d+(?:\.\d+)?)px/);
      return !!m && Number(m[1]) < 32;
    })(),
    'the button min-content must fit a 320px viewport'
  );

  // Guard the arithmetic that makes the fix work, so a later padding tweak
  // that silently reintroduces the overflow fails here instead of on a phone.
  const finalPad = body.match(/\.final\s*\{[^}]*padding\s*:\s*[\d.]+px\s+(\d+(?:\.\d+)?)px/);
  const btnPad = body.match(/\.final\s+\.btn\.lg\s*\{[^}]*padding\s*:\s*0\s+(\d+(?:\.\d+)?)px/);
  check(
    'the CTA still fits inside a 320px viewport at these paddings',
    (() => {
      if (!finalPad || !btnPad) return false;
      const WRAP_PAD = 28;          // .wrap horizontal padding
      const CTA_TEXT = 185.8;       // measured "Start Your Free Record" + icon gap
      const contentBox = 320 - 2 * WRAP_PAD - 2 * Number(finalPad[1]);
      const minContent = CTA_TEXT + 2 * Number(btnPad[1]);
      return minContent <= contentBox;
    })(),
    finalPad && btnPad
      ? `content box ${320 - 56 - 2 * Number(finalPad[1])}px vs button min-content ${185.8 + 2 * Number(btnPad[1])}px`
      : 'could not parse paddings'
  );
}

// The default (wide) rules must be left alone.
check(
  '.final keeps its approved 44px padding at full width',
  /\.final\{[^}]*padding:44px 44px/.test(html),
  'the narrow fix must not change the approved desktop panel'
);
check(
  '.btn.lg keeps its approved 0 32px padding at full width',
  /\.btn\.lg\{[^}]*padding:0 32px/.test(html),
  'the narrow fix must be scoped to the media query only'
);

console.log(
  failed
    ? `\nhomepage narrow-viewport overflow lock FAILED (${failed} check${failed === 1 ? '' : 's'})`
    : '\nhomepage narrow-viewport overflow lock passed (7 checks)'
);
process.exit(failed ? 1 : 0);
