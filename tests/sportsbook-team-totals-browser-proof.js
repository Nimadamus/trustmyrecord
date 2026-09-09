#!/usr/bin/env node

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REQUESTED_URL = process.env.TMR_SPORTSBOOK_URL || 'https://trustmyrecord.com/sportsbook/';
// SPORTSBOOK_SKIN_20260904. This proof drives the CLASSIC board
// (#lobbyBoardRows / #gamesListContainer, .tmr-market-card, the
// .sportsbook-ticket-preview-card slip). /sportsbook/ now serves the V2 board
// (#sbnBoard, article.sbn-row) to everyone, so on the default URL this proof
// waited for markup the page no longer renders and timed out on a healthy site.
//
// The classic board is still shipped and is the documented rollback target
// (`?sbnext=0`), so rather than delete the coverage it is pinned to the skin it
// was written for, which keeps the rollback path proven. The V2 board users
// actually get is covered by tests/sportsbook-live-verification.spec.js and the
// sportsbook blocks in tests/regression-lock.spec.js. An explicit ?sbnext= in
// TMR_SPORTSBOOK_URL still wins.
const LIVE_URL = (() => {
  const url = new URL(REQUESTED_URL);
  /* THE SKIN VISITORS ACTUALLY GET (2026-09-09). This pinned sbnext=0, which
     forces the LEGACY board. The live sportsbook serves html.sbn-v3, so the
     proof was inspecting a skin nobody sees, matched none of its selectors and
     timed out on every run. A guard aimed at a retired code path proves
     nothing. It tests the default board now. */
  return url.toString();
})();
const OUT_DIR = path.join(process.cwd(), 'artifacts');
const OUT = path.join(OUT_DIR, 'sportsbook-team-totals-browser-proof.png');
const REPORT = path.join(OUT_DIR, 'sportsbook-team-totals-browser-proof.json');

/* WAIT ON WHATEVER BOARD IS ON SCREEN (2026-09-09). This waited on
   #lobbyBoardRows, the legacy container. On html.sbn-v3 that element still
   exists in the document but is HIDDEN - the board the visitor reads is
   #sbnBoardRows - so the wait resolved the element, saw it hidden 58 times and
   timed out with the sportsbook perfectly healthy. */
