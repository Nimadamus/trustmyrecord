// TMR_BOARD_DEDUPE_20260911. static/js/tmr-board-dedupe.js must collapse the
// sportsbook's duplicate board requests and touch nothing else.
//
// Measured on the live page 2026-09-11: /api/games/board/baseball_mlb was
// requested three times concurrently about 700ms into the load, the board is
// ~2.6MB of JSON, first contentful paint was 8.5s. The URL is built in nine
// places that disagree about `?limit`, so the dedupe canonicalizes the URL and
// then shares one in-flight request.
//
// The risk this file covers is the wrapper being too greedy: a fetch patch that
// swallowed a POST, a non-board GET, or the per-game props sub-route would
// break the sportsbook in ways that are hard to see. Every one of those is an
// explicit negative control below.
//
// Run: node tests/board-dedupe-test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(label, ok, detail) {
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}

const SCRIPT = fs.readFileSync(
  path.join(__dirname, '..', 'static', 'js', 'tmr-board-dedupe.js'),
  'utf8'
);

const ORIGIN = 'https://trustmyrecord.com';
const API = 'https://trustmyrecord-api.onrender.com/api';

// A minimal stand-in for the browser Response. Only what the dedupe touches:
// ok, and clone(). Each clone carries the same identity marker so a test can
// tell which underlying network response a caller was handed.
function makeResponse(marker, ok) {
  return {
    ok: ok !== false,
    status: ok === false ? 500 : 200,
    marker,
    clone() { return makeResponse(marker, ok); },
  };
}

// Builds a fresh sandbox with the dedupe installed over a counting fetch.
function install(options) {
  const opts = options || {};
  const calls = [];
  let responseSeq = 0;

  const nativeFetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url);
    calls.push({ url, init });
    responseSeq += 1;
    const marker = `r${responseSeq}`;
    if (opts.fail) return Promise.reject(new Error('network down'));
    const settle = (resolve) => resolve(makeResponse(marker, opts.ok));
    if (opts.deferred) {
      return new Promise((resolve) => { opts.deferred.push(() => settle(resolve)); });
    }
    return new Promise(settle);
  };

  const sandbox = {
    window: { fetch: nativeFetch, location: { href: `${ORIGIN}/sportsbook/` } },
    URL,
    Map,
    Promise,
    Date,
    console,
  };
  sandbox.window.window = sandbox.window;
  sandbox.self = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT, sandbox);
  return { sandbox, calls, fetch: sandbox.window.fetch, api: sandbox.window.__tmrBoardDedupe };
}

