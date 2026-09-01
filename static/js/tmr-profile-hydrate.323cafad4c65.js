/* tmr-profile-hydrate.js
 * Progressive enhancement for static /u/<username>/ public profile pages.
 *
 * FULL-PROFILE UPGRADE (July 4, 2026): for JS visitors this now loads the real
 * interactive /profile/ app IN PLACE at the /u/<username>/ URL (same layout,
 * nav, stat cards, correlated picks, breakdowns, share/embed, pick history as
 * /profile/?user=X). The baked static HTML below stays the no-JS/crawler
 * fallback, and the legacy lightweight hydrate below is the runtime fallback
 * if fetching the app shell fails. The /profile/ app reads the username from
 * the /u/ path (and window.__TMR_PROFILE_USERNAME), keeps canonical on /u/,
 * and its own isOwnProfile/currentUser gating controls Follow/Send Message
 * and hides account settings exactly like /profile/?user=.
 *
 * SINGLE SOURCE OF TRUTH: the backend live aggregator GET /api/users/:username/metrics
 * — the SAME endpoint the logged-in /profile/ dashboard uses, and the same pick-log
 * recompute the /handicappers/ leaderboard converges to (statsFromPicks). Using it here
 * guarantees the public profile headline matches the leaderboard and the owner's own
 * dashboard exactly, instead of the stale materialized /api/users columns.
 *
 * Individual pick rows (recent / full history / pending) come from GET /api/picks, which
 * metrics does not enumerate. The baked HTML stays the crawler-visible fallback; this
 * upgrades it to the full, live, in-depth stat profile for JS visitors.
 */
