// ==================== TRUST MY RECORD - NOTIFICATIONS SYSTEM ====================

const NOTIFICATIONS_KEY = 'tmr_notifications';
const NOTIFICATIONS_READ_KEY = 'tmr_notifications_read';

// Initialize notifications on all pages
(function initNotifications() {
    // Wait for DOM and auth to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupNotifications);
    } else {
        setupNotifications();
    }
})();

function setupNotifications() {
    // Add notification bell to header if not present
    addNotificationBell();

    // Start checking for notifications
    checkNotifications();
    setInterval(checkNotifications, 5000); // Check every 5 seconds

    // Mark notifications as read when bell is clicked
    const bell = document.getElementById('notificationsBtn');
    if (bell) {
        bell.addEventListener('click', toggleNotificationsDropdown);
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('notificationsDropdown');
        const bell = document.getElementById('notificationsBtn');
        if (dropdown && !dropdown.contains(e.target) && !bell.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
}

function addNotificationBell() {
    const nav = document.querySelector('.nav-links');
    if (!nav) return;

    // Check if bell already exists
    if (document.getElementById('notificationsBtn')) return;

    const bellLink = document.createElement('a');
    bellLink.href = '#';
    bellLink.className = 'nav-icon';
    bellLink.id = 'notificationsBtn';
    bellLink.innerHTML = `
        <i class="fas fa-bell"></i>
        <span class="nav-badge" id="notifBadge" style="display: none;">0</span>
    `;

    // Insert before profile link
    const profileLink = document.getElementById('profileLink');
    if (profileLink) {
        nav.insertBefore(bellLink, profileLink);
    } else {
        nav.appendChild(bellLink);
    }

    // Add dropdown
    const dropdown = document.createElement('div');
    dropdown.id = 'notificationsDropdown';
    dropdown.className = 'notifications-dropdown';
    dropdown.innerHTML = `
        <div class="notifications-header">
            <h4>Notifications</h4>
            <button onclick="markAllRead()">Mark all read</button>
        </div>
        <div class="notifications-list" id="notificationsList">
            <div class="notification-empty">No notifications yet</div>
        </div>
    `;

    // Add styles if not present
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
            }

            .notifications-header button {
                background: transparent;
                border: none;
                color: #00f3ff;
                cursor: pointer;
                font-size: 12px;
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

            .notification-content {
                flex: 1;
                min-width: 0;
            }

            .notification-message {
                font-size: 14px;
                line-height: 1.4;
                margin-bottom: 4px;
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

    document.body.appendChild(dropdown);
}

function checkNotifications() {
    if (!currentUser?.username) return;

    const notifications = getNotifications();
    const myNotifications = notifications.filter(n => n.to === currentUser.username);
    const unread = myNotifications.filter(n => !n.read);

    // Update badge
    const badge = document.getElementById('notifBadge');
    if (badge) {
        if (unread.length > 0) {
            badge.textContent = unread.length > 99 ? '99+' : unread.length;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    }

    // Update dropdown list
    const list = document.getElementById('notificationsList');
    if (list && document.getElementById('notificationsDropdown').style.display === 'block') {
        renderNotificationsList(myNotifications);
    }
}

function toggleNotificationsDropdown(e) {
    e.preventDefault();
    const dropdown = document.getElementById('notificationsDropdown');
    if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
    } else {
        dropdown.style.display = 'block';
        const notifications = getNotifications().filter(n => n.to === currentUser?.username);
        renderNotificationsList(notifications);
    }
}

function renderNotificationsList(notifications) {
    const list = document.getElementById('notificationsList');

    if (notifications.length === 0) {
        list.innerHTML = '<div class="notification-empty">No notifications yet</div>';
        return;
    }

    // Sort by timestamp, newest first
    notifications.sort((a, b) => b.timestamp - a.timestamp);

    list.innerHTML = notifications.slice(0, 20).map(n => {
        const iconClass = getNotificationIcon(n.type);
        const icon = getNotificationIconChar(n.type);

        return `
            <div class="notification-item ${n.read ? '' : 'unread'}" onclick="handleNotificationClick(${n.timestamp})">
                <div class="notification-icon ${iconClass}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-message">${n.message}</div>
                    <div class="notification-time">${timeAgo(n.timestamp)}</div>
                </div>
                ${n.read ? '' : '<div class="notification-dot"></div>'}
            </div>
        `;
    }).join('');
}

function getNotificationIcon(type) {
    const icons = {
        friend_request: 'friend',
        friend_accept: 'friend',
        message: 'message',
        challenge: 'challenge',
        bet_won: 'bet',
        bet_lost: 'bet',
        mention: 'message',
        system: 'system'
    };
    return icons[type] || 'system';
}

function getNotificationIconChar(type) {
    const icons = {
        friend_request: 'fa-user-plus',
        friend_accept: 'fa-user-check',
        message: 'fa-comment',
        challenge: 'fa-trophy',
        bet_won: 'fa-chart-line',
        bet_lost: 'fa-chart-line',
        mention: 'fa-at',
        system: 'fa-info-circle'
    };
    return icons[type] || 'fa-bell';
}

function handleNotificationClick(timestamp) {
    const notifications = getNotifications();
    const notif = notifications.find(n => n.timestamp === timestamp);

    if (notif) {
        notif.read = true;
        saveNotifications(notifications);

        // Handle navigation based on type
        switch (notif.type) {
            case 'friend_request':
            case 'friend_accept':
                window.location.href = 'friends.html';
                break;
            case 'message':
                const from = notif.message.match(/from (.+?)(?:\s|$)/);
                if (from) {
                    window.location.href = `messages.html?to=${from[1]}`;
                } else {
                    window.location.href = 'messages.html';
                }
                break;
            case 'challenge':
                window.location.href = 'challenges.html';
                break;
            default:
                // Just mark as read, no navigation
                checkNotifications();
        }
    }
}

function markAllRead() {
    const notifications = getNotifications();
    notifications.forEach(n => {
        if (n.to === currentUser?.username) {
            n.read = true;
        }
    });
    saveNotifications(notifications);
    checkNotifications();
}

function getNotifications() {
    return JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || '[]');
}

function saveNotifications(notifications) {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
}

function addNotification(to, message, type, data = {}) {
    const notifications = getNotifications();
    notifications.push({
        to,
        message,
        type,
        timestamp: Date.now(),
        read: false,
        ...data
    });

    // Keep only last 100 notifications per user
    const userNotifs = notifications.filter(n => n.to === to);
    if (userNotifs.length > 100) {
        const toRemove = userNotifs.slice(0, userNotifs.length - 100);
        toRemove.forEach(n => {
            const idx = notifications.indexOf(n);
            if (idx > -1) notifications.splice(idx, 1);
        });
    }

    saveNotifications(notifications);

    // Trigger check immediately
    if (currentUser?.username === to) {
        checkNotifications();
    }
}

function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// Global function to create notifications from anywhere
window.TMR = window.TMR || {};
window.TMR.notify = addNotification;
