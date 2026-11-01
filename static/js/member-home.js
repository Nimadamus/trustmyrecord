/* MEMBER_HOME_20261101 - /home/: the returning member dashboard.
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
  var BASE = (S && S.api ? String(S.api) : (window.TMR_API_BASE || 'https://trustmyrecord-api.onrender.com/api')).replace(/\/$/, '');
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

  function gate() {
    root.textContent = '';
    var box = el('div', 'mh-gate');
    box.appendChild(el('h2', null, 'Log in to see your dashboard'));
    box.appendChild(el('p', null, 'Your simulations, how they did against the real results, and today’s games in your sports.'));
    var a = link('mh-probtn', '/login/?next=%2Fhome%2F', 'Log in'); box.appendChild(a);
    root.appendChild(box);
    var cta = document.getElementById('mhCta'); if (cta) cta.href = '/register/?return=%2Fwelcome%2F';
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
    if (t && name) t.textContent = 'Welcome back, ' + name + '.';
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

    var top = order[0];
    var cta = document.getElementById('mhCta');
    if (cta) { cta.textContent = 'Run an ' + SPORTS[top].label + ' simulation'; cta.href = '/' + top + '-simulator/?src=home'; cta.addEventListener('click', function () { track('member_home_click', { action: 'hero_sim', sport: top }); }); }
    var sub = document.getElementById('mhSub');
    if (sub && summary.graded > 0) {
      sub.textContent = 'Your simulated favorites are ' + summary.hits + '-' + summary.misses + ' against the real results' +
        (summary.pending ? ', with ' + summary.pending + ' game' + (summary.pending === 1 ? '' : 's') + ' still to play.' : '.');
    } else if (sub && summary.pending > 0) {
      sub.textContent = summary.pending + ' of your simulated game' + (summary.pending === 1 ? ' is' : 's are') + ' still to play. Check back after the final.';
    }

    var inSeason = order.filter(function (s) { return SPORTS[s].months.indexOf(month) !== -1; }).slice(0, 3);
    var gamesP = Promise.all(inSeason.map(function (s) { return soft(getPublic('/games?sport=' + SPORTS[s].key + '&limit=40')); }));
    var statusP = Promise.all(inSeason.map(function (s) { return soft(getAuth('/simulator-runs/status?sim=' + s)); }));

    Promise.all([gamesP, statusP]).then(function (gs) {
      render({ user: user, items: items, summary: summary, isPro: isPro, trialDays: trialDays, picks: pk,
        sports: inSeason, games: gs[0], status: gs[1], favTeams: favTeams });
    });
  });

  function render(d) {
    root.textContent = '';
    var grid = el('div', 'mh-grid');
    var left = el('div', 'mh-col'), right = el('div', 'mh-col');
    grid.appendChild(left); grid.appendChild(right);
    root.appendChild(grid);

    /* 1. Today's games in the member's sports */
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
    var gcard = el('section', 'mh-card');
    var gh = el('div', 'mh-card-h'); gh.appendChild(el('h2', null, 'Games to simulate'));
    gcard.appendChild(gh);
    if (!withGames.length) {
      gcard.appendChild(el('p', 'mh-empty', 'No games in your sports in the next day and a half. You can still simulate any matchup.'));
      var row0 = el('div', 'mh-links'); row0.style.marginTop = '10px';
      d.sports.forEach(function (s) { row0.appendChild(link('mh-link', '/' + s + '-simulator/?src=home', SPORTS[s].label + ' simulator', 'sim_' + s)); });
      gcard.appendChild(row0);
    } else {
      var tabs = el('div', 'mh-tabs'); tabs.setAttribute('role', 'tablist');
      var list = el('div', 'mh-games');
      var show = function (s) {
        Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute('aria-selected', b.getAttribute('data-s') === s ? 'true' : 'false'); });
        list.textContent = '';
        var st = d.status[d.sports.indexOf(s)];
        bySport[s].forEach(function (x) {
          var fav = d.favTeams.some(function (t) { return t && (String(x.home_team).toLowerCase().indexOf(t) !== -1 || String(x.away_team).toLowerCase().indexOf(t) !== -1); });
          var r = el('div', 'mh-game' + (fav ? ' fav' : ''));
          var info = el('div');
          info.appendChild(el('b', null, x.away_team + ' at ' + x.home_team));
          info.appendChild(el('span', null, whenPT(x.commence_time) + (fav ? ' · your team' : '')));
          r.appendChild(info);
          r.appendChild(link('mh-sim', '/' + s + '-simulator/?src=home_game', 'Simulate', 'game_' + s));
          list.appendChild(r);
        });
        var note = list.appendChild(el('div'));
        note.style.cssText = 'font-size:12.5px;color:#5A6E86;margin-top:2px';
        if (d.isPro || (st && st.unlimited)) note.appendChild(el('span', 'mh-chip pro', 'Pro: unlimited runs'));
        else if (st && st.freeAvailable) note.appendChild(el('span', 'mh-chip free', 'Today’s free ' + SPORTS[s].label + ' run is available'));
        else if (st) note.appendChild(el('span', 'mh-chip used', 'Free ' + SPORTS[s].label + ' run used today'));
        note.firstChild && (note.firstChild.style.marginLeft = '0');
      };
      withGames.forEach(function (s) {
        var b = el('button', null, SPORTS[s].label + ' · ' + bySport[s].length);
        b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('data-s', s);
        b.addEventListener('click', function () { show(s); track('member_home_click', { action: 'tab', sport: s }); });
        tabs.appendChild(b);
      });
      gcard.appendChild(tabs); gcard.appendChild(list);
      show(withGames[0]);
    }

    /* 2. Your sims vs real results */
    var scard = el('section', 'mh-card');
    var sh = el('div', 'mh-card-h'); sh.appendChild(el('h2', null, 'Your sims vs real results'));
    if (d.items.length) sh.appendChild(link('mh-more', '/my-sims/?src=home', 'See all', 'my_sims'));
    scard.appendChild(sh);
    if (!d.items.length) {
      scard.appendChild(el('p', 'mh-empty', 'Run a simulation and it shows up here. Once the real game is played, you see whether the simulated favorite won.'));
    } else {
      var stats = el('div', 'mh-stats');
      [[d.summary.graded ? d.summary.hits + '-' + d.summary.misses : '0-0', 'Favorite record'],
       [d.summary.graded ? Math.round(100 * d.summary.hits / d.summary.graded) + '%' : '-', 'Favorite won'],
       [d.summary.pending, 'Pending']].forEach(function (x) {
        var c = el('div', 'mh-stat'); c.appendChild(el('b', null, x[0])); c.appendChild(el('span', null, x[1])); stats.appendChild(c);
      });
      scard.appendChild(stats);
      var sl = el('div', 'mh-sims');
      d.items.slice(0, 5).forEach(function (it) {
        var r = el('div', 'mh-simrow');
        var info = el('div');
        info.appendChild(el('b', null, (it.away.abbr || it.away.name) + ' at ' + (it.home.abbr || it.home.name)));
        var fav = it.call ? (it.call === 'home' ? it.home : it.away) : null;
        var line = String(it.sport).toUpperCase() + ' · sim favorite ' + (fav ? (fav.abbr || fav.name) + ' ' + pct(it.win_probability[it.call]) : 'none');
        if (it.game && it.game.final) line += ' · final ' + it.game.final.away + '-' + it.game.final.home;
        info.appendChild(el('span', null, line));
        r.appendChild(info);
        var cls = 'none', txt = 'Not graded';
        if (it.hit === true) { cls = 'hit'; txt = 'Hit'; } else if (it.hit === false) { cls = 'miss'; txt = 'Miss'; }
        else if (it.game && it.game.status === 'pending') { cls = 'pending'; txt = 'Pending'; }
        r.appendChild(el('span', 'mh-badge ' + cls, txt));
        sl.appendChild(r);
      });
      scard.appendChild(sl);
    }
    // Results first once there is something to look at; otherwise lead with games to simulate.
    if (d.items.length) { left.appendChild(scard); left.appendChild(gcard); }
    else { left.appendChild(gcard); left.appendChild(scard); }

    /* 3. Pro: contextual, never a popup */
    var pcard = el('section', 'mh-card mh-pro');
    var ph = el('div', 'mh-card-h');
    if (d.isPro) {
      ph.appendChild(el('h2', null, 'Your TMR Pro'));
      pcard.appendChild(ph);
      var pl = el('div', 'mh-links');
      pl.appendChild(link('mh-link', '/around-the-web/?src=home', 'Handicapper Watchdog', 'pro_watchdog'));
      pl.appendChild(link('mh-link', '/' + d.sports[0] + '-simulator/?src=home_pro', 'Unlimited ' + SPORTS[d.sports[0]].label + ' runs', 'pro_sim'));
      pl.appendChild(link('mh-link', '/premium/?src=home', 'Your plan and billing', 'pro_account'));
      pcard.appendChild(pl);
    } else {
      ph.appendChild(el('h2', null, 'TMR Pro'));
      pcard.appendChild(ph);
      var used = d.sports.filter(function (s, i) { var st = d.status[i]; return st && st.freeAvailable === false; });
      pcard.appendChild(el('p', null, used.length
        ? 'You have used today’s free ' + used.map(function (s) { return SPORTS[s].label; }).join(' and ') + ' run. Pro gives you unlimited runs on every simulator, plus the Handicapper Watchdog board and BetLegend Pro.'
        : 'Unlimited runs on every simulator, the Handicapper Watchdog board of graded handicappers outside TMR, and BetLegend Pro.'));
      pcard.appendChild(link('mh-probtn', '/premium/?from=home&src=home' + (used.length ? '_used' : '') + '#pricing', d.trialDays > 0 ? 'Try TMR Pro free for ' + d.trialDays + ' days' : 'See TMR Pro', 'pro_cta'));
      if (d.trialDays > 0) pcard.appendChild(el('p', 'mh-fine', d.trialDays + ' days free, then $49.99/month. One trial per person and card.'));
    }
    right.appendChild(pcard);

    /* 4. Shortcuts */
    var qcard = el('section', 'mh-card');
    var qh = el('div', 'mh-card-h'); qh.appendChild(el('h2', null, 'Shortcuts')); qcard.appendChild(qh);
    var ql = el('div', 'mh-links');
    var a1 = link('mh-link', '/my-sims/?src=home', 'My sims vs real results', 'my_sims'); ql.appendChild(a1);
    ql.appendChild(link('mh-link', '/sports-simulators/saved/?src=home', 'Saved simulations', 'saved'));
    var rec = link('mh-link', '/profile/?src=home', 'My pick record', 'record');
    if (d.picks && typeof d.picks.pickCount === 'number') rec.appendChild(el('small', null, d.picks.pickCount + ' pick' + (d.picks.pickCount === 1 ? '' : 's')));
    ql.appendChild(rec);
    ql.appendChild(link('mh-link', '/sports-simulators/?src=home', 'All simulators', 'all_sims'));
    ql.appendChild(link('mh-link', '/polls/?src=home', 'Today’s prediction quiz', 'quiz'));
    qcard.appendChild(ql);
    right.appendChild(qcard);

    track('member_home_viewed', { sims: d.items.length, graded: d.summary.graded, pro: d.isPro ? 'yes' : 'no', top_sport: d.sports[0] || '' });
  }
})();
