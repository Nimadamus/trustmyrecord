#!/usr/bin/env node
/* MLB_SEASON_STATE_20261030 -- the ONE place that says where the MLB season is.
 *
 * Root cause this exists for: every MLB page decided for itself whether the
 * season was live. /mlb-playoff-odds/ kept simulating a World Series the
 * Brewers had already won ("better than 99%", "0 clubs still alive"), the hub
 * and the playoff page kept selling bracket locks, and nothing failed. Now one
 * file, data/mlb-season-state.json, built from MLB's own feed, carries the
 * phase and the champion, every MLB builder reads it, and
 * tests/mlb-season-state-gate-test.js fails a bake whose pages disagree with it.
 *
 * phase:
 *   'preseason'  before Opening Day of `season`
 *   'regular'    regular season games are being played
 *   'postseason' the postseason has started and no club has won the World Series
 *   'complete'   a club has won the World Series; lasts until the next Opening Day
 *
 * Usage: node scripts/mlb_season_state.js [--season 2026] [--out data/mlb-season-state.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const STATS = 'https://statsapi.mlb.com/api/v1';
const ROOT = path.resolve(__dirname, '..');
const OUT = 'data/mlb-season-state.json';

async function getJson(url) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'TrustMyRecord season state' } });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return await r.json();
    } catch (e) { last = e; await new Promise((res) => setTimeout(res, 1500 * (i + 1))); }
  }
  throw last;
}

/* Decide the champion from the World Series games themselves: four final wins.
   Pure, so the test can feed it fixtures. */
function worldSeriesResult(games, teamsById) {
  const final = (games || []).filter((g) => g.status && g.status.abstractGameState === 'Final');
  const wins = {};
  let lastFinal = null;
  for (const g of final) {
    const h = g.teams.home, a = g.teams.away;
    if (h.score == null || a.score == null || h.score === a.score) continue;
    const w = h.score > a.score ? h.team.id : a.team.id;
    wins[w] = (wins[w] || 0) + 1;
    if (!lastFinal || g.gameDate > lastFinal.gameDate) lastFinal = g;
  }
  const ids = new Set();
  (games || []).forEach((g) => { ids.add(g.teams.home.team.id); ids.add(g.teams.away.team.id); });
  const champId = Object.keys(wins).find((id) => wins[id] >= 4);
  if (!champId) return null;
  const otherId = [...ids].find((id) => String(id) !== String(champId));
  const t = (id) => { const m = teamsById[id] || {}; return { mlb_id: Number(id), abbr: m.abbreviation || String(id), name: m.name || String(id), short: m.teamName || m.name || String(id) }; };
  return {
    champion: t(champId),
    runner_up: otherId != null ? t(otherId) : null,
    games: [wins[champId], otherId != null ? (wins[otherId] || 0) : 0],
    clinched_at: lastFinal ? lastFinal.gameDate : null,
  };
}

/* Opening Day of `year`, accepted only when MLB's season record and its
   published schedule agree on it. */
async function openingDay(year) {
  const s = await getJson(`${STATS}/seasons/${year}?sportId=1`);
  const declared = s.seasons && s.seasons[0] && s.seasons[0].regularSeasonStartDate;
  if (!declared) return null;
  const sched = await getJson(`${STATS}/schedule?sportId=1&gameType=R&startDate=${year}-02-01&endDate=${year}-04-30`);
  const first = (sched.dates || []).find((d) => (d.games || []).length);
  if (!first || first.date !== declared) return null;
  return declared;
}

async function buildState(opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  let season = opts.season || now.getUTCFullYear();
  let info = (await getJson(`${STATS}/seasons/${season}?sportId=1`)).seasons[0];
  /* January to March belongs to last year's season until Opening Day. */
  if (!opts.season && info && info.regularSeasonStartDate && now.toISOString().slice(0, 10) < info.regularSeasonStartDate) {
    season -= 1;
    info = (await getJson(`${STATS}/seasons/${season}?sportId=1`)).seasons[0];
  }
  if (!info) throw new Error('no MLB season record for ' + season);
  const today = now.toISOString().slice(0, 10);
  const teams = await getJson(`${STATS}/teams?sportId=1&season=${season}`);
  const byId = Object.fromEntries(teams.teams.map((t) => [t.id, t]));
  const ws = await getJson(`${STATS}/schedule?sportId=1&gameType=W&season=${season}`);
  const wsGames = [].concat(...(ws.dates || []).map((d) => d.games || []));
  const result = worldSeriesResult(wsGames, byId);
  let phase;
  if (result) phase = 'complete';
  else if (info.postSeasonStartDate && today >= info.postSeasonStartDate) phase = 'postseason';
  else if (today >= info.regularSeasonStartDate) phase = 'regular';
  else phase = 'preseason';
  const next = season + 1;
  const nextOpening = phase === 'complete' ? await openingDay(next) : null;
  return {
    sport: 'mlb',
    season,
    phase,
    champion: result ? result.champion : null,
    runner_up: result ? result.runner_up : null,
    world_series: result ? { games: result.games, clinched_at: result.clinched_at } : null,
    next_season: next,
    next_opening_day: nextOpening,
    regular_season_start: info.regularSeasonStartDate,
    regular_season_end: info.regularSeasonEndDate,
    postseason_start: info.postSeasonStartDate,
    source: 'statsapi.mlb.com (seasons, schedule gameType=W)',
    checked_at: now.toISOString(),
  };
}

/* Shared readers for the builders. */
function readState(root) {
  const f = path.join(root || ROOT, OUT);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
function isComplete(state) { return !!(state && state.phase === 'complete' && state.champion); }
function ptLongDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
}
/* The one sentence every MLB page uses in the offseason. */
function completeLine(state) {
  if (!isComplete(state)) return '';
  const c = state.champion, r = state.runner_up, g = state.world_series.games;
  return `The ${state.season} MLB season is complete. The ${c.name} won the World Series, beating the ${r ? r.name : 'their opponent'} ${g[0]} games to ${g[1]}.`
    + (state.next_opening_day ? ` The ${state.next_season} season opens on ${ptLongDate(state.next_opening_day)}.` : '');
}

module.exports = { buildState, worldSeriesResult, readState, isComplete, completeLine, ptLongDate, OUT };

if (require.main === module) (async () => {
  const args = process.argv.slice(2);
  const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const state = await buildState({ season: Number(val('--season')) || undefined });
  const out = path.join(ROOT, val('--out') || OUT);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(state, null, 2) + '\n');
  console.log(`mlb season state: ${state.season} ${state.phase}${state.champion ? ', champion ' + state.champion.name + ' ' + state.world_series.games.join('-') : ''}${state.next_opening_day ? ', next opening day ' + state.next_opening_day : ''}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
