/* ============================================================================
 * TMR Sportsbook v2 skin (SPORTSBOOK_V2_20260903)
 *
 * A feature-flagged FRONTEND/UX layer over the existing /sportsbook/ page.
 * It never touches selection state, the pick slip contract, lockInPick,
 * api.createPick, grading, or any DOM id the proven submit path reads.
 * Everything it does is additive:
 *   - toggles `html.tmr-sbv2` (all v2 CSS is scoped under that class)
 *   - sport icons on the existing league rail buttons (data attribute only)
 * The existing quick-bet bar (#tmrQuickBet), slip cue toast and pick slip
 * keep their own logic; v2 only re-skins them through CSS.
 *
 * Flag (same pattern as sportsbook-multislip.js):
 *   ON  : ?sbv2=1 (persists to localStorage.tmr_sbv2='1'), or window.__TMR_SBV2_FORCE
 *   OFF : ?sbv2=0 (persists '0'), or contest mode (?contest=...)
 *   else: stable per-browser bucket, enabled for ROLLOUT_PERCENT % of browsers.
 * Kill switch = deploy with ROLLOUT_PERCENT 0. Any user can opt out with ?sbv2=0.
 * Self-heal: if this file throws, the html class is removed and the page
 * renders the classic sportsbook untouched.
 * ========================================================================== */
(function () {
    'use strict';
    var ROLLOUT_PERCENT = 10;
    var CLS = 'tmr-sbv2';
    var root = document.documentElement;

    function param(name) {
        try { return new URLSearchParams(window.location.search || '').get(name); } catch (_) { return null; }
    }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

    function resolveFlag() {
        if (window.__TMR_SBV2_FORCE === true) return true;
        var q = param('sbv2');
        if (q === '1') { lsSet('tmr_sbv2', '1'); return !param('contest'); }
        if (q === '0') { lsSet('tmr_sbv2', '0'); return false; }
        if (param('contest')) return false;
        var stored = lsGet('tmr_sbv2');
        if (stored === '1') return true;
        if (stored === '0') return false;
        if (ROLLOUT_PERCENT <= 0) return false;
        if (ROLLOUT_PERCENT >= 100) return true;
        var bucket = parseInt(lsGet('tmr_sbv2_bucket'), 10);
        if (!(bucket >= 0 && bucket < 100)) { bucket = Math.floor(Math.random() * 100); lsSet('tmr_sbv2_bucket', String(bucket)); }
        return bucket < ROLLOUT_PERCENT;
    }

    var enabled = false;
    try { enabled = resolveFlag(); } catch (_) { enabled = false; }

    function disable(reason) {
        enabled = false;
        try { root.classList.remove(CLS); } catch (_) {}
        try { console.warn('[TMR][SBV2] disabled: ' + reason); } catch (_) {}
    }

    window.__tmrSbV2 = {
        get enabled() { return enabled; },
        rolloutPercent: ROLLOUT_PERCENT,
        disable: disable
    };
    if (!enabled) return;
    // The v2 stylesheet lives in a cascade layer so it wins over the page's
    // legacy !important rules deterministically. No layer support = classic page.
    if (typeof window.CSSLayerBlockRule === 'undefined') { disable('no cascade layer support'); return; }
    root.classList.add(CLS);

    // Self-heal: a runtime error inside this file must never degrade the page.
    window.addEventListener('error', function (ev) {
        try {
            var src = String((ev && ev.filename) || '');
            if (src.indexOf('sportsbook-v2') !== -1) disable('runtime error: ' + (ev.message || ''));
        } catch (_) {}
    });

    var ICONS = {
        NBA: '🏀', WNBA: '🏀', NCAAB: '🏀',
        NFL: '🏈', NCAAF: '🏈',
        MLB: '⚾', NPB: '⚾',
        NHL: '🏒',
        Soccer: '⚽', Tennis: '🎾',
        UFC: '🥊', PFL: '🥊', MMA: '🥊', Boxing: '🥊',
        Golf: '⛳', NASCAR: '🏎️', F1: '🏎️'
    };

    function $(sel, ctx) { return (ctx || document).querySelector(sel); }

    function decorateRail() {
        var btns = document.querySelectorAll('.sportsbook-rail-board[data-sport]');
        for (var i = 0; i < btns.length; i++) {
            var b = btns[i];
            if (b.getAttribute('data-sbv2-icon')) continue;
            b.setAttribute('data-sbv2-icon', ICONS[b.getAttribute('data-sport')] || '⭐');
        }
    }

    function init() {
        try {
            decorateRail();
            var rail = $('.sportsbook-rail-list');
            if (rail) new MutationObserver(decorateRail).observe(rail, { childList: true });
            root.setAttribute('data-sbv2', 'ready');
        } catch (err) {
            disable('init: ' + (err && err.message));
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
