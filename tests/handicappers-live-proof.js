#!/usr/bin/env node
const { chromium } = require('playwright');
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const LIVE_URL = process.env.TMR_HANDICAPPERS_URL || 'https://trustmyrecord.com/handicappers/';
const BROWSER_URL = LIVE_URL.includes('#') ? LIVE_URL : LIVE_URL + '#member-rankings';
const OUT_DIR = path.join(process.cwd(), 'artifacts');
const DESKTOP_OUT = path.join(OUT_DIR, 'handicappers-live-browser-addressbar-proof.png');
const MOBILE_OUT = path.join(OUT_DIR, 'handicappers-live-mobile-proof.png');
const REPORT_OUT = path.join(OUT_DIR, 'handicappers-live-proof.json');
// Directory table columns (rank + 8 sortable columns + profile action).
const EXPECTED_HEADERS = ['#', 'Handicapper', 'Record', 'Units', 'ROI', 'Win %', 'Picks', 'Streak', 'Activity', 'Profile'];
// data-label attributes on every prerendered member-row stat cell.
const EXPECTED_ROW_LABELS = ['Record', 'Units', 'ROI', 'Win %', 'Total picks', 'Current streak', 'Last active'];

function fetchLive() {
  return new Promise((resolve, reject) => {
    https.get(LIVE_URL, { rejectUnauthorized: false, headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

function extractHeaders(html) {
  const block = html.match(/<div class="hm-row hm-head"[^>]*>([\s\S]*?)<\/div>\s*<div id="hmRows"/);
  if (!block) return [];
  const labels = [];
  const rank = block[1].match(/<div class="hm-head-rank">([^<]*)<\/div>/);
  if (rank) labels.push(rank[1].trim());
  for (const m of block[1].matchAll(/data-sort="[^"]*"[^>]*aria-sort="[^"]*"><span>([^<]*)<\/span>/g)) {
    labels.push(m[1].trim());
  }
  const actions = block[1].match(/<div class="hm-head-actions">([^<]*)<\/div>/);
  if (actions) labels.push(actions[1].trim());
  return labels;
}

function firstRowLabels(html) {
  const start = html.indexOf('<div class="hm-row hm-member-row"');
  if (start === -1) return [];
  const next = html.indexOf('<div class="hm-row hm-member-row"', start + 1);
  const row = html.slice(start, next === -1 ? undefined : next);
  const labels = [];
  for (const match of row.matchAll(/data-label="([^"]+)"/g)) {
    labels.push(match[1]);
    if (labels.length >= EXPECTED_ROW_LABELS.length) break;
  }
  return labels;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const fetched = await fetchLive();
  const headers = extractHeaders(fetched.body);
  const labels = firstRowLabels(fetched.body);
  if (fetched.status !== 200) throw new Error('Live page returned ' + fetched.status);
  if (headers.join('|') !== EXPECTED_HEADERS.join('|')) throw new Error('Unexpected live headers: ' + headers.join('|'));
  if (labels.join('|') !== EXPECTED_ROW_LABELS.join('|')) throw new Error('Unexpected first row labels: ' + labels.join('|'));
  if (!fetched.body.includes('id="hmTotalMembers"')) throw new Error('Total Members stat missing from live page');
  if (!fetched.body.includes('id="hmTabs"')) throw new Error('Directory tabs missing from live page');

  const browserPath = chromium.executablePath();
  const profile = path.join(process.cwd(), '.tmp-handicappers-proof-profile');
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  const args = [
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-features=SignInProfileCreation,ChromeWhatsNewUI,SigninInterception,AccountConsistency',
    '--ignore-certificate-errors',
    '--window-size=1440,1100',
    `--user-data-dir=${profile}`,
    LIVE_URL,
  ];
  const proc = spawn(browserPath, args, { stdio: 'ignore', detached: true });
  await sleep(12000);
  execFileSync('import', ['-window', 'root', DESKTOP_OUT], { stdio: 'inherit' });
  try { process.kill(-proc.pid); } catch (_) {}

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  await page.setContent(fetched.body, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: MOBILE_OUT, fullPage: true });
  await browser.close();

  const report = {
    checked_at: new Date().toISOString(),
    url: LIVE_URL,
    browser_url: BROWSER_URL,
    http_status: fetched.status,
    last_modified: fetched.headers['last-modified'] || '',
    headers,
    first_row_labels: labels,
    screenshots: {
      desktop_addressbar: DESKTOP_OUT,
      mobile_page: MOBILE_OUT,
    },
  };
  fs.writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
