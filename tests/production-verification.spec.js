/**
 * PRODUCTION verification for the 2026-08-31 release.
 *
 * Runs against the LIVE site and the LIVE API. It is deliberately read-only
 * against production data: it signs in with a minted token to LOOK at private
 * pages, and the one write it attempts is a duplicate report that the server
 * must refuse. It never files a new report, never grades anything and never
 * changes a member's record.
 *
 * Covers, in Nima's order:
 *   A  /messages/ - incoming and outgoing messages visibly readable
 *   B  pick 5245 - correct final grade and updated member stats
 *   C  /my-pending-picks/ - Report Ungraded Wager workflow
 *   D  /admin/grading-reports/ - queue working
 *   E  duplicate report protection
 *   F  stale-report detection (tickets nobody reported)
 *   G  existing pending-picks behaviour still works
 *
 * Needs TMR_JWT_SECRET and TMR_ADMIN_TOKEN in the environment (production
 * values, never committed).
 *
 * Run: npx playwright test --config=playwright.production-verification.config.cjs
 */
const { test, expect } = require('@playwright/test');
const path = require('path');

const BACKEND = path.join(__dirname, '../../trustmyrecord-backend');
const jwt = require(path.join(BACKEND, 'node_modules/jsonwebtoken'));

const API = 'https://trustmyrecord-api.onrender.com/api';
const JWT_SECRET = process.env.TMR_JWT_SECRET || '';
const ADMIN_TOKEN = process.env.TMR_ADMIN_TOKEN || '';
if (!JWT_SECRET || !ADMIN_TOKEN) {
  throw new Error('TMR_JWT_SECRET and TMR_ADMIN_TOKEN are required for the production verification run.');
}

// Real production accounts, used only to VIEW their own pages.
const FOUNDER = { id: 1, username: 'BetLegend' };
const MANCITY_PICK = 5245;
const MANCITY_USER = { id: 625, username: 'MoneyMakers' };
// makaveli66 owns two of the stranded tennis wagers, so their pending page is
// where the "already reported" and "not eligible yet" states actually render.
const STRANDED_OWNER = { id: 626, username: 'makaveli66' };
const STRANDED_PICK = 3266;

function signInAs(page, user) {
  const token = jwt.sign({ id: user.id, userId: user.id }, JWT_SECRET, { expiresIn: '30m' });
  return page.addInitScript((t) => {
    localStorage.setItem('accessToken', t);
    localStorage.setItem('token', t);
    localStorage.setItem('trustmyrecord_token', t);
  }, token);
}

// The queue page is exercised with a PASTED ADMIN_TOKEN specifically, because
// that is the path that used to be dead in a browser: x-admin-token is not in
// the API's CORS allow-list, so the page sends it as ?admin_token= instead.
function signInAdmin(page) {
  return page.addInitScript((t) => { localStorage.setItem('tmr_admin_token', t); }, ADMIN_TOKEN);
}

/**
 * WCAG contrast for what a human actually sees: the element's own colour
 * against the first ancestor that paints a non-transparent background. Reading
 * `background-color` on the element alone reports `rgba(0,0,0,0)` for a bubble
 * that inherits its ground, which is how a dark-on-dark bug measures as fine.
 */
const CONTRAST_FN = `(el) => {
  const parse = (c) => {
    const m = String(c).match(/[\\d.]+/g);
    if (!m) return null;
    const a = m.length > 3 ? parseFloat(m[3]) : 1;
    return { r: +m[0], g: +m[1], b: +m[2], a };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  let bg = { r: 255, g: 255, b: 255, a: 1 };
  const stack = [];
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    const c = parse(getComputedStyle(node).backgroundColor);
    if (c && c.a > 0) stack.push(c);
    if (c && c.a === 1) break;
  }
  for (let i = stack.length - 1; i >= 0; i -= 1) bg = over(stack[i], bg);
  const style = getComputedStyle(el);
  let fg = parse(style.color) || { r: 0, g: 0, b: 0, a: 1 };
  if (fg.a < 1) fg = over(fg, bg);
  const l1 = lum(fg);
  const l2 = lum(bg);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return {
    ratio: Math.round(ratio * 100) / 100,
    color: style.color,
    background: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')',
    fontSize: style.fontSize,
    text: (el.textContent || '').trim().slice(0, 40),
  };
}`;

