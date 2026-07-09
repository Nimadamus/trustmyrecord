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
      return getJSON(API + '/picks?username=' + encodeURIComponent(user) + '&limit=100&offset=' + off)
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
  Promise.all([
    getJSON(API + '/users/' + encodeURIComponent(un) + '/metrics'),
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

  // ---------- full-profile swap: load the real /profile/ app at this URL ----------
  function swapToFullProfile() {
    return fetch('/profile/', { headers: { Accept: 'text/html' } })
      .then(function (r) {
        if (!r.ok) throw new Error('shell HTTP ' + r.status);
        return r.text();
      })
      .then(function (html) {
        // sanity: only swap if this really is the profile app shell
        if (html.indexOf('profileHeader') < 0) throw new Error('unexpected shell payload');
        // Guarantee the app knows which user to load even before it parses the
        // /u/ path (globals also persist across document.open, this is belt+braces).
        html = html.replace(/<head>/i, '<head><script>window.__TMR_PROFILE_USERNAME=' +
          JSON.stringify(un) + ';<\/script>');
        document.open();
        document.write(html);
        document.close();
      });
  }

  swapToFullProfile().catch(function () { runLegacyHydrate(); });
})();
