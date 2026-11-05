#!/usr/bin/env node
// LINEUP_USAGE_20261105 + STARTER_POOL_ALL_ARMS_20261105 + ROSTER_STATS_BATCH_20261105
// + LIVE_CONTEXT_KEEP_ALL_20261105. No network: a mock statsapi. Each block fails on the
// engine before this change (four shortstops, no catcher; aces past the 14th arm missing;
// about 51 calls a club; context rebuild dropping teamSeason and priorStats).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(process.env.MLB_ENGINE || path.join(root, 'static', 'js', 'mlb-simulator.js'), 'utf8');
const NYY = 147;

const hitters = [
  [1, 'Spencer Jones', 'CF'], [2, 'Anthony Volpe', 'SS'], [3, 'George Lombard Jr.', 'SS'], [4, 'Ben Rice', 'DH'],
  [5, 'Jose Caballero', 'SS'], [6, 'Cody Bellinger', 'LF'], [7, 'Marco Luciano', 'SS'], [8, 'Aaron Judge', 'RF'],
  [9, 'Jasson Dominguez', 'RF'], [10, 'Austin Wells', 'C'], [11, 'Ryan McMahon', '3B'], [12, 'Luis Garcia Jr.', '1B'],
];
const arms = [];
for (let i = 0; i < 22; i += 1) arms.push([100 + i, 'Aaa Arm' + String.fromCharCode(65 + i), 'P']);
arms[20] = [120, 'Zed Ace', 'P'];      // sorts past the old 14 cap, like Yamamoto at index 20
const roster = { roster: hitters.concat(arms).map(([id, n, p]) => ({ person: { id, fullName: n }, position: { abbreviation: p }, status: { code: 'A' }, parentTeamId: NYY })) };

const usage = { season: 2026, players: {
  8: { n: 'Aaron Judge', s: 150, o: 2.1, p: { RF: 120, DH: 30 } },
  4: { n: 'Ben Rice', s: 148, o: 2.17, p: { '1B': 53, DH: 95 } },
  6: { n: 'Cody Bellinger', s: 150, o: 4, p: { LF: 140, RF: 10 } },
  1: { n: 'Spencer Jones', s: 75, o: 5.76, p: { RF: 29, CF: 34 } },
  10: { n: 'Austin Wells', s: 110, o: 7.5, p: { C: 110 } },
  11: { n: 'Ryan McMahon', s: 140, o: 6.5, p: { '3B': 140 } },
  5: { n: 'Jose Caballero', s: 118, o: 7.88, p: { SS: 66, '2B': 13 } },
  2: { n: 'Anthony Volpe', s: 61, o: 7.1, p: { SS: 49, '2B': 11 } },
  12: { n: 'Luis Garcia Jr.', s: 120, o: 4.5, p: { '1B': 100 } },
  3: { n: 'George Lombard Jr.', s: 42, o: 6.19, p: { SS: 42 } },
} };

