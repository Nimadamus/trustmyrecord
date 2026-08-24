/**
 * pick-progress-nudge.js — behaviour tests.
 *
 * Runs the real file inside a jsdom document with a stubbed window.api, and
 * asserts on the DOM it actually produces. No logic is re-implemented here:
 * a test that copies the function it is testing proves nothing.
 *
 *   node tests/pick-progress-nudge.test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'pick-progress-nudge.js'), 'utf8');

/**
 * Boot one isolated page.
 *
 * @param {object}  opts.progress   what /participation/my-progress returns
 * @param {string}  opts.pathname   the page being viewed
 * @param {boolean} opts.token      is there a stored auth token
 * @param {object}  opts.storage    pre-seeded localStorage entries
 */
async function run(opts) {
  const o = opts || {};
  const dom = new JSDOM('<!doctype html><html><head></head><body><main><p>page</p></main></body></html>', {
    url: 'https://trustmyrecord.com' + (o.pathname || '/'),
    runScripts: 'outside-only',
  });
  const win = dom.window;

  Object.keys(o.storage || {}).forEach((k) => win.localStorage.setItem(k, o.storage[k]));
  if (o.token !== false) win.localStorage.setItem('tmr_token', 'stub-token');

  const calls = [];
  win.api = {
    ready: Promise.resolve(),
    request(p) {
      calls.push(p);
      if (o.progress === 'reject') return Promise.reject(new Error('boom'));
      return Promise.resolve(o.progress);
    },
  };
  const events = [];
  win.gtag = (type, name, params) => events.push({ name, params });

  win.eval(SCRIPT);
  // Let the stubbed promise chain settle.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  return {
    win,
    doc: win.document,
    strip: win.document.getElementById('tmr-pp-strip'),
    calls,
    events,
    text() {
      const el = win.document.getElementById('tmr-pp-strip');
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    },
  };
}

