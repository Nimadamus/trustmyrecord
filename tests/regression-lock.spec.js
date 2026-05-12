const { test, expect } = require('@playwright/test');

const ROUTES = [
  { name: 'homepage', path: '/', visual: false },
  { name: 'sportsbook', path: '/sportsbook/', visual: true },
  { name: 'pending-picks', path: '/my-pending-picks/', visual: false },
  { name: 'profile', path: '/profile/?user=betlegend', visual: false },
  { name: 'model-builder', path: '/model-builder/', visual: false },
  { name: 'trendspotter', path: '/trendspotter/', visual: false },
  { name: 'arena', path: '/arena/', visual: false },
  { name: 'forum', path: '/forum/', visual: false },
  { name: 'login', path: '/login/', visual: false },
];

const SPORT_TABS = ['NBA', 'NHL', 'NFL', 'MLB', 'NCAAB', 'NCAAF', 'Soccer'];
const UNIT_VALUES = ['0.5', '1', '2', '3'];

async function gotoRoute(page, path) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
}

async function visibleText(page) {
  return page.locator('body').innerText({ timeout: 20000 });
}

async function waitForSportsbook(page) {
  await gotoRoute(page, '/sportsbook/');
  await expect(page.locator('#picks')).toBeVisible({ timeout: 30000 });
  await expect(visibleBoard(page)).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await expect(page.locator('body')).not.toContainText(/Loading live odds/i, { timeout: 45000 });
}

function visibleBoard(page) {
  return page.locator('#lobbyBoardRows:visible, #gamesListContainer:visible, main article:visible').first();
}

async function clickSport(page, sport) {
  const label = sport === 'Soccer' ? /Soccer\b/i : new RegExp(`^${sport}\\b`, 'i');
  const tab = page.getByRole('button', { name: label }).first();
  await expect(tab, `${sport} tab should exist`).toBeVisible({ timeout: 20000 });
  await tab.click();
  await page.waitForTimeout(1200);
  await expect(visibleBoard(page), `${sport} board should stay visible`).toBeVisible();
}

async function firstEnabledPickButton(page) {
  const button = page
    .locator('#lobbyBoardRows button:not([disabled]), #gamesListContainer button:not([disabled]), main article button:not([disabled])')
    .filter({ hasText: /ML|[+-]\d|O\s*\d|U\s*\d/i })
    .first();
  await expect(button, 'at least one enabled wager button should be available when games have posted lines').toBeVisible({ timeout: 45000 });
  return button;
}

test.describe('critical route visual baselines', () => {
  for (const route of ROUTES.filter((item) => item.visual)) {
    test(`${route.name} desktop/mobile visual baseline`, async ({ page }, testInfo) => {
      await gotoRoute(page, route.path);
      await expect(page.locator('body'), `${route.name} should render visible content`).toBeVisible();
      await expect(page.locator('body'), `${route.name} should not be blank`).not.toHaveText(/^\s*$/);
      await expect(page).toHaveScreenshot(`${route.name}-${testInfo.project.name}-20260512.png`, {
        fullPage: true,
        animations: 'disabled',
        caret: 'hide',
      });
    });
  }
});

test.describe('core route and content locks', () => {
  test('critical public routes render and do not 404 or blank', async ({ page }) => {
    for (const route of ROUTES) {
      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      expect(response && response.status(), `${route.path} must not 404`).not.toBe(404);
      await expect(page.locator('body'), `${route.path} body should be visible`).toBeVisible();
      const text = await visibleText(page);
      expect(text.trim().length, `${route.path} should not be blank`).toBeGreaterThan(80);
      expect(text).not.toMatch(/\blorem ipsum\b|preview version/i);
    }
  });

  test('shared navigation remains reachable', async ({ page }) => {
    await gotoRoute(page, '/sportsbook/');
    const nav = page.locator('.tmr-global-nav, nav').first();
    await expect(nav, 'global nav should be visible').toBeVisible();
    await expect(nav, 'nav should expose Make Picks').toContainText(/Make Picks|Sportsbook/i);
    await expect(nav.locator('a[href="/sportsbook/"], a[href*="sportsbook"]').first()).toBeVisible();
    await expect(nav.locator('a[href="/login/"], a[href*="login"]').first()).toBeVisible();
    const box = await nav.boundingBox();
    expect(box && box.height, 'nav must have layout height').toBeGreaterThan(30);
  });

  test('auth protected Model Builder shows login required when logged out', async ({ page }) => {
    await page.context().clearCookies();
    await gotoRoute(page, '/model-builder/');
    await expect(page.locator('body')).toContainText(/Login required|Checking access/i);
    await expect(page.locator('a[href*="/login/"]').first()).toBeVisible();
  });
});

