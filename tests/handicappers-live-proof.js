#!/usr/bin/env node
const { chromium } = require('playwright');
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const LIVE_URL = process.env.TMR_HANDICAPPERS_URL || 'https://trustmyrecord.com/handicappers/';
const OUT_DIR = path.join(process.cwd(), 'artifacts');
const DESKTOP_OUT = path.join(OUT_DIR, 'handicappers-live-browser-addressbar-proof.png');
const MOBILE_OUT = path.join(OUT_DIR, 'handicappers-live-mobile-proof.png');
const REPORT_OUT = path.join(OUT_DIR, 'handicappers-live-proof.json');
const EXPECTED_HEADERS = ['Rank', 'Handicapper', 'Record', 'Win %', 'Net Units', 'ROI', 'Verified Picks', 'Last Active', 'Sports'];

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
  const match = html.match(/<div class="hm-row hm-head" role="row">([\s\S]*?)<\/div>\s*<div id="hmRows">/);
  if (!match) return [];
  return Array.from(match[1].matchAll(/<div>(.*?)<\/div>/g)).map((m) => m[1].trim());
}

function firstRowLabels(html) {
  const row = html.match(/<div class="hm-row hm-member-row"[\s\S]*?(?=<div class="hm-row hm-member-row"|\s*<\/div>\s*<\/div>)/);
  if (!row) return [];
  return Array.from(row[0].matchAll(/data-label="([^"]+)"/g)).map((m) => m[1]);
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const fetched = await fetchLive();
  const headers = extractHeaders(fetched.body);
  const labels = firstRowLabels(fetched.body);
  if (fetched.status !== 200) throw new Error('Live page returned ' + fetched.status);
  if (headers.join('|') !== EXPECTED_HEADERS.join('|')) throw new Error('Unexpected live headers: ' + headers.join('|'));
  if (labels.slice(0, EXPECTED_HEADERS.length).join('|') !== EXPECTED_HEADERS.join('|')) throw new Error('Unexpected first row labels: ' + labels.join('|'));

  const browserPath = chromium.executablePath();
  const profile = path.join(process.cwd(), '.tmp-handicappers-proof-profile');
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  const args = [
    '--no-sandbox',
    '--disable-gpu',
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
    http_status: fetched.status,
    last_modified: fetched.headers['last-modified'] || '',
    headers,
    first_row_labels: labels.slice(0, EXPECTED_HEADERS.length),
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
