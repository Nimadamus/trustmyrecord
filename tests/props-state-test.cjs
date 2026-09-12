/* PROPS_STATE_20260912. Every state the player-props panel can reach.
 *
 * This exists because the browser could not prove it. Driving the panel with a
 * stubbed fetch never intercepted the request, so three of the eight outcomes
 * had no evidence at all, and "remove the inline props and find out" is not a
 * test. TMRPropsState is pure, so every state is covered here deterministically
 * and cannot flake.
 *
 * The rules under test, in the order they were given:
 *   1. No mysterious blank panel      -> every outcome yields a state and a
 *                                        message (or renders prices).
 *   2. No generic 500 for an expected cache state -> board_not_cached and
 *                                        board_cache_expired are retriable
 *                                        board states, never server faults.
 *   3. A retriable state retries as designed, never loops -> shouldFetch()
 *                                        allows exactly one automatic attempt
 *                                        and caps manual ones.
 *   4. A legitimate no-props state says so, and does not imply breakage.
 *   5. A true server fault shows a clear recoverable error.
 *   6. Never silently fall back to stale inline props -> no state carries
 *                                        items unless the endpoint returned
 *                                        them under status ok.
 */
'use strict';
const assert = require('assert');
const S = require('../static/js/props-state.js');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label + (detail ? '\n        ' + detail : '')); }
}
const ITEMS = [{ selection: 'Player Over', odds: -110, line: 1.5 }];
const ok = body => ({ ok: true, httpStatus: 200, body: body });
const body = status => ({ status: status, group: null, retryable: status === 'board_not_cached' || status === 'board_cache_expired', warm_with: '/api/games/board/baseball_mlb' });

console.log('The eight outcomes');

// --- 1. ok ---------------------------------------------------------------
{
  const v = S.classify(ok({ status: 'ok', group: { label: 'Player Props', items: ITEMS } }), ITEMS);
  check('ok -> state ok, no message, no retry', v.state === 'ok' && v.message === null && v.retryable === false);
}

// --- 2. board_not_cached -------------------------------------------------
{
  const v = S.classify(ok(body('board_not_cached')), null);
  check('board_not_cached -> retriable error, not a fault',
    v.state === 'error' && v.retryable === true && v.reason === 'board_not_cached');
  check('board_not_cached -> message invites a retry and blames nothing',
    v.message === S.MESSAGES.warming && !/error|fail|broke|500/i.test(v.message), v.message);
  check('board_not_cached -> carries warm_with so the caller can warm the board',
    v.warmWith === '/api/games/board/baseball_mlb');
}

// --- 3. board_cache_expired ----------------------------------------------
{
  const v = S.classify(ok(body('board_cache_expired')), null);
  check('board_cache_expired -> same retriable board state',
    v.state === 'error' && v.retryable === true && v.reason === 'board_cache_expired'
    && v.message === S.MESSAGES.warming);
}

// --- 4. game_not_on_board ------------------------------------------------
{
  const v = S.classify(ok(body('game_not_on_board')), null);
  check('game_not_on_board -> terminal, NOT retriable',
    v.state === 'error' && v.retryable === false && v.reason === 'game_not_on_board');
  check('game_not_on_board -> tells the user to refresh, does not claim a fault',
    /refresh/i.test(v.message) && !/error|fail/i.test(v.message), v.message);
}

// --- 5. game_already_started ---------------------------------------------
{
  const v = S.classify(ok(body('game_already_started')), null);
  check('game_already_started -> terminal, NOT retriable',
    v.state === 'error' && v.retryable === false && v.reason === 'game_already_started');
  check('game_already_started -> says the game started and props are closed',
    /started/i.test(v.message) && /closed/i.test(v.message), v.message);
}

// --- 6. no_props_for_game ------------------------------------------------
{
  const v = S.classify(ok(body('no_props_for_game')), null);
  check('no_props_for_game -> empty, not error',
    v.state === 'empty' && v.retryable === false && v.reason === 'no_props_for_game');
  check('no_props_for_game -> says there are no props, implies nothing broken',
    v.message === S.MESSAGES.none && !/error|fail|unavailable|problem|try again/i.test(v.message), v.message);
}

// --- 7. network timeout --------------------------------------------------
{
  const t = S.classify({ timedOut: true }, null);
  check('timeout -> recoverable error with a retry',
    t.state === 'error' && t.retryable === true && t.reason === 'timeout');
  const n = S.classify({ networkError: true }, null);
  check('network failure -> recoverable error with a retry',
    n.state === 'error' && n.retryable === true && n.reason === 'network');
  check('both mention the connection rather than the sportsbook',
    /connection/i.test(t.message) && t.message === n.message, t.message);
}

