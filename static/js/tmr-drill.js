/* =============================================================================
   TMR STAT DRILLDOWN (STATS_DRILLDOWN_SITEWIDE_20260927)

   EVERY NUMBER SHOULD BE TRACEABLE TO THE PICKS BEHIND IT.

   One component for the whole site. Anything that displays an aggregate built
   from picks marks itself with:

     data-drill-category   the server bucket family/category (required)
     data-drill-bucket     the bucket inside it ('' for the whole record)
     data-drill-user       whose picks (or inherit from an ancestor with
                           data-drill-user, or window.TMR_DRILL_USER)
     data-drill-label      the words the row displayed ("Team Totals")
     data-drill-context    optional kicker ("NFL leaderboard", "Last 30 days")
     data-drill-extra      optional extra query, e.g. "and=split_sport:baseball_mlb"
     data-drill-expect     optional "picks|W-L-P|net" the element displayed; when
                           absent it is read from the row that was clicked

   A click opens a ledger panel: the category header, the headline record from
   the server (the same rule and the same math the figure on the page used),
   filters, sorting, and the individual picks, 50 at a time. The panel checks
   the figure the visitor clicked against the ledger it opened and says so:
   "Reconciled" when every count, the record and the units agree, and a plain
   warning (plus a console error) if they ever do not.

   The same renderer powers /pick-history/ as a full page (TMRDrill.mount).
   ========================================================================== */
