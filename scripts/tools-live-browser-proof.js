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
  await page.goto(TREND_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.selectOption('#sportSelect', 'MLB');
  await page.waitForFunction(() => Array.from(document.querySelector('#matchupSelect')?.options || []).some((option) => option.value), null, { timeout: 30000 });
  await selectFirstOption(page, '#matchupSelect');

  for (const selector of ['[data-market="first_half"]', '[data-market="first_five"]', '[data-market="props"]']) {
    if (!(await page.locator(selector).isDisabled())) throw new Error(`${selector} is not disabled`);
  }
  if (!(await page.locator('[data-market="team_total"]').isDisabled())) {
    await page.locator('[data-market="team_total"]').click();
    if ((await page.locator('#periodSelect').inputValue()) !== 'full_game') throw new Error('Team totals exposed unsupported period options.');
    const teamTotalOptions = await page.locator('#trendKindSelect').innerText();
    if (!/Team total over \/ under/i.test(teamTotalOptions)) throw new Error('Team totals did not expose the verified team-total trend option.');
  }

  await page.locator('[data-market="total"]').click();
  await page.selectOption('#trendKindSelect', 'full_game_over_under');
  await page.selectOption('#sideSelect', 'over');
  await page.fill('#thresholdInput', '8.5');
  await page.click('#generateTrend');
  await page.locator('#resultsList').waitFor({ state: 'visible', timeout: 15000 });
  const text = await page.locator('body').innerText();
  const summary = await page.locator('#selectionSummary').innerText();
  if (!/Search: Full game over \/ under/i.test(summary)) {
    throw new Error('Trendspotter Current Query did not reflect the selected trend search.');
  }
  if (/Verified trend data source not connected yet|source not connected yet/i.test(text)) {
    throw new Error('Trendspotter showed raw backend placeholder copy.');
  }
  if (/fake ROI|fake win rate|fake records|fake predictions|verified betting edge/i.test(text)) {
    throw new Error('Trendspotter showed a forbidden verified/fake claim.');
  }
  return captureRoot('trendspotter-live-browser-addressbar-proof.png');
}

async function verifyMlbSimulator(page) {
  await page.goto(SIM_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await selectByText(page, '#awayTeamSelect', 'Texas Rangers');
  await selectByText(page, '#homeTeamSelect', 'New York Yankees');
  await page.selectOption('#simulationCountSelect', '10');
  await page.click('#runSimulationButton');
  await page.waitForFunction(() => document.querySelector('#projectionShell')?.getAttribute('data-projection-state') === 'projected', null, { timeout: 30000 });

  const text = await page.locator('body').innerText();
  if (!/Simulation-based estimate|simulation output/i.test(text)) throw new Error('MLB Simulator output was not labeled as simulation based.');
  if (/verified betting edge|official pick|guaranteed result|guaranteed winner/i.test(text)) throw new Error('MLB Simulator showed a forbidden verified/fake claim.');
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
  await page.goto(MODEL_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.fill('#modelName', `MLB totals audit ${Date.now()}`);
  await page.selectOption('#modelSport', 'baseball_mlb');
  await page.selectOption('#modelMarket', 'totals');
  await page.selectOption('#modelSide', 'under');
  await page.fill('#factor_recent_form', '25');
  await page.fill('#factor_market_line', '35');
  await page.fill('#modelNotes', 'Audit draft: requires real source rows before scoring.');
  await page.click('#saveModelBtn');
  await page.locator('#modelBuilderList .model-card h3').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-action="compare"]').first().check();
  const compareText = await page.locator('#modelCompare').innerText();
  if (!/MLB|Total|Weights|Units/i.test(compareText)) throw new Error('Model Builder compare output did not render useful assumptions.');
  const text = await page.locator('body').innerText();
  if (/Login required|coming soon|placeholder|under construction|guaranteed winner|verified betting edge/i.test(text)) {
    throw new Error('Model Builder exposed a blocked shell, placeholder, or forbidden claim.');
  }
  return captureRoot('model-builder-live-browser-addressbar-proof.png');
}

async function verifyLinkedWorkflow(page, url, requiredText) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  const text = await page.locator('body').innerText();
  if (!new RegExp(requiredText, 'i').test(text)) throw new Error(`${url} did not render expected ${requiredText} workflow text.`);
  if (/fake user|fake stats|lorem ipsum|placeholder|under construction/i.test(text)) throw new Error(`${url} contains forbidden placeholder/fake text.`);
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
