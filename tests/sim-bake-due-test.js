'use strict';
/* SIM_BAKE_FOURTH_RUN_20261023: the League Simulator Bake gate bakes once per slot,
   four slots a day, even when GitHub starts runs late or drops them. Offline. */
const assert = require('assert');
const { decide, latestSlot } = require('../scripts/sim-bake-due.js');
const H = 3600000, T = (s) => +new Date(s);

// Slot boundaries, including the wrap to the previous day before 01:20 UTC.
assert.strictEqual(new Date(latestSlot(T('2026-10-24T00:50:00Z'))).toISOString(), '2026-10-23T21:20:00.000Z');
assert.strictEqual(new Date(latestSlot(T('2026-10-24T09:20:00Z'))).toISOString(), '2026-10-24T09:20:00.000Z');
assert.strictEqual(new Date(latestSlot(T('2026-10-24T13:19:00Z'))).toISOString(), '2026-10-24T09:20:00.000Z');

// Idempotence: one bake per slot, the next trigger in the same slot skips.
assert.strictEqual(decide({ now: '2026-10-24T09:47:00Z', lastBake: '2026-10-24T06:03:00Z', event: 'schedule' }).due, true);
assert.strictEqual(decide({ now: '2026-10-24T10:47:00Z', lastBake: '2026-10-24T09:47:30Z', event: 'schedule' }).due, false);
// A manual run always bakes.
assert.strictEqual(decide({ now: '2026-10-24T10:47:00Z', lastBake: '2026-10-24T09:47:30Z', event: 'workflow_dispatch' }).due, true);
// Freshness: stale after 14 hours or with no bake on record.
assert.strictEqual(decide({ now: '2026-10-24T10:00:00Z', lastBake: '2026-10-23T19:00:00Z', event: 'schedule' }).stale, true);
assert.strictEqual(decide({ now: '2026-10-24T10:00:00Z', lastBake: '2026-10-24T01:30:00Z', event: 'schedule' }).stale, false);
assert.strictEqual(decide({ now: '2026-10-24T10:00:00Z', lastBake: null, event: 'schedule' }).stale, true);

// Replay 30 days of hourly triggers at :47 where GitHub starts each one 0 to 6 hours
// late and drops a share of them. Every slot must get exactly one bake.
function replay(dropRate, seed) {
  let x = seed; const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const start = T('2026-10-24T00:00:00Z'), end = start + 30 * 24 * H;
  const starts = [];
  for (let t = start + 47 * 60000; t < end; t += H) if (rnd() >= dropRate) starts.push(t + rnd() * 6 * H);
  starts.sort((a, b) => a - b);
  let last = start - 2 * H; const bakes = [];
  for (const now of starts) {   // concurrency group: runs are serial
    if (decide({ now: new Date(now), lastBake: new Date(last), event: 'schedule' }).due) { last = now + 4 * 60000; bakes.push(now); }
  }
  const slots = new Map();
  for (const b of bakes) { const s = latestSlot(b); slots.set(s, (slots.get(s) || 0) + 1); }
  const dup = [...slots.values()].filter((n) => n > 1).length;
  let gap = 0; for (let i = 1; i < bakes.length; i++) gap = Math.max(gap, bakes[i] - bakes[i - 1]);
  return { bakes: bakes.length, perDay: bakes.length / 30, dup, maxGapH: gap / H, slotsCovered: slots.size };
}
// Oct 2 to 23 history: 68 starts out of 88 scheduled (23% dropped), starts 3 to 6 h late.
for (const [drop, seed, minSlots] of [[0, 1, 119], [0.25, 3, 118], [0.25, 5, 118], [0.5, 7, 105], [0.8, 11, 0]]) {
  const r = replay(drop, seed);
  console.log(`drop ${drop * 100}%: ${r.bakes} bakes, ${r.perDay.toFixed(2)}/day, ${r.slotsCovered} slots covered, duplicates ${r.dup}, max gap ${r.maxGapH.toFixed(1)} h`);
  assert.strictEqual(r.dup, 0, 'two bakes in one slot');
  assert.ok(r.slotsCovered >= minSlots, 'missed slots at drop ' + drop);   // 120 slots in 30 days
}
// NFL_FINAL_REBAKE_20261030: a game-final dispatch always bakes, even right after a slot bake.
assert.strictEqual(decide({ now: '2026-10-30T03:40:00Z', lastBake: '2026-10-30T03:30:00Z', event: 'repository_dispatch' }).due, true);
assert.strictEqual(decide({ now: '2026-10-30T03:40:00Z', lastBake: '2026-10-30T03:30:00Z', event: 'schedule' }).due, false);
const wf = require('fs').readFileSync(require('path').join(__dirname, '..', '.github', 'workflows', 'league-sim-bake.yml'), 'utf8');
assert.ok(/repository_dispatch:\s*\n\s*types: \[nfl-game-final\]/.test(wf), 'bake listens for nfl-game-final');
assert.ok(/-s \.nfl-freshness-flag/.test(wf), 'freshness flags raise the bake alert');
// NFL_BAKE_FRESHNESS_GATE_20261030
const F = require('../scripts/nfl-bake-freshness.js');
assert.deepStrictEqual(F.verdict({ freshness_status: 'ok' }), { bake: true, flag: null });
assert.strictEqual(F.verdict({ freshness_status: 'stale_projection' }).bake, true);
assert.ok(F.verdict({ freshness_status: 'stale_projection' }).flag);
assert.strictEqual(F.verdict({ freshness_status: 'stale_sources', source_data: { stale_feeds: ['nfl_scores'] } }).bake, false);
assert.strictEqual(F.verdict({}).bake, false);
for (const b of ['build_nfl_season_page.js', 'build_nfl_team_pages.js', 'build_nfl_playoff_page.js'])
  assert.ok(/nfl-bake-freshness'\)\.gate\(d,/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'scripts', b), 'utf8')), b + ' must gate on freshness');
console.log('SIM_BAKE_DUE PASSED');
