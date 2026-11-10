/* MEMBER_HOME_20261101 - /home/: the returning member dashboard.
 * MEMBER_HOME_REDESIGN_20261110: dark dashboard layout (static/css/member-home.css). Same
 * endpoints, same links, same entitlement checks; only the presentation changed.
 * Reads only existing endpoints (no writes):
 *   /api/auth/me, /api/sim-archive/mine, /api/premium/me,
 *   /api/simulator-runs/status?sim=<sport>, /api/picks/activation-status,
 *   /api/games?sport=<key> (public, light).
 * Every block fails on its own: a slow or failed call drops that block, never the page.
 * API text goes in with textContent. GA4: member_home_viewed, member_home_click.
 */
(function () {
  'use strict';
  var root = document.getElementById('mhRoot');
  if (!root) return;
  var S = window.TMRSession;
  var BASE = (S && S.api ? String(S.api) : (window.TMR_API_BASE || 'https://api.trustmyrecord.com/api')).replace(/\/$/, '');
  if (!/\/api$/.test(BASE)) BASE += '/api';

  var SPORTS = {
    nfl: { key: 'americanfootball_nfl', label: 'NFL', months: [9, 10, 11, 12, 1, 2] },
    nba: { key: 'basketball_nba', label: 'NBA', months: [10, 11, 12, 1, 2, 3, 4, 5, 6] },
    nhl: { key: 'icehockey_nhl', label: 'NHL', months: [10, 11, 12, 1, 2, 3, 4, 5, 6] },
    mlb: { key: 'baseball_mlb', label: 'MLB', months: [3, 4, 5, 6, 7, 8, 9, 10] }
  };

  function track(n, p) { try { if (typeof window.gtag === 'function') window.gtag('event', n, p || {}); } catch (e) {} }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined && text !== null) n.textContent = String(text); return n; }
  function link(cls, href, text, action) {
    var a = el('a', cls, text); a.href = href;
    if (action) a.addEventListener('click', function () { track('member_home_click', { action: action }); });
    return a;
  }
  function hasTokens() {
    if (S && S.hasTokens) return S.hasTokens();
    try { return !!(localStorage.getItem('trustmyrecord_token') || localStorage.getItem('accessToken')); } catch (e) { return false; }
  }
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]);
  }
  function getAuth(path) {
    var f = (S && S.authFetch) ? S.authFetch(BASE + path) : fetch(BASE + path);
    return withTimeout(f, 20000).then(function (r) { if (!r.ok) { var e = new Error('http ' + r.status); e.status = r.status; throw e; } return r.json(); });
  }
  function getPublic(path) {
    return withTimeout(fetch(BASE + path, { credentials: 'omit' }), 15000).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  }
  function soft(p) { return p.then(function (v) { return v; }, function () { return null; }); }
  function pacificMonth() {
    try { return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'numeric' }).format(new Date())); }
    catch (e) { return new Date().getMonth() + 1; }
  }
  function whenPT(iso) {
    var s = String(iso || ''); if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z';
    var d = new Date(s); if (isNaN(d)) return '';
    var today = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'numeric', day: 'numeric' });
    var label = today.format(d) === today.format(new Date()) ? 'Today' :
      d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' });
    return label + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) + ' PT';
  }
  function pct(v) { return Math.round(Number(v) * 100) + '%'; }

  /* Static, hand-written icons only. Never built from API text. */
  var ICON = {
    bars: '<svg width="46" height="44" viewBox="0 0 46 44" fill="#2a8bff" aria-hidden="true"><rect x="2" y="26" width="10" height="16" rx="1"/><rect x="17" y="16" width="10" height="26" rx="1"/><rect x="32" y="4" width="10" height="38" rx="1"/></svg>',
    info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7v.5"/></svg>',
    trophy: '<svg width="36" height="36" viewBox="0 0 24 24" fill="#7dffb0" aria-hidden="true"><path d="M6 2h12v2h4v3a5 5 0 0 1-5 5 6 6 0 0 1-4 3v3h4v3H7v-3h4v-3a6 6 0 0 1-4-3 5 5 0 0 1-5-5V4h4zm0 4H4v1a3 3 0 0 0 2 3zm12 0v4a3 3 0 0 0 2-3V6z"/></svg>',
    target: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#27c4ff" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="13" r="9"/><circle cx="11" cy="13" r="4"/><path d="M11 13 21 3M17 3h4v4"/></svg>',
    check: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3ddc84" stroke-width="2.4" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m7 12 3.5 3.5L17 9"/></svg>',
    clock: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    play: '<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="#27a8ff"/><path d="M15 11v18l15-9z" fill="#04101f"/></svg>',
    crown: '<svg width="46" height="38" viewBox="0 0 26 20" fill="#f6b91f" aria-hidden="true"><path d="M2 16 0 4l7 5 6-9 6 9 7-5-2 12zM2 18h22v2H2z"/></svg>',
    spark: '<svg class="mh2-spark" viewBox="0 0 300 120" fill="none" aria-hidden="true"><path d="M0 120V0M50 120V0M100 120V0M150 120V0M200 120V0M250 120V0M0 30h300M0 60h300M0 90h300" stroke="#f6b91f" stroke-opacity=".12"/><path d="M10 112 60 78l22 16 40-40 26 20 46-34 22 14 58-56" stroke="#f6b91f" stroke-width="4" stroke-linejoin="round"/><path d="m262 6 26-2-6 26z" fill="#f6b91f"/></svg>',
    bolt: '<svg width="30" height="40" viewBox="0 0 30 40" fill="#2a8bff" aria-hidden="true"><path d="M18 0 2 22h10L8 40l20-24H17z"/></svg>',
    infoFill: '<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="16" fill="#27a8ff"/><path d="M15 14h4v12h-4zM15 8h4v4h-4z" fill="#04101f"/></svg>',
    lBars: '<svg width="28" height="24" viewBox="0 0 46 44" fill="#2a8bff" aria-hidden="true"><rect x="2" y="26" width="10" height="16"/><rect x="17" y="16" width="10" height="26"/><rect x="32" y="4" width="10" height="38"/></svg>',
    lPad: '<svg width="32" height="24" viewBox="0 0 32 24" fill="#2a8bff" aria-hidden="true"><path d="M8 3h16a8 8 0 0 1 8 9l-1 8a3 3 0 0 1-5 1l-4-5H10l-4 5a3 3 0 0 1-5-1L0 12a8 8 0 0 1 8-9z"/></svg>',
    lSave: '<svg width="28" height="28" viewBox="0 0 24 24" fill="#2a8bff" aria-hidden="true"><path d="M4 2h16v20l-8-5-8 5z"/></svg>',
    lTrophy: '<svg width="30" height="28" viewBox="0 0 24 24" fill="#2a8bff" aria-hidden="true"><path d="M6 2h12v2h4v3a5 5 0 0 1-5 5 6 6 0 0 1-4 3v3h4v3H7v-3h4v-3a6 6 0 0 1-4-3 5 5 0 0 1-5-5V4h4z"/></svg>',
    lTarget: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2a8bff" stroke-width="2.4" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
    lCard: '<svg width="30" height="24" viewBox="0 0 30 24" fill="#2a8bff" aria-hidden="true"><path d="M2 2h26a2 2 0 0 1 2 2v3H0V4a2 2 0 0 1 2-2zM0 11h30v9a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm4 5v2h8v-2z"/></svg>',
    gTrophy: '<svg width="24" height="24" viewBox="0 0 24 24" fill="#f6b91f" aria-hidden="true"><path d="M6 2h12v2h4v3a5 5 0 0 1-5 5 6 6 0 0 1-4 3v3h4v3H7v-3h4v-3a6 6 0 0 1-4-3 5 5 0 0 1-5-5V4h4z"/></svg>',
    gTarget: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#27c4ff" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="13" r="9"/><circle cx="11" cy="13" r="4"/><path d="M11 13 21 3"/></svg>',
    gCheck: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3ddc84" stroke-width="2.4" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m7 12 3.5 3.5L17 9"/></svg>',
    gClock: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>'
  };
  function icon(name) { var t = document.createElement('template'); t.innerHTML = ICON[name]; return t.content.firstChild; }
  function img(src, cls) {
    var i = document.createElement('img'); i.alt = ''; i.loading = 'lazy'; i.decoding = 'async'; if (cls) i.className = cls;
    i.addEventListener('error', function () { if (i.parentNode) i.parentNode.removeChild(i); });
    i.src = src; return i;
  }
  function leagueLogo(s) { return img('https://a.espncdn.com/i/teamlogos/leagues/500/' + encodeURIComponent(s) + '.png'); }
  function safeLogo(u) { return /^https:\/\/a\.espncdn\.com\//.test(String(u || '')) ? String(u) : ''; }
  function cardHead(ic, title, sub) {
    var h = el('div', 'mh2-ch'); h.appendChild(icon(ic));
    var d = el('div'); d.appendChild(el('h2', null, title)); if (sub) d.appendChild(el('p', null, sub));
    h.appendChild(d); return h;
  }

  function gate() {
    root.textContent = '';
    var box = el('div', 'mh2-card mh2-gate');
    box.appendChild(el('h2', null, 'Log in to see your dashboard'));
    box.appendChild(el('p', null, 'Your simulations, how they did against the real results, and today’s games in your sports.'));
    box.appendChild(link('mh2-sim', '/login/?next=%2Fhome%2F', 'Log in'));
    root.appendChild(box);
  }

  if (!hasTokens()) return gate();

  var me = soft(getAuth('/auth/me'));
  var mine = soft(getAuth('/sim-archive/mine'));
  var prem = soft(getAuth('/premium/me'));
  var picks = soft(getAuth('/picks/activation-status'));

  me.then(function (m) {
    if (m === null) return null;
    var u = (m && m.user) || m || {};
    var t = document.getElementById('mhTitle');
    var name = u.display_name || u.displayName || u.username;
    if (t && name) { t.textContent = 'Welcome back, '; t.appendChild(el('em', null, name + '.')); }
    return u;
  });

  Promise.all([me, mine, prem, picks]).then(function (res) {
    var m = res[0], sims = res[1], p = res[2], pk = res[3];
    if (m === null && sims === null && p === null) {
      // All three authed calls failed: likely a dead session.
      return gate();
    }
    var user = (m && (m.user || m)) || {};
    var items = (sims && sims.items) || [];
    var summary = (sims && sims.summary) || { graded: 0, hits: 0, misses: 0, pending: 0 };
    var isPro = !!(p && p.subscription);
    var trialDays = (p && p.trial && Number(p.trial.days)) || 0;

    /* Sport order: what the member actually simulates, then favorites, then in season. */
    var month = pacificMonth();
    var score = {};
    Object.keys(SPORTS).forEach(function (s, i) { score[s] = (SPORTS[s].months.indexOf(month) !== -1 ? 100 : 0) - i; });
    (Array.isArray(user.favorite_sports) ? user.favorite_sports : []).forEach(function (f) {
      var k = String(f || '').toLowerCase(); if (score[k] !== undefined) score[k] += 300;
    });
    items.forEach(function (it) { if (score[it.sport] !== undefined) score[it.sport] += 1000 + 10; });
    var order = Object.keys(SPORTS).sort(function (a, b) { return score[b] - score[a]; });
    var favTeams = (Array.isArray(user.favorite_teams) ? user.favorite_teams : []).map(function (t) { return String(t || '').toLowerCase(); }).filter(Boolean);

    var inSeason = order.filter(function (s) { return SPORTS[s].months.indexOf(month) !== -1; }).slice(0, 3);
    /* NBA and NHL: the simulators' own schedule (today + tomorrow), which carries team
       abbreviations, so "Simulate" opens that exact matchup (?away=&home= preselects it and
       never auto-runs). Other sports: the general games list. */
    function ymd(off) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + off * 86400000)); }
    function simSchedule(s) {
      return Promise.all([0, 1].map(function (o) { return soft(getPublic('/' + s + '/public/schedule?date=' + ymd(o))); })).then(function (rs) {
        var games = [];
        rs.forEach(function (r) { ((r && r.games) || []).forEach(function (g) {
          if (g.state && g.state !== 'pre') return;
          games.push({ away_team: g.away.name, home_team: g.home.name, away_abbr: g.away.abbr, home_abbr: g.home.abbr,
            away_logo: safeLogo(g.away.logo), home_logo: safeLogo(g.home.logo),
            commence_time: g.startsAt, completed: false });
        }); });
        return { games: games };
      });
    }
    var gamesP = Promise.all(inSeason.map(function (s) {
      return (s === 'nba' || s === 'nhl') ? simSchedule(s) : soft(getPublic('/games?sport=' + SPORTS[s].key + '&limit=40'));
    }));
    var statusP = Promise.all(inSeason.map(function (s) { return soft(getAuth('/simulator-runs/status?sim=' + s)); }));

    Promise.all([gamesP, statusP]).then(function (gs) {
      render({ user: user, items: items, summary: summary, isPro: isPro, trialDays: trialDays, picks: pk,
        sports: inSeason, games: gs[0], status: gs[1], favTeams: favTeams });
    });
  });

  function render(d) {
    root.textContent = '';
    var grid = el('div', 'mh2-grid');
    var left = el('div', 'mh2-col'), right = el('div', 'mh2-col');
    grid.appendChild(left); grid.appendChild(right);
    root.appendChild(grid);
    var sm = d.summary, graded = Number(sm.graded) || 0, hits = Number(sm.hits) || 0, misses = Number(sm.misses) || 0, pending = Number(sm.pending) || 0;
    var rate = graded ? Math.round(100 * hits / graded) + '%' : '-';
    var openGlossary = function () {};

    /* 1. Games to simulate in the member's sports */
    var now = Date.now(), horizon = now + 36 * 3600 * 1000;
    var bySport = {};
    d.sports.forEach(function (s, i) {
      var g = (d.games[i] && d.games[i].games) || [];
      var seen = {};
      bySport[s] = g.filter(function (x) {
        var t = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(x.commence_time)) ? x.commence_time : x.commence_time + 'Z').getTime();
        var k = x.away_team + '@' + x.home_team;
        if (seen[k] || !(t > now - 15 * 60000 && t < horizon) || x.completed) return false;
        seen[k] = 1; return true;
      }).slice(0, 8);
    });
    var withGames = d.sports.filter(function (s) { return bySport[s].length; });
    var gcard = el('section', 'mh2-card');
    gcard.appendChild(cardHead('play', 'Games to Simulate', 'Run game simulations for the upcoming games in your sports.'));
    if (!withGames.length) {
      gcard.appendChild(el('p', 'mh2-empty', 'No games in your sports in the next day and a half. You can still simulate any matchup.'));
      var row0 = el('div', 'mh2-simlinks');
      d.sports.forEach(function (s) { row0.appendChild(link('mh2-link', '/' + s + '-simulator/?src=home', SPORTS[s].label + ' simulator', 'sim_' + s)); });
      gcard.appendChild(row0);
    } else {
      var tabs = el('div', 'mh2-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Sport');
      var list = el('div', 'mh2-games'); list.id = 'mhGames'; list.setAttribute('role', 'tabpanel');
      var team = function (name, logo) {
        var t = el('div', 'mh2-team'); if (logo) t.appendChild(img(logo)); t.appendChild(el('span', null, name)); return t;
      };
      var show = function (s) {
        Array.prototype.forEach.call(tabs.children, function (b) {
          var on = b.getAttribute('data-s') === s;
          b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
          if (on) list.setAttribute('aria-labelledby', b.id);
        });
        list.textContent = '';
        var st = d.status[d.sports.indexOf(s)];
        var CAP = 4, extra = [];
        bySport[s].forEach(function (x, gi) {
          var fav = d.favTeams.some(function (t) { return t && (String(x.home_team).toLowerCase().indexOf(t) !== -1 || String(x.away_team).toLowerCase().indexOf(t) !== -1); });
          var r = el('div', 'mh2-game' + (fav ? ' fav' : ''));
          r.appendChild(team(x.away_team, x.away_logo));
          r.appendChild(el('span', 'mh2-at', 'at'));
          r.appendChild(team(x.home_team, x.home_logo));
          var go = el('div', 'mh2-go');
          go.appendChild(el('span', null, whenPT(x.commence_time) + (fav ? ' · your team' : '')));
          var href = '/' + s + '-simulator/?src=home_game';
          if (x.away_abbr && x.home_abbr) href = '/' + s + '-simulator/?away=' + encodeURIComponent(x.away_abbr) + '&home=' + encodeURIComponent(x.home_abbr) + '&src=home_game';
          var a = link('mh2-sim', href, 'Simulate Game →', 'game_' + s);
          a.setAttribute('aria-label', 'Simulate ' + x.away_team + ' at ' + x.home_team);
          go.appendChild(a);
          r.appendChild(go);
          if (gi >= CAP) { r.hidden = true; extra.push(r); }
          list.appendChild(r);
        });
        if (extra.length) {
          var mb2 = el('button', 'mh2-ib mh2-allgames', 'Show all ' + bySport[s].length + ' ' + SPORTS[s].label + ' games ⌄'); mb2.type = 'button';
          mb2.addEventListener('click', function () {
            extra.forEach(function (r) { r.hidden = false; });
            var f = extra[0].querySelector('a'); if (mb2.parentNode) mb2.parentNode.removeChild(mb2); if (f) f.focus();
            track('member_home_click', { action: 'all_games', sport: s });
          });
          list.appendChild(mb2);
        }
        var note = list.appendChild(el('div', 'mh2-note'));
        if (d.isPro || (st && st.unlimited)) note.appendChild(el('span', 'mh2-chip pro', 'Pro: unlimited runs'));
        else if (st && st.freeAvailable) note.appendChild(el('span', 'mh2-chip free', 'Today’s free ' + SPORTS[s].label + ' run is available'));
        else if (st) note.appendChild(el('span', 'mh2-chip used', 'Free ' + SPORTS[s].label + ' run used today'));
      };
      withGames.forEach(function (s) {
        var b = el('button'); b.appendChild(leagueLogo(s)); b.appendChild(el('span', null, SPORTS[s].label));
        b.type = 'button'; b.id = 'mhTab-' + s; b.setAttribute('role', 'tab'); b.setAttribute('data-s', s); b.setAttribute('aria-controls', 'mhGames');
        b.setAttribute('aria-label', SPORTS[s].label + ', ' + bySport[s].length + ' game' + (bySport[s].length === 1 ? '' : 's'));
        b.addEventListener('click', function () { show(s); track('member_home_click', { action: 'tab', sport: s }); });
        b.addEventListener('keydown', function (e) {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          var i = withGames.indexOf(s) + (e.key === 'ArrowRight' ? 1 : -1);
          var n = withGames[(i + withGames.length) % withGames.length];
          show(n); var nb = document.getElementById('mhTab-' + n); if (nb) nb.focus(); e.preventDefault();
        });
        tabs.appendChild(b);
      });
      gcard.appendChild(tabs); gcard.appendChild(list);
      show(withGames[0]);
    }

    /* 2. Your performance: simulated favorites vs real results */
    var scard = el('section', 'mh2-card mh2-perf');
    var sh = cardHead('bars', 'Your Performance', 'How your simulated favorites did against the real results.');
    var ib = el('button', 'mh2-ib mh2-r'); ib.type = 'button'; ib.setAttribute('aria-label', 'What these numbers mean'); ib.appendChild(icon('info'));
    ib.addEventListener('click', function () { openGlossary(); });
    sh.appendChild(ib);
    scard.appendChild(sh);
    if (!d.items.length) {
      scard.appendChild(el('p', 'mh2-empty', 'Run a simulation and it shows up here. Once the real game is played, you see whether the simulated favorite won.'));
    } else {
      var stats = el('div', 'mh2-stats');
      [['trophy', graded ? hits + '–' + misses : '0–0', 'Sim record', 'g'],
       ['target', rate, 'Hit rate', ''],
       ['check', graded, 'Graded', ''],
       ['clock', pending, 'Pending', '']].forEach(function (x) {
        var c = el('div', 'mh2-stat' + (x[3] ? ' ' + x[3] : '')); c.appendChild(icon(x[0]));
        var t = el('div'); t.appendChild(el('b', null, x[1])); t.appendChild(el('span', null, x[2])); c.appendChild(t);
        stats.appendChild(c);
      });
      scard.appendChild(stats);
      var tbl = el('div', 'mh2-tbl'); tbl.setAttribute('role', 'table'); tbl.setAttribute('aria-label', 'Recent results');
      var hr = el('div', 'mh2-tr h'); hr.setAttribute('role', 'row');
      ['Recent results', 'Type', 'Result', 'Sim win %'].forEach(function (t) { var c = el('span', null, t); c.setAttribute('role', 'columnheader'); hr.appendChild(c); });
      tbl.appendChild(hr);
      d.items.slice(0, 5).forEach(function (it) {
        var r = el('div', 'mh2-tr d'); r.setAttribute('role', 'row');
        var gm = el('div', 'mh2-gm'); gm.setAttribute('role', 'cell');
        if (SPORTS[it.sport]) gm.appendChild(leagueLogo(it.sport));
        var info = el('div');
        info.appendChild(el('b', null, (it.away.abbr || it.away.name) + ' at ' + (it.home.abbr || it.home.name)));
        var fav = it.call ? (it.call === 'home' ? it.home : it.away) : null;
        var favPct = (fav && it.win_probability && it.win_probability[it.call] != null) ? pct(it.win_probability[it.call]) : '';
        var line = String(it.sport).toUpperCase() + ' · Sim favorite: ' + (fav ? (fav.abbr || fav.name) + (favPct ? ' (' + favPct + ')' : '') : 'none');
        if (it.game && it.game.final) line += ' · Final ' + it.game.final.away + '–' + it.game.final.home;
        info.appendChild(el('small', null, line));
        gm.appendChild(info); r.appendChild(gm);
        var ty = el('div', 'c mh2-ty'); ty.setAttribute('role', 'cell'); ty.appendChild(el('span', 'mh2-pill', 'Sim')); r.appendChild(ty);
        var cls = 'none', txt = 'Not graded';
        if (it.hit === true) { cls = 'hit'; txt = '✓ Hit'; } else if (it.hit === false) { cls = 'miss'; txt = '✕ Miss'; }
        else if (it.game && it.game.status === 'pending') { cls = 'pending'; txt = 'Pending'; }
        var rc = el('div', 'c'); rc.setAttribute('role', 'cell'); rc.appendChild(el('span', 'mh2-pill ' + cls, txt)); r.appendChild(rc);
        var det = el('div', 'mh2-det', favPct || '–'); det.setAttribute('role', 'cell'); r.appendChild(det);
        tbl.appendChild(r);
      });
      scard.appendChild(tbl);
      scard.appendChild(link('mh2-more', '/my-sims/?src=home', 'View Full Record →', 'my_sims'));
    }
    // Results first once there is something to look at; otherwise lead with games to simulate.
    if (d.items.length) { left.appendChild(scard); left.appendChild(gcard); }
    else { left.appendChild(gcard); left.appendChild(scard); }

    /* 3. Pro: contextual, never a popup. A Pro member never sees an upgrade button. */
    var pcard = el('section', 'mh2-card mh2-pro');
    pcard.appendChild(icon('spark'));
    var ul = el('ul');
    var li = function (node) { var x = el('li'); x.appendChild(node); ul.appendChild(x); };
    if (d.isPro) {
      var ph = cardHead('crown', 'Your TMR Pro', 'You are a Pro member. Everything is unlocked.');
      ph.appendChild(link('mh2-pbtn', '/premium/?src=home', 'Plan & Billing →', 'pro_account'));
      pcard.appendChild(ph);
      li(link(null, '/around-the-web/?src=home', 'Handicapper Watchdog', 'pro_watchdog'));
      li(link(null, '/' + d.sports[0] + '-simulator/?src=home_pro', 'Unlimited ' + SPORTS[d.sports[0]].label + ' runs', 'pro_sim'));
      li(el('span', null, 'BetLegend Pro included'));
      pcard.appendChild(ul);
    } else {
      var used = d.sports.filter(function (s, i) { var st = d.status[i]; return st && st.freeAvailable === false; });
      var fh = cardHead('crown', 'TMR Pro', 'Unlock the full power of Trust My Record.');
      var pb = link('mh2-pbtn', '/premium/?from=home&src=home' + (used.length ? '_used' : '') + '#pricing', d.trialDays > 0 ? 'Try TMR Pro free for ' + d.trialDays + ' days →' : 'See TMR Pro →', 'pro_cta');
      // METER_TRIAL_DIRECT_20261101: an eligible member goes straight to Stripe checkout via the
      // Pro page's existing monthly intent; Stripe shows $0 today and when $49.99 starts.
      if (d.trialDays > 0) pb.addEventListener('click', function () { try { localStorage.setItem('tmr_pro_intent', JSON.stringify({ plan: 'monthly', at: Date.now() })); } catch (e) {} });
      fh.appendChild(pb);
      pcard.appendChild(fh);
      if (used.length) pcard.appendChild(el('p', 'mh2-used', 'You have used today’s free ' + used.map(function (s) { return SPORTS[s].label; }).join(', ').replace(/, ([^,]*)$/, ' and $1') + ' run' + (used.length > 1 ? 's' : '') + '.'));
      li(el('span', null, 'Handicapper Watchdog board of graded handicappers outside TMR'));
      li(el('span', null, 'Unlimited runs on every simulator'));
      li(el('span', null, 'BetLegend Pro included'));
      pcard.appendChild(ul);
      if (d.trialDays > 0) pcard.appendChild(el('p', 'mh2-fine', d.trialDays + ' days free, then $49.99/month. One trial per person and card.'));
    }
    right.appendChild(pcard);

    /* 4. Shortcuts */
    var qcard = el('section', 'mh2-card');
    qcard.appendChild(cardHead('bolt', 'Quick Shortcuts'));
    var ql = el('div', 'mh2-links');
    var sc = function (ic, href, text, action) { var a = link('mh2-link', href, null, action); a.appendChild(icon(ic)); a.appendChild(el('span', null, text)); ql.appendChild(a); return a; };
    sc('lBars', '/my-sims/?src=home', 'My Sims vs. Real Results', 'my_sims');
    sc('lPad', '/sports-simulators/?src=home', 'All Simulators', 'all_sims');
    sc('lSave', '/sports-simulators/saved/?src=home', 'Saved Simulations', 'saved');
    sc('lTrophy', '/polls/?src=home', 'Today’s Prediction Quiz', 'quiz');
    var rec = sc('lTarget', '/profile/?src=home', 'My Pick Record', 'record');
    if (d.picks && typeof d.picks.pickCount === 'number') {
      rec.className += ' cnt';
      rec.appendChild(el('small', null, d.picks.pickCount.toLocaleString('en-US') + ' pick' + (d.picks.pickCount === 1 ? '' : 's')));
    }
    sc('lCard', '/premium/?src=home', 'My Plan & Billing', 'plan');
    qcard.appendChild(ql);
    right.appendChild(qcard);

    /* 5. What it all means: plain definitions built from the member's own numbers */
    var mcard = el('section', 'mh2-card'); mcard.id = 'mhMeans'; mcard.tabIndex = -1;
    var mh = cardHead('infoFill', 'What It All Means');
    var tg = el('button', 'mh2-ib mh2-hide mh2-r'); tg.type = 'button'; tg.setAttribute('aria-controls', 'mhMeanBody');
    mh.appendChild(tg); mcard.appendChild(mh);
    var mb = el('div', 'mh2-mean'); mb.id = 'mhMeanBody';
    [['gTrophy', 'Sim record' + (graded ? ' (' + hits + '–' + misses + ')' : ''),
      graded ? 'In ' + hits + ' of your ' + graded + ' graded game' + (graded === 1 ? '' : 's') + ', the simulator’s favorite won the real game.'
             : 'How often the simulator’s favorite won the real game, once your simulated games are played.'],
     ['gTarget', 'Hit rate' + (graded ? ' (' + rate + ')' : ''),
      'Hits divided by graded games only' + (graded ? ' (' + hits + ' of ' + graded + ')' : '') + '. Pending and not graded games are left out.'],
     ['gCheck', 'Graded (' + graded + ')', 'Simulated games that have a final score and a simulated favorite to check.'],
     ['gClock', 'Pending (' + pending + ')', 'Simulated games that have not finished yet.']].forEach(function (x) {
      var r = el('div'); r.appendChild(icon(x[0])); r.appendChild(el('b', null, x[1])); r.appendChild(el('span', null, x[2])); mb.appendChild(r);
    });
    mb.appendChild(el('p', null, 'A hit means the simulator picked the team that won. It is not betting profit, and it does not promise how future games will go.'));
    mcard.appendChild(mb);
    var setOpen = function (open, save) {
      mb.hidden = !open; tg.textContent = open ? 'Hide ⌃' : 'Show ⌄'; tg.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (save) { try { localStorage.setItem('tmr_home_means', open ? '1' : '0'); } catch (e) {} }
    };
    var startOpen = true; try { startOpen = localStorage.getItem('tmr_home_means') !== '0'; } catch (e) {}
    setOpen(startOpen, false);
    tg.addEventListener('click', function () { setOpen(mb.hidden, true); track('member_home_click', { action: 'means_toggle' }); });
    openGlossary = function () { setOpen(true, false); try { mcard.scrollIntoView({ block: 'center' }); mcard.focus({ preventScroll: true }); } catch (e) {} };
    right.appendChild(mcard);

    track('member_home_viewed', { sims: d.items.length, graded: d.summary.graded, pro: d.isPro ? 'yes' : 'no', top_sport: d.sports[0] || '' });
  }
})();
