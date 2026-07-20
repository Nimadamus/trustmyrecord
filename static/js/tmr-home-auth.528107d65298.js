/* =============================================================================
   TrustMyRecord homepage — minimal auth state for the approved standalone nav.
   Swaps "Log in / Start Free" for avatar + username + alerts bell + My Record
   when a session token is present. No layout changes, no other dependencies.
   ============================================================================= */
(function () {
  'use strict';
  var API = 'https://trustmyrecord-api.onrender.com/api';

  function token() {
    try {
      return localStorage.getItem('trustmyrecord_token') ||
             localStorage.getItem('tmr_token') ||
             localStorage.getItem('accessToken') || null;
    } catch (e) { return null; }
  }

  function initials(n) { return String(n || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase(); }

  function render(user) {
    var right = document.querySelector('.nav-right');
    if (!right || !user) return;
    var name = user.username || user.display_name || 'Account';
    var avatarSrc = user.avatar_url || (user.id ? API + '/users/' + user.id + '/avatar' : null);
    var av = avatarSrc
      ? '<img class="v2nav-ava" src="' + avatarSrc + '" alt="" onerror="this.outerHTML=\'<span class=&quot;v2nav-avl&quot;>' + initials(name) + '</span>\'">'
      : '<span class="v2nav-avl">' + initials(name) + '</span>';

    right.innerHTML =
      '<a class="v2nav-user" href="/u/' + encodeURIComponent(name) + '/" title="' + name + '">' +
        av + '<span class="v2nav-name">' + name + '</span></a>' +
      // The bell opens the alerts dropdown in place (notifications.js owns it and
      // anchors to #homeNotifBtn). It stays an <a href> so it still works as a
      // plain link if that engine has not finished loading -- clicking the bell
      // must never be a dead target.
      '<a class="v2nav-bell" id="homeNotifBtn" data-tmr-notifications href="/notifications/" aria-label="Alerts" title="Alerts" ' +
        'onclick="if(typeof toggleNotifications===\'function\'){toggleNotifications(event);return false;}">' +
        '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
        '<span class="v2nav-badge" id="homeNotifBadge" hidden></span></a>' +
      '<a class="btn p sm" href="/my-record/">My Record</a>';

    // unread alert count. The endpoint returns { unreadCount }; the older
    // count/unread keys are kept as fallbacks. notifications.js also drives
    // #homeNotifBadge once it polls, so the two stay in sync.
    fetch(API + '/notifications/unread-count', {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token() }
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var n = d && (d.unreadCount != null ? d.unreadCount : (d.count != null ? d.count : d.unread));
        var b = document.getElementById('homeNotifBadge');
        if (b && n > 0) { b.textContent = n > 99 ? '99+' : n; b.hidden = false; b.style.display = 'inline'; }
      }).catch(function () {});
  }

  // The inline script in index.html already painted the signed-in header from the
  // cached identity in localStorage, so there is no logged-out flash. This pass
  // reconciles that optimistic header against the real session.
  function signOutHeader() {
    var right = document.querySelector('.nav-right');
    if (!right || !right.querySelector('.v2nav-user')) return;
    right.innerHTML = '<a class="login" href="/login/">Log in</a>' +
                      '<a class="btn p sm" href="/register/">Start Free</a>';
  }

  var t = token();
  if (!t) { signOutHeader(); return; }   // logged out: approved nav stays as designed
  fetch(API + '/auth/me', { headers: { Accept: 'application/json', Authorization: 'Bearer ' + t } })
    .then(function (r) {
      // 401/403 means the token is dead: take the optimistic header back down
      // rather than leaving a signed-in header on a signed-out session.
      if (r.status === 401 || r.status === 403) { signOutHeader(); return null; }
      return r.ok ? r.json() : null;
    })
    .then(function (d) {
      if (!d) return;
      var user = d.user || d;
      render(user);
      try { localStorage.setItem('currentUser', JSON.stringify(user)); } catch (e) {}
    })
    .catch(function () { /* network blip: keep the cached header, do not flash */ });
})();
