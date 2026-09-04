const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * Live verification of the deployed Trend Spotter workspace.
 *
 * Rewritten 2026-08-01 for the redesign. This drives the real production page
 * against the real production API and asserts the guarantees a user relies on:
 * the tool loads, the locked markets explain themselves, a real query returns a
 * real record with its evidence, and nothing on the page is invented.
 */

const LIVE_URL = process.env.TMR_TRENDSPOTTER_URL || 'https://trustmyrecord.com/trendspotter/';
const API_BASE = process.env.TMR_TRENDSPOTTER_API_BASE || 'https://trustmyrecord-api.onrender.com/api/trendspotter';
const ARTIFACT_DIR = path.join(process.cwd(), 'artifacts');
const SCREENSHOT_PATH = path.join(ARTIFACT_DIR, 'trendspotter-live-verification.png');
const REPORT_PATH = path.join(ARTIFACT_DIR, 'trendspotter-live-verification.json');

test('live Trend Spotter workspace returns source-backed results', async ({ page }) => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  // --- API contract --------------------------------------------------------
  const capsRes = await page.request.get(`${API_BASE}/capabilities`, { headers: { 'cache-control': 'no-cache' } });
  expect(capsRes.status(), 'capabilities endpoint must be live').toBe(200);
  const caps = await capsRes.json();
  expect(caps.sports.length, 'at least one league must be researchable').toBeGreaterThan(0);
  for (const market of caps.unavailable_markets) {
    expect(market.reason.length, `${market.id} must carry a real reason`).toBeGreaterThan(40);
    expect(market.reason).not.toMatch(/^unsupported/i);
  }

  const queryRes = await page.request.get(
    `${API_BASE}/query?sport=MLB&team=LAD&market=moneyline&venue=away&situation=favorite&seasonFrom=2024&minGames=10`,
    { headers: { 'cache-control': 'no-cache' } },
  );
  expect(queryRes.status(), 'query endpoint must be live').toBe(200);
  const apiResult = await queryRes.json();
  expect(apiResult.status).toBe('ok');
  expect(apiResult.summary.sample).toBeGreaterThan(0);
  expect(apiResult.provenance.dataset).toBeTruthy();
  // Units and ROI must reconcile with each other, not merely be present.
  if (apiResult.summary.roi !== null) {
    const derived = 100 * apiResult.summary.units / apiResult.summary.units_risked;
    expect(Math.abs(derived - apiResult.summary.roi), 'ROI must equal units / risked').toBeLessThan(0.02);
  }
  // The record must reconcile with the returned games.
  const counted = apiResult.games.reduce((acc, g) => { acc[g.outcome] = (acc[g.outcome] || 0) + 1; return acc; }, {});
  expect(counted.win || 0).toBe(apiResult.summary.wins);
  expect(counted.loss || 0).toBe(apiResult.summary.losses);
  expect(counted.push || 0).toBe(apiResult.summary.pushes);

  // --- Page ----------------------------------------------------------------
  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

  await expect(page.locator('h1')).toHaveText('Trend Spotter');
  await expect(page.locator('body')).toContainText('Free verified research');
  await expect(page.locator('body')).toContainText('Pick a team, a market and a situation. Get the record, and the games behind it.');
  await expect(page.locator('body')).toContainText('Set conditions');

  // The old engineering copy must not come back.
  await expect(page.locator('body')).not.toContainText(/source rows are connected/i);
  await expect(page.locator('body')).not.toContainText(/impossible combinations are blocked/i);
  await expect(page.locator('body')).not.toContainText(/Verified trend data source not connected yet/i);

  // The title must clear the sticky site header.
  const clear = await page.evaluate(() => {
    window.scrollTo(0, 0);
    const h1 = document.querySelector('h1').getBoundingClientRect();
    const nav = document.querySelector('.ds-nav');
    return !nav || h1.top >= nav.getBoundingClientRect().bottom;
  });
  expect(clear, 'the page title must not sit behind the sticky header').toBe(true);

  // Capability-driven chrome.
  await expect(page.locator('.ts-tab:not([aria-disabled="true"])').first()).toBeVisible({ timeout: 20000 });
  const lockedTabs = page.locator('.ts-tab[aria-disabled="true"]');
  expect(await lockedTabs.count(), 'unavailable markets must be shown as locked').toBeGreaterThan(0);
  const firstLockedReason = await lockedTabs.first().getAttribute('title');
  expect(firstLockedReason.length).toBeGreaterThan(40);

  // Every market tab has to answer a real click. The open ones select and
  // swap the filter row; the locked ones stay unselected but say why, which
  // is what a disabled attribute could never do (it eats the click).
  const openTabs = page.locator('.ts-tab:not([aria-disabled="true"])');
  const openCount = await openTabs.count();
  expect(openCount, 'at least the three settleable markets must be open').toBeGreaterThan(2);
  for (let i = 0; i < openCount; i += 1) {
    const tab = openTabs.nth(i);
    const id = await tab.getAttribute('data-market');
    await tab.click();
    await expect(page.locator(`.ts-tab[data-market="${id}"]`)).toHaveAttribute('aria-selected', 'true');
    const chip = (await page.locator('#queryChips').textContent()).replace(/\s+/g, ' ');
    expect(chip, 'Your query must follow the selected market').toContain(
      await page.locator(`.ts-tab[data-market="${id}"]`).textContent(),
    );
    // The previous market's line/price box must not carry over.
    const ranges = await page.locator('#filterFields input[id$="Min"], #filterFields input[id$="Max"]')
      .evaluateAll((els) => els.map((e) => e.value));
    expect(ranges.every((v) => v === ''), 'range boxes must reset with the market').toBe(true);
  }

  const before = await page.locator('.ts-tab[aria-selected="true"]').textContent();
  await lockedTabs.first().click({ force: true });
  await expect(page.locator('#marketNotice')).toHaveText(/\S/);
  expect(await page.locator('.ts-tab[aria-selected="true"]').textContent(),
    'a locked market must not become the selection').toBe(before);

  // Back and forth, twice, to prove nothing sticks.
  for (const id of ['moneyline', 'total', 'spread', 'moneyline', 'spread', 'total']) {
    await page.locator(`.ts-tab[data-market="${id}"]`).click();
    await expect(page.locator(`.ts-tab[data-market="${id}"]`)).toHaveAttribute('aria-selected', 'true');
    expect(await page.locator('.ts-tab[aria-selected="true"]').count()).toBe(1);
  }

  // Slate.
  await expect(page.locator('#matchupList')).not.toHaveText(/^\s*$/, { timeout: 30000 });

  // --- Run a real query through the UI ------------------------------------
  await page.goto(
    `${LIVE_URL}?sport=MLB&team=LAD&market=moneyline&venue=away&situation=favorite&seasonFrom=2024&minGames=10`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForSelector('.ts-result', { timeout: 45000 });

  const statement = (await page.locator('.ts-statement').textContent()).trim();
  expect(statement).toMatch(/Los Angeles Dodgers are \d+-\d+ on the moneyline on the road as a favorite since 2024\./);

  // What the page shows must equal what the API returned.
  const shown = await page.$$eval('.ts-metric', (els) => {
    const out = {};
    els.forEach((e) => { out[e.querySelector('dt').textContent] = e.querySelector('dd').firstChild.textContent; });
    return out;
  });
  expect(shown.Record).toBe(apiResult.summary.record);
  expect(shown.Sample).toBe(String(apiResult.summary.sample));
  expect(shown.ROI).toBe((apiResult.summary.roi > 0 ? '+' : '') + apiResult.summary.roi.toFixed(2) + '%');

  // Evidence, chart, interpretation, provenance.
  expect(await page.locator('.ts-table tbody tr').count()).toBeGreaterThan(0);
  await expect(page.locator('.ts-chart-plot svg')).toBeVisible();
  // Axis labels are HTML precisely so they stay readable on a phone; guard the
  // rendered font size, not just their presence.
  const axis = await page.$$eval('.ts-chart-axis span', (els) =>
    els.map((e) => ({ text: e.textContent, px: parseFloat(getComputedStyle(e).fontSize) })));
  expect(axis.length, 'the chart must carry three axis labels').toBe(3);
  expect(Math.min(...axis.map((a) => a.px)), 'axis labels must stay legible').toBeGreaterThanOrEqual(10);
  // A column of dashes is not evidence: no column may be empty on every row.
  const heads = await page.$$eval('.ts-table thead th', (els) => els.map((e) => e.textContent));
  const rows = await page.$$eval('.ts-table tbody tr', (trs) =>
    trs.map((tr) => Array.from(tr.children).map((td) => td.textContent.trim())));
  heads.forEach((head, i) => {
    const allEmpty = rows.every((r) => !r[i] || r[i] === '—');
    expect(allEmpty, `column "${head}" is empty on every row and should not be rendered`).toBe(false);
    // Price and Units can legitimately be constant (a sample all laid at -110);
    // these four exist only to vary, so a single repeated value means the
    // column should not have been rendered at all.
    if (['Venue', 'Market', 'Source', 'Closing line'].includes(head)) {
      const allSame = rows.length > 1 && rows.every((r) => r[i] === rows[0][i]);
      expect(allSame, `column "${head}" repeats one value on every row`).toBe(false);
    }
  });
  expect(await page.locator('.ts-notes li').count()).toBeGreaterThan(1);
  await page.locator('.ts-details summary').click();
  await expect(page.locator('.ts-details-body')).toContainText(/Games excluded/i);

  // Nothing invented, nothing promotional.
  await expect(page.locator('body')).not.toContainText(/fake stats|fake projections|fake confidence|guaranteed|lock of the day/i);
  await expect(page.locator('body')).toContainText(/not a prediction/i);

  // No horizontal overflow at desktop or phone width.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.waitForTimeout(300);
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows, `no horizontal overflow at ${width}px`).toBe(false);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  expect(consoleErrors, 'the page must load with no console errors').toEqual([]);

  await page.evaluate((url) => {
    const proof = document.createElement('div');
    proof.setAttribute('data-live-proof-url', url);
    proof.textContent = `LIVE URL: ${url}`;
    proof.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
      'padding:10px 14px', 'background:#021018', 'color:#67e8f9',
      'font:700 14px ui-monospace, SFMono-Regular, Consolas, monospace',
      'border-bottom:1px solid #155e75',
    ].join(';');
    document.body.prepend(proof);
  }, LIVE_URL);

  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    checked_at: new Date().toISOString(),
    live_url: LIVE_URL,
    api_base: API_BASE,
    api_status: queryRes.status(),
    statement,
    record: apiResult.summary.record,
    sample: apiResult.summary.sample,
    units: apiResult.summary.units,
    roi: apiResult.summary.roi,
    dataset: apiResult.provenance.dataset,
    games_excluded: apiResult.exclusions.total,
    console_errors: consoleErrors,
    screenshot: SCREENSHOT_PATH,
  }, null, 2));
});

