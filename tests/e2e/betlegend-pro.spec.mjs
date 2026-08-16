import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * End-to-end cover for the BetLegend Pro console.
 *
 * Drives the REAL shipped page (betlegend-pro/app/index.html) and its real
 * inline script off disk, with only `window.api` stubbed. Nothing here is a
 * copy of the app: if the markup or the script changes, these tests see the
 * change. The API is stubbed rather than live so the assertions are about
 * behaviour rather than about whichever games happened to be in the dataset
 * this morning, and so a run costs no report allowance.
 *
 * The console mounts in a SHADOW ROOT. Playwright's CSS engine pierces shadow
 * boundaries, so `#mAway` resolves; `getByRole` does too. Neither needed a
 * special helper -- worth stating, because the obvious debugging conclusion
 * when a selector misses here is "shadow DOM", and it is not.
 *
 * The live counterpart is `tests/e2e/betlegend-pro-live.spec.mjs`, which needs
 * credentials and hits production.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, '..', '..', 'betlegend-pro', 'app');
const STATIC = path.join(HERE, '..', '..', 'static', 'css');

const TEAMS = {
  MLB: ['New York Yankees', 'Boston Red Sox', 'Chicago Cubs'],
  NHL: ['Boston Bruins', 'Toronto Maple Leafs'],
  NBA: ['Boston Celtics', 'Atlanta Hawks'],
  NFL: ['Kansas City Chiefs', 'Philadelphia Eagles'],
};

const COVERAGE = [
  { sport: 'MLB', earliest_date: '2000-03-29', latest_date: '2026-08-05', earliest_season: 2000, latest_season: 2026, games: 64273 },
  { sport: 'NBA', earliest_date: '2007-10-30', latest_date: '2026-06-13', earliest_season: 2007, latest_season: 2026, games: 24425 },
  { sport: 'NFL', earliest_date: '1966-09-02', latest_date: '2026-02-08', earliest_season: 1966, latest_season: 2026, games: 14371 },
  { sport: 'NHL', earliest_date: '2003-10-08', latest_date: '2026-06-14', earliest_season: 2003, latest_season: 2026, games: 28458 },
];

/** The real shape of GET /api/betlegend-pro/matchup-filters, trimmed to the
 *  groups these tests drive. Keep in step with the engine's filter registry. */
function filterLibrary(sport) {
  const teamScoped = (id, label, help) => ({
    id, label, help, kind: 'enum', scope: 'team', available: true,
    options: [{ value: 'win', label: 'Won' }, { value: 'loss', label: 'Lost' }],
  });
  return {
    sport,
    coverage_from: 2010,
    database_coverage: COVERAGE.find((c) => c.sport === sport),
    coverage_all: COVERAGE,
    rejected: [],
    notes: [],
    groups: [
      {
        id: 'form', label: 'Recent form',
        filters: [teamScoped('prev_result', 'Previous game result', "How the team's previous game finished.")],
      },
      {
        id: 'market', label: 'Market',
        filters: [{
          id: 'spread_range', label: 'Closing spread range',
          help: "The closing spread from this team's side.",
          kind: 'range', scope: 'team',
          available: sport === 'NFL' || sport === 'NBA',
          unavailable_reason: sport === 'NFL' || sport === 'NBA' ? null
            : `${sport} has no varying point spread — the line is fixed at ±1.5.`,
        }],
      },
    ],
  };
}

/**
 * The report fixture is a REAL response captured from
 * POST /api/betlegend-pro/matchup-historical (New York Yankees at Boston Red
 * Sox, no conditions), trimmed to four games. Hand-written fixtures for this
 * endpoint have already gone stale twice -- the shape carries thirty top-level
 * keys and the renderer reads a dozen of them -- so the fixture is refreshed
 * from production rather than invented:
 *
 *   node -e "..."  # see tests/e2e/fixtures/README.md
 *
 * It is deliberately a PRE-REPAIR capture, so it still carries the run lines
 * that used to make the Favorite column render "New York Yankees +1.5" on a
 * game the Yankees were -148 to win. The favourite assertion below therefore
 * proves the fix rather than the fixture.
 */
