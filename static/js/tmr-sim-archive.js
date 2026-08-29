/**
 * TrustMyRecord - Simulation Archive, client library.
 *
 * ONE FILE FOR EVERY SPORT. The archive API is sport-agnostic: the same
 * /api/sim-archive endpoints answer for MLB, NFL, NBA, NHL and anything added
 * later, and every sport-specific word in the output ("runs" vs "goals",
 * "inning" vs "period", "Extra innings" vs "Shootout") arrives inside the
 * payload rather than being hardcoded here. That is why a new simulator gets
 * these pages for free.
 *
 * HOW A PAGE USES IT
 *
 * Declaratively. Drop an element with a data-sa attribute and this file fills
 * it in:
 *
 *   <div data-sa="overview" data-sport="nba"></div>
 *   <div data-sa="recent"   data-sport="nba" data-limit="10"></div>
 *   <div data-sa="leaders"  data-sport="nba"></div>
 *   <div data-sa="matchup"  data-sport="nba" data-slug="celtics-vs-knicks"></div>
 *   <div data-sa="team"     data-sport="nba" data-team="BOS"></div>
 *   <div data-sa="run"></div>                       <!-- ?id= from the URL -->
 *   <div data-sa="panel"    data-sport="nba"></div> <!-- the simulator-page embed -->
 *
 * SAFETY PROPERTIES IT INHERITS FROM THE SIMULATOR PAGES
 *
 *   - It never touches a simulator's own DOM, state or rendering path. On a
 *     simulator page it renders into its own container, below the result.
 *   - Every fetch is failure-tolerant. A panel that cannot load says so in its
 *     own box; nothing else on the page changes.
 *   - Nothing is written into the DOM as HTML from API data. Text goes in as
 *     text, so a team name can never become markup.
 */
