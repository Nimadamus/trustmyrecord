/* =============================================================================
   TrustMyRecord homepage — live production data binding
   Fills the approved v2 layout from real API data only. Never invents values:
   if an endpoint fails or returns nothing, the affected block is left as-is or
   hidden rather than showing fabricated activity.
   ============================================================================= */
(function () {
  'use strict';
  var MLB_LOGO = {
    ARI:'ari', ATH:'ath', ATL:'atl', BAL:'bal', BOS:'bos', CHC:'chc', CWS:'chw',
    CIN:'cin', CLE:'cle', COL:'col', DET:'det', HOU:'hou', KC:'kc', LAA:'laa',
    LAD:'lad', MIA:'mia', MIL:'mil', MIN:'min', NYM:'nym', NYY:'nyy', PHI:'phi',
    PIT:'pit', SD:'sd', SF:'sf', SEA:'sea', STL:'stl', TB:'tb', TEX:'tex',
    TOR:'tor', WSH:'wsh'
  };
  function teamLogo(abbr) {
    var slug = MLB_LOGO[abbr];   // exact map only, same doctrine as MLB_ABBR
    return slug
      ? '<img src="https://a.espncdn.com/i/teamlogos/mlb/500-dark/' + slug + '.png" alt="" loading="lazy" onerror="this.remove()">'
      : '';
  }

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

  /* ---------- 1. TICKER — real scheduled MLB games, official abbreviations only.
     A game renders only if BOTH team names resolve exactly in MLB_ABBR; nothing
     is generated, guessed, or truncated. If no game validates, say so. -------- */
  var MLB_ABBR = {
    'Arizona Diamondbacks': 'ARI', 'Athletics': 'ATH', 'Oakland Athletics': 'ATH',
    'Atlanta Braves': 'ATL', 'Baltimore Orioles': 'BAL', 'Boston Red Sox': 'BOS',
    'Chicago Cubs': 'CHC', 'Chicago White Sox': 'CWS', 'Cincinnati Reds': 'CIN',
    'Cleveland Guardians': 'CLE', 'Colorado Rockies': 'COL', 'Detroit Tigers': 'DET',
    'Houston Astros': 'HOU', 'Kansas City Royals': 'KC', 'Los Angeles Angels': 'LAA',
    'Los Angeles Dodgers': 'LAD', 'Miami Marlins': 'MIA', 'Milwaukee Brewers': 'MIL',
    'Minnesota Twins': 'MIN', 'New York Mets': 'NYM', 'New York Yankees': 'NYY',
    'Philadelphia Phillies': 'PHI', 'Pittsburgh Pirates': 'PIT', 'San Diego Padres': 'SD',
    'San Francisco Giants': 'SF', 'Seattle Mariners': 'SEA', 'St. Louis Cardinals': 'STL',
    'Tampa Bay Rays': 'TB', 'Texas Rangers': 'TEX', 'Toronto Blue Jays': 'TOR',
    'Washington Nationals': 'WSH'
  };
  function ticker() {
    var box = el('.ticker'); if (!box) return;
    var empty = function () {
      box.querySelector('.ticker-in').innerHTML =
        '<span class="tlbl"><span class="bl"></span>Today</span>' +
        '<span class="gm"><span class="st">No verified MLB games available right now.</span></span>';
    };
    j('/games').then(function (d) {
      var games = (d && d.games) || [];
      var now = Date.now(), todayStr = new Date().toDateString(), seen = {};
      games = games.filter(function (g) {
        if (!g || g.sport_key !== 'baseball_mlb') return false;
        var away = MLB_ABBR[g.away_team], home = MLB_ABBR[g.home_team];
        if (!away || !home || away === home) return false;
        var ts = new Date(g.commence_time).getTime();
        if (isNaN(ts)) return false;
        if (new Date(ts).toDateString() !== todayStr) return false;
        if (ts <= now - 6 * 3600e3) return false;
        var key = g.away_team + '|' + g.home_team;
        if (seen[key]) return false;
        seen[key] = 1;
        return true;
      }).sort(function (a, b) { return new Date(a.commence_time) - new Date(b.commence_time); })
        .slice(0, 6);
      if (!games.length) { empty(); return; }
      var html = '<span class="tlbl"><span class="bl"></span>Today</span>';
      games.forEach(function (g) {
        var t = new Date(g.commence_time);
        var when = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        html += '<a class="gm" href="/sportsbook/">' +
          '<span class="t">' + teamLogo(MLB_ABBR[g.away_team]) + esc(MLB_ABBR[g.away_team]) + '</span>' +
          '<span class="t">' + teamLogo(MLB_ABBR[g.home_team]) + esc(MLB_ABBR[g.home_team]) + '</span>' +
          '<span class="st">' + esc(when) + '</span></a>';
      });
      box.querySelector('.ticker-in').innerHTML = html;
    }).catch(empty);
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
      cells[0].textContent = '…';
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
        var href = x.slug ? '/forum/thread/' + encodeURIComponent(x.slug) + '/' : '/forum/';
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