(function () {
  var un = window.__TMR_PROFILE_USERNAME;
  if (!un) return;

  /* FIRST-PAINT CONTRACT (2026-08-06, supersedes the 2026-07-29 flash fix)
     -------------------------------------------------------------------
     The baked SEO snapshot on this page is a point-in-time bake (refreshed by
     the prerender workflow, so up to 30 minutes stale) and must NEVER be the
     first thing a JS visitor sees — that was the "old profile shell for several
     seconds" report. The 2026-07-29 fix hid it from JS here, but this file is
     `defer`: on a slow connection the browser can paint the parsed body before a
     deferred script runs, so the stale shell still flashed, and hiding it left a
     BLANK page rather than a branded one.

     The hide + branded skeleton now live in the baked page's inline <head> CSS
     (build_profile_pages.py: body.tmr-u-booting + #tmrUBootSkeleton), so they are
     in force at the very first paint with no JS involved at all, and a <noscript>
     block reverses them for non-JS clients and crawlers, which keep seeing the
     full baked content. This function only covers pages baked BEFORE that change
     (a returning visitor's cached HTML), and the reveal path is what un-does it. */
  var BOOT_CLASS = 'tmr-u-booting';
  /* Set by the swap's health gate when the inline <head> preload came back
     null, i.e. the API answered non-OK or not at all. The legacy hydrate
     below then skips its own /metrics + /picks fetches entirely: they would
     be two more requests we already know will fail, aimed at a pool that is
     the reason the page is in this state, and the baked record they would
     have refreshed is already correct and already on screen. */
  var apiKnownDown = false;
  var HIDE_STYLE_ID = 'tmr-u-boot-hide';
  var revealed = false;
  function hideBaked() {
    if (document.body && document.body.classList.contains(BOOT_CLASS)) return; // baked-in, nothing to do
    if (document.getElementById(HIDE_STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = HIDE_STYLE_ID;
    st.textContent = 'body>*:not(script){visibility:hidden !important;}';
    document.head.appendChild(st);
  }
  function revealBaked() {
    if (revealed) return;
    revealed = true;
    if (document.body) document.body.classList.remove(BOOT_CLASS);
    var st = document.getElementById(HIDE_STYLE_ID);
    if (st && st.parentNode) st.parentNode.removeChild(st);
    loadFallbackChrome();
  }

  /* The baked page ships its nav/footer/share/awards scripts INERT
     (type="text/tmr-fallback"), because on the success path this document is
     replaced wholesale within ~100ms and every one of those files is also loaded
     by the /profile/ app shell. Executing them twice in one realm is what
     produced duplicate network requests, duplicate listeners and duplicate
     /api/auth/me calls; not executing them at all on the fast path is strictly
     better than de-duplicating them afterwards. They are only ever needed if the
     swap fails and the visitor stays on the baked page, so load them here. */
  function loadFallbackChrome() {
    var pending = [].slice.call(document.querySelectorAll('script[type="text/tmr-fallback"][data-src]'));
    (function next(i) {
      if (i >= pending.length) return;
      var old = pending[i];
      var src = old.getAttribute('data-src');
      old.parentNode.removeChild(old);
      if (!src) return next(i + 1);
      if (!window.__TMR_SCRIPTS_LOADED) window.__TMR_SCRIPTS_LOADED = {};
      var base = src.split('?')[0];
      if (window.__TMR_SCRIPTS_LOADED[base]) return next(i + 1);
      window.__TMR_SCRIPTS_LOADED[base] = 1;
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = s.onerror = function () { next(i + 1); };
      document.head.appendChild(s);
    })(0);
  }

  hideBaked();
  /* BAKED_FIRST_20260901 -- the skeleton must never outlive the data we already have.
     -------------------------------------------------------------------------------
     This page ships the member's real record IN THE HTML: record, net units, ROI,
     win rate, graded count, streaks, the sport splits and the recent graded picks,
     all baked by build_profile_pages.py. It is at most one prerender cycle stale,
     and it costs zero network. The boot CSS then hides all of it behind a skeleton
     while we fetch a 1.09 MB app shell and swap the document.

     On 2026-09-01, with the API returning 500 on every read, that trade went badly
     wrong: the swap succeeded, the app mounted, and the visitor sat on "Loading
     profile..." / "Loading verified metrics..." indefinitely -- while the correct
     numbers had been present, in this document, from the first byte.

     Two changes, neither of which alters the healthy-path experience:

       1. The reveal deadline drops from 6000ms to 1500ms. A healthy shell fetch
          measures ~490ms and the metrics preload ~200ms, so a working backend
          still swaps well inside the deadline and nobody sees the baked page. A
          backend that is slow or down now surrenders after 1.5s instead of 6.

       2. The swap is gated on the API actually answering. The inline <head>
          preload resolves to null on any non-OK response or network failure, so a
          null there means the app we are about to mount has nothing to render.
          In that case we do NOT swap: we reveal the baked record instead, which
          is the correct data, and let the legacy hydrate refresh it in place.

     The result is the target behaviour in both directions: healthy backend, same
     full interactive profile as before; unhealthy backend, the real record on
     screen in milliseconds instead of a spinner that never resolves. */
  /* Only the SLOW-but-healthy case waits this long now; a backend that is
     actually down reveals as soon as the health probe answers, which is an
     order of magnitude sooner. 2.5s is the point past which a healthy shell
     is late enough that the baked record is the better thing to be looking at. */
  var SWAP_DEADLINE_MS = 2500;
  var revealFailSafe = setTimeout(function () { runLegacyHydrateOnce(); }, SWAP_DEADLINE_MS);

  var API = 'https://trustmyrecord-api.onrender.com/api';
  if (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) API = window.CONFIG.api.baseUrl;

  // ---------- small helpers ----------
  function n(v, d) { var x = Number(v); return isNaN(x) ? (d || 0) : x; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function signUnits(v) { v = n(v); return (v > 0 ? '+' : '') + v.toFixed(2) + 'u'; }
  function signPct(v) { v = n(v); return (v > 0 ? '+' : '') + v.toFixed(2) + '%'; }
  function pct1(v) { return n(v).toFixed(1) + '%'; }
  function amer(o) { o = Math.round(n(o)); return (o > 0 ? '+' : '') + o; }
  function cls(v) { v = n(v); return v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'; }
  function streakTxt(v) { v = n(v); return v > 0 ? 'W' + v : v < 0 ? 'L' + Math.abs(v) : '0'; }

  var SPORTS = {
    baseball_mlb: 'MLB', basketball_nba: 'NBA', basketball_nba_summer: 'NBA Summer League', basketball_wnba: 'WNBA',
    icehockey_nhl: 'NHL', americanfootball_nfl: 'NFL',
    americanfootball_ncaaf: 'CFB', basketball_ncaab: 'CBB', tennis: 'Tennis'
  };
  function sportLabel(k) {
    k = k || '';
    if (SPORTS[k]) return SPORTS[k];
    if (k.indexOf('soccer') === 0) return 'Soccer';
    if (k.indexOf('tennis') === 0) return 'Tennis';
    return k ? k.replace(/_/g, ' ').toUpperCase() : 'Other';
  }
  var MARKETS = {
    h2h: 'Moneyline', moneyline: 'Moneyline', spreads: 'Spread', spread: 'Spread',
    totals: 'Total', total: 'Total', team_totals: 'Team Total', teamtotal: 'Team Total',
    player_props: 'Player Prop', playerprop: 'Player Prop', alternate_spreads: 'Alt Spread',
    alternate_totals: 'Alt Total', first_inning_totals: 'First Inning', futures: 'Futures'
  };
  function marketLabel(k) {
    k = (k || '').toLowerCase();
    return MARKETS[k] || (k ? k.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : 'Other');
  }
  function recStr(w, l, p) { return n(w) + '-' + n(l) + (n(p) ? '-' + n(p) : ''); }
  function shortTeam(s) { s = (s || '').trim(); return s ? s.split(' ').pop() : ''; }
  var MO = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function shortDate(iso) {
    var t = new Date(iso); if (isNaN(t)) return '';
    return MO[t.getUTCMonth() + 1] + ' ' + t.getUTCDate();
  }

  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function fetchAllPicks(user) {
    var out = [];
    function page(off) {
      return getJSON(API + '/picks' + '?username=' + encodeURIComponent(user) + '&limit=100&offset=' + off)
        .then(function (d) {
          var ps = (d && d.picks) || [];
          out = out.concat(ps);
          if (ps.length === 100 && off < 900) return page(off + 100);
          return out;
        });
    }
    return page(0);
  }

  // ---------- avg American odds per group, from the pick log ----------
  function amerToDec(o) { o = n(o); return o > 0 ? 1 + o / 100 : o < 0 ? 1 + 100 / Math.abs(o) : 0; }
  function decToAmer(d) { if (d <= 1) return 0; return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)); }
  function avgOddsOf(picks) {
    var ds = [];
    for (var i = 0; i < picks.length; i++) { var o = n(picks[i].odds_snapshot); if (o) ds.push(amerToDec(o)); }
    if (!ds.length) return null;
    var s = 0; for (var j = 0; j < ds.length; j++) s += ds[j];
    return decToAmer(s / ds.length);
  }

  // ---------- styles (self-contained so it works on already-deployed pages) ----------
  function injectCSS() {
    if (document.getElementById('tmr-uprofile-css')) return;
    var css =
      '.u-stats{grid-template-columns:repeat(4,1fr);}' +
      '.u-substats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:6px 0 0;}' +
      '.u-substats .u-stat b{font-size:17px;}' +
      '.u-num.pos{color:#00ff88;}.u-num.neg{color:#ff5566;}.u-num.zero{color:#9aa;}' +
      '.u-table td.pos,.u-table td .pos{color:#00ff88;font-weight:700;}' +
      '.u-table td.neg,.u-table td .neg{color:#ff5566;font-weight:700;}' +
      '.u-table td.zero{color:#9aa;}' +
      '.u-filter{display:inline-flex;gap:8px;align-items:center;margin:0 0 10px;font-size:13px;color:#8890ad;}' +
      '.u-filter select{background:#0e0e16;color:#e8e8f0;border:1px solid #262636;border-radius:8px;padding:6px 9px;font:inherit;}' +
      '.u-badge{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.4px;padding:2px 7px;border-radius:999px;text-transform:uppercase;}' +
      '.u-badge.pend{color:#ffd166;border:1px solid rgba(255,209,102,.4);background:rgba(255,209,102,.08);}' +
      '.u-bw{display:grid;grid-template-columns:1fr 1fr;gap:12px;}' +
      '.u-bw .u-stat span{display:block;}' +
      '.u-bw .u-bwh{color:#8890ad;font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px;}' +
      '.u-scroll{overflow-x:auto;}' +
      '@media(max-width:640px){.u-stats,.u-substats{grid-template-columns:repeat(2,1fr);}.u-bw{grid-template-columns:1fr;}}';
    var st = document.createElement('style');
    st.id = 'tmr-uprofile-css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------- render ----------
  function statCard(big, label, klass) {
    return '<div class="u-stat"><b' + (klass ? ' class="u-num ' + klass + '"' : '') + '>' + esc(big) +
           '</b><span>' + esc(label) + '</span></div>';
  }

  function renderHeadline(s, streaks) {
    var box = document.getElementById('uStats') || document.querySelector('.u-stats');
    if (!box) return;
    var cur = streaks ? n(streaks.current) : 0, best = streaks ? n(streaks.best) : 0;
    var cards = [
      statCard(s.record || recStr(s.wins, s.losses, s.pushes), 'Record (W-L-P)'),
      statCard(signUnits(s.net_units), 'Net Units', cls(s.net_units)),
      statCard(signPct(s.roi), 'ROI', cls(s.roi)),
      statCard(pct1(s.win_rate), 'Win Rate'),
      statCard(String(n(s.total_picks)), 'Graded Picks'),
      statCard(streakTxt(cur), 'Current Streak', cls(cur)),
      statCard(streakTxt(best), 'Best Streak', 'pos'),
      statCard(s.avg_odds != null ? amer(s.avg_odds) : '--', 'Avg Odds')
    ];
    box.innerHTML = cards.join('');
  }

  function tableBlock(title, head, bodyRows, note, extraTopHTML) {
    return '<section class="u-block">' +
      '<h2>' + esc(title) + '</h2>' +
      (extraTopHTML || '') +
      '<div class="u-scroll"><table class="u-table"><thead><tr>' +
      head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + bodyRows.join('') + '</tbody></table></div>' +
      (note ? '<p class="u-note">' + esc(note) + '</p>' : '') +
      '</section>';
  }

  function pickRowHTML(p, withResult) {
    var matchup = (shortTeam(p.away_team) + ' @ ' + shortTeam(p.home_team)).replace(/^ @ ?| @ $/g, '').trim();
    var sel = (p.selection || '').trim();
    var line = (p.line_snapshot || '').trim();
    var pick = (sel + (line && sel.indexOf(line) < 0 ? ' ' + line : '')).trim();
    var odds = n(p.odds_snapshot) ? ' (' + amer(p.odds_snapshot) + ')' : '';
    var cells =
      '<td>' + esc(shortDate(p.graded_at || p.commence_time || p.created_at)) + '</td>' +
      '<td>' + esc(sportLabel(p.sport_key)) + '</td>' +
      '<td>' + esc(matchup) + '</td>' +
      '<td>' + esc(pick) + esc(odds) + '</td>' +
      '<td>' + esc(signUnits(p.units)) + '</td>';
    if (withResult) {
      var st = (p.status || '').toLowerCase();
      if (st === 'pending') {
        cells += '<td><span class="u-badge pend">Pending</span></td>';
      } else {
        var label = { won: 'WON', lost: 'LOST', push: 'PUSH' }[st] || st.toUpperCase();
        var c = { won: 'pos', lost: 'neg', push: 'zero' }[st] || 'zero';
        var net = p.result_units != null ? ' ' + signUnits(p.result_units) : '';
        cells += '<td class="' + c + '">' + esc(label) + esc(net) + '</td>';
      }
    }
    return '<tr>' + cells + '</tr>';
  }

  function renderDeep(metrics, picks) {
    var mount = document.getElementById('uDeep');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'uDeep';
      var anchor = document.querySelector('.u-stats');
      var how = document.querySelector('.u-how');
      if (how && how.parentNode) how.parentNode.insertBefore(mount, how);
      else if (anchor && anchor.parentNode) anchor.parentNode.appendChild(mount);
      else document.querySelector('main, body').appendChild(mount);
    }
    var html = '';

    var graded = picks.filter(function (p) { return ['won', 'lost', 'push'].indexOf((p.status || '').toLowerCase()) >= 0; });
    var pending = picks.filter(function (p) { return (p.status || '').toLowerCase() === 'pending' && p.is_public; });
    graded.sort(function (a, b) { return String(b.graded_at || '').localeCompare(String(a.graded_at || '')); });
    pending.sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); });

    // avg odds per sport from pick log (metrics by_sport has no odds)
    var oddsBySport = {};
    graded.forEach(function (p) {
      var k = sportLabel(p.sport_key);
      (oddsBySport[k] = oddsBySport[k] || []).push(p);
    });

    // Merge split rows that map to the same display label (e.g. the API keys each
    // soccer competition separately; all should roll up into one "Soccer" row).
    function mergeSplits(list, labelFn) {
      var map = {}, order = [];
      (list || []).forEach(function (s) {
        var lab = labelFn(s.key);
        if (!map[lab]) { map[lab] = { label: lab, wins: 0, losses: 0, pushes: 0, total: 0, net: 0, risked: 0 }; order.push(lab); }
        var g = map[lab];
        g.wins += n(s.wins); g.losses += n(s.losses); g.pushes += n(s.pushes);
        g.total += n(s.total); g.net += n(s.net); g.risked += n(s.risked);
      });
      return order.map(function (lab) {
        var g = map[lab];
        g.roi = g.risked ? (g.net / g.risked) * 100 : 0;
        g.win_rate = (g.wins + g.losses) ? (g.wins / (g.wins + g.losses)) * 100 : 0;
        return g;
      }).sort(function (a, b) { return b.total - a.total; });
    }

    // ---- Sport breakdown (units / ROI / win% / avg odds / picks per sport) ----
    var bySport = mergeSplits((metrics.splits && metrics.splits.by_sport) || [], sportLabel);
    if (bySport.length) {
      var srows = bySport.map(function (s) {
        var ao = avgOddsOf(oddsBySport[s.label] || []);
        return '<tr><td>' + esc(s.label) + '</td>' +
          '<td>' + esc(recStr(s.wins, s.losses, s.pushes)) + '</td>' +
          '<td>' + n(s.total) + '</td>' +
          '<td class="' + cls(s.net) + '">' + esc(signUnits(s.net)) + '</td>' +
          '<td class="' + cls(s.roi) + '">' + esc(signPct(s.roi)) + '</td>' +
          '<td>' + esc(pct1(s.win_rate)) + '</td>' +
          '<td>' + (ao != null ? esc(amer(ao)) : '--') + '</td></tr>';
      });
      html += tableBlock('Sport-by-sport breakdown',
        ['Sport', 'Record', 'Picks', 'Units', 'ROI', 'Win %', 'Avg Odds'], srows);
    }

    // ---- Market / bet-type breakdown ----
    var byMarket = mergeSplits((metrics.splits && metrics.splits.by_market) || [], marketLabel);
    if (byMarket.length) {
      var mrows = byMarket.map(function (m) {
        return '<tr><td>' + esc(m.label) + '</td>' +
          '<td>' + esc(recStr(m.wins, m.losses, m.pushes)) + '</td>' +
          '<td>' + n(m.total) + '</td>' +
          '<td class="' + cls(m.net) + '">' + esc(signUnits(m.net)) + '</td>' +
          '<td class="' + cls(m.roi) + '">' + esc(signPct(m.roi)) + '</td>' +
          '<td>' + esc(pct1(m.win_rate)) + '</td></tr>';
      });
      html += tableBlock('Bet-type breakdown',
        ['Market', 'Record', 'Picks', 'Units', 'ROI', 'Win %'], mrows);
    }

    // ---- Advanced analytics (recent form + quality scores) ----
    var rf = metrics.rolling_form || {}, sc = metrics.scores || {}, sm = metrics.summary || {}, dd = metrics.drawdown || {};
    function rfCard(o, label) {
      if (!o || !o.total) return '';
      return statCard(signUnits(o.net_units) + ' / ' + pct1(o.win_rate), label, cls(o.net_units));
    }
    var advCards = [
      rfCard(rf.last_25, 'Last 25 (U / Win%)'),
      rfCard(rf.last_50, 'Last 50 (U / Win%)'),
      rfCard(rf.last_100, 'Last 100 (U / Win%)'),
      sc.capper_rating != null ? statCard(String(Math.round(n(sc.capper_rating))), 'Capper Rating') : '',
      sm.effective_units != null ? statCard(signUnits(sm.effective_units), 'Effective Units', cls(sm.effective_units)) : '',
      sm.avg_implied_prob != null ? statCard((n(sm.avg_implied_prob) * 100).toFixed(1) + '%', 'Avg Implied Prob') : '',
      sm.avg_units != null ? statCard(n(sm.avg_units).toFixed(2) + 'u', 'Avg Stake') : '',
      sc.consistency != null ? statCard(n(sc.consistency).toFixed(0), 'Consistency') : '',
      dd.max_drawdown != null ? statCard(signUnits(-Math.abs(n(dd.max_drawdown))), 'Max Drawdown', 'neg') : ''
    ].filter(Boolean);
    if (advCards.length) {
      var adv = '<section class="u-block"><h2>Advanced analytics</h2><div class="u-substats">' +
        advCards.join('') + '</div>';
      var bw = metrics.best_worst || {};
      function bwInner(kind, node) {
        if (!node) return '';
        var out = '';
        function name(x) { return kind === 'Sport' ? sportLabel(x.key) : marketLabel(x.key); }
        if (node.best) out += '<div class="u-stat"><div class="u-bwh">Best ' + esc(kind) + '</div><b>' + esc(name(node.best)) +
          '</b><span class="u-num ' + cls(node.best.net) + '">' + esc(signUnits(node.best.net)) + ' &middot; ' + esc(signPct(node.best.roi)) + '</span></div>';
        if (node.worst) out += '<div class="u-stat"><div class="u-bwh">Worst ' + esc(kind) + '</div><b>' + esc(name(node.worst)) +
          '</b><span class="u-num ' + cls(node.worst.net) + '">' + esc(signUnits(node.worst.net)) + ' &middot; ' + esc(signPct(node.worst.roi)) + '</span></div>';
        return out;
      }
      var bwHTML = bwInner('Sport', bw.sport) + bwInner('Market', bw.market);
      if (bwHTML) adv += '<div class="u-bw" style="margin-top:12px;">' + bwHTML + '</div>';
      adv += '</section>';
      html += adv;
    }

    // ---- Pending (public) picks ----
    if (pending.length) {
      html += tableBlock('Pending picks (' + pending.length + ')',
        ['Date', 'Sport', 'Matchup', 'Pick', 'Units', 'Status'],
        pending.slice(0, 25).map(function (p) { return pickRowHTML(p, true); }),
        'Locked picks awaiting results. Not counted in the record until they settle.');
    }

    // ---- Recent graded picks ----
    if (graded.length) {
      html += tableBlock('Recent graded picks',
        ['Date', 'Sport', 'Matchup', 'Pick', 'Units', 'Result'],
        graded.slice(0, 12).map(function (p) { return pickRowHTML(p, true); }),
        'Most recent settled picks.');
    }

    // ---- Full pick history with a sport filter ----
    if (graded.length) {
      var sportsSet = {};
      graded.forEach(function (p) { sportsSet[sportLabel(p.sport_key)] = 1; });
      var opts = '<option value="all">All sports</option>' +
        Object.keys(sportsSet).sort().map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
      var filterHTML = '<div class="u-filter"><label for="uHistSport">Filter:</label>' +
        '<select id="uHistSport">' + opts + '</select>' +
        '<span id="uHistCount"></span></div>';
      html += tableBlock('Full pick history (' + graded.length + ')',
        ['Date', 'Sport', 'Matchup', 'Pick', 'Units', 'Result'],
        graded.map(function (p) {
          return pickRowHTML(p, true).replace('<tr>', '<tr data-sport="' + esc(sportLabel(p.sport_key)) + '">');
        }),
        'Every graded pick on the public record. Wins and losses both stay, permanently.',
        filterHTML).replace('<table class="u-table">', '<table class="u-table" id="uHistTable">');
    }

    mount.innerHTML = html;

    // wire the history sport filter
    var sel = document.getElementById('uHistSport');
    var tbl = document.getElementById('uHistTable');
    var cnt = document.getElementById('uHistCount');
    function applyFilter() {
      if (!tbl) return;
      var v = sel.value, shown = 0;
      tbl.querySelectorAll('tbody tr').forEach(function (tr) {
        var ok = v === 'all' || tr.getAttribute('data-sport') === v;
        tr.style.display = ok ? '' : 'none';
        if (ok) shown++;
      });
      if (cnt) cnt.textContent = shown + ' pick' + (shown === 1 ? '' : 's');
    }
    if (sel && tbl) { sel.addEventListener('change', applyFilter); applyFilter(); }
  }

  // ---------- legacy lightweight hydrate (fallback only) ----------
  function runLegacyHydrate() {
  injectCSS();
  if (apiKnownDown) {
    /* Nothing to refresh from. The baked record is revealed and correct; adding
       a failed /metrics and up to ten failed /picks pages on top of it would
       change nothing on screen and cost the backend a burst it cannot afford. */
    return;
  }
  /* Reuse the head preload rather than re-requesting /metrics. We reach here on
     a HEALTHY backend only when the shell fetch missed the 1.5s deadline, and in
     that case the preload has usually already resolved -- so the baked numbers
     refresh with no extra request at all. */
  var pre0 = window.__TMR_PROFILE_PRELOAD;
  var metricsP = (pre0 && pre0.username === un && pre0.metrics)
    ? pre0.metrics.catch(function () { return null; })
    : getJSON(API + '/users/' + encodeURIComponent(un) + '/metrics');
  Promise.all([
    metricsP,
    fetchAllPicks(un)
  ]).then(function (res) {
    var metrics = res[0], picks = res[1] || [];
    if (metrics && metrics.summary) {
      try { renderHeadline(metrics.summary, metrics.streaks); } catch (e) { /* keep baked */ }
      try { renderDeep(metrics, picks); } catch (e) { /* keep baked */ }
      return;
    }
    // Fallback: metrics unavailable -> at least refresh headline from the user aggregate.
    getJSON(API + '/users/' + encodeURIComponent(un)).then(function (j) {
      if (!j) return;
      var d = j.user || j;
      renderHeadline({
        record: recStr(d.wins, d.losses, d.pushes), net_units: d.net_units, roi: d.roi,
        win_rate: d.win_rate, total_picks: (n(d.wins) + n(d.losses) + n(d.pushes)), avg_odds: d.average_odds
      }, { current: d.current_streak, best: d.best_streak });
      if (picks.length) { try { renderDeep({ splits: {}, summary: d, scores: {}, rolling_form: {}, streaks: { current: d.current_streak, best: d.best_streak } }, picks); } catch (e) {} }
    });
  });
  }

  /* SOFT404_20260818 -- carry the baked SEO head across the document.write swap.
     ---------------------------------------------------------------------------
     document.open()/write() below replaces the WHOLE document, <head> included,
     so the baked per-member <title>, description, robots, og/twitter tags and
     ProfilePage JSON-LD were thrown away and replaced by the /profile/ shell's
     generic ones. Every /u/ URL therefore RENDERED as the identical
     "Profile | TrustMyRecord" / "View user profile, verified pick record..."
     document, with no <h1> at all. Google indexes the rendered page, so it saw
     one generic page repeated at every member address: of the 19 /u/ URLs it had
     crawled by 2026-08-18, 12 were filed "Soft 404", 2 "Crawled - currently not
     indexed", and only 5 were indexed. The canonical survived only by accident,
     because the shell rewrites it from location.

     tmr-forum-thread-hydrate.js and tmr-forum-cat-hydrate.js already snapshot and
     restore their SEO head across the same kind of swap; the profile swap simply
     never got it. Do NOT ship this swap without the restore. */
  function safeJson(v) {
    return JSON.stringify(v).replace(/</g, '\u003c').replace(/-->/g, '--\u003e');
  }
  function headAttr(tag, matchAttr, matchVal, want) {
    var n = document.head.getElementsByTagName(tag);
    for (var i = 0; i < n.length; i++) {
      if ((n[i].getAttribute(matchAttr) || '') === matchVal) return n[i].getAttribute(want);
    }
    return null;
  }
  function headPrefixed(attr, prefix) {
    var out = [], n = document.head.getElementsByTagName('meta');
    for (var i = 0; i < n.length; i++) {
      var k = n[i].getAttribute(attr), v = n[i].getAttribute('content');
      if (k && v && k.indexOf(prefix) === 0) out.push([k, v]);
    }
    return out;
  }
  var bakedSeo = {
    title: document.title,
    desc: headAttr('meta', 'name', 'description', 'content'),
    canonical: headAttr('link', 'rel', 'canonical', 'href'),
    robots: headAttr('meta', 'name', 'robots', 'content') || 'index, follow',
    og: headPrefixed('property', 'og:'),
    tw: headPrefixed('name', 'twitter:'),
    ld: (function () {
      var out = [], n = document.head.getElementsByTagName('script');
      for (var i = 0; i < n.length; i++) {
        if (n[i].type === 'application/ld+json') out.push(n[i].textContent);
      }
      return out;
    }()),
    h1: (function () {
      var h = document.querySelector('h1');
      return h ? (h.textContent || '').trim() : '';
    }())
  };

  /* Serialised into the swapped document and run at the END of its <head>, so the
     shell's own generic title/description/JSON-LD have been parsed and can be
     overwritten. Must reference nothing outside window.__TMR_PROFILE_SEO, and
     must contain no closing script tag. */
  function restoreBakedSeo() {
    var s = window.__TMR_PROFILE_SEO;
    if (!s) return;
    var H = document.head;
    function meta(attr, key, val) {
      if (!val) return;
      var el = null, n = H.getElementsByTagName('meta');
      for (var i = 0; i < n.length; i++) {
        if (n[i].getAttribute(attr) === key) { el = n[i]; break; }
      }
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); H.appendChild(el); }
      el.setAttribute('content', val);
    }
    if (s.title) document.title = s.title;
    var canon = null, links = H.getElementsByTagName('link');
    for (var i = 0; i < links.length; i++) {
      if ((links[i].getAttribute('rel') || '') === 'canonical') { canon = links[i]; break; }
    }
    if (!canon) {
      canon = document.createElement('link');
      canon.setAttribute('rel', 'canonical');
      H.appendChild(canon);
    }
    if (s.canonical) canon.setAttribute('href', s.canonical);
    meta('name', 'robots', s.robots);
    meta('name', 'description', s.desc);
    for (var j = 0; j < s.og.length; j++) meta('property', s.og[j][0], s.og[j][1]);
    for (var k = 0; k < s.tw.length; k++) meta('name', s.tw[k][0], s.tw[k][1]);
    if (s.ld && s.ld.length) {
      var scripts = H.getElementsByTagName('script'), drop = [], x;
      for (x = 0; x < scripts.length; x++) {
        if (scripts[x].type === 'application/ld+json') drop.push(scripts[x]);
      }
      for (x = 0; x < drop.length; x++) drop[x].parentNode.removeChild(drop[x]);
      for (x = 0; x < s.ld.length; x++) {
        var tag = document.createElement('script');
        tag.type = 'application/ld+json';
        tag.textContent = s.ld[x];
        H.appendChild(tag);
      }
    }
  }
  var SEO_RESTORE = '<scr' + 'ipt>(' + restoreBakedSeo.toString() + ')();</scr' + 'ipt>';

  // ---------- full-profile swap: load the real /profile/ app at this URL ----------
  function swapToFullProfile() {
    /* The baked page starts this fetch inline in <head> (build_profile_pages.py),
       i.e. before the body is even parsed, and parks the promise here. That is
       ~120ms earlier than this deferred script could start it, and it is the
       difference between "swap lands before first paint" and "visitor watches a
       skeleton". Fall back to fetching it ourselves for pages baked earlier. */
    var shell = window.__TMR_SHELL_PROMISE ||
      fetch('/profile/', { headers: { Accept: 'text/html' }, credentials: 'omit' });

    /* API HEALTH GATE (BAKED_FIRST_20260901). The head preload already has a
       /metrics request in flight; it resolves to null on any non-OK status or
       network error. Reuse that same promise as our health signal rather than
       issuing a probe of our own -- an extra request here would be one more
       duplicate on a pool that is already the bottleneck. We only OBSERVE it;
       the app still consumes it as its own single-use preload, which is what
       removes the "Loading verified metrics..." beat after a healthy swap.

       An older bake with no preload resolves undefined, not null, and is
       allowed to swap exactly as before -- absence of a signal is not a
       failure signal. */
    var pre = window.__TMR_PROFILE_PRELOAD;
    var health = (pre && pre.username === un && pre.metrics)
      ? pre.metrics.catch(function () { return null; })
      : Promise.resolve(undefined);

    /* Do not make a dead backend wait out the shell fetch as well. The health
       answer arrives in roughly 200ms; the shell is a 1.09 MB document and can
       take far longer. Racing them together meant a visitor to a broken API
       still stared at the skeleton until the 1.5s deadline, when we already knew
       at 200ms that the app we were about to mount would have nothing to show.

       So the health signal reveals on its own the moment it comes back null. A
       healthy backend is unaffected: nothing is revealed, and the swap proceeds
       exactly as before once the shell lands. */
    health.then(function (m) {
      if (m === null) {
        apiKnownDown = true;
        clearTimeout(revealFailSafe);
        runLegacyHydrateOnce();
      }
    });
    return Promise.all([
      shell.then(function (r) {
        if (!r.ok) throw new Error('shell HTTP ' + r.status);
        return r.text();
      }),
      health
    ])
      .then(function (both) {
        var html = both[0];
        var metrics = both[1];
        if (metrics === null) {
          apiKnownDown = true;
          throw new Error('api unhealthy -- keeping the baked record on screen');
        }
        /* The 1.5s deadline may have fired while we were waiting. Once the
           legacy path has revealed the baked page the visitor is READING it;
           writing the app over the top at that point is a worse experience than
           not swapping at all, and it would blow away content they can already
           see. Whoever gets there first wins, permanently. */
        if (legacyStarted || revealed) {
          throw new Error('reveal deadline already passed');
        }
        // sanity: only swap if this really is the profile app shell
        if (html.indexOf('profileHeader') < 0) throw new Error('unexpected shell payload');
        // Guarantee the app knows which user to load even before it parses the
        // /u/ path (globals also persist across document.open, this is belt+braces).
        html = html.replace(/<head>/i, '<head><script>window.__TMR_PROFILE_USERNAME=' +
          JSON.stringify(un) + ';window.__TMR_PROFILE_SEO=' + safeJson(bakedSeo) + ';<\/script>');
        // SOFT404_20260818: reinstate this member's title/description/robots/og/JSON-LD.
        if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, SEO_RESTORE + '</head>');
        else html += SEO_RESTORE;
        clearTimeout(revealFailSafe);
        /* document.open()/write() replaces the DOM but NOT the JavaScript realm:
           every global, timer and pending promise from this document stays alive
           inside the new one. Anything of ours that wakes up afterwards must not
           touch the app's DOM or re-inject the app's scripts — that is precisely
           how a second copy of backend-api.js used to get injected and throw
           "Identifier 'TrustMyRecordAPI' has already been declared". Mark the
           realm as swapped and make the legacy path a no-op from here on. */
        window.__TMR_PROFILE_SWAPPED = true;
        legacyStarted = true;
        revealed = true;
        document.open();
        document.write(html);
        document.close();

        /* The shell renders the member's name into #profileHeader as the page's
           only <h1> (profile/index.html, .profile-name). Until that async render
           lands the swapped document has no <h1> at all -- the second half of the
           SOFT404_20260818 signal. Reassert the baked name only if the app has not
           produced a heading of its own. */
        var setH1 = function () {
          if (document.querySelector('h1')) return;
          var host = document.getElementById('profileHeader');
          if (!host || !bakedSeo.h1) return;
          var h = document.createElement('h1');
          h.className = 'profile-name';
          h.textContent = bakedSeo.h1;
          host.insertBefore(h, host.firstChild);
        };
        setTimeout(setH1, 1500);
        setTimeout(setH1, 4000);
      });
  }

  var legacyStarted = false;
  function runLegacyHydrateOnce() {
    // Never touch the DOM once the app shell owns this document — the realm
    // outlives document.write(), so this callback can still be reached.
    if (legacyStarted || window.__TMR_PROFILE_SWAPPED) return;
    legacyStarted = true;
    revealBaked();
    runLegacyHydrate();
  }

  swapToFullProfile().catch(function () {
    clearTimeout(revealFailSafe);
    runLegacyHydrateOnce();
  });
})();