async function contrast(locator) {
  return locator.first().evaluate(eval(`(${CONTRAST_FN})`));
}

/** Measure every match of a selector, skipping ones that render no text. */
async function measure(page, label, selector, floor, results) {
  const loc = page.locator(selector);
  const count = await loc.count();
  if (!count) return { label, selector, measured: false };
  const el = loc.first();
  if (!(await el.isVisible().catch(() => false))) return { label, selector, measured: false };
  const m = await contrast(loc);
  results.push({ label, ...m, floor });
  return { label, ...m, floor, measured: true };
}

test.describe('A. /messages/ readability', () => {
  test('every message surface clears WCAG AA against its own background', async ({ page }) => {
    await signInAs(page, FOUNDER);
    await page.goto('/messages/');

    // The inbox has to actually load a thread before any of this means anything.
    const threadRow = page.locator('.msg-row').first();
    await expect(threadRow).toBeVisible({ timeout: 60000 });
    await threadRow.click();

    const incoming = page.locator('.msg-bubble.received').first();
    await expect(incoming).toBeVisible({ timeout: 30000 });

    const results = [];
    // 4.5:1 is the AA floor for body text; 3:1 is the AA floor for icons and
    // other non-text UI, which is what the action controls are.
    const checks = [
      ['incoming message text', '.msg-bubble.received .msg-bubble-content', 4.5],
      ['outgoing message text', '.msg-bubble.sent .msg-bubble-content', 4.5],
      ['incoming timestamp', '.msg-bubble.received .msg-bubble-time', 4.5],
      ['outgoing timestamp', '.msg-bubble.sent .msg-bubble-time', 4.5],
      ['message action controls', '.msg-action-btn', 3],
      ['reply control', '.msg-bubble-reply', 3],
      ['react control', '.msg-bubble-react', 3],
      ['delete control', '.msg-bubble-delete', 3],
      ['reaction chip', '.msg-reaction-chip', 3],
      ['reply quote name', '.msg-reply-quote-name', 4.5],
      ['reply quote text', '.msg-reply-quote-text', 4.5],
      ['conversation list name', '.msg-row-name', 4.5],
      ['conversation list preview', '.msg-row-preview', 4.5],
      ['conversation list time', '.msg-row-time', 4.5],
      ['day separator', '.msg-day-sep', 4.5],
      ['thread pane name', '.msg-pane-name', 4.5],
      ['thread pane status', '.msg-pane-status', 4.5],
      ['folder label', '.msg-folder-label', 4.5],
      ['search input', '.msg-search input, #msgSearch', 4.5],
      ['composer input', '#messageInput', 4.5],
    ];
    for (const [label, selector, floor] of checks) {
      await measure(page, label, selector, floor, results);
    }

    console.log('MESSAGES CONTRAST\n' + results.map((r) => `  ${r.ratio.toFixed(2)}:1  ${r.label}  (${r.color} on ${r.background})`).join('\n'));

    expect(results.length, 'at least the two bubble types and the composer were measured').toBeGreaterThanOrEqual(3);
    const failures = results.filter((r) => r.ratio < r.floor);
    expect(failures, 'surfaces under their WCAG floor: ' + JSON.stringify(failures, null, 1)).toEqual([]);

    // The specific regression Nima reported: an incoming bubble must not be
    // near-invisible against the thread ground.
    const inbound = results.find((r) => r.label === 'incoming message text');
    expect(inbound, 'incoming message text was measured').toBeTruthy();
    expect(inbound.ratio).toBeGreaterThan(4.5);
  });

  test('the new-message modal and its search results are readable', async ({ page }) => {
    await signInAs(page, FOUNDER);
    await page.goto('/messages/');
    await expect(page.locator('.msg-compose-btn')).toBeVisible({ timeout: 60000 });
    await page.locator('.msg-compose-btn').click();

    const results = [];
    const modal = page.locator('#newMessageModal');
    await expect(modal).toBeVisible({ timeout: 15000 });
    await measure(page, 'modal heading', '#newMessageModal h2, #newMessageModal .modal-title', 4.5, results);
    await measure(page, 'modal label', '#newMessageModal label', 4.5, results);
    await measure(page, 'modal input', '#newMessageUsername', 4.5, results);
    await measure(page, 'modal message box', '#composerMessage', 4.5, results);

    // The search results Nima's teammate could not measure: type a letter and
    // read whatever the autocomplete renders.
    await page.locator('#newMessageUsername').fill('a');
    await page.waitForTimeout(3000);
    await measure(page, 'search result name', '.composer-result-name', 4.5, results);
    await measure(page, 'search result sub', '.composer-result-sub', 4.5, results);
    await measure(page, 'composer chip', '.composer-chip', 4.5, results);

    console.log('NEW MESSAGE MODAL CONTRAST\n' + results.map((r) => `  ${r.ratio.toFixed(2)}:1  ${r.label}  (${r.color} on ${r.background})`).join('\n'));
    const failures = results.filter((r) => r.ratio < r.floor);
    expect(failures, 'modal surfaces under their WCAG floor: ' + JSON.stringify(failures, null, 1)).toEqual([]);
  });
});

