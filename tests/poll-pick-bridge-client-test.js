/**
 * static/js/poll-pick-bridge.js — behaviour tests.
 *
 * Runs the real file in jsdom with a stubbed window.api and asserts on the DOM
 * and the localStorage record it produces. The record is the contract with
 * static/js/sim-pick-prefill.js, so it is checked field by field: if this file
 * ever writes a shape that script cannot read, the conversion silently dies.
 *
 *   node tests/poll-pick-bridge-client-test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'poll-pick-bridge.js'), 'utf8');
const PREFILL = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'sim-pick-prefill.js'), 'utf8');

const ELIGIBLE = {
  eligible: true,
  poll_id: 850,
  option_id: 1779,
  intent: {
    sport: 'MLB',
    source: 'poll',
    market: 'ml',
    pick_team: 'Chicago Cubs',
    home_team_name: 'Seattle Mariners',
    away_team_name: 'Chicago Cubs',
  },
  game: { home_team: 'Seattle Mariners', away_team: 'Chicago Cubs' },
};

async function run(opts) {
  const o = opts || {};
  const dom = new JSDOM(
    '<!doctype html><html><body><main><div id="pollDetail"><p>results</p></div></main></body></html>',
    { url: 'https://trustmyrecord.com/polls/', runScripts: 'outside-only' }
  );
  const win = dom.window;
  const calls = [];
  win.api = {
    ready: Promise.resolve(),
    request(p) {
      calls.push(p);
      if (p.indexOf('/pick-bridge') !== -1) {
        if (o.bridge === 'reject') return Promise.reject(new Error('boom'));
        return Promise.resolve(o.bridge);
      }
      if (p.indexOf('/my-progress') !== -1) {
        if (o.progress === 'reject') return Promise.reject(new Error('nope'));
        return Promise.resolve(o.progress || { picks: { total: 5 } });
      }
      return Promise.resolve({});
    },
  };
  const events = [];
  win.gtag = (type, name, params) => events.push({ name, params });
  let navigatedTo = null;

  win.eval(SCRIPT);
  win.TMRPollPickBridge._setNavigate((u) => { navigatedTo = u; });
  await win.TMRPollPickBridge.offer(o.pollId === undefined ? 850 : o.pollId);
  await new Promise((r) => setImmediate(r));

  return {
    win, doc: win.document, calls, events,
    strip: win.document.getElementById('tmr-poll-bridge'),
    nav: () => navigatedTo,
    intent: () => {
      const raw = win.localStorage.getItem('tmr_sim_pick_intent');
      return raw ? JSON.parse(raw) : null;
    },
    text() {
      const el = win.document.getElementById('tmr-poll-bridge');
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    },
  };
}

const tests = [];
const test = (n, f) => tests.push([n, f]);

/* ------------------------------------------------------------- it offers */

test('an eligible poll offers the conversion, naming the team the member picked', async () => {
  const r = await run({ bridge: ELIGIBLE });
  assert.ok(r.strip, 'strip should render');
  assert.strictEqual(r.strip.className, 'tmr-fp-reminder', 'must reuse the existing strip');
  assert.match(r.text(), /Put this prediction on your verified record/);
  assert.match(r.text(), /You picked Chicago Cubs/);
});

test('it renders inside the poll detail, not at the top of the page', async () => {
  const r = await run({ bridge: ELIGIBLE });
  assert.strictEqual(r.strip.parentNode.id, 'pollDetail');
});

test('a zero-pick member is offered a record, not just a pick', async () => {
  const r = await run({ bridge: ELIGIBLE, progress: { picks: { total: 0 } } });
  assert.strictEqual(r.doc.getElementById('tmr-pb-cta').textContent, 'Start My Record');
  const shown = r.events.find((e) => e.name === 'poll_pick_bridge_shown');
  assert.strictEqual(shown.params.zero_pick_member, 'true');
});

test('an existing pick maker gets the plain wording', async () => {
  const r = await run({ bridge: ELIGIBLE, progress: { picks: { total: 12 } } });
  assert.strictEqual(r.doc.getElementById('tmr-pb-cta').textContent, 'Lock This Pick');
  const shown = r.events.find((e) => e.name === 'poll_pick_bridge_shown');
  assert.strictEqual(shown.params.zero_pick_member, 'false');
});

/* ------------------------------------------------- it refuses everything else */