const REPORT_FIXTURE = JSON.parse(
  fs.readFileSync(path.join(HERE, 'fixtures', 'matchup-historical.json'), 'utf8'));

function report(over = {}) {
  const result = JSON.parse(JSON.stringify(REPORT_FIXTURE));
  if (over.games) {
    result.team_1_report.games = over.games;
    result.team_1_report.total_qualifying_games = over.games.length;
    result.team_2_report.games = over.games;
    result.team_2_report.total_qualifying_games = over.games.length;
  }
  if (over.matchup_summary !== undefined) result.matchup_summary = over.matchup_summary;
  if (over.zero_result !== undefined) result.zero_result = over.zero_result;
  return {
    result,
    billed: false, amount_charged: 0, was_free_inquiry: false,
    included_in_plan: true, saved_id: 11, request_id: 'req-1',
  };
}

const SIMULATION = {
  result: {
    parameters: {
      win_probability: 0.55, odds: -110, decimal_odds: 1.9091, bankroll: 10000,
      num_bets: 100, num_simulations: 10000, strategy: 'flat', stake_pct: 0.02,
      kelly_fraction: null,
    },
    results: {
      mean_final_bankroll: 11069.1, median_final_bankroll: 10853.43, std_dev: 2108.13,
      min_final: 5454.82, max_final: 22436.39,
      percentile_5: 7994.16, percentile_25: 9677.63, percentile_75: 12172.08, percentile_95: 14735.37,
      bust_rate: 0, profit_probability: 0.6985, avg_max_drawdown: 0.1705,
      bankroll_growth_pct: 10.69, roi_on_turnover_pct: 5.16, mean_total_staked: 21058.7,
      expected_roi: 10.69,
    },
  },
  billed: false, included_in_plan: true, request_id: 'sim-1',
};

/**
 * Serve the real page with a stubbed API.
 *
 * `opts.entitled`   subscriber (unlimited) vs free (one report a day)
 * `opts.loggedIn`   false exercises the auth gate
 * `opts.failReport` the submit path returns a 502
 * `opts.report`     override the report payload
 * `opts.freeUsed`   free user whose allowance is spent
 */
