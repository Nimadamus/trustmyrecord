'use strict';
/**
 * STARTER_PITCH_LIMIT_BY_PITCHER_20261101: a starter's leash follows his own
 * pitches per appearance. Real 2025 regular starters at 94+ pitches an outing
 * reached 100 pitches in 35.5% of starts, those under 80 in 3.3%; the fixed
 * 99-pitch limit gave everyone 8-12%. Fails on c809d3e2 (no spPitchLimit).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'static', 'js', 'mlb-simulator.js'), 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'mlb-sim-ws2026-tb-mil-inputs.json'), 'utf8'));
function el() {
  return { style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, setAttribute() {}, getAttribute() { return null; }, appendChild() {}, removeChild() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, textContent: '', innerHTML: '', value: '', disabled: false };
}
let testWindow = null;
function load() {
  const els = {};
  const context = {
    window: { URL: { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} }, location: { search: '', href: '', pathname: '/mlb-simulator/' }, addEventListener() {} },
    document: { readyState: 'complete', getElementById(id) { return els[id] || (els[id] = el()); }, addEventListener() {}, createElement: el, querySelector() { return null; }, querySelectorAll() { return []; }, body: el() },
    console: { log() {}, warn() {}, error() {}, info() {} },
    Math, Number, Date, Promise, JSON, setTimeout, clearTimeout,
    Blob: class Blob {}, navigator: {},
    fetch: () => Promise.reject(new Error('offline')),
    CONFIG: { api: { baseUrl: 'http://offline' } },
  };
  context.window.document = context.document;
  // Exactly what mlb-simulator/index.html ships: these three globals.
  context.window.TMR_MLB_WORKLOAD_V2 = true;
  context.window.TMR_MLB_STARTER_RESIDUAL = 0.010;
  const bbPath = path.join(root, 'static', 'data', 'mlb-battedball-2024.40b9b03b1878.json');
  if (fs.existsSync(bbPath)) context.window.TMR_MLB_BB_TABLE = JSON.parse(fs.readFileSync(bbPath, 'utf8'));
  vm.runInNewContext(script, context);
  testWindow = context.window;
  const sim = context.window.TMRMlbSimulator;
  const lc = sim.state.liveContext;
  Object.assign(lc.teamRosters, fixture.teamRosters);
  lc.playerStats = Object.assign(lc.playerStats || {}, fixture.playerStats);
  lc.playerProfiles = Object.assign(lc.playerProfiles || {}, fixture.playerProfiles);
  lc.playerSplits = Object.assign(lc.playerSplits || {}, fixture.playerSplits);
  return sim;
}

const sim = load();
const TB = sim.localTeams.current.find((t) => t.abbreviation === 'TB');
const MIL = sim.localTeams.current.find((t) => t.abbreviation === 'MIL');
const ctx = sim.state.liveContext;
const E = sim._engine;
function limits(tag, homeStat) {
  if (homeStat) ctx.playerStats['694819:pitching'] = Object.assign({}, fixture.playerStats['694819:pitching'], homeStat);
  const r = sim.simulate(TB, MIL, ctx, 'lim|' + tag, false, 'clear', { awayPitcher: fixture.awayPitcher, homePitcher: fixture.homePitcher, wpSamples: 1 });
  return { home: r.eventInputs.homeSide, away: r.eventInputs.awaySide };
}
// Misiorowski as captured: 2,647 pitches in 30 starts (88.2) -> the league 99.
let s = limits('base');
assert.strictEqual(s.home.spPitchLimit, 99, 'home limit ' + s.home.spPitchLimit);
// Nick Martinez: 2,524 in 31 (81.4) -> floor 97.
assert.strictEqual(s.away.spPitchLimit, 97, 'away limit ' + s.away.spPitchLimit);
// A 97-pitch-an-outing workhorse -> 106 cap; the engine reads it.
s = limits('ace', { numberOfPitches: 30 * 97 });
assert.strictEqual(s.home.spPitchLimit, 106, 'ace limit ' + s.home.spPitchLimit);
assert.strictEqual(E.starterPitchLimit(s.home), 106, 'starterPitchLimit ignores the per-pitcher limit');
// A swingman (fewer than half his games started) keeps the league limit.
s = limits('swing', { gamesPlayed: 40, gamesPitched: 40, gamesStarted: 6, numberOfPitches: 40 * 40 });
assert.strictEqual(s.home.spPitchLimit, null, 'swingman limit ' + s.home.spPitchLimit);
assert.strictEqual(E.starterPitchLimit(s.home), 99);
console.log('mlb-starter-pitch-limit-test: ok');
