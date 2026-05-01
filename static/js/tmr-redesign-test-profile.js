/* ============================================================================
 * TMR REDESIGN TEST — Profile reorganizer (test route only)
 *
 * Loaded ONLY from /profile-test/. Watches the live profile renderer and
 * REORGANIZES already-rendered real-data DOM elements into PickMonitor
 * dashboard order:
 *
 *   1. profile hero card (cover + header)        [stays in place]
 *   2. <section id="summaryBar">                  [moved to top of main]
 *   3. recent picks card (.picks-section header) [optional hoist later]
 *
 * This script does NOT:
 *   - inject fake stats / fake users / fake records
 *   - hit any external API
 *   - modify any handler / form / modal / API client
 *   - change any production JS file
 *
 * It only moves existing real-data DOM nodes that were rendered by the
 * unmodified profile renderer. If no real data ever renders, the moved
 * containers stay empty and our CSS hides them via :empty selector.
 * ============================================================================ */

(function () {
    'use strict';

    var MOUNT_CLASS = 'tmr-pt-stats-mount';

    function ensureMount() {
        var main = document.querySelector('.tmr-pt-main');
        if (!main) return null;
        var mount = main.querySelector('.' + MOUNT_CLASS);
        if (mount) return mount;
        mount = document.createElement('div');
        mount.className = MOUNT_CLASS;
        mount.setAttribute('aria-label', 'Stats summary');
        // Insert after .profile-header-section so it sits below the hero card
        var header = main.querySelector('.profile-header-section');
        if (header && header.nextSibling) {
            main.insertBefore(mount, header.nextSibling);
        } else if (header) {
            main.appendChild(mount);
        } else {
            main.insertBefore(mount, main.firstChild);
        }
        return mount;
    }

    function hoistSummaryBar() {
        var summary = document.getElementById('summaryBar');
        if (!summary) return false;
        var mount = ensureMount();
        if (!mount) return false;
        if (summary.parentNode === mount) return true;
        mount.appendChild(summary);
        // Force display so the original `style.display="none"` from the
        // renderer doesn't keep it hidden if the renderer hasn't yet decided
        // to show it. CSS :empty rule hides the mount until populated.
        try {
            // If the renderer already rendered something inside summary, show
            // it. Otherwise leave its display alone — the renderer toggles it
            // when data arrives.
            if (summary.querySelector('.summary-stat')) {
                summary.style.display = 'block';
            }
        } catch (e) {}
        return true;
    }

    function init() {
        // Try once. If summaryBar isn't in DOM yet (renderer hasn't placed
        // it), retry on a polling interval until it appears or we give up.
        if (hoistSummaryBar()) {
            // Already hoisted; also watch for any future re-rendering by the
            // renderer that might re-create #summaryBar in its old location.
            startMutationWatch();
            return;
        }
        var attempts = 0;
        var interval = setInterval(function () {
            attempts++;
            if (hoistSummaryBar() || attempts > 40) {
                clearInterval(interval);
                startMutationWatch();
            }
        }, 250);
    }

    function startMutationWatch() {
        // If the renderer recreates #summaryBar (e.g. after a data refresh)
        // we re-hoist it.
        try {
            var observer = new MutationObserver(function (mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    var added = mutations[i].addedNodes;
                    for (var j = 0; j < added.length; j++) {
                        var node = added[j];
                        if (node && node.nodeType === 1 &&
                            (node.id === 'summaryBar' ||
                             (node.querySelector && node.querySelector('#summaryBar')))) {
                            hoistSummaryBar();
                            return;
                        }
                    }
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        } catch (e) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
