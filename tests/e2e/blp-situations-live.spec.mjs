import { test, expect } from '@playwright/test';

/**
 * The situational-filter interaction, on the LIVE page.
 *
 * Not the stubbed suite: this drives https://trustmyrecord.com/betlegend-pro/app/
 * signed in, against the real filter library and the real engine, and it walks
 * the exact sequence a first-time user walks.
 */

const SITE = 'https://trustmyrecord.com';
const TOKEN = process.env.TMR_TOKEN ?? '';
const OUT = process.env.BLP_SHOT_DIR || 'artifacts/blp-situations-live';

test.skip(!TOKEN, 'set TMR_TOKEN');

/** One area per thing a situation is about: 't1' (away), 't2' (home), 'game'. */
const area = (page, b = 't1') => page.locator('#sitBody-' + b);
const list = area;
const head = (page, b = 't1') => page.locator(`.sit-head[data-toggle="${b}"]`);
/** By engine id, not by wording: "Previous game result" is also a substring of
 *  "Opponent's previous game result", and the live library offers both. */
const add = (page, key) => page.locator(`[data-add="${key}"]`);
const row = (page, key) => page.locator(`.sit-active .cond:has([data-remove="${key}"])`);

async function openApp(page, calls) {
  await page.addInitScript((token) => {
    localStorage.setItem('trustmyrecord_token', token);
  }, TOKEN);
  if (calls) {
    page.on('request', (r) => {
      if (r.method() === 'POST' && /matchup-historical/.test(r.url())) {
        try { calls.push(JSON.parse(r.postData() || '{}')); } catch { /* ignore */ }
      }
    });
  }
  await page.goto(`${SITE}/betlegend-pro/app/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#mAway')).toBeVisible({ timeout: 90_000 });
  // The team list arrives from the API, which is a free instance and cold
  // often enough to fail one call. The page offers a retry for exactly that,
  // so use it rather than failing the run on the engine's nap; the fetch
  // itself is not what any of these specs is testing.
  await expect.poll(async () => {
    if (await page.locator('#teamsErr').isVisible().catch(() => false)) {
      await page.locator('#teamsRetry').click().catch(() => {});
    }
    return page.locator('#mAway option').count();
  }, { timeout: 180_000, intervals: [1_000] }).toBeGreaterThan(5);
}

/**
 * Choose the matchup.
 *
 * Plain selects, deliberately: the page used to reload under the reader a beat
 * after load, and a helper that retried until the selection stuck would hide
 * that coming back. If a selection does not hold here, the suite should say so.
 */
async function chooseMatchup(page, away = 'New York Yankees', home = 'Boston Red Sox') {
  await expect(page.locator('#mAway')).toBeEnabled({ timeout: 120_000 });
  await page.locator('#mAway').selectOption(away);
  await page.locator('#mHome').selectOption(home);
  await expect(head(page)).toBeEnabled({ timeout: 30_000 });
}

/** Open one area's situation list (a click on the team's own header). */
async function openList(page, b = 't1') {
  if (await area(page, b).isHidden()) await head(page, b).click();
  await expect(area(page, b)).toBeVisible();
}

test('a choice made as early as the UI allows survives every late load', async ({ page }) => {
  test.setTimeout(300_000);
  const navigations = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  const calls = [];
  await openApp(page, calls);

  // The earliest the UI permits: the team selects are disabled and read
  // "Loading…" until the list lands, so this is the first possible moment.
  await expect(page.locator('#mAway')).toBeEnabled({ timeout: 120_000 });
  await page.locator('#mAway').selectOption('New York Yankees');
  await page.locator('#mHome').selectOption('Boston Red Sox');

  // Now sit through everything that lands late: the entitlement call, the
  // filter library, the coverage, the free preview, and the service worker
  // taking control of a page that was not controlled when it loaded.
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(8_000);

  expect(navigations.length, `main-frame navigations: ${navigations.join(', ')}`).toBe(1);
  await expect(page.locator('#mAway')).toHaveValue('New York Yankees');
  await expect(page.locator('#mHome')).toHaveValue('Boston Red Sox');
  await expect(head(page)).toBeEnabled();

  // A situation added the instant it is unlocked must be just as durable.
  await openList(page);
  await add(page, 't1|prev_result').click();
  const prev = row(page, 't1|prev_result');
  await expect(prev).toHaveCount(1);
  await prev.locator('select').selectOption('loss');

  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(8_000);

  expect(navigations.length).toBe(1);
  await expect(page.locator('#mAway')).toHaveValue('New York Yankees');
  await expect(page.locator('.sit-active .cond')).toHaveCount(1);
  await expect(prev.locator('select')).toHaveValue('loss');
  await expect(page.locator('#filterCount')).toContainText('1 situation');

  // And the report still runs off exactly what is on screen.
  await page.locator('#mSubmit').click();
  await expect(page.locator('#mResult')).toBeVisible({ timeout: 240_000 });
  await expect.poll(() => calls.length, { timeout: 240_000 }).toBeGreaterThan(0);
  expect(calls.at(-1)).toMatchObject({
    team_1: 'New York Yankees', team_2: 'Boston Red Sox',
    team_1_filters: { prev_result: 'loss' },
  });
  expect(navigations.length).toBe(1);
});

test('the locked state explains itself, and lifts the moment the matchup is valid', async ({ page }) => {
  test.setTimeout(180_000);
  await openApp(page);

  await expect(page.locator('#addCondHint'))
    .toContainText('Choose two different teams above to unlock situational filters.');
  await expect(head(page, 'game')).toBeDisabled();
  await expect(head(page)).toBeDisabled();
  await expect(page.locator('#sitCta-t1')).toHaveText('Add situations');
  await page.screenshot({ path: `${OUT}/V1-locked.png`, fullPage: true });

  // A team against itself is not a matchup: the lock stays stated.
  await page.locator('#mAway').selectOption('New York Yankees');
  await page.locator('#mHome').selectOption('New York Yankees');
  await expect(head(page)).toBeDisabled();
  await expect(page.locator('#addCondHint')).toBeVisible();

  // Two different teams, and it lifts with no reload.
  await chooseMatchup(page);
  await expect(page.locator('#addCondHint')).toBeHidden();
  await expect(head(page)).toBeEnabled();
});

test('select the situation, then answer it — three shapes of control, live', async ({ page }) => {
  test.setTimeout(300_000);
  const calls = [];
  await openApp(page, calls);
  await chooseMatchup(page);

  // Nothing on screen until the reader puts it there.
  await expect(page.locator('.sit-active .cond')).toHaveCount(0);
  await expect(page.locator('#sitCount-t1')).toContainText('No situations added');

  await openList(page);
  await expect(list(page)).toBeVisible();
  // Names only. No value control exists anywhere in the list.
  await expect(list(page).locator('select, input[type="number"], input[type="text"]')).toHaveCount(0);
  await expect(list(page)).toContainText('Previous game result');
  await expect(list(page)).toContainText('Opposing starter handedness');
  await expect(list(page)).toContainText('Minimum rest');
  await page.screenshot({ path: `${OUT}/V2-list.png`, fullPage: true });

  // 1. Previous game result — a win/loss pick-one, on the named away team.
  await add(page, 't1|prev_result').click();
  await expect(page.locator('#sitCount-t1')).toContainText('1 situation added');
  const prev = row(page, 't1|prev_result');
  await expect(prev).toContainText('New York Yankees');
  await expect(prev.locator('select')).toBeVisible();
  await prev.locator('select').selectOption('loss');

  // 2. Opposing starter handedness — a left/right pick-one.
  await openList(page);
  await add(page, 't1|opp_starter_hand').click();
  const hand = row(page, 't1|opp_starter_hand');
  await expect(hand.locator('select')).toBeVisible();
  await hand.locator('select').selectOption('L');

  // 3. Minimum rest — a whole number, withheld until answered.
  await openList(page, 't2');
  await add(page, 't2|min_rest_days').click();
  const rest = row(page, 't2|min_rest_days');
  await expect(rest.locator('input[type="number"]')).toBeVisible();
  await expect(rest).toContainText(/Set a value/i);
  await rest.locator('input[type="number"]').fill('0');
  await expect(rest).not.toContainText(/Set a value/i);

  await expect(page.locator('.sit-active .cond')).toHaveCount(3);
  await expect(page.locator('#filterCount')).toContainText('3 situations');
  await page.screenshot({ path: `${OUT}/V3-active.png`, fullPage: true });

  // A situation already on a bench cannot be added to it twice.
  await openList(page);
  await expect(add(page, 't1|prev_result')).toBeDisabled();
  await openList(page, 't2');
  await expect(add(page, 't2|prev_result')).toBeEnabled();

  // The request carries each situation on the team it was added for.
  await page.locator('#mSubmit').click();
  await expect(page.locator('#mResult')).toBeVisible({ timeout: 240_000 });
  await expect.poll(() => calls.length, { timeout: 240_000 }).toBeGreaterThan(0);
  const body = calls.at(-1);
  expect(body.team_1).toBe('New York Yankees');
  expect(body.team_2).toBe('Boston Red Sox');
  expect(body.team_1_filters).toMatchObject({ prev_result: 'loss', opp_starter_hand: 'L' });
  expect(body.team_2_filters).toMatchObject({ min_rest_days: 0 });

  // The report states back the situations it searched.
  await expect(page.locator('#mResult')).toContainText(/New York Yankees/);
  await expect(page.locator('#mResult')).toContainText(/Previous game result/i);
  await page.screenshot({ path: `${OUT}/V4-report.png`, fullPage: true });
  // eslint-disable-next-line no-console
  console.log('live request:', JSON.stringify({
    team_1_filters: body.team_1_filters, team_2_filters: body.team_2_filters,
  }));
});

test('removing a situation returns it to the list, with no reload', async ({ page }) => {
  test.setTimeout(180_000);
  await openApp(page);
  await chooseMatchup(page);

  await openList(page);
  await add(page, 't1|prev_result').click();
  await expect(page.locator('.sit-active .cond')).toHaveCount(1);

  await row(page, 't1|prev_result')
    .getByRole('button', { name: /^Remove situation/ }).click();
  await expect(page.locator('.sit-active .cond')).toHaveCount(0);
  await expect(page.locator('#sitCount-t1')).toContainText('No situations added');

  await openList(page);
  await expect(add(page, 't1|prev_result')).toBeEnabled();
});

test('the list is searchable', async ({ page }) => {
  test.setTimeout(180_000);
  await openApp(page);
  await chooseMatchup(page);
  await openList(page);

  await page.locator('#sitSearch-t1').fill('pitcher');
  await expect(list(page)).toContainText(/starter handedness/i);
  await expect(list(page)).not.toContainText('Day or night game');

  await page.locator('#sitSearch-t1').fill('rest');
  await expect(list(page)).toContainText('Minimum rest');

  await page.locator('#sitSearch-t1').fill('zzzz-not-a-situation');
  await expect(list(page)).toContainText('No situation matches that search');
});

test('mobile: the lock and the list are both usable at 390', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await expect(page.locator('#addCondHint')).toBeVisible();
  await page.screenshot({ path: `${OUT}/V5-mobile-locked.png`, fullPage: true });

  await chooseMatchup(page);
  await openList(page);
  await add(page, 't1|prev_result').click();
  await expect(page.locator('.sit-active .cond')).toHaveCount(1);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${OUT}/V6-mobile-active.png`, fullPage: true });
});
