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

    // The legacy sportsbook shell boxes the board into a 1400px column with
    // 14px of side padding, and it does it from @layer sbv2. sbv2 is registered
    // before this file's layer, and for !important an EARLIER layer wins, so no
    // stylesheet rule here can beat it. An inline important declaration can.
    var FREE = ['main', '#picks.page-section', '.picks-container-modern', '.pick-step'];
    function freeTheWrappers() {
        FREE.forEach(function (sel) {
            var el = document.querySelector(sel);
            if (!el || !el.style) return;
            el.style.setProperty('max-width', 'none', 'important');
            el.style.setProperty('width', '100%', 'important');
            el.style.setProperty('padding-left', '0', 'important');
            el.style.setProperty('padding-right', '0', 'important');
            el.style.setProperty('margin-left', '0', 'important');
            el.style.setProperty('margin-right', '0', 'important');
            el.style.setProperty('border-left-width', '0', 'important');
            el.style.setProperty('border-right-width', '0', 'important');
        });
    }
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
        // the approved v3 skin is scoped to this class, the same one the preview
        // shell sets, so the live board and the preview render identically
        document.documentElement.classList.add('sbn-v3');
        // The v2 skin lives in @layer sbv2, and a LAYERED !important beats an
        // unlayered one, so its `display: block !important` on the classic
        // layout wins over any rule this stylesheet could write. An inline
        // important declaration outranks both.
        hide(anchor);
        ['.sportsbook-market-nav', '.tmr-ms-bar', '.tmr-multislip-bar'].forEach(function (sel) {
            [].forEach.call(document.querySelectorAll(sel), hide);
        });
        freeTheWrappers();
        rehomePendingLink();
        return true;
    }

    // The board's own boxes are whole numbers, but the production page's header
    // is not: it ends on a fraction of a pixel, and everything below inherits
    // that offset, which is exactly what makes numbers render soft. Nothing
    // inside the board can correct it, so the mount absorbs the remainder in its
    // own padding and hands its children a whole-pixel origin.
    var snapping = false;
    function snapToPixelGrid() {
        if (snapping) return;
        // Snap the SHELL, not the mount: the utility row sits inside the mount,
        // so correcting the mount leaves whatever that row measures between it
        // and the board. The shell is the element whose children are the cards.
        var shell = document.getElementById('sbnShell');
        if (!shell) return;
        snapping = true;
        try {
            shell.style.paddingTop = '';
            var base = parseFloat(getComputedStyle(shell).paddingTop) || 0;
            var top = shell.getBoundingClientRect().top + base;   // where the children start
            var frac = top - Math.floor(top);
            if (frac > 0.005) shell.style.setProperty('padding-top', (base + 1 - frac).toFixed(3) + 'px', 'important');
        } finally {
            // let the observers see the corrected layout before they may fire again
            setTimeout(function () { snapping = false; }, 0);
        }
    }
    // The legacy page header that held the pending-picks link is hidden, so the
    // link is moved into a slim utility row of its own rather than deleted.
    // Moving the real element keeps its href and anything bound to it. It is
    // deliberately NOT put in the board toolbar: there it stole width from the
    // market tabs and wrapped them onto four rows.
    function rehomePendingLink() {
        var host = document.querySelector('.sbn-embed');
        var link = document.querySelector('.pending-picks-compact-link');
        if (!host || !link) return;
        var util = host.querySelector('.sbn-util');
        if (!util) {
            util = document.createElement('div');
            util.className = 'sbn-util';
            host.insertBefore(util, host.firstChild);
        }
        if (link.parentNode !== util) util.appendChild(link);
    }
    function watchPixelGrid() {
        freeTheWrappers();
        rehomePendingLink();
        snapToPixelGrid();
        var pending = null;
        var soon = function () {
            if (pending) clearTimeout(pending);
            pending = setTimeout(function () { pending = null; rehomePendingLink(); snapToPixelGrid(); }, 80);
        };
        window.addEventListener('resize', soon, { passive: true });
        if (document.fonts && document.fonts.ready && document.fonts.ready.then) document.fonts.ready.then(soon);
        var board = document.getElementById('sbnBoard');
        if (board && window.MutationObserver) new MutationObserver(soon).observe(board, { childList: true });
        // the page's own scripts settle after first paint
        [250, 800, 2000].forEach(function (t) { setTimeout(snapToPixelGrid, t); });
    }

    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
        else fn();
    }

    ready(function () {
        if (mount()) { watchPixelGrid(); return; }
        // The board region is rendered by the page's own scripts, so it may not
        // exist yet on first paint. Watch for it, and give up quietly rather
        // than leaving the page half-switched.
        var tries = 0;
        var timer = setInterval(function () {
            if (mount() || ++tries > 60) {
                clearInterval(timer);
                if (document.getElementById('sbnShell')) watchPixelGrid();
                if (!document.getElementById('sbnShell')) {
                    window.__SBN_MOUNT = false;
                    if (window.console && console.warn) console.warn('[sbnext] board region not found; staying on the classic board');
                }
            }
        }, 100);
    });
})();
