// ==================== TRUST MY RECORD - NOTIFICATIONS SYSTEM ====================
// Uses backend API (window.api from backend-api.js)
// Include config.js and backend-api.js BEFORE this script on every page.

const TMR_NOTIF_POLL_INTERVAL = 60000; // 60 seconds
let _notifPollTimer = null;
let _notifCache = { notifications: [], unreadCount: 0 };

function hasBackendNotificationSession() {
    if (!window.api || typeof api.isLoggedIn !== 'function') return false;
    if (typeof api.loadTokens === 'function') {
        try { api.loadTokens(); } catch (error) {}
    }
    return !!(api.isLoggedIn() && (api.token || api.refreshToken));
}

function hasFrontendAuthSession() {
    return !!(window.auth && typeof auth.isLoggedIn === 'function' && auth.isLoggedIn());
}

(function initNotifications() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupNotifications);
    } else {
        setupNotifications();
    }
})();

function stopNotificationsPolling() {
    if (_notifPollTimer) {
        clearInterval(_notifPollTimer);
        _notifPollTimer = null;
    }
}

async function setupNotifications() {
    // Ensure a notifications container exists
    addNotificationDropdown();

    // Bind bell click
    const bell = getNotificationTrigger();
    if (bell && !bell.getAttribute('onclick')) {
        bell.addEventListener('click', toggleNotificationsDropdown);
    }

    // Close dropdown on outside click
    document.addEventListener('click', function(e) {
        const dropdown = getNotificationsContainer();
        const bellBtn = getNotificationTrigger();
        if (dropdown && bellBtn && !dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Wait for API to be ready then start polling
    if (window.api) {
        try { await api.ready; } catch(e) {}
    }
    // Start polling for notifications (works with backend or localStorage)
    const loggedIn = hasBackendNotificationSession() &&
        (!window.auth || typeof auth.isLoggedIn !== 'function' || hasFrontendAuthSession());
    if (loggedIn) {
        await fetchNotifications();
        if (!_notifPollTimer) {
            _notifPollTimer = setInterval(fetchNotifications, TMR_NOTIF_POLL_INTERVAL);
        }
    } else {
        stopNotificationsPolling();
    }
}

function getNotificationTrigger() {
    return document.getElementById('notificationsBtn') || document.getElementById('notificationBtn');
}

function getNotificationsContainer() {
    return document.getElementById('notificationsDropdown') || document.getElementById('notificationsPanel');
}

function getNotificationsListElement() {
    return document.getElementById('notificationsList');
}

function getUnreadCountElement() {
    return document.getElementById('unreadCount');
}

function addNotificationDropdown() {
    // Reuse the legacy notifications panel when it exists.
    if (document.getElementById('notificationsPanel')) return;

    // Only add the dropdown container if it doesn't exist yet
    if (document.getElementById('notificationsDropdown')) return;

    // Inject styles
    if (!document.getElementById('notifications-styles')) {
        const style = document.createElement('style');
        style.id = 'notifications-styles';
        style.textContent = `
            .notifications-dropdown {
                position: absolute;
                top: 60px;
                right: 20px;
                width: 380px;
                max-height: 500px;
                background: #12121a;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
                z-index: 10000;
                display: none;
                overflow: hidden;
            }

            .notifications-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }

            .notifications-header h4 {
                font-family: 'Orbitron', sans-serif;
                margin: 0;
                color: #fff;
            }

            .notifications-header button {
                background: transparent;
                border: none;
                color: #00f3ff;
                cursor: pointer;
                font-size: 12px;
            }
            .notifications-header button:hover {
                text-decoration: underline;
            }

            .notifications-list {
                max-height: 400px;
                overflow-y: auto;
            }

            .notification-item {
                display: flex;
                gap: 12px;
                padding: 15px 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                cursor: pointer;
                transition: background 0.2s;
            }

            .notification-item:hover {
                background: rgba(255, 255, 255, 0.05);
            }

            .notification-item.unread {
                background: rgba(0, 243, 255, 0.05);
            }

            .notification-icon {
                width: 40px;
                height: 40px;
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.1rem;
                flex-shrink: 0;
            }

            .notification-icon.friend { background: rgba(57, 255, 20, 0.1); color: #39ff14; }
            .notification-icon.message { background: rgba(0, 243, 255, 0.1); color: #00f3ff; }
            .notification-icon.challenge { background: rgba(255, 215, 0, 0.1); color: #ffd700; }
            .notification-icon.bet { background: rgba(255, 0, 255, 0.1); color: #ff00ff; }
            .notification-icon.system { background: rgba(255, 140, 0, 0.1); color: #ff8c00; }
            .notification-icon.premium { background: rgba(255, 215, 0, 0.1); color: #ffd700; }

            .notification-content {
                flex: 1;
                min-width: 0;
            }

            .notification-message {
                font-size: 14px;
                line-height: 1.4;
                margin-bottom: 4px;
                color: #e0e0e0;
            }

            .notification-time {
                font-size: 12px;
                color: #606070;
            }

            .notification-empty {
                padding: 40px;
                text-align: center;
                color: #606070;
            }

            .notification-dot {
                width: 8px;
                height: 8px;
                background: #ff073a;
                border-radius: 50%;
                margin-top: 6px;
                flex-shrink: 0;
            }
        `;
        document.head.appendChild(style);
    }

    // Create dropdown element
    const dropdown = document.createElement('div');
    dropdown.id = 'notificationsDropdown';
    dropdown.className = 'notifications-dropdown';
    dropdown.innerHTML = `
        <div class="notifications-header">
            <h4>Notifications</h4>
            <button onclick="markAllNotificationsRead()">Mark all read</button>
        </div>
        <div class="notifications-list" id="notificationsList">
            <div class="notification-empty">No notifications yet</div>
        </div>
    `;
    document.body.appendChild(dropdown);
}

async function fetchNotifications() {
    // Backend API is mandatory
    if (!window.api || typeof api.getNotifications !== 'function') return;
    
    // Check if user is logged in via API
    if (!hasBackendNotificationSession()) return;

    try {
        const data = await api.getNotifications({ limit: 20 });
        _notifCache.notifications = data.notifications || [];
        _notifCache.unreadCount = Number(data.unreadCount ?? data.unread_count ?? 0);
        
        updateNotifBadge(_notifCache.unreadCount);

        // If the dropdown is currently visible, re-render
        const dropdown = document.getElementById('notificationsDropdown');
        if (dropdown && dropdown.style.display === 'block') {
            renderNotificationsList(_notifCache.notifications);
        }
    } catch (err) {
        if (err && (err.status === 401 || err.status === 403)) {
            stopNotificationsPolling();
            updateNotifBadge(0);
            return;
        }
        console.error('[Notifications] Fetch error:', err);
    }
}

function updateNotifBadge(count) {
    const badges = [
        document.getElementById('notifBadge'),
        document.getElementById('notificationBadge')
    ].filter(Boolean);
    const unreadCount = getUnreadCountElement();

    badges.forEach(function(badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = badge.id === 'notifBadge' ? 'inline' : 'block';
        } else {
            badge.style.display = 'none';
            badge.textContent = '0';
        }
    });

    if (unreadCount) {
        unreadCount.textContent = count > 99 ? '99+' : String(count || 0);
    }
}

function toggleNotificationsDropdown(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    const dropdown = getNotificationsContainer();
    if (!dropdown) return;

    if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
    } else {
        dropdown.style.display = 'block';
        renderNotificationsList(_notifCache.notifications);
        // Refresh from server when opened
        fetchNotifications();
    }
}

function renderNotificationsList(notifications) {
    const list = getNotificationsListElement();
    if (!list) return;

    if (!notifications || notifications.length === 0) {
        list.innerHTML = '<div class="notification-empty">No notifications yet</div>';
        return;
    }

    list.innerHTML = notifications.map(n => {
        const iconClass = getNotifIconClass(n.type);
        const iconChar = getNotifIconChar(n.type);
        const isRead = n.is_read;
        const timeStr = timeAgo(n.created_at);

        return `
            <div class="notification-item ${isRead ? '' : 'unread'}" data-type="${getLegacyFilterType(n.type)}" onclick="handleNotifClick('${n.id}', '${n.type}')">
                <div class="notification-icon ${iconClass}">
                    <i class="fas ${iconChar}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-message">${escapeHtml(n.message || n.content || '')}</div>
                    <div class="notification-time">${timeStr}</div>
                </div>
                ${isRead ? '' : '<div class="notification-dot"></div>'}
            </div>
        `;
    }).join('');
}

function getLegacyFilterType(type) {
    const normalized = String(type || '').toLowerCase();
    if (['friend_request', 'friend_accept', 'follow', 'mention', 'like', 'comment'].includes(normalized)) return 'social';
    if (['challenge_invite', 'challenge_result', 'challenge', 'system'].includes(normalized)) return 'alerts';
    if (['pick_won', 'pick_lost', 'bet_won', 'bet_lost', 'pick_graded'].includes(normalized)) return 'picks';
    return 'all';
}

function getNotifIconClass(type) {
    const map = {
        friend_request: 'friend', friend_accept: 'friend',
        new_message: 'message', message: 'message',
        challenge_invite: 'challenge', challenge_result: 'challenge', challenge: 'challenge',
        pick_won: 'bet', pick_lost: 'bet', bet_won: 'bet', bet_lost: 'bet',
        premium_upgrade: 'premium', premium_expired: 'premium',
        mention: 'message', system: 'system'
    };
    return map[type] || 'system';
}

function getNotifIconChar(type) {
    const map = {
        friend_request: 'fa-user-plus', friend_accept: 'fa-user-check',
        new_message: 'fa-comment', message: 'fa-comment',
        challenge_invite: 'fa-trophy', challenge_result: 'fa-trophy', challenge: 'fa-trophy',
        pick_won: 'fa-chart-line', pick_lost: 'fa-chart-line',
        bet_won: 'fa-chart-line', bet_lost: 'fa-chart-line',
        premium_upgrade: 'fa-crown', premium_expired: 'fa-crown',
        mention: 'fa-at', system: 'fa-info-circle'
    };
    return map[type] || 'fa-bell';
}

async function handleNotifClick(notifId, type) {
    // Mark as read via backend
    if (window.api && api.isLoggedIn()) {
        try {
            await api.markNotificationRead(notifId);
            // Update cache
            const n = _notifCache.notifications.find(x => String(x.id) === String(notifId));
            if (n) n.is_read = true;
            _notifCache.unreadCount = Math.max(0, _notifCache.unreadCount - 1);
            updateNotifBadge(_notifCache.unreadCount);
            renderNotificationsList(_notifCache.notifications);
        } catch (err) {
            console.error('[Notifications] Mark read error:', err);
        }
    }

    // Navigate based on type
    switch (type) {
        case 'friend_request':
        case 'friend_accept':
            window.location.href = 'friends.html';
            break;
        case 'new_message':
        case 'message':
            window.location.href = 'messages.html';
            break;
        case 'challenge_invite':
        case 'challenge_result':
        case 'challenge':
            window.location.href = 'challenges.html';
            break;
        case 'premium_upgrade':
        case 'premium_expired':
            window.location.href = 'premium.html';
            break;
        default:
            // Just mark as read, stay on page
            break;
    }
}

async function markAllNotificationsRead() {
    if (!window.api || !api.isLoggedIn()) return;

    try {
        await api.markAllNotificationsRead();
        _notifCache.notifications.forEach(n => n.is_read = true);
        _notifCache.unreadCount = 0;
        updateNotifBadge(0);
        renderNotificationsList(_notifCache.notifications);
    } catch (err) {
        console.error('[Notifications] Mark all read error:', err);
    }
}

function timeAgo(timestamp) {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function filterNotifications(type) {
    const items = document.querySelectorAll('#notificationsList .notification-item');
    const buttons = document.querySelectorAll('.notif-filter-btn');

    buttons.forEach(function(btn) {
        btn.classList.toggle('active', btn.textContent.trim().toLowerCase() === type);
    });

    items.forEach(function(item) {
        const itemType = item.dataset.type || 'all';
        item.style.display = (type === 'all' || itemType === type) ? 'flex' : 'none';
    });
}

// Global access for legacy compatibility
window.TMR = window.TMR || {};
window.TMR.notify = function(to, message, type) {
    // In backend mode, notifications are created server-side.
    // This is a no-op stub for backward compatibility.
    console.log('[Notifications] TMR.notify called (server-side only):', { to, message, type });
};
window.TMR.refreshNotifications = fetchNotifications;
window.toggleNotifications = toggleNotificationsDropdown;
window.markAllRead = markAllNotificationsRead;
window.markAllNotificationsRead = markAllNotificationsRead;
window.filterNotifications = filterNotifications;
