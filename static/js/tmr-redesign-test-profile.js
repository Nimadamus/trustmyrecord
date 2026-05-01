/* ============================================================================
 * TMR REDESIGN TEST — Profile reorganizer v2 (PickMonitor refactor)
 *
 * Loaded ONLY from /profile-test/. Strategy: let the live profile renderer
 * run untouched on the ORIGINAL DOM (no wrappers, no broken renderer).
 * AFTER the renderer has populated #profileHeader / #summaryBar / etc.,
 * this script PHYSICALLY MOVES those DOM nodes (no clones) into a new
 * PickMonitor-style layout shell appended at the top of <body>.
 *
 * Why this is safer than markup wrappers at page load:
 *   - The renderer sees the EXACT same DOM it expects at init time
 *   - getElementById still finds the moved nodes (IDs are unique and
 *     parent-chain-insensitive)
 *   - Modals, forms, hidden elements stay where they were
 *   - If any post-render code re-queries elements, it still finds them
 *
 * Strict no-fake-data discipline:
 *   - Real data only — every visible value comes from the existing
 *     renderers populating real elements
 *   - Empty containers stay empty, hidden via CSS :empty
 *   - No fake users / fake stats / fake charts injected
 * ============================================================================ */

(function () {
    'use strict';

    var SHELL_ID = 'tmr-pt-pm-shell';
    var moved = false;

    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    /* Build the PickMonitor visual shell at the top of <body>.
       The shell contains EMPTY mount points where we'll move rendered
       real-data DOM nodes once the renderer is done. */
    function buildShell() {
        if (document.getElementById(SHELL_ID)) return document.getElementById(SHELL_ID);
        var shell = document.createElement('main');
        shell.id = SHELL_ID;
        shell.className = 'tmr-pt-pm-shell';
        shell.setAttribute('aria-label', 'PickMonitor profile dashboard');
        shell.innerHTML = '' +
            '<aside class="tmr-pt-pm-left" aria-label="Profile sidebar">' +
              '<div class="tmr-pt-pm-card">' +
                '<h4>Navigate</h4>' +
                '<nav class="tmr-pt-pm-nav">' +
                  '<a href="/profile/" aria-current="page"><span>👤</span>My Record</a>' +
                  '<a href="/sportsbook/"><span>🎯</span>Make a Pick</a>' +
                  '<a href="/leaderboards/"><span>🏆</span>Leaderboards</a>' +
                  '<a href="/feed/"><span>💬</span>Feed</a>' +
                  '<a href="/forum/"><span>🗣️</span>Forum</a>' +
                  '<a href="/marketplace/"><span>💎</span>Marketplace</a>' +
                  '<a href="/arena/"><span>🎮</span>Arena</a>' +
                  '<a href="/notifications/"><span>🔔</span>Notifications</a>' +
                '</nav>' +
              '</div>' +
              '<div class="tmr-pt-pm-card" data-tmr-pm-watching></div>' +
              '<div class="tmr-pt-pm-card" data-tmr-pm-quickstats></div>' +
            '</aside>' +
            '<section class="tmr-pt-pm-center">' +
              /* hero-card mount: cover + header will be moved here */
              '<div class="tmr-pt-pm-hero" data-tmr-pm-hero-mount></div>' +
              /* stats-strip mount: #summaryBar will be moved here */
              '<div class="tmr-pt-pm-stats" data-tmr-pm-stats-mount></div>' +
              /* performance card mount: #equityCurve / .eq-line area moved here */
              '<div class="tmr-pt-pm-perf-card" data-tmr-pm-perf-mount>' +
                '<h3>Performance</h3>' +
                '<div class="tmr-pt-pm-perf-empty">Performance chart loads with your real graded picks.</div>' +
              '</div>' +
              /* recent picks mount: pick history moved here */
              '<div class="tmr-pt-pm-picks-card" data-tmr-pm-picks-mount>' +
                '<h3>Recent Picks</h3>' +
                '<div class="tmr-pt-pm-picks-empty">Your real picks load here from the database.</div>' +
              '</div>' +
            '</section>' +
            '<aside class="tmr-pt-pm-right" aria-label="Community panels">' +
              '<div class="tmr-pt-pm-card" data-tmr-pm-topcappers></div>' +
              '<div class="tmr-pt-pm-card" data-tmr-pm-trending></div>' +
              '<div class="tmr-pt-pm-card" data-tmr-pm-challenges></div>' +
            '</aside>';
        var firstChild = document.body.firstChild;
        var banner = document.getElementById('tmr-test-route-banner');
        if (banner && banner.nextSibling) {
            document.body.insertBefore(shell, banner.nextSibling);
        } else {
            document.body.insertBefore(shell, firstChild);
        }
        return shell;
    }

    /* Move a real DOM element into a mount point. The element keeps its
       ID and contents — no clone, no copy. The renderer can still find
       it via getElementById. */
    function moveInto(mountSelector, elementId) {
        var mount = document.querySelector(mountSelector);
        var el = document.getElementById(elementId);
        if (!mount || !el) return false;
        if (el.parentNode === mount) return true;
        mount.appendChild(el);
        return true;
    }

    function relocateRenderedNodes() {
        var shell = buildShell();
        if (!shell) return false;

        /* Move cover + header into the hero mount (in that order).
           Both keep their original IDs (#profileCover, #profileHeader)
           so getElementById still works. */
        var heroMount = shell.querySelector('[data-tmr-pm-hero-mount]');
        var cover = document.getElementById('profileCover');
        var header = document.getElementById('profileHeader');
        if (heroMount && cover && cover.parentNode !== heroMount) heroMount.appendChild(cover);
        if (heroMount && header && header.parentNode !== heroMount) heroMount.appendChild(header);

        /* Move #summaryBar into stats mount */
        moveInto('[data-tmr-pm-stats-mount]', 'summaryBar');

        /* Move the equity curve (performance chart) into perf mount */
        var perfMount = shell.querySelector('[data-tmr-pm-perf-mount]');
        var equity = document.getElementById('equityCurve');
        if (perfMount && equity && equity.parentNode !== perfMount) {
            // Remove the empty placeholder once real chart is being moved
            var empty = perfMount.querySelector('.tmr-pt-pm-perf-empty');
            if (empty) empty.remove();
            perfMount.appendChild(equity);
        }

        /* Move the pick history into picks mount. Try a few known IDs the
           live profile uses for the rendered pick table/list. */
        var picksMount = shell.querySelector('[data-tmr-pm-picks-mount]');
        if (picksMount) {
            var pickTargets = ['ledgerWrap', 'picksList', 'profilePicksList', 'picksTableContainer', 'picksTable'];
            for (var i = 0; i < pickTargets.length; i++) {
                var node = document.getElementById(pickTargets[i]);
                if (node && node.parentNode !== picksMount) {
                    var emptyP = picksMount.querySelector('.tmr-pt-pm-picks-empty');
                    if (emptyP) emptyP.remove();
                    picksMount.appendChild(node);
                    break;
                }
            }
        }

        return true;
    }

    /* Populate Watching + Quick Stats from real window.profileData. */
    function fmtJoinedDate(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        } catch (e) { return ''; }
    }

    function renderWatching() {
        var container = document.querySelector('[data-tmr-pm-watching]');
        if (!container) return;
        var p = window.profileData;
        if (!p) return;
        var sports = Array.isArray(p.favorite_sports) ? p.favorite_sports
            : (p.favorite_sport ? [p.favorite_sport] : []);
        var teams = Array.isArray(p.favorite_teams) ? p.favorite_teams : [];
        if (!sports.length && !teams.length) {
            container.innerHTML = '';
            return;
        }
        var html = '<h4>Watching</h4>';
        if (sports.length) {
            html += '<div class="tmr-pt-pm-tags">';
            for (var i = 0; i < sports.length; i++) {
                html += '<span class="tmr-pt-pm-tag">' + escHtml(sports[i]) + '</span>';
            }
            html += '</div>';
        }
        if (teams.length) {
            html += '<div class="tmr-pt-pm-tags tmr-pt-pm-tags--teams">';
            for (var j = 0; j < teams.length; j++) {
                html += '<span class="tmr-pt-pm-tag tmr-pt-pm-tag--team">' + escHtml(teams[j]) + '</span>';
            }
            html += '</div>';
        }
        container.innerHTML = html;
    }

    function renderQuickStats() {
        var container = document.querySelector('[data-tmr-pm-quickstats]');
        if (!container) return;
        var p = window.profileData;
        if (!p) return;
        var followers = Number(p.follower_count);
        var following = Number(p.following_count);
        var joined = fmtJoinedDate(p.created_at || p.joined_at || p.created);
        var hasAny = (Number.isFinite(followers) || Number.isFinite(following) || joined);
        if (!hasAny) { container.innerHTML = ''; return; }
        var html = '<h4>Quick Stats</h4><div class="tmr-pt-pm-qs-rows">';
        if (Number.isFinite(followers)) {
            html += '<div class="tmr-pt-pm-qs-row"><span>Followers</span><b>' + escHtml(followers.toLocaleString()) + '</b></div>';
        }
        if (Number.isFinite(following)) {
            html += '<div class="tmr-pt-pm-qs-row"><span>Following</span><b>' + escHtml(following.toLocaleString()) + '</b></div>';
        }
        if (joined) {
            html += '<div class="tmr-pt-pm-qs-row"><span>Joined</span><b>' + escHtml(joined) + '</b></div>';
        }
        html += '</div>';
        container.innerHTML = html;
    }

    function applyAll() {
        buildShell();
        relocateRenderedNodes();
        renderWatching();
        renderQuickStats();
    }

    function init() {
        applyAll();
        // Renderer is async — keep retrying for ~30s so we catch elements
        // as they become populated.
        var attempts = 0;
        var iv = setInterval(function () {
            attempts++;
            applyAll();
            if (attempts > 60) clearInterval(iv);
        }, 500);
        // Also watch DOM for any late-arriving renderer outputs
        try {
            var obs = new MutationObserver(function () {
                relocateRenderedNodes();
                renderWatching();
                renderQuickStats();
            });
            obs.observe(document.body, { childList: true, subtree: true });
        } catch (e) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
