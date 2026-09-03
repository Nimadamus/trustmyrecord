const { chromium } = require('playwright');
const { installOverlay } = require('./overlay.cjs');
(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await installOverlay(ctx);
  const p = await ctx.newPage();
  await p.goto('https://trustmyrecord.com/sportsbook/v2/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#lobbyBoardRows .sb-odds', { timeout: 45000 });
  await p.locator('#lobbyBoardRows .sb-odds:not(.is-empty)').first().click();
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const out = {};
    const trim = (s) => s.replace(/\s+/g, ' ').slice(0, 700);
    out.fixed = [...document.querySelectorAll('body *')].filter(e => { const cs = getComputedStyle(e); return (cs.position === 'fixed') && cs.display !== 'none' && e.offsetParent !== null || (cs.position==='fixed' && e.getBoundingClientRect().height>0); }).map(e => `${e.tagName}#${e.id}.${e.className} :: ${trim(e.outerHTML)}`).slice(0, 12);
    const sel = document.querySelector('#lobbyBoardRows .sb-odds.selected, #lobbyBoardRows .sb-odds.is-selected, #lobbyBoardRows .sb-odds[aria-pressed="true"], #lobbyBoardRows .sb-odds.active');
    out.selected = sel ? trim(sel.outerHTML) : null;
    const cs = (s) => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return { display: c.display, cols: c.gridTemplateColumns, pos: c.position, bg: c.backgroundColor, flexDir: c.flexDirection }; };
    out.rail = cs('.sportsbook-rail-list'); out.layout = cs('.sportsbook-picks-layout'); out.body = cs('body'); out.hero = cs('.make-picks-header'); out.aside = cs('.sportsbook-ticket-preview');
    out.card = trim(document.querySelector('#lobbyBoardRows .sportsbook-game-card, #lobbyBoardRows > *').outerHTML).slice(0,600);
    out.railBtn = trim(document.querySelector('.sportsbook-rail-board').outerHTML);
    out.styleCount = document.querySelectorAll('style').length;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