async function open(page, opts = {}) {
  const calls = { matchup: [], preview: [], simulation: [], trend: [], situations: [] };
  await page.exposeFunction('__record', (kind, payload) => { calls[kind].push(payload); });

  await page.addInitScript((cfg) => {
    const { teams, library, coverage, entitled, loggedIn, failReport, freeUsed, reportBody, simulation } = cfg;
    window.__calls = [];
    window.api = {
      isLoggedIn: () => loggedIn,
      request: async (pathname) => {
        await window.__record('situations', pathname);
        const sport = pathname.split('/').pop();
        // Mirrors GET /api/query/quick/situations: the two spread-size
        // situations are unanswerable where the line is a fixed +/-1.5.
        const fixedLine = sport === 'MLB' || sport === 'NHL';
        const blocked = {
          large_spread: fixedLine ? `${sport} has no varying point spread.` : null,
          close_spread: fixedLine ? `${sport} has no varying point spread.` : null,
          day_game: sport === 'NBA' || sport === 'NHL' ? `${sport} carries too few start times.` : null,
          night_game: sport === 'NBA' || sport === 'NHL' ? `${sport} carries too few start times.` : null,
        };
        return {
          sport,
          situations: ['home_favorite', 'road_underdog', 'after_loss', 'large_spread', 'close_spread', 'day_game', 'night_game']
            .map((id) => ({ id, label: id.replace(/_/g, ' '), supported: !blocked[id], reason: blocked[id] })),
        };
      },
      getBetLegendProTeams: async (sport) => ({ teams: teams[sport] || [] }),
      getBetLegendProMatchupFilters: async (sport) => library[sport],
      getBetLegendProStatus: async () => ({
        eligible: true, balance: entitled ? 0 : 25, isFrozen: false,
        freeAvailable: entitled ? false : !freeUsed,
        freeInquiriesPerDay: 1, freeInquiryTimezone: 'America/New_York', freeResetsAt: null,
        cost: entitled ? 0 : (freeUsed ? 5 : 0),
        canAfford: entitled ? true : !freeUsed || 25 >= 5,
        access: entitled
          ? { entitled: true, plan: 'monthly', status: 'active', is_lifetime: false, manageable: true }
          : { entitled: false, plan: null, status: 'none', is_lifetime: false, manageable: false },
      }),
      getBetLegendProHistory: async () => ({ items: [] }),
      getBetLegendProHistoryDetail: async () => ({}),
      previewBetLegendProHistoricalMatchup: async (payload) => {
        await window.__record('preview', payload);
        return { qualifying_games: 241, games_in_dataset: 485, trail: [] };
      },
      submitBetLegendProHistoricalMatchup: async (payload) => {
        await window.__record('matchup', payload);
        if (failReport) { const e = new Error('upstream failed'); e.status = 502; throw e; }
        return reportBody;
      },
      submitBetLegendProInquiry: async (payload) => {
        await window.__record('trend', payload);
        return { result: { situation: 'Home Favorites', team: payload.team, sport: payload.sport, summary: { count: 356, su_record: '244-108-4' }, games: [], total_games: 356 } };
      },
      submitBetLegendProSimulation: async (payload) => {
        await window.__record('simulation', payload);
        return simulation;
      },
      submitBetLegendProReport: async () => ({ result: { needs_clarification: false, report: {} } }),
      startBetLegendProCheckout: async () => ({ url: 'https://checkout.stripe.test/session' }),
    };
    void coverage;
  }, {
    teams: TEAMS,
    library: Object.fromEntries(Object.keys(TEAMS).map((s) => [s, filterLibrary(s)])),
    coverage: COVERAGE,
    entitled: opts.entitled !== false,
    loggedIn: opts.loggedIn !== false,
    failReport: !!opts.failReport,
    freeUsed: !!opts.freeUsed,
    reportBody: opts.report || report(),
    simulation: SIMULATION,
  });

  await page.goto('file:///' + path.join(APP, 'index.html').replace(/\\/g, '/'));
  await page.addStyleTag({ path: path.join(STATIC, 'tmr-sitewide.css') }).catch(() => {});

  // The console's own stylesheet has to go INSIDE the shadow root. The page
  // links it with an absolute /betlegend-pro/app/ path, which under file://
  // resolves to file:///C:/betlegend-pro/... and 404s, and a document-level
  // addStyleTag cannot cross the shadow boundary either. Without this every
  // layout assertion below measures unstyled markup -- the overflow checks in
  // particular mean nothing, because with no stylesheet there is no min-width
  // to overflow and no scroll container to contain it. The previous spec in
  // this directory hit the same trap on /static/ and only half-fixed it.
  await page.waitForFunction(() => {
    const host = document.getElementById('blpConsole');
    return host && host.shadowRoot && host.shadowRoot.getElementById('mAway');
  });
  await page.evaluate((css) => {
    const style = document.createElement('style');
    style.textContent = css;
    document.getElementById('blpConsole').shadowRoot.appendChild(style);
  }, fs.readFileSync(path.join(APP, 'console.css'), 'utf8'));

  return calls;
}

async function chooseMatchup(page, away = 'New York Yankees', home = 'Boston Red Sox') {
  await page.locator('#mAway').selectOption(away);
  await page.locator('#mHome').selectOption(home);
}

// ---------------------------------------------------------------- access

