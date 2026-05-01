/* ============================================================================
 * TMR REDESIGN TEST — Profile reorganizer (test route only)
 *
 * Loaded ONLY from /profile-test/. REORGANIZES already-rendered real-data
 * DOM nodes into PickMonitor dashboard layout, and POPULATES the new
 * left-rail cards (Watching, Quick Stats) from window.profileData.
 *
 * No fake data. No fake users. No external API calls. If a value is not
 * present in window.profileData, that section is left empty and CSS hides
 * it via :empty.
 * ============================================================================ */

(function () {
    'use strict';

    var MOUNT_CLASS = 'tmr-pt-stats-mount';

    /* ----- 1. Hoist the rendered #summaryBar to top of center column ---- */
    function ensureMount() {
        var main = document.querySelector('.tmr-pt-main');
        if (!main) return null;
        var mount = main.querySelector('.' + MOUNT_CLASS);
        if (mount) return mount;
        mount = document.createElement('div');
        mount.className = MOUNT_CLASS;
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
        try {
            if (summary.querySelector('.summary-stat')) {
                summary.style.display = 'block';
            }
        } catch (e) {}
        return true;
    }

    /* ----- 2. Populate left-rail Watching card from real profile data --- */
    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function renderWatching() {
        var container = document.querySelector('[data-tmr-pt-watching]');
        if (!container) return;
        var p = window.profileData;
        if (!p) return;
        var sports = Array.isArray(p.favorite_sports)
            ? p.favorite_sports
            : (p.favorite_sport ? [p.favorite_sport] : []);
        var teams = Array.isArray(p.favorite_teams) ? p.favorite_teams : [];
        // If no real favorites set, leave empty so CSS :empty hides the card
        if (!sports.length && !teams.length) {
            container.innerHTML = '';
            return;
        }
        var html = '<h4 class="tmr-pt-card__title">Watching</h4>';
        if (sports.length) {
            html += '<div class="tmr-pt-tags">';
            for (var i = 0; i < sports.length; i++) {
                html += '<span class="tmr-pt-tag">' + escHtml(sports[i]) + '</span>';
            }
            html += '</div>';
        }
        if (teams.length) {
            html += '<div class="tmr-pt-tags tmr-pt-tags--teams">';
            for (var j = 0; j < teams.length; j++) {
                html += '<span class="tmr-pt-tag tmr-pt-tag--team">' + escHtml(teams[j]) + '</span>';
            }
            html += '</div>';
        }
        container.innerHTML = html;
    }

    /* ----- 3. Populate left-rail Quick Stats card from real profile data */
    function fmtJoinedDate(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        } catch (e) { return ''; }
    }

    function renderQuickStats() {
        var container = document.querySelector('[data-tmr-pt-quickstats]');
        if (!container) return;
        var p = window.profileData;
        if (!p) return;
        var followers = Number(p.follower_count);
        var following = Number(p.following_count);
        var joined = fmtJoinedDate(p.created_at || p.joined_at || p.created);
        var hasAny = (Number.isFinite(followers) || Number.isFinite(following) || joined);
        if (!hasAny) {
            container.innerHTML = '';
            return;
        }
        var html = '<h4 class="tmr-pt-card__title">Quick Stats</h4>';
        html += '<div class="tmr-pt-quickstats__rows">';
        if (Number.isFinite(followers)) {
            html += '<div class="tmr-pt-qs-row"><span>Followers</span><b>' +
                escHtml(followers.toLocaleString()) + '</b></div>';
        }
        if (Number.isFinite(following)) {
            html += '<div class="tmr-pt-qs-row"><span>Following</span><b>' +
                escHtml(following.toLocaleString()) + '</b></div>';
        }
        if (joined) {
            html += '<div class="tmr-pt-qs-row"><span>Joined</span><b>' +
                escHtml(joined) + '</b></div>';
        }
        html += '</div>';
        container.innerHTML = html;
    }

    /* ----- 4. Run + watch for late-arriving profileData ----------------- */
    function applyAll() {
        hoistSummaryBar();
        renderWatching();
        renderQuickStats();
    }

    function startMutationWatch() {
        try {
            var obs = new MutationObserver(function () {
                hoistSummaryBar();
                renderWatching();
                renderQuickStats();
            });
            obs.observe(document.body, { childList: true, subtree: true });
        } catch (e) {}
    }

    function init() {
        applyAll();
        // Poll for window.profileData / #summaryBar to land if they're not
        // already present (renderer is async).
        var attempts = 0;
        var iv = setInterval(function () {
            attempts++;
            applyAll();
            if (attempts > 60) clearInterval(iv);
        }, 500);
        startMutationWatch();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
