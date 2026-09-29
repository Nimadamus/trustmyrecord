/* =============================================================================
   TrustMyRecord - Sports Takes feed. TAKES_FEED_20260927
   -----------------------------------------------------------------------------
   One reusable feed of Takes (feed posts, GET /api/feed?filter=posts) drawn as
   social cards: member face, name, verified mark and record, relative time,
   sport badge, team and matchup chip, the take itself, and Like / Reply /
   Share. A card opens its thread in a sheet with every reply and a reply box.

   HOW A PAGE USES IT

     TMRTakesFeed.mount(el, {
       username: 'BetLegend',   // only this member's takes (profile)
       sport: 'NFL',            // only takes tagged with this sport
       team: 'San Francisco 49ers', // only takes tagged with this team
       composer: true,          // TMRTake feed composer on top (signed in only)
       composerContext: {},     // passed to TMRTake.mount (source, sport, team...)
       pageSize: 10,            // cards before "Show more"
       compact: false,          // preview: pageSize cards, no pager, 3 line bodies
       autoLoad: false,         // load the next page as the reader scrolls
       hideRecord: false,       // drop the record pill (the page already shows it)
       emptyText: '...',        // shown when there is nothing to show
       onCount: function (n) {} // number of takes loaded, for a header meta
     })

   Identity order for the face, one rule everywhere: uploaded avatar, else the
   member's first favorite team's mark, else the neutral TMR member mark. No
   initials. Team and matchup chips only draw from EXPLICIT tags on the post
   (context_team / context_label, or the sport column). Nothing is inferred
   from the text.

   New takes posted anywhere on the page (the TMRTake composer fires
   `tmr:take-posted`) are placed at the top of every mounted feed they belong
   to, without a reload.
   ============================================================================= */
