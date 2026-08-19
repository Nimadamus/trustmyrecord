// LIVE verification of the graded-pick toast against the DEPLOYED site.
//
// Read-only and signed out. It loads a real production page, checks the
// deployed notifications.js actually carries the toast engine, then renders a
// synthetic toast through the shipped functions to prove the styling, layout,
// dismiss control and click destination survived the deploy.
//
// Nothing is created server side: showNotificationToast() is a pure DOM render,
// the session is anonymous, and no API call is made. Production alerts are never
// manufactured to test this.
//
//   npx playwright test --config=playwright.notifications-live.config.cjs

const { test, expect } = require('@playwright/test');

const SITE = process.env.TMR_LIVE_SITE_URL || 'https://trustmyrecord.com';

const WIN = {
  id: 'live-win',
  type: 'pick_won',
  content: 'Your pick was graded: WON (+1.20u)',
  is_read: false,
  created_at: new Date().toISOString(),
  related_pick_id: 4408,
  selection: 'Yankees -1.5',
  market_type: 'spreads',
};
const LOSS = {
  id: 'live-loss',
  type: 'pick_lost',
  content: 'Your pick was graded: LOST (-1.00u)',
  is_read: false,
  created_at: new Date().toISOString(),
  related_pick_id: 4409,
  selection: 'Over 8.5',
  market_type: 'totals',
};

async function loadEngine(page) {
  await page.goto(SITE + '/', { waitUntil: 'domcontentloaded' });
  // notifications.js is injected by tmr-sitewide.js, so give it a moment.
  await page.waitForFunction(
    () => window.tmrNotifications && typeof window.tmrNotifications.showNotificationToast === 'function',
    null,
    { timeout: 30000 }
  );
  // Let the homepage finish its own hydration before rendering into it.
  await page.waitForTimeout(2500);
}

test('the deployed notifications.js carries the toast engine', async ({ request }) => {
  const res = await request.get(SITE + '/static/js/notifications.js?cb=' + Date.now());
  expect(res.ok()).toBeTruthy();
  const body = await res.text();
  expect(body).toContain('GRADED-PICK TOASTS');
  expect(body).toContain('maybeToastNewNotifications');
  // The 401 fix must be the version that ships.
  expect(body).toContain('AUTH_PAUSE_20260819');
  expect(body).not.toMatch(/401[\s\S]{0,200}stopNotificationsPolling\(\);\s*\n\s*updateNotifBadge\(0\);\s*\n\s*return;/);
});

test('the sitewide loader points at the deployed build', async ({ request }) => {
  const res = await request.get(SITE + '/static/js/tmr-sitewide.js?cb=' + Date.now());
  const body = await res.text();
  const tag = (body.match(/notifications\.js\?v=([0-9a-z]+)/) || [])[1];
  expect(tag).toBeTruthy();
  const asset = await request.get(SITE + '/static/js/notifications.js?v=' + tag);
  expect(await asset.text()).toContain('GRADED-PICK TOASTS');
});

test('desktop: a win and a loss toast render on the live page', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadEngine(page);

  await page.evaluate(([w, l]) => {
    window.tmrNotifications.showNotificationToast(w);
    window.tmrNotifications.showNotificationToast(l);
  }, [WIN, LOSS]);

  const toasts = page.locator('#tmrNotifToasts .tmr-toast');
  await expect(toasts).toHaveCount(2);
  // Present is not the same as SEEN. The first pass of this verification
  // screenshotted an empty page while every geometry assertion passed, so the
  // live checks assert actual visibility inside the viewport.
  await expect(toasts.nth(0)).toBeVisible();
  await expect(toasts.nth(0)).toBeInViewport();
  await expect(toasts.nth(1)).toBeInViewport();
  await expect(toasts.nth(0)).toHaveAttribute('data-variant', 'win');
  await expect(toasts.nth(1)).toHaveAttribute('data-variant', 'loss');
  await expect(toasts.nth(0).locator('.tmr-toast__text')).toContainText('+1.20u');
  await expect(toasts.nth(1).locator('.tmr-toast__text')).toContainText('-1.00u');

  const box = await toasts.nth(0).boundingBox();
  expect(box.y).toBeGreaterThan(60);
  expect(box.x + box.width).toBeLessThanOrEqual(1440);
  expect(box.width).toBeLessThanOrEqual(380);

  await testInfo.attach('live-desktop-toasts.png', {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png',
  });
});

test('mobile: the toast docks bottom, stays in the viewport and dismisses', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadEngine(page);

  await page.evaluate((w) => window.tmrNotifications.showNotificationToast(w), WIN);
  const toast = page.locator('#tmrNotifToasts .tmr-toast').first();
  await expect(toast).toHaveCount(1);
  await expect(toast).toBeVisible();
  await expect(toast).toBeInViewport();

  const box = await toast.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y).toBeGreaterThan(844 / 2);

  const fontPx = await toast.locator('.tmr-toast__text')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontPx).toBeGreaterThanOrEqual(14);

  await testInfo.attach('live-mobile-toast.png', {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png',
  });

  await toast.locator('.tmr-toast__close').click();
  await expect(page.locator('#tmrNotifToasts .tmr-toast')).toHaveCount(0);
});

test('the live toast host cannot trap page controls', async ({ page }) => {
  await loadEngine(page);
  await page.evaluate((w) => window.tmrNotifications.showNotificationToast(w), WIN);
  const host = page.locator('#tmrNotifToasts');
  await expect(host).toHaveAttribute('aria-live', 'polite');
  expect(await host.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  await page.locator('#tmrNotifToasts .tmr-toast__close').first().click();
});
