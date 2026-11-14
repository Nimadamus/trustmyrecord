// NOTIFY_LINKS_20261114: a bell row opens the thing it is about. Feed alerts
// open the post, each challenge family opens its own page, and the page
// fallback agrees with the shared engine.
//   node tests/notification-destinations-test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = path.join(__dirname, '..');

const src = fs.readFileSync(path.join(root, 'static/js/notifications.js'), 'utf8');
const start = src.indexOf('function getNotificationDestination(notification) {');
const end = src.indexOf('\nasync function handleNotifClick', start);
assert.ok(start > 0 && end > start, 'engine destination function found');
const ctx = { window: { auth: { currentUser: { username: 'me' } } }, auth: { currentUser: { username: 'me' } }, encodeURIComponent };
vm.createContext(ctx);
vm.runInContext(src.slice(start, end) + '\nthis.dest = getNotificationDestination;', ctx);
const dest = ctx.dest;

const html = fs.readFileSync(path.join(root, 'notifications/index.html'), 'utf8');
const fs0 = html.indexOf('function destination(nn) {');
const fe0 = html.indexOf('/* Human label for the destination chip', fs0);
assert.ok(fs0 > 0 && fe0 > fs0, 'page fallback found');
const pctx = { window: {}, encodeURIComponent };
vm.createContext(pctx);
vm.runInContext(html.slice(fs0, fe0) + '\nthis.destination = destination;', pctx);
const fallback = (raw) => pctx.destination({ type: String(raw.type || '').toLowerCase(), resourceType: String(raw.resource_type || '').toLowerCase(), username: raw.username || null, raw });

const cases = [
  [{ type: 'like', resource_type: 'feed_post', resource_id: 42 }, '/feed/?post=42'],
  [{ type: 'comment', resource_type: 'feed_post', resource_id: 42 }, '/feed/?post=42'],
  [{ type: 'mention', resource_type: 'feed_post', resource_id: 7 }, '/feed/?post=7'],
  [{ type: 'quote', resource_type: 'feed_post', resource_id: 7 }, '/feed/?post=7'],
  [{ type: 'pick_tail', resource_type: 'open_pick', resource_id: 88, username: 'sam' }, '/feed/?post=openpick%3A88'],
  [{ type: 'pick_fade', resource_type: 'open_pick', resource_id: 88 }, '/feed/?post=openpick%3A88'],
  [{ type: 'like' }, '/feed/'],
  [{ type: 'mention' }, '/feed/'],
  [{ type: 'quote' }, '/feed/'],
  [{ type: 'like', related_pick_id: 9 }, '/sportsbook/?pick=9#mypicks'],
  [{ type: 'comment', related_pick_id: 9 }, '/sportsbook/?pick=9#mypicks'],
  [{ type: 'tmr_challenge_received', resource_type: 'tmr_challenge', resource_id: '31' }, '/tmr-challenges/?id=31'],
  [{ type: 'tmr_challenge_settled', resource_type: 'tmr_challenge', resource_id: '31' }, '/tmr-challenges/?id=31'],
  [{ type: 'tmr_challenge_accepted' }, '/tmr-challenges/'],
  [{ type: 'challenge_received' }, '/challenges/'],
  [{ type: 'challenge_accepted', username: 'sam' }, '/challenges/'],
  [{ type: 'challenge_declined' }, '/challenges/'],
  [{ type: 'gaming_challenge' }, '/arena/'],
  [{ type: 'gaming_challenge_accepted', username: 'sam' }, '/arena/'],
  [{ type: 'gaming_match_logged' }, '/arena/'],
  [{ type: 'arena_result_reported' }, '/arena/'],
  [{ type: 'pick_won', related_pick_id: 5 }, '/sportsbook/?pick=5#mypicks'],
  [{ type: 'forum_thread_reply', related_thread_id: 3, related_post_id: 8 }, '/forum/?thread=3#post-8'],
  [{ type: 'follow', username: 'sam' }, '/profile/?user=sam'],
  [{ type: 'message', username: 'sam' }, '/messages/?to=sam'],
];
let n = 0;
for (const [row, want] of cases) {
  assert.strictEqual(dest(row), want, 'engine: ' + JSON.stringify(row));
  assert.strictEqual(fallback(row), want, 'page fallback: ' + JSON.stringify(row));
  n++;
}
console.log(n + ' destinations agree in the bell and on the page');
