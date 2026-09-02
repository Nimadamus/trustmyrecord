// @ts-check
/**
 * Handicapping Hub: what the USER SEES must equal what the backend verified.
 *
 * Drives the MLB hub in a real browser: opens random matchup cards, reads the
 * Team Comparison grid, the Verified Trends cards and every "View all N sample
 * games" table, and reconciles each displayed value with
 *   (a) the matchup API payload the page was rendered from, and
 *   (b) an independent source: the MLB standings endpoint for records, streak
 *       and last 10, and the StatsAPI schedule for a random slice of the games
 *       listed under each trend.
 *
 * Nothing here trusts the page's own JavaScript: values are read from the
 * rendered DOM text exactly as a visitor would read them.
 *
 *   npx playwright test --config=playwright.handicapping.config.cjs
 *   HUB_URL=http://127.0.0.1:8080/handicapping/mlb/ ...   (a local build)
 *   HUB_CARDS=4 HUB_SEED=42 ...                           (more cards, replayable)
 */
const { test, expect } = require('@playwright/test');

const HUB_URL = process.env.HUB_URL || 'https://trustmyrecord.com/handicapping/mlb/';
const API = process.env.TMR_API || 'https://trustmyrecord-api.onrender.com/api';
const STATS = 'https://statsapi.mlb.com/api/v1';
const CARDS = Number(process.env.HUB_CARDS) || 2;
let seed = Number(process.env.HUB_SEED) || Math.floor(Math.random() * 1e9);
const SEED0 = seed;
function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
function pick(arr, n) { const a = arr.slice(); const out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; }
const ALIAS = { 'Oakland Athletics': 'Athletics', 'Cleveland Indians': 'Cleveland Guardians', 'Anaheim Angels': 'Los Angeles Angels', 'Florida Marlins': 'Miami Marlins' };
const canon = (s) => ALIAS[s] || s;

async function J(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}
const num = (s) => Number(String(s).replace(/[^0-9.+-]/g, ''));

