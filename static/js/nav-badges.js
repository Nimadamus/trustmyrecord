/**
 * Nav Badge System - Shows unread message and notification counts in navigation
 * Requires backend-api.js to be loaded first (uses window.api)
 */
(function() {
    'use strict';

    const REFRESH_INTERVAL = 60000; // 60 seconds
    let badgeInterval = null;

    function injectBadgeCSS() {
        if (document.getElementById('nav-badge-styles')) return;
        const style = document.createElement('style');
        style.id = 'nav-badge-styles';
        style.textContent = `
            .nav-badge {
                background: #ff4444;
                color: white;
                font-size: 11px;
                font-weight: 700;
                min-width: 18px;
                height: 18px;
                border-radius: 9px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                position: relative;
                top: -8px;
                margin-left: 2px;
                padding: 0 4px;
                line-height: 1;
                font-family: 'Exo 2', Arial, sans-serif;
                box-shadow: 0 0 6px rgba(255, 68, 68, 0.5);
                animation: badge-pop 0.3s ease;
            }
            @keyframes badge-pop {
                0% { transform: scale(0); }
                70% { transform: scale(1.2); }
                100% { transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    function isLoggedIn() {
        if (window.api && typeof window.api.isLoggedIn === 'function') {
            return window.api.isLoggedIn();
        }
        // Fallback: check localStorage
        try {
            const token = localStorage.getItem('trustmyrecord_token') || localStorage.getItem('token');
            if (token) return true;
            const session = localStorage.getItem('trustmyrecord_session');
            if (session) {
                const parsed = JSON.parse(session);
                const user = parsed.user || parsed;
                if (user && (user.username || user.email)) return true;
            }
        } catch(e) {}
        return false;
    }

    function findMessagesLinks() {
        // Find all links pointing to the canonical messages route
        return document.querySelectorAll('a[href="messages/"], a[href="/messages/"], a[href="messages.html"], a[href="/messages.html"]');
    }

    function findNotificationElements() {
        // Find bell icons or notification links
        return document.querySelectorAll('.notification-bell, a[href="notifications/"], a[href="/notifications/"], a[href="notifications.html"], .fa-bell');
    }

    function setBadge(element, count) {
        if (!element) return;
        // Find or create badge span
        let badge = element.querySelector('.nav-badge');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'nav-badge';
                element.appendChild(badge);
                // Make sure parent has relative positioning for proper display
                if (getComputedStyle(element).position === 'static') {
                    element.style.position = 'relative';
                }
            }
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'inline-flex';
        } else {
            if (badge) {
                badge.style.display = 'none';
            }
        }
    }

    async function fetchUnreadCounts() {
        if (!isLoggedIn()) return;
        if (!window.api) return;

        try {
            // Fetch message unread count
            const msgResult = await window.api.request('/messages/unread-count').catch(() => null);
            const msgCount = (msgResult && typeof msgResult.count === 'number') ? msgResult.count : 0;

            // Update all Messages links
            const msgLinks = findMessagesLinks();
            msgLinks.forEach(link => setBadge(link, msgCount));

            // Fetch notification unread count (backend returns { unreadCount }; tolerate { count } too)
            const notifResult = await window.api.request('/notifications/unread-count').catch(() => null);
            let notifCount = 0;
            if (notifResult) {
                if (typeof notifResult.unreadCount === 'number') notifCount = notifResult.unreadCount;
                else if (typeof notifResult.count === 'number') notifCount = notifResult.count;
            }

            // Update notification bell elements
            const notifElements = findNotificationElements();
            notifElements.forEach(el => {
                // If it's an <i> icon inside a parent, badge the parent
                const target = el.tagName === 'I' ? el.parentElement : el;
                setBadge(target, notifCount);
            });

        } catch(e) {
            // Silently fail - badges are non-critical
        }
    }

    function init() {
        injectBadgeCSS();

        if (!isLoggedIn()) return;

        // Initial fetch after a short delay to let page load
        setTimeout(fetchUnreadCounts, 500);

        // Refresh every 60 seconds
        if (badgeInterval) clearInterval(badgeInterval);
        badgeInterval = setInterval(fetchUnreadCounts, REFRESH_INTERVAL);
    }

    // Run on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// Handicappers page leaderboard polish. Page-scoped only; uses the existing
// production member rows and never fabricates member records or graded stats.
(function() {
    'use strict';

    if (!/\/handicappers\/?$/i.test(window.location.pathname)) return;

    const OFFICIAL_COPY = 'Official leaderboard spots unlock once members reach 20 graded picks, recent graded activity, and positive net units.';
    const LOCKED_COPY = 'Requires 20 graded picks, recent graded activity, and positive net units.';

    function injectPolishCSS() {
        if (document.getElementById('hmLeaderboardPolishStyles')) return;
        const style = document.createElement('style');
        style.id = 'hmLeaderboardPolishStyles';
        style.textContent = `
            .hm-featured{align-items:stretch;}
            .hm-leader-card{position:relative;overflow:hidden;min-height:132px;border-color:rgba(45,212,191,.22);background:linear-gradient(145deg,rgba(17,30,50,.96),rgba(7,13,24,.92));box-shadow:0 16px 36px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.05);}
            .hm-leader-card:before{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,#2dd4bf,#d4a72c);opacity:.78;}
            .hm-leader-card--empty{grid-column:auto;border-style:solid;background:linear-gradient(145deg,rgba(15,23,42,.84),rgba(7,13,24,.9));}
            .hm-leader-card--empty strong{color:#e6edf7;}
            .hm-leader-card--empty strong:before{content:"LOCKED";display:inline-flex;margin-right:8px;padding:3px 7px;border:1px solid rgba(212,167,44,.38);border-radius:999px;color:#f5d66b;background:rgba(212,167,44,.1);font-size:.58rem;letter-spacing:.1em;vertical-align:2px;}
            .hm-leader-profile{display:flex;align-items:center;gap:10px;margin-top:12px;min-width:0;}
            .hm-leader-avatar{width:36px;height:36px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:0 0 36px;border:1px solid rgba(45,212,191,.35);background:rgba(45,212,191,.12);color:#e8fffb;font-weight:900;}
            .hm-leader-profile strong{margin-top:0;}
            .hm-profile-chip{display:inline-flex;width:max-content;margin-top:10px;padding:7px 10px;border:1px solid rgba(45,212,191,.28);border-radius:7px;color:#cffefa;background:rgba(45,212,191,.1);font-size:.74rem;font-weight:900;}
            .hm-current-rankings{margin:18px 0 10px;}
            .hm-current-rankings .hm-section-head{margin-bottom:12px;}
            .hm-table{min-width:1260px;}
            .hm-row{grid-template-columns:minmax(58px,.28fr) minmax(300px,1.35fr) minmax(112px,.52fr) minmax(104px,.48fr) minmax(108px,.5fr) minmax(104px,.48fr) minmax(112px,.52fr) minmax(108px,.5fr) minmax(118px,.56fr)!important;column-gap:18px!important;}
            .hm-rank-cell{color:#f6d35f;font-weight:950;text-align:center;letter-spacing:.02em;}
            .hm-stat[data-label="Verified Picks"]{color:#eaf2ff;}
            .hm-stat[data-label="Sports"]{overflow:hidden;text-overflow:ellipsis;}
            @media (max-width:720px){.hm-table{min-width:0;}.hm-row{grid-template-columns:1fr!important;}.hm-rank-cell{text-align:left;}.hm-rank-cell:before{content:attr(data-label);display:block;margin-bottom:5px;color:#7f8da3;font-size:.66rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;}}
        `;
        document.head.appendChild(style);
    }

    function gradedFromRecord(text) {
        const match = String(text || '').match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);
        if (!match) return null;
        return (Number(match[1]) || 0) + (Number(match[2]) || 0) + (Number(match[3]) || 0);
    }

    function currentPageStart() {
        const summary = document.getElementById('hmPageSummary');
        const match = summary && String(summary.textContent || '').match(/Showing\s+(\d+)/i);
        return match ? Number(match[1]) || 1 : 1;
    }

    function ensureCurrentRankingsHeader() {
        if (document.querySelector('.hm-current-rankings')) return;
        const controls = document.querySelector('.hm-controls');
        if (!controls || !controls.parentNode) return;
        const section = document.createElement('section');
        section.className = 'hm-current-rankings';
        section.setAttribute('aria-label', 'Current member rankings');
        section.innerHTML = '<div class="hm-section-head"><div><h2>Current Member Rankings</h2><p>All rows use available production member data. Official badges remain locked until qualification thresholds are met.</p></div><span class="hm-production-note">Real member activity only</span></div>';
        controls.parentNode.insertBefore(section, controls);
    }

    function polishCopy() {
        const heads = Array.from(document.querySelectorAll('.hm-section-head'));
        const official = heads.find(head => /Leaderboard/i.test(head.textContent || ''));
        if (official) {
            const title = official.querySelector('h2');
            const copy = official.querySelector('p');
            if (title) title.textContent = 'Official Leaderboard Qualification';
            if (copy) copy.textContent = OFFICIAL_COPY;
        }
        document.querySelectorAll('.hm-trust-note').forEach((note, index) => {
            if (index === 0) note.textContent = OFFICIAL_COPY;
            if (index === 1) note.textContent = 'Current rankings use graded picks only for record, win percentage, net units, ROI, and verified pick counts. Pending picks stay out until graded.';
        });
        const pageSummary = document.getElementById('hmPageSummary');
        if (pageSummary) pageSummary.textContent = pageSummary.textContent.replace(/qualified members/g, 'filtered members');
        const sort = document.getElementById('hmSort');
        if (sort) {
            const option = sort.querySelector('option[value="totalPicks"]');
            if (option) option.textContent = 'Verified picks';
        }
        ensureCurrentRankingsHeader();
    }

    function polishLeaderCards() {
        document.querySelectorAll('.hm-leader-card').forEach(card => {
            const strong = card.querySelector('strong');
            const span = card.querySelector('span');
            if (card.classList.contains('hm-leader-card--empty')) {
                if (strong) strong.textContent = 'Awaiting Qualified Leader';
                if (span) span.textContent = LOCKED_COPY;
                return;
            }
            if (card.dataset.hmLeaderPolished === '1') return;
            const metric = card.querySelector('span');
            const userMatch = metric && metric.textContent.match(/@([A-Za-z0-9_.-]+)/);
            const username = userMatch && userMatch[1];
            if (!strong || !username) return;
            const display = strong.textContent.trim();
            const avatar = document.createElement('div');
            avatar.className = 'hm-leader-avatar';
            avatar.textContent = (display.charAt(0) || username.charAt(0) || 'M').toUpperCase();
            const profile = document.createElement('div');
            profile.className = 'hm-leader-profile';
            strong.parentNode.insertBefore(profile, strong);
            profile.appendChild(avatar);
            profile.appendChild(strong);
            const link = document.createElement('a');
            link.className = 'hm-profile-chip';
            link.href = '/profile/?user=' + encodeURIComponent(username);
            link.textContent = 'View Profile';
            card.appendChild(link);
            card.dataset.hmLeaderPolished = '1';
        });
    }

    function polishTable() {
        const head = document.querySelector('.hm-head');
        if (head && head.dataset.hmPolished !== '1') {
            head.innerHTML = '<div>Rank</div><div>Handicapper</div><div>Record</div><div>Win %</div><div>Net Units</div><div>ROI</div><div>Verified Picks</div><div>Last Active</div><div>Sports</div>';
            head.dataset.hmPolished = '1';
        }

        const start = currentPageStart();
        document.querySelectorAll('#hmRows .hm-member-row').forEach((row, index) => {
            const rowKey = String(start + index) + '|' + String(row.getAttribute('data-username') || '');
            if (row.dataset.hmRowPolished === rowKey) return;
            const cells = Array.from(row.children);
            if (!cells.length) return;
            const user = row.querySelector('.hm-user');
            const record = row.querySelector('[data-label="Record"]');
            const units = row.querySelector('[data-label="Units"]');
            const roi = row.querySelector('[data-label="ROI"]');
            const win = row.querySelector('[data-label="Win %"]');
            const picks = row.querySelector('[data-label="Total picks"], [data-label="Verified Picks"]');
            const active = row.querySelector('[data-label="Last active"]');
            let sports = row.querySelector('[data-label="Sports"]');
            let rank = row.querySelector('.hm-rank-cell');
            if (!rank) {
                rank = document.createElement('div');
                rank.className = 'hm-stat hm-rank-cell';
                rank.setAttribute('data-label', 'Rank');
            }
            rank.textContent = '#' + (start + index);
            if (picks) {
                const graded = gradedFromRecord(record && record.textContent);
                picks.setAttribute('data-label', 'Verified Picks');
                picks.textContent = graded == null ? '--' : String(graded);
            }
            if (!sports) {
                sports = document.createElement('div');
                sports.className = 'hm-stat is-muted';
                sports.setAttribute('data-label', 'Sports');
                sports.textContent = '--';
            }
            [rank, user, record, win, units, roi, picks, active, sports].filter(Boolean).forEach(cell => row.appendChild(cell));
            row.dataset.hmRowPolished = rowKey;
        });
    }

    function polish() {
        injectPolishCSS();
        polishCopy();
        polishLeaderCards();
        polishTable();
    }

    function initPolish() {
        polish();
        const rows = document.getElementById('hmRows');
        const featured = document.getElementById('hmFeaturedLeaders');
        const observer = new MutationObserver(() => polish());
        if (rows) observer.observe(rows, { childList: true, subtree: true });
        if (featured) observer.observe(featured, { childList: true, subtree: true });
        document.addEventListener('change', event => {
            if (event.target && (event.target.id === 'hmSort' || event.target.id === 'hmPageSize' || event.target.id === 'hmSport')) {
                setTimeout(polish, 0);
            }
        });
        document.addEventListener('click', event => {
            if (event.target && (event.target.id === 'hmPrevPage' || event.target.id === 'hmNextPage')) {
                setTimeout(polish, 0);
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPolish);
    else initPolish();
    setTimeout(polish, 1200);
    setTimeout(polish, 3200);
})();