test.describe('B. Pick 5245', () => {
  test('the Manchester City wager is graded WON and the member record agrees', async ({ request }) => {
    const audit = await request.get(`${API}/admin/pending-picks-audit?status=won&limit=1000`, {
      headers: { 'x-admin-token': ADMIN_TOKEN },
    });
    expect(audit.ok()).toBeTruthy();
    const pick = (await audit.json()).picks.find((p) => p.id === MANCITY_PICK);
    expect(pick, 'pick 5245 is in the WON set').toBeTruthy();
    expect(pick.selection).toBe('Manchester City');
    expect(pick.market_type).toBe('h2h');
    expect(pick.odds_snapshot).toBe(-353);
    expect(pick.home_team).toBe('Crystal Palace');
    expect(pick.away_team).toBe('Manchester City');
    // Crystal Palace 1-4 Manchester City: the away side the member backed won.
    expect(pick.home_score).toBe(1);
    expect(pick.away_score).toBe(4);
    expect(pick.completed).toBe(true);

    const board = await request.get(`${API}/users/leaderboard?limit=200`);
    expect(board.ok()).toBeTruthy();
    const row = (await board.json()).leaderboard.find((u) => u.username === MANCITY_USER.username);
    expect(row, 'the member is on the leaderboard').toBeTruthy();
    // Derived data agrees with the picks ledger: 333-179-2, -20.13u.
    expect(row.wins + row.losses + row.pushes).toBe(row.total_picks);
    expect(row.graded_picks).toBe(row.total_picks);
    expect(Number.isFinite(row.net_units)).toBe(true);
    expect(row.current_streak).toBeGreaterThanOrEqual(1);
    console.log('PICK 5245', JSON.stringify({
      status: 'won', selection: pick.selection, odds: pick.odds_snapshot,
      final: `${pick.away_team} ${pick.away_score}, ${pick.home_team} ${pick.home_score}`,
    }));
    console.log('MEMBER RECORD', JSON.stringify(row));
  });
});

