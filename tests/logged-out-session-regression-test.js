#!/usr/bin/env node
/**
 * LOGGED-OUT SESSION REGRESSION
 * =============================
 * A signed-out visitor must not generate failing authenticated requests.
 *
 * Two endpoints were doing exactly that on every logged-out page view, and each
 * one logged a browser console error that no application code can suppress:
 *
 *   /api/auth/me            — static/js/tmr-sitewide.js getSessionUser() called
 *                             api.getCurrentUser() with no token to send.
 *                             (The canonical nav, tmr-ds-nav.js, already gated
 *                             this: `var t = token(); if (!t) { signOutHeader(); return; }`)
 *   /api/challenges?limit=  — leaderboards/index.html fired the auth-only
 *                             endpoint and leaned on 401 -> catch to reach 0.
 *
 * The guard must be "do we hold a credential", never "did the call fail" — a
 * token that IS present and gets rejected has to keep reaching the 401 path so
 * an expired session is still detected. Both directions are asserted here.
 *
 * Run: node tests/logged-out-session-regression-test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (error) { failures.push({ name, error }); console.log(`FAIL  ${name}\n      ${error.message}`); }
}

// ---------------------------------------------------------------------------
// Behavioural: boot the real sitewide nav against a stubbed API.
// ---------------------------------------------------------------------------
const sitewide = fs.readFileSync(path.join(root, 'static', 'js', 'tmr-sitewide.js'), 'utf8');

function bootNav({ loggedIn }) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'dangerously', url: 'https://trustmyrecord.com/sportsbook/', virtualConsole,
  });
  const win = dom.window;
  const calls = [];
  win.api = {
    isLoggedIn: () => loggedIn,
    getCurrentUser: () => { calls.push('/auth/me'); return Promise.resolve({ user: { username: 'someone' } }); },
    _cachedUser: null,
  };
  win.fetch = (url) => { calls.push(String(url)); return Promise.reject(new Error('no network in this test')); };
  win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  try { win.eval(sitewide); } catch (error) { /* nav may need page-specific DOM; the guard still runs */ }
  return calls;
}

test('logged out: the sitewide nav never asks /auth/me without a credential', () => {
  const calls = bootNav({ loggedIn: false });
  const authCalls = calls.filter((c) => c.includes('/auth/me'));
  assert.strictEqual(authCalls.length, 0,
    `expected no /auth/me call, saw ${authCalls.length}: ${authCalls.join(', ')}`);
});

test('with a credential: the sitewide nav DOES ask, so an expired session is still detected', () => {
  const calls = bootNav({ loggedIn: true });
  const authCalls = calls.filter((c) => c.includes('/auth/me'));
  assert.ok(authCalls.length > 0,
    'the guard must not suppress the call when a token exists — that would hide an expired session');
});

// ---------------------------------------------------------------------------
// Source contract: the leaderboard's auth-only fetches stay gated.
// ---------------------------------------------------------------------------
const leaderboards = fs.readFileSync(path.join(root, 'leaderboards', 'index.html'), 'utf8');

test('leaderboards defines a credential check rather than probing the endpoint', () => {
  assert.ok(/function isSignedIn\s*\(/.test(leaderboards), 'isSignedIn() helper is missing');
  assert.ok(/api\.isLoggedIn/.test(leaderboards), 'isSignedIn() must consult the API session state');
});

test('every auth-only /challenges fetch on the leaderboard is behind that check', () => {
  // Only the bare /challenges endpoint needs auth; /gaming/challenges is public.
  const lines = leaderboards.split(/\r?\n/);
  const authOnly = [];
  lines.forEach((line, i) => {
    if (/request\((['`])\/challenges\?/.test(line)) authOnly.push(i);
  });
  assert.ok(authOnly.length > 0, 'expected at least one /challenges call to guard');
  for (const i of authOnly) {
    const window8 = lines.slice(Math.max(0, i - 8), i).join('\n');
    assert.ok(/isSignedIn\(\)/.test(window8),
      `the /challenges call on line ${i + 1} is not gated by isSignedIn():\n${lines[i].trim()}`);
  }
});

test('the public /gaming/challenges feed is NOT gated — it works signed out', () => {
  const idx = leaderboards.split(/\r?\n/).findIndex((l) => /request\((['`])\/gaming\/challenges/.test(l));
  assert.ok(idx > -1, 'expected the public online-challenges feed to still be fetched');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ${f.name}\n    ${f.error.stack.split('\n').slice(0, 3).join('\n    ')}`);
  process.exit(1);
}
