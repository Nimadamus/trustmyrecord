/* =============================================================================
   TrustMyRecord homepage — minimal auth state for the approved standalone nav.
   Swaps "Log in / Start Free" for avatar + username + alerts bell + My Record
   when a session token is present. No layout changes, no other dependencies.
   ============================================================================= */
(function () {
  'use strict';
  var API = 'https://trustmyrecord-api.onrender.com/api';

  // tmr-session.js owns token reading + the refresh-then-retry flow. The inline
  // fallbacks keep this file working if that script ever fails to load.
  var S = window.TMRSession || null;

  function token() {
    if (S) return S.getAccessToken();
    try {
      return localStorage.getItem('trustmyrecord_token') ||
             localStorage.getItem('tmr_token') ||
             localStorage.getItem('accessToken') || null;
    } catch (e) { return null; }
  }

  function initials(n) { return String(n || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase(); }

  // Single writer for the bell badge. Drives BOTH the `hidden` attribute and the
  // inline display so a zero count can never leave a stale red dot: the markup
  // ships `hidden`, but `.v2nav-badge{display:flex}` outranks the UA's
  // [hidden]{display:none}, which is exactly how an empty red dot rendered on a
  // logged-in load with zero unread notifications. Count > 0 is the ONLY state
  // that shows the badge, and the number shown is the server's unread count.
  function setBellBadge(n) {
    var b = document.getElementById('homeNotifBadge');
    if (!b) return;
    n = Number(n);
    if (!isFinite(n) || n <= 0) {
      b.textContent = '';
      b.hidden = true;
      b.style.display = 'none';
      return;
    }
    b.textContent = n > 99 ? '99+' : String(n);
    b.hidden = false;
    b.style.display = 'inline';
  }

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
    (S ? S.authFetch(API + '/notifications/unread-count')
       : fetch(API + '/notifications/unread-count', {
           headers: { Accept: 'application/json', Authorization: 'Bearer ' + token() }
         }))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { setBellBadge(d && (d.unreadCount != null ? d.unreadCount : (d.count != null ? d.count : d.unread))); })
      // A failed/unauthorised count must never leave a red dot behind: the badge
      // only ever shows a number the server actually returned.
      .catch(function () { setBellBadge(0); });
  }

  // The inline script in index.html already painted the signed-in header (or a
  // neutral placeholder) from localStorage, so there is no logged-out flash.
  // This pass reconciles that optimistic header against the real session.
  function signOutHeader() {
    var right = document.querySelector('.nav-right');
    if (!right) return;
    right.innerHTML = '<a class="login" href="/login/">Log in</a>' +
                      '<a class="btn p sm" href="/register/">Start Free</a>';
  }

  // A stale ACCESS token is not a logged-out user: the refresh token is good for
  // a year. TMRSession.resolveUser() refreshes and retries, and reports
  // 'signed-out' ONLY when the server rejects the refresh token itself.
  // 'unknown' (offline, CORS, Render 5xx) leaves the header exactly as it is.
  if (S) {
    if (!S.hasTokens()) { signOutHeader(); return; }
    S.resolveUser().then(function (res) {
      if (res.state === 'ok') render(res.user);
      else if (res.state === 'signed-out') signOutHeader();
      // 'unknown': keep whatever the pre-paint script rendered.
    });
    return;
  }

  // --- fallback: tmr-session.js missing -------------------------------------
  var t = token();
  if (!t) { signOutHeader(); return; }
  fetch(API + '/auth/me', { headers: { Accept: 'application/json', Authorization: 'Bearer ' + t } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;                    // never sign out on an unverified failure
      var user = d.user || d;
      render(user);
      try { localStorage.setItem('currentUser', JSON.stringify(user)); } catch (e) {}
    })
    .catch(function () { /* network blip: keep the cached header, do not flash */ });
})();
