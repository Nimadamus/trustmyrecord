/**
 * FEED_GROUPS_20261116 -- a member's open picks from one sitting become ONE card,
 * a grading run across several members becomes ONE results card, and every pick
 * is still on the page exactly once with its own Tail / Fade / Share.
 *
 * No network, no jsdom: the scripts run in a vm against stubbed collaborators.
 *
 *   node tests/feed-pick-groups-test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'static', 'js');
const groupsSrc = fs.readFileSync(path.join(root, 'feed-pick-groups.js'), 'utf8');
const overrides = fs.readFileSync(path.join(root, 'feed-ui-overrides.js'), 'utf8');

function lift(source, startMarker, tailMarker) {
  const start = source.indexOf(startMarker);
  const tail = source.indexOf(tailMarker, start);
  const end = source.indexOf('\n}', tail) + 2;
  assert.ok(start >= 0 && tail > start && end > tail, 'not found: ' + startMarker);
  return source.slice(start, end);
}
const loadSrc = lift(overrides, 'let _feedLoadSeq = 0;', 'window.__msPrefInit = true');

function boot(opts) {
  opts = opts || {};
  const store = {};
  const sandbox = {
    console, Date, Map, Set, Promise, setTimeout, Array, Math, JSON, Object, String, Number, isFinite, isNaN,
    URLSearchParams,
    location: { search: opts.search || '' },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    document: { readyState: 'complete', addEventListener() {}, getElementById: () => null, querySelector: () => null },
    timeAgo: () => 'just now',
    renderFeedHeader: (i) => '<div class="fi-header">' + i.username + '</div>',
    renderFeedItem: (i) => '<div class="feed-item" data-id="' + i.item_id + '">' + (i.pick_count ? i.pick_count + ' picks' : '') + (i.item_type === 'open_pick' ? '<div class="fv-pick-grid"></div>' : '') + (i.item_type === 'milestone' ? '<div class="fi-content">' + i.content + ' <a class="fi-milestone-link">View record</a></div>' : '') + '</div>',
    aggregateFeedItems: (x) => x,
    sharePost() {},
    TMRFeedOpenPicks: { _cards: {}, _handoff: (i) => (i.pick_market_type === 'h2h' ? { otherLabel: 'Other ML' } : null) },
  };
  if (opts.grouping === 'off') store.tmr_feed_grouping = 'off';
  Object.assign(sandbox, opts.extra || {});
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(groupsSrc, sandbox);
  return sandbox;
}

const LEAGUES = ['NBA', 'NBA', 'NHL', 'NCAAB', 'NBA', 'NHL', 'NBA', 'NCAAB', 'NBA', 'NBA', 'NHL', 'NHL', 'NBA', 'NCAAB', 'NBA'];
let seq = 10000;
function openPick(user, minutesAgo, league, extra) {
  const id = ++seq;
  return Object.assign({
    item_id: 'openpick:' + id, item_type: 'open_pick', post_type: 'open_pick', pick_id: id,
    username: user, display_name: user,
    created_at: new Date(Date.UTC(2026, 10, 16, 14, 0) - minutesAgo * 60000).toISOString(),
    pick_league: league || 'NBA', pick_text: 'Team ' + id + ' -3.5', pick_market_label: 'Spread',
    pick_odds: '-110', pick_units: '1', pick_market_type: 'spreads',
    pick_game_time: '2099-01-01T00:00:00Z', tails_count: 0, fades_count: 0,
  }, extra || {});
}
function session(user, n, startMin) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(openPick(user, startMin + i * 0.5, LEAGUES[i % LEAGUES.length]));
  return out;
}
const idsIn = (html) => (html.match(/data-id="([^"]*)"/g) || []).map((m) => m.slice(9, -1));

let passed = 0;
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
};

function checkSession(n) {
  const sb = boot();
  const picks = session('KenBcapper', n, 0);
  const other = { item_id: 'post_1', item_type: 'feed_post', username: 'neebish', created_at: '2026-11-16T13:00:00Z' };
  const out = sb.aggregateFeedItems(picks.concat([other]));
  if (n === 1) {
    assert.strictEqual(out.length, 2, 'one pick stays a normal card');
    assert.ok(!out.some((i) => i._group));
    return;
  }
  const groups = out.filter((i) => i._group === 'open_picks');
  assert.strictEqual(groups.length, 1, n + ' picks -> exactly one card');
  assert.strictEqual(out.length, 2, 'the group plus the other post');
  const g = groups[0];
  assert.strictEqual(g.pick_count, n);
  const html = sb.renderFeedItem(g);
  assert.ok(/KenBcapper posted \d+ (\w+ )?picks/.test(html), 'headline');
  const rowIds = idsIn(html).slice(1);
  assert.deepStrictEqual(rowIds.slice().sort(), picks.map((p) => p.item_id).sort(), 'every pick is a row, once');
  assert.strictEqual((html.match(/data-fop-react="tail"/g) || []).length, n, 'a Tail on every pick');
  assert.strictEqual((html.match(/data-fop-react="fade"/g) || []).length, n, 'a Fade on every pick');
  assert.strictEqual((html.match(/sharePost\(/g) || []).length, n, 'a Share on every pick');
  // FEED_BATCH_20261117: every batch starts collapsed and opens to ALL picks
  assert.ok(html.includes('View All ' + n + ' Picks'), 'expand button');
  assert.ok(/class="fpg-rest fpg-batch-list" hidden/.test(html), 'picks start collapsed');
  assert.ok(/class="fpg-peek"/.test(html), 'collapsed peek line');
  assert.strictEqual(/fpg-batch--scroll/.test(html), n > 6, 'bounded scroll only for a big batch');
  picks.forEach((p) => assert.ok(sb.TMRFeedOpenPicks._cards[p.item_id], 'Tail/Fade handler can find ' + p.item_id));
  return html;
}

(async () => {
  await t('1 pick: unchanged single card', () => checkSession(1));
  await t('5 picks: one card, 5 actionable rows', () => checkSession(5));
  await t('15 picks: one card with sport breakdown 8 NBA / 4 NHL / 3 NCAAB', () => {
    const html = checkSession(15);
    assert.ok(html.includes('<b>8</b> NBA') && html.includes('<b>4</b> NHL') && html.includes('<b>3</b> NCAAB'), 'breakdown');
    assert.ok(html.indexOf('NBA</span>') < html.indexOf('NHL</span>'), 'largest sport first');
  });
  await t('30 picks: one card, 30 actionable rows', () => checkSession(30));
  await t('3 picks: one collapsed card', () => checkSession(3));
  await t('40 picks: one card, 40 actionable rows, bounded scroll', () => checkSession(40));
  await t('FEED_BATCH: 5 NBA picks read "posted 5 NBA picks", opponent and units shown', () => {
    const sb = boot();
    const picks = [0, 0.1, 0.2, 7, 7.1].map((m, i) => openPick('americanwiseguy', m, 'NBA', i === 0
      ? { pick_text: 'Toronto Raptors ML', pick_selection: 'Toronto Raptors', pick_away_team: 'New York Knicks', pick_home_team: 'Toronto Raptors', pick_units: '5' }
      : i === 1 ? { pick_text: 'Detroit Pistons ML', pick_selection: 'Detroit Pistons', pick_away_team: 'Detroit Pistons', pick_home_team: 'San Antonio Spurs', pick_units: '5' }
      : { pick_text: 'Over 220.5', pick_away_team: 'A Team', pick_home_team: 'B Team', pick_units: '5' }));
    const out = sb.aggregateFeedItems(picks);
    assert.strictEqual(out.length, 1);
    const html = sb.renderFeedItem(out[0]);
    assert.ok(html.includes('americanwiseguy posted 5 NBA picks'), 'headline');
    assert.ok(html.includes('vs New York Knicks'), 'home pick shows opponent');
    assert.ok(html.includes('@ San Antonio Spurs'), 'away pick shows opponent');
    assert.ok(html.includes('A Team @ B Team'), 'total keeps the matchup');
    assert.ok(html.includes('25u total'), 'units total');
    assert.ok(html.includes('+1 more'), 'peek counts the rest');
  });
  await t('FEED_BATCH: separate submissions 45 min apart stay separate cards', () => {
    const sb = boot();
    const a = session('KenBcapper', 3, 0);
    const b2 = session('KenBcapper', 3, 46);
    const out = sb.aggregateFeedItems(a.concat(b2));
    assert.strictEqual(out.filter((i) => i._group).length, 2);
    assert.ok(out.every((i) => i._members.length === 3));
  });

  await t('several members posting at once each get their own card, nothing lost', () => {
    const sb = boot();
    const ken = session('KenBcapper', 12, 0);
    const jo = session('johann', 1, 1);
    const mc = session('mcflysalmanac', 2, 2);
    const mixed = [];
    for (let i = 0; i < 12; i++) { mixed.push(ken[i]); if (i === 3) mixed.push(jo[0]); if (i === 5 || i === 7) mixed.push(mc[i === 5 ? 0 : 1]); }
    const out = sb.aggregateFeedItems(mixed);
    assert.strictEqual(out.length, 3, 'Ken group + mcfly group + johann single');
    const all = [];
    out.forEach((i) => { const ids = idsIn(sb.renderFeedItem(i)); all.push(...(i._group ? ids.slice(1) : ids)); });
    assert.deepStrictEqual(all.slice().sort(), mixed.map((p) => p.item_id).sort(), 'no duplicate, no missing pick');
  });

  await t('a long pause starts a new sitting', () => {
    const sb = boot();
    const early = session('KenBcapper', 4, 300);
    const late = session('KenBcapper', 4, 0);
    const out = sb.aggregateFeedItems(late.concat(early));
    assert.strictEqual(out.filter((i) => i._group).length, 2);
  });

  await t('a grading run across members becomes one results card; full cards kept under View all', () => {
    const sb = boot();
    const at = '2026-11-16T04:35:00Z';
    const res = ['fade_my_picks', 'mcflysalmanac', 'BetLegend', 'BlackwellsPicks', 'SweatTheSpread'].map((u, k) => ({
      item_id: 'pick_group_' + u, item_type: 'pick', post_type: 'pick', status: 'graded', username: u, display_name: u,
      created_at: at, graded_at: at, pick_count: 2, wins_count: 1, losses_count: 1, batch_net_units: k - 2,
    }));
    const lone = { item_id: 'pick_group_late', item_type: 'pick', post_type: 'pick', status: 'graded', username: 'late', created_at: '2026-11-16T09:00:00Z', graded_at: '2026-11-16T09:00:00Z', pick_count: 1 };
    const out = sb.aggregateFeedItems(res.concat([lone]));
    const g = out.find((i) => i._group === 'results');
    assert.ok(g, 'results group');
    assert.strictEqual(out.length, 2, 'roll-up + the lone later update');
    const html = sb.renderFeedItem(g);
    assert.ok(html.includes('Results are in') && html.includes('5 handicappers'));
    res.forEach((r) => assert.ok(html.includes('data-id="' + r.item_id + '"'), 'full card for ' + r.username));
    assert.ok(html.includes('View all 5 record updates'));
  });

  await t('two graded members roll up; one stays a normal card', () => {
    const sb = boot();
    const at = '2026-11-16T04:35:00Z';
    const res = ['a', 'b'].map((u) => ({ item_id: 'pick_group_' + u, item_type: 'pick', status: 'graded', username: u, created_at: at }));
    assert.strictEqual(sb.aggregateFeedItems(res).filter((i) => i._group).length, 1);
    assert.strictEqual(sb.aggregateFeedItems(res.slice(0, 1)).filter((i) => i._group).length, 0);
  });

  await t('"Every update" mode shows every item as before', () => {
    const sb = boot({ grouping: 'off' });
    const picks = session('KenBcapper', 15, 0);
    const out = sb.aggregateFeedItems(picks);
    assert.strictEqual(out.length, 15);
    assert.ok(!out.some((i) => i._group));
  });

  await t('grouping never changes the records it is given', () => {
    const sb = boot();
    const picks = session('KenBcapper', 6, 0);
    const before = JSON.stringify(picks);
    sb.aggregateFeedItems(picks);
    assert.strictEqual(JSON.stringify(picks), before);
  });

  const ms = (id, user, type, at, content) => ({ item_id: 'milestone:' + id, item_type: 'milestone', post_type: type, username: user, display_name: user, created_at: at, content: content || user + ' did a thing.', likes_count: 0 });

  await t('milestones from one grading run become one card, each with its own Congrats', () => {
    const sb = boot();
    const at = '2026-11-15T21:30:00Z';
    const list = [ms(1, 'KenBcapper', 'pick_count', at), ms(2, 'SweatTheSpread', 'win_streak', at), ms(3, 'bigdaddybruce24', 'pick_count', '2026-11-15T21:20:00Z'), ms(4, 'mcfly', 'pick_count', '2026-11-15T21:15:00Z'), ms(5, 'late', 'first_win', '2026-11-16T09:00:00Z')];
    const out = sb.aggregateFeedItems(list);
    const g = out.find((i) => i._group === 'milestones');
    assert.ok(g && g._members.length === 4, 'four grouped');
    assert.strictEqual(out.length, 2, 'group + the lone later milestone');
    const html = sb.renderFeedItem(g);
    assert.strictEqual((html.match(/toggleCongrats\(/g) || []).length, 4, 'a Congrats per milestone');
    assert.ok(html.includes('View all 4 milestones'));
  });

  await t('one member\'s milestones across a day become one card; other members stay alone', () => {
    const sb = boot();
    const list = [ms(1, 'KenBcapper', 'pick_count', '2026-11-15T21:30:00Z'), ms(2, 'KenBcapper', 'win_streak', '2026-11-15T12:30:00Z'), ms(3, 'KenBcapper', 'pick_count', '2026-11-15T02:00:00Z'), ms(4, 'Khaloy', 'first_win', '2026-11-14T02:55:00Z')];
    const out = sb.aggregateFeedItems(list);
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out.find((i) => i._group === 'milestones')._members.length, 3);
  });

  await t('a first-pick milestone rides on the pick card instead of being a second card', () => {
    const sb = boot();
    const p = openPick('johann', 0, 'NBA', { created_at: '2026-11-16T14:05:23.704Z' });
    const m = ms(1777, 'johann', 'first_pick', '2026-11-16T14:05:23.758Z', 'johann just made their first official pick. Every record starts somewhere.');
    const out = sb.aggregateFeedItems([p, m]);
    assert.strictEqual(out.length, 1, 'one card');
    assert.ok(out[0]._member_ids.includes('milestone:1777'), 'the milestone is a member, for Load More folding');
    const html = sb.renderFeedItem(out[0]);
    assert.ok(html.includes('First official pick') && html.includes("toggleCongrats(&quot;milestone:1777&quot;"), 'ribbon with Congrats');
  });

  await t('a single milestone card does not repeat its title in the line under it', () => {
    const sb = boot();
    sb.MILESTONE_META = { first_pick: { label: 'made their first official pick' }, pick_count: { label: 'hit a pick milestone' } };
    const first = sb.renderFeedItem(ms(9, 'johann', 'first_pick', '2026-11-16T14:05:00Z', 'johann just made their first official pick. Every record starts somewhere.'));
    assert.ok(/<div class="fi-content"><a class="fi-milestone-link">/.test(first), 'echo removed, link kept: ' + first);
    const count = sb.renderFeedItem(ms(10, 'KenBcapper', 'pick_count', '2026-11-16T14:05:00Z', 'KenBcapper has reached 250 graded picks.'));
    assert.ok(count.includes('<div class="fi-content">Reached 250 graded picks. <a'), count);
  });

  await t('a first-pick milestone finds its sitting even when later picks pushed the card time on', () => {
    const sb = boot();
    const picks = session('newbie', 6, 0); // newest first, 30 s apart; oldest is the first pick
    picks.push(openPick('newbie', 20)); // first pick, 20 min before the newest (FEED_BATCH: 30 min gap)
    const m = ms(55, 'newbie', 'first_pick', picks[picks.length - 1].created_at, 'newbie just made their first official pick.');
    const out = sb.aggregateFeedItems(picks.concat([m]));
    assert.strictEqual(out.length, 1, 'one card, got ' + out.map((i) => i.item_id).join(','));
    assert.ok(out[0]._first_pick_ms && out[0]._group === 'open_picks');
  });

  await t('"new members joined" renders as a compact strip', () => {
    const sb = boot();
    const html = sb.renderFeedItem({ item_id: 'joined_summary:20261116', item_type: 'milestone', post_type: 'joined_summary', content: '7 new members joined TrustMyRecord.', activity_count: 7, created_at: '2026-11-16T15:12:42Z' });
    assert.ok(html.includes('fpg-joined') && html.includes('7 new members joined TrustMyRecord'));
  });

  // ---- Load More, with the real loadFeedItems from feed-ui-overrides.js ----
  function bootLoad() {
    const sb = boot();
    const attrs = {};
    const nodes = []; // { id, sig, html }
    const parse = (html) => {
      // top-level cards only: split on the outer feed-item opening tags
      const out = [];
      const re = /<div class="feed-item[^"]*" data-id="([^"]*)"(?: data-type="[^"]*")?(?: data-group-sig="([^"]*)")?/g;
      let m; let depthIds = new Set();
      while ((m = re.exec(html))) out.push({ id: m[1], sig: m[2] || null });
      return out;
    };
    const list = {
      set innerHTML(html) { nodes.length = 0; topLevel(html).forEach((n) => nodes.push(n)); },
      get innerHTML() { return ''; },
      insertAdjacentHTML(pos, html) { topLevel(html).forEach((n) => nodes.push(n)); },
      querySelectorAll: () => nodes.map((n) => ({
        parentNode: list,
        getAttribute: (k) => (k === 'data-id' ? n.id : k === 'data-group-sig' ? n.sig : null),
        remove() { const i = nodes.indexOf(n); if (i >= 0) nodes.splice(i, 1); },
        set outerHTML(html) { const r = topLevel(html)[0]; n.id = r.id; n.sig = r.sig; n.replaced = (n.replaced || 0) + 1; },
      })),
      setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; }, getAttribute: (k) => (k in attrs ? attrs[k] : null),
    };
    // A rendered chunk is a list of top-level cards; a group card's own rows and
    // nested cards are inside it, so only the first id of each card counts.
    function topLevel(html) {
      const parts = html.split(/(?=<div class="feed-item)/).filter(Boolean);
      const out = []; let skipUntil = -1; let pos = 0;
      // group cards contain nested feed-items (results); collapse them by tracking groups
      parts.forEach((p) => {
        const m = /^<div class="feed-item([^"]*)" data-id="([^"]*)"(?: data-type="[^"]*")?(?: data-group-sig="([^"]*)")?/.exec(p);
        if (!m) return;
        if (out.length && out[out.length - 1].group && out[out.length - 1].nested > 0) { out[out.length - 1].nested--; return; }
        const entry = { id: m[2], sig: m[3] || null, group: /fpg-card/.test(m[1]), nested: 0 };
        if (entry.group) entry.nested = (p.match(/data-type="pick"/g) || []).length; // unused for open groups
        out.push(entry);
      });
      return out;
    }
    const loadMore = { style: { display: 'none' } };
    const pending = [];
    Object.assign(sb, {
      FEED_LIMIT: 20, currentFilter: 'all', feedOffset: 0,
      api: { request() {} },
      loadFollowingPeople() {},
      takeFeedSources() {
        let resolve; const feed = new Promise((res) => { resolve = res; });
        pending.push({ resolve });
        return { feed, fetchFeedPage: () => feed, discover: Promise.resolve(null), polls: Promise.resolve(null), notif: null, notifViewer: null };
      },
      isRealPublicFeedUser: () => true, normalizePublicPick: (x) => x, buildUserMapFromFeed: () => ({}), attachUserRecord: (i) => i,
      getUsername: (i) => i.username, updateHeroCounts() {}, renderFeedUnavailable() {}, initMilestonePref() {},
    });
    sb.document = { getElementById: (id) => (id === 'feedList' ? list : id === 'loadMore' ? loadMore : null) };
    vm.runInContext(loadSrc, sb);
    return { sb, nodes, pending, loadMore };
  }

  await t('Load More: a sitting split across two pages folds into one card, no duplicates', async () => {
    const env = bootLoad();
    const ken = session('KenBcapper', 25, 0); // newest first
    const page1 = ken.slice(0, 19).concat([openPick('mcflysalmanac', 400)]);
    const page2 = ken.slice(19).concat([openPick('johann', 900)]);
    let p = env.sb.loadFeedItems(); env.pending[0].resolve({ feed: page1 }); await p;
    assert.deepStrictEqual(env.nodes.map((n) => n.id), ['opgroup:KenBcapper:' + ken[0].pick_id, page1[19].item_id]);
    assert.strictEqual(env.loadMore.style.display, 'block', 'a full API page keeps Load More even with 2 cards');
    env.sb.feedOffset = 20;
    p = env.sb.loadFeedItems(); env.pending[1].resolve({ feed: page2 }); await p;
    const ids = env.nodes.map((n) => n.id);
    assert.deepStrictEqual(ids, ['opgroup:KenBcapper:' + ken[0].pick_id, page1[19].item_id, page2[6].item_id], 'got ' + ids.join(','));
    assert.strictEqual(env.nodes[0].replaced, 1, 'the Ken card is re-rendered with the 6 older picks');
  });

  await t('Load More: a single card on page 1 that becomes a group is replaced, not doubled', async () => {
    const env = bootLoad();
    const fill = []; for (let i = 0; i < 19; i++) fill.push({ item_id: 'post_' + i, item_type: 'feed_post', username: 'u' + i, created_at: new Date(Date.UTC(2026, 10, 16, 14, 0) - i * 60000).toISOString() });
    const ken = session('KenBcapper', 3, 100);
    let p = env.sb.loadFeedItems(); env.pending[0].resolve({ feed: fill.concat([ken[0]]) }); await p;
    assert.ok(env.nodes.some((n) => n.id === ken[0].item_id));
    env.sb.feedOffset = 20;
    p = env.sb.loadFeedItems(); env.pending[1].resolve({ feed: ken.slice(1) }); await p;
    const ids = env.nodes.map((n) => n.id);
    assert.ok(!ids.includes(ken[0].item_id), 'the lone card is folded into the group');
    assert.strictEqual(ids.filter((id) => id.startsWith('opgroup:')).length, 1);
    assert.strictEqual(ids.length, 20);
    assert.strictEqual(ids[19], 'opgroup:KenBcapper:' + ken[0].pick_id, 'the group sits where its newest pick was');
  });

  await t('Congrats works for a signed-in member whose profile is still loading', async () => {
    const calls = []; let baseHit = 0;
    const sb = boot({ extra: {
      toggleCongrats: () => { baseHit++; },
      auth: { currentUser: null },
      api: { token: 'tok', request: (u, o) => { calls.push(o.method + ' ' + u); return Promise.resolve({ congrats_count: 3 }); } },
    } });
    const cls = new Set(); const span = { textContent: '2' };
    const btn = { disabled: false, classList: { contains: (c) => cls.has(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) }, querySelector: () => span };
    await sb.toggleCongrats('milestone:42', btn);
    assert.deepStrictEqual(calls, ['POST /milestones/42/congrats']);
    assert.strictEqual(baseHit, 0, 'no login box');
    assert.ok(cls.has('is-congratsed') && span.textContent === '3' && btn.disabled === false);
    sb.auth.currentUser = { id: 1 };
    sb.toggleCongrats('milestone:42', btn);
    assert.strictEqual(baseHit, 1, 'loaded profile uses the normal handler');
  });

  await t('grouped open picks run by game start, soonest first', async () => {
    const sb = boot();
    const picks = session('mcfly', 4, 0);
    picks[0].pick_game_time = '2099-01-08T00:00:00Z';
    picks[1].pick_game_time = '2099-01-02T00:00:00Z';
    picks[2].pick_game_time = '2099-01-05T00:00:00Z';
    picks[3].pick_game_time = '2099-01-01T00:00:00Z';
    const g = sb.aggregateFeedItems(picks).filter((i) => i._group === 'open_picks')[0];
    const rows = idsIn(sb.renderFeedItem(g)).filter((id) => id.startsWith('openpick:'));
    assert.deepStrictEqual(rows, [picks[3], picks[1], picks[2], picks[0]].map((p) => p.item_id));
  });

  await t('a shared open pick that left the feed opens its pick page', async () => {
    for (const [onPage, expect] of [[false, '/pick/?id=555'], [true, null]]) {
      let replaced = null;
      const sb = boot({ search: '?post=openpick:555', extra: { loadFeed: async () => 'ok' } });
      sb.location.replace = (u) => { replaced = u; };
      sb.document.querySelector = (q) => (q === '#feedList .feed-item' || (onPage && q.includes('openpick:555')) ? {} : null);
      await sb.loadFeed(); await sb.loadFeed();
      assert.strictEqual(replaced, expect);
    }
  });

  await t('same member 5- and 7-pick streaks in one card show only the 7', () => {
    const sb = boot();
    const at = '2026-11-15T21:30:00Z';
    const list = [ms(11, 'KenBcapper', 'win_streak', at, 'KenBcapper is on a 7-pick winning streak.'), ms(12, 'KenBcapper', 'win_streak', at, 'KenBcapper is on a 5-pick winning streak.'), ms(13, 'KenBcapper', 'pick_count', at)];
    const out = sb.aggregateFeedItems(list);
    const g = out.find((i) => i._group === 'milestones');
    assert.strictEqual(g._members.length, 2);
    assert.ok(!g._members.some((m) => m.item_id === 'milestone:12'), 'the 5 streak folds into the 7');
    assert.ok(g._member_ids.includes('milestone:12'), 'still counted as on the page');
    assert.strictEqual(out.length, 1);
    const two = sb.aggregateFeedItems([ms(14, 'Ken', 'win_streak', at, 'Ken is on a 7-pick winning streak.'), ms(15, 'Ken', 'win_streak', at, 'Ken is on a 5-pick winning streak.')]);
    assert.deepStrictEqual(two.map((i) => i.item_id), ['milestone:14'], 'only the longest stands alone');
  });

  await t('a mixed-sport sitting is labelled Multi in the header', () => {
    const sb = boot();
    sb.renderFeedHeader = (i) => '<div class="fi-header">' + (i.sport || i.pick_league) + '</div>';
    const mixed = sb.aggregateFeedItems([openPick('Ken', 1, 'NCAAB'), openPick('Ken', 2, 'NBA'), openPick('Ken', 3, 'NCAAF')]);
    assert.ok(sb.renderFeedItem(mixed[0]).includes('<div class="fi-header">Multi</div>'));
    const same = sb.aggregateFeedItems([openPick('Ann', 1, 'NBA'), openPick('Ann', 2, 'NBA')]);
    assert.ok(!sb.renderFeedItem(same[0]).includes('>Multi<'));
  });

  await t('Load More: an item repeated by a shifted page is not listed twice', async () => {
    const env = bootLoad();
    const fill = []; for (let i = 0; i < 18; i++) fill.push({ item_id: 'post_' + i, item_type: 'feed_post', username: 'u' + i, created_at: new Date(Date.UTC(2026, 10, 16, 14, 0) - i * 60000).toISOString() });
    const ken = session('KenBcapper', 4, 100);
    let p = env.sb.loadFeedItems(); env.pending[0].resolve({ feed: fill.concat([ken[0], ken[1]]) }); await p;
    env.sb.feedOffset = 20;
    // a new post arrived on top, so page 2 starts with page 1's last item again
    p = env.sb.loadFeedItems(); env.pending[1].resolve({ feed: [ken[1]].concat(ken.slice(2)) }); await p;
    const raw = vm.runInContext('_feedRawItems', env.sb).map((i) => i.item_id);
    assert.strictEqual(raw.length, new Set(raw).size, 'the repeated item is kept once');
    assert.strictEqual(raw.filter((id) => String(id).startsWith('openpick:')).length, 4, 'all four picks present');
    const ids = env.nodes.map((n) => n.id);
    assert.strictEqual(ids.filter((id) => id.startsWith('opgroup:')).length, 1, 'one card for the sitting');
  });

  await t('welcome (joined) cards keep their own card and comment thread', () => {
    const sb = boot();
    const at = '2026-11-15T21:30:00Z';
    const out = sb.aggregateFeedItems([ms(31, 'newbie1', 'joined', at), ms(32, 'newbie2', 'joined', at), ms(33, 'Ken', 'pick_count', at), ms(34, 'Ann', 'pick_count', at)]);
    const g = out.find((i) => i._group === 'milestones');
    assert.ok(g && g._members.every((m) => m.post_type !== 'joined'));
    assert.strictEqual(out.filter((i) => i.post_type === 'joined').length, 2);
  });

  console.log(passed + ' passed');
})();
