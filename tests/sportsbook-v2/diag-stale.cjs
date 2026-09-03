// Diagnose: does the pick payload follow the visible board after sport switches?
const { chromium } = require('playwright');
const { installOverlay } = require('./overlay.cjs');
const url = process.argv[2] || 'https://trustmyrecord.com/sportsbook/';
const seqs = [['MLB'], ['NFL','MLB'], ['UFC','MLB'], ['UFC','NFL','MLB'], ['Soccer','MLB']];
(async () => {
  const b = await chromium.launch({ headless: true });
  for (const seq of seqs) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await installOverlay(ctx);
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForSelector('#lobbyBoardRows .sb-odds', { timeout: 45000 });
    for (const s of seq) {
      await p.locator(`.sportsbook-rail-board[data-sport="${s}"]`).first().click();
      await p.waitForFunction((s) => document.getElementById('lobbyBoardRows').getAttribute('data-sport') === s && (document.querySelector('#lobbyBoardRows .sb-odds') || /no /i.test(document.getElementById('lobbyBoardRows').textContent)), s, { timeout: 45000 }).catch(() => {});
      await p.waitForTimeout(3000);
    }
    const card = p.locator('#lobbyBoardRows .sportsbook-game-card').nth(3);
    const names = await card.locator('.team-cell b').allTextContents();
    await card.locator('.team-market-row.home-team-row .odds-cell:nth-child(3) .sb-odds').click();
    await p.waitForTimeout(800);
    const st = await p.evaluate(() => { const c = (window.TMR && window.TMR.currentSelectedPick) || {}; const g = (window.TMR && window.TMR.currentGames) || []; return { pickGameId: c.gameId, pickSport: c.sport, pickTeam: c.team, gameIndex: c.gameIndex, cgLen: g.length, cg0: g[0] && (g[0].away_team + ' @ ' + g[0].home_team + ' ' + g[0].sport_key), cgAt: g[c.gameIndex] && (g[c.gameIndex].away_team + ' @ ' + g[c.gameIndex].home_team + ' ' + g[c.gameIndex].sport_key + ' ' + g[c.gameIndex].id), slipGame: (document.querySelector('.tmr-ticket-row--game strong') || {}).textContent }; });
    console.log(seq.join('>'), '| DOM:', names.join(' @ '), '| pick:', JSON.stringify(st));
    await ctx.close();
  }
  await b.close();
})();