test.describe('Handicapping Hub integrity (user view vs verified values)', () => {
  test.setTimeout(10 * 60 * 1000);

  test(`random matchup cards reconcile with the API and MLB StatsAPI (seed ${SEED0})`, async ({ page }) => {
    const mismatches = [];
    const note = (label, displayed, verified, source) => {
      const a = String(displayed), b = String(verified);
      const numeric = a.trim() !== '' && b.trim() !== '' && !isNaN(Number(a)) && !isNaN(Number(b));
      if (numeric ? Math.abs(Number(a) - Number(b)) > 1e-9 : a !== b) mismatches.push(`${label} | displayed=${a} | verified=${b} | ${source}`);
    };

    await page.goto(HUB_URL, { waitUntil: 'domcontentloaded' });
    // Cards for the selected slate date render from the board feed.
    await page.waitForSelector('[data-toggle]', { timeout: 90_000 });
    const toggles = await page.locator('[data-toggle]').count();
    expect(toggles).toBeGreaterThan(0);
    const chosen = pick([...Array(toggles).keys()], Math.min(CARDS, toggles));
    console.log(`hub ${HUB_URL} cards=${toggles} chosen=${chosen.join(',')} seed=${SEED0}`);

    for (const idx of chosen) {
      const toggle = page.locator('[data-toggle]').nth(idx);
      // Card root is the <article class="hh-game"> from the template. The
      // comparison grid renders in the collapsed card; the toggle opens the
      // tabbed research body underneath it.
      const card = toggle.locator('xpath=ancestor::article[contains(@class,"hh-game")][1]');
      await toggle.scrollIntoViewIfNeeded();
      await card.locator('.hhc-grid, .hhc-empty-note').first().waitFor({ timeout: 120_000 });
      await toggle.click();
      const body = card.locator('[data-body]');
      await body.locator('[data-panel]').first().waitFor({ timeout: 90_000 });
      const shareHref = await card.locator('[data-share]').getAttribute('data-href');
      const headText = (await card.textContent()) || '';

      // Resolve away/home + slate date from the board feed, matching on the card's share link (#game-<id>) or page link.
      const board = await J(`${API}/games/board/baseball_mlb`);
      const gid = decodeURIComponent((shareHref || '').split('#game-')[1] || '');
      let game = board.games.find((g) => String(g.id) === gid);
      if (!game) game = board.games.find((g) => headText.includes(g.away_team) && headText.includes(g.home_team));
      expect(game, 'card could not be matched to a board game').toBeTruthy();
      const date = new Date(game.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const api = await J(`${API}/handicapping/mlb/matchup?away=${encodeURIComponent(game.away_team)}&home=${encodeURIComponent(game.home_team)}&date=${date}`);
      console.log(`\n== ${game.away_team} @ ${game.home_team} ${date}`);

      // ---- Team Comparison grid, read as text ---------------------------
      const rows = card.locator('.hhc-grid .hhc-row');
      const grid = {};
      for (let i = 0; i < await rows.count(); i++) {
        const r = rows.nth(i);
        const lbl = ((await r.locator('.hhc-lbl').textContent()) || '').trim();
        const cells = r.locator('.hhc-cell');
        if (await cells.count() >= 2) grid[lbl] = [((await cells.nth(0).textContent()) || '').trim(), ((await cells.nth(1).textContent()) || '').trim()];
      }
      const season = Number(date.slice(0, 4));
      const standings = await J(`${STATS}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`);
      const sched = await J(`${STATS}/schedule?sportId=1&date=${date}`);
      const sg = (sched.dates[0]?.games || []).find((x) => x.teams.away.team.name === game.away_team && x.teams.home.team.name === game.home_team);
      const sideFacts = (tid) => { for (const r of standings.records) for (const t of r.teamRecords) if (t.team.id === tid) { const sp = {}; t.records.splitRecords.forEach((x) => { sp[x.type] = `${x.wins}-${x.losses}`; }); return { record: `${t.wins}-${t.losses}`, home: sp.home, away: sp.away, l10: sp.lastTen, streak: t.streak?.streakCode }; } return null; };
      [['away', 0], ['home', 1]].forEach(([side, col]) => {
        const R = api.records[side];
        const f = sg ? sideFacts(sg.teams[side].team.id) : null;
        if (grid['Record']) { note(`${side} Record (UI vs API)`, grid['Record'][col].split(/\s/)[0], R.record, 'matchup API'); if (f) note(`${side} Record (UI vs standings)`, grid['Record'][col].split(/\s/)[0], f.record, 'statsapi standings'); }
        if (grid['Home / Road Split'] && f) note(`${side} split (UI vs standings)`, grid['Home / Road Split'][col].split(/\s/)[0], side === 'away' ? f.away : f.home, 'statsapi standings');
        if (grid['Current Streak'] && f) note(`${side} streak (UI vs standings)`, grid['Current Streak'][col].split(/\s/)[0], f.streak, 'statsapi standings');
        if (grid['Last 10'] && f) note(`${side} last 10 (UI vs standings)`, grid['Last 10'][col].split(/\s/)[0], f.l10, 'statsapi standings');
        if (grid['Last 5']) note(`${side} last 5 (UI vs API)`, grid['Last 5'][col].split(/\s/)[0], R.last5, 'matchup API');
        const O = api.offense[side], TP = api.team_pitching[side], P = api.pitchers[side], B = api.bullpens[side];
        if (grid['Runs / Game'] && O.available) note(`${side} R/G`, num(grid['Runs / Game'][col]), O.runs_per_game, 'matchup API');
        if (grid['Runs Allowed / Game'] && TP.available) note(`${side} RA/G`, num(grid['Runs Allowed / Game'][col]), TP.runs_allowed_per_game, 'matchup API');
        if (grid['Batting AVG'] && O.available) note(`${side} AVG`, num(grid['Batting AVG'][col]), Number(O.avg), 'matchup API');
        if (grid['OPS'] && O.available) note(`${side} OPS`, num(grid['OPS'][col]), Number(O.ops), 'matchup API');
        if (grid['Home Runs'] && O.available) note(`${side} HR`, num(grid['Home Runs'][col]), O.home_runs, 'matchup API');
        if (grid['Starter ERA'] && P.available) note(`${side} starter ERA`, num(grid['Starter ERA'][col]), P.era, 'matchup API');
        if (grid['Starter WHIP'] && P.available) note(`${side} starter WHIP`, num(grid['Starter WHIP'][col]), P.whip, 'matchup API');
        if (grid['Starter K%'] && P.available) note(`${side} starter K%`, num(grid['Starter K%'][col]), P.k_pct, 'matchup API');
        if (grid['Bullpen ERA'] && B.available) note(`${side} bullpen ERA`, num(grid['Bullpen ERA'][col]), B.era, 'matchup API');
        if (grid['Bullpen IP, last 3 G'] && B.available && B.workload?.available) note(`${side} bullpen IP last 3`, num(grid['Bullpen IP, last 3 G'][col]), B.workload.innings_last_3_games, 'matchup API');
      });

      // ---- Trends tab -----------------------------------------------------
      const trendsTab = body.locator('[data-tab="trends"]').first();
      if (await trendsTab.count()) await trendsTab.click();
      const panel = body.locator('[data-panel="trends"]');
      await panel.locator('.hh-trend, .hh-state, .hh-tsec, .hh-src').first().waitFor({ timeout: 60_000 });
      const cards = panel.locator('.hh-trend');
      const shown = await cards.count();
      note('verified trend cards shown', shown, api.trends.length, 'matchup API trends[]');
      const countBadge = ((await panel.locator('.hh-count').first().textContent().catch(() => '')) || '').trim();
      if (countBadge) note('"cleared the engine" count', num(countBadge), api.trends.length, 'matchup API trends[]');
      for (let i = 0; i < shown; i++) {
        const c = cards.nth(i);
        const statement = ((await c.locator('.hh-trend__claim').textContent()) || '').trim();
        const t = api.trends.find((x) => x.statement === statement);
        if (!t) { mismatches.push(`trend card "${statement}" is not in the API payload`); continue; }
        const stats = ((await c.locator('.hh-trend__stats').textContent()) || '').replace(/\s+/g, ' ');
        const m = (re) => { const x = stats.match(re); return x ? x[1] : null; };
        note(`${t.id} Record`, m(/Record (\d+-\d+(?:-\d+)?)/), t.record, 'API');
        note(`${t.id} Win%`, num(m(/Win% ([\d.]+)%/)), t.win_pct, 'API');
        if (t.expected_win_pct != null) note(`${t.id} Baseline`, num(m(/Baseline ([\d.]+)%/)), t.expected_win_pct, 'API fair market probability');
        if (t.break_even_pct != null) note(`${t.id} Break-even`, num(m(/Break-even ([\d.]+)%/)), t.break_even_pct, 'API break_even_pct');
        if (t.scope) { const why = ((await c.locator('.hh-trend__why').textContent().catch(() => '')) || ''); note(`${t.id} scope shown`, why.includes(t.scope), true, 'API scope'); }
        if (/\|(FAV|DOG)$/.test(t.id)) note(`${t.id} favourite margin stated`, /at least 4 pts clear/.test(statement), true, 'statement contract');
        note(`${t.id} Sample`, num(m(/Sample (\d+)/)), t.sample, 'API decided games');
        note(`${t.id} Range`, m(/Range (\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2})/), t.date_range, 'API');
        note(`${t.id} Seasons`, num(m(/Seasons (\d+)/)), t.seasons_covered, 'API');
        if (t.units != null) note(`${t.id} Units`, num(m(/Units ([+\-\d.]+)u/)), t.units, 'API'); else note(`${t.id} Units must not render`, /Units [+\-\d.]+u/.test(stats), false, 'null units');
        if (t.roi_pct != null) note(`${t.id} ROI`, num(m(/ROI ([+\-\d.]+)%/)), t.roi_pct, 'API');
        const edge = ((await c.locator('.hh-edge').textContent().catch(() => '')) || '').trim();
        if (edge) note(`${t.id} pts vs baseline`, num(edge.match(/([+\-][\d.]+) pts/)?.[1]), Number(t.edge_pct).toFixed(1), 'API edge_pct');
        // "View all N sample games": count and reconcile every row.
        const det = c.locator('details.hh-trend__games');
        const summary = ((await det.locator('summary').textContent()) || '').trim();
        note(`${t.id} sample-game count in summary`, num(summary.match(/View all (\d+)/)?.[1]), t.games.length, 'API games[]');
        await det.locator('summary').click();
        await det.locator('table.hh-gamestbl tbody tr').first().waitFor({ timeout: 30_000 });
        const trs = det.locator('table.hh-gamestbl tbody tr');
        const n = await trs.count();
        note(`${t.id} sample-game rows rendered`, n, t.games.length, 'API games[]');
        const seen = new Set();
        for (let r = 0; r < n; r++) {
          const tds = await trs.nth(r).locator('td').allTextContents();
          const key = `${tds[0]}|${tds[1]}|${tds[2]}|${tds[4]}`;
          seen.add(key);
        }
        const expected = new Set(t.games.map((g) => `${String(g.date).slice(0, 10)}|${g.matchup}|${g.score}|${g.outcome}`));
        const missing = [...expected].filter((k) => !seen.has(k)).length;
        const extra = [...seen].filter((k) => !expected.has(k)).length;
        note(`${t.id} sample rows missing`, missing, 0, 'set difference vs API games[]');
        note(`${t.id} sample rows extra`, extra, 0, 'set difference vs API games[]');
        // Independent: a random slice of the rows the user sees vs MLB final scores.
        for (const g of pick(t.games, Math.min(3, t.games.length))) {
          const gd = String(g.date).slice(0, 10);
          const [aw, hm] = g.matchup.split(' @ ');
          const s = await J(`${STATS}/schedule?sportId=1&date=${gd}`);
          const ok = (s.dates[0]?.games || []).some((x) => canon(x.teams.away.team.name) === canon(aw) && canon(x.teams.home.team.name) === canon(hm) && x.status.codedGameState === 'F' && `${x.teams.away.score}-${x.teams.home.score}` === g.score);
          note(`${t.id} sample game ${gd} ${g.matchup} ${g.score} is a real final`, ok, true, 'statsapi schedule');
        }
      }
      console.log(`  grid rows=${Object.keys(grid).length} trends=${shown}`);
    }

    if (mismatches.length) console.log('\nMISMATCHES\n' + mismatches.join('\n'));
    expect(mismatches, `seed ${SEED0}`).toEqual([]);
  });
});
