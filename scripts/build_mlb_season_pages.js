#!/usr/bin/env node
/* MLB_SEASON_STATE_20261030 -- applies data/mlb-season-state.json to the
 * hand-maintained MLB simulator pages.
 *
 * Each page carries one block between <!--MK:mlbSeasonState--> markers, right
 * after its <h1>. When the season is complete the block states the champion and
 * the next Opening Day, and hides every element marked data-mlb-season-only
 * (postseason, bracket and lock calls to action that only make sense while games
 * are being played). In any other phase the block is empty and those elements
 * show again, so nothing needs hand editing when the next season starts.
 *
 * /mlb-playoff-odds/ and the 30 team pages are handled by
 * scripts/build_mlb_odds_page.js from the same state file.
 *
 * Usage: node scripts/build_mlb_season_pages.js [--check]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SS = require('./mlb_season_state.js');

const ROOT = path.resolve(__dirname, '..');
const PAGES = ['mlb-simulator', 'mlb-game-simulator', 'mlb-season-simulator', 'mlb-playoff-simulator',
  'mlb-predictions-simulator', 'mlb-simulation-predictions'];
const RE = /<!--MK:mlbSeasonState-->[\s\S]*?<!--\/MK:mlbSeasonState-->/;

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function block(state) {
  if (!SS.isComplete(state)) return '<!--MK:mlbSeasonState--><!--/MK:mlbSeasonState-->';
  const c = state.champion, r = state.runner_up, g = state.world_series.games;
  const next = state.next_opening_day ? ` The ${state.next_season} season opens on ${esc(SS.ptLongDate(state.next_opening_day))}.` : '';
  return '<!--MK:mlbSeasonState-->'
    + '<style>[data-mlb-season-only]{display:none!important}</style>'
    + `<p class="mlb-season-banner" data-mlb-phase="complete" role="status" style="margin:14px 0;padding:12px 14px;border-left:4px solid #e0a800;border-radius:10px;background:rgba(224,168,0,.12);font-size:.95rem;line-height:1.5;color:inherit;">`
    + `<strong>${state.season} season complete: the ${esc(c.name)} won the World Series.</strong> They beat the ${esc(r ? r.name : 'their opponent')} ${g[0]} games to ${g[1]}.${next} `
    + `<a href="/mlb-playoff-odds/" style="color:inherit;font-weight:700;">Final ${state.season} results</a></p>`
    + '<!--/MK:mlbSeasonState-->';
}

function apply(html, state, file) {
  const b = block(state);
  if (RE.test(html)) return html.replace(RE, b);
  const at = html.indexOf('</h1>');
  if (at < 0) throw new Error(file + ': no </h1> to anchor the season block');
  return html.slice(0, at + 5) + (html.includes('\r\n') ? '\r\n' : '\n') + b + html.slice(at + 5);
}

module.exports = { PAGES, block, apply };

if (require.main === module) {
  const state = SS.readState(ROOT);
  if (!state) { console.error('FAILED: data/mlb-season-state.json missing; run scripts/mlb_season_state.js'); process.exit(1); }
  for (const d of PAGES) {
    const f = path.join(ROOT, d, 'index.html');
    const html = fs.readFileSync(f, 'utf8');
    const next = apply(html, state, f);
    if (next !== html) fs.writeFileSync(f, next);
  }
  console.log(`mlb season pages: ${PAGES.length} pages, phase ${state.phase}`);
}
