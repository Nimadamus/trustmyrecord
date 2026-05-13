#!/usr/bin/env node
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const URL = 'https://trustmyrecord.com/';
const OUT = path.join(process.cwd(), 'artifacts', 'homepage-polish-live-browser-proof.png');
const MOBILE = path.join(process.cwd(), 'artifacts', 'homepage-polish-mobile-page-proof.png');
const META = path.join(process.cwd(), 'artifacts', 'homepage-polish-live-proof.json');
async function main(){
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({ headless: false, args: ['--window-size=1440,1100', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2500);
    const source = await page.content();
    const bodyText = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');
    const required = ['Homepage visual polish: tightened header, balanced hero grid, aligned dashboard.', 'BetLegend', 'Recent Locked Picks'];
    const missing = required.filter((term) => !source.includes(term) && !bodyText.includes(term));
    if (missing.length) throw new Error('Missing expected homepage polish/content: ' + missing.join(', '));
    const banned = ['SharpLedger','StatsProfits','ParlayPapi','GreenDot','NumbersNeverLie','Featured In','No mock picks shown','fake endorsements','No tracked picks yet'];
    const found = banned.filter((term) => source.includes(term) || bodyText.includes(term));
    if (found.length) throw new Error('Banned homepage content found: ' + found.join(', '));
    execFileSync('bash', ['-lc', 'import -window root "' + OUT.split(path.sep).join('/') + '"'], { stdio: 'inherit' });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    await mobile.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await mobile.waitForLoadState('domcontentloaded');
    await mobile.waitForTimeout(1000);
    await mobile.screenshot({ path: MOBILE, fullPage: false });
    const mobileText = await mobile.locator('body').innerText({ timeout: 10000 }).catch(() => '');
    if (!mobileText.includes('Track Every')) throw new Error('Mobile homepage hero did not render');
    await mobile.close();

    fs.writeFileSync(META, JSON.stringify({ url: page.url(), title: await page.title(), generated_at: new Date().toISOString(), screenshot: OUT, mobile_screenshot: MOBILE, body_excerpt: bodyText.slice(0, 900) }, null, 2));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