const REFUSALS = [
  ['an opinion poll', { eligible: false, reason: 'metric_not_convertible' }],
  ['a closed poll', { eligible: false, reason: 'poll_closed' }],
  ['a started game', { eligible: false, reason: 'game_already_started' }],
  ['a member who has not voted', { eligible: false, reason: 'member_has_not_voted' }],
  ['an unmappable option', { eligible: false, reason: 'option_does_not_name_a_team' }],
  ['no game on TMR', { eligible: false, reason: 'no_matching_game_on_tmr' }],
  ['a doubleheader', { eligible: false, reason: 'more_than_one_matching_game' }],
];
for (const [label, answer] of REFUSALS) {
  test('renders nothing for ' + label, async () => {
    const r = await run({ bridge: answer });
    assert.strictEqual(r.strip, null);
    assert.strictEqual(r.intent(), null, 'no intent may be written');
  });
}

test('a malformed answer renders nothing rather than guessing', async () => {
  for (const bad of [null, {}, { eligible: true }, { eligible: true, intent: {} }]) {
    const r = await run({ bridge: bad });
    assert.strictEqual(r.strip, null, JSON.stringify(bad));
  }
});

test('a failed request never disturbs the vote that already succeeded', async () => {
  const r = await run({ bridge: 'reject' });
  assert.strictEqual(r.strip, null);
  assert.strictEqual(r.intent(), null);
});

test('a failed progress lookup still offers the conversion', async () => {
  const r = await run({ bridge: ELIGIBLE, progress: 'reject' });
  assert.ok(r.strip, 'an analytics label must not gate the feature');
  const shown = r.events.find((e) => e.name === 'poll_pick_bridge_shown');
  assert.strictEqual(shown.params.zero_pick_member, 'unknown');
});

/* ------------------------------- the handoff contract with sim-pick-prefill */

test('clicking writes exactly the record sim-pick-prefill.js reads', async () => {
  const r = await run({ bridge: ELIGIBLE });
  r.doc.getElementById('tmr-pb-cta').dispatchEvent(new r.win.Event('click'));
  const intent = r.intent();
  assert.ok(intent, 'an intent must be written');
  // Fields sim-pick-prefill.js actually reads.
  assert.strictEqual(intent.pick_team, 'Chicago Cubs');
  assert.strictEqual(intent.home_team_name, 'Seattle Mariners');
  assert.strictEqual(intent.away_team_name, 'Chicago Cubs');
  assert.strictEqual(intent.sport, 'MLB');
  assert.strictEqual(intent.source, 'poll');
  assert.ok(typeof intent.ts === 'number' && intent.ts > 0, 'TTL stamp required');
  assert.strictEqual(r.nav(), '/sportsbook/?simpick=1');
});

test('the side the member voted for cannot reverse in the handoff', async () => {
  // Same matchup, the OTHER option.
  const other = JSON.parse(JSON.stringify(ELIGIBLE));
  other.intent.pick_team = 'Seattle Mariners';
  const r = await run({ bridge: other });
  r.doc.getElementById('tmr-pb-cta').dispatchEvent(new r.win.Event('click'));
  assert.strictEqual(r.intent().pick_team, 'Seattle Mariners');
  assert.match(r.text(), /You picked Seattle Mariners/);
});

test('no game id is carried across: the board resolves its own row', async () => {
  const r = await run({ bridge: ELIGIBLE });
  r.doc.getElementById('tmr-pb-cta').dispatchEvent(new r.win.Event('click'));
  assert.strictEqual(r.intent().board_game_id, undefined);
});

test('the prefill script still reads every field this one writes', () => {
  for (const field of ['pick_team', 'home_team_name', 'away_team_name', 'sport', 'source', 'ts']) {
    assert.ok(PREFILL.indexOf('intent.' + field) !== -1, 'prefill must read intent.' + field);
  }
  assert.ok(PREFILL.indexOf("'tmr_sim_pick_intent'") !== -1, 'same localStorage key');
  assert.ok(/ORIGIN_LABEL/.test(PREFILL), 'prefill banner must name the origin');
  assert.ok(/From your poll vote: /.test(PREFILL), 'poll-sourced copy must exist');
});

test('the prefill script still submits nothing on its own', () => {
  assert.ok(!/method:\s*'POST'/.test(PREFILL), 'prefill must never POST');
  assert.ok(/selectGameBet/.test(PREFILL), 'it preselects through the normal bridge');
});

/* ------------------------------------------- the daily quiz entry point */

