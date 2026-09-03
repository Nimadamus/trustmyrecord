// Legibility pass: for each sport/viewport report chip sizes and any text clipping
// (scrollWidth > clientWidth) in odds chips or team cells, plus horizontal page overflow.
const { chromium } = require('playwright');
const { installOverlay } = require('./overlay.cjs');
const url = process.argv[2] || 'https://trustmyrecord.com/sportsbook/v2/';
const sports = (process.argv[3] || 'MLB,NFL,UFC,Soccer').split(',');
(async () => {
  const b = await chromium.launch({ headless: true });
  let bad = 0;
  const VPS = (process.env.CLIP_VPS || 'desktop,tablet,mobile,mobile-small').split(',');
  for (const [name, w, h] of [['desktop', 1440, 900], ['tablet', 820, 1180], ['mobile', 390, 844], ['mobile-small', 360, 780]].filter((v) => VPS.includes(v[0]))) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await installOverlay(ctx);
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForSelector('#lobbyBoardRows .sb-odds, #lobbyBoardRows .sportsbook-board-empty', { timeout: 45000 });
    for (const s of sports) {
      await p.locator(`.sportsbook-rail-board[data-sport="${s}"]`).first().click();
      await p.waitForFunction((s) => { const r = document.getElementById('lobbyBoardRows'); return r && r.getAttribute('data-sport') === s && (r.querySelector('.sb-odds') || /no /i.test(r.textContent)); }, s, { timeout: 45000 }).catch(() => {});
      await p.waitForTimeout(800);
      const r = await p.evaluate(() => {
        const chips = [...document.querySelectorAll('#lobbyBoardRows .sb-odds:not(.is-empty)')];
        const clipped = chips.filter((c) => [...c.querySelectorAll('span')].some((sp) => sp.scrollWidth > sp.clientWidth + 1)).length;
        const teams = [...document.querySelectorAll('#lobbyBoardRows .team-cell b')];
        const clippedTeams = teams.filter((t) => t.scrollHeight > t.clientHeight + 2 || t.scrollWidth > t.clientWidth + 1);
        const teamClipped = clippedTeams.length; const teamNames = clippedTeams.slice(0, 4).map((t) => t.textContent.trim());
        const sizes = chips.slice(0, 3).map((c) => { const r = c.getBoundingClientRect(); const pr = c.querySelector('.sb-odds-price'); return `${Math.round(r.width)}x${Math.round(r.height)} price ${pr ? getComputedStyle(pr).fontSize : '-'}`; });
        const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
        return { chips: chips.length, clipped, teams: teams.length, teamClipped, teamNames, sizes, overflow };
      });
      const ok = r.clipped === 0 && r.teamClipped === 0 && !r.overflow;
      if (!ok) bad++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${s}: chips=${r.chips} clipped=${r.clipped} teams=${r.teams} teamClipped=${r.teamClipped} overflow=${r.overflow} sizes=${r.sizes.join(' | ')}${r.teamNames && r.teamNames.length ? ' clippedNames=' + JSON.stringify(r.teamNames) : ''}`);
    }
    await ctx.close();
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
