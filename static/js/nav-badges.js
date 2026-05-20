/**
 * Nav Badge System - Shows unread message and notification counts in navigation
 * Requires backend-api.js to be loaded first (uses window.api)
 */
(function() {
    'use strict';

    const REFRESH_INTERVAL = 60000; // 60 seconds
    let badgeInterval = null;
    let navObserver = null;

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
            .tmr-profile-message-link,
            .tmr-mailbox-link {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                min-height: 42px;
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

    function getSessionUser() {
        try {
            if (window.auth && typeof window.auth.getCurrentUser === 'function') {
                const user = window.auth.getCurrentUser();
                if (user && (user.username || user.id || user.email)) return user;
            }
        } catch(e) {}
        try {
            if (window.api && window.api._cachedUser) return window.api._cachedUser;
        } catch(e) {}
        try {
            const keys = ['trustmyrecord_session', 'tmr_current_user', 'currentUser'];
            for (const key of keys) {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                const user = parsed && (parsed.user || parsed);
                if (user && (user.username || user.id || user.email)) return user;
            }
        } catch(e) {}
        return null;
    }

    function normalizeUsername(value) {
        return String(value || '').trim().replace(/^@+/, '').toLowerCase();
    }

    function profileRouteUsername(value) {
        return String(value || '').trim().replace(/^@+/, '').trim();
    }

    function findMessagesLinks() {
        // Find all links pointing to the canonical messages route
        return document.querySelectorAll('a[href="messages/"], a[href="/messages/"], a[href="messages.html"], a[href="/messages.html"], [data-tmr-mailbox-link]');
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

    function ensureInboxNavigation() {
        const communityPanel = document.querySelector('.tmr-community-menu__panel');
        if (!communityPanel || communityPanel.querySelector('a[href="/messages/"]')) return;
        const link = document.createElement('a');
        link.href = '/messages/';
        link.setAttribute('role', 'menuitem');
        link.setAttribute('data-tmr-mailbox-link', '1');
        link.textContent = 'Messages';
        communityPanel.appendChild(link);
    }

    function ensureMailboxAction() {
        if (!isLoggedIn()) return;
        const links = document.querySelector('.tmr-global-nav__links');
        if (!links) return;

        let link = links.querySelector('[data-tmr-primary-mailbox-link]') || links.querySelector('a[href="/messages/"]');
        if (!link) {
            link = document.createElement('a');
            link.className = 'tmr-mailbox-link';
            link.setAttribute('data-tmr-primary-mailbox-link', '1');
            link.setAttribute('data-tmr-mailbox-link', '1');
            links.appendChild(link);
        }
        link.href = '/messages/';
        link.setAttribute('aria-label', 'Messages');
        link.textContent = 'Messages';
    }

    function getViewedProfileUsername() {
        try {
            const params = new URLSearchParams(window.location.search);
            const fromQuery = params.get('user') || params.get('username') || params.get('u');
            if (fromQuery) return fromQuery;
        } catch(e) {}
        try {
            const profile = window.profileData || window.currentProfile || window.viewedProfile;
            if (profile) return profile.username || profile.handle || profile.slug;
        } catch(e) {}
        const usernameNode = document.querySelector('[data-profile-username], [data-tmr-profile-username], .profile-username, #profileUsername');
        if (usernameNode) {
            return usernameNode.getAttribute('data-profile-username') || usernameNode.getAttribute('data-tmr-profile-username') || usernameNode.textContent;
        }
        return '';
    }

    function profileMessagesUrl(username) {
        const clean = profileRouteUsername(username);
        return clean ? '/messages/?to=' + encodeURIComponent(clean) : '/messages/';
    }

    function normalizeProfileMessageActions() {
        if (!/^\/profile\/?$/i.test(window.location.pathname)) return;
        const targetUsername = profileRouteUsername(getViewedProfileUsername());
        if (!targetUsername) return;

        const sessionUser = getSessionUser();
        const currentUsername = normalizeUsername(sessionUser && (sessionUser.username || sessionUser.handle));
        if (currentUsername && currentUsername === normalizeUsername(targetUsername)) return;

        const targetUrl = profileMessagesUrl(targetUsername);
        document.querySelectorAll('.profile-actions a, .profile-actions button, [data-profile-actions] a, [data-profile-actions] button').forEach((element) => {
            const text = (element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const inlineClick = String(element.getAttribute('onclick') || '');
            const href = String(element.getAttribute('href') || '');
            const isMessageAction =
                element.matches('[data-tmr-profile-message]') ||
                text === 'message' ||
                text === 'send message' ||
                /messages\/?\?to=/i.test(inlineClick) ||
                /messages\/?\?to=/i.test(href);
            if (!isMessageAction) return;

            element.setAttribute('data-tmr-profile-message', '1');
            element.setAttribute('data-tmr-message-url', targetUrl);
            if (element.tagName === 'A') element.setAttribute('href', targetUrl);
            if (element.tagName === 'BUTTON') element.removeAttribute('onclick');
        });
    }

    function ensureProfileMessageLink() {
        if (!/^\/profile\/?$/i.test(window.location.pathname)) return;
        if (!isLoggedIn()) return;
        const targetUsername = normalizeUsername(getViewedProfileUsername());
        if (!targetUsername) return;

        const sessionUser = getSessionUser();
        const currentUsername = normalizeUsername(sessionUser && (sessionUser.username || sessionUser.handle));
        if (currentUsername && currentUsername === targetUsername) return;

        const actions = document.querySelector('.profile-actions') || document.querySelector('[data-profile-actions]');
        if (!actions || actions.querySelector('[data-tmr-profile-message]')) return;

        const link = document.createElement('a');
        link.className = 'btn btn-secondary tmr-profile-message-link';
        link.setAttribute('data-tmr-profile-message', '1');
        link.href = '/messages/?to=' + encodeURIComponent(targetUsername);
        link.textContent = 'Send Message';
        actions.appendChild(link);
    }

    async function fetchUnreadCounts() {
        if (!isLoggedIn()) return;
        if (!window.api) return;

        try {
            // Fetch message unread count
            const msgResult = await window.api.request('/messages/unread-count').catch(() => null);
            const msgCount = (msgResult && typeof msgResult.count === 'number') ? msgResult.count : 0;

            // Update all Messages/Mailbox links
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

    function refreshMessagingEntryPoints() {
        ensureInboxNavigation();
        ensureMailboxAction();
        normalizeProfileMessageActions();
        ensureProfileMessageLink();
    }

    function watchNavForLateRender() {
        if (navObserver || !document.body) return;
        navObserver = new MutationObserver(() => {
            refreshMessagingEntryPoints();
        });
        navObserver.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        injectBadgeCSS();
        refreshMessagingEntryPoints();
        watchNavForLateRender();

        setTimeout(refreshMessagingEntryPoints, 500);
        setTimeout(refreshMessagingEntryPoints, 1500);
        setTimeout(refreshMessagingEntryPoints, 3000);

        if (!isLoggedIn()) return;

        // Initial fetch after a short delay to let page load
        setTimeout(fetchUnreadCounts, 500);

        // Refresh every 60 seconds
        if (badgeInterval) clearInterval(badgeInterval);
        badgeInterval = setInterval(() => {
            refreshMessagingEntryPoints();
            fetchUnreadCounts();
        }, REFRESH_INTERVAL);
    }

    document.addEventListener('click', (event) => {
        const action = event.target && event.target.closest && event.target.closest('[data-tmr-profile-message]');
        if (!action) return;
        const url = action.getAttribute('data-tmr-message-url') || action.getAttribute('href');
        if (!url || !/^\/messages\//.test(url)) return;
        event.preventDefault();
        event.stopPropagation();
        window.location.href = url;
    }, true);

    // Run on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    window.addEventListener('tmr-auth-changed', () => setTimeout(init, 50));
    window.addEventListener('storage', () => setTimeout(init, 50));
})();

(function() {
    'use strict';
    if (!/\/handicappers\/?$/i.test(window.location.pathname)) return;
    if (document.querySelector('script[data-hm-leaderboard-polish]')) return;
    const script = document.createElement('script');
    script.src = '/static/js/handicappers-leaderboard-polish.js?v=20260519';
    script.defer = true;
    script.setAttribute('data-hm-leaderboard-polish', '1');
    document.head.appendChild(script);
})();