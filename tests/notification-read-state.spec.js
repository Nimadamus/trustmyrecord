// Read-state regression for the bell dropdown.
//
// Drives the real notifications.js through the harness. A slow poll returns
// the unread snapshot from before the click. Acknowledged rows must stay
// read after that answer, after the dropdown is closed and opened, after a
// reload, and after leaving the page and coming back. A newer alert still
// shows. A failed save puts the unread state back and says so.

const { test, expect } = require('@playwright/test');

const HARNESS = '/tests/fixtures/notifications-harness.html';

function row(id, overrides = {}) {
  return {
    id,
    type: 'system',
    content: 'Account notice ' + id,
    is_read: false,
    created_at: new Date(Date.UTC(2026, 9, 20, 15, 0, id)).toISOString(),
    ...overrides,
  };
}

const five = () => [1, 2, 3, 4, 5].map((id) => row(id));

async function open(page, feed) {
  const unreadCount = feed.filter((n) => !n.is_read).length;
  await page.addInitScript((payload) => {
    window.__PRESEED = payload;
  }, { feed, unreadCount });
  await page.goto(HARNESS);
  await page.evaluate(() => {
    if (window.__PRESEED && !sessionStorage.getItem('__harness_server')) {
      window.__TEST.feed = window.__PRESEED.feed;
      window.__TEST.unreadCount = window.__PRESEED.unreadCount;
    }
  });
  await expect.poll(() => page.evaluate(() => window.__TEST.calls)).toBeGreaterThan(0);
  await page.waitForTimeout(400);
}

const unreadRows = (page) => page.locator('#notificationsList .notification-item.unread');

test('mark all stays read through a stale poll, reopen, reload, and a new alert', async ({ page }) => {
  await open(page, five());
  await page.locator('#notificationsBtn').click();
  await expect(unreadRows(page)).toHaveCount(5);
  await expect(page.locator('#notifBadge')).toHaveText('5');

  const stale = {
    notifications: five(),
    unreadCount: 5,
  };
  await page.evaluate((payload) => {
    window.__TEST.markDelayMs = 400;
    window.__TEST.replyUnread = payload;
    window.__TEST.nextListDelayMs = 150;
  }, stale);

  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(unreadRows(page)).toHaveCount(0);
  await expect(page.locator('#notifBadge')).toBeHidden();

  // The stale unread snapshot lands while the dropdown is still open.
  await page.waitForTimeout(700);
  await expect(unreadRows(page)).toHaveCount(0);
  await expect(page.locator('#notifBadge')).toBeHidden();
  await expect(page.locator('#notifSaveError')).toBeHidden();
  expect(await page.evaluate(() => window.__TEST.markAllCalls)).toBe(1);
  expect(await page.evaluate(() => window.__TEST.unreadCount)).toBe(0);

  await page.locator('#notificationsBtn').click();
  await page.locator('#notificationsBtn').click();
  await expect(unreadRows(page)).toHaveCount(0);
  await expect(page.locator('#notificationsList .notification-item')).toHaveCount(5);

  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__TEST.calls)).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  await expect(page.locator('#notifBadge')).toBeHidden();
  await page.locator('#notificationsBtn').click();
  await expect(unreadRows(page)).toHaveCount(0);

  await page.goto(HARNESS);
  await expect.poll(() => page.evaluate(() => window.__TEST.calls)).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  await page.locator('#notificationsBtn').click();
  await expect(unreadRows(page)).toHaveCount(0);
  await expect(page.locator('#notifBadge')).toBeHidden();

  const fresh = row(6, {
    content: 'A new account notice',
    created_at: new Date(Date.UTC(2026, 9, 25, 18, 0, 0)).toISOString(),
  });
  await page.evaluate((n) => {
    window.__TEST.feed = window.__TEST.feed.concat([n]);
    window.__TEST.unreadCount = 1;
  }, fresh);
  await expect(page.locator('#notifBadge')).toHaveText('1', { timeout: 5000 });
  await expect(unreadRows(page)).toHaveCount(1);
  await expect(page.locator('#notificationsList .notification-item')).toHaveCount(6);
});

test('one click stays read when a stale poll returns, and a failed save is shown', async ({ page }) => {
  await open(page, five());
  await page.locator('#notificationsBtn').click();
  await expect(unreadRows(page)).toHaveCount(5);

  await page.evaluate((payload) => {
    window.__TEST.markDelayMs = 300;
    window.__TEST.replyUnread = payload;
    window.__TEST.nextListDelayMs = 100;
  }, { notifications: five(), unreadCount: 5 });

  await page.locator('#notificationsList .notification-item').first().click();
  await expect(page).toHaveURL(/notifications-harness\.html/);
  await page.waitForTimeout(600);
  await expect(unreadRows(page)).toHaveCount(4);
  await expect(page.locator('#notifBadge')).toHaveText('4');
  expect(await page.evaluate(() => window.__TEST.marked)).toEqual(['1']);

  await page.locator('#notificationsBtn').click();
  await page.locator('#notificationsBtn').click();
  await expect(unreadRows(page)).toHaveCount(4);

  await page.evaluate(() => { window.__TEST.failMarkOne = true; });
  await page.locator('#notificationsList .notification-item.unread').first().click();
  await expect(page.locator('#notifSaveError')).toHaveText('Could not save. This alert is still unread.');
  await expect(unreadRows(page)).toHaveCount(4);
  await expect(page).toHaveURL(/notifications-harness\.html/);
});

test('a failed mark all restores the unread rows and shows the error', async ({ page }) => {
  await open(page, five());
  await page.locator('#notificationsBtn').click();
  await expect(unreadRows(page)).toHaveCount(5);

  await page.evaluate(() => { window.__TEST.failMarkAll = true; });
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.locator('#notifSaveError')).toHaveText('Could not save. These alerts are still unread.');
  await expect(unreadRows(page)).toHaveCount(5);
  await expect(page.locator('#notifBadge')).toHaveText('5');
  expect(await page.evaluate(() => window.__TEST.unreadCount)).toBe(5);

  await page.locator('#notificationsBtn').click();
  await page.locator('#notificationsBtn').click();
  await expect(unreadRows(page)).toHaveCount(5);
});
