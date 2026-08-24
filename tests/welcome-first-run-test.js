/**
 * /welcome/ first-run release - static regression gate.
 *
 * Two things here can break silently and expensively, so they are asserted
 * rather than eyeballed:
 *
 *  1. THE SIMULATOR HANDOFF. The signup gate on /mlb-simulator/ and
 *     /nfl-simulator/ sends a logged-out visitor to
 *     /register/?return=<sim path with simResume=1> and expects them returned
 *     to the simulator with their configuration restored and the run fired.
 *     That flow is part of a Run-CTA A/B frozen on 2026-08-08 until 100 real
 *     configured sessions per arm. If the new /welcome/ redirect were ever
 *     moved above the ?return= branch it would swallow those returns and
 *     quietly contaminate a live experiment, and nothing else would complain.
 *
 *  2. NEVER TICKING A STEP ON A FAILED REQUEST. The checklist's whole value is
 *     that a tick means the member really did the thing. Every catch() handler
 *     must fall back to a neutral state, never to markDone().
 *
 * Static analysis only - no network, no browser, no database.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok  ' + name); }
  catch (e) { failures++; console.error('  FAIL ' + name + '\n       ' + e.message); }
}

console.log('\nwelcome first-run gate');

/* ---------------------------------------------------------- 1. the handoff */

const register = read('register/index.html');

check('register sends a new account to /welcome/', () => {
  assert.ok(register.includes("window.location.replace('/welcome/')"),
    'the post-signup redirect to /welcome/ is gone');
});

check('register no longer dumps a new account on the odds board', () => {
  assert.ok(!register.includes("window.location.replace('/sportsbook/?first_pick=1')"),
    'the old /sportsbook/?first_pick=1 landing is still the destination');
});

check('the ?return= branch still returns BEFORE the /welcome/ redirect', () => {
  const returnIdx = register.indexOf('window.location.replace(returnUrl)');
  const welcomeIdx = register.indexOf("window.location.replace('/welcome/')");
  assert.ok(returnIdx !== -1, 'the ?return= redirect is missing entirely');
  assert.ok(welcomeIdx !== -1, 'the /welcome/ redirect is missing entirely');
  assert.ok(returnIdx < welcomeIdx,
    'the /welcome/ redirect now runs before the ?return= branch - this swallows the simulator resume flow');
});

check('the ?return= branch is still guarded against an open redirect', () => {
  assert.ok(/\/\^\\\/\(\?!\\\/\)\//.test(register) || register.includes("/^\\/(?!\\/)/"),
    'the relative-path-only guard on ?return= is gone');
});

check('registration stores the welcome handoff for the verify-email path', () => {
  assert.ok(register.includes("sessionStorage.setItem('tmr_post_auth_redirect', 'welcome')"),
    'the post-auth handoff value is not "welcome"');
});

const verify = read('verify-email/index.html');

check('verify-email resolves the welcome handoff', () => {
  assert.ok(verify.includes("if (redirect === 'welcome') return '/welcome/';"),
    'a confirmed account would fall through to / instead of /welcome/');
});

check('verify-email still resolves its pre-existing destinations', () => {
  ["'picks'", "'profile'", "'leaderboards'"].forEach((k) => {
    assert.ok(verify.includes('redirect === ' + k), 'lost the ' + k + ' mapping');
  });
});

const login = read('login/index.html');

check('a returning login is never sent to /welcome/', () => {
  assert.ok(!login.includes('/welcome/'),
    'the login page references /welcome/ - returning members must not be sent through first-run');
});

/* --------------------------------------------- 2. the checklist honesty rule */

const js = read('static/js/welcome-checklist.js');

