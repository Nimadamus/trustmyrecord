const { test, expect } = require('@playwright/test');

const ROUTES = [
  { name: 'homepage', path: '/', visual: false },
  // visual:false since 2026-08-10 — see "sportsbook geometry lock" below for why
  // the screenshot baseline was replaced with geometry.
  { name: 'sportsbook', path: '/sportsbook/', visual: false },
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

// Pin the mainline pick slip on every sportsbook route.
//
// static/js/sportsbook-multislip.js is on a staged rollout: ROLLOUT_PERCENT is
// 10 and the bucket is `Math.floor(Math.random() * 100)` kept in localStorage.
// CI starts from a clean profile, so roughly one run in ten drew the multislip
// panel -- a different component whose markup the slip assertions in this file
// (#pickDetails, the risk/to-win preview) were never written against. That is a
// coin flip inside a deployment gate. `?multislip=0` is the kill switch the
// module already exposes. Nothing else about the route changes.
function pinSlipVariant(path) {
  if (!path.startsWith('/sportsbook/')) return path;
  return path + (path.includes('?') ? '&' : '?') + 'multislip=0';
}

async function gotoRoute(page, path) {
  await page.goto(pinSlipVariant(path), { waitUntil: 'domcontentloaded' });
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

// SPORTSBOOK_V2_20260904: /sportsbook/ now serves the v2 board (#sbnBoard, rows
// of article.sbn-row) where it used to serve #lobbyBoardRows / the .tmr-market-card
// list. Both are listed everywhere a board hook is needed, so these locks assert
// the same guarantees whichever skin answers -- production (v2) and the local
// static server this config falls back to (classic) included.
function visibleBoard(page) {
  return page.locator('#sbnBoard:visible, #lobbyBoardRows:visible, #gamesListContainer:visible, main article:visible').first();
}

// Slip and stake-preview hooks, classic and v2. `.sbn-sliplist` is the v2 slip;
// `.sbn-sliptotals` is where it prints "Total risk 1u / To win 0.53u".
const SLIP = '#pickDetails, .sportsbook-ticket-preview, .tmr-slip-panel, .sbn-sliplist';
const STAKE_PREVIEW = '#unitsStakePreview, #ttSlipStakePreview, .tmr-slip-panel, .sbn-sliptotals';

async function clickSport(page, sport) {
  // The sport rail prints an icon before the label ("⚾ MLB", "🏀 NBA"), so an
  // accessible name anchored at ^ stopped matching anything the day those icons
  // shipped, and took all four locks in this describe down with it (2026-09-04).
  // Still an exact-label match, just one that tolerates a leading glyph: the
  // sport must appear as its own word, so NBA still cannot match WNBA.
  const label = sport === 'Soccer' ? /Soccer\b/i : new RegExp(`(^|[^A-Za-z])${sport}\\b`, 'i');
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

// A market switcher entry. role=tab, and only role=tab: the v2 board shipped
// its switcher as plain buttons for a while and this helper briefly accepted
// button.sbn-cat to get the suite green, which quietly made "the market
// switcher is a tablist" unenforceable. afed2baea restored the semantics, so
// the tighter locator is back and the a11y lock below asserts the rest.
function marketTab(page, name) {
  return page.getByRole('tab', { name }).first();
}

async function firstEnabledPickButton(page) {
  const button = page
    .locator('#sbnBoard button:not([disabled]), #lobbyBoardRows button:not([disabled]), #gamesListContainer button:not([disabled]), main article button:not([disabled])')
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

/* SPORTSBOOK GEOMETRY LOCK (replaced the screenshot baseline, 2026-08-10)
   -----------------------------------------------------------------------------
   The sportsbook route used to be checked with a fullPage screenshot compared
   against a baseline captured on 2026-05-12, at maxDiffPixelRatio 0.08. The
   board renders the live slate, so that image drifts with the odds, not with
   the code, and the test failed intermittently on commits that could not have
   touched it -- 236a9be9 changed one workflow YAML file and still failed this
   exact test, as did 8374f70a, which only edited today/index.html.

   A deployment gate that fires on tomorrow's fixtures is worse than no gate:
   it trains everyone to wave the failure through, and it cannot answer the one
   question that matters during the design-system migration -- did OUR change
   move the sportsbook?

   So it asserts invariants instead. Nothing here reads odds, team names,
   prices or counts of live games. It reads geometry and structure, which is
   exactly what a shell migration is capable of breaking. The homepage block
   below already made this trade ("Geometry, not screenshots: deterministic
   against live data changes"); the sportsbook simply never got the same
   treatment.

   Written to hold across the shell migration ON PURPOSE: the chrome assertions
   accept the legacy nav or the design-system nav, so the same guard proves the
   page before and after, rather than needing to be rewritten by the change it
   is meant to be policing.

   NOT asserted yet: `.sportsbook-page-topbar` containing its own content. It
   overflows today at 390px (measured 282/286) and the structural fix for it
   lands with the shell migration, so that assertion is added in the same commit
   that earns it. */
test.describe('sportsbook geometry lock', () => {
  test('layout, chrome and controls survive independent of the live slate', async ({ page }, testInfo) => {
    await waitForSportsbook(page);

    const m = await page.evaluate(() => {
      const d = document.documentElement;
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
      };
      // First VISIBLE board container, in preference order. A comma list in
      // querySelector returns document order, and the page carries the classic
      // board's markup hidden alongside the v2 board, so the old one-liner
      // measured a single game row (134px tall) and reported the board as
      // collapsed on a board that was fine (2026-09-04).
      const board = ['#sbnBoard', '#lobbyBoardRows', '#gamesListContainer', 'main article']
        .map((sel) => document.querySelector(sel))
        .find((el) => el && el.getClientRects().length) || null;
      const navs = document.querySelectorAll('nav.tmr-global-nav, nav.ds-nav');
      const foots = document.querySelectorAll('footer, .ds-footer, .tmr-global-footer');
      return {
        rootClient: d.clientWidth,
        rootScroll: d.scrollWidth,
        picksVisible: !!document.querySelector('#picks'),
        board: box(board),
        navCount: navs.length,
        nav: box(navs[0]),
        footerCount: foots.length,
        footer: box(foots[0]),
        sportButtons: document.querySelectorAll(
          '.sportsbook-sports-nav button, button.sbn-railbtn').length,
        marketTabs: document.querySelectorAll('.market-tabs button, .market-tabs a, #picks .market-tabs *').length,
        slip: box(document.querySelector('#pickDetails, .sbn-slip')),
      };
    });

    // 1. The page never scrolls sideways. This is the assertion that would have
    //    caught a shell whose container is wider than the viewport.
    expect(m.rootScroll, `root overflows horizontally at ${testInfo.project.name}`).toBeLessThanOrEqual(m.rootClient + 1);

    // 2. The board exists and is not collapsed. A missing stylesheet or a broken
    //    wrapper shows up here as a near-zero height long before it shows up as
    //    a pixel diff.
    expect(m.picksVisible, '#picks must render').toBe(true);
    expect(m.board, 'a board container must render').not.toBeNull();
    expect(m.board.h, 'board collapsed to no height').toBeGreaterThan(200);
    expect(m.board.w, 'board collapsed to no width').toBeGreaterThan(240);

    // 3. Exactly one navbar and one footer. Two would mean both shells rendered;
    //    zero would mean the opt-in gate rejected the page, which is precisely
    //    the failure that a local pre-deploy run caught on 2026-08-10.
    expect(m.navCount, 'expected exactly one navbar (legacy or design-system)').toBe(1);
    expect(m.footerCount, 'expected exactly one footer').toBeGreaterThanOrEqual(1);

    // 4. Chrome must not sit on top of the board.
    expect(m.nav.bottom, 'navbar overlaps the board').toBeLessThanOrEqual(m.board.top + 1);
    expect(m.footer.top, 'footer overlaps the board').toBeGreaterThanOrEqual(m.board.bottom - 1);

    // 5. The controls a user needs are present. Counts are lower bounds, never
    //    exact, so a league being out of season cannot fail the build.
    expect(m.sportButtons, 'sports navigation lost its buttons').toBeGreaterThanOrEqual(5);
    expect(m.slip, 'the pick slip must render').not.toBeNull();
  });
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

  // REMOVED 2026-08-02: `Math.abs(stripeBottomVsViewport) <= 1` -- the stats
  // stripe was required to land exactly on the viewport bottom at EVERY size.
  // That only ever held at 1440x900. It was added on 2026-07-31 (39daf93b) and
  // never passed: that commit's own Regression Lock run failed, as did every
  // run after it. Satisfying it would mean shrinking the hero by 104px at
  // 1366x768 and 745px at 390x844 -- a hero rebalance on the owner-locked
  // homepage, which is precisely the change that was rejected. The shipped
  // design is the source of truth, so the obsolete flush-to-viewport rule is
  // gone and the real responsive requirements are asserted instead: no
  // horizontal overflow, nothing clipped, nothing overlapping, hero + stripe
  // rendered in full, usable nav, readable text, intended card spacing,
  // correct mobile stacking, and no late layout shift.
  for (const { width, height } of SIZES) {
    test(`hero/stripe/card layout locked @ ${width}x${height}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile', 'sizes are set explicitly; run once per size on desktop project');
      await page.setViewportSize({ width, height });
      await gotoRoute(page, '/');

      // Layout stability. The homepage ships prerendered content and then swaps
      // in live data, so SOME shift during initial hydration is by design and is
      // not what this guards. What must not happen is the page moving again once
      // it has settled. So: let it settle first, THEN start observing (no
      // `buffered`, which would replay the intended hydration shifts), and
      // require near-zero movement over the following window.
      await page.waitForTimeout(2500);
      await page.evaluate(() => {
        window.__cls = 0;
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) window.__cls += entry.value;
            }
          }).observe({ type: 'layout-shift' });
        } catch (e) { window.__cls = -1; }
      });
      await page.waitForTimeout(2500);

      const m = await page.evaluate(() => {
        const hero = document.querySelector('.hero');
        const grid = document.querySelector('.hero-grid');
        const stripe = document.querySelector('.bridge .bridge-in');
        const dash = document.querySelector('.dash');
        const card = document.querySelector('.spot');
        const nav = document.querySelector('nav') || document.querySelector('.ds-nav');
        if (!hero || !grid || !stripe || !dash) return { missing: true };

        const de = document.documentElement;
        const vw = de.clientWidth;
        const vh = de.clientHeight;
        const hr = hero.getBoundingClientRect();
        const sr = stripe.getBoundingClientRect();
        const dr = dash.getBoundingClientRect();
        const cr = card ? card.getBoundingClientRect() : null;
        const gr = grid.getBoundingClientRect();

        const rendered = (el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden'
            && cs.display !== 'none' && Number(cs.opacity) > 0.01;
        };
        const overlap = (a, b) => {
          if (!a || !b) return 0;
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          return (w > 1 && h > 1) ? Math.round(w * h) : 0;
        };

        // Anything sticking out past a viewport edge. An element that sits
        // inside a horizontal clipper is NOT an offender: the MLB ticker is a
        // paged strip, so its off-screen pages legitimately live to the right
        // of the viewport inside .ticker-games (overflow:hidden) and are
        // clipped rather than pushing the page wide. Walk the ancestor chain
        // and skip anything contained by such a clipper.
        const clippedHorizontally = (el) => {
          for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
            const cs = getComputedStyle(n);
            if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) return true;
          }
          return false;
        };
        const wideOffenders = [];
        document.querySelectorAll('body *').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed') return;
          if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) return;
          if (clippedHorizontally(el)) return;
          if (r.right > vw + 2 || r.left < -2) {
            wideOffenders.push((el.tagName + '.' + String(el.className || '').split(' ')[0]).slice(0, 44)
              + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
          }
        });

        // Smallest rendered font size among the hero's own copy.
        let minFont = 999;
        hero.querySelectorAll('h1,h2,h3,p,span,a,b,li').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) return;
          if (!el.textContent || !el.textContent.trim()) return;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (Number.isFinite(fs) && fs < minFont) minFont = fs;
        });

        const navCs = nav ? getComputedStyle(nav) : null;
        const navLinks = nav
          ? [...nav.querySelectorAll('a,button')].filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 8 && r.height > 8;
            }).length
          : 0;

        return {
          heroPadding: getComputedStyle(hero).padding,
          heroDisplay: getComputedStyle(hero).display,
          gridCols: getComputedStyle(grid).gridTemplateColumns,
          gapBelowStripe: hr.bottom - sr.bottom,
          dashTopVsViewport: dr.top - vh,
          stripeLeftMargin: sr.left,
          stripeRightMargin: vw - sr.right,
          stripeRadius: getComputedStyle(stripe).borderTopLeftRadius,
          heroFullBleed: Math.abs(hr.left) < 1 && Math.abs(vw - hr.right) < 1,
          cardVisible: cr ? cr.width : 0,
          navPresent: !!nav,
          docScrollWidth: de.scrollWidth,
          viewportWidth: vw,
          wideOffenders: wideOffenders.slice(0, 6),
          heroRendered: rendered(hero),
          stripeRendered: rendered(stripe),
          cardRendered: rendered(card),
          navRendered: rendered(nav),
          navLinks,
          stripeHeight: sr.height,
          stripeWithinDocument: sr.bottom <= Math.max(de.scrollHeight, de.clientHeight) + 2,
          overlapStripeDash: overlap(sr, dr),
          overlapGridStripe: overlap(gr, sr),
          overlapNavHero: (navCs && navCs.position !== 'fixed' && navCs.position !== 'sticky')
            ? overlap(nav.getBoundingClientRect(), gr) : 0,
          minHeroFontSize: minFont === 999 ? null : minFont,
          cardTop: cr ? cr.top : null,
          gridTop: gr.top,
          cls: window.__cls,
        };
      });

      expect(m.missing, 'hero, hero-grid, stats stripe and next section must all exist').toBeFalsy();

      // --- approved design invariants (unchanged) ---------------------------
      // Owner-confirmed 2026-08-14: the full-viewport composition IS the
      // desired homepage — nav + ticker + hero fill the screen, the stats
      // stripe begins at the viewport's bottom edge, and "Happening Right
      // Now" stays below the fold until the user scrolls.
      expect(m.heroDisplay, 'hero must be a flex column so the stripe can be pushed to its bottom edge').toBe('flex');
      // Owner-approved 2026-08-24 (Nima): hero compacted so the stats stripe
      // clears the fold on a laptop, top padding 43 -> 0. The static lock in
      // tests/homepage-approved-baseline-lock-test.js carries the same value.
      expect(m.heroPadding, 'hero padding must stay 0 (compact hero, stripe flush)').toBe('0px');
      expect(Math.abs(m.gapBelowStripe), 'stats stripe must sit flush on the hero bottom edge').toBeLessThanOrEqual(1);
      expect(m.dashTopVsViewport, `"Happening Right Now" must not be visible in the initial viewport at ${width}x${height}`).toBeGreaterThanOrEqual(-1);
      // full-width flush stripe (owner-requested 2026-08-01): no side margins, no rounded corners
      expect(Math.abs(m.stripeLeftMargin), 'stripe must span the full viewport width (no left margin)').toBeLessThanOrEqual(1);
      expect(Math.abs(m.stripeRightMargin), 'stripe must span the full viewport width (no right margin)').toBeLessThanOrEqual(1);
      expect(m.stripeRadius, 'stripe must have no rounded corners (full-width flush design)').toBe('0px');
      expect(m.heroFullBleed, 'hero background must span the full viewport width').toBe(true);

      // --- no horizontal overflow -------------------------------------------
      expect(
        m.wideOffenders,
        `no element may extend past the viewport edge at ${width}x${height}`
      ).toEqual([]);
      expect(
        m.docScrollWidth,
        `page must not scroll horizontally at ${width}x${height}`
      ).toBeLessThanOrEqual(m.viewportWidth + 1);

      // --- nothing clipped; hero + stripe rendered in full -------------------
      expect(m.heroRendered, `hero must render at ${width}x${height}`).toBe(true);
      expect(m.stripeRendered, `stats stripe must render at ${width}x${height}`).toBe(true);
      expect(m.cardRendered, `Capper of the Week card must render at ${width}x${height}`).toBe(true);
      expect(m.stripeHeight, `stats stripe must not collapse at ${width}x${height}`).toBeGreaterThan(20);
      expect(m.stripeWithinDocument, `stats stripe must not be clipped out of the document at ${width}x${height}`).toBe(true);

      // --- nothing overlapping ----------------------------------------------
      expect(m.overlapStripeDash, `stats stripe must not overlap "Happening Right Now" at ${width}x${height}`).toBe(0);
      expect(m.overlapGridStripe, `hero content must not overlap the stats stripe at ${width}x${height}`).toBe(0);
      expect(m.overlapNavHero, `navbar must not overlap hero content at ${width}x${height}`).toBe(0);

      // --- navigation usable -------------------------------------------------
      expect(m.navPresent, 'navbar must be present').toBe(true);
      expect(m.navRendered, `navbar must render at ${width}x${height}`).toBe(true);
      expect(m.navLinks, `navbar must expose tappable links at ${width}x${height}`).toBeGreaterThan(0);

      // --- text readable -----------------------------------------------------
      // 10.5, not 11: the 2026-08-30 legibility reconcile (3a3b7971) stepped the
      // hero down by 0.91, which takes its smallest label to 10.5px.
      expect(m.minHeroFontSize, `hero text must stay readable at ${width}x${height}`).toBeGreaterThanOrEqual(10.5);

      // --- card spacing + mobile stacking ------------------------------------
      const cols = m.gridCols.trim().split(/\s+/);
      if (width > 1400) {
        // 568 / 502: the 2026-08-30 legibility reconcile (3a3b7971) steps the
        // 624px / 552px approved columns down by 0.91 in two desktop bands.
        expect(cols[cols.length - 1], `capper-card column must be 568px at ${width}px`).toBe('568px');
      } else if (width > 1180) {
        expect(cols[cols.length - 1], `capper-card column must be 502px at ${width}px`).toBe('502px');
      } else {
        expect(cols.length, `hero must stack to a single column at ${width}px`).toBe(1);
        // stacked means the card sits BELOW the copy, not beside it
        expect(m.cardTop, `capper card must stack below the hero copy at ${width}px`).toBeGreaterThan(m.gridTop);
      }
      expect(m.cardVisible, 'Capper of the Week card must render').toBeGreaterThan(200);

      // --- no unexpected layout shift ---------------------------------------
      if (m.cls >= 0) {
        expect(
          m.cls,
          `homepage must stay still once settled at ${width}x${height} (measured CLS ${m.cls})`
        ).toBeLessThan(0.02);
      }
    });
  }
});

test.describe('core route and content locks', () => {
  test('critical public routes render and do not 404 or blank', async ({ page }) => {
    for (const route of ROUTES) {
      let response = null;
      try {
        response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      } catch (e) {
        // A route whose own script redirects before DOMContentLoaded (the wallet
        // auth gate on mobile, 2026-09-02) aborts the first navigation with
        // net::ERR_ABORTED. That is the page working, not failing: follow it and
        // judge the page it lands on.
        if (!/ERR_ABORTED/.test(String(e))) throw e;
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
        response = await page.request.get(page.url());
      }
      expect(response && response.status(), `${route.path} must not 404`).not.toBe(404);
      await expect(page.locator('body'), `${route.path} body should be visible`).toBeVisible();
      const text = await visibleText(page);
      expect(text.trim().length, `${route.path} should not be blank`).toBeGreaterThan(80);
      expect(text).not.toMatch(/\blorem ipsum\b|preview version/i);
    }
  });

  test('shared navigation remains reachable', async ({ page }) => {
    // Not /sportsbook/: since 2026-08-31 (hideOnOwnPage in tmr-ds-nav.js) the
    // Sportsbook trigger is dropped on the page it names, so the shared nav
    // is asserted from a neighbouring route instead.
    await gotoRoute(page, '/leaderboards/');
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
    // Saving/tracking still routes through login. Since the DS shell
    // migration (2026-08-14) the login link lives in the shared nav; on the
    // mobile project it sits behind the nav toggle, so open it first.
    const loginLink = page.locator('a[href*="/login/"]').first();
    if (!(await loginLink.isVisible().catch(() => false))) {
      await page.locator('.ds-nav-toggle').first().click();
    }
    await expect(page.locator('a[href*="/login/"]').first()).toBeVisible();
  });
});

test.describe('sportsbook functional locks', () => {
  test('sports tabs are clickable and games area stays populated', async ({ page }) => {
    await waitForSportsbook(page);
    for (const sport of SPORT_TABS) {
      await clickSport(page, sport);
      // Polled, not snapshotted. The comment below already knew the board can
      // still be filling in when innerText() is read -- but the length check
      // right under it was a one-shot, so an out-of-season sport whose empty
      // notice had not painted yet ("No upcoming NBA games with posted odds
      // right now.") failed before the poll under it ever ran (2026-09-04).
      await expect
        .poll(async () => (await visibleBoard(page).innerText()).trim().length,
          { message: `${sport} board should not collapse to empty`, timeout: 30000 })
        .toBeGreaterThan(20);
      expect(await visibleBoard(page).innerText()).not.toMatch(/My Pick History/i);
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
    // The classic switcher was a tablist; the v2 switcher is a row of
    // button.sbn-cat with no role. marketTab() takes either, so the lock is on
    // the market being selectable, not on which element implements it.
    await marketTab(page, /Game Lines/i).click();
    await expect(visibleBoard(page)).toBeVisible();
    const teamTotals = marketTab(page, /Team Totals/i);
    if (await teamTotals.count()) {
      await teamTotals.click();
      await expect(visibleBoard(page)).toContainText(/Team Totals|not posted|not offered|temporarily unavailable|Matchup|ML|O\s*\d|U\s*\d/i);
    }
    // PROPS_PICKABLE_20260608 made Player Props a real, pickable market tab —
    // the old "props must not appear" lock inverted into: the tab must exist.
    await expect(marketTab(page, /Player Props/i)).toBeVisible({ timeout: 30000 });
  });

  test('wager buttons select a pick, odds are display-only, and logged-out submit requires login', async ({ page }) => {
    await waitForSportsbook(page);
    await selectSportWithPostedLines(page);
    const pickButton = await firstEnabledPickButton(page);
    await pickButton.click();
    const slip = page.locator(SLIP).first();
    await expect(slip).toBeVisible();
    // The point of this assertion has always been that the price the board
    // posted is the price that gets recorded — a visitor cannot type their own.
    // The classic slip put the price in a readonly #pickOddsInput; the v2 slip
    // prints it as text and offers no odds field at all, which satisfies the
    // same rule more completely. So: if an odds field exists it must be
    // uneditable, and either way nothing in the slip may accept typed odds.
    const odds = page.locator('#pickOddsInput');
    if (await odds.count()) {
      const oddsReadonly = await odds.first().evaluate(
        (node) => node.readOnly || node.disabled || node.getAttribute('aria-readonly') === 'true');
      expect(oddsReadonly, 'odds must not be manually editable').toBe(true);
    } else {
      const editableOdds = await slip.locator('input:not([readonly]):not([disabled])').evaluateAll(
        (nodes) => nodes.filter((n) => /odds|price/i.test(
          (n.id || '') + ' ' + (n.className || '') + ' ' + (n.getAttribute('aria-label') || '')
          + ' ' + (n.name || ''))).length);
      expect(editableOdds, 'the slip must not offer an editable odds field').toBe(0);
    }
    await expect(page.locator(STAKE_PREVIEW).first()).toContainText(/Risk/i);
    await expect(page.locator(STAKE_PREVIEW).first()).toContainText(/To Win/i);
    // The slip labels the market and prints the price ("Spread - -200"); it only
    // prints the literal word "Odds" for some markets, so pinning that word made
    // the check depend on which button happened to be first on the board. Assert
    // the thing that actually matters: a real American price is shown in the slip.
    await expect(
      page.locator(SLIP).first(),
      'the slip must show the price of the selected wager'
    ).toContainText(/(Odds|[+-]\d{2,4})/i);
    // On a phone the v2 slip is a bottom sheet parked off-screen
    // (transform: translateY) behind a summary bar; tapping #sbnBar sets
    // html.sbn-slip-open and raises it. Without that tap the Lock button is
    // visible and enabled but permanently outside the viewport, which is what
    // the mobile project timed out on. This is the product's own flow, not a
    // workaround: a phone user taps the bar to open their slip.
    const slipBar = page.locator('#sbnBar:visible');
    if (await slipBar.count()) await slipBar.first().click();
    // :visible matters. The page still carries the classic slip's markup with
    // display:none, and .first() in DOM order picked that hidden button, so the
    // click sat waiting for an element that can never become actionable.
    const submit = page.locator(
      '.sbn-submit:visible, .submit-pick-btn:visible, .lock-pick-btn:visible, '
      + 'button:visible:has-text("Lock"), button:visible:has-text("Submit")').first();
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
    const input = page.locator(`#ttSlipUnits, #unitsInput, ${SLIP} input[type="number"]`).first();
    const preview = page.locator(STAKE_PREVIEW).first();
    await expect(input).toBeVisible();
    await expect(preview).toBeVisible();
    for (const value of UNIT_VALUES) {
      await input.fill(value);
      // Both events. The classic slip recalculated on `input`; the v2 slip
      // commits on `change`, so dispatching only `input` left the preview
      // showing the previous stake and the lock failed on a slip that works.
      // What is locked here is that the preview follows the units, not which
      // event the field happens to listen on.
      await input.dispatchEvent('input');
      await input.dispatchEvent('change');
      await expect(preview, `stake preview should reflect ${value} units`).toContainText(new RegExp(value.replace('.', '\\.') + '|Risk|To Win'));
    }
  });

  // A11Y_20260904. The v2 board shipped a market switcher of plain buttons and
  // a units field whose "Units" label had no `for`, so a screen reader got
  // seven unrelated buttons with no current one and an unnamed number box.
  // Restored in afed2baea; this is what stops it going again, and it is
  // deliberately about semantics rather than markup, so it holds for whichever
  // board is serving.
  test('the market switcher is a real tablist and the units field is labelled', async ({ page }) => {
    await waitForSportsbook(page);
    await selectSportWithPostedLines(page);

    const tabs = page.getByRole('tab');
    await expect(tabs.first(), 'the market switcher must expose its entries as tabs')
      .toBeVisible({ timeout: 30000 });

    const semantics = await page.evaluate(() => {
      const tabEls = Array.from(document.querySelectorAll('[role="tab"]'))
        .filter((t) => t.getClientRects().length);
      const list = tabEls.length ? tabEls[0].closest('[role="tablist"]') : null;
      const selected = tabEls.filter((t) => t.getAttribute('aria-selected') === 'true');
      const controlled = selected.length ? selected[0].getAttribute('aria-controls') : null;
      const panel = controlled ? document.getElementById(controlled) : null;
      return {
        tabs: tabEls.length,
        inTablist: !!list,
        tablistNamed: !!(list && (list.getAttribute('aria-label') || list.getAttribute('aria-labelledby'))),
        selected: selected.length,
        stateOnEvery: tabEls.every((t) => t.hasAttribute('aria-selected')),
        inTabOrder: tabEls.filter((t) => t.getAttribute('tabindex') === '0').length,
        panelRole: panel ? panel.getAttribute('role') : null,
        panelLabelResolves: !!(panel && document.getElementById(panel.getAttribute('aria-labelledby') || '')),
      };
    });

    expect(semantics.tabs, 'the switcher should expose several market tabs').toBeGreaterThanOrEqual(2);
    expect(semantics.inTablist, 'market tabs must live inside a role="tablist"').toBe(true);
    expect(semantics.tablistNamed, 'the tablist must carry an accessible name').toBe(true);
    expect(semantics.stateOnEvery, 'every tab must publish aria-selected, not just the current one').toBe(true);
    expect(semantics.selected, 'exactly one market tab is the selected one').toBe(1);
    // Roving tabindex: the selected tab is the one in the page's tab order, and
    // it is the only one, or arrowing through the list is meaningless.
    expect(semantics.inTabOrder, 'exactly one tab may be in the tab order (roving tabindex)').toBe(1);
    if (semantics.panelRole !== null) {
      expect(semantics.panelRole, 'the tab must control a tabpanel').toBe('tabpanel');
      expect(semantics.panelLabelResolves, 'the tabpanel must be labelled by its tab').toBe(true);
    }

    // Arrow keys walk the tablist. That is the whole point of a roving tabindex,
    // and it is what a keyboard user has instead of a mouse.
    const before = await page.evaluate(() =>
      (document.querySelector('[role="tab"][aria-selected="true"]') || {}).id || null);
    await page.locator('[role="tab"][aria-selected="true"]').first().focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() =>
      (document.querySelector('[role="tab"][aria-selected="true"]') || {}).id || null);
    expect(after, 'ArrowRight must move the selected market tab').not.toBe(before);

    // And the units field must be named by something a screen reader can read.
    const pickButton = await firstEnabledPickButton(page);
    await pickButton.click();
    const units = page.locator(`#ttSlipUnits, #unitsInput, ${SLIP} input[type="number"]`).first();
    await expect(units).toBeVisible();
    const named = await units.evaluate((node) => ({
      labels: node.labels ? node.labels.length : 0,
      ariaLabel: node.getAttribute('aria-label') || '',
      labelledBy: node.getAttribute('aria-labelledby') || '',
    }));
    // An ASSOCIATION, not just a string. A bare aria-label would satisfy a name
    // check while the visible "Units" text next to the field still labelled
    // nothing -- which is exactly the state afed2baea fixed, so accepting it
    // here would leave the regression free to come back.
    expect(
      named.labels > 0 || !!named.labelledBy,
      'the units field must be associated with its visible label (<label for> or '
      + 'aria-labelledby), not merely given an aria-label that duplicates it'
    ).toBe(true);
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
  // requirement) as the discovery source.
  //
  // It came back on 2026-08-11 (member `diddy`) because that fix only shortened
  // the race: /u/ is baked by CI, newest-member is live from the DB, so the link
  // is published before the page is. The real fix is the edge worker serving the
  // compact page for any directory member whose bake has not landed, and the
  // assertions below are written to fail on the intermittency rather than wait
  // it out.
  test('newest member link matches the canonical /u/<username>/ route used by directory cards, and resolves', async ({ page, request }) => {
    const api = await request.get('https://trustmyrecord-api.onrender.com/api/users/newest-member');
    expect(api.ok(), 'newest-member API should respond').toBeTruthy();
    const { member } = await api.json();
    test.skip(!member, 'no eligible newest member returned right now');

    await gotoRoute(page, '/handicappers/');
    const newestLink = page.locator('#hmNewestMember a, .hm-newest-member a').first();
    await expect(newestLink, 'newest member link should render').toBeVisible({ timeout: 20000 });

    const newestHref = await newestLink.getAttribute('href');
    // The API's profile_url IS the canonical answer (backend utils/profileUrl.js).
    // The widget must render that value, not a second derivation of it.
    expect(member.profile_url, 'newest-member API must return a canonical profile_url').toBe(`/u/${encodeURIComponent(member.username)}/`);
    expect(newestHref, 'newest-member link must render the API\'s profile_url verbatim, not /profile/?user= or a locally rebuilt href').toBe(member.profile_url);

    // Same href-building convention must be used by ordinary directory cards
    // elsewhere on this same page -- one shared pattern, not two link builders.
    const cardHrefs = await page.locator('a[href^="/u/"]').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(cardHrefs.length, 'directory should render at least one member card /u/ link').toBeGreaterThan(0);
    for (const href of cardHrefs) {
      expect(href, `every /u/ link on the directory must follow the /u/<username>/ shape (got ${href})`).toMatch(/^\/u\/[^/]+\/$/);
    }

    // NO retry tolerance, deliberately. The previous version of this assertion
    // polled four times over 45s "because the bake isn't instant", which is
    // exactly why the 404 kept reaching real visitors: the test was written
    // around the race instead of against it. The edge worker now guarantees this
    // URL exists from the instant the account does (workers/home-ssr/worker.mjs,
    // EDGE_FALLBACK_20260810), so the FIRST request must already be 200.
    // Deliberately absolute, NOT page.goto(): the guarantee is a production edge
    // behaviour, and this suite's default baseURL is the local static server
    // (scripts/serve-static-regression.js), where an unbaked member legitimately
    // has no file and the worker is not in the path at all. Checking the local
    // server here would assert something the fix never claimed.
    //
    // RACE_20260811: the failure was INTERMITTENT -- the edge fell back to the
    // origin 404 only when an upstream call ran slow -- so one green request
    // proves nothing. Every one of these must be 200, starting with the first:
    // no polling, no grace period for the bake. That tolerance is what let the
    // 404 keep reaching real visitors.
    const liveProfileUrl = `https://trustmyrecord.com${newestHref}`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const live = await request.get(liveProfileUrl);
      expect(live.status(), `${liveProfileUrl} must be 200 on every request (attempt ${attempt + 1}/10) -- an intermittent 404 here is the bug, not flake`).toBe(200);
      const body = await live.text();
      expect(body, 'must not serve the site 404 page under a 200').not.toMatch(/page not found/i);
      expect(body, 'the page served must actually be this member\'s profile').toContain(member.username);
    }
  });
});