/* --- Controls that were found broken by the 2026-09-03 live audit. --- */

async function ready(page) {
  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.ts-tab[data-market="moneyline"]')).toBeVisible({ timeout: 45000 });
  await expect(page.locator('#matchupList')).not.toHaveText(/^\s*$/, { timeout: 45000 });
}

test('reset clears the team and the stale result', async ({ page }) => {
  await ready(page);
  await page.selectOption('#f_team', 'NYY');
  await page.selectOption('#f_venue', 'away');
  await page.selectOption('#f_situation', 'favorite');
  await page.selectOption('#f_seasonFrom', '2024');
  await page.fill('#f_minGames', '15');
  await page.click('#runTrend');
  await page.waitForSelector('.ts-result', { timeout: 60000 });
  expect(await page.locator('.ts-statement').count()).toBe(1);

  await page.click('#resetFilters');
  expect(await page.locator('#f_team').inputValue(), 'team must reset').toBe('');
  expect(await page.locator('#f_venue').inputValue()).toBe('any');
  expect(await page.locator('#f_situation').inputValue()).toBe('any');
  expect(await page.locator('#f_seasonFrom').inputValue()).toBe('');
  expect(await page.locator('#f_minGames').inputValue()).toBe('10');
  expect(await page.locator('.ts-statement').count(), 'stale result must be cleared').toBe(0);
  await expect(page.locator('#resultsBody')).toContainText('Your result will appear here');
  expect(await page.locator('.ts-matchup[aria-checked="true"]').count(), 'slate selection must clear').toBe(0);
  await expect(page.locator('#runTrend')).toBeDisabled();
});

