'use strict';
/* NFL_BAKE_FRESHNESS_GATE_20261030. Every NFL page builder reads
   /api/nfl/public/playoff-inputs, whose freshness_status is the API's one verdict on
   its own data: 'ok' | 'stale_sources' | 'stale_projection' | 'no_projection'.
   Before this gate the builders ignored it, so a bake could stamp "read just now"
   on standings built from a schedule or score feed that had stopped updating.

   - 'ok': bake.
   - 'stale_projection': bake (results and standings are current; only the model's
     odds for unplayed games are older than half their budget) and FLAG.
   - 'stale_sources' / 'no_projection' / missing: do NOT bake this page (the last
     good bake stays live) and FLAG.
   A flag is a line appended to NFL_FRESHNESS_FLAG_FILE (default .nfl-freshness-flag,
   never committed); the League Simulator Bake workflow opens a sim-bake-alert issue
   when that file is not empty. */
const fs = require('fs');
const path = require('path');

const FLAG_FILE = process.env.NFL_FRESHNESS_FLAG_FILE || path.join(__dirname, '..', '.nfl-freshness-flag');
const BLOCKING = new Set(['stale_sources', 'no_projection']);

function verdict(d) {
  const s = d && d.freshness_status;
  if (s === 'ok') return { bake: true, flag: null };
  const stale = d && d.source_data && Array.isArray(d.source_data.stale_feeds) ? d.source_data.stale_feeds.join(', ') : '';
  const why = `freshness_status=${s == null ? 'missing' : s}${stale ? ' (stale feeds: ' + stale + ')' : ''}`;
  if (s === 'stale_projection') return { bake: true, flag: why };
  return { bake: false, flag: why };
}

/** Returns true when the page may be baked; records a flag otherwise or when degraded. */
function gate(d, page) {
  const v = verdict(d);
  if (v.flag) {
    const line = `${page}: ${v.flag}; ${v.bake ? 'baked anyway, results are current' : 'NOT baked, last good page left live'}`;
    console.log('NFL FRESHNESS GATE: ' + line);
    try { fs.appendFileSync(FLAG_FILE, line + '\n'); } catch (e) { /* the console line still shows in the run log */ }
  }
  return v.bake;
}

module.exports = { verdict, gate, BLOCKING, FLAG_FILE };
