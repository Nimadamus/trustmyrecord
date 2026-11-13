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

/* MLB_PHASE_COPY_20261105: prose that is only true for part of the year sits between
   <!--MK:mlbPhase:key--> markers and follows the season state, in both directions, so
   it goes back to the in-season wording by itself when the next season opens. */
/* SEASON_2027_ENTRIES_20261105: set to 2027 in the same release as the backend window
   (routes/seasonSimulator.js). The page script already follows the server; this keeps the
   prose and FAQ in step with it. Null means entries are closed. */
const ENTRIES_OPEN_SEASON = 2027;   /* 2027: the backend window (bb759bd4) went out on 11/11/2026 */
const PHASE_COPY = {
  'season-builder': { live: 'The builder above is live: pick your teams, submit while logged in, and your entry is saved to your account and timestamped so it counts.',
    done: (s) => (ENTRIES_OPEN_SEASON
      ? `${ENTRIES_OPEN_SEASON} entries are open until first pitch of the season: pick your teams, submit while logged in, and your entry is saved to your account and timestamped so it counts.`
      : `${s.season} entries are locked and graded against the real results, and the builder above stays closed until entries open for ${s.next_season}.`) },
  'season-bracket': { live: 'as a live MLB playoff simulator that grades in October.', done: () => 'as an MLB playoff bracket that is graded against the real October results.' },
  'season-tonight': { live: 'For tonight, the', done: () => 'Once games return, the' },
  'po-set': { live: 'and the twelve team bracket is set.', done: () => 'and twelve teams made the bracket.' },
  'po-path': { live: 'so the path for every team is fixed today.', done: () => 'so the path for every team was fixed on the first day of the postseason.' },
  'po-rerun': { live: 'The <a href="/mlb-playoff-odds/">live odds page</a> reruns as results come in.', done: (s) => `The <a href="/mlb-playoff-odds/">odds page</a> now carries the final ${s.season} results.` },
};
const PHASE_RE = /(<!--MK:mlbPhase:([a-z-]+)-->)[\s\S]*?(<!--\/MK:mlbPhase-->)/g;
function applyPhaseCopy(html, state) {
  return html.replace(PHASE_RE, (all, open, key, close) => {
    const c = PHASE_COPY[key];
    if (!c) throw new Error('unknown mlbPhase key ' + key);
    return open + (SS.isComplete(state) ? c.done(state) : c.live) + close;
  });
}
/* The closed season page cannot say yes in its FAQ (visible and JSON-LD). */
const SEASON_FAQ_Q = 'Can I submit MLB season predictions on this page?';
function seasonFaq(state) {
  if (ENTRIES_OPEN_SEASON) return `Yes. ${ENTRIES_OPEN_SEASON} entries are open until first pitch of the season. Log in, make your calls, and lock them to put them on your public record.`;
  return `Not right now. ${state.season} entries are locked and graded. Locked entries stay on the public record, and this page reopens for ${state.next_season} predictions.`;
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* SEASON_FIRST_PAINT_20261113: with next season's entries open, the season page must not
   bake the closed state. Before this the static page said "2026 Season, Entries closed"
   next to "2027 entries are open" and hid Save, Lock and the log in prompt until the
   script heard from the server. The two entry controls are left out of the hide rule
   (no !important on them, so the script can still close them if the server says closed)
   and the kicker is baked with the same words the script writes for an open window. */
const ENTRY_CONTROLS = ['ss-actions', 'ss-auth-cta'];
function entriesOpenOn(page) { return !!ENTRIES_OPEN_SEASON && page === 'mlb-season-simulator'; }
const KICKER_RE = /(<span class="ss-kicker">)[\s\S]*?(<\/span>)/;
function kicker(html, state, page) {
  if (!SS.isComplete(state) || page !== 'mlb-season-simulator') return html;
  const inner = ENTRIES_OPEN_SEASON
    ? `<i class="fas fa-unlock"></i> ${ENTRIES_OPEN_SEASON} Season &middot; Entries open`
    : `<i class="fas fa-lock"></i> ${state.season} Season &middot; Entries closed`;
  if (!KICKER_RE.test(html)) throw new Error(page + ': no ss-kicker to stamp');
  return html.replace(KICKER_RE, (all, o, c) => o + inner + c);
}

function block(state, page) {
  if (!SS.isComplete(state)) return '<!--MK:mlbSeasonState--><!--/MK:mlbSeasonState-->';
  const keep = entriesOpenOn(page) ? ENTRY_CONTROLS.map((id) => `:not(#${id})`).join('') : '';
  const c = state.champion, r = state.runner_up, g = state.world_series.games;
  const next = state.next_opening_day ? ` The ${state.next_season} season opens on ${esc(SS.ptLongDate(state.next_opening_day))}.` : '';
  return '<!--MK:mlbSeasonState-->'
    + `<style>[data-mlb-season-only]${keep}{display:none!important}[data-mlb-offseason-only]{display:flex!important}</style>`
    + `<p class="mlb-season-banner" data-mlb-phase="complete" role="status" style="margin:14px 0;padding:12px 14px;border-left:4px solid #e0a800;border-radius:10px;background:rgba(224,168,0,.12);font-size:.95rem;line-height:1.5;color:inherit;">`
    + `<strong>${state.season} season complete: the ${esc(c.name)} won the World Series.</strong> They beat the ${esc(r ? r.name : 'their opponent')} ${g[0]} games to ${g[1]}.${next} `
    + `<a href="/mlb-playoff-odds/" style="color:inherit;font-weight:700;">Final ${state.season} results</a></p>`
    + '<!--/MK:mlbSeasonState-->';
}

function apply(html, state, file, page) {
  const b = block(state, page);
  if (RE.test(html)) return html.replace(RE, b);
  const at = html.indexOf('</h1>');
  if (at < 0) throw new Error(file + ': no </h1> to anchor the season block');
  return html.slice(0, at + 5) + (html.includes('\r\n') ? '\r\n' : '\n') + b + html.slice(at + 5);
}

module.exports = { PAGES, block, apply, applyPhaseCopy, PHASE_COPY, seasonFaq, SEASON_FAQ_Q, kicker, entriesOpenOn, ENTRY_CONTROLS, ENTRIES_OPEN_SEASON };

if (require.main === module) {
  const state = SS.readState(ROOT);
  if (!state) { console.error('FAILED: data/mlb-season-state.json missing; run scripts/mlb_season_state.js'); process.exit(1); }
  for (const d of PAGES) {
    const f = path.join(ROOT, d, 'index.html');
    const html = fs.readFileSync(f, 'utf8');
    let next = kicker(applyPhaseCopy(apply(html, state, f, d), state), state, d);
    if (d === 'mlb-season-simulator' && SS.isComplete(state)) {
      const r = require('./stamp-sim-run-policy.js').stampPage(next, SEASON_FAQ_Q, seasonFaq(state));
      if (r.problems.length) throw new Error('season FAQ: ' + r.problems.join('; '));
      next = r.text;
    }
    if (next !== html) fs.writeFileSync(f, next);
  }
  console.log(`mlb season pages: ${PAGES.length} pages, phase ${state.phase}`);
}
