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

  /* --- route tables --------------------------------------------------------
     Reconciled 2026-07-29: this nav had drifted from the homepage's own
     grouping (Handicappers/Compete/Community/Tools/TMR Coin) despite the
     header comment above saying it mirrors the approved homepage nav. This is
     the union of every destination from both — nothing dropped, renamed, or
     redirected — grouped to match the homepage's dropdown shape, with the
     items that only existed here (Sports Talk, Chat, Challenges, Contact Us,
     Report a Bug, Rules, the /tools/ hub itself) folded into the closest
     matching dropdown, plus a new Support dropdown for the two that didn't
     fit elsewhere. ------------------------------------------------------- */
  var SPORTSBOOK = [
    ['/sportsbook/', 'Make Picks'],
    ['/handicapping/', 'Handicapping Hub']
  ];
  var HANDICAPPERS = [
    ['/handicappers/', 'Find Handicappers'],
    ['/leaderboards/', 'Leaderboards'],
    ['/marketplace/', 'Buy Picks'],
    ['/marketplace/sell/', 'Sell Your Picks']
  ];
  var COMPETE = [
    ['/contests/justbet-mlb/', 'Contest'],
    ['/arena/', 'Arena'],
    ['/challenges/', 'Challenges'],
    ['/trivia/', 'Trivia'],
    ['/polls/', 'Polls']
  ];
  var COMMUNITY = [
    ['/community/', 'Community Home'],
    ['/forum/', 'Forums'],
    ['/sports-talk/', 'Sports Talk'],
    ['/chat/', 'Chat'],
    ['/messages/', 'Messages']
  ];
  var TOOLS = [
    ['/tools/', 'Tools Hub'],
    ['/mlb-simulator/', 'MLB Simulator'],
    ['/nfl-simulator/', 'NFL Simulator'],
    ['/trendspotter/', 'TrendSpotter'],
    ['/betlegend-pro/', 'BetLegend Pro'],
    ['/handicapping/', 'Handicapping Hub']
  ];
  var TMR_COIN = [
    ['/tmr-coin/', 'TMR Coin']
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
  // TMR Coin keeps its flat top-level slot but carries the official coin mark
  // (same asset as the balance pill) so it reads as one intentional button.
  function coinLink() {
    var r = TMR_COIN[0];
    return '<a class="ds-coinlink" href="' + r[0] + '"' + (isCurrent(r[0]) ? ' aria-current="page"' : '') + '>' +
      '<img class="ds-coinlink-ico" src="/static/branding/tmr-coin/tmr-coin-logo.svg" alt="" aria-hidden="true">' +
      esc(r[1]) + '</a>';
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
            menu('Handicappers', HANDICAPPERS) +
            menu('Compete', COMPETE) +
            menu('Community', COMMUNITY) +
            menu('Tools', TOOLS) +
            coinLink() +
          '</div>' +
          '<div class="ds-nav-right">' + initialNavRight() + '</div>' +
        '</div>' +
      '</div>';
    document.body.insertBefore(nav, document.body.firstChild);

    // dropdowns: click to open, click-away and Escape to close. Delegated on
    // the nav (rather than bound per-.ds-menu at build time) so the account
    // dropdown — injected later by renderUser(), once identity resolves —
    // opens correctly without a second wiring pass.
    nav.addEventListener('click', function (e) {
      var m = e.target.closest('.ds-menu');
      if (!m) return;
      var btn = e.target.closest('button');
      if (!btn || btn.parentElement !== m) return;   // ignore clicks on panel items
      e.stopPropagation();
      var open = m.classList.contains('is-open');
      nav.querySelectorAll('.ds-menu.is-open').forEach(function (o) {
        o.classList.remove('is-open');
        o.querySelector('button').setAttribute('aria-expanded', 'false');
      });
      if (!open) { m.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
    });
    nav.addEventListener('click', function (e) {
      var lo = e.target.closest('[data-tmr-logout]');
      if (lo) { e.stopPropagation(); doLogout(lo); }
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
    // Skip if the page already has ANY footer (not just a previous .ds-footer) --
    // pages with their own bespoke footer (e.g. the homepage) keep it as-is when
    // they opt into body.tmr-ds for the shared nav; this script's job here is
    // nav consolidation, not replacing footers that already work.
    if (document.querySelector('footer')) return;
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

  /* --- signed-in state (same contract as the homepage nav) -----------------
     tmr-session.js owns token reading and the refresh-then-retry flow so a
     60-minute-old access token never renders as "logged out". The inline
     fallbacks keep this nav working if that file fails to load.             */
  var S = window.TMRSession || null;

  function token() {
    if (S) return S.getAccessToken();
    try {
      return localStorage.getItem('trustmyrecord_token') ||
             localStorage.getItem('tmr_token') ||
             localStorage.getItem('accessToken') || null;
    } catch (e) { return null; }
  }

  function hasTokens() {
    if (S) return S.hasTokens();
    if (token()) return true;
    try {
      return !!(localStorage.getItem('trustmyrecord_refresh_token') ||
                localStorage.getItem('refreshToken') ||
                localStorage.getItem('refresh_token') ||
                localStorage.getItem('tmr_refresh_token'));
    } catch (e) { return false; }
  }

  function cachedUser() { return S ? S.getCachedUser() : null; }

  var LOGGED_OUT_HTML =
    '<a class="login" href="/login/">Log in</a>' +
    '<a class="ds-btn p sm" href="/register/">Start Free</a>';

  // Neutral placeholder: shown when we KNOW there is a session but have not
  // resolved the identity yet. Never render "Log in / Start Free" in that
  // window — an authenticated member must not see a logged-out header, not
  // even for one frame. Inline styles so no CSS deploy is required.
  var LOADING_HTML =
    '<span class="ds-nav-authpending" aria-busy="true" aria-label="Loading account" ' +
      'style="display:inline-flex;align-items:center;gap:8px;opacity:.55">' +
      '<span style="width:26px;height:26px;border-radius:50%;background:currentColor;opacity:.18"></span>' +
      '<span style="width:74px;height:10px;border-radius:5px;background:currentColor;opacity:.18"></span>' +
    '</span>';

  // Synchronous first paint of the header's right-hand cluster.
  function initialNavRight() {
    if (!hasTokens()) return LOGGED_OUT_HTML;
    var u = cachedUser();
    return u ? userHTML(u) : LOADING_HTML;
  }
  function initials(n) { return String(n || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase(); }

  /* The bell opens the alerts dropdown in place, which is owned by
     notifications.js (it anchors to #homeNotifBtn). The nav this replaces pulled
     that engine in via tmr-sitewide.js, so without it a signed-in user's bell
     would silently degrade to a plain link to /notifications/. Load the same
     chain the homepage loads, in order, and only what is actually missing. */
  var NOTIF_CHAIN = [
    '/static/js/config.js?v=62b943f8370a',
    '/static/js/backend-api.js?v=7af9e9d0c5e3',
    '/static/js/auth-persistent.js?v=533b6a5999e2',
    '/static/js/notifications.js?v=b237c77f13ca'
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

  function userHTML(user) {
    var name = user.username || user.display_name || user.displayName || 'Account';
    var src = user.avatar_url || user.avatarUrl || (user.id ? API + '/users/' + user.id + '/avatar' : null);
    var av = src
      ? '<img class="v2nav-ava" src="' + esc(src) + '" alt="" onerror="this.outerHTML=\'<span class=&quot;v2nav-avl&quot;>' + initials(name) + '</span>\'">'
      : '<span class="v2nav-avl">' + initials(name) + '</span>';

    return '<div class="ds-menu v2nav-menu">' +
        '<button type="button" class="v2nav-user" aria-expanded="false" aria-haspopup="true" title="' + esc(name) + '">' +
          av + '<span class="v2nav-name">' + esc(name) + '</span>' +
        '</button>' +
        '<div class="ds-menu-panel v2nav-menu-panel" role="menu" aria-label="Account menu">' +
          '<a href="/u/' + encodeURIComponent(name) + '/" role="menuitem">My Profile</a>' +
          '<a href="/profile/?action=edit" role="menuitem">Settings</a>' +
          '<a href="/contact/" role="menuitem">Help &amp; Support</a>' +
          '<button type="button" class="v2nav-logout" role="menuitem" data-tmr-logout>Log Out</button>' +
        '</div>' +
      '</div>' +
      // TMR Coin balance pill. Hidden until populated so it
      // never flashes a stale/zero value; links to the wallet page.
      '<a class="v2nav-coins" id="navCoinPill" href="/wallet/" title="' +
        esc((window.TMR_TERMINOLOGY && window.TMR_TERMINOLOGY.full) || 'TMR Coin') + ' balance" hidden>' +
        '<img class="v2nav-coins-icon" src="/static/branding/tmr-coin/tmr-coin-logo.svg" alt="" aria-hidden="true"><span id="navCoinBalance">—</span></a>' +
      // Stays an <a href> so the bell is never a dead target if the alerts
      // engine has not finished loading.
      '<a class="v2nav-bell" id="homeNotifBtn" data-tmr-notifications href="/notifications/" aria-label="Alerts" title="Alerts" ' +
        'onclick="if(typeof toggleNotifications===\'function\'){toggleNotifications(event);return false;}">' +
        '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
        '<span class="v2nav-badge" id="homeNotifBadge" hidden></span></a>' +
      '<a class="ds-btn p sm" href="/my-record/">My Record</a>';
  }

  function renderUser(user) {
    var right = document.querySelector('.ds-nav .ds-nav-right');
    if (!right || !user) return;
    right.innerHTML = userHTML(user);

    if (typeof window.toggleNotifications !== 'function') loadChain(NOTIF_CHAIN);

    (S ? S.authFetch(API + '/notifications/unread-count')
       : fetch(API + '/notifications/unread-count', {
           headers: { Accept: 'application/json', Authorization: 'Bearer ' + token() }
         }))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var n = d && (d.unreadCount != null ? d.unreadCount : (d.count != null ? d.count : d.unread));
        var b = document.getElementById('homeNotifBadge');
        if (b && n > 0) { b.textContent = n > 99 ? '99+' : n; b.hidden = false; b.style.display = 'inline'; }
      }).catch(function () {});

    (S ? S.authFetch(API + '/coins/balance')
       : fetch(API + '/coins/balance', {
           headers: { Accept: 'application/json', Authorization: 'Bearer ' + token() }
         }))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || d.balance == null) return;
        var pill = document.getElementById('navCoinPill');
        var bal = document.getElementById('navCoinBalance');
        if (bal) bal.textContent = Number(d.balance).toLocaleString('en-US');
        if (pill) { pill.hidden = false; if (d.is_frozen) pill.classList.add('is-frozen'); }
      }).catch(function () {});
  }

  function signOutHeader() {
    var right = document.querySelector('.ds-nav .ds-nav-right');
    if (right) right.innerHTML = LOGGED_OUT_HTML;
  }

  function clearStoredTokens() {
    if (S && S.clearTokens) { S.clearTokens(); return; }
    try {
      ['trustmyrecord_token', 'tmr_token', 'accessToken', 'trustmyrecord_refresh_token',
       'refreshToken', 'refresh_token', 'tmr_refresh_token'].forEach(function (k) {
        localStorage.removeItem(k);
      });
    } catch (e) {}
  }

  function doLogout(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Logging Out…'; }
    function done() {
      clearStoredTokens();
      window.dispatchEvent(new CustomEvent('tmr-auth-changed', { detail: { loggedIn: false } }));
      window.location.href = '/';
    }
    try {
      if (window.auth && typeof window.auth.logout === 'function') window.auth.logout().then(done, done);
      else if (window.api && typeof window.api.logout === 'function') window.api.logout().then(done, done);
      else done();
    } catch (e) { done(); }
  }

  function init() {
    if (!document.body.classList.contains('tmr-ds')) return;   // opt-in only
    buildNav();
    buildFooter();

    // A 60-minute-old ACCESS token is not a logged-out user — the refresh token
    // is valid for a year. resolveUser() refreshes and retries, and only reports
    // 'signed-out' when the server rejects the refresh token itself. 'unknown'
    // (offline / CORS / Render cold-start 5xx) leaves the header untouched.
    if (S) {
      if (!S.hasTokens()) { signOutHeader(); return; }
      S.resolveUser().then(function (res) {
        if (res.state === 'ok') renderUser(res.user);
        else if (res.state === 'signed-out') signOutHeader();
        else if (!cachedUser()) signOutHeader();   // unknown + nothing cached: no permanent skeleton
      });
      return;
    }

    // --- fallback: tmr-session.js missing ---------------------------------
    var t = token();
    if (!t) { signOutHeader(); return; }
    fetch(API + '/auth/me', { headers: { Accept: 'application/json', Authorization: 'Bearer ' + t } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) renderUser(d.user || d); else signOutHeader(); })
      .catch(function () { signOutHeader(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
