import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * Local regression cover for the rebuilt Matchup Research panel.
 *
 * Serves the real page off disk with window.api stubbed, so this exercises the
 * shipped markup and the shipped inline script -- not a copy of them. Every
 * assertion is about behaviour a user can see: the workflow renders, the
 * controls drive the payload, validation blocks the bad cases, and the report
 * renders from the exact response shape /betlegend-pro/matchup-historical
 * returns.
 */
// Absolute so the spec can be run by a Playwright install in another project
// (this repo ships no node_modules of its own).
const APP = process.env.BLP_APP_DIR || 'C:/Users/Nima/tmrfe-main/betlegend-pro/app';
const SPORTS = ['MLB', 'NHL', 'NBA', 'NFL'];

const TEAMS = {
  MLB: ['Chicago Cubs', 'St. Louis Cardinals'],
  NHL: ['Boston Bruins', 'Toronto Maple Leafs'],
  NBA: ['Boston Celtics', 'Atlanta Hawks'],
  NFL: ['Kansas City Chiefs', 'Philadelphia Eagles'],
};

function report(sport, away, home) {
  const team = (name, n) => ({
    team: name, conditions_applied: true, total_qualifying_games: n,
    games_in_dataset: 900, qualifying_games: Math.min(n, 20),
    record: '7-3', wins: 7, losses: 3, ties: 0, win_pct: 70,
    avg_scored: 4.6, avg_allowed: 3.9, avg_margin: 0.7,
    date_range: { from: '2026-03-14', to: '2026-04-28' },
    recent_trend: { games: 5, record: '3-2', label: '3-2 in the last 5' },
    home_games: 10, away_games: 0,
    ats: { record: '5-5', cover_pct: 50, eligible_games: 10, note: 'Supplemental.' },
    ou: { record: '4-6', over_pct: 40, eligible_games: 10, note: 'Supplemental.' },
    sample_note: null,
    games: [{
      date: '2026-04-28', team: name, opponent: 'Someone', venue: 'Home',
      team_score: 5, opponent_score: 3, score: '5-3', result: 'W', margin: 2,
      role: 'Favorite', closing_line: -1.5, closing_line_available: true,
      closing_total: 8.5, season_type: null, rest_days: 1,
      qualified_because: ['Home game', 'Favorite at -1.5'],
    }],
  });
  return {
    result: {
      sport, team_1: away, team_2: home,
      filters_applied: ['Home games only'],
      filters_not_applied: [],
      scope: 'both', sample_size_requested: 20, notes: [],
      data_through: '2026-04-28',
      team_1_report: team(away, 731), team_2_report: team(home, 542),
      head_to_head: {
        team: away, opponent: home, conditions_applied: false,
        note: 'Every meeting.', total_qualifying_games: 92, games_in_dataset: 92,
        qualifying_games: 20, record: '9-11', win_pct: 45, avg_margin: -0.4,
        avg_scored: 4.1, avg_allowed: 4.5, games: [], date_range: null,
        recent_trend: null, home_games: 10, away_games: 10, wins: 9, losses: 11, ties: 0,
        ats: { record: '0-0', cover_pct: null, eligible_games: 0, note: '' },
        ou: { record: '0-0', over_pct: null, eligible_games: 0, note: '' },
        sample_note: null,
      },
    },
    billed: false, was_free_inquiry: true, included_in_plan: false,
    balance_before: 25, balance_after: 25, ledger_entry_id: 'test-1',
  };
}

/** Loads the real page with a stubbed window.api and captures submissions. */
async function open(page, opts = {}) {
  const submissions = [];
  await page.exposeFunction('__record', (p) => { submissions.push(p); });
  await page.addInitScript(({ teams, fail }) => {
    window.__failReport = fail;
    window.api = {
      isLoggedIn: () => true,
      getBetLegendProTeams: async (sport) => ({ teams: teams[sport] || [] }),
      getBetLegendProStatus: async () => ({
        access: { entitled: false, plan: null },
        cost: { cost: 5, free_available: true },
        balance: 25, wallet_frozen: false,
      }),
      getBetLegendProHistory: async () => ({ items: [] }),
      submitBetLegendProHistoricalMatchup: async (payload) => {
        await window.__record(payload);
        if (window.__failReport) {
          const e = new Error('upstream failed');
          e.status = 502;
          throw e;
        }
        return window.__report;
      },
    };
  }, { teams: TEAMS, fail: !!opts.fail });

  await page.goto('file:///' + path.join(APP, 'index.html').replace(/\\/g, '/'));
  await page.evaluate((r) => { window.__report = r; }, opts.report || report('MLB', 'Chicago Cubs', 'St. Louis Cardinals'));
  await expect(page.getByRole('heading', { name: 'Matchup Research' })).toBeVisible();
  return submissions;
}

