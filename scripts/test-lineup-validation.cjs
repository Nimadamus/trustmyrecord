#!/usr/bin/env node
/*
 * Unit test for LINEUP_INTEGRITY_20260722 hierarchy steps 3/4/5.
 *
 * Real MLB data on any given day usually has zero stale lineup slots, so the
 * removal + backfill path would otherwise ship unexercised. This drives
 * collectMlbTeamRoster directly with a REAL active-roster payload and a
 * DOCTORED "recent" lineup containing players who have been optioned/traded/
 * injured, and asserts they are removed, backfilled from the active roster,
 * and that the result is still nine distinct eligible players.
 */
'use strict';
const fs = require('fs');
const path = require('path');

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
const rawFetch = global.fetch;
global.fetch = function (u, o) { return rawFetch(u, o); };

const ENGINE = process.argv[2] || path.join(__dirname, '..', 'static', 'js', 'mlb-simulator.js');
eval(fs.readFileSync(ENGINE, 'utf8'));
const SIM = global.TMRMlbSimulator;

let failures = 0;
function check(label, cond, detail) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  -> ' + detail : ''));
  if (!cond) failures++;
}

(async () => {
  await SIM.loadLiveContext().catch(() => null);
  const team = (SIM.state.teams.current || []).filter(t => t.abbreviation === 'SF')[0];
  if (!team) { console.error('no SF team'); process.exit(1); }

  const rosterJson = await (await rawFetch('https://statsapi.mlb.com/api/v1/teams/137/roster?rosterType=active')).json();
  const hitters = rosterJson.roster
    .filter(e => (e.position.abbreviation || '') !== 'P')
    .map(e => ({ name: e.person.fullName, id: e.person.id, pos: e.position.abbreviation }));

  // Seed a fake IL entry so the injured-player branch is covered too.
  SIM.state.liveContext.teamInjured = SIM.state.liveContext.teamInjured || {};
  SIM.state.liveContext.teamInjured.SF = [{ name: hitters[2].name, position: hitters[2].pos, status: 'Injured 10-Day' }];

  console.log('\nTEST 1 - stale players in a carried-forward "recent" lineup are removed and backfilled');
  const doctored = {
    lineupStatus: 'recent',
    confirmed: false,
    sourceGamePk: 999999,
    sourceGameDate: '2026-07-21',
    fetchedAt: Date.now(),
    substitutesRejected: [],
    players: [
      // slot 1-6: genuine active players
      ...hitters.slice(0, 6).map((h, i) => ({ name: h.name, position: h.pos, mlbId: h.id, battingOrder: (i + 1) * 100 })),
      // slot 7: optioned to Triple-A (not on the active roster at all)
      { name: 'Optioned Minorleaguer', position: 'CF', mlbId: 99000001, battingOrder: 700 },
      // slot 8: traded away last night
      { name: 'Traded Away Guy', position: '2B', mlbId: 99000002, battingOrder: 800 },
      // slot 9: a pinch runner whose "position" is not a defensive spot
      { name: hitters[7].name, position: 'PR', mlbId: hitters[7].id, battingOrder: 900 }
    ]
  };
  // slot 3 is the player we just put on the IL
  const ilName = SIM.state.liveContext.teamInjured.SF[0].name;

  const built = SIM.collectMlbTeamRoster(rosterJson, team, doctored);
  check('roster built', !!built);
  const lineup = built.players.slice(0, 9);
  const names = lineup.map(p => p.name);
  check('lineup has 9 slots', lineup.length === 9, lineup.length + ' slots');
  check('no duplicate players', new Set(names).size === 9);
  check('optioned player removed', names.indexOf('Optioned Minorleaguer') === -1);
  check('traded player removed', names.indexOf('Traded Away Guy') === -1);
  check('IL player removed', names.indexOf(ilName) === -1, 'IL = ' + ilName);
  check('3 removals reported', built.lineupRemovals.length === 3, JSON.stringify(built.lineupRemovals.map(r => r.name + ':' + r.reason)));
  check('3 slots backfilled', built.lineupBackfills.length === 3, JSON.stringify(built.lineupBackfills));
  const DEF = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  check('every slot has a defensive position or DH', lineup.every(p => DEF.indexOf(String(p.position).toUpperCase()) !== -1),
    lineup.map(p => p.name + '(' + p.position + ')').join(', '));
  check('PR role normalised off the lineup', lineup.every(p => String(p.position).toUpperCase() !== 'PR'));
  const activeNames = new Set(rosterJson.roster.map(e => e.person.fullName));
  check('every slot is on the active roster', lineup.every(p => activeNames.has(p.name)));
  check('freshness metadata present', !!built.rosterFeed && !!built.lineupFeed && !!built.rosterFetchedAt,
    built.lineupFeed);
  console.log('   final lineup: ' + lineup.map((p, i) => (i + 1) + '.' + p.name + '(' + p.position + ')').join(' '));

  console.log('\nTEST 2 - an OFFICIAL lineup posted for today is trusted as-is (not second-guessed)');
  const official = Object.assign({}, doctored, { lineupStatus: 'posted', players: doctored.players.slice() });
  const built2 = SIM.collectMlbTeamRoster(rosterJson, team, official);
  check('posted lineup keeps all 9 named starters', built2.players.slice(0, 9).length === 9);
  check('posted lineup performs no removals', built2.lineupRemovals.length === 0, JSON.stringify(built2.lineupRemovals));
  check('posted lineup status preserved', built2.lineupStatus === 'posted', built2.lineupStatus);

  console.log('\nTEST 3 - too few valid players falls back honestly to the active roster');
  const gutted = Object.assign({}, doctored, {
    players: doctored.players.map((p, i) => i < 8 ? { name: 'Ghost ' + i, position: 'CF', mlbId: 98000000 + i, battingOrder: (i + 1) * 100 } : p)
  });
  // Only 1 real player + 8 non-roster ghosts; the active roster has enough bench
  // hitters to backfill, so this asserts backfill fills rather than yielding junk.
  const built3 = SIM.collectMlbTeamRoster(rosterJson, team, gutted);
  const l3 = built3.players.slice(0, 9);
  check('no ghost survived into the lineup', l3.every(p => String(p.name).indexOf('Ghost ') !== 0), l3.map(p => p.name).join(', '));
  check('result is either a valid 9 or an honest roster fallback',
    (built3.lineupStatus === 'recent' && l3.length === 9 && l3.every(p => activeNames.has(p.name))) || built3.lineupStatus === 'roster',
    built3.lineupStatus);

  console.log('\nTEST 4 - true-starter extraction ignores end-of-game substitutes');
  const boxTeam = {
    battingOrder: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    players: {
      ID1: { person: { id: 1, fullName: 'Starter One' }, battingOrder: '100', position: { abbreviation: 'LF' } },
      ID10: { person: { id: 10, fullName: 'Pinch Runner' }, battingOrder: '101', position: { abbreviation: 'PR' } }
    }
  };
  const slots = SIM.startersBySlotFromBoxscore(boxTeam);
  check('slot 1 resolves to the starter, not the pinch runner', slots[1] === 1, 'got ' + slots[1]);
  check('substitute (battingOrder 101) is not a slot starter', Object.values(slots).indexOf(10) === -1);

  console.log('\nRESULT: ' + (failures ? 'FAIL (' + failures + ')' : 'PASS'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
