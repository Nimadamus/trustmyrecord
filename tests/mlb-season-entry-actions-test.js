#!/usr/bin/env node
/* SEASON_ENTRY_ACTIONS_20261111: with the server's prediction window open, Save Draft, Submit & Lock
   and the log in prompt must be reachable even while the baked "season complete" block is on the
   page. On 11/11/2026 that block hid all three (display:none !important on data-mlb-season-only)
   while the page said "2027 Season, Entries open", so no 2027 prediction could be submitted. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'mlb-season-simulator', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'static', 'js', 'season-simulator.js'), 'utf8');
const bc = fs.readFileSync(path.join(ROOT, 'static', 'js', 'tmr-sim-broadcast.js'), 'utf8');

function boot(windowOpen) {
  const body = (html.match(/<body[\s\S]*<\/body>/) || [html])[0].replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM('<!doctype html><html><head><style>[data-mlb-season-only]{display:none!important}</style></head>' + body + '</html>',
    { runScripts: 'outside-only', url: 'https://trustmyrecord.com/mlb-season-simulator/' });
  const w = dom.window;
  const teams = [];
  ['AL', 'NL'].forEach((lg) => ['East', 'Central', 'West'].forEach((dv) => { for (let i = 0; i < 5; i += 1) teams.push({ abbr: lg + dv[0] + i, name: lg + ' ' + dv + ' ' + i, league: lg, division: dv, mlbId: 100 + teams.length }); }));
  const divisions = []; ['AL', 'NL'].forEach((lg) => ['East', 'Central', 'West'].forEach((dv) => divisions.push({ label: lg + ' ' + dv, league: lg, division: dv, teams: teams.filter((t) => t.league === lg && t.division === dv).map((t) => t.abbr) })));
  const answer = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
  w.fetch = (url) => {
    if (/\/teams/.test(url)) return answer({ season_year: 2027, teams, divisions, prediction_window: { open: windowOpen, season_year: windowOpen ? 2027 : 2026, closes_at: '2027-09-26T17:05:00Z' } });
    return answer({ predictions: [], leaderboard: [], prediction: null });
  };
  w.confirm = () => true;
  w.eval(js);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return new Promise((resolve) => setTimeout(() => resolve(w), 60));
}
const shown = (w, id) => { const n = w.document.getElementById(id); return !!n && w.getComputedStyle(n).display !== 'none'; };

(async () => {
  for (const id of ['ss-actions', 'ss-auth-cta']) assert.ok(new RegExp('id="' + id + '"[^>]*data-mlb-season-only').test(html), id + ' is still governed by the season state block');
  assert.ok(/<!--MK:mlbSeasonState-->/.test(html), 'page carries the season state marker');

  let w = await boot(true);
  assert.ok(/2027/.test(w.document.querySelector('.ss-kicker').textContent), 'open window: the page moves to the season the server names');
  assert.ok(shown(w, 'ss-actions'), 'open window: Save Draft and Submit & Lock are visible');
  assert.ok(shown(w, 'ss-auth-cta'), 'open window, signed out: the log in prompt is visible');
  assert.ok(w.document.getElementById('ss-lock-btn') && w.document.getElementById('ss-draft-btn'), 'both buttons exist');

  w = await boot(false);
  assert.ok(!shown(w, 'ss-actions'), 'closed window: the baked offseason state still hides the actions');

  assert.ok(/\.ss-hero p:not\(\.ss-auth-cta p\)/.test(bc), 'the broadcast shell leaves the log in prompt sentence in place');
  assert.ok(/<div class="ss-auth-cta"[\s\S]{0,200}<p>[\s\S]*?Log in or create a free account/.test(html), 'the prompt has its sentence');
  console.log('mlb-season-entry-actions-test: PASS');
  process.exit(0);
})().catch((e) => { console.error('mlb-season-entry-actions-test: FAIL\n', e.message); process.exit(1); });
