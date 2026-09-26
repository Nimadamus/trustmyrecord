/* PROFILE_EXPLORER_20260926 - the research explorer on a member's profile and
   on the per team page (/profile/team/).

   Reads GET /api/users/:username/explore?f=dim:bucket... and draws: summary
   cards, recent form, where the member performs best and weakest, charts, and
   one table per dimension. EVERY number opens the picks behind it through
   GET /api/users/:username/explore/picks with the same filters, so no figure on
   this panel is a dead end. Nothing here computes a record; it renders the
   server's numbers and asks the server for the bets behind them. */
(function () {
  'use strict';

  var API = (window.TMR_API_BASE || window.API_BASE_URL || 'https://trustmyrecord-api.onrender.com').replace(/\/$/, '');

  var SPORT_KEY_GROUP = [
    [/^baseball_mlb$/, 'mlb'], [/^baseball_npb$/, 'npb'], [/^americanfootball_nfl$/, 'nfl'],
    [/^americanfootball_ncaaf$/, 'ncaaf'], [/^basketball_nba_summer$/, 'nba_summer'], [/^basketball_nba$/, 'nba'],
    [/^basketball_wnba$/, 'wnba'], [/^basketball_ncaab$/, 'ncaab'], [/^icehockey_nhl$/, 'nhl'],
    [/^soccer/, 'soccer'], [/^tennis/, 'tennis'], [/^(mma|ufc|mixed_martial)/, 'mma'], [/^boxing/, 'boxing']
  ];

  function sportGroup(sportKey) {
    var k = String(sportKey || '').toLowerCase();
    for (var i = 0; i < SPORT_KEY_GROUP.length; i++) if (SPORT_KEY_GROUP[i][0].test(k)) return SPORT_KEY_GROUP[i][1];
    return k.split('_')[0] || 'other';
  }
  function slugify(v) {
    return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function teamPageUrl(username, sportKeyOrGroup, team, rel) {
    var g = /_/.test(sportKeyOrGroup) ? sportGroup(sportKeyOrGroup) : String(sportKeyOrGroup || '').toLowerCase();
    return '/profile/team/?user=' + encodeURIComponent(username) + '&sport=' + encodeURIComponent(g) +
      '&team=' + encodeURIComponent(slugify(team)) + (rel && rel !== 'team' ? '&rel=' + encodeURIComponent(rel) : '');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function authHeaders() {
    try { if (window.api && typeof window.api.getAuthHeaders === 'function') return window.api.getAuthHeaders() || {}; } catch (e) {}
    try {
      var keys = ['trustmyrecord_token', 'tmr_auth_token', 'accessToken', 'access_token', 'token', 'tmr_token'];
      for (var i = 0; i < keys.length; i++) {
        var t = localStorage.getItem(keys[i]);
        if (t) return { Authorization: 'Bearer ' + t };
      }
    } catch (e) {}
    return {};
  }
  function qs(filters, extra) {
    var parts = (filters || []).map(function (f) { return 'f=' + encodeURIComponent(f); });
    if (extra) Object.keys(extra).forEach(function (k) { parts.push(k + '=' + encodeURIComponent(extra[k])); });
    return parts.length ? '?' + parts.join('&') : '';
  }
  function getJson(url) {
    return fetch(url, { headers: authHeaders(), cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* ---- formatting ---- */
  function signed(n, d, suffix) {
    if (n == null || !isFinite(n)) return '—';
    var v = Number(n);
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d == null ? 2 : d) + (suffix || '');
  }
  function odds(n) {
    if (n == null || !isFinite(n) || Number(n) === 0) return '—';
    n = Math.round(Number(n));
    return n > 0 ? '+' + n : '−' + Math.abs(n);
  }
  function pct(n, d) { return n == null || !isFinite(n) ? '—' : Number(n).toFixed(d == null ? 1 : d) + '%'; }
  function cls(n) { return n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero'; }
  var SAMPLE_TEXT = { very_small: 'Very small sample', small: 'Small sample', moderate: 'Moderate sample', large: 'Large sample' };
  function fmtDate(iso) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric' });
  }
  function recordText(s) { return s.wins + '-' + s.losses + '-' + s.pushes; }

  var TIPS = {
    picks: 'Every settled pick in this selection: wins, losses and pushes.',
    win_rate: 'Wins divided by wins plus losses. Pushes are not decisions.',
    net: 'Units won minus units lost, exactly as each pick was graded.',
    roi: 'Net units divided by units risked. The risk on a favorite is the full stake (1.10u to win 1u at -110).',
    avg_odds: 'The average implied probability of the prices taken, converted back to American odds. Averaging the moneylines themselves would be wrong.',
    avg_stake: 'Average units actually risked per pick.',
    risked: 'Total units put at risk across the selection.',
    z: 'Odds adjusted Z-score: how far actual wins sit from the wins the prices implied, in standard deviations. Around +2 or better is unlikely to be luck alone; near 0 is what the prices expected. It already accounts for sample size.',
    clv: 'Closing line value: the de-vigged implied probability of the closing price minus the price taken, in percentage points. Positive means the member beat the market close. Counted only on picks with a verified close.',
    dd: 'Largest fall in cumulative units from a previous high, in the order picks settled.',
    streak: 'Consecutive wins or losses in settlement order. Pushes do not break a streak.',
    push: 'Share of picks that pushed.'
  };
  function tip(key) { return TIPS[key] ? ' <span class="tmre-tip" tabindex="0" title="' + esc(TIPS[key]) + '" aria-label="' + esc(TIPS[key]) + '">?</span>' : ''; }

  /* ---- group layout of the split tables ---- */
  var GROUPS = [
    { title: 'Teams', dims: ['team', 'vs', 'opponent', 'team_game'] },
    { title: 'Markets', dims: ['sport', 'market', 'bet_type', 'prop_type'] },
    { title: 'Game situation', dims: ['venue', 'role', 'ou', 'relation', 'season_type', 'rest', 'opp_sp_hand'] },
    { title: 'Price and number', dims: ['price', 'spread_range', 'total_range', 'line'] },
    { title: 'Starting pitchers', dims: ['own_sp', 'opp_sp'] },
    { title: 'Calendar', dims: ['season', 'month', 'dow', 'daypart'] },
    { title: 'Betting behavior', dims: ['timing', 'stake', 'prev_result', 'streak_state'] }
  ];
  var DIM_NOTES = {
    team: 'The club the pick was on: moneyline, spread and team totals, any segment. Click a team name for its full page.',
    opponent: 'The club bet against. Moneyline and spread only; a total puts nobody on the other side of the ticket.',
    vs: 'The other club in the game, for every pick on this team.',
    role: 'Moneyline by the price, spread by the points. A price on a spread is juice, not a role.',
    prev_result: 'The member’s most recent settled result at the moment this pick was locked, across the whole record.',
    streak_state: 'The run the member was on when this pick was locked, across the whole record.',
    relation: 'Division and conference alignment for the 2026 season.',
    season_type: 'From the official MLB schedule.',
    opp_sp_hand: 'The opposing club’s actual starting pitcher, from the MLB box score.',
    own_sp: 'This club’s actual starting pitcher, from the MLB box score.',
    opp_sp: 'The opposing starting pitcher, from the MLB box score.',
    rest: 'Days since this club’s previous game.',
    timing: 'How long before the start the pick was locked.',
    daypart: 'Start time on the Eastern clock.'
  };
  var OPEN_BY_DEFAULT = { Teams: true, Markets: true, 'Game situation': true };

  /* ======================================================================
     The explorer
     ====================================================================== */
  function Explorer(root, opts) {
    this.root = root;
    this.username = opts.username;
    this.mode = opts.mode || 'profile';          // 'profile' | 'team'
    this.base = opts.filters || [];              // fixed scope (team page)
    this.sport = opts.sport || '';
    this.market = opts.market || '';
    this.syncUrl = !!opts.syncUrl;
    this.onData = opts.onData || null;
    this.onError = opts.onError || null;
    this.seq = 0;
    this.picksModal = null;
    var self = this;
    root.addEventListener('click', function (e) { self.handleClick(e); });
    root.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.hasAttribute && e.target.hasAttribute('data-tmre-f')) {
        e.preventDefault(); self.handleClick(e);
      }
    });
  }

  Explorer.prototype.filters = function () {
    var f = this.base.slice();
    if (this.sport) f.push('sport:' + this.sport);
    if (this.market) f.push('market:' + this.market);
    return f;
  };

  Explorer.prototype.load = function () {
    var self = this;
    var my = ++this.seq;
    this.root.classList.add('tmre-loading');
    var url = API + '/api/users/' + encodeURIComponent(this.username) + '/explore' + qs(this.filters());
    return getJson(url).then(function (data) {
      if (my !== self.seq) return;
      self.data = data;
      self.render();
      if (self.onData) self.onData(data);
    }).catch(function (err) {
      if (my !== self.seq) return;
      self.root.innerHTML = '';
      self.root.hidden = true;
      if (self.onError) self.onError(err);
    }).then(function () { self.root.classList.remove('tmre-loading'); });
  };

  Explorer.prototype.setScope = function (sport, market) {
    this.sport = sport || '';
    this.market = market || '';
    if (this.syncUrl) {
      try {
        var u = new URL(window.location.href);
        if (this.sport) u.searchParams.set('xs', this.sport); else u.searchParams.delete('xs');
        if (this.market) u.searchParams.set('xm', this.market); else u.searchParams.delete('xm');
        history.replaceState(history.state, '', u.toString());
      } catch (e) {}
    }
    return this.load();
  };

  Explorer.prototype.cellAttrs = function (filters, title, extraCls) {
    return ' class="tmrx-drillable' + (extraCls ? ' ' + extraCls : '') + '" data-tmre-f="' + esc(JSON.stringify(filters)) +
      '" data-tmre-title="' + esc(title) + '" tabindex="0" role="button" title="' + esc('Open every pick behind ' + title) + '"';
  };

  Explorer.prototype.scopeTitle = function () {
    var d = this.data;
    var parts = (d.scope.labels || []).map(function (l) { return l.buckets.map(function (b) { return b.label; }).join(' or '); });
    return parts.length ? parts.join(' · ') : 'Entire record';
  };

  /* Every block below is built from the profile's own .tmrx components
     (section, ribbon/cell, sport pills, table shell, table, grid-2), so the
     explorer reads exactly like the rest of the profile. */
  function section(title, sub, body, extra) {
    return '<div class="tmrx-section tmre-sec">' +
      '<div class="tmrx-section-head"><div><div class="tmrx-section-title">' + title + '</div>' +
      (sub ? '<div class="tmrx-section-sub">' + sub + '</div>' : '') + '</div>' + (extra || '') + '</div>' + body + '</div>';
  }
  function tableHtml(head, rows) {
    return '<div class="tmrx-table-shell"><table class="tmrx-table"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  Explorer.prototype.render = function () {
    var d = this.data;
    this.root.hidden = false;
    var h = '';
    if (this.mode === 'profile') h += this.renderPickers();
    if (!d.summary.picks) {
      h += '<div class="tmrx-section-sub">No settled picks in this selection.</div>';
      this.root.innerHTML = h;
      return;
    }
    h += this.renderSummary();
    h += this.renderRecent();
    h += this.renderAreas();
    h += '<div data-tmre-charts></div>';
    h += this.renderSplits();
    this.root.innerHTML = h;
    this.renderCharts(this.root.querySelector('[data-tmre-charts]'));
  };

  Explorer.prototype.renderPickers = function () {
    var d = this.data, self = this;
    function pill(attr, value, label, n, on) {
      return '<button type="button" class="tmrx-sport-pill' + (on ? ' is-active' : '') + '" role="tab" aria-selected="' + (on ? 'true' : 'false') + '" ' + attr + '="' + esc(value) + '">' +
        esc(label) + (n != null ? '<span class="tmrx-sport-pill-count">' + n + '</span>' : '') + '</button>';
    }
    var sports = pill('data-tmre-sport', '', 'All sports', null, !self.sport) +
      d.available.sports.map(function (s) { return pill('data-tmre-sport', s.id, s.label, s.picks, self.sport === s.id); }).join('');
    var markets = pill('data-tmre-market', '', 'Overall', null, !self.market) +
      d.available.markets.map(function (m) { return pill('data-tmre-market', m.id, m.label, m.picks, self.market === m.id); }).join('');
    return section('Research Explorer', 'Pick a sport and a market to see this verified record for exactly that combination: NFL spreads, MLB moneylines, NCAAF totals. Every figure opens the graded picks that produced it.',
      '<div class="tmrx-meta tmre-picker-label">SPORT</div><div class="tmrx-sport-picker" role="tablist" aria-label="Sport">' + sports + '</div>' +
      '<div class="tmrx-meta tmre-picker-label">MARKET</div><div class="tmrx-sport-picker" role="tablist" aria-label="Market">' + markets + '</div>');
  };

  Explorer.prototype.renderSummary = function () {
    var d = this.data, s = d.summary, st = d.streaks, dd = d.drawdown, c = d.clv, self = this;
    var dec = s.wins + s.losses;
    var scope = this.filters(), title = this.scopeTitle();
    var curr = st.current > 0 ? 'W' + st.current : st.current < 0 ? 'L' + Math.abs(st.current) : '—';
    function tone(n) { return n > 0 ? ' is-pos' : n < 0 ? ' is-neg' : ''; }
    function cell(label, value, toneCls, tipKey, sub, drill) {
      var open = drill ? '<div' + self.cellAttrs(scope, title, 'tmrx-cell') + '>' : '<div class="tmrx-cell">';
      return open + '<div class="tmrx-label">' + label + tip(tipKey) + '</div>' +
        '<div class="tmrx-value' + (toneCls || '') + '">' + value + '</div>' + (sub ? '<div class="tmrx-sub">' + sub + '</div>' : '') + '</div>';
    }
    var cells = [
      cell('Picks', s.picks, '', 'picks', esc(SAMPLE_TEXT[s.sample]) + ' · ' + dec + ' decided', true),
      cell('Record', recordText(s), '', null, pct(s.win_rate) + ' win rate', true),
      cell('Net units', signed(s.net_units, 2, 'u'), tone(s.net_units), 'net', '+' + s.units_won.toFixed(2) + 'u won, ' + signed(s.units_lost, 2, 'u') + ' lost', true),
      cell('ROI', signed(s.roi, 1, '%'), tone(s.roi), 'roi', s.units_risked.toFixed(2) + 'u risked', true),
      cell('Avg odds', odds(s.avg_odds), '', 'avg_odds', 'Avg risk ' + (s.avg_stake == null ? '—' : s.avg_stake.toFixed(2) + 'u'), true),
      cell('Push rate', pct(s.push_rate), '', 'push', s.pushes + ' pushes', true),
      cell('Current streak', curr, st.current > 0 ? ' is-pos' : st.current < 0 ? ' is-neg' : '', 'streak',
        'Longest W' + (st.longest_win || 0) + ' · Longest L' + (st.longest_loss || 0)),
      cell('Max drawdown', dd.max_drawdown ? '−' + dd.max_drawdown.toFixed(2) + 'u' : '0.00u', dd.max_drawdown ? ' is-neg' : '', 'dd',
        dd.current_drawdown ? 'Now ' + dd.current_drawdown.toFixed(2) + 'u below the high' : 'At the high'),
      cell('Z-score', s.z_score == null ? '—' : signed(s.z_score, 2), s.z_score == null ? '' : tone(s.z_score), 'z',
        s.expected_wins == null ? 'Needs 5+ decisions' : s.wins + ' wins vs ' + s.expected_wins.toFixed(1) + ' expected')
    ];
    if (c && c.sample_size) {
      cells.push(cell('Avg CLV', signed(c.avg_clv_novig, 2, ' pts'), tone(c.avg_clv_novig), 'clv',
        'Beat the close ' + pct(c.beat_close_rate_novig) + ' of ' + c.sample_size));
    }
    return section(esc(title), s.picks + ' settled picks. Click any number to open the picks behind it.',
      '<div class="tmrx-ribbon">' + cells.join('') + '</div>');
  };

  function statCells(s) {
    return '<td class="num">' + s.picks + '</td>' +
      '<td class="num">' + recordText(s) + '</td>' +
      '<td class="num ' + (s.win_rate == null ? 'zero' : s.win_rate >= 50 ? 'pos' : 'neg') + '">' + pct(s.win_rate) + '</td>' +
      '<td class="num">' + odds(s.avg_odds) + '</td>' +
      '<td class="num ' + cls(s.net_units) + '">' + signed(s.net_units, 2, 'u') + '</td>' +
      '<td class="num ' + cls(s.roi) + '">' + signed(s.roi, 2, '%') + '</td>';
  }
  var STAT_HEAD = '<th class="num">Picks</th><th class="num">W-L-P</th><th class="num">Win %</th><th class="num">Avg Odds</th><th class="num">Net</th><th class="num">ROI</th>';

  Explorer.prototype.renderRecent = function () {
    var r = this.data.recent, self = this;
    if (this.data.summary.picks < 5) return '';
    var rows = [['last_5', 'Last 5'], ['last_10', 'Last 10'], ['last_25', 'Last 25'], ['last_50', 'Last 50'], ['lifetime', 'Lifetime']]
      .filter(function (x) { return r[x[0]]; })
      .map(function (x) {
        var n = x[0] === 'lifetime' ? 0 : Number(x[0].split('_')[1]);
        return '<tr' + self.cellAttrs(self.filters(), self.scopeTitle() + (n ? ' · ' + x[1] : '')) + (n ? ' data-tmre-last="' + n + '"' : '') + '>' +
          '<td class="name">' + x[1] + '</td>' + statCells(r[x[0]]) + '</tr>';
      }).join('');
    return section('Recent Form', 'The most recent settled picks in this selection, in settlement order.',
      tableHtml('<th>Window</th>' + STAT_HEAD, rows));
  };

  Explorer.prototype.renderAreas = function () {
    var a = this.data.areas, self = this;
    if (!a || (!a.best.length && !a.weakest.length)) return '';
    function rows(cards) {
      return cards.map(function (c) {
        return '<tr' + self.cellAttrs(c.filters, c.label) + '><td class="name">' + esc(c.label) +
          '<div class="tmrx-sub">' + esc(SAMPLE_TEXT[c.sample]) + ' · Z ' + signed(c.z_score, 2) + '</div></td>' +
          '<td class="num">' + c.picks + '</td><td class="num">' + recordText(c) + '</td>' +
          '<td class="num ' + cls(c.net_units) + '">' + signed(c.net_units, 2, 'u') + '</td>' +
          '<td class="num ' + cls(c.roi) + '">' + signed(c.roi, 2, '%') + '</td></tr>';
      }).join('');
    }
    var head = '<th>Area</th><th class="num">Picks</th><th class="num">W-L-P</th><th class="num">Net</th><th class="num">ROI</th>';
    var parts = [];
    if (a.best.length) parts.push('<div><div class="tmrx-section-head"><div><div class="tmrx-section-title">Where This Handicapper Performs Best</div>' +
      '<div class="tmrx-section-sub">Positive net units, at least ' + a.min_decisions + ' decided picks, ranked by odds adjusted Z-score' + tip('z') + '.</div></div></div>' + tableHtml(head, rows(a.best)) + '</div>');
    if (a.weakest.length) parts.push('<div><div class="tmrx-section-head"><div><div class="tmrx-section-title">Areas of Weaker Historical Performance</div>' +
      '<div class="tmrx-section-sub">Negative net units, at least ' + a.min_decisions + ' decided picks, ranked the same way.</div></div></div>' + tableHtml(head, rows(a.weakest)) + '</div>');
    return '<div class="tmrx-section tmre-sec"><div class="' + (parts.length > 1 ? 'tmrx-grid-2' : '') + '">' + parts.join('') + '</div></div>';
  };

  Explorer.prototype.renderSplits = function () {
    var sp = this.data.splits || {}, self = this, out = '';
    GROUPS.forEach(function (g) {
      var dims = g.dims.filter(function (dim) { return sp[dim] && sp[dim].cells.length; });
      if (!dims.length) return;
      var wide = dims.filter(function (dim) { return sp[dim].cells.length > 6 || dim === 'team' || dim === 'vs' || dim === 'opponent'; });
      var small = dims.filter(function (dim) { return wide.indexOf(dim) < 0; });
      var body = wide.map(function (dim) { return self.renderTable(dim, sp[dim]); }).join('');
      for (var i = 0; i < small.length; i += 2) {
        body += '<div class="tmrx-grid-2 tmre-grid">' + self.renderTable(small[i], sp[small[i]]) +
          (small[i + 1] ? self.renderTable(small[i + 1], sp[small[i + 1]]) : '<div></div>') + '</div>';
      }
      out += section(esc(g.title), '', body);
    });
    return out;
  };

  Explorer.prototype.renderTable = function (dim, table) {
    var self = this;
    var isTeam = dim === 'team' || dim === 'vs' || dim === 'opponent' || dim === 'team_game';
    var LIMIT = 12;
    var rows = table.cells.map(function (c, i) {
      var dec = c.wins + c.losses;
      var label = esc(c.label);
      if (isTeam) {
        var logo = (window.TMRTeamLogo && typeof window.TMRTeamLogo.html === 'function')
          ? window.TMRTeamLogo.html(c.label, { className: 'tmrx-tl' }) : '';
        var href = teamPageUrl(self.username, String(c.bucket).split('|')[0], c.label);
        label = '<span class="tmr-tl-row">' + logo + '<a class="tmr-tl-row-name tmrx-team-page-link" href="' + esc(href) + '">' + esc(c.label) + '</a></span>';
      }
      var attrs = self.cellAttrs(self.filters().concat([dim + ':' + c.bucket]), self.scopeTitle() + ' · ' + c.label, i >= LIMIT ? 'tmre-extra' : '');
      return '<tr' + attrs + (i >= LIMIT ? ' hidden' : '') + '><td class="name">' + label +
        (dec < 10 ? ' <span class="tmrx-meta" title="Fewer than 10 decided picks">small sample</span>' : '') + '</td>' + statCells(c) + '</tr>';
    }).join('');
    var more = table.cells.length > LIMIT
      ? '<div class="tmrx-more-row"><button type="button" class="tmrx-more-btn" data-tmre-more>Show all ' + table.cells.length + '</button></div>' : '';
    return '<div class="tmre-split"><div class="tmrx-section-head"><div><div class="tmrx-section-title tmre-split-title">' + esc(table.label) + '</div>' +
      (DIM_NOTES[dim] ? '<div class="tmrx-section-sub">' + esc(DIM_NOTES[dim]) + '</div>' : '') + '</div></div>' +
      tableHtml('<th>' + esc(table.label) + '</th>' + STAT_HEAD, rows) + more + '</div>';
  };

  /* ---- charts: the profile's equity curve style, one series each ---- */
  Explorer.prototype.renderCharts = function (host) {
    if (!host) return;
    var pts = (this.data.series && this.data.series.points) || [];
    if (pts.length < 5) { host.remove(); return; }
    var win = this.data.series.window;
    var charts = [
      { key: 'units', title: 'Cumulative Units', fmt: function (v) { return signed(v, 2, 'u'); }, zero: true, fill: true },
      { key: 'drawdown', title: 'Drawdown', fmt: function (v) { return signed(v, 2, 'u'); }, zero: true, neg: true, fill: true },
      { key: 'roll_win_rate', title: 'Win Rate, Rolling ' + win, fmt: function (v) { return pct(v); }, ref: 50 },
      { key: 'roll_roi', title: 'ROI, Rolling ' + win, fmt: function (v) { return signed(v, 1, '%'); }, zero: true },
      { key: 'clv_avg', title: 'Average CLV Over Time', fmt: function (v) { return signed(v, 2, ' pts'); }, zero: true }
    ].filter(function (c) { return pts.filter(function (p) { return p[c.key] != null; }).length >= 3; });
    var figs = charts.map(function (c) {
      return '<div class="tmre-chart" data-tmre-chart="' + c.key + '"><div class="tmrx-section-head"><div><div class="tmrx-section-title tmre-split-title">' + esc(c.title) + '</div>' +
        '<div class="tmrx-section-sub tmre-chart-read" aria-live="polite"></div></div></div>' +
        '<div class="tmrx-table-shell"><div class="tmrx-equity-wrap tmre-chart-svg"></div></div></div>';
    });
    var body = '';
    for (var i = 0; i < figs.length; i += 2) body += '<div class="tmrx-grid-2 tmre-grid">' + figs[i] + (figs[i + 1] || '<div></div>') + '</div>';
    host.innerHTML = section('Performance Over Time', 'Each point is a real position in the ledger, in settlement order. Hover or tap a chart to read it.',
      body + this.renderMarketMonths());
    charts.forEach(function (c) {
      var fig = host.querySelector('[data-tmre-chart="' + c.key + '"]');
      if (fig) drawLine(fig, pts, c);
    });
  };

  Explorer.prototype.renderMarketMonths = function () {
    var mm = this.data.market_months || [];
    var months = {};
    mm.forEach(function (m) { m.months.forEach(function (x) { months[x.month] = 1; }); });
    var cols = Object.keys(months).sort();
    if (!mm.length || cols.length < 2) return '';
    var self = this;
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var head = '<th>Market</th>' + cols.map(function (c) { return '<th class="num">' + MON[Number(c.slice(5)) - 1] + ' ' + c.slice(2, 4) + '</th>'; }).join('');
    var body = mm.map(function (m) {
      var by = {};
      m.months.forEach(function (x) { by[x.month] = x; });
      return '<tr><td class="name">' + esc(m.label) + '</td>' + cols.map(function (c) {
        var x = by[c];
        if (!x) return '<td class="num zero">·</td>';
        var f = self.filters().concat(self.market ? [] : ['market:' + m.id]).concat(['month:' + c]);
        return '<td' + self.cellAttrs(f, self.scopeTitle() + ' · ' + m.label + ' · ' + c, 'num ' + cls(x.net_units)) + '>' + signed(x.net_units, 1) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<div class="tmre-split"><div class="tmrx-section-head"><div><div class="tmrx-section-title tmre-split-title">Market Type by Month</div>' +
      '<div class="tmrx-section-sub">Net units by month of the game (Eastern time). Click a month to open its picks.</div></div></div>' + tableHtml(head, body) + '</div>';
  };

  function drawLine(fig, pts, c) {
    var data = pts.filter(function (p) { return p[c.key] != null; });
    var W = 720, H = 200, L = 52, R = 8, T = 10, B = 20;
    var xs = data.map(function (p) { return p.i; });
    var ys = data.map(function (p) { return p[c.key]; });
    var minX = xs[0], maxX = xs[xs.length - 1];
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    if (c.zero) { minY = Math.min(minY, 0); maxY = Math.max(maxY, 0); }
    if (c.ref != null) { minY = Math.min(minY, c.ref); maxY = Math.max(maxY, c.ref); }
    if (maxY === minY) { maxY += 1; minY -= 1; }
    var pad = (maxY - minY) * 0.08; maxY += pad; minY -= pad;
    function X(v) { return L + (maxX === minX ? 0 : (v - minX) / (maxX - minX)) * (W - L - R); }
    function Y(v) { return T + (1 - (v - minY) / (maxY - minY)) * (H - T - B); }
    var path = data.map(function (p, i) { return (i ? 'L' : 'M') + X(p.i).toFixed(1) + ' ' + Y(p[c.key]).toFixed(1); }).join('');
    var last = ys[ys.length - 1];
    var good = c.neg ? false : (c.ref != null ? last >= c.ref : last >= 0);
    var stroke = good ? '#4DA3FF' : '#fca5a5';
    var fillTop = good ? 'rgba(77, 163, 255,0.40)' : 'rgba(252,165,165,0.30)';
    var gid = 'tmreG' + c.key + Math.random().toString(36).slice(2, 7);
    var guides = [maxY - pad, minY + pad].map(function (t) {
      return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '" stroke="#1F3350" stroke-dasharray="4 4"/>' +
        '<text x="' + (L - 6) + '" y="' + (Y(t) + 4).toFixed(1) + '" fill="#9BA7B8" font-size="11" font-weight="700" text-anchor="end">' + esc(c.fmt(t).replace(/ pts$/, '')) + '</text>';
    }).join('');
    var zeroY = Y(c.ref != null ? c.ref : 0).toFixed(1);
    var ref = '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + zeroY + '" y2="' + zeroY + '" stroke="rgba(148,163,184,0.32)" stroke-dasharray="3 4"/>';
    var fill = c.fill ? '<path d="' + path + ' L' + X(maxX).toFixed(1) + ' ' + zeroY + ' L' + X(minX).toFixed(1) + ' ' + zeroY + ' Z" fill="url(#' + gid + ')" stroke="none"/>' : '';
    var svg = '<svg class="tmrx-equity-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(c.title) + '">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + fillTop + '"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></linearGradient></defs>' +
      guides + ref + fill + '<path d="' + path + '" fill="none" stroke="' + stroke + '" stroke-width="2.4" vector-effect="non-scaling-stroke"/>' +
      '<line class="tmre-cross" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '" stroke="rgba(219,229,244,.35)" vector-effect="non-scaling-stroke" style="display:none"/>' +
      '<circle class="tmre-dot" r="4" fill="' + stroke + '" stroke="#0a1322" stroke-width="2" style="display:none"/>' +
      '<rect x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + '" fill="transparent"/></svg>';
    var box = fig.querySelector('.tmre-chart-svg');
    box.innerHTML = svg;
    var read = fig.querySelector('.tmre-chart-read');
    var el = box.querySelector('svg');
    var cross = el.querySelector('.tmre-cross'), dot = el.querySelector('.tmre-dot');
    function show(p) {
      read.textContent = c.fmt(p[c.key]) + ' at pick ' + p.i + ' · ' + fmtDate(p.t);
      cross.setAttribute('x1', X(p.i)); cross.setAttribute('x2', X(p.i)); cross.style.display = '';
      dot.setAttribute('cx', X(p.i)); dot.setAttribute('cy', Y(p[c.key])); dot.style.display = '';
    }
    function hide() { read.textContent = 'Now ' + c.fmt(last) + ' · picks ' + minX + ' to ' + maxX; cross.style.display = 'none'; dot.style.display = 'none'; }
    function move(ev) {
      var r = el.getBoundingClientRect();
      var cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
      var target = minX + (cx - L) / (W - L - R) * (maxX - minX);
      var best = data[0];
      for (var i = 0; i < data.length; i++) if (Math.abs(data[i].i - target) < Math.abs(best.i - target)) best = data[i];
      show(best);
    }
    el.addEventListener('mousemove', move);
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('mouseleave', hide);
    hide();
  }

  /* ---- clicks ---- */
  Explorer.prototype.handleClick = function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('a')) return;               // team links navigate
    var sp = t.closest('[data-tmre-sport]');
    if (sp) { this.setScope(sp.getAttribute('data-tmre-sport'), ''); return; }
    var mk = t.closest('[data-tmre-market]');
    if (mk) { this.setScope(this.sport, mk.getAttribute('data-tmre-market')); return; }
    var more = t.closest('[data-tmre-more]');
    if (more) {
      var split = more.closest('.tmre-split');
      if (split) split.querySelectorAll('tr.tmre-extra').forEach(function (tr) { tr.hidden = false; });
      more.parentNode.remove();
      return;
    }
    if (t.closest('.tmre-tip')) return;
    var cell = t.closest('[data-tmre-f]');
    if (cell) {
      var filters = JSON.parse(cell.getAttribute('data-tmre-f'));
      var last = Number(cell.getAttribute('data-tmre-last')) || 0;
      openPicks(this.username, filters, cell.getAttribute('data-tmre-title'), last);
    }
  };

  /* ======================================================================
     Picks modal: the bets behind any number
     ====================================================================== */
  var modal = null;
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'tmre-modal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = '<div class="tmre-modal-back" data-tmre-close></div><div class="tmre-modal-box tmrx-stats">' +
      '<div class="tmre-modal-head tmrx-section-head"><div><div class="tmrx-meta">THE PICKS BEHIND THIS NUMBER</div><div class="tmrx-section-title tmre-modal-title"></div></div>' +
      '<button type="button" class="tmre-modal-x" data-tmre-close aria-label="Close">×</button></div>' +
      '<div class="tmre-modal-sum tmrx-section-sub"></div><div class="tmre-modal-body"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-tmre-close]')) closeModal();
      var m = e.target.closest('[data-tmre-page]');
      if (m) loadPage(Number(m.getAttribute('data-tmre-page')));
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal && !modal.hidden) closeModal(); });
    return modal;
  }
  function closeModal() { modal.hidden = true; document.body.classList.remove('tmre-modal-open'); }
  var cur = null;
  function openPicks(username, filters, title, lastN) {
    ensureModal();
    cur = { username: username, filters: filters, lastN: lastN, rows: [] };
    modal.querySelector('.tmre-modal-title').textContent = title;
    modal.querySelector('.tmre-modal-sum').innerHTML = '';
    modal.querySelector('.tmre-modal-body').innerHTML = '<div class="tmre-modal-loading">Loading picks…</div>';
    modal.hidden = false;
    document.body.classList.add('tmre-modal-open');
    loadPage(0);
  }
  function loadPage(offset) {
    var c = cur;
    /* "Last N" is a slice of the selection's ledger order. The newest-first
       list's first N rows are exactly those picks. */
    var extra = { sort: 'newest', limit: 250, offset: offset };
    if (c.lastN) extra.last = c.lastN;
    var url = API + '/api/users/' + encodeURIComponent(c.username) + '/explore/picks' + qs(c.filters, extra);
    getJson(url).then(function (d) {
      if (c !== cur) return;
      c.rows = offset ? c.rows.concat(d.picks) : d.picks;
      var s = d.summary;
      var sumHtml = '<span><b>' + s.picks + '</b> picks</span><span><b>' + recordText(s) + '</b></span><span>' + pct(s.win_rate) + ' win</span>' +
          '<span class="' + cls(s.net_units) + '"><b>' + signed(s.net_units, 2, 'u') + '</b></span><span class="' + cls(s.roi) + '">' + signed(s.roi, 1, '% ROI') + '</span>' +
          '<span>' + s.units_risked.toFixed(2) + 'u risked</span><span>Avg ' + odds(s.avg_odds) + '</span>' +
          (s.avg_clv != null ? '<span>CLV ' + signed(s.avg_clv, 2, ' pts') + ' (' + s.clv_sample + ')</span>' : '');
      modal.querySelector('.tmre-modal-sum').innerHTML = sumHtml;
      var rows = c.rows.map(function (p) {
        var res = p.result === 'won' ? 'W' : p.result === 'lost' ? 'L' : 'P';
        return '<tr>' +
          '<td>' + esc(fmtDate(p.date)) + '</td>' +
          '<td>' + esc(p.sport) + '</td>' +
          '<td>' + esc(p.team || '—') + '</td>' +
          '<td>' + esc(p.opponent || (p.matchup || '—')) + '</td>' +
          '<td>' + (p.venue === 'home' ? 'Home' : p.venue === 'away' ? 'Away' : '—') + '</td>' +
          '<td>' + esc(p.market) + '</td>' +
          '<td class="tmre-sel">' + esc(p.selection) + (p.starters ? '<div class="tmrx-sub">SP ' + esc(p.starters.own || '?') + ' vs ' + esc(p.starters.opp || '?') + '</div>' : '') +
            (p.final_score ? '<div class="tmrx-sub">Final: ' + esc(p.final_score) + '</div>' : '') + '</td>' +
          '<td class="num">' + (p.line == null ? '—' : (p.line > 0 && /spread|run|puck/i.test(p.market) ? '+' : '') + p.line) + '</td>' +
          '<td class="num">' + odds(p.odds) + '</td>' +
          '<td class="num">' + p.risk_units.toFixed(2) + 'u</td>' +
          '<td class="num ' + (res === 'W' ? 'pos' : res === 'L' ? 'neg' : 'zero') + '"><b>' + res + '</b></td>' +
          '<td class="num ' + cls(p.result_units) + '">' + signed(p.result_units, 2, 'u') + '</td>' +
          '<td class="num">' + (p.closing_odds == null ? '—' : (p.closing_line != null ? p.closing_line + ' ' : '') + odds(p.closing_odds)) + '</td>' +
          '<td class="num ' + (p.clv == null ? '' : cls(p.clv)) + '">' + (p.clv == null ? '—' : signed(p.clv, 2)) + '</td>' +
          '</tr>';
      }).join('');
      var more = (c.rows.length < d.total)
        ? '<div class="tmrx-more-row"><button type="button" class="tmrx-more-btn" data-tmre-page="' + c.rows.length + '">Load more (' + (d.total - c.rows.length) + ' left)</button></div>' : '';
      modal.querySelector('.tmre-modal-body').innerHTML = '<div class="tmrx-table-shell"><table class="tmrx-table tmre-picks"><thead><tr>' +
        '<th>Date (PT)</th><th>Sport</th><th>Team</th><th>Opponent</th><th>H/A</th><th>Market</th><th>Selection</th><th class="num">Line</th>' +
        '<th class="num">Odds</th><th class="num">Risk</th><th class="num">Result</th><th class="num">Units</th><th class="num">Close</th><th class="num">CLV</th>' +
        '</tr></thead><tbody>' + (rows || '<tr><td colspan="14">No picks.</td></tr>') + '</tbody></table></div>' + more;
    }).catch(function () {
      if (c !== cur) return;
      modal.querySelector('.tmre-modal-body').innerHTML = '<div class="tmre-modal-loading">Could not load these picks. Try again.</div>';
    });
  }

  window.TMRExplore = {
    mount: function (root, opts) { var x = new Explorer(root, opts); x.load(); return x; },
    teamPageUrl: teamPageUrl,
    sportGroup: sportGroup,
    slugify: slugify,
    openPicks: openPicks
  };
})();
