// PICK_VISIBILITY_20261114: the Public / Hidden switch and the profile Open
// Picks section. Runs the real script in a bare sandbox (no browser).
//   node tests/pick-visibility-test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'static/js/tmr-pick-visibility.js'), 'utf8');

function boot(apiImpl) {
  const sent = [];
  const api = {
    token: 't',
    request: apiImpl || (async () => { throw new Error('404'); }),
    createPick: async function (d) { sent.push(d); return { ok: true }; },
  };
  const doc = {
    readyState: 'complete', documentElement: {},
    addEventListener() {}, getElementById() { return null; }, querySelector() { return null; },
  };
  const win = { api, auth: { currentUser: { username: 'Me' } } };
  const ctx = { window: win, document: doc, location: { search: '', pathname: '/sportsbook/' }, URLSearchParams, MutationObserver: function () { this.observe = function () {}; }, setTimeout, setInterval: () => 0, Promise, Object, Array, String, Number, Math, Date, isFinite, isNaN, encodeURIComponent, decodeURIComponent };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { pv: win.TMRPickVisibility, api, sent };
}

(async () => {
  let n = 0;
  const ok = (name) => { n++; console.log('  ok   ' + name); };

  // 1. API without the feature: nothing is added to a pick, no switch state.
  {
    const { pv, api, sent } = boot();
    await new Promise((r) => setTimeout(r, 5));
    assert.strictEqual(pv.current(), null);
    await api.createPick({ game_id: 'g', selection: 'x' });
    assert.deepStrictEqual(Object.keys(sent[0]).sort(), ['game_id', 'selection']);
    ok('older API: picks go out untouched and no switch is offered');
  }

  // 2. API with the feature: the choice rides on every pick, an explicit one wins.
  {
    const { pv, api, sent } = boot(async (p) => (p === '/picks/visibility/default' ? { visibility: 'hidden', locked: false } : {}));
    pv._state.ready = true; pv._state.visibility = 'hidden';
    const original = { game_id: 'g', selection: 'x' };
    await api.createPick(original);
    assert.strictEqual(sent[0].pending_visibility, 'hidden');
    assert.strictEqual(original.pending_visibility, undefined, 'the caller object is not mutated');
    await api.createPick({ game_id: 'g', selection: 'y', pending_visibility: 'public' });
    assert.strictEqual(sent[1].pending_visibility, 'public');
    ok('the choice is sent with every pick through api.createPick');
  }

  // 3. Switch markup reuses the slip control and marks the current choice.
  {
    const { pv } = boot();
    pv._state.ready = true; pv._state.visibility = 'public';
    let html = pv._switchHtml();
    assert.ok(/class="sbn-mode tmr-pv-mode"/.test(html));
    assert.ok(/class="sbn-modebtn is-on" data-tmr-pv="public" aria-pressed="true"/.test(html));
    assert.ok(/data-tmr-pv="hidden" aria-pressed="false"/.test(html));
    assert.ok(html.includes('Everyone can see this pick as soon as you lock it.'));
    pv._state.visibility = 'hidden'; pv._state.locked = true;
    html = pv._switchHtml();
    assert.ok(/data-tmr-pv="public" aria-pressed="false" disabled/.test(html), 'a seller who must stay hidden cannot pick Public');
    assert.ok(html.includes('Only you see this pick until it is graded.'));
    ok('switch markup: slip control, current choice, locked seller');
  }

  // 4. Profile section: visitor has no visibility column, owner can reveal, text is escaped.
  {
    const { pv } = boot();
    const picks = [
      { id: 1, pending_visibility: 'public', selection: 'Chiefs -3.5 <b>', market_type: 'spreads', line_snapshot: -3.5, odds_snapshot: -110, risk_units: 1.1, away_team: 'Bills', home_team: 'Chiefs', commence_time: '2026-11-15T21:25:00Z' },
      { id: 2, pending_visibility: 'hidden', selection: 'Over 224.5', market_type: 'totals', line_snapshot: 224.5, odds_snapshot: 135, units: 2, away_team: 'Lakers', home_team: 'Celtics', commence_time: null },
    ];
    const visitor = pv._sectionHtml([picks[0]], false);
    assert.ok(!visitor.includes('Visibility') && !visitor.includes('data-tmr-reveal'));
    assert.ok(visitor.includes('Chiefs -3.5 &lt;b&gt;') && !visitor.includes('<b>'));
    assert.ok(visitor.includes('1 open pick<'));
    const owner = pv._sectionHtml(picks, true);
    assert.ok(owner.includes('<th>Visibility</th>'));
    assert.ok(owner.includes('data-tmr-reveal="2"') && !owner.includes('data-tmr-reveal="1"'));
    assert.ok(owner.includes('2 open picks'));
    assert.ok(owner.indexOf('<th>Pick</th>') < owner.indexOf('<th>Game</th>'), 'the pick is the first column');
    ok('profile section: visitor and owner views, escaped text');
  }

  // 5. Formatters.
  {
    const { pv } = boot();
    const f = pv._fmt;
    assert.strictEqual(f.odds(-110), '-110'); assert.strictEqual(f.odds(135), '+135'); assert.strictEqual(f.odds(null), '');
    assert.strictEqual(f.line(-3.5), '-3.5'); assert.strictEqual(f.line(null), ''); assert.strictEqual(f.line(''), '');
    assert.strictEqual(f.market('h2h'), 'Moneyline'); assert.strictEqual(f.market('team_totals'), 'Team Totals');
    assert.strictEqual(f.stake({ risk_units: 1.1 }), '1.1u'); assert.strictEqual(f.stake({ units: 2 }), '2u'); assert.strictEqual(f.stake({}), '');
    ok('formatters');
  }

  // 6. Pages load the script and the style once.
  for (const page of ['sportsbook/index.html', 'profile/index.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.strictEqual((html.match(/static\/js\/tmr-pick-visibility\.js/g) || []).length, 1, page);
    assert.strictEqual((html.match(/static\/css\/tmr-pick-visibility\.css/g) || []).length, 1, page);
  }
  ok('sportsbook and profile load the script and style once');

  console.log(n + ' passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
