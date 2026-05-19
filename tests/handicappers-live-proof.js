#!/usr/bin/env node

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LIVE_URL = process.env.TMR_HANDICAPPERS_URL || 'https://trustmyrecord.com/handicappers/';
const OUT_DIR = path.join(process.cwd(), 'artifacts');
const DESKTOP_OUT = path.join(OUT_DIR, 'handicappers-live-browser-addressbar-proof.png');
const MOBILE_OUT = path.join(OUT_DIR, 'handicappers-live-mobile-proof.png');
const REPORT_OUT = path.join(OUT_DIR, 'handicappers-live-proof.json');
const EXPECTED_HEADERS = ['Rank', 'Handicapper', 'Record', 'Win %', 'Net Units', 'ROI', 'Verified Picks', 'Last Active', 'Sports'];

async function waitForPage(page) {
  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.getByRole('heading', { name: 'Handicappers' }).first().waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#hmPageSize').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.hm-head').waitFor({ state: 'attached', timeout: 30000 });
  await page.locator('.hm-member-row, .hm-empty').first().waitFor({ state: 'visible', timeout: 30000 });
}

async function collectChecks(page) {
  return page.evaluate((expectedHeaders) => {
    const headers = Array.from(document.querySelectorAll('.hm-head > div')).map((el) => el.textContent.trim());
    const rows = document.querySelectorAll('.hm-member-row').length;
    const pageSize = document.querySelector('#hmPageSize');
    const pageOptions = Array.from(pageSize?.options || []).map((option) => option.textContent.trim());
    return {
      url: window.location.href,
      headline: document.querySelector('h1')?.textContent?.trim() || '',
      headers,
      headerText: headers.join('|'),
      expectedHeaderText: expectedHeaders.join('|'),
      firstRow: Array.from(document.querySelectorAll('.hm-member-row:first-child > *')).map((el) => el.textContent.trim().replace(/\\s+/g, ' ')),
      pageSizeValue: pageSize?.value || '',
      pageOptions,
      pageSummary: document.querySelector('#hmPageSummary')?.textContent?.trim() || '',
      pageIndicator: document.querySelector('#hmPageIndicator')?.textContent?.trim() || '',
      prevDisabled: !!document.querySelector('#hmPrevPage')?.disabled,
      nextDisabled: !!document.querySelector('#hmNextPage')?.disabled,
      rows,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  }, EXPECTED_HEADERS);
}

function captureRoot(out) {
  execFileSync('import', ['-window', 'root', out], { stdio: 'inherit' });
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1440,1100', '--no-sandbox', '--ignore-certificate-errors'],
  });

  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1320, height: 940 } });
  const page = await context.newPage();
  try {
    await waitForPage(page);
    await page.locator('.hm-leaderboard-controls').scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    captureRoot(DESKTOP_OUT);
    const desktopChecks = await collectChecks(page);

    await page.selectOption('#hmPageSize', '50');
    await page.waitForTimeout(400);
    const top50Checks = await collectChecks(page);
    await page.selectOption('#hmPageSize', '100');
    await page.waitForTimeout(400);
    const top100Checks = await collectChecks(page);
    await page.selectOption('#hmPageSize', 'all');
    await page.waitForTimeout(400);
    const allChecks = await collectChecks(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await waitForPage(page);
    await page.locator('.hm-leaderboard-controls').scrollIntoViewIfNeeded();
    await page.screenshot({ path: MOBILE_OUT, fullPage: true });
    const mobileChecks = await collectChecks(page);

    const report = {
      checked_at: new Date().toISOString(),
      desktop: desktopChecks,
      page_size_checks: {
        top50: top50Checks,
        top100: top100Checks,
        all: allChecks,
      },
      mobile: mobileChecks,
      screenshots: {
        desktop_addressbar: DESKTOP_OUT,
        mobile_page: MOBILE_OUT,
      },
    };
    fs.writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2));

    if (!desktopChecks.headline.includes('Handicappers')) throw new Error('Current headline missing');
    if (desktopChecks.headerText !== desktopChecks.expectedHeaderText) throw new Error('Unexpected desktop table headers');
    if (!desktopChecks.firstRow || desktopChecks.firstRow.length < EXPECTED_HEADERS.length) throw new Error('First row does not expose the locked 9-column mapping');
    if (desktopChecks.pageSizeValue !== '25') throw new Error('Default page size is not Top 25');
    if (!desktopChecks.pageSummary) throw new Error('Page summary missing');
    if (!desktopChecks.pageIndicator.startsWith('Page ')) throw new Error('Page indicator missing');
    if (top50Checks.pageSizeValue !== '50') throw new Error('Top 50 selector failed');
    if (top100Checks.pageSizeValue !== '100') throw new Error('Top 100 selector failed');
    if (allChecks.pageSizeValue !== 'all') throw new Error('All selector failed');
    if (mobileChecks.scrollWidth > mobileChecks.viewportWidth + 2) throw new Error('Mobile layout overflows horizontally');

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
