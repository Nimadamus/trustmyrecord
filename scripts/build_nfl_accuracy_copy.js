'use strict';
/* NFL_ACCURACY_ONE_SOURCE_20261030. Bakes every accuracy figure on /nfl-simulator/ and
   /nfl-playoff-simulator/ from GET /api/nfl/public/accuracy (see scripts/nfl-accuracy-copy.js).
   Saves the snapshot it rendered from as nfl-simulator/accuracy-public.json, which
   tests/nfl-accuracy-copy-test.js checks the pages against.

   node scripts/build_nfl_accuracy_copy.js [--input file.json]
   API unreachable or incomplete: changes nothing and exits 0 (the last bake stays). */
const fs = require('fs');
const path = require('path');
const C = require('./nfl-accuracy-copy');

const ROOT = path.resolve(__dirname, '..');
const SIM = path.join(ROOT, 'nfl-simulator', 'index.html');
const PLAYOFF = path.join(ROOT, 'nfl-playoff-simulator', 'index.html');
const SNAP = path.join(ROOT, 'nfl-simulator', 'accuracy-public.json');
const API = 'https://trustmyrecord-api.onrender.com/api/nfl/public/accuracy';

async function load() {
  const i = process.argv.indexOf('--input');
  if (i > -1) return JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8'));
  let last;
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(API, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { last = e; await new Promise((res) => setTimeout(res, 5000)); }
  }
  throw last;
}

(async () => {
  let api;
  try { api = await load(); } catch (e) { console.log('nfl accuracy copy: API unavailable (' + e.message + '), last bake left live'); return; }
  const h = api.holdout || {};
  if (!h.model || h.model.brier == null || !h.market_favourite || !h.home_team || !h.coin_flip) {
    console.log('nfl accuracy copy: holdout block incomplete, last bake left live'); return;
  }
  const snap = C.snapshotOf(api);
  fs.writeFileSync(SIM, C.renderSimulatorPage(fs.readFileSync(SIM, 'utf8'), snap));
  fs.writeFileSync(PLAYOFF, C.renderPlayoffPage(fs.readFileSync(PLAYOFF, 'utf8'), snap));
  fs.writeFileSync(SNAP, JSON.stringify(snap, null, 1) + '\n');
  console.log(`nfl accuracy copy: holdout Brier ${snap.holdout.model.brier}, served ${snap.served ? snap.served.graded_games + ' graded games' : 'none yet'}`);
})().catch((e) => { console.error('nfl accuracy copy FAILED:', e.stack || e.message); process.exit(1); });
