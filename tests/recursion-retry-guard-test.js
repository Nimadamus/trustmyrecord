#!/usr/bin/env node
/**
 * Regression test for the 2026-07-26 recursion/retry audit.
 *
 * A prior bug (renderPicksList) was a named function that called itself on
 * every fetch resolution with no termination condition -- an infinite
 * request loop. An automated scan (self-calling function + fetch/then/await
 * in its body) was run across the full frontend afterward; every other match
 * turned out to be a *bounded* retry-with-limit or a false positive (name
 * matched inside a comment / onclick string, not a real self-call).
 *
 * This test locks in the specific bound/termination condition each of those
 * legitimate self-calling functions relies on, so a future edit can't
 * accidentally strip the bound and reintroduce an unbounded loop.
 *
 * Run: node tests/recursion-retry-guard-test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  PASS ' + name); }
  catch (e) { failures++; console.error('  FAIL ' + name + ' :: ' + e.message); }
}

check('sportsbook tryFetch(daysOffset) is bounded by maxDays on both the success and error paths', () => {
  const html = read('sportsbook/index.html');
  const start = html.indexOf('function tryFetch(daysOffset)');
  const end = html.indexOf('tryFetch(0);', start);
  assert(start !== -1 && end !== -1, 'tryFetch block must be extractable');
  const body = html.slice(start, end);
  const boundedCalls = (body.match(/if \(.*daysOffset < maxDays\)\s*\{\s*tryFetch\(daysOffset \+ 1\)/g) || []).length;
  assert.strictEqual(boundedCalls, 2, 'both the empty-games branch and the fetch .catch branch must guard the recursive call with daysOffset < maxDays');
});

check('mlb-simulator tryGame(index) is bounded by games.length', () => {
  const src = read('static/js/mlb-simulator.js');
  const start = src.indexOf('function tryGame(index)');
  const end = src.indexOf('return tryGame(0);', start);
  assert(start !== -1 && end !== -1, 'tryGame block must be extractable');
  const body = src.slice(start, end);
  assert(/if \(index >= games\.length\) return/.test(body), 'tryGame must terminate once index reaches games.length');
});

check('season-simulator loadTeams(attempt) retries with a hard cap and backoff, not unconditionally', () => {
  const src = read('static/js/season-simulator.js');
  const start = src.indexOf('function loadTeams(attempt)');
  assert(start !== -1, 'loadTeams must be extractable');
  const body = src.slice(start, start + 2200);
  assert(/if \(attempt < 4\)/.test(body), 'loadTeams retry must be capped (attempt < 4)');
  assert(/setTimeout\(function \(\) \{ loadTeams\(attempt \+ 1\); \}, 3000 \+ attempt \* 2000\)/.test(body), 'loadTeams retry must back off (increasing delay), not tight-loop');
});

check('wallet boot() retries with a fixed-length backoff table, not unconditionally', () => {
  const html = read('wallet/index.html');
  assert(/attempt < RETRY_DELAYS_MS\.length/.test(html), 'wallet boot() retry must be capped by RETRY_DELAYS_MS.length');
  assert(/retryTimer = setTimeout\(function \(\) \{ boot\(\); \}, delay\)/.test(html), 'wallet boot() must schedule its retry via setTimeout with a computed delay, not call itself synchronously');
});

check('tmr-make-picks-multi submitNext(i) terminates once the batch array is exhausted', () => {
  const src = read('static/js/tmr-make-picks-multi.js');
  const start = src.indexOf('function submitNext(i)');
  const end = src.indexOf('function finishBatch', start);
  assert(start !== -1 && end !== -1, 'submitNext block must be extractable');
  const body = src.slice(start, end);
  assert(/if \(i >= arr\.length\) \{\s*finishBatch\(\);\s*return;/.test(body), 'submitNext must return via finishBatch() once i >= arr.length');
});

check('tmr-home-live page(off) pagination is bounded (offset cap, not unconditional)', () => {
  const src = read('static/js/tmr-home-live.js');
  const start = src.indexOf('(function page()');
  assert(start !== -1, 'home-live page() must be extractable');
  const body = src.slice(start, start + 400);
  assert(/off < 1000/.test(body), 'home-live page() must cap the offset it will page through');
});

check('tmr-profile-hydrate page(off) pagination is bounded (offset cap, not unconditional)', () => {
  const src = read('static/js/tmr-profile-hydrate.js');
  const start = src.indexOf('function page(off)');
  assert(start !== -1, 'profile-hydrate page() must be extractable');
  const body = src.slice(start, start + 400);
  assert(/off < 900/.test(body), 'profile-hydrate page() must cap the offset it will page through');
});

check('auth-persistent PersistentAuthSystem (30s setInterval, no clearInterval) is instantiated exactly once, top-level', () => {
  const src = read('static/js/auth-persistent.js');
  const count = (src.match(/new PersistentAuthSystem\(\)/g) || []).length;
  assert.strictEqual(count, 1, 'a second instantiation would double the 30s persistSession interval');
});

check('sportsbook-contest-toggle watch() (700ms setInterval, no clearInterval) is armed by exactly one DOMContentLoaded listener', () => {
  const src = read('static/js/sportsbook-contest-toggle.js');
  const count = (src.match(/addEventListener\('DOMContentLoaded',\s*watch\)/g) || []).length;
  assert.strictEqual(count, 1, 'a second DOMContentLoaded->watch() binding would double the 700ms interval');
});

console.log(failures === 0 ? '\nAll recursion-retry-guard checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
