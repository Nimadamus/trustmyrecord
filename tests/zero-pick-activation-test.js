/**
 * Zero-pick first-session activation — coverage, ladder, and the /welcome/ experiment.
 *
 * Two things are locked down here.
 *
 * COVERAGE. Members with 1+ picks were prompted on five surfaces while members
 * with ZERO picks were prompted on three, and not on the page registration
 * actually lands them on. These tests assert the surfaces carry the script and
 * that the two scripts never both render.
 *
 * THE EXPERIMENT. /welcome/ ships the pick row third, badged Optional, with
 * "You can skip this entirely". The treatment reorders and rewords the rows
 * that already exist. Control must remain byte-identical to what ships.
 *
 *   node tests/zero-pick-activation-test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const ONBOARDING = read('static/js/first-pick-onboarding.js');
const NUDGE = read('static/js/pick-progress-nudge.js');
const CHECKLIST = read('static/js/welcome-checklist.js');

const tests = [];
const test = (n, f) => tests.push([n, f]);

/* ------------------------------------------------------------- coverage */

const ZERO_PICK_SURFACES = [
  'index.html', 'sportsbook/index.html', 'profile/index.html',
  'today/index.html', 'polls/index.html', 'forum/index.html',
  'trivia/index.html', 'welcome/index.html',
];

for (const page of ZERO_PICK_SURFACES) {
  test('zero-pick script is loaded on /' + page.replace('index.html', ''), () => {
    // Count SCRIPT TAGS, not mentions: several files discuss this one in
    // comments, and index.html loads it under a content-hashed filename.
    const tags = (read(page).match(/<script[^>]+src="[^"]*first-pick-onboarding[^"]*"/g) || []);
    assert.ok(tags.length >= 1, 'missing on ' + page);
    assert.strictEqual(tags.length, 1, 'loaded twice on ' + page + ' — would double-render');
  });
}

test('the 1+ pick nudge is never loaded twice either', () => {
  for (const page of ['index.html', 'profile/index.html', 'today/index.html', 'polls/index.html', 'forum/index.html']) {
    const hits = (read(page).match(/pick-progress-nudge\.js/g) || []).length;
    assert.strictEqual(hits, 1, page);
  }
});

test('the two scripts own disjoint pick counts, so no page shows both', () => {
  // The nudge refuses anyone with zero picks...
  assert.ok(/data\.picks\.total < 1/.test(NUDGE), 'nudge must bail at 0 picks');
  // ...and the onboarding refuses anyone who has any.
  assert.ok(/hasPicks/.test(ONBOARDING), 'onboarding must gate on hasPicks');
});

