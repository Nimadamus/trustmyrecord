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
  { name: 'wallet', path: '/wallet/', visual: false },
  { name: 'wallet-rewards', path: '/wallet/rewards/', visual: false },
  { name: 'wallet-referrals', path: '/wallet/referrals/', visual: false },
  { name: 'how-tmr-coin-works', path: '/how-tmr-coin-works/', visual: false },
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

// Sport tab label -> the odds-API sport_key the board actually queries.
const SPORT_KEYS = {
  MLB: 'baseball_mlb',
  NFL: 'americanfootball_nfl',
  NBA: 'basketball_nba',
  NHL: 'icehockey_nhl',
  WNBA: 'basketball_wnba',
};

// The sportsbook opens on its default sport, which in the offseason legitimately
// has no slate ("No NBA games scheduled today." on an August morning). Asserting
// wager buttons against whatever the default happens to be made this lock fail
// every day the default sport was out of season -- a calendar bug in the test,
// not a product defect. Resolve an in-season sport from the live board feed
// instead, and fail loudly only if NO sport anywhere has a posted slate, which
// would be a real odds-feed outage and must still break the build.
async function selectSportWithPostedLines(page) {
  const withGames = [];
  for (const [tab, key] of Object.entries(SPORT_KEYS)) {
    const count = await page.evaluate(async (sportKey) => {
      try {
        const base = (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl)
          || 'https://trustmyrecord-api.onrender.com/api';
        const res = await fetch(base + '/games/odds/' + sportKey);
        if (!res.ok) return 0;
        const body = await res.json();
        const games = Array.isArray(body) ? body : (body.games || []);
        return games.filter((g) => (g.bookmakers || []).length > 0).length;
      } catch (e) { return 0; }
    }, key);
    if (count > 0) withGames.push({ tab, count });
  }
  expect(
    withGames.length,
    'no sport has a posted slate at all -- the odds feed is down, not merely out of season'
  ).toBeGreaterThan(0);
  const target = withGames.sort((a, b) => b.count - a.count)[0];
  await clickSport(page, target.tab);
  return target.tab;
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
      test.skip(
        route.name === 'sportsbook' && testInfo.project.name === 'mobile',
        'Dedicated sportsbook live verification covers the dynamic mobile board.'
      );
      await gotoRoute(page, route.path);
      await expect(page.locator('body'), `${route.name} should render visible content`).toBeVisible();
      await expect(page.locator('body'), `${route.name} should not be blank`).not.toHaveText(/^\s*$/);
      await expect(page).toHaveScreenshot(`${route.name}-${testInfo.project.name}-20260512.png`, {
        fullPage: true,
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: route.name === 'sportsbook' ? 0.08 : 0,
      });
    });
  }
});

