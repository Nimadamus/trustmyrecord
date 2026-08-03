/**
 * MLB_SIM_HISTORY_20260803 - /mlb-simulator/simulations/
 *
 * Renders today's completed MLB Simulator runs (filterable, progressively
 * loaded) plus the right-hand panel of the day's scheduled MLB games with
 * their simulation consensus.
 *
 * Everything is read-only against /api/mlb-sim-history. Nothing here writes,
 * and nothing here is loaded by the existing simulator page.
 */
(function () {
  'use strict';

  var ENDPOINT = '/mlb-sim-history';
  var PAGE_SIZE = 20;

  var state = {
    date: null,
    offset: 0,
    hasMore: false,
    loading: false,
    total: 0,
    filters: { matchup: '', team: '', sort: 'newest', scope: 'all', authored: '' },
    games: []
  };

  function qs(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function api(path) {
    if (window.api && typeof window.api.request === 'function') {
      return window.api.request(ENDPOINT + path, { method: 'GET' });
    }
    var cfg = (typeof CONFIG !== 'undefined' && CONFIG) ? CONFIG : null;
    var base = (cfg && cfg.api && cfg.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api';
    return fetch(base + ENDPOINT + path, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); });
  }

  function isLoggedIn() {
    return !!(window.api && typeof window.api.isLoggedIn === 'function' && window.api.isLoggedIn());
  }

  /** Local clock time for a stored UTC instant. */
  function localTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function niceDate(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return '';
    // Noon UTC keeps the label on the intended calendar day in every timezone.
    return new Date(ymd + 'T12:00:00Z').toLocaleDateString(undefined, {
      timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  var CONFIG_LABEL = {
    'default': null,
    custom_lineup: 'Custom lineup',
    custom_pitcher: 'Custom pitcher',
    custom_weather: 'Custom weather',
    custom_other: 'Custom setup',
    historical: 'Historical teams'
  };

  /* ------------------------------------------------------------------ */
  /* Result rows                                                        */
  /* ------------------------------------------------------------------ */

  function rowHtml(r) {
    var winnerName = r.winner_abbr
      ? (r.winner_abbr === r.away_abbr ? r.away_abbr : r.home_abbr)
      : null;
    var cfg = CONFIG_LABEL[r.config_type];
    var detailHref = '/mlb-simulator/simulations/run/?id=' + encodeURIComponent(r.id);
    var matchupHref = '/mlb-simulator/simulations/' + encodeURIComponent(r.game_date) + '/' + encodeURIComponent(r.slug) + '/';
    var rerunHref = '/mlb-simulator/?simAway=' + encodeURIComponent(r.away_abbr) + '&simHome=' + encodeURIComponent(r.home_abbr);

    var meta = [];
    meta.push('<span>Total <b>' + esc(r.total_runs) + '</b></span>');
    meta.push('<span>Margin <b>' + esc(r.margin) + '</b></span>');
    if (r.total_innings) meta.push('<span>' + esc(r.total_innings) + ' innings' + (r.extra_innings ? ' (extras)' : '') + '</span>');
    if (r.away_pitcher || r.home_pitcher) {
      meta.push('<span>' + esc(r.away_pitcher || 'TBD') + ' vs ' + esc(r.home_pitcher || 'TBD') + '</span>');
    }
    meta.push('<span>' + esc(localTime(r.completed_at)) + '</span>');

    return '' +
      '<div class="sh-row">' +
        '<div class="sh-row-main">' +
          '<div class="sh-matchup">' +
            (r.away_logo ? '<img src="' + esc(r.away_logo) + '" alt="" loading="lazy" width="18" height="18">' : '') +
            '<span>' + esc(r.away_abbr) + '</span>' +
            '<span class="sh-at">@</span>' +
            (r.home_logo ? '<img src="' + esc(r.home_logo) + '" alt="" loading="lazy" width="18" height="18">' : '') +
            '<span>' + esc(r.home_abbr) + '</span>' +
            '<span class="sh-score">' + esc(r.away_score) + '&ndash;' + esc(r.home_score) + '</span>' +
            (winnerName ? '<span class="sh-winner">' + esc(winnerName) + ' wins</span>' : '<span class="sh-winner">Suspended</span>') +
            (r.game_number > 1 ? '<span class="sh-tag">Game ' + esc(r.game_number) + '</span>' : '') +
            (cfg ? '<span class="sh-tag is-custom">' + esc(cfg) + '</span>' : '') +
            (r.logged_in ? '<span class="sh-tag is-member">Member</span>' : '') +
          '</div>' +
          '<div class="sh-meta">' + meta.join('') + '</div>' +
        '</div>' +
        '<div class="sh-row-actions">' +
          '<a class="sh-btn is-quiet" href="' + esc(detailHref) + '">Full details</a>' +
          '<a class="sh-btn is-quiet" href="' + esc(matchupHref) + '">Matchup</a>' +
          '<a class="sh-btn" href="' + esc(rerunHref) + '">Run again</a>' +
        '</div>' +
      '</div>';
  }

  function renderRows(runs, append) {
    var list = qs('shRows');
    if (!list) return;
    if (!append) list.innerHTML = '';
    if (!runs.length && !append) {
      list.innerHTML =
        '<div class="sh-empty"><b>No simulations recorded yet' +
        (state.filters.matchup || state.filters.team ? ' for this filter' : ' today') + '.</b>' +
        'Completed simulations appear here within seconds of finishing.' +
        '<div><a class="sh-btn is-primary" href="/mlb-simulator/">Run the first one</a></div></div>';
      return;
    }
    var html = runs.map(rowHtml).join('');
    if (append) list.insertAdjacentHTML('beforeend', html);
    else list.innerHTML = html;
  }

  function query() {
    var p = new URLSearchParams();
    p.set('date', state.date);
    p.set('limit', String(PAGE_SIZE));
    p.set('offset', String(state.offset));
    if (state.filters.sort === 'oldest') p.set('sort', 'oldest');
    if (state.filters.scope && state.filters.scope !== 'all') p.set('scope', state.filters.scope);
    if (state.filters.matchup) p.set('matchup', state.filters.matchup);
    if (state.filters.team) p.set('team', state.filters.team);
    if (state.filters.authored) p.set('authored', state.filters.authored);
    return '/runs?' + p.toString();
  }

  function loadRuns(append) {
    if (state.loading) return;
    state.loading = true;
    var more = qs('shMoreBtn');
    if (more) { more.disabled = true; more.textContent = 'Loading…'; }
    if (!append) {
      var list = qs('shRows');
      if (list) list.innerHTML = '<div class="sh-loading">Loading simulations…</div>';
    }

    api(query()).then(function (data) {
      state.total = data.total || 0;
      state.hasMore = !!data.has_more;
      state.offset = data.next_offset != null ? data.next_offset : state.offset;
      renderRows(data.runs || [], append);
      var count = qs('shRowCount');
      if (count) count.textContent = state.total === 1 ? '1 simulation' : state.total.toLocaleString() + ' simulations';
      var wrap = qs('shMore');
      if (wrap) wrap.hidden = !state.hasMore;
    }).catch(function () {
      var list = qs('shRows');
      if (list && !append) {
        list.innerHTML = '<div class="sh-empty"><b>Simulations are unavailable right now.</b>Please refresh in a moment.</div>';
      }
    }).finally(function () {
      state.loading = false;
      if (more) { more.disabled = false; more.textContent = 'Load more'; }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Right-hand day panel                                               */
  /* ------------------------------------------------------------------ */

  function gameHtml(g) {
    var s = g.stats || {};
    var has = s.consensus_simulations > 0;
    var awayPct = has && s.away_win_pct != null ? s.away_win_pct : 0;
    var homePct = has && s.home_win_pct != null ? s.home_win_pct : 0;
    var off = (g.status === 'postponed' || g.status === 'cancelled' || g.status === 'suspended');

    return '' +
      '<a class="sh-game" href="' + esc(g.href) + '">' +
        '<div class="sh-game-top">' +
          '<span class="sh-game-teams">' +
            (g.away_logo ? '<img src="' + esc(g.away_logo) + '" alt="" loading="lazy" width="16" height="16">' : '') +
            esc(g.away_abbr) + '<span class="sh-at">@</span>' +
            (g.home_logo ? '<img src="' + esc(g.home_logo) + '" alt="" loading="lazy" width="16" height="16">' : '') +
            esc(g.home_abbr) +
            (g.game_label ? ' <span class="sh-game-status">' + esc(g.game_label) + '</span>' : '') +
          '</span>' +
          (off
            ? '<span class="sh-game-status is-off">' + esc(g.status_label || g.status) + '</span>'
            : (g.status === 'live'
              ? '<span class="sh-game-status is-live">Live</span>'
              : '<span class="sh-game-time">' + esc(g.start_time_tbd ? 'TBD' : g.start_time_pt) + '</span>')) +
        '</div>' +
        '<div class="sh-game-stats">' +
          (has
            ? '<span><b>' + esc(s.avg_away_score) + '&ndash;' + esc(s.avg_home_score) + '</b> avg</span>' +
              '<span>' + esc(s.total_simulations) + ' sim' + (s.total_simulations === 1 ? '' : 's') + '</span>' +
              '<span>' + esc(awayPct) + '% / ' + esc(homePct) + '%</span>'
            : '<span class="sh-none">No simulations yet</span>') +
        '</div>' +
        (has
          ? '<div class="sh-bar"><i class="sh-bar-away" style="width:' + Number(awayPct) + '%"></i>' +
            '<i class="sh-bar-home" style="width:' + Number(homePct) + '%"></i></div>'
          : '') +
      '</a>';
  }

  function renderDay(data) {
    var box = qs('shGames');
    if (!box) return;
    state.games = data.games || [];

    if (!state.games.length) {
      box.innerHTML = data.schedule_ok
        ? '<div class="sh-empty"><b>No MLB games scheduled.</b>Pick any two teams on the simulator and run a matchup.</div>'
        : '<div class="sh-empty"><b>The MLB schedule is unavailable right now.</b>Simulations still record normally.</div>';
    } else {
      box.innerHTML = state.games.map(gameHtml).join('');
    }

    var count = qs('shGameCount');
    if (count) count.textContent = state.games.length + (state.games.length === 1 ? ' game' : ' games');

    // Matchup filter is built from the real slate plus whatever has actually
    // been simulated, so it never offers a dead option.
    var sel = qs('shMatchup');
    if (sel && sel.options.length <= 1) {
      state.games.forEach(function (g) {
        var o = document.createElement('option');
        o.value = g.matchup_key;
        o.textContent = g.away_abbr + ' @ ' + g.home_abbr + (g.game_label ? ' ' + g.game_label : '');
        sel.appendChild(o);
      });
    }
    var teamSel = qs('shTeam');
    if (teamSel && teamSel.options.length <= 1) {
      var seen = {};
      state.games.forEach(function (g) { seen[g.away_abbr] = 1; seen[g.home_abbr] = 1; });
      Object.keys(seen).sort().forEach(function (abbr) {
        var o = document.createElement('option');
        o.value = abbr;
        o.textContent = abbr;
        teamSel.appendChild(o);
      });
    }

    var totals = qs('shTotalSims');
    if (totals) totals.textContent = (data.total_simulations || 0).toLocaleString();
    var gm = qs('shGamesMetric');
    if (gm) gm.textContent = String(state.games.length);
    var most = state.games.slice().sort(function (a, b) {
      return ((b.stats && b.stats.total_simulations) || 0) - ((a.stats && a.stats.total_simulations) || 0);
    })[0];
    var mm = qs('shMostSimmed');
    if (mm) {
      mm.textContent = most && most.stats && most.stats.total_simulations
        ? most.away_abbr + ' @ ' + most.home_abbr
        : '—';
    }
  }

  function loadDay() {
    var box = qs('shGames');
    if (box) box.innerHTML = '<div class="sh-loading">Loading today’s games…</div>';
    api('/day?date=' + encodeURIComponent(state.date) + '&scope=default')
      .then(renderDay)
      .catch(function () {
        if (box) box.innerHTML = '<div class="sh-empty"><b>Schedule unavailable.</b>Please refresh in a moment.</div>';
      });
  }

  /* ------------------------------------------------------------------ */

  function bindFilters() {
    ['shMatchup', 'shTeam', 'shSort', 'shScope', 'shAuthored'].forEach(function (id) {
      var el = qs(id);
      if (!el) return;
      el.addEventListener('change', function () {
        state.filters.matchup = (qs('shMatchup') || {}).value || '';
        state.filters.team = (qs('shTeam') || {}).value || '';
        state.filters.sort = (qs('shSort') || {}).value || 'newest';
        state.filters.scope = (qs('shScope') || {}).value || 'all';
        state.filters.authored = (qs('shAuthored') || {}).value || '';
        state.offset = 0;
        loadRuns(false);
      });
    });

    var more = qs('shMoreBtn');
    if (more) more.addEventListener('click', function () { loadRuns(true); });

    var dateInput = qs('shDate');
    if (dateInput) {
      dateInput.addEventListener('change', function () {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput.value)) return;
        state.date = dateInput.value;
        state.offset = 0;
        var label = qs('shDateLabel');
        if (label) label.textContent = niceDate(state.date);
        loadDay();
        loadRuns(false);
      });
    }
  }

  function init() {
    var params = new URLSearchParams(window.location.search);
    var qDate = params.get('date');
    state.date = /^\d{4}-\d{2}-\d{2}$/.test(String(qDate || '')) ? qDate : null;

    // The authored filter is only meaningful once signed in.
    var authored = qs('shAuthored');
    if (authored && !isLoggedIn()) {
      var mine = authored.querySelector('option[value="mine"]');
      if (mine) mine.remove();
    }

    bindFilters();

    // Resolve the server's own slate date first so "today" always means the
    // same PT day the board and the simulator use, whatever the visitor's clock.
    api('/_probe').then(function (p) {
      if (!state.date) state.date = (p && p.today) || new Date().toISOString().slice(0, 10);
    }).catch(function () {
      if (!state.date) state.date = new Date().toISOString().slice(0, 10);
    }).finally(function () {
      var label = qs('shDateLabel');
      if (label) label.textContent = niceDate(state.date);
      var dateInput = qs('shDate');
      if (dateInput) dateInput.value = state.date;
      loadDay();
      loadRuns(false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
