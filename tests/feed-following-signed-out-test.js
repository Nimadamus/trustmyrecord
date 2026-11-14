/**
 * FEED_FOLLOWING_SIGNED_OUT_20261113 -- a signed-out visitor on the Following tab
 * gets a sign-in card, not the general timeline under a "Following" label.
 *
 * No network, no jsdom: loadFeedItems() is lifted out of the feed script and run
 * in a vm against stubbed collaborators.
 *
 *   node tests/feed-following-signed-out-test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'feed-ui-overrides.js'), 'utf8');
const start = file.indexOf('let _feedLoadSeq = 0;');
const tail = file.indexOf('window.__msPrefInit = true', start);
const end = file.indexOf('\n}', tail) + 2;
assert.ok(start > 0 && tail > start && end > tail, 'loadFeedItems() not found');
const src = file.slice(start, end);

function boot(opts) {
  const o = opts || {};
  const attrs = {};
  const list = {
    innerHTML: 'INITIAL',
    setAttribute: (k, v) => { attrs[k] = v; },
    removeAttribute: (k) => { delete attrs[k]; },
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
  };
  const loadMore = { style: { display: 'block' } };
  const calls = { fetched: 0 };
  const sandbox = {
    console, Date, Map, Set, Promise, setTimeout, Array, Math,
    FEED_LIMIT: 20, currentFilter: o.filter || 'following', feedOffset: 0,
    document: { getElementById: (id) => (id === 'feedList' ? list : id === 'loadMore' ? loadMore : null) },
    api: { request() {}, token: o.apiToken || null },
    localStorage: { getItem: (k) => (o.stored && k === 'trustmyrecord_token' ? 'x' : null) },
    loadFollowingPeople() {},
    takeFeedSources() {
      calls.fetched++;
      const feed = Promise.resolve({ feed: [{ item_type: 'feed_post', item_id: 'general-1', created_at: '2026-11-13T00:00:00Z' }] });
      return { feed, fetchFeedPage: () => feed, discover: null, polls: null, notif: null, notifViewer: null };
    },
    isRealPublicFeedUser: () => true,
    normalizePublicPick: (x) => x,
    buildUserMapFromFeed: () => ({}),
    attachUserRecord: (i) => i,
    getUsername: (i) => i.username,
    aggregateFeedItems: (x) => x,
    updateHeroCounts() {},
    renderFeedItem: (i) => '[' + i.item_id + ']',
    renderFeedUnavailable() {},
    initMilestonePref() {},
  };
  if (o.user) sandbox.auth = { currentUser: o.user };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return { sandbox, list, loadMore, calls };
}

let passed = 0;
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
};

(async () => {
  await t('signed out on Following: sign-in card, no feed request, no Load More', async () => {
    const env = boot();
    await env.sandbox.loadFeedItems();
    assert.strictEqual(env.calls.fetched, 0, 'the general feed must not be requested');
    assert.ok(!env.list.innerHTML.includes('general-1'));
    assert.ok(env.list.innerHTML.includes('Follow handicappers to build this tab.'));
    assert.ok(env.list.innerHTML.includes('href="/login/?next=%2Ffeed%2F"'));
    assert.ok(env.list.innerHTML.includes('href="/handicappers/"'));
    assert.strictEqual(env.loadMore.style.display, 'none');
    assert.strictEqual(env.list.getAttribute('aria-busy'), null);
  });

  await t('signed in (hydrated user) on Following: the feed loads as before', async () => {
    const env = boot({ user: { username: 'member' } });
    await env.sandbox.loadFeedItems();
    assert.strictEqual(env.calls.fetched, 1);
    assert.strictEqual(env.list.innerHTML, '[general-1]');
  });

  await t('a stored session token counts as signed in before the profile hydrates', async () => {
    const a = boot({ stored: true });
    await a.sandbox.loadFeedItems();
    assert.strictEqual(a.calls.fetched, 1);
    const b = boot({ apiToken: 'jwt' });
    await b.sandbox.loadFeedItems();
    assert.strictEqual(b.calls.fetched, 1);
  });

  await t('signed out on For You is untouched', async () => {
    const env = boot({ filter: 'all' });
    await env.sandbox.loadFeedItems();
    assert.strictEqual(env.calls.fetched, 1);
    assert.strictEqual(env.list.innerHTML, '[general-1]');
  });

  await t('the sign-in card supersedes a slower earlier tab response', async () => {
    const env = boot({ filter: 'all' });
    let release;
    const slow = new Promise((r) => { release = r; });
    env.sandbox.takeFeedSources = () => ({ feed: slow, fetchFeedPage: () => slow, discover: null, polls: null, notif: null, notifViewer: null });
    const first = env.sandbox.loadFeedItems();
    env.sandbox.currentFilter = 'following';
    await env.sandbox.loadFeedItems();
    release({ feed: [{ item_type: 'feed_post', item_id: 'late', created_at: '2026-11-13T00:00:00Z' }] });
    await first;
    assert.ok(env.list.innerHTML.includes('Follow handicappers to build this tab.'));
    assert.ok(!env.list.innerHTML.includes('late'));
  });

  console.log(passed + ' passed');
})();
