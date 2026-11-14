// FEED_OPEN_PICKS_20261114: the public open pick feed card and Tail / Fade.
// Runs the real script in a bare sandbox (no browser).
//   node tests/feed-open-picks-test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'static/js/feed-open-picks.js'), 'utf8');

function boot() {
  const baseCalls = [];
  const win = {
    api: { token: null, request: async () => ({}) },
    auth: { currentUser: null },
    renderFeedHeader: (item) => '<div class="fi-header" data-kind="' + item.item_type + '">' + item.username + '</div>',
    fvShareBtn: (id) => '<button class="fi-action" data-share="' + id + '">Share</button>',
    renderFeedItem: (item) => { baseCalls.push(item); return '<div class="feed-item base"></div>'; },
  };
  const ctx = { window: win, document: { addEventListener() {} }, location: { pathname: '/feed/', search: '' }, localStorage: { setItem() {} }, Date, Object, Array, String, Number, Math, JSON, isFinite, isNaN, encodeURIComponent };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { win, baseCalls };
}
const soon = new Date(Date.now() + 5 * 3600e3).toISOString();
const past = new Date(Date.now() - 3600e3).toISOString();
const pick = (over) => Object.assign({
  item_type: 'open_pick', item_id: 'openpick:5', pick_id: 5, username: 'ken', pick_sport_key: 'basketball_nba',
  pick_selection: 'Over', pick_market_type: 'totals', pick_line: 224.5, pick_odds: -108, pick_units: 2,
  pick_home_team: 'Boston Celtics', pick_away_team: 'Los Angeles Lakers', pick_game_time: soon,
  pick_text: 'Over 224.5', pick_market_label: 'Total', pick_period: 'full_game',
  tails_count: 3, fades_count: 1, viewer_reaction: null, pick_started: false, is_own_pick: false,
}, over || {});

let n = 0;
const ok = (name) => { n++; console.log('  ok   ' + name); };

