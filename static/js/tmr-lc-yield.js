/**
 * LC_YIELD_20260913. On a phone the Live Help launcher is a fixed 58px circle in
 * the bottom-right corner, and saved-simulation cards run the full width of the
 * screen with their scores and Run again aligned right. So as the page scrolls,
 * the launcher sits on top of a score or an action most of the time.
 *
 * While the launcher overlaps saved-result content it steps aside (fades out and
 * stops taking taps), and it comes back as soon as it is clear: over the header,
 * the filters or the footer. Phone widths only; an open chat panel is never
 * touched. Loaded only by the saved list and the NFL/MLB saved-result views.
 */
(function () {
    'use strict';
    var AVOID = '#ssList, #simSavedBanner, #simSavedBanner ~ *, #simSavedCard, #simcSavedCard';
    var mq = window.matchMedia ? window.matchMedia('(max-width: 640px)') : null;
    var queued = false;

    var style = document.createElement('style');
    style.textContent = '.tmr-lc-launcher{transition:opacity .15s ease}' +
        '.tmr-lc:not(.is-open) .tmr-lc-launcher.lc-yield{opacity:0;visibility:hidden;pointer-events:none}';
    document.head.appendChild(style);

    function overlaps(a, b) {
        return b.width > 0 && b.height > 0 && a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right;
    }

    function update() {
        queued = false;
        var launcher = document.querySelector('.tmr-lc-launcher');
        if (!launcher) return;
        var yieldNow = false;
        if (mq && mq.matches) {
            var box = launcher.getBoundingClientRect();
            var nodes = document.querySelectorAll(AVOID);
            for (var i = 0; i < nodes.length && !yieldNow; i++) {
                if (overlaps(box, nodes[i].getBoundingClientRect())) yieldNow = true;
            }
        }
        launcher.classList.toggle('lc-yield', yieldNow);
    }

    function queue() {
        if (queued) return;
        queued = true;
        (window.requestAnimationFrame || setTimeout)(update);
    }

    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    if (mq && mq.addEventListener) mq.addEventListener('change', queue);
    // Cards, replays and the launcher itself all arrive after load.
    if (window.MutationObserver) new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
    queue();
})();
