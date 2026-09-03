const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto('https://trustmyrecord.com/sportsbook/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('#lobbyBoardRows .sb-odds', { timeout: 45000 });
  await p.evaluate(() => {
    window.__cgLog = [];
    let cur = window.TMR.currentGames;
    Object.defineProperty(window.TMR, 'currentGames', {
      configurable: true,
      get() { return cur; },
      set(v) { cur = v; const st = (new Error().stack || '').split('\n').slice(2, 5).map(s => s.trim().replace(/https:\/\/trustmyrecord\.com/, '')).join(' | '); window.__cgLog.push({ t: Date.now(), n: Array.isArray(v) ? v.length : -1, sk: v && v[0] && v[0].sport_key, at: st }); }
    });
  });
  for (const s of ['NFL', 'MLB']) {
    await p.evaluate((s) => window.__cgLog.push({ mark: 'click ' + s, t: Date.now() }), s);
    await p.locator(`.sportsbook-rail-board[data-sport="${s}"]`).first().click();
    await p.waitForTimeout(5000);
  }
  const log = await p.evaluate(() => window.__cgLog);
  const t0 = log[0] && log[0].t;
  for (const l of log) console.log(((l.t - t0) / 1000).toFixed(1) + 's', l.mark || `len=${l.n} sport=${l.sk} :: ${l.at}`);
  const rows = await p.evaluate(() => document.getElementById('lobbyBoardRows').getAttribute('data-sport') + ' ' + document.querySelectorAll('#lobbyBoardRows .sportsbook-game-card').length + ' cards; selectedSport=' + window.TMR.selectedSport);
  console.log('DOM:', rows);
  await b.close();
})();
