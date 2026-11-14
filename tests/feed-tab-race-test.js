/**
 * FEED_TAB_RACE_20261113 -- a feed response that lands after a newer tab click
 * must not be painted under the newer tab.
 *
 * No network, no jsdom: loadFeedItems() is lifted out of the feed script and run
 * in a vm against stubbed collaborators and hand-resolved API promises.
 *
 *   node tests/feed-tab-race-test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'feed-ui-overrides.js'), 'utf8');
const start = file.indexOf('let _feedLoadSeq = 0;');
const tail = file.indexOf('window.__msPrefInit = true', start);
const end = file.indexOf('\n}', tail) + 2;
assert.ok(start > 0 && tail > start && end > tail, 'loadFeedItems() not found in feed-ui-overrides.js');
const src = file.slice(start, end);

function boot() {
  const attrs = {};
  const list = {
    innerHTML: 'INITIAL',
    setAttribute: (k, v) => { attrs[k] = v; },
    removeAttribute: (k) => { delete attrs[k]; },
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
  };
  const loadMore = { style: { display: '' } };
  const pending = [];
  const calls = { hero: [], after: 0, unavailable: 0 };
  const sandbox = {
    console, Date, Map, Set, Promise, setTimeout,
    FEED_LIMIT: 20, currentFilter: 'all', feedOffset: 0,
    document: { getElementById: (id) => (id === 'feedList' ? list : id === 'loadMore' ? loadMore : null) },
    api: { request() {} },
    loadFollowingPeople() {},
    takeFeedSources() {
      let resolve, reject;
      const feed = new Promise((res, rej) => { resolve = res; reject = rej; });
      const filter = sandbox.currentFilter;
      pending.push({ filter, resolve, reject });
      // The retry path refetches; it gets the same hand-held promise.
      return { feed, fetchFeedPage: () => feed, discover: Promise.resolve(null), polls: Promise.resolve(null), notif: null, notifViewer: null };
    },
    isRealPublicFeedUser: () => true,
    normalizePublicPick: (x) => x,
    buildUserMapFromFeed: () => ({}),
    attachUserRecord: (i) => i,
    getUsername: (i) => i.username,
    aggregateFeedItems: (x) => x,
    updateHeroCounts: (n) => calls.hero.push(n),
    fvAfterFeed: () => { calls.after++; },
    renderFeedItem: (i) => '[' + i.item_type + ':' + i.item_id + ']',
    renderFeedUnavailable: () => { calls.unavailable++; list.innerHTML = 'UNAVAILABLE'; },
    initMilestonePref() {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return { sandbox, list, pending, calls, loadMore };
}

const milestones = { feed: [{ item_type: 'milestone', item_id: 'm1', created_at: '2026-11-13T00:00:00Z' }] };
const hotTakes = { feed: [{ item_type: 'feed_post', post_type: 'hot_take', item_id: 'h1', created_at: '2026-11-13T00:00:00Z' }] };
const tick = () => new Promise((r) => setTimeout(r, 5));

let passed = 0;
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
};

(async () => {
  await t('a slow Milestones response does not overwrite Hot Takes', async () => {
    const { sandbox, list, pending, calls } = boot();
    sandbox.currentFilter = 'milestones';
    const a = sandbox.loadFeedItems();
    sandbox.currentFilter = 'hot-takes';
    const b = sandbox.loadFeedItems();
    pending[1].resolve(hotTakes); await b; await tick();
    assert.strictEqual(list.innerHTML, '[feed_post:h1]');
    pending[0].resolve(milestones); await a; await tick();
    assert.strictEqual(list.innerHTML, '[feed_post:h1]', 'stale response repainted the list: ' + list.innerHTML);
    assert.deepStrictEqual(calls.hero, [1], 'hero counts must only come from the current load');
    assert.strictEqual(calls.after, 1);
  });

  await t('a stale response arriving first leaves the list alone until the current one lands', async () => {
    const { sandbox, list, pending } = boot();
    sandbox.currentFilter = 'milestones';
    const a = sandbox.loadFeedItems();
    sandbox.currentFilter = 'hot-takes';
    const b = sandbox.loadFeedItems();
    pending[0].resolve(milestones); await a; await tick();
    assert.strictEqual(list.innerHTML, 'INITIAL');
    assert.strictEqual(list.getAttribute('aria-busy'), 'true', 'list must stay marked busy while the current load is out');
    pending[1].resolve(hotTakes); await b; await tick();
    assert.strictEqual(list.innerHTML, '[feed_post:h1]');
    assert.strictEqual(list.getAttribute('aria-busy'), null);
  });

  await t('a stale failure does not paint "Feed unavailable" over a good tab', async () => {
    const { sandbox, list, pending, calls } = boot();
    sandbox.currentFilter = 'milestones';
    const a = sandbox.loadFeedItems();
    sandbox.currentFilter = 'hot-takes';
    const b = sandbox.loadFeedItems();
    pending[1].resolve(hotTakes); await b;
    pending[0].reject(new Error('boom')); await a; await tick();
    assert.strictEqual(calls.unavailable, 0);
    assert.strictEqual(list.innerHTML, '[feed_post:h1]');
  });

  await t('a single load still renders, clears busy and shows the empty state when empty', async () => {
    const one = boot();
    one.sandbox.currentFilter = 'milestones';
    const a = one.sandbox.loadFeedItems();
    assert.strictEqual(one.list.getAttribute('aria-busy'), 'true');
    one.pending[0].resolve(milestones); await a;
    assert.strictEqual(one.list.innerHTML, '[milestone:m1]');
    assert.strictEqual(one.list.getAttribute('aria-busy'), null);

    const two = boot();
    two.sandbox.currentFilter = 'hot-takes';
    const b = two.sandbox.loadFeedItems();
    two.pending[0].resolve({ feed: [] }); await b;
    assert.ok(two.list.innerHTML.includes('No activity yet.'));
    assert.strictEqual(two.list.getAttribute('aria-busy'), null);
  });

  console.log(passed + ' passed');
})();