(async () => {
  // ---- 1. Canonicalization ------------------------------------------------
  console.log('URL canonicalization');
  {
    const { api } = install();
    const noLimit = api.canonicalize(`${API}/games/board/baseball_mlb`);
    check('a board URL is recognized', typeof noLimit === 'string' && noLimit.indexOf('/games/board/baseball_mlb') !== -1,
      String(noLimit));

    // The four limits the live call sites actually send.
    for (const limit of [40, 60, 80, 1]) {
      check(`?limit=${limit} canonicalizes to the same URL as no limit`,
        api.canonicalize(`${API}/games/board/baseball_mlb?limit=${limit}`) === noLimit);
    }

    check('a trailing slash is treated as the same board',
      api.canonicalize(`${API}/games/board/baseball_mlb/?limit=80`) !== null);

    // Negative controls: anything that is not a plain board read must be
    // invisible to the wrapper.
    check('the per-game props sub-route is NOT a board read',
      api.canonicalize(`${API}/games/board/baseball_mlb/props/g_1?fields=ui`) === null);
    check('an unrelated endpoint is NOT a board read',
      api.canonicalize(`${API}/picks/pending`) === null);
    check('a lookalike path is NOT a board read',
      api.canonicalize(`${API}/games/boardgames/baseball_mlb`) === null);

    // A query parameter that is not `limit` still distinguishes two boards.
    check('a non-limit query parameter is preserved',
      api.canonicalize(`${API}/games/board/baseball_mlb?fields=full`)
      !== api.canonicalize(`${API}/games/board/baseball_mlb`));
    check('query parameter order does not create two keys',
      api.canonicalize(`${API}/games/board/soccer?a=1&b=2`)
      === api.canonicalize(`${API}/games/board/soccer?b=2&a=1`));
  }

  // ---- 2. Concurrent callers share one request ---------------------------
  console.log('Concurrent callers share one network request');
  {
    const deferred = [];
    const { fetch, calls } = install({ deferred });

    // Exactly the shape the live page produces: three call sites, three
    // different limits, all firing at once.
    const a = fetch(`${API}/games/board/baseball_mlb`);
    const b = fetch(`${API}/games/board/baseball_mlb?limit=60`, { cache: 'no-store' });
    const c = fetch(`${API}/games/board/baseball_mlb?limit=80`, { cache: 'no-store' });

    check('three concurrent board calls produce ONE network request',
      calls.length === 1, `${calls.length} request(s): ${calls.map((x) => x.url).join(' | ')}`);
    check('the request that goes out carries no limit parameter',
      calls[0].url.indexOf('limit') === -1, calls[0].url);

    deferred.forEach((fn) => fn());
    const [ra, rb, rc] = await Promise.all([a, b, c]);
    check('every caller is served the same underlying response',
      ra.marker === rb.marker && rb.marker === rc.marker,
      `${ra.marker} / ${rb.marker} / ${rc.marker}`);
    check('each caller gets its own Response object to read',
      ra !== rb && rb !== rc && ra !== rc);
  }

  // ---- 3. The short memo covers callers that arrive just after -----------
  console.log('The memo serves callers that arrive after the request settles');
  {
    const { fetch, calls, api } = install();
    const first = await fetch(`${API}/games/board/americanfootball_nfl`);
    const second = await fetch(`${API}/games/board/americanfootball_nfl?limit=80`);
    check('a follow-up call inside the memo window makes no new request',
      calls.length === 1, `${calls.length} request(s)`);
    check('the memoised caller gets the same response',
      first.marker === second.marker, `${first.marker} vs ${second.marker}`);
    check('memo window is shorter than the 30s server-side board cycle',
      api.memoMs < 30000, `memoMs=${api.memoMs}`);

    api.reset();
    await fetch(`${API}/games/board/americanfootball_nfl`);
    check('after a reset the next call goes to the network', calls.length === 2,
      `${calls.length} request(s)`);
  }

  // ---- 3b. Duplicated reads share one in-flight request ------------------
  // TMR_READ_COALESCE_20260911. The page issued /api/picks three times and
  // /api/auth/me twice in one load. These share while open, and only while open.
  console.log('Duplicated reads are coalesced in flight, never memoised');
  {
    const deferred = [];
    const { fetch, calls } = install({ deferred });
    const a = fetch(`${API}/picks`);
    const b = fetch(`${API}/picks`);
    const c = fetch(`${API}/auth/me`);
    const d = fetch(`${API}/auth/me`);
    check('two concurrent /picks and two /auth/me make TWO requests',
      calls.length === 2, `${calls.length}: ${calls.map((x) => x.url).join(' | ')}`);
    deferred.forEach((fn) => fn());
    const [ra, rb, rc, rd] = await Promise.all([a, b, c, d]);
    check('both /picks callers share one response', ra.marker === rb.marker);
    check('both /auth/me callers share one response', rc.marker === rd.marker);
    check('/picks and /auth/me are not confused for each other', ra.marker !== rc.marker);
    check('each caller still gets its own Response object', ra !== rb && rc !== rd);

    // The critical difference from the board: no memo. Once the first call has
    // settled, the next one must go to the network, because this data is user
    // state that a POST elsewhere on the page can invalidate at any moment.
    const later = fetch(`${API}/picks`);
    deferred.forEach((fn) => fn());
    await later;
    check('a LATER /picks call is not served from a memo', calls.length === 3,
      `${calls.length} request(s)`);
  }
  {
    const { fetch, calls } = install();
    // A path that merely contains an allowlisted word must not match.
    await Promise.all([fetch(`${API}/picks/pending`), fetch(`${API}/picks/pending`)]);
    check('a non-allowlisted read is never coalesced', calls.length === 2,
      `${calls.length} request(s)`);
    await Promise.all([fetch(`${API}/auth/me/sessions`), fetch(`${API}/auth/me/sessions`)]);
    check('a deeper path under an allowlisted one is not coalesced', calls.length === 4,
      `${calls.length} request(s)`);
    await Promise.all([fetch(`${API}/picks`, { method: 'POST', body: '{}' }), fetch(`${API}/picks`, { method: 'POST', body: '{}' })]);
    check('a POST to an allowlisted path is never coalesced', calls.length === 6,
      `${calls.length} request(s)`);
  }

  // ---- 4. Negative controls: everything else is untouched ----------------
  console.log('Non-board traffic is passed straight through');
  {
    const { fetch, calls } = install();
    await fetch(`${API}/picks/pending`);
    await fetch(`${API}/picks/pending`);
    check('an unrelated GET is never deduped', calls.length === 2, `${calls.length} request(s)`);

    await fetch(`${API}/games/board/baseball_mlb`, { method: 'POST', body: '{}' });
    await fetch(`${API}/games/board/baseball_mlb`, { method: 'POST', body: '{}' });
    check('a board POST is never deduped', calls.length === 4, `${calls.length} request(s)`);

    await fetch(`${API}/games/board/baseball_mlb/props/g_1?fields=ui`);
    await fetch(`${API}/games/board/baseball_mlb/props/g_1?fields=ui`);
    check('the per-game props sub-route is never deduped', calls.length === 6,
      `${calls.length} request(s)`);
  }

  // ---- 5. Failures and error statuses stay retryable ---------------------
  console.log('A failure is never cached');
  {
    const { fetch, calls } = install({ fail: true });
    await assert.rejects(() => fetch(`${API}/games/board/baseball_mlb`));
    await assert.rejects(() => fetch(`${API}/games/board/baseball_mlb`));
    check('a rejected board fetch is retried, not memoised', calls.length === 2,
      `${calls.length} request(s)`);
  }
  {
    const { fetch, calls } = install({ ok: false });
    const bad = await fetch(`${API}/games/board/baseball_mlb`);
    check('an error response is still returned to the caller', bad.status === 500);
    await fetch(`${API}/games/board/baseball_mlb`);
    check('an error response is not memoised', calls.length === 2, `${calls.length} request(s)`);
  }

  // ---- 6. Different sports never share a response ------------------------
  console.log('Different boards stay separate');
  {
    const { fetch, calls } = install();
    const mlb = await fetch(`${API}/games/board/baseball_mlb`);
    const nfl = await fetch(`${API}/games/board/americanfootball_nfl`);
    check('two sports make two requests', calls.length === 2, `${calls.length} request(s)`);
    check('two sports get different responses', mlb.marker !== nfl.marker,
      `${mlb.marker} vs ${nfl.marker}`);
  }

  // ---- 7. Installing twice must not double-wrap --------------------------
  console.log('The wrapper installs exactly once');
  {
    const { sandbox, calls, api } = install();
    const wrapped = sandbox.window.fetch;
    vm.runInContext(SCRIPT, sandbox);
    check('a second load leaves the existing wrapper in place',
      sandbox.window.fetch === wrapped);
    await sandbox.window.fetch(`${API}/games/board/baseball_mlb`);
    check('and the wrapper still works', calls.length === 1 && api.stats().memo === 1,
      `${calls.length} request(s)`);
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll board-dedupe checks passed');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
