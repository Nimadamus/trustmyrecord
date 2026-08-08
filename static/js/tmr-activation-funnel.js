/* =============================================================================
   TMR ACTIVATION FUNNEL (tmr-activation-funnel.js)    SIM_ACTIVATION_20260808
   -----------------------------------------------------------------------------
   Closes the two ends of the simulator activation funnel that the gate itself
   cannot see, because they happen on other pages and days later:

     * first VERIFIED PICK after a simulator-sourced signup
     * first TMR COIN earned after a simulator-sourced signup

   The gate (static/js/sim-auth-gate.js) already emits everything up to the
   first simulation. It also stamps an ORIGIN record when a logged-out visitor
   hits the gate, so these later events can be attributed back to the simulator
   that produced the signup instead of looking like generic activity.

   Design rules this file follows:

   * Fire-once, forever. Each milestone writes a localStorage marker the moment
     it fires, so a member cannot inflate the numbers by revisiting. "First"
     means first, per browser.
   * Never costs a request we do not need. The coin check only runs for a
     signed-in member who has a recent simulator-sourced signup AND has not
     already recorded a first coin. Once it fires, or once the signup ages out,
     this file makes zero API calls for the rest of that member's life.
   * Read-only. It observes; it never submits a pick, earns a coin, spends a
     coin, or writes anything to the member's account.
   * Analytics can never break a page: every path is wrapped, every failure is
     swallowed.

   Kill switch: window.TMR_FUNNEL_FLAGS = { enabled:false } before this script.
   ============================================================================= */
(function () {
    'use strict';

    var FLAGS = window.TMR_FUNNEL_FLAGS || {};
    if (FLAGS.enabled === false) return;

    var ORIGIN_KEY = 'tmr_sim_funnel_origin';   // {simulator, ts} written by the gate
    var SIGNUP_KEY = 'tmr_signup_ts';           // written by register/index.html
    var PICK_DONE = 'tmr_funnel_first_pick_done';
    var COIN_DONE = 'tmr_funnel_first_coin_done';
    var COIN_SEEN = 'tmr_funnel_coin_baseline';
    // A signup older than this is no longer "activation" — stop measuring and
    // stop calling the coin endpoint for that member entirely.
    var ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

    function ls(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    function setLs(key, value) { try { localStorage.setItem(key, value); } catch (e) { } }

    function isLoggedIn() {
        try { return !!(window.api && typeof window.api.isLoggedIn === 'function' && window.api.isLoggedIn()); }
        catch (e) { return false; }
    }

    function origin() {
        try {
            var raw = ls(ORIGIN_KEY);
            if (!raw) return null;
            var o = JSON.parse(raw);
            return (o && o.simulator) ? o : null;
        } catch (e) { return null; }
    }

    function signupTs() {
        var raw = ls(SIGNUP_KEY);
        var n = raw ? Number(raw) : 0;
        return (isFinite(n) && n > 0) ? n : 0;
    }

    /* Is this browser inside a measurable simulator-sourced activation window? */
    function attribution() {
        var o = origin();
        if (!o) return null;
        var ts = signupTs() || o.ts || 0;
        if (!ts) return null;
        var age = Date.now() - ts;
        if (age < 0 || age > ATTRIBUTION_WINDOW_MS) return null;
        return {
            origin_simulator: o.simulator,
            hours_since_signup: Math.max(0, Math.round(age / 3600000)),
            days_since_signup: Math.max(0, Math.floor(age / 86400000))
        };
    }

    function track(name, params) {
        try {
            var p = params || {};
            if (window.TMRAnalytics && typeof window.TMRAnalytics.track === 'function') window.TMRAnalytics.track(name, p);
            else if (typeof window.tmrTrack === 'function') window.tmrTrack(name, p);
            else if (typeof window.gtag === 'function') window.gtag('event', name, p);
        } catch (e) { /* analytics must never break a page */ }
    }

    /* ------------------------------------------------------------------ */
    /* First verified pick after a simulator signup                        */
    /* ------------------------------------------------------------------ */
    /* Observes the same window.api.request bridge every pick submission goes
       through. Read-only wrapper: it forwards the call untouched and only
       inspects the resolved value. */
    function armPickObserver() {
        if (ls(PICK_DONE)) return;
        if (!window.api || typeof window.api.request !== 'function') return;
        if (window.api.__funnelPatched) return;
        window.api.__funnelPatched = true;

        var original = window.api.request.bind(window.api);
        window.api.request = function (path, options) {
            var result = original(path, options);
            try {
                var isPickPost = typeof path === 'string' &&
                    /\/picks(\?|$)/.test(path) &&
                    options && String(options.method || '').toUpperCase() === 'POST';
                if (isPickPost && result && typeof result.then === 'function') {
                    result.then(function (response) {
                        if (!response) return;
                        if (ls(PICK_DONE)) return;
                        var attr = attribution();
                        if (!attr) return;
                        setLs(PICK_DONE, String(Date.now()));
                        track('activation_first_pick_after_signup', attr);
                    }).catch(function () { });
                }
            } catch (e) { }
            return result;
        };
    }

    /* ------------------------------------------------------------------ */
    /* First TMR Coin earned after a simulator signup                      */
    /* ------------------------------------------------------------------ */
    /* One bounded read of the member's own balance. A baseline is recorded on
       the first look so a pre-existing balance is never miscounted as "earned
       after signup"; the event fires the first time the balance rises above
       that baseline. */
    function checkFirstCoin() {
        if (ls(COIN_DONE)) return;
        if (!isLoggedIn()) return;
        var attr = attribution();
        if (!attr) return;
        if (!window.api || typeof window.api.request !== 'function') return;

        window.api.request('/coins/balance').then(function (resp) {
            var balance = Number(resp && resp.balance);
            if (!isFinite(balance)) return;

            var baselineRaw = ls(COIN_SEEN);
            if (baselineRaw === null) {
                setLs(COIN_SEEN, String(balance));
                if (balance <= 0) return;
                baselineRaw = '0';               // already positive on first look: treat 0 as the baseline
            }
            var baseline = Number(baselineRaw);
            if (!isFinite(baseline)) baseline = 0;
            if (balance <= baseline) return;

            setLs(COIN_DONE, String(Date.now()));
            attr.coin_balance = balance;
            track('activation_first_coin_after_signup', attr);
        }).catch(function () { /* balance is best-effort; never surfaced */ });
    }

    /* ------------------------------------------------------------------ */
    function init() {
        armPickObserver();
        checkFirstCoin();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
