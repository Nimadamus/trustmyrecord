/* PROPS_STATE_20260912. The player-props load state machine, on its own.
 *
 * Why it is a separate file: the panel's behaviour when the per-game props
 * endpoint answers something other than "here are the prices" could not be
 * proven. Driving those states through a live browser was unreliable -- a
 * stubbed fetch never intercepted, so three of the eight states had no
 * evidence at all. This module is the whole decision, it is pure, and it runs
 * identically in Node and in the browser, so every state is covered by a test
 * that cannot flake.
 *
 * It knows nothing about the DOM, nothing about fetch, and nothing about the
 * board. It maps one HTTP outcome to one state, and one state to the exact
 * words the user reads.
 *
 * The endpoint's contract (routes/games.js, BOARD_PROPS_MISS_CONTRACT_20260911)
 * is HTTP 200 for every ordinary outcome, carrying the reason in `status`, and
 * non-2xx only for a genuine fault. This module is the client half of that.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) { module.exports = api; }
    if (root) { root.TMRPropsState = api; }
}(typeof self !== 'undefined' ? self : null, function () {
    'use strict';

    // Four states, and nothing else can reach the panel.
    //   'loading'  spinner row, no retry offered, not terminal
    //   'ok'       prices render
    //   'empty'    this game genuinely has no props. Terminal. NOT an error.
    //   'error'    everything else. Terminal until the user retries.
    // `retryable` decides whether a Try again control is drawn. It is a
    // property of the state, never of the caller's mood.
    var MESSAGES = {
        // Expected cache states. The board request is what warms the cache and
        // the page already makes it, so a retry here does real work.
        warming: 'Player props are still loading. Try again.',
        // The card is older than the board. Retrying cannot fix that; a refresh
        // can. Deliberately does not say anything is broken.
        offBoard: 'This game is no longer on the open board. Refresh to see the current slate.',
        started: 'This game has already started, so its props are closed.',
        // A real, non-expected fault. Recoverable, and says so.
        fault: 'Player props could not be loaded just now. Try again.',
        offline: 'Player props could not be loaded. Check your connection and try again.',
        // Not a fault at all.
        none: 'No player props are posted for this game.'
    };

    // How many times a single game may be fetched before the panel stops
    // asking. Guards rule 3: a retriable state must retry as designed and never
    // loop. One automatic attempt when the panel opens, then only user-driven
    // attempts, and those stop too.
    var MAX_ATTEMPTS = 4;

    function view(state, message, retryable, extra) {
        var out = { state: state, message: message || null, retryable: !!retryable };
        if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k]; } }
        return out;
    }

    /* The whole mapping. `outcome` describes what came back:
     *   { networkError: true }            fetch rejected (offline, DNS, abort)
     *   { timedOut: true }                client gave up waiting
     *   { httpStatus: 500 }               a real server fault
     *   { httpStatus: 200, body: {...} }  the endpoint answered
     *   { httpStatus: 200, body: null }   200 with a body that would not parse
     * `items` is whatever survived the caller's own normalize/filter pipeline,
     * which is why "200 ok with zero usable items" is an `empty`, not an `ok`
     * with nothing in it. */
    function classify(outcome, items) {
        outcome = outcome || {};

        if (outcome.timedOut) { return view('error', MESSAGES.offline, true, { reason: 'timeout' }); }
        if (outcome.networkError) { return view('error', MESSAGES.offline, true, { reason: 'network' }); }

        var http = Number(outcome.httpStatus);
        if (isFinite(http) && http >= 500) {
            return view('error', MESSAGES.fault, true, { reason: 'server_error', httpStatus: http });
        }

        var body = outcome.body;
        if (!body || typeof body !== 'object') {
            // Includes a 200 whose body was not JSON. Never surface the raw
            // text: it could be an HTML error page from anything in the path.
            return view('error', MESSAGES.fault, true, { reason: 'bad_body', httpStatus: isFinite(http) ? http : null });
        }

        // A non-2xx that still parsed is not part of the contract. Treated as a
        // fault rather than trusted, so a proxy's JSON error page cannot
        // masquerade as a board state.
        if (isFinite(http) && http >= 400) {
            return view('error', MESSAGES.fault, true, { reason: 'http_' + http, httpStatus: http });
        }

        switch (body.status) {
        case 'ok':
            if (!items || !items.length) {
                // The endpoint had rows but none survived the pickability and
                // odds filters. Nothing to retry and nothing wrong.
                return view('empty', MESSAGES.none, false, { reason: 'filtered_empty' });
            }
            return view('ok', null, false, { reason: 'ok' });

        case 'no_props_for_game':
            return view('empty', MESSAGES.none, false, { reason: 'no_props_for_game' });

        case 'board_not_cached':
        case 'board_cache_expired':
            // The only genuinely retriable board states. `warm_with` names the
            // board URL; the caller re-requests the board it already loads.
            return view('error', MESSAGES.warming, true, {
                reason: body.status,
                warmWith: typeof body.warm_with === 'string' ? body.warm_with : null
            });

        case 'game_already_started':
            return view('error', MESSAGES.started, false, { reason: 'game_already_started' });

        case 'game_not_on_board':
            return view('error', MESSAGES.offBoard, false, { reason: 'game_not_on_board' });

        default:
            // An unknown status from a newer server. Fail closed to a
            // recoverable error rather than guessing, and never blank.
            return view('error', MESSAGES.fault, true, { reason: 'unknown_status' });
        }
    }

    /* Whether another fetch is allowed for this game. `entry` is the caller's
     * stored state for one game, or undefined when it has never been asked for.
     *   never asked            -> yes, this is the one automatic attempt
     *   loading / ok / empty   -> no. Nothing to gain, and 'loading' is what
     *                             stops render() from refetching on every pass.
     *   error, under the cap   -> only when the user asked (manual)
     *   error, at the cap      -> no, ever
     * This is the function that makes rule 3 true rather than hoped for. */
    function shouldFetch(entry, manual) {
        if (!entry) { return true; }
        if (entry.state === 'loading' || entry.state === 'ok' || entry.state === 'empty') { return false; }
        if (!entry.retryable) { return false; }
        if (!manual) { return false; }
        return (entry.attempts || 0) < MAX_ATTEMPTS;
    }

    // The message to show once a game has burned its attempts. Says what to do,
    // and stops offering a control that would do nothing.
    function exhaustedView(entry) {
        return view('error', 'Player props are not loading right now. Refresh the page to try again.', false, {
            reason: 'attempts_exhausted',
            attempts: (entry && entry.attempts) || MAX_ATTEMPTS
        });
    }

    /* The panel's entire rendering decision, so the thing that draws the row
     * and the thing that is tested are the same code. `escape` is the caller's
     * own escaper (the panel already has one); a default is provided so a test
     * needs no DOM.
     *
     * Contract, asserted in tests/props-state-test.cjs:
     *   - always returns non-empty markup, so rule 1 cannot be violated
     *   - shows the state's message verbatim
     *   - draws the Try again control if and only if view.retryable
     *   - never emits a status code, an HTTP number or an internal reason
     */
    function noteHtml(viewObj, gameId, escape) {
        var esc = escape || function (x) {
            return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        };
        var v = viewObj || view('error', MESSAGES.fault, true, { reason: 'no_view' });
        var msg = v.message || MESSAGES.fault;
        return '<div class="sbn-note" aria-live="polite">' + esc(msg)
            + (v.retryable
                ? ' <button type="button" class="sbn-expclose" data-propretry="' + esc(gameId) + '">Try again</button>'
                : '')
            + '</div>';
    }

    return {
        MESSAGES: MESSAGES,
        noteHtml: noteHtml,
        MAX_ATTEMPTS: MAX_ATTEMPTS,
        classify: classify,
        shouldFetch: shouldFetch,
        exhaustedView: exhaustedView,
        loadingView: function (waiting) {
            return view('loading', waiting > 0
                ? 'Loading player props (' + waiting.toLocaleString() + ' prices)…'
                : 'Loading player props…', false, { reason: 'loading' });
        }
    };
}));
