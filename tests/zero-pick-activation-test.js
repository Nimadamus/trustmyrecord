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
  'mlb-simulator/index.html', 'nfl-simulator/index.html',
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
  for (const page of ['index.html', 'profile/index.html', 'today/index.html', 'polls/index.html',
                      'forum/index.html', 'mlb-simulator/index.html', 'nfl-simulator/index.html']) {
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

/* ------------------------------------------ impressions must be truthful */

test('an impression is only counted after the server confirms zero picks', () => {
  // The strip paints optimistically from a cached flag so it cannot shove the
  // page down. A member who has since activated still carries that flag until
  // their next load corrects it, and counting that paint would inflate the
  // funnel among exactly the members who converted.
  assert.ok(/state\.confirmed/.test(ONBOARDING), 'a confirmation flag must exist');
  assert.ok(/function maybeTrackReminderView/.test(ONBOARDING));
  const fn = ONBOARDING.slice(ONBOARDING.indexOf('function maybeTrackReminderView'));
  const body = fn.slice(0, fn.indexOf(String.fromCharCode(10) + '    }'));
  assert.ok(/if \(state\.viewed \|\| !state\.confirmed\) return;/.test(body),
    'the impression must bail when unconfirmed');
  assert.ok(/getElementById\('tmr-fp-reminder'\)/.test(body),
    'and bail when nothing is actually on screen');
  // No other path may fire the event.
  const fires = (ONBOARDING.match(/track\('sportsbook_onboarding_viewed'/g) || []).length;
  assert.strictEqual(fires, 2, 'exactly two: the sportsbook panel and the confirmed strip');
});

test('confirmation is set from the server answer, never from localStorage', () => {
  const idx = ONBOARDING.indexOf('state.confirmed = true');
  assert.ok(idx > 0, 'confirmation must be set somewhere');
  const context = ONBOARDING.slice(Math.max(0, idx - 600), idx);
  assert.ok(/status/.test(context), 'set inside the status handler, not the optimistic path');
});

/* --------------------------------------------- it looks like the page it is on */

test('the strip matches a light surface instead of forcing the homepage dark', () => {
  // The strip was built for the homepage, where it sits in the dark band under
  // the nav. /welcome/, /today/, /polls/, /forum/ and /trivia/ are light pages,
  // and a dark navy bar with a cyan border reads as a foreign component there.
  for (const [label, src] of [['onboarding', ONBOARDING], ['nudge', NUDGE],
                              ['poll bridge', read('static/js/poll-pick-bridge.js')]]) {
    assert.ok(/tmr-fp-reminder--light/.test(src), label + ' has no light variant');
    assert.ok(/luminance|0\.299/.test(src), label + ' does not read the surface');
  }
});

test('the homepage and /profile/ can never take the light variant', () => {
  // Verified in production: the luminance walk returns TRUE on "/", because the
  // dark band the strip sits in is a SIBLING of the strip, not an ancestor -
  // the ancestors are the light page background. Without an explicit guard the
  // homepage strip would have been repainted white.
  for (const [label, src] of [['onboarding', ONBOARDING], ['nudge', NUDGE],
                              ['poll bridge', read('static/js/poll-pick-bridge.js')]]) {
    assert.ok(/index\.html/.test(src) && /\/profile\//.test(src),
      label + ' does not exclude the locked dark surfaces');
  }
  assert.ok(/function lockedDarkSurface/.test(ONBOARDING));
  // The guard must run BEFORE any colour is read.
  const fn = ONBOARDING.slice(ONBOARDING.indexOf('function surfaceIsLight'));
  const head = fn.slice(0, fn.indexOf('getComputedStyle'));
  assert.ok(/lockedDarkSurface\(\)/.test(head), 'the guard must short-circuit first');
});

test('the light palette is the one the light pages already use', () => {
  // Same values /welcome/ uses for .wc-step and .wc-act, so the strip reads as
  // part of the page rather than as something bolted on.
  const welcome = read('welcome/index.html');
  for (const token of ['#D2DEEA', '#07182A', '#0C948C']) {
    assert.ok(welcome.includes(token), token + ' is not a real page token');
    assert.ok(ONBOARDING.includes(token), token + ' missing from the strip variant');
  }
});

test('an unreadable surface keeps the original dark strip', () => {
  // Failing to parse a colour must not shift the homepage's approved baseline.
  const fn = ONBOARDING.slice(ONBOARDING.indexOf('function surfaceIsLight'));
  const NL = String.fromCharCode(10);
  assert.match(fn.slice(0, fn.indexOf('}' + NL + NL)), /return false;/);
});

/* -------------------------------------- the simulator surface, and MLB's own CTA */

test('the strip stands down when another first-pick CTA owns the screen', () => {
  // The MLB simulator's post-result panel already renders "Make Your Official
  // Prediction" for logged-in AND logged-out visitors, tied to the matchup the
  // member just simulated. That CTA is better than this generic strip on that
  // screen, so two prompts for one action is the thing to avoid.
  assert.ok(/function competingFirstPickCta/.test(ONBOARDING));
  assert.ok(/#simcConversionPanel a\[href\^="\/sportsbook\/"\]/.test(ONBOARDING),
    'must key off the real MLB panel CTA');
  // The render path must consult it.
  const render = ONBOARDING.slice(ONBOARDING.indexOf('function renderReminder'));
  assert.ok(/competingFirstPickCta\(\)/.test(render.slice(0, 400)),
    'renderReminder must check before painting');
  // And it must retire a strip that is already up when the panel arrives.
  assert.ok(/standDownWhenAnotherCtaAppears/.test(ONBOARDING));
  assert.ok(/MutationObserver/.test(ONBOARDING), 'the panel renders asynchronously');
});

test('the MLB prediction CTA is not removed, only deferred to', () => {
  const conv = read('static/js/mlb-simulator-conversion.js');
  assert.ok(/Make Your Official Prediction/.test(conv), 'the existing MLB CTA must survive');
  assert.ok(/predictionLink\.href = '\/sportsbook\/'/.test(conv));
  // Nothing in this change may have touched that file.
  assert.ok(!/tmr-fp-reminder/.test(conv), 'no strip logic leaked into the MLB component');
});

test('NFL gets the strip as its activation path, with no custom component', () => {
  const nfl = read('nfl-simulator/index.html');
  assert.ok(/first-pick-onboarding/.test(nfl), 'NFL must load the shared strip');
  assert.ok(!/simcConversionPanel/.test(nfl), 'NFL has no competing panel');
  assert.ok(!/mlb-simulator-conversion/.test(nfl), 'and must not borrow the MLB one');
});

test('the simulator gate and its resume path are untouched', () => {
  const gate = read('static/js/sim-auth-gate.js');
  assert.ok(/simResume/.test(gate), 'resume flag intact');
  assert.ok(/restoreState/.test(gate) && /runNow/.test(gate), 'restore + auto-run intact');
  assert.ok(!/first-pick-onboarding|tmr-fp-reminder/.test(gate),
    'activation logic must not have leaked into the gate');
});

test('the simulator pick prefill is untouched', () => {
  const prefill = read('static/js/sim-pick-prefill.js');
  assert.ok(/tmr_sim_pick_intent/.test(prefill));
  assert.ok(/simpick/.test(prefill));
  assert.ok(!/method:\s*'POST'/.test(prefill), 'still never submits');
});

/* ------------------------------- the ladder is complete on the simulators */

test('both simulator pages carry the whole ladder, each script once', () => {
  for (const page of ['mlb-simulator/index.html', 'nfl-simulator/index.html']) {
    const html = read(page);
    const zero = (html.match(/<script[^>]+src="[^"]*first-pick-onboarding[^"]*"/g) || []).length;
    const two = (html.match(/<script[^>]+src="[^"]*pick-progress-nudge[^"]*"/g) || []).length;
    assert.strictEqual(zero, 1, page + ' zero-pick script');
    assert.strictEqual(two, 1, page + ' pick-two nudge');
  }
});

test('the nudge stands down for the MLB panel exactly as the zero-pick strip does', () => {
  // A member on one pick reads "Make Pick #2" and "Make Your Official
  // Prediction" as the same ask. The panel's CTA sits with the result they
  // just produced, so it wins.
  assert.ok(/function competingPickCta/.test(NUDGE));
  assert.ok(/#simcConversionPanel a\[href\^="\/sportsbook\/"\]/.test(NUDGE));
  const render = NUDGE.slice(NUDGE.indexOf('function render('));
  assert.ok(/competingPickCta\(\)/.test(render.slice(0, 400)), 'render must check first');
  assert.ok(/standDownWhenAnotherCtaAppears/.test(NUDGE), 'and retire a visible one');
  assert.ok(/MutationObserver/.test(NUDGE));
});

test('the simulator pages are not in the nudge suppression list', () => {
  // The nudge suppresses pages where the member is already picking. A
  // simulator is not one of those, so the ladder must actually run there.
  const start = NUDGE.indexOf('var SUPPRESSED_PATHS = [');
  const list = NUDGE.slice(start, NUDGE.indexOf('];', start));
  assert.ok(!/simulator/.test(list), 'simulators must not be suppressed');
});

/* ------------------------------------- analytics defects (2026-08-25) */

const BRIDGE = read('static/js/poll-pick-bridge.js');
const CHECKLIST2 = read('static/js/welcome-checklist.js');

test('both generic strips stand down for the Poll to Pick CTA', () => {
  // The poll strip names the prediction the member just voted for, so it is
  // more specific than either generic prompt and wins on /polls/.
  for (const [label, src] of [['zero-pick', ONBOARDING], ['pick-two', NUDGE]]) {
    assert.ok(/tmr-poll-bridge/.test(src), label + ' does not yield to the poll strip');
  }
});

test('the nudge observer removes the element it actually owns', () => {
  // It previously called a remove() helper that does not exist in that file,
  // so the observer threw and the double prompt survived.
  const fn = NUDGE.slice(NUDGE.indexOf('function standDownWhenAnotherCtaAppears'));
  const NL2 = String.fromCharCode(10);
  const body = fn.slice(0, fn.indexOf(NL2 + '    }'));
  assert.ok(/getElementById\(ELEMENT_ID\)/.test(body), 'must remove by its own id');
  assert.ok(!/[^.]remove\(\)/.test(body), 'must not call an undefined remove()');
});

test('every surface reports its own name, not one collapsed label', () => {
  for (const [label, src] of [['zero-pick', ONBOARDING], ['pick-two', NUDGE], ['poll bridge', BRIDGE]]) {
    assert.ok(/function surfaceName/.test(src), label + ' has no surface map');
    for (const page of ['homepage', 'welcome', 'today', 'polls', 'forum', 'trivia',
                        'mlb_simulator', 'nfl_simulator']) {
      assert.ok(src.includes("'" + page + "'"), label + ' cannot report ' + page);
    }
  }
  // It may still be named in the comment that explains why it was replaced;
  // what must not survive is an event still emitting it.
  assert.ok(!/surface:\s*isSportsbook\(\)\s*\?[^,]*sitewide_reminder/.test(ONBOARDING),
    'no event may still emit the collapsed label');
  assert.ok(!/track\([^)]*sitewide_reminder/.test(ONBOARDING));
});

test('arrival fires only from a real handoff, and only once', () => {
  assert.ok(/activation_pick_flow_arrival/.test(ONBOARDING));
  const fn = ONBOARDING.slice(ONBOARDING.indexOf('function emitActivationArrival'));
  const NL2 = String.fromCharCode(10);
  const body = fn.slice(0, fn.indexOf(NL2 + '    }'));
  assert.ok(/isSportsbook\(\)/.test(body), 'only on the board');
  assert.ok(/removeItem\(ARRIVAL_KEY\)/.test(body), 'the record must be consumed');
  assert.ok(/if \(!d \|\| !d\.source\) return;/.test(body), 'no source, no event');
  assert.ok(/catch/.test(body), 'a malformed record must not throw');
});

test('every activation CTA leaves a handoff the board can attribute', () => {
  assert.ok(/markActivationHandoff\(\{ source: 'first_pick_strip'/.test(ONBOARDING));
  assert.ok(/markActivationHandoff\(\{ source: 'pick_progress_strip'/.test(NUDGE));
  assert.ok(/markActivationHandoff\(\{ source: 'poll'/.test(BRIDGE));
  assert.ok(/source: 'welcome_checklist'/.test(CHECKLIST2), 'the welcome board row too');
  assert.ok(/arm: ARM/.test(CHECKLIST2), 'carrying the experiment arm');
  // One key, one record: a second click overwrites rather than queues.
  for (const src of [ONBOARDING, NUDGE, BRIDGE, CHECKLIST2]) {
    assert.ok(/tmr_activation_arrival/.test(src));
  }
});

test('Pick #1 truth stays server-side', () => {
  // No client event may claim a pick was created.
  // A comment may reference the completion event these files rely on; what
  // must not exist is a track() call claiming a pick was created.
  for (const src of [ONBOARDING, NUDGE, BRIDGE]) {
    assert.ok(!/track\(\s*['"][a-z_]*pick_created/.test(src),
      'client must not assert pick creation');
  }
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
