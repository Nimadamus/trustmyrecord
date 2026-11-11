/**
 * MLB_POSTSEASON_REPLAY_20261111. The bracket on /mlb-playoff-simulator/.
 *
 * Out of season the page had the word Simulator in its title and nothing to
 * simulate. This plays the real twelve team field in the real format:
 *
 *   Wild Card Series   best of three, every game at the higher seed (3v6, 4v5)
 *   Division Series    best of five, 2-2-1, seeds 1 and 2 wait (1 v 4/5, 2 v 3/6)
 *   LCS, World Series  best of seven, 2-3-2, no reseeding at any point
 *
 * Team strength is each club's own season: the Pythagorean expectation from its
 * runs scored and allowed, shrunk a little toward its actual record. One game
 * is log5 of the two strengths with a 54 percent home field. Nothing else is
 * assumed, and the field, seeds, records and run differentials are read from
 * the table already printed on the page, so the widget can never disagree with
 * it and needs no edit when next season's field is baked in.
 *
 * Pure functions are exported for node so the format can be tested.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.TMRMlbReplay = api; if (root.document) api.boot(root); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HOME_EDGE = 0.54;
  var GAMES = 162;
  // Typical runs a team scores in a season; only the run differential is on the
  // page, and the Pythagorean ratio needs a level to hang it on.
  var LEAGUE_RUNS = 720;
  var ROUNDS = ['Wild Card Series', 'Division Series', 'Championship Series', 'World Series'];
  var HOSTS = { 3: [1, 1, 1], 5: [1, 1, 0, 0, 1], 7: [1, 1, 0, 0, 0, 1, 1] };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Season strength as a win share, from record and run differential. */
  function strength(t) {
    var rs = LEAGUE_RUNS + t.rd / 2, ra = LEAGUE_RUNS - t.rd / 2;
    var pyth = Math.pow(rs, 1.83) / (Math.pow(rs, 1.83) + Math.pow(ra, 1.83));
    var actual = t.w / Math.max(1, t.w + t.l);
    // A 162 game season still overstates the gap between two clubs, so the
    // blend is pulled a fifth of the way back to an even team.
    return 0.5 + 0.8 * ((0.65 * pyth + 0.35 * actual) - 0.5);
  }

  /** Chance the home club wins one game (log5 with home field). */
  function gameP(home, away) {
    var a = home.str, b = away.str;
    var neutral = (a * (1 - b)) / (a * (1 - b) + b * (1 - a));
    var odds = (neutral / (1 - neutral)) * (HOME_EDGE / (1 - HOME_EDGE));
    return odds / (1 + odds);
  }

  /** Chance the higher seed wins a best of n, exactly, by walking every path. */
  function seriesP(hi, lo, n) {
    var need = (n + 1) / 2, hosts = HOSTS[n];
    var pHome = gameP(hi, lo), pAway = 1 - gameP(lo, hi);
    var memo = {};
    function go(a, b) {
      if (a === need) return 1;
      if (b === need) return 0;
      var k = a + ',' + b;
      if (memo[k] !== undefined) return memo[k];
      var p = hosts[a + b] ? pHome : pAway;
      return (memo[k] = p * go(a + 1, b) + (1 - p) * go(a, b + 1));
    }
    return go(0, 0);
  }

  /** Play one series. Returns { w, l, games: 'hi 3, lo 1' pieces }. */
  function playSeries(hi, lo, n, rnd) {
    var need = (n + 1) / 2, hosts = HOSTS[n], a = 0, b = 0;
    var pHome = gameP(hi, lo), pAway = 1 - gameP(lo, hi);
    while (a < need && b < need) {
      if (rnd() < (hosts[a + b] ? pHome : pAway)) a += 1; else b += 1;
    }
    return a === need ? { w: hi, l: lo, ww: a, lw: b } : { w: lo, l: hi, ww: b, lw: a };
  }

  /** Who hosts: the better seed inside a league, the better record in the World Series. */
  function order(x, y, final) {
    if (!final) return x.seed < y.seed ? [x, y] : [y, x];
    var px = x.w / (x.w + x.l), py = y.w / (y.w + y.l);
    if (px !== py) return px > py ? [x, y] : [y, x];
    return x.rd >= y.rd ? [x, y] : [y, x];
  }

  /**
   * The bracket as a list of slots. A slot's two sides are either a seed or the
   * winner of an earlier slot. picks[slotId] is the abbreviation picked to win.
   */
  function slots(leagues) {
    var out = [];
    leagues.forEach(function (lg) {
      var k = lg.key;
      out.push({ id: k + '-wc-a', lg: k, r: 0, n: 3, a: { seed: 4 }, b: { seed: 5 } });
      out.push({ id: k + '-wc-b', lg: k, r: 0, n: 3, a: { seed: 3 }, b: { seed: 6 } });
      out.push({ id: k + '-ds-a', lg: k, r: 1, n: 5, a: { seed: 1 }, b: { from: k + '-wc-a' } });
      out.push({ id: k + '-ds-b', lg: k, r: 1, n: 5, a: { seed: 2 }, b: { from: k + '-wc-b' } });
      out.push({ id: k + '-cs', lg: k, r: 2, n: 7, a: { from: k + '-ds-a' }, b: { from: k + '-ds-b' } });
    });
    out.push({ id: 'ws', lg: null, r: 3, n: 7, a: { from: leagues[0].key + '-cs' }, b: { from: leagues[1].key + '-cs' } });
    return out;
  }

  function resolve(side, lg, field, winners) {
    if (side.seed) return field[lg][side.seed - 1] || null;
    return winners[side.from] || null;
  }

  /** Winners implied by the picks, dropping any pick its bracket no longer supports. */
  function settle(field, list, picks) {
    var winners = {}, live = {};
    list.forEach(function (s) {
      var x = resolve(s.a, s.lg, field, winners), y = resolve(s.b, s.lg, field, winners);
      var p = picks[s.id];
      if (x && y && p && (p === x.abbr || p === y.abbr)) { winners[s.id] = p === x.abbr ? x : y; live[s.id] = p; }
    });
    return { winners: winners, picks: live };
  }

  /** Fill every open series with a simulated result. Picks already made stand. */
  function simulateRest(field, list, picks, rnd) {
    var st = settle(field, list, picks), winners = st.winners, out = {}, detail = {};
    Object.keys(st.picks).forEach(function (k) { out[k] = st.picks[k]; });
    list.forEach(function (s) {
      if (winners[s.id]) return;
      var x = resolve(s.a, s.lg, field, winners), y = resolve(s.b, s.lg, field, winners);
      if (!x || !y) return;
      var o = order(x, y, s.r === 3), res = playSeries(o[0], o[1], s.n, rnd);
      winners[s.id] = res.w; out[s.id] = res.w.abbr; detail[s.id] = res.ww + '-' + res.lw;
    });
    return { picks: out, detail: detail };
  }

  /** Title odds from n whole postseasons, with the picks made so far locked in. */
  function odds(field, list, picks, n, seed) {
    var rnd = mulberry32(seed >>> 0), tally = {};
    field.all.forEach(function (t) { tally[t.abbr] = { ds: 0, cs: 0, ws: 0, win: 0 }; });
    for (var i = 0; i < n; i += 1) {
      var r = simulateRest(field, list, picks, rnd).picks;
      list.forEach(function (s) {
        var w = r[s.id];
        if (!w) return;
        if (s.r === 0) tally[w].ds += 1;
        else if (s.r === 1) tally[w].cs += 1;
        else if (s.r === 2) tally[w].ws += 1;
        else tally[w].win += 1;
      });
    }
    // The four clubs with a bye are in the Division Series by right.
    field.all.forEach(function (t) { if (t.seed <= 2) tally[t.abbr].ds = n; });
    return { n: n, tally: tally };
  }

  /* ------------------------------------------------------------------ page */

  var ABBR = {
    'Arizona Diamondbacks': 'ARI', 'Athletics': 'ATH', 'Atlanta Braves': 'ATL', 'Baltimore Orioles': 'BAL',
    'Boston Red Sox': 'BOS', 'Chicago Cubs': 'CHC', 'Chicago White Sox': 'CWS', 'Cincinnati Reds': 'CIN',
    'Cleveland Guardians': 'CLE', 'Colorado Rockies': 'COL', 'Detroit Tigers': 'DET', 'Houston Astros': 'HOU',
    'Kansas City Royals': 'KC', 'Los Angeles Angels': 'LAA', 'Los Angeles Dodgers': 'LAD', 'Miami Marlins': 'MIA',
    'Milwaukee Brewers': 'MIL', 'Minnesota Twins': 'MIN', 'New York Mets': 'NYM', 'New York Yankees': 'NYY',
    'Philadelphia Phillies': 'PHI', 'Pittsburgh Pirates': 'PIT', 'San Diego Padres': 'SD', 'San Francisco Giants': 'SF',
    'Seattle Mariners': 'SEA', 'St. Louis Cardinals': 'STL', 'Tampa Bay Rays': 'TB', 'Texas Rangers': 'TEX',
    'Toronto Blue Jays': 'TOR', 'Washington Nationals': 'WSH'
  };
  var LOGO = { CWS: 'chw', ATH: 'oak' };

  function parseTeam(nameCell, recCell, rdCell, seed, lg) {
    var name = String(nameCell || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    var rec = /(\d+)\s*-\s*(\d+)/.exec(recCell || '');
    var rd = Number(String(rdCell || '').replace(/[−–]/g, '-').replace(/[^0-9.\-]/g, ''));
    if (!name || !rec || !isFinite(rd) || !ABBR[name]) return null;
    var t = { name: name, short: name.split(' ').slice(-1)[0], abbr: ABBR[name], seed: seed, lg: lg, w: Number(rec[1]), l: Number(rec[2]), rd: rd };
    if (/Red Sox|White Sox|Blue Jays/.test(name)) t.short = name.split(' ').slice(-2).join(' ');
    t.str = strength(t);
    return t;
  }

  /** Read the field table printed on the page. Null unless it is a full twelve. */
  function readField(doc) {
    var table = doc.querySelector('table.po-t');
    if (!table) return null;
    var field = { AL: [], NL: [], all: [] };
    Array.prototype.forEach.call(table.querySelectorAll('tr'), function (tr) {
      var c = Array.prototype.map.call(tr.querySelectorAll('td'), function (td) { return td.textContent; });
      if (c.length < 7) return;
      var seed = Number(c[0]);
      var a = parseTeam(c[1], c[2], c[3], seed, 'AL'), n = parseTeam(c[4], c[5], c[6], seed, 'NL');
      if (a) field.AL[seed - 1] = a;
      if (n) field.NL[seed - 1] = n;
    });
    for (var i = 0; i < 6; i += 1) if (!field.AL[i] || !field.NL[i]) return null;
    field.all = field.AL.concat(field.NL);
    return field;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(x) { return x <= 0 ? '0%' : x < 0.005 ? '<1%' : Math.round(x * 100) + '%'; }
  function logo(t) {
    return 'https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/' + (LOGO[t.abbr] || t.abbr).toLowerCase() + '.png';
  }

  var CSS = '.mpr{margin:18px 0 6px;padding:18px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(10,18,32,.72);color:#e9eef6}'
    + '.mpr h2{margin:0 0 4px;font-size:1.35rem}.mpr-sub{margin:0 0 12px;color:#a9b6c8;font-size:.92rem;line-height:1.45}'
    + '.mpr-bar{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}'
    + '.mpr-btn{appearance:none;border:1px solid rgba(255,255,255,.22);background:transparent;color:#e9eef6;border-radius:9px;padding:10px 14px;font:600 .9rem/1 inherit;cursor:pointer;min-height:42px}'
    + '.mpr-btn:hover{border-color:#e0a800}.mpr-btn.gold{background:#e0a800;border-color:#e0a800;color:#141414}.mpr-btn:disabled{opacity:.55;cursor:default}'
    + '.mpr-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}'
    + '.mpr-col h3{margin:0 0 8px;font-size:.74rem;letter-spacing:.08em;text-transform:uppercase;color:#a9b6c8}'
    + '.mpr-s{border:1px solid rgba(255,255,255,.12);border-radius:10px;margin:0 0 10px;overflow:hidden;background:rgba(255,255,255,.03)}'
    + '.mpr-s small{display:flex;justify-content:space-between;gap:8px;padding:5px 9px;font-size:.7rem;color:#a9b6c8;border-bottom:1px solid rgba(255,255,255,.08)}'
    + '.mpr-t{display:flex;align-items:center;gap:8px;width:100%;appearance:none;border:0;background:transparent;color:inherit;padding:9px;font:600 .9rem/1.15 inherit;text-align:left;cursor:pointer;min-height:44px}'
    + '.mpr-t + .mpr-t{border-top:1px solid rgba(255,255,255,.08)}.mpr-t:hover:not(:disabled){background:rgba(224,168,0,.12)}'
    + '.mpr-t:disabled{cursor:default;color:#7f8ba0}.mpr-t img{width:22px;height:22px;flex:none}'
    + '.mpr-t i{font-style:normal;color:#a9b6c8;font-weight:500;font-size:.78rem}.mpr-t b{margin-left:auto;font-weight:600;font-size:.78rem;color:#a9b6c8}'
    + '.mpr-t.win{background:rgba(46,160,90,.2)}.mpr-t.win b{color:#7fe3a6}.mpr-t.out{opacity:.5}'
    + '.mpr-champ{margin:4px 0 12px;padding:12px 14px;border-radius:10px;border-left:4px solid #e0a800;background:rgba(224,168,0,.12);font-weight:600}'
    + '.mpr-odds{width:100%;border-collapse:collapse;margin:12px 0 4px;font-size:.9rem}.mpr-odds th,.mpr-odds td{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right}'
    + '.mpr-odds th:first-child,.mpr-odds td:first-child{text-align:left}.mpr-odds th{font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:#a9b6c8}'
    + '.mpr-wrap{overflow-x:auto}.mpr-note{margin:10px 0 0;color:#a9b6c8;font-size:.82rem;line-height:1.45}'
    + '@media(max-width:820px){.mpr-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:480px){.mpr{padding:14px}.mpr-grid{grid-template-columns:minmax(0,1fr)}}';

  function boot(root) {
    var doc = root.document;
    function start() {
      var mount = doc.getElementById('mlbReplay');
      if (!mount) return;
      var field = readField(doc);
      if (!field) return;                      // no full field on the page: stay out of the way
      var leagues = [{ key: 'AL', name: 'American League' }, { key: 'NL', name: 'National League' }];
      var list = slots(leagues);
      var KEY = 'tmr-mlb-replay:' + field.all.map(function (t) { return t.abbr; }).join('');
      var S = { picks: {}, detail: {}, odds: null };
      try { var raw = root.localStorage.getItem(KEY); if (raw) { var k = JSON.parse(raw); S.picks = k.picks || {}; S.detail = k.detail || {}; } } catch (e) { /* fresh bracket */ }
      function save() { try { root.localStorage.setItem(KEY, JSON.stringify({ picks: S.picks, detail: S.detail })); } catch (e) { /* private mode */ } }

      var st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st);

      function teamBtn(s, t, other, winner, hiFirst) {
        if (!t) return '<button type="button" class="mpr-t" disabled><i>Winner of the series before</i></button>';
        var cls = 'mpr-t' + (winner ? (winner.abbr === t.abbr ? ' win' : ' out') : '');
        var chance = '';
        if (other) {
          var o = order(t, other, s.r === 3), p = seriesP(o[0], o[1], s.n);
          chance = pct(o[0].abbr === t.abbr ? p : 1 - p);
        }
        var score = winner && S.detail[s.id] ? (winner.abbr === t.abbr ? S.detail[s.id] : '') : '';
        return '<button type="button" class="' + cls + '" data-slot="' + s.id + '" data-team="' + t.abbr + '"' + (other ? '' : ' disabled')
          + ' aria-pressed="' + (winner && winner.abbr === t.abbr ? 'true' : 'false') + '">'
          + '<img src="' + esc(logo(t)) + '" alt="" width="22" height="22" loading="lazy" decoding="async">'
          + '<span>' + esc(t.short) + ' <i>' + t.seed + ' seed, ' + t.w + '-' + t.l + '</i></span>'
          + '<b>' + (score ? 'won ' + esc(score) : chance) + '</b></button>';
      }

      function render() {
        var settled = settle(field, list, S.picks);
        S.picks = settled.picks;
        var w = settled.winners, cols = ['', '', '', ''];
        list.forEach(function (s) {
          var x = resolve(s.a, s.lg, field, w), y = resolve(s.b, s.lg, field, w);
          var label = (s.lg ? s.lg + ' ' : '') + (s.r === 0 ? 'Wild Card' : s.r === 1 ? 'Division Series' : s.r === 2 ? 'Championship Series' : 'World Series');
          cols[s.r] += '<div class="mpr-s"><small><span>' + label + '</span><span>Best of ' + s.n + '</span></small>'
            + teamBtn(s, x, y, w[s.id]) + teamBtn(s, y, x, w[s.id]) + '</div>';
        });
        var champ = w.ws;
        var done = list.every(function (s) { return w[s.id]; });
        var html = '<h2>Play the ' + esc(mount.getAttribute('data-season') || '') + ' postseason</h2>'
          + '<p class="mpr-sub">The real twelve team field in the real format. Click a club to send it through, or let the simulator play every series you have not picked. The percentage beside each club is its chance to win that series.</p>'
          + '<div class="mpr-bar">'
          + '<button type="button" class="mpr-btn gold" data-act="sim"' + (done ? ' disabled' : '') + '>Simulate the rest</button>'
          + '<button type="button" class="mpr-btn" data-act="odds">Run 10,000 postseasons</button>'
          + '<button type="button" class="mpr-btn" data-act="reset"' + (Object.keys(S.picks).length ? '' : ' disabled') + '>Start over</button>'
          + '</div>'
          + (champ ? '<p class="mpr-champ" role="status">Your World Series champion: ' + esc(champ.name) + '.</p>' : '')
          + '<div class="mpr-grid">' + cols.map(function (c, i) { return '<div class="mpr-col"><h3>' + ROUNDS[i] + '</h3>' + c + '</div>'; }).join('') + '</div>';
        if (S.odds) {
          var rows = field.all.slice().sort(function (a, b) { return S.odds.tally[b.abbr].win - S.odds.tally[a.abbr].win; });
          var k = S.odds.locked || 0;
          html += '<div class="mpr-wrap" id="mprOdds"><table class="mpr-odds"><caption class="mpr-note" style="caption-side:bottom;text-align:left">'
            + S.odds.n.toLocaleString('en-US') + ' simulated postseasons' + (k ? ', with your ' + k + (k === 1 ? ' pick' : ' picks') + ' locked in' : '') + '.</caption>'
            + '<thead><tr><th scope="col">Team</th><th scope="col">Reach DS</th><th scope="col">Reach LCS</th><th scope="col">Reach WS</th><th scope="col">Win it all</th></tr></thead><tbody>'
            + rows.map(function (t) {
              var o = S.odds.tally[t.abbr], n = S.odds.n;
              return '<tr><td>' + esc(t.name) + '</td><td>' + (t.seed <= 2 ? 'bye' : pct(o.ds / n)) + '</td><td>' + pct(o.cs / n) + '</td><td>' + pct(o.ws / n) + '</td><td>' + pct(o.win / n) + '</td></tr>';
            }).join('') + '</tbody></table></div>';
        }
        html += '<p class="mpr-note">Strength is each club\'s own season: its record and run differential from the standings table on this page. Home field is 54 percent a game. The Wild Card Series is played entirely at the higher seed, and the World Series opens at the club with the better record.</p>';
        mount.innerHTML = html;
      }

      mount.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('button') : null;
        if (!t || t.disabled) return;
        var act = t.getAttribute('data-act');
        if (act === 'sim') {
          var r = simulateRest(field, list, S.picks, mulberry32((Math.random() * 4294967295) >>> 0));
          Object.keys(r.detail).forEach(function (k) { S.detail[k] = r.detail[k]; });
          S.picks = r.picks; S.odds = null; save(); render();
        } else if (act === 'reset') {
          S.picks = {}; S.detail = {}; S.odds = null; save(); render();
        } else if (act === 'odds') {
          // A finished bracket has nothing left to simulate, so the odds are for the open field.
          var full = list.every(function (s) { return S.picks[s.id]; });
          S.odds = odds(field, list, full ? {} : S.picks, 10000, (Math.random() * 4294967295) >>> 0);
          S.odds.locked = full ? 0 : Object.keys(S.picks).length;
          render();
          var o = doc.getElementById('mprOdds');
          if (o && o.scrollIntoView) {
            var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
            o.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
          }
        } else if (t.getAttribute('data-slot')) {
          var id = t.getAttribute('data-slot'), team = t.getAttribute('data-team');
          if (S.picks[id] === team) delete S.picks[id]; else S.picks[id] = team;
          delete S.detail[id];
          // A changed result upstream voids the series it fed: those scores no longer describe anything.
          var keep = settle(field, list, S.picks).picks;
          Object.keys(S.detail).forEach(function (k) { if (!keep[k]) delete S.detail[k]; });
          S.odds = null; save(); render();
        }
      });
      render();
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
    else start();
  }

  return { strength: strength, gameP: gameP, seriesP: seriesP, playSeries: playSeries, slots: slots, settle: settle,
    simulateRest: simulateRest, odds: odds, parseTeam: parseTeam, mulberry32: mulberry32, boot: boot };
}));
