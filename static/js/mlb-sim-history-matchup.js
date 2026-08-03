/**
 * MLB_SIM_HISTORY_20260803 - the matchup aggregate page.
 *
 * Served at /mlb-simulator/simulations/YYYY-MM-DD/<away>-vs-<home>/ (the
 * Cloudflare Worker maps that pretty URL onto this one static shell and injects
 * the per-matchup <title>/description/canonical/robots before the crawler sees
 * it), and directly at /mlb-simulator/simulations/matchup/?date=&slug=.
 *
 * Read-only against /api/mlb-sim-history. Nothing here is presented as a
 * prediction: every figure is labelled as an average of simulator output.
 */
(function () {
  'use strict';

  var ENDPOINT = '/mlb-sim-history';

  function qs(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v, dash) { return (v === null || v === undefined || v === '') ? (dash || '—') : v; }

  function api(path) {
    if (window.api && typeof window.api.request === 'function') {
      return window.api.request(ENDPOINT + path, { method: 'GET' });
    }
    var cfg = (typeof CONFIG !== 'undefined' && CONFIG) ? CONFIG : null;
    var base = (cfg && cfg.api && cfg.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api';
    return fetch(base + ENDPOINT + path, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); });
  }

  /** date + slug, from the pretty path first, then from query params. */
  function target() {
    var m = /^\/mlb-simulator\/simulations\/(\d{4}-\d{2}-\d{2})\/([a-z0-9-]+)\/?$/i.exec(window.location.pathname);
    if (m) return { date: m[1], slug: m[2].toLowerCase() };
    var p = new URLSearchParams(window.location.search);
    var d = p.get('date');
    var s = p.get('slug');
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && /^[a-z0-9-]+$/i.test(String(s || ''))) {
      return { date: d, slug: String(s).toLowerCase() };
    }
    return null;
  }

  function niceDate(ymd) {
    return new Date(ymd + 'T12:00:00Z').toLocaleDateString(undefined, {
      timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }
  function localTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function fail(message) {
    var root = qs('shMatchupRoot');
    if (!root) return;
    root.innerHTML =
      '<section class="sh-panel"><div class="sh-empty"><b>' + esc(message) + '</b>' +
      'Pick any matchup on the simulator and run it.' +
      '<div><a class="sh-btn is-primary" href="/mlb-simulator/">Open the MLB Simulator</a></div>' +
      '<div style="margin-top:8px;"><a class="sh-btn is-quiet" href="/mlb-simulator/simulations/">All simulations today</a></div>' +
      '</div></section>';
  }

  /* ------------------------------------------------------------------ */

  function metricsHtml(c) {
    var has = c && c.simulations > 0;
    return '' +
      '<div class="sh-metric is-accent"><b>' + (has ? esc(c.avg_away_score) + '&ndash;' + esc(c.avg_home_score) : '—') + '</b><span>Average simulated score</span></div>' +
      '<div class="sh-metric"><b>' + (has ? esc(c.avg_total) : '—') + '</b><span>Average total</span></div>' +
      '<div class="sh-metric"><b>' + esc(c ? c.total_simulations : 0) + '</b><span>Simulations run</span></div>' +
      '<div class="sh-metric"><b>' + esc(c ? c.unique_actors : 0) + '</b><span>Unique participants</span></div>';
  }

  function winSplitHtml(d, c) {
    if (!c || !c.simulations) {
      return '<div class="sh-empty">No default-settings simulations yet for this game.<div><a class="sh-btn is-primary" href="' + esc(d.run_href) + '">Run This Matchup</a></div></div>';
    }
    var a = c.away_win_pct || 0;
    var h = c.home_win_pct || 0;
    return '' +
      '<div class="sh-winsplit">' +
        '<div class="sh-winsplit-row">' +
          '<span class="sh-away">' + esc(d.teams.away.abbr) + ' ' + esc(a) + '%</span>' +
          '<span class="sh-home">' + esc(h) + '% ' + esc(d.teams.home.abbr) + '</span>' +
        '</div>' +
        '<div class="sh-bar"><i class="sh-bar-away" style="width:' + Number(a) + '%"></i>' +
        '<i class="sh-bar-home" style="width:' + Number(h) + '%"></i></div>' +
        (c.tie_pct ? '<div class="sh-kv" style="margin-top:8px;"><span>Suspended / no decision</span><b>' + esc(c.tie_pct) + '%</b></div>' : '') +
      '</div>';
  }

  function splitCardsHtml(c) {
    if (!c || !c.simulations) return '';
    var cards = [];

    cards.push(
      '<div class="sh-split-card"><h3>Scoring</h3>' +
        '<div class="sh-kv"><span>Average total</span><b>' + esc(c.avg_total) + '</b></div>' +
        '<div class="sh-kv"><span>Average margin</span><b>' + esc(c.avg_margin) + '</b></div>' +
        '<div class="sh-kv"><span>Average winning margin</span><b>' + esc(num(c.avg_winning_margin)) + '</b></div>' +
        '<div class="sh-kv"><span>Most common total</span><b>' + esc(c.most_common_range ? c.most_common_range.label : '—') + '</b></div>' +
      '</div>');

    if (c.run_line) {
      cards.push(
        '<div class="sh-split-card"><h3>Run line (&plusmn;' + esc(c.run_line.line) + ')</h3>' +
          '<div class="sh-kv"><span>' + esc(c.run_line.away_abbr) + ' wins by 2+</span><b>' + esc(c.run_line.away_cover_pct) + '%</b></div>' +
          '<div class="sh-kv"><span>' + esc(c.run_line.home_abbr) + ' wins by 2+</span><b>' + esc(c.run_line.home_cover_pct) + '%</b></div>' +
        '</div>');
    }

    if (c.over_under) {
      cards.push(
        '<div class="sh-split-card"><h3>Total ' + esc(c.over_under.total) + '</h3>' +
          '<div class="sh-kv"><span>Over</span><b>' + esc(c.over_under.over_pct) + '%</b></div>' +
          '<div class="sh-kv"><span>Under</span><b>' + esc(c.over_under.under_pct) + '%</b></div>' +
          (c.over_under.push_pct ? '<div class="sh-kv"><span>Push</span><b>' + esc(c.over_under.push_pct) + '%</b></div>' : '') +
        '</div>');
    }

    cards.push(
      '<div class="sh-split-card"><h3>Sample</h3>' +
        '<div class="sh-kv"><span>Simulations run</span><b>' + esc(c.total_simulations) + '</b></div>' +
        '<div class="sh-kv"><span>Unique participants</span><b>' + esc(c.unique_actors) + '</b></div>' +
        '<div class="sh-kv"><span>Counted in the average</span><b>' + esc(c.simulations) + '</b></div>' +
        '<div class="sh-kv"><span>Per-participant cap</span><b>' + esc(c.consensus_cap_per_actor) + '</b></div>' +
      '</div>');

    return '<div class="sh-split">' + cards.join('') + '</div>';
  }

  function distributionHtml(c) {
    if (!c || !c.range_distribution || !c.range_distribution.length) return '';
    var top = c.most_common_range ? c.most_common_range.key : null;
    return '<div class="sh-dist">' + c.range_distribution.map(function (b) {
      return '<div class="sh-dist-row' + (b.key === top ? ' is-top' : '') + '">' +
        '<span>' + esc(b.label) + '</span>' +
        '<span class="sh-dist-bar"><i style="width:' + Number(b.pct || 0) + '%"></i></span>' +
        '<span>' + esc(b.pct) + '%</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  function recentHtml(d) {
    var runs = d.recent_runs || [];
    if (!runs.length) return '<div class="sh-empty">No simulations recorded for this game yet.</div>';
    return runs.map(function (r) {
      return '<div class="sh-row">' +
        '<div class="sh-row-main">' +
          '<div class="sh-matchup">' +
            '<span class="sh-score">' + esc(r.away_score) + '&ndash;' + esc(r.home_score) + '</span>' +
            (r.winner_abbr ? '<span class="sh-winner">' + esc(r.winner_abbr) + ' wins</span>' : '<span class="sh-winner">Suspended</span>') +
            (r.config_type !== 'default' ? '<span class="sh-tag is-custom">Custom</span>' : '') +
          '</div>' +
          '<div class="sh-meta"><span>Total <b>' + esc(r.total_runs) + '</b></span>' +
            '<span>Margin <b>' + esc(r.margin) + '</b></span>' +
            '<span>' + esc(localTime(r.completed_at)) + '</span></div>' +
        '</div>' +
        '<div class="sh-row-actions">' +
          '<a class="sh-btn is-quiet" href="/mlb-simulator/simulations/run/?id=' + encodeURIComponent(r.id) + '">Full details</a>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function render(d) {
    var away = d.teams.away;
    var home = d.teams.home;
    var awayName = away.name || away.abbr;
    var homeName = home.name || home.abbr;
    var g = d.game;
    var c = d.consensus;

    var heading = awayName + ' vs ' + homeName + (g && g.doubleheader ? ' (Game ' + g.game_number + ')' : '');
    document.title = heading + ' Simulation Results — ' + niceDate(d.date) + ' | TrustMyRecord';

    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', d.canonical);

    var statusNote = '';
    if (g && (g.status === 'postponed' || g.status === 'cancelled')) {
      statusNote = '<span class="sh-game-status is-off">' + esc(g.status_label || g.status) + '</span>';
    }

    var root = qs('shMatchupRoot');
    root.innerHTML = '' +
      '<header class="sh-head">' +
        '<div class="sh-teams">' +
          (away.logo ? '<img src="' + esc(away.logo) + '" alt="' + esc(awayName) + '" width="34" height="34">' : '') +
          (home.logo ? '<img src="' + esc(home.logo) + '" alt="' + esc(homeName) + '" width="34" height="34">' : '') +
          '<div>' +
            '<h1>' + esc(heading) + '</h1>' +
            '<p class="sh-sub">' + esc(niceDate(d.date)) +
              (g ? ' &middot; first pitch ' + esc(g.start_time_tbd ? 'TBD' : g.start_time_pt) + ' PT' : '') +
              (g && g.venue ? ' &middot; ' + esc(g.venue) : '') + ' ' + statusNote + '</p>' +
          '</div>' +
        '</div>' +
        '<a class="sh-btn is-primary" href="' + esc(d.run_href) + '">Run This Matchup</a>' +
      '</header>' +

      '<div class="sh-metrics">' + metricsHtml(c) + '</div>' +

      '<div class="sh-layout">' +
        '<div class="sh-main">' +
          '<section class="sh-panel">' +
            '<div class="sh-panel-head"><h2>Simulated Win Share</h2>' +
              '<span class="sh-count">Default settings</span></div>' +
            winSplitHtml(d, c) +
            splitCardsHtml(c) +
          '</section>' +

          (c && c.range_distribution && c.range_distribution.length
            ? '<section class="sh-panel"><div class="sh-panel-head"><h2>Total Runs Distribution</h2>' +
              '<span class="sh-count">' + esc(c.simulations) + ' counted</span></div>' +
              distributionHtml(c) + '</section>'
            : '') +

          '<section class="sh-panel">' +
            '<div class="sh-panel-head"><h2>Recent Simulations</h2>' +
              '<span class="sh-count">' + esc((d.recent_runs || []).length) + ' shown</span></div>' +
            recentHtml(d) +
          '</section>' +

          '<p class="sh-note">' + esc(d.disclaimer) + ' The headline averages use default simulator settings only. ' +
            'Each participant contributes at most ' + esc(c ? c.consensus_cap_per_actor : 3) +
            ' simulations to the average, so repeatedly running the same game cannot move it.</p>' +
        '</div>' +

        '<aside class="sh-rail">' +
          (d.custom && d.custom.simulations
            ? '<section class="sh-panel"><div class="sh-panel-head"><h2>Custom-Setting Runs</h2>' +
              '<span class="sh-count">' + esc(d.custom.total_simulations) + '</span></div>' +
              '<div class="sh-split" style="grid-template-columns:1fr;">' +
                '<div class="sh-split-card"><h3>Kept separate on purpose</h3>' +
                  '<div class="sh-kv"><span>Average score</span><b>' + esc(d.custom.avg_away_score) + '&ndash;' + esc(d.custom.avg_home_score) + '</b></div>' +
                  '<div class="sh-kv"><span>' + esc(away.abbr) + ' win</span><b>' + esc(num(d.custom.away_win_pct)) + '%</b></div>' +
                  '<div class="sh-kv"><span>' + esc(home.abbr) + ' win</span><b>' + esc(num(d.custom.home_win_pct)) + '%</b></div>' +
                  '<div class="sh-kv"><span>Simulations</span><b>' + esc(d.custom.total_simulations) + '</b></div>' +
                '</div></div></section>'
            : '') +
          '<section class="sh-panel">' +
            '<div class="sh-panel-head"><h2>Keep Going</h2></div>' +
            '<div style="padding:11px 13px;display:flex;flex-direction:column;gap:7px;">' +
              '<a class="sh-btn is-primary is-block" href="' + esc(d.run_href) + '">Run This Matchup</a>' +
              '<a class="sh-btn is-block" href="/mlb-simulator/simulations/?date=' + esc(d.date) + '">All simulations today</a>' +
              '<a class="sh-btn is-block" href="/mlb-simulator/">MLB Simulator</a>' +
              '<a class="sh-btn is-block" href="/mlb-season-simulator/">MLB Season Simulator</a>' +
              '<a class="sh-btn is-block" href="/trendspotter/">Trend Spotter</a>' +
            '</div>' +
          '</section>' +
        '</aside>' +
      '</div>';

    var crumb = qs('shCrumbCurrent');
    if (crumb) crumb.textContent = away.abbr + ' @ ' + home.abbr;
  }

  function init() {
    var t = target();
    if (!t) { fail('That matchup page could not be found.'); return; }
    api('/matchup?date=' + encodeURIComponent(t.date) + '&slug=' + encodeURIComponent(t.slug))
      .then(function (d) {
        if (!d || d.error) { fail('That matchup is not on the MLB schedule for that date.'); return; }
        render(d);
      })
      .catch(function () { fail('This matchup page is unavailable right now.'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
