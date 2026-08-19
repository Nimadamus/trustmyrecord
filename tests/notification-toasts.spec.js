// Graded-pick toast + notification-polling regression suite.
//
// Drives the REAL static/js/notifications.js through tests/fixtures/notifications-harness.html
// against a scripted window.api, so every assertion is about shipping behaviour
// rather than a reimplementation. No backend, no production data, and nothing is
// written anywhere.
//
// Covers what the 2026-08-19 work had to guarantee:
//   * a new win and a new loss each raise one clearly-typed toast
//   * the same alert never toasts twice, including across a reload
//   * an existing unread backlog is NEVER replayed as new toasts
//   * many alerts at once collapse instead of burying the page
//   * dismiss removes the toast and does NOT mark it read
//   * clicking a toast marks it read and deep-links to the pick
//   * the bell badge stays authoritative throughout
//   * a 401 pauses polling and it RECOVERS by itself (the old code killed it)
//   * signed out means no polling and no toasts
//   * the mobile layout docks to the bottom and stays inside the viewport

const { test, expect } = require('@playwright/test');

const HARNESS = '/tests/fixtures/notifications-harness.html';

function notif(id, type, overrides = {}) {
  return {
    id,
    type,
    content: type === 'pick_won'
      ? 'Your pick was graded: WON (+1.20u)'
      : 'Your pick was graded: LOST (-1.00u)',
    is_read: false,
    created_at: new Date(Date.UTC(2026, 7, 19, 4, 41, 0) + id * 1000).toISOString(),
    related_pick_id: 4000 + id,
    related_user_id: null,
    username: null,
    selection: 'Yankees -1.5',
    market_type: 'spreads',
    ...overrides,
  };
}

// Land on the harness with a feed already staged, and let the seeding poll run.
// Seeding is the mechanism that stops an old backlog toasting, so every test
// starts from "the browser has already met these alerts".
async function open(page, { feed = [], unreadCount = 0 } = {}) {
  await page.addInitScript(([f, u]) => {
    window.__PRESEED = { feed: f, unreadCount: u };
  }, [feed, unreadCount]);
  await page.goto(HARNESS);
  await page.evaluate(() => {
    if (window.__PRESEED) {
      window.__TEST.feed = window.__PRESEED.feed;
      window.__TEST.unreadCount = window.__PRESEED.unreadCount;
    }
  });
  // First poll seeds silently; wait for it to have happened.
  await expect.poll(() => page.evaluate(() => window.__TEST.calls)).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  return page;
}

async function pushFeed(page, feed, unreadCount) {
  await page.evaluate(([f, u]) => {
    window.__TEST.feed = f;
    window.__TEST.unreadCount = u;
  }, [feed, unreadCount]);
}

const toasts = (page) => page.locator('#tmrNotifToasts .tmr-toast');