// --- 8. true server 5xx --------------------------------------------------
{
  const v = S.classify({ ok: false, httpStatus: 500, body: null }, null);
  check('HTTP 500 -> recoverable error with a retry',
    v.state === 'error' && v.retryable === true && v.reason === 'server_error' && v.httpStatus === 500);
  const v503 = S.classify({ ok: false, httpStatus: 503, body: { status: 'ok' } }, ITEMS);
  check('a 5xx wins even if the body claims ok (a proxy page cannot fake a board state)',
    v503.state === 'error' && v503.reason === 'server_error');
}

console.log('\nEdges that must not blank the panel (rule 1)');
{
  const cases = [
    ['200 with unparseable body', { ok: true, httpStatus: 200, body: null }, 'bad_body'],
    ['200 with a string body', { ok: true, httpStatus: 200, body: 'nope' }, 'bad_body'],
    ['404 that happens to parse', { ok: false, httpStatus: 404, body: { status: 'ok' } }, 'http_404'],
    ['a status this client has never heard of', ok({ status: 'quantum_flux' }), 'unknown_status'],
    ['no outcome at all', undefined, 'bad_body'],
    ['ok but every item filtered out', ok({ status: 'ok', group: { items: [] } }), 'filtered_empty']
  ];
  for (const [label, outcome, reason] of cases) {
    const v = S.classify(outcome, reason === 'filtered_empty' ? [] : null);
    check(label + ' -> ' + reason + ', with a message',
      v.reason === reason && typeof v.message === 'string' && v.message.length > 0
      && (v.state === 'error' || v.state === 'empty'),
      JSON.stringify(v));
  }
  check('an unknown status fails CLOSED to recoverable, never to ok',
    S.classify(ok({ status: 'quantum_flux' }), ITEMS).state === 'error');
  check('filtered-empty is empty, not an error (rule 4)',
    S.classify(ok({ status: 'ok', group: { items: [] } }), []).state === 'empty');
}

console.log('\nRule 2: no expected cache state is ever a server fault');
{
  for (const st of ['board_not_cached', 'board_cache_expired', 'game_not_on_board', 'game_already_started', 'no_props_for_game']) {
    const v = S.classify(ok(body(st)), null);
    check(st + ' does not report a server error', v.reason !== 'server_error' && v.httpStatus === undefined);
  }
}

console.log('\nRule 6: no state smuggles items through');
{
  const notOk = ['board_not_cached', 'game_not_on_board', 'game_already_started', 'no_props_for_game'];
  for (const st of notOk) {
    // Even when the caller hands over items (which a stale board could), a
    // non-ok status must not become a rendering state.
    const v = S.classify(ok(body(st)), ITEMS);
    check(st + ' with items present still does not render', v.state !== 'ok');
  }
  check('only status ok with items yields a rendering state',
    S.classify(ok({ status: 'ok', group: { items: ITEMS } }), ITEMS).state === 'ok');
}

console.log('\nRule 3: retry is bounded');
{
  check('never asked -> one automatic attempt allowed', S.shouldFetch(undefined, false) === true);
  check('loading -> no second attempt (this is what stops render() refetching)',
    S.shouldFetch({ state: 'loading', attempts: 1 }, false) === false
    && S.shouldFetch({ state: 'loading', attempts: 1 }, true) === false);
  check('ok -> never refetched', S.shouldFetch({ state: 'ok', attempts: 1 }, true) === false);
  check('empty -> never refetched', S.shouldFetch({ state: 'empty', attempts: 1 }, true) === false);
  check('retriable error -> NOT refetched automatically',
    S.shouldFetch({ state: 'error', retryable: true, attempts: 1 }, false) === false);
  check('retriable error -> refetched only when the user asks',
    S.shouldFetch({ state: 'error', retryable: true, attempts: 1 }, true) === true);
  check('non-retriable error -> never refetched, manual or not',
    S.shouldFetch({ state: 'error', retryable: false, attempts: 1 }, true) === false);

  // The cap.
  let entry = { state: 'error', retryable: true, attempts: 1 };
  let allowed = 0;
  for (let i = 0; i < 50; i++) {
    if (!S.shouldFetch(entry, true)) break;
    allowed += 1;
    entry = { state: 'error', retryable: true, attempts: entry.attempts + 1 };
  }
  check('manual retries stop at the cap instead of looping for ever (allowed ' + allowed + ')',
    allowed === S.MAX_ATTEMPTS - 1 && S.shouldFetch(entry, true) === false,
    'MAX_ATTEMPTS=' + S.MAX_ATTEMPTS + ' final attempts=' + entry.attempts);
  check('at the cap the user is told to refresh and the retry control goes away',
    (() => { const v = S.exhaustedView(entry); return v.state === 'error' && v.retryable === false && /refresh/i.test(v.message); })());
}