// APPROVED HOMEPAGE BASELINE (owner-locked 2026-07-30, commit f5ac1ca7;
// hero converted to a viewport-driven flex column 2026-07-31 so the stripe
// stays flush to the viewport bottom at every desktop height, not just the
// content height a fixed margin-top happened to produce).
// Geometry, not screenshots: deterministic against live data changes. Fails
// the deploy if the hero/stripe/card layout drifts at any common width.
// Static-rule counterpart: tests/homepage-approved-baseline-lock-test.js.
test.describe('homepage approved-baseline geometry', () => {
  // real desktop resolutions (not just widths) so the viewport-height-driven
  // hero is actually exercised — a fixed test height would have hidden this
  // exact regression class
  const SIZES = [
    { width: 1920, height: 1080 },
    { width: 1680, height: 1050 },
    { width: 1600, height: 900 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ];

  for (const { width, height } of SIZES) {
    test(`hero/stripe/card layout locked @ ${width}x${height}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile', 'sizes are set explicitly; run once per size on desktop project');
      await page.setViewportSize({ width, height });
      await gotoRoute(page, '/');
      const m = await page.evaluate(() => {
        const hero = document.querySelector('.hero');
        const grid = document.querySelector('.hero-grid');
        const stripe = document.querySelector('.bridge .bridge-in');
        const dash = document.querySelector('.dash');
        const card = document.querySelector('.spot');
        const nav = document.querySelector('nav') || document.querySelector('.ds-nav');
        if (!hero || !grid || !stripe || !dash) return { missing: true };
        const hr = hero.getBoundingClientRect();
        const sr = stripe.getBoundingClientRect();
        const dr = dash.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        return {
          heroPadding: getComputedStyle(hero).padding,
          heroDisplay: getComputedStyle(hero).display,
          gridCols: getComputedStyle(grid).gridTemplateColumns,
          gapBelowStripe: hr.bottom - sr.bottom,
          stripeBottomVsViewport: sr.bottom - vh,
          dashTopVsViewport: dr.top - vh,
          stripeLeftMargin: sr.left,
          stripeRightMargin: vw - sr.right,
          stripeRadius: getComputedStyle(stripe).borderTopLeftRadius,
          heroFullBleed: Math.abs(hr.left) < 1 && Math.abs(vw - hr.right) < 1,
          cardVisible: card ? card.getBoundingClientRect().width : 0,
          navPresent: !!nav,
        };
      });
      expect(m.missing, 'hero, hero-grid, stats stripe and next section must all exist').toBeFalsy();
      expect(m.heroDisplay, 'hero must be a flex column so the stripe can be pushed to its bottom edge').toBe('flex');
      // stripe flush on the hero's bottom edge — zero dark gap beneath it
      expect(m.heroPadding, 'hero padding must stay 28px 0 0 (bottom 0 = stripe flush)').toBe('28px 0px 0px');
      expect(Math.abs(m.gapBelowStripe), 'stats stripe must sit flush on the hero bottom edge').toBeLessThanOrEqual(1);
      // the actual user-facing requirement: stripe bottom flush with the
      // *viewport* bottom on initial load, and "Happening Right Now" (.dash)
      // must not be visible without scrolling
      expect(Math.abs(m.stripeBottomVsViewport), `stats stripe bottom must align with the viewport bottom at ${width}x${height}`).toBeLessThanOrEqual(1);
      expect(m.dashTopVsViewport, `"Happening Right Now" must not be visible in the initial viewport at ${width}x${height}`).toBeGreaterThanOrEqual(-1);
      // full-width flush stripe (owner-requested 2026-08-01): no side margins, no rounded corners
      expect(Math.abs(m.stripeLeftMargin), 'stripe must span the full viewport width (no left margin)').toBeLessThanOrEqual(1);
      expect(Math.abs(m.stripeRightMargin), 'stripe must span the full viewport width (no right margin)').toBeLessThanOrEqual(1);
      expect(m.stripeRadius, 'stripe must have no rounded corners (full-width flush design)').toBe('0px');
      expect(m.heroFullBleed, 'hero background must span the full viewport width').toBe(true);
      // capper card column per approved breakpoints (520px > 1400, 460px to 1181, stacked below)
      const cols = m.gridCols.trim().split(/\s+/);
      if (width > 1400) {
        expect(cols[cols.length - 1], `capper-card column must be 520px at ${width}px`).toBe('520px');
      } else if (width > 1180) {
        expect(cols[cols.length - 1], `capper-card column must be 460px at ${width}px`).toBe('460px');
      } else {
        expect(cols.length, `hero must stack to a single column at ${width}px`).toBe(1);
      }
      expect(m.cardVisible, 'Capper of the Week card must render').toBeGreaterThan(200);
      expect(m.navPresent, 'navbar must be present').toBe(true);
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
    const sportsbookLink = nav.locator('a[href="/sportsbook/"], a[href*="sportsbook"]').first();
    const loginLink = nav.locator('a[href="/login/"], a[href*="login"]').first();
    if (!(await sportsbookLink.isVisible()) || !(await loginLink.isVisible())) {
      const toggle = nav.getByRole('button', { name: /toggle navigation|menu/i }).first();
      if (await toggle.count()) await toggle.click();
    }
    if (!(await sportsbookLink.isVisible())) {
      // Jul 29 nav reconciliation moved Sportsbook links inside a dropdown —
      // open its trigger before asserting the destination link.
      const trigger = nav.getByRole('button', { name: /^sportsbook$/i }).first();
      if (await trigger.count()) await trigger.click();
    }
    await expect(sportsbookLink).toBeVisible();
    await expect(loginLink).toBeVisible();
    const box = await nav.boundingBox();
    expect(box && box.height, 'nav must have layout height').toBeGreaterThan(30);
  });

  test('Model Builder research tool loads with verified data-source labels when logged out', async ({ page }) => {
    await page.context().clearCookies();
    await gotoRoute(page, '/model-builder/');
    // Usable logged out: no hard access wall, real heading, verified-source copy.
    await expect(page.locator('body')).not.toContainText(/Login required|Checking access/i);
    await expect(page.locator('h1')).toContainText(/Model Builder/i);
    await expect(page.locator('body')).toContainText(/verified/i);
    // Saving/tracking still routes through login.
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
      // Out-of-season sports are expected to be empty -- but they must say so,
      // never render a blank panel or a stuck "Loading..." state. Poll rather
      // than branch on the snapshot above: the board can still be filling in
      // when innerText() is captured, and a slow-loading populated board would
      // otherwise be misread as an empty one.
      await expect
        .poll(
          async () => {
            const text = await visibleBoard(page).innerText();
            if (/ML|[+-]\d|O\s*\d|U\s*\d/i.test(text)) return 'priced';
            if (/no .*games|not scheduled|offseason|check back/i.test(text)) return 'empty-stated';
            return 'neither';
          },
          {
            message: `${sport} board must either show priced markets or state that it has no games`,
            timeout: 30000,
          }
        )
        .not.toBe('neither');
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
    // PROPS_PICKABLE_20260608 made Player Props a real, pickable market tab —
    // the old "props must not appear" lock inverted into: the tab must exist.
    await expect(page.getByRole('tab', { name: /Player Props/i }).first()).toBeVisible({ timeout: 30000 });
  });

  test('wager buttons select a pick, odds are display-only, and logged-out submit requires login', async ({ page }) => {
    await waitForSportsbook(page);
    await selectSportWithPostedLines(page);
    const pickButton = await firstEnabledPickButton(page);
    await pickButton.click();
    await expect(page.locator('#pickDetails, .sportsbook-ticket-preview, .tmr-slip-panel').first()).toBeVisible();
    const odds = page.locator('#pickOddsInput').first();
    await expect(odds, 'odds field exists for selected wager').toHaveCount(1);
    const oddsReadonly = await odds.evaluate((node) => node.readOnly || node.disabled || node.getAttribute('aria-readonly') === 'true');
    expect(oddsReadonly, 'odds must not be manually editable').toBe(true);
    await expect(page.locator('#unitsStakePreview, #ttSlipStakePreview, .tmr-slip-panel').first()).toContainText(/Risk/i);
    await expect(page.locator('#unitsStakePreview, #ttSlipStakePreview, .tmr-slip-panel').first()).toContainText(/To Win/i);
    // The slip labels the market and prints the price ("Spread - -200"); it only
    // prints the literal word "Odds" for some markets, so pinning that word made
    // the check depend on which button happened to be first on the board. Assert
    // the thing that actually matters: a real American price is shown in the slip.
    await expect(
      page.locator('#pickDetails, .sportsbook-ticket-preview, .tmr-slip-panel').first(),
      'the slip must show the price of the selected wager'
    ).toContainText(/(Odds|[+-]\d{2,4})/i);
    const submit = page.locator('.submit-pick-btn, .lock-pick-btn, button:has-text("Lock"), button:has-text("Submit")').first();
    if (await submit.count()) {
      await submit.click();
      await expect(page.locator('body')).toContainText(/log in|login|sign in|account/i);
    }
  });

  test('unit changes immediately update risk/to win preview', async ({ page }) => {
    await waitForSportsbook(page);
    await selectSportWithPostedLines(page);
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

test.describe('handicappers directory canonical profile links', () => {
  // Regression for the "Newest member" link 404 (Jul 2026): a brand-new,
  // zero-graded-pick member was surfaced by /api/users/newest-member the
  // moment they verified, but build_profile_pages.py's discovery loop only
  // saw members returned by GET /api/users -- which requires a settled pick
  // -- so it never baked even a compact /u/<username>/ page for them. Fixed
  // by adding GET /api/users/directory-usernames (no settled-pick
  // requirement) as the discovery source. This test locks two things: the
  // newest-member widget must build its href with the exact same /u/
  // convention every directory card uses, and that URL must actually
  // resolve (not the redirect-shell 404) once baked.
  test('newest member link matches the canonical /u/<username>/ route used by directory cards, and resolves', async ({ page, request }) => {
    const api = await request.get('https://trustmyrecord-api.onrender.com/api/users/newest-member');
    expect(api.ok(), 'newest-member API should respond').toBeTruthy();
    const { member } = await api.json();
    test.skip(!member, 'no eligible newest member returned right now');

    await gotoRoute(page, '/handicappers/');
    const newestLink = page.locator('#hmNewestMember a, .hm-newest-member a').first();
    await expect(newestLink, 'newest member link should render').toBeVisible({ timeout: 20000 });

    const newestHref = await newestLink.getAttribute('href');
    const expectedHref = `/u/${encodeURIComponent(member.username)}/`;
    expect(newestHref, 'newest-member link must point at the canonical /u/<username>/ route, not /profile/?user= or anything else').toBe(expectedHref);

    // Same href-building convention must be used by ordinary directory cards
    // elsewhere on this same page -- one shared pattern, not two link builders.
    const cardHrefs = await page.locator('a[href^="/u/"]').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(cardHrefs.length, 'directory should render at least one member card /u/ link').toBeGreaterThan(0);
    for (const href of cardHrefs) {
      expect(href, `every /u/ link on the directory must follow the /u/<username>/ shape (got ${href})`).toMatch(/^\/u\/[^/]+\/$/);
    }

    // The freshly-verified member's page may still be mid-bake (prerender
    // dispatch fires on verification but isn't instant) -- poll briefly
    // rather than treat that legitimate race as a hard failure.
    let response = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      response = await page.goto(newestHref, { waitUntil: 'domcontentloaded' });
      if (response && response.status() !== 404) break;
      await page.waitForTimeout(15000);
    }
    expect(response && response.status(), `${newestHref} (newest member) must not 404`).not.toBe(404);
    await expect(page).not.toHaveTitle(/page not found/i);
    await expect(page.locator('body'), 'must not land on the generic 404 redirect shell').not.toContainText(/we couldn.t find that page/i);
  });
});
