/**
 * FEED_QUIZ_STALE_20261113 -- the feed's "Prediction Quiz of the Day" card must
 * not show a quiz whose answering window ended days ago.
 *
 * No network, no jsdom: the script is run in a vm with a minimal window/document
 * and a stubbed fetch, then driven through its public mount().
 *
 *   node tests/feed-quiz-stale-test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'quiz-of-day.js'), 'utf8');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-13T12:00:00Z');

function boot(featured) {
  const el = { innerHTML: '', style: { display: 'none' } };
  const sandbox = {
    console,
    Date,
    localStorage: { getItem: () => null },
    location: { pathname: '/feed/', search: '', href: 'https://trustmyrecord.com/feed/' },
    fetch: async () => ({ ok: true, json: async () => ({ featured, game: { questions: [] } }) }),
    document: {
      readyState: 'complete',
      head: { appendChild() {} },
      getElementById: () => null,
      createElement: () => ({ set textContent(v) {}, id: '' }),
      querySelector: () => el,
      addEventListener() {},
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return { api: sandbox.TMRQuizOfDay, el };
}

const iso = (ms) => new Date(ms).toISOString();
let passed = 0;
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
};

(async () => {
  const { api } = boot(null);

  await t('an open quiz is never stale, however old its date', () => {
    assert.strictEqual(api.isStale({ featured_status: 'open', status: 'open', closes_at: iso(NOW - 40 * DAY) }, NOW), false);
  });
  await t('a quiz that closed yesterday still shows (results are news)', () => {
    assert.strictEqual(api.isStale({ featured_status: 'results', status: 'resolved', closes_at: iso(NOW - 1 * DAY) }, NOW), false);
  });
  await t('a quiz that closed Sep 17 is stale on Nov 13', () => {
    assert.strictEqual(api.isStale({ featured_status: 'results', status: 'resolved', closes_at: '2026-09-17T23:15:00Z' }, NOW), true);
  });
  await t('closed and awaiting grading for four days is stale', () => {
    assert.strictEqual(api.isStale({ featured_status: 'closed', status: 'closed', closes_at: iso(NOW - 4 * DAY) }, NOW), true);
  });
  await t('a closed quiz with no closing time is kept, not guessed at', () => {
    assert.strictEqual(api.isStale({ featured_status: 'results', status: 'resolved' }, NOW), false);
  });

  await t('mount() hides the card for a long closed quiz', async () => {
    const { api: a, el } = boot({ id: 9, title: 'Old quiz', featured_status: 'results', status: 'resolved', closes_at: '2026-09-17T23:15:00Z' });
    a.mount('#tmrQuizOfDay');
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(el.style.display, 'none');
    assert.strictEqual(el.innerHTML, '');
  });
  await t('mount() renders the card for an open quiz', async () => {
    const { api: a, el } = boot({ id: 10, title: 'Tonight', featured_status: 'open', status: 'open', closes_at: iso(Date.now() + DAY) });
    a.mount('#tmrQuizOfDay');
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(el.style.display, '');
    assert.ok(el.innerHTML.includes('Tonight'));
    assert.ok(el.innerHTML.includes('Live'));
  });

  console.log(passed + ' passed');
})();
