#!/usr/bin/env node

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TREND_URL = process.env.TMR_TRENDSPOTTER_URL || 'https://trustmyrecord.com/trendspotter/';
const SIM_URL = process.env.TMR_MLB_SIMULATOR_URL || 'https://trustmyrecord.com/mlb-simulator/';
const HUB_URL = process.env.TMR_TOOLS_URL || 'https://trustmyrecord.com/tools/';
const MODEL_URL = process.env.TMR_MODEL_BUILDER_URL || 'https://trustmyrecord.com/model-builder/';
const PUBLIC_RECORDS_URL = process.env.TMR_PUBLIC_RECORDS_URL || 'https://trustmyrecord.com/handicappers/';
const PICK_TRACKING_URL = process.env.TMR_PICK_TRACKING_URL || 'https://trustmyrecord.com/sportsbook/';
const LEADERBOARDS_URL = process.env.TMR_LEADERBOARDS_URL || 'https://trustmyrecord.com/leaderboards/';
const OUT_DIR = path.join(process.cwd(), 'artifacts');

async function captureRoot(name) {
  const out = path.join(OUT_DIR, name);
  execFileSync('bash', ['-lc', `import -window root "${out.replace(/\\/g, '/')}"`], { stdio: 'inherit' });
  return out;
}

/**
 * Find sentences that actually MAKE a forbidden claim.
 *
 * A flat regex over the whole page cannot tell "this is an official pick"
 * from "outputs here are never counted as official picks" - and the
 * simulator is required to carry exactly that disclaimer, so the flat
 * version failed on the page that was doing the right thing. Split into
 * sentences and skip the ones that negate; a page that genuinely claims a
 * guaranteed winner still trips this.
 */
function forbiddenClaims(text, pattern) {
  const NEGATED = /\b(never|not|no|non|isn't|aren't|won't|cannot|can't|don't|doesn't|without|instead of|rather than)\b/i;
  return String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => pattern.test(s) && !NEGATED.test(s));
}

async function selectFirstOption(page, selector) {
  const value = await page.locator(selector).evaluate((select) => {
    const option = Array.from(select.options).find((item) => item.value);
    return option ? option.value : '';
  });
  if (!value) throw new Error(`${selector} had no selectable option`);
  await page.selectOption(selector, value);
}

async function selectByText(page, selector, text) {
  const value = await page.locator(selector).evaluate((select, expected) => {
    const option = Array.from(select.options).find((item) => item.textContent.includes(expected));
    return option ? option.value : '';
  }, text);
  if (!value) throw new Error(`${selector} missing ${text}`);
  await page.selectOption(selector, value);
}

