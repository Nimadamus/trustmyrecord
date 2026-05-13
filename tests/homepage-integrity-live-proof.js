#!/usr/bin/env node
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const URL = 'https://trustmyrecord.com/';
const OUT = path.join(process.cwd(), 'artifacts', 'homepage-integrity-live-browser-proof.png');
const META = path.join(process.cwd(), 'artifacts', 'homepage-integrity-live-proof.json');
const banned = ['SharpLedger','StatsProfits','ParlayPapi','GreenDot','NumbersNeverLie','Featured In','Yahoo Sports','Covers','SBR','Action Network','OKC -6.5','NYY ML','DAL +3.5','NYK -4','No mock picks shown','fake endorsements','No tracked picks yet'];
async function main(){
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({ headless: false, args: ['--window-size=1440,1100', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2500);
    const bodyText = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');
    const source = await page.content();
    const found = banned.filter((term) => bodyText.includes(term) || source.includes(term));
    if (found.length) throw new Error('Banned homepage text found: ' + found.join(', '));
    if (!source.includes('realHomepageUsers')) throw new Error('Homepage allowlist script not present');
    const outForShell = OUT.split(path.sep).join('/');
    execFileSync('bash', ['-lc', 'import -window root "' + outForShell + '"'], { stdio: 'inherit' });
    fs.writeFileSync(META, JSON.stringify({ url: page.url(), title: await page.title(), generated_at: new Date().toISOString(), screenshot: OUT, body_excerpt: bodyText.slice(0, 800) }, null, 2));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
