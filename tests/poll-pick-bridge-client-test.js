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