test('one back press moves state', async ({ page }) => {
  await ready(page);
  await page.selectOption('#f_team', 'NYY');
  await page.selectOption('#f_venue', 'away');
  await page.click('#runTrend');
  await page.waitForSelector('.ts-result', { timeout: 60000 });
  const away = new URL(page.url()).searchParams.get('venue');
  expect(away).toBe('away');

  await page.selectOption('#f_venue', 'home');
  await page.click('#runTrend');
  await page.waitForSelector('.ts-result', { timeout: 60000 });
  expect(new URL(page.url()).searchParams.get('venue')).toBe('home');

  await page.goBack();
  await page.waitForTimeout(600);
  expect(new URL(page.url()).searchParams.get('venue'), 'ONE back press must return to away').toBe('away');
  expect(await page.locator('#f_venue').inputValue(), 'the control must follow the URL').toBe('away');

  await page.goForward();
  await page.waitForTimeout(600);
  expect(new URL(page.url()).searchParams.get('venue')).toBe('home');
});

test('locked league tabs answer a click', async ({ page }) => {
  await ready(page);
  const locked = page.locator('#leagueTabs button[aria-disabled="true"]');
  const n = await locked.count();
  expect(n, 'at least one locked league is expected').toBeGreaterThan(0);

  const before = await page.locator('#leagueTabs button[aria-selected="true"]').textContent();
  const reasons = new Set();
  for (let i = 0; i < n; i += 1) {
    const b = locked.nth(i);
    expect(await b.getAttribute('aria-label')).toMatch(/not available\..+\S/);
    await b.click({ force: true });
    await expect(page.locator('#leagueNotice')).toHaveText(/\S/);
    reasons.add(await page.locator('#leagueNotice').textContent());
    expect(await page.locator('#leagueTabs button[aria-selected="true"]').textContent(),
      'a locked league must not become the selection').toBe(before);
  }
  expect(reasons.size, 'each locked league states its own reason').toBe(n);

  // Visually locked: struck through and faded relative to an open league.
  const style = await locked.first().evaluate((e) => {
    const c = getComputedStyle(e);
    return { o: parseFloat(c.opacity), d: c.textDecorationLine, cur: c.cursor };
  });
  expect(style.o).toBeLessThan(1);
  expect(style.d).toContain('line-through');
  expect(style.cur).toBe('not-allowed');

  // An open league still selects.
  await page.locator('#leagueTabs button[data-league="NBA"]').click();
  await expect(page.locator('#leagueTabs button[data-league="NBA"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#leagueNotice')).toBeHidden();
});