let calls = [];
function line(id, group) {
  return group === 'pitching'
    ? { era: id === 120 ? '2.50' : '4.50', gamesStarted: id === 120 ? 28 : (id < 106 ? 6 : 0), gamesPlayed: 30, inningsPitched: '100.0', wins: 5, losses: 5, whip: '1.20', strikeOuts: 90, baseOnBalls: 30, homeRuns: 10, battersFaced: 400 }
    : { plateAppearances: 500, atBats: 450, hits: 120, ops: '.750' };
}
function respond(url, failBatch) {
  calls.push(url);
  if (url.includes('/static/data/mlb-lineup-usage')) return usage;
  if (url.includes('/roster?rosterType=active')) return roster;
  if (url.includes('/roster?rosterType=fullRoster')) return { roster: [] };
  if (url.includes('/people?personIds=') && url.includes('sitCodes')) {
    if (failBatch) throw new Error('batch down');
    const ids = decodeURIComponent(url.match(/personIds=([^&]+)/)[1]).split(',').map(Number);
    return { people: ids.map((id) => ({ id, fullName: 'P' + id, pitchHand: { code: 'R' }, batSide: { code: 'L' }, stats: [
      { type: { displayName: 'season' }, group: { displayName: 'hitting' }, splits: [{ stat: line(id, 'hitting') }] },
      { type: { displayName: 'season' }, group: { displayName: 'pitching' }, splits: id >= 100 ? [{ stat: line(id, 'pitching') }] : [] },
      { type: { displayName: 'statSplits' }, group: { displayName: 'hitting' }, splits: [{ split: { code: 'vl' }, stat: { ops: '.700' } }, { split: { code: 'vr' }, stat: { ops: '.760' } }] },
    ] })) };
  }
  if (url.includes('/people?personIds=')) return { people: [] };
  let m = url.match(/people\/(\d+)\/stats\?stats=season&group=(\w+)/);
  if (m) { const id = Number(m[1]); return { stats: [{ splits: (m[2] === 'pitching' && id < 100) ? [] : [{ stat: line(id, m[2]) }] }] }; }
  if (url.includes('stats=statSplits')) return { stats: [{ splits: [{ split: { code: 'vl' }, stat: { ops: '.700' } }, { split: { code: 'vr' }, stat: { ops: '.760' } }] }] };
  m = url.match(/people\/(\d+)\?/);
  if (m) return { people: [{ id: Number(m[1]), fullName: 'P' + m[1], pitchHand: { code: 'R' }, batSide: { code: 'L' } }] };
  return { dates: [], transactions: [] };
}
function load(opts) {
  const o = opts || {};
  const el = () => ({ style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} }, addEventListener() {}, setAttribute() {}, getAttribute() { return null; }, appendChild() {}, removeChild() {}, querySelector() { return null; }, querySelectorAll() { return []; } });
  const f = (u) => {
    if (o.noUsage && String(u).includes('mlb-lineup-usage')) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    try { const body = respond(String(u), o.failBatch); return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) }); } catch (e) { return Promise.reject(e); }
  };
  const ctx = { window: { location: { search: '' }, URL: {}, TMR_MLB_STATS_SEASON: '2026' }, document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, querySelector() { return el(); }, querySelectorAll() { return []; }, createElement() { return el(); } },
    console: { info() {}, log() {}, warn() {}, error() {} }, Math, Number, Date, Promise, JSON, String, Array, Object, isNaN, parseFloat, parseInt, setTimeout, clearTimeout, AbortController, fetch: f, CONFIG: { api: { baseUrl: '' } } };
  ctx.window.document = ctx.document; ctx.window.fetch = f;
  vm.runInNewContext(src, ctx);
  return ctx.window.TMRMlbSimulator;
}
const team = (sim) => sim.localTeams.current.filter((t) => t.abbreviation === 'NYY')[0];
const pos9 = (r) => r.players.slice(0, 9).map((p) => String(p.position).toUpperCase());
const NINE = ['1B', '2B', '3B', 'C', 'CF', 'DH', 'LF', 'RF', 'SS'];

(async () => {
  // 1. usual order: a real nine, a catcher, Judge near the top, honest label.
  const sim = load(); calls = [];
  const r = await sim.fetchTeamRoster(team(sim));
  assert.strictEqual(pos9(r).slice().sort().join(), NINE.join());
  assert.strictEqual(r.lineupStatus, 'usual');
  assert.ok(r.players.slice(0, 2).some((p) => p.name === 'Aaron Judge'), 'Judge bats near the top');
  assert.ok(/Usual 2026/.test(r.lineupBadge));
  assert.strictEqual(r.lineupConfirmed, false);

  // 2. every arm is loaded, so the 28 start ace past index 14 leads the dropdown.
  const opts = sim.pitcherOptionsFor(team(sim), 'home', null).map((o) => o.name);
  assert.strictEqual(opts[0], 'Zed Ace', 'ace first: ' + opts.slice(0, 3));

  // 3. batching: no per player stat call when the batch answers.
  const perPlayer = calls.filter((u) => /people\/\d+/.test(u));
  assert.strictEqual(perPlayer.length, 0, 'per player calls: ' + perPlayer.length);
  assert.ok(calls.length <= 12, 'calls ' + calls.length);

  // 4. batch and per player paths store identical lines.
  const sim2 = load({ failBatch: true }); calls = [];
  await sim2.fetchTeamRoster(team(sim2));
  assert.ok(calls.filter((u) => /people\/\d+/.test(u)).length > 30, 'fallback uses per player calls');
  const sortKeys = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  assert.strictEqual(sortKeys(sim.state.liveContext.playerStats), sortKeys(sim2.state.liveContext.playerStats));
  assert.strictEqual(sortKeys(sim.state.liveContext.playerSplits), sortKeys(sim2.state.liveContext.playerSplits));

  // 5. no usage table: still one man per position with a catcher, labelled as no set order.
  const sim3 = load({ noUsage: true }); calls = [];
  const r3 = await sim3.fetchTeamRoster(team(sim3));
  assert.strictEqual(r3.lineupStatus, 'roster');
  assert.strictEqual(pos9(r3).slice().sort().join(), NINE.join());

  // 6. a context rebuild keeps what it does not list (old code dropped these).
  assert.ok(/state\.liveContext = Object\.assign\(\{\}, state\.liveContext, \{\s*status: schedule\.length/.test(src), 'context rebuild spreads the old object');

  console.log('mlb-offseason-lineup-test ok');
})().catch((e) => { console.error(e); process.exit(1); });
