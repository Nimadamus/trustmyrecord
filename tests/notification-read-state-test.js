// The sportsbook page used to declare its own markAllNotificationsRead after
// notifications.js. That global replacement wrote localStorage and never
// called the API, so Mark all read could not stick across a refresh.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assertNoLegacyOverride(rel) {
  const html = read(rel);
  assert.strictEqual(
    html.includes('function markAllNotificationsRead'),
    false,
    rel + ' must not declare markAllNotificationsRead'
  );
  assert.ok(
    html.includes('function markLegacyLocalNotificationsRead'),
    rel + ' should keep the localStorage helper under a name that cannot replace the bell'
  );
  assert.ok(
    html.includes('markLegacyLocalNotificationsRead()'),
    rel + ' legacy dropdown should call the renamed helper'
  );
}

assertNoLegacyOverride('sportsbook/index.html');
assertNoLegacyOverride('sportsbook/v2/index.html');

const engine = read('static/js/notifications.js');
assert.ok(engine.includes('window.__tmrMarkAllNotificationsRead = markAllNotificationsRead'));
assert.ok(engine.includes('__tmrMarkAllNotificationsRead(event)'));
assert.ok(engine.includes('Could not save. These alerts are still unread.'));
assert.ok(engine.includes('Could not save. This alert is still unread.'));
assert.ok(engine.includes('tmrNotifCountIsStale'));
assert.ok(!engine.includes('onclick="markAllNotificationsRead()"'));

const nav = read('static/js/tmr-ds-nav.js');
assert.ok(nav.includes('tmrNotifCountIsStale(unreadStarted)'));

console.log('notification read-state source lock ok');
