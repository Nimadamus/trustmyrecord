/**
 * Visual QA for the TMR Match redesign. Static only: every /api call is stubbed in the
 * browser, nothing reaches a backend and nothing can move TMR. Run against the static
 * server on 5501.
 */
const { test, expect } = require('@playwright/test');

const BASE = process.env.TMR_STATIC_BASE || 'http://localhost:5501';
const URL = BASE + '/tmr-match/';

const OFFERS = [
  { id: 1, maker_id: 7, maker_username: 'nima', sport: 'MLB', event_ref: 'giants-at-dodgers',
    event_label: 'San Francisco Giants at Los Angeles Dodgers', market: 'spread',
    selection: 'Giants -1.5', side: 'for', price_american: 165, quantity: 500,
    filled_quantity: 120, remaining: 380, status: 'partially_filled', created_at: '2026-08-31T18:05:00Z' },
  { id: 2, maker_id: 9, maker_username: 'littlevenom', sport: 'MLB', event_ref: 'giants-at-dodgers',
    event_label: 'San Francisco Giants at Los Angeles Dodgers', market: 'total',
    selection: 'Over 8.5', side: 'against', price_american: -115, quantity: 1000,
    filled_quantity: 0, remaining: 1000, status: 'open', created_at: '2026-08-31T17:40:00Z' },
  { id: 3, maker_id: 11, maker_username: 'a_very_long_member_name_here', sport: 'NFL',
    event_ref: 'chiefs-at-bills', event_label: 'Kansas City Chiefs at Buffalo Bills',
    market: 'moneyline', selection: 'Bills', side: 'for', price_american: -140,
    quantity: 2500, filled_quantity: 500, remaining: 2000, status: 'open',
    created_at: '2026-08-31T16:00:00Z' },
];

const DEPTH = [
  { side: 'for', selection: 'Giants -1.5', price_american: 165, available: 380, event_label: 'Giants at Dodgers' },
  { side: 'against', selection: 'Over 8.5', price_american: -115, available: 1000, event_label: 'Giants at Dodgers' },
  { side: 'for', selection: 'Bills', price_american: -140, available: 2000, event_label: 'Chiefs at Bills' },
];

async function stub(page, { offers, depth }) {
  // A signed-in view is the one that carries the balance card, the Post an Offer CTA and
  // the take buttons, so that is the view under test.
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'e2e-visual-stub');
    localStorage.setItem('token', 'e2e-visual-stub');
  });
  await page.route('**/api/**', (route) => {
    const u = route.request().url();
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.includes('/tmr-match/offers')) return json({ offers });
    if (u.includes('/tmr-match/depth')) return json({ depth });
    if (u.includes('/tmr-match/meta')) return json({ min_quantity: 10 });
    if (u.includes('/tmr-match/mine')) return json({ offers: [] });
    if (u.includes('/tmr-match/fills')) return json({ fills: [] });
    return json({});
  });
}

/** No element may push the document wider than the viewport. */
async function noOverflow(page) {
  const over = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return { scroll: document.documentElement.scrollWidth, w };
  });
  expect(over.scroll, 'no horizontal overflow').toBeLessThanOrEqual(over.w + 1);
}

/** Nothing readable may render below 13px. */
async function noTinyText(page) {
  const tiny = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#mk *').forEach((el) => {
      const t = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3 && n.textContent.trim())
        .map((n) => n.textContent.trim()).join(' ');
      if (!t) return;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return;
      const px = parseFloat(s.fontSize);
      if (px < 12.9) out.push(el.className + ' | ' + px + 'px | ' + t.slice(0, 40));
    });
    return out;
  });
  expect(tiny, 'no text under 13px').toEqual([]);
}

for (const [name, width, height] of [['desktop', 1440, 900], ['wide', 1920, 1080], ['mobile', 390, 844]]) {
  test(`${name}: populated board`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await stub(page, { offers: OFFERS, depth: DEPTH });
    await page.goto(URL);
    await expect(page.locator('#mkBody')).toBeVisible();
    await expect(page.locator('#mk h1')).toHaveText(/TMR Match/i);
    await expect(page.locator('#listMarket .row')).toHaveCount(3);
    await expect(page.locator('#cOpen')).toHaveText('3');
    await expect(page.locator('#cAvail')).toHaveText('3,380');
    await noOverflow(page);
    await noTinyText(page);
    await page.screenshot({ path: `test-results/mk-${name}-market.png`, fullPage: true });

    // tabs still switch panels
    await page.click('.mk-tab[data-tab="depth"]');
    await expect(page.locator('#panel-depth')).toBeVisible();
    await expect(page.locator('#panel-market')).toBeHidden();
    await expect(page.locator('#ladder .rung')).toHaveCount(3);
    await expect(page.locator('#ladder .rung').first()).toContainText('% of the board');
    await noOverflow(page);
    await page.screenshot({ path: `test-results/mk-${name}-depth.png`, fullPage: true });

    await page.click('.mk-tab[data-tab="market"]');
    await expect(page.locator('#panel-market')).toBeVisible();
  });

  test(`${name}: empty board`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await stub(page, { offers: [], depth: [] });
    await page.goto(URL);
    await expect(page.locator('#emptyMarket')).toBeVisible();
    await expect(page.locator('#emptyMarket strong')).toHaveText('No open offers yet');
    await expect(page.locator('#emptyCta .mkb')).toHaveCount(2);
    await noOverflow(page);
    await noTinyText(page);
    await page.screenshot({ path: `test-results/mk-${name}-empty.png`, fullPage: true });
  });
}

test('post an offer is the strongest action, and it opens the form', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page, { offers: OFFERS, depth: DEPTH });
  await page.goto(URL);
  const cta = page.locator('#ctaPost');
  await expect(cta).toBeVisible();
  const box = await cta.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(50);
  expect(box.y).toBeLessThan(900);           // above the fold
  await cta.click();
  await expect(page.locator('#panel-create')).toBeVisible();
  await expect(page.locator('#createForm')).toBeVisible();
  await page.screenshot({ path: 'test-results/mk-desktop-create.png', fullPage: true });
});