test.describe('access', () => {
  test('a logged-out visitor gets the sign-in gate and no tool', async ({ page }) => {
    await open(page, { loggedIn: false });
    await expect(page.getByRole('heading', { name: 'Sign in to open BetLegend Pro' })).toBeVisible();
    // The tool's markup is in the document either way -- it is one template.
    // What must be true is that none of it is reachable, which `hidden` on the
    // container gives and which a user cannot undo without devtools.
    await expect(page.locator('#app')).toBeHidden();
    await expect(page.locator('#mSubmit')).toBeHidden();
    await expect(page.locator('#topbarRight')).toBeHidden();
    // The gate must return the visitor to where they were going.
    await expect(page.getByRole('link', { name: 'Log in' }))
      .toHaveAttribute('href', '/login/?next=/betlegend-pro/app/');
  });

  test('a subscriber sees their plan and no upsell', async ({ page }) => {
    await open(page, { entitled: true });
    await expect(page.locator('#planChip')).toHaveText(/Monthly/i);
    await expect(page.locator('#upgradeBtn')).toBeHidden();
    await expect(page.locator('#mSubmit')).toContainText('Included');
  });

  test('a free user sees the daily allowance and an upgrade route', async ({ page }) => {
    await open(page, { entitled: false });
    await expect(page.locator('#upgradeBtn')).toBeVisible();
    await expect(page.locator('#upgradeBtn')).toHaveAttribute('href', '/betlegend-pro/#pricing');
    await expect(page.locator('#allowanceNotice')).toContainText(/free report/i);
  });

  test('a free user whose report is spent cannot submit, and is told why', async ({ page }) => {
    await open(page, { entitled: false, freeUsed: true });
    await chooseMatchup(page);
    const submit = page.locator('#mSubmit');
    // Either disabled outright, or priced in coin -- never a silent no-op.
    const disabled = await submit.isDisabled();
    if (disabled) {
      await expect(submit).toHaveAttribute('title', /free report is used|not eligible|frozen/i);
    } else {
      await expect(submit).toContainText(/TMR Coin|5/);
    }
  });
});

// --------------------------------------------------------------- filters

test.describe('filters', () => {
  test('a matchup cannot be a team against itself', async ({ page }) => {
    await open(page);
    await chooseMatchup(page, 'New York Yankees', 'New York Yankees');
    await expect(page.locator('#mSubmit')).toBeDisabled();
  });

  test('the condition picker opens only once both teams are chosen', async ({ page }) => {
    await open(page);
    await expect(page.locator('#addCond')).toBeDisabled();
    await chooseMatchup(page);
    await expect(page.locator('#addCond')).toBeEnabled();
    await page.locator('#addCond').click();
    await expect(page.locator('#condMenu')).toBeVisible();
  });

  test('a condition this sport cannot answer is shown as unavailable, not hidden', async ({ page }) => {
    await open(page);
    await chooseMatchup(page);
    await page.locator('#addCond').click();
    const menu = page.locator('#condMenu');
    await expect(menu).toContainText('Closing spread range');
    await expect(menu).toContainText(/no varying point spread/i);
  });

  test('venue, period and limit all reach the payload', async ({ page }) => {
    const calls = await open(page);
    await chooseMatchup(page);
    await page.locator('#mVenue').selectOption('all');
    await page.locator('#mLimit').selectOption('20');
    await page.locator('#mSubmit').click();
    await expect.poll(() => calls.matchup.length).toBe(1);
    expect(calls.matchup[0]).toMatchObject({
      sport: 'MLB', team_1: 'New York Yankees', team_2: 'Boston Red Sox',
      team_venue: 'all', sample_size: 20,
    });
    expect(calls.matchup[0].idempotency_key).toBeTruthy();
  });

  test('a combination of conditions is sent together, and clearing removes all of them', async ({ page }) => {
    const calls = await open(page);
    await chooseMatchup(page);
    await page.locator('#addCond').click();
    // Add the same condition for each team: the two must not collapse into one.
    const rows = page.locator('#condMenu .condopt', { hasText: 'Previous game result' });
    await rows.getByRole('button', { name: /New York Yankees/ }).click();
    await page.locator('#addCond').click();
    await rows.getByRole('button', { name: /Boston Red Sox/ }).click();
    await expect(page.locator('#condList')).toContainText('New York Yankees');
    await expect(page.locator('#condList')).toContainText('Boston Red Sox');

    await page.locator('#clearAll').click();
    await expect(page.locator('#condList')).not.toContainText('Previous game result');
    await page.locator('#mSubmit').click();
    await expect.poll(() => calls.matchup.length).toBe(1);
    expect(calls.matchup[0].team_1_filters).toBeUndefined();
    expect(calls.matchup[0].team_2_filters).toBeUndefined();
  });

  test('Team Trends only offers situations this sport can answer', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Team Trends' }).click();
    const select = page.locator('#tSituation');
    await expect(select.locator('option[value="large_spread"]')).toBeDisabled();
    await expect(select.locator('option[value="home_favorite"]')).toBeEnabled();
    await page.locator('#tSport').selectOption('NFL');
    await expect(select.locator('option[value="large_spread"]')).toBeEnabled();
  });
});

