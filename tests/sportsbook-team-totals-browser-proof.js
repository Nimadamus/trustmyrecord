#!/usr/bin/env node

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LIVE_URL = process.env.TMR_SPORTSBOOK_URL || 'https://trustmyrecord.com/sportsbook/';
const OUT_DIR = path.join(process.cwd(), 'artifacts');
const OUT = path.join(OUT_DIR, 'sportsbook-team-totals-browser-proof.png');
const REPORT = path.join(OUT_DIR, 'sportsbook-team-totals-browser-proof.json');

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
    await page.goto(`${LIVE_URL}?teamtotals_browser_proof=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForBoardSettled(page);

    await page.evaluate(() => {
      if (window.TMR && typeof window.TMR.setSport === 'function') {
        window.TMR.setSport('MLB');
      } else {
        throw new Error('window.TMR.setSport is unavailable on the public sportsbook page');
      }
    });
    await waitForBoardSettled(page);

    await page.evaluate(() => {
      if (window.TMR && typeof window.TMR.setPeriod === 'function') {
        window.TMR.setPeriod('tt');
      } else {
        throw new Error('window.TMR.setPeriod is unavailable on the public sportsbook page');
      }
    });

    const card = page.locator('#lobbyBoardRows article.sportsbook-game-card', { hasText: 'Boston Red Sox' })
      .filter({ hasText: 'Atlanta Braves' })
      .first();
    await card.waitFor({ state: 'visible', timeout: 45000 });
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
      const rows = [...node.querySelectorAll('.team-market-row')].map((row) => ({
        team: row.querySelector('.team-cell b')?.textContent.trim() || '',
        lines: [...row.querySelectorAll('.sb-odds-line')].map((el) => el.textContent.trim()),
        prices: [...row.querySelectorAll('.sb-odds-price')].map((el) => el.textContent.trim()),
      }));
      const bostonRow = rows.find((row) => row.team === 'Boston Red Sox');
      return {
        liveText: node.innerText,
        headers,
        teamNames,
        rows,
        hasBoardHeader: headers.includes('Board') || headers.includes('Action'),
        hasBostonMainTotal: Boolean(bostonRow && bostonRow.lines.includes('O 3.5') && bostonRow.lines.includes('U 3.5')),
        hasBostonAltTotal: Boolean(bostonRow && (bostonRow.lines.includes('O 4.5') || bostonRow.lines.includes('U 4.5'))),
      };
    });

    const failures = [];
    if (!checks.hasBostonMainTotal) failures.push('Boston Red Sox main team total 3.5 is not visible');
    if (checks.hasBostonAltTotal) failures.push('Boston Red Sox alternate team total 4.5 is visible as the main row');
    if (checks.hasBoardHeader) failures.push('empty Board/Action header is present');
    if (checks.teamNames.some((team) => team.clipped)) failures.push('one or more full team names are clipped');

    fs.writeFileSync(REPORT, JSON.stringify({
      live_url: page.url(),
      screenshot: OUT,
      checks,
      failures,
      checked_at: new Date().toISOString(),
    }, null, 2));

    await page.waitForTimeout(1000);
    execFileSync('bash', ['-lc', `import -window root "${OUT.replace(/\\/g, '/')}"`], { stdio: 'inherit' });

    if (failures.length) {
      throw new Error(failures.join('; '));
    }

    console.log(`sportsbook team totals browser proof screenshot: ${OUT}`);
    console.log(`sportsbook team totals browser proof report: ${REPORT}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