test('a quiz offers the first convertible question and stops asking', async () => {
  const answers = { 855: { eligible: false, reason: 'metric_not_convertible' },
                    856: { eligible: false, reason: 'metric_not_convertible' },
                    857: ELIGIBLE,
                    858: ELIGIBLE };
  const asked = [];
  const dom = new JSDOM('<!doctype html><html><body><main><div id="pollDetail"></div></main></body></html>',
    { url: 'https://trustmyrecord.com/polls/', runScripts: 'outside-only' });
  const win = dom.window;
  win.api = { ready: Promise.resolve(), request(p) {
    const m = p.match(/polls\/(\d+)\/pick-bridge/);
    if (m) { asked.push(Number(m[1])); return Promise.resolve(answers[m[1]]); }
    return Promise.resolve({ picks: { total: 3 } });
  } };
  win.gtag = () => {};
  win.eval(SCRIPT);
  win.TMRPollPickBridge._setNavigate(() => {});
  const shown = await win.TMRPollPickBridge.offerFirstEligible([855, 856, 857, 858]);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(shown, true);
  assert.deepStrictEqual(asked, [855, 856, 857], 'must stop at the first eligible, not ask 858');
  assert.strictEqual(win.document.querySelectorAll('#tmr-poll-bridge').length, 1);
});