function gate(key, target, basis, have) {
  return { key, label: key, basis, target, have, remaining: target - have };
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

/* ------------------------------------------------------------- it renders */

test('one pick -> asks for the second, in the shared strip markup', async () => {
  const r = await run({
    progress: {
      picks: { total: 1, public: 1, graded: 1, pending: 0 },
      next_gate: gate('second_pick', 2, 'total', 1),
    },
  });
  assert.ok(r.strip, 'strip should render');
  assert.strictEqual(r.strip.className, 'tmr-fp-reminder', 'must reuse the existing strip class');
  assert.match(r.text(), /Your verified record has started/);
  assert.match(r.text(), /Make Pick #2/);
  assert.strictEqual(r.doc.getElementById('tmr-pp-cta').getAttribute('href'), '/sportsbook/');
});

test('the 10-pick rung counts remaining picks, not graded ones', async () => {
  const r = await run({
    progress: {
      picks: { total: 7, public: 7, graded: 2, pending: 5 },
      next_gate: gate('milestone_10', 10, 'total', 7),
    },
  });
  assert.match(r.text(), /7 picks locked/);
  assert.match(r.text(), /3 more picks/);
});

test('the leaderboard rung says GRADED and surfaces pending picks', async () => {
  const r = await run({
    progress: {
      picks: { total: 22, public: 22, graded: 18, pending: 4 },
      next_gate: gate('leaderboard', 20, 'graded', 18),
    },
  });
  assert.match(r.text(), /18 graded picks/);
  assert.match(r.text(), /2 more graded picks put you on the leaderboard/);
  assert.match(r.text(), /4 still pending/);
});

test('singular wording at one remaining', async () => {
  const r = await run({
    progress: {
      picks: { total: 25, public: 25, graded: 24, pending: 1 },
      next_gate: gate('verified', 25, 'graded', 24),
    },
  });
  assert.match(r.text(), /1 more graded pick makes you a Verified Handicapper/);
});

/* ---------------------------------------------------------- it stays quiet */

test('zero picks is the other script’s job, not this one', async () => {
  const r = await run({
    progress: { picks: { total: 0, public: 0, graded: 0, pending: 0 }, next_gate: gate('first_pick', 1, 'total', 0) },
  });
  assert.strictEqual(r.strip, null);
});

test('every gate reached renders nothing', async () => {
  const r = await run({
    progress: { picks: { total: 400, public: 400, graded: 390, pending: 0 }, next_gate: null },
  });
  assert.strictEqual(r.strip, null);
});

test('a failed request renders nothing rather than guessing', async () => {
  const r = await run({ progress: 'reject' });
  assert.strictEqual(r.strip, null);
});

test('a malformed answer renders nothing', async () => {
  const r = await run({ progress: { picks: null } });
  assert.strictEqual(r.strip, null);
});

test('logged out never even calls the API', async () => {
  const r = await run({
    token: false,
    progress: { picks: { total: 1, public: 1, graded: 1, pending: 0 }, next_gate: gate('second_pick', 2, 'total', 1) },
  });
  assert.strictEqual(r.strip, null);
  assert.strictEqual(r.calls.length, 0);
});

test('suppressed on the pages where the member is already picking', async () => {
  for (const p of ['/sportsbook/', '/submit-pick/', '/welcome/', '/register/', '/mypicks/']) {
    const r = await run({
      pathname: p,
      progress: { picks: { total: 1, public: 1, graded: 1, pending: 0 }, next_gate: gate('second_pick', 2, 'total', 1) },
    });
    assert.strictEqual(r.strip, null, p + ' should be suppressed');
    assert.strictEqual(r.calls.length, 0, p + ' should not call the API');
  }
});

test('at most once a day, and dismissal holds for the day', async () => {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const progress = { picks: { total: 1, public: 1, graded: 1, pending: 0 }, next_gate: gate('second_pick', 2, 'total', 1) };

  const shown = await run({ progress, storage: { tmr_pp_last_shown: day } });
  assert.strictEqual(shown.strip, null, 'already shown today');

  const dismissed = await run({ progress, storage: { tmr_pp_dismissed: day } });
  assert.strictEqual(dismissed.strip, null, 'dismissed today');

  const yesterday = await run({ progress, storage: { tmr_pp_last_shown: '2000-01-01', tmr_pp_dismissed: '2000-01-01' } });
  assert.ok(yesterday.strip, 'a stale stamp must not silence it forever');
});

test('rendering stamps the day and reports to analytics', async () => {
  const r = await run({
    progress: { picks: { total: 4, public: 4, graded: 3, pending: 1 }, next_gate: gate('milestone_10', 10, 'total', 4) },
  });
  assert.ok(r.strip);
  assert.ok(r.win.localStorage.getItem('tmr_pp_last_shown'), 'day must be stamped so it cannot repeat');
  const viewed = r.events.find((e) => e.name === 'pick_progress_nudge_viewed');
  assert.ok(viewed, 'a view must be measurable');
  assert.strictEqual(viewed.params.gate, 'milestone_10');
  assert.strictEqual(viewed.params.picks_total, 4);
  assert.strictEqual(viewed.params.picks_graded, 3);
});

test('dismissing removes the strip and records why', async () => {
  const r = await run({
    progress: { picks: { total: 1, public: 1, graded: 0, pending: 1 }, next_gate: gate('second_pick', 2, 'total', 1) },
  });
  r.strip.querySelector('.tmr-fp-reminder__close').dispatchEvent(new r.win.Event('click'));
  assert.strictEqual(r.doc.getElementById('tmr-pp-strip'), null);
  assert.ok(r.events.find((e) => e.name === 'pick_progress_nudge_dismissed'));
  assert.ok(r.win.localStorage.getItem('tmr_pp_dismissed'));
});

test('server text is escaped, never injected as markup', async () => {
  const r = await run({
    progress: {
      picks: { total: 1, public: 1, graded: 1, pending: 0 },
      next_gate: gate('second_pick', 2, 'total', 1),
    },
  });
  assert.strictEqual(r.strip.querySelectorAll('script').length, 0);
  assert.ok(r.strip.querySelector('strong').textContent.length > 0);
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log('  ok   ' + name);
    } catch (err) {
      failed += 1;
      console.log('  FAIL ' + name + '\n       ' + err.message);
    }
  }
  console.log('\n' + (tests.length - failed) + '/' + tests.length + ' passed');
  process.exit(failed ? 1 : 0);
})();
