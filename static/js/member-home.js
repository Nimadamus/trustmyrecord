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
        markets: (sims && sims.markets) || null, units: (sims && sims.units) || null, audit: (sims && sims.audit) || null,
        sports: inSeason, games: gs[0], status: gs[1], favTeams: favTeams });
    });
  });

  /* SIM_RECORD_AUDIT_20261111: performance card. Reads /api/sim-archive/mine v2 (markets,
     units, per-item markets). Falls back to the old moneyline-only shape if the API is older. */
  var MKT = [['moneyline', 'Moneyline'], ['spread', 'Spread'], ['total', 'Totals']];
  var RES = {
    win: ['hit', '✓ Win'], loss: ['miss', '✕ Loss'], push: ['push', 'Push'], pending: ['pending', 'Pending'],
    line_unavailable: ['none', 'No line'], no_call: ['none', 'No call'], no_projection: ['none', 'No projection'],
    conflict: ['none', 'Under review']
  };
  function signed(v) { v = Number(v); return (v > 0 ? '+' : '') + (Math.round(v * 10) / 10); }
  function u2(v) { v = Number(v); return (v > 0 ? '+' : '') + v.toFixed(2); }
  function odds(v) { return v == null ? '' : (Number(v) > 0 ? '+' + v : String(v)); }
  function itemMarket(it, mk) {
    if (it.markets && it.markets[mk]) return it.markets[mk];
    if (mk !== 'moneyline') return null;
    var r = it.hit === true ? 'win' : (it.hit === false ? 'loss' : (it.game && it.game.status === 'pending' ? 'pending' : null));
    return r ? { result: r, pick: it.call, explanation: '' } : null;
  }
  function summaryFor(d, mk, sport) {
    var m = d.markets && d.markets[sport] && d.markets[sport][mk];
    if (m) return m;
    // Older API: count from the rows we have (moneyline only).
    var s = { wins: 0, losses: 0, pushes: 0, graded: 0, pending: 0, no_call: 0, line_unavailable: 0, no_projection: 0, hit_rate: null, partial: true };
    d.items.forEach(function (it) {
      if (sport !== 'all' && it.sport !== sport) return;
      var x = itemMarket(it, mk); if (!x) return;
      if (x.result === 'win') s.wins++; else if (x.result === 'loss') s.losses++; else if (x.result === 'pending') s.pending++;
    });
    s.graded = s.wins + s.losses; s.hit_rate = s.graded ? s.wins / s.graded : null;
    return s;
  }
  function pickText(it, mk, x) {
    var A = it.away.abbr || it.away.name, H = it.home.abbr || it.home.name;
    if (!x) return '–';
    if (mk === 'moneyline') {
      if (!x.pick) return 'No favorite';
      var wp = it.win_probability && it.win_probability[x.pick];
      return (x.pick === 'home' ? H : A) + (wp != null ? ' ' + pct(wp) : '');
    }
    if (mk === 'spread') {
      if (x.pick && x.line) return x.pick === 'home' ? H + ' ' + odds(x.line.home) : A + ' ' + odds(x.line.away);
      return x.projection != null ? 'Proj ' + H + ' ' + signed(x.projection) : '–';
    }
    if (x.pick && x.line) return (x.pick === 'over' ? 'Over ' : 'Under ') + x.line.points;
    return x.projection != null ? 'Proj ' + x.projection : '–';
  }

  function buildPerf(d, openGlossary) {
    var scard = el('section', 'mh2-card mh2-perf');
    var sh = cardHead('bars', 'Your Performance', 'Your simulations graded against the real results and the closing betting line.');
    var ib = el('button', 'mh2-ib mh2-r'); ib.type = 'button'; ib.setAttribute('aria-label', 'What these numbers mean'); ib.appendChild(icon('info'));
    ib.addEventListener('click', openGlossary);
    sh.appendChild(ib);
    scard.appendChild(sh);
    var gameItems = d.items.filter(function (it) { return it.game; });
    if (!d.items.length) {
      scard.appendChild(el('p', 'mh2-empty', 'Run a simulation and it shows up here. Once the real game is played, it is graded on the moneyline, the spread and the total.'));
      return scard;
    }
    var state = { mk: 'moneyline', sport: 'all' };
    try { var saved = JSON.parse(localStorage.getItem('tmr_home_perf') || '{}'); if (saved.mk && /^(moneyline|spread|total)$/.test(saved.mk)) state.mk = saved.mk; if (saved.sport && (saved.sport === 'all' || SPORTS[saved.sport])) state.sport = saved.sport; } catch (e) {}

    var seg = el('div', 'mh2-seg'); seg.setAttribute('role', 'tablist'); seg.setAttribute('aria-label', 'Betting market');
    var flt = el('div', 'mh2-flt'); flt.setAttribute('role', 'group'); flt.setAttribute('aria-label', 'Sport');
    var badge = el('p', 'mh2-honest');
    badge.appendChild(el('span', 'mh2-chip', 'Simulation accuracy'));
    badge.appendChild(document.createTextNode(' Not betting results. No wager was placed on these games.'));
    var body = el('div', 'mh2-perfbody'); body.id = 'mhPerfBody'; body.setAttribute('role', 'tabpanel');
    scard.appendChild(seg); scard.appendChild(flt); scard.appendChild(badge); scard.appendChild(body);

    var segBtns = {}, fltBtns = {};
    MKT.forEach(function (m, i) {
      var b = el('button', null, m[1]); b.type = 'button'; b.id = 'mhMk-' + m[0]; b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'mhPerfBody');
      b.addEventListener('click', function () { state.mk = m[0]; draw(); track('member_home_click', { action: 'perf_market', market: m[0] }); });
      b.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        var n = MKT[(i + (e.key === 'ArrowRight' ? 1 : MKT.length - 1)) % MKT.length][0];
        state.mk = n; draw(); segBtns[n].focus(); e.preventDefault();
      });
      segBtns[m[0]] = b; seg.appendChild(b);
    });
    ['all', 'nfl', 'nba', 'mlb', 'nhl'].forEach(function (s) {
      var b = el('button', null, s === 'all' ? 'All sports' : SPORTS[s].label); b.type = 'button';
      b.addEventListener('click', function () { state.sport = s; draw(); track('member_home_click', { action: 'perf_sport', sport: s }); });
      fltBtns[s] = b; flt.appendChild(b);
    });

    function draw() {
      try { localStorage.setItem('tmr_home_perf', JSON.stringify(state)); } catch (e) {}
      MKT.forEach(function (m) { var on = m[0] === state.mk; segBtns[m[0]].setAttribute('aria-selected', on ? 'true' : 'false'); segBtns[m[0]].tabIndex = on ? 0 : -1; });
      body.setAttribute('aria-labelledby', 'mhMk-' + state.mk);
      Object.keys(fltBtns).forEach(function (s) { fltBtns[s].setAttribute('aria-pressed', s === state.sport ? 'true' : 'false'); });
      body.textContent = '';
      var sm = summaryFor(d, state.mk, state.sport);
      var noApi = !d.markets && state.mk !== 'moneyline';
      var rec = sm.wins + '–' + sm.losses + (sm.pushes ? '–' + sm.pushes : '');
      var stats = el('div', 'mh2-stats');
      [['trophy', noApi ? '–' : rec, 'Record' + (sm.pushes ? ' (W–L–P)' : ''), 'g'],
       ['target', sm.graded ? Math.round(100 * sm.wins / sm.graded) + '%' : '–', 'Hit rate', ''],
       ['check', noApi ? '–' : sm.graded, 'Graded', ''],
       ['clock', noApi ? '–' : sm.pending, 'Pending', '']].forEach(function (x) {
        var c = el('div', 'mh2-stat' + (x[3] ? ' ' + x[3] : '')); c.appendChild(icon(x[0]));
        var t = el('div'); t.appendChild(el('b', null, x[1])); t.appendChild(el('span', null, x[2])); c.appendChild(t);
        stats.appendChild(c);
      });
      body.appendChild(stats);

      var meta = [];
      if (sm.pushes) meta.push(sm.pushes + ' push' + (sm.pushes === 1 ? '' : 'es') + ' (not in the hit rate)');
      if (sm.line_unavailable) meta.push(sm.line_unavailable + ' with no verified closing line (not graded, not losses)');
      if (sm.no_call) meta.push(sm.no_call + ' with no side (projection exactly on the line or 50/50)');
      if (sm.no_projection) meta.push(sm.no_projection + ' older run' + (sm.no_projection === 1 ? '' : 's') + ' without a stored projection');
      if (noApi) meta.push('Spread and total grading is being updated. Check back shortly.');
      if (meta.length) body.appendChild(el('p', 'mh2-meta', meta.join(' · ')));

      var u = d.units && d.units[state.mk] && d.units[state.mk][state.sport];
      var ul = el('p', 'mh2-units');
      ul.appendChild(el('b', null, 'Units (hypothetical): '));
      if (u && u.priced) {
        ul.appendChild(el('span', u.units > 0 ? 'up' : (u.units < 0 ? 'down' : ''), u2(u.units) + 'u'));
        ul.appendChild(document.createTextNode(' · ROI ' + signed(Math.round(u.roi * 1000) / 10) + '% on ' + u.priced + ' pick' + (u.priced === 1 ? '' : 's') +
          ' at the closing price, 1 unit each. Shows what the simulator’s picks would have returned; it is not money you won or lost.'));
      } else {
        ul.appendChild(document.createTextNode('Unavailable. Units are shown only where a real closing price was recorded; none exists yet for this selection.'));
      }
      body.appendChild(ul);

      var rows = gameItems.filter(function (it) {
        if (state.sport !== 'all' && it.sport !== state.sport) return false;
        return !!itemMarket(it, state.mk);
      });
      if (!rows.length) {
        body.appendChild(el('p', 'mh2-empty', state.sport === 'all' ? 'No simulated real games yet for this market.' : 'No simulated ' + SPORTS[state.sport].label + ' games yet.'));
      } else {
        var list = el('div', 'mh2-xl'); list.setAttribute('aria-label', 'Graded predictions, newest first');
        var hd = el('div', 'mh2-xh'); ['Game', 'Simulated pick', 'Result'].forEach(function (t) { hd.appendChild(el('span', null, t)); });
        list.appendChild(hd);
        var CAP = 6, extra = [];
        rows.forEach(function (it, i) {
          var row = xrow(it, state.mk);
          if (i >= CAP) { row.hidden = true; extra.push(row); }
          list.appendChild(row);
        });
        body.appendChild(list);
        if (extra.length) {
          var more = el('button', 'mh2-ib mh2-allgames', 'Show ' + extra.length + ' more ⌄'); more.type = 'button';
          more.addEventListener('click', function () {
            extra.forEach(function (r) { r.hidden = false; });
            var f = extra[0].querySelector('summary'); if (more.parentNode) more.parentNode.removeChild(more); if (f) f.focus();
            track('member_home_click', { action: 'perf_more', market: state.mk });
          });
          body.appendChild(more);
        }
      }
      var loose = (d.audit && d.audit.no_game_matchups) || d.items.filter(function (it) { return !it.game; }).length;
      if (loose) body.appendChild(el('p', 'mh2-meta', loose + ' simulated matchup' + (loose === 1 ? '' : 's') + ' had no real game with that home and away team within a few days, so ' + (loose === 1 ? 'it is' : 'they are') + ' never graded.'));
      if (d.audit && d.audit.earlier_runs_not_counted) body.appendChild(el('p', 'mh2-meta', d.audit.earlier_runs_not_counted + ' extra run' + (d.audit.earlier_runs_not_counted === 1 ? '' : 's') + ' of a game you had already simulated ' + (d.audit.earlier_runs_not_counted === 1 ? 'is' : 'are') + ' not counted again: each real game counts once, using your last run before the start.'));
    }

    function xrow(it, mk) {
      var x = itemMarket(it, mk);
      var A = it.away.abbr || it.away.name, H = it.home.abbr || it.home.name;
      var det = el('details', 'mh2-xr');
      var su = el('summary');
      var gm = el('div', 'mh2-gm');
      if (SPORTS[it.sport]) gm.appendChild(leagueLogo(it.sport));
      var info = el('div');
      info.appendChild(el('b', null, A + ' at ' + H));
      var line = String(it.sport).toUpperCase() + ' · ' + (it.game && it.game.start ? whenPT(it.game.start) : '');
      if (it.game && it.game.final) line = String(it.sport).toUpperCase() + ' · Final ' + A + ' ' + it.game.final.away + ', ' + H + ' ' + it.game.final.home;
      info.appendChild(el('small', null, line));
      gm.appendChild(info); su.appendChild(gm);
      su.appendChild(el('span', 'mh2-xp', pickText(it, mk, x)));
      var rk = RES[x.result] || ['none', 'Not graded'];
      var rc = el('span', 'mh2-xres'); rc.appendChild(el('span', 'mh2-pill ' + rk[0], rk[1])); su.appendChild(rc);
      det.appendChild(su);

      var dl = el('dl', 'mh2-xd');
      var add = function (k, v) { if (v === null || v === undefined || v === '') return; dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); };
      add('Simulation saved', it.recorded_at ? new Date(it.recorded_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) + ' PT, before the game started' : '');
      if (it.win_probability) add('Simulated win chance', A + ' ' + pct(it.win_probability.away) + ', ' + H + ' ' + pct(it.win_probability.home));
      if (it.projection) {
        if (mk === 'spread' && it.projection.margin_home != null) add('Projected margin', H + ' ' + signed(it.projection.margin_home) + ' (' + (it.projection.basis || 'simulation') + ')');
        if (mk === 'total' && it.projection.total != null) add('Projected total', String(it.projection.total) + ' (' + (it.projection.basis || 'simulation') + ')');
      }
      if (x.cover_probability) add('Simulated cover chance', H + ' ' + pct(x.cover_probability.home) + ', ' + A + ' ' + pct(x.cover_probability.away));
      if (mk === 'moneyline' && x.line) add('Closing moneyline', A + ' ' + odds(x.line.away) + ', ' + H + ' ' + odds(x.line.home));
      if (mk === 'spread' && x.line) add('Closing spread', H + ' ' + odds(x.line.home) + ', ' + A + ' ' + odds(x.line.away));
      if (mk === 'total' && x.line) add('Closing total', String(x.line.points));
      if (x.line && it.game && it.game.line_source) add('Line source', it.game.line_source);
      if (!x.line && mk !== 'moneyline' && (x.result === 'line_unavailable')) add('Closing line', 'Not available for this game');
      if (it.game) add('Actual result', it.game.final ? A + ' ' + it.game.final.away + ', ' + H + ' ' + it.game.final.home + ' (final)' : (it.game.status === 'pending' ? 'Not final yet, starts ' + whenPT(it.game.start) : 'Under review'));
      add('How it was graded', x.explanation || '');
      if (typeof x.units === 'number') add('Hypothetical 1 unit', u2(x.units) + 'u at ' + odds(x.price));
      if (it.earlier_runs && it.earlier_runs.length) add('Earlier runs of this game', it.earlier_runs.length + ' (not counted; the last run before the start is the one graded)');
      det.appendChild(dl);
      det.addEventListener('toggle', function () { if (det.open) track('member_home_click', { action: 'perf_expand', market: mk }); });
      return det;
    }

    draw();
    scard.appendChild(link('mh2-more', '/my-sims/?src=home', 'View Full Record →', 'my_sims'));
    return scard;
  }

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

    /* 2. Your performance: SIM_RECORD_AUDIT_20261111. Moneyline / Spread / Totals graded on
       their own against the real result and the ESPN closing line, filterable by sport. Every
       row opens to show the original prediction, the line, the final and how it was graded. */
    var scard = buildPerf(d, function () { openGlossary(); });
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
    [['gTrophy', 'Record' + (graded ? ' (moneyline ' + hits + '–' + misses + ')' : ''),
      'Wins and losses of the simulator’s pick on each real game you simulated. Each game counts once, using your last run saved before the start.'],
     ['gTarget', 'Moneyline, Spread, Totals',
      'Moneyline: did the simulated favorite win. Spread: projected margin against the closing point spread. Totals: projected combined score against the closing over/under. Each has its own record.'],
     ['gCheck', 'Hit rate' + (graded ? ' (moneyline ' + rate + ')' : ''),
      'Wins divided by wins plus losses. Pushes (a final exactly on the line, or a tie), pending games and games with no verified closing line are left out, and are never counted as losses.'],
     ['gClock', 'Pending (' + pending + ')', 'Simulated games that have not finished yet.']].forEach(function (x) {
      var r = el('div'); r.appendChild(icon(x[0])); r.appendChild(el('b', null, x[1])); r.appendChild(el('span', null, x[2])); mb.appendChild(r);
    });
    mb.appendChild(el('p', null, 'Lines are the ESPN closing line, recorded after the game ended. This measures how accurate the simulator was. It is not betting profit: units are hypothetical, at the closing price, and no wager was placed. Past accuracy does not promise how future games will go.'));
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
