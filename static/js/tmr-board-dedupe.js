/* TMR_BOARD_DEDUPE_20260911 (Nima).
 *
 * The sportsbook asks the backend for the same market board several times on a
 * single page load. Measured on the live page 2026-09-11:
 * /api/games/board/baseball_mlb was requested THREE times concurrently about
 * 700ms in, and the board is ~2.6MB of JSON. First contentful paint was 8.5s,
 * load 9.8s, and /api/health issued in the same window took 7.1s -- the origin
 * was saturated serializing the same board three times over.
 *
 * There is no single board client to fix. The URL is built in nine different
 * places (sportsbook/index.html at several call sites, sportsbook-next.js,
 * sportsbook-default-board.js and backend-api.js), and several of them pass
 * cache: 'no-store'. So the dedupe goes where every one of them meets: fetch.
 *
 * This wraps window.fetch and changes behaviour for GET /api/games/board/...
 * and nothing else. Every other request, including every board POST and every
 * non-board URL, is handed to the native fetch untouched.
 *
 * Two things happen to a board GET:
 *
 *   1. The `limit` query parameter is dropped. The board route ignores it --
 *      verified 2026-09-11, ?limit=1 and ?limit=80 returned a byte-identical
 *      games array of 21 games -- while the call sites disagree about it
 *      (no limit, limit=40, limit=60, limit=80). Dropping it is what makes
 *      those calls one URL instead of four. backend tests/board-limit-ignored-test.js
 *      pins that contract so this stays true.
 *
 *   2. Identical canonical URLs share one network request: an in-flight map
 *      collapses concurrent callers onto one promise, and a short memo serves
 *      callers that arrive just after it settles. The board itself is rebuilt
 *      server side on a 30s cycle, so a 15s memo cannot serve a caller anything
 *      the origin would not have served it anyway.
 *
 * Every caller gets its own Response via .clone(), so each one can read the
 * body independently. A failed fetch is never memoised, and the in-flight entry
 * is cleared in both directions, so an outage recovers on the next call.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  if (window.__tmrBoardDedupe) return;

  var MEMO_MS = 15000;
  var nativeFetch = window.fetch.bind(window);
  var inFlight = new Map();
  var memo = new Map();

  /* TMR_READ_COALESCE_20260911 (Nima). The board is not the only endpoint this
   * page asks for more than once.
   *
   * Measured on the live page 2026-09-11, after the board itself was fixed: one
   * load issued 23 API calls, among them /api/picks three times and
   * /api/auth/me twice. Fetched one at a time the origin answers each of these
   * in 0.26s; issued together in the page's opening burst they took 4 to 9
   * seconds, because it is a single Node process and the burst is what saturates
   * it. Cutting the burst down is therefore worth more than it looks.
   *
   * These get IN-FLIGHT coalescing only, never a memo: if two identical GETs are
   * genuinely open at the same moment, one answer is the right answer for both,
   * and the moment the first settles the next call goes to the network as
   * normal. Nothing is ever served from a previous request.
   *
   * It is an allowlist rather than a blanket rule over /api/, and each entry was
   * read server side before being added. GET /api/picks is a pure read
   * (routes/picks.js). GET /api/auth/me is a read plus an idempotent
   * ADD COLUMN IF NOT EXISTS (routes/auth.js). The avatar, metrics and health
   * endpoints are reads. Anything not listed here keeps its own request, which
   * is the safe default for an endpoint whose GET might not be pure. */
  var COALESCE_READS = [
    /\/api\/picks$/,
    /\/api\/auth\/me$/,
    /\/api\/health$/,
    /\/api\/users\/[^/]+\/avatar$/,
    /\/api\/users\/[^/]+\/metrics$/,
  ];

  function coalesceableRead(url) {
    if (!url) return null;
    var parsed;
    try {
      parsed = new URL(url, window.location.href);
    } catch (e) {
      return null;
    }
    for (var i = 0; i < COALESCE_READS.length; i += 1) {
      if (COALESCE_READS[i].test(parsed.pathname)) {
        parsed.searchParams.sort();
        return parsed.toString();
      }
    }
    return null;
  }

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    if (input && typeof input.toString === 'function') return String(input);
    return '';
  }

  function requestMethod(input, init) {
    var m = (init && init.method) || (input && input.method) || 'GET';
    return String(m).toUpperCase();
  }

  /* Board GETs only. Anything that is not an unambiguous read of
   * /api/games/board/<sportKey> is left completely alone. */
  function boardTarget(url) {
    if (!url || url.indexOf('/games/board/') === -1) return null;
    var parsed;
    try {
      parsed = new URL(url, window.location.href);
    } catch (e) {
      return null;
    }
    if (!/\/games\/board\/[^/]+\/?$/.test(parsed.pathname)) return null;
    // Not a board read: the per-game props sub-route lives under the same
    // prefix and must keep its own identity.
    parsed.searchParams.delete('limit');
    parsed.searchParams.sort();
    return parsed.toString();
  }

  /* The init the shared request actually goes out with. Two deliberate
   * differences from the caller's own init:
   *
   *   - `signal` is dropped. Callers share one network request now, so honoring
   *     one caller's AbortController would cancel the board for all of them.
   *   - a Request object's headers are lifted out, because the shared request
   *     is issued from the canonical URL string and would otherwise lose them.
   *
   * Everything else the first caller asked for is passed through untouched. */
  function sharedInit(input, init) {
    var out = {};
    var src = init || (input && typeof input === 'object' && typeof input.url === 'string' ? input : null);
    if (src) {
      ['headers', 'credentials', 'mode', 'cache', 'redirect', 'referrer', 'referrerPolicy', 'integrity', 'keepalive'].forEach(function (k) {
        if (src[k] !== undefined && src[k] !== null) out[k] = src[k];
      });
    }
    return out;
  }

  /* Board data is public, but keying the memo by the Authorization header keeps
   * a signed-in and a signed-out caller from ever sharing one cached Response
   * if that stops being true. */
  function authTag(init) {
    try {
      var h = init && init.headers;
      if (!h) return '';
      var v = typeof h.get === 'function' ? h.get('Authorization') : (h.Authorization || h.authorization);
      return v ? '|' + String(v).slice(-24) : '';
    } catch (e) {
      return '';
    }
  }

  function fromMemo(key) {
    var hit = memo.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > MEMO_MS) {
      memo.delete(key);
      return null;
    }
    return hit.response;
  }

  window.fetch = function (input, init) {
    var method = requestMethod(input, init);
    if (method !== 'GET') return nativeFetch(input, init);

    var raw = requestUrl(input);
    var url = boardTarget(raw);
    if (!url) {
      /* TMR_READ_COALESCE_20260911. Not the board, but possibly one of the
       * duplicated reads above. Same in-flight sharing, no memo. */
      var readUrl = coalesceableRead(raw);
      if (!readUrl) return nativeFetch(input, init);
      var readInit = sharedInit(input, init);
      var readKey = readUrl + authTag(readInit);
      var openRead = inFlight.get(readKey);
      if (!openRead) {
        openRead = nativeFetch(readUrl, readInit).then(function (response) {
          inFlight.delete(readKey);
          return response;
        }, function (error) {
          inFlight.delete(readKey);
          throw error;
        });
        inFlight.set(readKey, openRead);
      }
      return openRead.then(function (response) { return response.clone(); });
    }
    var shared = sharedInit(input, init);
    var key = url + authTag(shared);

    var memoed = fromMemo(key);
    if (memoed) return Promise.resolve(memoed.clone());

    var pending = inFlight.get(key);
    if (!pending) {
      // The canonical URL is what actually goes on the wire, so the browser and
      // any CDN in front of it also see one request rather than four.
      pending = nativeFetch(url, shared).then(function (response) {
        inFlight.delete(key);
        // Only a usable response is worth reusing. An error status must be
        // retryable immediately by whichever caller cares.
        if (response && response.ok) {
          memo.set(key, { at: Date.now(), response: response.clone() });
        }
        return response;
      }, function (error) {
        inFlight.delete(key);
        throw error;
      });
      inFlight.set(key, pending);
    }

    return pending.then(function (response) {
      return response.clone();
    });
  };

  window.__tmrBoardDedupe = {
    memoMs: MEMO_MS,
    canonicalize: boardTarget,
    stats: function () {
      return { inFlight: inFlight.size, memo: memo.size };
    },
    reset: function () {
      inFlight.clear();
      memo.clear();
    },
  };
})();
