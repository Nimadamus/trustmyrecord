/* =============================================================================
   TrustMyRecord - MLB research measurement (GA4 G-V5MCVXS2HE)

   WHY THIS EXISTS
   Audited 2026-08-23: /handicapping/ and /handicapping/mlb/ carried NO analytics
   of any kind. Not gtag, not tmr-analytics.js, nothing in the nav or session
   bundles either. Every question worth asking about the hub (does organic
   traffic land here, does anyone open a matchup, does anyone move on to the
   simulator, does anyone sign up) was unanswerable because nothing was recorded.

   This file depends on tmr-analytics.js having already loaded gtag and defined
   window.tmrTrack. If it has not, this one loads gtag itself, so a page can ship
   either script alone and still report.

   It NEVER records anything a member typed, a username, or an id. Team names,
   slate dates and link targets only.
   ========================================================================== */
(function () {
  'use strict';

  var GA_ID = 'G-V5MCVXS2HE';

  /* --- make sure gtag exists, exactly once ------------------------------- */
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function () { window.dataLayer.push(arguments); };
  }
  if (!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
  }
  function track(name, params) {
    try { window.gtag('event', name, params || {}); } catch (e) {}
  }
  if (typeof window.tmrTrack !== 'function') window.tmrTrack = track;

  /* --- how did this visit arrive? ---------------------------------------- */
  /* GA4 has its own channel grouping, but it is not queryable from the page and
     we want the entry class attached to every MLB event so a funnel can be read
     without joining sessions by hand. Three buckets, decided from the referrer
     and the query string only. */
  function entryClass() {
    var q = location.search || '';
    if (/[?&]utm_/.test(q)) return 'campaign';
    var ref = document.referrer || '';
    if (!ref) return 'direct';
    var host = '';
    try { host = new URL(ref).hostname.toLowerCase(); } catch (e) { return 'unknown'; }
    if (host === location.hostname.toLowerCase()) return 'internal';
    if (/(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|startpage)\./.test(host)) return 'organic_search';
    if (/(^|\.)(x|twitter|t|reddit|facebook|instagram|linkedin|youtube)\.(com|co)$/.test(host)) return 'social';
    return 'referral';
  }

  /* --- new or returning? -------------------------------------------------- */
  /* One localStorage key, first-party, no identifier in it: the ISO day of the
     first visit that ever ran this script. A returning visitor is any visit on a
     later day. Wrapped because private windows throw on access. */
  var KEY = 'tmr_mlb_first_seen';
  function visitorClass() {
    try {
      var today = new Date().toISOString().slice(0, 10);
      var first = window.localStorage.getItem(KEY);
      if (!first) { window.localStorage.setItem(KEY, today); return 'new'; }
      return first === today ? 'same_day' : 'returning';
    } catch (e) { return 'unknown'; }
  }

  var ROOT = document.querySelector('[data-mlb-analytics]') || document.body;
  var SURFACE = (ROOT && ROOT.getAttribute('data-mlb-analytics')) || 'mlb_other';
  var SLATE = (ROOT && ROOT.getAttribute('data-slate-date')) || '';
  var MATCHUP = (ROOT && ROOT.getAttribute('data-matchup')) || '';

  var base = {
    surface: SURFACE,
    entry: entryClass(),
    visitor: visitorClass(),
    page_path: location.pathname
  };
  if (SLATE) base.slate_date = SLATE;
  if (MATCHUP) base.matchup = MATCHUP;

  function withBase(extra) {
    var o = {}, k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) o[k] = base[k];
    if (extra) for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    return o;
  }

  /* --- landing ------------------------------------------------------------ */
  var games = document.querySelectorAll("[data-mm-game], [data-game]").length;
  track('mlb_research_landing', withBase(games ? { games_listed: games } : null));

  /* --- outbound-to-product clicks ---------------------------------------- */
  /* Classified by destination rather than by where the link sits, so the same
     event answers "did anyone reach the simulator from MLB research" no matter
     which of our pages the link was on. */
  var ROUTES = [
    [/^\/mlb-season-simulator\//, 'mlb_season_simulator'],
    [/^\/mlb-(simulator|game-simulator|playoff-simulator|predictions-simulator|simulation-predictions)\//, 'mlb_simulator'],
    [/^\/trendspotter/, 'trend_spotter'],
    [/^\/betlegend-pro\//, 'betlegend_pro'],
    [/^\/(matchups|matchup-of-the-day)\//, 'game_file'],
    [/^\/mlb-handicappers\//, 'mlb_handicappers'],
    [/^\/mlb-pick-tracker\//, 'mlb_pick_tracker'],
    [/^\/tools\//, 'tools_hub'],
    [/^\/handicapping\/mlb\/probable-pitchers\//, 'probable_pitchers'],
    [/^\/handicapping\/mlb\/odds\//, 'mlb_odds'],
    [/^\/handicapping\/mlb\/trends\//, 'mlb_trends'],
    [/^\/handicapping\/mlb\/[a-z0-9-]+-vs-[a-z0-9-]+-\d{4}-\d{2}-\d{2}/, 'matchup_page'],
    [/^\/handicapping\/mlb\//, 'mlb_hub'],
    [/^\/(register|signup|join)\//, 'signup'],
    [/^\/sportsbook\//, 'make_pick']
  ];
  function classify(pathname) {
    for (var i = 0; i < ROUTES.length; i++) if (ROUTES[i][0].test(pathname)) return ROUTES[i][1];
    return null;
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(href)) return;
    var url;
    try { url = new URL(href, location.href); } catch (err) { return; }
    if (url.hostname !== location.hostname) return;
    var target = classify(url.pathname);
    if (!target) return;
    var name = target === 'signup' ? 'mlb_signup_click' : 'mlb_research_click';
    track(name, withBase({
      target: target,
      to_path: url.pathname,
      anchor_text: (a.textContent || '').trim().slice(0, 60)
    }));
  }, true);

  /* --- matchup card opened on the hub ------------------------------------ */
  /* The hub's own card template is the only thing that emits [data-toggle], and
     it flips aria-expanded itself. Reading the attribute AFTER the hub's handler
     has run would be a race, so this reads the value BEFORE the click and reports
     the state the click is moving to. */
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-toggle]') : null;
    if (!btn) return;
    var card = btn.closest('[data-game]');
    var willOpen = btn.getAttribute('aria-expanded') !== 'true';
    if (!willOpen) return;
    var away = card && card.querySelector('[data-away-name]');
    var home = card && card.querySelector('[data-home-name]');
    track('mlb_matchup_open', withBase({
      away_team: away ? (away.textContent || '').trim() : '',
      home_team: home ? (home.textContent || '').trim() : ''
    }));
  }, true);
})();