test.describe('graded-pick toasts', () => {
  test('a new WIN raises one win-styled toast carrying the units and the pick', async ({ page }) => {
    await open(page, { feed: [], unreadCount: 0 });
    await pushFeed(page, [notif(1, 'pick_won')], 1);

    await expect(toasts(page)).toHaveCount(1);
    const toast = toasts(page).first();
    await expect(toast).toHaveAttribute('data-variant', 'win');
    await expect(toast.locator('.tmr-toast__title')).toHaveText('Pick won');
    await expect(toast.locator('.tmr-toast__text')).toContainText('+1.20u');
    await expect(toast.locator('.tmr-toast__meta')).toContainText('Yankees -1.5');
    // Win colouring is what makes it readable at a glance.
    await expect(toast.locator('.res-win').first()).toBeVisible();
  });

  test('a new LOSS raises one loss-styled toast', async ({ page }) => {
    await open(page, { feed: [], unreadCount: 0 });
    await pushFeed(page, [notif(2, 'pick_lost')], 1);

    await expect(toasts(page)).toHaveCount(1);
    const toast = toasts(page).first();
    await expect(toast).toHaveAttribute('data-variant', 'loss');
    await expect(toast.locator('.tmr-toast__title')).toHaveText('Pick lost');
    await expect(toast.locator('.tmr-toast__text')).toContainText('-1.00u');
  });

  test('the same alert never toasts twice, even across a reload', async ({ page }) => {
    await open(page, { feed: [], unreadCount: 0 });
    const one = [notif(3, 'pick_won')];
    await pushFeed(page, one, 1);
    await expect(toasts(page)).toHaveCount(1);

    // Several more polls of the identical feed must add nothing.
    await page.waitForTimeout(1200);
    await expect(toasts(page)).toHaveCount(1);

    // And a reload with the same still-unread row must stay silent.
    await page.addInitScript((f) => { window.__PRESEED = { feed: f, unreadCount: 1 }; }, one);
    await page.reload();
    await page.evaluate(() => {
      window.__TEST.feed = window.__PRESEED.feed;
      window.__TEST.unreadCount = window.__PRESEED.unreadCount;
    });
    await page.waitForTimeout(1000);
    await expect(toasts(page)).toHaveCount(0);
  });

  test('an existing unread backlog is not replayed as new toasts', async ({ page }) => {
    // Exactly the production shape that started this: 10 unread graded picks
    // already waiting when the page loads.
    const backlog = Array.from({ length: 10 }, (_, i) => notif(100 + i, i % 2 ? 'pick_lost' : 'pick_won'));
    await open(page, { feed: backlog, unreadCount: 10 });

    await page.waitForTimeout(1000);
    await expect(toasts(page)).toHaveCount(0);
    // ...but the bell still reports all ten.
    await expect(page.locator('#notifBadge')).toHaveText('10');
  });

  test('many alerts at once collapse into three toasts plus a summary', async ({ page }) => {
    await open(page, { feed: [], unreadCount: 0 });
    const burst = Array.from({ length: 7 }, (_, i) => notif(200 + i, i % 2 ? 'pick_lost' : 'pick_won'));
    await pushFeed(page, burst, 7);

    await expect(toasts(page)).toHaveCount(4); // 3 real + 1 summary
    await expect(page.locator('#tmrNotifToasts .tmr-toast--summary')).toHaveCount(1);
    await expect(page.locator('#tmrNotifToasts .tmr-toast--summary .tmr-toast__title'))
      .toHaveText('4 more picks graded');
    // Every one of the seven is still reachable from the bell.
    await expect(page.locator('#notifBadge')).toHaveText('7');
  });

  test('dismiss removes the toast and does NOT mark it read', async ({ page }) => {
    await open(page, { feed: [], unreadCount: 0 });
    await pushFeed(page, [notif(4, 'pick_won')], 1);
    await expect(toasts(page)).toHaveCount(1);

    await toasts(page).first().locator('.tmr-toast__close').click();
    await expect(toasts(page)).toHaveCount(0);

    // The bell is authoritative: dismissing a popup is not reading the alert.
    expect(await page.evaluate(() => window.__TEST.marked)).toEqual([]);
    await expect(page.locator('#notifBadge')).toHaveText('1');
  });

  test('clicking a toast marks it read and deep-links to the pick', async ({ page }) => {
    await page.route('**/sportsbook/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>pick page</body></html>' }));

    await open(page, { feed: [], unreadCount: 0 });
    await pushFeed(page, [notif(5, 'pick_won')], 1);
    await expect(toasts(page)).toHaveCount(1);

    await toasts(page).first().locator('.tmr-toast__body').click();
    await page.waitForURL(/\/sportsbook\/\?pick=4005#mypicks/);
    // markNotificationRead ran before the navigation. Read it from storage,
    // which survives the page swap that window.__TEST does not.
    const marked = await page.evaluate(() => JSON.parse(localStorage.getItem('__harness_marked') || '[]'));
    expect(marked).toContain('5');
  });

  test('a toast auto-dismisses on its own', async ({ page }) => {
    await open(page, { feed: [], unreadCount: 0 });
    await pushFeed(page, [notif(6, 'pick_won')], 1);
    await expect(toasts(page)).toHaveCount(1);
    await expect(toasts(page)).toHaveCount(0, { timeout: 15000 });
  });

  test('non-pick alerts do not toast, but still reach the bell', async ({ page }) => {
    await open(page, { feed: [], unreadCount: 0 });
    await pushFeed(page, [{
      id: 7, type: 'forum_thread_reply', content: 'Someone replied to your thread',
      is_read: false, created_at: new Date().toISOString(),
    }], 1);

    await page.waitForTimeout(900);
    await expect(toasts(page)).toHaveCount(0);
    await expect(page.locator('#notifBadge')).toHaveText('1');
  });
});