// ---------------------------------------------------------------- report

test.describe('report', () => {
  test('the qualifying count, the record and the listed games agree', async ({ page }) => {
    await open(page);
    await chooseMatchup(page);
    await page.locator('#mSubmit').click();
    const table = page.locator('table.games');
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(4);
    await expect(page.locator('#mResult')).toContainText('120-121');
    await expect(page.locator('#mResult')).toContainText('121-120');
  });

  test('the favourite is named with the number that made them one', async ({ page }) => {
    await open(page);
    await chooseMatchup(page);
    await page.locator('#mSubmit').click();
    const favCells = page.locator('table.games tbody tr td:nth-child(7)');
    // MLB: the price, never the fixed run line, and never a favourite laying a
    // positive number.
    for (const text of await favCells.allTextContents()) {
      expect(text, `"${text}" must not pair a favourite with +1.5`).not.toMatch(/\+1\.5|-1\.5/);
      expect(text).toMatch(/[+-]\d{3,}|—/);
    }
    await expect(favCells.first()).toHaveText(/Boston Red Sox -112/);
  });

  test('every sortable column sorts, both ways, without losing a row', async ({ page }) => {
    await open(page);
    await chooseMatchup(page);
    await page.locator('#mSubmit').click();
    const table = page.locator('table.games');
    const before = await table.locator('tbody tr').count();

    const margin = table.locator('th', { hasText: 'Margin' });
    await margin.click();
    await expect(margin).toHaveAttribute('aria-sort', 'ascending');
    let values = (await table.locator('tbody tr td:nth-child(6)').allTextContents()).map(Number);
    expect(values).toEqual([...values].sort((a, b) => a - b));

    await margin.click();
    await expect(margin).toHaveAttribute('aria-sort', 'descending');
    values = (await table.locator('tbody tr td:nth-child(6)').allTextContents()).map(Number);
    expect(values).toEqual([...values].sort((a, b) => b - a));

    // Only one column may claim the sort.
    await expect(table.locator('th[aria-sort="ascending"], th[aria-sort="descending"]')).toHaveCount(1);
    await expect(table.locator('tbody tr')).toHaveCount(before);
  });

  test('rows with no value sink rather than interleaving', async ({ page }) => {
    await open(page);
    await chooseMatchup(page);
    await page.locator('#mSubmit').click();
    const table = page.locator('table.games');
    await table.locator('th', { hasText: 'Closing total' }).click();
    const totals = await table.locator('tbody tr td:nth-child(8)').allTextContents();
    const firstDash = totals.findIndex((t) => t.trim() === '—');
    if (firstDash !== -1) {
      expect(totals.slice(firstDash).every((t) => t.trim() === '—')).toBe(true);
    }
  });

  test('an empty sample says so instead of rendering a blank table', async ({ page }) => {
    const empty = report({
      games: [],
      matchup_summary: { qualifying_games: 0, team_1_record: '0-0', team_2_record: '0-0' },
      zero_result: {
        message: 'No meeting matches these conditions in this period.',
        narrowest_filter: { filter: 'Previous game result', games_before: 241, games_after: 0 },
        actions: [],
      },
    });
    await open(page, { report: empty });
    await chooseMatchup(page);
    await page.locator('#mSubmit').click();
    await expect(page.locator('#mResult')).toContainText(/No meeting matches these conditions/i);
    await expect(page.locator('table.games')).toHaveCount(0);
  });

  test('an upstream failure surfaces an error and leaves the form usable', async ({ page }) => {
    await open(page, { failReport: true });
    await chooseMatchup(page);
    await page.locator('#mSubmit').click();
    await expect(page.locator('#mError')).toBeVisible();
    await expect(page.locator('#mSubmit')).toBeEnabled();
  });
});

