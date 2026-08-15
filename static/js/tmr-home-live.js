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
  var BUILD = '610793a676ad';
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
  var TICKER_ROTATE_MS = 7000;         // dwell time on each group before advancing
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

  /* Probable pitchers render ONLY when the league has officially posted both. */
  function pitcherLine(g) {
    if (!g.away_pitcher || !g.home_pitcher) return '';
    var short = function (n) {
      var p = String(n).trim().split(/\s+/);
      return p.length < 2 ? n : p[0].charAt(0) + '. ' + p.slice(1).join(' ');
    };
    return '<span class="gm-sp">' + esc(short(g.away_pitcher)) + ' vs ' + esc(short(g.home_pitcher)) + '</span>';
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
    if (!payload || (payload.ok === false && !nflGames.length)) {
      laneMsg(lane, UNAVAILABLE_TEXT, '');
      return;
    }
    lastSlate = payload;
    var games = payload.games || [];
    if (!games.length && !nflGames.length) {
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
        pitcherLine(g);
      /* A trend renders only when the engine verified one, and carries its exact
         sample size and period. No trend => nothing. Never placeholder text. */
      if (g.trend && g.trend.text) {
        html += '<span class="gm-tr" data-href="' + esc(g.trend.href || '') + '" title="' +
          esc('Sample ' + g.trend.sample + ' games · ' + g.trend.period) + '">' +
          '<span class="ts" aria-hidden="true"></span>' + esc(g.trend.text) + '</span>';
      }
      html += '</a>';
    });

    /* The NFL row (Nima, 2026-08-14): the strip carries both sports, one row at
       a time. NFL cards live in their own page(s) - layoutTicker never mixes
       sports in a group - and carry the weekday in the chip because most NFL
       games are not today's. No data-game-pk: the MLB preview treatment can
       never attach to them. */
    nflGames.forEach(function (g) {
      html += '<a class="gm gm--nfl" data-sport="nfl"' +
        ' href="' + esc(g.href || '/sportsbook/') + '">' +
        '<span class="gm-top">' +
          '<span class="t">' + logoImg(g.away_logo) + esc(g.away) + '</span>' +
          '<span class="t">' + logoImg(g.home_logo) + esc(g.home) + '</span>' +
          statusChip(g) +
        '</span>' +
      '</a>';
    });
    /* Render every card into one measuring row inside the track, then split into
       width-fitted groups. Cards are never dropped, duplicated or reordered here. */
    lane.innerHTML = '<div class="ticker-track"><div class="ticker-page">' + html + '</div></div>';
    lane.setAttribute('data-slate-date', payload.slate_date || '');
    lane.setAttribute('aria-busy', 'false');

    /* Clicking the trend goes to TrendSpotter; the rest of the card goes to the
       Handicapping Hub page for that specific game. */
    lane.querySelectorAll('.gm-tr[data-href]').forEach(function (n) {
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

  function applyTickerPage() {
    var lane = el('.ticker .ticker-games'); if (!lane) return;
    var track = lane.querySelector('.ticker-track'); if (!track) return;
    track.style.transform = 'translateX(-' + (tkPageIndex * 100) + '%)';
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
    tkPageIndex = (tkPageIndex + delta + tkPageCount) % tkPageCount;
    applyTickerPage();
    updateTickerNav();
    startTickerRotate();          // manual move resets the dwell timer
  }

  function updateTickerNav() {
    var prev = el('.ticker .tk-prev'), next = el('.ticker .tk-next');
    var show = tkPageCount > 1;
    if (prev) prev.hidden = !show;
    if (next) next.hidden = !show;
  }

  function startTickerRotate() {
    stopTickerRotate();
    if (tkPageCount <= 1) return;
    tkRotTimer = setInterval(function () {
      if (tkPaused || document.hidden) return;
      tkPageIndex = (tkPageIndex + 1) % tkPageCount;
      applyTickerPage();
      updateTickerNav();
    }, TICKER_ROTATE_MS);
  }

  function stopTickerRotate() {
    if (tkRotTimer) { clearInterval(tkRotTimer); tkRotTimer = null; }
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
    body.innerHTML = ranked.slice(0, 8).map(function (u, i) {
      var rk = i < 3 ? 'rk g' + (i + 1) : 'rk';
      var w = u.wins != null ? u.wins + '-' + u.losses + (num(u.pushes) ? '-' + u.pushes : '') : num(u.total_picks) + ' picks';
      return '<div class="lbr"><span class="' + rk + '">' + (i + 1) + '</span>' +
        avatar(u, 'ava') +
        '<span class="nm"><a href="/u/' + encodeURIComponent(u.username) + '/"><b>' + esc(u.username) + '</b></a><span>' + esc(w) + ' &middot; ' + num(u.total_picks) + ' picks</span></span>' +
        '<span class="un"><b class="' + (num(u.net_units) >= 0 ? 'pos' : 'neg') + '">' + sign(num(u.net_units)) + 'u</b>' +
        '<span>' + num(u.roi).toFixed(1) + '% ROI</span></span></div>';
    }).join('');
  }

  /* ---------- 4. CAPPER OF THE WEEK ---------------------------------------
     Editorially designated. The complete card payload (record, units, ROI,
     win rate, avg odds, streak, last graded picks) now arrives server-
     assembled — from the SAME canonical sources his profile page reads — in
     one response (home-bootstrap or /users/capper-of-week `card`), replacing
     the old 4-request client waterfall that left this card blank for seconds
     on a busy backend. If no capper is designated or the payload is missing,
     the prerendered/baked markup is left exactly as-is. */
  /* The card ships as a skeleton (see index.html). Clear the skeleton state once
     the payload has been written, or — when there is no payload — replace every
     remaining placeholder with an honest dash so nothing shimmers forever. The
     card's box is unchanged either way. */
  function capperSettled() {
    var spot = el('.spot'); if (!spot) return;
    var bd = el('.spot .bd');
    if (bd) { bd.classList.remove('is-skel'); bd.setAttribute('aria-busy', 'false'); }
    /* Anything the payload did not fill is still a placeholder. Dash it — never
       leave a permanent shimmer, and never invent a value. */
    spot.querySelectorAll('.sub2 .sk, .g3 b .sk, .ft span .sk, .lb .sk, .avbox .sk, .nmrow b .sk')
      .forEach(function (n) {
        var host = n.parentNode;
        if (host && host.querySelectorAll('.sk').length === 1) host.textContent = '—';
        else n.remove();
      });
    if (spot.querySelector('.spark .sk')) sparkFallback();
  }

  function applyCapper(card) {
    try {
      var username = card && card.username; if (!username) return;
      var spot = el('.spot'); if (!spot) return;

      var nm = el('.spot .nmrow b', document);
      if (nm) { setText(nm, username);
        var pl = nm.closest('.nmrow'); if (pl && !pl.dataset.linked) { pl.dataset.linked = '1';
          nm.outerHTML = '<a href="/profile/?user=' + encodeURIComponent(username) + '"><b>' + esc(username) + '</b></a>'; } }
      var fullProfile = el('.spot .hd a'); if (fullProfile) fullProfile.href = '/u/' + encodeURIComponent(username) + '/';
      var ledger = el('.spot .ft a:not(#tmrCapperBuy)'); if (ledger) ledger.href = '/u/' + encodeURIComponent(username) + '/';
      // Buy-picks link follows the featured capper to their marketplace storefront.
      var buy = el('#tmrCapperBuy'); if (buy) buy.href = '/marketplace/seller/?u=' + encodeURIComponent(username);
      var av = el('.spot .avbox'); if (av) setText(av, initials(username));

      var u = card.user; if (!u) return;
      var cells = spot.querySelectorAll('.g3 b');
      if (cells.length >= 3) {
        var W = u.wins, L = u.losses, P = num(u.pushes);
        setText(cells[0], (W == null || L == null) ? num(u.total_picks) + ' picks' : (W + '-' + L + (P ? '-' + P : '')));
        setText(cells[1], sign(num(u.net_units))); cells[1].className = 'num ' + (num(u.net_units) >= 0 ? 'pos' : 'neg');
        setText(cells[2], num(u.roi).toFixed(1) + '%'); cells[2].className = 'num ' + (num(u.roi) >= 0 ? 'pos' : 'neg');
      }
      var ft = el('.spot .ft span'); if (ft) setText(ft, num(u.total_picks) + ' picks, every one locked pre-game');

      var s = card.summary || {};
      var winRate = num(s.win_rate);
      var avgOdds = Math.round(num(s.avg_odds));
      var streak = num(u.current_streak);
      var streakTxt = streak > 0 ? 'W' + streak : streak < 0 ? 'L' + Math.abs(streak) : 'no active streak';
      var sub2 = el('.spot .sub2');
      if (sub2) setText(sub2, (u.favorite_sports && u.favorite_sports.length
        ? u.favorite_sports.join(', ') : 'All sports') + ' · ' + num(u.total_picks) + ' tracked picks' +
        ' · ' + winRate.toFixed(1) + '% win rate · ' + (avgOdds > 0 ? '+' : '') + avgOdds + ' avg odds · ' + streakTxt);

      var picks = card.recent_graded || [];
      var sp = el('.spot .spark');
      if (sp) {
        if (!picks.length) { sparkFallback(); }
        else {
          var mx = Math.max.apply(null, picks.map(function (p) { return Math.abs(num(p.result_units)) || 1; })) || 1;
          var html = picks.map(function (p) {
            var v = num(p.result_units), h = Math.max(18, Math.round(Math.abs(v) / mx * 100));
            return '<i class="' + (v < 0 ? 'dn' : '') + '" style="height:' + h + '%"></i>';
          }).join('');
          if (sp.innerHTML !== html) sp.innerHTML = html;
          var lb = el('.spot .lb');
          if (lb) { var w2 = picks.filter(function (p) { return /won/i.test(p.status); }).length;
            var lbHtml = '<span>Last ' + picks.length + ' graded picks</span><span>' + w2 + 'W &middot; ' + (picks.length - w2) + 'L</span>';
            if (lb.innerHTML !== lbHtml) lb.innerHTML = lbHtml; }
        }
      }
    } finally {
      capperSettled();
      lwReveal('tmr-lw-spot');
    }
  }

  /* Fallback when home-bootstrap is unavailable: one request to the (also
     server-assembled) capper-of-week endpoint. */
  function capperOfWeek() {
    j('/users/capper-of-week', 8000).then(function (d) {
      if (d && d.card) { applyCapper(d.card); return; }
      capperSettled();
      lwReveal('tmr-lw-spot');
    });
  }

  /* Keep the sparkline's reserved 50px box — emptying .sparkwrap collapsed the
     card by ~68px and dragged the whole hero with it. */
  function sparkFallback() {
    var lb = el('.spot .lb');
    if (lb) lb.innerHTML = '<span>Recent picks</span><span>Data unavailable</span>';
    var sp = el('.spot .spark');
    if (sp) sp.innerHTML = '';
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

      applyCapper(d.capper);
    });
  }

  /* Legacy per-endpoint path, kept verbatim as the bootstrap fallback. */
  function legacyBoot() {
    capperOfWeek();
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

    j('/users/leaderboard?sortBy=net_units&limit=8', 8000).then(function (d) {
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
    capperSettled();
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
