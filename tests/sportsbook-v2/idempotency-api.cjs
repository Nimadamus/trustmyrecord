#!/usr/bin/env node
/* PICK_IDEMPOTENCY_20260903 backend contract test (REAL API, records picks on the
 * test member; run only when the rows will be cleaned up afterwards).
 *   node tests/sportsbook-v2/idempotency-api.cjs --token <jwt file>
 * Proves: same key + same payload -> original pick (duplicate); same key +
 * different payload -> 409; new key + same wager -> new pick; and a delayed
 * replay after the 2-minute window still resolves to the original pick.
 */
const fs = require('fs');
const args = {}; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1]; i++; } }
// CI: these suites need a member session. Without TMR_TEST_JWT_FILE (or --token)
// they SKIP rather than fail, so the sportsbook regression job stays meaningful
// on forks and in environments without the secret.
const TOKEN_PATH = (args.token && args.token.trim()) || process.env.TMR_TEST_JWT_FILE || '';
if (!TOKEN_PATH || !fs.existsSync(TOKEN_PATH)) {
  console.log('SKIP: no member JWT (pass --token <file> or set TMR_TEST_JWT_FILE).');
  process.exit(0);
}
const TOKEN = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
const API = 'https://trustmyrecord-api.onrender.com/api';
const DELAY_MIN = parseFloat(args.delayMinutes || '2.5');
let failures = 0; const created = [];
function check(name, ok, d) { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' -> ' + JSON.stringify(d).slice(0, 300)}`); }
async function post(payload, key) {
  const r = await fetch(API + '/picks', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(payload) });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, json: j };
}
(async () => {
  const board = await (await fetch(API + '/games/board/baseball_mlb')).json();
  const games = (board.games || []).filter((g) => g.bookmakers && g.bookmakers[0] && Date.parse(g.commence_time) > Date.now() + 3 * 3600e3).sort((a, b) => Date.parse(b.commence_time) - Date.parse(a.commence_time));
  const g = games[0]; if (!g) throw new Error('no future MLB game with odds');
  const h2h = g.bookmakers[0].markets.find((m) => m.key === 'h2h');
  const out = h2h.outcomes.find((o) => o.name === g.home_team) || h2h.outcomes[0];
  const base = { game_id: g.id, external_game_id: g.id, sport_key: g.sport_key, market_type: 'h2h', bet_type: 'h2h', selection: out.name, selection_label: out.name + ' ML', line_snapshot: null, odds_snapshot: out.price, units: 0.5, stake_mode: 'risk', units_mode: 'risk', risk_units: 0.5, to_win_units: out.price > 0 ? +(0.5 * out.price / 100).toFixed(2) : +(0.5 * 100 / Math.abs(out.price)).toFixed(2), book_title: g.bookmakers[0].title, book_key: g.bookmakers[0].key, market_key: 'h2h', market_label: 'Full Game', source_type: 'sportsbook', game_snapshot: g, reasoning: '', submission_item_key: g.id };
  console.log(`target: ${g.away_team} @ ${g.home_team} (${g.id}) ${out.name} ${out.price} 0.5u`);
  const K1 = 'idem-test-' + Date.now() + ':a';
  const r1 = await post({ ...base, submission_batch_id: K1 });
  const id1 = r1.json && r1.json.pick && r1.json.pick.id;
  check(`1. new key K1 -> created (${r1.status}, id ${id1})`, r1.status === 201 && id1 > 0 && !r1.json.duplicate, r1.json);
  if (id1) created.push(id1);
  const r2 = await post({ ...base, submission_batch_id: K1 });
  check(`2. same key K1 + same payload -> replay to original (${r2.status}, duplicate=${r2.json && r2.json.duplicate}, id ${r2.json && r2.json.pick && r2.json.pick.id})`, r2.status === 200 && r2.json.duplicate === true && r2.json.pick.id === id1, r2.json);
  const r3 = await post({ ...base, units: 1, risk_units: 1, to_win_units: base.to_win_units * 2, submission_batch_id: K1 });
  check(`3. same key K1 + different payload (1u) -> rejected 409 (${r3.status})`, r3.status === 409, r3.json);
  const K2 = 'idem-test-' + Date.now() + ':b';
  const r4 = await post({ ...base, submission_batch_id: K2 });
  const id4 = r4.json && r4.json.pick && r4.json.pick.id;
  // NOTE: within 2 minutes the legacy signature guard still coalesces an identical wager.
  check(`4. new key K2 + identical wager inside 2 min -> legacy guard replays to original (${r4.status}, dup=${r4.json && r4.json.duplicate}, id ${id4})`, r4.status === 200 && r4.json.duplicate === true && id4 === id1, r4.json);
  console.log(`waiting ${DELAY_MIN} min for the legacy window to pass...`);
  await new Promise((r) => setTimeout(r, DELAY_MIN * 60e3));
  const r5 = await post({ ...base, submission_batch_id: K1 });
  check(`5. delayed replay, same key K1 after ${DELAY_MIN} min -> still the original pick (${r5.status}, dup=${r5.json && r5.json.duplicate}, id ${r5.json && r5.json.pick && r5.json.pick.id})`, r5.status === 200 && r5.json.duplicate === true && r5.json.pick.id === id1, r5.json);
  const K3 = 'idem-test-' + Date.now() + ':c';
  const r6 = await post({ ...base, submission_batch_id: K3 });
  const id6 = r6.json && r6.json.pick && r6.json.pick.id;
  check(`6. new key K3 + identical wager after ${DELAY_MIN} min -> a legitimate second pick (${r6.status}, id ${id6})`, r6.status === 201 && id6 > 0 && id6 !== id1 && !r6.json.duplicate, r6.json);
  if (id6) created.push(id6);
  const r7 = await post({ ...base, submission_batch_id: K3 });
  check(`7. replay K3 -> original of the second pick (${r7.status}, id ${r7.json && r7.json.pick && r7.json.pick.id})`, r7.status === 200 && r7.json.duplicate === true && r7.json.pick.id === id6, r7.json);
  console.log(`== idempotency-api: ${failures} failures; created pick ids: ${created.join(', ')}`);
  fs.writeFileSync(args.report || 'idempotency-api.json', JSON.stringify({ created, failures, target: g.id }, null, 2));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
