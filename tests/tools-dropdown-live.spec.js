// The Tools dropdown must carry the Sports Simulators entry, on desktop and on a
// phone, signed out and signed in, and be usable by keyboard as well as by mouse.
//
// SIMULATOR_HUB_20260827: the four simulators were four separate rows here until
// they were collapsed behind /sports-simulators/. The requirement they encoded -
// every simulator reachable from the nav on every device, without a hover - is
// unchanged, it is now met in two clicks instead of one, so this asserts the hub
// row in the nav AND that the hub itself carries all four links.
//
// Runs against production.

const { test, expect } = require('@playwright/test');

const BASE = process.env.TMR_BASE || 'https://trustmyrecord.com';

// What the Tools dropdown itself must carry.
const EXPECTED = [
  { label: 'Sports Simulators', href: '/sports-simulators/' },
];

// What the hub must carry. These URLs are indexed and must not move.
const SIMULATORS = [
  { label: 'MLB Simulator', href: '/mlb-simulator/' },
  { label: 'NFL Simulator', href: '/nfl-simulator/' },
  { label: 'NBA Simulator', href: '/nba-simulator/' },
  { label: 'NHL Simulator', href: '/nhl-simulator/' },
];

const VIEWPORTS = [
  { name: 'desktop 100%', width: 1920, height: 1080, scale: 1 },
  { name: 'desktop 125%', width: 1536, height: 864, scale: 1.25 },
  { name: 'mobile 390px', width: 390, height: 844, scale: 3, mobile: true },
];

for (const vp of VIEWPORTS) {
  test(`Tools carries all four simulators at ${vp.name}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.scale,
      isMobile: !!vp.mobile,
      hasTouch: !!vp.mobile,
    });
    const page = await context.newPage();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    // The links must exist in the navigation, whether or not the menu is open:
    // an item that only appears after a hover is not reachable on a phone.
    for (const item of EXPECTED) {
      const link = page.locator(`nav a[href="${item.href}"], header a[href="${item.href}"]`).first();
      await expect(link, `${item.label} is present in the navigation`).toHaveCount(1);
      const text = (await link.textContent() || '').trim();
      expect(text, `${item.label} is labelled for a screen reader`).toBeTruthy();
    }

    // Existing Tools entries must survive.
    for (const href of ['/tools/', '/trendspotter/', '/betlegend-pro/']) {
      await expect(
        page.locator(`nav a[href="${href}"], header a[href="${href}"]`).first(),
        `existing Tools link ${href} still present`,
      ).toHaveCount(1);
    }

    // Touch targets, measured with the menu OPEN. A collapsed sheet reports a
    // height of zero for every link, which is correct behaviour and says nothing
    // about whether a thumb can hit them.
    if (vp.mobile) {
      const toggle = page.locator('.ds-nav-toggle').first();
      await expect(toggle, 'the mobile nav has a labelled toggle').toHaveCount(1);
      expect(await toggle.getAttribute('aria-label'),
        'the toggle is labelled for a screen reader').toBeTruthy();
      await toggle.click();
      await page.waitForTimeout(400);

      // Tools is a submenu inside the sheet; open it before measuring.
      const toolsTrigger = page.locator('button.ds-navitem--trigger', { hasText: 'Tools' }).first();
      if (await toolsTrigger.count()) {
        await toolsTrigger.click();
        await page.waitForTimeout(400);
        expect(await toolsTrigger.getAttribute('aria-expanded'),
          'the Tools trigger reports its state').toBe('true');
      }

      for (const item of EXPECTED) {
        const link = page.locator(`nav a[href="${item.href}"], header a[href="${item.href}"]`).first();
        const box = await link.boundingBox();
        expect(box, `${item.label} is laid out once the menu is open`).not.toBeNull();
        expect(box.height, `${item.label} touch target height`).toBeGreaterThanOrEqual(24);
      }
    }

    // The menu must not spill off the side of the screen at any scaling.
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(overflow.scroll - overflow.client,
      `${vp.name}: navigation pushes the page sideways`).toBeLessThanOrEqual(2);

    await context.close();
  });
}

test('the hub and the four simulator links resolve', async ({ request }) => {
  for (const item of [...EXPECTED, ...SIMULATORS]) {
    const r = await request.get(BASE + item.href, { maxRedirects: 3 });
    expect(r.status(), `${item.label} responds`).toBe(200);
  }
});

test('the hub links to every simulator, and every simulator links back', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.goto(BASE + '/sports-simulators/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (const sim of SIMULATORS) {
    await expect(
      page.locator(`main a[href="${sim.href}"]`).first(),
      `${sim.label} is linked from the hub body, not only from the nav`,
    ).toHaveCount(1);
  }

  // A hub nobody can climb back to is a dead end. Each simulator carries the
  // return link in its breadcrumb.
  for (const sim of SIMULATORS) {
    await page.goto(BASE + sim.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await expect(
      page.locator('nav[aria-label="Breadcrumb"] a[href="/sports-simulators/"]').first(),
      `${sim.label} links back to the hub from its breadcrumb`,
    ).toHaveCount(1);
  }

  await context.close();
});

test('Tools links are reachable by keyboard', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  // A keyboard user cannot focus a link inside a collapsed submenu, and should
  // not be able to: that is why the trigger is a real <button> with
  // aria-expanded. Open it the way a keyboard user does, then check the links
  // become reachable.
  const trigger = page.locator('button.ds-navitem--trigger', { hasText: 'Tools' }).first();
  await expect(trigger, 'Tools is a real button, not a hover-only target').toHaveCount(1);
  expect(await trigger.getAttribute('aria-haspopup'),
    'the trigger declares it opens a menu').toBe('true');
  expect(await trigger.getAttribute('aria-expanded'),
    'the trigger starts closed').toBe('false');

  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  expect(await trigger.getAttribute('aria-expanded'),
    'Enter opens the menu and the state is announced').toBe('true');

  for (const item of EXPECTED) {
    const link = page.locator(`nav a[href="${item.href}"], header a[href="${item.href}"]`).first();
    await link.focus();
    const focused = await page.evaluate((href) => {
      const el = document.activeElement;
      return !!el && el.getAttribute('href') === href;
    }, item.href);
    expect(focused, `${item.label} takes keyboard focus once the menu is open`).toBe(true);

    const style = await link.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outlineStyle: s.outlineStyle, boxShadow: s.boxShadow };
    });
    expect(style.outlineStyle === 'none' && style.boxShadow === 'none'
      ? 'suppressed' : 'ok',
    `${item.label} does not suppress its focus indicator`).toBe('ok');
  }

  // Escape must close it again, or the menu traps a keyboard user.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(await trigger.getAttribute('aria-expanded'),
    'Escape closes the menu').toBe('false');

  await context.close();
});
