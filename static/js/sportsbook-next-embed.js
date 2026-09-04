/* SPORTSBOOK_NEXT_EMBED_20260904
 * Mounts the redesigned board (sportsbook-next.js) inside the LIVE sportsbook
 * page, behind a rollout flag.
 *
 * Why a mount and not a page swap: /sportsbook/ carries the site nav, the auth
 * session shim, live chat, analytics, notifications, onboarding, contest mode,
 * streaks and the doubleheader and NHL market helpers. Serving the standalone
 * preview shell in its place would drop all of that. So the page stays exactly
 * as it is and only the board region is replaced.
 *
 * With the flag OFF this file adds one class-free no-op and returns before
 * touching the DOM: the classic board renders byte-for-byte as it does today.
 * That is the rollback path, and it is instant.
 *
 *   ?sbnext=1  force the new board for this browser
 *   ?sbnext=0  force the classic board for this browser
 *   scripts/sportsbook-next-rollout.cjs <0-100> [--push]   global percentage
 */
(function () {
    'use strict';

    var ROLLOUT_PERCENT = 100;          // SBNEXT_ROLLOUT — edited by the rollout script
    var KEY = 'tmr_sbnext';
    var BUCKET_KEY = 'tmr_sbnext_bucket';

    function readLS(k) { try { return window.localStorage.getItem(k); } catch (_) { return null; } }
    function writeLS(k, v) { try { window.localStorage.setItem(k, v); } catch (_) {} }

    function wanted() {
        var q;
        try { q = new URLSearchParams(window.location.search || ''); } catch (_) { q = null; }
        var forced = q && q.get('sbnext');
        if (forced === '1') { writeLS(KEY, '1'); return true; }
        if (forced === '0') { writeLS(KEY, '0'); return false; }
        var saved = readLS(KEY);
        if (saved === '1') return true;
        if (saved === '0') return false;
        if (ROLLOUT_PERCENT >= 100) return true;
        if (ROLLOUT_PERCENT <= 0) return false;
        var bucket = readLS(BUCKET_KEY);
        if (bucket === null || isNaN(Number(bucket))) {
            bucket = String(Math.floor(Math.random() * 100));
            writeLS(BUCKET_KEY, bucket);
        }
        return Number(bucket) < ROLLOUT_PERCENT;
    }

    if (!wanted()) return;            // classic board, untouched

    // The engine refuses to boot unless it finds its mount, so this flag and the
    // nodes below are what turn it on. Set synchronously: sportsbook-next.js is
    // parsed straight after this file.
    window.__SBN_MOUNT = true;

    var SHELL =
        '<main class="sbn-shell" id="sbnShell">' +
        '<aside class="sbn-railwrap" aria-label="Sports">' +
        '<div class="sbn-railhead">Sports</div>' +
        '<nav id="sbnRail" class="sbn-rail"></nav>' +
        '</aside>' +
        '<section class="sbn-main">' +
        '<h2 id="sbnTitle" class="sbn-sr">Board</h2>' +
        '<div id="sbnBoard" class="sbn-boardlist"></div>' +
        '</section>' +
        '<aside id="sbnSlip" class="sbn-slip" aria-label="Pick slip"></aside>' +
        '</main>' +
        '<div id="sbnDrawer" class="sbn-drawer"></div>' +
        '<div id="sbnBar" class="sbn-bar" role="button" tabindex="0" aria-controls="sbnSlip">' +
        '<span class="sbn-bardot" aria-hidden="true"></span>' +
        '<span class="sbn-bartext">Tap a price to start</span>' +
        '<span class="sbn-barcta">View slip</span>' +
        '</div>' +
        '<p id="sbnLive" class="sbn-sr" role="status" aria-live="polite"></p>';

    function hide(node) {
        if (node && node.style) node.style.setProperty('display', 'none', 'important');
    }
    function mount() {
        if (document.getElementById('sbnShell')) return true;
        var anchor = document.querySelector('.sportsbook-picks-layout');
        if (!anchor || !anchor.parentNode) return false;
        var host = document.createElement('div');
        host.className = 'sbn-embed';
        host.innerHTML = SHELL;
        anchor.parentNode.insertBefore(host, anchor);
        // The classic board is hidden, never removed. Rolling back is a class
        // away, and its scripts keep running untouched underneath.
        document.documentElement.classList.add('tmr-sbnext');
        // The v2 skin lives in @layer sbv2, and a LAYERED !important beats an
        // unlayered one, so its `display: block !important` on the classic
        // layout wins over any rule this stylesheet could write. An inline
        // important declaration outranks both.
        hide(anchor);
        ['.sportsbook-market-nav', '.tmr-ms-bar', '.tmr-multislip-bar'].forEach(function (sel) {
            [].forEach.call(document.querySelectorAll(sel), hide);
        });
        return true;
    }

    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
        else fn();
    }

    ready(function () {
        if (mount()) return;
        // The board region is rendered by the page's own scripts, so it may not
        // exist yet on first paint. Watch for it, and give up quietly rather
        // than leaving the page half-switched.
        var tries = 0;
        var timer = setInterval(function () {
            if (mount() || ++tries > 60) {
                clearInterval(timer);
                if (!document.getElementById('sbnShell')) {
                    window.__SBN_MOUNT = false;
                    if (window.console && console.warn) console.warn('[sbnext] board region not found; staying on the classic board');
                }
            }
        }, 100);
    });
})();