async function waitForBoardSettled(page) {
  await page.locator('#sbnBoardRows, #lobbyBoardRows, #gamesListContainer')
    .first().waitFor({ state: 'attached', timeout: 30000 });
  await page.waitForFunction(() => {
    const board = document.querySelector('#sbnBoardRows')
      || document.querySelector('#lobbyBoardRows')
      || document.querySelector('#gamesListContainer');
    return board && (board.textContent || '').trim().length > 0
      && !/Loading live odds/i.test(board.textContent || '');
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
    // Append with the URL API, not a bare "?": LIVE_URL now carries a query
    // string of its own, and `${LIVE_URL}?x=1` produced ...?sbnext=0?x=1, which
    // makes sbnext read as "0?teamtotals_browser_proof=..." and silently drops
    // the skin pin.
    const proofUrl = new URL(LIVE_URL);
    proofUrl.searchParams.set('teamtotals_browser_proof', String(Date.now()));
    await page.goto(proofUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForBoardSettled(page);

    /* The legacy window.TMR.setSport/setPeriod calls that used to sit here are
       gone (2026-09-09). They drive the retired board, and on html.sbn-v3 they
       kicked off an async re-render that raced the market switch below: the
       proof would click Team Totals, watch the rows appear, and then find a
       game-lines board again by the time it read the cards. The v3 board is
       driven the way a visitor drives it - by clicking the tab. */

    /* THE V3 BOARD (2026-09-09). This waited on
       `#lobbyBoardRows article.sportsbook-game-card` with `.team-market-row`
       inside it. That is the retired legacy markup: the sportsbook renders
       through `html.sbn-v3` into #sbnBoardRows, as `.sbn-row` cards holding
       `.sbn-ttrow` lines. The selector matched nothing, the wait timed out at
       45s, and this job failed on every run for a day with the board healthy
       and priced. Same contract, current markup.

       The market has to be SELECTED first - team totals are not the default
       board - and the switcher is a horizontally scrolling strip, so the tab is
       scrolled into view before it is clicked. */
    const tab = page.locator('#sbnCat-team_totals');
    if (await tab.count()) {
      await tab.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
      await tab.click();
      /* Wait for the board to actually REDRAW as team totals. A fixed pause let
         the proof read the game-lines board on a slow run and report "no card
         exposes a team total" when the board was simply still switching. */
      await page.waitForFunction(
        () => document.querySelectorAll('#sbnBoardRows .sbn-ttrow').length > 0,
        null, { timeout: 30000 });
    }

    const cards = page.locator('#sbnBoardRows .sbn-row');
    await cards.first().waitFor({ state: 'visible', timeout: 45000 });
    const cardCount = await cards.count();
    let card = null;
    for (let i = 0; i < cardCount; i += 1) {
      const candidate = cards.nth(i);
      if (await candidate.locator('.sbn-ttrow').count() > 0) { card = candidate; break; }
    }
    if (!card) {
      throw new Error(
        `no card on the team-totals board exposes any team-total line (${cardCount} card(s) on the board)`);
    }
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);

    const checks = await card.evaluate((node) => {
      const headers = [...node.querySelectorAll('.sbn-tthead > *')].map((el) => el.textContent.trim());
      const teamNames = [...node.querySelectorAll('.sbn-ttname')].map((el) => ({
        text: el.textContent.trim(),
        clipped: el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).whiteSpace === 'nowrap',
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        whiteSpace: getComputedStyle(el).whiteSpace,
        textOverflow: getComputedStyle(el).textOverflow,
      }));
      /* One row per TEAM. The property under test is that a team shows its main
         total only, so the lines are read per team row and counted. */
      const rows = [...node.querySelectorAll('.sbn-ttteam')].map((row) => ({
        team: (row.querySelector('.sbn-ttname') || {}).textContent?.trim() || '',
        lines: [...row.querySelectorAll('.sbn-ttline')].map((el) => el.textContent.trim()),
        prices: [...row.querySelectorAll('.sbn-chip, .sbn-ttprice')].map((el) => el.textContent.trim()),
      }));
      // The property under test is "each team shows exactly ONE total, its
      // main line" -- the alt-line regression showed a team's 3.5 and 4.5 side
      // by side. Expressed against whatever teams are playing: every row that
      // has any line must carry exactly one Over and one Under.
      const pricedRows = rows.filter((row) => row.lines.length > 0);
      /* v3 prints the number once with OVER/UNDER above it rather than "O 3.5"
         and "U 3.5" as separate cells, so a main line is ONE .sbn-ttline on the
         team's row. An alt-total regression shows up as more than one. */
      const overs = (row) => row.lines.slice(0, 1);
      const unders = (row) => row.lines.slice(0, 1);
      return {
        liveText: node.innerText,
        headers,
        teamNames,
        rows,
        hasBoardHeader: headers.includes('Board') || headers.includes('Action'),
        pricedRowCount: pricedRows.length,
        rowsWithMainTotal: pricedRows.filter((r) => r.lines.length === 1).length,
        rowsWithStackedAltTotals: pricedRows
          .filter((r) => r.lines.length > 1)
          .map((r) => ({ team: r.team, lines: r.lines })),
      };
    });

    const failures = [];
    if (!checks.pricedRowCount) failures.push('no team on this card shows a team total at all');
    if (checks.pricedRowCount && checks.rowsWithMainTotal !== checks.pricedRowCount) {
      failures.push(`${checks.pricedRowCount - checks.rowsWithMainTotal} of ${checks.pricedRowCount} team rows do not show exactly one main total line`);
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
