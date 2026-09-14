/**
 * LC_YIELD_20260913. The Live Help launcher is fixed to the bottom-right corner
 * (a 58px circle on phones, a wider pill on desktop). Saved-simulation cards put
 * their scores and actions on the right, so as the page scrolls the launcher sits
 * on top of a score or a control most of the time.
 *
 * While the launcher overlaps saved results or the controls around them it steps
 * aside (fades out and stops taking taps), and comes back as soon as it is clear,
 * over the page footer for example. Every viewport; an open chat panel is never
 * touched. Loaded only by the saved list and the NFL/MLB saved-result views.
 */
(function () {
    'use strict';
    var AVOID = '#ssList, .ss-toolbar, .ss-head, .ss-more-wrap, .ss-follow, #simSavedBanner, #simSavedBanner ~ *, #simSavedCard, #simcSavedCard';
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
        var box = launcher.getBoundingClientRect();
        var nodes = document.querySelectorAll(AVOID);
        for (var i = 0; i < nodes.length && !yieldNow; i++) {
            if (overlaps(box, nodes[i].getBoundingClientRect())) yieldNow = true;
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
    // Cards, replays and the launcher itself all arrive after load.
    if (window.MutationObserver) new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
    queue();
})();
