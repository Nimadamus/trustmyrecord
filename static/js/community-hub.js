/* COMMUNITY_HUB_20261117: live layer for /community/.
   Every number and row on the page comes from the public API at load time:
   member counts (/users/directory-counts, /forum/stats) and the newest member.
   Nothing is invented. A block whose source fails or comes back empty stays
   hidden and the layout closes up around it. */
(function () {
  'use strict';

  var API = (window.TMRSession && window.TMRSession.api) ||
            (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) ||
            'https://api.trustmyrecord.com/api';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var NOW = Date.now();

  function get(path) {
    return fetch(API + path, { headers: { accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }
  function units(n) { n = Number(n || 0); return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(2) + 'u'; }
  function tone(n) { n = Number(n || 0); return n > 0 ? 'up' : n < 0 ? 'down' : 'flat'; }
  function ago(iso) {
    var t = Date.parse(iso); if (!t) return '';
    var s = Math.max(0, (NOW - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
  }
  function pacDay(iso) {
    return new Date(Date.parse(iso)).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  }
  function profile(u) { return '/u/' + encodeURIComponent(u) + '/'; }
  function hue(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function avatar(u, url, size) {
    var cls = 'hub-av' + (size ? ' hub-av--' + size : '');
    var ini = esc(String(u || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?');
    var fb = '<span class="' + cls + ' hub-av--ini" style="--h:' + hue(u) + '">' + ini + '</span>';
    if (!url) return fb;
    return '<span class="' + cls + '" style="--h:' + hue(u) + '"><img src="' + esc(url) + '" alt="" loading="lazy" decoding="async" ' +
      'onerror="this.parentNode.classList.add(\'hub-av--ini\');this.parentNode.textContent=\'' + ini + '\'"></span>';
  }
  var LEAGUE = { basketball_nba: 'NBA', basketball_ncaab: 'NCAAB', basketball_wnba: 'WNBA', americanfootball_nfl: 'NFL',
    americanfootball_ncaaf: 'NCAAF', icehockey_nhl: 'NHL', baseball_mlb: 'MLB' };
  function league(x) {
    if (x.pick_league) return x.pick_league;
    var k = x.pick_sport_key || x.sport || '';
    if (LEAGUE[k]) return LEAGUE[k];
    if (/^soccer/.test(k)) return 'Soccer';
    if (/^tennis/.test(k)) return 'Tennis';
    if (/^mma/.test(k)) return 'MMA';
    return '';
  }
  function odds(o) { o = Number(o); if (!o) return ''; return o > 0 ? '+' + o : String(o).replace('-', '−'); }
  function shortTeam(t) { t = String(t || ''); var p = t.split(' '); return p.length > 1 ? p.slice(0, -1).join(' ') : t; }

  /* ---------------------------------------------------------------- session */
  function signedIn() { try { return !!(window.TMRSession && window.TMRSession.hasTokens()); } catch (_) { return false; } }
  function paintCta() {
    if (!signedIn()) return;
    document.documentElement.classList.add('hub-signed-in');
    var c = $('#hubCta'); if (!c) return;
    c.innerHTML =
      '<a class="hub-btn hub-btn--gold" href="/feed/#composerCard">' + ICON.pen + 'Post to the feed</a>' +
      '<a class="hub-btn hub-btn--ghost" href="/sportsbook/">' + ICON.lock + 'Lock a pick</a>' +
      '<a class="hub-btn hub-btn--ghost" href="/forum/">' + ICON.chat + 'Start a thread</a>';
    var b = $('#hubBandCta');
    if (b) b.innerHTML = '<a class="hub-btn hub-btn--gold" href="/feed/#composerCard">' + ICON.pen + 'Post a take</a>' +
      '<a class="hub-btn hub-btn--ghost" href="/profile/">View my record</a>';
  }
  var ICON = {
    pen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 2-5 5-5 8 0 4 3 7 7 7z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>'
  };

  /* ---------------------------------------------------------------- stats */
  function paintStats(counts, forum) {
    var box = $('#hubStats'); if (!box) return;
    var c = (counts && counts.counts) || {};
    var vals = {
      members: c.public_directory_eligible_users,
      week: c.active_pick_makers_7d,
      picks: c.total_valid_picks,
      today: forum && forum.new_users_today != null ? Number(forum.new_users_today) : null
    };
    var shown = 0;
    Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function (el) {
      var v = vals[el.getAttribute('data-k')];
      var tile = el.closest('.hub-stat');
      if (v == null || isNaN(v)) { tile.hidden = true; return; }
      el.textContent = num(v); tile.classList.add('is-ready'); shown++;
    });
    if (!shown) box.hidden = true;
  }
  function paintNewest(forum, joins) {
    var m = forum && forum.newest_member; var el = $('#hubNewest');
    if (!m || !el) return;
    var welcome = (joins || []).filter(function (x) { return x.username === m.username && /^milestone:\d+$/.test(x.item_id); })[0];
    el.innerHTML = '<span class="hub-newest__txt"><span class="hub-newest__dot"></span>Newest member <a href="' + profile(m.username) + '">' +
      esc(m.display_name || m.username) + '</a> joined ' + esc(ago(m.created_at)) + '</span>' +
      (welcome ? '<a class="hub-newest__go" href="/feed/?post=' + encodeURIComponent(welcome.item_id) + '">Say welcome ' + ICON.arrow + '</a>' : '');
    el.hidden = false;
  }

  /* ---------------------------------------------------------------- boot */
  function settle(p) { return p.then(function (v) { return v; }, function () { return null; }); }
  function boot() {
    paintCta();
    var pCounts = settle(get('/users/directory-counts'));
    var pForum = settle(get('/forum/stats'));
    var pMs = settle(get('/feed?limit=20&offset=0&filter=milestones'));
    Promise.all([pCounts, pForum]).then(function (r) { paintStats(r[0], r[1]); });
    Promise.all([pForum, pMs]).then(function (r) { paintNewest(r[0], (r[1] && r[1].feed) || []); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