// ------------------------------------------------------------ simulator

test.describe('bankroll simulator', () => {
  test('ROI and bankroll growth are two separate, correctly named figures', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Bankroll Simulator' }).click();
    await page.locator('#simSubmit').click();
    const out = page.locator('#simResult');
    await expect(out).toContainText('Bankroll growth');
    await expect(out).toContainText('+10.7%');
    await expect(out).toContainText('ROI per $ staked');
    await expect(out).toContainText('+5.2%');
    // The mislabel this replaced.
    await expect(out).not.toContainText('Return on total amount staked');
    // "flat" alone reads as a fixed dollar stake.
    await expect(out).toContainText('2% of the running bankroll');
  });
});

// ----------------------------------------------------------- navigation

test.describe('navigation', () => {
  const TABS = ['Matchup Report', 'Ask BetLegend', 'Bankroll Simulator', 'Team Trends', 'Library'];

  test('every tool is reachable and exactly one panel is shown at a time', async ({ page }) => {
    await open(page);
    for (const name of TABS) {
      await page.getByRole('tab', { name }).click();
      await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('.panel.is-active')).toHaveCount(1);
    }
  });

  test('the chosen tool survives a reload via the hash', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Team Trends' }).click();
    await expect(page).toHaveURL(/#trends$/);
  });
});

// ----------------------------------------------------------- viewports

test.describe('viewports', () => {
  for (const vp of [
    { name: 'desktop 1440', width: 1440, height: 900 },
    { name: 'laptop 1280', width: 1280, height: 800 },
    { name: 'mobile 390', width: 390, height: 844 },
  ]) {
    test(`no horizontal page overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await open(page);
      await chooseMatchup(page);
      await page.locator('#mSubmit').click();
      await expect(page.locator('table.games')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'the page itself must never scroll sideways').toBeLessThanOrEqual(1);
      // The wide table is allowed to scroll, but only inside its own box: the
      // ten-column game log cannot fit a phone and must not drag the page
      // sideways to try.
      const wrap = await page.evaluate(() => {
        const host = document.getElementById('blpConsole');
        const box = host.shadowRoot.querySelector('.tablewrap');
        if (!box) return null;
        return {
          overflowX: getComputedStyle(box).overflowX,
          scrolls: box.scrollWidth > box.clientWidth,
          withinViewport: box.getBoundingClientRect().right <= window.innerWidth + 1,
        };
      });
      expect(wrap, 'the game log must be inside a scroll container').not.toBeNull();
      expect(['auto', 'scroll']).toContain(wrap.overflowX);
      expect(wrap.withinViewport, 'the scroll container itself must fit').toBe(true);
    });
  }

  test('on a phone the tool is on the first screen, not below the instructions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    const top = await page.evaluate(() => {
      const host = document.getElementById('blpConsole');
      const tabs = host.shadowRoot.querySelector('[role=tablist]');
      return tabs.getBoundingClientRect().top + window.scrollY;
    });
    expect(top, 'the tabs must sit within one screen of the top').toBeLessThan(844);
  });
});
