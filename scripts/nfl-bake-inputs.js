#!/usr/bin/env node
/**
 * NFL_BAKE_FRESH_READ_20261105. ONE read of /api/nfl/public/playoff-inputs for the whole bake.
 * The season, team and playoff builders each used to fetch for themselves, so the first one
 * could be answered from the API's old in-memory snapshot while the store read ran behind it
 * (11/05: nine Ravens games differed by 5 to 9.5 points between two pages stamped the same
 * minute). This reads until the API has no restore pending and two reads name the same
 * snapshot, writes that one payload to a file, and every builder takes it with --inputs.
 *
 * Usage: node scripts/nfl-bake-inputs.js <out.json>      exit 1 when no settled read is had.
 */
'use strict';
const fs = require('fs');

const WAIT_MS = Number(process.env.NFL_BAKE_READ_WAIT_MS || 3000);

function seasonNow(now = new Date()) {
  return now.getUTCMonth() <= 1 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

/** True when a read can be used: complete, and the same snapshot as the read before it. */
function settled(prev, d) {
  if (!d || !d.projections_available || !d.games || d.games.length < 272) return false;
  if (d.projection_restore_pending) return false;
  return !!prev && prev.projections_generated_at === d.projections_generated_at;
}

/** read(): one API read. Pure of the network so the test can drive it. */
async function settledRead(read, { tries = 6, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let prev = null, last = null;
  for (let i = 0; i < tries; i++) {
    let d = null;
    try { d = await read(); } catch (e) { last = e; }
    if (settled(prev, d)) return d;
    prev = d;
    if (d) last = new Error('not settled: ' + d.projection_state + ' ' + d.projections_generated_at);
    await wait(WAIT_MS);
  }
  throw last || new Error('no read');
}

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error('usage: nfl-bake-inputs.js <out.json>');
  const url = 'https://trustmyrecord-api.onrender.com/api/nfl/public/playoff-inputs?season=' + seasonNow();
  const d = await settledRead(async () => {
    const r = await fetch(url, { signal: AbortSignal.timeout(180000), cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
  fs.writeFileSync(out, JSON.stringify(d));
  console.log('nfl inputs: snapshot ' + d.projections_generated_at + ', read ' + d.generated_at);
}

if (require.main === module) main().catch((e) => { console.error('nfl inputs FAILED:', e.message); process.exit(1); });
module.exports = { settled, settledRead };
