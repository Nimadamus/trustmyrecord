/**
 * Forum-scoped notification bell injector.
 *
 * SCOPE: loaded ONLY by /forum/index.html (forum-first rollout, approved
 * 2026-05-30). Intentionally NOT in the shared tmr-sitewide.js so the bell does
 * not roll out across the ~2,900 site pages yet. When sitewide rollout is later
 * approved, move this markup into buildLoggedInActions() in tmr-sitewide.js and
 * delete this file.
 *
 * Inserts a notification bell into the authenticated nav user-chip
 * (.tmr-user-chip-wrap). The bell carries the ids/classes that the existing,
 * already-loaded notifications.js (dropdown) and nav-badges.js (unread badge)
 * look for: #notificationsBtn / .notification-bell / #notifBadge.
 *
 * Insert-only and idempotent. Re-runs when the nav re-renders (auth-changed).
 */
(function () {
  'use strict';

  function injectStyles() {
    if (document.getElementById('tmr-forum-nav-bell-style')) return;
    var style = document.createElement('style');
    style.id = 'tmr-forum-nav-bell-style';
    style.textContent =
      '.tmr-user-chip-wrap .tmr-nav-bell{position:relative;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;color:#cfd6e6;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);text-decoration:none;margin-right:8px;transition:background .15s ease,color .15s ease,border-color .15s ease;}' +
      '.tmr-user-chip-wrap .tmr-nav-bell:hover{background:rgba(0,243,255,.10);border-color:rgba(0,243,255,.35);color:#00f3ff;}' +
      '.tmr-user-chip-wrap .tmr-nav-bell__icon{width:20px;height:20px;}' +
      '.tmr-user-chip-wrap .tmr-nav-bell__badge{position:absolute;top:-6px;right:-6px;margin:0;}';
    document.head.appendChild(style);
  }

  function bellMarkup() {
    var a = document.createElement('a');
    a.id = 'notificationsBtn';
    a.className = 'notification-bell tmr-nav-bell';
    a.href = '/notifications/';
    a.setAttribute('aria-label', 'Notifications');
    a.setAttribute('title', 'Notifications');
    a.innerHTML =
      '<svg class="tmr-nav-bell__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a6 6 0 0 0-6 6v3.6L4.3 15a1 1 0 0 0 .9 1.4h13.6a1 1 0 0 0 .9-1.4L18 11.6V8a6 6 0 0 0-6-6Zm0 20a3 3 0 0 0 2.83-2H9.17A3 3 0 0 0 12 22Z"/></svg>' +
      '<span id="notifBadge" class="nav-badge tmr-nav-bell__badge" style="display:none;"></span>';
    // notifications.js exposes window.toggleNotifications; bind so the click
    // opens the dropdown. The <a href> remains a no-JS fallback to the page.
    a.addEventListener('click', function (e) {
      if (typeof window.toggleNotifications === 'function') {
        e.preventDefault();
        window.toggleNotifications(e);
      }
    });
    return a;
  }

  function ensureBell() {
    var chip = document.querySelector('.tmr-global-nav .tmr-user-chip-wrap');
    if (!chip) return false; // logged-out or not yet hydrated
    if (chip.querySelector('#notificationsBtn')) return true; // already present
    injectStyles();
    var trigger = chip.querySelector('.tmr-user-menu-trigger');
    var bell = bellMarkup();
    if (trigger) chip.insertBefore(bell, trigger);
    else chip.insertBefore(bell, chip.firstChild);
    // Kick an immediate unread fetch if the notifications system is ready.
    try {
      if (window.TMR && typeof window.TMR.refreshNotifications === 'function') {
        window.TMR.refreshNotifications();
      }
    } catch (err) {}
    return true;
  }

  function start() {
    ensureBell();
    // The nav is built/rebuilt asynchronously by tmr-sitewide.js (auth resolve,
    // re-render on tmr-auth-changed). Observe and re-insert as needed.
    var obs = new MutationObserver(function () { ensureBell(); });
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('tmr-auth-changed', function () {
      setTimeout(ensureBell, 0);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