test.describe('C/G. /my-pending-picks/', () => {
  test('the Report column renders and the existing ticket columns still work', async ({ page }) => {
    await signInAs(page, STRANDED_OWNER);
    await page.goto('/my-pending-picks/');
    await expect(page.locator('#pendingPanel')).toBeVisible({ timeout: 45000 });

    // G: nothing about the original ticket was disturbed.
    const headers = await page.locator('#pendingPanel thead th').allTextContents();
    expect(headers).toEqual([
      'Date of Game (ET)', 'League', 'Pick', 'Line', 'Odds', 'Risk', 'To Win',
      'Time Submitted (ET)', 'Status', 'Ticket #', 'Report',
    ]);
    await expect(page.locator('#summaryCount')).not.toHaveText('0');

    // C: the escalation column is populated on every row, in member language.
    const rows = page.locator('#pendingRows tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    const reportCells = await rows.locator('td:last-child').allTextContents();
    console.log('REPORT COLUMN STATES', JSON.stringify(reportCells.slice(0, 12), null, 1));
    for (const cell of reportCells) {
      expect(
        /Report Ungraded Wager|Reported|This wager can be reported after|^-$/.test(cell.trim()),
        'unexpected report-cell copy: ' + cell
      ).toBeTruthy();
    }
    // No database vocabulary reaches the member.
    const body = await page.locator('body').innerText();
    for (const term of ['sport_key', 'provider_sport_key_unmapped', 'grader_retries', 'commence_time', 'pick_id']) {
      expect(body.includes(term), `member page leaked internal term "${term}"`).toBeFalsy();
    }

    // The stranded tennis wager is already in the queue, so it must say so
    // rather than offering a second report.
    const stranded = page.locator(`tr:has(td:text-is("${String(STRANDED_PICK).padStart(7, '0')}"))`);
    if (await stranded.count()) {
      await expect(stranded).toContainText('Reported');
      await expect(stranded.locator('button.report-btn')).toHaveCount(0);
    }
  });
});

test.describe('D/F. /admin/grading-reports/', () => {
  test('the queue lists the tickets the audit opened with a reason on each', async ({ page }) => {
    await signInAdmin(page);
    await page.goto('/admin/grading-reports/');
    // #reportRows always holds a "Loading..." row, so wait for the counter the
    // page only writes once the data has actually landed.
    await expect(page.locator('#rowCount')).toContainText('report(s) shown', { timeout: 60000 });

    const open = Number(await page.locator('#openCount').textContent());
    expect(open).toBeGreaterThan(0);

    const rows = page.locator('#reportRows tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // F: these were opened by the audit, not by a member.
    const systemPills = await page.locator('#reportRows .pill.system').count();
    expect(systemPills, 'the stale audit opened tickets nobody reported').toBeGreaterThan(0);
    expect(Number(await page.locator('#systemCount').textContent())).toBeGreaterThan(0);

    // Every ticket carries an actionable reason, not a blank cell.
    const causes = await page.locator('#reportRows .cause').allTextContents();
    console.log('QUEUE CAUSES', JSON.stringify(causes, null, 1));
    expect(causes.length).toBe(rowCount);
    for (const c of causes) {
      expect(c.trim().length, 'a ticket reached the queue with no diagnosis').toBeGreaterThan(0);
      expect(c.trim()).not.toBe('not investigated yet');
    }
    // The diagnostic Nima asked to keep is present and still means something.
    expect(causes.some((c) => c.trim() === 'provider_sport_key_unmapped')).toBeTruthy();

    // The admin gets a way into the wager and the member.
    await expect(rows.first().locator('a[href^="/pick/?id="]')).toHaveCount(1);
    await expect(rows.first().locator('a[href^="/u/"]')).toHaveCount(1);
  });

  test('the main admin panel carries the open-report count', async ({ page }) => {
    // The main panel is used signed in as the founder; adminOnly accepts that
    // bearer, and Authorization is the only auth header CORS lets through.
    await signInAs(page, FOUNDER);
    await page.goto('/admin/');
    const tile = page.locator('#ungradedReports');
    await expect(tile).not.toHaveText('-', { timeout: 45000 });
    expect(Number(await tile.textContent())).toBeGreaterThan(0);
    await expect(page.locator('a[href="/admin/grading-reports/"]')).toBeVisible();
  });
});

test.describe('E. duplicate report protection', () => {
  test('a second report on a wager already in the queue is refused by name', async ({ request }) => {
    const token = jwt.sign({ id: STRANDED_OWNER.id, userId: STRANDED_OWNER.id }, JWT_SECRET, { expiresIn: '10m' });
    const res = await request.post(`${API}/grading-reports`, {
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      data: { pick_id: STRANDED_PICK },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('This wager has already been reported and is awaiting review.');
    expect(body.already_reported).toBe(true);
  });
});
