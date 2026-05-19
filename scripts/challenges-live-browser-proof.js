#!/usr/bin/env node

const { chromium } = require('playwright');
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const LIVE_URL = process.env.TMR_CHALLENGES_URL || 'https://trustmyrecord.com/challenges/';
const OUT_DIR = path.join(process.cwd(), 'artifacts', 'challenges-live-proof');

function captureRoot(name) {
  const out = path.join(OUT_DIR, name);
  execFileSync('bash', ['-lc', `import -window root "${out.replace(/\\/g, '/')}"`], { stdio: 'inherit' });
  return out;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const executablePath = chromium.executablePath();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1320, height: 940 } });
  let validatedUrl = LIVE_URL;
  try {
    await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => document.body.innerText.includes('Open Challenges'), null, { timeout: 45000 });
    const text = await page.locator('body').innerText();
    const required = [
      'Open Challenges',
      'Create Open Challenge',
      'Bragging Rights Only. No cash prize. No paid entry.',
      'Money challenges and token contests are not active yet.',
    ];
    const missing = required.filter((item) => !text.includes(item));
    if (missing.length) throw new Error(`Challenges live proof missing: ${missing.join(', ')}`);
    if (text.includes('Continue to Arena') || text.includes('Redirecting to Arena')) {
      throw new Error('Challenges page still shows old Arena redirect content.');
    }
    validatedUrl = page.url();

    await browser.close();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmr-challenges-chrome-'));
    const chrome = spawn(executablePath, [
      '--no-sandbox',
      '--no-first-run',
      '--disable-default-apps',
      '--disable-dev-shm-usage',
      '--window-size=1440,1100',
      `--user-data-dir=${userDataDir}`,
      LIVE_URL,
    ], { stdio: 'ignore' });

    await wait(7000);
    const addressbar = captureRoot('challenges-live-addressbar-proof.png');
    chrome.kill('SIGTERM');
    const report = {
      checked_at: new Date().toISOString(),
      url: validatedUrl,
      screenshot: addressbar,
      checks: {
        open_challenges_page: true,
        create_form: true,
        non_cash_disclaimer: true,
        disabled_money_placeholder: true,
        old_redirect_removed: true,
      },
    };
    fs.writeFileSync(path.join(OUT_DIR, 'challenges-live-browser-proof.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (browser.isConnected()) await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
