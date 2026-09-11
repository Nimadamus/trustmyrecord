/**
 * SPORTSBOOK_INTEGRITY_FRONTEND_TEST_20260911 (Nima)
 *
 * Front end cover for F-08 (an unmapped bet type silently became a moneyline)
 * and F-10 (the duplicate / add-units answer had no interface at all).
 *
 * No browser and no jsdom: F-08 is a property of the SOURCE (does the switch
 * fail closed, is every bet type the renderers emit actually mapped), and the
 * guard UI is exercised against a small hand-rolled DOM so the module's real
 * rendering and click handling run. That keeps this runnable in CI, which the
 * Playwright suites are not.
 *
 *   node tests/sportsbook-integrity-frontend-test.cjs
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let pass = 0;
let fail = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log('  PASS  ' + name); }
  catch (error) { fail += 1; console.log('  FAIL  ' + name + '\n         ' + error.message); }
}

const bridgeSrc = fs.readFileSync(
  path.join(ROOT, 'static/js/sportsbook-production-fix-persist-reliability.js'), 'utf8');

/* ========================================================================== */
console.log('\nF-08  an unmapped bet type must not become a moneyline');

t('marketType no longer starts as h2h', () => {
  assert.ok(/var marketType = null;/.test(bridgeSrc), 'marketType should initialise to null');
  assert.ok(!/\n\s*var marketType = 'h2h';/.test(bridgeSrc),
    "the 'h2h' initialiser is still there, so an unmapped type still becomes a moneyline");
});