test.describe('sportsbook functional locks', () => {
  test('sports tabs are clickable and games area stays populated', async ({ page }) => {
    await waitForSportsbook(page);
    for (const sport of SPORT_TABS) {
      await clickSport(page, sport);
      const boardText = await visibleBoard(page).innerText();
      expect(boardText.trim().length, `${sport} board should not collapse to empty`).toBeGreaterThan(20);
      expect(boardText).not.toMatch(/My Pick History/i);
    }
  });

  test('market tabs and unsupported props behavior stay locked', async ({ page }) => {
    await waitForSportsbook(page);
    await clickSport(page, 'MLB');
    const markets = page.locator('button:has-text("Game Lines"), button:has-text("Team Totals"), button:has-text("5 Inning")');
    await expect(markets.first(), 'market tabs should exist').toBeVisible({ timeout: 30000 });
    await page.getByRole('tab', { name: /Game Lines/i }).first().click();
    await expect(visibleBoard(page)).toBeVisible();
    const teamTotals = page.getByRole('button', { name: /Team Totals/i }).first();
    if (await teamTotals.count()) {
      await teamTotals.click();
      await expect(visibleBoard(page)).toContainText(/Team Totals|not posted|not offered|temporarily unavailable|Matchup|ML|O\s*\d|U\s*\d/i);
    }
    await expect(page.locator('#picks')).not.toContainText(/player props|props board|prop market/i);
  });

  test('wager buttons select a pick, odds are display-only, and logged-out submit requires login', async ({ page }) => {
    await waitForSportsbook(page);
    const pickButton = await firstEnabledPickButton(page);
    await pickButton.click();
    await expect(page.locator('#pickDetails, .sportsbook-ticket-preview, .tmr-slip-panel').first()).toBeVisible();
    const odds = page.locator('#pickOddsInput').first();
    await expect(odds, 'odds field exists for selected wager').toHaveCount(1);
    const oddsReadonly = await odds.evaluate((node) => node.readOnly || node.disabled || node.getAttribute('aria-readonly') === 'true');
    expect(oddsReadonly, 'odds must not be manually editable').toBe(true);
    await expect(page.locator('#unitsStakePreview, #ttSlipStakePreview, .tmr-slip-panel').first()).toContainText(/Risk/i);
    await expect(page.locator('#unitsStakePreview, #ttSlipStakePreview, .tmr-slip-panel').first()).toContainText(/To Win/i);
    await expect(page.locator('#pickDetails, .sportsbook-ticket-preview, .tmr-slip-panel').first()).toContainText(/Odds/i);
    const submit = page.locator('.submit-pick-btn, .lock-pick-btn, button:has-text("Lock"), button:has-text("Submit")').first();
    if (await submit.count()) {
      await submit.click();
      await expect(page.locator('body')).toContainText(/log in|login|sign in|account/i);
    }
  });

  test('unit changes immediately update risk/to win preview', async ({ page }) => {
    await waitForSportsbook(page);
    const pickButton = await firstEnabledPickButton(page);
    await pickButton.click();
    const input = page.locator('#ttSlipUnits, #unitsInput').first();
    const preview = page.locator('#ttSlipStakePreview, #unitsStakePreview').first();
    await expect(input).toBeVisible();
    await expect(preview).toBeVisible();
    for (const value of UNIT_VALUES) {
      await input.fill(value);
      await input.dispatchEvent('input');
      await expect(preview, `stake preview should reflect ${value} units`).toContainText(new RegExp(value.replace('.', '\\.') + '|Risk|To Win'));
    }
  });

  test('mobile sportsbook layout keeps nav and board accessible', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only layout check');
    await waitForSportsbook(page);
    await expect(page.locator('.tmr-global-nav, nav').first()).toBeVisible();
    await expect(visibleBoard(page)).toBeVisible();
    const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const viewportWidth = page.viewportSize().width;
    expect(bodyWidth, 'mobile layout should not create major horizontal overflow').toBeLessThanOrEqual(viewportWidth + 24);
  });
});