test('a quiz of nothing but props renders nothing', async () => {
  const dom = new JSDOM('<!doctype html><html><body><main><div id="pollDetail"></div></main></body></html>',
    { url: 'https://trustmyrecord.com/polls/', runScripts: 'outside-only' });
  const win = dom.window;
  win.api = { ready: Promise.resolve(),
    request: () => Promise.resolve({ eligible: false, reason: 'metric_not_convertible' }) };
  win.gtag = () => {};
  win.eval(SCRIPT);
  const shown = await win.TMRPollPickBridge.offerFirstEligible([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.strictEqual(shown, false);
  assert.strictEqual(win.document.getElementById('tmr-poll-bridge'), null);
});

test('an empty answer list asks nothing at all', async () => {
  const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>',
    { url: 'https://trustmyrecord.com/polls/', runScripts: 'outside-only' });
  const win = dom.window;
  let calls = 0;
  win.api = { ready: Promise.resolve(), request: () => { calls += 1; return Promise.resolve({}); } };
  win.gtag = () => {};
  win.eval(SCRIPT);
  assert.strictEqual(await win.TMRPollPickBridge.offerFirstEligible([]), false);
  assert.strictEqual(calls, 0);
});

/* ------------------------------------------------- game_total conversions */

const TOTAL_ELIGIBLE = {
  eligible: true, poll_id: 854, option_id: 1786, poll_type: 'game_total', line: 8.5,
  intent: { sport: 'MLB', source: 'poll', poll_type: 'game_total', market: 'over',
            side: 'Over', line: 8.5, odds: -110,
            home_team_name: 'Miami Marlins', away_team_name: 'Boston Red Sox',
            board_game_id: 'an_baseball_mlb_294210' },
};

test('a totals conversion names the side and the line, not a team', async () => {
  const r = await run({ bridge: TOTAL_ELIGIBLE });
  assert.ok(r.strip);
  assert.match(r.text(), /You picked Over 8\.5/);
});

test('Under stays Under all the way into the handoff', async () => {
  const under = JSON.parse(JSON.stringify(TOTAL_ELIGIBLE));
  under.intent.market = 'under';
  under.intent.side = 'Under';
  under.intent.odds = -105;
  const r = await run({ bridge: under });
  assert.match(r.text(), /You picked Under 8\.5/);
  r.doc.getElementById('tmr-pb-cta').dispatchEvent(new r.win.Event('click'));
  const i = r.intent();
  assert.strictEqual(i.market, 'under');
  assert.strictEqual(i.side, 'Under');
  assert.strictEqual(i.line, 8.5);
  assert.strictEqual(i.pick_team, undefined, 'a total has no team');
});

test('Over stays Over, and the line and board game id survive the handoff', async () => {
  const r = await run({ bridge: TOTAL_ELIGIBLE });
  r.doc.getElementById('tmr-pb-cta').dispatchEvent(new r.win.Event('click'));
  const i = r.intent();
  assert.strictEqual(i.market, 'over');
  assert.strictEqual(i.side, 'Over');
  assert.strictEqual(i.line, 8.5);
  assert.strictEqual(i.odds, -110);
  assert.strictEqual(i.board_game_id, 'an_baseball_mlb_294210');
  assert.strictEqual(i.poll_type, 'game_total');
  assert.strictEqual(r.nav(), '/sportsbook/?simpick=1');
});

test('the client never invents a line the server did not approve', async () => {
  const noLine = JSON.parse(JSON.stringify(TOTAL_ELIGIBLE));
  delete noLine.intent.line;
  const r = await run({ bridge: noLine });
  assert.strictEqual(r.strip, null, 'a totals answer without a line is not renderable');
  assert.strictEqual(r.intent(), null);
});

test('a line-mismatch refusal renders nothing', async () => {
  const r = await run({ bridge: { eligible: false, reason: 'poll_line_differs_from_board_line',
                                  poll_line: 8.5, board_line: 9 } });
  assert.strictEqual(r.strip, null);
  assert.strictEqual(r.intent(), null);
});

test('a stale board refusal renders nothing', async () => {
  const r = await run({ bridge: { eligible: false, reason: 'board_snapshot_stale' } });
  assert.strictEqual(r.strip, null);
});

test('analytics split winner from game_total inside one funnel', async () => {
  const w = await run({ bridge: ELIGIBLE });
  const wShown = w.events.find((e) => e.name === 'poll_pick_bridge_shown');
  assert.strictEqual(wShown.params.poll_type, 'winner');
  assert.strictEqual(wShown.params.market, 'ml');

  const t = await run({ bridge: TOTAL_ELIGIBLE });
  const tShown = t.events.find((e) => e.name === 'poll_pick_bridge_shown');
  assert.strictEqual(tShown.params.poll_type, 'game_total');
  assert.strictEqual(tShown.params.market, 'over');
  t.doc.getElementById('tmr-pb-cta').dispatchEvent(new t.win.Event('click'));
  const clicked = t.events.find((e) => e.name === 'poll_pick_bridge_clicked');
  assert.strictEqual(clicked.params.poll_type, 'game_total');
  assert.strictEqual(clicked.params.line, 8.5);
});

test('the prefill script honours a totals intent and re-checks the line itself', () => {
  assert.ok(/totalsAtLine/.test(PREFILL), 'prefill must read the board total');
  assert.ok(/IS_TOTAL/.test(PREFILL), 'prefill must branch on a totals intent');
  assert.ok(/has moved from/.test(PREFILL), 'a moved line must be reported, not quoted');
  assert.ok(/intent\.side/.test(PREFILL) && /intent\.line/.test(PREFILL));
  assert.ok(!/method:\s*'POST'/.test(PREFILL), 'prefill still never POSTs');
});

test('a repeated click cannot write two different intents', async () => {
  const r = await run({ bridge: TOTAL_ELIGIBLE });
  const cta = r.doc.getElementById('tmr-pb-cta');
  cta.dispatchEvent(new r.win.Event('click'));
  const first = r.win.localStorage.getItem('tmr_sim_pick_intent');
  cta.dispatchEvent(new r.win.Event('click'));
  cta.dispatchEvent(new r.win.Event('click'));
  const after = JSON.parse(r.win.localStorage.getItem('tmr_sim_pick_intent'));
  const before = JSON.parse(first);
  assert.strictEqual(after.market, before.market);
  assert.strictEqual(after.line, before.line);
  assert.strictEqual(after.board_game_id, before.board_game_id);
  // One key, one record: repeated clicks overwrite rather than accumulate, and
  // the prefill clears it after a successful submit.
  assert.strictEqual(Object.keys(r.win.localStorage).filter((k) => k.indexOf('pick_intent') !== -1).length, 1);
});

/* --------------------------------------------------------------- hygiene */

test('declining removes the strip and records why', async () => {
  const r = await run({ bridge: ELIGIBLE });
  r.strip.querySelector('.tmr-fp-reminder__close').dispatchEvent(new r.win.Event('click'));
  assert.strictEqual(r.doc.getElementById('tmr-poll-bridge'), null);
  assert.ok(r.events.find((e) => e.name === 'poll_pick_bridge_declined'));
  assert.strictEqual(r.intent(), null, 'declining must not write an intent');
});

test('offering twice leaves exactly one strip, so a double vote cannot stack', async () => {
  const r = await run({ bridge: ELIGIBLE });
  await r.win.TMRPollPickBridge.offer(850);
  await new Promise((res) => setImmediate(res));
  assert.strictEqual(r.doc.querySelectorAll('#tmr-poll-bridge').length, 1);
});

test('a team name is rendered as text, never as markup', async () => {
  const hostile = JSON.parse(JSON.stringify(ELIGIBLE));
  hostile.intent.pick_team = '<img src=x onerror=alert(1)>';
  const r = await run({ bridge: hostile });
  assert.strictEqual(r.strip.querySelectorAll('img').length, 0);
  assert.match(r.text(), /<img src=x onerror=alert\(1\)>/);
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log('  ok   ' + name); }
    catch (err) { failed += 1; console.log('  FAIL ' + name); console.log('       ' + err.message); }
  }
  console.log('');
  console.log((tests.length - failed) + '/' + tests.length + ' passed');
  process.exit(failed ? 1 : 0);
})();
