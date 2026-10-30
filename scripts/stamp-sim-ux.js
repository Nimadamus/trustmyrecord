#!/usr/bin/env node
/* SIM_UX_20261030 -- put the current shared UX layer block on every simulator page.
     node scripts/stamp-sim-ux.js           write
     node scripts/stamp-sim-ux.js --check   exit 1 if any page lacks the current block
   Builders call the same inject() (scripts/sim-ux.js), so a rebake keeps it.
   Only the block changes; each page keeps its own line endings. */
'use strict';
const fs = require('fs');
const path = require('path');
const SIMUX = require('./sim-ux.js');

function run(check) {
  const block = SIMUX.block();
  const stale = [];
  let wrote = 0;
  for (const file of SIMUX.simPages()) {
    const html = fs.readFileSync(file, 'latin1');
    if (!/<\/head>/i.test(html)) continue;          // fragments, not pages
    const blocks = html.match(SIMUX.BLOCK_RE) || [];
    if (blocks.length === 1 && blocks[0].trim() === block) continue;
    stale.push(path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/'));
    if (!check) { fs.writeFileSync(file, SIMUX.inject(html), 'latin1'); wrote++; }
  }
  return { stale, wrote };
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  const r = run(check);
  if (check) {
    if (r.stale.length) { console.error(`${r.stale.length} sim page(s) lack the current SIM_UX block, e.g. ${r.stale.slice(0, 5).join(', ')} (run: node scripts/stamp-sim-ux.js)`); process.exit(1); }
    console.log('every sim page carries the current SIM_UX block');
  } else console.log(`stamped ${r.wrote} sim page(s)`);
}
module.exports = { run };
