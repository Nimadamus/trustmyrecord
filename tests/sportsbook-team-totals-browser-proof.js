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

    // Any MLB card on TODAY's team-totals board, not a named matchup.
    //
    // This used to wait for Boston Red Sox vs Atlanta Braves specifically. That
    // fixture only existed on the board the day the proof was written, so from
    // 2026-08-04 onward the job failed every single run with the sportsbook
    // perfectly healthy -- the two teams simply were not playing each other.
    // What this proof is actually about is the RENDERING of a team-totals card
    // (main line only, no empty Board/Action header, no clipped team names),
    // and that contract holds for whichever game is on today.
    const cards = page.locator('#lobbyBoardRows article.sportsbook-game-card');
    await cards.first().waitFor({ state: 'visible', timeout: 45000 });
    const cardCount = await cards.count();
    let card = null;
    for (let i = 0; i < cardCount; i += 1) {
      const candidate = cards.nth(i);
      const rows = await candidate.locator('.team-market-row .sb-odds-line').count();
      if (rows > 0) { card = candidate; break; }
    }
    if (!card) {
      throw new Error(
        `no MLB card on the team-totals board exposes any team-total line (${cardCount} card(s) on the board)`);
    }
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
      // The property under test is "each team shows exactly ONE total, its
      // main line" -- the alt-line regression showed a team's 3.5 and 4.5 side
      // by side. Expressed against whatever teams are playing: every row that
      // has any line must carry exactly one Over and one Under.
      const pricedRows = rows.filter((row) => row.lines.length > 0);
      const overs = (row) => row.lines.filter((l) => /^O\s/i.test(l));
      const unders = (row) => row.lines.filter((l) => /^U\s/i.test(l));
      return {
        liveText: node.innerText,
        headers,
        teamNames,
        rows,
        hasBoardHeader: headers.includes('Board') || headers.includes('Action'),
        pricedRowCount: pricedRows.length,
        rowsWithMainTotal: pricedRows.filter((r) => overs(r).length === 1 && unders(r).length === 1).length,
        rowsWithStackedAltTotals: pricedRows
          .filter((r) => overs(r).length > 1 || unders(r).length > 1)
          .map((r) => ({ team: r.team, lines: r.lines })),
      };
    });

    const failures = [];
    if (!checks.pricedRowCount) failures.push('no team on this card shows a team total at all');
    if (checks.pricedRowCount && checks.rowsWithMainTotal !== checks.pricedRowCount) {
      failures.push(`${checks.pricedRowCount - checks.rowsWithMainTotal} of ${checks.pricedRowCount} team rows do not show exactly one Over/Under main line`);
    }
    if (checks.rowsWithStackedAltTotals.length) {
      failures.push('alternate team totals are stacked into the main row: ' + JSON.stringify(checks.rowsWithStackedAltTotals));
    }
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