(function (window, document) {
  'use strict';
  if (window.TMRTakesFeed) return;

  var FETCH_LIMIT = 50;
  var MAX_SCAN_PAGES = 4; /* only reached when the server filters by member */
  var feeds = [];

  function apiBase() {
    if (window.TMRSession && window.TMRSession.api) return window.TMRSession.api;
    var cfg = (typeof CONFIG !== 'undefined' && CONFIG) ? CONFIG : window.CONFIG;
    return ((cfg && cfg.api && cfg.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api').replace(/\/+$/, '');
  }
  function signedIn() {
    var S = window.TMRSession;
    return !!(S && S.hasTokens && S.hasTokens() && S.authFetch);
  }
  function me() {
    var S = window.TMRSession;
    var u = S && S.getCachedUser && S.getCachedUser();
    return u && (u.username || u.id) ? u : null;
  }
  function request(path, init) {
    init = init || {};
    init.headers = Object.assign({ Accept: 'application/json' }, init.headers || {});
    var S = window.TMRSession;
    var f = signedIn() ? S.authFetch.bind(S) : window.fetch.bind(window);
    return f(apiBase() + path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error((d && d.error) || ('HTTP ' + r.status)); e.status = r.status; throw e; }
        return d;
      });
    });
  }
  function loginUrl() { return '/login/?next=' + encodeURIComponent(location.pathname + location.search); }
  function profileUrl(u) { return '/profile/?user=' + encodeURIComponent(u || ''); }
  function postUrl(id) { return location.origin + '/feed/?post=' + encodeURIComponent(id); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

  /* ------------------------------------------------------------------ */
  /* Formatting                                                         */
  /* ------------------------------------------------------------------ */

  function relTime(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 45) return 'now';
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    if (s < 7 * 86400) return Math.floor(s / 86400) + 'd';
    var d = new Date(t);
    var o = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return d.toLocaleDateString(undefined, o);
  }
  function fullTime(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  function compact(n) {
    n = num(n);
    if (n < 1000) return String(n);
    if (n < 10000) return (Math.round(n / 100) / 10).toString().replace(/\.0$/, '') + 'K';
    return Math.round(n / 1000) + 'K';
  }

  var SPORT_ALIASES = {
    americanfootball_nfl: 'NFL', americanfootball_ncaaf: 'NCAAF', baseball_mlb: 'MLB',
    basketball_nba: 'NBA', basketball_ncaab: 'NCAAB', icehockey_nhl: 'NHL', basketball_wnba: 'WNBA',
    football: 'NFL', 'college football': 'NCAAF', cfb: 'NCAAF', cbb: 'NCAAB', soccer: 'Soccer', mma: 'UFC', ufc: 'UFC'
  };
  function sportLabel(v) {
    if (!v) return '';
    var k = lc(v);
    if (SPORT_ALIASES[k]) return SPORT_ALIASES[k];
    if (k.indexOf('soccer') === 0) return 'Soccer';
    var s = String(v).trim();
    return s.length <= 6 ? s.toUpperCase() : s;
  }

  /* ------------------------------------------------------------------ */
  /* Icons                                                              */
  /* ------------------------------------------------------------------ */

  var ICON = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3l-1.2-1.1C6.1 15 3 12.2 3 8.7 3 6 5.1 4 7.7 4c1.6 0 3.2.8 4.3 2 1.1-1.2 2.7-2 4.3-2C18.9 4 21 6 21 8.7c0 3.5-3.1 6.3-7.8 10.5L12 20.3z"/></svg>',
    reply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M5 13v5.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V13"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7.9-2.9-.9-2.9 2.5-1.7.9-2.9 3 .2z"/><path d="M8.2 12.3l2.5 2.4 5.1-5.2" fill="none" stroke="#06121F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  function iconSpan(name, cls) {
    var s = el('span', cls || 'tkf-ic');
    s.innerHTML = ICON[name];
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Styles                                                             */
  /* ------------------------------------------------------------------ */

  function injectStyles() {
    if (document.getElementById('tmr-takes-feed-css')) return;
    var css = [
      '.tkf{--tkf-card:#111F35;--tkf-card2:#0C1728;--tkf-card-h:#14264A;--tkf-line:rgba(122,152,198,.17);--tkf-sep:rgba(122,152,198,.12);--tkf-ink:#F3F7FD;--tkf-body:#DCE6F3;--tkf-mut:#8B9EB9;--tkf-brand:#3D9BFF;--tkf-vf:#22D2C0;--tkf-like:#FF5A79;',
      'font-family:Inter,"Segoe UI",Arial,sans-serif;color:var(--tkf-ink);display:flex;flex-direction:column;gap:14px;text-align:left}',
      '.tkf *{box-sizing:border-box}',
      '.tkf-list{display:flex;flex-direction:column;gap:14px}',
      /* Card: layered gradient, inset top light, sport colored edge. */
      '.tkf-card{--sp:#3D9BFF;position:relative;display:block;padding:16px 18px 4px 22px;background:linear-gradient(180deg,var(--tkf-card) 0%,var(--tkf-card2) 100%);border:1px solid var(--tkf-line);border-radius:18px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 12px 28px -20px rgba(0,0,0,.85);cursor:pointer;overflow:hidden;transition:background .18s ease,border-color .18s ease,transform .18s ease,box-shadow .18s ease}',
      '.tkf-card::before{content:"";position:absolute;left:0;top:16px;bottom:16px;width:3px;border-radius:0 3px 3px 0;background:linear-gradient(180deg,var(--sp),color-mix(in srgb,var(--sp) 25%,transparent));opacity:.85}',
      '.tkf-card:not([data-sport])::before{opacity:.35}',
      '.tkf-card:hover{background:linear-gradient(180deg,var(--tkf-card-h) 0%,#0E1B30 100%);border-color:rgba(61,155,255,.38);transform:translateY(-1px);box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 18px 36px -20px rgba(29,127,232,.55)}',
      '.tkf-card:focus-visible{outline:2px solid var(--tkf-brand);outline-offset:2px}',
      '.tkf-card.is-new{animation:tkfIn .45s ease}',
      '@keyframes tkfIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}',
      '.tkf-card.is-static{cursor:default}.tkf-card.is-static:hover{background:linear-gradient(180deg,var(--tkf-card) 0%,var(--tkf-card2) 100%);border-color:var(--tkf-line);transform:none}',
      /* Face */
      '.tkf-av{position:relative;display:block;width:42px;height:42px;border-radius:50%;overflow:hidden;background:#13243A;flex:none;box-shadow:0 0 0 2px #0C1728,0 0 0 3.5px rgba(61,155,255,.35)}',
      '.tkf-av img,.tkf-av svg{width:100%;height:100%;display:block;object-fit:cover}',
      '.tkf-av.is-team{background:#fff;box-shadow:0 0 0 2px #0C1728,0 0 0 3.5px var(--tkf-ring,rgba(61,155,255,.35))}',
      '.tkf-av.is-team img{object-fit:contain;padding:17%}',
      '.tkf-av.sm{width:34px;height:34px}',
      /* Head: face, name over handle and time, league tag */
      '.tkf-top{display:flex;align-items:center;gap:12px;min-width:0}',
      '.tkf-who{flex:1;min-width:0}',
      '.tkf-head{display:flex;align-items:center;gap:6px;min-width:0;line-height:1.25}',
      '.tkf-name{font:800 15.5px/1.25 Inter,"Segoe UI",sans-serif;color:var(--tkf-ink);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
      '.tkf-name:hover{text-decoration:underline}',
      '.tkf-vf{flex:none;display:inline-flex;width:16px;height:16px}.tkf-vf svg{width:100%;height:100%;fill:var(--tkf-vf,#22D2C0)}',
      '.tkf-rec{flex:none;font:700 11.5px/1 Inter,sans-serif;color:#B4C4D8;background:rgba(147,169,192,.1);border:1px solid rgba(147,169,192,.18);border-radius:999px;padding:3px 7px;font-variant-numeric:tabular-nums}',
      '.tkf-meta{display:flex;align-items:center;gap:6px;margin-top:3px;min-width:0;font:500 12.5px/1.2 Inter,sans-serif;color:var(--tkf-mut)}',
      '.tkf-handle{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
      '.tkf-dot{flex:none;color:#50637C}',
      '.tkf-time{flex:none;font:500 12.5px/1 Inter,sans-serif;color:var(--tkf-mut);text-decoration:none}',
      '.tkf-time:hover{text-decoration:underline;color:var(--tkf-ink)}',
      '.tkf-sport{flex:none;display:inline-flex;align-items:center;gap:6px;font:800 10.5px/1 Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:color-mix(in srgb,var(--sp) 75%,#fff);background:color-mix(in srgb,var(--sp) 13%,transparent);border:1px solid color-mix(in srgb,var(--sp) 34%,transparent);border-radius:999px;padding:5px 10px 5px 8px}',
      '.tkf-sport::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--sp);box-shadow:0 0 8px var(--sp)}',
      /* Context */
      '.tkf-ctx{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}',
      '.tkf-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:3px 10px 3px 4px;border-radius:999px;background:rgba(147,169,192,.09);border:1px solid rgba(147,169,192,.2);font:700 12px/1.3 Inter,sans-serif;color:#D5E1EE;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tkf-chip.no-logo{padding-left:10px}',
      '.tkf-chip img{width:18px;height:18px;object-fit:contain;flex:none}',
      '.tkf-chip small{font:700 10.5px/1 Inter,sans-serif;letter-spacing:.06em;color:var(--tkf-mut)}',
      /* Body */
      '.tkf-body{margin:12px 0 2px;font:500 16px/1.58 Inter,"Segoe UI",sans-serif;letter-spacing:-.005em;color:var(--tkf-body);white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}',
      '.tkf-more{display:inline-block;margin-top:6px;font:700 13px/1.2 Inter,sans-serif;color:var(--tkf-brand);background:none;border:0;padding:0;cursor:pointer}',
      '.tkf-more:hover{text-decoration:underline}',
      /* Actions */
      '.tkf-actions{display:flex;align-items:center;gap:6px;margin:12px -8px 0 -10px;padding:5px 0;border-top:1px solid var(--tkf-sep)}',
      '.tkf-act{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 10px;border:0;border-radius:999px;background:none;color:var(--tkf-mut);font:600 13.5px/1 Inter,sans-serif;cursor:pointer;transition:background .15s,color .15s}',
      '.tkf-act:hover{background:rgba(147,169,192,.1);color:var(--tkf-ink)}',
      '.tkf-act .tkf-ic{display:inline-flex;width:19px;height:19px}',
      '.tkf-act svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
      '.tkf-act.like:hover{color:var(--tkf-like);background:rgba(255,90,121,.1)}',
      '.tkf-act.like.is-on{color:var(--tkf-like)}',
      '.tkf-act.like.is-on svg{fill:currentColor;stroke:currentColor}',
      '.tkf-act.like.pop .tkf-ic{animation:tkfPop .35s ease}',
      '@keyframes tkfPop{50%{transform:scale(1.28)}}',
      '.tkf-act.reply:hover{color:var(--tkf-brand);background:rgba(61,155,255,.1)}',
      '.tkf-act.share{margin-left:auto}',
      '.tkf-act b{font-weight:700;font-variant-numeric:tabular-nums}',
      /* States */
      '.tkf-empty,.tkf-err{padding:26px 18px;border:1px dashed rgba(115,139,174,.3);border-radius:16px;text-align:center;font:500 14.5px/1.5 Inter,sans-serif;color:var(--tkf-mut)}',
      '.tkf-err button,.tkf-loadmore{font:700 13.5px/1 Inter,sans-serif;color:var(--tkf-brand);background:rgba(61,155,255,.08);border:1px solid rgba(61,155,255,.35);border-radius:999px;padding:10px 18px;cursor:pointer}',
      '.tkf-err button{margin-left:8px;padding:6px 12px}',
      '.tkf-loadmore{align-self:center}',
      '.tkf-sentinel{height:1px}',
      '.tkf-end{align-self:center;font:600 12.5px/1 Inter,sans-serif;color:#61748F;letter-spacing:.04em;padding:6px 0 2px}',
      /* Compact: the profile Overview preview. Three lines per take at most. */
      '.tkf.is-compact .tkf-list{gap:12px}',
      '.tkf.is-compact .tkf-body{font-size:15px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
      '.tkf.is-compact .tkf-more:not([data-act])' + '{display:none!important}',
      '.tkf-loadmore:hover,.tkf-err button:hover{background:rgba(61,155,255,.16)}',
      '.tkf-skel{height:128px;border-radius:18px;background:linear-gradient(90deg,#0E1A2B 0%,#15284A 50%,#0E1A2B 100%);background-size:200% 100%;animation:tkfSk 1.2s linear infinite;border:1px solid var(--tkf-line)}',
      '@keyframes tkfSk{to{background-position:-200% 0}}',
      '.tkf-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483600;background:#0E1A2B;color:#F1F6FC;border:1px solid rgba(61,155,255,.45);border-radius:999px;padding:10px 18px;font:600 14px/1.2 Inter,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4)}',
      /* Thread sheet */
      '.tkf-scrim{position:fixed;inset:0;z-index:2147483000;background:rgba(3,8,15,.72);backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px 16px;overflow-y:auto}',
      '.tkf-sheet{width:min(640px,100%);background:#0A1523;border:1px solid rgba(115,139,174,.25);border-radius:20px;box-shadow:0 30px 80px rgba(0,0,0,.55);overflow:hidden;font-family:Inter,"Segoe UI",Arial,sans-serif;color:#F1F6FC}',
      '.tkf-sheet-bar{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 12px 18px;border-bottom:1px solid rgba(115,139,174,.16)}',
      '.tkf-sheet-bar h2{margin:0;font:800 16px/1.2 Inter,sans-serif;color:#F1F6FC}',
      '.tkf-x{display:inline-flex;width:36px;height:36px;align-items:center;justify-content:center;border:0;border-radius:50%;background:none;color:#A9BBD0;cursor:pointer}',
      '.tkf-x:hover{background:rgba(147,169,192,.12);color:#fff}',
      '.tkf-x svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}',
      '.tkf-sheet .tkf{padding:12px 12px 0}',
      '.tkf-sheet .tkf-card{border:0;background:transparent;box-shadow:none;cursor:default;padding:6px 8px 4px}',
      '.tkf-sheet .tkf-card::before{display:none}',
      '.tkf-sheet .tkf-card:hover{background:transparent;box-shadow:none;transform:none}',
      '.tkf-sheet .tkf-body{font-size:19px}',
      '.tkf-replies{padding:4px 20px 8px;border-top:1px solid rgba(115,139,174,.14)}',
      '.tkf-replies-h{font:800 12px/1 Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#8397B0;margin:16px 0 6px}',
      '.tkf-reply{display:grid;grid-template-columns:34px minmax(0,1fr);gap:10px;padding:10px 0;border-top:1px solid rgba(115,139,174,.1)}',
      '.tkf-reply:first-of-type{border-top:0}',
      '.tkf-reply .tkf-name{font-size:14px}',
      '.tkf-reply .tkf-time{font-size:12px}',
      '.tkf-reply-body{margin-top:3px;font:500 15px/1.5 Inter,sans-serif;color:#DCE6F1;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}',
      '.tkf-noreply{padding:14px 0 6px;color:#8397B0;font:500 14px/1.4 Inter,sans-serif}',
      '.tkf-rbox{display:flex;gap:10px;align-items:flex-end;padding:12px 16px 16px;border-top:1px solid rgba(115,139,174,.16);background:#0C1929}',
      '.tkf-rbox textarea{flex:1;min-width:0;resize:none;min-height:44px;max-height:140px;padding:11px 13px;border-radius:12px;border:1px solid rgba(115,139,174,.3);background:#07111C;color:#F1F6FC;font:15px/1.4 Inter,sans-serif;outline:none}',
      '.tkf-rbox textarea:focus{border-color:#3D9BFF;box-shadow:0 0 0 3px rgba(61,155,255,.18)}',
      '.tkf-rbox button{flex:none;min-height:44px;padding:0 18px;border:0;border-radius:12px;background:linear-gradient(180deg,#2F8CFF,#1D6FD8);color:#fff;font:800 14.5px/1 Inter,sans-serif;cursor:pointer}',
      '.tkf-rbox button:disabled{background:#1A2A3F;color:#5F7690;cursor:not-allowed}',
      '.tkf-rlogin{display:block;padding:14px 18px 18px;border-top:1px solid rgba(115,139,174,.16);font:600 14.5px/1.4 Inter,sans-serif;color:#A9BBD0;text-decoration:none}',
      '.tkf-rlogin b{color:#3D9BFF}',
      '.tkf-rerr{padding:0 16px 12px;color:#FF8A80;font:500 13px/1.4 Inter,sans-serif;background:#0C1929}',
      'html.tkf-lock,html.tkf-lock body{overflow:hidden}',
      /* Guard against the host page's global button/link/svg rules, several of
         which are !important with long :not() chains. :is(.x,#_tkf) carries ID
         weight without needing an ID on the page. */
      ':is(.tkf,#_tkf) .tkf-act,:is(.tkf,#_tkf) .tkf-more,:is(.tkf-sheet,#_tkf) .tkf-x,:is(.tkf-sheet,#_tkf) .tkf-act{border:0!important;box-shadow:none!important;text-transform:none!important;letter-spacing:0!important;min-width:0!important;width:auto!important;margin-top:0;background-color:transparent}',
      ':is(.tkf,#_tkf) .tkf-act{height:34px!important;padding:0 10px!important;border-radius:999px!important;color:var(--tkf-mut)!important;font:600 13.5px/1 Inter,sans-serif!important}',
      ':is(.tkf,#_tkf) .tkf-act:hover{background-color:rgba(147,169,192,.1)!important;color:var(--tkf-ink)!important}',
      ':is(.tkf,#_tkf) .tkf-act.like:hover,:is(.tkf,#_tkf) .tkf-act.like.is-on{color:var(--tkf-like)!important}',
      ':is(.tkf,#_tkf) .tkf-act.like:hover{background-color:rgba(255,90,121,.1)!important}',
      ':is(.tkf,#_tkf) .tkf-act.reply:hover{color:var(--tkf-brand)!important;background-color:rgba(61,155,255,.1)!important}',
      ':is(.tkf,#_tkf) .tkf-more{padding:0!important;height:auto!important;color:var(--tkf-brand)!important;font:700 13px/1.2 Inter,sans-serif!important}',
      ':is(.tkf,#_tkf) .tkf-name,:is(.tkf,#_tkf) .tkf-name:visited{color:var(--tkf-ink)!important}',
      ':is(.tkf,#_tkf) .tkf-time,:is(.tkf,#_tkf) .tkf-time:visited{color:var(--tkf-mut)!important}',
      ':is(.tkf,#_tkf) .tkf-chip{color:#D5E1EE!important}',
      ':is(.tkf-sheet,#_tkf) .tkf-x{width:36px!important;height:36px!important;padding:0!important;border-radius:50%!important;color:#C9D7E6!important}',
      ':is(.tkf-sheet,#_tkf) .tkf-x svg{width:20px!important;height:20px!important;display:block;fill:none!important;stroke:currentColor!important;stroke-width:2!important}',
      ':is(.tkf-sheet,#_tkf) .tkf-x svg path{stroke:currentColor!important;fill:none!important}',
      ':is(.tkf-sheet,#_tkf) .tkf-rlogin,:is(.tkf-sheet,#_tkf) .tkf-rlogin:visited{color:#A9BBD0!important}',
      ':is(.tkf-sheet,#_tkf) .tkf-rlogin b{color:#3D9BFF!important}',
      ':is(.tkf-sheet,#_tkf) .tkf-rbox button{border:0!important;box-shadow:none!important;text-transform:none!important;letter-spacing:0!important}',
      ':is(.tkf,#_tkf) .tkf-act{background-color:transparent!important;border:0!important;gap:7px!important;display:inline-flex!important;align-items:center!important}',
      ':is(.tkf,#_tkf) .tkf-act .tkf-ic{width:19px!important;height:19px!important}',
      ':is(.tkf,#_tkf) .tkf-act.share{margin-left:auto!important}',
      ':is(.tkf,#_tkf) .tkf-more{background:none!important;border:0!important;min-height:0!important;display:inline-block!important;margin-top:6px!important}',
      ':is(.tkf-sheet,#_tkf) .tkf-rbox button{min-height:44px!important;padding:0 18px!important;border-radius:12px!important;background:linear-gradient(180deg,#2F8CFF,#1D6FD8)!important;color:#fff!important}',
      ':is(.tkf-sheet,#_tkf) .tkf-rbox button:disabled{background:#1A2A3F!important;color:#5F7690!important}',
      ':is(.tkf-sheet,#_tkf) .tkf-x{background:none!important;border:0!important;display:inline-flex!important;align-items:center;justify-content:center}',
      ':is(.tkf-sheet,#_tkf) .tkf-x:hover{background:rgba(147,169,192,.12)!important}',
      ':is(.tkf,.tkf-sheet,#_tkf) .tkf-reply .tkf-time{color:#8397B0!important}',
      ':is(.tkf-sheet,#_tkf) .tkf-name,:is(.tkf-sheet,#_tkf) .tkf-name:visited{color:#F1F6FC!important}',
      ':is(.tkf-sheet,#_tkf) .tkf-rbox textarea{min-height:44px!important;max-height:140px!important;padding:11px 13px!important;resize:none!important;border-radius:12px!important;background:#07111C!important;color:#F1F6FC!important;border:1px solid rgba(115,139,174,.3)!important;font:15px/1.4 Inter,sans-serif!important;margin:0!important}',
      ':is(.tkf-sheet,#_tkf) .tkf-rbox textarea:focus{border-color:#3D9BFF!important}',
      '@media (max-width:600px){',
      '.tkf-card{padding:14px 14px 2px 18px;border-radius:16px}',
      '.tkf-card:hover{transform:none}',
      '.tkf-top{gap:10px}',
      '.tkf-av{width:40px;height:40px}',
      '.tkf-sport{padding:4px 8px 4px 7px}',
      '.tkf-name{font-size:15px}',
      '.tkf-rec{display:none}',
      '.tkf-body{font-size:16px}',
      ':is(.tkf,#_tkf) .tkf-act{padding:0 8px!important}',
      '.tkf-actions{gap:0}',
      '.tkf-scrim{padding:0;align-items:flex-end}',
      '.tkf-sheet{border-radius:18px 18px 0 0;max-height:92vh;display:flex;flex-direction:column}',
      '.tkf-sheet-scroll{overflow-y:auto;flex:1}',
      '.tkf-sheet .tkf-body{font-size:17px}',
      '.tkf-replies{padding:4px 14px 8px}',
      '.tkf-rbox{padding:10px 12px calc(12px + env(safe-area-inset-bottom))}',
      '}'
    ].join('');
    var s = el('style');
    s.id = 'tmr-takes-feed-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  var SPORT_COLOR = { NFL: '#5B9BFF', NCAAF: '#F2B84B', MLB: '#FF6B6B', NBA: '#FF9A3D', NCAAB: '#43D18A', NHL: '#9CC3E6', WNBA: '#FF8C42', Soccer: '#3DDC84', UFC: '#E0565B' };

  /* ------------------------------------------------------------------ */
  /* Identity                                                           */
  /* ------------------------------------------------------------------ */

  var NEUTRAL_SVG = '<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="tkfN" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#17324F"/><stop offset="1" stop-color="#0B1B2E"/></linearGradient></defs><rect width="40" height="40" fill="url(#tkfN)"/><circle cx="20" cy="15.5" r="6.5" fill="#8CC2FF"/><path d="M7.5 36c1.6-7 6.6-10.5 12.5-10.5S30.9 29 32.5 36z" fill="#8CC2FF"/></svg>';

  function teamLogo(name, light) {
    var T = window.TMRTeamLogo;
    if (!name || !T) return null;
    return (light ? (T.urlLight && T.urlLight(name)) : (T.url && T.url(name))) || null;
  }
  function firstTeam(u) {
    var t = u && u.favorite_teams;
    if (Array.isArray(t)) return t[0] || null;
    if (typeof t === 'string' && t) return t.replace(/^\{|\}$/g, '').split(',')[0].replace(/"/g, '') || null;
    return (u && u.favorite_team) || null;
  }

  /* Uploaded avatar, else favorite team mark on a white disc, else the neutral
     member mark. Each step falls through on a broken image, so no face is ever
     blank. */
  function face(u, small) {
    var a = el('a', 'tkf-av' + (small ? ' sm' : ''));
    a.href = profileUrl(u && u.username);
    a.setAttribute('aria-label', (u && (u.display_name || u.username)) || 'Member');
    var team = firstTeam(u);
    var logo = teamLogo(team, true);
    function neutral() { a.className = 'tkf-av' + (small ? ' sm' : ''); a.innerHTML = NEUTRAL_SVG; }
    function club() {
      if (!logo) { neutral(); return; }
      a.className = 'tkf-av is-team' + (small ? ' sm' : '');
      a.textContent = '';
      var img = el('img');
      img.alt = team;
      img.loading = 'lazy';
      img.onerror = neutral;
      img.src = logo;
      a.appendChild(img);
    }
    var up = u && u.avatar_url;
    if (up && typeof up === 'string') {
      var img = el('img');
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = club;
      img.src = up;
      a.appendChild(img);
    } else club();
    return a;
  }

  function recordText(it) {
    var w = it.record_wins, l = it.record_losses;
    if (w == null || l == null || (num(w) + num(l)) === 0) return '';
    var p = num(it.record_pushes);
    return num(w) + '-' + num(l) + (p ? '-' + p : '');
  }

  /* ------------------------------------------------------------------ */
  /* Card                                                               */
  /* ------------------------------------------------------------------ */

  function contextChips(it) {
    var team = it.context_team;
    var label = it.context_label;
    var sport = sportLabel(it.sport);
    if (!team && !label) return null;
    var wrap = el('div', 'tkf-ctx');
    if (team) {
      var chip = el('span', 'tkf-chip');
      var logo = teamLogo(team, false);
      if (logo) {
        var img = el('img');
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = function () { img.remove(); chip.classList.add('no-logo'); };
        img.src = logo;
        chip.appendChild(img);
      } else chip.classList.add('no-logo');
      chip.appendChild(document.createTextNode(team));
      if (sport) { chip.appendChild(document.createTextNode(' ')); chip.appendChild(el('small', null, '· ' + sport)); }
      wrap.appendChild(chip);
    }
    if (label && label !== team) {
      var safeUrl = it.context_url && /^\/(?!\/)[^\s<>"']*$/.test(it.context_url) ? it.context_url : null;
      var m = el(safeUrl ? 'a' : 'span', 'tkf-chip no-logo', label);
      if (safeUrl) { m.href = safeUrl; m.addEventListener('click', function (e) { e.stopPropagation(); }); }
      wrap.appendChild(m);
    }
    return wrap;
  }

  function actionButton(kind, label, count) {
    var b = el('button', 'tkf-act ' + kind);
    b.type = 'button';
    b.appendChild(iconSpan(kind === 'like' ? 'heart' : kind));
    var t = el('span');
    b.appendChild(t);
    setAction(b, label, count);
    return b;
  }
  function setAction(b, label, count) {
    var t = b.lastChild;
    t.textContent = '';
    if (num(count) > 0) t.appendChild(el('b', null, compact(count)));
    else t.textContent = label;
    b.setAttribute('aria-label', label + (num(count) > 0 ? ', ' + num(count) : ''));
  }

  var TRUNC = 420;

  /* One card. `feed` owns like state so the list and the open thread stay in
     step; `inThread` draws the full static version used at the top of a thread. */
  function card(it, feed, inThread) {
    var art = el('article', 'tkf-card' + (inThread ? ' is-static' : ''));
    art.setAttribute('data-take-id', it.item_id);
    if (!inThread) { art.tabIndex = 0; art.setAttribute('aria-label', 'Take by ' + (it.display_name || it.username)); }

    var sport = sportLabel(it.sport);
    if (sport) {
      art.setAttribute('data-sport', sport);
      if (SPORT_COLOR[sport]) art.style.setProperty('--sp', SPORT_COLOR[sport]);
    }
    var main = el('div');
    main.style.minWidth = '0';
    art.appendChild(main);

    /* Face | name, verified mark, record over handle and time | league tag */
    var top = el('div', 'tkf-top');
    top.appendChild(face(it));
    var who = el('div', 'tkf-who');
    var head = el('div', 'tkf-head');
    var name = el('a', 'tkf-name', it.display_name || it.username || 'Member');
    name.href = profileUrl(it.username);
    head.appendChild(name);
    if (lc(it.verification_status) === 'verified') {
      var vf = iconSpan('check', 'tkf-vf');
      vf.title = 'Verified record';
      vf.setAttribute('role', 'img');
      vf.setAttribute('aria-label', 'Verified');
      head.appendChild(vf);
    }
    /* On the member's own profile the record already sits in the header, so
       the feed there passes hideRecord and each card stays lighter. */
    var rec = feed && feed.opts && feed.opts.hideRecord ? '' : recordText(it);
    if (rec) {
      var r = el('span', 'tkf-rec', rec);
      r.title = 'Open every pick behind this record';
      /* STATS_DRILLDOWN_SITEWIDE_20260927: the poster's canonical record opens
         its picks wherever static/js/tmr-drill.js is loaded. */
      r.setAttribute('data-drill-category', 'record');
      r.setAttribute('data-drill-bucket', '');
      r.setAttribute('data-drill-user', it.username || '');
      r.setAttribute('data-drill-label', 'Verified record');
      r.setAttribute('data-drill-context', 'Sports takes');
      r.setAttribute('role', 'button');
      r.tabIndex = 0;
      head.appendChild(r);
    }
    who.appendChild(head);
    var meta = el('div', 'tkf-meta');
    if (it.username && it.display_name && lc(it.display_name) !== lc(it.username)) {
      meta.appendChild(el('span', 'tkf-handle', '@' + it.username));
      meta.appendChild(el('span', 'tkf-dot', '·'));
    }
    var time = el('a', 'tkf-time', relTime(it.created_at));
    time.href = '/feed/?post=' + encodeURIComponent(it.item_id);
    time.title = fullTime(it.created_at);
    time.setAttribute('data-ts', it.created_at || '');
    meta.appendChild(time);
    who.appendChild(meta);
    top.appendChild(who);
    if (sport) top.appendChild(el('span', 'tkf-sport', sport));
    main.appendChild(top);

    var ctx = contextChips(it);
    if (ctx) main.appendChild(ctx);

    var text = String(it.content || '');
    var body = el('div', 'tkf-body');
    var long = !inThread && text.length > TRUNC;
    body.textContent = long ? text.slice(0, TRUNC).replace(/\s+\S*$/, '') + '…' : text;
    main.appendChild(body);
    if (long) {
      var more = el('button', 'tkf-more', 'Show more');
      more.type = 'button';
      more.addEventListener('click', function (e) { e.stopPropagation(); body.textContent = text; more.remove(); });
      main.appendChild(more);
    }

    var nReplies = num(it.comments_count);
    if (!inThread && nReplies > 0) {
      var view = el('button', 'tkf-more', 'View ' + nReplies + (nReplies === 1 ? ' reply' : ' replies'));
      view.type = 'button';
      view.setAttribute('data-act', 'thread-view');
      main.appendChild(view);
    }

    var acts = el('div', 'tkf-actions');
    var like = actionButton('like', 'Like', it.likes_count);
    like.setAttribute('data-act', 'like');
    like.setAttribute('aria-pressed', it.liked_by_user ? 'true' : 'false');
    if (it.liked_by_user) like.classList.add('is-on');
    var reply = actionButton('reply', 'Reply', it.comments_count);
    reply.setAttribute('data-act', inThread ? 'focus-reply' : 'thread');
    var share = actionButton('share', 'Share', 0);
    share.setAttribute('data-act', 'share');
    acts.appendChild(like);
    acts.appendChild(reply);
    acts.appendChild(share);
    main.appendChild(acts);

    art.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('a,button,[data-act]') : null;
      var act = t && t.getAttribute('data-act');
      if (t && t.tagName === 'A') return;
      if (act === 'like') { e.stopPropagation(); feed.toggleLike(it); return; }
      if (act === 'share') { e.stopPropagation(); share_(it); return; }
      if (act === 'focus-reply') { e.stopPropagation(); var ta = document.querySelector('.tkf-rbox textarea'); if (ta) ta.focus(); else if (!signedIn()) location.href = loginUrl(); return; }
      if (t && t.tagName === 'BUTTON' && act !== 'thread' && act !== 'thread-view') return;
      if (inThread) return;
      if (window.getSelection && String(window.getSelection()).length) return;
      e.preventDefault();
      feed.openThread(it, act === 'thread');
    });
    if (!inThread) {
      art.addEventListener('keydown', function (e) {
        if (e.target === art && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); feed.openThread(it, false); }
      });
    }
    return art;
  }

  /* ------------------------------------------------------------------ */
  /* Share                                                              */
  /* ------------------------------------------------------------------ */

  var toastTimer = null;
  function toast(msg) {
    var t = document.querySelector('.tkf-toast');
    if (!t) { t = el('div', 'tkf-toast'); t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function share_(it) {
    var url = postUrl(it.item_id);
    var who = it.display_name || it.username || 'A member';
    var data = { title: who + ' on TrustMyRecord', text: String(it.content || '').slice(0, 140), url: url };
    if (navigator.share) { navigator.share(data).catch(function () { }); return; }
    var done = function () { toast('Link copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link', url); });
    } else window.prompt('Copy this link', url);
  }

  /* ------------------------------------------------------------------ */
  /* Feed                                                               */
  /* ------------------------------------------------------------------ */

  function Feed(host, opts) {
    this.host = host;
    this.opts = opts || {};
    this.items = [];
    this.byId = {};
    this.shown = this.opts.pageSize || 10;
    this.offset = 0;
    this.exhausted = false;
    this.supportsContext = false;
    this.build();
  }

  Feed.prototype.matches = function (it) {
    var o = this.opts;
    if (!it || it.item_type !== 'feed_post' || it.post_type === 'pick_share') return false;
    if (o.username && lc(it.username) !== lc(o.username)) return false;
    if (o.sport && sportLabel(it.sport) !== sportLabel(o.sport)) return false;
    if (o.team && lc(it.context_team) !== lc(o.team)) return false;
    return true;
  };

  Feed.prototype.build = function () {
    injectStyles();
    this.host.textContent = '';
    this.root = el('div', 'tkf' + (this.opts.compact ? ' is-compact' : ''));
    this.composerHost = el('div', 'tkf-composer');
    this.list = el('div', 'tkf-list');
    this.list.setAttribute('aria-live', 'polite');
    this.foot = el('div');
    this.foot.style.display = 'contents';
    this.root.appendChild(this.composerHost);
    this.root.appendChild(this.list);
    this.root.appendChild(this.foot);
    this.host.appendChild(this.root);
    var sk = this.opts.compact ? Math.min(this.opts.pageSize || 3, 3) : 3;
    for (var i = 0; i < sk; i++) this.list.appendChild(el('div', 'tkf-skel'));
  };

  Feed.prototype.mountComposer = function () {
    var o = this.opts;
    if (!o.composer || this.composer || !window.TMRTake || !window.TMRTake.currentUser()) return;
    var ctx = Object.assign({ source: 'feed', kind: 'general' }, o.composerContext || {});
    this.composer = window.TMRTake.mount(this.composerHost, ctx, {
      variant: 'feed',
      contextPickers: this.supportsContext,
      onPosted: function () { if (o.onPosted) o.onPosted(); }
    });
  };

  /* Pages through the sitewide posts feed until it has enough matching takes
     or runs out. The backend ?username= filter is passed through; the client
     filter is what guarantees nobody else's post lands on a profile. */
  Feed.prototype.fetchMore = function () {
    var self = this;
    var o = this.opts;
    var q = '/feed?filter=posts&limit=' + FETCH_LIMIT + '&offset=' + this.offset
      + (o.username ? '&username=' + encodeURIComponent(o.username) : '');
    return request(q).then(function (d) {
      var rows = (d && d.feed) || [];
      self.offset += FETCH_LIMIT;
      if (rows.length < FETCH_LIMIT) self.exhausted = true;
      /* A member feed never walks the global feed: if the server ignored
         ?username= (rows from other members), this page is the last one. */
      if (o.username && rows.some(function (it) { return lc(it.username) !== lc(o.username); })) self.exhausted = true;
      rows.forEach(function (it) {
        if (it && Object.prototype.hasOwnProperty.call(it, 'context_label')) self.supportsContext = true;
        if (self.matches(it) && !self.byId[it.item_id]) { self.byId[it.item_id] = it; self.items.push(it); }
      });
      return rows.length;
    });
  };

  Feed.prototype.load = function () {
    var self = this;
    this.items = [];
    this.byId = {};
    this.offset = 0;
    this.exhausted = false;
    var pages = 0;
    var want = this.shown;
    function step() {
      return self.fetchMore().then(function () {
        pages++;
        if (!self.exhausted && self.items.length < want && pages < MAX_SCAN_PAGES) return step();
      });
    }
    return step().then(function () {
      self.loaded = true;
      self.sort();
      self.mountComposer();
      self.render();
      if (self.opts.onCount) self.opts.onCount(self.items.length, self);
    }, function (err) {
      self.list.textContent = '';
      self.mountComposer();
      var box = el('div', 'tkf-err', 'Takes could not be loaded.');
      var retry = el('button', null, 'Retry');
      retry.type = 'button';
      retry.addEventListener('click', function () { self.build(); self.composer = null; self.load(); });
      box.appendChild(retry);
      self.list.appendChild(box);
      if (self.opts.onError) self.opts.onError(err, self);
    });
  };

  Feed.prototype.sort = function () {
    this.items.sort(function (a, b) { return (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0); });
  };

  Feed.prototype.render = function () {
    var self = this;
    this.list.textContent = '';
    this.foot.textContent = '';
    if (!this.items.length) {
      this.list.appendChild(el('div', 'tkf-empty', this.opts.emptyText || 'No takes yet.'));
      return;
    }
    this.items.slice(0, this.shown).forEach(function (it) { self.list.appendChild(card(it, self)); });
    /* Compact (a preview): the host page draws its own "View all" link. */
    if (this.opts.compact) return;
    if (this.io) { this.io.disconnect(); this.io = null; }
    if (this.items.length > this.shown || !this.exhausted) {
      var more = el('button', 'tkf-loadmore', 'Show more takes');
      more.type = 'button';
      more.addEventListener('click', function () {
        if (more.disabled) return;
        self.shown += self.opts.pageSize || 10;
        if (self.items.length >= self.shown || self.exhausted) { self.render(); return; }
        more.disabled = true;
        more.textContent = 'Loading…';
        self.fetchMore().then(function () { self.sort(); self.render(); }, function () { more.disabled = false; more.textContent = 'Show more takes'; });
      });
      this.foot.appendChild(more);
      /* autoLoad: the next page arrives as the reader nears the end. The
         button stays as the fallback and for keyboard users. */
      if (this.opts.autoLoad && 'IntersectionObserver' in window) {
        var sentinel = el('div', 'tkf-sentinel');
        this.foot.insertBefore(sentinel, more);
        this.io = new IntersectionObserver(function (en) {
          if (en.some(function (x) { return x.isIntersecting; }) && self.host.offsetParent !== null) more.click();
        }, { rootMargin: '400px 0px' });
        this.io.observe(sentinel);
      }
    } else if (this.items.length > (this.opts.pageSize || 10)) {
      this.foot.appendChild(el('div', 'tkf-end', 'You are all caught up'));
    }
  };

  /* A take just posted on this page: to the top, no reload. */
  Feed.prototype.prepend = function (post, sent) {
    if (!post || post.id == null) return;
    var u = me() || {};
    var s = sent || {};
    var it = {
      item_id: String(post.id),
      item_type: 'feed_post',
      post_type: post.post_type || 'hot_take',
      content: post.content,
      sport: post.sport || s.sport || null,
      created_at: post.created_at || new Date().toISOString(),
      user_id: post.user_id,
      username: post.username || u.username,
      display_name: u.display_name || post.username || u.username,
      avatar_url: u.avatar_url || u.avatarUrl || null,
      favorite_teams: u.favorite_teams || null,
      verification_status: u.verification_status || null,
      context_team: post.context_team || s.context_team || null,
      context_label: post.context_label || s.context_label || null,
      context_url: post.context_url || s.context_url || null,
      likes_count: 0,
      comments_count: 0,
      liked_by_user: false
    };
    if (!this.matches(it) || this.byId[it.item_id]) return;
    /* Record line from a card already on screen by the same member. */
    for (var i = 0; i < this.items.length; i++) {
      var o = this.items[i];
      if (lc(o.username) === lc(it.username)) {
        it.record_wins = o.record_wins; it.record_losses = o.record_losses; it.record_pushes = o.record_pushes;
        if (!it.avatar_url) it.avatar_url = o.avatar_url;
        if (!it.favorite_teams) it.favorite_teams = o.favorite_teams;
        if (!it.verification_status) it.verification_status = o.verification_status;
        if (!u.display_name) it.display_name = o.display_name || it.display_name;
        break;
      }
    }
    this.byId[it.item_id] = it;
    this.items.unshift(it);
    if (!this.opts.compact) this.shown++;
    this.render();
    var first = this.list.firstChild;
    if (first && first.classList) first.classList.add('is-new');
    if (this.opts.onCount) this.opts.onCount(this.items.length, this);
  };

  Feed.prototype.cardsFor = function (id) {
    return Array.prototype.slice.call(document.querySelectorAll('.tkf-card[data-take-id="' + String(id).replace(/"/g, '') + '"]'));
  };

  Feed.prototype.paintLike = function (it) {
    this.cardsFor(it.item_id).forEach(function (c) {
      var b = c.querySelector('[data-act="like"]');
      if (!b) return;
      b.classList.toggle('is-on', !!it.liked_by_user);
      b.setAttribute('aria-pressed', it.liked_by_user ? 'true' : 'false');
      setAction(b, 'Like', it.likes_count);
    });
  };

  Feed.prototype.paintReplies = function (it) {
    this.cardsFor(it.item_id).forEach(function (c) {
      var b = c.querySelector('.tkf-act.reply');
      if (b) setAction(b, 'Reply', it.comments_count);
      if (c.classList.contains('is-static')) return;
      var n = num(it.comments_count);
      var v = c.querySelector('.tkf-more[data-act="thread-view"]');
      if (!v && n > 0) {
        v = el('button', 'tkf-more');
        v.type = 'button';
        v.setAttribute('data-act', 'thread-view');
        c.querySelector('.tkf-actions').before(v);
      }
      if (v) v.textContent = 'View ' + n + (n === 1 ? ' reply' : ' replies');
    });
  };

  /* Optimistic, then settled to the server's count; reverted on failure. */
  Feed.prototype.toggleLike = function (it) {
    if (!signedIn()) { location.href = loginUrl(); return; }
    if (it._liking) return;
    var self = this;
    var was = !!it.liked_by_user;
    var before = num(it.likes_count);
    it._liking = true;
    it.liked_by_user = !was;
    it.likes_count = Math.max(0, before + (was ? -1 : 1));
    this.paintLike(it);
    if (!was) this.cardsFor(it.item_id).forEach(function (c) {
      var b = c.querySelector('[data-act="like"]');
      if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    });
    request('/feed/' + encodeURIComponent(it.item_id) + '/like', { method: was ? 'DELETE' : 'POST' }).then(function (d) {
      it._liking = false;
      if (d && d.likes_count != null) it.likes_count = num(d.likes_count);
      self.paintLike(it);
    }, function (err) {
      it._liking = false;
      it.liked_by_user = was;
      it.likes_count = before;
      self.paintLike(it);
      if (err && (err.status === 401 || err.status === 403)) location.href = loginUrl();
      else toast('Could not update your like. Try again.');
    });
  };

  /* ------------------------------------------------------------------ */
  /* Thread                                                             */
  /* ------------------------------------------------------------------ */

  Feed.prototype.openThread = function (it, focusReply) {
    var self = this;
    closeThread();
    var lastFocus = document.activeElement;
    var scrim = el('div', 'tkf-scrim');
    var sheet = el('div', 'tkf-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Take and replies');
    var bar = el('div', 'tkf-sheet-bar');
    bar.appendChild(el('h2', null, 'Take'));
    var x = el('button', 'tkf-x');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = ICON.close;
    bar.appendChild(x);
    sheet.appendChild(bar);

    var scroll = el('div', 'tkf-sheet-scroll');
    var top = el('div', 'tkf');
    top.appendChild(card(it, self, true));
    scroll.appendChild(top);
    var replies = el('div', 'tkf-replies');
    replies.appendChild(el('div', 'tkf-skel'));
    scroll.appendChild(replies);
    sheet.appendChild(scroll);

    var rerr = el('div', 'tkf-rerr');
    rerr.hidden = true;
    if (signedIn()) {
      var box = el('div', 'tkf-rbox');
      var ta = el('textarea');
      ta.rows = 1;
      ta.maxLength = 1000;
      ta.placeholder = 'Reply to ' + (it.display_name || it.username || 'this take') + '…';
      ta.setAttribute('aria-label', 'Write a reply');
      var send = el('button', null, 'Reply');
      send.type = 'button';
      send.disabled = true;
      var syncBox = function () {
        send.disabled = !ta.value.trim() || send.getAttribute('data-busy') === '1';
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight + 2, 140) + 'px';
      };
      ta.addEventListener('input', syncBox);
      ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send.click(); } });
      send.addEventListener('click', function () {
        var content = ta.value.trim();
        if (!content || send.getAttribute('data-busy') === '1') return;
        send.setAttribute('data-busy', '1');
        send.textContent = 'Posting…';
        syncBox();
        rerr.hidden = true;
        request('/feed/' + encodeURIComponent(it.item_id) + '/comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: content })
        }).then(function (d) {
          send.removeAttribute('data-busy');
          send.textContent = 'Reply';
          ta.value = '';
          syncBox();
          var c = (d && d.comment) || { content: content, created_at: new Date().toISOString() };
          var u = me() || {};
          c.username = c.username || u.username;
          c.display_name = c.display_name || u.display_name;
          c.avatar_url = c.avatar_url || u.avatar_url || null;
          c.favorite_teams = c.favorite_teams || u.favorite_teams || null;
          var empty = replies.querySelector('.tkf-noreply');
          if (empty) empty.remove();
          if (!replies.querySelector('.tkf-replies-h')) replies.insertBefore(el('div', 'tkf-replies-h', 'Replies'), replies.firstChild);
          replies.appendChild(replyRow(c));
          it.comments_count = num(it.comments_count) + 1;
          self.paintReplies(it);
          scroll.scrollTop = scroll.scrollHeight;
          var sc = scrim; sc.scrollTop = sc.scrollHeight;
        }, function (err) {
          send.removeAttribute('data-busy');
          send.textContent = 'Reply';
          syncBox();
          if (err && (err.status === 401 || err.status === 403)) { location.href = loginUrl(); return; }
          rerr.textContent = 'Your reply was not posted. It is still in the box. Try again.';
          rerr.hidden = false;
        });
      });
      box.appendChild(ta);
      box.appendChild(send);
      sheet.appendChild(rerr);
      sheet.appendChild(box);
    } else {
      var lg = el('a', 'tkf-rlogin');
      lg.href = loginUrl();
      lg.appendChild(document.createTextNode('Join the conversation. '));
      lg.appendChild(el('b', null, 'Log in to reply →'));
      sheet.appendChild(lg);
    }

    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
    document.documentElement.classList.add('tkf-lock');

    function onKey(e) {
      if (e.key === 'Escape') { closeThread(); return; }
      if (e.key === 'Tab') {
        var f = sheet.querySelectorAll('a[href],button:not([disabled]),textarea');
        if (!f.length) return;
        var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    }
    scrim.addEventListener('click', function (e) { if (e.target === scrim) closeThread(); });
    x.addEventListener('click', closeThread);
    document.addEventListener('keydown', onKey);
    openSheet = { scrim: scrim, onKey: onKey, lastFocus: lastFocus };

    var ta0 = sheet.querySelector('.tkf-rbox textarea');
    if (focusReply && ta0) ta0.focus(); else x.focus();

    request('/feed/' + encodeURIComponent(it.item_id) + '/comments').then(function (d) {
      var list = (d && d.comments) || [];
      replies.textContent = '';
      if (!list.length) { replies.appendChild(el('div', 'tkf-noreply', 'No replies yet. Start the conversation.')); }
      else {
        replies.appendChild(el('div', 'tkf-replies-h', list.length === 1 ? '1 reply' : list.length + ' replies'));
        list.forEach(function (c) { replies.appendChild(replyRow(c)); });
      }
      if (num(it.comments_count) !== list.length) { it.comments_count = list.length; self.paintReplies(it); }
    }, function () {
      replies.textContent = '';
      replies.appendChild(el('div', 'tkf-noreply', 'Replies could not be loaded right now.'));
    });
  };

  function replyRow(c) {
    var row = el('div', 'tkf-reply');
    row.appendChild(face(c, true));
    var m = el('div');
    m.style.minWidth = '0';
    var h = el('div', 'tkf-head');
    var n = el('a', 'tkf-name', c.display_name || c.username || 'Member');
    n.href = profileUrl(c.username);
    h.appendChild(n);
    if (lc(c.verification_status) === 'verified') { var vf = iconSpan('check', 'tkf-vf'); vf.title = 'Verified record'; h.appendChild(vf); }
    h.appendChild(el('span', 'tkf-dot', '·'));
    var t = el('span', 'tkf-time', relTime(c.created_at));
    t.title = fullTime(c.created_at);
    h.appendChild(t);
    m.appendChild(h);
    m.appendChild(el('div', 'tkf-reply-body', c.content || ''));
    row.appendChild(m);
    return row;
  }

  var openSheet = null;
  function closeThread() {
    if (!openSheet) return;
    var s = openSheet;
    openSheet = null;
    document.removeEventListener('keydown', s.onKey);
    if (s.scrim.parentNode) s.scrim.parentNode.removeChild(s.scrim);
    document.documentElement.classList.remove('tkf-lock');
    if (s.lastFocus && s.lastFocus.focus && document.body.contains(s.lastFocus)) s.lastFocus.focus();
  }

  /* Relative times stay honest while the page is open. */
  setInterval(function () {
    var ts = document.querySelectorAll('.tkf-time[data-ts]');
    for (var i = 0; i < ts.length; i++) {
      var v = relTime(ts[i].getAttribute('data-ts'));
      if (v && ts[i].textContent !== v) ts[i].textContent = v;
    }
  }, 60000);

  document.addEventListener('tmr:take-posted', function (e) {
    var d = (e && e.detail) || {};
    feeds.forEach(function (f) { if (document.body.contains(f.host)) f.prepend(d.post, d.sent); });
  });

  function mount(host, opts) {
    if (!host) return null;
    var f = new Feed(host, opts);
    feeds = feeds.filter(function (x) { return x.host !== host && document.body.contains(x.host); });
    feeds.push(f);
    f.load();
    return f;
  }

  window.TMRTakesFeed = { mount: mount, relTime: relTime, closeThread: closeThread };
})(window, document);
