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

let _notifAuthListenerBound = false;

async function setupNotifications() {
    // Ensure a notifications container exists
    addNotificationDropdown();

    // Bind bell click. Skip when the trigger carries its own inline onclick
    // (the forum header and the sitewide global-nav bell both do) -- that
    // inline handler survives even when the sitewide nav re-renders the
    // account chip (login/logout, tab-visibility refresh) and destroys/
    // recreates the #notificationsBtn node, whereas a listener attached here
    // would be silently orphaned on the old node.
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

    if (!_notifAuthListenerBound) {
        _notifAuthListenerBound = true;
        // The sitewide nav resolves the logged-in user asynchronously and
        // re-renders on login/logout without a page reload. Re-check session
        // state each time instead of only once at initial page load, or the
        // badge/polling can get stuck on whatever state existed at load.
        window.addEventListener('tmr-auth-changed', refreshNotificationSession);
    }

    await refreshNotificationSession();
}

async function refreshNotificationSession() {
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
        updateNotifBadge(0);
    }
}

function getNotificationTrigger() {
    // Prefer a VISIBLE bell. On the homepage the sitewide global-nav bell
    // (#notificationsBtn) is display:none and the visible bell lives in the
    // baked premium header (#homeNotifBtn); anchoring the dropdown to the
    // hidden node would drop it at 0,0.
    var ids = ['notificationsBtn', 'notificationBtn', 'homeNotifBtn'];
    var firstFound = null;
    for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (!el) continue;
        if (firstFound === null) firstFound = el;
        if (el.offsetParent !== null || el.getClientRects().length) return el;
    }
    return firstFound;
}

// A legacy #notificationsPanel counts as the real container ONLY when it is a
// populated, visible panel (e.g. the notifications page). Some pages (the
// sportsbook board) ship an EMPTY, force-hidden <div id="notificationsPanel">
// stub; latching onto it made the bell a dead click target -- toggle set
// display:block on an element pinned to display:none !important, so the panel
// never opened and the real #notificationsDropdown was never built.
function isUsablePanel(el) {
    if (!el) return false;
    if (el.hasAttribute('hidden')) return false;
    if (!el.children || el.children.length === 0) return false;
    return true;
}

function getNotificationsContainer() {
    const dropdown = document.getElementById('notificationsDropdown');
    if (dropdown) return dropdown;
    const panel = document.getElementById('notificationsPanel');
    return isUsablePanel(panel) ? panel : null;
}

function getNotificationsListElement() {
    return document.getElementById('notificationsList');
}

function getUnreadCountElement() {
    return document.getElementById('unreadCount');
}

