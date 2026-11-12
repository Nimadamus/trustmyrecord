/* MY_SIMS_20261101 - /my-sims/: a member's simulations next to the real results.
 * Reads GET /api/sim-archive/mine (the caller's own rows). Writes nothing.
 * API text is inserted with textContent only. GA4: my_sims_viewed, my_sims_rerun_click.
 */
(function () {
  'use strict';
  var API = (window.TMR_API_BASE || window.API_BASE_URL || 'https://api.trustmyrecord.com').replace(/\/$/, '').replace(/\/api$/, '');
  var root = document.getElementById('msRoot');
  if (!root) return;

  function token() {
    try {
      return localStorage.getItem('trustmyrecord_token') || localStorage.getItem('tmr_token') || localStorage.getItem('accessToken') || '';
    } catch (e) { return ''; }
  }
  function track(name, p) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, p || {}); } catch (e) {}
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function link(cls, href, text) { var a = el('a', cls, text); a.href = href; return a; }
  function pct(v) { return Math.round(Number(v) * 100) + '%'; }
  function day(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function startPT(iso) {
    if (!iso) return '';
    var s = String(iso);
    if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z';   // games.commence_time is UTC without a zone
    var d = new Date(s);
    if (isNaN(d)) return '';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) + ' PT';
  }

  function gate() {
    root.textContent = '';
    var box = el('div', 'ms-gate');
    box.appendChild(el('h2', null, 'Log in to see your simulations'));
    box.appendChild(el('p', null, 'Your runs are saved to your account. Log in and every game you simulate shows up here with its real final score.'));
    box.appendChild(link('ms-btn', '/login/?next=%2Fmy-sims%2F', 'Log in'));
    box.appendChild(link('ms-btn ghost', '/register/?return=%2Fmy-sims%2F', 'Create a free account'));
    root.appendChild(box);
  }
  function empty() {
    root.textContent = '';
    var box = el('div', 'ms-empty');
    box.appendChild(el('h2', null, 'No simulations yet'));
    box.appendChild(el('p', null, 'Run a game on any simulator. It appears here, and once the real game is played you see whether the simulated favorite won.'));
    box.appendChild(link('ms-btn', '/welcome/?from=my_sims', 'Choose a simulator'));
    root.appendChild(box);
  }
  function failed() {
    root.textContent = '';
    var box = el('div', 'ms-empty');
    box.appendChild(el('h2', null, 'Your simulations did not load'));
    box.appendChild(el('p', null, 'Please try again in a moment.'));
    var b = link('ms-btn', '/my-sims/', 'Try again');
    box.appendChild(b);
    root.appendChild(box);
  }

  function row(it) {
    var r = el('div', 'ms-row');
    r.setAttribute('data-status', it.game ? it.game.status : 'none');
    var left = el('div');
    left.appendChild(el('div', 'ms-match', (it.away.name || it.away.abbr) + ' at ' + (it.home.name || it.home.abbr)));
    var meta = String(it.sport || '').toUpperCase() + ' · simulated ' + day(it.sim_day) + (it.runs_that_day > 1 ? ' · latest of ' + it.runs_that_day + ' runs' : '');
    left.appendChild(el('div', 'ms-meta', meta));
    if (it.win_probability) {
      var bar = el('div', 'ms-bar');
      var a = el('i', 'a'); a.style.width = (it.win_probability.away * 100) + '%';
      var h = el('i', 'h'); h.style.width = (it.win_probability.home * 100) + '%';
      bar.appendChild(a); bar.appendChild(h);
      left.appendChild(bar);
      var pr = el('div', 'ms-prob');
      pr.appendChild(el('span', null, (it.away.abbr || 'Away') + ' ' + pct(it.win_probability.away)));
      pr.appendChild(el('span', null, (it.home.abbr || 'Home') + ' ' + pct(it.win_probability.home)));
      left.appendChild(pr);
    }
    r.appendChild(left);

    var mid = el('div', 'ms-res');
    var fav = it.call ? (it.call === 'home' ? it.home : it.away) : null;
    var l1 = el('div');
    l1.appendChild(document.createTextNode('Simulated favorite: '));
    l1.appendChild(el('b', null, fav ? (fav.abbr || fav.name) + ' ' + pct(it.win_probability[it.call]) : 'none (even)'));
    mid.appendChild(l1);
    var l2 = el('div');
    if (it.game && it.game.status === 'final' && it.game.final) {
      l2.appendChild(document.createTextNode('Final: '));
      l2.appendChild(el('b', null, (it.away.abbr || 'Away') + ' ' + it.game.final.away + ', ' + (it.home.abbr || 'Home') + ' ' + it.game.final.home));
    } else if (it.game) {
      l2.textContent = 'Game time: ' + startPT(it.game.start);
    } else {
      l2.textContent = 'No scheduled game found for this matchup after your run.';
    }
    mid.appendChild(l2);
    // NBA/NHL simulators preselect ?away=&home= (never auto-run), so the link opens this matchup.
    var reHref = '/' + it.sport + '-simulator/?src=my_sims';
    if ((it.sport === 'nba' || it.sport === 'nhl') && it.away.abbr && it.home.abbr) reHref = '/' + it.sport + '-simulator/?away=' + encodeURIComponent(it.away.abbr) + '&home=' + encodeURIComponent(it.home.abbr) + '&src=my_sims';
    var re = link('ms-rerun', reHref, 'Simulate again');
    re.addEventListener('click', function () { track('my_sims_rerun_click', { sport: it.sport }); });
    var l3 = el('div'); l3.style.marginTop = '4px'; l3.appendChild(re); mid.appendChild(l3);
    r.appendChild(mid);

    var cls = 'none', txt = 'Not graded';
    if (it.hit === true) { cls = 'hit'; txt = 'Hit'; }
    else if (it.hit === false) { cls = 'miss'; txt = 'Miss'; }
    else if (it.game && it.game.status === 'pending') { cls = 'pending'; txt = 'Pending'; }
    r.appendChild(el('span', 'ms-badge ' + cls, txt));
    return r;
  }

  function render(data) {
    var items = (data && data.items) || [];
    var s = (data && data.summary) || { graded: 0, hits: 0, misses: 0, pending: 0 };
    track('my_sims_viewed', { items: items.length, graded: s.graded });
    if (!items.length) return empty();
    root.textContent = '';
    var stats = el('div', 'ms-stats');
    [[(data && data.items_total) || items.length, 'Matchups simulated'], [s.graded ? s.hits + '-' + s.misses : '0-0', 'Favorite record'],
     [s.graded ? Math.round(100 * s.hits / s.graded) + '%' : '-', 'Favorite won'], [s.pending, 'Games pending']].forEach(function (x) {
      var c = el('div', 'ms-stat'); c.appendChild(el('b', null, x[0])); c.appendChild(el('span', null, x[1])); stats.appendChild(c);
    });
    root.appendChild(stats);
    root.appendChild(el('p', 'ms-note', 'A simulation gives probabilities, not guarantees: a 60% favorite should still lose about 4 times in 10. ' +
      'Only games that started after your run are graded. Matchups with no real game, and even 50/50 runs, are never graded.'));

    var filters = el('div', 'ms-filters');
    var list = el('div', 'ms-list');
    var rows = items.map(row);
    rows.forEach(function (r) { list.appendChild(r); });
    [['all', 'All'], ['final', 'Final'], ['pending', 'Pending']].forEach(function (f, i) {
      var b = el('button', null, f[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(filters.children, function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        rows.forEach(function (r) { r.style.display = (f[0] === 'all' || r.getAttribute('data-status') === f[0]) ? '' : 'none'; });
      });
      filters.appendChild(b);
    });
    root.appendChild(filters);
    root.appendChild(list);
  }

  var S = window.TMRSession;
  var t = token();
  if (!t && !(S && S.hasTokens && S.hasTokens())) return gate();
  var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (e) {} }, 20000);
  /* TMRSession.authFetch refreshes an expired access token first, so a member
     whose 15 minute token lapsed is not told to log in again. */
  var req = (S && typeof S.authFetch === 'function')
    ? S.authFetch(API + '/api/sim-archive/mine', { signal: ctrl ? ctrl.signal : undefined })
    : fetch(API + '/api/sim-archive/mine', { headers: { Authorization: 'Bearer ' + t }, signal: ctrl ? ctrl.signal : undefined });
  req
    .then(function (r) {
      clearTimeout(timer);
      if (r.status === 401 || r.status === 403) { gate(); return null; }
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    })
    .then(function (d) { if (d) render(d); })
    .catch(function () { clearTimeout(timer); failed(); });
})();
