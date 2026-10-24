/* TMR_ULTIMATE_20261024 -- draws a Performance Intelligence report.
   One renderer for both places a report appears:
     /ultimate/         the public Joe Public demo (fictional data, computed in the browser)
     /ultimate/report/  a member's own report from GET /api/ultimate/intelligence
   It only draws what the engine (tmr-performance-intelligence.js) returned and never
   adds a claim of its own. */
(function () {
  'use strict';

  var MINUS = '−';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sign(x, txt) { return (x > 0 ? '+' : x < 0 ? MINUS : '') + txt; }
  function fu(x) { return sign(x, Math.abs(x).toFixed(1) + 'u'); }
  function fp(x, d) { return sign(x, Math.abs(x * 100).toFixed(d == null ? 1 : d) + '%'); }
  function pc(x, d) { return x == null ? 'n/a' : (x * 100).toFixed(d == null ? 0 : d) + '%'; }
  function odds(o) { return o > 0 ? '+' + o : MINUS + Math.abs(o); }
  function tone(x) { return x > 0 ? 'is-pos' : x < 0 ? 'is-neg' : ''; }
  function rec(s) { return s.w + '-' + s.l + (s.p ? '-' + s.p : ''); }
  function chip(v) { return '<span class="ult-chip ult-chip--' + esc(v.tone) + '">' + esc(v.label) + '</span>'; }
  function fmtDate(d) {
    var t = new Date(d + 'T12:00:00Z');
    return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  function fmtMonth(k) {
    var t = new Date(k + '-15T12:00:00Z');
    return t.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  /* Engine strings use ASCII hyphen-minus for negatives; show a true minus. */
  function prose(s) { return esc(s).replace(/(^|[\s(])-(\d)/g, '$1' + MINUS + '$2'); }

  /* ------------------------------------------------------------ profile */
  function tiles(o) {
    var t = [
      ['Total picks', String(o.n), ''],
      ['Record', rec(o), ''],
      ['Net units', fu(o.net), tone(o.net)],
      ['ROI', fp(o.roi), tone(o.roi)],
      ['Units risked', o.risked.toFixed(1), ''],
      ['Win rate', pc(o.win_pct, 1), ''],
    ];
    return '<div class="ult-tiles">' + t.map(function (x) {
      return '<div class="ult-tile"><span>' + x[0] + '</span><b class="' + x[2] + '">' + esc(x[1]) + '</b></div>';
    }).join('') + '</div>';
  }

  function lineChart(el, monthly) {
    var w = Math.max(280, el.clientWidth || 640), h = w < 520 ? 210 : 250;
    var pad = { l: 44, r: 14, t: 16, b: 30 };
    var vals = monthly.map(function (m) { return m.cumulative; });
    var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
    var step = (hi - lo) > 40 ? 20 : 10;
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    var X = function (i) { return pad.l + (monthly.length < 2 ? 0 : i * (w - pad.l - pad.r) / (monthly.length - 1)); };
    var Y = function (v) { return pad.t + (hi - v) * (h - pad.t - pad.b) / ((hi - lo) || 1); };
    var g = '';
    for (var v = lo; v <= hi; v += step) {
      g += '<line x1="' + pad.l + '" x2="' + (w - pad.r) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" class="' + (v === 0 ? 'ult-ax0' : 'ult-grid') + '"/>' +
        '<text x="' + (pad.l - 8) + '" y="' + (Y(v) + 4) + '" class="ult-tick" text-anchor="end">' + (v > 0 ? '+' : v < 0 ? MINUS : '') + Math.abs(v) + 'u</text>';
    }
    /* One label per ~64px of plot, and none crowding the end label. */
    var every = Math.max(1, Math.ceil(monthly.length * 64 / (w - pad.l - pad.r)));
    monthly.forEach(function (m, i) {
      var lastI = i === monthly.length - 1;
      if ((i % every === 0 && monthly.length - 1 - i >= every / 2) || lastI) g += '<text x="' + X(i) + '" y="' + (h - 8) + '" class="ult-tick" text-anchor="' + (lastI ? 'end' : i === 0 ? 'start' : 'middle') + '">' + esc(fmtMonth(m.key).replace(' 20', " '")) + '</text>';
    });
    var path = monthly.map(function (m, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(m.cumulative).toFixed(1); }).join(' ');
    var area = path + ' L' + X(monthly.length - 1).toFixed(1) + ' ' + Y(0) + ' L' + X(0).toFixed(1) + ' ' + Y(0) + ' Z';
    var last = monthly[monthly.length - 1];
    el.innerHTML = '<svg width="' + w + '" height="' + h + '" role="img" aria-label="Cumulative units by month, ending at ' + esc(fu(last.cumulative)) + '">' + g +
      '<path d="' + area + '" class="ult-area"/><path d="' + path + '" class="ult-line"/>' +
      '<circle cx="' + X(monthly.length - 1) + '" cy="' + Y(last.cumulative) + '" r="4.5" class="ult-dot"/>' +
      '<text x="' + (X(monthly.length - 1) - 8) + '" y="' + (Y(last.cumulative) - 10) + '" class="ult-endlabel" text-anchor="end">' + esc(fu(last.cumulative)) + '</text>' +
      '<line class="ult-cross" y1="' + pad.t + '" y2="' + (h - pad.b) + '" x1="0" x2="0" visibility="hidden"/>' +
      '<circle class="ult-hdot" r="5" visibility="hidden"/>' +
      '<rect x="' + pad.l + '" y="0" width="' + (w - pad.l - pad.r) + '" height="' + h + '" fill="transparent" class="ult-hit"/></svg>' +
      '<div class="ult-tip" hidden></div>';
    var svg = el.querySelector('svg'), tip = el.querySelector('.ult-tip'), cross = el.querySelector('.ult-cross'), hd = el.querySelector('.ult-hdot');
    function show(evt) {
      var r = svg.getBoundingClientRect();
      var cx = (evt.touches ? evt.touches[0].clientX : evt.clientX) - r.left;
      var i = Math.round((cx - pad.l) / ((w - pad.l - pad.r) / Math.max(1, monthly.length - 1)));
      i = Math.max(0, Math.min(monthly.length - 1, i));
      var m = monthly[i];
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
      hd.setAttribute('cx', X(i)); hd.setAttribute('cy', Y(m.cumulative)); hd.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.innerHTML = '<b>' + esc(fmtMonth(m.key)) + '</b><span>Month <i class="' + tone(m.net) + '">' + esc(fu(m.net)) + '</i> over ' + m.n + ' picks</span><span>Running total <i>' + esc(fu(m.cumulative)) + '</i></span>';
      var left = X(i) + 12; if (left + 190 > w) left = X(i) - 202;
      tip.style.left = Math.max(0, left) + 'px'; tip.style.top = Math.max(0, Y(m.cumulative) - 30) + 'px';
    }
    function hide() { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); hd.setAttribute('visibility', 'hidden'); }
    var hit = el.querySelector('.ult-hit');
    hit.addEventListener('mousemove', show); hit.addEventListener('touchstart', show, { passive: true });
    hit.addEventListener('touchmove', show, { passive: true }); hit.addEventListener('mouseleave', hide);
  }

  /* Diverging ROI bars around a zero line, values printed beside each bar. */
  function roiRows(list, opts) {
    opts = opts || {};
    var max = Math.max(0.05, Math.max.apply(null, list.map(function (c) { return Math.abs(c.roi); })));
    return '<div class="ult-rows" role="table" aria-label="' + esc(opts.label || 'Results by category') + '">' +
      '<div class="ult-row ult-row--head" role="row"><span role="columnheader">' + esc(opts.first || 'Category') + '</span><span role="columnheader">Picks</span><span role="columnheader">Record</span><span role="columnheader">Units</span><span role="columnheader" class="ult-roihead">ROI</span><span role="columnheader">Evidence</span></div>' +
      list.map(function (c) {
        var wpct = Math.abs(c.roi) / max * 50;
        var bar = '<span class="ult-bar"><i class="ult-bar0"></i><i class="ult-barfill ' + (c.roi >= 0 ? 'is-pos' : 'is-neg') + '" style="' +
          (c.roi >= 0 ? 'left:50%' : 'right:50%') + ';width:' + wpct.toFixed(1) + '%"></i></span>';
        return '<div class="ult-row" role="row" title="' + esc(c.key + ': ' + rec(c) + ', ' + fu(c.net) + ' on ' + c.risked.toFixed(1) + 'u risked, ' + fp(c.roi) + ' ROI, p = ' + c.p_value.toFixed(2)) + '">' +
          '<span role="cell" class="ult-rowkey">' + esc(c.key) + '</span><span role="cell">' + c.n + '</span><span role="cell">' + rec(c) + '</span>' +
          '<span role="cell" class="' + tone(c.net) + '">' + esc(fu(c.net)) + '</span>' +
          '<span role="cell" class="ult-roicell">' + bar + '<b class="' + tone(c.roi) + '">' + esc(fp(c.roi)) + '</b></span>' +
          '<span role="cell">' + chip(c.verdict) + '</span></div>';
      }).join('') + '</div>';
  }

  function renderProfile(el, r, opts) {
    opts = opts || {};
    el.innerHTML =
      tiles(r.overall) +
      '<p class="ult-assume">' + esc(opts.assumption || ('ROI is net units divided by units risked: ' + r.overall.risked.toFixed(1) + ' units across ' + r.overall.n + ' graded picks.')) + '</p>' +
      '<div class="ult-card"><div class="ult-cardhead"><h3>Running units</h3><span>Cumulative, by month. Hover or tap the line.</span></div><div class="ult-chart" data-ult-line></div></div>' +
      '<div class="ult-card"><div class="ult-cardhead"><h3>By category</h3><span>Sport and bet type, best to worst</span></div>' + roiRows(r.categories) + '</div>' +
      '<div class="ult-card"><div class="ult-cardhead"><h3>By price</h3><span>American odds at the time of the pick</span></div>' + roiRows(r.by_odds, { first: 'Odds range', label: 'Results by odds range' }) + '</div>';
    var chart = el.querySelector('[data-ult-line]');
    lineChart(chart, r.monthly);
    var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { lineChart(chart, r.monthly); }, 150); });
  }

  /* ------------------------------------------------------------ report */
  function pMeter(c) {
    var p = Math.max(0.001, Math.min(1, c.p_value));
    /* log scale: 0.001 at the left, 1 at the right */
    var pos = (Math.log10(p) + 3) / 3 * 100;
    return '<div class="ult-meter" aria-label="Evidence meter: p = ' + c.p_value.toFixed(2) + '">' +
      '<div class="ult-meterbar"><span class="z1" style="width:' + ((Math.log10(0.05) + 3) / 3 * 100).toFixed(1) + '%">Meaningful</span>' +
      '<span class="z2" style="width:' + ((Math.log10(0.2) - Math.log10(0.05)) / 3 * 100).toFixed(1) + '%">Possible</span>' +
      '<span class="z3">Normal variance</span><i style="left:' + pos.toFixed(1) + '%"></i></div>' +
      '<p>p = ' + c.p_value.toFixed(2) + ' (z = ' + (c.z < 0 ? MINUS : '') + Math.abs(c.z).toFixed(2) + '): the chance a break-even bettor at these prices would run this ' + (c.roi < 0 ? 'cold' : 'hot') + ' or more by luck is about ' + Math.max(1, Math.round(c.p_value * 100)) + ' in 100.</p></div>';
  }

  function statStrip(c) {
    var items = [['Picks', c.n], ['Record', rec(c)], ['Units', fu(c.net)], ['ROI', fp(c.roi)],
      ['Win rate', pc(c.win_pct, 1)], ['Break-even', pc(c.break_even_pct, 1)], ['Beat the close', pc(c.beat_close_pct)]];
    return '<div class="ult-strip">' + items.map(function (x) {
      var cls = (x[0] === 'Units' ? tone(c.net) : x[0] === 'ROI' ? tone(c.roi) : '');
      return '<div><span>' + x[0] + '</span><b class="' + cls + '">' + esc(x[1]) + '</b></div>';
    }).join('') + '</div>';
  }

  function pairBars(rows, legend) {
    /* rows: [{label, a, b, fmt}] two series compared on one shared scale per row */
    return '<div class="ult-legend"><span><i class="ult-sw ult-sw--a"></i>' + esc(legend[0]) + '</span><span><i class="ult-sw ult-sw--b"></i>' + esc(legend[1]) + '</span></div>' +
      rows.map(function (r) {
        var max = Math.max(Math.abs(r.a), Math.abs(r.b), r.floor || 0.0001);
        var bar = function (v, cls) {
          return '<div class="ult-pbar"><span class="ult-pbar0"></span><i class="' + cls + (v < 0 ? ' is-negbar' : '') + '" style="' + (v >= 0 ? 'left:50%' : 'right:50%') + ';width:' + (Math.abs(v) / max * 50).toFixed(1) + '%"></i><b>' + esc(r.fmt(v)) + '</b></div>';
        };
        return '<div class="ult-pair"><span class="ult-pairlabel">' + esc(r.label) + '</span>' + bar(r.a, 'ult-pa') + bar(r.b, 'ult-pb') + '</div>';
      }).join('');
  }

  function patternsHtml(f) {
    if (!f.patterns.length) return '<p class="ult-muted">Three splits are checked for every member (side, price, home or away). None stood out in this category once the number of comparisons is accounted for, so the review is about the category as a whole.</p>';
    return f.patterns.map(function (pt) {
      return '<div class="ult-pattern"><h5>' + esc(pt.dimension) + '</h5>' +
        pairBars([{ label: 'ROI', a: pt.worse.roi, b: pt.better.roi, fmt: function (v) { return fp(v); }, floor: 0.05 }],
          [pt.worse.key + ' (' + pt.worse.n + ', ' + rec(pt.worse) + ')', pt.better.key + ' (' + pt.better.n + ', ' + rec(pt.better) + ')']) +
        '</div>';
    }).join('') + '<p class="ult-muted">Splits are checked several ways, so one can look strong by chance. Treat each as a question to research, not a rule.</p>';
  }

  function reviewHtml(v, featured, who) {
    var head = '<div class="ult-revhead"><div><span class="ult-revdate">' + esc(fmtDate(v.date)) + ' · ' + esc(v.sport) + ' ' + esc(v.market) + '</span>' +
      '<h4>' + esc(v.selection) + (v.matchup ? ' <small>' + esc(v.matchup) + '</small>' : '') + '</h4></div>' +
      '<span class="ult-result ' + (v.result === 'won' ? 'is-pos' : v.result === 'lost' ? 'is-neg' : '') + '">' + (v.result === 'won' ? 'Won' : v.result === 'lost' ? 'Lost' : 'Push') + ' ' + esc(fu(v.net)) + '</span></div>';
    var before = '<dl class="ult-dl">' + v.before_game.map(function (b) { return '<div><dt>' + esc(b.label) + '</dt><dd>' + prose(b.value) + '</dd></div>'; }).join('') + '</dl>';
    var read = '<ul class="ult-read">' + v.market_read.map(function (t) { return '<li>' + prose(t) + '</li>'; }).join('') + '</ul>';
    if (!featured) return '<article class="ult-review">' + head + before + read + '</article>';
    var ctx = v.recorded_inputs;
    var LEAN = { over: 'Pointed Over', under: 'Pointed Under', for: 'Favored the pick', against: 'Against the pick', neutral: 'No clear lean' };
    var ou = v.market === 'total' || v.market === 'team_total' || v.market === 'prop';
    var takenDir = ou ? (/\bunder\b/i.test(v.selection) ? 'under' : 'over') : 'for';
    var factors = '<div class="ult-factors" role="table" aria-label="Pre-game inputs">' + ctx.factors.map(function (f) {
      var cls = f.pointed === 'neutral' ? 'neutral' : f.pointed === takenDir ? 'with' : 'against';
      var KNOWN = { before_pick: 'Known at the pick', unverified: 'Timing not recorded', before_game: 'Published after the pick', game_time: 'At the start' };
      return '<div class="ult-factor" role="row"><span role="cell" class="ult-fname">' + esc(f.name) +
        (f.known ? '<small class="ult-known ult-known--' + esc(f.known) + '">' + esc(KNOWN[f.known] || f.known) + '</small>' : '') +
        '</span><span role="cell">' + prose(f.pre_game) + (f.source ? '<small class="ult-src">Source: ' + esc(f.source) + '</small>' : '') +
        '</span><span role="cell"><span class="ult-lean ult-lean--' + cls + '">' + esc(LEAN[f.pointed] || 'No clear lean') + '</span></span></div>';
    }).join('') + '</div>';
    var sm = v.inputs_summary;
    var tally = '';
    if (sm) {
      var seg = function (k, cls, label) { return k ? '<i class="' + cls + '" style="flex:' + k + '" title="' + esc(label) + '"></i>' : ''; };
      tally = '<div class="ult-tally" aria-hidden="true">' + seg(sm.with_pick, 'with', 'toward the side taken') + seg(sm.against_pick, 'against', 'toward the other side') +
        seg(sm.total - sm.leaning, 'neutral', 'no clear lean') + '</div>' +
        '<div class="ult-legend"><span><i class="ult-sw ult-sw--with"></i>Toward the side taken (' + sm.with_pick + ')</span><span><i class="ult-sw ult-sw--against"></i>Toward the other side (' + sm.against_pick + ')</span><span><i class="ult-sw ult-sw--neutral"></i>No clear lean (' + (sm.total - sm.leaning) + ')</span></div>' +
        '<p>' + prose(sm.text) + '</p>';
    }
    var rs = v.research;
    var researchHtml = rs ? '<div class="ult-research">' +
      (rs.conflicts.length ? '<h5>Inputs that pointed different ways</h5><ul class="ult-read">' + rs.conflicts.map(function (t) { return '<li>' + prose(t) + '</li>'; }).join('') + '</ul>' : '') +
      (rs.uncertainty.length ? '<h5>Uncertainty</h5><ul class="ult-read">' + rs.uncertainty.map(function (t) { return '<li>' + prose(t) + '</li>'; }).join('') + '</ul>' : '') +
      (rs.unavailable.length ? '<p class="ult-muted">Not available for this game: ' + esc(rs.unavailable.join(', ')) + '.</p>' : '') +
      (rs.price ? '<h5>Price</h5><p>' + prose(rs.price) + '</p>' : '') +
      '<h5>Decision and result</h5><p>' + prose(rs.decision) + '</p><p class="ult-muted">' + esc(rs.rationale) + '</p></div>' : '';
    var check = '<ul class="ult-check">' + (v.checklist || []).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>';
    var fin = v.after_game;
    var after = fin ? '<div class="ult-after"><h5>After the game</h5><p><b>Final: ' + esc(fin.score) + '</b>' +
      (v.market === 'total' && fin.total_runs != null ? ' (' + fin.total_runs + (v.sport === 'MLB' ? ' runs' : ' total') + ')' : '') + '. ' + esc(fin.note || 'Shown for completeness; nothing above uses it.') + '</p></div>' : '';
    return '<article class="ult-review ult-review--featured">' +
      '<span class="ult-flag">' + esc(ctx.label) + '</span>' + head +
      '<div class="ult-revgrid"><div><h5>Before the game: the market</h5>' + before + read + '</div><div><h5>Point-in-time context</h5>' + tally + '</div></div>' +
      '<h5>Before the game: the matchup</h5><p class="ult-muted">' + (ctx.venue ? esc(ctx.venue) + '. ' : '') + 'Each input is marked with when it was known. TMR does not know which of them ' + esc(who) + ' looked at, and the review does not guess. These are possible factors, never the reason for the result.</p>' + factors +
      researchHtml + '<h5>Questions worth researching before similar picks</h5>' + check + after + '</article>';
  }

  function writtenHtml(n) {
    if (!n || !n.summary) return '';
    return '<div class="ult-written"><span class="ult-kicker">Written evaluation</span><p class="ult-lead">' + prose(n.summary) + '</p>' +
      (n.priority ? '<h4>Your priority</h4><p>' + prose(n.priority) + '</p>' : '') +
      (n.next_steps && n.next_steps.length ? '<h4>Next steps</h4><ul>' + n.next_steps.map(function (t) { return '<li>' + prose(t) + '</li>'; }).join('') + '</ul>' : '') +
      '<span class="ult-byline">' + esc(n.byline || 'Written by AI from the figures in this report. Every number in it is checked against those figures before it is shown.') + '</span></div>';
  }

  function tabsHtml(tabs) {
    return '<div class="ult-tabs" role="tablist" aria-label="Report sections">' + tabs.map(function (t, i) {
      return '<button type="button" role="tab" id="ult-tab-' + t.id + '" aria-controls="ult-panel-' + t.id + '" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '">' + esc(t.label) + '</button>';
    }).join('') + '</div>' + tabs.map(function (t, i) {
      return '<section class="ult-panel" role="tabpanel" id="ult-panel-' + t.id + '" aria-labelledby="ult-tab-' + t.id + '"' + (i ? ' hidden' : '') + '>' + t.html + '</section>';
    }).join('');
  }

  function wireTabs(el, onSwitch) {
    var tabs = [].slice.call(el.querySelectorAll('[role=tab]'));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
        el.querySelector('#' + t.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) tab.focus();
      try { tab.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (e) { }
      if (onSwitch) onSwitch(tab.id.replace('ult-tab-', ''));
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        var k = e.key, n = null;
        if (k === 'ArrowRight') n = tabs[(i + 1) % tabs.length]; else if (k === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (k === 'Home') n = tabs[0]; else if (k === 'End') n = tabs[tabs.length - 1];
        if (n) { e.preventDefault(); select(n, true); }
      });
    });
    return function (id) { var t = el.querySelector('#ult-tab-' + id); if (t) select(t); };
  }

  function renderReport(el, r, opts) {
    opts = opts || {};
    var who = opts.name || 'you';
    var f = r.focus;
    var top = r.strengths.filter(function (s) { return s.n >= 30; })[0] || null;
    var tabs = [];

    tabs.push({ id: 'overall', label: 'Overall Analysis', html:
      writtenHtml(r.narrative) +
      '<div class="ult-eval"><span class="ult-kicker">' + (r.narrative ? 'The numbers behind it' : 'Overall handicapping evaluation') + '</span>' + r.evaluation.map(function (p, i) { return '<p' + (i === 0 ? ' class="ult-lead"' : '') + '>' + prose(p) + '</p>'; }).join('') + '</div>' +
      '<div class="ult-sw2"><div class="ult-swcol ult-swcol--pos"><h4>Strongest categories</h4>' + (r.strengths.length ? r.strengths.map(function (s) {
        return '<div class="ult-swrow"><b>' + esc(s.key) + '</b><span>' + esc(fp(s.roi)) + ' · ' + s.n + ' picks · ' + esc(fu(s.net)) + '</span>' + chip(s.verdict) + '</div>';
      }).join('') : '<p class="ult-muted">No category is positive yet.</p>') + '</div>' +
      '<div class="ult-swcol ult-swcol--neg"><h4>Dragging results down</h4>' + (r.weaknesses.length ? r.weaknesses.map(function (s) {
        return '<div class="ult-swrow' + (f && s.key === f.category.key ? ' is-priority' : '') + '"><b>' + esc(s.key) + (f && s.key === f.category.key ? ' <em>Priority review</em>' : '') + '</b><span>' + esc(fp(s.roi)) + ' · ' + s.n + ' picks · ' + esc(fu(s.net)) + '</span>' + chip(s.verdict) + '</div>';
      }).join('') : '<p class="ult-muted">No category is negative.</p>') + '</div></div>' +
      '<p class="ult-muted">Verdicts test wins against the break-even rate of the prices actually paid. "Within normal variance" means the result, good or bad, is what luck alone produces often enough that it is not a reason to change anything by itself.</p>' });

    if (f) {
      tabs.push({ id: 'focus', label: f.category.key, html:
        '<div class="ult-focushead"><div><span class="ult-kicker">Priority review</span><h3>' + esc(f.category.key) + '</h3></div>' + chip(f.category.verdict) + '</div>' +
        statStrip(f.category) + '<h4>Is it real, or variance?</h4>' + pMeter(f.category) +
        '<p>' + (f.category.beat_close_pct != null && f.category.clv_moved >= 20 ? prose('The result alone is one piece of evidence. The closing line is another, and it does not depend on who won: where the number moved before the game, ' + who + ' beat the close on ' + pc(f.category.beat_close_pct) + ' of these picks (' + f.category.clv_moved + ' picks). ' + (f.category.beat_close_pct < 0.45 ? 'Consistently getting a worse number than the market settles on is the clearest sign the problem is in the pricing, not the luck.' : f.category.beat_close_pct >= 0.55 ? 'That is a sound process, so part of the shortfall is likely variance.' : 'That is about what an average bettor gets, so the close neither clears nor condemns the process.')) : '') + '</p>' +
        '<h4>Where inside the category</h4>' + patternsHtml(f) });
    }
    if (top) {
      tabs.push({ id: 'strength', label: top.key, html:
        '<div class="ult-focushead"><div><span class="ult-kicker">Strongest category</span><h3>' + esc(top.key) + '</h3></div>' + chip(top.verdict) + '</div>' +
        statStrip(top) + '<h4>Is it real, or variance?</h4>' + pMeter(top) +
        '<p>' + prose(top.key + ' returned ' + fu(top.net) + ' at ' + fp(top.roi) + ' over ' + top.n + ' picks' +
          (top.beat_close_pct != null && top.clv_moved >= 20 ? ', and beat the close on ' + pc(top.beat_close_pct) + ' of the ' + top.clv_moved + ' picks where the number moved' : '') + '. ' +
          (top.verdict.key === 'strength' ? 'The result is unlikely to be luck alone.' : 'The result alone does not rule out luck, which is why the closing line matters: ' + (top.beat_close_pct != null && top.beat_close_pct >= 0.55 ? 'beating it more often than not is independent evidence the edge is real.' : 'it does not yet confirm the edge either.'))) + '</p>' +
        '<p class="ult-muted">A strength is worth protecting deliberately: write down what goes into these picks so it is repeated on purpose, not by habit.</p>' +
        (r.strength_review && r.strength_review.category === top.key
          ? '<h4>A recent ' + esc(top.key) + ' pick, reviewed</h4>' + reviewHtml(r.strength_review.review, Boolean(r.strength_review.review.recorded_inputs), who) : '') });
    }
    if (f) {
      var featured = f.reviews.filter(function (v) { return v.recorded_inputs; });
      var rest = f.reviews.filter(function (v) { return !v.recorded_inputs; });
      tabs.push({ id: 'reviews', label: 'Pick Reviews', html:
        '<p class="ult-intro">Each review separates what was knowable before the game from what happened after it. A loss that beat the closing line can be a good bet; a win at a price the market rejected can be a bad one.</p>' +
        featured.map(function (v) { return reviewHtml(v, true, who); }).join('') +
        (rest.length ? '<h4>More ' + esc(f.category.key) + ' reviews</h4><div class="ult-revlist">' + rest.map(function (v) { return reviewHtml(v, false); }).join('') + '</div>' : '') });
    }
    tabs.push({ id: 'plan', label: 'Coaching Recommendations', html: r.plan.length
      ? '<ol class="ult-plan">' + r.plan.map(function (s) {
        return '<li><h4>' + esc(s.title) + '</h4><p>' + prose(s.detail) + '</p>' + (s.checklist ? '<ul class="ult-check">' + s.checklist.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' : '') + '</li>';
      }).join('') + '</ol><p class="ult-muted">Recommendations change how picks are researched and priced. None of them is a promise of better results.</p>'
      : '<p class="ult-muted">A plan appears once a category has at least ' + r.method.min_sample + ' graded picks.</p>' });
    if (f) {
      var pg = f.progress;
      tabs.push({ id: 'progress', label: 'Improvement Progress', html: pg
        ? '<div class="ult-focushead"><div><span class="ult-kicker">' + esc(f.category.key) + ' since the plan began ' + esc(fmtDate(pg.plan_started_at)) + '</span><h3>' + esc(pg.status.label.split(' (')[0]) + '</h3>' +
          (pg.status.label.indexOf(' (') > 0 ? '<p class="ult-muted" style="margin:4px 0 0">' + esc(pg.status.label.slice(pg.status.label.indexOf(' (') + 2).replace(/\)$/, '')) + '</p>' : '') + '</div></div>' +
          pairBars([
            { label: 'ROI', a: pg.before.roi, b: pg.after.roi, fmt: function (v) { return fp(v); }, floor: 0.05 },
            { label: 'Beat the close', a: pg.before.beat_close_pct || 0, b: pg.after.beat_close_pct || 0, fmt: function (v) { return pc(v); }, floor: 0.5 },
            { label: 'Win rate', a: pg.before.win_pct, b: pg.after.win_pct, fmt: function (v) { return pc(v, 1); }, floor: 0.5 },
          ], ['Before the plan (' + pg.before.n + ' picks, ' + rec(pg.before) + ')', 'Since the plan (' + pg.after.n + ' picks, ' + rec(pg.after) + ')']) +
          '<p>' + prose('The closing line moves first: ' + pc(pg.before.beat_close_pct) + ' of picks beat it before the plan, ' + pc(pg.after.beat_close_pct) + ' since. Results follow more slowly, and ' + pg.after.n + ' picks is not enough to call the problem solved. The report keeps measuring with every graded pick.') + '</p>'
        : '<p class="ult-muted">Start the improvement plan and every graded pick after that date is measured against the record before it.</p>' +
          (opts.canStartPlan ? '<button type="button" class="ult-btn ult-btn--ghost" data-ult-startplan>Start the plan today</button>' : '') });
    }

    el.innerHTML = tabsHtml(tabs);
    var select = wireTabs(el, opts.onSwitch);
    var sp = el.querySelector('[data-ult-startplan]');
    if (sp && opts.onStartPlan) sp.addEventListener('click', function () { opts.onStartPlan(sp); });
    return { select: select };
  }

  window.TMRUltimateReport = { renderProfile: renderProfile, renderReport: renderReport, roiRows: roiRows, tiles: tiles, lineChart: lineChart };
})();
