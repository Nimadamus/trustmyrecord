/* =============================================================================
   TrustMyRecord — SHARED HEADER + FOOTER  (tmr-ds-nav.js)
   -----------------------------------------------------------------------------
   Renders the APPROVED homepage navigation bar and a footer in the approved
   treatment, on any page that opts into the design system (body.tmr-ds).

   Why this replaces tmr-sitewide.js rather than layering on top of it:
   tmr-sitewide.js installs a kill-switch stylesheet plus a MutationObserver that
   force-hides any `nav.nav` on the page — which is the exact class the approved
   homepage nav uses. The two cannot coexist. A page adopting the design system
   drops tmr-sitewide.css + tmr-sitewide.js and loads tmr-ds.css + this file.

   ROUTE PARITY: every href exposed by the old nav and footer is reproduced here.
   Nothing is dropped, renamed, or redirected — internal linking and crawl paths
   are preserved exactly.

   The signed-in cluster reuses the homepage's `v2nav-*` markup contract so the
   existing auth/notifications scripts drive this nav with no fork.

   Created Jul 20, 2026.
   ============================================================================= */
(function () {
  'use strict';

  var API = 'https://trustmyrecord-api.onrender.com/api';

  /* --- route tables: identical set to the previous sitewide nav ------------ */
  var SPORTSBOOK = [
    ['/sportsbook/', 'Make Picks'],
    ['/handicapping/', 'Handicapping Hub']
  ];
  var PRIMARY = [
    ['/contests/justbet-mlb/', 'Contest'],
    ['/tools/', 'Tools'],
    ['/handicappers/', 'Find Handicappers']
  ];
  var COMMUNITY = [
    ['/sports-talk/', 'Sports Talk'],
    ['/feed/', 'Feed'],
    ['/arena/', 'Arena'],
    ['/online-gaming/', 'MLB The Show'],
    ['/challenges/', 'Challenges'],
    ['/forum/', 'Forums'],
    ['/chat/', 'Chat'],
    ['/polls/', 'Polls'],
    ['/trivia/', 'Trivia']
  ];
  var SUPPORT = [
    ['/contact/', 'Contact Us'],
    ['/report-bug/', 'Report a Bug']
  ];
  var MORE = [
    ['/marketplace/', 'Sell Your Picks'],
    ['/rules/', 'Rules']
  ];

  var FOOTER = [
    ['Platform', [
      ['/sportsbook/', 'Sportsbook'],
      ['/my-record/', 'My Record'],
      ['/marketplace/', 'Sell Your Picks'],
      ['/premium/', 'Premium']
    ]],
    ['Explore', [
      ['/leaderboards/', 'Leaderboards'],
      ['/handicappers/', 'Browse Handicappers'],
      ['/verified-handicapper-records/', 'Verified Records'],
      ['/sports-betting-record-tracker/', 'Pick Trackers']
    ]],
    ['Community', [
      ['/sports-talk/', 'Sports Talk'],
      ['/forum/', 'Forum'],
      ['/feed/', 'Feed'],
      ['/trivia/', 'Trivia'],
      ['/polls/', 'Polls'],
      ['/hangout/', 'Hangout']
    ]],
    ['Support', [
      ['/how-it-works/', 'How It Works'],
      ['/rules/', 'Rules'],
      ['/about/', 'About'],
      ['/contact/', 'Contact'],
      ['/report-bug/', 'Report a Bug']
    ]]
  ];
  var RESOURCES = [
    ['/sports-betting-glossary/', 'Betting Glossary'],
    ['/sports-betting-roi-explained/', 'ROI Explained'],
    ['/stats/clv/', 'CLV'],
    ['/mlb-season-simulator/', 'Season Simulator'],
    ['/model-builder/', 'Model Builder'],
    ['/tools/', 'All Tools']
  ];

  var path = (location.pathname || '/').toLowerCase();
  function isCurrent(href) {
    var h = href.toLowerCase();
    return path === h || (h !== '/' && path.indexOf(h) === 0);
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function links(list) {
    return list.map(function (r) {
      return '<a href="' + r[0] + '"' + (isCurrent(r[0]) ? ' aria-current="page"' : '') + '>' + esc(r[1]) + '</a>';
    }).join('');
  }
  function menu(label, list) {
    var on = list.some(function (r) { return isCurrent(r[0]); });
    return '<div class="ds-menu' + (on ? ' is-current' : '') + '">' +
      '<button type="button" aria-expanded="false" aria-haspopup="true">' + label + '</button>' +
      '<div class="ds-menu-panel" role="menu" aria-label="' + label + ' links">' +
      list.map(function (r) {
        return '<a href="' + r[0] + '" role="menuitem"' + (isCurrent(r[0]) ? ' aria-current="page"' : '') + '>' + esc(r[1]) + '</a>';
      }).join('') + '</div></div>';
  }

  var BRAND =
    '<a class="ds-logo" href="/">' +
      '<span class="mk">T</span>' +
      '<span class="wd">Trust<em>My</em>Record</span>' +
    '</a>';

  /* --- header -------------------------------------------------------------- */
  function buildNav() {
    if (document.querySelector('.ds-nav')) return;
    var nav = document.createElement('nav');
    nav.className = 'ds-nav';
    nav.setAttribute('aria-label', 'Primary');
    nav.innerHTML =
      '<div class="ds-nav-in">' +
        BRAND +
        '<button class="ds-nav-toggle" type="button" aria-expanded="false" aria-label="Toggle navigation">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">' +
          '<path d="M3 6h18M3 12h18M3 18h18"/></svg>' +
        '</button>' +
        '<div class="ds-nav-panel">' +
          '<div class="ds-mainnav">' +
            menu('Sportsbook', SPORTSBOOK) +
            links(PRIMARY) +
            menu('Community', COMMUNITY) +
            menu('Support', SUPPORT) +
            menu('More', MORE) +
          '</div>' +
          '<div class="ds-nav-right">' +
            '<a class="login" href="/login/">Log in</a>' +
            '<a class="ds-btn p sm" href="/register/">Start Free</a>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.insertBefore(nav, document.body.firstChild);

    // dropdowns: click to open, click-away and Escape to close.
    nav.querySelectorAll('.ds-menu').forEach(function (m) {
      var btn = m.querySelector('button');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = m.classList.contains('is-open');
        nav.querySelectorAll('.ds-menu.is-open').forEach(function (o) {
          o.classList.remove('is-open');
          o.querySelector('button').setAttribute('aria-expanded', 'false');
        });
        if (!open) { m.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
      });
    });
    document.addEventListener('click', function () {
      nav.querySelectorAll('.ds-menu.is-open').forEach(function (o) {
        o.classList.remove('is-open');
        o.querySelector('button').setAttribute('aria-expanded', 'false');
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      nav.querySelectorAll('.ds-menu.is-open').forEach(function (o) {
        o.classList.remove('is-open');
        o.querySelector('button').setAttribute('aria-expanded', 'false');
      });
      nav.classList.remove('is-open');
    });

    var toggle = nav.querySelector('.ds-nav-toggle');
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* --- footer -------------------------------------------------------------- */
  function buildFooter() {
    if (document.querySelector('.ds-footer')) return;
    var f = document.createElement('footer');
    f.className = 'ds-footer';
    f.innerHTML =
      '<div class="ds-footer-in">' +
        '<div class="ds-footer-grid">' +
          '<div class="ds-footer-brand">' + BRAND +
            '<p>Transparent sports records, locked picks, and verified results.</p>' +
          '</div>' +
          FOOTER.map(function (sec) {
            return '<div><h3>' + sec[0] + '</h3><div class="ds-footer-links">' + links(sec[1]) + '</div></div>';
          }).join('') +
        '</div>' +
        '<nav class="ds-footer-res" aria-label="Resources">' +
          '<span class="ds-footer-res-label">Resources</span>' + links(RESOURCES) +
        '</nav>' +
        '<div class="ds-footer-bottom">' +
          '<nav class="ds-footer-legal" aria-label="Legal">' +
            '<span>&copy; 2026 TrustMyRecord</span>' +
            '<a href="/terms/">Terms</a><a href="/privacy/">Privacy</a>' +
          '</nav>' +
          '<p>TrustMyRecord is not a gambling platform. No real money is wagered on this site.</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(f);
  }

  /* --- signed-in state (same contract as the homepage nav) ----------------- */
  function token() {
    try {
      return localStorage.getItem('trustmyrecord_token') ||
             localStorage.getItem('tmr_token') ||
             localStorage.getItem('accessToken') || null;
    } catch (e) { return null; }
  }
  function initials(n) { return String(n || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase(); }

  /* The bell opens the alerts dropdown in place, which is owned by
     notifications.js (it anchors to #homeNotifBtn). The nav this replaces pulled
     that engine in via tmr-sitewide.js, so without it a signed-in user's bell
     would silently degrade to a plain link to /notifications/. Load the same
     chain the homepage loads, in order, and only what is actually missing. */
  var NOTIF_CHAIN = [
    '/static/js/config.js?v=20260330',
    '/static/js/backend-api.js?v=20260525noautologout',
    '/static/js/auth-persistent.js?v=20260525noautologout',
    '/static/js/notifications.js?v=20260720nv1'
  ];

  function loadChain(list, i) {
    i = i || 0;
    if (i >= list.length) return;
    var base = list[i].split('?')[0];
    if (document.querySelector('script[src^="' + base + '"]')) return loadChain(list, i + 1);
    var s = document.createElement('script');
    s.src = list[i];
    s.onload = function () { loadChain(list, i + 1); };
    s.onerror = function () { loadChain(list, i + 1); };
    document.head.appendChild(s);
  }

  function renderUser(user) {
    var right = document.querySelector('.ds-nav .ds-nav-right');
    if (!right || !user) return;
    var name = user.username || user.display_name || 'Account';
    var src = user.avatar_url || (user.id ? API + '/users/' + user.id + '/avatar' : null);
    var av = src
      ? '<img class="v2nav-ava" src="' + src + '" alt="" onerror="this.outerHTML=\'<span class=&quot;v2nav-avl&quot;>' + initials(name) + '</span>\'">'
      : '<span class="v2nav-avl">' + initials(name) + '</span>';

    right.innerHTML =
      '<a class="v2nav-user" href="/u/' + encodeURIComponent(name) + '/" title="' + esc(name) + '">' +
        av + '<span class="v2nav-name">' + esc(name) + '</span></a>' +
      // Stays an <a href> so the bell is never a dead target if the alerts
      // engine has not finished loading.
      '<a class="v2nav-bell" id="homeNotifBtn" data-tmr-notifications href="/notifications/" aria-label="Alerts" title="Alerts" ' +
        'onclick="if(typeof toggleNotifications===\'function\'){toggleNotifications(event);return false;}">' +
        '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
        '<span class="v2nav-badge" id="homeNotifBadge" hidden></span></a>' +
      '<a class="ds-btn p sm" href="/my-record/">My Record</a>';

    if (typeof window.toggleNotifications !== 'function') loadChain(NOTIF_CHAIN);

    fetch(API + '/notifications/unread-count', {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token() }
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var n = d && (d.unreadCount != null ? d.unreadCount : (d.count != null ? d.count : d.unread));
        var b = document.getElementById('homeNotifBadge');
        if (b && n > 0) { b.textContent = n > 99 ? '99+' : n; b.hidden = false; b.style.display = 'inline'; }
      }).catch(function () {});
  }

  function init() {
    if (!document.body.classList.contains('tmr-ds')) return;   // opt-in only
    buildNav();
    buildFooter();
    var t = token();
    if (!t) return;                       // logged out: nav stays as designed
    fetch(API + '/auth/me', { headers: { Accept: 'application/json', Authorization: 'Bearer ' + t } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) renderUser(d.user || d); })
      .catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