(function (window, document) {
  'use strict';

  var ENDPOINT = '/sim-archive';

  /* ================================================================ */
  /* Transport                                                        */
  /* ================================================================ */

  function apiBase() {
    // config.js declares a page-scope `CONFIG` const, not a window property.
    var cfg = (typeof CONFIG !== 'undefined' && CONFIG) ? CONFIG : null;
    return (cfg && cfg.api && cfg.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api';
  }

  function qs(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === null || v === undefined || v === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  function api(path, params) {
    var url = ENDPOINT + path + qs(params);
    if (window.api && typeof window.api.request === 'function') {
      return window.api.request(url, {});
    }
    return fetch(apiBase() + url, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) {
          return r.json().catch(function () { return {}; }).then(function (body) {
            var err = new Error(body.error || ('http_' + r.status));
            err.status = r.status;
            throw err;
          });
        }
        return r.json();
      });
  }

  /* ================================================================ */
  /* Formatting                                                       */
  /* ================================================================ */

  function num(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function commas(v) {
    var n = num(v);
    if (n === null) return '—';
    return n.toLocaleString('en-US');
  }
  function dec(v, digits) {
    var n = num(v);
    if (n === null) return '—';
    return n.toFixed(digits === undefined ? 2 : digits);
  }
  function pctText(v) {
    var n = num(v);
    return n === null ? '—' : (n.toFixed(1) + '%');
  }

  /** "18 seconds ago", "1 minute ago", "3 hours ago", then a date. */
  function ago(iso) {
    var then = Date.parse(iso);
    if (!Number.isFinite(then)) return '';
    var s = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (s < 5) return 'just now';
    if (s < 60) return s + ' second' + (s === 1 ? '' : 's') + ' ago';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' minute' + (m === 1 ? '' : 's') + ' ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' hour' + (h === 1 ? '' : 's') + ' ago';
    var d = Math.round(h / 24);
    if (d < 30) return d + ' day' + (d === 1 ? '' : 's') + ' ago';
    return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ================================================================ */
  /* DOM helpers - text is inserted as text, never as markup           */
  /* ================================================================ */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function frag() { return document.createDocumentFragment(); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function append(parent) {
    for (var i = 1; i < arguments.length; i += 1) {
      var child = arguments[i];
      if (child) parent.appendChild(child);
    }
    return parent;
  }
  function logo(src, alt) {
    if (!src) return null;
    var img = document.createElement('img');
    img.src = src;
    img.alt = alt ? (alt + ' logo') : '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 30; img.height = 30;
    // A crest that fails to load is HIDDEN AND STRIPPED OF ITS ALT TEXT, not
    // removed.
    //
    // Removing it changes the width of every row it was in, so a feed where some
    // logos resolve and some do not ends up with rows at different indents. But
    // hiding it alone is not enough either: a broken image keeps a box sized to
    // its ALT TEXT, so "Archive Voyagers logo" reserved a hundred and fifty
    // invisible pixels and pushed the club name into the middle of its column.
    // Clearing the alt collapses the box back to the declared 20 or 30 pixels,
    // which is the space the crest would have taken anyway.
    img.addEventListener('error', function () {
      img.alt = '';
      img.style.visibility = 'hidden';
    });
    return img;
  }

  function skeleton(container, rows) {
    clear(container);
    for (var i = 0; i < (rows || 4); i += 1) container.appendChild(el('div', 'sa-skel sa-skel-row'));
  }
  function empty(container, title, body, cta) {
    clear(container);
    var box = el('div', 'sa-empty');
    append(box, el('div', 'sa-empty-title', title), body ? el('p', null, body) : null);
    if (cta) {
      var a = el('a', 'sa-cta', cta.label);
      a.href = cta.href;
      box.appendChild(a);
    }
    container.appendChild(box);
  }
  function errorState(container, message) {
    clear(container);
    container.appendChild(el('div', 'sa-error', message
      || 'Simulation data could not be loaded right now. The simulator itself is unaffected.'));
  }

  function panel(title, note) {
    var wrap = el('section', 'sa-panel');
    var head = el('div', 'sa-panel-head');
    append(head, el('h2', null, title), note ? el('span', 'sa-note', note) : null);
    var body = el('div', 'sa-panel-body');
    append(wrap, head, body);
    return { root: wrap, head: head, body: body };
  }

  /* ================================================================ */
  /* Components                                                       */
  /* ================================================================ */

  function metricCard(label, value, sub, accent) {
    var card = el('div', 'sa-metric' + (accent ? ' is-accent' : ''));
    append(card,
      el('div', 'sa-metric-label', label),
      el('div', 'sa-metric-value', value));
    if (sub) card.appendChild(el('div', 'sa-metric-sub', sub));
    return card;
  }

  function matchupCard(label, matchup, accent) {
    var card = el('div', 'sa-metric' + (accent ? ' is-accent' : ''));
    card.appendChild(el('div', 'sa-metric-label', label));
    if (!matchup) {
      card.appendChild(el('div', 'sa-metric-value', '—'));
      card.appendChild(el('div', 'sa-metric-sub', 'No simulations yet'));
      return card;
    }
    var teams = el('div', 'sa-metric-teams');
    (matchup.teams || []).forEach(function (t) {
      var img = logo(t.logo, t.name || t.abbr);
      if (img) { img.width = 26; img.height = 26; teams.appendChild(img); }
    });
    teams.appendChild(el('b', null, matchup.label || matchup.pair_key));
    append(card, teams, el('div', 'sa-metric-sub', commas(matchup.runs) + ' simulations'));
    return card;
  }

  /** A run as one line in a feed. Anchors to its own archived box score. */
  function feedItem(run, opts) {
    var href = (opts && opts.runPath ? opts.runPath : runPathFor(run.sport)) + '?id=' + encodeURIComponent(run.id);
    var a = el('a', 'sa-feed-item');
    a.href = href;

    var left = el('div', null);
    var score = el('div', 'sa-feed-score');
    var awayWon = run.winner_abbr && run.winner_abbr === run.away.abbr;
    var homeWon = run.winner_abbr && run.winner_abbr === run.home.abbr;

    var awayImg = logo(run.away.logo, run.away.name || run.away.abbr);
    if (awayImg) { awayImg.width = 22; awayImg.height = 22; score.appendChild(awayImg); }
    score.appendChild(el('b', awayWon ? 'sa-win' : null,
      (run.away.name || run.away.abbr) + ' ' + run.away.score));
    score.appendChild(el('span', 'sa-dash', '—'));
    var homeImg = logo(run.home.logo, run.home.name || run.home.abbr);
    if (homeImg) { homeImg.width = 22; homeImg.height = 22; score.appendChild(homeImg); }
    score.appendChild(el('b', homeWon ? 'sa-win' : null,
      (run.home.name || run.home.abbr) + ' ' + run.home.score));

    var meta = el('div', 'sa-feed-meta');
    meta.appendChild(el('span', null, String(run.league || run.sport).toUpperCase()));
    meta.appendChild(el('span', null, '•'));
    meta.appendChild(el('span', null, ago(run.recorded_at)));
    if (run.overtime) {
      meta.appendChild(el('span', null, '•'));
      meta.appendChild(el('span', null, run.shootout ? 'Shootout' : (run.decided_in === 'extra_innings' ? 'Extra innings' : 'Overtime')));
    }
    if (run.scope && run.scope !== 'default') {
      meta.appendChild(el('span', null, '•'));
      meta.appendChild(el('span', null, run.scope === 'historical' ? 'Historical teams' : 'Custom settings'));
    }

    append(left, score, meta);
    append(a, left, el('span', 'sa-feed-cta', 'View box score'));
    return a;
  }

  function rankRow(item, sport, index) {
    var a = el('a', 'sa-rank');
    a.href = matchupPathFor(sport) + '?' + (item.pair_slug
      ? 'slug=' + encodeURIComponent(item.pair_slug)
      : 'matchup=' + encodeURIComponent(item.pair_key));
    a.appendChild(el('span', 'sa-rank-n', String(item.rank || index + 1)));
    var logos = el('span', 'sa-rank-logos');
    (item.teams || []).forEach(function (t) {
      var img = logo(t.logo, t.name || t.abbr);
      if (img) { img.width = 22; img.height = 22; logos.appendChild(img); }
    });
    a.appendChild(logos);
    a.appendChild(el('span', 'sa-rank-label', item.label || item.pair_key));
    var count = el('span', 'sa-rank-count', commas(item.runs));
    count.appendChild(el('span', null, 'sims'));
    a.appendChild(count);
    return a;
  }

  /** A two-or-three-way share bar. Values are percentages that sum to ~100. */
  function winBar(parts) {
    var wrap = el('div', 'sa-winbar');
    var track = el('div', 'sa-winbar-track');
    var total = parts.reduce(function (s, p) { return s + (num(p.pct) || 0); }, 0) || 100;
    parts.forEach(function (p) {
      var v = num(p.pct) || 0;
      if (v <= 0) return;
      var seg = el('div', p.className);
      seg.style.width = ((v / total) * 100).toFixed(2) + '%';
      if (v >= 12) seg.appendChild(el('span', null, v.toFixed(1) + '%'));
      track.appendChild(seg);
    });
    wrap.appendChild(track);
    var legend = el('div', 'sa-winbar-legend');
    parts.forEach(function (p) {
      var side = el('div', null);
      side.appendChild(el('b', null, p.label));
      side.appendChild(document.createTextNode(' ' + pctText(p.pct)
        + (p.count !== undefined ? ' (' + commas(p.count) + ')' : '')));
      legend.appendChild(side);
    });
    wrap.appendChild(legend);
    return wrap;
  }

  /** A compact column chart. Buckets arrive already sorted from the API. */
  function histogram(buckets, opts) {
    var o = opts || {};
    var wrap = el('div', null);
    if (!buckets || !buckets.length) return wrap;
    var trimmed = buckets.length > 24 ? buckets.slice(0, 24) : buckets;
    var peak = trimmed.reduce(function (m, b) { return Math.max(m, b.count); }, 0) || 1;
    var chart = el('div', 'sa-hist');
    var axis = el('div', 'sa-hist-axis');
    trimmed.forEach(function (b) {
      var col = el('div', 'sa-hist-col' + (b.count === peak ? ' is-peak' : ''));
      var bar = el('div', 'sa-hist-bar');
      bar.style.height = Math.max(2, Math.round((b.count / peak) * 100)) + '%';
      bar.title = (o.label ? o.label + ' ' : '') + b.key + ': ' + commas(b.count)
        + ' simulation' + (b.count === 1 ? '' : 's') + ' (' + pctText(b.pct) + ')';
      col.appendChild(bar);
      chart.appendChild(col);
      axis.appendChild(el('span', null, b.key));
    });
    append(wrap, chart, axis);
    return wrap;
  }

  /** A volume trend as a filled sparkline. Pure inline SVG, no library. */
  function sparkline(points) {
    var w = 600;
    var h = 64;
    if (!points || points.length < 2) return null;
    var max = points.reduce(function (m, p) { return Math.max(m, p.runs); }, 0) || 1;
    var step = w / (points.length - 1);
    var coords = points.map(function (p, i) {
      return [i * step, h - 4 - ((p.runs / max) * (h - 10))];
    });
    var line = coords.map(function (c, i) {
      return (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1);
    }).join(' ');
    var area = line + ' L' + w + ' ' + h + ' L0 ' + h + ' Z';

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'sa-spark');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Simulations per day over the last '
      + points.length + ' days, peaking at ' + max);
    var fill = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    fill.setAttribute('class', 'sa-spark-fill');
    fill.setAttribute('d', area);
    var stroke = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    stroke.setAttribute('d', line);
    append(svg, fill, stroke);
    return svg;
  }

  function statGrid(stats) {
    var grid = el('div', 'sa-statgrid');
    (stats || []).forEach(function (s) {
      var cell = el('div', 'sa-stat');
      append(cell,
        el('div', 'sa-stat-label', s.label),
        el('div', 'sa-stat-value', s.kind === 'rate' || s.kind === 'pct'
          ? pctText(s.value)
          : dec(s.value, s.digits === undefined ? 2 : s.digits)));
      if (s.samples !== undefined && s.samples !== null) {
        cell.appendChild(el('div', 'sa-stat-note', commas(s.samples) + ' simulations'));
      }
      grid.appendChild(cell);
    });
    return grid;
  }

  /* ================================================================ */
  /* Paths                                                            */
  /* ================================================================ */

  var SPORT_PATHS = {};   // filled from /sports so nothing is hardcoded

  function resultsPathFor(sport) {
    var s = SPORT_PATHS[sport];
    return (s && s.results_path) || ('/' + sport + '-simulator/results/');
  }
  function matchupPathFor(sport) { return resultsPathFor(sport) + 'matchup/'; }
  function teamPathFor(sport) { return resultsPathFor(sport) + 'team/'; }
  function runPathFor(sport) { return resultsPathFor(sport) + 'run/'; }
  function simulatorPathFor(sport) {
    var s = SPORT_PATHS[sport];
    return (s && s.simulator_path) || ('/' + sport + '-simulator/');
  }

  var sportsLoaded = null;
  function loadSports() {
    if (sportsLoaded) return sportsLoaded;
    sportsLoaded = api('/sports').then(function (data) {
      (data.sports || []).forEach(function (s) { SPORT_PATHS[s.sport] = s; });
      return SPORT_PATHS;
    }).catch(function () { return SPORT_PATHS; });
    return sportsLoaded;
  }

  /* ================================================================ */
  /* Views                                                            */
  /* ================================================================ */

  /** The metric cards plus the volume trend. */
  function renderOverview(container, sport, opts) {
    var o = opts || {};
    clear(container);
    var metrics = el('div', 'sa-metrics');
    for (var i = 0; i < (o.compact ? 4 : 6); i += 1) metrics.appendChild(el('div', 'sa-skel sa-skel-metric'));
    container.appendChild(metrics);

    return api('/overview', { sport: sport }).then(function (data) {
      var c = data.counters || {};
      clear(container);
      var grid = el('div', 'sa-metrics');
      append(grid,
        metricCard('Simulations today', commas(c.today),
          c.yesterday ? commas(c.yesterday) + ' yesterday' : null, true),
        metricCard('All-time simulations', commas(c.all_time),
          c.average_per_day ? commas(c.average_per_day) + ' per day on average' : null),
        matchupCard('Most simulated today', data.most_simulated_today),
        matchupCard('Most simulated all time', data.most_simulated_all_time));
      if (!o.compact) {
        append(grid,
          metricCard('Last 7 days', commas(c.last_7_days),
            c.last_30_days ? commas(c.last_30_days) + ' in the last 30' : null),
          metricCard('Unique matchups', commas(c.unique_matchups),
            c.teams_simulated ? commas(c.teams_simulated) + ' clubs simulated' : null));
      }
      container.appendChild(grid);

      if (!o.compact && data.volume_trend && data.volume_trend.length > 1) {
        var p = panel('Simulation volume', 'Last 30 days');
        var spark = sparkline(data.volume_trend);
        if (spark) {
          p.body.appendChild(spark);
          var labels = el('div', 'sa-winbar-legend');
          append(labels,
            el('span', null, data.volume_trend[0].day),
            el('span', null, data.volume_trend[data.volume_trend.length - 1].day));
          p.body.appendChild(labels);
          container.appendChild(p.root);
        }
      }

      if (!o.compact && data.engines && data.engines.length > 1) {
        var ep = panel('Simulation engines', 'Results are aggregated per engine');
        var list = el('ul', 'sa-list');
        data.engines.forEach(function (e) {
          var li = el('li', null);
          var row = el('div', 'sa-rank');
          append(row,
            el('span', 'sa-rank-n', ''),
            el('span', 'sa-rank-logos', ''),
            el('span', 'sa-rank-label', e.engine_major),
            el('span', 'sa-rank-count', commas(e.runs) + ' simulations'));
          li.appendChild(row);
          list.appendChild(li);
        });
        ep.body.className = 'sa-panel-body is-flush';
        ep.body.appendChild(list);
        container.appendChild(ep.root);
      }
      return data;
    }).catch(function (e) {
      errorState(container);
      throw e;
    });
  }

  /** The live feed, with keyset paging and optional polling. */
  function renderRecent(container, sport, opts) {
    var o = opts || {};
    var limit = o.limit || 10;
    var p = panel(o.title || 'Recent simulations', o.note || null);
    p.body.className = 'sa-panel-body is-flush';
    clear(container);
    container.appendChild(p.root);
    skeleton(p.body, Math.min(limit, 6));

    var list = el('ul', 'sa-list');
    var cursor = null;
    var seen = Object.create(null);
    var first = true;

    function draw(runs, prepend) {
      runs.forEach(function (run) {
        if (seen[run.id]) return;
        seen[run.id] = true;
        var li = el('li', null);
        var item = feedItem(run, { runPath: runPathFor(run.sport) });
        if (prepend && !first) item.className += ' is-new';
        li.appendChild(item);
        if (prepend) list.insertBefore(li, list.firstChild);
        else list.appendChild(li);
      });
      while (prepend && list.children.length > limit * 3) list.removeChild(list.lastChild);
    }

    function load(before) {
      return api('/recent', {
        sport: sport, limit: limit, before: before,
        matchup: o.matchup, team: o.team, scope: o.scope,
      }).then(function (data) {
        if (first) {
          clear(p.body);
          if (!data.runs.length) {
            empty(p.body, 'No simulations yet',
              'Run the simulator and the result will appear here within a few seconds.',
              sport ? { label: 'Open the simulator', href: simulatorPathFor(sport) } : null);
            return data;
          }
          p.body.appendChild(list);
        }
        draw(data.runs, false);
        cursor = data.next_cursor;
        if (first && o.paginate !== false) {
          var more = el('button', 'sa-more', 'Load more simulations');
          more.type = 'button';
          more.addEventListener('click', function () {
            if (!cursor) return;
            more.disabled = true;
            more.textContent = 'Loading…';
            load(cursor).then(function () {
              more.disabled = !cursor;
              more.textContent = cursor ? 'Load more simulations' : 'That is the whole archive';
            }).catch(function () {
              more.disabled = false;
              more.textContent = 'Try again';
            });
          });
          p.root.appendChild(more);
        }
        first = false;
        return data;
      });
    }

    var out = load(null).catch(function (e) { errorState(p.body); throw e; });

    // Live refresh. Only while the tab is visible, so a backgrounded page costs
    // nothing, and only the newest page - never a re-fetch of everything.
    if (o.live) {
      var timer = window.setInterval(function () {
        if (document.hidden) return;
        api('/recent', { sport: sport, limit: limit, matchup: o.matchup, team: o.team, scope: o.scope })
          .then(function (data) { draw(data.runs, true); })
          .catch(function () { /* the feed simply does not move this tick */ });
      }, Math.max(15000, o.live));
      window.addEventListener('pagehide', function () { window.clearInterval(timer); });
    }
    return out;
  }

  /** The most-simulated board with its window tabs. */
  function renderLeaders(container, sport, opts) {
    var o = opts || {};
    var windows = [
      { key: 'today', label: 'Today' },
      { key: '7d', label: '7 days' },
      { key: '30d', label: '30 days' },
      { key: 'all', label: 'All time' },
    ];
    var current = o.window || 'today';
    var p = panel(o.title || 'Most simulated matchups');
    var tabs = el('div', 'sa-tabs');
    tabs.setAttribute('role', 'tablist');
    p.head.appendChild(tabs);
    p.body.className = 'sa-panel-body is-flush';
    clear(container);
    container.appendChild(p.root);

    function load(w) {
      current = w;
      Array.prototype.forEach.call(tabs.children, function (b) {
        b.setAttribute('aria-selected', b.dataset.window === w ? 'true' : 'false');
      });
      skeleton(p.body, 5);
      return api('/leaders', { sport: sport, window: w, limit: o.limit || 10, team: o.team })
        .then(function (data) {
          clear(p.body);
          if (!data.leaders.length) {
            empty(p.body, 'Nothing simulated in this window yet',
              w === 'today'
                ? 'Today’s board fills up as visitors run simulations. Try the all-time tab.'
                : 'No simulations were recorded in this window.');
            return data;
          }
          var list = el('ul', 'sa-list');
          data.leaders.forEach(function (item, i) {
            var li = el('li', null);
            li.appendChild(rankRow(item, sport, i));
            list.appendChild(li);
          });
          p.body.appendChild(list);
          return data;
        }).catch(function (e) { errorState(p.body); throw e; });
    }

    windows.forEach(function (w) {
      var b = el('button', 'sa-tab', w.label);
      b.type = 'button';
      b.dataset.window = w.key;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', w.key === current ? 'true' : 'false');
      b.addEventListener('click', function () { load(w.key); });
      tabs.appendChild(b);
    });

    return load(current);
  }

  /** One matchup: the aggregate, the charts, and its archived simulations. */
  function renderMatchup(container, sport, opts) {
    var o = opts || {};
    clear(container);
    var loading = el('div', 'sa-panel');
    loading.appendChild(el('div', 'sa-skel sa-skel-row'));
    container.appendChild(loading);

    return api('/matchup', {
      sport: sport, matchup: o.matchup, slug: o.slug,
      scope: o.scope, engine: o.engine, runs: o.runs || 10,
    }).then(function (data) {
      clear(container);
      if (data.empty_slice || !data.aggregate) {
        empty(container, 'No simulations under these settings yet',
          commas(data.all_runs) + ' simulation'
          + (data.all_runs === 1 ? ' exists' : 's exist') + ' for this matchup under other settings.');
        return data;
      }

      var a = data.teams.a;
      var b = data.teams.b;
      var agg = data.aggregate;

      if (o.heading !== false) {
        var head = el('header', 'sa-head');
        append(head,
          el('div', 'sa-kick', String(data.league || sport).toUpperCase() + ' simulation history'),
          el('h1', null, (a.name || a.abbr) + ' vs. ' + (b.name || b.abbr)),
          el('p', 'sa-sub', commas(agg.simulations) + ' completed simulations of this matchup. '
            + 'Every number below is an average of simulator output, not a prediction and not betting advice.'));
        container.appendChild(head);
      }

      /* headline */
      var top = el('div', 'sa-metrics');
      append(top,
        metricCard('Simulations', commas(agg.simulations), data.engine !== 'all'
          ? 'Engine ' + data.engine : 'All engines combined', true),
        metricCard((a.name || a.abbr) + ' wins', commas(a.wins), pctText(a.win_pct)),
        metricCard((b.name || b.abbr) + ' wins', commas(b.wins), pctText(b.win_pct)),
        metricCard('Average score',
          dec(a.avg_score, 1) + ' – ' + dec(b.avg_score, 1),
          (a.abbr) + ' – ' + (b.abbr)));
      container.appendChild(top);

      /* win share */
      var winPanel = panel('Simulated win share');
      var parts = [
        { label: a.name || a.abbr, pct: a.win_pct, count: a.wins, className: 'sa-winbar-a' },
        { label: b.name || b.abbr, pct: b.win_pct, count: b.wins, className: 'sa-winbar-b' },
      ];
      if (agg.ties) parts.push({ label: 'Ties', pct: agg.tie_pct, count: agg.ties, className: 'sa-winbar-t' });
      winPanel.body.appendChild(winBar(parts));

      var venue = el('div', 'sa-statgrid');
      append(venue,
        statCell('Home win rate', pctText(agg.home_win_pct)),
        statCell('Away win rate', pctText(agg.away_win_pct)),
        statCell('Average total', dec(agg.avg_total, 2)),
        statCell('Average margin', dec(agg.avg_margin, 2)));
      winPanel.body.appendChild(venue);
      container.appendChild(winPanel.root);

      /* sport-specific aggregate */
      var statsPanel = panel(String(data.league || sport).toUpperCase() + ' aggregate',
        'Averaged across ' + commas(agg.simulations) + ' simulations');
      var allStats = (data.sport_stats || []).concat(data.derived_stats || []);
      if (allStats.length) statsPanel.body.appendChild(statGrid(allStats));

      var extremes = el('div', 'sa-statgrid');
      append(extremes,
        statCell('Highest combined score', commas(agg.highest_total)),
        statCell('Lowest combined score', commas(agg.lowest_total)),
        statCell('Most common final', agg.most_common_score ? agg.most_common_score.label : '—',
          agg.most_common_score ? pctText(agg.most_common_score.pct) + ' of simulations' : null),
        statCell('First simulated', agg.first_at ? ago(agg.first_at) : '—'));
      statsPanel.body.appendChild(extremes);
      container.appendChild(statsPanel.root);

      /* distributions */
      var d = data.distributions || {};
      if ((d.total && d.total.length > 1) || (d.margin && d.margin.length > 1)) {
        var chartPanel = panel('Outcome distribution', 'Every simulation, bucketed');
        var grid = el('div', 'sa-grid is-even');
        if (d.total && d.total.length > 1) {
          var totalBox = el('div', null);
          append(totalBox, el('div', 'sa-stat-label', 'Combined score'), histogram(d.total, { label: 'Total' }));
          grid.appendChild(totalBox);
        }
        if (d.margin && d.margin.length > 1) {
          var marginBox = el('div', null);
          append(marginBox, el('div', 'sa-stat-label', 'Winning margin'), histogram(d.margin, { label: 'Margin' }));
          grid.appendChild(marginBox);
        }
        chartPanel.body.appendChild(grid);
        container.appendChild(chartPanel.root);
      }

      /* engine + settings split, published rather than implied */
      if (data.splits && data.splits.length > 1) {
        var splitPanel = panel('What is included', 'Counts by engine and settings');
        var table = el('table', 'sa-table');
        var thead = el('thead');
        var hr = el('tr');
        ['Engine', 'Settings', 'Simulations'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
        thead.appendChild(hr);
        var tbody = el('tbody');
        data.splits.forEach(function (s) {
          var tr = el('tr');
          append(tr,
            el('td', null, s.engine_major),
            el('td', null, s.scope === 'default' ? 'Default' : (s.scope === 'historical' ? 'Historical teams' : 'Custom')),
            el('td', 'sa-num', commas(s.runs)));
          tbody.appendChild(tr);
        });
        append(table, thead, tbody);
        var scroll = el('div', 'sa-scroll');
        scroll.appendChild(table);
        splitPanel.body.appendChild(scroll);
        splitPanel.body.appendChild(el('p', 'sa-foot',
          'Simulations produced by materially different engines or under custom settings are counted '
          + 'separately and are not blended into the headline averages above.'));
        container.appendChild(splitPanel.root);
      }

      /* the individual archived simulations */
      var recentHost = el('div', null);
      container.appendChild(recentHost);
      renderRecent(recentHost, sport, {
        title: 'Recent simulations of this matchup',
        matchup: data.pair_key,
        limit: o.runs || 10,
        live: false,
      });

      return data;
    }).catch(function (e) {
      if (e && e.status === 404) {
        empty(container, 'This matchup has not been simulated yet',
          'Run it on the simulator and it will have its own archive page within seconds.',
          { label: 'Open the simulator', href: simulatorPathFor(sport) });
        return null;
      }
      errorState(container);
      throw e;
    });
  }

  function statCell(label, value, note) {
    var cell = el('div', 'sa-stat');
    append(cell, el('div', 'sa-stat-label', label), el('div', 'sa-stat-value', value));
    if (note) cell.appendChild(el('div', 'sa-stat-note', note));
    return cell;
  }

  /** One club's cumulative simulation record. */
  function renderTeam(container, sport, opts) {
    var o = opts || {};
    clear(container);
    container.appendChild(el('div', 'sa-skel sa-skel-row'));

    return api('/team', { sport: sport, team: o.team, slug: o.slug, scope: o.scope, engine: o.engine })
      .then(function (data) {
        clear(container);
        if (data.empty_slice || !data.aggregate) {
          empty(container, 'No simulations under these settings yet');
          return data;
        }
        var t = data.team;
        var agg = data.aggregate;

        if (o.heading !== false) {
          var head = el('header', 'sa-head');
          var row = el('div', 'sa-head-row');
          var left = el('div', null);
          append(left,
            el('div', 'sa-kick', String(data.league || sport).toUpperCase() + ' simulation results'),
            el('h1', null, (t.name || t.abbr) + ' — simulation results'),
            el('p', 'sa-sub', commas(agg.simulations) + ' completed simulations featuring this club.'));
          row.appendChild(left);
          var img = logo(t.logo, t.name || t.abbr);
          if (img) { img.width = 76; img.height = 76; row.appendChild(img); }
          head.appendChild(row);
          container.appendChild(head);
        }

        var cards = el('div', 'sa-metrics');
        append(cards,
          metricCard('Simulations', commas(agg.simulations), null, true),
          metricCard('Simulated record', agg.record, pctText(agg.win_pct) + ' win rate'),
          metricCard('Average scored', dec(agg.avg_score_for, 2)),
          metricCard('Average allowed', dec(agg.avg_score_against, 2)));
        container.appendChild(cards);

        var splitPanel = panel('Venue split');
        var grid = el('div', 'sa-statgrid');
        append(grid,
          statCell('Home simulations', commas(agg.home_games), pctText(agg.home_win_pct) + ' win rate'),
          statCell('Away simulations', commas(agg.away_games), pctText(agg.away_win_pct) + ' win rate'),
          statCell('Average margin', dec(agg.avg_margin, 2)),
          statCell('Highest score', commas(agg.highest_score)));
        splitPanel.body.appendChild(grid);
        container.appendChild(splitPanel.root);

        var allStats = (data.sport_stats || []).concat(data.derived_stats || []);
        if (allStats.length) {
          var sp = panel(String(data.league || sport).toUpperCase() + ' averages');
          sp.body.appendChild(statGrid(allStats));
          container.appendChild(sp.root);
        }

        if (data.distributions && data.distributions.score && data.distributions.score.length > 1) {
          var dp = panel('Score distribution', 'Every simulated result for this club');
          dp.body.appendChild(histogram(data.distributions.score, { label: 'Score' }));
          container.appendChild(dp.root);
        }

        if (data.opponents && data.opponents.length) {
          var op = panel('By opponent', 'Most simulated matchups');
          op.body.className = 'sa-panel-body is-flush';
          var list = el('ul', 'sa-list');
          data.opponents.forEach(function (row2) {
            var li = el('li', null);
            var a = el('a', 'sa-rank');
            a.href = matchupPathFor(sport) + '?' + (row2.pair_slug
              ? 'slug=' + encodeURIComponent(row2.pair_slug)
              : 'matchup=' + encodeURIComponent(row2.pair_key));
            var logos = el('span', 'sa-rank-logos');
            var oimg = logo(row2.opponent.logo, row2.opponent.name || row2.opponent.abbr);
            if (oimg) { oimg.width = 22; oimg.height = 22; logos.appendChild(oimg); }
            append(a,
              el('span', 'sa-rank-n', ''),
              logos,
              el('span', 'sa-rank-label', 'vs. ' + (row2.opponent.name || row2.opponent.abbr)),
              el('span', 'sa-rank-count', commas(row2.simulations) + ' • ' + pctText(row2.win_pct)));
            li.appendChild(a);
            list.appendChild(li);
          });
          op.body.appendChild(list);
          container.appendChild(op.root);
        }

        var recentHost = el('div', null);
        container.appendChild(recentHost);
        renderRecent(recentHost, sport, {
          title: 'Recent simulations featuring ' + (t.name || t.abbr),
          team: t.abbr, limit: 10,
        });
        return data;
      }).catch(function (e) {
        if (e && e.status === 404) {
          empty(container, 'This club has not appeared in a simulation yet', null,
            { label: 'Open the simulator', href: simulatorPathFor(sport) });
          return null;
        }
        errorState(container);
        throw e;
      });
  }

  /** The club directory: every team that has appeared in a simulation. */
  function renderTeams(container, sport, opts) {
    var o = opts || {};
    var p = panel(o.title || 'Simulation results by club', 'Sorted by simulations');
    p.body.className = 'sa-panel-body is-flush';
    clear(container);
    container.appendChild(p.root);
    skeleton(p.body, 6);

    return api('/teams', { sport: sport }).then(function (data) {
      clear(p.body);
      if (!data.teams.length) {
        empty(p.body, 'No clubs have been simulated yet',
          'Every club that appears in a simulation gets its own cumulative record here.',
          { label: 'Open the simulator', href: simulatorPathFor(sport) });
        return data;
      }
      var scroll = el('div', 'sa-scroll');
      var table = el('table', 'sa-table');
      var thead = el('thead');
      var hr = el('tr');
      ['Club', 'Simulations', 'W', 'L', 'Win rate'].forEach(function (h, i) {
        hr.appendChild(el('th', i === 0 ? 'sa-cell-name' : null, h));
      });
      thead.appendChild(hr);
      var tbody = el('tbody');
      data.teams.forEach(function (t) {
        var tr = el('tr');
        var cell = el('td', 'sa-cell-name');
        var a = el('a', null, t.name || t.abbr);
        a.href = teamPathFor(sport) + '?' + (t.slug
          ? 'slug=' + encodeURIComponent(t.slug) : 'team=' + encodeURIComponent(t.abbr));
        var img = logo(t.logo, t.name || t.abbr);
        if (img) { img.width = 20; img.height = 20; img.style.verticalAlign = 'middle'; img.style.marginRight = '7px'; cell.appendChild(img); }
        cell.appendChild(a);
        append(tr, cell,
          el('td', 'sa-num', commas(t.simulations)),
          el('td', 'sa-num', commas(t.wins)),
          el('td', 'sa-num', commas(t.losses)),
          el('td', 'sa-num', pctText(t.win_pct)));
        tbody.appendChild(tr);
      });
      append(table, thead, tbody);
      scroll.appendChild(table);
      p.body.appendChild(scroll);
      return data;
    }).catch(function (e) { errorState(p.body); throw e; });
  }

  /* ================================================================ */
  /* One archived simulation, reopened in full                        */
  /* ================================================================ */

  function lineScoreTable(run) {
    var d = run.details || {};
    var line = d.line_score;
    var box = d.box_score;
    var away = null;
    var home = null;

    // Each engine names its per-period array differently. Read whichever shape
    // this sport produced rather than assuming one of them.
    if (line && Array.isArray(line.away) && Array.isArray(line.home)) { away = line.away; home = line.home; }
    else if (box && box.away && Array.isArray(box.away.innings)) { away = box.away.innings; home = box.home && box.home.innings; }
    else if (line && Array.isArray(line.quarters)) {
      away = line.quarters.map(function (q) { return Array.isArray(q) ? q[0] : null; });
      home = line.quarters.map(function (q) { return Array.isArray(q) ? q[1] : null; });
    } else if (line && Array.isArray(line.periods)) {
      away = line.periods.map(function (q) { return Array.isArray(q) ? q[0] : null; });
      home = line.periods.map(function (q) { return Array.isArray(q) ? q[1] : null; });
    }
    if (!Array.isArray(away) || !Array.isArray(home) || !away.length) return null;

    var meta = run.sport_meta || {};
    var table = el('table', 'sa-table sa-linescore');
    var thead = el('thead');
    var hr = el('tr');
    hr.appendChild(el('th', null, ''));
    away.forEach(function (_, i) {
      var label = String(i + 1);
      if (meta.regulation_periods && i >= meta.regulation_periods) {
        label = (meta.period_noun === 'inning') ? String(i + 1) : 'OT' + (i - meta.regulation_periods + 1);
      }
      hr.appendChild(el('th', null, label));
    });
    hr.appendChild(el('th', null, 'T'));
    thead.appendChild(hr);

    var tbody = el('tbody');
    [[run.away, away], [run.home, home]].forEach(function (pair) {
      var side = pair[0];
      var cells = pair[1] || [];
      var tr = el('tr');
      tr.appendChild(el('td', null, side.abbr));
      for (var i = 0; i < away.length; i += 1) {
        var v = cells[i];
        tr.appendChild(el('td', 'sa-num', v === null || v === undefined ? '—' : String(v)));
      }
      tr.appendChild(el('td', 'sa-num is-total', String(side.score)));
      tbody.appendChild(tr);
    });
    append(table, thead, tbody);
    return table;
  }

  /**
   * A generic table over a list of player objects. The columns come from the
   * data, so the same renderer serves a batting order, a rotation, a skater
   * list and a passing chart without knowing which it is looking at.
   */
  /**
   * EVERY FIELD THE FOUR ENGINES EMIT, WITH THE HEADER A REAL SHEET PRINTS.
   *
   * An archived run is rendered generically -- the renderer walks whatever was
   * stored -- so it can never show FEWER fields than were captured. What it
   * could do, and did, was show them badly: a column headed `toiEven`, an ice
   * time reading 18.7 rather than 18:42, a save percentage as 0.912. The
   * information was all there; the presentation was not.
   *
   * These labels cover every field in docs/SIMULATOR_COMPLETENESS.md -- NHL 45,
   * NBA 44, MLB 51, NFL 47 -- and anything not listed still falls back to its
   * own key rather than being dropped. Adding a field to an engine can make this
   * list incomplete; it cannot make it wrong.
   */
  var COLUMN_LABELS = {
    name: 'Player', player: 'Player', pos: 'Pos', position: 'Pos',
    rawPos: 'Pos', order: 'Ord', slot: 'Ord', number: '#', role: 'Role',

    /* baseball -- batting */
    ab: 'AB', r: 'R', h: 'H', hr: 'HR', rbi: 'RBI', bb: 'BB', so: 'SO',
    lob: 'LOB', pa: 'PA', b1: '1B', b2: '2B', b3: '3B', tb: 'TB',
    sb: 'SB', cs: 'CS', sf: 'SF', sh: 'SH', hbp: 'HBP', gidp: 'GIDP',
    ibb: 'IBB', sub: 'Sub', subRole: 'Role',
    gameAvg: 'AVG', gameObp: 'OBP', gameSlg: 'SLG', gameOps: 'OPS',
    seasonAvg: 'SEA AVG', seasonObp: 'SEA OBP', seasonSlg: 'SEA SLG',
    seasonOps: 'SEA OPS', statSource: 'Source',
    /* baseball -- pitching */
    ip: 'IP', er: 'ER', bf: 'BF', pitches: 'PC', strikes: 'ST',
    fps: 'FPS', whiff: 'SwStr', ir: 'IR', irs: 'IRS', outs: 'Outs',
    enterMargin: 'Entered', seasonEra: 'SEA ERA',

    /* basketball */
    min: 'MIN', pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK',
    tov: 'TO', pf: 'PF', fgm: 'FGM', fga: 'FGA', fgPct: 'FG%',
    tpm: '3PM', tpa: '3PA', threePct: '3P%', ftm: 'FTM', fta: 'FTA',
    ftPct: 'FT%', oreb: 'OREB', dreb: 'DREB', plusMinus: '+/-',
    fouledOut: 'FO', efgPct: 'eFG%', teamRebounds: 'Team REB',
    pointsOffTurnovers: 'Pts off TO', secondChancePoints: '2nd chance',

    /* hockey -- skaters */
    g: 'G', a: 'A', p: 'PTS', shots: 'SOG', attempts: 'ATT',
    hits: 'HIT', blocks: 'BLK', pim: 'PIM', giveaways: 'GV', takeaways: 'TK',
    faceoffWins: 'FOW', faceoffLosses: 'FOL', faceoffs: 'FO', faceoffPct: 'FO%',
    ppG: 'PPG', shG: 'SHG', shootingPct: 'S%',
    toi: 'TOI', toiEven: 'EV TOI', toiPowerPlay: 'PP TOI', toiShortHanded: 'SH TOI',
    line: 'Line', pair: 'Pair', unit: 'Unit',
    /* hockey -- goaltenders */
    saves: 'SV', goalsAgainst: 'GA', savePct: 'SV%', shotsAgainst: 'SA',
    evenSaves: 'EV SV', evenShots: 'EV SA',
    powerPlaySaves: 'PP SV', powerPlayShots: 'PP SA',
    shortHandedSaves: 'SH SV', shortHandedShots: 'SH SA',
    emptyNetGoalsAgainst: 'EN', emptyNetShotsAgainst: 'EN SA',
    shutout: 'SO', decision: 'DEC',
    /* hockey -- team */
    goals: 'G', powerPlayGoals: 'PPG', powerPlayOpportunities: 'PP',
    powerPlayPct: 'PP%', shortHandedGoals: 'SHG', evenStrengthGoals: 'EV G',

    /* football */
    comp: 'CMP', att: 'ATT', yards: 'YDS', td: 'TD', tds: 'TD',
    int: 'INT', ints: 'INT', sacks: 'SACK', ypa: 'Y/A', rating: 'RTG',
    carries: 'CAR', ypc: 'Y/C', long: 'LNG', fumbles: 'FUM', kneels: 'KN',
    rec: 'REC', targets: 'TGT', ypr: 'Y/R'
  };

  /**
   * HOW A VALUE IS PRINTED, WHICH IS A DIFFERENT QUESTION FROM WHAT IT IS CALLED.
   *
   * Three kinds of number were printed raw and read wrong:
   *
   *   clock    ice time is decimal minutes in the data and 18:42 on a scoreboard
   *   rate     a batting average or a save percentage is .312 and .912, never
   *            0.312 or 91.2; a percentage column is 45.8% and not 45.8
   *   average  a per-attempt figure is one decimal place
   *
   * Null is preserved as an em dash throughout. A stat that does not apply -- a
   * skater who took no draws, a goaltender who faced no power play -- is not
   * zero, and printing zero would be a false statement about the game.
   */
  var CLOCK_KEYS = { toi: 1, toiEven: 1, toiPowerPlay: 1, toiShortHanded: 1, top: 1 };
  var RATE_KEYS = {
    savePct: 1, gameAvg: 1, gameObp: 1, gameSlg: 1, gameOps: 1,
    seasonAvg: 1, seasonObp: 1, seasonSlg: 1, seasonOps: 1
  };
  var PERCENT_KEYS = {
    fgPct: 1, threePct: 1, ftPct: 1, efgPct: 1, faceoffPct: 1,
    shootingPct: 1, powerPlayPct: 1
  };
  var ONE_DP_KEYS = { ypa: 1, ypc: 1, ypr: 1, min: 1 };
  // An earned run average is printed to two places, always. 3.4 is not an ERA.
  var TWO_DP_KEYS = { seasonEra: 1, era: 1, gaa: 1 };

  function clockFrom(minutes) {
    var m = Math.floor(minutes);
    var sec = Math.round((minutes - m) * 60);
    if (sec === 60) { m += 1; sec = 0; }
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function cellText(key, value) {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : '—';
    if (typeof value !== 'number') return String(value);
    if (!isFinite(value)) return '—';
    if (CLOCK_KEYS[key]) return clockFrom(value);
    if (RATE_KEYS[key]) return value.toFixed(3).replace(/^0/, '');
    if (PERCENT_KEYS[key]) return value.toFixed(1) + '%';
    if (TWO_DP_KEYS[key]) return value.toFixed(2);
    if (ONE_DP_KEYS[key]) return value.toFixed(1);
    if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
    return String(Math.round(value * 10) / 10);
  }

  // `starter` is no longer skipped. It is what separates a starting five from a
  // bench, and dropping it was why an archived basketball box could not show a
  // distinction the live one does. It is consumed for grouping rather than
  // printed as a column, so it leaves the table after the split.
  var COLUMN_SKIP = { id: 1, player_id: 1, scenario: 1, status: 1 };
  var GROUPING_KEYS = { starter: 1 };

  /**
   * The order a box score is read in.
   *
   * This cannot be left to the order the keys arrive in: JSONB does not preserve
   * insertion order, it stores keys shortest-first then bytewise, so a batting
   * line comes back as H, R, AB, BB, HR, SO, RBI - every column present and none
   * of them where a reader expects it. Anything not named here keeps its
   * incoming order and follows the named columns.
   */
  var COLUMN_ORDER = [
    'name', 'player', 'pos', 'position', 'rawPos', 'order', 'slot', 'number',
    // baseball, batting then pitching
    'ab', 'r', 'h', 'b2', 'b3', 'hr', 'rbi', 'bb', 'so', 'pa', 'tb', 'lob',
    'sb', 'cs', 'sf', 'sh', 'hbp', 'gidp', 'ibb',
    'gameAvg', 'gameObp', 'gameSlg', 'gameOps',
    'seasonAvg', 'seasonObp', 'seasonSlg', 'seasonOps',
    'ip', 'er', 'bf', 'pitches', 'strikes', 'fps', 'whiff', 'ir', 'irs', 'seasonEra',
    // basketball
    'min', 'pts', 'fgm', 'fga', 'fgPct', 'tpm', 'tpa', 'threePct', 'ftm', 'fta', 'ftPct',
    'oreb', 'dreb', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf', 'plusMinus',
    // hockey
    'g', 'a', 'p', 'shots', 'attempts', 'hits', 'blocks', 'pim', 'giveaways', 'takeaways',
    'faceoffWins', 'faceoffLosses', 'faceoffPct', 'ppG', 'shG', 'shootingPct',
    'toi', 'toiEven', 'toiPowerPlay', 'toiShortHanded',
    'shotsAgainst', 'saves', 'goalsAgainst', 'savePct',
    'evenSaves', 'powerPlaySaves', 'shortHandedSaves', 'emptyNetGoalsAgainst', 'decision',
    // football
    'comp', 'att', 'yards', 'ypa', 'td', 'tds', 'int', 'ints', 'rating',
    'carries', 'ypc', 'rec', 'targets', 'ypr', 'long', 'fumbles', 'sacks',
  ];
  var COLUMN_RANK = {};
  COLUMN_ORDER.forEach(function (k, i) { COLUMN_RANK[k] = i; });

  /**
   * A pitching line shares its column NAMES with a batting line (r, h, hr, bb,
   * so) but not their reading order: a pitcher's line starts at innings pitched.
   * Recognised by the presence of `ip`, which nothing else carries.
   */
  var PITCHING_ORDER = ['name', 'player', 'ip', 'h', 'r', 'er', 'bb', 'so', 'hr', 'pitches'];
  var PITCHING_RANK = {};
  PITCHING_ORDER.forEach(function (k, i) { PITCHING_RANK[k] = i; });

  function playerTable(rows, caption) {
    if (!Array.isArray(rows) || !rows.length) return null;
    var keys = [];
    rows.forEach(function (r) {
      Object.keys(r || {}).forEach(function (k) {
        if (COLUMN_SKIP[k] || GROUPING_KEYS[k]) return;
        var v = r[k];
        if (v !== null && typeof v === 'object') return;
        if (keys.indexOf(k) === -1) keys.push(k);
      });
    });
    if (!keys.length) return null;
    var rank = keys.indexOf('ip') !== -1 ? PITCHING_RANK : COLUMN_RANK;
    keys.sort(function (a, b) {
      var ra = rank[a] === undefined ? 999 : rank[a];
      var rb = rank[b] === undefined ? 999 : rank[b];
      return ra - rb;   // stable, so unranked columns keep their incoming order
    });

    var wrap = el('div', null);
    if (caption) wrap.appendChild(el('div', 'sa-stat-label', caption));
    var scroll = el('div', 'sa-scroll');
    var table = el('table', 'sa-table');
    var thead = el('thead');
    var hr = el('tr');
    keys.forEach(function (k) { hr.appendChild(el('th', null, COLUMN_LABELS[k] || k.replace(/_/g, ' '))); });
    thead.appendChild(hr);
    var tbody = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr');
      keys.forEach(function (k) {
        var v = r[k];
        tr.appendChild(el('td', typeof v === 'number' ? 'sa-num' : null,
          cellText(k, v)));
      });
      tbody.appendChild(tr);
    });
    append(table, thead, tbody);
    scroll.appendChild(table);
    wrap.appendChild(scroll);
    return wrap;
  }

  /** Walks a details blob and renders every player list it can find. */
  /**
   * STARTERS AND BENCH ARE TWO TABLES, WHERE THE SPORT SAYS SO.
   *
   * A basketball box score is read as a starting five and then everybody else,
   * and the archived view showed one undifferentiated list because the `starter`
   * flag was being skipped before it reached the renderer. The flag is on the
   * stored rows, so this needs no new data -- only for the split to be made.
   *
   * It splits only when the list actually carries the distinction and has men on
   * both sides of it. A hockey skater list, a pitching line and a receiving
   * table have no starters in this sense and stay whole, which is why this is
   * conditional rather than applied everywhere.
   */
  function pushSplit(out, rows, caption) {
    var hasFlag = rows.some(function (r) { return r && r.starter !== undefined; });
    if (hasFlag) {
      var starters = rows.filter(function (r) { return r && r.starter; });
      var bench = rows.filter(function (r) { return r && !r.starter; });
      if (starters.length && bench.length) {
        var a = playerTable(starters, caption + ' \u00b7 starters');
        var b = playerTable(bench, caption + ' \u00b7 bench');
        if (a) out.push(a);
        if (b) out.push(b);
        return;
      }
    }
    var t = playerTable(rows, caption);
    if (t) out.push(t);
  }

  function playerSections(details, run) {
    var out = [];
    var box = details.box_score || {};
    var sides = [['away', run.away], ['home', run.home]];
    sides.forEach(function (pair) {
      var key = pair[0];
      var side = pair[1];
      var data = box[key] || box.representative && box.representative[key] || null;
      if (!data) return;
      Object.keys(data).forEach(function (listKey) {
        var value = data[listKey];
        if (!Array.isArray(value) || !value.length) return;
        if (typeof value[0] !== 'object') return;
        pushSplit(out, value, (side.name || side.abbr) + ' \u2014 ' + listKey.replace(/_/g, ' '));
      });
    });
    // MLB's client-side simulator sends its lines under player_stats instead.
    var ps = details.player_stats || {};
    sides.forEach(function (pair) {
      var side = pair[1];
      var data = ps[pair[0]];
      if (!data || typeof data !== 'object') return;
      Object.keys(data).forEach(function (listKey) {
        var value = data[listKey];
        if (!Array.isArray(value) || !value.length || typeof value[0] !== 'object') return;
        pushSplit(out, value, (side.name || side.abbr) + ' \u2014 ' + listKey.replace(/_/g, ' '));
      });
    });
    return out;
  }

  function teamStatsTable(details, run) {
    var ts = details.team_stats;
    if (!ts || !ts.away || !ts.home) return null;
    var keys = [];
    [ts.away, ts.home].forEach(function (side) {
      Object.keys(side || {}).forEach(function (k) {
        if (typeof side[k] === 'object' && side[k] !== null) return;
        if (keys.indexOf(k) === -1) keys.push(k);
      });
    });
    if (!keys.length) return null;
    var table = el('table', 'sa-table');
    var thead = el('thead');
    var hr = el('tr');
    append(hr, el('th', null, 'Team stat'),
      el('th', null, run.away.abbr), el('th', null, run.home.abbr));
    thead.appendChild(hr);
    var tbody = el('tbody');
    // A team-stat row is a full-width label, not a box-score column heading, so
    // it reads as "Home runs" rather than the abbreviation a player table uses.
    var title = function (k) {
      var words = k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
      return words.charAt(0).toUpperCase() + words.slice(1);
    };
    keys.forEach(function (k) {
      var tr = el('tr');
      var fmt = function (v) { return v === null || v === undefined ? '—' : String(v); };
      append(tr,
        el('td', null, title(k)),
        el('td', 'sa-num', fmt(ts.away[k])),
        el('td', 'sa-num', fmt(ts.home[k])));
      tbody.appendChild(tr);
    });
    append(table, thead, tbody);
    var scroll = el('div', 'sa-scroll');
    scroll.appendChild(table);
    return scroll;
  }

  function renderRun(container, id) {
    clear(container);
    container.appendChild(el('div', 'sa-skel sa-skel-row'));

    return api('/runs/' + encodeURIComponent(id)).then(function (run) {
      clear(container);
      var meta = run.sport_meta || {};
      var details = run.details || {};

      /* headline */
      var head = el('header', 'sa-head');
      var winnerName = run.winner_abbr === run.away.abbr ? (run.away.name || run.away.abbr)
        : (run.winner_abbr === run.home.abbr ? (run.home.name || run.home.abbr) : null);
      append(head,
        el('div', 'sa-kick', String(run.league || run.sport).toUpperCase() + ' simulated result'),
        el('h1', null, (run.away.name || run.away.abbr) + ' ' + run.away.score
          + ', ' + (run.home.name || run.home.abbr) + ' ' + run.home.score),
        el('p', 'sa-sub', (winnerName ? winnerName + ' win by ' + run.margin + '. ' : 'A tie. ')
          + 'Simulated ' + ago(run.recorded_at) + '. This is one simulated game, not a prediction '
          + 'and not betting advice.'));
      container.appendChild(head);

      /* scoreboard */
      var board = panel('Final');
      var chips = el('div', 'sa-chips');
      chips.appendChild(el('span', 'sa-chip is-brand', String(run.league || run.sport).toUpperCase()));
      if (run.overtime) {
        chips.appendChild(el('span', 'sa-chip', run.shootout ? 'Shootout'
          : (meta.overtime_label || 'Overtime')));
      }
      if (run.periods) chips.appendChild(el('span', 'sa-chip', run.periods + ' ' + (meta.period_noun_plural || 'periods')));
      if (run.neutral_site) chips.appendChild(el('span', 'sa-chip', 'Neutral site'));
      if (run.venue) chips.appendChild(el('span', 'sa-chip', run.venue));
      if (run.scope && run.scope !== 'default') {
        chips.appendChild(el('span', 'sa-chip is-warn',
          run.scope === 'historical' ? 'Historical teams' : 'Custom settings'));
      }
      chips.appendChild(el('span', 'sa-chip', 'Engine ' + run.engine_version));
      board.head.appendChild(chips);

      var scoreline = el('div', 'sa-scoreline');
      [[run.away, run.winner_abbr === run.away.abbr], [run.home, run.winner_abbr === run.home.abbr]]
        .forEach(function (pair) {
          var side = pair[0];
          var won = pair[1];
          var row = el('div', 'sa-team-row ' + (run.is_tie ? '' : (won ? 'is-winner' : 'is-loser')));
          // The crest lives in a fixed-size cell of its own. A bare <img> that
          // fails to load and removes itself shifts every later child up a grid
          // track, which is how the club name ended up in the 30px logo column
          // and rendered as "Ar…".
          var crest = el('span', 'sa-team-logo');
          var img = logo(side.logo, side.name || side.abbr);
          if (img) crest.appendChild(img);
          row.appendChild(crest);
          row.appendChild(el('div', 'sa-team-name', side.name || side.abbr));
          row.appendChild(el('div', 'sa-team-score', String(side.score)));
          scoreline.appendChild(row);
        });
      board.body.appendChild(scoreline);

      var ls = lineScoreTable(run);
      if (ls) {
        var lsScroll = el('div', 'sa-scroll');
        lsScroll.appendChild(ls);
        board.body.appendChild(lsScroll);
      }

      var starters = el('div', 'sa-statgrid');
      if (run.away.starter || run.home.starter) {
        append(starters,
          statCell((meta.starter_label || 'Starter') + ' — ' + run.away.abbr, run.away.starter || '—'),
          statCell((meta.starter_label || 'Starter') + ' — ' + run.home.abbr, run.home.starter || '—'));
        board.body.appendChild(starters);
      }
      container.appendChild(board.root);

      /* team stats */
      var tsTable = teamStatsTable(details, run);
      if (tsTable) {
        var tp = panel('Team statistics');
        tp.body.appendChild(tsTable);
        container.appendChild(tp.root);
      }

      /* player box score */
      var sections = playerSections(details, run);
      if (sections.length) {
        var pp = panel('Box score');
        sections.forEach(function (s) { pp.body.appendChild(s); });
        container.appendChild(pp.root);
      }

      /* lineups */
      if (details.lineups && (details.lineups.away || details.lineups.home)) {
        var lp = panel('Starting lineups');
        ['away', 'home'].forEach(function (k) {
          var side = run[k];
          var t = playerTable(details.lineups[k], side.name || side.abbr);
          if (t) lp.body.appendChild(t);
        });
        container.appendChild(lp.root);
      }

      /* scoring summary / major events */
      var scoring = details.scoring;
      if (scoring) {
        var lists = [];
        if (Array.isArray(scoring)) lists.push(['Key moments', scoring]);
        else {
          Object.keys(scoring).forEach(function (k) {
            if (Array.isArray(scoring[k]) && scoring[k].length) lists.push([k.replace(/_/g, ' '), scoring[k]]);
          });
        }
        if (lists.length) {
          var sp = panel('Scoring summary');
          lists.forEach(function (pair) {
            var t = playerTable(pair[1], pair[0]);
            if (t) sp.body.appendChild(t);
            else {
              var ul = el('ul', 'sa-list');
              pair[1].slice(0, 40).forEach(function (item) {
                ul.appendChild(el('li', null, typeof item === 'string' ? item : JSON.stringify(item)));
              });
              sp.body.appendChild(ul);
            }
          });
          container.appendChild(sp.root);
        }
      }

      /* provenance */
      var meta2 = panel('How this simulation was produced');
      var grid = el('div', 'sa-statgrid');
      append(grid,
        statCell('Engine', run.engine_version),
        statCell('Simulations run', run.n_sims ? commas(run.n_sims) : '—'),
        statCell('Seed', run.seed || '—',
          run.seed ? 'Passing this seed back reproduces this exact game' : null),
        statCell('Settings', run.scope === 'default' ? 'Default' :
          (run.scope === 'historical' ? 'Historical teams' : 'Custom')),
        statCell('Recorded', new Date(run.recorded_at).toLocaleString('en-US')),
        statCell('Run by', run.logged_in ? 'A signed-in visitor' : 'An anonymous visitor'));
      meta2.body.appendChild(grid);
      meta2.body.appendChild(el('p', 'sa-foot',
        'Simulation activity is public; who ran a simulation is not. TrustMyRecord stores only '
        + 'whether a visitor was signed in, never who they were.'));
      container.appendChild(meta2.root);

      /* onward links */
      var links = el('div', 'sa-chips');
      var toMatchup = el('a', 'sa-cta is-ghost', 'All ' + run.away.abbr + ' vs ' + run.home.abbr + ' simulations');
      toMatchup.href = matchupPathFor(run.sport) + '?' + (run.pair_slug
        ? 'slug=' + encodeURIComponent(run.pair_slug)
        : 'matchup=' + encodeURIComponent(run.pair_key));
      var toSim = el('a', 'sa-cta', 'Run this matchup');
      toSim.href = simulatorPathFor(run.sport);
      append(links, toMatchup, toSim);
      container.appendChild(links);

      return run;
    }).catch(function (e) {
      if (e && e.status === 404) {
        empty(container, 'That simulation is not in the archive',
          'It may have been run before the archive existed, or the link may be wrong.');
        return null;
      }
      errorState(container);
      throw e;
    });
  }

  /* ================================================================ */
  /* The simulator-page embed                                         */
  /* ================================================================ */

  /**
   * The analytics section that sits BELOW a simulator, never above it. It is
   * deliberately compact: four metric cards, the most-simulated board and the
   * live feed, with everything deeper one click away on the archive pages.
   */
  function renderPanel(container, sport, opts) {
    var o = opts || {};
    container.classList.add('sa-root', 'sa-embed');
    clear(container);

    var head = el('div', 'sa-embed-head');
    var link = el('a', null, 'Open the full archive →');
    link.href = resultsPathFor(sport);
    append(head, el('h2', null, o.title || 'Simulation archive'), link);
    container.appendChild(head);

    var overviewHost = el('div', null);
    container.appendChild(overviewHost);

    var grid = el('div', 'sa-grid');
    var leadersHost = el('div', null);
    var recentHost = el('div', null);
    append(grid, recentHost, leadersHost);
    container.appendChild(grid);

    renderOverview(overviewHost, sport, { compact: true });
    renderRecent(recentHost, sport, { limit: o.limit || 8, live: 30000, paginate: false });
    renderLeaders(leadersHost, sport, { limit: 6 });
  }

  /* ================================================================ */
  /* Declarative mounting                                             */
  /* ================================================================ */

  function param(name) {
    try { return new URLSearchParams(window.location.search).get(name); }
    catch (e) { return null; }
  }

  function mount(node) {
    var kind = node.dataset.sa;
    var sport = node.dataset.sport || param('sport') || null;
    node.classList.add('sa-root');

    if (kind === 'overview') return renderOverview(node, sport, { compact: node.dataset.compact === '1' });
    if (kind === 'recent') {
      return renderRecent(node, sport, {
        limit: parseInt(node.dataset.limit, 10) || 10,
        live: node.dataset.live === '0' ? false : 30000,
        matchup: node.dataset.matchup || null,
        team: node.dataset.team || null,
      });
    }
    if (kind === 'leaders') {
      return renderLeaders(node, sport, {
        limit: parseInt(node.dataset.limit, 10) || 10,
        window: node.dataset.window || 'today',
      });
    }
    if (kind === 'matchup') {
      return renderMatchup(node, sport, {
        slug: node.dataset.slug || param('slug'),
        matchup: node.dataset.matchup || param('matchup'),
        scope: param('scope'),
        engine: param('engine'),
        heading: node.dataset.heading !== '0',
      });
    }
    if (kind === 'team') {
      return renderTeam(node, sport, {
        slug: node.dataset.slug || param('slug'),
        team: node.dataset.team || param('team'),
        scope: param('scope'),
        engine: param('engine'),
        heading: node.dataset.heading !== '0',
      });
    }
    if (kind === 'run') {
      var id = node.dataset.id || param('id');
      if (!id) {
        empty(node, 'No simulation selected', 'This page opens one archived simulation by id.');
        return Promise.resolve(null);
      }
      return renderRun(node, id);
    }
    if (kind === 'teams') return renderTeams(node, sport, {});
    if (kind === 'panel') return renderPanel(node, sport, { limit: parseInt(node.dataset.limit, 10) || 8 });
    return Promise.resolve(null);
  }

  function init() {
    var nodes = document.querySelectorAll('[data-sa]');
    if (!nodes.length) return;
    loadSports().then(function () {
      Array.prototype.forEach.call(nodes, function (node) {
        try { mount(node); } catch (e) { errorState(node); }
      });
    });
  }

  window.TMRSimArchive = {
    api: api,
    mount: mount,
    renderOverview: renderOverview,
    renderRecent: renderRecent,
    renderLeaders: renderLeaders,
    renderMatchup: renderMatchup,
    renderTeam: renderTeam,
    renderTeams: renderTeams,
    renderRun: renderRun,
    renderPanel: renderPanel,
    paths: {
      results: resultsPathFor, matchup: matchupPathFor,
      team: teamPathFor, run: runPathFor, simulator: simulatorPathFor,
    },
    format: { commas: commas, dec: dec, pct: pctText, ago: ago },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window, document);
