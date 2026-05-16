#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LIVE_URL = process.env.TMR_SPORTSBOOK_URL || 'https://trustmyrecord.com/sportsbook/';
const OUT_DIR = path.join(process.cwd(), 'artifacts');
const OUT = path.join(OUT_DIR, 'sportsbook-team-totals-live-proof.png');
const REPORT = path.join(OUT_DIR, 'sportsbook-team-totals-live-proof.json');

async function waitForBoardSettled(page) {
  await page.locator('#lobbyBoardRows, #gamesListContainer').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const board = document.querySelector('#lobbyBoardRows') || document.querySelector('#gamesListContainer');
    return board && !/Loading live odds/i.test(board.textContent || '');
  }, null, { timeout: 30000 });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1440,1100', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });

  try {
    await page.goto(`${LIVE_URL}?teamtotals_live_proof=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForBoardSettled(page);

    await page.locator('[data-sportsbook-tab="sport"][data-sport="MLB"], [data-sport="MLB"]').first().click();
    await waitForBoardSettled(page);

    await page.locator('#lobbyPeriodBar .sportsbook-period-tab', { hasText: 'Team Totals' }).first().click();
    await page.locator('#lobbyBoardRows article.sportsbook-game-card', { hasText: 'Boston Red Sox' })
      .filter({ hasText: 'Atlanta Braves' })
      .first()
      .waitFor({ state: 'visible', timeout: 45000 });

    const card = page.locator('#lobbyBoardRows article.sportsbook-game-card', { hasText: 'Boston Red Sox' })
      .filter({ hasText: 'Atlanta Braves' })
      .first();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);

    const checks = await card.evaluate((node) => {
      const headers = [...node.querySelectorAll('.market-header-cell')].map((el) => el.textContent.trim());
      const teamNames = [...node.querySelectorAll('.team-cell b')].map((el) => ({
        text: el.textContent.trim(),
        clipped: el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).whiteSpace === 'nowrap',
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        whiteSpace: getComputedStyle(el).whiteSpace,
        textOverflow: getComputedStyle(el).textOverflow,
      }));
      return {
        text: node.innerText,
        headers,
        teamNames,
        hasBoardHeader: headers.includes('Board'),
        hasBostonMainTotal: /\bBoston Red Sox\b[\s\S]*\bO 3\.5\b[\s\S]*\bU 3\.5\b/.test(node.innerText),
        hasBostonAltTotal: /\bBoston Red Sox\b[\s\S]*\bO 4\.5\b[\s\S]*\bU 4\.5\b/.test(node.innerText),
      };
    });

    const failures = [];
    if (!checks.hasBostonMainTotal) failures.push('Boston Red Sox main team total 3.5 is not visible');
    if (checks.hasBostonAltTotal) failures.push('Boston Red Sox alternate team total 4.5 is visible as the main row');
    if (checks.hasBoardHeader) failures.push('empty Board header is present');
    if (checks.teamNames.some((team) => team.clipped)) failures.push('one or more full team names are clipped');

    await page.screenshot({ path: OUT, fullPage: false });
    fs.writeFileSync(REPORT, JSON.stringify({
      live_url: page.url(),
      screenshot: OUT,
      checks,
      failures,
      checked_at: new Date().toISOString(),
    }, null, 2));

    if (failures.length) {
      throw new Error(failures.join('; '));
    }

    console.log(`sportsbook team totals live proof screenshot: ${OUT}`);
    console.log(`sportsbook team totals live proof report: ${REPORT}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
