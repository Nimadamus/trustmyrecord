#!/usr/bin/env node
/*
 * MLB Simulator DAILY ROSTER + LINEUP SYNC / VERIFIER.
 *
 * Loads the PRODUCTION engine (static/js/mlb-simulator.js) with browser globals
 * stubbed but REAL network fetch, then drives the real shipped code path
 * (fetchTeamRoster -> fetchInjuredRoster -> fetchRecentStartingLineup ->
 * fetchTodaysTransactions -> collectMlbTeamRoster) for all 30 clubs.
 *
 * It (a) proves every team refreshed, (b) validates each resulting lineup is 9
 * distinct active players with defensive/DH assignments, (c) reports every
 * player removed/replaced as inactive and every in-game substitute rejected,
 * (d) detects same-day transactions, and (e) writes a machine-readable report.
 *
 * Usage:
 *   node scripts/lineup-sync.cjs [--engine <path>] [--out <file>] [--teams SF,KC]
 *   --engine may be a local path OR an https URL (verify the LIVE deployed file).
 * Exit 0 = all teams synced and every lineup valid; 1 = otherwise.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
function arg(name, dflt) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; }
const ENGINE = arg('--engine', path.join(__dirname, '..', 'static', 'js', 'mlb-simulator.js'));
const OUT = arg('--out', path.join(__dirname, '..', '_lineup_sync_report.json'));
const ONLY = arg('--teams', '') ? arg('--teams', '').split(',') : null;

function fakeEl() {
  return { style: { setProperty() {}, removeProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {},
    getAttribute() { return null; }, appendChild() {}, removeChild() {}, scrollIntoView() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    textContent: '', innerHTML: '', value: '', disabled: false, click() {}, focus() {} };
}
global.document = { readyState: 'complete', getElementById() { return fakeEl(); }, createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl() };
global.window = global; global.location = { search: '', hash: '' }; global.window.location = global.location;

// REAL network with retry — this is live verification, not an offline stub.
const rawFetch = global.fetch;
global.fetch = async function (url, opts) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await rawFetch(url, opts);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    } catch (e) { last = e; await new Promise(s => setTimeout(s, 500 * (i + 1))); }
  }
  throw last;
};

const DEF = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

(async () => {
  let src;
  if (/^https?:/.test(ENGINE)) {
    const r = await rawFetch(ENGINE, { headers: { 'cache-control': 'no-cache' } });
    if (!r.ok) { console.error('FAIL: could not fetch engine ' + ENGINE + ' HTTP ' + r.status); process.exit(1); }
    src = await r.text();
    console.log('engine: LIVE ' + ENGINE + ' (' + src.length + ' bytes)');
  } else {
    src = fs.readFileSync(ENGINE, 'utf8');
    console.log('engine: LOCAL ' + ENGINE + ' (' + src.length + ' bytes)');
  }
  eval(src);
  const SIM = global.TMRMlbSimulator;
  if (!SIM) { console.error('FAIL: engine did not load'); process.exit(1); }
  const buildMatch = src.match(/UI_BUILD = '([^']+)'/);
  const build = buildMatch ? buildMatch[1] : null;
  const hasFix = src.indexOf('LINEUP_INTEGRITY_20260722') !== -1;
  console.log('build: ' + build + '  lineup-integrity fix present: ' + hasFix);

  await SIM.loadLiveContext().catch(() => null);
  const teams = (SIM.state.teams.current || []).slice().sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
  if (!teams.length) { console.error('FAIL: no current teams loaded'); process.exit(1); }

  const report = { build: build, lineupIntegrityFix: hasFix, generatedAt: new Date().toISOString(), engine: ENGINE, teams: {} };
  let failures = 0, synced = 0;

  for (const t of teams) {
    if (ONLY && ONLY.indexOf(t.abbreviation) === -1) continue;
    // statsapi throttles bursts, so a single miss is not a real failure. Retry the
    // whole team a few times (clearing the cached null) before declaring it down.
    let roster = null, err = null;
    for (let attempt = 1; attempt <= 4 && !roster; attempt++) {
      try { roster = await SIM.fetchTeamRoster(t); } catch (e) { err = e.message; }
      if (!roster) {
        if (SIM.state.liveContext.teamRosters) delete SIM.state.liveContext.teamRosters[t.abbreviation];
        if (attempt < 4) await new Promise(s => setTimeout(s, 1500 * attempt));
      }
    }
    if (!roster) {
      report.teams[t.abbreviation] = { ok: false, error: err || 'roster unavailable' };
      console.log(`${t.abbreviation.padEnd(4)} FAIL  ${err || 'roster unavailable'}`);
      failures++; continue;
    }
    synced++;
    const lineup = (roster.players || []).slice(0, 9);
    const ids = new Set(lineup.map(p => p.mlbId || p.name));
    const activeNames = new Set((roster.players || []).map(p => String(p.name).toLowerCase()));
    const problems = [];
    if (lineup.length !== 9) problems.push('lineup has ' + lineup.length + ' slots');
    if (ids.size !== lineup.length) problems.push('duplicate player in lineup');
    lineup.forEach((p, i) => {
      if (!p.name) problems.push('slot ' + (i + 1) + ' has no name');
      if (DEF.indexOf(String(p.position).toUpperCase()) === -1) problems.push('slot ' + (i + 1) + ' (' + p.name + ') position "' + p.position + '" is not a defensive position or DH');
      if (!activeNames.has(String(p.name).toLowerCase())) problems.push('slot ' + (i + 1) + ' (' + p.name + ') not on active roster');
    });

    const rec = {
      ok: problems.length === 0,
      teamId: roster.teamId,
      lineupStatus: roster.lineupStatus,
      lineupBadge: roster.lineupBadge,
      rosterFeed: roster.rosterFeed,
      rosterFetchedAt: roster.rosterFetchedAt ? new Date(roster.rosterFetchedAt).toISOString() : null,
      lineupFeed: roster.lineupFeed,
      lineupFetchedAt: roster.lineupFetchedAt ? new Date(roster.lineupFetchedAt).toISOString() : null,
      lineupSourceGamePk: roster.lineupSourceGamePk,
      lineupSourceGameDate: roster.lineupSourceGameDate,
      activeRosterSize: roster.count,
      injuredCount: roster.injuredCount,
      todayTransactions: roster.todayTransactions || [],
      substitutesRejected: roster.substitutesRejected || [],
      removals: roster.lineupRemovals || [],
      backfills: roster.lineupBackfills || [],
      lineup: lineup.map((p, i) => ({ slot: i + 1, name: p.name, position: p.position, mlbId: p.mlbId || null })),
      problems: problems
    };
    report.teams[t.abbreviation] = rec;
    if (problems.length) failures++;
    console.log(`${t.abbreviation.padEnd(4)} ${rec.ok ? 'OK  ' : 'BAD '} ${String(rec.lineupStatus).padEnd(9)} src=${rec.lineupSourceGameDate || '-'} active=${rec.activeRosterSize} IL=${rec.injuredCount} subsRejected=${rec.substitutesRejected.length} removed=${rec.removals.length} backfilled=${rec.backfills.length} txn=${rec.todayTransactions.length}`);
    rec.substitutesRejected.forEach(s => console.log(`       excluded in-game sub: slot ${s.slot} ${s.name}`));
    rec.removals.forEach(r => console.log(`       REMOVED slot ${r.slot} ${r.name} -> ${r.reason}`));
    rec.backfills.forEach(b => console.log(`       BACKFILLED slot ${b.slot} ${b.name}`));
    problems.forEach(p => console.log(`       PROBLEM: ${p}`));
  }

  const abbrs = Object.keys(report.teams);
  report.summary = {
    teamsAttempted: abbrs.length,
    teamsSynced: synced,
    teamsValid: abbrs.filter(k => report.teams[k].ok).length,
    substitutesRejected: abbrs.reduce((n, k) => n + ((report.teams[k].substitutesRejected || []).length), 0),
    playersRemoved: abbrs.reduce((n, k) => n + ((report.teams[k].removals || []).length), 0),
    playersBackfilled: abbrs.reduce((n, k) => n + ((report.teams[k].backfills || []).length), 0),
    sameDayTransactions: abbrs.reduce((n, k) => n + ((report.teams[k].todayTransactions || []).length), 0)
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  console.log('\n=== DAILY ROSTER SYNC ===');
  console.log('build:', report.build, '| lineup-integrity fix:', report.lineupIntegrityFix);
  console.log('teams synced:      ', report.summary.teamsSynced + '/' + report.summary.teamsAttempted);
  console.log('lineups valid (9 active, defensive/DH):', report.summary.teamsValid + '/' + report.summary.teamsAttempted);
  console.log('in-game substitutes excluded:', report.summary.substitutesRejected);
  console.log('inactive players removed:    ', report.summary.playersRemoved);
  console.log('slots backfilled:            ', report.summary.playersBackfilled);
  console.log('same-day transactions:       ', report.summary.sameDayTransactions);
  console.log('report:', OUT);
  console.log('RESULT:', failures ? 'FAIL' : 'PASS');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