test('no CTA still links to the dead ?first_pick=1 marker', () => {
  // The string may legitimately appear in prose explaining why it is dead;
  // what must not survive is an href that still uses it.
  const hrefWithMarker = /href=["'][^"']*first_pick=1/;
  for (const [label, src] of [['onboarding', ONBOARDING], ['checklist', CHECKLIST],
                              ['welcome', read('welcome/index.html')], ['home', read('index.html')]]) {
    assert.ok(!hrefWithMarker.test(src), label + ' still has a CTA on the dead marker');
  }
});

test('the strip copy is identical in the script and the homepage early block', () => {
  const copy = '<strong>Start your verified record.</strong> Lock your first pick.';
  assert.ok(ONBOARDING.includes(copy), 'script copy');
  assert.ok(read('index.html').includes(copy), 'homepage early-paint copy');
});

test('pages without backend-api.js can still ask whether the member has picks', () => {
  // /today/ and /welcome/ deliberately do not load the API client.
  for (const page of ['today/index.html', 'welcome/index.html']) {
    assert.ok(!/backend-api\.js/.test(read(page)), page + ' unexpectedly loads the client');
  }
  assert.ok(/plainGet/.test(ONBOARDING), 'a fallback fetch must exist');
  assert.ok(/picks\/activation-status/.test(ONBOARDING));
  assert.ok(/trustmyrecord-api\.onrender\.com/.test(ONBOARDING), 'fallback needs an API base');
});

/* ------------------------------------------------- the welcome experiment */

async function welcomePage(opts) {
  const o = opts || {};
  const dom = new JSDOM(read('welcome/index.html'), {
    url: 'https://trustmyrecord.com/welcome/' + (o.search || ''),
    runScripts: 'outside-only',
  });
  const win = dom.window;
  if (o.storage) Object.keys(o.storage).forEach((k) => win.localStorage.setItem(k, o.storage[k]));
  if (o.token !== false) win.localStorage.setItem('trustmyrecord_token', 'stub');
  const events = [];
  win.gtag = (type, name, params) => events.push({ name, params });
  win.fetch = () => new Promise(() => {});   // never resolves: status lines stay pending
  /* Seed Math.random INSIDE the window's own realm, in the same eval as the
     script, so the coin flip is deterministic without reaching across realms. */
  const prelude = o.randomLow === undefined ? ''
    : 'Math.random = function () { return ' + (o.randomLow ? '0.1' : '0.9') + '; };' + String.fromCharCode(10);
  win.eval(prelude + CHECKLIST);
  /* JSDOM may still be parsing, in which case the script waits for
     DOMContentLoaded. Let that fire before anything is asserted. */
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return {
    win, doc: win.document, events,
    rowOrder: () => [...win.document.querySelectorAll('.wc-step')].map((e) => e.id),
    nums: () => [...win.document.querySelectorAll('.wc-num')].map((e) => e.textContent),
    pickRow: () => win.document.getElementById('wcStepPick'),
    arm: () => (events.find((e) => e.name === 'welcome_arm_assigned') || { params: {} }).params.arm,
  };
}

test('control leaves the shipped page exactly as it is', async () => {
  const r = await welcomePage({ search: '?welcome_arm=control' });
  assert.strictEqual(r.arm(), 'control');
  assert.deepStrictEqual(r.rowOrder(), ['wcStepPoll', 'wcStepTrivia', 'wcStepPick']);
  assert.deepStrictEqual(r.nums(), ['1', '2', '3']);
  assert.ok(r.pickRow().querySelector('.wc-optional'), 'Optional pill must remain');
  assert.match(r.pickRow().textContent, /Browse today/);
  assert.match(r.pickRow().textContent, /skip this entirely/);
  assert.strictEqual(r.doc.getElementById('wcPickCta').className, 'wc-act secondary');
  assert.match(r.doc.getElementById('wcSub').textContent, /none of them require betting/);
});

test('treatment promotes the pick row and drops the optional framing', async () => {
  const r = await welcomePage({ search: '?welcome_arm=treatment' });
  assert.strictEqual(r.arm(), 'treatment');
  assert.deepStrictEqual(r.rowOrder(), ['wcStepPick', 'wcStepPoll', 'wcStepTrivia']);
  assert.deepStrictEqual(r.nums(), ['1', '2', '3'], 'badges must renumber, not repeat');
  assert.strictEqual(r.pickRow().querySelector('.wc-optional'), null);
  assert.match(r.pickRow().textContent, /Start your verified record/);
  assert.ok(!/skip this entirely/.test(r.pickRow().textContent));
  assert.strictEqual(r.doc.getElementById('wcPickCta').className, 'wc-act');
  assert.strictEqual(r.doc.getElementById('wcSub').textContent, 'Three things you can do right now.');
});

test('treatment changes nothing except the activation row and the sub-line', async () => {
  const c = await welcomePage({ search: '?welcome_arm=control' });
  const t = await welcomePage({ search: '?welcome_arm=treatment' });
  // The other two rows keep every word, every class and every link. Their
  // step NUMBER changes, because promoting the pick row to first necessarily
  // renumbers what follows it — that is the reorder, not a content edit.
  for (const id of ['wcStepPoll', 'wcStepTrivia']) {
    const strip = (el) => {
      const clone = el.cloneNode(true);
      const num = clone.querySelector('.wc-num');
      if (num) num.textContent = '';
      return clone.innerHTML;
    };
    assert.strictEqual(
      strip(c.doc.getElementById(id)),
      strip(t.doc.getElementById(id)),
      id + ' must keep its content under the treatment'
    );
  }
  assert.deepStrictEqual(c.nums(), ['1', '2', '3']);
  assert.deepStrictEqual(t.nums(), ['1', '2', '3'], 'numbering stays 1..3 in both arms');
  assert.ok(t.doc.getElementById('wcSkip'), 'the skip link stays: we encourage, not force');
  assert.strictEqual(c.doc.querySelectorAll('.wc-step').length, t.doc.querySelectorAll('.wc-step').length);
});

test('assignment is stable across views for the same browser', async () => {
  const first = await welcomePage({ randomLow: true });
  const arm = first.arm();
  const stored = first.win.localStorage.getItem('tmr_welcome_arm');
  assert.strictEqual(stored, arm);
  for (let i = 0; i < 5; i++) {
    const again = await welcomePage({ storage: { tmr_welcome_arm: stored }, randomLow: false });
    assert.strictEqual(again.arm(), arm, 'arm flipped between views');
  }
});

test('both arms are reachable from a coin flip', async () => {
  assert.strictEqual((await welcomePage({ randomLow: true })).arm(), 'control');
  assert.strictEqual((await welcomePage({ randomLow: false })).arm(), 'treatment');
});

test('a browser with no storage sees the page as it ships', async () => {
  const dom = new JSDOM(read('welcome/index.html'), {
    url: 'https://trustmyrecord.com/welcome/', runScripts: 'outside-only',
  });
  const win = dom.window;
  Object.defineProperty(win, 'localStorage', {
    configurable: true,
    get() { throw new Error('storage blocked'); },
  });
  const events = [];
  win.gtag = (t, n, p) => events.push({ name: n, params: p });
  win.fetch = () => new Promise(() => {});
  win.eval(CHECKLIST);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const assigned = events.find((e) => e.name === 'welcome_arm_assigned');
  assert.strictEqual(assigned.params.arm, 'control');
  assert.deepStrictEqual(
    [...win.document.querySelectorAll('.wc-step')].map((e) => e.id),
    ['wcStepPoll', 'wcStepTrivia', 'wcStepPick']
  );
});

test('every welcome event carries the arm, with no second funnel', async () => {
  const r = await welcomePage({ search: '?welcome_arm=treatment' });
  r.doc.getElementById('wcPickCta').dispatchEvent(new r.win.Event('click', { bubbles: true }));
  const clicked = r.events.find((e) => e.name === 'welcome_action_clicked');
  assert.ok(clicked, 'the existing event must still fire');
  assert.strictEqual(clicked.params.action, 'pick');
  assert.strictEqual(clicked.params.arm, 'treatment');
  for (const e of r.events) assert.ok(e.params.arm, e.name + ' is missing the arm');
});

test('a treatment that cannot apply reports itself as control', async () => {
  const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>', {
    url: 'https://trustmyrecord.com/welcome/?welcome_arm=treatment', runScripts: 'outside-only',
  });
  const win = dom.window;
  const events = [];
  win.gtag = (t, n, p) => events.push({ name: n, params: p });
  win.fetch = () => new Promise(() => {});
  win.eval(CHECKLIST);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(events.find((e) => e.name === 'welcome_arm_assigned').params.arm, 'control');
});

/* ------------------------------------------------------------- no layout */

test('no new markup, styles or sections were added to /welcome/', () => {
  const html = read('welcome/index.html');
  assert.strictEqual((html.match(/class="wc-step"/g) || []).length, 3, 'still three rows');
  assert.ok(!/wc-experiment|wc-variant|wc-treatment/.test(html), 'no experiment-specific markup');
  assert.ok(/wc-act secondary/.test(html), 'control CTA class still ships in the HTML');
});

test('the treatment reuses classes the page already ships', () => {
  const css = read('welcome/index.html');
  assert.ok(/\.wc-act\{/.test(css.replace(/\s/g, '')) || /\.wc-act/.test(css), '.wc-act exists');
  assert.ok(!/applyTreatment[\s\S]{0,400}style\./.test(CHECKLIST), 'treatment must not set inline styles');
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
