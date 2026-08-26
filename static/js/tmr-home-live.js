/* Republished 2026-08-25 under a new content hash. The previous name was
   requested once before GitHub Pages had published it, and Cloudflare cached
   that 404 for four hours against a URL the homepage had already started
   asking for - so the whole file was missing from a page that otherwise
   looked fine. Never fetch a hashed asset by its plain URL until the origin
   is serving it; a cache-busting query is free. */
/* =============================================================================
   TrustMyRecord homepage — live production data binding
   Fills the approved v2 layout from real API data only. Never invents values:
   if an endpoint fails or returns nothing, the affected block is left as-is or
   hidden rather than showing fabricated activity.
   ============================================================================= */
(function () {
  'use strict';
  var API = 'https://trustmyrecord-api.onrender.com/api';

  /* Build-pairing guard. scripts/build_home_critical.py stamps this constant
     AND <html data-tmr-build> with the same id at build time. A mismatch means
     this script is running inside a document from a DIFFERENT deployment - a
     stale HTTP-cached page or a restored session pairing old markup with
     current JS (or vice versa). One guarded reload re-pairs both from the
     network: documents are served max-age=0/must-revalidate, so the reload
     always lands on the current deployment. localStorage auth is untouched;
     sessionStorage keeps this from ever looping. 'dev' (unstamped source)
     never triggers. */
  var BUILD = '7ad8df34acbc';
  var docBuild = document.documentElement.getAttribute('data-tmr-build') || '';
  if (BUILD !== 'dev' && docBuild !== BUILD) {
    try {
      if (sessionStorage.getItem('tmrBuildRepair') !== BUILD) {
        sessionStorage.setItem('tmrBuildRepair', BUILD);
        location.reload();
        return;
      }
    } catch (e) {}
  } else {
    try { sessionStorage.removeItem('tmrBuildRepair'); } catch (e) {}
  }

  function j(path, timeoutMs) {
    var opts = { headers: { Accept: 'application/json' } };
    if (timeoutMs) { try { opts.signal = AbortSignal.timeout(timeoutMs); } catch (e) {} }
    return fetch(API + path, opts)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function el(sel, root) { return (root || document).querySelector(sel); }
  // Live-wait gate (see index.html <head>): each html.tmr-lw-* class keeps one
  // prerendered region visually hidden until its live data has been applied or
  // its request has settled — visitors never see stale baked values swap to
  // current ones. On failure the baked snapshot is revealed as the fallback.
  // Stats + capper card are no longer gated at all: their baked/edge-injected
  // values show at first paint and are only touched if the live value differs.
  function lwReveal(cls) { document.documentElement.classList.remove(cls); }
  function lwCounter(n, cls) { return function () { if (--n <= 0) lwReveal(cls); }; }
  // Write-if-different: never rewrite identical text, so an accurate first
  // paint (edge-injected or freshly baked) produces ZERO visible swaps.
  function setText(node, txt) {
    if (node && txt != null && node.textContent !== String(txt)) node.textContent = String(txt);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function sign(n) { return (n > 0 ? '+' : '') + n.toFixed(2); }
  function initials(name) { return String(name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase(); }
  function avatar(u, cls) {
    if (u && u.avatar_url) return '<img class="' + cls + '" src="' + esc(u.avatar_url) + '" alt="">';
    if (u && u.id) return '<img class="' + cls + '" src="' + API + '/users/' + u.id + '/avatar" alt="" ' +
      'onerror="this.outerHTML=\'<span class=&quot;' + cls.replace('ava', 'avl') + '&quot;>' + initials(u.username) + '</span>\'">';
    return '<span class="' + cls.replace('ava', 'avl') + '">' + initials(u && u.username) + '</span>';
  }
  function timeAgo(ts) {
    if (!ts) return '';
    var s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return s + ' sec ago';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
    return Math.floor(s / 86400) + ' d ago';
  }

  /* ---------- 1. TICKER — today's real MLB slate.
     Every game, status, start time, pitcher and trend comes from the backend
     /nav/mlb-slate endpoint, which is built from the official MLB Stats API
     schedule for the current America/Los_Angeles date plus verified
     TrendSpotter trends. This file renders that payload and nothing else: it
     does not derive, guess or supplement any matchup data. ------------------ */
  /* The slate date is ALWAYS America/Los_Angeles, never the visitor's own clock,
     so a reader in Tokyo or London sees the same Pacific slate the site means. */
  var SLATE_TZ = 'America/Los_Angeles';
  function slateDatePT(d) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: SLATE_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(d || new Date());
    } catch (e) { return ''; }
  }

  var LOADING_TEXT = 'Loading today’s MLB slate…';
  var UNAVAILABLE_TEXT = 'Today’s games are temporarily unavailable';
  // Longer than the slate's own SWR window, short enough that a visitor is
  // told the truth instead of watching a skeleton pulse indefinitely.
  var SLATE_TIMEOUT_MS = 10000;
  var TICKER_REFRESH_MS = 90 * 1000;   // pitching changes, PPDs, live status, finals
  /* HOW LONG A GROUP OF CARDS STAYS UP, and the reason the recaps looked like
     they were flashing past. At 7s the CARD scrolled away long before its
     highlight did - a postgame line dwells 11-19s - so a reader never saw a
     line change and, coming back to the same game, often met the same sentence
     again. Nima: "the tickers are not being left up long enough... it flashes
     too fast, leave each highlight up for a few seconds."

     14s is comfortably longer than the shortest dwell, so a card is on screen
     for a whole highlight and has usually advanced by the next time round. */
  /* Nima, 2026-08-24, twice: leave the matchups, the ticker lines and the
     highlights each up a few seconds longer. 18s on a group of cards - a card
     is on screen comfortably longer than its longest highlight dwell, so a
     line always finishes and usually advances before the group comes round. */
  /* 24s, and the number is NOT free-floating: it has to clear the top of the
     postgame dwell band below (22s). At 18s it did not, so the two slowest
     cards on the row were guaranteed to be carried off screen mid-line - the
     comment above claimed the opposite and was simply wrong. A page now
     outlives its longest highlight with room to spare. */
  var TICKER_ROTATE_MS = 24000;        // dwell time on each group before advancing
  /* PREGAME lines. Originally "around 4-6 seconds" (Nima, 2026-08-14); he asked
     on 2026-08-24 for every timing to sit a few seconds longer, so 8s. The
     per-card offset below still matters more than the interval: without it
     every card on the row flips in unison and the strip becomes the noisy
     ticker this replaced. */
  var INSIGHT_ROTATE_MS = 8000;
  var INSIGHT_STAGGER_MS = 900;
  /* FINAL games rotate a postgame recap instead of pregame intel (Nima,
     2026-08-23). Those lines are denser - a decisions line, a home run, a
     standings implication - and asked to hold "roughly 10 to 20 seconds", so
     each final card draws its own dwell inside that band off its game_pk. Five
     distinct values, so two finals side by side never flip together.

     Raised to 14-22s on 2026-08-24: the lines got denser as the pool grew, and
     Nima asked for longer on all three timings. Still below TICKER_ROTATE_MS at
     its top end, which is what guarantees a card outlives its own highlight. */
  var POSTGAME_DWELL_MIN_MS = 14000;
  var POSTGAME_DWELL_STEP_MS = 2000;
  var POSTGAME_DWELL_STEPS = 5;
  /* The rotation runs off one 1s heartbeat and per-card countdowns, so cards
     with different dwells can share a single timer. */
  var INSIGHT_TICK_MS = 1000;

  function postgameDwell(g) {
    /* MLB cards are keyed by game_pk; ESPN cards (football, basketball, hockey)
       have none and carry espn_event_id instead. Without the fallback every
       ESPN card seeded on NaN, landed on the same dwell and flipped in unison,
       which is the exact noise the per-card offset exists to prevent. */
    var seed = parseInt((g && g.game_pk) != null ? g.game_pk : (g && g.espn_event_id), 10);
    if (!isFinite(seed)) seed = 0;
    return POSTGAME_DWELL_MIN_MS + (Math.abs(seed) % POSTGAME_DWELL_STEPS) * POSTGAME_DWELL_STEP_MS;
  }
  var tickerTimer = null;
  var tickerSlateDate = null;
  /* True once a slate request has come back (with games, empty, or failed). Until
     then the lane is legitimately still loading and must not be called broken. */
  var tickerSettled = false;
  /* The edge-injected slate is adopted at most once, on the first ticker() call.
     Every later call (the 90s refresh, a tab returning to the foreground) must
     go to the network — otherwise the strip would freeze on the slate the
     document happened to ship with. */
  var tickerAdoptChecked = false;

  /* Group-rotation state. The slate is split into groups that each fit the viewport
     width; one group shows at a time and they cycle. Index/count persist across the
     90s data refresh so a refresh does not yank the reader back to group one. */
  var tkPageIndex = 0;
  var tkPageCount = 1;
  var tkRotTimer = null;
  var tkPaused = false;
  var tkWired = false;

  function logoImg(url) {
    return url ? '<img src="' + esc(url) + '" alt="" loading="lazy" onerror="this.remove()">' : '';
  }

  function statusChip(g) {
    var s = String(g.status || 'scheduled');
    if (s === 'scheduled') {
      return '<span class="st">' + esc(g.start_time_tbd ? 'TBD' : (g.start_time_pt || '')) + '</span>';
    }
    var score = (typeof g.away_score === 'number' && typeof g.home_score === 'number')
      ? ' ' + g.away_score + '-' + g.home_score : '';
    var text = s === 'live' ? (g.inning || 'Live') + score
             : s === 'final' ? 'Final' + score
             : s === 'postponed' ? 'PPD'
             : s === 'cancelled' ? 'Canceled'
             : s === 'suspended' ? 'Susp'
             : s === 'delayed' ? 'Delayed'
             : (g.start_time_pt || '');
    return '<span class="st is-' + esc(s) + '">' + esc(text) + '</span>';
  }

  /* Probable pitchers render ONLY when the league has officially posted both,
     and only while they are still probable. Once the game is FINAL the strip
     carries the real decisions (WP/LP/SV), so a probables line under it would
     be the one stale thing on a finished card. */
  function pitcherLine(g) {
    if (g.status === 'final') return '';
    if (!g.away_pitcher || !g.home_pitcher) return '';
    var short = function (n) {
      var p = String(n).trim().split(/\s+/);
      return p.length < 2 ? n : p[0].charAt(0) + '. ' + p.slice(1).join(' ');
    };
    return '<span class="gm-sp">' + esc(short(g.away_pitcher)) + ' vs ' + esc(short(g.home_pitcher)) + '</span>';
  }

  /* ---------------------------------------------------------- INTEL STRIP

     Nima, 2026-08-21: the card used to stack the pitchers, BOTH clubs' form
     lines and a trend, all permanently visible, and it read as clutter. It now
     shows the matchup plus ONE fact at a time, rotating through the backend's
     game.insights[] every INSIGHT_ROTATE_MS.

     Two rules the markup exists to enforce:
       * the strip is a FIXED height whatever it holds, so a card never grows or
         shrinks as it rotates and the hero below never moves;
       * every line is rendered up front and only revealed in turn. Nothing is
         built during the rotation, so a slow frame can never leave the slot
         empty - the same failure that left the live-competition card blank when
         a stalled rAF ate its only write.

     insights[] is a generic contract - { category, group, text, sample, period,
     href } - so an NFL or NBA row can fill the same strip later with no change
     here. */
  function insightStrip(g) {
    var list = (g && g.insights) || [];
    if (!list.length) return '';
    var lines = '';
    for (var i = 0; i < list.length; i++) {
      var ins = list[i] || {};
      if (!ins.text) continue;
      var meta = ins.sample
        ? 'Sample ' + ins.sample + (ins.period ? ' · ' + ins.period : '')
        : (ins.period || '');
      lines += '<span class="gm-in-l' + (i === 0 ? ' is-on' : '') + '"' +
        ' data-cat="' + esc(ins.category || '') + '"' +
        ' data-href="' + esc(ins.href || '') + '"' +
        (meta ? ' title="' + esc(meta) + '"' : '') + '>' +
        '<i class="ts" aria-hidden="true"></i>' +
        /* THE BOTTOM LINE FORMAT (Nima, 2026-08-24): the team's full name, a
           colon, then the fact. The API supplies `team_label` only for lines
           that belong to ONE side - a "Raiders 22, Texans 20" header names
           both and gets none - so the join is unconditional here and the
           decision lives in services/postgame/teamPrefix.js. Kept inside the
           same <b> so this needs no CSS and cannot disturb the locked
           homepage metrics. */
        '<b>' + (ins.team_label ? esc(ins.team_label) + ': ' : '') + esc(ins.text) + '</b>' +
        '</span>';
    }
    if (!lines) return '';
    var post = g.insight_mode === 'postgame';
    /* A LIVE CARD IS READ LIKE A FINAL ONE. Live games now carry the same dense
       highlight lines finals do - a full pitching line, a batting line, an
       ejection - and those were still rotating on the 8s PREGAME beat, which is
       the beat meant for "the total sits at 8.5". A stat line cannot be read in
       eight seconds. It gets the postgame dwell because it is postgame-shaped
       text; `post` still decides the MARKUP, so data-mode keeps telling the
       truth about which mode the card is in. */
    var live = g.insight_mode === 'live';
    var dense = post || live;
    /* aria-live is deliberately OFF: a screen reader must not be interrupted
       every few seconds by a strip nobody asked to hear. The whole set is in the
       DOM, so all of it is reachable by reading the card. */
    return '<span class="gm-in' + (dense ? ' is-post' : '') + '" data-i="0"' +
      ' data-mode="' + (post ? 'postgame' : live ? 'live' : 'pregame') + '"' +
      ' data-dwell="' + (dense ? postgameDwell(g) : INSIGHT_ROTATE_MS) + '">' +
      lines + '</span>';
  }

  /* The ticker is a permanent fixture of the homepage: it reports loading, empty
     and error states in its own lane and is NEVER removed from the layout. This
     clears any inline hide an older build (or an earlier sweep) may have left, so
     a slate that arrives late can still reveal itself. */
  function showTicker() {
    var t = el('.ticker');
    if (t && t.style.display === 'none') t.style.display = '';
  }

  /* Skeleton lane: dimensionally identical to a real slate, shown while the
     request is in flight. It reserves the lane's full height, so the hero below
     never moves when the games land (or when they never do). */
  function laneSkeleton(lane) {
    showTicker();
    var card = '<span class="gm is-skel" aria-hidden="true">' +
      '<i class="sk a"></i><i class="sk b"></i><i class="sk c"></i></span>';
    lane.innerHTML = '<div class="ticker-track"><div class="ticker-page">' +
      card + card + card + card + card +
      '<span class="sr-only" role="status">' + esc(LOADING_TEXT) + '</span>' +
      '</div></div>';
    lane.setAttribute('data-slate-date', '');
    lane.setAttribute('aria-busy', 'true');
    tkPageIndex = 0; tkPageCount = 1;
    stopTickerRotate();
    updateTickerNav();
  }

  function laneMsg(lane, text, slateDate) {
    showTicker();
    lane.innerHTML = '<div class="ticker-track"><div class="ticker-page">' +
      '<span class="gm is-msg"><span class="st">' + esc(text) + '</span></span>' +
      '</div></div>';
    lane.setAttribute('data-slate-date', slateDate || '');
    lane.setAttribute('aria-busy', 'false');
    tkPageIndex = 0; tkPageCount = 1;
    stopTickerRotate();
    updateTickerNav();
  }

  /* ---------------------------------------------------------------- GAME FILE

     One MLB game a day gets a TMR Game File, and when it does, that game's
     EXISTING ticker card becomes the way in. Nothing is inserted into the strip
     and nothing is reordered: the card that was already there is re-pointed at
     the article and marked.

     Matching is on team names plus start time rather than on a game id. The
     slate and the Game File record come from different tables, and the only
     field both are guaranteed to carry is what the game actually is. Start time
     is what keeps the two halves of a doubleheader apart.

     Fails silent by design. No published Game File, no match, a 404 from the
     endpoint: the ticker renders exactly as it did before. A wrong link here is
     worse than no link. */
  var gameFile = null;      // { url, away, home, startUtc } once loaded
  var gameFiles = {};       // game_pk -> { url, title, angle_label }
  var lastSlate = null;     // the payload the current cards were built from

  function loadGameFile() {
    return fetch(API + '/matchups/today', { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return;

        /* `games` is every game on the board that HAS a breakdown, keyed by the
           league's own game id. It replaces matching the single FEATURED
           article by team name plus start time, which was wrong twice over: a
           published article that was not the day's cover pick lit up nothing at
           all even though the reader was looking straight at that game, and the
           name+time comparison spanned three fields from two different feeds and
           broke silently on a doubleheader or a renamed club.

           The featured article is still honoured as a fallback so an older
           response, or a cached one served during a deploy, keeps working. */
        gameFiles = {};
        var list = d.games || [];
        for (var i = 0; i < list.length; i++) {
          var g = list[i];
          if (g && g.game_pk != null && g.url) gameFiles[String(g.game_pk)] = g;
        }

        var f = d.featured;
        if (f && f.url && (f.status === 'published' || f.status === 'updated')) {
          gameFile = {
            url: f.url,
            away: String(f.away_team || '').toLowerCase(),
            home: String(f.home_team || '').toLowerCase(),
            startUtc: f.game_time_utc || ''
          };
        }
        applyGameFile();
      })
      .catch(function () { /* ticker is fine without it */ });
  }

  function gameFilePk() {
    if (!gameFile || !lastSlate) return null;

    var games = lastSlate.games || [];
    for (var i = 0; i < games.length; i++) {
      var g = games[i];
      if (String(g.away_team_name || '').toLowerCase() !== gameFile.away) continue;
      if (String(g.home_team_name || '').toLowerCase() !== gameFile.home) continue;
      if (gameFile.startUtc && g.start_time_utc &&
          String(g.start_time_utc) !== String(gameFile.startUtc)) continue;
      return String(g.game_pk == null ? '' : g.game_pk);
    }
    return null;
  }

  /* Idempotent: safe to call after every render and after every re-layout,
     which matters because layoutTicker() moves these nodes between pages. */
  var slateAsked = false;

  function applyGameFile() {
    var lane = el('.ticker .ticker-games'); if (!lane) return;

    var byPk = gameFiles || {};
    var haveMap = false;
    for (var k in byPk) { if (Object.prototype.hasOwnProperty.call(byPk, k)) { haveMap = true; break; } }
    if (!haveMap && !gameFile) return;

    /* On production the ticker is server-rendered by the tmr-home-ssr Worker,
       so renderTicker() never runs and lastSlate is never populated - the cards
       are simply already in the document. The game_pk path does not need the
       slate at all, because the cards carry their own game id; only the legacy
       featured-by-name fallback does. */
    /* ONE CARD, EVER.
       The API can legitimately return several games that have breakdowns — two
       clubs in a series, a piece from last night still inside the window — and
       lighting up two cards at once makes neither look like the pick of the day.
       The list arrives ordered with today's featured article first, so taking
       the first one that can be placed is also taking the right one. */
    var marked = 0;
    if (lane.querySelector('.gm--gf')) return;   // already marked on a prior pass
    for (var pk in byPk) {
      if (!Object.prototype.hasOwnProperty.call(byPk, pk)) continue;
      if (decorate(lane, pk, byPk[pk].url)) { marked++; break; }
    }

    /* ---- second pass: the same two clubs --------------------------------
       An exact game id is the best match and is tried first, above. But clubs
       play SERIES: the breakdown we hold is very often of this same matchup on
       an adjacent night, one game id away. A reader looking at Mets-Braves on
       the strip wants the Mets-Braves breakdown, and withholding it because the
       id belongs to last night's game in the same series serves nobody.

       Any card whose two clubs match an article we hold is therefore marked as
       well. What keeps it honest is the wording: the badge says VIEW BREAKDOWN
       and the accessible name says "breakdown: <away> at <home>" — both true of
       the MATCHUP rather than of one fixture. Exact-id matches run first, so a
       same-day article always wins over a series-mate.

       Needs the slate, because the club names live there; a card carries only
       an abbreviation and its id. */
    if (haveMap && !marked && lastSlate && lastSlate.games) {
      for (var pk2 in byPk) {
        if (!Object.prototype.hasOwnProperty.call(byPk, pk2)) continue;
        var art = byPk[pk2];
        var aTeam = String(art.away_team || '').toLowerCase();
        var hTeam = String(art.home_team || '').toLowerCase();
        if (!aTeam || !hTeam) continue;
        for (var i = 0; i < lastSlate.games.length; i++) {
          var g = lastSlate.games[i];
          if (String(g.away_team_name || '').toLowerCase() !== aTeam) continue;
          if (String(g.home_team_name || '').toLowerCase() !== hTeam) continue;
          if (decorate(lane, String(g.game_pk == null ? '' : g.game_pk), art.url)) { marked++; break; }
        }
        if (marked) break;
      }
    }

    /* The map, when present, IS the answer. This function runs before the strip
       has painted as well as after it, and on that first call nothing matches
       yet; falling through to the featured-by-name fallback there marked the
       FEATURED game instead of the game the map named, which on a day when
       those differ is simply the wrong card.

       The slate is fetched here when we do not already hold it: the pairing
       pass above needs it, and on production the strip is server-rendered so
       nothing else in this file ever asks for it. */
    if (haveMap) {
      if (!lastSlate && !slateAsked) {
        slateAsked = true;
        fetch(API + '/nav/mlb-slate', { credentials: 'omit' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d && d.games) { lastSlate = d; applyGameFile(); } })
          .catch(function () { /* leave the ticker alone */ });
      }
      return;
    }

    /* ---- fallback: the featured article, matched by name + start time ------
       Only reached when `games` was absent — an older API response, or a cached
       one served during a deploy. This is the path that needs the slate, so it
       is the only one that fetches it. */
    if (!gameFile) return;
    if (!lastSlate) {
      if (slateAsked) return;
      slateAsked = true;
      fetch(API + '/nav/mlb-slate', { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (d && d.games) { lastSlate = d; applyGameFile(); } })
        .catch(function () { /* leave the ticker alone */ });
      return;
    }
    var pk2 = gameFilePk();
    if (pk2) decorate(lane, pk2, gameFile.url);
  }

  /* Marks one ticker card as having a breakdown. Returns true if it did the
     work, false if the card is absent or already marked, so the caller can tell
     whether anything landed. */
  function decorate(lane, pk, url) {
    var card = lane.querySelector('.gm[data-game-pk="' + pk + '"]');
    if (!card || card.classList.contains('gm--gf')) return false;

    card.classList.add('gm--gf');
    card.setAttribute('href', url);
    card.setAttribute('data-gf', '1');
    var teams = card.querySelectorAll('.t');
    var label = teams.length === 2
      ? (teams[0].textContent + ' at ' + teams[1].textContent).replace(/\s+/g, ' ').trim()
      : 'this matchup';
    card.setAttribute('aria-label', 'TMR featured preview: ' + label + '. Read the full matchup breakdown and analysis.');

    /* Absolutely positioned so the strip's height and every other card stay
       exactly where they were. */
    var badge = document.createElement('span');
    badge.className = 'gm-gf';
    /* "PREVIEW" — Nima's label (2026-08-13): short and understated, so the
       badge fits the card's top slack without ever touching the matchup info. */
    badge.textContent = 'PREVIEW';
    badge.setAttribute('aria-hidden', 'true');
    card.appendChild(badge);
    return true;
  }

  /* The call-out bar that used to be injected under the strip is GONE by
     Nima's instruction (2026-08-13): the featured game's own ticker card is the
     single entry point. Do not reintroduce a second promotional bar. */

  function renderTicker(payload) {
    var lane = el('.ticker .ticker-games'); if (!lane) return;
    tickerSettled = true;
    showTicker();

    /* One dead feed must not blank the strip. MLB and NFL are separate rows from
       separate sources, so the lane goes to the unavailable message ONLY when
       neither sport produced a card (2026-08-15: an MLB Stats API outage was
       taking the football row down with it). */
    var nflGames = (payload && payload.nfl_games) || [];
    /* Basketball and hockey ride the same contract as football and arrive empty
       out of season, so the rows simply do not render until the season does. */
    var espnRows = [
      { key: 'nfl', games: nflGames },
      { key: 'nba', games: (payload && payload.nba_games) || [] },
      { key: 'nhl', games: (payload && payload.nhl_games) || [] }
    ];
    var otherGames = espnRows.reduce(function (n, r) { return n + r.games.length; }, 0);
    if (!payload || (payload.ok === false && !otherGames)) {
      laneMsg(lane, UNAVAILABLE_TEXT, '');
      return;
    }
    lastSlate = payload;
    var games = payload.games || [];
    if (!games.length && !otherGames) {
      laneMsg(lane, 'No MLB games scheduled today', payload.slate_date || '');
      return;
    }

    var html = '';   // the TODAY label is its own static column in index.html
    games.forEach(function (g) {
      var dh = g.game_label ? '<em class="gm-dh">' + esc(g.game_label) + '</em>' : '';
      var off = g.status === 'postponed' || g.status === 'cancelled';
      /* game_pk is MLB's own per-game key, so both halves of a doubleheader stay
         distinct even when they share a board id (and therefore an href). */
      html += '<a class="gm' + (off ? ' is-off' : '') + '"' +
        ' data-game-pk="' + esc(String(g.game_pk == null ? '' : g.game_pk)) + '"' +
        ' href="' + esc(g.href || '/handicapping/mlb/') + '">' +
        '<span class="gm-top">' +
          '<span class="t">' + logoImg(g.away_logo) + esc(g.away) + '</span>' +
          '<span class="t">' + logoImg(g.home_logo) + esc(g.home) + '</span>' +
          statusChip(g) + dh +
        '</span>' +
        pitcherLine(g) +
        /* The club form lines and the standalone trend row are GONE from the
           card. Nothing was lost: the backend folds both into insights[], where
           they compete with the player, pitching and standings facts for the
           same rotating slot instead of each owning a permanent row. */
        insightStrip(g);
      html += '</a>';
    });

    /* The NFL row (Nima, 2026-08-14): the strip carries both sports, one row at
       a time. NFL cards live in their own page(s) - layoutTicker never mixes
       sports in a group - and carry the weekday in the chip because most NFL
       games are not today's. No data-game-pk: the MLB preview treatment can
       never attach to them. */
    espnRows.forEach(function (row) {
      row.games.forEach(function (g) {
        html += '<a class="gm gm--' + row.key + '" data-sport="' + row.key + '"' +
          ' href="' + esc(g.href || '/sportsbook/') + '">' +
          '<span class="gm-top">' +
            '<span class="t">' + logoImg(g.away_logo) + esc(g.away) + '</span>' +
            '<span class="t">' + logoImg(g.home_logo) + esc(g.home) + '</span>' +
            statusChip(g) +
          '</span>' +
          /* The recap. Without this the backend was sending insights for every
             finished football game and the card threw them away, which is the
             whole reason the postgame work existed. */
          insightStrip(g);
        html += '</a>';
      });
    });
    /* Render every card into one measuring row inside the track, then split into
       width-fitted groups. Cards are never dropped, duplicated or reordered here. */
    /* THE NINETY SECOND REFRESH USED TO THROW THE ROTATION AWAY.

       This function replaces the lane's innerHTML, so every card node is
       destroyed and rebuilt with its FIRST line marked is-on - and it runs
       every TICKER_REFRESH_MS. Measured against production on 2026-08-25:
       at t=90s and again at t=180s every card's data-i went back to 0, cards
       that had reached their third and fourth lines included. A card can
       therefore never show more than whatever it gets through inside one
       ninety second window - two lines - however many were written for it.
       That is the whole of "Colorado-Washington shows only WP/LP", and it
       sits UNDER the dwell arithmetic: fixing the clock alone got a card to
       its second line and no further.

       Two defences, in order of cheapness:

       1. IF NOTHING CHANGED, DO NOT REBUILD. The markup is a pure function
          of the payload, and the payload is identical between most refreshes
          - the backend's wording is seeded per game so it does not reword
          itself. Comparing what we are about to write with what is already
          there costs one string compare and saves the whole repaint (every
          logo included).
       2. IF SOMETHING DID CHANGE, CARRY THE ROTATION ACROSS. One score
          arriving must not send the other fifteen cards back to line one.
          Each card's visible SENTENCE is remembered and restored by text,
          not by index, because a changed card can legitimately come back
          with its lines in a different order. */
    var sig = (payload.slate_date || '') + '|' + html;
    if (lane.getAttribute('data-render-sig') === sig
        && lane.querySelector('.gm:not(.is-skel):not(.is-msg)')) {
      lane.setAttribute('aria-busy', 'false');
      /* The DOM is untouched, so the rotation and page timers are still
         running on the nodes they were started for. */
      return;
    }
    var carried = captureRotation(lane);

    lane.innerHTML = '<div class="ticker-track"><div class="ticker-page">' + html + '</div></div>';
    lane.setAttribute('data-slate-date', payload.slate_date || '');
    lane.setAttribute('data-render-sig', sig);
    lane.setAttribute('aria-busy', 'false');
    restoreRotation(lane, carried);

    /* An insight that carries its own href (today, only the TrendSpotter one)
       takes the click; every other part of the card goes to the Handicapping Hub
       page for that specific game. */
    lane.querySelectorAll('.gm-in-l[data-href]').forEach(function (n) {
      if (!n.getAttribute('data-href')) return;
      n.addEventListener('click', function (ev) {
        var href = n.getAttribute('data-href');
        if (!href) return;
        ev.preventDefault(); ev.stopPropagation();
        window.location.href = href;
      });
    });

    applyGameFile();
    wireTickerControls();
    layoutTicker();
    startInsightRotate();
  }

  /* Split the single measuring row into groups that each fit the viewport width,
     then rebuild the track as one full-width page per group. Re-runnable on resize
     and after every data refresh; the active group index is preserved and clamped. */
  function layoutTicker() {
    var lane = el('.ticker .ticker-games'); if (!lane) return;
    var track = lane.querySelector('.ticker-track'); if (!track) return;

    var cards = Array.prototype.slice.call(track.querySelectorAll('.gm'));
    if (!cards.length) return;
    if (cards[0].classList.contains('is-msg') || cards[0].classList.contains('is-skel')) {
      tkPageIndex = 0; tkPageCount = 1;
      track.style.transform = 'translateX(0)';
      stopTickerRotate(); updateTickerNav();
      return;
    }

    /* Flatten everything back into one row so natural card widths can be measured. */
    var row = document.createElement('div');
    row.className = 'ticker-page';
    cards.forEach(function (c) { row.appendChild(c); });
    track.innerHTML = '';
    track.appendChild(row);

    var vw = lane.clientWidth;
    var GAP = 12;
    var pages = [];
    if (vw <= 0) {
      pages = [cards.slice()];                 // hidden/unmeasurable: one group, no clipping
    } else {
      var cur = [], used = 0;
      var sportOf = function (c) { return c.getAttribute('data-sport') || 'mlb'; };
      cards.forEach(function (c) {
        var w = c.offsetWidth;
        var add = w + (cur.length ? GAP : 0);
        /* A sport never shares a row: the NFL cards start their own page even
           when the MLB one has width to spare. */
        var breakHere = cur.length && sportOf(cur[cur.length - 1]) !== sportOf(c);
        if (cur.length && (breakHere || used + add > vw)) { pages.push(cur); cur = []; used = 0; add = w; }
        cur.push(c); used += add;
      });
      if (cur.length) pages.push(cur);
    }

    track.innerHTML = '';
    pages.forEach(function (grp) {
      var pg = document.createElement('div');
      pg.className = 'ticker-page';
      grp.forEach(function (c) { pg.appendChild(c); });
      track.appendChild(pg);
    });

    tkPageCount = pages.length;
    if (tkPageIndex >= tkPageCount) tkPageIndex = 0;
    applyTickerPage();
    updateTickerNav();
    startTickerRotate();
  }

  /* THE PAGE THAT IS LEAVING TURNS ITS CARDS OVER ONE MORE TIME.

     A card is only on screen for the slice of the carousel its own page
     gets - one page in four means three quarters of the loop spent frozen on
     whichever line it was showing when it slid off. Without this, a reader
     who waits for a row of finals to come back round is shown the line they
     already read, and a ten line recap needs the best part of an hour to be
     seen. Advancing on the way OUT costs nothing and means every visit opens on
     something new.

     WHEN THE SLIDE HAS ACTUALLY FINISHED, not on a guess at how long it takes.
     The track animates transform for half a second, so turning the line over as
     the page leaves showed the reader a new sentence and swept it away before it
     could be read - the "flashing too fast" Nima has objected to from the start.
     Measured: with a 560ms timer the card was STILL inside the lane when it
     flipped, and a reader got that line for half a second.

     `transitionend` is the only thing that knows when the page is genuinely
     gone. The timer stays as a fallback for the cases where no transition runs
     at all - reduced motion, a hidden tab, a browser that drops the event - and
     is set well clear of the animation. */
  var TICKER_SLIDE_MS = 500;
  function advanceLeavingPage(track, fromIndex) {
    var page = track && track.children[fromIndex];
    if (!page || !page.querySelectorAll) return;
    var done = false;
    var flip = function () {
      if (done) return;
      done = true;
      track.removeEventListener('transitionend', onEnd);
      /* The page may have come back in the meantime - a reader on the arrows
         outruns the animation - and turning over what is on screen is the very
         thing this exists to avoid. */
      if (track.children[tkPageIndex] === page) return;
      var strips = page.querySelectorAll('.gm-in');
      for (var i = 0; i < strips.length; i++) {
        if (strips[i].querySelectorAll('.gm-in-l').length < 2) continue;
        insightAdvance(strips[i]);
        strips[i].removeAttribute('data-left');
      }
    };
    var onEnd = function (ev) {
      if (!ev || ev.target !== track || ev.propertyName === 'transform') flip();
    };
    track.addEventListener('transitionend', onEnd);
    setTimeout(flip, TICKER_SLIDE_MS + 400);
  }

  function applyTickerPage(fromIndex) {
    var lane = el('.ticker .ticker-games'); if (!lane) return;
    var track = lane.querySelector('.ticker-track'); if (!track) return;
    if (fromIndex != null && fromIndex !== tkPageIndex) advanceLeavingPage(track, fromIndex);
    track.style.transform = 'translateX(-' + (tkPageIndex * 100) + '%)';
    resetVisibleDwell();
    /* The lane label names the visible row: "Today" for the MLB slate, "NFL"
       for the football row (those games are mostly later in the week, so
       calling them Today would be wrong). Text node only - the dot and the
       label's layout are untouched. */
    var lbl = el('.ticker .tlbl');
    var pg = track.children[tkPageIndex];
    var first = pg && pg.querySelector ? pg.querySelector('.gm') : null;
    if (lbl && first) {
      var want = first.getAttribute('data-sport') === 'nfl' ? 'NFL' : 'Today';
      var tn = lbl.lastChild;
      if (tn && tn.nodeType === 3 && tn.nodeValue !== want) tn.nodeValue = want;
    }
  }

  function goTicker(delta) {
    if (tkPageCount <= 1) return;
    var leaving = tkPageIndex;
    tkPageIndex = (tkPageIndex + delta + tkPageCount) % tkPageCount;
    applyTickerPage(leaving);
    updateTickerNav();
    startTickerRotate();          // manual move resets the dwell timer
  }

  function updateTickerNav() {
    var prev = el('.ticker .tk-prev'), next = el('.ticker .tk-next');
    var show = tkPageCount > 1;
    if (prev) prev.hidden = !show;
    if (next) next.hidden = !show;
  }

  /* A CHAIN OF TIMEOUTS RATHER THAN ONE INTERVAL, so a paused row does not
     bank elapsed time and jump two pages the moment the reader leaves it. The
     window itself is unchanged: a page still holds the row for
     TICKER_ROTATE_MS. */
  function startTickerRotate() {
    stopTickerRotate();
    if (tkPageCount <= 1) return;
    var step = function () {
      tkRotTimer = setTimeout(function () {
        if (tkPaused || document.hidden) { step(); return; }
        var leaving = tkPageIndex;
        tkPageIndex = (tkPageIndex + 1) % tkPageCount;
        applyTickerPage(leaving);
        updateTickerNav();
        step();
      }, TICKER_ROTATE_MS);
    };
    step();
  }

  function stopTickerRotate() {
    if (tkRotTimer) { clearTimeout(tkRotTimer); tkRotTimer = null; }
  }

  /* ------------------------------------------------- INTEL STRIP ROTATION

     One timer for the whole strip, not one per card. Each card holds its own
     index and its own phase, so they advance on different beats off a single
     tick; N cards used to mean N intervals drifting against each other, and a
     row of eight cards flipping at once is exactly the noise this replaced.

     Paused with the rest of the ticker (hover, focus, hidden tab) so a visitor
     reading a line can finish it. */
  var inRotTimer = null;
  var inRotTick = 0;

  /* WHICH CARD IS THIS. game_pk keys both halves of a doubleheader apart;
     the ESPN sports carry no pk, so their two club abbreviations plus the
     sport identify them - the same pair cannot appear twice in one football,
     basketball or hockey row. */
  function cardKey(card) {
    var pk = card.getAttribute('data-game-pk');
    if (pk) return 'pk:' + pk;
    var teams = [];
    card.querySelectorAll('.gm-top .t').forEach(function (t) { teams.push(t.textContent.trim()); });
    return (card.getAttribute('data-sport') || 'mlb') + ':' + teams.join('@');
  }

  /* The sentence each card is showing right now, keyed by game. */
  function captureRotation(lane) {
    var out = {};
    lane.querySelectorAll('.gm').forEach(function (card) {
      var on = card.querySelector('.gm-in-l.is-on b');
      if (on) out[cardKey(card)] = on.textContent.trim();
    });
    return out;
  }

  /* Put each card back on the sentence it was showing. Matched on the TEXT:
     a card whose data changed can come back with its lines reordered, and an
     index would then restore a different fact than the one the reader was
     halfway through. A line that is simply gone leaves the card at its
     first, which is correct - that rotation no longer exists. */
  function restoreRotation(lane, carried) {
    if (!carried) return;
    lane.querySelectorAll('.gm').forEach(function (card) {
      var want = carried[cardKey(card)];
      if (!want) return;
      var strip = card.querySelector('.gm-in');
      var lines = card.querySelectorAll('.gm-in-l');
      if (!strip || lines.length < 2) return;
      for (var i = 0; i < lines.length; i++) {
        var b = lines[i].querySelector('b');
        if (!b || b.textContent.trim() !== want) continue;
        if (i === 0) return;
        for (var k = 0; k < lines.length; k++) {
          lines[k].classList.remove('is-on');
          lines[k].classList.remove('is-out');
        }
        lines[i].classList.add('is-on');
        strip.setAttribute('data-i', String(i));
        /* A fresh dwell: the reader has had this line for however long the
           old node lived, but the countdown died with that node. */
        strip.removeAttribute('data-left');
        return;
      }
    });
  }

  function insightAdvance(strip) {
    var lines = strip.querySelectorAll('.gm-in-l');
    if (lines.length < 2) return;
    var i = parseInt(strip.getAttribute('data-i'), 10) || 0;
    var next = (i + 1) % lines.length;
    /* is-out then is-on: the outgoing line fades down and out while the incoming
       one fades up into the same box. Both are absolutely positioned, so the
       card's height is the box's height and never the text's. */
    lines[i].classList.remove('is-on');
    lines[i].classList.add('is-out');
    lines[next].classList.remove('is-out');
    lines[next].classList.add('is-on');
    strip.setAttribute('data-i', String(next));
  }

  /* A card's own dwell, in milliseconds. Pregame cards all share
     INSIGHT_ROTATE_MS; a FINAL card carries its own value in data-dwell so the
     denser postgame lines get the seconds they need to be read.

     BUT A LINE ONLY COUNTS WHILE ITS CARD IS ON SCREEN. When the row pages,
     a card is up for TICKER_ROTATE_MS and no longer, so a 22s line inside a
     24s window means the reader is shown exactly ONE of the ten highlights
     that were written for that game - and if the per-card stagger pushed the
     first countdown past 24s, not even one. That is the defect Nima reported
     on 2026-08-25 ("Colorado-Washington shows only WP/LP"), and it is why
     the dwell is capped at HALF the window here: two lines per visit, each
     still inside the ten-to-twenty-second band, instead of one line forever.
     A row that fits on a single page never pages, never truncates, and keeps
     the full 14-22s. */
  function pagedDwellCap() {
    return Math.floor((TICKER_ROTATE_MS - INSIGHT_TICK_MS) / 2);
  }

  function stripDwell(strip) {
    var d = parseInt(strip.getAttribute('data-dwell'), 10);
    if (!isFinite(d) || d < INSIGHT_TICK_MS) d = INSIGHT_ROTATE_MS;
    if (tkPageCount > 1) d = Math.min(d, pagedDwellCap());
    return Math.max(d, INSIGHT_TICK_MS);
  }

  /* The cards on the page currently slid into view. Falls back to the whole
     strip if the pager markup is not there, so a single-page row behaves
     exactly as it did before. */
  function visibleStrips() {
    var lane = el('.ticker .ticker-games');
    var track = lane && lane.querySelector('.ticker-track');
    var page = track && track.children[tkPageIndex];
    return (page || document).querySelectorAll('.gm-in');
  }

  /* A LINE STARTS ITS CLOCK WHEN IT BECOMES READABLE, not when it was drawn.
     Called as a page slides in: the countdown is cleared so each card gives its
     current line a full dwell in front of the reader instead of inheriting
     whatever fraction was left over from the last time round. */
  function resetVisibleDwell() {
    var strips = visibleStrips();
    for (var i = 0; i < strips.length; i++) strips[i].removeAttribute('data-left');
  }

  function startInsightRotate() {
    stopInsightRotate();
    var strips = document.querySelectorAll('.ticker .gm-in');
    if (!strips.length) return;
    /* Nothing to rotate if every card landed a single insight. */
    var any = false;
    for (var i = 0; i < strips.length; i++) {
      if (strips[i].querySelectorAll('.gm-in-l').length > 1) { any = true; break; }
    }
    if (!any) return;
    /* ONE heartbeat, N countdowns. Each card holds its remaining time in
       data-left and advances when that reaches zero, so a 5s pregame card and a
       17s postgame card can sit side by side off the same timer. The first
       countdown is seeded with a per-card offset, which is what stops a row of
       eight cards flipping in unison. */
    inRotTick = 0;
    inRotTimer = setInterval(function () {
      if (tkPaused || document.hidden) return;
      /* ONLY THE PAGE THAT IS ON SCREEN. The pages are slid sideways with a
         transform, so every card in the row stays in the DOM and matched this
         query - which meant a card sitting on page two counted down and
         advanced its lines with nobody watching. Over a couple of rotations a
         reader could arrive to find the good line already spent, and the whole
         point of writing ninety-odd of them is that they get READ. */
      var all = visibleStrips();
      for (var n = 0; n < all.length; n++) {
        var strip = all[n];
        if (strip.querySelectorAll('.gm-in-l').length < 2) continue;
        var left = parseInt(strip.getAttribute('data-left'), 10);
        if (!isFinite(left)) {
          /* The stagger is what keeps a row of cards from flipping in unison,
             but it is not worth a card never turning over at all: on a paged
             row it is trimmed to whatever the page window can still afford. */
          var dwell = stripDwell(strip);
          var stagger = (n % 5) * INSIGHT_TICK_MS;
          if (tkPageCount > 1) {
            var room = TICKER_ROTATE_MS - INSIGHT_TICK_MS - dwell * 2;
            if (stagger > room) stagger = room > 0 ? room : 0;
          }
          left = dwell + stagger;
        }
        left -= INSIGHT_TICK_MS;
        if (left > 0) { strip.setAttribute('data-left', String(left)); continue; }
        insightAdvance(strip);
        strip.setAttribute('data-left', String(stripDwell(strip)));
      }
      inRotTick += 1;
    }, INSIGHT_TICK_MS);
  }

  function stopInsightRotate() {
    if (inRotTimer) { clearInterval(inRotTimer); inRotTimer = null; }
  }

  /* Hover-pause, prev/next clicks and resize re-layout are wired once. */
  var tkResizeTimer = null;
  function wireTickerControls() {
    if (tkWired) return;
    tkWired = true;
    var ticker = el('.ticker');
    if (ticker) {
      ticker.addEventListener('mouseenter', function () { tkPaused = true; });
      ticker.addEventListener('mouseleave', function () { tkPaused = false; });
      ticker.addEventListener('focusin', function () { tkPaused = true; });
      ticker.addEventListener('focusout', function () { tkPaused = false; });
    }
    var prev = el('.ticker .tk-prev'), next = el('.ticker .tk-next');
    if (prev) prev.addEventListener('click', function () { goTicker(-1); });
    if (next) next.addEventListener('click', function () { goTicker(1); });
    window.addEventListener('resize', function () {
      if (tkResizeTimer) clearTimeout(tkResizeTimer);
      tkResizeTimer = setTimeout(layoutTicker, 180);
    });
  }

  function ticker() {
    loadGameFile();
    var lane = el('.ticker .ticker-games'); if (!lane) return;
    var today = slateDatePT();

    /* Any markup baked into the document at deploy time belongs to whatever slate
       date it was built on. If that is not today, drop it now rather than let a
       previous day's matchups sit on screen until the fetch resolves. */
    /* An EMPTY data-slate-date means "nothing baked" -- the shipped document ships
       its loading placeholder that way -- so it is NOT a stale slate and the
       placeholder stays. Only a real, different date is stale, and even then the
       lane keeps a visible loading card instead of being emptied: an empty lane
       has no .gm cards, which is what the integrity sweep used to read as a dead
       ticker and hide outright. */
    var baked = lane.getAttribute('data-slate-date');
    if (baked && baked !== today) laneSkeleton(lane);

    /* The tmr-home-ssr worker injects today's slate into the document at request
       time, using this file's own markup. When it has, the lane is already
       correct at first paint: lay it out and stop. Re-fetching it here would
       repaint identical cards (reloading every logo) for nothing — the 90s
       refresh below still picks up pitching changes, PPDs and finals. */
    if (!tickerAdoptChecked && baked === today &&
        lane.querySelector('.gm:not(.is-skel):not(.is-msg)')) {
      tickerAdoptChecked = true;
      tickerSettled = true;
      tickerSlateDate = today;
      lane.setAttribute('aria-busy', 'false');
      wireTickerControls();
      layoutTicker();
      /* The edge already painted the cards, so renderTicker() never runs on this
         path - and renderTicker() is where the rotation used to be started. On
         production that is the path almost every visitor takes, so the strip
         rendered correctly and then sat on its first insight forever (caught
         2026-08-21 against the live site; the fixture proof could not see it
         because a stubbed slate always takes the fetch path). */
      startInsightRotate();
      return;
    }
    tickerAdoptChecked = true;

    tickerSlateDate = today;
    var slateFetch = function (bypassCache) {
      var opts = { headers: { Accept: 'application/json' } };
      if (bypassCache) opts.cache = 'reload';
      /* A bare fetch here had no deadline, so a backend that HANGS rather than
         fails left this promise pending for the life of the page: renderTicker
         was never called, tickerSettled never flipped, and the lane sat on
         "Loading today's MLB slate..." forever. Seen on production 2026-08-04,
         when /api/nav/mlb-slate stopped answering while building a new slate
         date -- every visitor got a permanent loading message. A failed request
         and a hung one have to look the same to the rest of this file. */
      try { opts.signal = AbortSignal.timeout(SLATE_TIMEOUT_MS); } catch (e) {}
      return fetch(API + '/nav/mlb-slate', opts)
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    };
    slateFetch(false).then(function (payload) {
      /* Refuse a response that raced across a date rollover. */
      if (payload && payload.slate_date && payload.slate_date !== slateDatePT()) {
        renderTicker(null); return;
      }
      if (payload && payload.games) { renderTicker(payload); return; }
      /* Missing or malformed slate (including anything an intermediary HTTP
         cache served stale or broken): bypass caches and ask the server once
         more before showing the unavailable message. */
      slateFetch(true).then(function (retry) {
        if (retry && retry.slate_date && retry.slate_date !== slateDatePT()) {
          renderTicker(null); return;
        }
        renderTicker(retry);
      });
    });
  }

  /* Periodic refresh keeps pitching changes, postponements, start-time moves,
     live status and final scores current. Paused while the tab is hidden so the
     source is not hammered, and re-run on return — with a hard clear first if the
     Pacific date rolled over while the tab sat in the background. */
  function startTickerRefresh() {
    if (tickerTimer) clearInterval(tickerTimer);
    tickerTimer = setInterval(function () {
      if (!document.hidden) ticker();
    }, TICKER_REFRESH_MS);

    /* A document restored from the back/forward cache (or a restored browser
       session) resumes with whatever slate markup it was frozen with - re-pull
       immediately rather than waiting out the refresh interval. */
    window.addEventListener('pageshow', function (ev) {
      if (ev.persisted) ticker();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      if (slateDatePT() !== tickerSlateDate) {
        var lane = el('.ticker .ticker-games');
        // Never leave a previous day on screen — and never leave an EMPTY lane
        // either, which would collapse the strip and shove the hero upward.
        if (lane) { tickerSettled = false; laneSkeleton(lane); }
      }
      ticker();
    });
  }

  /* ---------- 2. LIVE PICKS — real graded/pending picks -------------------- */
  // A spread / run-line / puck-line pick stores ONLY the team name in
  // `selection` — the handicap lives in line_snapshot. Printing the selection
  // alone turns "Dodgers -1" into "Dodgers", which is a DIFFERENT bet and hides
  // whether a one-run win was a push. The homepage did that from launch until
  // 2026-08-11 because /users/trend-highlights did not even ship the column.
  // Formatting mirrors static/js/pick-display-format.js (TMR.formatPickDisplay)
  // so every surface prints the same string: trailing zeros trimmed, positive
  // lines signed, and never doubled when the selection already carries it.
  // Only spread-family markets get a suffix here; other markets keep the exact
  // label they rendered before line_snapshot existed in this payload.
  function spreadSuffix(p) {
    var mk = String((p && p.market_type) || '').toLowerCase();
    if (!/spread|run_?line|puck_?line/.test(mk)) return '';
    var raw = p.line_snapshot;
    if (raw == null || raw === '') return '';
    var n = Number(raw);
    if (!isFinite(n)) return '';
    var txt = (n > 0 ? '+' : '') + String(n);
    var sel = String(p.selection || '').trim();
    var tail = ' ' + txt;
    if (sel === txt || (sel.length > tail.length && sel.slice(-tail.length) === tail)) return '';
    return ' ' + txt;
  }

  function livePicks(users) {
    var card = el('.board .card:nth-child(1) .body'); if (!card || !users) return;
    var rows = [];
    users.forEach(function (u) {
      (u.picks || []).forEach(function (p) { rows.push({ u: u, p: p }); });
    });
    rows.sort(function (a, b) {
      return new Date(b.p.created_at || b.p.game_time || 0) - new Date(a.p.created_at || a.p.game_time || 0);
    });
    rows = rows.slice(0, 6);
    if (!rows.length) return;
    card.innerHTML = rows.map(function (r) {
      var p = r.p, u = r.u;
      var st = String(p.status || '').toLowerCase();
      var badge = st === 'won' ? '<span class="badge w">Win</span>'
                : st === 'lost' ? '<span class="badge l">Loss</span>'
                : st === 'push' || st === 'pushed' ? '<span class="badge d">Push</span>'
                : st === 'void' || st === 'voided' || st === 'cancelled' || st === 'canceled' ? '<span class="badge d">Void</span>'
                : '<span class="badge p">Pending</span>';
      var ru = num(p.result_units);
      var units = st === 'pending' || !st ? num(p.units).toFixed(1) + 'u'
                : '<span class="' + (ru >= 0 ? 'pos' : 'neg') + '">' + sign(ru) + 'u</span>';
      var sel = p.selection || p.pick || p.market_type || 'Pick';
      var line = spreadSuffix(p);
      var odds = p.odds_snapshot != null ? ' (' + (num(p.odds_snapshot) > 0 ? '+' : '') + p.odds_snapshot + ')' : '';
      var lg = (p.sport_title || p.sport_key || 'PICK').toString().toUpperCase().slice(0, 4);
      return '<div class="pk">' +
        '<span class="logo2"><span class="lgchip">' + esc(lg) + '</span></span>' +
        '<span class="bd">' +
          '<span class="who">' + avatar(u, 'ava') + '<a class="who-link" href="/u/' + encodeURIComponent(u.username) + '/"><b>' + esc(u.username) + '</b></a>&middot; ' + esc(timeAgo(p.created_at)) + '</span>' +
          '<span class="ln">' + esc(sel) + esc(line) + esc(odds) + '</span>' +
          '<span class="mt"><span class="lgchip">' + esc(lg) + '</span>' + esc(p.market_type || '') + '</span>' +
        '</span>' +
        '<span class="rt">' + badge + '<span class="u">' + units + '</span></span>' +
      '</div>';
    }).join('');
  }

  /* ---------- 3. LEADERBOARD --------------------------------------------- */
  function leaderboard(users) {
    var body = el('.board .card:nth-child(2) .body'); if (!body || !users) return;
    var ranked = users.filter(function (u) { return num(u.total_picks) > 0; })
                      .sort(function (a, b) { return num(b.net_units) - num(a.net_units); });
    if (!ranked.length) return;
    body.innerHTML = ranked.slice(0, 10).map(function (u, i) {
      var rk = i < 3 ? 'rk g' + (i + 1) : 'rk';
      var w = u.wins != null ? u.wins + '-' + u.losses + (num(u.pushes) ? '-' + u.pushes : '') : num(u.total_picks) + ' picks';
      return '<div class="lbr"><span class="' + rk + '">' + (i + 1) + '</span>' +
        avatar(u, 'ava') +
        '<span class="nm"><a href="/u/' + encodeURIComponent(u.username) + '/"><b>' + esc(u.username) + '</b></a><span>' + esc(w) + ' &middot; ' + num(u.total_picks) + ' picks</span></span>' +
        '<span class="un"><b class="' + (num(u.net_units) >= 0 ? 'pos' : 'neg') + '">' + sign(num(u.net_units)) + 'u</b>' +
        '<span>' + num(u.roi).toFixed(1) + '% ROI</span></span></div>';
    }).join('');
  }

  /* ---------- 4. LIVE COMPETITION -----------------------------------------
     The hero's right-hand card. Replaced the Capper of the Week spotlight on
     2026-08-16: TMR is a standing competition, and the card now says so by
     rotating through several live reads of it — units, the live ticker, hot
     streaks, ROI, today, this week.

     Every value comes from /api/users/competition (or the `competition` block
     of home-bootstrap), which builds each view from real graded picks and real
     standings movement. This file renders what it is handed and nothing else:
     it never invents a competitor, a number, a rank change or an event, and a
     view the backend left out of `views` — because there was not enough real
     data for it right now — simply is not in the rotation. That is the
     "fall back to another real view" rule, and it is enforced on the server so
     the client has nothing to fabricate with.

     Geometry: the card's height NEVER changes as views rotate. The stage is a
     fixed box (see .comp-stage in tmr-home-v2.css) and views are absolutely
     positioned layers inside it, so the outgoing and incoming views overlap
     rather than one pushing the other. Nothing here writes a height. ------- */

  /* Dwell per view, and the transition budget inside it. The progress rule is
     driven by the same constant, so the bar always finishes exactly when the
     next view starts — a bar that lies about the timing is worse than none. */
  var COMP_DWELL_MS = 5200;
  var COMP_SWAP_MS = 340;

  /* There is deliberately NO count-up on this card (removed 2026-08-17, Nima).
     A rolling counter has to display numbers the payload never contained on its
     way to the one it did — and once the card started ranking trivia points and
     forum posts alongside units, those intermediate values stopped reading as a
     figure settling and started reading as somebody's real score being wrong.
     A player with 28,511 points is shown 28,511 points, from the first frame. */

  var comp = {
    views: [],          // real views, server-ordered
    i: 0,               // index of the view on screen
    timer: null,
    paused: false,
    started: false,
    reduced: false,
    refresh: null,      // slow re-ask, so "standings update live" is literal
    asked: false,       // the standalone endpoint is tried once, never in a loop
  };
  try {
    comp.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {}


  /* A competitor with no avatar gets initials, not a request that 404s into
     initials. The homepage has been bitten before by an <img> whose onerror
     raced the edge bake and rewrote the card after first paint; there is no
     reason to fire that request when the payload already says there is no
     avatar. Kept identical in workers/home-ssr/worker.mjs. */
  function compAvatar(c) {
    if (!c) return '<span class="comp-avl"></span>';
    // The fallback markup inside the onerror attribute is entity-encoded rather
    // than written with raw angle brackets. Both parse to the same JS string,
    // but only one of them is BYTE-identical to what the edge renderer emits,
    // and byte-identical is the contract between the two (see
    // tests/homepage-live-competition-lock-test.js, which diffs them).
    if (c.avatar_url) return '<img class="comp-av" src="' + esc(c.avatar_url) + '" alt="" ' +
      'onerror="this.outerHTML=\'&lt;span class=&quot;comp-avl&quot;&gt;' + initials(c.username) + '&lt;/span&gt;\'">';
    return '<span class="comp-avl">' + initials(c.username) + '</span>';
  }

  /* The movement chip. `delta` is positions gained against the same standings
     as they stood 24 hours ago; 0 means genuinely unchanged, and null means
     this competitor had no graded record 24 hours ago to compare against. */
  function compDelta(row) {
    if (row.is_new) return '<span class="comp-dl nw">NEW</span>';
    var d = row.delta;
    if (d == null) return '';
    if (d > 0) return '<span class="comp-dl up">&#9650;' + d + '</span>';
    if (d < 0) return '<span class="comp-dl dn">&#9660;' + Math.abs(d) + '</span>';
    return '<span class="comp-dl fl">&mdash;</span>';
  }

  /* Every one of the eight views renders through this one template, so a
     sportsbook standing and a trivia standing are the same object on screen and
     only the numbers mean different things.

     `tone` decides the primary value's colour. 'signed' is a units or ROI
     figure, where green and red carry real meaning. 'neutral' is a points or
     post count, where colouring it green would assert a profit the number is
     not. Trivia points are not units. */
  function compRowHtml(view, row, i) {
    var c = row.competitor || {};
    var href = c.href || (c.username ? '/u/' + encodeURIComponent(c.username) + '/' : '/handicappers/');
    var tone = view.tone === 'signed' ? (num(row.value) < 0 ? 'neg' : 'pos') : 'flat';
    return '<div class="comp-row' + (i === 0 ? ' r1' : '') + '">' +
      '<span class="comp-rk">' + (row.rank || i + 1) + '</span>' +
      compAvatar(c) +
      '<span class="comp-id">' +
        '<a class="comp-nm" href="' + esc(href) + '">' + esc(c.username || '') + '</a>' +
        '<span class="comp-meta">' + esc(row.meta || '') + '</span>' +
      '</span>' +
      '<span class="comp-val">' +
        '<span class="comp-num ' + tone + '">' + esc(row.value_text || '') + '</span>' +
        compDelta(row) +
      '</span>' +
    '</div>';
  }


  function compRestartProgress() {
    var bar = el('.spot.comp .comp-prog'); if (!bar) return;
    bar.classList.remove('run');
    bar.style.setProperty('--comp-dwell', COMP_DWELL_MS + 'ms');
    // Force a reflow so the animation restarts from 0 on every view.
    void bar.offsetWidth;
    if (comp.views.length > 1) bar.classList.add('run');
  }

  function compFlash() {
    if (comp.reduced) return;
    var f = el('.spot.comp .comp-flash'); if (!f) return;
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }

  /* Paint one view. The outgoing layer is kept in the DOM for the length of the
     cross-fade and then removed — two layers, never three, and the stage's
     height is fixed either way. */
  function compRender(view, animate) {
    var stage = el('.spot.comp .comp-stage'); if (!stage || !view) return;
    var cat = el('.spot.comp .comp-cat');
    var note = el('.spot.comp .comp-note');
    var card = el('.spot.comp');

    var next = document.createElement('div');
    next.className = 'comp-view';
    next.innerHTML = (view.rows || []).map(function (r, i) { return compRowHtml(view, r, i); }).join('');

    /* Only ever TWO layers: the one on screen and the one arriving. Two renders
       inside one swap window (a rotation tick landing on top of a re-apply of
       the payload) used to leave the middle layer behind with `is-on` still on
       it, and two full standings lists then sat on top of each other in the
       card. Take the newest layer as the outgoing one and drop anything older
       on the spot. */
    var layers = stage.querySelectorAll('.comp-view');
    for (var s = 0; s < layers.length - 1; s++) {
      if (layers[s].parentNode) layers[s].parentNode.removeChild(layers[s]);
    }
    var prev = layers.length ? layers[layers.length - 1] : null;
    stage.appendChild(next);
    // Two frames: one to get `next` into the layout tree, one to start the
    // animation, so the browser cannot collapse the two states into no
    // transition at all.
    requestAnimationFrame(function () {
      // The category line changes in the SAME frame the rows do. Written before
      // this point it named the incoming view over the outgoing view's rows for
      // a frame, which is the one thing a card like this must never do.
      if (cat) setText(cat, view.label || '');
      if (note) setText(note, view.note || '');
      /* The accent follows the SECTION, not the view: all four sportsbook
         boards share one colour so the card does not strobe through a palette
         while it rotates, and trivia / polls / forum each get their own. One
         class on the card, so the label, the leader's rank numeral and the
         dwell rule move together. */
      if (card) {
        var accent = 'comp-acc-' + (view.section || 'sportsbook');
        if (card.dataset.accent !== accent) {
          if (card.dataset.accent) card.classList.remove(card.dataset.accent);
          card.classList.add(accent);
          card.dataset.accent = accent;
        }
      }
      /* The footer CTA points at the board the visitor is looking at. The
         server sends the destination with the view (services/homeCompetition
         CTA map) so a category can never be added here with a link that 404s;
         a view with no cta leaves the last real one in place rather than
         emptying the link. */
      var cta = el('.spot.comp .comp-cta');
      if (cta && view.cta && view.cta.href && view.cta.label) {
        if (cta.getAttribute('href') !== view.cta.href) cta.setAttribute('href', view.cta.href);
        setText(cta, view.cta.label + ' →');
      }
      next.classList.add('is-on');
      if (animate && !comp.reduced) {
        next.classList.add('is-in');
        /* Take the class back off once the animation's time is up. `is-in`
           carries animation-fill-mode:both, which is what holds the staggered
           rows in their start state until their delay elapses — and which, on
           a compositor that is not running animations at all (occluded window,
           heavy tab), would hold the whole view at opacity 0 forever. The
           outgoing layer is removed on a timer, so that stall showed as an
           EMPTY card. Timers keep running when animations do not, so this is
           the guarantee that the rows are visible either way. */
        setTimeout(function () { next.classList.remove('is-in'); }, COMP_SWAP_MS + 320);
      }
      if (prev) {
        /* `is-in` carries animation-fill-mode:both, and an animation beats the
           opacity:0 that `is-off` sets. An outgoing layer that was still mid
           entrance would otherwise stay fully painted for its whole remaining
           run — the exact double-list frame this swap exists to avoid. */
        prev.classList.remove('is-on');
        prev.classList.remove('is-in');
        /* Only cross-fade when there is something to cross-fade WITH. A render
           that does not animate (the first real payload landing on the
           skeleton, or a re-apply of the payload) puts the incoming layer at
           full opacity in one frame, so an outgoing layer that fades out over
           its own timeline is simply a second legible list painted on top of
           the first. Drop it in the same frame instead. */
        if (!animate || comp.reduced) {
          if (prev.parentNode) prev.parentNode.removeChild(prev);
        } else {
          prev.classList.add('is-off');
          setTimeout(function () { if (prev.parentNode) prev.parentNode.removeChild(prev); },
            COMP_SWAP_MS);
        }
      }
    });

    if (animate) compFlash();
    compRestartProgress();
  }

  function compAdvance() {
    if (!comp.views.length) return;
    comp.i = (comp.i + 1) % comp.views.length;
    compRender(comp.views[comp.i], true);
  }

  function compSchedule() {
    if (comp.timer) { clearInterval(comp.timer); comp.timer = null; }
    if (comp.views.length < 2) return;
    comp.timer = setInterval(function () {
      // Never rotate into a tab nobody is looking at: the visitor would come
      // back mid-view with the progress rule already spent.
      if (comp.paused || document.hidden) return;
      compAdvance();
    }, COMP_DWELL_MS);
  }

  /* Hover holds the current view. Someone reading a row — or about to click a
     competitor's name — should not have it swapped out from under them. */
  function compBindPause() {
    var card = el('.spot.comp'); if (!card || card.dataset.compBound) return;
    card.dataset.compBound = '1';
    var hold = function () { comp.paused = true; var b = el('.spot.comp .comp-prog'); if (b) b.classList.remove('run'); };
    var go = function () { comp.paused = false; compRestartProgress(); };
    card.addEventListener('mouseenter', hold);
    card.addEventListener('mouseleave', go);
    card.addEventListener('focusin', hold);
    card.addEventListener('focusout', go);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { var b = el('.spot.comp .comp-prog'); if (b) b.classList.remove('run'); }
      else if (!comp.paused) compRestartProgress();
    });
  }

  /* No payload, or a payload with no view that had enough real data: leave the
     card's box exactly as it is and say so, rather than shimmer forever or
     print numbers nobody can stand behind. */
  function compSettled() {
    var bd = el('.spot.comp .bd'); if (!bd) return;
    bd.classList.remove('is-skel');
    bd.setAttribute('aria-busy', 'false');
    if (!comp.views.length) {
      var stage = el('.spot.comp .comp-stage');
      if (stage && !stage.querySelector('.comp-row:not(.is-skel) .comp-nm[href]')) {
        stage.querySelectorAll('.sk').forEach(function (n) {
          var host = n.parentNode;
          if (host && host.querySelectorAll('.sk').length === 1) host.textContent = '—';
          else n.remove();
        });
      }
      var cat = el('.spot.comp .comp-cat');
      if (cat && cat.querySelector('.sk')) setText(cat, 'Standings');
      var note = el('.spot.comp .comp-note');
      if (note && note.querySelector('.sk')) setText(note, 'Temporarily unavailable');
    }
    var foot = el('.spot.comp .comp-foot');
    if (foot && foot.querySelector('.sk')) setText(foot, 'Standings update live');
  }

  function applyCompetition(data) {
    /* home-bootstrap is one aggregate served from a shared cache; a build of it
       that predates this module simply has no `competition` key. Ask the
       standalone endpoint rather than settling the card to dashes — this is the
       window where a frontend deploy has landed and the backend's is still
       rolling, and it is the difference between a card that fills a second late
       and a card that says "unavailable" on the front page. */
    if (!data || !Array.isArray(data.views)) { competitionOnly(); return; }
    try {
      var views = data.views.filter(function (v) {
        return v && Array.isArray(v.rows) && v.rows.length;
      });

      compFooter(data.footer);

      if (!views.length) return;
      comp.views = views;
      comp.i = 0;
      comp.started = true;
      compRender(views[0], false);
      compBindPause();
      compSchedule();
      if (!comp.refresh) comp.refresh = setInterval(compRefresh, COMP_REFRESH_MS);
    } finally {
      compSettled();
      lwReveal('tmr-lw-spot');
    }
  }

  /* The footer says "standings update live". That has to be true inside an open
     tab, not only across reloads: a pick graded while somebody is reading the
     homepage moves the units table, and the card would otherwise sit on a
     snapshot from whenever the page loaded. So re-ask on a slow cadence — the
     same idea as the MLB ticker's 90s refresh a few pixels above.

     The new payload replaces the data, never the view on screen: the rotation
     keeps its own timing and picks the fresh rows up on its next tick, so a
     refresh is invisible unless something actually changed. */
  var COMP_REFRESH_MS = 120000;

  function compRefresh() {
    if (document.hidden) return;              // nothing to refresh for nobody
    j('/users/competition', 8000).then(function (d) {
      var views = (d && Array.isArray(d.views)) ? d.views.filter(function (v) {
        return v && Array.isArray(v.rows) && v.rows.length;
      }) : [];
      if (!views.length) return;              // a failed refresh changes nothing
      comp.views = views;
      if (comp.i >= views.length) comp.i = 0;
      compFooter(d.footer);
    });
  }

  function compFooter(f) {
    var foot = el('.spot.comp .comp-foot');
    if (!foot || !f || f.competitors == null || f.verified_picks == null) return;
    // Always en-US, for the same reason the stats stripe is: the baked snapshot
    // and the edge injection both format it that way, and a locale-dependent
    // rewrite of an unchanged number is a visible swap.
    setText(foot, num(f.competitors).toLocaleString('en-US') + ' competitors · ' +
      num(f.verified_picks).toLocaleString('en-US') + ' verified picks · standings update live');
  }

  /* Fallback when home-bootstrap is unavailable: one request to the standalone
     competition endpoint, which serves the identical payload. */
  function competitionOnly() {
    // One attempt, ever. applyCompetition calls back here when it is handed a
    // payload without views, so an endpoint that keeps answering without them
    // would otherwise bounce between the two forever.
    if (comp.asked) { compSettled(); lwReveal('tmr-lw-spot'); return; }
    comp.asked = true;
    j('/users/competition', 8000).then(function (d) {
      if (d && Array.isArray(d.views)) { applyCompetition(d); return; }
      compSettled();
      lwReveal('tmr-lw-spot');
    });
  }

  /* ---------- 5. SPORTS TALK --------------------------------------------- */
  function sportsTalk() {
    var body = el('.board .card:nth-child(3) .body'); if (!body) { lwReveal('tmr-lw-b3'); return; }
    j('/forum/threads/recent?limit=6').then(function (d) {
      var t = (d && (d.threads || d.data)) || (Array.isArray(d) ? d : []);
      if (!t || !t.length) { lwReveal('tmr-lw-b3'); return; }
      body.innerHTML = t.slice(0, 6).map(function (x) {
        var cat = x.category_name || x.category || 'Forum';
        var cls = /mlb/i.test(cat) ? 'mlb' : /soccer|football/i.test(cat) ? 'soc' : 'str';
        var u = { id: x.user_id, username: x.username, avatar_url: x.avatar_url };
        var href = (x.id && x.slug) ? '/forum/thread/' + encodeURIComponent(x.id) + '/' + encodeURIComponent(x.slug) + '/'
                 : (x.id ? '/forum/?thread=' + encodeURIComponent(x.id) : '/forum/');
        return '<a class="fr" href="' + href + '">' + avatar(u, 'ava') +
          '<span class="fb"><span class="cat ' + cls + '">' + esc(cat) + '</span>' +
          '<div class="ft2">' + esc(x.title) + '</div>' +
          '<div class="fm">' + esc(x.username || '') + ' &middot; ' + esc(timeAgo(x.created_at)) + '</div></span></a>';
      }).join('');
    }).then(function () { lwReveal('tmr-lw-b3'); });
  }

  /* ---------- 6. POLL — Prediction Quiz of the Day teaser, real quiz data --- */
  function poll() {
    var card = document.querySelectorAll('.compete .ccard')[2]; if (!card) return;
    var qEl = el('.pollq', card), mEl = el('.pollmeta', card), cta = el('#tmrHomeQuizCta', card);
    var fail = function (msg) {
      if (qEl) qEl.textContent = msg;
      if (mEl) mEl.textContent = '';
      var chip = card.querySelector('.cch .st'); if (chip) chip.textContent = '';
    };
    j('/polls/featured').then(function (d) {
      var f = d && d.featured;
      if (!f) { fail('No quiz live right now.'); return; }

      if (qEl) qEl.textContent = f.title || 'Prediction Quiz';
      var qc = num(f.question_count), pts = num(f.points_available);
      if (mEl) mEl.textContent = (f.sport ? f.sport + ' · ' : '') + qc + (qc === 1 ? ' question' : ' questions') +
        ' · ' + pts + ' pts available';
      var chip = card.querySelector('.cch .st');
      if (chip) chip.textContent = f.featured_status === 'results' ? 'Results' : f.featured_status === 'pending' ? 'Pending' : 'Open';
      if (cta) {
        cta.href = '/polls/#poll-' + f.id;
        cta.textContent = f.featured_status === 'results' ? 'See Results →' : 'Take the Quiz →';
      }
    }).catch(function () { fail('Data unavailable'); });
  }

  /* ---------- 7. ARENA — real open challenges ----------------------------- */
  function arena() {
    var card = document.querySelectorAll('.compete .ccard')[1]; if (!card) return;
    j('/challenges/open').then(function (d) {
      var c = (d && d.challenges) || [];
      var chip = card.querySelector('.cch .st');
      if (chip) chip.textContent = c.length ? c.length + ' open' : 'Open to join';
      var grow = el('.grow', card); if (!grow) return;
      if (!c.length) {
        grow.innerHTML = '<div class="mrow"><span class="mt2"><b>No open challenges right now</b>' +
          '<span>Create one and any member can accept it</span></span><span class="go">Start</span></div>';
        return;
      }
      grow.innerHTML = c.slice(0, 3).map(function (x) {
        var u = { id: x.creator_id, username: x.creator_username, avatar_url: x.creator_avatar };
        return '<div class="mrow">' + avatar(u, 'mav') +
          '<span class="mt2"><b>' + esc(x.creator_username || 'Member') + '</b>' +
          '<span>Open challenge &middot; ' + esc(x.sport || 'Any sport') + '</span></span>' +
          '<span class="go">Accept</span></div>';
      }).join('');
    });
  }

  /* ---------- 8. PLATFORM STRIP live counters ----------------------------- */
  function platform(verifiedCount) {
    if (verifiedCount == null) return;
    var badges = document.querySelectorAll('.explore .ei .badge2');
    if (badges[2]) badges[2].innerHTML = '<span class="bl"></span>' + verifiedCount + ' public records';
  }

  /* ---------- stats application (shared by bootstrap + legacy paths) ------
     Picks tracked / verified cappers / members come from the same
     authoritative aggregates every other page reads (directory-metrics,
     leaderboard total), so no page can disagree. All writes go through
     setText: an already-accurate first paint (edge-injected or freshly
     baked) is never visibly rewritten.

     PICKS TRACKED reads metrics.total_graded_picks — the ONE site-wide count
     (backend: services/siteStatsService.js), the same field /handicappers/
     prints as "Total Graded Picks". It previously read the raw pick total from
     the raw directory ops endpoint, which counts every non-deleted row in
     the picks table including pending picks, voids, and picks belonging to
     banned, deleted and QA accounts: that is how this stripe came to say 3,022
     while /handicappers/ said 2,738 on the same afternoon. That endpoint is a
     debug view of the raw tables and must never be painted on a page.

     PICK MAKERS reads metrics.pick_makers — the same field, with the same
     definition, that /handicappers/ prints under the same "Pick Makers" label
     (members who have locked at least one pick). The tile was labelled
     "Verified Cappers" and fed from total_eligible_handicappers, which counts
     members with a GRADED pick. Both happen to be 37 today, but they are two
     different definitions and neither matched the word "verified", which on
     /handicappers/ means 25+ graded picks (14 members). Same label, same
     field, both pages. total_eligible_handicappers still feeds the "public
     records" badge below, where that is what the words actually say. */
  /* The stats path has finished — either it delivered, or every request it had
     has failed. Anything still on a skeleton is never arriving, so dash it now
     rather than wait out the 12s backstop. Nothing that already holds a value
     is touched. */
  function statsSettled() {
    document.querySelectorAll('#tmrEyebrowPicks, .bridge .s b').forEach(function (b) {
      if (b.querySelector('.sk')) b.textContent = '—';
    });
  }

  function applyStatCells(picksText, pickMakers, members) {
    var cells = document.querySelectorAll('.bridge .s b');
    if (picksText != null) {
      if (cells[0]) setText(cells[0], picksText);
      // Hero eyebrow duplicates the same "picks tracked" figure -- it must
      // never drift from the counter below it.
      setText(document.getElementById('tmrEyebrowPicks'), picksText);
    }
    if (pickMakers != null && cells[1]) setText(cells[1], String(pickMakers));
    if (members != null && cells[2]) setText(cells[2], String(members));
  }

  /* ---------- boot --------------------------------------------------------
     ONE bootstrap request carries everything the live modules need (stats,
     leaderboard, trend highlights, the full capper card). It is served from
     a shared 30s server-side aggregate cache, so it returns in well under a
     second instead of queueing behind a burst of heavy per-endpoint queries
     — the failure mode that used to leave gated regions blank for 7-10s.
     If it fails, the legacy per-endpoint path runs as the fallback. -------- */
  function boot() {
    ticker();
    startTickerRefresh();
    sportsTalk();
    poll();
    arena();

    j('/users/home-bootstrap', 6000).then(function (d) {
      if (!d) { legacyBoot(); return; }

      var m = d.metrics || {};
      var eligible = d.total_eligible_handicappers != null ? num(d.total_eligible_handicappers) : null;
      applyStatCells(
        // Always en-US: the baked snapshot and the edge injection format this
        // number as "2,397"; a locale-dependent format would rewrite it for
        // non-US visitors and cause a visible swap of an unchanged value.
        m.total_graded_picks != null ? num(m.total_graded_picks).toLocaleString('en-US') : null,
        m.pick_makers != null ? num(m.pick_makers) : null,
        m.total_members != null ? num(m.total_members) : null
      );
      // "N public records" badge — members with a graded public record, which
      // is a different figure from Pick Makers above and is labelled as such.
      if (eligible != null) platform(eligible);
      statsSettled();
      lwReveal('tmr-lw-stats');

      if (d.trend_highlights && d.trend_highlights.length) livePicks(d.trend_highlights);
      lwReveal('tmr-lw-b1');

      var rows = d.leaderboard || [];
      if (rows.length) leaderboard(rows);
      lwReveal('tmr-lw-b2');

      applyCompetition(d.competition);
    });
  }

  /* Legacy per-endpoint path, kept verbatim as the bootstrap fallback. */
  function legacyBoot() {
    competitionOnly();
    // Three requests feed the stats stripe; the counter fires when the last of
    // them has settled. Whatever they did not fill gets an honest dash then,
    // rather than shimmering until the 12s backstop.
    var revealStats = lwCounter(2, 'tmr-lw-stats');
    var statsDone = function () { revealStats(); statsSettled(); };

    j('/users/trend-highlights').then(function (d) {
      if (d && d.users && d.users.length) livePicks(d.users);
      lwReveal('tmr-lw-b1');
    });

    // ONE request carries all three stripe figures. Picks tracked, pick makers
    // and members come from the same response so they can't be served from two
    // different snapshots, and there is no second endpoint left that could
    // supply a different value for any of them.
    j('/users/directory-metrics', 8000).then(function (d) {
      var m = d && d.metrics; if (!m) { statsDone(); return; }
      applyStatCells(
        m.total_graded_picks != null ? num(m.total_graded_picks).toLocaleString('en-US') : null,
        m.pick_makers != null ? num(m.pick_makers) : null,
        num(m.total_members)
      );
      statsDone();
    });

    j('/users/leaderboard?sortBy=net_units&limit=10', 8000).then(function (d) {
      if (!d) { statsDone(); lwReveal('tmr-lw-b2'); return; }
      var rows = d.leaderboard || [];
      if (rows.length) leaderboard(rows);
      // Only the "public records" badge. The Pick Makers cell is owned by the
      // directory-metrics call above — feeding it from here too would put a
      // second definition behind one label again.
      platform(num(d.total_eligible_handicappers));
      statsDone();
      lwReveal('tmr-lw-b2');
    });
  }

  /* ---------- INTEGRITY SAFEGUARD -----------------------------------------
     Production must never show mock/demo/fallback engagement data. Any module
     whose live request failed is left with an honest state, never invented
     numbers. Runs after the data calls have had time to resolve.
     ----------------------------------------------------------------------- */
  function integritySweep() {
    // Reveal failsafe: whatever regions are still gated after 4s show their
    // baked snapshot rather than staying hidden. (Was 9s when every module
    // waited on its own heavy uncached endpoint; the single cached bootstrap
    // normally settles in well under a second.)
    ['tmr-lw-stats', 'tmr-lw-spot', 'tmr-lw-b1', 'tmr-lw-b2', 'tmr-lw-b3'].forEach(lwReveal);
    document.querySelectorAll('.loading').forEach(function (n) {
      n.textContent = 'Data unavailable';
    });
    /* NOTE: placeholders are NOT resolved here. This sweep runs at 4s, and a
       backend having a slow minute answers after it — dashing the figures out
       at 4s only to write the real ones at 5s is the same visible swap this
       whole change exists to remove. placeholderSweep() below is the deadline
       for that, and every request settles its own region the moment it lands. */
    /* The ticker is NEVER hidden here. Hiding was a one-shot decision a late slate
       could not undo: /nav/mlb-slate regularly answers after this 4s sweep, so the
       whole ticker vanished even though its data arrived seconds later. Report the
       honest state in the lane instead and leave the module on screen -- the 90s
       refresh keeps retrying, and renderTicker fills it whenever the slate lands. */
    var lane = document.querySelector('.ticker .ticker-games');
    /* Skeleton cards are .gm too, so they must not count as a populated lane.
       While the request is still in flight the skeleton is the correct state and
       is left alone; only a settled-and-empty lane gets the message. */
    if (lane && !lane.querySelectorAll('.gm:not(.is-skel)').length) {
      if (tickerSettled) laneMsg(lane, UNAVAILABLE_TEXT, '');
      else if (!lane.querySelector('.gm.is-skel')) laneSkeleton(lane);
    }
    showTicker();
  }
  setTimeout(integritySweep, 4000);

  /* ---------- PLACEHOLDER DEADLINE ----------------------------------------
     Last resort, well past every request's own timeout: anything still showing
     a skeleton is never going to be filled, so put an honest dash in its box
     rather than let it shimmer for the rest of the session. Deliberately later
     than integritySweep — see the note there. The boxes are size-reserved, so
     this changes no geometry either. -------------------------------------- */
  function placeholderSweep() {
    document.querySelectorAll('#tmrEyebrowPicks, .bridge .s b').forEach(function (b) {
      if (b.querySelector('.sk') || !b.textContent.trim()) b.textContent = '—';
    });
    compSettled();
    /* The ticker's own deadline. integritySweep only writes the honest message
       once tickerSettled is true, which never happens if the request neither
       resolves nor rejects. This is the backstop for that: a lane that is still
       nothing but skeletons this late is not loading, it is stuck, and saying so
       is what the reserved box is for. The 90s refresh keeps retrying and
       renderTicker replaces this the moment a slate arrives. */
    var lane = document.querySelector('.ticker .ticker-games');
    if (lane && !lane.querySelectorAll('.gm:not(.is-skel)').length &&
        !lane.querySelector('.gm.is-msg')) {
      laneMsg(lane, UNAVAILABLE_TEXT, '');
    }
  }
  setTimeout(placeholderSweep, 12000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