test.describe('auth handling', () => {
  test('a 401 pauses polling and it recovers by itself', async ({ page }) => {
    await open(page, { feed: [], unreadCount: 0 });

    // Prove the old failure mode is gone: the timer must survive a 401.
    await page.evaluate(() => { window.__TEST.failWith = 401; });
    await expect
      .poll(() => page.evaluate(() => window.tmrNotifications.getState().authFailures))
      .toBeGreaterThan(0);

    const paused = await page.evaluate(() => window.tmrNotifications.getState());
    expect(paused.polling).toBe(true);          // used to be false forever
    expect(paused.pauseUntil).toBeGreaterThan(0);
    await expect(page.locator('#notifBadge')).toBeHidden(); // stale count cleared

    // Backoff must actually throttle: no hammering while paused.
    const during = await page.evaluate(() => window.__TEST.calls);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__TEST.calls)).toBeLessThanOrEqual(during + 1);

    // Session comes back -> the very next tick picks it up with no reload.
    await page.evaluate(() => {
      window.__TEST.failWith = null;
      window.__TEST.feed = [];
      window.__TEST.unreadCount = 3;
    });
    await expect(page.locator('#notifBadge')).toHaveText('3', { timeout: 8000 });
    const recovered = await page.evaluate(() => window.tmrNotifications.getState());
    expect(recovered.authFailures).toBe(0);
    expect(recovered.pauseUntil).toBe(0);
    expect(recovered.polling).toBe(true);
  });

  test('an alert arriving after recovery still toasts', async ({ page }) => {
    await open(page, { feed: [], unreadCount: 0 });
    await page.evaluate(() => { window.__TEST.failWith = 401; });
    await expect
      .poll(() => page.evaluate(() => window.tmrNotifications.getState().authFailures))
      .toBeGreaterThan(0);

    await page.evaluate((n) => {
      window.__TEST.failWith = null;
      window.__TEST.feed = [n];
      window.__TEST.unreadCount = 1;
    }, notif(8, 'pick_won'));

    await expect(toasts(page)).toHaveCount(1, { timeout: 8000 });
  });

  test('signed out means no polling, no badge and no toasts', async ({ page }) => {
    await open(page, { feed: [], unreadCount: 0 });
    await page.evaluate(() => {
      window.__TEST.loggedIn = false;
      window.__TEST.feed = [{
        id: 9, type: 'pick_won', content: 'Your pick was graded: WON (+1.00u)',
        is_read: false, created_at: new Date().toISOString(), related_pick_id: 999,
      }];
      window.__TEST.unreadCount = 1;
    });
    const before = await page.evaluate(() => window.__TEST.calls);
    await page.waitForTimeout(1200);

    expect(await page.evaluate(() => window.__TEST.calls)).toBe(before);
    await expect(toasts(page)).toHaveCount(0);
    await expect(page.locator('#notifBadge')).toBeHidden();
  });
});

test.describe('layout', () => {
  test('desktop: docked top-right, inside the viewport, not over the nav', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, { feed: [], unreadCount: 0 });
    await pushFeed(page, [notif(10, 'pick_won')], 1);
    await expect(toasts(page)).toHaveCount(1);

    const box = await toasts(page).first().boundingBox();
    expect(box.y).toBeGreaterThan(60);              // clear of the header
    expect(box.x + box.width).toBeLessThanOrEqual(1440);
    expect(box.width).toBeLessThanOrEqual(380);     // not oversized
    // The bell stays clickable -- a toast must never trap a control.
    await expect(page.locator('#notificationsBtn')).toBeVisible();
    await page.locator('#notificationsBtn').click();
  });

  test('mobile: docks to the bottom, full width inside the viewport, readable text', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, { feed: [], unreadCount: 0 });
    await pushFeed(page, [notif(11, 'pick_lost')], 1);
    await expect(toasts(page)).toHaveCount(1);

    const toast = toasts(page).first();
    const box = await toast.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y).toBeGreaterThan(844 / 2);        // bottom half, above the thumb

    // No tiny text, and a real tap target on the dismiss control.
    const fontPx = await toast.locator('.tmr-toast__text')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontPx).toBeGreaterThanOrEqual(14);
    const closeBox = await toast.locator('.tmr-toast__close').boundingBox();
    expect(Math.min(closeBox.width, closeBox.height)).toBeGreaterThanOrEqual(28);

    await expect(toast.locator('.tmr-toast__close')).toHaveAttribute('aria-label', 'Dismiss notification');
  });

  test('the toast host announces politely and never blocks pointer events itself', async ({ page }) => {
    await open(page, { feed: [], unreadCount: 0 });
    await pushFeed(page, [notif(12, 'pick_won')], 1);
    await expect(toasts(page)).toHaveCount(1);

    const host = page.locator('#tmrNotifToasts');
    await expect(host).toHaveAttribute('role', 'status');
    await expect(host).toHaveAttribute('aria-live', 'polite');
    const pe = await host.evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(pe).toBe('none');
  });
});