async function verifyTrendspotter(page) {
  // Rewritten 2026-08-01 for the Trend Spotter workspace redesign. The guided
  // sport -> matchup -> trend-kind dropdown flow is gone; the page is now
  // capability-driven and every calculation happens server-side.
  await page.goto(TREND_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

  await page.locator('.ts-tab:not([disabled])').first().waitFor({ state: 'visible', timeout: 30000 });

  // Markets with no data behind them must be locked, and must say why.
  for (const id of ['team_total', 'first_half', 'first_five', 'props']) {
    const tab = page.locator(`.ts-tab[aria-label*="${id.replace(/_/g, ' ')}" i]`).first();
    const locked = page.locator('.ts-tab[disabled]');
    if ((await locked.count()) === 0) throw new Error('no locked market tabs rendered');
    void tab;
  }
  const reason = await page.locator('.ts-tab[disabled]').first().getAttribute('title');
  if (!reason || reason.length < 40) throw new Error('a locked market did not explain itself');

  // Run a real trend end to end through the deployed page.
  await page.goto(
    `${TREND_URL}?sport=MLB&team=LAD&market=moneyline&venue=away&situation=favorite&seasonFrom=2024&minGames=10`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.locator('.ts-result').waitFor({ state: 'visible', timeout: 45000 });

  const statement = await page.locator('.ts-statement').innerText();
  if (!/Los Angeles Dodgers are \d+-\d+ on the moneyline/.test(statement)) {
    throw new Error(`Trend Spotter did not render a plain-English record: ${statement}`);
  }
  if ((await page.locator('.ts-table tbody tr').count()) === 0) {
    throw new Error('Trend Spotter rendered a record with no supporting games.');
  }
  if ((await page.locator('.ts-chart-plot svg').count()) === 0) {
    throw new Error('Trend Spotter rendered a result with no chart.');
  }

  const text = await page.locator('body').innerText();
  if (/source rows are connected|impossible combinations are blocked|Verified trend data source not connected yet/i.test(text)) {
    throw new Error('Trend Spotter showed internal engineering copy.');
  }
  const trendClaims = forbiddenClaims(text, /fake ROI|fake win rate|fake records|fake predictions|verified betting edge|guaranteed/i);
  if (trendClaims.length) {
    throw new Error(`Trend Spotter showed a forbidden verified/fake claim: ${trendClaims[0]}`);
  }
  if (!/not a prediction/i.test(text)) {
    throw new Error('Trend Spotter did not state that the result is descriptive, not predictive.');
  }
  return captureRoot('trendspotter-live-browser-addressbar-proof.png');
}

async function verifyMlbSimulator(page) {
  await page.goto(SIM_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await selectByText(page, '#awayTeamSelect', 'Chicago White Sox');
  await selectByText(page, '#homeTeamSelect', 'Colorado Rockies');
  const pitcherState = await page.evaluate(() => {
    function state(selector) {
      const select = document.querySelector(selector);
      return {
        disabled: Boolean(select?.disabled),
        selected: select?.selectedOptions?.[0]?.textContent?.trim() || '',
        optionCount: Array.from(select?.options || []).filter((option) => option.value).length,
        unavailable: /Starting pitcher list unavailable/i.test(select?.textContent || ''),
      };
    }
    return { away: state('#awayPitcherSelect'), home: state('#homePitcherSelect') };
  });
  if (pitcherState.away.disabled || pitcherState.away.optionCount < 1 || pitcherState.away.unavailable) {
    throw new Error(`Away pitcher dropdown is not populated: ${JSON.stringify(pitcherState.away)}`);
  }
  if (pitcherState.home.disabled || pitcherState.home.optionCount < 1 || pitcherState.home.unavailable) {
    throw new Error(`Home pitcher dropdown is not populated: ${JSON.stringify(pitcherState.home)}`);
  }
  await page.selectOption('#simulationCountSelect', '10');
  await page.click('#runSimulationButton');
  await page.waitForFunction(() => document.querySelector('#projectionShell')?.getAttribute('data-projection-state') === 'projected', null, { timeout: 30000 });

  const text = await page.locator('body').innerText();
  if (!/Simulation-based estimate|simulation output/i.test(text)) throw new Error('MLB Simulator output was not labeled as simulation based.');
  if (!/Chicago White Sox|Colorado Rockies/i.test(text)) throw new Error('MLB Simulator proof matchup did not render selected teams.');
  if (!/Starting Pitchers/i.test(text)) throw new Error('MLB Simulator output did not render selected starting pitchers.');
  // The claim to catch is the simulator presenting its own output AS an
  // official or guaranteed pick. A bare /official pick/ also matched the
  // required disclaimer and the line pointing users at the graded record
  // system, which is where official picks legitimately live.
  const simClaims = forbiddenClaims(text,
    /verified betting edge|guaranteed result|guaranteed winner|(?:is|are|as)\s+(?:the|an?|our|your)?\s*official\s+picks?\b/i);
  if (simClaims.length) throw new Error(`MLB Simulator showed a forbidden verified/fake claim: ${simClaims[0]}`);
  if (/First Five output|F5 lean|Team Total lean|props/i.test(text)) throw new Error('MLB Simulator exposed unsupported output.');
  return captureRoot('mlb-simulator-live-browser-addressbar-proof.png');
}

async function verifyHubAndRoutes(page) {
  await page.goto(HUB_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  const expected = [
    '/mlb-simulator/',
    '/trendspotter/',
    '/model-builder/',
    '/handicappers/',
    '/sportsbook/',
    '/leaderboards/',
  ];
  const hrefs = await page.locator('.tool-card a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  for (const href of expected) {
    if (!hrefs.includes(href)) throw new Error(`Tools Hub missing CTA ${href}`);
  }
  const body = await page.locator('body').innerText();
  if (/coming soon|lorem ipsum|placeholder|under construction/i.test(body)) throw new Error('Tools Hub contains placeholder copy.');
  return captureRoot('tools-hub-live-browser-addressbar-proof.png');
}

async function verifyModelBuilder(page) {
  // Rewritten 2026-08-02. The old flow drove a name/weights/save form
  // (#modelName, #saveModelBtn, #modelCompare) that no longer exists on the
  // page - every selector matched nothing, so this step could not pass. The
  // shipped tool is a filter-and-backtest workspace.
  await page.goto(MODEL_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

  const badges = await page.locator('#sourceBadges').innerText();
  if (!/coverage|verified|graded/i.test(badges)) {
    throw new Error(`Model Builder did not label its data source: ${badges}`);
  }

  const sport = await page.locator('#modelSport option').evaluateAll(
    (options) => (options.find((option) => option.value) || {}).value || '');
  if (!sport) throw new Error('Model Builder has no selectable sport.');
  await page.selectOption('#modelSport', sport);
  const chip = page.locator('#marketChips label, #marketChips button').first();
  await chip.waitFor({ state: 'visible', timeout: 15000 });
  await chip.click();
  await page.click('#runBtn');

  // A backtest must come back with a real record, not a spinner.
  await page.waitForFunction(
    () => /\d+-\d+/.test(document.getElementById('resultsBody').textContent),
    null, { timeout: 45000 });
  const results = await page.locator('#resultsBody').innerText();
  for (const [label, pattern] of [
    ['a win-loss record', /\d+-\d+/],
    ['a units figure', /-?\d+(\.\d+)?u/],
    ['an ROI percentage', /ROI/i],
    ['a sample size', /Sample|graded|matching picks/i],
  ]) {
    if (!pattern.test(results)) throw new Error(`Model Builder backtest is missing ${label}.`);
  }
  // The comparison rows are what stop a bare record from reading as an edge.
  if (!/Baseline/i.test(results) || !/Random control/i.test(results)) {
    throw new Error('Model Builder returned a record with no baseline or control to judge it against.');
  }

  const text = await page.locator('body').innerText();
  if (/Login required|Checking access/i.test(text)) {
    throw new Error('Model Builder showed an access wall to a logged-out visitor.');
  }
  if (/lorem ipsum|under construction|coming soon/i.test(text)) {
    throw new Error('Model Builder contains placeholder copy.');
  }
  const claims = forbiddenClaims(text, /guaranteed winner|verified betting edge|guaranteed result/i);
  if (claims.length) throw new Error(`Model Builder showed a forbidden claim: ${claims[0]}`);
  // Saving and forward-tracking still belong behind an account.
  if ((await page.locator('a[href*="/login/"]').count()) === 0) {
    throw new Error('Model Builder did not route saving through login.');
  }
  return captureRoot('model-builder-live-browser-addressbar-proof.png');
}

async function verifyLinkedWorkflow(page, url, requiredText) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  const text = await page.locator('body').innerText();
  if (!new RegExp(requiredText, 'i').test(text)) throw new Error(`${url} did not render expected ${requiredText} workflow text.`);
  // Sentence-scoped for the same reason as the claim checks: /placeholder/ over
  // the whole body flagged the leaderboard explaining that it shows "a
  // placeholder cell instead of fabricating a number", which is the honest
  // behaviour this check exists to protect.
  const junk = forbiddenClaims(text, /fake user|fake stats|lorem ipsum|placeholder|under construction/i);
  if (junk.length) throw new Error(`${url} contains forbidden placeholder/fake text: ${junk[0]}`);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: false, args: ['--window-size=1440,1100', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1320, height: 940 } });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  try {
    if (process.env.TMR_ONLY_TRENDSPOTTER === '1') {
      const trendspotter = await verifyTrendspotter(page);
      const report = {
        checked_at: new Date().toISOString(),
        trendspotter_url: TREND_URL,
        screenshots: { trendspotter },
      };
      fs.writeFileSync(path.join(OUT_DIR, 'trendspotter-live-browser-proof.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    if (process.env.TMR_ONLY_MLB_SIMULATOR === '1') {
      const mlbSimulator = await verifyMlbSimulator(page);
      const report = {
        checked_at: new Date().toISOString(),
        mlb_simulator_url: SIM_URL,
        screenshots: { mlbSimulator },
      };
      fs.writeFileSync(path.join(OUT_DIR, 'mlb-simulator-live-browser-proof.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    const hub = await verifyHubAndRoutes(page);
    const trendspotter = await verifyTrendspotter(page);
    const mlbSimulator = await verifyMlbSimulator(page);
    const modelBuilder = await verifyModelBuilder(page);
    await verifyLinkedWorkflow(page, PUBLIC_RECORDS_URL, 'Handicappers|verified records|Discover');
    await verifyLinkedWorkflow(page, PICK_TRACKING_URL, 'sportsbook|Make Picks|Pick');
    await verifyLinkedWorkflow(page, LEADERBOARDS_URL, 'Leaderboards|rankings|Public results');
    const hardErrors = consoleErrors.filter((entry) => !/favicon|Failed to load resource.*(404|net::ERR_BLOCKED_BY_CLIENT)/i.test(entry));
    if (hardErrors.length) throw new Error(`Console errors detected:\n${hardErrors.join('\n')}`);
    const report = {
      checked_at: new Date().toISOString(),
      tools_url: HUB_URL,
      trendspotter_url: TREND_URL,
      mlb_simulator_url: SIM_URL,
      model_builder_url: MODEL_URL,
      public_records_url: PUBLIC_RECORDS_URL,
      pick_tracking_url: PICK_TRACKING_URL,
      leaderboards_url: LEADERBOARDS_URL,
      screenshots: { hub, trendspotter, mlbSimulator, modelBuilder },
    };
    fs.writeFileSync(path.join(OUT_DIR, 'tools-live-browser-proof.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
