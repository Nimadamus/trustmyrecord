/* =============================================================================
   TREND SPOTTER — research workspace
   -----------------------------------------------------------------------------
   Presentation only. Every record, unit and ROI figure on this page is computed
   server-side by services/trendQueryEngine.js and arrives already settled; this
   file never grades a game, never re-derives a record and never fills a gap
   with an estimate. If the API cannot answer, the page says so.

   Capability-driven: the league tabs, market tabs, situation list and team
   pickers are all built from GET /trendspotter/capabilities, so an option can
   never appear on screen without data behind it.
   ============================================================================= */
(function () {
  'use strict';

  function apiBase() {
    if (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) {
      return String(window.CONFIG.api.baseUrl).replace(/\/+$/, '');
    }
    return 'https://trustmyrecord-api.onrender.com/api';
  }

  var MARKET_ORDER = ['moneyline', 'spread', 'total', 'team_total', 'first_half', 'first_five', 'props'];
  var MARKET_LABELS = {
    moneyline: 'Moneyline', spread: 'Spread', total: 'Total',
    team_total: 'Team Total', first_half: 'First Half', first_five: 'First Five', props: 'Props'
  };
  // On phones each evidence row becomes a stacked card, so 25 of them makes a
  // very long page. Show fewer by default there; "Show all N" still reveals
  // every game, and nothing is ever silently dropped.
  function isNarrow() { return window.matchMedia && window.matchMedia('(max-width: 760px)').matches; }
  function visibleTableRows() { return isNarrow() ? 10 : 25; }
  // A full MLB slate is ~15 games; showing them all pushes the workspace below
  // the fold, which is the exact problem this redesign exists to fix.
  function visibleMatchups() { return isNarrow() ? 4 : 6; }

  var EXAMPLES = [
    { label: 'Dodgers on the road as a favorite', note: 'Moneyline, since 2024',
      state: { sport: 'MLB', team: 'LAD', market: 'moneyline', venue: 'away', situation: 'favorite', seasonFrom: 2024 } },
    { label: 'Rockies home games going Over', note: 'Total, since 2023',
      state: { sport: 'MLB', team: 'COL', market: 'total', side: 'over', venue: 'home', seasonFrom: 2023 } },
    { label: 'Yankees on the run line at home', note: 'Run line, since 2024',
      state: { sport: 'MLB', team: 'NYY', market: 'spread', venue: 'home', seasonFrom: 2024 } },
    { label: 'Guardians as an underdog', note: 'Moneyline, full history since 2010',
      state: { sport: 'MLB', team: 'CLE', market: 'moneyline', situation: 'underdog', seasonFrom: 2010 } }
  ];

  var caps = null;
  var capsBySport = {};
  var state = {
    sport: 'MLB', team: '', opponent: '', market: 'moneyline', side: 'over',
    venue: 'any', situation: 'any', seasonFrom: '', lastN: '',
    lineMin: '', lineMax: '', totalMin: '', totalMax: '', priceMin: '', priceMax: '',
    minGames: 10
  };
  var matchups = [];
  var matchupStatus = 'idle';
  var running = false;
  var lastResult = null;
  var tableExpanded = false;
  var slateExpanded = false;
  var touched = false;   // no red validation copy before the user has tried anything
  var inflight = null;   // AbortController for the query in flight
  var lastRunKey = '';   // guards duplicate submissions of an identical query

  var el = {};
  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function sportCaps() { return capsBySport[state.sport] || null; }

  function teamName(id) {
    var c = sportCaps();
    if (!c) return id;
    var hit = c.teams.filter(function (t) { return t.id === id; })[0];
    return hit ? hit.name : id;
  }

  function logo(name, size) {
    if (window.TMRTeamLogo && window.TMRTeamLogo.url) {
      var url = window.TMRTeamLogo.url(name);
      if (url) return '<img src="' + esc(url) + '" alt="" width="' + size + '" height="' + size + '" loading="lazy">';
    }
    var initials = String(name || '').split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(-3).toUpperCase();
    return '<span class="ts-mu-fallback" aria-hidden="true">' + esc(initials) + '</span>';
  }

  function signed(n) { return Number(n) > 0 ? '+' + n : String(n); }

  function fmtUnits(n) {
    if (n === null || n === undefined) return null;
    return (n > 0 ? '+' : '') + Number(n).toFixed(2) + 'u';
  }

  // --- fetching ------------------------------------------------------------
  function fetchJson(url, opts) {
    var options = opts || {};
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, options.timeout || 20000) : null;
    if (options.register && controller) options.register(controller);
    return fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (body) {
        if (!res.ok) {
          var err = new Error((body && body.message) || ('HTTP ' + res.status));
          err.status = res.status;
          err.body = body;
          throw err;
        }
        return body;
      });
    }).then(function (body) {
      if (timer) clearTimeout(timer);
      return body;
    }, function (error) {
      if (timer) clearTimeout(timer);
      throw error;
    });
  }

  // --- league tabs ---------------------------------------------------------
  function renderLeagueTabs() {
    var available = caps ? caps.sports.map(function (s) { return s.id; }) : ['MLB'];
    var locked = caps ? caps.unavailable_sports : [];
    el.leagueTabs.innerHTML = available.map(function (id) {
      return '<button type="button" role="tab" data-league="' + esc(id) + '"' +
        ' aria-selected="' + (state.sport === id ? 'true' : 'false') + '"' +
        ' tabindex="' + (state.sport === id ? '0' : '-1') + '">' + esc(id) + '</button>';
    }).concat(locked.map(function (s) {
      return '<button type="button" role="tab" disabled aria-selected="false" tabindex="-1" title="' +
        esc(s.reason) + '">' + esc(s.id) + '</button>';
    })).join('');
  }

  // --- matchup slate -------------------------------------------------------
  function renderSlate() {
    if (matchupStatus === 'loading') {
      el.slateDate.textContent = 'Loading today’s schedule…';
      el.matchupList.innerHTML = '<div class="ts-skeleton"><div></div><div></div></div>';
      return;
    }
    if (matchupStatus === 'error') {
      el.slateDate.textContent = '';
      el.matchupList.innerHTML = '<div class="ts-state"><h3>Schedule unavailable</h3>' +
        '<p>We could not load today’s games. You can still search for any team above.</p>' +
        '<p style="margin-top:14px"><button class="ts-btn ts-btn-ghost ts-btn-sm" type="button" id="retrySlate">Try again</button></p></div>';
      return;
    }
    if (!matchups.length) {
      el.slateDate.textContent = '';
      el.matchupList.innerHTML = '<div class="ts-state"><h3>No games scheduled</h3>' +
        '<p>There is no ' + esc(state.sport) + ' game in the next 36 hours. Search for any team above to research its history.</p></div>';
      return;
    }

    el.slateDate.textContent = matchups.length + ' game' + (matchups.length === 1 ? '' : 's') +
      ' in the next 36 hours · updated from verified game data';

    var cap = visibleMatchups();
    var shown = slateExpanded ? matchups : matchups.slice(0, cap);
    el.matchupList.innerHTML = shown.map(function (m) {
      var selected = state.team && state.opponent &&
        (state.team === m.away_id || state.team === m.home_id) &&
        (state.opponent === m.away_id || state.opponent === m.home_id);
      var time = new Date(m.commence_time);
      var timeStr = isNaN(time.getTime()) ? '' : time.toLocaleString(undefined, {
        weekday: 'short', hour: 'numeric', minute: '2-digit'
      });
      var meta = [];
      if (timeStr) meta.push(esc(timeStr));
      if (m.doubleheader_game) meta.push('Game ' + esc(m.doubleheader_game));
      if (m.market && m.market.total !== null && m.market.total !== undefined) {
        meta.push('O/U <b>' + esc(m.market.total) + '</b>');
      }
      if (m.starters && (m.starters.away || m.starters.home)) {
        meta.push(esc((m.starters.away || 'TBD') + (m.starters.away_hand ? ' (' + m.starters.away_hand + ')' : '')) +
          ' vs ' + esc((m.starters.home || 'TBD') + (m.starters.home_hand ? ' (' + m.starters.home_hand + ')' : '')));
      }
      function row(name, price) {
        return '<span class="ts-mu-row">' + logo(name, 24) +
          '<span class="ts-mu-team">' + esc(name) + '</span>' +
          (price === null || price === undefined ? '' : '<span class="ts-mu-price">' + esc(signed(price)) + '</span>') +
          '</span>';
      }
      return '<button class="ts-matchup" type="button" role="radio" aria-checked="' + (selected ? 'true' : 'false') + '"' +
        ' data-away="' + esc(m.away_id) + '" data-home="' + esc(m.home_id) + '">' +
        row(m.away_team, m.market ? m.market.away_ml : null) +
        row(m.home_team, m.market ? m.market.home_ml : null) +
        '<span class="ts-mu-meta">' + meta.join(' · ') + '</span>' +
        '</button>';
    }).join('') + (matchups.length > cap
      ? '<button class="ts-btn ts-btn-ghost ts-btn-sm ts-slate-more" type="button" id="toggleSlate">' +
        (slateExpanded ? 'Show fewer games' : 'Show all ' + matchups.length + ' games') + '</button>'
      : '');
  }

  // --- market tabs ---------------------------------------------------------
  function renderMarketTabs() {
    var c = sportCaps();
    var supported = c ? c.markets : [];
    var lockedReasons = {};
    (caps ? caps.unavailable_markets : []).forEach(function (m) { lockedReasons[m.id] = m.reason; });

    el.marketTabs.innerHTML = MARKET_ORDER.map(function (id) {
      var open = supported.indexOf(id) !== -1;
      var reason = lockedReasons[id] || (MARKET_LABELS[id] + ' is not available for ' + state.sport + ' yet.');
      var label = (id === 'spread' && c) ? c.spread_label : MARKET_LABELS[id];
      if (open) {
        return '<button class="ts-tab" type="button" role="tab" data-market="' + esc(id) + '"' +
          ' aria-selected="' + (state.market === id ? 'true' : 'false') + '"' +
          ' tabindex="' + (state.market === id ? '0' : '-1') + '">' + esc(label) + '</button>';
      }
      return '<button class="ts-tab" type="button" role="tab" disabled aria-selected="false" tabindex="-1"' +
        ' title="' + esc(reason) + '" aria-label="' + esc(label + ', not available. ' + reason) + '">' +
        '<span class="ts-tab-lock" aria-hidden="true">○</span>' + esc(label) + '</button>';
    }).join('');
  }

  // --- filter fields -------------------------------------------------------
  function field(label, id, inner, opts) {
    var o = opts || {};
    return '<div class="ts-field' + (o.wide ? ' ts-field-wide' : '') + '">' +
      '<label for="' + id + '">' + esc(label) + '</label>' + inner +
      (o.hint ? '<span class="ts-hint">' + esc(o.hint) + '</span>' : '') +
      '</div>';
  }

  function select(id, options, value) {
    return '<select id="' + id + '" data-bind="' + id + '">' + options.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(value) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }

  function numberInput(id, value, placeholder, step) {
    return '<input type="number" id="' + id + '" data-bind="' + id + '" value="' + esc(value) + '"' +
      ' placeholder="' + esc(placeholder || '') + '" step="' + esc(step || 'any') + '" inputmode="decimal"' +
      ' aria-label="' + esc(placeholder || id) + '">';
  }

  function renderFields() {
    var c = sportCaps();
    if (!c) { el.filterFields.innerHTML = ''; return; }

    var teamOptions = [['', 'Choose a team']].concat(c.teams.map(function (t) { return [t.id, t.name]; }));
    var opponentOptions = [['', 'Choose an opponent']].concat(c.teams
      .filter(function (t) { return t.id !== state.team; })
      .map(function (t) { return [t.id, t.name]; }));

    var seasons = [['', 'All available history']];
    var thisYear = new Date().getFullYear();
    var earliest = state.sport === 'MLB' ? 2010 : (state.sport === 'NFL' ? 2022 : 2023);
    for (var y = thisYear; y >= earliest; y--) seasons.push([y, 'Since ' + y]);

    var parts = [];
    parts.push(field('Team', 'f_team', select('f_team', teamOptions, state.team)));

    if (state.market === 'total') {
      parts.push(field('Side', 'f_side', select('f_side', [['over', 'Over'], ['under', 'Under']], state.side)));
    }

    parts.push(field('Venue', 'f_venue', select('f_venue', [
      ['any', 'Home or away'], ['home', 'Home only'], ['away', 'Away only']
    ], state.venue), { hint: 'Neutral-site games are not flagged in our data and count under the listed home team.' }));

    var situations = c.situations.filter(function (s) {
      return !((s.id === 'vs_lhp' || s.id === 'vs_rhp') && state.sport !== 'MLB');
    });
    parts.push(field('Situation', 'f_situation', select('f_situation',
      situations.map(function (s) { return [s.id, s.label]; }), state.situation)));

    if (state.situation === 'head_to_head') {
      parts.push(field('Opponent', 'f_opponent', select('f_opponent', opponentOptions, state.opponent)));
    }

    parts.push(field('Date range', 'f_seasonFrom', select('f_seasonFrom', seasons, state.seasonFrom)));

    parts.push(field('Most recent', 'f_lastN', select('f_lastN', [
      ['', 'All qualifying games'], [5, 'Last 5'], [10, 'Last 10'], [25, 'Last 25'], [50, 'Last 50'], [100, 'Last 100']
    ], state.lastN)));

    if (state.market === 'spread') {
      parts.push('<div class="ts-field"><span class="ts-field-label" id="lbl_spread">' +
        esc(c.spread_label + ' range') + '</span><div class="ts-range" role="group" aria-labelledby="lbl_spread">' +
        numberInput('f_lineMin', state.lineMin, 'min', '0.5') + '<span>to</span>' +
        numberInput('f_lineMax', state.lineMax, 'max', '0.5') + '</div>' +
        '<span class="ts-hint">Negative means the team was laying points.</span></div>');
    }
    if (state.market === 'total') {
      parts.push('<div class="ts-field"><span class="ts-field-label" id="lbl_total">Posted total range</span>' +
        '<div class="ts-range" role="group" aria-labelledby="lbl_total">' +
        numberInput('f_totalMin', state.totalMin, 'min', '0.5') + '<span>to</span>' +
        numberInput('f_totalMax', state.totalMax, 'max', '0.5') + '</div>' +
        '<span class="ts-hint">Filters on the total each game actually closed at.</span></div>');
    }
    if (state.market === 'moneyline') {
      parts.push('<div class="ts-field"><span class="ts-field-label" id="lbl_price">Price range</span>' +
        '<div class="ts-range" role="group" aria-labelledby="lbl_price">' +
        numberInput('f_priceMin', state.priceMin, '-170', '5') + '<span>to</span>' +
        numberInput('f_priceMax', state.priceMax, '-110', '5') + '</div>' +
        '<span class="ts-hint">American odds on the selected team.</span></div>');
    }

    parts.push(field('Minimum games', 'f_minGames',
      '<input type="number" id="f_minGames" data-bind="f_minGames" min="1" step="1" value="' + esc(state.minGames) + '">'));

    el.filterFields.innerHTML = parts.join('');
  }

  // --- query summary -------------------------------------------------------
  function summaryText() {
    if (!state.team) return 'Pick a matchup or choose a team to get started.';
    var c = sportCaps();
    var name = teamName(state.team);
    var venue = state.venue === 'home' ? ' at home' : state.venue === 'away' ? ' on the road' : '';
    var sit = '';
    if (state.situation === 'favorite') sit = ' as a favorite';
    else if (state.situation === 'underdog') sit = ' as an underdog';
    else if (state.situation === 'after_win') sit = ' after a win';
    else if (state.situation === 'after_loss') sit = ' after a loss';
    else if (state.situation === 'vs_lhp') sit = ' against left-handed starters';
    else if (state.situation === 'vs_rhp') sit = ' against right-handed starters';
    else if (state.situation === 'head_to_head') sit = state.opponent ? ' against the ' + teamName(state.opponent) : ' head to head';

    var market;
    if (state.market === 'total') market = ' games going ' + (state.side === 'over' ? 'Over' : 'Under');
    else if (state.market === 'spread') market = ' against the ' + (c ? c.spread_label.toLowerCase() : 'spread');
    else market = ' on the moneyline';

    var range = '';
    if (state.market === 'moneyline' && (state.priceMin !== '' || state.priceMax !== '')) {
      range = ', priced ' + (state.priceMin !== '' ? signed(state.priceMin) : 'any') +
        ' to ' + (state.priceMax !== '' ? signed(state.priceMax) : 'any');
    } else if (state.market === 'spread' && (state.lineMin !== '' || state.lineMax !== '')) {
      range = ', on a ' + (state.lineMin !== '' ? state.lineMin : 'any') + ' to ' + (state.lineMax !== '' ? state.lineMax : 'any') + ' line';
    } else if (state.market === 'total' && (state.totalMin !== '' || state.totalMax !== '')) {
      range = ', with a total of ' + (state.totalMin !== '' ? state.totalMin : 'any') + ' to ' + (state.totalMax !== '' ? state.totalMax : 'any');
    }

    var window_ = state.lastN ? ', last ' + state.lastN + ' games' : (state.seasonFrom ? ', since ' + state.seasonFrom : '');
    return name + market + venue + sit + range + window_ + '.';
  }

  function renderSummary() {
    el.querySummary.textContent = summaryText();
    var c = sportCaps();
    var chips = [];
    if (state.team) chips.push(['League', state.sport]);
    chips.push(['Market', (state.market === 'spread' && c) ? c.spread_label : MARKET_LABELS[state.market]]);
    chips.push(['Min games', state.minGames]);
    el.queryChips.innerHTML = chips.map(function (chip) {
      return '<div><dt>' + esc(chip[0]) + '</dt><dd>' + esc(chip[1]) + '</dd></div>';
    }).join('');

    var problem = validate();
    el.validation.textContent = problem ? problem.message : '';
    // Stay neutral until the user has actually tried to run something; a red
    // "choose a team" on first paint reads as an error the visitor caused.
    el.validation.setAttribute('data-tone', problem && touched ? 'error' : 'info');
    var blocked = Boolean(problem) || running;
    el.runTrend.disabled = blocked;
    el.runTrendSide.disabled = blocked;
    el.runTrend.textContent = running ? 'Running…' : 'Run Trend';
    el.runTrendSide.textContent = running ? 'Running…' : 'Run Trend';
  }

  function validate() {
    if (!state.team) return { field: 'f_team', message: 'Choose a team, or pick a matchup above.' };
    if (state.situation === 'head_to_head' && !state.opponent) {
      return { field: 'f_opponent', message: 'Head-to-head needs an opponent.' };
    }
    var pairs = [['lineMin', 'lineMax', 'spread'], ['totalMin', 'totalMax', 'total'], ['priceMin', 'priceMax', 'price']];
    for (var i = 0; i < pairs.length; i++) {
      var lo = state[pairs[i][0]], hi = state[pairs[i][1]];
      if (lo !== '' && hi !== '' && Number(lo) > Number(hi)) {
        return { field: 'f_' + pairs[i][0], message: 'The ' + pairs[i][2] + ' range starts above where it ends.' };
      }
    }
    if (Number(state.minGames) < 1) return { field: 'f_minGames', message: 'Minimum games must be at least 1.' };
    return null;
  }

  // --- URL state -----------------------------------------------------------
  var URL_KEYS = ['sport', 'team', 'opponent', 'market', 'side', 'venue', 'situation',
    'seasonFrom', 'lastN', 'lineMin', 'lineMax', 'totalMin', 'totalMax', 'priceMin', 'priceMax', 'minGames'];

  function writeUrl(replace) {
    var params = new URLSearchParams();
    URL_KEYS.forEach(function (k) {
      var v = state[k];
      if (v === '' || v === null || v === undefined) return;
      if (k === 'venue' && v === 'any') return;
      if (k === 'situation' && v === 'any') return;
      if (k === 'side' && state.market !== 'total') return;
      if (k === 'opponent' && state.situation !== 'head_to_head') return;
      params.set(k, v);
    });
    var url = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
  }

  /** Read and VALIDATE every URL parameter before it touches state. */
  function readUrl() {
    var p = new URLSearchParams(window.location.search || '');
    var sport = String(p.get('sport') || '').toUpperCase();
    if (capsBySport[sport]) state.sport = sport;

    var c = sportCaps();
    if (!c) return;

    var team = String(p.get('team') || '').toUpperCase();
    if (c.teams.some(function (t) { return t.id === team; })) state.team = team;
    var opp = String(p.get('opponent') || '').toUpperCase();
    if (opp && opp !== team && c.teams.some(function (t) { return t.id === opp; })) state.opponent = opp;

    // Legacy deep links used ?matchup=Away Team@Home Team with full names.
    // Translate them to the franchise ids rather than dropping the link.
    if (!state.team) {
      var legacy = String(p.get('matchup') || '').split('@');
      if (legacy.length === 2) {
        var byName = function (n) {
          var needle = n.trim().toLowerCase();
          var hit = c.teams.filter(function (t) {
            return t.name.toLowerCase() === needle ||
              t.aliases.some(function (a) { return a.toLowerCase() === needle; });
          })[0];
          return hit ? hit.id : '';
        };
        var awayId = byName(legacy[0]);
        var homeId = byName(legacy[1]);
        if (homeId) { state.team = homeId; state.opponent = awayId || ''; }
      }
    }

    var market = String(p.get('market') || '').toLowerCase();
    if (c.markets.indexOf(market) !== -1) state.market = market;

    var side = String(p.get('side') || '').toLowerCase();
    if (side === 'over' || side === 'under') state.side = side;

    var venue = String(p.get('venue') || '').toLowerCase();
    if (['any', 'home', 'away'].indexOf(venue) !== -1) state.venue = venue;

    var sit = String(p.get('situation') || '').toLowerCase();
    if (c.situations.some(function (s) { return s.id === sit; })) state.situation = sit;

    var thisYear = new Date().getFullYear();
    var season = parseInt(p.get('seasonFrom'), 10);
    if (isFinite(season) && season >= 2000 && season <= thisYear) state.seasonFrom = season;

    var lastN = parseInt(p.get('lastN'), 10);
    if ([5, 10, 25, 50, 100].indexOf(lastN) !== -1) state.lastN = lastN;

    ['lineMin', 'lineMax', 'totalMin', 'totalMax', 'priceMin', 'priceMax'].forEach(function (k) {
      var raw = p.get(k);
      var n = Number(raw);
      if (raw !== null && raw !== '' && isFinite(n) && Math.abs(n) <= 100000) state[k] = n;
    });

    var min = parseInt(p.get('minGames'), 10);
    if (isFinite(min) && min >= 1 && min <= 1000) state.minGames = min;
  }

  // --- running a query -----------------------------------------------------
  function queryParams() {
    var p = new URLSearchParams();
    p.set('sport', state.sport);
    p.set('team', state.team);
    p.set('market', state.market);
    if (state.market === 'total') p.set('side', state.side);
    if (state.venue !== 'any') p.set('venue', state.venue);
    if (state.situation !== 'any') p.set('situation', state.situation);
    if (state.situation === 'head_to_head' && state.opponent) p.set('opponent', state.opponent);
    if (state.seasonFrom) p.set('seasonFrom', state.seasonFrom);
    if (state.lastN) p.set('lastN', state.lastN);
    ['lineMin', 'lineMax', 'totalMin', 'totalMax', 'priceMin', 'priceMax'].forEach(function (k) {
      if (state[k] !== '' && state[k] !== null && state[k] !== undefined) p.set(k, state[k]);
    });
    p.set('minGames', state.minGames);
    return p;
  }

  function runQuery() {
    touched = true;
    var problem = validate();
    if (problem) {
      renderSummary();
      var target = document.getElementById(problem.field);
      if (target) { target.setAttribute('aria-invalid', 'true'); target.focus(); }
      return;
    }
    var key = queryParams().toString();
    // Duplicate-submission guard: an identical query already running, or
    // already on screen, is not fetched again.
    if (running && key === lastRunKey) return;
    if (!running && key === lastRunKey && lastResult) return;

    if (inflight) { inflight.abort(); inflight = null; }
    lastRunKey = key;
    running = true;
    tableExpanded = false;
    writeUrl(false);
    renderSummary();
    el.results.setAttribute('aria-busy', 'true');
    el.resultsBody.innerHTML = '<div class="ts-state ts-skeleton" role="status" aria-label="Running trend">' +
      '<div></div><div></div><div></div><div></div></div>';

    fetchJson(apiBase() + '/trendspotter/query?' + key, {
      timeout: 25000,
      register: function (ctrl) { inflight = ctrl; }
    }).then(function (data) {
      running = false;
      inflight = null;
      lastResult = data;
      el.results.setAttribute('aria-busy', 'false');
      renderResult(data);
      renderSummary();
    }, function (error) {
      running = false;
      inflight = null;
      el.results.setAttribute('aria-busy', 'false');
      renderSummary();
      if (error && error.name === 'AbortError') return;
      if (error && error.status === 400 && error.body) { renderResult(error.body); return; }
      var slow = error && error.status === 504;
      renderState('error',
        slow ? 'That query took too long' : 'We could not run that trend',
        slow ? 'Narrow the date range and try again.'
             : 'The research service did not respond. Please try again in a moment.',
        '<button class="ts-btn ts-btn-ghost ts-btn-sm" type="button" id="retryQuery">Try again</button>');
    });
  }

  // --- results -------------------------------------------------------------
  function renderState(tone, title, body, extraHtml) {
    el.resultsBody.innerHTML = '<div class="ts-state" data-tone="' + esc(tone) + '">' +
      '<h3>' + esc(title) + '</h3><p>' + esc(body) + '</p>' +
      (extraHtml ? '<p style="margin-top:16px">' + extraHtml + '</p>' : '') + '</div>';
  }

  function renderEmptyState() {
    el.resultsBody.innerHTML = '<div class="ts-state">' +
      '<h3>Your result will appear here</h3>' +
      '<p>Pick a matchup and a market, set your conditions, then run the trend. ' +
      'Every result shows the exact games behind it.</p>' +
      '<div class="ts-examples">' + EXAMPLES.map(function (e, i) {
        return '<button class="ts-example" type="button" data-example="' + i + '">' +
          '<strong>' + esc(e.label) + '</strong><span>' + esc(e.note) + '</span>' +
          '<em>Run this example</em></button>';
      }).join('') + '</div></div>';
  }

  function metric(label, value, sub, tone) {
    if (value === null || value === undefined) return '';
    return '<div class="ts-metric"' + (tone ? ' data-tone="' + esc(tone) + '"' : '') + '>' +
      '<dt>' + esc(label) + '</dt><dd>' + esc(value) +
      (sub ? '<small>' + esc(sub) + '</small>' : '') + '</dd></div>';
  }

  /**
   * One chart, drawn inline as SVG so the page loads no charting library.
   * Cumulative units when the sample carries prices; otherwise a per-season
   * wins-out-of-games chart, because a units line would be a fiction.
   */
  function chartHtml(summary) {
    var series = summary.cumulative_units || [];
    var priced = summary.priced_games > 0;
    var w = 720, h = 190, padL = 46, padR = 12, padT = 14, padB = 26;

    if (priced && series.length > 1) {
      var vals = series.map(function (p) { return p.units; }).concat([0]);
      var min = Math.min.apply(null, vals);
      var max = Math.max.apply(null, vals);
      if (max === min) { max += 1; min -= 1; }
      var x = function (i) { return padL + (i / (series.length - 1)) * (w - padL - padR); };
      var y = function (v) { return padT + (1 - (v - min) / (max - min)) * (h - padT - padB); };
      var d = series.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.units).toFixed(1); }).join(' ');
      var zero = y(0).toFixed(1);
      var last = series[series.length - 1].units;
      return '<svg class="ts-chart" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img"' +
        ' aria-label="Cumulative units from ' + esc(series[0].date) + ' to ' + esc(series[series.length - 1].date) +
        ', finishing at ' + last.toFixed(2) + ' units">' +
        '<line x1="' + padL + '" x2="' + (w - padR) + '" y1="' + zero + '" y2="' + zero +
        '" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="4 4"/>' +
        '<text x="6" y="' + (padT + 9) + '" font-size="11" fill="var(--muted)">' + max.toFixed(1) + 'u</text>' +
        '<text x="6" y="' + (h - padB + 4) + '" font-size="11" fill="var(--muted)">' + min.toFixed(1) + 'u</text>' +
        '<path d="' + d + '" fill="none" stroke="' + (last >= 0 ? 'var(--green)' : 'var(--red)') +
        '" stroke-width="2.5" stroke-linejoin="round"/></svg>' +
        '<p class="ts-chart-note">Cumulative units, oldest game on the left. Only the ' +
        summary.priced_games + ' games with a recorded closing price move this line.</p>';
    }

    var seasons = summary.by_season || [];
    if (!seasons.length) return '';
    var bw = (w - padL - padR) / seasons.length;
    var maxG = Math.max.apply(null, seasons.map(function (s) { return s.wins + s.losses + s.pushes; }));
    var bars = seasons.map(function (s, i) {
      var total = s.wins + s.losses + s.pushes;
      var bh = (h - padT - padB) * (total / maxG);
      var winH = total ? bh * (s.wins / total) : 0;
      var bx = padL + i * bw + bw * 0.16;
      var bwid = bw * 0.68;
      return '<rect x="' + bx.toFixed(1) + '" y="' + (h - padB - bh).toFixed(1) + '" width="' + bwid.toFixed(1) +
        '" height="' + bh.toFixed(1) + '" fill="var(--panel-3)"/>' +
        '<rect x="' + bx.toFixed(1) + '" y="' + (h - padB - winH).toFixed(1) + '" width="' + bwid.toFixed(1) +
        '" height="' + winH.toFixed(1) + '" fill="var(--brand)"/>' +
        '<text x="' + (bx + bwid / 2).toFixed(1) + '" y="' + (h - padB + 15) +
        '" font-size="11" fill="var(--muted)" text-anchor="middle">' + esc(s.season) + '</text>';
    }).join('');
    return '<svg class="ts-chart" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img"' +
      ' aria-label="Wins out of qualifying games by season: ' +
      esc(seasons.map(function (s) { return s.season + ' ' + s.wins + '-' + s.losses; }).join(', ')) + '">' +
      bars + '</svg><p class="ts-chart-note">Wins (teal) out of qualifying games, by season. ' +
      'This market has no recorded closing price in our data, so there is no units line to draw.</p>';
  }

  function tableHtml(games, marketLabel, isTotal) {
    var cap = visibleTableRows();
    var rows = tableExpanded ? games : games.slice(0, cap);
    var body = rows.map(function (g) {
      var outcome = g.outcome === 'win' ? 'Win' : g.outcome === 'loss' ? 'Loss' : 'Push';
      var line = g.line === null || g.line === undefined ? '—'
        : (!isTotal && Number(g.line) > 0 ? '+' + g.line : String(g.line));
      return '<tr>' +
        '<td data-label="Date">' + esc(g.date) + (g.game_num > 1 ? ' (G' + esc(g.game_num) + ')' : '') + '</td>' +
        '<td data-label="Opponent">' + esc((g.is_home ? 'vs ' : '@ ') + g.opponent) + '</td>' +
        '<td data-label="Venue">' + esc(g.venue) + '</td>' +
        '<td data-label="Market">' + esc(marketLabel) + '</td>' +
        '<td data-label="Closing line" class="num">' + esc(line) + '</td>' +
        '<td data-label="Price" class="num">' + (g.price === null || g.price === undefined ? 'Not recorded' : esc(signed(g.price))) + '</td>' +
        '<td data-label="Final" class="num">' + esc(g.score) + '</td>' +
        '<td data-label="Result"><span class="ts-outcome" data-o="' + esc(g.outcome) + '">' + outcome + '</span></td>' +
        '<td data-label="Units" class="num">' + (g.units === null || g.units === undefined ? '—' : esc(fmtUnits(g.units))) + '</td>' +
        '<td data-label="Source">' + esc(g.settlement_status === 'final' ? 'Final · verified' : g.settlement_status) + '</td>' +
        '</tr>';
    }).join('');
    var more = games.length > cap
      ? '<div class="ts-table-more"><button class="ts-btn ts-btn-ghost ts-btn-sm" type="button" id="toggleTable">' +
        (tableExpanded ? 'Show first ' + cap + ' games' : 'Show all ' + games.length + ' games') + '</button></div>'
      : '';
    return '<div class="ts-table-wrap"><table class="ts-table">' +
      '<caption class="ts-sr">Every game included in this trend</caption>' +
      '<thead><tr><th scope="col">Date</th><th scope="col">Opponent</th><th scope="col">Venue</th>' +
      '<th scope="col">Market</th><th scope="col">Closing line</th><th scope="col">Price</th>' +
      '<th scope="col">Final</th><th scope="col">Result</th><th scope="col">Units</th><th scope="col">Source</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>' + more;
  }

  function detailsHtml(data) {
    var p = data.provenance || {};
    var ex = data.exclusions || { total: 0, reasons: [] };
    var grading = p.grading || {};
    return '<details class="ts-details"><summary>Data details</summary><div class="ts-details-body">' +
      '<dl>' +
      '<dt>Source</dt><dd>' + esc(p.provider || '—') + '</dd>' +
      '<dt>Dataset</dt><dd>' + esc(p.dataset || '—') + '</dd>' +
      (p.last_updated ? '<dt>Last updated</dt><dd>' + esc(p.last_updated) + '</dd>' : '') +
      '<dt>Games included</dt><dd>' + esc(data.summary.sample) + '</dd>' +
      '<dt>Games considered</dt><dd>' + esc(data.considered || data.summary.sample) + '</dd>' +
      '<dt>Games excluded</dt><dd>' + esc(ex.total) + '</dd>' +
      '<dt>Query time</dt><dd>' + esc(data.timing_ms || 0) + ' ms' + (data.cached ? ' (cached)' : '') + '</dd>' +
      '</dl>' +
      (ex.reasons.length ? '<p><strong>Why games were excluded</strong></p><ul>' + ex.reasons.map(function (r) {
        return '<li>' + esc(r.count) + ' — ' + esc(r.label) + '</li>';
      }).join('') + '</ul>' : '') +
      '<p style="margin-top:12px"><strong>How results are settled</strong></p><ul>' +
      Object.keys(grading).map(function (k) {
        return '<li>' + esc(k.replace(/_/g, ' ')) + ': ' + esc(grading[k]) + '</li>';
      }).join('') +
      '</ul></div></details>';
  }

  function renderResult(data) {
    if (!data) { renderState('error', 'No response', 'The research service returned nothing. Please try again.'); return; }

    if (data.status === 'invalid') {
      var first = (data.errors && data.errors[0]) || { message: 'That combination is not supported.' };
      renderState('error', 'That query is not supported', first.message);
      return;
    }
    if (data.status === 'no_data') {
      renderState('info', 'No history on file',
        data.message || 'We have no completed games on file for that team yet.');
      return;
    }
    if (data.status === 'no_games' || !data.summary || !data.summary.sample) {
      renderState('info', 'No matching games',
        (data.message || 'No completed games matched these conditions.') +
        (data.considered ? ' We checked ' + data.considered + ' games for this team.' : ''));
      return;
    }

    var s = data.summary;
    var q = data.query;
    var marketLabel = q.market_label || MARKET_LABELS[q.market];
    var small = data.status === 'below_min_sample';

    var flags = ['<span class="ts-flag ts-flag-source">Source-backed</span>',
      '<span class="ts-flag ts-flag-market">' + esc(marketLabel) + '</span>'];
    if (small) flags.push('<span class="ts-flag ts-flag-caution">Small sample</span>');

    var metrics =
      metric('Record', s.record, s.pushes ? s.pushes + ' push' + (s.pushes === 1 ? '' : 'es') : 'no pushes') +
      metric('Win rate', s.win_rate === null ? '—' : s.win_rate.toFixed(1) + '%', s.decided_games + ' decided') +
      (s.units === null
        ? metric('Units', '—', 'no closing price recorded')
        : metric('Units', (s.units > 0 ? '+' : '') + s.units.toFixed(2) + 'u', s.units_risked.toFixed(2) + 'u risked',
          s.units > 0 ? 'up' : s.units < 0 ? 'down' : null)) +
      (s.roi === null
        ? metric('ROI', '—', 'needs a recorded price')
        : metric('ROI', (s.roi > 0 ? '+' : '') + s.roi.toFixed(2) + '%', 'per unit risked',
          s.roi > 0 ? 'up' : s.roi < 0 ? 'down' : null)) +
      metric(q.market === 'moneyline' ? 'Avg closing price' : 'Avg closing line',
        q.market === 'moneyline'
          ? (s.avg_price === null ? '—' : signed(s.avg_price))
          : (s.avg_line === null ? '—' : String(s.avg_line)),
        (q.market === 'moneyline' && s.market_expected_win_rate !== null)
          ? 'market implied ' + s.market_expected_win_rate.toFixed(1) + '%' : null) +
      metric('Sample', String(s.sample), s.date_range ? s.date_range.from + ' → ' + s.date_range.to : null);

    el.resultsBody.innerHTML = '<article class="ts-result">' +
      '<div class="ts-result-top">' +
        '<div class="ts-result-flags">' + flags.join('') + '</div>' +
        '<p class="ts-statement">' + esc(data.statement) + '</p>' +
        (small ? '<p class="ts-chart-note">' + esc(data.message) + '</p>' : '') +
        '<div class="ts-result-actions">' +
          '<button class="ts-btn ts-btn-ghost ts-btn-sm" type="button" id="copyResult">Copy result</button>' +
          '<button class="ts-btn ts-btn-ghost ts-btn-sm" type="button" id="shareResult">Share</button>' +
          '<button class="ts-btn ts-btn-ghost ts-btn-sm" type="button" id="jumpGames">View games</button>' +
        '</div>' +
      '</div>' +
      '<dl class="ts-metrics">' + metrics + '</dl>' +
      '<div class="ts-section"><h3>Performance over time</h3>' + chartHtml(s) + '</div>' +
      '<div class="ts-section" id="gamesSection"><h3>Games in this trend</h3>' +
        tableHtml(data.games, marketLabel, q.market === 'total') + '</div>' +
      '<div class="ts-section"><h3>What this means</h3><ul class="ts-notes">' +
        (data.interpretation || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') +
      '</ul></div>' +
      '<div class="ts-section">' + detailsHtml(data) + '</div>' +
      '</article>';
  }

  // --- share ---------------------------------------------------------------
  function shareText() {
    if (!lastResult || !lastResult.summary) return window.location.href;
    var s = lastResult.summary;
    var lines = [lastResult.statement];
    lines.push('Record ' + s.record + (s.win_rate === null ? '' : ' (' + s.win_rate.toFixed(1) + '%)') +
      ' · Sample ' + s.sample + ' games' +
      (s.date_range ? ' · ' + s.date_range.from + ' to ' + s.date_range.to : ''));
    if (s.units === null) lines.push('Units and ROI unavailable: no closing price is recorded for these games.');
    else lines.push('Units ' + fmtUnits(s.units) + ' · ROI ' + (s.roi > 0 ? '+' : '') + s.roi.toFixed(2) + '%');
    lines.push('Trend Spotter · TrustMyRecord');
    lines.push(window.location.href);
    return lines.join('\n');
  }

  function copyToClipboard(text, button, okLabel) {
    function done() {
      var original = button.textContent;
      button.textContent = okLabel;
      setTimeout(function () { button.textContent = original; }, 1800);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy this result:', text); });
    } else {
      window.prompt('Copy this result:', text);
    }
  }

  // --- data loading --------------------------------------------------------
  function loadMatchups() {
    matchupStatus = 'loading';
    renderSlate();
    return fetchJson(apiBase() + '/trendspotter/matchups?sport=' + encodeURIComponent(state.sport), { timeout: 15000 })
      .then(function (data) {
        matchups = (data && data.matchups) || [];
        matchupStatus = (data && data.available) ? 'ok' : 'empty';
        renderSlate();
      }, function () {
        matchups = [];
        matchupStatus = 'error';
        renderSlate();
      });
  }

  function setStatus(stateName, text) {
    el.sourceStatus.setAttribute('data-state', stateName);
    el.sourceStatusText.textContent = text;
  }

  // --- events --------------------------------------------------------------
  function rerenderControls() {
    renderMarketTabs();
    renderFields();
    renderSummary();
    writeUrl(true);
  }

  function arrowNav(container, selector) {
    container.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var tabs = Array.prototype.slice.call(container.querySelectorAll(selector))
        .filter(function (t) { return !t.disabled; });
      var i = tabs.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      next.click();
    });
  }

  function bind() {
    el.leagueTabs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-league]');
      if (!b || b.disabled) return;
      var next = b.getAttribute('data-league');
      if (state.sport === next) return;
      state.sport = next;
      state.team = '';
      state.opponent = '';
      var c = sportCaps();
      if (c && c.markets.indexOf(state.market) === -1) state.market = c.markets[0];
      lastRunKey = '';
      lastResult = null;
      renderLeagueTabs();
      rerenderControls();
      renderEmptyState();
      loadMatchups();
    });
    arrowNav(el.leagueTabs, 'button[data-league]');
    arrowNav(el.marketTabs, 'button[data-market]');

    el.marketTabs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-market]');
      if (!b || b.disabled) return;
      state.market = b.getAttribute('data-market');
      rerenderControls();
    });

    el.matchupList.addEventListener('click', function (e) {
      if (e.target.closest('#retrySlate')) { loadMatchups(); return; }
      if (e.target.closest('#toggleSlate')) {
        slateExpanded = !slateExpanded;
        renderSlate();
        var slateBtn = document.getElementById('toggleSlate');
        if (slateBtn) slateBtn.focus();
        return;
      }
      var b = e.target.closest('.ts-matchup');
      if (!b) return;
      // The home side is selected by default; the Team field switches sides.
      state.team = b.getAttribute('data-home');
      state.opponent = b.getAttribute('data-away');
      el.teamSearch.value = '';
      hideSuggest();
      lastRunKey = '';
      renderSlate();
      rerenderControls();
    });

    el.filterFields.addEventListener('change', onFieldChange);
    el.filterFields.addEventListener('input', function (e) {
      if (e.target && e.target.type === 'number') onFieldChange(e);
    });

    el.runTrend.addEventListener('click', runQuery);
    el.runTrendSide.addEventListener('click', runQuery);

    el.resetFilters.addEventListener('click', function () {
      state.venue = 'any';
      state.situation = 'any';
      state.opponent = '';
      state.seasonFrom = '';
      state.lastN = '';
      state.lineMin = state.lineMax = state.totalMin = state.totalMax = state.priceMin = state.priceMax = '';
      state.minGames = 10;
      lastRunKey = '';
      rerenderControls();
    });

    el.resultsBody.addEventListener('click', function (e) {
      var ex = e.target.closest('[data-example]');
      if (ex) {
        var preset = EXAMPLES[Number(ex.getAttribute('data-example'))];
        state.venue = 'any';
        state.situation = 'any';
        state.opponent = '';
        state.lastN = '';
        state.lineMin = state.lineMax = state.totalMin = state.totalMax = state.priceMin = state.priceMax = '';
        Object.keys(preset.state).forEach(function (k) { state[k] = preset.state[k]; });
        lastRunKey = '';
        renderLeagueTabs();
        rerenderControls();
        renderSlate();
        runQuery();
        return;
      }
      if (e.target.closest('#toggleTable')) {
        tableExpanded = !tableExpanded;
        renderResult(lastResult);
        var toggle = document.getElementById('toggleTable');
        if (toggle) toggle.focus();
        return;
      }
      if (e.target.closest('#retryQuery')) { lastRunKey = ''; runQuery(); return; }
      var copyBtn = e.target.closest('#copyResult');
      if (copyBtn) { copyToClipboard(shareText(), copyBtn, 'Copied'); return; }
      var shareBtn = e.target.closest('#shareResult');
      if (shareBtn) {
        if (navigator.share) {
          navigator.share({ title: 'Trend Spotter | TrustMyRecord', text: shareText(), url: window.location.href })
            .catch(function () { copyToClipboard(shareText(), shareBtn, 'Link copied'); });
        } else {
          copyToClipboard(shareText(), shareBtn, 'Link copied');
        }
        return;
      }
      if (e.target.closest('#jumpGames')) {
        var section = document.getElementById('gamesSection');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    var suggestIndex = -1;
    el.teamSearch.addEventListener('input', function () {
      var term = el.teamSearch.value.trim().toLowerCase();
      var c = sportCaps();
      if (!term || !c) { hideSuggest(); return; }
      var hits = c.teams.filter(function (t) {
        return t.name.toLowerCase().indexOf(term) !== -1 ||
          t.aliases.some(function (a) { return a.toLowerCase().indexOf(term) !== -1; });
      }).slice(0, 8);
      if (!hits.length) { hideSuggest(); return; }
      suggestIndex = -1;
      el.teamSuggest.innerHTML = hits.map(function (t, i) {
        var alias = t.aliases.filter(function (a) { return a !== t.name; });
        return '<li role="option" id="ts-opt-' + i + '" aria-selected="false" data-team="' + esc(t.id) + '">' +
          esc(t.name) + (alias.length ? '<span>also ' + esc(alias.join(', ')) + '</span>' : '') + '</li>';
      }).join('');
      el.teamSuggest.hidden = false;
      el.teamSearch.setAttribute('aria-expanded', 'true');
    });

    el.teamSearch.addEventListener('keydown', function (e) {
      var items = el.teamSuggest.querySelectorAll('li');
      if (e.key === 'Escape') { hideSuggest(); return; }
      if (!items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (suggestIndex === -1) suggestIndex = e.key === 'ArrowDown' ? 0 : items.length - 1;
        else suggestIndex = (suggestIndex + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
        Array.prototype.forEach.call(items, function (li, i) {
          li.setAttribute('aria-selected', i === suggestIndex ? 'true' : 'false');
        });
        el.teamSearch.setAttribute('aria-activedescendant', 'ts-opt-' + suggestIndex);
      } else if (e.key === 'Enter' && suggestIndex >= 0) {
        e.preventDefault();
        items[suggestIndex].click();
      }
    });

    el.teamSuggest.addEventListener('click', function (e) {
      var li = e.target.closest('li[data-team]');
      if (!li) return;
      state.team = li.getAttribute('data-team');
      if (state.opponent === state.team) state.opponent = '';
      el.teamSearch.value = '';
      hideSuggest();
      lastRunKey = '';
      renderSlate();
      rerenderControls();
      el.teamSearch.focus();
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.ts-search')) hideSuggest();
    });

    el.howItWorks.addEventListener('click', function () {
      el.howModal.hidden = false;
      el.howModal.querySelector('[data-close-modal]').focus();
    });
    el.howModal.addEventListener('click', function (e) {
      if (e.target === el.howModal || e.target.closest('[data-close-modal]')) {
        el.howModal.hidden = true;
        el.howItWorks.focus();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.howModal.hidden) { el.howModal.hidden = true; el.howItWorks.focus(); }
    });

    window.addEventListener('popstate', function () {
      readUrl();
      renderLeagueTabs();
      rerenderControls();
      renderSlate();
    });
  }

  function hideSuggest() {
    el.teamSuggest.hidden = true;
    el.teamSuggest.innerHTML = '';
    el.teamSearch.setAttribute('aria-expanded', 'false');
    el.teamSearch.removeAttribute('aria-activedescendant');
  }

  function onFieldChange(e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var bind_ = t.getAttribute('data-bind');
    if (!bind_) return;
    t.removeAttribute('aria-invalid');
    var key = bind_.replace(/^f_/, '');
    var value = t.value;
    if (t.type === 'number') value = value === '' ? '' : Number(value);
    state[key] = value;
    if (key === 'team' && state.opponent === state.team) state.opponent = '';
    lastRunKey = '';
    if (key === 'situation' || key === 'team') { renderSlate(); rerenderControls(); return; }
    renderSummary();
    writeUrl(true);
  }

  // --- boot ----------------------------------------------------------------
  function boot() {
    el = {
      leagueTabs: $('leagueTabs'), slateDate: $('slateDate'), matchupList: $('matchupList'),
      teamSearch: $('teamSearch'), teamSuggest: $('teamSuggest'),
      marketTabs: $('marketTabs'), filterFields: $('filterFields'), validation: $('validationMessage'),
      runTrend: $('runTrend'), runTrendSide: $('runTrendSide'), resetFilters: $('resetFilters'),
      querySummary: $('querySummary'), queryChips: $('queryChips'),
      results: $('results'), resultsBody: $('resultsBody'),
      sourceStatus: $('sourceStatus'), sourceStatusText: $('sourceStatusText'),
      howItWorks: $('howItWorks'), howModal: $('howModal')
    };

    renderEmptyState();
    bind();

    fetchJson(apiBase() + '/trendspotter/capabilities', { timeout: 15000 }).then(function (data) {
      caps = data;
      capsBySport = {};
      caps.sports.forEach(function (s) { capsBySport[s.id] = s; });
      if (!capsBySport[state.sport]) state.sport = caps.sports[0].id;

      readUrl();
      renderLeagueTabs();
      rerenderControls();
      setStatus('ok', 'Verified game data connected');

      loadMatchups();

      // A fully-specified link runs itself, so a shared result reopens as a
      // result rather than as an empty form.
      if (state.team) runQuery();
    }, function () {
      setStatus('error', 'Research service unavailable');
      renderState('error', 'Research service unavailable',
        'We could not reach the Trend Spotter data service. Please refresh in a moment.');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
