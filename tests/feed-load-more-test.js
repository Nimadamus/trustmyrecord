/**
 * FEED_LOAD_MORE_20261113 -- "Load More" adds the next page under the posts
 * already on screen; it must not replace them, repeat a post, or re-fetch the
 * unpaged side sources.
 *
 * No network, no jsdom: the functions are lifted out of the feed scripts and run
 * in a vm against stubbed collaborators.
 *
 *   node tests/feed-load-more-test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'static', 'js');
const overrides = fs.readFileSync(path.join(root, 'feed-ui-overrides.js'), 'utf8');
const v2 = fs.readFileSync(path.join(root, 'feed-v2.js'), 'utf8');

function lift(source, startMarker, tailMarker) {
  const start = source.indexOf(startMarker);
  const tail = source.indexOf(tailMarker, start);
  const end = source.indexOf('\n}', tail) + 2;
  assert.ok(start >= 0 && tail > start && end > tail, 'not found: ' + startMarker);
  return source.slice(start, end);
}
const loadSrc = lift(overrides, 'let _feedLoadSeq = 0;', 'window.__msPrefInit = true');
const sourcesSrc = lift(overrides, 'function startFeedSources(filter, offset) {', 'return sources;');
const moreSrc = lift(v2, 'function loadMorePosts() {', 'loadFeed();');

function boot() {
  const attrs = {};
  const rendered = []; // ids on the page, in order
  const replaced = []; // cards re-rendered in place
  const list = {
    get innerHTML() { return rendered.map((id) => '[' + id + ']').join(''); },
    set innerHTML(html) { rendered.length = 0; (html.match(/data-id="([^"]*)"/g) || []).forEach((m) => rendered.push(m.slice(9, -1))); list.raw = html; },
    raw: '',
    insertAdjacentHTML(pos, html) { assert.strictEqual(pos, 'beforeend'); (html.match(/data-id="([^"]*)"/g) || []).forEach((m) => rendered.push(m.slice(9, -1))); },
    querySelectorAll: () => rendered.map((id) => ({ getAttribute: () => id, set outerHTML(html) { replaced.push(html); } })),
    setAttribute: (k, v) => { attrs[k] = v; },
    removeAttribute: (k) => { delete attrs[k]; },
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
  };
  const loadMore = { style: { display: 'none' } };
  const pending = [];
  const calls = { hero: [], after: 0, unavailable: 0, loadFeed: 0 };
  const sandbox = {
    console, Date, Map, Set, Promise, setTimeout, Array, Math,
    FEED_LIMIT: 3, currentFilter: 'all', feedOffset: 0,
    document: { getElementById: (id) => (id === 'feedList' ? list : id === 'loadMore' ? loadMore : null) },
    api: { request() {} },
    loadFollowingPeople() {},
    takeFeedSources() {
      let resolve, reject;
      const feed = new Promise((res, rej) => { resolve = res; reject = rej; });
      pending.push({ offset: sandbox.feedOffset, resolve, reject });
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
    renderFeedItem: (i) => '<div class="feed-item" data-id="' + i.item_id + '"></div>',
    renderFeedUnavailable: () => { calls.unavailable++; list.innerHTML = ''; },
    initMilestonePref() {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(loadSrc, sandbox);
  return { sandbox, list, rendered, replaced, pending, calls, loadMore };
}

const post = (id, at) => ({ item_type: 'feed_post', item_id: id, created_at: at });
const page1 = { feed: [post('a', '2026-11-13T03:00:00Z'), post('b', '2026-11-13T02:00:00Z'), post('c', '2026-11-13T01:00:00Z')] };
const page2 = { feed: [post('c', '2026-11-13T01:00:00Z'), post('d', '2026-11-12T03:00:00Z'), post('e', '2026-11-12T02:00:00Z')] };
const lastPage = { feed: [post('f', '2026-11-11T03:00:00Z')] };

let passed = 0;
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
};

async function firstPage(env) {
  const p = env.sandbox.loadFeedItems();
  env.pending[0].resolve(page1); await p;
}

(async () => {
  await t('the next page is added under the first, without repeating a post', async () => {
    const env = boot();
    await firstPage(env);
    assert.deepStrictEqual(env.rendered, ['a', 'b', 'c']);
    assert.strictEqual(env.loadMore.style.display, 'block');
    env.sandbox.feedOffset = 3;
    const p = env.sandbox.loadFeedItems();
    env.pending[1].resolve(page2); await p;
    assert.deepStrictEqual(env.rendered, ['a', 'b', 'c', 'd', 'e'], 'got ' + env.rendered.join(','));
    assert.strictEqual(env.loadMore.style.display, 'block');
    assert.strictEqual(env.list.getAttribute('aria-busy'), null);
    assert.deepStrictEqual(env.calls.hero, [3], 'hero counts and rails come from the first page only');
    assert.strictEqual(env.calls.after, 1);
  });

  await t('a short last page hides the button and keeps every post', async () => {
    const env = boot();
    await firstPage(env);
    env.sandbox.feedOffset = 3;
    const p = env.sandbox.loadFeedItems();
    env.pending[1].resolve(lastPage); await p;
    assert.deepStrictEqual(env.rendered, ['a', 'b', 'c', 'f']);
    assert.strictEqual(env.loadMore.style.display, 'none');
  });

  await t('an empty later page leaves the feed alone (no "No activity yet.")', async () => {
    const env = boot();
    await firstPage(env);
    env.sandbox.feedOffset = 3;
    const p = env.sandbox.loadFeedItems();
    env.pending[1].resolve({ feed: [] }); await p;
    assert.deepStrictEqual(env.rendered, ['a', 'b', 'c']);
    assert.ok(!env.list.raw.includes('No activity yet.'));
    assert.strictEqual(env.loadMore.style.display, 'none');
  });

  await t('a failed later page keeps the posts and steps the offset back for a retry', async () => {
    const env = boot();
    await firstPage(env);
    env.sandbox.feedOffset = 3;
    const p = env.sandbox.loadFeedItems();
    env.pending[1].reject(new Error('down')); await p;
    assert.deepStrictEqual(env.rendered, ['a', 'b', 'c']);
    assert.strictEqual(env.calls.unavailable, 0);
    assert.strictEqual(env.sandbox.feedOffset, 0);
    assert.strictEqual(env.list.getAttribute('aria-busy'), null);
  });

  await t('a grouped pick card that spans two pages is updated in place, not dropped', async () => {
    const env = boot();
    // group picks by handicapper, the way the real aggregator does
    env.sandbox.aggregateFeedItems = (list) => {
      const out = []; const groups = {};
      list.forEach((i) => {
        if (!i.capper) { out.push(i); return; }
        if (!groups[i.capper]) { groups[i.capper] = { ...i, item_id: 'pick_group_' + i.capper, n: 0 }; out.push(groups[i.capper]); }
        groups[i.capper].n++;
      });
      return out;
    };
    env.sandbox.renderFeedItem = (i) => '<div class="feed-item" data-id="' + i.item_id + '">' + (i.n ? i.n + ' picks' : '') + '</div>';
    const pick = (id, capper, at) => ({ item_type: 'pick', item_id: id, capper, created_at: at });
    const p = env.sandbox.loadFeedItems();
    env.pending[0].resolve({ feed: [pick('p1', 'ken', '2026-11-13T03:00:00Z'), pick('p2', 'ken', '2026-11-13T02:00:00Z'), post('x', '2026-11-13T01:00:00Z')] }); await p;
    assert.deepStrictEqual(env.rendered, ['pick_group_ken', 'x']);
    env.sandbox.feedOffset = 3;
    const q = env.sandbox.loadFeedItems();
    env.pending[1].resolve({ feed: [pick('p3', 'ken', '2026-11-13T00:30:00Z'), pick('p4', 'sam', '2026-11-12T03:00:00Z'), post('y', '2026-11-12T02:00:00Z')] }); await q;
    assert.deepStrictEqual(env.rendered, ['pick_group_ken', 'x', 'pick_group_sam', 'y'], 'got ' + env.rendered.join(','));
    assert.strictEqual(env.replaced.length, 1, 'the grown card must be re-rendered once');
    assert.ok(env.replaced[0].includes('data-id="pick_group_ken"') && env.replaced[0].includes('3 picks'), 'got ' + env.replaced[0]);
  });

  await t('side sources are fetched for the first page only', () => {
    const requested = [];
    const sandbox = {
      Date, Promise, encodeURIComponent, FEED_LIMIT: 20,
      auth: { currentUser: { username: 'viewer' } },
      api: { request: (p) => { requested.push(p); return Promise.resolve({}); } },
      fetchDiscoverTop: () => { requested.push('discover'); return Promise.resolve({}); },
      loadHydratedActivePolls: (x) => x,
    };
    vm.createContext(sandbox);
    vm.runInContext(sourcesSrc, sandbox);
    sandbox.startFeedSources('all', 0);
    assert.strictEqual(requested.length, 4, 'first page: feed + discover + polls + notifications, got ' + requested.join(' '));
    requested.length = 0;
    const later = sandbox.startFeedSources('all', 20);
    assert.deepStrictEqual(requested, ['/feed?limit=20&offset=20&filter=all']);
    assert.strictEqual(later.discover, null);
    assert.strictEqual(later.polls, null);
    assert.strictEqual(later.notif, null);
  });

  await t('a second click while a page is loading does not skip a page', () => {
    let busy = null; let loads = 0;
    const sandbox = {
      FEED_LIMIT: 20, feedOffset: 0,
      document: { getElementById: () => ({ getAttribute: () => busy }) },
      loadFeed: () => { loads++; busy = 'true'; },
    };
    vm.createContext(sandbox);
    vm.runInContext(moreSrc, sandbox);
    sandbox.loadMorePosts();
    sandbox.loadMorePosts();
    assert.strictEqual(sandbox.feedOffset, 20);
    assert.strictEqual(loads, 1);
    busy = null;
    sandbox.loadMorePosts();
    assert.strictEqual(sandbox.feedOffset, 40);
    assert.strictEqual(loads, 2);
  });

  console.log(passed + ' passed');
})();