test.describe('Matchup Research panel', () => {
  test('the retired betting UI is gone from the shipped markup', async ({ page }) => {
    await open(page);
    // Scoped to the matchup panel on purpose. The Bankroll Simulator is a
    // separate tool whose actual subject IS American odds, so a page-wide ban
    // on the word would be asserting the wrong thing.
    const panel = (await page.locator('#panel-matchup').innerHTML()).toLowerCase();
    for (const gone of [
      'what are you betting', 'moneyline', 'game total', 'run line', 'puck line',
      'team total', 'odds', 'break-even', 'breakeven', 'parlay', 'wager',
      'report summary', 'your selection',
    ]) {
      expect(panel, `"${gone}" must not appear in the matchup panel`).not.toContain(gone);
    }
  });

  test('the four steps render in order', async ({ page }) => {
    await open(page);
    for (const label of ['Select sport', 'Select matchup', 'Choose situational filters', 'Generate report']) {
      await expect(page.getByRole('heading', { name: label })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Generate Matchup Report' })).toBeVisible();
  });

  test('only the four supported sports are offered', async ({ page }) => {
    await open(page);
    const names = await page.locator('.hx-sport').allTextContents();
    expect(names.map((n) => n.trim())).toEqual(SPORTS);
    const html = await page.content();
    expect(html).not.toContain('College Football');
    expect(html).not.toContain('College Basketball');
  });

  for (const sport of SPORTS) {
    test(`${sport}: teams load, swap works, and the payload is correct`, async ({ page }) => {
      const [away, home] = TEAMS[sport];
      const submissions = await open(page, { report: report(sport, home, away) });

      await page.getByRole('radio', { name: sport }).click();
      await expect(page.locator('#mAway')).toBeEnabled();
      await expect(page.locator('#mAway option')).toHaveCount(TEAMS[sport].length + 1);

      await page.locator('#mAway').selectOption(away);
      await page.locator('#mHome').selectOption(home);
      await expect(page.getByRole('button', { name: 'Generate Matchup Report' })).toBeEnabled();

      // Swap must exchange the two sides, not just relabel them.
      await page.getByRole('button', { name: 'Swap away and home teams' }).click();
      await expect(page.locator('#mAway')).toHaveValue(home);
      await expect(page.locator('#mHome')).toHaveValue(away);

      await page.getByRole('button', { name: 'Generate Matchup Report' }).click();
      await expect.poll(() => submissions.length).toBe(1);
      expect(submissions[0]).toMatchObject({ sport, team_1: home, team_2: away, sample_size: 20 });
      expect(submissions[0].idempotency_key).toBeTruthy();
    });
  }

  test('the same team cannot be both sides', async ({ page }) => {
    await open(page);
    await page.locator('#mAway').selectOption('Chicago Cubs');
    await page.locator('#mHome').selectOption('Chicago Cubs');
    await expect(page.getByText('Away and home must be two different teams.').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate Matchup Report' })).toBeDisabled();
  });

  test('filters reach the payload, are exclusive within a group, and clear', async ({ page }) => {
    const submissions = await open(page);
    await page.locator('#mAway').selectOption('Chicago Cubs');
    await page.locator('#mHome').selectOption('St. Louis Cardinals');

    await page.getByRole('checkbox', { name: 'Home games only' }).check();
    await page.getByRole('checkbox', { name: 'When an underdog' }).check();
    await page.getByRole('checkbox', { name: 'Division opponents' }).check();
    await page.getByRole('checkbox', { name: '2+ days rest' }).check();
    await page.getByRole('checkbox', { name: 'Only games against this opponent' }).check();
    await page.getByRole('checkbox', { name: 'Last 50 qualifying games' }).check();

    // One choice per group: picking a second venue replaces the first.
    await page.getByRole('checkbox', { name: 'Away games only' }).check();
    await expect(page.getByRole('checkbox', { name: 'Home games only' })).not.toBeChecked();

    await page.getByRole('button', { name: 'Generate Matchup Report' }).click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toMatchObject({
      venue: 'away', role: 'underdog', opponent_type: 'division',
      min_rest_days: 2, head_to_head_only: true, sample_size: 50,
    });

    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByRole('checkbox', { name: 'Away games only' })).not.toBeChecked();
  });

  test('"All qualifying games" sends null, not a number', async ({ page }) => {
    const submissions = await open(page);
    await page.locator('#mAway').selectOption('Chicago Cubs');
    await page.locator('#mHome').selectOption('St. Louis Cardinals');
    await page.getByRole('checkbox', { name: 'All qualifying games' }).check();
    await page.getByRole('button', { name: 'Generate Matchup Report' }).click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0].sample_size).toBeNull();
  });

  test('season type is offered only where the data supports it', async ({ page }) => {
    await open(page);
    await page.getByRole('radio', { name: 'NFL' }).click();
    await expect(page.getByRole('checkbox', { name: 'Regular season only' })).toBeVisible();
    await page.getByRole('radio', { name: 'MLB' }).click();
    await expect(page.getByRole('checkbox', { name: 'Regular season only' })).toHaveCount(0);
  });

  test('changing sport resets filters that may not apply to the new sport', async ({ page }) => {
    const submissions = await open(page, { report: report('NHL', 'Boston Bruins', 'Toronto Maple Leafs') });
    await page.getByRole('radio', { name: 'NFL' }).click();
    await page.getByRole('checkbox', { name: 'Postseason only' }).check();
    await page.getByRole('radio', { name: 'NHL' }).click();
    await page.locator('#mAway').selectOption('Boston Bruins');
    await page.locator('#mHome').selectOption('Toronto Maple Leafs');
    await page.getByRole('button', { name: 'Generate Matchup Report' }).click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0].season_type).toBeUndefined();
  });

  test('the report renders both teams, head-to-head and the qualifying games', async ({ page }) => {
    await open(page);
    await page.locator('#mAway').selectOption('Chicago Cubs');
    await page.locator('#mHome').selectOption('St. Louis Cardinals');
    await page.getByRole('button', { name: 'Generate Matchup Report' }).click();

    await expect(page.getByRole('heading', { name: 'Chicago Cubs vs St. Louis Cardinals' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Chicago Cubs', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'St. Louis Cardinals', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Head-to-head' })).toBeVisible();
    await expect(page.getByText('Home games only').first()).toBeVisible();
    // The sport's own scoring noun, and the qualifying-game table beneath it.
    await expect(page.getByText('Avg runs for').first()).toBeVisible();
    await expect(page.getByRole('table').first()).toBeVisible();
    await expect(page.getByText('Home game / Favorite at -1.5').first()).toBeVisible();
  });

  test('an empty sample says so instead of rendering a blank table', async ({ page }) => {
    const empty = report('MLB', 'Chicago Cubs', 'St. Louis Cardinals');
    empty.result.team_1_report.games = [];
    empty.result.team_1_report.total_qualifying_games = 0;
    empty.result.team_1_report.sample_note = 'Only 0 qualifying games match these conditions.';
    await open(page, { report: empty });
    await page.locator('#mAway').selectOption('Chicago Cubs');
    await page.locator('#mHome').selectOption('St. Louis Cardinals');
    await page.getByRole('button', { name: 'Generate Matchup Report' }).click();
    await expect(page.getByText('No qualifying games found for these conditions.')).toBeVisible();
    await expect(page.getByText(/Only 0 qualifying games match/)).toBeVisible();
  });

  test('a failed report shows an error and re-enables the button', async ({ page }) => {
    await open(page, { fail: true });
    await page.locator('#mAway').selectOption('Chicago Cubs');
    await page.locator('#mHome').selectOption('St. Louis Cardinals');
    await page.getByRole('button', { name: 'Generate Matchup Report' }).click();
    await expect(page.locator('#mError')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate Matchup Report' })).toBeEnabled();
  });

  for (const vp of [
    { name: 'desktop-1440', width: 1440, height: 900 },
    { name: 'laptop-1024', width: 1024, height: 768 },
    { name: 'mobile-390', width: 390, height: 844 },
  ]) {
    test(`no horizontal overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await open(page);
      await page.locator('#mAway').selectOption('Chicago Cubs');
      await page.locator('#mHome').selectOption('St. Louis Cardinals');
      await page.getByRole('button', { name: 'Generate Matchup Report' }).click();
      await expect(page.getByRole('heading', { name: /vs/ }).first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