(function () {
  'use strict';
  if (window.TMRDrill) return;

  var API = (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) ||
            'https://trustmyrecord-api.onrender.com/api';
  var PAGE = 50;

  /* ---------------------------------------------------------------- utils */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function signed(n, suffix, dp) {
    var x = num(n);
    return (x > 0 ? '+' : '') + x.toFixed(dp == null ? 2 : dp) + (suffix || '');
  }
  function american(o) {
    var x = Number(o);
    if (!isFinite(x) || x === 0) return '—';
    return (x > 0 ? '+' : '') + Math.round(x);
  }
  function tone(n) { var x = num(n); return x > 0 ? 'pos' : x < 0 ? 'neg' : 'zero'; }
  function fmtDate(v) {
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function titleize(v) {
    return String(v || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function token() {
    try {
      return localStorage.getItem('trustmyrecord_token') || localStorage.getItem('tmr_token') ||
             localStorage.getItem('accessToken') || '';
    } catch (e) { return ''; }
  }
  function recordText(s) {
    if (!s || !s.total_picks) return '0-0';
    return s.wins + '-' + s.losses + (s.pushes ? '-' + s.pushes : '');
  }

  /* Plain-language names for the categories the server knows, so the kicker
     says what kind of number this is. */
  var KICKERS = {
    all: 'Full record', record: 'Full record', period: 'Recent window', graded_period: 'Graded in window', rolling_form: 'Recent form',
    streak: 'Streak', split_sport: 'League', split_sport_group: 'Sport', split_market: 'Market type',
    split_odds_bucket: 'Odds range', split_fav_dog: 'Favorite vs underdog', split_unit_size: 'Unit size',
    split_day_of_week: 'Day of week', daypart: 'Day vs night', opponent: 'Team faded', team: 'Team',
    team_market: 'Team and bet type', home_away: 'Home vs away', home_away_sport: 'Home vs away by league',
    side_total: 'Over vs under', bet_timing: 'Bet timing', prop_type: 'Player prop type',
    line_number: 'Exact line', month: 'Month', season: 'Season', market: 'Market type',
    market_group: 'Market group', market_sport: 'Market by league', market_sport_side: 'Market by league and side',
    sport: 'Sport', odds_bucket: 'Odds range', unit_size: 'Unit size', favorite_underdog: 'Favorite vs underdog',
    wager_period: 'Game segment', wager_period_sport: 'Game segment by league',
    wager_period_market: 'Game segment market', alt_line_type: 'Alternate line'
  };

  /* --------------------------------------------------- reconciliation read */
  /* What the visitor was looking at when they clicked. An explicit
     data-drill-expect wins; otherwise the row (or card) the element sits in is
     read for a W-L(-P) record and a units figure. Nothing found = no claim. */
  var REC_RE = /(^|[^\d.])(\d{1,5})-(\d{1,5})(?:-(\d{1,5}))?(?![\d.%])/;
  var UNITS_RE = /([+\-−]?\d+(?:\.\d+)?)\s?u\b/;
  function parseExpect(el) {
    if (!el) return null;
    var raw = el.getAttribute('data-drill-expect');
    if (raw) {
      var parts = raw.split('|');
      var r = REC_RE.exec(' ' + (parts[1] || ''));
      return {
        picks: parts[0] !== '' && parts[0] != null ? num(parts[0]) : null,
        wins: r ? num(r[2]) : null, losses: r ? num(r[3]) : null, pushes: r ? num(r[4] || 0) : null,
        net: parts[2] !== '' && parts[2] != null ? num(String(parts[2]).replace('−', '-')) : null
      };
    }
    var host = el.closest('tr, [data-drill-scope], .tmrx-cell, .tmrx-period-cell') || el;
    var text = (host.innerText || host.textContent || '').replace(/\s+/g, ' ');
    var rec = REC_RE.exec(text);
    /* Net units are the signed figure; an unsigned "3u" is a stake size or a
       row label. Take the last signed one, else the first plain one. */
    var signedAll = text.match(/[+\-−]\d+(?:\.\d+)?\s?u\b/g);
    var units = signedAll ? UNITS_RE.exec(signedAll[signedAll.length - 1]) : UNITS_RE.exec(text);
    if (!rec && !units) return null;
    return {
      picks: null,
      wins: rec ? num(rec[2]) : null, losses: rec ? num(rec[3]) : null,
      pushes: rec ? num(rec[4] || 0) : null,
      net: units ? num(units[1].replace('−', '-')) : null
    };
  }
  function reconcile(expect, s) {
    if (!expect || !s) return null;
    var checks = [];
    if (expect.wins != null) {
      checks.push(['record', expect.wins + '-' + expect.losses + '-' + expect.pushes,
        s.wins + '-' + s.losses + '-' + s.pushes]);
    }
    if (expect.picks != null) checks.push(['picks', String(expect.picks), String(s.total_picks)]);
    if (expect.net != null) checks.push(['units', expect.net.toFixed(2), num(s.net_units).toFixed(2)]);
    if (!checks.length) return null;
    var bad = checks.filter(function (c) { return c[1] !== c[2]; });
    return { ok: !bad.length, checks: checks, bad: bad };
  }

  /* ------------------------------------------------------------------ CSS */
  var CSS = [
    '.tdr-back{position:fixed;inset:0;z-index:2147482000;background:rgba(2,6,16,.72);backdrop-filter:blur(3px);display:flex;justify-content:flex-end}',
    '.tdr-panel{width:min(1180px,100%);height:100%;background:#07101d;border-left:1px solid #1F3350;display:flex;flex-direction:column;font-family:Inter,system-ui,sans-serif;color:#dbe5f4;box-shadow:-20px 0 60px rgba(0,0,0,.5);animation:tdrIn .18s ease-out}',
    '@keyframes tdrIn{from{transform:translateX(40px);opacity:.4}to{transform:none;opacity:1}}',
    '.tdr-inline .tdr-panel{width:100%;height:auto;border:0;box-shadow:none;background:transparent;animation:none}',
    '.tdr-top{padding:18px 22px 14px;border-bottom:1px solid rgba(31,51,80,.7);background:#0a1322;position:relative}',
    '.tdr-inline .tdr-top{border:1px solid rgba(31,51,80,.55);border-radius:14px}',
    '.tdr-close{position:absolute;top:12px;right:14px;width:36px;height:36px;border-radius:10px;border:1px solid #1F3350;background:#08111f;color:#cbd5e1;font-size:20px;line-height:1;cursor:pointer}',
    '.tdr-close:hover{color:#fff;border-color:#2c4a72}',
    '.tdr-kicker{font-size:10.5px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#7f8ca3;padding-right:46px}',
    '.tdr-title{font-family:Barlow,Inter,sans-serif;font-weight:900;font-size:clamp(1.25rem,3vw,1.85rem);letter-spacing:-.01em;color:#f1f5fb;margin:5px 0 0;text-transform:uppercase;padding-right:46px}',
    '.tdr-line{margin-top:6px;font-size:15px;font-weight:800;color:#e6edf7;font-variant-numeric:tabular-nums}',
    '.tdr-line .pos{color:#86efac}.tdr-line .neg{color:#fca5a5}.tdr-line .sep{color:#475569;margin:0 8px}',
    '.tdr-sub{margin-top:4px;font-size:12.5px;font-weight:600;color:#9BA7B8}',
    '.tdr-sub a{color:#4DA3FF;text-decoration:none}',
    '.tdr-tiles{margin-top:14px;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}',
    '.tdr-tile{padding:9px 11px;border:1px solid rgba(31,51,80,.55);border-radius:10px;background:rgba(2,6,23,.4)}',
    '.tdr-tile .k{font-size:9.5px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#9BA7B8}',
    '.tdr-tile .v{margin-top:4px;font-size:16px;font-weight:900;color:#f1f5fb;font-variant-numeric:tabular-nums}',
    '.tdr-tile .v.pos{color:#86efac}.tdr-tile .v.neg{color:#fca5a5}',
    '.tdr-rec{margin-top:10px;font-size:12px;font-weight:700;border-radius:9px;padding:7px 11px;display:inline-flex;gap:8px;align-items:center}',
    '.tdr-rec.ok{background:rgba(34,197,94,.10);color:#86efac;border:1px solid rgba(34,197,94,.25)}',
    '.tdr-rec.bad{background:rgba(245,158,11,.10);color:#fcd34d;border:1px solid rgba(245,158,11,.3)}',
    '.tdr-body{flex:1;overflow:auto;padding:12px 22px 28px;-webkit-overflow-scrolling:touch}',
    '.tdr-inline .tdr-body{overflow:visible;padding:12px 0 0}',
    '.tdr-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:10px}',
    '.tdr-f{display:flex;flex-direction:column;gap:3px}',
    '.tdr-f label{font-size:9.5px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#7f8ca3}',
    '.tdr-f select,.tdr-f input{background:#08111f;border:1px solid #1F3350;border-radius:8px;color:#dbe5f4;font:700 12px Inter,sans-serif;padding:7px 9px;min-width:112px;-webkit-appearance:none;appearance:none}',
    '.tdr-f select{background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%278%27 viewBox=%270 0 12 8%27%3E%3Cpath d=%27M1 1l5 5 5-5%27 fill=%27none%27 stroke=%27%23C3D6EA%27 stroke-width=%272%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;background-size:10px 7px;padding-right:26px}',
    '.tdr-f input[type=search]{min-width:180px}',
    '.tdr-f select:focus,.tdr-f input:focus{outline:none;border-color:#4DA3FF}',
    '.tdr-btn{background:#08111f;border:1px solid #1F3350;border-radius:8px;color:#9fb0c9;font:900 11px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:8px 12px;cursor:pointer;text-decoration:none;display:inline-block}',
    '.tdr-btn:hover{color:#fff;border-color:#2c4a72}',
    '.tdr-count{margin:4px 0 8px;font-size:12px;font-weight:700;color:#9BA7B8}.tdr-count strong{color:#f1f5fb}',
    '.tdr-shell{border:1px solid rgba(31,51,80,.55);border-radius:12px;overflow-x:auto;background:#0a1322}',
    'table.tdr-table{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;min-width:980px}',
    '.tdr-table th{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#9BA7B8;background:#08111f;text-align:left;padding:9px 10px;border-bottom:1px solid #1F3350;white-space:nowrap;position:sticky;top:0}',
    '.tdr-table th.n,.tdr-table td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.tdr-table td{padding:9px 10px;border-bottom:1px solid rgba(31,51,80,.5);font-weight:600;vertical-align:top}',
    '.tdr-table tbody tr{cursor:pointer}.tdr-table tbody tr:hover td{background:rgba(77,163,255,.05)}',
    '.tdr-table .pos{color:#86efac}.tdr-table .neg{color:#fca5a5}.tdr-table .zero{color:#94a3b8}',
    '.tdr-bet{font-weight:800;color:#f1f5fb}.tdr-dim{color:#8fa0b8;font-size:11.5px}',
    '.tdr-tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}',
    '.tdr-tag.void{background:rgba(148,163,184,.10);color:#94a3b8}',
    '.tdr-tag.won{background:rgba(34,197,94,.14);color:#86efac}.tdr-tag.lost{background:rgba(239,68,68,.14);color:#fca5a5}.tdr-tag.push{background:rgba(148,163,184,.14);color:#cbd5e1}',
    '.tdr-more{display:flex;justify-content:center;padding:14px 0}',
    '.tdr-msg{padding:28px 14px;text-align:center;color:#9BA7B8;font-weight:700}.tdr-msg.err{color:#fca5a5}',
    '.tdr-note{margin-top:12px;font-size:11.5px;color:#7f8ca3;line-height:1.55}',
    '@media (max-width:900px){.tdr-tiles{grid-template-columns:repeat(4,minmax(0,1fr))}}',
    '@media (max-width:640px){.tdr-top{padding:14px 16px}.tdr-body{padding:10px 16px 24px}.tdr-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}',
    ' .tdr-f{flex:1 1 45%}.tdr-f select,.tdr-f input{min-width:0;width:100%}',
    ' table.tdr-table{min-width:0}.tdr-table thead{display:none}.tdr-table tr{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:10px 12px;border-bottom:1px solid rgba(31,51,80,.5)}',
    ' .tdr-table td{border:0;padding:0}.tdr-table td[data-k]:before{content:attr(data-k);display:inline-block;min-width:56px;color:#64748b;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;margin-right:6px}',
    ' .tdr-table td.wide{grid-column:1/-1}}',
    /* Every drillable figure on the site reads as clickable the same way. */
    '[data-drill-category],[data-drill-local],tr:has(> [data-drill-category]) > td.num{cursor:pointer}',
    'tr:has(> [data-drill-category]):hover > td.num{text-decoration:underline dotted rgba(124,192,255,.55);text-underline-offset:3px}',
    '.tdr-cta{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:2px 8px;border-radius:999px;border:1px solid rgba(77,163,255,.35);color:#7cc0ff;font:900 9.5px Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;vertical-align:middle;background:rgba(77,163,255,.06)}',
    '[data-drill-category]:hover .tdr-cta{background:rgba(77,163,255,.16);color:#fff}'
  ].join('\n');
  function ensureCss() {
    if (document.getElementById('tdr-css')) return;
    var st = document.createElement('style');
    st.id = 'tdr-css';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* Categories added with this component (record, drawdown, sport_filter)
     need the matching API. Against an older API the panel retries with the
     closest exact equivalent, and relabels honestly when there is none. */
  var SPORT_KEYS = {
    mlb: ['split_sport', 'baseball_mlb'], nfl: ['split_sport', 'americanfootball_nfl'],
    ncaaf: ['split_sport', 'americanfootball_ncaaf'], nba: ['split_sport', 'basketball_nba'],
    nba_summer: ['split_sport', 'basketball_nba_summer'], wnba: ['split_sport', 'basketball_wnba'],
    ncaab: ['split_sport', 'basketball_ncaab'], nhl: ['split_sport', 'icehockey_nhl'],
    npb: ['split_sport', 'baseball_npb'], soccer: ['split_sport_group', 'soccer'],
    tennis: ['split_sport_group', 'tennis'], mma: ['split_sport_group', 'mma,ufc,mixed'],
    boxing: ['split_sport_group', 'boxing']
  };
  function legacyPair(cat, bucket) {
    if (cat === 'record') return { cat: 'all', bucket: '' };
    if (cat === 'drawdown') return { cat: 'all', bucket: '', relabel: true };
    if (cat === 'graded_period') return { cat: 'period', bucket: bucket };
    if (cat === 'sport_filter') {
      var b = String(bucket || '').toLowerCase();
      if (SPORT_KEYS[b]) return { cat: SPORT_KEYS[b][0], bucket: SPORT_KEYS[b][1] };
      return b.indexOf('_') >= 0 ? { cat: 'split_sport', bucket: b } : { cat: 'split_sport_group', bucket: b };
    }
    return null;
  }
  function legacyOpts(o) {
    var main = legacyPair(o.category, o.bucket);
    var relabel = !!(main && main.relabel);
    var extra = new URLSearchParams(String(o.extra || '').replace(/^[&?]/, ''));
    var out = new URLSearchParams();
    var changed = !!main;
    extra.forEach(function (v, k) {
      if (k !== 'and') { out.append(k, v); return; }
      var at = v.indexOf(':');
      var pair = at > 0 ? legacyPair(v.slice(0, at), v.slice(at + 1)) : null;
      if (!pair) { out.append(k, v); return; }
      changed = true;
      if (pair.relabel) { relabel = true; return; }
      if (pair.cat !== 'all') out.append('and', pair.cat + ':' + pair.bucket);
    });
    if (!changed) return null;
    var n = {};
    for (var key in o) n[key] = o[key];
    if (main) { n.category = main.cat; n.bucket = main.bucket; }
    n.extra = out.toString();
    if (relabel) {
      n.label = main && main.relabel ? 'Full graded record'
        : (String(o.label || '').replace(/\s*max drawdown$/i, '') + ' record').trim();
      n.expect = null;
    }
    n._fellBack = true;
    return n;
  }

  /* ----------------------------------------------------------- local mode */
  /* For ledgers whose rows are already on the page (contest entries, the
     Watchdog research data): the same filters, order, paging and summary math
     as the server drilldown, applied in the browser. Rows use the server's
     pick shape (status, result_units, risk_units, odds, sport_key, ...). */
  function summarize(rows) {
    var w = 0, l = 0, p = 0, net = 0, risked = 0, oddsSum = 0, oddsN = 0;
    rows.forEach(function (r) {
      var st = r.status === 'pushed' ? 'push' : r.status;
      if (st === 'won') w++; else if (st === 'lost') l++; else if (st === 'push') p++;
      net += num(r.result_units);
      risked += num(r.risk_units);
      if (r.odds != null && isFinite(Number(r.odds))) { oddsSum += Number(r.odds); oddsN++; }
    });
    var dec = w + l;
    return {
      total_picks: rows.length, wins: w, losses: l, pushes: p,
      record: w + '-' + l + (p ? '-' + p : ''), record_full: w + '-' + l + '-' + p,
      win_rate: dec ? Number(((w / dec) * 100).toFixed(2)) : 0,
      total_units_risked: Number(risked.toFixed(2)),
      net_units: Number(net.toFixed(2)),
      roi: risked > 0 ? Number(((net / risked) * 100).toFixed(2)) : 0,
      avg_odds: oddsN ? Number((oddsSum / oddsN).toFixed(2)) : 0
    };
  }
  function localPage(all, q, o) {
    var timeOf = function (r) { return new Date(r.date || 0).getTime() || 0; };
    var ordered = all.slice().sort(function (a, b) { return timeOf(a) - timeOf(b) || num(a.id) - num(b.id); });
    var run = 0;
    ordered.forEach(function (r) { run += num(r.result_units); r.running_units = Number(run.toFixed(2)); });
    var rows = ordered.slice();
    var res = q.get('result'), sp = q.get('sport'), mk = q.get('market'), from = q.get('from'), to = q.get('to');
    var search = String(q.get('q') || '').toLowerCase();
    if (res) rows = rows.filter(function (r) { return (r.status === 'pushed' ? 'push' : r.status) === res; });
    if (sp) rows = rows.filter(function (r) { return String(r.sport_key) === sp; });
    if (mk) rows = rows.filter(function (r) { return String(r.market_type) === mk; });
    if (from) { var f = Date.parse(from + 'T00:00:00Z'); rows = rows.filter(function (r) { return timeOf(r) >= f; }); }
    if (to) { var t = Date.parse(to + 'T00:00:00Z') + 86400000; rows = rows.filter(function (r) { return timeOf(r) < t; }); }
    if (search) rows = rows.filter(function (r) {
      return [r.pick_label, r.matchup, r.market_label, r.league, r.player_name].join(' ').toLowerCase().indexOf(search) >= 0;
    });
    var sort = q.get('sort') || 'newest';
    if (sort === 'oldest') rows.sort(function (a, b) { return timeOf(a) - timeOf(b); });
    else if (sort === 'units_desc') rows.sort(function (a, b) { return num(b.result_units) - num(a.result_units); });
    else if (sort === 'units_asc') rows.sort(function (a, b) { return num(a.result_units) - num(b.result_units); });
    else rows.sort(function (a, b) { return timeOf(b) - timeOf(a); });
    var offset = num(q.get('offset')), limit = num(q.get('limit')) || PAGE;
    var facets = { sports: {}, markets: {} };
    all.forEach(function (r) {
      if (r.sport_key) facets.sports[r.sport_key] = r.league || r.sport_key;
      if (r.market_type) facets.markets[r.market_type] = r.market_label || titleize(r.market_type);
    });
    var hidden = num(o.hiddenCount);
    var summary = o.localSummary || summarize(all);
    return {
      username: o.user || '', summary: summary, filtered: summarize(rows),
      total: all.length + hidden, listed: rows.length, returned: Math.min(limit, Math.max(0, rows.length - offset)),
      offset: offset, limit: limit, hidden_picks: hidden, facets: facets,
      filters_supported: ['sort', 'result', 'sport', 'market', 'from', 'to', 'q'],
      picks: rows.slice(offset, offset + limit)
    };
  }

  /* ------------------------------------------------------------- renderer */
  function Ledger(host, opts, inline) {
    this.host = host;
    this.o = opts;
    this.inline = !!inline;
    this.offset = 0;
    this.rows = [];
    this.data = null;
    this.loading = false;
    this.optionsFilled = false;
    this.build();
    this.load(true);
  }

  Ledger.prototype.build = function () {
    var o = this.o;
    var label = o.label || 'Every graded pick';
    var kicker = [o.context, KICKERS[o.category]].filter(Boolean).join(' · ') || 'Pick history';
    this.host.innerHTML =
      '<div class="tdr-panel" role="dialog" aria-modal="' + (this.inline ? 'false' : 'true') + '" aria-label="' + esc(label) + ' pick history">' +
        '<div class="tdr-top">' +
          (this.inline ? '' : '<button class="tdr-close" type="button" aria-label="Close">×</button>') +
          '<div class="tdr-kicker">' + esc(kicker) + '</div>' +
          (this.inline ? '<h1 class="tdr-title">' + esc(label) + '</h1>' : '<h2 class="tdr-title">' + esc(label) + '</h2>') +
          '<div class="tdr-line" data-r="line">Loading the picks behind this number…</div>' +
          '<div class="tdr-sub" data-r="sub"></div>' +
          '<div class="tdr-tiles" data-r="tiles"></div>' +
          '<div data-r="rec"></div>' +
        '</div>' +
        '<div class="tdr-body" data-r="body">' +
          '<div class="tdr-controls" data-r="controls" hidden>' +
            '<div class="tdr-f"><label>Order</label><select data-f="sort">' +
              '<option value="newest">Newest first</option><option value="oldest">Oldest first</option>' +
              '<option value="units_desc">Biggest win</option><option value="units_asc">Biggest loss</option></select></div>' +
            '<div class="tdr-f"><label>Result</label><select data-f="result">' +
              '<option value="all">All results</option><option value="won">Wins</option>' +
              '<option value="lost">Losses</option><option value="push">Pushes</option></select></div>' +
            '<div class="tdr-f"><label>League</label><select data-f="sport"><option value="all">All leagues</option></select></div>' +
            '<div class="tdr-f"><label>Bet type</label><select data-f="market"><option value="all">All bet types</option></select></div>' +
            '<div class="tdr-f" data-opt="side" hidden><label>Home / away</label><select data-f="side">' +
              '<option value="all">Both</option><option value="home">Home</option><option value="away">Away</option></select></div>' +
            '<div class="tdr-f" data-opt="favdog" hidden><label>Fav / dog</label><select data-f="favdog">' +
              '<option value="all">Both</option><option value="favorite">Favorite</option><option value="underdog">Underdog</option></select></div>' +
            '<div class="tdr-f"><label>From</label><input type="date" data-f="from"></div>' +
            '<div class="tdr-f"><label>To</label><input type="date" data-f="to"></div>' +
            '<div class="tdr-f"><label>Search</label><input type="search" data-f="q" placeholder="Team, player, matchup"></div>' +
            '<button class="tdr-btn" type="button" data-a="reset">Reset</button>' +
            (this.inline || o.localRows ? '' : '<a class="tdr-btn" data-a="full" href="#">Full page ↗</a>') +
          '</div>' +
          '<div class="tdr-count" data-r="count"></div>' +
          '<div class="tdr-shell"><table class="tdr-table"><thead><tr>' +
            '<th>Date</th><th>League</th><th>Matchup</th><th>Selection</th><th>Line</th>' +
            '<th class="n">Odds</th><th class="n">Units</th><th>Result</th><th class="n">Net</th><th class="n">Running</th>' +
          '</tr></thead><tbody data-r="rows"><tr><td colspan="10"><div class="tdr-msg">Loading…</div></td></tr></tbody></table></div>' +
          '<div class="tdr-more" data-r="more" hidden><button class="tdr-btn" type="button" data-a="more">Load 50 more</button></div>' +
          '<p class="tdr-note" data-r="note"></p>' +
        '</div>' +
      '</div>';
    var self = this;
    this.$ = function (k) { return self.host.querySelector('[data-r="' + k + '"]'); };
    this.f = function (k) { return self.host.querySelector('[data-f="' + k + '"]'); };

    var timer = null;
    this.host.addEventListener('change', function (e) {
      if (e.target && e.target.getAttribute('data-f')) self.load(true);
    });
    this.host.addEventListener('input', function (e) {
      if (e.target && e.target.getAttribute('data-f') === 'q') {
        clearTimeout(timer);
        timer = setTimeout(function () { self.load(true); }, 280);
      }
    });
    this.host.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-a]');
      if (a) {
        var act = a.getAttribute('data-a');
        if (act === 'more') { self.load(false); return; }
        if (act === 'reset') {
          ['sort', 'result', 'sport', 'market', 'side', 'favdog'].forEach(function (k) {
            var el = self.f(k); if (el) el.value = k === 'sort' ? 'newest' : 'all';
          });
          ['from', 'to', 'q'].forEach(function (k) { var el = self.f(k); if (el) el.value = ''; });
          self.load(true);
          return;
        }
        if (act === 'full') { a.setAttribute('href', fullPageHref(self.o)); return; }
      }
      var tr = e.target.closest && e.target.closest('tr[data-pick-id]:not([data-pick-id=""]):not([data-pick-id="null"])');
      if (tr && !e.target.closest('a')) {
        window.location.href = '/pick/?id=' + encodeURIComponent(tr.getAttribute('data-pick-id'));
      }
    });
  };

  Ledger.prototype.query = function () {
    var o = this.o, p = new URLSearchParams();
    p.set('category', o.category);
    p.set('bucket', o.bucket == null ? '' : String(o.bucket));
    (o.and || []).forEach(function (a) { p.append('and', a); });
    if (o.extra) {
      new URLSearchParams(String(o.extra).replace(/^[&?]/, '')).forEach(function (v, k) { p.append(k, v); });
    }
    p.set('limit', String(PAGE));
    p.set('offset', String(this.offset));
    var self = this;
    ['sort', 'result', 'sport', 'market', 'side', 'favdog', 'from', 'to', 'q'].forEach(function (k) {
      var el = self.f(k);
      if (!el) return;
      var v = String(el.value || '').trim();
      if (v && v !== 'all' && !(k === 'sort' && v === 'newest')) p.set(k, v);
    });
    if (!p.has('sort')) p.set('sort', 'newest');
    return p;
  };

  Ledger.prototype.load = function (reset) {
    if (this.loading) return;
    this.loading = true;
    if (reset) { this.offset = 0; this.rows = []; }
    var self = this, o = this.o;
    var headers = { Accept: 'application/json' };
    var t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    var q = this.query();
    var url = o.endpoint
      ? o.endpoint(q)
      : API + '/users/' + encodeURIComponent(o.user) + '/stats/drilldown?' + q.toString();
    var pending = o.localRows
      ? Promise.resolve(typeof o.localRows === 'function' ? o.localRows() : o.localRows)
          .then(function (rows) { return localPage(rows || [], q, o); })
      : fetch(url, { headers: headers, cache: 'no-store' })
          .then(function (r) {
            /* A category newer than the API the page is talking to falls back
               to the closest older one rather than a dead panel. */
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          })
          .then(function (d) {
            /* An API older than these categories files an unknown category
               under an empty bucket instead of rejecting it; it also does not
               send filters_supported. Retry with the exact older equivalent. */
            var legacy = d && !d.filters_supported && !o._fellBack ? legacyOpts(o) : null;
            if (!legacy) return d;
            self.o = legacy;
            self.loading = false;
            var t = self.host.querySelector('.tdr-title');
            if (t) t.textContent = legacy.label || '';
            self.load(true);
            return null;
          });
    pending
      .then(function (d) {
        if (!d) return;
        self.loading = false;
        self.data = d;
        self.rows = self.rows.concat(d.picks || []);
        self.offset = self.rows.length;
        if (reset) self.renderHead(d);
        self.fillOptions(d);
        self.renderRows(d);
        self.$('controls').hidden = false;
      })
      .catch(function (err) {
        self.loading = false;
        self.$('rows').innerHTML = '<tr><td colspan="10"><div class="tdr-msg err">Could not load these picks (' +
          esc(err.message) + '). Try again in a moment.</div></td></tr>';
        self.$('line').textContent = '';
      });
  };

  Ledger.prototype.renderHead = function (d) {
    var s = d.summary || {}, o = this.o;
    var total = num(s.total_picks);
    var dec = num(s.wins) + num(s.losses);
    this.$('line').innerHTML =
      '<span>' + esc(recordText(s)) + '</span><span class="sep">|</span>' +
      '<span class="' + tone(s.net_units) + '">' + signed(s.net_units, 'u', 2) + '</span><span class="sep">|</span>' +
      '<span>' + (dec ? num(s.win_rate).toFixed(1) + '%' : '—') + '</span>';
    var who = d.username || o.user;
    var bits = [];
    if (who) bits.push('<a href="/u/' + encodeURIComponent(who) + '/">@' + esc(who) + '</a>');
    bits.push('<strong>' + total + '</strong> historical pick' + (total === 1 ? '' : 's'));
    if (d.hidden_picks) bits.push(d.hidden_picks + ' private pick' + (d.hidden_picks === 1 ? ' is' : 's are') + ' counted but not listed');
    this.$('sub').innerHTML = bits.join(' · ');
    var tiles = [
      ['Picks', String(total), ''],
      ['Record', recordText(s), ''],
      ['Win %', dec ? num(s.win_rate).toFixed(1) + '%' : '—', ''],
      ['Net units', signed(s.net_units, 'u', 2), tone(s.net_units)],
      ['Risked', num(s.total_units_risked).toFixed(2) + 'u', ''],
      ['ROI', signed(s.roi, '%', 2), tone(s.roi)],
      ['Avg odds', american(s.avg_odds), '']
    ];
    this.$('tiles').innerHTML = tiles.map(function (t) {
      return '<div class="tdr-tile"><div class="k">' + t[0] + '</div><div class="v ' + t[2] + '">' + esc(t[1]) + '</div></div>';
    }).join('');

    var rec = reconcile(o.expect, s);
    var box = this.$('rec');
    if (rec && rec.ok) {
      box.innerHTML = '<div class="tdr-rec ok">✓ Reconciled: the ' + total + ' picks below add up to exactly ' +
        esc(recordText(s)) + ' and ' + signed(s.net_units, 'u', 2) + ', the figure you clicked.</div>';
    } else if (rec) {
      box.innerHTML = '<div class="tdr-rec bad">The figure on the page (' + rec.bad.map(function (c) {
        return esc(c[0] + ' ' + c[1]);
      }).join(', ') + ') differs from this ledger (' + rec.bad.map(function (c) {
        return esc(c[2]);
      }).join(', ') + '). The ledger below is the graded source of truth.</div>';
      if (window.console) console.error('[TMRDrill] reconciliation mismatch', o, rec);
    } else {
      box.innerHTML = '';
    }
    var sup = d.filters_supported || [];
    var side = this.host.querySelector('[data-opt="side"]');
    var fd = this.host.querySelector('[data-opt="favdog"]');
    if (side) side.hidden = sup.indexOf('side') < 0;
    if (fd) fd.hidden = sup.indexOf('favdog') < 0;
  };

  Ledger.prototype.fillOptions = function (d) {
    if (this.optionsFilled) return;
    var sportSel = this.f('sport'), marketSel = this.f('market');
    var sports = d.facets && d.facets.sports, markets = d.facets && d.facets.markets;
    if (!sports) {
      sports = {}; markets = {};
      (d.picks || []).forEach(function (p) {
        if (p.sport_key) sports[p.sport_key] = p.league || p.sport_key;
        if (p.market_type) markets[p.market_type] = p.market_label || titleize(p.market_type);
      });
    }
    var add = function (sel, map) {
      Object.keys(map).sort(function (a, b) { return String(map[a]).localeCompare(String(map[b])); })
        .forEach(function (k) {
          var op = document.createElement('option'); op.value = k; op.textContent = map[k]; sel.appendChild(op);
        });
    };
    add(sportSel, sports);
    add(marketSel, markets);
    this.optionsFilled = true;
  };

  function rowHtml(p) {
    var st = p.status === 'pushed' ? 'push' : p.status;
    var bet = esc(p.pick_label || p.selection || '—');
    if (p.player_name && bet.indexOf(esc(p.player_name)) < 0) bet = esc(p.player_name) + ' · ' + bet;
    var score = p.final_score ? '<br><span class="tdr-dim">' + esc(p.final_score) + '</span>' : '';
    return '<tr data-pick-id="' + esc(p.id) + '">' +
      '<td data-k="Date">' + esc(fmtDate(p.date)) + '</td>' +
      '<td data-k="League">' + esc(p.league || p.sport_key || '—') + '</td>' +
      '<td class="wide" data-k="Game">' + (p.matchup ? esc(p.matchup) : '<span class="tdr-dim">—</span>') + score + '</td>' +
      '<td class="wide"><span class="tdr-bet">' + bet + '</span>' +
        (p.market_label ? '<br><span class="tdr-dim">' + esc(p.market_label) + '</span>' : '') + '</td>' +
      '<td data-k="Line">' + esc(p.line_label || (p.line == null ? '—' : p.line)) + '</td>' +
      '<td class="n" data-k="Odds">' + american(p.odds) + '</td>' +
      '<td class="n" data-k="Units">' + num(p.risk_units).toFixed(2) + 'u</td>' +
      '<td data-k="Result"><span class="tdr-tag ' + esc(st) + '">' + (st === 'won' ? 'Win' : st === 'lost' ? 'Loss' : st === 'void' ? 'Void' : 'Push') + '</span></td>' +
      '<td class="n ' + tone(p.result_units) + '" data-k="Net">' + signed(p.result_units, 'u', 2) + '</td>' +
      '<td class="n ' + tone(p.running_units) + '" data-k="Running">' + (p.running_units == null ? '—' : signed(p.running_units, 'u', 2)) + '</td>' +
      '</tr>';
  }

  Ledger.prototype.renderRows = function (d) {
    var body = this.$('rows');
    body.innerHTML = this.rows.length
      ? this.rows.map(rowHtml).join('')
      : '<tr><td colspan="10"><div class="tdr-msg">No picks match these filters.</div></td></tr>';
    var listed = num(d.listed), total = num(d.total);
    var f = d.filtered || d.summary || {};
    var narrowed = listed !== total || num(d.hidden_picks) > 0;
    this.$('count').innerHTML = 'Showing <strong>' + this.rows.length + '</strong> of <strong>' + listed +
      '</strong> pick' + (listed === 1 ? '' : 's') +
      (listed !== total ? ' matching your filters (' + esc(f.record_full || recordText(f)) + ', ' +
        signed(f.net_units, 'u', 2) + ', ' + signed(f.roi, '%', 2) + ' ROI)' : '') + '.';
    this.$('more').hidden = this.rows.length >= listed;
    this.$('note').innerHTML = narrowed && listed !== total
      ? 'The header always describes all ' + total + ' picks behind the figure you clicked; filters only narrow the list.'
      : 'These picks are selected by the same rule, from the same graded ledger, that produced the figure you clicked. Click any pick to open it.';
  };

  /* ---------------------------------------------------------------- modal */
  var openModal = null;
  var lastFocus = null;
  function close() {
    if (!openModal) return;
    openModal.remove();
    openModal = null;
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }
  function fullPageHref(o) {
    var p = new URLSearchParams();
    p.set('user', o.user || '');
    p.set('category', o.category);
    p.set('bucket', o.bucket == null ? '' : String(o.bucket));
    if (o.label) p.set('label', String(o.label).slice(0, 140));
    if (o.context) p.set('context', String(o.context).slice(0, 140));
    (o.and || []).forEach(function (a) { p.append('and', a); });
    var extra = o.extra ? '&' + String(o.extra).replace(/^[&?]/, '') : '';
    return '/pick-history/?' + p.toString() + extra;
  }
  function open(o) {
    if (!o || !o.category || (!o.user && !o.endpoint && !o.localRows)) return;
    ensureCss();
    close();
    lastFocus = document.activeElement;
    var back = document.createElement('div');
    back.className = 'tdr-back';
    document.body.appendChild(back);
    openModal = back;
    document.documentElement.style.overflow = 'hidden';
    new Ledger(back, o, false);
    back.addEventListener('click', function (e) {
      if (e.target === back || (e.target.closest && e.target.closest('.tdr-close'))) close();
    });
    var btn = back.querySelector('.tdr-close');
    if (btn) btn.focus();
  }
  function mount(host, o) {
    ensureCss();
    host.classList.add('tdr-inline');
    return new Ledger(host, o, true);
  }

  /* Local ledgers registered by a page: window.__tmrDrillReg[id] =
     { rows: [...] | function, label, context, user, hidden }. A page can
     register before this file loads. */
  function register(id, entry) {
    window.__tmrDrillReg = window.__tmrDrillReg || {};
    window.__tmrDrillReg[id] = entry;
    return id;
  }
  function optsFromEl(el) {
    var localId = el.getAttribute('data-drill-local');
    if (localId) {
      var reg = (window.__tmrDrillReg || {})[localId] || {};
      return {
        user: reg.user || el.getAttribute('data-drill-user') || '',
        category: 'local',
        label: el.getAttribute('data-drill-label') || reg.label || '',
        context: el.getAttribute('data-drill-context') || reg.context || '',
        localRows: reg.rows || [],
        hiddenCount: reg.hidden || 0,
        expect: parseExpect(el)
      };
    }
    var userEl = el.closest('[data-drill-user]');
    var pageUser = typeof window.TMR_DRILL_USER === 'function' ? window.TMR_DRILL_USER() : window.TMR_DRILL_USER;
    var user = el.getAttribute('data-drill-user') || (userEl && userEl.getAttribute('data-drill-user')) ||
               pageUser || '';
    var ctxEl = el.closest('[data-drill-context]');
    return {
      user: user,
      category: el.getAttribute('data-drill-category'),
      bucket: el.getAttribute('data-drill-bucket') || '',
      label: el.getAttribute('data-drill-label') || '',
      context: el.getAttribute('data-drill-context') || (ctxEl && ctxEl.getAttribute('data-drill-context')) || '',
      extra: el.getAttribute('data-drill-extra') || '',
      expect: parseExpect(el)
    };
  }

  /* One delegated listener for the whole site. Capture phase so a drillable
     cell inside a row that also expands wins the click. A real link or form
     control inside a drillable row keeps its own behavior. */
  function onActivate(e) {
    if (!e.target || !e.target.closest) return;
    if (openModal && openModal.contains(e.target)) return;
    var el = e.target.closest('[data-drill-category],[data-drill-local]');
    if (!el) {
      /* A stat row whose Picks cell is the door: every other number in that
         row (record, win %, units, ROI) opens the same picks. The row's label
         cell keeps its own behavior (a link, or an inline breakdown). */
      var td = e.target.closest('td.num, td.n');
      var tr = td && td.parentNode;
      if (tr && tr.tagName === 'TR') el = tr.querySelector('[data-drill-category]');
      if (!el) return;
    }
    if (e.target.closest('a[href], button, input, select, textarea, [data-drill-ignore]')) {
      var ctl = e.target.closest('a[href], button, input, select, textarea, [data-drill-ignore]');
      if (el.contains(ctl) && ctl !== el) return;
    }
    if (e.type === 'keydown') {
      if (e.key !== 'Enter' && e.key !== ' ') return;
    }
    var o = optsFromEl(el);
    if (!o.user && !o.localRows) return;
    e.preventDefault();
    e.stopPropagation();
    if (!o.localRows && (e.metaKey || e.ctrlKey || e.button === 1)) { window.open(fullPageHref(o), '_blank'); return; }
    open(o);
  }
  document.addEventListener('click', onActivate, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openModal) { close(); return; }
    onActivate(e);
  }, true);

  window.TMRDrill = {
    open: open,
    close: close,
    mount: mount,
    fullPageHref: fullPageHref,
    parseExpect: parseExpect,
    reconcile: reconcile,
    summarize: summarize,
    register: register,
    ctaHtml: function (text) { return '<span class="tdr-cta" aria-hidden="true">' + esc(text || 'View picks') + ' ›</span>'; }
  };
  ensureCss();
})();
