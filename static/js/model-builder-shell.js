/**
 * TrustMyRecord Model Builder shell (v2 - backtest + forward tracking).
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

  var state = { catalog: null, models: [], forwardOpenId: null, dataset: 'picks', lastDescribe: '' };

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

  // Two thirds of the ledger's leagues are below the research threshold. Left
  // in one flat list they read as a broken picker, so they get their own
  // labelled group and say plainly why they are not selectable.
  // Backtesting and tracking are different questions. A sport with a live
  // board can always be tracked forward, even with no graded history to
  // backtest, so it is offered rather than disabled. Only a sport with
  // neither is unusable.
  function sportOptions(sports, countWord) {
    var ok = sports.filter(function (s) { return s.researchable; });
    var track = sports.filter(function (s) { return !s.researchable && s.trackable; });
    var dead = sports.filter(function (s) { return !s.researchable && !s.trackable; });
    function opt(s, disabled, suffix) {
      var n = (s.graded != null ? s.graded : s.games) || 0;
      var label = sportLabel(s.sport_key) + ' (' + n.toLocaleString() + ' ' + countWord + ')';
      if (suffix) label += suffix;
      return '<option value="' + esc(s.sport_key) + '"' + (disabled ? ' disabled' : '') + '>'
        + esc(label) + '</option>';
    }
    return {
      first: ok.length ? ok[0].sport_key : (track.length ? track[0].sport_key : null),
      html: (ok.length ? '<optgroup label="Backtest and track">'
              + ok.map(function (s) { return opt(s, false); }).join('') + '</optgroup>' : '')
        + (track.length ? '<optgroup label="Track forward only, no backtest history yet">'
              + track.map(function (s) {
                  return opt(s, false, ' · ' + s.upcoming_games + ' games on the board');
                }).join('') + '</optgroup>' : '')
        + (dead.length ? '<optgroup label="Nothing to work with yet">'
              + dead.map(function (s) { return opt(s, true); }).join('') + '</optgroup>' : '')
    };
  }

  function populateSports(cat) {
    var sel = el('modelSport');
    var built = sportOptions(cat.sports || [], 'graded');
    sel.innerHTML = built.html;
    if (built.first) sel.value = built.first;
    renderMarketChips();
    sel.addEventListener('change', renderMarketChips);
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
    setMessage('Loaded the "' + p.label + '" quick start. Change anything you like, then run it again.', 'ok');
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
      el('resultsBody').innerHTML = '<p class="result-summary"><b>You built:</b> ' + esc(state.lastDescribe) + '</p>'
        + '<div class="warn warn-warn" style="margin-top:14px">There is no graded pick history for '
        + esc(sportLabel(sport.sport_key)) + ' yet, so there is nothing honest to backtest it against. '
        + 'The model still works: save it and it starts taking these selections off the live board '
        + 'at the posted price and settling them on final scores, building its record from today forward.</div>'
        + (sport.upcoming_games
            ? '<p class="model-meta" style="margin-top:12px">' + sport.upcoming_games
              + ' games on the board for this sport right now.</p>'
            : '');
      setMessage('No backtest history for this sport. Save the model to start tracking it forward.', 'ok');
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

    var summary = state.lastDescribe
      ? '<p class="result-summary"><b>You ran:</b> ' + esc(state.lastDescribe) + '</p>' : '';
    el('resultsBody').innerHTML = tiles
      ? (summary + hero + '<div class="metric-grid">' + tiles + '</div>' + verdictHtml(m, c) + warningsHtml(res.warnings)
        + table + unitsChart(res.units_series)
        + '<p class="model-meta" style="margin-top:14px">Data source: ' + esc(res.data_source) + ' &middot; dataset ' + esc(res.dataset_version)
        + ' &middot; ' + res.sport_graded_total + ' graded picks in this sport.</p>')
      : warningsHtml(res.warnings);
  }

  // ---------------- Saved models ----------------
  // window.prompt was the last piece of admin-panel furniture on the page.
  // Same payload, same endpoint, asked for inline instead.
  function openSaveBox() {
    if (!hasSession()) {
      setMessage('Log in to save a model and track it forward.', 'error');
      return;
    }
    var box = el('saveBox');
    if (!box) { saveModel(); return; }
    box.hidden = false;
    var input = el('modelName');
    if (!input.value) {
      var f = filtersFromForm();
      input.value = describeFilters(f).replace(/  \|  /g, ' ').slice(0, 120);
    }
    input.focus();
    input.select();
  }

  function closeSaveBox() {
    var box = el('saveBox');
    if (box) box.hidden = true;
  }

  async function saveModel() {
    if (!hasSession()) { setMessage('Log in to save models.', 'error'); return; }
    var input = el('modelName');
    var name = input ? input.value.trim() : window.prompt('Name this model:');
    if (!name) {
      setMessage('Give the model a name first.', 'error');
      if (input) input.focus();
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
      if (newId) {
        try {
          var stakeEl = el('stakeUnits');
          var untilEl = el('trackUntil');
          var opts = {};
          if (stakeEl && stakeEl.value !== '') opts.stake_units = Number(stakeEl.value);
          // A date input gives a bare day. Run to the end of it, not its
          // midnight, or "track until the 30th" drops the 30th's card.
          if (untilEl && untilEl.value) opts.track_until = untilEl.value + 'T23:59:59';
          var tr = await api().trackModel(newId, opts);
          tracking = true;
          taken = (tr && tr.board_picks_taken) || 0;
        } catch (e) { tracking = false; }
      }
      closeSaveBox();
      if (el('modelName')) el('modelName').value = '';
      var stakeTxt = (el('stakeUnits') && el('stakeUnits').value) || '1';
      var untilTxt = (el('trackUntil') && el('trackUntil').value) || '';
      setMessage(tracking
        ? ('Model saved and running at ' + stakeTxt + 'u a bet'
            + (untilTxt ? ', through ' + untilTxt : '')
            + '. It read the live board straight away and took '
            + taken + ' position' + (taken === 1 ? '' : 's') + '. From here it scans on its own and settles each one on the final score.')
        : 'Model saved. It is listed under Your models below.', 'ok');
      await loadModels();
      if (newId && tracking) viewForward(newId);
    } catch (e) {
      setMessage((e && e.message) || 'Could not save model.', 'error');
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
      el('modelList').innerHTML = '<div class="model-card"><h3>No saved models yet</h3><p class="model-meta">Run a model, then Save model. Saving starts live tracking straight away, so every future graded pick that matches is recorded here on its own.</p></div>';
      return;
    }
    el('modelList').innerHTML = state.models.map(function (m) {
      var tracked = Boolean(m.tracked_from);
      var f = (m.criteria_json && m.criteria_json.filters) || {};
      var markets = (f.market_types || []).map(function (k) { return marketLabelFor(k, m.sport_key); }).join(', ') || 'all markets';
      return '<div class="model-card" data-id="' + m.id + '">'
        + '<h3>' + esc(m.name) + ' ' + (tracked
            ? (m.auto_scan === false
                ? '<span class="tag hist">Paused</span>'
                : '<span class="tag live">Tracking live</span>')
            : '<span class="tag hist">Not tracking</span>') + '</h3>'
        + '<div class="model-meta">' + esc(sportLabel(m.sport_key)) + ' &middot; ' + esc(markets)
        + (f.side && f.side !== 'any' ? ' &middot; ' + esc(f.side) : '') + '</div>'
        + (tracked && m.auto_scan === false
            ? '<div class="model-meta">Paused. Positions already open still settle, but nothing new is taken.</div>'
            : '')
        + (tracked
            ? '<div class="model-meta">'
              + (m.stake_units ? Number(m.stake_units) + 'u a bet' : '1u a bet')
              + (m.track_until ? ' &middot; through ' + esc(new Date(m.track_until).toLocaleDateString()) : ' &middot; no end date')
              + '</div>'
            : '')
        + (tracked
            ? '<div class="save-box terms-box" data-terms="' + m.id + '" hidden>'
              + '<div class="two-col">'
              + '<label>Units per bet<input type="number" min="0.1" max="100" step="0.5" data-f="stake" value="'
              + (m.stake_units ? Number(m.stake_units) : 1) + '"></label>'
              + '<label>Track until<input type="date" data-f="until" value="'
              + (m.track_until ? esc(new Date(m.track_until).toISOString().slice(0, 10)) : '') + '"></label>'
              + '</div>'
              + '<span class="hint">Clear the date to run until you stop it. Positions already taken keep the stake they were booked at.</span>'
              + '<div class="button-row split">'
              + '<button type="button" class="primary" data-act="terms-save" data-id="' + m.id + '">Save terms</button>'
              + '<button type="button" data-act="terms-cancel" data-id="' + m.id + '">Cancel</button>'
              + '</div></div>'
            : '')
        + (tracked
            ? '<div class="model-meta">Scanning the board since ' + esc(new Date(m.tracked_from).toLocaleDateString())
              + (m.last_scanned_at ? ' &middot; last read ' + esc(new Date(m.last_scanned_at).toLocaleString()) : '')
              + '</div>'
            : '')
        + '<div class="button-row">'
        + '<button type="button" data-act="load" data-id="' + m.id + '">Load</button>'
        + (tracked
            ? '<button type="button" class="primary" data-act="forward" data-id="' + m.id + '">View live record</button>'
              + '<button type="button" data-act="scan" data-id="' + m.id + '" data-enable="'
              + (m.auto_scan === false ? '1' : '0') + '">'
              + (m.auto_scan === false ? 'Resume scanning' : 'Pause scanning') + '</button>'
              + '<button type="button" data-act="terms" data-id="' + m.id + '">Edit terms</button>'
              + '<button type="button" data-act="publish" data-id="' + m.id + '">Submit for public listing</button>'
            : '<button type="button" class="primary" data-act="track" data-id="' + m.id + '">Start tracking</button>')
        + '<button type="button" class="danger" data-act="delete" data-id="' + m.id + '">Delete</button>'
        + '</div></div>';
    }).join('');
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
    setMessage('Loaded "' + m.name + '". Run backtest to see results.', 'ok');
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
      setMessage('Terms updated: ' + (res.stake_units || 1) + 'u a bet'
        + (res.track_until ? ', through ' + new Date(res.track_until).toLocaleDateString() : ', no end date')
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
        ? ('Scanning resumed. It read the board straight away and took '
            + ((res && res.board_picks_taken) || 0) + ' new position'
            + (((res && res.board_picks_taken) || 0) === 1 ? '' : 's') + '.')
        : 'Scanning paused. Positions already open still settle, but nothing new is taken.', 'ok');
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
    var head = '<div class="results-head" style="margin-top:18px"><div>'
      + '<p class="panel-label">The model\'s own book</p>'
      + '<h2>Positions it took off the board</h2></div>'
      + '<span class="freshness">Board last scanned ' + esc(scanned) + '</span></div>'
      + '<p class="panel-sub">Nobody enters these. The model reads the live board on its own, takes every selection that matches its filters at the price posted, and each one is settled on the final score by the same grader that grades the site. '
      + (data.units_per_pick || 1) + ' unit' + ((data.units_per_pick || 1) === 1 ? '' : 's') + ' a position.'
      + esc(windowTxt) + '</p>';

    var tiles = '<div class="kpi-hero">'
      + kpiTile('Record', s.record || '0-0', s.sample_size + ' settled'
          + (s.pending ? ', ' + s.pending + ' live' : ''))
      + kpiTile('ROI', s.roi == null ? '-' : s.roi.toFixed(2) + '%', 'on ' + (s.staked_units || 0) + 'u staked', signClass(s.roi))
      + kpiTile('Net units', fmtUnits(s.net_units), 'settled only', signClass(s.net_units))
      + '</div>'
      + '<div class="metric-grid">'
      + metricTile('Win rate', fmtPct(s.win_rate), (s.wins || 0) + 'W / ' + (s.losses || 0) + 'L')
      + metricTile('Avg odds', fmtOdds(s.avg_odds), 'American')
      + metricTile('Open', String(s.pending || 0), 'not settled yet')
      + '</div>';

    var upcoming = (data.upcoming || []);
    var upcomingHtml = upcoming.length
      ? '<h3 class="section-title">On the board now (' + upcoming.length + ')</h3>'
        + '<div class="table-scroll"><table class="forward-list"><thead><tr><th>Starts</th><th>Game</th>'
        + '<th>Market</th><th>Selection</th><th>Price taken</th><th>Book</th><th>Stake</th></tr></thead><tbody>'
        + upcoming.map(function (p) { return autoPickRow(p, false); }).join('') + '</tbody></table></div>'
      : '<p class="model-meta" style="margin-top:14px">Nothing on the current board matches these filters. The next scan runs within 20 minutes, and new positions appear here on their own.</p>';

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
      ? '<h3 class="section-title">Settled positions</h3>'
        + '<div class="table-scroll"><table class="forward-list"><thead><tr><th>Date</th><th>Game</th>'
        + '<th>Market</th><th>Selection</th><th>Price</th><th>Book</th><th>Result</th><th>Units</th></tr></thead><tbody>'
        + settled.map(function (p) { return autoPickRow(p, true); }).join('') + '</tbody></table></div>'
      : '';

    var caps = data.caps || {};
    var note = '<p class="model-meta" style="margin-top:14px">Data source: ' + esc(data.data_source || 'live board')
      + '. Up to ' + (caps.per_scan || 25) + ' new positions a scan and ' + (caps.per_day || 50)
      + ' a day, from games starting inside ' + (caps.lookahead_hours || 72)
      + ' hours. These positions are the model\'s own and never touch the verified graded ledger.</p>';

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
      + '<p class="panel-label">Matching handicapper picks</p>'
      + '<h2>Human picks that fit, since ' + esc(new Date(data.tracked_from).toLocaleDateString()) + '</h2></div>'
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
    var built = sportOptions(cat.sports || [], 'games');
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
    el('saveBtn').addEventListener('click', openSaveBox);
    if (el('saveConfirmBtn')) el('saveConfirmBtn').addEventListener('click', saveModel);
    if (el('saveCancelBtn')) el('saveCancelBtn').addEventListener('click', function () {
      closeSaveBox();
      setMessage('');
    });
    if (el('modelName')) el('modelName').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); saveModel(); }
    });
    el('resetBtn').addEventListener('click', function () {
      el('modelBuilderForm').reset();
      renderMarketChips();
      setMessage('');
      closeSaveBox();
      state.lastDescribe = '';
      if (state.emptyResults) {
        el('resultsBody').innerHTML = state.emptyResults;
        el('resultFreshness').textContent = '';
      }
    });
    el('marketChips').addEventListener('change', syncMarketState);
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
          ? 'Tracking records every future graded pick that matches, from now on. Click again to confirm.'
          : 'This deletes the model and its tracking history. Click again to confirm.', 'error');
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
    await loadCatalog();
    renderPresets();
    loadModels();
    loadPublicTracked();
  }

  window.TMRModelBuilder = { init: init, runBacktest: runBacktest };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
