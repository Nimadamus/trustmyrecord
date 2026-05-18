#!/usr/bin/env node

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LIVE_URL = process.env.TMR_FORUM_THREAD_URL || 'https://trustmyrecord.com/forum/#thread-8';
const OUT_DIR = path.join(process.cwd(), 'artifacts', 'forum-live-proof');

function captureRoot(name) {
  const out = path.join(OUT_DIR, name);
  execFileSync('bash', ['-lc', `import -window root "${out.replace(/\\/g, '/')}"`], { stdio: 'inherit' });
  return out;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: false, args: ['--window-size=1440,1100', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1320, height: 940 } });
  try {
    await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => document.body.innerText.includes('I just wanted to welcome all of you'), null, { timeout: 45000 });

    const text = await page.locator('body').innerText();
    const required = [
      'Welcome all!',
      'BetLegend',
      'Joined:',
      'Posts:',
      'Threads:',
      'Favorite Team:',
      '#1',
      'Quick Reply',
      'Messages',
      'Alerts',
      'BetLegend',
      'Logout',
    ];
    const missing = required.filter((item) => !text.includes(item));
    if (missing.length) throw new Error(`Forum live proof missing: ${missing.join(', ')}`);
    if (text.includes('Thread has no posts.')) throw new Error('Forum live proof still shows empty thread state.');

    await page.screenshot({ path: path.join(OUT_DIR, 'forum-thread-live-page.png'), fullPage: false });
    const addressbar = captureRoot('forum-thread-live-addressbar-proof.png');
    const report = {
      checked_at: new Date().toISOString(),
      url: page.url(),
      screenshot: addressbar,
      checks: {
        starter_post: true,
        author_panel: true,
        quick_reply: true,
        no_empty_thread_state: true,
      },
    };
    fs.writeFileSync(path.join(OUT_DIR, 'forum-live-browser-proof.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
