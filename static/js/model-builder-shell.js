/**
 * TrustMyRecord Model Builder shell (v3 - build, backtest, track, measure).
 *
 * The product is FORWARD TRACKING. A user defines conditions, optionally
 * backtests them, chooses how long the conditions should be monitored, and
 * from activation every future qualifying wager is logged and graded under
 * that model. The backtest is a decision aid that comes before that and its
 * numbers are never folded into the model's own record.
 *
 * Every displayed number comes fresh from the API over the verified graded-pick
 * ledger. We never render a cached/previous number: each run shows a skeleton
 * first, then replaces it only when the live response resolves. "Last updated"
 * timestamps come from the response, not the clock.
 */
(function () {
  var SPORT_LABELS = {
    baseball_mlb: 'MLB', basketball_nba: 'NBA', basketball_nba_summer: 'NBA Summer League',
    icehockey_nhl: 'NHL', americanfootball_nfl: 'NFL', basketball_ncaab: 'NCAAB',
    basketball_wnba: 'WNBA', soccer_fifa_world_cup: 'World Cup', soccer_epl: 'Premier League',
    soccer_intl_friendly: 'Intl Friendlies', tennis: 'Tennis',
    // Present in the graded ledger and previously unlabelled, so the picker
    // printed the raw database key at the user.
    soccer_argentina_liga_profesional: 'Argentine Primera',
    soccer_conmebol_sudamericana: 'Copa Sudamericana',
    soccer_netherlands_eredivisie: 'Eredivisie',
    soccer_nwsl: 'NWSL',
    // Present in the ledger and previously unlabelled, so the picker printed
    // the raw database key at the user.
    americanfootball_ncaaf: 'NCAAF', mma_ufc: 'UFC / MMA', soccer: 'Soccer (other)',
    soccer_portugal_primeira_liga: 'Primeira Liga', baseball_npb: 'NPB',
    baseball_kbo: 'KBO', soccer_uefa_champs_league: 'Champions League'
  };
  var MARKET_LABELS = {
    h2h: 'Moneyline', spreads: 'Spread', totals: 'Total', team_totals: 'Team total',
    f5_h2h: 'F5 moneyline', f5_totals: 'F5 total', f5_spreads: 'F5 spread',
    first_inning_totals: '1st inning total', batter_hits: 'Batter hits',
    batter_rbi: 'Batter RBI', batter_total_bases: 'Batter total bases',
    pitcher_strikeouts: 'Pitcher Ks', pitcher_outs: 'Pitcher outs',
    pitcher_walks: 'Pitcher walks', alt_spreads: 'Alt spread', alt_totals: 'Alt total',
    first_half_spreads: '1st half spread', first_half_totals: '1st half total',
    period_1_totals: '1st period total',
    nba_points: 'NBA points', nba_rebounds: 'NBA rebounds', nba_assists: 'NBA assists'
  };
  // Which shelf a market sits on in the picker. Anything unlisted falls through
  // to "Other markets" rather than disappearing.
  var MARKET_GROUPS = [
    { title: 'Core markets', keys: ['h2h', 'spreads', 'totals', 'team_totals'] },
    { title: 'Periods & alternates', keys: ['f5_h2h', 'f5_spreads', 'f5_totals', 'first_inning_totals', 'first_half_spreads', 'first_half_totals', 'period_1_totals', 'alt_spreads', 'alt_totals'] },
    { title: 'Player props', keys: ['batter_hits', 'batter_rbi', 'batter_total_bases', 'pitcher_strikeouts', 'pitcher_outs', 'pitcher_walks', 'nba_points', 'nba_rebounds', 'nba_assists'] }
  ];
  // Quick starts are only a shortcut for filling the form: each sets the same
  // fields a user would set by hand, then the normal run path takes over.
  var PRESETS = [
    { label: 'MLB moneyline favorites', sport: 'baseball_mlb', markets: ['h2h'], side: 'favorite' },
    { label: 'Home underdogs', sport: 'baseball_mlb', markets: ['h2h'], side: 'underdog', home_away: 'home' },
    { label: 'MLB unders', sport: 'baseball_mlb', markets: ['totals'], contains: 'Under' },
    { label: 'Run line picks', sport: 'baseball_mlb', markets: ['spreads'] },
    { label: 'Big favorites', sport: 'baseball_mlb', markets: ['h2h'], side: 'favorite', max_odds: -200 },
    { label: 'Pitcher strikeouts', sport: 'baseball_mlb', markets: ['pitcher_strikeouts'] }
  ];

  var state = {
    catalog: null, models: [], forwardOpenId: null, dataset: 'picks',
    lastDescribe: '', period: '30', nameTouched: false
  };
  var DAY_MS = 86400000;

  function api() { return window.api; }
  function el(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // A key with no entry above used to render verbatim, e.g.
  // "soccer_argentina_liga_profesional (3 graded)". Falling back to a
  // title-cased form keeps a newly added league readable the day it appears
  // rather than the day someone notices.
  function sportLabel(k) {
    if (SPORT_LABELS[k]) return SPORT_LABELS[k];
    return String(k || '')
      .replace(/^(soccer|basketball|americanfootball|icehockey|baseball)_/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  // Same fallback as sportLabel: an unlabelled market key printed verbatim,
  // which is how "first_five_totals" sat in the picker beside "F5 total".
  // That particular pair is now folded server-side, but the guard stays so the
  // next new market never shows a raw key either.
  function marketLabel(k) {
    if (MARKET_LABELS[k]) return MARKET_LABELS[k];
    return String(k || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  // Baseball calls the spread a run line; everywhere else it is just a spread.
  function marketLabelFor(k, sportKey) {
    var baseball = /^baseball/.test(String(sportKey || ''));
    if (baseball && k === 'spreads') return 'Run line';
    if (baseball && k === 'alt_spreads') return 'Alt run line';
    return marketLabel(k);
  }
  function num(v) { return (v === null || v === undefined || v === '') ? null : Number(v); }
  function fmtOdds(o) { if (o == null) return '-'; return o > 0 ? '+' + o : String(o); }
  function fmtUnits(u) { if (u == null) return '-'; return (u > 0 ? '+' : '') + Number(u).toFixed(2) + 'u'; }
  function fmtPct(p) { return p == null ? '-' : Number(p).toFixed(1) + '%'; }
  function signClass(v) { if (v == null) return ''; return v > 0 ? 'pos' : (v < 0 ? 'neg' : ''); }
  // Coverage chip: the number reads first, the label sits under it. Callers
  // escape their own value because some pass pre-built markup-free text.
  function covBadge(value, label, cls) {
    return '<span class="badge' + (cls ? ' ' + cls : '') + '"><b>' + value + '</b>' + esc(label) + '</span>';
  }

  function hasSession() {
    try {
      var keys = ['trustmyrecord_token', 'accessToken', 'access_token', 'token', 'tmr_token'];
      for (var i = 0; i < keys.length; i++) { if (localStorage.getItem(keys[i])) return true; }
    } catch (e) {}
    return Boolean(api() && api().token);
  }

  function setMessage(text, kind) {
    var m = el('builderMessage');
    if (!m) return;
    m.textContent = text || '';
    m.className = 'notice' + (kind ? ' ' + kind : '');
  }

  // ---------------- Catalog ----------------
  async function loadCatalog() {
    try {
      var cat = await api().modelCatalog();
      state.catalog = cat;
      renderBadges(cat);
      populateSports(cat);
    } catch (e) {
      el('sourceBadges').innerHTML = '<span class="badge">Data coverage unavailable right now</span>';
    }
  }

  function renderBadges(cat) {
    var researchable = (cat.sports || []).filter(function (s) { return s.researchable; });
    var totalGraded = (cat.sports || []).reduce(function (a, s) { return a + s.graded; }, 0);
    var fresh = cat.generated_at ? new Date(cat.generated_at).toLocaleString() : '-';
    var latest = researchable.map(function (s) { return s.last_date; }).filter(Boolean).sort().pop();
    el('sourceBadges').innerHTML = [
      covBadge(esc(cat.data_source || 'Verified graded picks'), 'Data source', 'badge-source'),
      covBadge(totalGraded.toLocaleString(), 'Verified graded picks'),
      covBadge(String(researchable.length), 'Researchable sports'),
      latest ? covBadge(esc(String(latest).slice(0, 10)), 'Data through') : '',
      covBadge(esc(fresh), 'Coverage loaded')
    ].join('');
  }

  // The dropdown identifies the SPORT. How many games happen to be on the
  // board today says nothing about a model that is meant to run for the next
  // sixty days, so it is not in here: a sport with zero games up right now is
  // still a sport you can build a model on. The only secondary fact worth
  // carrying is how much history exists to backtest against, and it is stated
  // quietly after the name.
  function sportOptions(sports, countWord) {
    var live = sports.filter(function (s) { return s.researchable || s.trackable; });
    var dead = sports.filter(function (s) { return !s.researchable && !s.trackable; });
    function opt(s, disabled) {
      var n = (s.graded != null ? s.graded : s.games) || 0;
      var label = sportLabel(s.sport_key);
      if (n > 0) label += '  ·  historical sample: ' + n.toLocaleString() + ' ' + countWord;
      else label += '  ·  no historical sample yet';
      return '<option value="' + esc(s.sport_key) + '"' + (disabled ? ' disabled' : '') + '>'
        + esc(label) + '</option>';
    }
    live.sort(function (a, b) { return sportLabel(a.sport_key).localeCompare(sportLabel(b.sport_key)); });
    return {
      first: live.length ? live[0].sport_key : null,
      html: live.map(function (s) { return opt(s, false); }).join('')
        + (dead.length ? '<optgroup label="No history and nothing scheduled yet">'
              + dead.map(function (s) { return opt(s, true); }).join('') + '</optgroup>' : '')
    };
  }

  function populateSports(cat) {
    var sel = el('modelSport');
    var built = sportOptions(cat.sports || [], 'graded wagers');
    sel.innerHTML = built.html;
    // Default to the sport with the most history so the optional backtest has
    // something to say the first time the page opens.
    var richest = (cat.sports || []).slice().sort(function (a, b) { return b.graded - a.graded; })[0];
    if (richest && sel.querySelector('option[value="' + richest.sport_key + '"]:not([disabled])')) {
      sel.value = richest.sport_key;
    } else if (built.first) { sel.value = built.first; }
    renderMarketChips();
    sel.addEventListener('change', function () { renderMarketChips(); refreshSuggestedName(); });
  }

  function currentSport() {
    if (!state.catalog) return null;
    var key = el('modelSport').value;
    return (state.catalog.sports || []).find(function (s) { return s.sport_key === key; }) || null;
  }

  // The picker used to be one flat pile of tiny pills, most of them greyed
  // out with no explanation. Same checkboxes and same values, now shelved by
  // family with the thin ones kept visible and labelled.
  function marketCard(m) {
    var thin = m.graded < 30;
    var sk = el('modelSport') ? el('modelSport').value : '';
    return '<label class="mkt' + (thin ? ' disabled' : '') + '" title="' + m.graded + ' graded picks">'
      + '<input type="checkbox" value="' + esc(m.market_type) + '"' + (thin ? ' disabled' : '') + '>'
      + '<span class="mkt-text"><span class="mkt-name">' + esc(marketLabelFor(m.market_type, sk)) + '</span>'
      + '<span class="mkt-n">' + (thin ? m.graded + ' graded, too thin' : m.graded.toLocaleString() + ' graded')
      + '</span></span></label>';
  }

  function marketGroupHtml(g) {
    return '<div class="mkt-group"><p class="mkt-group-title"><span>' + esc(g.title) + '</span></p><div class="mkt-row">'
      + g.items.map(marketCard).join('') + '</div></div>';
  }

  function renderMarketChips() {
    var host = el('marketChips');
    var sport = currentSport();
    if (!sport) { host.innerHTML = '<span class="placeholder">Select a sport first</span>'; return; }
    // No graded history is not the same as nothing to bet. A trackable sport
    // offers the markets a model can take off the board and settle, with no
    // counts because there is no history to count.
    if (!sport.researchable && sport.trackable) {
      var autoMarkets = sport.auto_markets || ['h2h', 'spreads', 'totals', 'team_totals'];
      host.innerHTML = '<div class="mkt-group"><p class="mkt-group-title"><span>Markets it can take and settle</span></p>'
        + '<div class="mkt-row">' + autoMarkets.map(function (k) {
            return '<label class="mkt"><input type="checkbox" value="' + esc(k) + '">'
              + '<span class="mkt-text"><span class="mkt-name">' + esc(marketLabelFor(k, sport.sport_key)) + '</span>'
              + '<span class="mkt-n">live board</span></span></label>';
          }).join('') + '</div></div>'
        + '<p class="mkt-hint">This sport has no graded pick history yet, so there is nothing to backtest. Save the model and it still runs forward on the live board.</p>';
      syncMarketState();
      return;
    }
    if (!sport.markets || !sport.markets.length) {
      host.innerHTML = '<span class="placeholder">No graded markets for this sport</span>';
      return;
    }
    var byKey = {};
    sport.markets.forEach(function (m) { byKey[m.market_type] = m; });
    var used = {};
    var primary = [];
    var secondary = [];
    MARKET_GROUPS.forEach(function (g, gi) {
      var items = g.keys.filter(function (k) { return byKey[k]; }).map(function (k) { used[k] = 1; return byKey[k]; });
      if (!items.length) return;
      (gi === 0 ? primary : secondary).push({ title: g.title, items: items });
    });
    var rest = sport.markets.filter(function (m) { return !used[m.market_type]; });
    if (rest.length) secondary.push({ title: 'Other markets', items: rest });
    // A sport with no core market still needs something on the top shelf.
    if (!primary.length && secondary.length) primary.push(secondary.shift());

    var extra = secondary.reduce(function (a, g) { return a + g.items.length; }, 0);
    var thinAny = sport.markets.some(function (m) { return m.graded < 30; });
    host.innerHTML = primary.map(marketGroupHtml).join('')
      + (extra ? '<details class="mkt-more"><summary>More markets (' + extra + ')</summary>'
          + secondary.map(marketGroupHtml).join('') + '</details>' : '')
      + (thinAny ? '<p class="mkt-hint">Markets under 30 graded picks are shown but not selectable. The sample is too small to say anything honest about them.</p>' : '');
    syncMarketState();
  }

  // Selected state is a class on the card, not a bare checkbox tick.
  function syncMarketState() {
    Array.prototype.forEach.call(document.querySelectorAll('#marketChips label.mkt'), function (l) {
      var cb = l.querySelector('input');
      l.classList.toggle('on', Boolean(cb && cb.checked));
    });
  }

  function selectedMarkets() {
    return Array.prototype.slice.call(document.querySelectorAll('#marketChips input:checked'))
      .map(function (c) { return c.value; });
  }

  // ---------------- Quick starts ----------------
  // A preset only fills the same form fields a user would fill by hand, then
  // hands off to the normal run path. Presets whose sport or market lacks
  // enough graded data are never offered.
  function renderPresets() {
    var host = el('presetRow');
    if (!host) return;
    var sports = (state.catalog && state.catalog.sports) || [];
    state.presets = PRESETS.filter(function (p) {
      var s = sports.find(function (x) { return x.sport_key === p.sport; });
      if (!s || !s.researchable) return false;
      return (p.markets || []).every(function (k) {
        var m = (s.markets || []).find(function (x) { return x.market_type === k; });
        return m && m.graded >= 30;
      });
    });
    if (!state.presets.length) {
      host.innerHTML = '<span class="mkt-hint">Quick starts appear once a sport has enough graded data.</span>';
      return;
    }
    host.innerHTML = state.presets.map(function (p, i) {
      return '<button type="button" class="preset" data-preset="' + i + '">' + esc(p.label) + '</button>';
    }).join('');
  }

  function applyPreset(p) {
    if (!p) return;
    if (state.dataset !== 'picks') switchDataset('picks');
    el('modelBuilderForm').reset();
    applyPeriod('30');
    el('modelSport').value = p.sport;
    renderMarketChips();
    (p.markets || []).forEach(function (k) {
      var cb = document.querySelector('#marketChips input[value="' + k + '"]');
      if (cb && !cb.disabled) cb.checked = true;
    });
    syncMarketState();
    el('modelSide').value = p.side || 'any';
    el('modelHomeAway').value = p.home_away || 'any';
    el('minOdds').value = p.min_odds != null ? p.min_odds : '';
    el('maxOdds').value = p.max_odds != null ? p.max_odds : '';
    el('selectionContains').value = p.contains || '';
    if (p.contains) {
      var d = el('selectionContains').parentNode;
      while (d && d.tagName !== 'DETAILS') d = d.parentNode;
      if (d) d.open = true;
    }
    state.nameTouched = false;
    applyPeriod(state.period);
    refreshSuggestedName();
    setMessage('Loaded the "' + p.label + '" example conditions. Change anything you like, then choose a tracking period and start the model.', 'ok');
    runBacktest();
  }

  // A one-line, plain-language restatement of what was actually run, so the
  // numbers on screen are never orphaned from the filters that produced them.
  function describeFilters(f) {
    var bits = [sportLabel(f.sport_key)];
    bits.push((f.market_types && f.market_types.length)
      ? f.market_types.map(marketLabel).join(', ') : 'all markets');
    if (f.side && f.side !== 'any') bits.push(f.side === 'favorite' ? 'favorites only' : 'underdogs only');
    if (f.home_away && f.home_away !== 'any') bits.push(f.home_away + ' side');
    if (f.min_odds != null || f.max_odds != null) {
      bits.push('odds ' + (f.min_odds != null ? fmtOdds(f.min_odds) : 'any')
        + ' to ' + (f.max_odds != null ? fmtOdds(f.max_odds) : 'any'));
    }
    if (f.min_line != null || f.max_line != null) {
      bits.push('line ' + (f.min_line != null ? f.min_line : 'any')
        + ' to ' + (f.max_line != null ? f.max_line : 'any'));
    }
    if (f.date_from || f.date_to) bits.push((f.date_from || 'earliest') + ' to ' + (f.date_to || 'today'));
    if (f.selection_contains) bits.push('selection contains "' + f.selection_contains + '"');
    return bits.join('  |  ');
  }

  // ---------------- Filters from form ----------------
  function filtersFromForm() {
    var f = {
      sport_key: el('modelSport').value,
      side: el('modelSide').value,
      home_away: el('modelHomeAway').value
    };
    var markets = selectedMarkets();
    if (markets.length) f.market_types = markets;
    if (el('minOdds').value !== '') f.min_odds = num(el('minOdds').value);
    if (el('maxOdds').value !== '') f.max_odds = num(el('maxOdds').value);
    if (el('minLine').value !== '') f.min_line = num(el('minLine').value);
    if (el('maxLine').value !== '') f.max_line = num(el('maxLine').value);
    if (el('dateFrom').value) f.date_from = el('dateFrom').value;
    if (el('dateTo').value) f.date_to = el('dateTo').value;
    if (el('selectionContains').value.trim()) f.selection_contains = el('selectionContains').value.trim();
    return f;
  }

  // ---------------- Backtest run ----------------
  function skeletonResults() {
    el('resultFreshness').textContent = 'Running...';
    var hero = '';
    for (var h = 0; h < 3; h++) hero += '<div class="kpi skeleton" style="height:112px"></div>';
    var tiles = '';
    for (var i = 0; i < 4; i++) tiles += '<div class="metric skeleton" style="height:84px"></div>';
    el('resultsBody').innerHTML = '<div class="kpi-hero">' + hero + '</div>'
      + '<div class="metric-grid">' + tiles + '</div>'
      + '<div class="skeleton" style="height:160px;border-radius:12px;margin-top:22px"></div>';
  }

  async function runBacktest(ev) {
    if (ev) ev.preventDefault();
    var sport = currentSport();
    if (!sport) { setMessage('Pick a sport first.', 'error'); return; }
    if (!sport.researchable) {
      el('resultFreshness').textContent = '';
      state.lastDescribe = describeFilters(filtersFromForm());
      el('resultsBody').innerHTML = '<p class="result-summary"><b>Your conditions:</b> ' + esc(state.lastDescribe) + '</p>'
        + '<div class="warn warn-warn" style="margin-top:14px">There is no graded wager history for '
        + esc(sportLabel(sport.sport_key)) + ' yet, so there is nothing honest to backtest these conditions against. '
        + 'That does not stop the model. The backtest is optional: choose a tracking period and start it, and it '
        + 'builds its own record from today forward.</div>';
      setMessage('No history to backtest for this sport. You can still start tracking it forward.', 'ok');
      return;
    }
    setMessage('');
    el('runBtn').disabled = true;
    skeletonResults();
    try {
      var filters = filtersFromForm();
      state.lastDescribe = describeFilters(filters);
      var res = await api().runBacktest(filters);
      renderResults(res);
      if (window.innerWidth <= 1000) {
        el('resultsBody').parentNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (e) {
      el('resultFreshness').textContent = '';
      el('resultsBody').innerHTML = '<p class="notice error">' + esc((e && e.message) || 'Backtest failed. Try again.') + '</p>';
    } finally {
      el('runBtn').disabled = false;
    }
  }

  function kpiTile(k, v, sub, cls) {
    return '<div class="kpi"><div class="k">' + esc(k) + '</div><div class="v ' + (cls || '') + '">'
      + esc(v) + '</div>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  }

  function metricTile(k, v, sub, cls) {
    return '<div class="metric"><div class="k">' + esc(k) + '</div><div class="v ' + (cls || '') + '">'
      + esc(v) + '</div>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  }

  // One factual sentence so the numbers are not left to interpret themselves.
  // Strictly a comparison of what happened, never a recommendation.
  function verdictHtml(m, c) {
    var b = c && c.baseline;
    if (!m || m.roi == null || !b || b.roi == null) return '';
    var d = m.roi - b.roi;
    var word = d > 0 ? 'ahead of' : (d < 0 ? 'behind' : 'level with');
    var cls = d > 0 ? 'verdict-pos' : (d < 0 ? 'verdict-neg' : '');
    var txt = 'Over ' + m.sample_size + ' graded picks this angle returned '
      + m.roi.toFixed(2) + '% ROI, ' + Math.abs(d).toFixed(2) + ' points '
      + word + ' the ' + (b.label || 'baseline').toLowerCase() + ' at ' + b.roi.toFixed(2) + '%.';
    var rc = c && c.random_control;
    if (rc && rc.roi != null) {
      txt += ' A same-size random sample of the same picks returned ' + rc.roi.toFixed(2) + '%.';
    }
    if (m.sample_size < 100) txt += ' The sample is small, so treat the gap as directional.';
    return '<p class="verdict ' + cls + '">' + esc(txt) + '</p>';
  }

  function warningsHtml(warnings) {
    if (!warnings || !warnings.length) return '';
    return '<div class="warnings">' + warnings.map(function (w) {
      return '<div class="warn warn-' + esc(w.level) + '">' + esc(w.text) + '</div>';
    }).join('') + '</div>';
  }

  function comparisonRow(label, m) {
    if (!m) return '';
    return '<tr><td>' + esc(label) + '</td><td>' + esc(m.record || '-') + '</td><td>' + fmtPct(m.win_rate)
      + '</td><td>' + fmtUnits(m.net_units) + '</td><td>' + (m.roi == null ? '-' : m.roi.toFixed(2) + '%')
      + '</td><td>' + fmtOdds(m.avg_odds) + '</td><td>' + (m.sample_size || 0) + '</td></tr>';
  }

  function clvCell(m) {
    if (!m.clv || !m.clv.available) return 'n/a';
    return (m.clv.avg_clv != null ? (m.clv.avg_clv > 0 ? '+' : '') + m.clv.avg_clv : '-')
      + ' (' + (m.clv.coverage_pct != null ? m.clv.coverage_pct : m.clv.sample) + '%)';
  }

  function unitsChart(series) {
    if (!series || series.length < 2) return '';
    var W = 640, H = 170, pad = 24;
    var vals = series.map(function (p) { return p.cumulative_units; });
    var min = Math.min.apply(null, vals.concat([0])), max = Math.max.apply(null, vals.concat([0]));
    var range = (max - min) || 1;
    var x = function (i) { return pad + (i / (series.length - 1)) * (W - pad * 2); };
    var y = function (v) { return H - pad - ((v - min) / range) * (H - pad * 2); };
    var d = series.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.cumulative_units).toFixed(1); }).join(' ');
    var zeroY = y(0);
    var last = vals[vals.length - 1];
    var stroke = last >= 0 ? '#34d399' : '#f87171';
    return '<div class="chart-wrap"><p class="panel-label">Cumulative units (net) over time</p>'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Cumulative units over time">'
      + '<line x1="' + pad + '" y1="' + zeroY.toFixed(1) + '" x2="' + (W - pad) + '" y2="' + zeroY.toFixed(1) + '" stroke="rgba(148,163,184,0.35)" stroke-dasharray="4 4"/>'
      + '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="2.5"/>'
      + '<text x="' + pad + '" y="14" fill="#9aa8ba" font-size="11">' + max.toFixed(1) + 'u</text>'
      + '<text x="' + pad + '" y="' + (H - 6) + '" fill="#9aa8ba" font-size="11">' + min.toFixed(1) + 'u</text>'
      + '</svg></div>';
  }

  function renderResults(res) {
    if (!res || res.ok === false) {
      el('resultFreshness').textContent = '';
      el('resultsBody').innerHTML = warningsHtml(res && res.warnings) || '<p class="notice error">No result.</p>';
      return;
    }
    var m = res.model;
    var blocked = (res.warnings || []).some(function (w) { return w.level === 'blocked'; });
    el('resultFreshness').textContent = res.generated_at ? 'Last updated ' + new Date(res.generated_at).toLocaleString() : '';

    if (blocked || !m || m.sample_size === 0) {
      el('resultsBody').innerHTML = warningsHtml(res.warnings)
        + '<p class="notice">Data source: ' + esc(res.data_source) + ' &middot; dataset ' + esc(res.dataset_version) + '</p>';
      return;
    }

    // Three headline numbers carry the result; the rest support them.
    var hero = '<div class="kpi-hero">'
      + kpiTile('Record', m.record, m.sample_size + ' graded picks')
      + kpiTile('ROI', m.roi == null ? '-' : m.roi.toFixed(2) + '%', 'return on risk', signClass(m.roi))
      + kpiTile('Net units', fmtUnits(m.net_units), 'on ' + m.staked_units + 'u staked', signClass(m.net_units))
      + '</div>';
    var tiles = [
      metricTile('Win rate', fmtPct(m.win_rate), m.wins + 'W / ' + m.losses + 'L' + (m.pushes ? ' / ' + m.pushes + 'P' : '')),
      metricTile('Avg odds', fmtOdds(m.avg_odds), 'American'),
      metricTile('Sample', String(m.sample_size), 'matching picks'),
      metricTile('Avg CLV', m.clv.available ? ((m.clv.avg_clv > 0 ? '+' : '') + m.clv.avg_clv) : 'n/a', m.clv.available ? m.clv.coverage_pct + '% coverage' : 'not available', signClass(m.clv.avg_clv))
    ].join('');

    var c = res.comparisons || {};
    var table = '<h3 class="section-title">How it compares</h3>'
      + '<div class="table-scroll"><table class="compare"><thead><tr>'
      + '<th>Comparison</th><th>Record</th><th>Win%</th><th>Units</th><th>ROI</th><th>Avg odds</th><th>N</th></tr></thead><tbody>'
      + comparisonRow('Your model', m)
      + comparisonRow((c.baseline && c.baseline.label) || 'Baseline', c.baseline)
      + comparisonRow((c.random_control && c.random_control.label) || 'Random control', c.random_control)
      + '</tbody></table></div>'
      + '<p class="model-meta" style="margin-top:8px">Closing line value (CLV): your model ' + clvCell(m)
      + (c.baseline ? ' &middot; baseline ' + clvCell(c.baseline) : '') + '. Positive CLV means picks beat the closing price.</p>';

    var summary = '<div class="ds-split"><span class="ds-flag hist">Historical backtest</span>'
      + '<span class="model-meta">Past results only. Not this model\'s live record.</span></div>'
      + (state.lastDescribe
          ? '<p class="result-summary"><b>Conditions tested:</b> ' + esc(state.lastDescribe) + '</p>' : '');
    el('resultsBody').innerHTML = tiles
      ? (summary + hero + '<div class="metric-grid">' + tiles + '</div>' + verdictHtml(m, c) + warningsHtml(res.warnings)
        + table + unitsChart(res.units_series)
        + '<p class="model-meta" style="margin-top:14px">Data source: ' + esc(res.data_source) + ' &middot; dataset ' + esc(res.dataset_version)
        + ' &middot; ' + res.sport_graded_total + ' graded picks in this sport.</p>'
        + '<p class="model-meta" style="margin-top:10px"><b>This is a backtest.</b> To find out whether the '
        + 'angle keeps working out of sample, choose a tracking period and start the model. Its forward record '
        + 'begins empty at that moment and these historical numbers never enter it.</p>')
      : warningsHtml(res.warnings);
  }

  // ---------------- Tracking period ----------------
  // The period is the commitment: it says how long these conditions get
  // monitored, and it is the difference between a saved search and a model.
  function periodLabel(v) {
    if (v === 'open') return 'until you stop it';
    if (v === 'custom') return 'until the date you set';
    return 'for ' + v + ' days';
  }

  function applyPeriod(v, keepDate) {
    state.period = v;
    Array.prototype.forEach.call(document.querySelectorAll('#periodRow .period'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-days') === v);
    });
    var until = el('trackUntil');
    var note = el('periodNote');
    if (v === 'open') {
      until.value = '';
      until.disabled = true;
    } else if (v === 'custom') {
      until.disabled = false;
      if (!until.value) until.value = isoDay(Date.now() + 30 * DAY_MS);
      if (!keepDate) until.focus();
    } else {
      until.disabled = false;
      until.value = isoDay(Date.now() + Number(v) * DAY_MS);
    }
    if (note) {
      note.textContent = v === 'open'
        ? 'Every future qualifying wager is recorded and graded until you stop the model yourself.'
        : 'Every future qualifying wager is recorded and graded through ' + until.value
          + '. Wagers already open on that date still settle.';
    }
  }

  function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }

  function trackUntilPayload() {
    if (state.period === 'open') return null;
    var v = el('trackUntil').value;
    // A date input gives a bare day. Run to the end of it, not its midnight,
    // or "track until the 30th" drops the 30th's card.
    return v ? v + 'T23:59:59' : null;
  }

  // A name the user recognises later, built from the conditions themselves.
  function suggestName(f) {
    var bits = [sportLabel(f.sport_key)];
    if (f.home_away === 'home') bits.push('Home');
    else if (f.home_away === 'away') bits.push('Away');
    if (f.side === 'favorite') bits.push('Favorites');
    else if (f.side === 'underdog') bits.push('Underdogs');
    var mk = (f.market_types || []).map(function (k) { return marketLabelFor(k, f.sport_key); });
    if (mk.length && mk.length <= 2) bits.push(mk.join(' + '));
    if (f.selection_contains) bits.push(f.selection_contains);
    if (f.min_odds != null || f.max_odds != null) {
      bits.push((f.min_odds != null ? fmtOdds(f.min_odds) : 'any') + ' to '
        + (f.max_odds != null ? fmtOdds(f.max_odds) : 'any'));
    }
    if (bits.length === 1) bits.push('Model');
    return bits.join(' ').slice(0, 120);
  }

  function refreshSuggestedName() {
    var input = el('modelName');
    if (!input || state.nameTouched) return;
    input.value = suggestName(filtersFromForm());
  }

  // ---------------- Saved models ----------------
  // One action creates the model AND starts it. A model that exists but is
  // not watching anything is not the product.
  async function startTracking() {
    if (!hasSession()) { setMessage('Log in to start tracking a model. It is free.', 'error'); return; }
    var input = el('modelName');
    var name = input ? input.value.trim() : '';
    if (!name) {
      name = suggestName(filtersFromForm());
      if (input) input.value = name;
    }
    if (!name) {
      setMessage('Give the model a name first.', 'error');
      if (input) input.focus();
      return;
    }
    if (state.period !== 'open' && !el('trackUntil').value) {
      setMessage('Choose how long to track this model, or pick "Until I stop it".', 'error');
      return;
    }
    var payload = {
      name: name.slice(0, 120),
      sport_key: el('modelSport').value,
      status: 'draft',
      criteria_json: { schema_version: 3, filters: filtersFromForm() },
      bankroll_json: {}
    };
    try {
      // A saved model tracks itself from the moment it is saved. The server
      // reconciles every future graded pick that matches on each read, so the
      // user never has to arm anything for the live record to accumulate.
      var created = await api().createModel(payload);
      var newId = created && created.model && created.model.id;
      var tracking = false;
      var taken = 0;
      var trackError = '';
      if (newId) {
        try {
          var stakeEl = el('stakeUnits');
          var opts = { track_until: trackUntilPayload() };
          if (stakeEl && stakeEl.value !== '') opts.stake_units = Number(stakeEl.value);
          var tr = await api().trackModel(newId, opts);
          tracking = true;
          taken = (tr && tr.board_picks_taken) || 0;
        } catch (e) { trackError = (e && e.message) || ''; }
      }
      state.nameTouched = false;
      var stakeTxt = (el('stakeUnits') && el('stakeUnits').value) || '1';
      var untilTxt = (el('trackUntil') && el('trackUntil').value) || '';
      setMessage(tracking
        ? ('Tracking started at ' + stakeTxt + 'u a qualifying wager, '
            + (untilTxt ? 'through ' + untilTxt : 'until you stop it')
            + '. It read the board straight away and found '
            + taken + ' qualifying wager' + (taken === 1 ? '' : 's')
            + '. From here it checks on its own every 20 minutes and grades each one on the final score.')
        : ('Model created but tracking did not start' + (trackError ? ': ' + trackError : '')
            + '. Use Start tracking on its card below.'), tracking ? 'ok' : 'error');
      await loadModels();
      if (newId && tracking) viewForward(newId);
    } catch (e) {
      setMessage((e && e.message) || 'Could not create the model.', 'error');
    }
  }

  async function loadModels() {
    if (!hasSession()) {
      el('loginHint').hidden = false;
      el('modelList').innerHTML = '';
      return;
    }
    el('loginHint').hidden = true;
    el('modelList').innerHTML = '<div class="model-card"><p class="model-meta">Loading your models...</p></div>';
    try {
      var data = await api().listModels({ include_archived: false });
      state.models = (data && data.models) || [];
      renderModels();
    } catch (e) {
      el('modelList').innerHTML = '<div class="model-card"><p class="notice error">' + esc((e && e.message) || 'Could not load models.') + '</p></div>';
    }
  }

  function renderModels() {
    if (!state.models.length) {
      el('modelList').innerHTML = '<div class="model-card"><h3>No models yet</h3><p class="model-meta">Set your conditions above, choose how long they should be monitored, then press Start tracking model. From that moment every future wager that meets them is logged here and graded on the final score, with no further work from you.</p></div>';
      return;
    }
    el('modelList').innerHTML = state.models.map(modelCardHtml).join('');
  }

  // Status is derived, never stored: a model whose end date has passed is
  // COMPLETE even though nothing wrote that word anywhere.
  function modelStatus(m) {
    if (!m.tracked_from) return { key: 'idle', label: 'Not tracking', cls: 'hist' };
    if (m.auto_scan === false) return { key: 'paused', label: 'Paused', cls: 'hist' };
    if (m.track_until && new Date(m.track_until).getTime() <= Date.now()) {
      return { key: 'complete', label: 'Complete', cls: 'done' };
    }
    return { key: 'active', label: 'Active', cls: 'live' };
  }

  function daysRemaining(m) {
    if (!m.track_until) return null;
    var left = new Date(m.track_until).getTime() - Date.now();
    return left <= 0 ? 0 : Math.ceil(left / DAY_MS);
  }

  // The conditions the model is actually watching for, each on its own chip,
  // so a card can be read without opening anything.
  function conditionChips(f, sportKey) {
    var out = [sportLabel(sportKey)];
    out.push((f.market_types && f.market_types.length)
      ? f.market_types.map(function (k) { return marketLabelFor(k, sportKey); }).join(' + ')
      : 'All markets');
    if (f.side && f.side !== 'any') out.push(f.side === 'favorite' ? 'Favorites' : 'Underdogs');
    if (f.home_away && f.home_away !== 'any') out.push(f.home_away === 'home' ? 'Home side' : 'Away side');
    if (f.min_odds != null || f.max_odds != null) {
      out.push('Odds ' + (f.min_odds != null ? fmtOdds(f.min_odds) : 'any')
        + ' to ' + (f.max_odds != null ? fmtOdds(f.max_odds) : 'any'));
    }
    if (f.min_line != null || f.max_line != null) {
      out.push('Line ' + (f.min_line != null ? f.min_line : 'any')
        + ' to ' + (f.max_line != null ? f.max_line : 'any'));
    }
    if (f.selection_contains) out.push('Contains "' + f.selection_contains + '"');
    return '<div class="model-conditions">' + out.map(function (c) {
      return '<span class="cond">' + esc(c) + '</span>';
    }).join('') + '</div>';
  }

  function countTile(n, label) {
    return '<div class="count"><b>' + esc(String(n)) + '</b><span>' + esc(label) + '</span></div>';
  }

  // Elapsed against the window the owner chose, so "how far in am I" is a
  // glance rather than a subtraction.
  function trackBar(m) {
    if (!m.tracked_from || !m.track_until) return '';
    var from = new Date(m.tracked_from).getTime();
    var to = new Date(m.track_until).getTime();
    if (!(to > from)) return '';
    var pct = Math.max(0, Math.min(100, ((Date.now() - from) / (to - from)) * 100));
    return '<div class="track-bar"><div class="track-line"><div class="track-fill" style="width:'
      + pct.toFixed(1) + '%"></div></div></div>';
  }

  function modelCardHtml(m) {
    var tracked = Boolean(m.tracked_from);
    var st = modelStatus(m);
    var f = (m.criteria_json && m.criteria_json.filters) || {};
    var t = m.tracking_stats || null;
    var left = daysRemaining(m);
    var window_ = tracked
      ? ('Tracking ' + new Date(m.tracked_from).toLocaleDateString()
          + ' to ' + (m.track_until ? new Date(m.track_until).toLocaleDateString() : 'no end date')
          + (left != null
              ? ' &middot; ' + (left === 0 ? 'window closed' : left + ' day' + (left === 1 ? '' : 's') + ' remaining')
              : '')
          + ' &middot; ' + (m.stake_units ? Number(m.stake_units) : 1) + 'u a qualifying wager')
      : 'Not started. Nothing is being recorded for this model yet.';

    var counts = tracked && t
      ? '<div class="count-row">'
        + countTile(t.found, 'Qualifying wagers found')
        + countTile(t.sample_size, 'Graded')
        + countTile(t.pending, 'Pending')
        + '</div>'
      : '';

    var perf = tracked && t && t.sample_size > 0
      ? '<div class="metric-grid" style="margin-top:12px">'
        + metricTile('Record', t.record, t.sample_size + ' graded')
        + metricTile('Win rate', fmtPct(t.win_rate), t.wins + 'W / ' + t.losses + 'L' + (t.pushes ? ' / ' + t.pushes + 'P' : ''))
        + metricTile('ROI', t.roi == null ? '-' : t.roi.toFixed(2) + '%', 'on ' + t.staked_units + 'u', signClass(t.roi))
        + metricTile('Net units', fmtUnits(t.net_units), 'forward only', signClass(t.net_units))
        + metricTile('Avg odds', fmtOdds(t.avg_odds), 'American')
        + '</div>'
      : (tracked
          ? '<p class="model-meta" style="margin-top:12px">Nothing has been graded yet. Results appear here as qualifying games finish.</p>'
          : '');

    return '<div class="model-card" data-id="' + m.id + '">'
      + '<h3>' + esc(m.name) + ' <span class="tag ' + st.cls + '">' + esc(st.label) + '</span></h3>'
      + conditionChips(f, m.sport_key)
      + '<div class="model-meta" style="margin-top:10px">' + window_ + '</div>'
      + trackBar(m)
      + (st.key === 'paused'
          ? '<div class="model-meta">Paused. Wagers already logged still settle, but nothing new is added.</div>' : '')
      + (st.key === 'complete'
          ? '<div class="model-meta">The tracking window has closed. Nothing new is added. Anything still open settles normally.</div>' : '')
      + counts
      + perf
      + (tracked
          ? '<div class="save-box terms-box" data-terms="' + m.id + '" hidden>'
            + '<div class="two-col">'
            + '<label>Units per wager<input type="number" min="0.1" max="100" step="any" data-f="stake" value="'
            + (m.stake_units ? Number(m.stake_units) : 1) + '"></label>'
            + '<label>Tracking ends<input type="date" data-f="until" value="'
            + (m.track_until ? esc(new Date(m.track_until).toISOString().slice(0, 10)) : '') + '"></label>'
            + '</div>'
            + '<span class="hint">Clear the date to run until you stop it. Wagers already logged keep the stake they were booked at.</span>'
            + '<div class="button-row split">'
            + '<button type="button" class="primary" data-act="terms-save" data-id="' + m.id + '">Save period</button>'
            + '<button type="button" data-act="terms-cancel" data-id="' + m.id + '">Cancel</button>'
            + '</div></div>'
          : '')
      + (tracked && m.last_scanned_at
          ? '<div class="model-meta" style="margin-top:10px">Board last checked ' + esc(new Date(m.last_scanned_at).toLocaleString()) + '</div>'
          : '')
      + '<div class="button-row">'
      + (tracked
          ? '<button type="button" class="primary" data-act="forward" data-id="' + m.id + '">View tracked wagers</button>'
            + '<button type="button" data-act="scan" data-id="' + m.id + '" data-enable="'
            + (m.auto_scan === false ? '1' : '0') + '">'
            + (m.auto_scan === false ? 'Resume tracking' : 'Pause tracking') + '</button>'
            + '<button type="button" data-act="terms" data-id="' + m.id + '">Edit period</button>'
            + '<button type="button" data-act="publish" data-id="' + m.id + '">Submit for public listing</button>'
          : '<button type="button" class="primary" data-act="track" data-id="' + m.id + '">Start tracking</button>')
      + '<button type="button" data-act="load" data-id="' + m.id + '">Backtest these conditions</button>'
      + '<button type="button" class="danger" data-act="delete" data-id="' + m.id + '">Delete</button>'
      + '</div></div>';
  }

  function disarmActions() {
    Array.prototype.forEach.call(document.querySelectorAll('#modelList [data-armed]'), function (b) {
      b.textContent = b.getAttribute('data-label') || b.textContent;
      b.removeAttribute('data-armed');
      b.removeAttribute('data-label');
      b.classList.remove('armed');
    });
  }

  function loadModelIntoForm(m) {
    var f = (m.criteria_json && m.criteria_json.filters) || {};
    el('modelSport').value = m.sport_key;
    renderMarketChips();
    (f.market_types || []).forEach(function (mt) {
      var cb = document.querySelector('#marketChips input[value="' + mt + '"]');
      if (cb && !cb.disabled) cb.checked = true;
    });
    syncMarketState();
    el('modelSide').value = f.side || 'any';
    el('modelHomeAway').value = f.home_away || 'any';
    el('minOdds').value = f.min_odds != null ? f.min_odds : '';
    el('maxOdds').value = f.max_odds != null ? f.max_odds : '';
    el('minLine').value = f.min_line != null ? f.min_line : '';
    el('maxLine').value = f.max_line != null ? f.max_line : '';
    el('dateFrom').value = f.date_from || '';
    el('dateTo').value = f.date_to || '';
    el('selectionContains').value = f.selection_contains || '';
    state.nameTouched = true;
    if (el('modelName')) el('modelName').value = m.name;
    setMessage('Loaded the conditions from "' + m.name + '". Run the historical backtest, or change them and start a new model. '
      + 'Nothing you do here changes the record of the model you loaded from.', 'ok');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Terms are editable while a model runs. The stake applies to what it takes
  // from now on; positions already booked keep the stake they were taken at.
  async function saveTerms(id) {
    var box = document.querySelector('[data-terms="' + id + '"]');
    if (!box) return;
    var stake = box.querySelector('[data-f="stake"]').value;
    var until = box.querySelector('[data-f="until"]').value;
    var payload = { track_until: until ? until + 'T23:59:59' : null };
    if (stake !== '') payload.stake_units = Number(stake);
    try {
      var res = await api().trackModel(id, payload);
      box.hidden = true;
      setMessage('Tracking period updated: ' + (res.stake_units || 1) + 'u a qualifying wager'
        + (res.track_until ? ', through ' + new Date(res.track_until).toLocaleDateString() : ', until you stop it')
        + '.', 'ok');
      await loadModels();
    } catch (e) {
      setMessage((e && e.message) || 'Could not update terms.', 'error');
    }
  }

  // Listing is a request, not a switch: an admin reviews it, and the public
  // page only shows a model once its own positions have settled results.
  async function requestPublic(id) {
    try {
      var res = await api().requestPublicModel(id);
      setMessage((res && res.note)
        || 'Submitted. It appears publicly only after an admin verifies it and its own positions have settled.', 'ok');
      loadPublicTracked();
    } catch (e) {
      setMessage((e && e.message) || 'Could not submit for listing.', 'error');
    }
  }

  // Pausing is the off switch that is not "delete it": open positions still
  // settle, nothing new is taken.
  async function toggleScan(id, enable) {
    try {
      var res = await api().setModelAutoScan(id, enable);
      setMessage(enable
        ? ('Tracking resumed. It read the board straight away and found '
            + ((res && res.board_picks_taken) || 0) + ' new qualifying wager'
            + (((res && res.board_picks_taken) || 0) === 1 ? '' : 's') + '.')
        : 'Tracking paused. Wagers already logged still settle, but nothing new is added.', 'ok');
      await loadModels();
    } catch (e) {
      setMessage((e && e.message) || 'Could not change scanning.', 'error');
    }
  }

  async function trackModel(id) {
    try {
      await api().trackModel(id);
      setMessage('Forward tracking started.', 'ok');
      await loadModels();
    } catch (e) { setMessage((e && e.message) || 'Could not start tracking.', 'error'); }
  }

  async function deleteModel(id) {
    try {
      await api().deleteModel(id);
      if (state.forwardOpenId === id) { el('forwardPanel').hidden = true; state.forwardOpenId = null; }
      await loadModels();
    } catch (e) { setMessage((e && e.message) || 'Could not delete.', 'error'); }
  }

  // A tracked model has two live records and they answer different questions:
  // the positions it took off the board by itself, and the human picks that
  // happened to match it. The model's own book leads.
  async function viewForward(id) {
    var panel = el('forwardPanel');
    state.forwardOpenId = id;
    panel.hidden = false;
    panel.innerHTML = '<div class="skeleton" style="height:150px;border-radius:12px;margin-top:16px"></div>';
    var autoHtml = '';
    var fwdHtml = '';
    try {
      var auto = await api().getModelAuto(id);
      autoHtml = renderAuto(auto);
    } catch (e) {
      autoHtml = '<p class="notice error">' + esc((e && e.message) || 'Could not load the model\'s positions.') + '</p>';
    }
    try {
      var data = await api().getModelForward(id);
      fwdHtml = forwardHtml(data);
    } catch (e) {
      fwdHtml = '<p class="notice error">' + esc((e && e.message) || 'Could not load matching picks.') + '</p>';
    }
    panel.innerHTML = autoHtml + fwdHtml;
  }

  function autoPickRow(p, showResult) {
    var when = p.commence_time ? new Date(p.commence_time) : null;
    var sel = esc(p.selection) + (p.line != null ? ' ' + p.line : '');
    return '<tr><td>' + esc(when ? when.toLocaleDateString() + ' ' + when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '-')
      + '</td><td>' + esc(p.game || '-') + '</td><td>' + esc(marketLabel(p.market)) + '</td>'
      + '<td>' + sel + '</td><td>' + fmtOdds(p.odds) + '</td><td>' + esc(p.book || '-') + '</td>'
      + (showResult
          ? '<td>' + statusPill(p.status) + '</td><td>' + (p.result_units == null ? '-' : fmtUnits(p.result_units)) + '</td>'
          : '<td>' + p.units + 'u</td>')
      + '</tr>';
  }

  function renderAuto(data) {
    if (!data || data.tracking === false) {
      return '<p class="notice">' + esc((data && data.message) || 'Not tracking yet.') + '</p>';
    }
    var s = data.summary || {};
    var scanned = data.last_scanned_at ? new Date(data.last_scanned_at).toLocaleString() : 'just now';
    var until = data.track_until ? new Date(data.track_until) : null;
    var windowTxt = until
      ? (data.window_open
          ? ' Capturing until ' + until.toLocaleDateString() + '.'
          : ' The tracking window closed on ' + until.toLocaleDateString() + ', so nothing new is taken. Open positions still settle.')
      : ' It runs until you stop it.';
    var found = (s.sample_size || 0) + (s.pending || 0);
    var head = '<div class="results-head" style="margin-top:18px"><div>'
      + '<p class="panel-label">Forward tracking</p>'
      + '<h2>Every wager that qualified since activation</h2></div>'
      + '<span class="freshness">Board last checked ' + esc(scanned) + '</span></div>'
      + '<div class="ds-split"><span class="ds-flag fwd">Live model record</span>'
      + '<span class="model-meta">Out of sample. No backtest result is counted here.</span></div>'
      + '<p class="panel-sub">Nobody enters these. The model reads the live board on its own, logs every wager that meets its conditions at the price posted, and each one is graded on the final score by the same grader that grades the site. '
      + (data.units_per_pick || 1) + ' unit' + ((data.units_per_pick || 1) === 1 ? '' : 's') + ' a qualifying wager.'
      + esc(windowTxt) + '</p>';

    var tiles = '<div class="count-row">'
      + countTile(found, 'Qualifying wagers found')
      + countTile(s.sample_size || 0, 'Graded')
      + countTile(s.pending || 0, 'Pending')
      + '</div>'
      + '<div class="kpi-hero" style="margin-top:14px">'
      + kpiTile('Record', s.record || '0-0', (s.sample_size || 0) + ' graded'
          + (s.pending ? ', ' + s.pending + ' pending' : ''))
      + kpiTile('ROI', s.roi == null ? '-' : s.roi.toFixed(2) + '%', 'on ' + (s.staked_units || 0) + 'u staked', signClass(s.roi))
      + kpiTile('Net units', fmtUnits(s.net_units), 'graded only', signClass(s.net_units))
      + '</div>'
      + '<div class="metric-grid">'
      + metricTile('Win rate', fmtPct(s.win_rate), (s.wins || 0) + 'W / ' + (s.losses || 0) + 'L')
      + metricTile('Avg odds', fmtOdds(s.avg_odds), 'American')
      + metricTile('Pending', String(s.pending || 0), 'not graded yet')
      + '</div>';

    var upcoming = (data.upcoming || []);
    var upcomingHtml = upcoming.length
      ? '<h3 class="section-title">On the board now (' + upcoming.length + ')</h3>'
        + '<div class="table-scroll"><table class="forward-list"><thead><tr><th>Starts</th><th>Game</th>'
        + '<th>Market</th><th>Selection</th><th>Price taken</th><th>Book</th><th>Stake</th></tr></thead><tbody>'
        + upcoming.map(function (p) { return autoPickRow(p, false); }).join('') + '</tbody></table></div>'
      : '<p class="model-meta" style="margin-top:14px">Nothing on the current board meets these conditions. That is a normal day for a model, not a fault. The next check runs within 20 minutes and anything that qualifies appears here on its own.</p>';

    // The day is the unit a bettor thinks in, so the day by day table sits
    // between the headline totals and the individual positions.
    var days = (data.by_day || []);
    var dayHtml = days.length
      ? '<h3 class="section-title">Day by day</h3>'
        + '<div class="table-scroll"><table class="forward-list"><thead><tr><th>Date</th><th>Taken</th>'
        + '<th>Record</th><th>Win%</th><th>Units</th><th>ROI</th><th>Open</th></tr></thead><tbody>'
        + days.map(function (d) {
            return '<tr><td>' + esc(d.date) + '</td><td>' + d.taken + '</td>'
              + '<td>' + esc(d.settled ? d.record : '-') + '</td>'
              + '<td>' + fmtPct(d.win_rate) + '</td>'
              + '<td class="' + signClass(d.net_units) + '">' + (d.settled ? fmtUnits(d.net_units) : '-') + '</td>'
              + '<td>' + (d.roi == null ? '-' : d.roi.toFixed(2) + '%') + '</td>'
              + '<td>' + (d.pending || 0) + '</td></tr>';
          }).join('')
        + '</tbody></table></div>'
      : '';

    var settled = (data.picks || []).filter(function (p) { return p.status !== 'pending'; }).slice(0, 40);
    var settledHtml = settled.length
      ? '<h3 class="section-title">Graded wagers</h3>'
        + '<div class="table-scroll"><table class="forward-list"><thead><tr><th>Date</th><th>Game</th>'
        + '<th>Market</th><th>Selection</th><th>Price</th><th>Book</th><th>Result</th><th>Units</th></tr></thead><tbody>'
        + settled.map(function (p) { return autoPickRow(p, true); }).join('') + '</tbody></table></div>'
      : '';

    var caps = data.caps || {};
    var note = '<p class="model-meta" style="margin-top:14px">Data source: ' + esc(data.data_source || 'live board')
      + '. Up to ' + (caps.per_scan || 25) + ' new positions a scan and ' + (caps.per_day || 50)
      + ' a day, from games starting inside ' + (caps.lookahead_hours || 72)
      + ' hours. These wagers are the model\'s own forward record: they never touch the verified graded ledger, your profile or the leaderboards, and no backtest result is ever added to them.</p>';

    return head + tiles + upcomingHtml + dayHtml + settledHtml + note;
  }

  function statusPill(s) {
    return '<span class="status-pill status-' + esc(s) + '">' + esc(s) + '</span>';
  }

  function forwardHtml(data) {
    if (!data || !data.tracking) {
      return '<p class="notice">' + esc((data && data.message) || 'Not tracking.') + '</p>';
    }
    var s = data.summary || {};
    var updated = data.last_updated ? new Date(data.last_updated).toLocaleString() : 'just now';
    var head = '<div class="results-head" style="margin-top:26px;padding-top:22px;border-top:1px solid var(--line)"><div>'
      + '<p class="panel-label">Also matching, for reference</p>'
      + '<h2>Handicapper picks that fit, since ' + esc(new Date(data.tracked_from).toLocaleDateString()) + '</h2></div>'
      + '<span class="freshness">Last updated ' + esc(updated) + '</span></div>';
    var tiles = '<div class="metric-grid">'
      + metricTile('Record', s.record || '0-0', s.sample_size + ' picks' + (s.pending ? ' (' + s.pending + ' pending)' : ''))
      + metricTile('Net units', fmtUnits(s.net_units), 'on ' + (s.staked_units || 0) + 'u', signClass(s.net_units))
      + metricTile('ROI', s.roi == null ? '-' : s.roi.toFixed(2) + '%', 'live', signClass(s.roi))
      + metricTile('Win rate', fmtPct(s.win_rate), (s.wins || 0) + 'W / ' + (s.losses || 0) + 'L')
      + metricTile('Avg odds', fmtOdds(s.avg_odds), 'American')
      + '</div>';
    var rows = (data.picks || []).map(function (p) {
      return '<tr><td>' + esc(String(p.date).slice(0, 10)) + '</td><td>' + esc(p.game || '-') + '</td>'
        + '<td>' + esc(marketLabel(p.market)) + '</td><td>' + esc(p.selection) + (p.line != null ? ' ' + p.line : '')
        + '</td><td>' + fmtOdds(p.odds) + '</td><td>' + esc(p.source || '-') + '</td>'
        + '<td>' + statusPill(p.grading_status) + (p.admin_status ? ' <small>(admin)</small>' : '') + '</td>'
        + '<td>' + (p.units == null ? '-' : fmtUnits(p.units)) + '</td></tr>';
    }).join('');
    var table = rows
      ? '<div class="table-scroll"><table class="forward-list"><thead><tr><th>Date</th><th>Game</th><th>Market</th><th>Selection</th><th>Odds</th><th>Source</th><th>Result</th><th>Units</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<p class="model-meta" style="margin-top:12px">No matching graded picks yet since tracking began. New picks appear here automatically as they are graded.</p>';
    return head + tiles
      + '<p class="model-meta">Data source: ' + esc(data.data_source) + ' &middot; forward only, never mixed with backtest history.</p>'
      + table;
  }

  // ---------------- Public tracked ----------------
  async function loadPublicTracked() {
    var host = el('publicTrackedHost');
    try {
      var data = await api().getPublicTrackedModels();
      var models = (data && data.models) || [];
      if (!models.length) {
        host.innerHTML = '<p class="placeholder">No publicly listed models yet. A model appears here only once it has taken its own positions off the board, those positions have settled on final scores, and an admin has reviewed it. Submit one from its card above.</p>';
        return;
      }
      host.innerHTML = '<div class="model-list">' + models.map(function (m) {
        var s = m.summary || {};
        return '<div class="model-card"><h3>' + esc(m.name) + ' <span class="tag live">Verified</span></h3>'
          + '<div class="model-meta">' + esc(sportLabel(m.sport_key)) + (m.owner ? ' &middot; by ' + esc(m.owner) : '')
          + ' &middot; since ' + esc(String(m.tracked_from).slice(0, 10)) + '</div>'
          + '<div class="metric-grid" style="margin-top:10px">'
          + metricTile('Record', s.record || '0-0', s.sample_size + ' positions it took')
          + metricTile('Units', fmtUnits(s.net_units), '', signClass(s.net_units))
          + metricTile('ROI', s.roi == null ? '-' : s.roi.toFixed(2) + '%', '', signClass(s.roi))
          + '</div>'
          + '<p class="model-meta" style="margin-top:8px">Last updated ' + esc(m.last_updated ? new Date(m.last_updated).toLocaleDateString() : '-') + '</p></div>';
      }).join('') + '</div>';
    } catch (e) {
      host.innerHTML = '<p class="placeholder">Tracked models are unavailable right now.</p>';
    }
  }

  // ---------------- Game Results dataset ----------------
  var gameState = { catalog: null, loaded: false };

  function ensureGameCatalog() {
    if (gameState.loaded) return Promise.resolve();
    return api().request('/models/game-catalog').then(function (cat) {
      gameState.catalog = cat; gameState.loaded = true;
      populateGameSports(cat);
      if (state.dataset === 'games') renderGameBadges(cat);
    }).catch(function () {
      el('gameSport').innerHTML = '<option value="">Coverage unavailable</option>';
    });
  }

  function populateGameSports(cat) {
    var sel = el('gameSport');
    var built = sportOptions(cat.sports || [], 'completed games');
    sel.innerHTML = built.html;
    if (built.first) sel.value = built.first;
  }

  function renderGameBadges(cat) {
    var researchable = (cat.sports || []).filter(function (s) { return s.researchable; });
    var totalGames = (cat.sports || []).reduce(function (a, s) { return a + s.games; }, 0);
    var latest = researchable.map(function (s) { return s.last_date; }).filter(Boolean).sort().pop();
    var fresh = cat.generated_at ? new Date(cat.generated_at).toLocaleString() : '-';
    el('sourceBadges').innerHTML = [
      covBadge('Real game results, loaded daily', 'Data source', 'badge-source'),
      covBadge(totalGames.toLocaleString(), 'Completed games'),
      covBadge(String(researchable.length), 'Researchable sports'),
      latest ? covBadge(esc(String(latest).slice(0, 10)), 'Data through') : '',
      covBadge(esc(fresh), 'Coverage loaded')
    ].join('');
  }

  function gameFiltersFromForm() {
    var f = { sport_key: el('gameSport').value, home_away: el('gameHomeAway').value };
    if (el('gameTotalLine').value !== '') f.total_line = num(el('gameTotalLine').value);
    if (el('gameMinTotal').value !== '') f.min_total = num(el('gameMinTotal').value);
    if (el('gameMaxTotal').value !== '') f.max_total = num(el('gameMaxTotal').value);
    if (el('gameDateFrom').value) f.date_from = el('gameDateFrom').value;
    if (el('gameDateTo').value) f.date_to = el('gameDateTo').value;
    if (el('gameTeamContains').value.trim()) f.team_contains = el('gameTeamContains').value.trim();
    return f;
  }

  function setGameMessage(t, k) { var m = el('gameMessage'); if (m) { m.textContent = t || ''; m.className = 'notice' + (k ? ' ' + k : ''); } }

  async function runGameBacktest(ev) {
    if (ev) ev.preventDefault();
    if (!el('gameSport').value) { setGameMessage('Pick a sport first.', 'error'); return; }
    setGameMessage('');
    el('gameRunBtn').disabled = true;
    el('gameFreshness').textContent = 'Running...';
    var tiles = ''; for (var i = 0; i < 6; i++) tiles += '<div class="metric skeleton" style="height:78px"></div>';
    el('gameResultsBody').innerHTML = '<div class="metric-grid">' + tiles + '</div>';
    try {
      var res = await api().request('/models/game-backtest', { method: 'POST', body: { filters: gameFiltersFromForm() } });
      renderGameResults(res);
    } catch (e) {
      el('gameFreshness').textContent = '';
      el('gameResultsBody').innerHTML = '<p class="notice error">' + esc((e && e.message) || 'Game backtest failed.') + '</p>';
    } finally { el('gameRunBtn').disabled = false; }
  }

  function gameCompareRow(label, m) {
    if (!m) return '';
    return '<tr><td>' + esc(label) + '</td><td>' + (m.home_win_pct == null ? '-' : m.home_win_pct + '%')
      + '</td><td>' + (m.avg_total == null ? '-' : m.avg_total) + '</td><td>' + (m.avg_margin == null ? '-' : m.avg_margin)
      + '</td><td>' + (m.sample_size || 0) + '</td></tr>';
  }

  function boxScoreBlocks(sport, games) {
    if (!games || !games.length) return '';
    var isBb = sport === 'baseball_mlb';
    var blocks = games.map(function (g) {
      var line;
      if (g.away_line && g.home_line) {
        var per = Math.max(g.away_line.length, g.home_line.length);
        var head = '<tr><th></th>'; for (var i = 0; i < per; i++) head += '<th>' + (i + 1) + '</th>'; head += '<th>' + (isBb ? 'R' : 'T') + '</th></tr>';
        var ar = '<tr><td>' + esc(g.away_team) + '</td>'; for (var j = 0; j < per; j++) ar += '<td>' + (g.away_line[j] != null ? g.away_line[j] : '') + '</td>'; ar += '<td class="final">' + g.away_score + '</td></tr>';
        var hr = '<tr><td>' + esc(g.home_team) + '</td>'; for (var k = 0; k < per; k++) hr += '<td>' + (g.home_line[k] != null ? g.home_line[k] : '') + '</td>'; hr += '<td class="final">' + g.home_score + '</td></tr>';
        line = '<table class="boxscore"><thead>' + head + '</thead><tbody>' + ar + hr + '</tbody></table>';
      } else {
        line = '<table class="boxscore"><tbody><tr><td>' + esc(g.away_team) + '</td><td class="final">' + g.away_score + '</td></tr>'
          + '<tr><td>' + esc(g.home_team) + '</td><td class="final">' + g.home_score + '</td></tr></tbody></table>';
      }
      return '<div style="margin-top:12px"><p class="model-meta" style="margin:0 0 4px">' + esc(g.date) + ' &middot; Total ' + g.total
        + (g.ou ? ' (' + String(g.ou).toUpperCase() + ')' : '') + '</p><div class="table-scroll">' + line + '</div></div>';
    }).join('');
    return '<h3 class="section-title">Recent box scores</h3>' + blocks;
  }

  function renderGameResults(res) {
    if (!res || res.ok === false) {
      el('gameFreshness').textContent = '';
      el('gameResultsBody').innerHTML = warningsHtml(res && res.warnings) || '<p class="notice error">No result.</p>';
      return;
    }
    var m = res.model;
    var blocked = (res.warnings || []).some(function (w) { return w.level === 'blocked'; });
    el('gameFreshness').textContent = res.generated_at ? 'Last updated ' + new Date(res.generated_at).toLocaleString() : '';
    if (blocked || !m || m.sample_size === 0) {
      el('gameResultsBody').innerHTML = warningsHtml(res.warnings) + '<p class="notice">Data source: ' + esc(res.data_source) + '</p>';
      return;
    }
    var tiles = [
      metricTile('Games', String(m.sample_size), 'completed'),
      metricTile('Home win', m.home_win_pct == null ? '-' : m.home_win_pct + '%', m.home_wins + '-' + m.away_wins + (m.ties ? '-' + m.ties : '')),
      metricTile('Avg total', m.avg_total == null ? '-' : String(m.avg_total), 'per game'),
      metricTile('Avg margin', m.avg_margin == null ? '-' : String(m.avg_margin), 'runs/points'),
      metricTile('1-run/close', m.one_run_pct == null ? '-' : m.one_run_pct + '%', 'margin = 1'),
      metricTile('Blowouts', m.blowout_pct == null ? '-' : m.blowout_pct + '%', 'margin 5+')
    ];
    if (m.side_win_pct != null) tiles.push(metricTile('Side win', m.side_win_pct + '%', el('gameHomeAway').value + ' teams'));
    if (m.extra_innings_pct != null) tiles.push(metricTile('Extra inns', m.extra_innings_pct + '%', 'went to extras'));
    if (m.first_five) tiles.push(metricTile('First 5 avg', String(m.first_five.avg_total), 'runs, n=' + m.first_five.sample));
    if (m.over_under) tiles.push(metricTile('O/U ' + m.over_under.line, m.over_under.record, (m.over_under.over_pct == null ? '-' : m.over_under.over_pct + '% over')));

    var c = res.comparisons || {};
    var table = '<h3 class="section-title">How it compares</h3>'
      + '<div class="table-scroll"><table class="compare"><thead><tr><th>Comparison</th><th>Home win%</th><th>Avg total</th><th>Avg margin</th><th>N</th></tr></thead><tbody>'
      + gameCompareRow('Your filter', m)
      + gameCompareRow((c.baseline && c.baseline.label) || 'Baseline', c.baseline)
      + '</tbody></table></div>';

    var gHero = '<div class="kpi-hero">'
      + kpiTile('Games', String(m.sample_size), 'completed')
      + kpiTile('Home win', m.home_win_pct == null ? '-' : m.home_win_pct + '%', m.home_wins + '-' + m.away_wins + (m.ties ? '-' + m.ties : ''))
      + kpiTile('Avg total', m.avg_total == null ? '-' : String(m.avg_total), 'per game')
      + '</div>';
    el('gameResultsBody').innerHTML = gHero + '<div class="metric-grid">' + tiles.slice(3).join('') + '</div>'
      + warningsHtml(res.warnings) + table
      + boxScoreBlocks(res.filters.sport_key, res.box_scores)
      + '<p class="model-meta" style="margin-top:12px">Data source: ' + esc(res.data_source) + ' &middot; ' + res.sport_games_total + ' completed games in this sport.</p>';
  }

  function switchDataset(ds) {
    state.dataset = ds;
    var isGames = ds === 'games';
    Array.prototype.forEach.call(document.querySelectorAll('.ds-btn'), function (b) {
      var on = b.getAttribute('data-ds') === ds;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    el('picksMode').hidden = isGames;
    el('gamesMode').hidden = !isGames;
    var hint = el('datasetHint');
    if (hint) {
      hint.textContent = isGames
        ? 'Study what actually happened in completed games: win rates, average totals and margins, Over/Under against a line you set, and recent box scores. Nothing is tracked forward from here.'
        : 'Build a model on the bets handicappers posted, backtest it, then set it running on the live board.';
    }
    if (isGames) {
      if (gameState.catalog) renderGameBadges(gameState.catalog);
      ensureGameCatalog();
    } else if (state.catalog) {
      renderBadges(state.catalog);
    }
  }

  // ---------------- Wiring ----------------
  function wire() {
    el('modelBuilderForm').addEventListener('submit', runBacktest);
    el('saveBtn').addEventListener('click', startTracking);
    var periodRow = el('periodRow');
    if (periodRow) {
      periodRow.addEventListener('click', function (ev) {
        var b = ev.target.closest('.period');
        if (b) applyPeriod(b.getAttribute('data-days'));
      });
    }
    if (el('trackUntil')) el('trackUntil').addEventListener('change', function () {
      // Typing a date IS choosing a custom period, so the chips follow the
      // field rather than silently disagreeing with it.
      applyPeriod('custom', true);
    });
    if (el('modelName')) {
      el('modelName').addEventListener('input', function () {
        state.nameTouched = Boolean(this.value.trim());
      });
      el('modelName').addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); startTracking(); }
      });
    }
    // The name is suggested from the conditions until the user writes one.
    ['modelSide', 'modelHomeAway', 'minOdds', 'maxOdds', 'selectionContains'].forEach(function (id) {
      var node = el(id);
      if (node) node.addEventListener('change', refreshSuggestedName);
    });
    el('resetBtn').addEventListener('click', function () {
      el('modelBuilderForm').reset();
      renderMarketChips();
      setMessage('');
      state.lastDescribe = '';
      state.nameTouched = false;
      applyPeriod('30');
      refreshSuggestedName();
      if (state.emptyResults) {
        el('resultsBody').innerHTML = state.emptyResults;
        el('resultFreshness').textContent = '';
      }
    });
    el('marketChips').addEventListener('change', function () {
      syncMarketState();
      refreshSuggestedName();
    });
    var pr = el('presetRow');
    if (pr) {
      pr.addEventListener('click', function (ev) {
        var b = ev.target.closest('.preset');
        if (!b) return;
        applyPreset((state.presets || [])[Number(b.getAttribute('data-preset'))]);
      });
    }
    el('modelList').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-act]');
      if (!b) return;
      var id = Number(b.getAttribute('data-id'));
      var act = b.getAttribute('data-act');
      var model = state.models.find(function (m) { return m.id === id; });
      if (act === 'load' && model) { loadModelIntoForm(model); return; }
      if (act === 'forward') { viewForward(id); return; }
      if (act === 'scan') { toggleScan(id, b.getAttribute('data-enable') === '1'); return; }
      if (act === 'publish') { requestPublic(id); return; }
      if (act === 'terms' || act === 'terms-cancel') {
        var box = document.querySelector('[data-terms="' + id + '"]');
        if (box) box.hidden = act !== 'terms';
        return;
      }
      if (act === 'terms-save') { saveTerms(id); return; }
      // Tracking and deleting are one-way, so they arm first and fire on the
      // second click. Same guard a confirm() gave, without the modal.
      if (act === 'track' || act === 'delete') {
        if (b.getAttribute('data-armed')) {
          disarmActions();
          if (act === 'track') trackModel(id); else deleteModel(id);
          return;
        }
        disarmActions();
        b.setAttribute('data-armed', '1');
        b.setAttribute('data-label', b.textContent);
        b.textContent = act === 'track' ? 'Confirm tracking' : 'Confirm delete';
        b.classList.add('armed');
        setMessage(act === 'track'
          ? 'Tracking logs every future wager that meets these conditions, from now on. Click again to confirm.'
          : 'This deletes the model and its whole forward record. Click again to confirm.', 'error');
      }
    });
    var dt = el('datasetToggle');
    if (dt) dt.addEventListener('click', function (ev) { var b = ev.target.closest('.ds-btn'); if (b) switchDataset(b.getAttribute('data-ds')); });
    var gf = el('gameForm');
    if (gf) gf.addEventListener('submit', runGameBacktest);
    var grb = el('gameResetBtn');
    if (grb) grb.addEventListener('click', function () {
      el('gameForm').reset();
      setGameMessage('');
      if (state.emptyGameResults) {
        el('gameResultsBody').innerHTML = state.emptyGameResults;
        el('gameFreshness').textContent = '';
      }
    });
  }

  async function init() {
    if (!window.api) { return; }
    try { if (api().loadTokens) api().loadTokens(); } catch (e) {}
    // Keep the authored empty states so Reset can put them back verbatim.
    state.emptyResults = el('resultsBody').innerHTML;
    state.emptyGameResults = el('gameResultsBody') ? el('gameResultsBody').innerHTML : '';
    wire();
    applyPeriod('30');
    await loadCatalog();
    refreshSuggestedName();
    renderPresets();
    loadModels();
    loadPublicTracked();
  }

  window.TMRModelBuilder = { init: init, runBacktest: runBacktest };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
