#!/usr/bin/env node

const { chromium, firefox } = require('playwright');
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const LIVE_URL = process.env.TMR_CHALLENGES_URL || 'https://trustmyrecord.com/challenges/';
const PROOF_URL = LIVE_URL.includes('#') ? LIVE_URL : `${LIVE_URL}#open-challenges`;
const OUT_DIR = path.join(process.cwd(), 'artifacts', 'challenges-live-proof');

function captureRoot(name) {
  const out = path.join(OUT_DIR, name);
  execFileSync('bash', ['-lc', `import -window root "${out.replace(/\\/g, '/')}"`], { stdio: 'inherit' });
  return out;
}

function captureWindow(windowId, name) {
  const out = path.join(OUT_DIR, name);
  execFileSync('bash', ['-lc', `import -window "${windowId}" "${out.replace(/\\/g, '/')}"`], { stdio: 'inherit' });
  return out;
}

function bashOutput(command) {
  return execFileSync('bash', ['-lc', command], { encoding: 'utf8' }).trim();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function proofBrowserCandidates() {
  const chromeCandidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    chromium.executablePath(),
  ].filter((candidate) => fs.existsSync(candidate));
  return [
    ...chromeCandidates.map((candidate) => ({ type: 'chrome', path: candidate })),
    { type: 'firefox', path: firefox.executablePath() },
  ];
}

function browserArgs(candidate, userDataDir) {
  if (candidate.type === 'chrome') {
    return [
      '--no-sandbox',
      '--no-first-run',
      '--disable-default-apps',
      '--disable-dev-shm-usage',
      '--window-size=1440,1100',
      `--user-data-dir=${userDataDir}`,
      PROOF_URL,
    ];
  }
  return [
    '--width', '1440',
    '--height', '1100',
    '--profile', userDataDir,
    '--new-window',
    PROOF_URL,
  ];
}

async function launchProofWindow() {
  for (const candidate of proofBrowserCandidates()) {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `tmr-challenges-${candidate.type}-`));
    const child = spawn(candidate.path, browserArgs(candidate, userDataDir), { stdio: 'ignore' });
    await wait(7000);
    const windowId = bashOutput(`(
      xdotool search --onlyvisible --name "Open Challenges" 2>/dev/null ||
      xdotool search --onlyvisible --name "TrustMyRecord" 2>/dev/null ||
      xdotool search --onlyvisible --class "google-chrome" 2>/dev/null ||
      xdotool search --onlyvisible --class "chromium" 2>/dev/null ||
      xdotool search --onlyvisible --class "firefox" 2>/dev/null
    ) | tail -n 1 || true`);
    if (windowId) {
      return { child, windowId };
    }
    child.kill('SIGTERM');
  }
  throw new Error('Could not find a visible browser window for address-bar proof.');
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
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
      'Test Bragging Rights Challenge',
      'Bragging Rights Only. No cash prize. No paid entry.',
      'Money challenges and token contests are not active yet.',
    ];
    const missing = required.filter((item) => !text.includes(item));
    if (missing.length) throw new Error(`Challenges live proof missing: ${missing.join(', ')}`);
    if (text.includes('Continue to Arena') || text.includes('Redirecting to Arena')) {
      throw new Error('Challenges page still shows old Arena redirect content.');
    }
    await page.click('[data-view]');
    await page.waitForSelector('#detail-modal.open', { timeout: 15000 });
    const modalText = await page.locator('#detail-modal').innerText();
    const modalRequired = [
      'Test Bragging Rights Challenge',
      'tmrtestcreator',
      'tmrtestacceptor',
      'General',
      'Bragging Rights Only',
      'Participants',
      '2 / 2',
      'Bragging Rights Only. No cash prize. No paid entry.',
    ];
    const missingModal = modalRequired.filter((item) => !modalText.includes(item));
    if (missingModal.length) throw new Error(`Challenges detail modal missing: ${missingModal.join(', ')}`);
    validatedUrl = page.url();

    await browser.close();

    const { child: proofProcess, windowId } = await launchProofWindow();
    const typedUrl = PROOF_URL.replace(/'/g, `'\\''`);
    execFileSync('bash', ['-lc', `printf '%s' '${typedUrl}' | xclip -selection clipboard && xdotool windowactivate --sync "${windowId}" key --clearmodifiers alt+d key ctrl+a key ctrl+v`], { stdio: 'inherit' });
    await wait(800);
    const addressbar = captureWindow(windowId, 'challenges-live-addressbar-proof.png');
    proofProcess.kill('SIGTERM');
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
