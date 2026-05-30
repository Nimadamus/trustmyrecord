/**
 * Forum-scoped notification bell enhancer.
 *
 * SCOPE: loaded ONLY by /forum/index.html (forum-first rollout, approved
 * 2026-05-30). The forum page has its OWN header (#forumTopNav), not the shared
 * tmr-sitewide global nav, and does NOT load nav-badges.js. So this file wires
 * the existing "Alerts" bell link (#notificationsBtn, defined in the forum
 * header markup) to the already-loaded notifications.js dropdown + unread badge,
 * and keeps the unread count fresh.
 *
 * Idempotent and defensive: notifications.js already binds #notificationsBtn on
 * DOMContentLoaded; this is a belt-and-suspenders enhancer for click binding,
 * an initial fetch, and refresh on auth changes. No global-nav dependency.
 */
(function () {
  'use strict';

  function bell() { return document.getElementById('notificationsBtn'); }

  function ensureBound() {
    var el = bell();
    if (!el || el.getAttribute('data-tmr-bell-bound')) return;
    el.setAttribute('data-tmr-bell-bound', '1');
    el.addEventListener('click', function (e) {
      if (typeof window.toggleNotifications === 'function') {
        e.preventDefault();
        window.toggleNotifications(e);
      }
      // else: fall through to the <a href="/notifications/"> page.
    });
  }

  function refresh() {
    try {
      if (window.TMR && typeof window.TMR.refreshNotifications === 'function') {
        window.TMR.refreshNotifications();
      }
    } catch (err) {}
  }

  function start() {
    ensureBound();
    refresh();
    // Re-assert after auth state changes (login/logout re-render).
    window.addEventListener('tmr-auth-changed', function () {
      setTimeout(function () { ensureBound(); refresh(); }, 0);
    });
    // One delayed pass in case notifications.js / api initialise slightly later.
    setTimeout(function () { ensureBound(); refresh(); }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
