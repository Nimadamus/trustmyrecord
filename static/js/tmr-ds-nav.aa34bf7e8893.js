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

  /* THE HEADER'S PLACE IN THE CASCADE (2026-08-31).

     Two things have to be true for one shared navbar to actually render the
     same on 671 documents, and neither of them is true by default:

     1. tmr-navbar.css has to be the LAST word on the bar's geometry. It was not
        everywhere: /profile/ links it and then links tmr-ds.css after it, so
        tmr-ds.css's `--nav-h:70px` beat tmr-navbar.css's scaled
        `calc(70px * var(--home-nav-scale))` on that page and its bar came out
        71px against every other page's 83px. Moving the existing link to the
        end of <head> fixes it for whatever page happens to have that order,
        without touching 671 heads or caring which ones they are.

     2. Page stylesheets must not be able to reach into the header at all — see
        the measurements in tmr-ds-header.css, which is appended after it. */
  function injectHeaderCSS() {
    var nav = document.querySelector('link[href*="tmr-navbar.css"]');
    /* A page that mounts this component but never linked the geometry sheet
       renders it against tmr-ds.css's unscaled --nav-h and comes out 5-12px
       shorter than the rest of the site. That is not a per-page mistake to go
       and fix 129 times -- including 82 baked forum threads -- it is a missing
       dependency of the component, so the component supplies it. The homepage
       is the one page that must not get it: it carries its own inline copy of
       the same rules so that it cannot move, and it is identifiable by having
       --home-nav-scale already defined. */
    if (!nav) {
      var scale = '';
      try { scale = getComputedStyle(document.body).getPropertyValue('--home-nav-scale').trim(); } catch (e) {}
      if (!scale) {
        nav = document.createElement('link');
        nav.rel = 'stylesheet';
        nav.href = '/static/css/tmr-navbar.css?v=7744beacad17';
      }
    }
    if (nav) document.head.appendChild(nav);

    var HREF = '/static/css/tmr-ds-header.4de36f3898ee.css';
    if (document.querySelector('link[href^="' + HREF + '"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = HREF;
    document.head.appendChild(l);
  }
  /* deferred to init(): it reads document.body */

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
    /* Added 2026-08-11. The daily article was reachable from the FOOTER and
       from the homepage ticker card — and the ticker card only appears on days
       an article is actually published, so on any day it is not, the section
       had no entry point above the fold anywhere on the site. It sits in
       Sportsbook next to the Handicapping Hub because it is game analysis,
       which is what a reader is doing when they are in this menu.

       Repointed 2026-08-13 from the hub to /today/. The hub opens by explaining
       what the section is, so a reader who picked this menu item to read the
       day's piece landed on a page about the idea of the piece and had to find
       and click it. /today/ is a stable address that bakes with the day's
       article and hands off to it; the hub keeps its own footer and Explore
       entries, where an archive is what a reader is actually after. */
    ['/matchup-of-the-day/today/', 'Matchup of the Day'],
    /* Added 2026-08-23. /handicapping/ is a SPORT CHOOSER, and MLB is the only
       sport whose research hub is actually built, so every member who picked
       'Handicapping Hub' from this menu landed on a page whose only real
       destination was one more click away. This is that click, removed. The
       chooser stays: it is where the other leagues appear as they ship. Named
       for what the page is rather than for the product, because that is what a
       member is looking for in this menu. */
    ['/handicapping/mlb/', 'MLB Matchups Today'],
    ['/handicapping/', 'Handicapping Hub']
  ];
  var HANDICAPPERS = [
    ['/handicappers/', 'Find Handicappers'],
    ['/leaderboards/', 'Leaderboards'],
    /* ONE marketplace entry, not three. 'Buy Picks' + 'Picks for TMR' as
       siblings is what taught members there were two marketplaces: they are the
       Cash and TMR Coin tabs of a single board over a single set of listings,
       and /marketplace/ opens on either (?pay=cash | ?pay=tmr). Selling stays a
       separate entry because it is a different job, not a different store. */
    ['/marketplace/', 'Pick Marketplace'],
    ['/marketplace/sell/', 'Sell Your Picks']
  ];
  /* SPORTS GAMING, added 2026-08-27. The video-game side of the site used to
     live as a single 'Arena' row inside Compete, which is a brand word: it told
     nobody, member or crawler, that the section is head-to-head MLB The Show,
     Madden, NBA 2K, EA FC and NHL. It also left /online-gaming/, the rankings,
     the leagues and every game page with no nav entry at all -- reachable only
     from the Arena page body and the crawlable directory.

     This is its own top-level menu because the section is its own vertical, and
     because keeping it inside Compete is what blurred it into the two PICK
     competitions that also live there. Compete now holds only those: the
     handicapper challenge (pick vs pick on real games) and the TMR Coin
     challenge and its order book. Video games are here. Nothing was dropped:
     /arena/ keeps its URL and its row, it is just named as the product it is. */
  /* ONE small section, consolidated 2026-08-28. This menu had ten rows, then
     six, and every one of them fronted the same /api/gaming area: a hub, a
     directory, the Arena, the open board. A member reading 'Online Games',
     'Online Gaming', 'Open Challenges' and 'Arena' as four separate rows cannot
     tell which one lets them actually play, and the answer was all of them.
     /online-gaming/ is the single destination now: the games and the live
     challenge board on one page, with the create form on it. Rankings and
     leagues stay as rows because they are genuinely different screens. The
     Arena, the hub and the five game pages keep their URLs and are linked from
     the body of /online-gaming/, so nothing was retired, only de-duplicated out
     of the menu. /online-games/ is an alias stub to /online-gaming/. */
  var SPORTS_GAMING = [
    ['/online-gaming/', 'Online Gaming'],
    ['/arena/rankings/', 'Gaming Rankings'],
    ['/arena/leagues/', 'Gaming Leagues']
  ];
  /* Lights the Sports Gaming trigger from the section pages that are not rows
     in the menu, so a visitor on one of them is not left with nothing lit. */
  var SPORTS_GAMING_ALSO = [
    '/sports-gaming/',
    '/arena/',
    '/online-games/',
    '/mlb-the-show-stat-league/',
    '/sports-gaming/mlb-the-show/',
    '/sports-gaming/madden/',
    '/sports-gaming/nba-2k/',
    '/sports-gaming/ea-fc/',
    '/sports-gaming/nhl/'
  ];
  var COMPETE = [
    ['/contests/justbet-mlb/', 'Contest'],
    /* Named 'Handicapper Challenges' from 2026-08-27. The bare word 'Challenges'
       meant three different products across this site -- pick vs pick here, TMR
       Coin below, and console games in Sports Gaming -- and this menu was where
       a member met all three under the same label. */
    ['/challenges/', 'Handicapper Challenges'],
    /* TMR Challenges is the head to head system that stakes TMR Coin, deployed
       2026-08-18. It is a SEPARATE entry and deliberately not a replacement for
       /challenges/ above: both run side by side until the TMR one has live
       evidence behind it, so removing the older entry would retire a working
       feature on nothing but optimism. Named for what distinguishes them -- one
       stakes coin, the other does not -- rather than "Challenges (new)". */
    ['/tmr-challenges/', 'TMR Challenges'],
    /* TMR Match is the order book on top of TMR Challenges: post an offer at a
       size and a price and let strangers take part of it, rather than agreeing
       one bet with one person. Sits next to TMR Challenges because that is what
       settles every fill, and a member who understands one understands the other. */
    ['/tmr-match/', 'TMR Match'],
    ['/trivia/', 'Trivia'],
    ['/polls/', 'Polls']
  ];
  var COMMUNITY = [
    ['/community/', 'Community Home'],
    ['/feed/', 'Community Feed'],
    ['/forum/', 'Forums'],
    ['/sports-talk/', 'Sports Talk'],
    ['/chat/', 'Chat'],
    ['/messages/', 'Messages']
  ];
  /* TMR Coin was in this list from 2026-08-10 until 2026-08-27, when it was
     removed: Tools is for the analytical products (simulators, TrendSpotter,
     BetLegend Pro, Matchups, Handicapping Hub) and the coin belongs to the
     economy, not to them. The coin pill in the signed-in cluster on the right
     (see userHTML()) stays the single coin control, and /tmr-coin/ keeps its
     other entry points (footer Platform column, sitewide nav). */
  var TOOLS = [
    ['/tools/', 'Tools Hub'],
    /* The four game simulators used to sit here as four separate rows. They were
       collapsed into one entry on 2026-08-27: the suite keeps growing, and a Tools
       menu that grows a row per sport stops being a menu. /sports-simulators/ is
       the hub that carries all four (and whatever comes next) with a card each, so
       the menu stays one line while every simulator keeps its own indexed page at
       its own unchanged URL. Nothing left the site - only the dropdown. */
    ['/sports-simulators/', 'Sports Simulators'],
    ['/trendspotter/', 'TrendSpotter'],
    ['/betlegend-pro/', 'BetLegend Pro'],
    /* The daily MLB board keeps its own row rather than living behind the sport
       chooser: a member who came to this menu for MLB should reach today's games
       in one click, next to the tools that model them. */
    ['/handicapping/mlb/', 'MLB Matchups Today'],
    ['/handicapping/', 'Handicapping Hub']
  ];

  var FOOTER = [
    ['Platform', [
      ['/sportsbook/', 'Sportsbook'],
      ['/my-record/', 'My Record'],
      ['/marketplace/', 'Pick Marketplace'],
      ['/premium/', 'Premium']
    ]],
    ['Explore', [
      /* TMR Game Files joined Explore on 2026-08-10. Before this the entire
         /matchups/ section was reachable from exactly one place on the site —
         the homepage Matchup of the Day cover — and from nowhere in the nav or
         footer, so a visitor on any other page had no route to the archive and
         the crawl graph had a single entry point into a section meant to grow
         indefinitely. It sits in Explore rather than Tools because a Game File
         is editorial content, not a tool. One link, sitewide, crawlable. */
      /* Repointed 2026-08-11 to the daily section. /matchups/ is still a live,
         indexed archive of the Game Files published before the URL scheme
         changed, and it is linked from the new hub — but the sitewide nav entry
         belongs to the thing that publishes every day, not to the archive. */
      ['/matchup-of-the-day/', 'Matchup of the Day'],
      ['/handicapping/mlb/', 'MLB Matchups'],
      /* Sitewide crawlable entry for the video-game vertical, added
         2026-08-27 alongside the Sports Gaming dropdown. */
      ['/online-gaming/', 'Online Gaming'],
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
  /**
   * TODAY_20260809: the one authenticated-only entry in the primary nav.
   *
   * Rendered ONLY when this browser already holds a session, which hasTokens()
   * can answer synchronously from localStorage - so the item is present in the
   * very first paint of the nav rather than appearing a moment later and
   * pushing the rest of the bar sideways.
   *
   * A logged-out visitor, and therefore every crawler, gets a nav that is
   * byte-identical to the one shipped before this release: the public,
   * crawlable link graph is unchanged. Asserted in tests/today-card-test.js.
   */
  /* Today is a `.ds-navitem` in LINK mode — the same top-level component the
     dropdowns use, just pointing at a route instead of opening a panel. It is
     not a bespoke nav element: everything about how it looks and spaces itself
     comes from `.ds-navitem` in tmr-ds.css, and `--link` only tells that
     component to leave the trailing chevron slot empty. `ds-todaylink` is kept
     purely as a hook for tests/analytics; it carries no styling. */
  /* REMOVED 2026-08-31 (requested): this rendered as the FIRST item in
     .ds-mainnav, i.e. immediately beside the wordmark, where it read as
     stray text rather than as part of the menu row. The /today/ route is
     untouched; only its slot in the top bar is gone. */
  function todayLink() {
    return '';
  }
  /* Routes that should light the Tools trigger even though they are no longer
     rows in the menu. Collapsing the four simulators behind /sports-simulators/
     would otherwise leave a visitor on /nhl-simulator/ with no lit trigger at
     all, which reads as "you are nowhere". */
  var TOOLS_ALSO = ['/sports-simulators/', '/mlb-simulator/', '/nfl-simulator/',
                    '/nba-simulator/', '/nhl-simulator/'];
  /* hideOnOwnPage: drop this trigger on the page it is named for. On
     /sportsbook/ the word SPORTSBOOK is the page you are already reading, not a
     destination. Opt-in per menu rather than a blanket rule, because
     /handicappers/ is an approved locked page and must keep its own tab.
     Requested 2026-08-31. */
  function menu(label, list, alsoCurrent, hideOnOwnPage) {
    if (hideOnOwnPage && list.length && isCurrent(list[0][0])) return '';
    var on = list.some(function (r) { return isCurrent(r[0]); }) ||
      (alsoCurrent || []).some(function (h) { return isCurrent(h); });
    return '<div class="ds-menu' + (on ? ' is-current' : '') + '">' +
      '<button type="button" class="ds-navitem ds-navitem--trigger" aria-expanded="false" aria-haspopup="true">' + label + '</button>' +
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
            todayLink() +
            menu('Sportsbook', SPORTSBOOK, null, true) +
            menu('Handicappers', HANDICAPPERS) +
            menu('Online Gaming', SPORTS_GAMING, SPORTS_GAMING_ALSO) +
            menu('Compete', COMPETE) +
            menu('Community', COMMUNITY) +
            menu('Tools', TOOLS, TOOLS_ALSO) +
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
    '/static/js/config.js?v=a6695bfebf66',
    '/static/js/backend-api.js?v=68c9d15dbed8',
    '/static/js/auth-persistent.js?v=533b6a5999e2',
    '/static/js/notifications.js?v=395be0dd8cdf'
  ];

  /* REALM-LEVEL LOAD REGISTRY (2026-08-06)
     The old guard asked the DOM: "is there already a <script src=...> for this?"
     That is the wrong scope. document.open()/document.write() -- which
     tmr-profile-hydrate.js uses to mount the real /profile/ app at a
     /u/<username>/ URL -- replaces the DOM but KEEPS the JavaScript realm alive.
     renderUser() runs off an /api/users/me response, so on any load where that
     response landed either side of the swap the guard inspected a document that
     no longer contained (or did not yet contain) the tag, and injected a second
     copy of backend-api.js into a realm that already had one:
         Uncaught SyntaxError: Identifier 'TrustMyRecordAPI' has already been declared
     window survives the swap, so the load is recorded there. The DOM check is kept
     alongside it so a page that hard-codes the tag still short-circuits. */
  function loadedRegistry() {
    if (!window.__TMR_SCRIPTS_LOADED) window.__TMR_SCRIPTS_LOADED = {};
    return window.__TMR_SCRIPTS_LOADED;
  }

  function loadChain(list, i) {
    i = i || 0;
    if (i >= list.length) return;
    var base = list[i].split('?')[0];
    var reg = loadedRegistry();
    if (reg[base] || document.querySelector('script[src^="' + base + '"]')) {
      reg[base] = 1;
      return loadChain(list, i + 1);
    }
    reg[base] = 1;
    var s = document.createElement('script');
    s.src = list[i];
    s.onload = function () { loadChain(list, i + 1); };
    s.onerror = function () { loadChain(list, i + 1); };
    document.head.appendChild(s);
  }

  function userHTML(user) {
    var name = user.username || user.display_name || user.displayName || 'Account';
    // Only render an <img> when the account genuinely has an avatar. Deriving
    // /users/:id/avatar from the id called that route precisely when there was
    // nothing to serve — by design it 404s on a missing avatar — so every
    // avatar-less signed-in visitor fired a console 404 on every page before
    // falling back. The initials chip below is the fallback; use it directly.
    var src = user.avatar_url || user.avatarUrl || null;
    var av = src
      ? '<img class="v2nav-ava" src="' + esc(src) + '" alt="" onerror="this.outerHTML=\'<span class=&quot;v2nav-avl&quot;>' + initials(name) + '</span>\'">'
      : '<span class="v2nav-avl">' + initials(name) + '</span>';

    // DOM order IS the desktop reading order, left to right:
    //   coin balance -> bell -> My Record -> account.
    // It used to lead with the account block, which put the avatar between the
    // links and the CTA and left My Record hard against the right edge. The
    // mobile sheet pulls the account block back to the top with `order:-1`.
    return (
      // The single TMR Coin control. Hidden until populated so it never flashes
      // a stale/zero value; the homepage reserves its box so nothing shifts
      // when the real balance lands. Links to the wallet; the /tmr-coin/ page
      // itself is one click away under Tools.
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
      '<a class="ds-btn p sm" href="/my-record/">My Record</a>' +
      '<div class="ds-menu v2nav-menu">' +
        '<button type="button" class="v2nav-user" aria-expanded="false" aria-haspopup="true" title="' + esc(name) + '">' +
          av + '<span class="v2nav-name">' + esc(name) + '</span>' +
        '</button>' +
        '<div class="ds-menu-panel v2nav-menu-panel" role="menu" aria-label="Account menu">' +
          '<a href="/u/' + encodeURIComponent(name) + '/" role="menuitem">My Profile</a>' +
          '<a href="/profile/?action=edit" role="menuitem">Settings</a>' +
          '<a href="/contact/" role="menuitem">Help &amp; Support</a>' +
          '<button type="button" class="v2nav-logout" role="menuitem" data-tmr-logout>Log Out</button>' +
        '</div>' +
      '</div>');
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
    /* Opt-in only, in either mode. `tmr-ds` adopts the whole design system;
       `tmr-ds-shell` takes the shared header and footer and nothing else, for a
       mature page that keeps its own visual language (see the SHELL-ONLY
       ADOPTION note in tmr-ds.css).

       This gate previously tested the literal `tmr-ds` class, so a shell-mode
       page loaded the stylesheet, carried the class, and then got no navbar at
       all -- the CSS half of shell mode existed without the JS half. Caught on
       /sportsbook/ before it shipped: dsNav=false, dsFooter=false. */
    var cl = document.body.classList;
    if (!cl.contains('tmr-ds') && !cl.contains('tmr-ds-shell')) return;
    injectHeaderCSS();
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