{
  const { win, baseCalls } = boot();
  const other = win.renderFeedItem({ item_type: 'feed_post', post_type: 'text' });
  assert.strictEqual(other, '<div class="feed-item base"></div>');
  assert.strictEqual(baseCalls.length, 1);
  const html = win.renderFeedItem(pick());
  assert.strictEqual(baseCalls.length, 1, 'an open pick does not fall through to the text post renderer');
  assert.ok(html.includes('data-type="open_pick"') && html.includes('data-fop-pick="5"'));
  assert.ok(html.includes('data-kind="pick"'), 'the header is the feed header, labelled as a pick');
  ok('only open_pick items are taken over; every other card passes through');
}
{
  const { win } = boot();
  const html = win.TMRFeedOpenPicks.render(pick());
  assert.ok(html.includes('Over 224.5') && html.includes('Los Angeles Lakers @ Boston Celtics'));
  assert.ok(html.includes('>Total<') && html.includes('-108') && html.includes('2u') && html.includes('OPEN'));
  assert.ok(/data-fop-react="tail" aria-pressed="false">.*Tail <span>3<\/span>/.test(html));
  assert.ok(/data-fop-react="fade" aria-pressed="false">.*Fade <span>1<\/span>/.test(html));
  assert.ok(html.includes('Tail and Fade are reactions. They do not add a pick to your record.'));
  assert.ok(html.includes('data-fop-slip="same"') && html.includes('Take Under 224.5'));
  ok('card shows the pick, the game, the market, the price and both counts');
}
{
  const { win } = boot();
  const mine = win.TMRFeedOpenPicks.render(pick({ viewer_reaction: 'fade' }));
  assert.ok(/class="fi-action fop-react fop-fade is-on" data-fop-react="fade" aria-pressed="true"/.test(mine));
  const started = win.TMRFeedOpenPicks.render(pick({ pick_game_time: past }));
  assert.strictEqual((started.match(/data-fop-react="[a-z]+" aria-pressed="false" disabled/g) || []).length, 2);
  assert.ok(started.includes('IN PLAY') && started.includes('The game has started. Reactions are closed.'));
  assert.ok(!started.includes('data-fop-slip'));
  const own = win.TMRFeedOpenPicks.render(pick({ is_own_pick: true }));
  assert.strictEqual((own.match(/ disabled>/g) || []).length, 2);
  assert.ok(!own.includes('data-fop-slip') && own.includes('Your pick is public.'));
  ok('own reaction is marked; started games and own picks cannot be reacted to');
}
{
  const { win } = boot();
  const h = win.TMRFeedOpenPicks._handoff;
  const t = h(pick());
  assert.deepStrictEqual(JSON.parse(JSON.stringify(t.same)), { market: 'over', side: 'Over', line: 224.5, sport: 'NBA', home_team_name: 'Boston Celtics', away_team_name: 'Los Angeles Lakers', source: 'feed' });
  assert.strictEqual(t.other.side, 'Under');
  const ml = h(pick({ pick_market_type: 'h2h', pick_selection: 'Boston Celtics', pick_line: null }));
  assert.strictEqual(ml.same.pick_team, 'Boston Celtics');
  assert.strictEqual(ml.other.pick_team, 'Los Angeles Lakers');
  assert.strictEqual(ml.otherLabel, 'Los Angeles Lakers ML');
  // no formal handoff where the opposite side is not a plain two way full game market
  assert.strictEqual(h(pick({ pick_market_type: 'spreads', pick_selection: 'Boston Celtics', pick_line: -3.5 })), null);
  assert.strictEqual(h(pick({ pick_market_type: 'nba_points', pick_selection: 'Jayson Tatum Over', pick_line: 27.5 })), null);
  assert.strictEqual(h(pick({ pick_market_type: 'team_totals', pick_selection: 'Boston Celtics Over' })), null);
  assert.strictEqual(h(pick({ pick_market_type: 'h2h', pick_selection: 'Draw' })), null);
  assert.strictEqual(h(pick({ pick_period: 'first_half' })), null);
  assert.strictEqual(h(pick({ pick_sport_key: 'soccer_epl' })), null);
  assert.strictEqual(h(pick({ pick_game_time: past })), null);
  assert.strictEqual(h(pick({ is_own_pick: true })), null);
  ok('slip handoff only for a full game moneyline or total; everything else is reactions only');
}
{
  const { win } = boot();
  const html = win.TMRFeedOpenPicks.render(pick({ pick_text: '<img src=x onerror=1>', pick_home_team: '"><script>', username: 'a' }));
  assert.ok(!html.includes('<img src=x') && !html.includes('"><script>'));
  ok('pick text and team names are escaped');
}
{
  const feed = fs.readFileSync(path.join(root, 'feed/index.html'), 'utf8');
  assert.ok(feed.indexOf('static/js/feed-social.js') < feed.indexOf('static/js/feed-open-picks.js'));
  assert.strictEqual((feed.match(/feed-open-picks\.js/g) || []).length, 1);
  assert.strictEqual((feed.match(/feed-open-picks\.css/g) || []).length, 1);
  const ov = fs.readFileSync(path.join(root, 'static/js/feed-ui-overrides.js'), 'utf8');
  assert.ok(ov.includes("i.item_type === 'open_pick'"), 'the Picks tab keeps public open picks');
  assert.ok(!/createPick|\/picks'/.test(src), 'a reaction never submits a pick');
  ok('feed page loads the card after feed-social; Picks tab keeps it; no pick is submitted here');
}
{
  const { win } = boot();
  const none = win.TMRFeedOpenPicks.render(pick());
  assert.ok(!none.includes('fop-verified'));
  const some = win.TMRFeedOpenPicks.render(pick({ verified_tails_count: 2, verified_fades_count: 1 }));
  assert.ok(some.includes('2 verified picks with it') && some.includes('1 verified pick against it'));
  assert.ok(src.includes("sessionStorage.setItem('tmr_pick_source'"), 'the slip handoff remembers the card it came from');
  const vis = fs.readFileSync(path.join(root, 'static/js/tmr-pick-visibility.js'), 'utf8');
  assert.ok(vis.includes("sessionStorage.removeItem('tmr_pick_source');"), 'the hint is used once');
  assert.ok(vis.includes('source_pick_id: src.source_pick_id, source_kind: src.source_kind'));
  assert.ok(vis.includes('30 * 60 * 1000'), 'and it expires');
  ok('verified picks made from the card are counted; the source hint is sent once and expires');
}
console.log(n + ' passed');
