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

async function waitForPage(page) {
  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.locator('text=Find Verified Sports Handicappers').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('text=Why Use TrustMyRecord?').waitFor({ state: 'visible', timeout: 30000 });
}

async function collectChecks(page) {
  return page.evaluate(() => ({
    url: window.location.href,
    headline: document.querySelector('h1')?.textContent?.trim() || '',
    hasCtas: Array.from(document.querySelectorAll('.hm-hero-actions a')).map((a) => a.textContent.trim()),
    hasWhySection: !!Array.from(document.querySelectorAll('h2')).find((h) => h.textContent.includes('Why Use TrustMyRecord')),
    hasLeaderboardCopy: document.body.textContent.includes('Leaderboard highlights are based only on graded, locked-pick activity.'),
    hasFilterCopy: document.body.textContent.includes('Search by username, filter by sport, or sort by the metrics that matter most to you.'),
    rows: document.querySelectorAll('.hm-member-row:not(.hm-skeleton)').length,
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
}

function captureRoot(out) {
  execFileSync('import', ['-window', 'root', out], { stdio: 'inherit' });
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1440,1100', '--no-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1320, height: 940 } });
  try {
    await waitForPage(page);
    await page.waitForTimeout(800);
    captureRoot(DESKTOP_OUT);
    const desktopChecks = await collectChecks(page);
    await page.locator('text=Browse Verified Records').click();
    await page.waitForTimeout(800);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.locator('text=Find Verified Sports Handicappers').waitFor({ state: 'visible', timeout: 30000 });
    await page.screenshot({ path: MOBILE_OUT, fullPage: true });
    const mobileChecks = await collectChecks(page);

    const report = {
      checked_at: new Date().toISOString(),
      desktop: desktopChecks,
      mobile: mobileChecks,
      screenshots: {
        desktop_addressbar: DESKTOP_OUT,
        mobile_page: MOBILE_OUT,
      },
    };
    fs.writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2));

    if (desktopChecks.headline !== 'Find Verified Sports Handicappers') throw new Error('Updated headline missing');
    if (!desktopChecks.hasWhySection) throw new Error('Why Use TrustMyRecord section missing');
    if (desktopChecks.hasCtas.length < 2) throw new Error('Hero CTAs missing');
    if (mobileChecks.scrollWidth > mobileChecks.viewportWidth + 2) throw new Error('Mobile layout overflows horizontally');

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
