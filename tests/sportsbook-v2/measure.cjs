const { chromium } = require('playwright');
const { installOverlay } = require('./overlay.cjs');
(async () => {
  const b = await chromium.launch({ headless: true });
  for (const [name, w, h] of [['desktop',1440,900],['mobile',390,844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await installOverlay(ctx);
    const p = await ctx.newPage();
    await p.goto('https://trustmyrecord.com/sportsbook/v2/', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#lobbyBoardRows .sb-odds', { timeout: 45000 });
    const r = await p.evaluate(() => {
      const sels = ['.picks-container-modern','.make-picks-loggedout','.make-picks-header','.sportsbook-page-topbar','#sportSelection','.sportsbook-picks-layout','.sportsbook-league-rail','.sportsbook-rail-list','.sportsbook-board-shell','.sportsbook-selector-head','.sportsbook-period-bar','.sportsbook-board-grid','.sportsbook-board-grid-head','#lobbyBoardRows','#lobbyBoardRows .sportsbook-game-card','#lobbyBoardRows .game-meta-row','#lobbyBoardRows .market-header-row','#lobbyBoardRows .team-market-row','#lobbyBoardRows .odds-cell','#lobbyBoardRows .sb-odds','.sportsbook-ticket-preview'];
      return sels.map(s => { const e = document.querySelector(s); if (!e) return s+': MISSING'; const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return `${s}: top=${Math.round(r.top+scrollY)} h=${Math.round(r.height)} w=${Math.round(r.width)} disp=${c.display} m=${c.marginTop}/${c.marginBottom} p=${c.paddingTop}/${c.paddingBottom} rowgap=${c.rowGap} bt=${c.borderTopWidth} vis=${c.visibility}`; });
    });
    console.log('==', name); console.log(r.join('\n'));
    // siblings between header and layout
    const sib = await p.evaluate(() => [...document.querySelector('.picks-container-modern').children].map(e => { const r=e.getBoundingClientRect(); return `${e.tagName}#${e.id}.${String(e.className).slice(0,40)} top=${Math.round(r.top+scrollY)} h=${Math.round(r.height)} disp=${getComputedStyle(e).display}`; }));
    console.log('-- container children'); console.log(sib.join('\n'));
    await ctx.close();
  }
  await b.close();
})();