t('the bet-type switch has a default branch and a guard after it', () => {
  assert.ok(/default:\s*\n\s*marketType = null;/.test(bridgeSrc), 'switch needs a default branch');
  assert.ok(/if \(!marketType\) \{[\s\S]{0,400}unmapped bet type/.test(bridgeSrc),
    'an unmapped type must refuse the click, not fall through');
});

t('the switch is case-insensitive on the bet type', () => {
  assert.ok(/switch \(String\(betType \|\| ''\)\.trim\(\)\.toLowerCase\(\)\)/.test(bridgeSrc));
});

t('every bet type the renderers emit is mapped', () => {
  const cases = new Set(
    (bridgeSrc.match(/case '([a-z0-9]+)':/g) || []).map((s) => s.slice(6, -2))
  );
  // Literals passed as the SECOND argument of selectGameBet, plus the two the
  // dynamic renderers compute (sportsbook/index.html: `type = 'altspread'` in
  // the alternates branch and `var type = 'pick'` in the generic fallback).
  const emitted = new Set(['altspread']);
  for (const page of ['sportsbook/index.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const re = /selectGameBet\(\s*[^,]+,\s*\\?'([a-z0-9]+)\\?'/g;
    let m;
    while ((m = re.exec(html))) emitted.add(m[1]);
    // Standalone `type = 'x'` assignments only. The leading [^.w] keeps this
    // off `input.type = 'file'` and friends, which are not bet types.
    const dyn = /(?:^|[^.\w])type = '([a-z0-9]+)'/g;
    let d;
    while ((d = dyn.exec(html))) {
      if (d[1] !== 'pick') emitted.add(d[1]); // 'pick' is the deliberate no-market sentinel
    }
  }
  const unmapped = [...emitted].filter((v) => !cases.has(v));
  assert.deepStrictEqual(unmapped, [], 'emitted with no case: ' + unmapped.join(', '));
});

t('altspread maps to alt_spreads, not to h2h', () => {
  assert.ok(/case 'altspread':\s*\n\s*marketType = 'alt_spreads';/.test(bridgeSrc));
});

/* ========================================================================== */
console.log('\nF-10  the duplicate and add-units answer has an interface');

t('the guard UI ships on both sportsbook pages, before the slip script', () => {
  for (const page of ['sportsbook/index.html', 'sportsbook/v2/index.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const ui = html.indexOf('sportsbook-duplicate-guard-ui.js');
    const slip = html.indexOf('sportsbook-production-fix-persist-reliability.js?');
    assert.ok(ui > -1, page + ' does not include the guard UI');
    assert.ok(ui < slip, page + ' loads the guard UI after the slip script');
  }
});

t('the slip consults the guard UI before showing its generic banner', () => {
  assert.ok(/window\.__tmrDuplicateGuardUI/.test(bridgeSrc), 'the slip never calls the module');
  const guardAt = bridgeSrc.indexOf('__tmrDuplicateGuardUI');
  const bannerAt = bridgeSrc.indexOf("userMsg = 'Pick Not Submitted: '");
  assert.ok(guardAt > -1 && bannerAt > -1 && guardAt < bannerAt,
    'the guard must be consulted before the generic banner is composed');
});

/* ---- run the module against a minimal DOM ------------------------------- */
function makeElement(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    attributes: {},
    _html: '',
    _listeners: {},
    hidden: false,
    disabled: false,
    value: '',
    textContent: '',
    id: '',
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(k, v) { this.attributes[k] = v; },
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    focus() {},
    click() { (this._listeners.click || []).forEach((fn) => fn({ target: this })); },
    querySelector() { return null; },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
  };
  return el;
}

function installDom() {
  const byId = new Map();
  const created = [];
  const doc = {
    head: makeElement('head'),
    body: makeElement('body'),
    createElement(tag) { const el = makeElement(tag); created.push(el); return el; },
    getElementById(id) { return byId.get(id) || null; },
    querySelector() { return null; },
    addEventListener() {},
  };
  // The module writes innerHTML then looks its controls up by id. Parse the
  // ids out of the markup it produced so getElementById can answer.
  const origAppend = doc.body.appendChild.bind(doc.body);
  doc.body.appendChild = (child) => {
    if (child.id) byId.set(child.id, child);
    const desc = Object.getOwnPropertyDescriptor(child, '_html');
    Object.defineProperty(child, 'innerHTML', {
      get() { return child._html; },
      set(v) {
        child._html = String(v);
        for (const m of String(v).matchAll(/id="([A-Za-z0-9_]+)"/g)) {
          if (!byId.has(m[1])) byId.set(m[1], makeElement('div'));
        }
      },
      configurable: true,
    });
    void desc;
    return origAppend(child);
  };
  global.document = doc;
  global.window = { __tmrDuplicateGuardUI: null };
  return { doc, byId };
}

t('the module renders the duplicate answer and offers add-units', () => {
  const { byId } = installDom();
  delete require.cache[require.resolve('../static/js/sportsbook-duplicate-guard-ui.js')];
  require('../static/js/sportsbook-duplicate-guard-ui.js');
  const ui = global.window.__tmrDuplicateGuardUI;
  assert.ok(ui && typeof ui.handle === 'function', 'module did not install');

  let addedWith = null;
  const handled = ui.handle({
    code: 'DUPLICATE_PICK',
    error: 'You already have this pick',
    can_add_units: true,
    units_remaining: 2,
    max_risk_units: 5,
    risk_units_on_side: 3,
    existing_pick: {
      id: 6175, ticket: '0006175', market_type: 'spreads', selection: 'New York Yankees',
      line_snapshot: -1.5, odds_snapshot: -146, units: 1.5, stake_mode: 'risk',
      game: { away_team: 'Colorado Rockies', home_team: 'New York Yankees' },
    },
  }, {
    api: { addUnitsToPick: (id, units, mode) => { addedWith = { id, units, mode }; return Promise.resolve({ pick: { id }, units_after: 3.5 }); } },
  });
  assert.strictEqual(handled, true, 'the module must own a DUPLICATE_PICK answer');
  const root = byId.get('tmr-dupguard-root');
  assert.ok(root && !root.hidden, 'the dialog should be open');
  assert.ok(/Ticket <b>#0006175<\/b>/.test(root.innerHTML), 'the existing ticket must be named');
  assert.ok(/3u<\/b> of risk out of the 5 unit maximum/.test(root.innerHTML),
    'the risk already on the side must be shown');
  assert.ok(/of 2u available/.test(root.innerHTML), 'the room left must be shown');
  assert.ok(/Add units to ticket #0006175/.test(root.innerHTML), 'the add-units button must exist');
});

t('at the cap the module offers no add-units button', () => {
  const { byId } = installDom();
  delete require.cache[require.resolve('../static/js/sportsbook-duplicate-guard-ui.js')];
  require('../static/js/sportsbook-duplicate-guard-ui.js');
  global.window.__tmrDuplicateGuardUI.handle({
    code: 'DUPLICATE_PICK', can_add_units: false, units_remaining: 0, max_risk_units: 5,
    existing_pick: { id: 1, ticket: '0000001', selection: 'Over', units: 5, stake_mode: 'risk', odds_snapshot: -110 },
  }, { api: {} });
  const html = byId.get('tmr-dupguard-root').innerHTML;
  assert.ok(!/Add units to ticket/.test(html), 'must not offer an add that will be refused');
  assert.ok(/already at the 5 unit risk maximum/.test(html));
});

t('the module renders PRICE_MOVED with both numbers', () => {
  const { byId } = installDom();
  delete require.cache[require.resolve('../static/js/sportsbook-duplicate-guard-ui.js')];
  require('../static/js/sportsbook-duplicate-guard-ui.js');
  const handled = global.window.__tmrDuplicateGuardUI.handle({
    code: 'PRICE_MOVED', submitted_odds: -110, current_odds: -125, selection: 'Over',
  }, {});
  assert.strictEqual(handled, true);
  const html = byId.get('tmr-dupguard-root').innerHTML;
  assert.ok(/-110/.test(html) && /-125/.test(html), 'both prices must be shown');
  assert.ok(/Lock it at -125/.test(html));
});

t('the module explains an exposure refusal in risk units', () => {
  const { byId } = installDom();
  delete require.cache[require.resolve('../static/js/sportsbook-duplicate-guard-ui.js')];
  require('../static/js/sportsbook-duplicate-guard-ui.js');
  global.window.__tmrDuplicateGuardUI.handle({
    code: 'EXPOSURE_CAP_SIDE_EXCEEDED', error: 'You already have 5 units of risk on this side.',
    side_risk_units: 5, side_tickets: 2, ticket_risk_units: 1, max_risk_units: 5,
  }, {});
  const html = byId.get('tmr-dupguard-root').innerHTML;
  assert.ok(/5u<\/b> of risk/.test(html));
  assert.ok(/does not come with a fresh five units/.test(html),
    'must state the F-12 rule the member is hitting');
});

t('an unknown code falls through to the slip banner', () => {
  installDom();
  delete require.cache[require.resolve('../static/js/sportsbook-duplicate-guard-ui.js')];
  require('../static/js/sportsbook-duplicate-guard-ui.js');
  assert.strictEqual(global.window.__tmrDuplicateGuardUI.handle({ code: 'GAME_ALREADY_STARTED' }, {}), false);
  assert.strictEqual(global.window.__tmrDuplicateGuardUI.handle(null, {}), false);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
