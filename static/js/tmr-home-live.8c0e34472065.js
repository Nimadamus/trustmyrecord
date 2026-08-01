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
  var BUILD = '8c0e34472065';
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

  var TICKER_REFRESH_MS = 90 * 1000;   // pitching changes, PPDs, live status, finals
  var TICKER_ROTATE_MS = 7000;         // dwell time on each group before advancing
  var tickerTimer = null;
  var tickerSlateDate = null;

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

  function laneMsg(lane, text, slateDate) {
    lane.innerHTML = '<div class="ticker-track"><div class="ticker-page">' +
      '<span class="gm is-msg"><span class="st">' + esc(text) + '</span></span>' +
      '</div></div>';
    lane.setAttribute('data-slate-date', slateDate || '');
    tkPageIndex = 0; tkPageCount = 1;
    stopTickerRotate();
    updateTickerNav();
  }

  function renderTicker(payload) {
    var lane = el('.ticker .ticker-games'); if (!lane) return;

    if (!payload || payload.ok === false) {
      laneMsg(lane, 'MLB matchups are currently unavailable', '');
      return;
    }
    var games = payload.games || [];
    if (!games.length) {
      laneMsg(lane, 'No MLB games scheduled today', payload.slate_date || '');
      return;
    }

    var html = '';   // the TODAY label is its own static column in index.html
    games.forEach(function (g) {
      var dh = g.game_label ? '<em class="gm-dh">' + esc(g.game_label) + '</em>' : '';
      var off = g.status === 'postponed' || g.status === 'cancelled';
      html += '<a class="gm' + (off ? ' is-off' : '') + '" href="' + esc(g.href || '/handicapping/mlb/') + '">' +
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
    /* Render every card into one measuring row inside the track, then split into
       width-fitted groups. Cards are never dropped, duplicated or reordered here. */
    lane.innerHTML = '<div class="ticker-track"><div class="ticker-page">' + html + '</div></div>';
    lane.setAttribute('data-slate-date', payload.slate_date || '');

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
    if (cards[0].classList.contains('is-msg')) {
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
      cards.forEach(function (c) {
        var w = c.offsetWidth;
        var add = w + (cur.length ? GAP : 0);
        if (cur.length && used + add > vw) { pages.push(cur); cur = []; used = 0; add = w; }
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
    var lane = el('.ticker .ticker-games'); if (!lane) return;
    var today = slateDatePT();

    /* Any markup baked into the document at deploy time belongs to whatever slate
       date it was built on. If that is not today, drop it now rather than let a
       previous day's matchups sit on screen until the fetch resolves. */
    var baked = lane.getAttribute('data-slate-date');
    if (baked !== null && baked !== today) lane.innerHTML = '';

    tickerSlateDate = today;
    var slateFetch = function (bypassCache) {
      var opts = { headers: { Accept: 'application/json' } };
      if (bypassCache) opts.cache = 'reload';
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
        if (lane) lane.innerHTML = '';        // never leave a previous day on screen
      }
      ticker();
    });
  }

  /* ---------- 2. LIVE PICKS — real graded/pending picks -------------------- */
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
                : '<span class="badge p">Pending</span>';
      var ru = num(p.result_units);
      var units = st === 'pending' || !st ? num(p.units).toFixed(1) + 'u'
                : '<span class="' + (ru >= 0 ? 'pos' : 'neg') + '">' + sign(ru) + 'u</span>';
      var sel = p.selection || p.pick || p.market_type || 'Pick';
      var line = p.line_snapshot != null ? ' ' + p.line_snapshot : '';
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
      lwReveal('tmr-lw-spot');
    }
  }

  /* Fallback when home-bootstrap is unavailable: one request to the (also
     server-assembled) capper-of-week endpoint. */
  function capperOfWeek() {
    j('/users/capper-of-week').then(function (d) {
      if (d && d.card) { applyCapper(d.card); return; }
      lwReveal('tmr-lw-spot');
    });
  }

  function sparkFallback() {
    var wrap = el('.spot .sparkwrap');
    if (wrap) wrap.innerHTML = '<div class="lb"><span>Recent picks</span><span>Data unavailable</span></div>';
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
     authoritative aggregates every other page reads (directory-counts,
     directory-metrics, leaderboard total), so no page can disagree. All
     writes go through setText: an already-accurate first paint (edge-
     injected or freshly baked) is never visibly rewritten. */
  function applyStatCells(picksText, eligible, members) {
    var cells = document.querySelectorAll('.bridge .s b');
    if (picksText != null) {
      if (cells[0]) setText(cells[0], picksText);
      // Hero eyebrow duplicates the same "picks tracked" figure -- it must
      // never drift from the counter below it.
      setText(document.getElementById('tmrEyebrowPicks'), picksText);
    }
    if (eligible != null && cells[1]) setText(cells[1], String(eligible));
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

      var c = d.counts || {};
      var m = d.metrics || {};
      var eligible = d.total_eligible_handicappers != null ? num(d.total_eligible_handicappers) : null;
      applyStatCells(
        // Always en-US: the baked snapshot and the edge injection format this
        // number as "2,397"; a locale-dependent format would rewrite it for
        // non-US visitors and cause a visible swap of an unchanged value.
        c.total_valid_picks != null ? num(c.total_valid_picks).toLocaleString('en-US') : null,
        eligible,
        m.total_members != null ? num(m.total_members) : null
      );
      if (eligible != null) platform(eligible);
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
    var statsDone = lwCounter(3, 'tmr-lw-stats');

    j('/users/trend-highlights').then(function (d) {
      if (d && d.users && d.users.length) livePicks(d.users);
      lwReveal('tmr-lw-b1');
    });

    j('/users/directory-counts', 8000).then(function (d) {
      var c = d && d.counts; if (!c) { statsDone(); return; }
      applyStatCells(num(c.total_valid_picks).toLocaleString('en-US'), null, null);
      statsDone();
    });

    j('/users/directory-metrics', 8000).then(function (d) {
      var m = d && d.metrics; if (!m) { statsDone(); return; }
      applyStatCells(null, null, num(m.total_members));
      statsDone();
    });

    j('/users/leaderboard?sortBy=net_units&limit=8', 8000).then(function (d) {
      if (!d) { statsDone(); lwReveal('tmr-lw-b2'); return; }
      var rows = d.leaderboard || [];
      if (rows.length) leaderboard(rows);
      var eligible = num(d.total_eligible_handicappers);
      platform(eligible);
      applyStatCells(null, eligible, null);
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
    var bridge = document.querySelectorAll('.bridge .s b');
    bridge.forEach(function (b) { if (!b.textContent.trim()) b.textContent = '—'; });
    var t = document.querySelector('.ticker');
    if (t && !t.querySelectorAll('.gm').length) t.style.display = 'none';
  }
  setTimeout(integritySweep, 4000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
