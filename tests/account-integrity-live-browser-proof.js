#!/usr/bin/env node

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LIVE_URL = process.env.TMR_PROFILE_URL || 'https://trustmyrecord.com/profile/?user=MoneylineMike';
const OUT = path.join(process.cwd(), 'artifacts', 'account-integrity-deleted-profile-live-browser-proof.png');
const META = path.join(process.cwd(), 'artifacts', 'account-integrity-live-proof.json');

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({ headless: false, args: ['--window-size=1440,1100', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
  try {
    await page.goto(LIVE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2500);
    const bodyText = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');
    if (!/not found|user not found|profile/i.test(bodyText)) {
      throw new Error('Deleted profile proof did not render an expected profile/not-found state. Body started: ' + bodyText.slice(0, 300));
    }
    const outForShell = OUT.split(path.sep).join('/');
    execFileSync('bash', ['-lc', 'import -window root "' + outForShell + '"'], { stdio: 'inherit' });
    fs.writeFileSync(META, JSON.stringify({ url: page.url(), title: await page.title(), generated_at: new Date().toISOString(), screenshot: OUT, body_excerpt: bodyText.slice(0, 500) }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