console.log('\nThe loading row');
{
  const withCount = S.loadingView(402);
  const without = S.loadingView(0);
  check('loading is its own state, offers no retry, and is not terminal',
    withCount.state === 'loading' && withCount.retryable === false);
  check('loading names how many prices are coming when the board said so',
    /402/.test(withCount.message), withCount.message);
  check('loading works with no count', /Loading player props/.test(without.message) && !/\(/.test(without.message));
  check('a fresh loading entry is not refetched', S.shouldFetch({ state: 'loading', attempts: 1 }, false) === false);
}

console.log('\nEvery message is plain English with no internals');
{
  const all = Object.keys(S.MESSAGES).map(k => S.MESSAGES[k])
    .concat([S.loadingView(5).message, S.exhaustedView({ attempts: 4 }).message]);
  for (const m of all) {
    check('message is user-facing: ' + JSON.stringify(m.slice(0, 44)),
      !/board_not_cached|board_cache_expired|game_not_on_board|game_already_started|no_props_for_game|undefined|null|\bHTTP\b|\b5\d\d\b|cache|endpoint|\bAPI\b/i.test(m), m);
  }
}

/* The panel's rendering, from the same function the panel calls.
 * This is the component-level half: for every outcome, what markup does the
 * Player Props panel actually put on the page? */
console.log('\nPanel rendering, per state');
{
  const GID = 'an_baseball_mlb_294929';
  const cases = [
    ['ok', S.classify(ok({ status: 'ok', group: { items: ITEMS } }), ITEMS), false],
    ['loading', S.loadingView(402), false],
    ['board_not_cached', S.classify(ok(body('board_not_cached')), null), true],
    ['board_cache_expired', S.classify(ok(body('board_cache_expired')), null), true],
    ['no_props_for_game', S.classify(ok(body('no_props_for_game')), null), false],
    ['game_already_started', S.classify(ok(body('game_already_started')), null), false],
    ['game_not_on_board', S.classify(ok(body('game_not_on_board')), null), false],
    ['timeout', S.classify({ timedOut: true }, null), true],
    ['network', S.classify({ networkError: true }, null), true],
    ['http 500', S.classify({ ok: false, httpStatus: 500, body: null }, null), true],
    ['bad body', S.classify({ ok: true, httpStatus: 200, body: null }, null), true],
    ['unknown status', S.classify(ok({ status: 'quantum_flux' }), null), true],
    ['attempts exhausted', S.exhaustedView({ attempts: S.MAX_ATTEMPTS }), false],
    ['no view at all', null, true]
  ];
  for (const [label, v, wantRetry] of cases) {
    const html = S.noteHtml(v, GID);
    const hasRetry = html.indexOf('data-propretry') !== -1;
    check(label + ' -> markup is never blank', html.length > 30 && html.indexOf('sbn-note') !== -1);
    check(label + ' -> Try again control ' + (wantRetry ? 'present' : 'absent'),
      hasRetry === wantRetry, html.slice(0, 120));
    if (v && v.message) {
      check(label + ' -> shows its own message', html.indexOf(v.message) !== -1);
    }
    check(label + ' -> leaks no internals into the page',
      !/board_not_cached|board_cache_expired|game_not_on_board|game_already_started|no_props_for_game|quantum_flux|httpStatus|500|undefined/.test(html),
      html.slice(0, 120));
    if (hasRetry) {
      check(label + ' -> the retry control names this game', html.indexOf(GID) !== -1);
    }
  }
  check('ok is the only state that renders prices instead of a note',
    cases.filter(c => c[1] && c[1].state === 'ok').length === 1);
  check('the game id is escaped into the retry control',
    S.noteHtml(S.classify({ timedOut: true }, null), 'a"b<c').indexOf('a&quot;b&lt;c') !== -1);
}

if (failures > 0) {
  console.error('\nprops-state-test: ' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nprops-state-test: all checks passed');