check('every loader has a catch handler', () => {
  ['loadPoll', 'loadTrivia', 'loadPick'].forEach((fn) => {
    const start = js.indexOf('function ' + fn + '(');
    assert.ok(start !== -1, fn + ' is missing');
    const body = js.slice(start, js.indexOf('\n  }', start));
    assert.ok(/\.catch\(function \(\)/.test(body), fn + ' has no catch handler');
  });
});

check('no catch handler can mark a step done', () => {
  // Everything from each ".catch(" to the end of its handler must not call
  // markDone. A tick on a failed request is the one outcome this page cannot
  // produce.
  const catches = js.split('.catch(function () {').slice(1);
  assert.ok(catches.length >= 3, 'expected a catch handler per loader');
  catches.forEach((tail, i) => {
    const handler = tail.slice(0, tail.indexOf('});'));
    assert.ok(!/markDone/.test(handler),
      'catch handler #' + (i + 1) + ' marks a step done on failure');
  });
});

check('done state is only reachable from an explicit positive answer', () => {
  assert.ok(/if \(f\.user_answered\)/.test(js), 'poll tick is not gated on user_answered');
  assert.ok(/Number\(s\.attempts\) > 0/.test(js), 'trivia tick is not gated on a real attempt count');
  assert.ok(/if \(d && d\.hasPicks\)/.test(js), 'pick tick is not gated on hasPicks');
});

check('requests cannot hang forever', () => {
  assert.ok(/TIMEOUT_MS\s*=\s*\d+/.test(js), 'no request timeout defined');
  assert.ok(/AbortController/.test(js), 'no abort on timeout');
});

check('the checklist writes nothing', () => {
  assert.ok(!/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i.test(js),
    'the first-run page issues a write request');
});

/* ------------------------------------------------------------- 3. the page */

const html = read('welcome/index.html');

check('page is self-canonical and indexable (no noindex)', () => {
  assert.ok(html.includes('<link rel="canonical" href="https://trustmyrecord.com/welcome/">'),
    'missing or wrong canonical');
  assert.ok(!/noindex/i.test(html), 'the page carries a noindex');
});

check('the three actions are present and the pick step is marked optional', () => {
  assert.ok(html.includes('data-action="poll"'), 'poll CTA missing');
  assert.ok(html.includes('data-action="trivia"'), 'trivia CTA missing');
  assert.ok(html.includes('data-action="pick"'), 'pick CTA missing');
  const pickStep = html.slice(html.indexOf('id="wcStepPick"'), html.indexOf('data-action="pick"'));
  assert.ok(/wc-optional/.test(pickStep), 'the tracked-record step is not marked optional');
});

check('skip is plain HTML and works without JavaScript', () => {
  // The destination moved from / to /today/ when the daily card shipped; what
  // must never change is that skipping is a real anchor to a real on-site path,
  // so a member can always leave even with JavaScript broken.
  const m = html.match(/<a href="(\/[^"]*)" id="wcSkip"/);
  assert.ok(m, 'skip is not a plain anchor with a relative href');
  assert.ok(!/javascript:/i.test(m[1]), 'skip target is not a real path');
});

check('every CTA has a real href even before JavaScript runs', () => {
  // ZERO_PICK_COVERAGE_20260824: the board CTA dropped ?first_pick=1. Nothing
  // ever read that parameter, and /sportsbook/ already opens the in-season
  // board with live odds via sportsbook-default-board.js.
  ['href="/polls/"', 'href="/trivia/"', 'href="/sportsbook/"'].forEach((h) => {
    assert.ok(html.includes(h), 'missing pre-rendered CTA target ' + h);
  });
});

check('tap targets meet the 44px minimum', () => {
  assert.ok(/\.wc-act\{[^}]*min-height:44px/.test(html), 'primary CTA under 44px');
  assert.ok(/\.wc-skip a\{[^}]*min-height:44px/.test(html), 'skip link under 44px');
});

check('rows reserve their height so resolving checks cannot shift the page', () => {
  assert.ok(/\.wc-step\{[^}]*min-height:\d+px/.test(html), 'step rows do not reserve height');
  assert.ok(/\.wc-status\{[^}]*min-height:/.test(html), 'status line does not reserve height');
});

/* ------------------------------------------------------------- 4. sitemap */

check('/welcome/ is deliberately absent from the sitemap', () => {
  const sitemap = read('sitemap.xml');
  assert.ok(!sitemap.includes('/welcome/'),
    '/welcome/ was added to the sitemap - this release must not change indexing surface');
});

if (failures) { console.error('\n' + failures + ' failing check(s)\n'); process.exit(1); }
console.log('\nall welcome first-run checks passed\n');