function addNotificationDropdown() {
    // Reuse the legacy notifications panel ONLY when it is a real, populated,
    // visible panel. An empty/hidden stub must not block building the dropdown.
    if (isUsablePanel(document.getElementById('notificationsPanel'))) return;

    // Only add the dropdown container if it doesn't exist yet
    if (document.getElementById('notificationsDropdown')) return;

    // Inject styles
    if (!document.getElementById('notifications-styles')) {
        const style = document.createElement('style');
        style.id = 'notifications-styles';
        style.textContent = `
            .notifications-dropdown {
                position: fixed;
                top: 60px;
                right: 20px;
                width: 360px;
                max-width: calc(100vw - 20px);
                max-height: 70vh;
                background: #13131c;
                border: 1px solid rgba(255, 255, 255, 0.09);
                border-radius: 14px;
                box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
                z-index: 100000;
                display: none;
                overflow: hidden;
            }

            .notifications-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 13px 16px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }

            .notifications-header h4 {
                font-family: 'Orbitron', sans-serif;
                margin: 0;
                color: #fff;
                font-size: 15px;
                letter-spacing: .3px;
            }

            .notifications-header button {
                background: transparent;
                border: none;
                color: #35d0e6;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                padding: 4px 6px;
                border-radius: 6px;
                transition: background .15s, color .15s;
            }
            .notifications-header button:hover {
                background: rgba(53, 208, 230, 0.12);
                color: #6fe3f2;
                text-decoration: none;
            }

            .notifications-list {
                max-height: calc(70vh - 52px);
                overflow-y: auto;
            }

            .notification-item {
                display: flex;
                align-items: flex-start;
                gap: 11px;
                padding: 11px 16px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.055);
                cursor: pointer;
                transition: background 0.15s;
                position: relative;
            }
            .notification-item:last-child { border-bottom: 0; }
            .notification-item:hover { background: rgba(255, 255, 255, 0.045); }
            .notification-item.unread { background: rgba(53, 208, 230, 0.055); }
            .notification-item.unread:hover { background: rgba(53, 208, 230, 0.085); }

            .notification-icon {
                width: 34px;
                height: 34px;
                border-radius: 9px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                margin-top: 1px;
            }
            .notification-icon svg { width: 18px; height: 18px; display: block; }

            /* Type tones: soft tinted chip + matching stroke. */
            .notification-icon.tone-win     { background: rgba(34, 197, 94, 0.14);  color: #22c55e; }
            .notification-icon.tone-loss    { background: rgba(239, 68, 68, 0.14);  color: #ef4444; }
            .notification-icon.tone-like    { background: rgba(244, 63, 94, 0.14);  color: #fb7185; }
            .notification-icon.tone-follow  { background: rgba(139, 92, 246, 0.16); color: #a78bfa; }
            .notification-icon.tone-reply   { background: rgba(53, 208, 230, 0.14); color: #35d0e6; }
            .notification-icon.tone-mention { background: rgba(56, 189, 248, 0.14); color: #38bdf8; }
            .notification-icon.tone-forum   { background: rgba(148, 163, 184, 0.15);color: #cbd5e1; }
            .notification-icon.tone-mod     { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }
            .notification-icon.tone-message { background: rgba(53, 208, 230, 0.14); color: #35d0e6; }
            .notification-icon.tone-challenge{background: rgba(251, 191, 36, 0.15); color: #fbbf24; }
            .notification-icon.tone-premium { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }
            .notification-icon.tone-system  { background: rgba(148, 163, 184, 0.15);color: #cbd5e1; }

            .notification-content { flex: 1; min-width: 0; }

            .notification-message {
                font-size: 13px;
                line-height: 1.45;
                color: #e7e9ee;
                overflow-wrap: anywhere;
            }
            .notification-message .res-win  { color: #22c55e; font-weight: 700; }
            .notification-message .res-loss { color: #ef4444; font-weight: 700; }

            .notification-time {
                font-size: 11px;
                color: #7b8092;
                margin-top: 3px;
            }

            .notification-empty {
                padding: 36px 20px;
                text-align: center;
                color: #6b7080;
                font-size: 13px;
            }

            .notification-dot {
                width: 7px;
                height: 7px;
                background: #35d0e6;
                border-radius: 50%;
                margin-top: 6px;
                flex-shrink: 0;
                box-shadow: 0 0 6px rgba(53, 208, 230, 0.7);
            }

            .notification-item.no-destination { cursor: default; }
            .notification-actor {
                color: #6fe3f2;
                font-weight: 600;
                text-decoration: none;
                cursor: pointer;
            }
            .notification-actor:hover { text-decoration: underline; }
            .notification-actor--disabled {
                color: #8a8a99;
                font-weight: 600;
                cursor: not-allowed;
                text-decoration: line-through;
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
        document.getElementById('notificationBadge'),
        document.getElementById('homeNotifBadge')
    ].filter(Boolean);
    const unreadCount = getUnreadCountElement();

    badges.forEach(function(badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = (badge.id === 'notifBadge' || badge.id === 'homeNotifBadge') ? 'inline' : 'block';
        } else {
            badge.style.display = 'none';
            badge.textContent = '0';
        }
    });

    if (unreadCount) {
        unreadCount.textContent = count > 99 ? '99+' : String(count || 0);
    }
}

function positionNotificationsDropdown(dropdown) {
    // Anchor under the actual bell instead of a hardcoded top/right guess --
    // header height/layout differs across pages (forum's own header vs. the
    // sitewide global nav vs. mobile).
    const bell = getNotificationTrigger();
    if (!bell || dropdown.id !== 'notificationsDropdown') return;
    const rect = bell.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 20);
    let left = rect.right - width;
    left = Math.max(10, Math.min(left, window.innerWidth - width - 10));
    dropdown.style.width = width + 'px';
    dropdown.style.left = left + 'px';
    dropdown.style.right = 'auto';
    dropdown.style.top = Math.round(rect.bottom + 10) + 'px';
}

function toggleNotificationsDropdown(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    const dropdown = getNotificationsContainer();
    if (!dropdown) return;

    if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
    } else {
        positionNotificationsDropdown(dropdown);
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
        const tone = getNotifTone(n.type);
        const isRead = n.is_read;
        const timeStr = timeAgo(n.created_at);
        const actor = getNotifActor(n);

        // Always an inline SVG keyed to the alert type -- never a font glyph or a
        // remote avatar, so there are no empty tinted boxes or broken images.
        const iconHtml = `<div class="notification-icon tone-${tone}" aria-hidden="true">${getNotifIconSvg(n.type)}</div>`;

        const destination = getNotificationDestination(n) || (actor.available ? actor.href : null);
        const rowClass = destination ? '' : 'no-destination';

        return `
            <div class="notification-item ${isRead ? '' : 'unread'} ${rowClass}" data-type="${getLegacyFilterType(n.type)}" onclick="handleNotifClick('${n.id}')">
                ${iconHtml}
                <div class="notification-content">
                    <div class="notification-message">${renderNotifMessage(n, actor)}</div>
                    <div class="notification-time">${timeStr}</div>
                </div>
                ${isRead ? '' : '<div class="notification-dot"></div>'}
            </div>
        `;
    }).join('');
}

// Resolve the actor (the user who triggered the notification) straight from the
// payload -- related_user_id + the joined username/display_name/avatar. Never
// from the message display text. When related_user_id points at a deleted or
// deactivated account the LEFT JOIN yields no username, so we mark it
// unavailable and render a disabled (non-link) state instead of a broken URL.
function getNotifActor(notification) {
    if (!notification) return { referenced: false, available: false, username: '', display: '', href: null };
    const id = notification.related_user_id || notification.relatedUserId || notification.actor_id || notification.actorId;
    const username = notification.username || notification.actor_username || notification.from_username || '';
    const display = notification.display_name || notification.displayName || username || '';
    const referenced = !!(id || username);
    const available = !!username;
    return {
        referenced: referenced,
        available: available,
        username: username,
        display: display,
        href: available ? '/profile/?user=' + encodeURIComponent(username) : null
    };
}

// Turn the actor's leading name in the message into a profile link. Only the
// payload's real display_name/username is linkified (never arbitrary text), and
// only when it is the leading token, so we never fabricate a URL from copy.
function renderNotifMessage(notification, actor) {
    const message = notification.message || notification.content || '';
    const safe = escapeHtml(message);
    if (!actor || !actor.referenced) return highlightResult(safe, notification.type);

    const token = [actor.display, actor.username].find(function(t) {
        return t && message.indexOf(t) === 0;
    });
    if (!token) return highlightResult(safe, notification.type); // name not leading
    const safeToken = escapeHtml(token);
    const rest = highlightResult(safe.slice(safeToken.length), notification.type);
    const inner = actor.available
        ? '<a href="' + actor.href + '" class="notification-actor" onclick="handleActorClick(event, \'' + notification.id + '\')">' + safeToken + '</a>'
        : '<span class="notification-actor notification-actor--disabled" title="This account is no longer available">' + safeToken + '</span>';
    return inner + rest;
}

// Color ONLY the result word and the unit amount (green win / red loss) inside
// an already-escaped message -- never the whole row. Operates on escaped text,
// so the inserted <span>s are the only markup. Applied to graded-pick alerts
// and any message that carries an explicit +/- unit figure.
function highlightResult(safeHtml, type) {
    if (!safeHtml) return safeHtml;
    const t = String(type || '').toLowerCase();
    const isWin = /win|won/.test(t);
    const isLoss = /lost|loss/.test(t);
    let out = safeHtml;
    // Standalone result words FIRST, while the string still has no <span> markup
    // (the class names below contain "win"/"loss", so doing this after would
    // re-match inside the attribute and corrupt the HTML).
    if (isWin) out = out.replace(/\b(won|win)\b/gi, '<span class="res-win">$1</span>');
    if (isLoss) out = out.replace(/\b(lost|loss)\b/gi, '<span class="res-loss">$1</span>');
    // Then signed unit amounts, e.g. "+2.5 units", "-1 unit".
    out = out.replace(/([+\-]\d+(?:\.\d+)?\s*units?)/gi, function(m) {
        const cls = m.trim().charAt(0) === '-' ? 'res-loss' : 'res-win';
        return '<span class="' + cls + '">' + m + '</span>';
    });
    return out;
}

// Click on the actor name/avatar: mark read (awaited so it persists) then open
// the profile. stopPropagation prevents the row handler firing a second time.
function handleActorClick(e, notifId) {
    if (e) { if (e.stopPropagation) e.stopPropagation(); if (e.preventDefault) e.preventDefault(); }
    const notification = _notifCache.notifications.find(function(x){ return String(x.id) === String(notifId); });
    const actor = getNotifActor(notification);
    if (!actor.available) return;
    handleNotifClick(notifId, actor.href);
}

function getLegacyFilterType(type) {
    const normalized = String(type || '').toLowerCase();
    if (normalized.indexOf('follow_new_pick') !== -1) return 'picks';
    if (normalized.indexOf('follow_new_thread') !== -1 || normalized.indexOf('follow_new_post') !== -1) return 'alerts';
    if (normalized.indexOf('forum') !== -1) return 'alerts';
    if (['friend_request', 'friend_accept', 'follow', 'mention', 'like', 'comment'].includes(normalized)) return 'social';
    if (['challenge_invite', 'challenge_result', 'challenge', 'system'].includes(normalized)) return 'alerts';
    if (['pick_won', 'pick_lost', 'bet_won', 'bet_lost', 'pick_graded'].includes(normalized)) return 'picks';
    return 'all';
}

function getNotifIconClass(type) {
    const map = {
        friend_request: 'friend', friend_accept: 'friend',
        new_message: 'message', message: 'message',
        forum_thread_reply: 'message', forum_post_reply: 'message',
        forum_mention: 'message', forum_post_like: 'friend',
        follow_new_thread: 'message', follow_new_post: 'message', follow_new_pick: 'bet',
        challenge_invite: 'challenge', challenge_result: 'challenge', challenge: 'challenge',
        pick_won: 'bet', pick_lost: 'bet', bet_won: 'bet', bet_lost: 'bet',
        premium_upgrade: 'premium', premium_expired: 'premium',
        mention: 'message', system: 'system'
    };
    return map[type] || 'system';
}

// Map a notification type to a colour tone (drives the icon chip + stroke).
function getNotifTone(type) {
    const t = String(type || '').toLowerCase();
    if (/pick_won|bet_won/.test(t) || (t.indexOf('graded') !== -1 && /win|won/.test(t))) return 'win';
    if (/pick_lost|bet_lost/.test(t) || (t.indexOf('graded') !== -1 && /lost|loss/.test(t))) return 'loss';
    if (t.indexOf('like') !== -1) return 'like';
    if (t === 'friend_request' || t === 'friend_accept' || t === 'follow' || t === 'forum_thread_follow' || t.indexOf('follow_new') !== -1) return 'follow';
    if (t.indexOf('mention') !== -1) return 'mention';
    if (t === 'forum_mod_action') return 'mod';
    if (t.indexOf('reply') !== -1 || t.indexOf('subscription') !== -1 || t.indexOf('quote') !== -1) return 'reply';
    if (t === 'new_message' || t === 'message') return 'message';
    if (t.indexOf('challenge') !== -1) return 'challenge';
    if (t.indexOf('premium') !== -1) return 'premium';
    if (t.indexOf('forum') !== -1) return 'forum';
    return 'system';
}

// Inline SVG icons (stroke = currentColor). Always render regardless of whether
// a font icon library is loaded on the host page -- this is what replaces the
// empty FontAwesome boxes. 24x24 viewBox, 2px stroke, rounded.
const NOTIF_SVG = {
    win:    '<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>',
    loss:   '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
    like:   '<path d="M20.8 8.6a5 5 0 0 0-8.8-3.2A5 5 0 0 0 3.2 8.6c0 3.6 4.2 6.7 8.8 10.4 4.6-3.7 8.8-6.8 8.8-10.4z"/>',
    follow: '<circle cx="9" cy="8" r="3.2"/><path d="M4 19c0-2.8 2.2-5 5-5s5 2.2 5 5"/><path d="M18 8v6M15 11h6"/>',
    reply:  '<path d="M21 12a7 7 0 0 1-7 7H7l-4 3V9a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7z"/>',
    mention:'<circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"/>',
    mod:    '<path d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6z"/><path d="M9.5 12l1.8 1.8 3.2-3.6"/>',
    message:'<path d="M4 5h16v11H8l-4 3z"/>',
    challenge:'<path d="M7 4h10v3a5 5 0 0 1-10 0z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3M9 15h6M10 15l-.5 4h5l-.5-4"/>',
    premium:'<path d="M4 8l4 3 4-6 4 6 4-3-2 10H6z"/>',
    forum:  '<path d="M4 5h16v10H10l-4 3v-3H4z"/>',
    system: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>'
};

function getNotifIconSvg(type) {
    const inner = NOTIF_SVG[getNotifTone(type)] || NOTIF_SVG.system;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
         + 'stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
}

function getNotificationDestination(notification) {
    const type = String(notification?.type || '').toLowerCase();
    const resourceType = String(notification?.resource_type || notification?.resourceType || '').toLowerCase();
    const relatedThreadId = notification?.related_thread_id || notification?.relatedThreadId;
    const relatedPostId = notification?.related_post_id || notification?.relatedPostId;
    const threadId = notification?.thread_id || notification?.threadId || relatedThreadId || (resourceType === 'forum_thread' ? notification?.resource_id || notification?.resourceId : null);
    const postId = notification?.post_id || notification?.postId || relatedPostId || (resourceType === 'forum_post' ? notification?.resource_id || notification?.resourceId : null);

    if (type === 'friend_request' || type === 'friend_accept') return '/friends/';
    if (type === 'new_message' || type === 'message') {
        // Deep-link straight into the conversation with the sender so the row
        // click opens the thread ready to reply, not the generic inbox.
        const un = notification?.sender_username || notification?.from_username || notification?.username || notification?.actor_username;
        return un ? '/messages/?to=' + encodeURIComponent(un) : '/messages/';
    }
    if (type === 'challenge_invite' || type === 'challenge_result' || type === 'challenge') return '/challenges/';
    if (type === 'premium_upgrade' || type === 'premium_expired') return '/premium/';
    if (type.indexOf('forum') !== -1 || resourceType === 'forum_thread' || resourceType === 'forum_post') {
        return threadId ? '/forum/?thread=' + encodeURIComponent(threadId) + (postId ? '#post-' + encodeURIComponent(postId) : '') : '/forum/';
    }
    if (type.indexOf('pick') !== -1 || resourceType === 'pick') {
        const un = notification?.username || notification?.actor_username || notification?.from_username;
        return un ? '/profile/?user=' + encodeURIComponent(un) + '&view=picks' : '/mypicks/';
    }
    if (type === 'follow' && (notification?.username)) {
        return '/profile/?user=' + encodeURIComponent(notification.username);
    }

    return null;
}

async function handleNotifClick(notifId, overrideHref) {
    const notification = _notifCache.notifications.find(x => String(x.id) === String(notifId));

    // Mark as read via backend
    if (window.api && api.isLoggedIn()) {
        try {
            await api.markNotificationRead(notifId);
            // Update cache
            if (notification && !notification.is_read) {
                notification.is_read = true;
                _notifCache.unreadCount = Math.max(0, _notifCache.unreadCount - 1);
            }
            updateNotifBadge(_notifCache.unreadCount);
            renderNotificationsList(_notifCache.notifications);
        } catch (err) {
            console.error('[Notifications] Mark read error:', err);
        }
    }

    let destination = overrideHref || getNotificationDestination(notification);
    if (!destination) {
        const actor = getNotifActor(notification);
        if (actor.available) destination = actor.href;
    }
    if (destination) {
        window.location.href = destination;
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
