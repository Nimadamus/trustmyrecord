/* =============================================================================
   TrustMyRecord homepage — live production data binding
   Fills the approved v2 layout from real API data only. Never invents values:
   if an endpoint fails or returns nothing, the affected block is left as-is or
   hidden rather than showing fabricated activity.
   ============================================================================= */
(function () {
  'use strict';
  var API = 'https://trustmyrecord-api.onrender.com/api';

  function j(path) {
    return fetch(API + path, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function el(sel, root) { return (root || document).querySelector(sel); }
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
  var tickerTimer = null;
  var tickerSlateDate = null;

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

  function renderTicker(payload) {
    var lane = el('.ticker .ticker-games'); if (!lane) return;

    if (!payload || payload.ok === false) {
      lane.innerHTML = '<span class="gm is-msg"><span class="st">' +
        'MLB matchups are currently unavailable</span></span>';
      lane.setAttribute('data-slate-date', '');
      return;
    }
    var games = payload.games || [];
    if (!games.length) {
      lane.innerHTML = '<span class="gm is-msg"><span class="st">' +
        'No MLB games scheduled today</span></span>';
      lane.setAttribute('data-slate-date', payload.slate_date || '');
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
    lane.innerHTML = html;
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
    j('/nav/mlb-slate').then(function (payload) {
      /* Refuse a response that raced across a date rollover. */
      if (payload && payload.slate_date && payload.slate_date !== slateDatePT()) {
        renderTicker(null); return;
      }
      renderTicker(payload);
    }).catch(function () { renderTicker(null); });
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
          '<span class="mt"><span class="lgchip">' + esc(lg) + '</span>' + esc(p.market_type || '') + ' &middot; auto-graded</span>' +
        '</span>' +
        '<span class="rt">' + badge + '<span class="u">' + units + '</span></span>' +
      '</div>';
    }).join('');
  }

  /* ---------- 3. LEADERBOARD + 4. CAPPER OF THE WEEK ---------------------- */
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

    var top = ranked[0]; if (!top) return;
    var spot = el('.spot'); if (!spot) return;
    var nm = el('.spot .nmrow b', document);
    if (nm) { nm.textContent = top.username;
      var pl = nm.closest('.nmrow'); if (pl && !pl.dataset.linked) { pl.dataset.linked='1';
        nm.outerHTML = '<a href="/profile/?user=' + encodeURIComponent(top.username) + '"><b>' + top.username + '</b></a>'; } }
    var fullProfile = el('.spot .hd a'); if (fullProfile) fullProfile.href = '/u/' + encodeURIComponent(top.username) + '/';
    var ledger = el('.spot .ft a'); if (ledger) ledger.href = '/u/' + encodeURIComponent(top.username) + '/';
    var sub = el('.spot .sub2'); if (sub) sub.textContent = (top.favorite_sports && top.favorite_sports.length
      ? top.favorite_sports.join(', ') : 'All sports') + ' · ' + num(top.total_picks) + ' tracked picks';
    var cells = spot.querySelectorAll('.g3 b');
    if (cells.length >= 3) {
      // RECORD must be the real W-L-P record, never a pick count.
      // /api/users (list) omits W/L, so read the capper's own record endpoint.
      // Do NOT blank the cell while that request is in flight: the prerendered
      // markup already carries a real baked record, and replacing it with a
      // spinner-ish '…' is the visible mid-load swap this page is meant to avoid.
      // Only fill in when the slot is genuinely empty (placeholder or no bake).
      if (!cells[0].textContent.trim() || cells[0].textContent.trim() === '—') cells[0].textContent = '…';
      j('/users/' + encodeURIComponent(top.username)).then(function (du) {
        var u2 = (du && (du.user || du)) || {};
        var W = u2.wins, L = u2.losses, P = num(u2.pushes);
        if (W == null || L == null) { cells[0].textContent = num(top.total_picks) + ' picks'; return; }
        cells[0].textContent = W + '-' + L + (P ? '-' + P : '');
      });
      cells[1].textContent = sign(num(top.net_units)); cells[1].className = 'num pos';
      cells[2].textContent = num(top.roi).toFixed(1) + '%'; cells[2].className = 'num pos';
    }
    var av = el('.spot .avbox'); if (av) av.textContent = initials(top.username);
    var ft = el('.spot .ft span'); if (ft) ft.textContent = num(top.total_picks) + ' picks, every one locked pre-game';
    // sparkline from the capper's real recent graded picks
    var sp = el('.spot .spark');
    var picks = (top.picks || []).filter(function (p) { return /won|lost/i.test(p.status || ''); }).slice(0, 12).reverse();
    if (sp && picks.length) {
      var mx = Math.max.apply(null, picks.map(function (p) { return Math.abs(num(p.result_units)) || 1; })) || 1;
      sp.innerHTML = picks.map(function (p) {
        var v = num(p.result_units), h = Math.max(18, Math.round(Math.abs(v) / mx * 100));
        return '<i class="' + (v < 0 ? 'dn' : '') + '" style="height:' + h + '%"></i>';
      }).join('');
      var lb = el('.spot .lb');
      if (lb) { var w2 = picks.filter(function (p) { return /won/i.test(p.status); }).length;
        lb.innerHTML = '<span>Last ' + picks.length + ' graded picks</span><span>' + w2 + 'W &middot; ' + (picks.length - w2) + 'L</span>'; }
    }
  }

  function sparkFallback() {
    var wrap = el('.spot .sparkwrap');
    if (wrap) wrap.innerHTML = '<div class="lb"><span>Recent picks</span><span>Data unavailable</span></div>';
  }

  /* ---------- 5. SPORTS TALK --------------------------------------------- */
  function sportsTalk() {
    var body = el('.board .card:nth-child(3) .body'); if (!body) return;
    j('/forum/threads/recent?limit=6').then(function (d) {
      var t = (d && (d.threads || d.data)) || (Array.isArray(d) ? d : []);
      if (!t || !t.length) return;
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
    });
  }

  /* ---------- 6. POLL — real options, real votes, honest empty states ------ */
  function poll() {
    var card = document.querySelectorAll('.compete .ccard')[2]; if (!card) return;
    var qEl = el('.pollq', card), mEl = el('.pollmeta', card), body = el('.pollbars', card);
    var fail = function (msg) {
      if (qEl) qEl.textContent = msg;
      if (mEl) mEl.textContent = '';
      if (body) body.innerHTML = '';
      var chip = card.querySelector('.cch .st'); if (chip) chip.textContent = '';
    };
    j('/polls/active').then(function (d) {
      if (d === null) { fail('Data unavailable'); return; }   // genuine request failure
      var list = (d && (d.polls || d.data)) || (Array.isArray(d) ? d : []);
      var head = Array.isArray(list) ? list[0] : list;
      if (!head || !head.id) { fail('No active poll right now.'); return; }
      j('/polls/' + head.id).then(function (full) {
        if (!full) { fail('Data unavailable'); return; }
        var p = full.poll || full;
        var opts = full.options || [];
        var total = num(full.total_votes != null ? full.total_votes : p.total_votes);
        if (!opts.length) { fail('No active poll right now.'); return; }

        if (qEl) qEl.textContent = p.title || p.question || '';
        if (mEl) mEl.textContent = total + ' vote' + (total === 1 ? '' : 's') +
          (p.status === 'active' ? ' · results public' : ' · closed');
        var chip = card.querySelector('.cch .st');
        if (chip) chip.textContent = p.status === 'active' ? 'Open' : 'Closed';

        var fills = ['linear-gradient(90deg,var(--brand-lt),var(--brand))',
                     'linear-gradient(90deg,#5A9BF2,var(--blue))',
                     'linear-gradient(90deg,#9781DE,var(--violet))',
                     'linear-gradient(90deg,#F0A199,var(--red))'];
        if (body) {
          body.innerHTML = opts.slice(0, 4).map(function (o, i) {
            var votes = num(o.vote_count);
            // percentages are derived from stored votes only; 0 votes => 0%
            var pct = total > 0 ? Math.round(votes / total * 100) : 0;
            return '<div class="pbar"><div class="r"><span>' + esc(o.option_text || o.text || '') +
              '</span><b class="num">' + pct + '%</b></div>' +
              '<div class="tr"><i style="width:' + pct + '%;background:' + fills[i % 4] + '"></i></div></div>';
          }).join('');
        }
      });
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
  function platform(users) {
    if (!users) return;
    var verified = users.filter(function (u) {
      return num(u.total_picks) > 0 && u.verification_status === 'verified'; }).length;
    var badges = document.querySelectorAll('.explore .ei .badge2');
    if (badges[2]) badges[2].innerHTML = '<span class="bl"></span>' + verified + ' public records';
  }

  /* ---------- boot -------------------------------------------------------- */
  function boot() {
    ticker();
    startTickerRefresh();
    sportsTalk();
    poll();
    arena();
    var all = [], off = 0;
    (function page() {
      j('/users?limit=200&offset=' + off).then(function (d) {
        if (!d) return finish();
        var u = d.users || [];
        all = all.concat(u);
        if (u.length >= 200 && off < 1000) { off += 200; page(); } else finish();
      });
    })();
    function finish() {
      if (!all.length) return;
      // bridge rail: derived from real users only
      var picksTotal = 0, verified = 0;
      all.forEach(function (u) {
        var tp = num(u.total_picks);
        picksTotal += tp;
        if (tp > 0 && u.verification_status === 'verified') verified++;
      });
      var cells = document.querySelectorAll('.bridge .s b');
      if (cells[0]) cells[0].textContent = picksTotal.toLocaleString();
      if (cells[1]) cells[1].textContent = String(verified);
      if (cells[2]) cells[2].textContent = String(all.length);
      leaderboard(all);
      platform(all);
      j('/users/trend-highlights').then(function (d) {
        if (!(d && d.users && d.users.length)) { sparkFallback(); return; }
        livePicks(d.users);
        // capper chart: real graded picks for the top-ranked capper
        var topName = (document.querySelector('.spot .nmrow b') || {}).textContent;
        var match = d.users.filter(function (u) { return u.username === topName; })[0];
        var graded = match ? (match.picks || []).filter(function (x) {
          return /won|lost/i.test(x.status || ''); }).slice(0, 12).reverse() : [];
        var sp = el('.spot .spark'), lb = el('.spot .lb');
        if (!sp) return;
        if (!graded.length) { sparkFallback(); return; }
        var mx = Math.max.apply(null, graded.map(function (x) {
          return Math.abs(num(x.result_units)) || 1; })) || 1;
        sp.innerHTML = graded.map(function (x) {
          var v = num(x.result_units), h = Math.max(18, Math.round(Math.abs(v) / mx * 100));
          return '<i class="' + (v < 0 ? 'dn' : '') + '" style="height:' + h + '%"></i>';
        }).join('');
        if (lb) { var w = graded.filter(function (x) { return /won/i.test(x.status); }).length;
          lb.innerHTML = '<span>Last ' + graded.length + ' graded picks</span><span>' +
            w + 'W · ' + (graded.length - w) + 'L</span>'; }
      });
    }
  }

  /* ---------- INTEGRITY SAFEGUARD -----------------------------------------
     Production must never show mock/demo/fallback engagement data. Any module
     whose live request failed is left with an honest state, never invented
     numbers. Runs after the data calls have had time to resolve.
     ----------------------------------------------------------------------- */
  function integritySweep() {
    document.querySelectorAll('.loading').forEach(function (n) {
      n.textContent = 'Data unavailable';
    });
    var bridge = document.querySelectorAll('.bridge .s b');
    bridge.forEach(function (b) { if (!b.textContent.trim()) b.textContent = '—'; });
    var t = document.querySelector('.ticker');
    if (t && !t.querySelectorAll('.gm').length) t.style.display = 'none';
  }
  setTimeout(integritySweep, 12000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