test('range inputs are labelled by role, not by their placeholder', async ({ page }) => {
  await ready(page);
  const expected = {
    moneyline: [['#f_priceMin', 'Minimum price'], ['#f_priceMax', 'Maximum price']],
    spread: [['#f_lineMin', 'Minimum run line'], ['#f_lineMax', 'Maximum run line']],
    total: [['#f_totalMin', 'Minimum posted total'], ['#f_totalMax', 'Maximum posted total']],
  };
  for (const [market, pairs] of Object.entries(expected)) {
    await page.locator(`.ts-tab[data-market="${market}"]`).click();
    for (const [sel, label] of pairs) {
      expect(await page.locator(sel).getAttribute('aria-label'), `${sel} label`).toBe(label);
    }
  }
});

test('market tabs still behave (regression guard)', async ({ page }) => {
  await ready(page);
  for (const id of ['moneyline', 'spread', 'total', 'moneyline', 'total', 'spread']) {
    await page.locator(`.ts-tab[data-market="${id}"]`).click();
    await expect(page.locator(`.ts-tab[data-market="${id}"]`)).toHaveAttribute('aria-selected', 'true');
    expect(await page.locator('.ts-tab[aria-selected="true"]').count()).toBe(1);
  }
  const lockedMarket = page.locator('.ts-tab[aria-disabled="true"]').first();
  const sel = await page.locator('.ts-tab[aria-selected="true"]').textContent();
  await lockedMarket.click({ force: true });
  await expect(page.locator('#marketNotice')).toHaveText(/\S/);
  expect(await page.locator('.ts-tab[aria-selected="true"]').textContent()).toBe(sel);
});
