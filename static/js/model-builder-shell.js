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
    soccer_intl_friendly: 'Intl Friendlies', tennis: 'Tennis'
  };
  var MARKET_LABELS = {
    h2h: 'Moneyline', spreads: 'Spread / run line', totals: 'Total', team_totals: 'Team total',
    f5_h2h: 'F5 moneyline', f5_totals: 'F5 total', f5_spreads: 'F5 spread',
    first_inning_totals: '1st inning total', batter_hits: 'Batter hits',
    batter_rbi: 'Batter RBI', batter_total_bases: 'Batter total bases',
    pitcher_strikeouts: 'Pitcher Ks', pitcher_outs: 'Pitcher outs',
    nba_points: 'NBA points', nba_rebounds: 'NBA rebounds', nba_assists: 'NBA assists'
  };

  var state = { catalog: null, models: [], forwardOpenId: null };

  function api() { return window.api; }
  function el(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function sportLabel(k) { return SPORT_LABELS[k] || k; }
  function marketLabel(k) { return MARKET_LABELS[k] || k; }
  function num(v) { return (v === null || v === undefined || v === '') ? null : Number(v); }
  function fmtOdds(o) { if (o == null) return '-'; return o > 0 ? '+' + o : String(o); }
  function fmtUnits(u) { if (u == null) return '-'; return (u > 0 ? '+' : '') + Number(u).toFixed(2) + 'u'; }
  function fmtPct(p) { return p == null ? '-' : Number(p).toFixed(1) + '%'; }
  function signClass(v) { if (v == null) return ''; return v > 0 ? 'pos' : (v < 0 ? 'neg' : ''); }

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
      '<span class="badge"><span class="dot"></span>Source: <b>' + esc(cat.data_source || 'Verified graded picks') + '</b></span>',
      '<span class="badge"><b>' + totalGraded.toLocaleString() + '</b> verified graded picks</span>',
      '<span class="badge"><b>' + researchable.length + '</b> researchable sports</span>',
      latest ? '<span class="badge">Data through <b>' + esc(String(latest).slice(0, 10)) + '</b></span>' : '',
      '<span class="badge">Loaded ' + esc(fresh) + '</span>'
    ].join('');
  }

  function populateSports(cat) {
    var sel = el('modelSport');
    var sports = (cat.sports || []);
    sel.innerHTML = sports.map(function (s) {
      var label = sportLabel(s.sport_key) + ' (' + s.graded + ' graded)';
      if (!s.researchable) label += ' - insufficient data';
      return '<option value="' + esc(s.sport_key) + '"' + (s.researchable ? '' : ' disabled') + '>' + esc(label) + '</option>';
    }).join('');
    var firstOk = sports.find(function (s) { return s.researchable; });
    if (firstOk) { sel.value = firstOk.sport_key; }
    renderMarketChips();
    sel.addEventListener('change', renderMarketChips);
  }

  function currentSport() {
    if (!state.catalog) return null;
    var key = el('modelSport').value;
    return (state.catalog.sports || []).find(function (s) { return s.sport_key === key; }) || null;
  }

  function renderMarketChips() {
    var host = el('marketChips');
    var sport = currentSport();
    if (!sport || !sport.markets || !sport.markets.length) {
      host.innerHTML = '<span class="placeholder">No graded markets for this sport</span>';
      return;
    }
    host.innerHTML = sport.markets.map(function (m) {
      var thin = m.graded < 30;
      return '<label class="' + (thin ? 'disabled' : '') + '" title="' + m.graded + ' graded">'
        + '<input type="checkbox" value="' + esc(m.market_type) + '"' + (thin ? ' disabled' : '') + '>'
        + esc(marketLabel(m.market_type)) + ' <span style="color:#64748b">' + m.graded + '</span></label>';
    }).join('');
  }

  function selectedMarkets() {
    return Array.prototype.slice.call(document.querySelectorAll('#marketChips input:checked'))
      .map(function (c) { return c.value; });
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
    var tiles = '';
    for (var i = 0; i < 6; i++) tiles += '<div class="metric skeleton" style="height:78px"></div>';
    el('resultsBody').innerHTML = '<div class="metric-grid">' + tiles + '</div>'
      + '<div class="skeleton" style="height:150px;border-radius:10px;margin-top:18px"></div>';
  }

  async function runBacktest(ev) {
    if (ev) ev.preventDefault();
    var sport = currentSport();
    if (!sport) { setMessage('Pick a sport first.', 'error'); return; }
    if (!sport.researchable) { setMessage('This sport has insufficient verified data to backtest.', 'error'); return; }
    setMessage('');
    el('runBtn').disabled = true;
    skeletonResults();
    try {
      var res = await api().runBacktest(filtersFromForm());
      renderResults(res);
    } catch (e) {
      el('resultFreshness').textContent = '';
      el('resultsBody').innerHTML = '<p class="notice error">' + esc((e && e.message) || 'Backtest failed. Try again.') + '</p>';
    } finally {
      el('runBtn').disabled = false;
    }
  }

  function metricTile(k, v, sub, cls) {
    return '<div class="metric"><div class="k">' + esc(k) + '</div><div class="v ' + (cls || '') + '">'
      + esc(v) + '</div>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
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

    var tiles = [
      metricTile('Record', m.record, m.sample_size + ' graded'),
      metricTile('Net units', fmtUnits(m.net_units), 'on ' + m.staked_units + 'u staked', signClass(m.net_units)),
      metricTile('ROI', m.roi == null ? '-' : m.roi.toFixed(2) + '%', 'return on risk', signClass(m.roi)),
      metricTile('Win rate', fmtPct(m.win_rate), m.wins + 'W / ' + m.losses + 'L' + (m.pushes ? ' / ' + m.pushes + 'P' : '')),
      metricTile('Avg odds', fmtOdds(m.avg_odds), 'American'),
      metricTile('Sample', String(m.sample_size), 'matching picks'),
      metricTile('Avg CLV', m.clv.available ? ((m.clv.avg_clv > 0 ? '+' : '') + m.clv.avg_clv) : 'n/a', m.clv.available ? m.clv.coverage_pct + '% coverage' : 'not available', signClass(m.clv.avg_clv))
    ].join('');

    var c = res.comparisons || {};
    var table = '<div class="table-scroll"><table class="compare"><thead><tr>'
      + '<th>Comparison</th><th>Record</th><th>Win%</th><th>Units</th><th>ROI</th><th>Avg odds</th><th>N</th></tr></thead><tbody>'
      + comparisonRow('Your model', m)
      + comparisonRow((c.baseline && c.baseline.label) || 'Baseline', c.baseline)
      + comparisonRow((c.random_control && c.random_control.label) || 'Random control', c.random_control)
      + '</tbody></table></div>'
      + '<p class="model-meta" style="margin-top:8px">Closing line value (CLV): your model ' + clvCell(m)
      + (c.baseline ? ' &middot; baseline ' + clvCell(c.baseline) : '') + '. Positive CLV means picks beat the closing price.</p>';

    el('resultsBody').innerHTML = tiles
      ? ('<div class="metric-grid">' + tiles + '</div>' + warningsHtml(res.warnings) + table + unitsChart(res.units_series)
        + '<p class="model-meta" style="margin-top:12px">Data source: ' + esc(res.data_source) + ' &middot; dataset ' + esc(res.dataset_version)
        + ' &middot; ' + res.sport_graded_total + ' graded picks in this sport.</p>')
      : warningsHtml(res.warnings);
  }

  // ---------------- Saved models ----------------
  async function saveModel() {
    if (!hasSession()) { setMessage('Log in to save models.', 'error'); return; }
    var name = window.prompt('Name this model:');
    if (!name) return;
    var payload = {
      name: name.slice(0, 120),
      sport_key: el('modelSport').value,
      status: 'draft',
      criteria_json: { schema_version: 3, filters: filtersFromForm() },
      bankroll_json: {}
    };
    try {
      await api().createModel(payload);
      setMessage('Model saved.', 'ok');
      await loadModels();
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
      el('modelList').innerHTML = '<div class="model-card"><h3>No saved models yet</h3><p class="model-meta">Run a backtest, then Save model to keep it and track it forward.</p></div>';
      return;
    }
    el('modelList').innerHTML = state.models.map(function (m) {
      var tracked = Boolean(m.tracked_from);
      var f = (m.criteria_json && m.criteria_json.filters) || {};
      var markets = (f.market_types || []).map(marketLabel).join(', ') || 'all markets';
      return '<div class="model-card" data-id="' + m.id + '">'
        + '<h3>' + esc(m.name) + ' ' + (tracked ? '<span class="tag live">Tracking</span>' : '<span class="tag hist">Backtest only</span>') + '</h3>'
        + '<div class="model-meta">' + esc(sportLabel(m.sport_key)) + ' &middot; ' + esc(markets)
        + (f.side && f.side !== 'any' ? ' &middot; ' + esc(f.side) : '') + '</div>'
        + (tracked ? '<div class="model-meta">Tracking since ' + esc(new Date(m.tracked_from).toLocaleDateString()) + '</div>' : '')
        + '<div class="button-row">'
        + '<button type="button" data-act="load" data-id="' + m.id + '">Load</button>'
        + (tracked
            ? '<button type="button" data-act="forward" data-id="' + m.id + '">View tracking</button>'
            : '<button type="button" class="primary" data-act="track" data-id="' + m.id + '">Track forward</button>')
        + '<button type="button" class="danger" data-act="delete" data-id="' + m.id + '">Delete</button>'
        + '</div></div>';
    }).join('');
  }

  function loadModelIntoForm(m) {
    var f = (m.criteria_json && m.criteria_json.filters) || {};
    el('modelSport').value = m.sport_key;
    renderMarketChips();
    (f.market_types || []).forEach(function (mt) {
      var cb = document.querySelector('#marketChips input[value="' + mt + '"]');
      if (cb && !cb.disabled) cb.checked = true;
    });
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

  async function trackModel(id) {
    if (!window.confirm('Start forward tracking this model? From now on, every new graded pick matching its filters is recorded and kept separate from backtest history.')) return;
    try {
      await api().trackModel(id);
      setMessage('Forward tracking started.', 'ok');
      await loadModels();
    } catch (e) { setMessage((e && e.message) || 'Could not start tracking.', 'error'); }
  }

  async function deleteModel(id) {
    if (!window.confirm('Delete this model and its tracking history? This cannot be undone.')) return;
    try {
      await api().deleteModel(id);
      if (state.forwardOpenId === id) { el('forwardPanel').hidden = true; state.forwardOpenId = null; }
      await loadModels();
    } catch (e) { setMessage((e && e.message) || 'Could not delete.', 'error'); }
  }

  async function viewForward(id) {
    var panel = el('forwardPanel');
    state.forwardOpenId = id;
    panel.hidden = false;
    panel.innerHTML = '<div class="skeleton" style="height:120px;border-radius:10px;margin-top:14px"></div>';
    try {
      var data = await api().getModelForward(id);
      renderForward(data);
    } catch (e) {
      panel.innerHTML = '<p class="notice error">' + esc((e && e.message) || 'Could not load tracking.') + '</p>';
    }
  }

  function statusPill(s) {
    return '<span class="status-pill status-' + esc(s) + '">' + esc(s) + '</span>';
  }

  function renderForward(data) {
    var panel = el('forwardPanel');
    if (!data || !data.tracking) {
      panel.innerHTML = '<p class="notice">' + esc((data && data.message) || 'Not tracking.') + '</p>';
      return;
    }
    var s = data.summary || {};
    var updated = data.last_updated ? new Date(data.last_updated).toLocaleString() : 'just now';
    var head = '<div class="results-head" style="margin-top:14px"><div><p class="panel-label">Forward tracked (live)</p>'
      + '<h2>Since ' + esc(new Date(data.tracked_from).toLocaleDateString()) + '</h2></div>'
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
    panel.innerHTML = head + tiles
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
        host.innerHTML = '<p class="placeholder">No publicly verified tracked models yet. Models appear here only after they accumulate real forward-tracked graded results and pass admin review.</p>';
        return;
      }
      host.innerHTML = '<div class="model-list">' + models.map(function (m) {
        var s = m.summary || {};
        return '<div class="model-card"><h3>' + esc(m.name) + ' <span class="tag live">Verified</span></h3>'
          + '<div class="model-meta">' + esc(sportLabel(m.sport_key)) + (m.owner ? ' &middot; by ' + esc(m.owner) : '')
          + ' &middot; since ' + esc(String(m.tracked_from).slice(0, 10)) + '</div>'
          + '<div class="metric-grid" style="margin-top:10px">'
          + metricTile('Record', s.record || '0-0', s.sample_size + ' picks')
          + metricTile('Units', fmtUnits(s.net_units), '', signClass(s.net_units))
          + metricTile('ROI', s.roi == null ? '-' : s.roi.toFixed(2) + '%', '', signClass(s.roi))
          + '</div>'
          + '<p class="model-meta" style="margin-top:8px">Last updated ' + esc(m.last_updated ? new Date(m.last_updated).toLocaleDateString() : '-') + '</p></div>';
      }).join('') + '</div>';
    } catch (e) {
      host.innerHTML = '<p class="placeholder">Tracked models are unavailable right now.</p>';
    }
  }

  // ---------------- Wiring ----------------
  function wire() {
    el('modelBuilderForm').addEventListener('submit', runBacktest);
    el('saveBtn').addEventListener('click', saveModel);
    el('resetBtn').addEventListener('click', function () {
      el('modelBuilderForm').reset();
      renderMarketChips();
      setMessage('');
    });
    el('modelList').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-act]');
      if (!b) return;
      var id = Number(b.getAttribute('data-id'));
      var act = b.getAttribute('data-act');
      var model = state.models.find(function (m) { return m.id === id; });
      if (act === 'load' && model) loadModelIntoForm(model);
      if (act === 'track') trackModel(id);
      if (act === 'forward') viewForward(id);
      if (act === 'delete') deleteModel(id);
    });
  }

  async function init() {
    if (!window.api) { return; }
    try { if (api().loadTokens) api().loadTokens(); } catch (e) {}
    wire();
    await loadCatalog();
    loadModels();
    loadPublicTracked();
  }

  window.TMRModelBuilder = { init: init, runBacktest: runBacktest };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
