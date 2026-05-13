#!/usr/bin/env node

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TREND_URL = process.env.TMR_TRENDSPOTTER_URL || 'https://trustmyrecord.com/trendspotter/';
const SIM_URL = process.env.TMR_MLB_SIMULATOR_URL || 'https://trustmyrecord.com/mlb-simulator/';
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

  for (const selector of ['[data-market="team_total"]', '[data-market="first_half"]', '[data-market="first_five"]', '[data-market="props"]']) {
    if (!(await page.locator(selector).isDisabled())) throw new Error(`${selector} is not disabled`);
  }

  await page.locator('[data-market="total"]').click();
  await page.selectOption('#trendKindSelect', 'full_game_over_under');
  await page.selectOption('#sideSelect', 'over');
  await page.fill('#thresholdInput', '8.5');
  await page.click('#generateTrend');
  await page.locator('#resultsList').waitFor({ state: 'visible', timeout: 15000 });
  const text = await page.locator('body').innerText();
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
  if (/verified betting edge|official pick|official prediction|guaranteed/i.test(text)) throw new Error('MLB Simulator showed a forbidden verified/fake claim.');
  if (/First Five output|F5 lean|Team Total lean|props/i.test(text)) throw new Error('MLB Simulator exposed unsupported output.');
  return captureRoot('mlb-simulator-live-browser-addressbar-proof.png');
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: false, args: ['--window-size=1440,1100', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1320, height: 940 } });
  try {
    const trendspotter = await verifyTrendspotter(page);
    const mlbSimulator = await verifyMlbSimulator(page);
    const report = {
      checked_at: new Date().toISOString(),
      trendspotter_url: TREND_URL,
      mlb_simulator_url: SIM_URL,
      screenshots: { trendspotter, mlbSimulator },
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
