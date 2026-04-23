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

            // Fetch notification unread count
            const notifResult = await window.api.request('/notifications/unread-count').catch(() => null);
            const notifCount = (notifResult && typeof notifResult.count === 'number') ? notifResult.count : 0;

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
