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

const list = (page) => page.locator('#condMenu');
/** By engine id, not by wording: "Previous game result" is also a substring of
 *  "Opponent's previous game result", and the live library offers both. */
const add = (page, key) => list(page).locator(`[data-add="${key}"]`);
const row = (page, key) => page.locator(`#condList .cond:has([data-remove="${key}"])`);

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
  // The team list arrives from the API; wait for it before selecting.
  await expect.poll(async () => page.locator('#mAway option').count(), { timeout: 90_000 })
    .toBeGreaterThan(5);
}

/**
 * Choose the matchup, and make it stick.
 *
 * The page settles asynchronously after sign-in: the entitlement check and the
 * team lists both land after first paint and re-initialise the form, which can
 * drop a selection made in the first second or two. A human never notices;
 * a script that selects the instant the options exist does. So this sets both
 * selects and re-sets them until the tool itself agrees the matchup is chosen.
 */
async function chooseMatchup(page, away = 'New York Yankees', home = 'Boston Red Sox') {
  const sameTeam = away === home;
  await expect.poll(async () => {
    if (await page.locator('#mAway').inputValue() !== away) {
      await page.locator('#mAway').selectOption(away).catch(() => {});
    }
    if (await page.locator('#mHome').inputValue() !== home) {
      await page.locator('#mHome').selectOption(home).catch(() => {});
    }
    const stuck = await page.locator('#mAway').inputValue() === away
      && await page.locator('#mHome').inputValue() === home;
    const enabled = await page.locator('#addCond').isEnabled();
    return stuck && (sameTeam ? !enabled : enabled);
  }, { timeout: 90_000, intervals: [500] }).toBe(true);
}

/**
 * Open the situation list.
 *
 * Same reason as chooseMatchup: the page can re-initialise once more while the
 * entitlement and coverage calls settle, which re-locks the button for a beat.
 * Retried rather than slept on, so a genuine failure to unlock still fails.
 */
async function openList(page) {
  await expect.poll(async () => {
    if (!(await list(page).isVisible())) {
      if (await page.locator('#addCond').isEnabled()) {
        await page.locator('#addCond').click({ timeout: 5_000 }).catch(() => {});
      } else {
        await chooseMatchup(page);
      }
    }
    return list(page).isVisible();
  }, { timeout: 90_000, intervals: [400] }).toBe(true);
}

test('the locked state explains itself, and lifts the moment the matchup is valid', async ({ page }) => {
  test.setTimeout(180_000);
  await openApp(page);

  await expect(page.locator('#addCondHint'))
    .toContainText('Choose two different teams above to unlock situational filters.');
  await expect(page.locator('#addCond')).toBeDisabled();
  await expect(page.locator('#addCond')).toHaveText('+ Add Situation');
  await page.screenshot({ path: `${OUT}/V1-locked.png`, fullPage: true });

  // A team against itself is not a matchup: the lock stays stated.
  await chooseMatchup(page, 'New York Yankees', 'New York Yankees');
  await expect(page.locator('#addCond')).toBeDisabled();
  await expect(page.locator('#addCondHint')).toBeVisible();

  // Two different teams, and it lifts with no reload.
  await chooseMatchup(page);
  await expect(page.locator('#addCondHint')).toBeHidden();
  await expect(page.locator('#addCond')).toBeEnabled();
});

test('select the situation, then answer it — three shapes of control, live', async ({ page }) => {
  test.setTimeout(300_000);
  const calls = [];
  await openApp(page, calls);
  await chooseMatchup(page);

  // Nothing on screen until the reader puts it there.
  await expect(page.locator('#condList .cond')).toHaveCount(0);
  await expect(page.locator('#condActiveH')).toBeHidden();

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
  await expect(page.locator('#condActiveH')).toBeVisible();
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
  await openList(page);
  await add(page, 't2|min_rest_days').click();
  const rest = row(page, 't2|min_rest_days');
  await expect(rest.locator('input[type="number"]')).toBeVisible();
  await expect(rest).toContainText(/Set a value/i);
  await rest.locator('input[type="number"]').fill('0');
  await expect(rest).not.toContainText(/Set a value/i);

  await expect(page.locator('#condList .cond')).toHaveCount(3);
  await expect(page.locator('#filterCount')).toContainText('3 situations');
  await page.screenshot({ path: `${OUT}/V3-active.png`, fullPage: true });

  // A situation already on a bench cannot be added to it twice.
  await openList(page);
  await expect(add(page, 't1|prev_result')).toBeDisabled();
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
  await expect(page.locator('#condList .cond')).toHaveCount(1);

  await row(page, 't1|prev_result')
    .getByRole('button', { name: /^Remove situation/ }).click();
  await expect(page.locator('#condList .cond')).toHaveCount(0);
  await expect(page.locator('#condActiveH')).toBeHidden();

  await openList(page);
  await expect(add(page, 't1|prev_result')).toBeEnabled();
});

test('the list is searchable', async ({ page }) => {
  test.setTimeout(180_000);
  await openApp(page);
  await chooseMatchup(page);
  await openList(page);

  await page.locator('#filterSearch').fill('pitcher');
  await expect(list(page)).toContainText(/starter handedness/i);
  await expect(list(page)).not.toContainText('Day or night game');

  await page.locator('#filterSearch').fill('rest');
  await expect(list(page)).toContainText('Minimum rest');

  await page.locator('#filterSearch').fill('zzzz-not-a-situation');
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
  await expect(page.locator('#condList .cond')).toHaveCount(1);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${OUT}/V6-mobile-active.png`, fullPage: true });
});
