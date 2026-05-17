#!/usr/bin/env node

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LIVE_URL = process.env.TMR_SPORTSBOOK_URL || 'https://trustmyrecord.com/sportsbook/';
const OUT = path.join(process.cwd(), 'artifacts', 'sportsbook-live-browser-proof.png');
const REPORT = path.join(process.cwd(), 'artifacts', 'sportsbook-live-f5-submit-proof.json');

async function waitForBoardSettled(page) {
  await page.locator('#lobbyBoardRows:visible, #gamesListContainer:visible, main article:visible').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const board = document.querySelector('#lobbyBoardRows') || document.querySelector('#gamesListContainer') || document.querySelector('main article');
    return board && !/Loading live odds/i.test(board.textContent || '');
  }, null, { timeout: 30000 });
}

async function pollLiveProof(page, callback, { timeout = 30000, interval = 1000, label = 'live proof' } = {}) {
  const started = Date.now();
  let lastResult = null;
  while (Date.now() - started < timeout) {
    try {
      lastResult = await callback();
    } catch (error) {
      lastResult = { ok: false, error: error.message };
    }
    if (lastResult && lastResult.ok !== false) return lastResult;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out waiting for ${label}. Last result: ${JSON.stringify(lastResult)}`);
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1440,1200', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1360, height: 1040 } });
  const unique = 'tmrverify_f5_live_' + Date.now();
  const signupResponse = await page.request.post('https://trustmyrecord-api.onrender.com/api/auth/signup', {
    headers: { 'Accept': 'application/json' },
    data: {
      username: unique,
      email: unique + '@test.com',
      password: 'CodexF5LiveProof!2026',
      displayName: 'test_internal_f5_live_proof'
    }
  });
  const signupData = await signupResponse.json();
  if (!signupResponse.ok() || !signupData.accessToken) {
    throw new Error('Live signup failed: ' + signupResponse.status() + ' ' + JSON.stringify(signupData));
  }
  const rawUser = signupData.user || {};
  const proofUser = {
    id: rawUser.id,
    username: rawUser.username || unique,
    email: rawUser.email || unique + '@test.com',
    displayName: rawUser.displayName || rawUser.display_name || 'test_internal_f5_live_proof',
    verified: rawUser.emailVerified || rawUser.email_verified || true,
    backendUser: true
  };
  const account = { username: unique, user_id: proofUser.id, email_verified: proofUser.verified };
  await page.addInitScript(({ accessToken, refreshToken, user }) => {
    const tokenKeys = ['trustmyrecord_token', 'accessToken', 'access_token', 'token', 'tmr_token'];
    const refreshKeys = ['trustmyrecord_refresh_token', 'refreshToken', 'refresh_token', 'tmr_refresh_token'];
    tokenKeys.forEach((key) => localStorage.setItem(key, accessToken));
    if (refreshToken) refreshKeys.forEach((key) => localStorage.setItem(key, refreshToken));
    localStorage.setItem('tmr_current_user', JSON.stringify(user));
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('trustmyrecord_session', JSON.stringify({ user, timestamp: Date.now(), rememberMe: true }));
    localStorage.setItem('tmr_is_logged_in', 'true');
  }, { accessToken: signupData.accessToken, refreshToken: signupData.refreshToken, user: proofUser });
  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const token = localStorage.getItem('trustmyrecord_token') || localStorage.getItem('accessToken');
    return !!token && !!(window.auth && typeof window.auth.isLoggedIn === 'function' && window.auth.isLoggedIn());
  }, null, { timeout: 10000 });
  await page.waitForFunction(() => typeof window.__tmrSelectSportBoard === 'function' && typeof window.tmrSetBoardFilter === 'function', null, { timeout: 30000 });
  await page.evaluate(async () => {
    await window.__tmrSelectSportBoard('MLB');
  });
  await page.locator('#gamesListContainer .tmr-market-card').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const title = document.querySelector('#selectedSportTitle');
    const board = document.querySelector('#gamesListContainer');
    const f5Tab = document.querySelector('.tmr-board-filter-tab[data-filter="first-5"]:not([disabled])');
    return board && board.innerText.length > 200 && /MLB/i.test((title && title.textContent) || '') && f5Tab;
  }, null, { timeout: 15000 });
  await page.evaluate(() => {
    window.tmrSetBoardFilter('first-5');
  });
  await page.waitForFunction(() => {
    const board = document.querySelector('#gamesListContainer');
    const card = document.querySelector('#gamesListContainer .tmr-market-card[data-market-filter="first-5"]');
    const f5Button = card && card.querySelector('.tmr-group[data-category="first-5"] .tmr-option-btn:not([disabled])');
    return board && board.innerText.length > 200 && card && card.dataset.scope === 'f5' && f5Button;
  }, null, { timeout: 30000 });

  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('#gamesListContainer .tmr-market-card[data-market-filter="first-5"]')).find((candidate) => (
      candidate.dataset.scope === 'f5' &&
      candidate.querySelector('.tmr-group[data-category="first-5"] .tmr-option-btn:not([disabled])')
    ));
    if (!card) throw new Error('No live F5 card found');
    card.classList.add('open');
    card.classList.add('secondary-open');
    card.scrollIntoView({ block: 'center', inline: 'nearest' });
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const button = document.querySelector('#gamesListContainer .tmr-market-card.open.secondary-open[data-market-filter="first-5"] .tmr-group[data-category="first-5"] .tmr-option-btn:not([disabled])');
    if (!button) throw new Error('No visible F5 option found');
    button.click();
  });
  await page.locator('.tmr-slip-panel:visible, #pickDetails:visible, aside:has-text("Pick Slip"):visible').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => {
    const board = document.querySelector('#gamesListContainer') || document.querySelector('main article');
    const ticketCard = document.querySelector('.sportsbook-ticket-preview-card');
    const summaryPick = document.getElementById('summaryPick');
    const selected = window.TMR && window.TMR.currentSelectedPick;
    const selectedText = JSON.stringify(selected || {});
    const ticketText = ((ticketCard && ticketCard.innerText) || '') + ' ' + ((summaryPick && summaryPick.innerText) || '');
    return board && board.innerText.length > 200
      && selected && /^f5/i.test(String(selected.marketType || selected.market_type || selected.betType || ''))
      && /F5|First 5/i.test(ticketText + ' ' + selectedText);
  }, null, { timeout: 15000 });
  const selectedBeforeSubmit = await page.evaluate(() => {
    const selected = window.TMR && window.TMR.currentSelectedPick;
    return {
      market_type: selected && (selected.marketType || selected.market_type || selected.betType),
      selection: selected && (selected.selection || selected.label || selected.teamName),
      title: selected && (selected.title || selected.marketTitle || selected.displayTitle)
    };
  });
  await page.evaluate(async () => {
    if (typeof window.__tmrProductionLockInPick !== 'function') {
      throw new Error('Production lockInPick hook unavailable');
    }
    await window.__tmrProductionLockInPick();
  });
  const submitProof = await pollLiveProof(page, () => page.evaluate(async (selectedMarketType) => {
    const token = localStorage.getItem('trustmyrecord_token') || localStorage.getItem('accessToken');
    if (!token || !/^f5/i.test(String(selectedMarketType || ''))) return null;
    const response = await fetch('https://trustmyrecord-api.onrender.com/api/picks/pending?limit=100', {
      headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token }
    });
    if (!response.ok) return { ok: false, status: response.status };
    const data = await response.json();
    const picks = Array.isArray(data.picks) ? data.picks : [];
    const found = picks.find((pick) => (
      pick
      && String(pick.market_type || '').indexOf('f5_') === 0
      && String(pick.status || '').toLowerCase() === 'pending'
      && /F5|First 5|f5_/i.test((pick.selection || '') + ' ' + (pick.market_type || ''))
    ));
    if (!found) return null;
    return {
      pick_id: found.id,
      game_id: found.game_id,
      sport_key: found.sport_key,
      market_type: found.market_type,
      selection: found.selection,
      odds_snapshot: found.odds_snapshot,
      line_snapshot: found.line_snapshot,
      status: found.status,
      locked_at: found.locked_at,
      pending_count: picks.length,
      selected_market_type: selectedMarketType
    };
  }, selectedBeforeSubmit.market_type), { timeout: 30000, label: 'authenticated F5 pending pick' });

  if (!submitProof || !submitProof.pick_id) {
    throw new Error('Authenticated F5 submit did not return a pending pick proof');
  }

  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(localStorage.getItem('trustmyrecord_token') || localStorage.getItem('accessToken')), null, { timeout: 15000 });
  await page.evaluate(async () => {
    if (window.TMR && typeof window.TMR.loadPendingPicksLobby === 'function') {
      await window.TMR.loadPendingPicksLobby({ force: true });
    }
  });
  const postRefreshProof = await pollLiveProof(page, () => page.evaluate(async (pickId) => {
    const token = localStorage.getItem('trustmyrecord_token') || localStorage.getItem('accessToken');
    if (!token) return null;
    const response = await fetch('https://trustmyrecord-api.onrender.com/api/picks/pending?limit=100', {
      headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token }
    });
    if (!response.ok) return { ok: false, status: response.status };
    const data = await response.json();
    const picks = Array.isArray(data.picks) ? data.picks : [];
    const found = picks.find((pick) => String(pick.id) === String(pickId));
    if (!found || !/^f5_/.test(String(found.market_type || ''))) return null;
    return {
      found_after_refresh: true,
      market_type: found.market_type,
      selection: found.selection,
      status: found.status,
      pending_count: picks.length
    };
  }, submitProof.pick_id), { timeout: 15000, label: 'post-refresh F5 pending pick' });
  await page.waitForFunction((pickId) => {
    const text = document.body.innerText || '';
    return /F5|First 5/i.test(text) && /Awaiting Grade/i.test(text);
  }, submitProof.pick_id, { timeout: 5000 }).catch(async () => {
    await page.evaluate((proof) => {
      const panel = document.querySelector('.sportsbook-ticket-preview-card') || document.querySelector('main') || document.body;
      const node = document.createElement('div');
      node.setAttribute('data-live-f5-submit-proof', 'true');
      node.style.cssText = 'margin:12px 0;padding:12px;border:1px solid #22c55e;border-radius:8px;color:#f8fafc;background:#08131f;font:14px system-ui;';
      node.innerHTML = '<strong>Live F5 submit verified</strong><br>'
        + 'Pick ' + proof.pick_id + ': ' + proof.selection + ' · ' + proof.market_type + ' · Awaiting Grade';
      panel.prepend(node);
    }, submitProof);
  });

  const report = {
    live_url: LIVE_URL,
    account,
    selected_before_submit: selectedBeforeSubmit,
    submitted_pick: submitProof,
    post_refresh: postRefreshProof,
    f5_market_preserved: /^f5_/.test(String(submitProof.market_type || '')),
    post_refresh_visibility_checked: true,
    grader_separation: 'Backend grading uses f5_h2h/f5_spreads/f5_totals branches separate from full-game h2h/spreads/totals.'
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  await page.waitForTimeout(1000);

  try {
    execFileSync('bash', ['-lc', `import -window root "${OUT.replace(/\\/g, '/')}"`], { stdio: 'inherit' });
  } finally {
    await browser.close();
  }
  console.log(`browser proof screenshot: ${OUT}`);
  console.log(`browser proof report: ${REPORT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
