/* SIM_BETTOR_PANEL_20261121. "The bet" panel on every game simulator result.
 *
 * Reads projection.betting from the simulator API (services/simBetting.js on the
 * backend): the book's line and price, the book's no-vig probability, the
 * simulated probability, the simulator's fair price and the difference. Plus an
 * alternate line calculator priced from the exact simulated distribution.
 *
 * Rules it keeps: a run that started from the sportsbook line says so, every
 * market says whether its number is the book's or the model's, and nothing is
 * ever called an edge. Hidden entirely when the API sends no betting block, so
 * an older API simply shows the page as before.
 */
(function () {
  'use strict';
  var global = window;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function pct(p) { return (p == null || !isFinite(p)) ? '–' : (Math.round(p * 1000) / 10).toFixed(1) + '%'; }
  function am(v) { return (v == null || !isFinite(v)) ? '–' : (v > 0 ? '+' + v : String(v)); }
  function line(v) { return (v == null || !isFinite(v)) ? '–' : (v > 0 ? '+' + v : (v === 0 ? 'PK' : String(v))); }
  function diff(v) {
    if (v == null || !isFinite(v)) return '–';
    if (Math.abs(v) < 0.5) return 'Same as book';
    return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1) + ' pts';
  }
  function fairAmerican(p) {
    if (!isFinite(p) || p <= 0 || p >= 1) return null;
    return Math.round(p >= 0.5 ? -100 * p / (1 - p) : 100 * (1 - p) / p);
  }
  // Exact split of a curve [[x, share], ...] around a line.
  function split(curve, at) {
    var o = { above: 0, at: 0, below: 0 };
    (curve || []).forEach(function (q) {
      if (Math.abs(q[0] - at) < 0.05) o.at += q[1];
      else if (q[0] > at) o.above += q[1];
      else o.below += q[1];
    });
    return o;
  }

  var CSS = '' +
    '.tmr-bet{background:var(--card,#0f1b2d);border:1px solid var(--line,#24344d);border-radius:var(--r,12px);padding:16px;margin:14px 0}' +
    '.tmr-bet h3{margin:0 0 4px;font-size:1.05rem;letter-spacing:.02em}' +
    '.tmr-bet .tb-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:10px}' +
    '.tmr-bet .tb-badge{display:inline-block;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:3px 8px;border-radius:999px;border:1px solid currentColor}' +
    '.tmr-bet .tb-badge.market{color:#7fb8ff}.tmr-bet .tb-badge.model{color:#f2c14e}' +
    '.tmr-bet .tb-src{font-size:.78rem;opacity:.75}' +
    '.tmr-bet .tb-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}' +
    '.tmr-bet .tb-card{border:1px solid var(--line,#24344d);border-radius:10px;padding:10px 12px;min-width:0}' +
    '.tmr-bet .tb-card h4{margin:0 0 6px;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;opacity:.8;display:flex;justify-content:space-between;gap:6px}' +
    '.tmr-bet .tb-card h4 span{font-weight:600;text-transform:none;letter-spacing:0;opacity:.85}' +
    '.tmr-bet table{width:100%;border-collapse:collapse;font-size:.84rem;font-variant-numeric:tabular-nums}' +
    '.tmr-bet th,.tmr-bet td{padding:3px 2px;text-align:right;white-space:nowrap}' +
    '.tmr-bet th:first-child,.tmr-bet td:first-child{text-align:left;opacity:.8}' +
    '.tmr-bet thead th{font-size:.7rem;font-weight:600;opacity:.65;text-transform:uppercase}' +
    '.tmr-bet .tb-note{font-size:.78rem;opacity:.75;margin:10px 0 0;line-height:1.45}' +
    '.tmr-bet .tb-ind{font-size:.82rem;margin:8px 0 0}' +
    '.tmr-bet .tb-alt{margin-top:12px;border-top:1px solid var(--line,#24344d);padding-top:10px}' +
    '.tmr-bet .tb-alt form{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}' +
    '.tmr-bet .tb-alt label{display:flex;flex-direction:column;font-size:.74rem;gap:3px;opacity:.9}' +
    '.tmr-bet .tb-alt input{width:96px;padding:8px;border-radius:8px;border:1px solid var(--line,#24344d);background:transparent;color:inherit;font-size:16px}' +
    '.tmr-bet .tb-out{font-size:.84rem;margin-top:8px;line-height:1.5;font-variant-numeric:tabular-nums}' +
    '.tmr-bet .tb-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}' +
    '.tmr-bet .tb-props table{min-width:560px}' +
    '.tmr-bet .tb-boardtbl{min-width:720px}' +
    '.tmr-bet .tb-boardtbl td:first-child a{color:inherit;font-weight:600;text-decoration:underline;text-underline-offset:2px}' +
    '.tmr-bet .tb-lock{color:#f2c14e;font-weight:600;text-decoration:none}' +
    '.tmr-bet td.tb-lockcell{text-align:center}' +
    '.tmr-bet .tb-cards{display:none}' +
    '.tmr-bet .tb-gcard{margin-top:8px;padding:10px 12px}' +
    '.tmr-bet .tb-ghead{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px;font-size:.9rem}' +
    '.tmr-bet .tb-ghead a{color:inherit;font-weight:700;text-decoration:underline;text-underline-offset:2px}' +
    '.tmr-bet .tb-ghead span{font-size:.78rem;opacity:.75}' +
    '.tmr-bet .tb-grow{display:grid;grid-template-columns:78px 1fr auto;gap:6px;font-size:.82rem;padding:3px 0;font-variant-numeric:tabular-nums;border-top:1px solid rgba(255,255,255,.05)}' +
    '.tmr-bet .tb-glabel{opacity:.7}.tmr-bet .tb-gsim{font-weight:700;text-align:right}' +
    '.tmr-bet .tb-glock{grid-template-columns:1fr;text-align:center;padding-top:6px}' +
    '@media (max-width:640px){.tmr-bet .tb-board-scroll,.tmr-bet.tb-board .tb-scroll{display:none}.tmr-bet .tb-cards{display:block}}' +
    '.tmr-bet .tb-more{margin-top:8px;background:transparent;color:inherit;border:1px solid var(--line,#24344d);border-radius:8px;padding:8px 12px;font-size:.82rem;cursor:pointer}' +
    '@media (max-width:760px){.tmr-bet .tb-grid{grid-template-columns:1fr}.tmr-bet{padding:12px}}';

  function injectCss() {
    if (document.getElementById('tmr-bet-css')) return;
    var s = el('style'); s.id = 'tmr-bet-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  function table(head, rows) {
    var t = el('table');
    var th = el('thead'); var tr = el('tr');
    head.forEach(function (h) { tr.appendChild(el('th', '', h)); });
    th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody');
    rows.forEach(function (r) {
      var row = el('tr');
      r.forEach(function (c) { row.appendChild(el('td', '', c)); });
      tb.appendChild(row);
    });
    t.appendChild(tb);
    return t;
  }

  function basisText(b) { return b === 'market' ? 'From the book' : (b === 'market margin' ? 'Around the book' : 'Model'); }

  function card(title, basis, rows) {
    var c = el('div', 'tb-card');
    var h = el('h4', '', title);
    if (basis) h.appendChild(el('span', '', basisText(basis)));
    c.appendChild(h);
    c.appendChild(table(['', 'Book', 'No-vig', 'Sim', 'Fair'], rows));
    return c;
  }

  function build(d) {
    var p = d && d.projection; var b = p && p.betting;
    if (!b || !b.moneyline) return null;
    injectCss();
    var m = d.matchup || {};
    var H = (m.home && (m.home.abbr || m.home.name)) || 'Home';
    var A = (m.away && (m.away.abbr || m.away.name)) || 'Away';
    var box = el('section', 'tmr-bet');
    box.setAttribute('aria-label', 'Simulation against the sportsbook');

    var top = el('div', 'tb-top');
    var left = el('div');
    left.appendChild(el('h3', '', 'The bet'));
    var src = b.market && b.market.book
      ? 'Book: ' + b.market.book + (b.market.captured_at ? ' · line as of ' + new Date(b.market.captured_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '')
      : 'Simulator fair prices';
    left.appendChild(el('div', 'tb-src', src));
    top.appendChild(left);
    var badge = el('span', 'tb-badge ' + (b.basis && b.basis.kind === 'market' ? 'market' : 'model'), (b.basis && b.basis.label) || 'Model');
    badge.title = (b.basis && b.basis.note) || '';
    top.appendChild(badge);
    box.appendChild(top);

    var grid = el('div', 'tb-grid');
    var ml = b.moneyline;
    var hasBook = ml.book_novig_home_prob != null;
    grid.appendChild(card('Moneyline', ml.basis, [
      [A, hasBook ? am(ml.book_away_price) : '–', hasBook ? pct(1 - ml.book_novig_home_prob) : '–', pct(1 - ml.sim_home_win_prob), am(ml.fair_away_price)],
      [H, hasBook ? am(ml.book_home_price) : '–', hasBook ? pct(ml.book_novig_home_prob) : '–', pct(ml.sim_home_win_prob), am(ml.fair_home_price)],
    ]));
    if (b.spread) {
      var s = b.spread;
      var hc = s.home_cover_ex_push;
      grid.appendChild(card('Spread', s.basis, [
        [A + ' ' + line(-s.home_line), am(s.book_away_price), s.book_novig_home_prob != null ? pct(1 - s.book_novig_home_prob) : '–', hc != null ? pct(1 - hc) : '–', am(s.fair_away_price)],
        [H + ' ' + line(s.home_line), am(s.book_home_price), pct(s.book_novig_home_prob), pct(hc), am(s.fair_home_price)],
      ]));
    }
    if (b.total) {
      var t = b.total;
      var ov = t.over_ex_push;
      grid.appendChild(card('Total ' + t.line, t.basis, [
        ['Over', am(t.book_over_price), pct(t.book_novig_over_prob), pct(ov), am(t.fair_over_price)],
        ['Under', am(t.book_under_price), t.book_novig_over_prob != null ? pct(1 - t.book_novig_over_prob) : '–', ov != null ? pct(1 - ov) : '–', am(t.fair_under_price)],
      ]));
    }
    box.appendChild(grid);

    // Differences, said plainly in one line per market.
    var diffs = [];
    if (hasBook) diffs.push(H + ' wins ' + pct(ml.sim_home_win_prob) + ' vs book ' + pct(ml.book_novig_home_prob));
    if (b.spread && b.spread.book_novig_home_prob != null) diffs.push(H + ' ' + line(b.spread.home_line) + ' covers ' + pct(b.spread.home_cover_ex_push) + ' vs book ' + pct(b.spread.book_novig_home_prob));
    if (b.total && b.total.book_novig_over_prob != null) diffs.push('Over ' + b.total.line + ' ' + pct(b.total.over_ex_push) + ' vs book ' + pct(b.total.book_novig_over_prob));
    if (diffs.length) box.appendChild(el('p', 'tb-ind', 'Sim vs book (vig removed): ' + diffs.join(' · ')));
    var pushes = [];
    if (b.spread && b.spread.push > 0.0005) pushes.push('spread push ' + pct(b.spread.push));
    if (b.total && b.total.push > 0.0005) pushes.push('total push ' + pct(b.total.push));
    if (pushes.length) box.appendChild(el('p', 'tb-note', 'Pushes are left out of the percentages above (' + pushes.join(', ') + ').'));

    if (b.independent_model && b.independent_model.home_win_prob != null && b.basis && b.basis.kind === 'market') {
      box.appendChild(el('p', 'tb-ind', 'Independent model, before the book line: ' + H + ' ' + pct(b.independent_model.home_win_prob)
        + ' (fair ' + am(fairAmerican(b.independent_model.home_win_prob)) + '). The book has been the more accurate number on the graded record, which is why this run starts from it.'));
    }

    // Alternate lines from the exact simulated distribution.
    var alt = el('div', 'tb-alt');
    alt.appendChild(el('h4', '', 'Price any line'));
    var form = el('form');
    form.setAttribute('novalidate', '');
    function field(lbl, val, step) {
      var l = el('label', '', lbl);
      var i = el('input'); i.type = 'number'; i.step = step; i.inputMode = 'decimal';
      if (val != null) i.value = val;
      l.appendChild(i); form.appendChild(l); return i;
    }
    var spIn = field(H + ' spread', b.spread ? b.spread.home_line : null, '0.5');
    var ttIn = field('Total', b.total ? b.total.line : null, '0.5');
    alt.appendChild(form);
    var out = el('div', 'tb-out'); alt.appendChild(out);
    function calc() {
      var parts = [];
      var sv = parseFloat(spIn.value);
      if (isFinite(sv) && b.curves && b.curves.margin) {
        var x = split(b.curves.margin, -sv); var dec = 1 - x.at;
        var hp = dec > 0 ? x.above / dec : null;
        parts.push(H + ' ' + line(sv) + ': covers ' + pct(hp) + ' (fair ' + am(fairAmerican(hp)) + ')' + (x.at > 0.0005 ? ', push ' + pct(x.at) : ''));
      }
      var tv = parseFloat(ttIn.value);
      if (isFinite(tv) && b.curves && b.curves.total) {
        var y = split(b.curves.total, tv); var dt = 1 - y.at;
        var op = dt > 0 ? y.above / dt : null;
        parts.push('Over ' + tv + ': ' + pct(op) + ' (fair ' + am(fairAmerican(op)) + '), under ' + pct(op == null ? null : 1 - op) + (y.at > 0.0005 ? ', push ' + pct(y.at) : ''));
      }
      out.textContent = '';
      parts.forEach(function (t) { out.appendChild(el('div', '', t)); });
    }
    spIn.addEventListener('input', calc); ttIn.addEventListener('input', calc);
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    calc();
    box.appendChild(alt);

    box.appendChild(el('p', 'tb-note', ((b.basis && b.basis.note) ? b.basis.note + ' ' : '')
      + 'Priced from ' + (b.simulations ? Number(b.simulations).toLocaleString() : 'the') + ' simulated games. ' + (b.disclaimer || '')));
    return box;
  }

  /* ---------- player props: book main line vs the simulated distribution ---------- */

  var PROP_KEYS = {
    nba: { 'points': 'points', 'rebounds': 'rebounds', 'assists': 'assists', 'threes': 'threes',
      'points + rebounds': 'points_rebounds', 'points + assists': 'points_assists', 'rebounds + assists': 'rebounds_assists',
      'points + rebounds + assists': 'points_rebounds_assists' },
    nhl: { 'points': 'points', 'assists': 'assists', 'shots on goal': 'shots', 'goals': 'goals' },
  };
  var BOARD_KEYS = { nba: 'basketball_nba', nhl: 'icehockey_nhl' };
  var propBoards = {};
  function propBoard(sport) {
    if (!propBoards[sport]) {
      var host = (global.TMRSim && global.TMRSim.API_HOST) || 'https://api.trustmyrecord.com';
      propBoards[sport] = fetch(host + '/api/games/props/' + BOARD_KEYS[sport], { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : { games: [] }; })
        .catch(function () { delete propBoards[sport]; return { games: [] }; });
    }
    return propBoards[sport];
  }
  function nameKey(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');
  }
  function implied(a) { a = Number(a); if (!isFinite(a) || a === 0) return null; return a > 0 ? 100 / (a + 100) : -a / (-a + 100); }
  // P(stat > line) and P(stat == line) from the exact simulated counts.
  function overOf(dist, ln) {
    if (!dist || !dist.counts || !dist.runs) return null;
    var above = 0; var at = 0;
    for (var i = 0; i < dist.counts.length; i += 1) {
      var v = (dist.from || 0) + i;
      if (Math.abs(v - ln) < 0.05) at += dist.counts[i]; else if (v > ln) above += dist.counts[i];
    }
    var dec = dist.runs - at;
    return dec > 0 ? { over: above / dec, push: at / dist.runs, n: dist.runs } : null;
  }
  /** Rows: every book prop that has a main line (Over and Under at one line) and a simulated player. */
  function propRows(sport, d, board) {
    var keys = PROP_KEYS[sport]; var m = d.matchup || {};
    var pd = d.result && d.result.player_distributions;
    if (!keys || !pd || !board) return [];
    var hn = nameKey(m.home && m.home.name); var an = nameKey(m.away && m.away.name);
    var g = (board.games || []).filter(function (x) { return nameKey(x.home_team) === hn && nameKey(x.away_team) === an; })[0];
    if (!g) return [];
    var players = {};
    ['home', 'away'].forEach(function (side) {
      (pd[side] || []).forEach(function (p) { players[nameKey(p.name)] = { p: p, side: side }; });
    });
    var rows = [];
    (g.prop_groups || []).forEach(function (gr) {
      (gr.markets || []).forEach(function (mk) {
        var stat = keys[String(mk._stat || '').toLowerCase()];
        var who = players[nameKey(mk._player)];
        if (!stat || !who || !who.p.stats || !who.p.stats[stat]) return;
        var byLine = {};
        (mk.outcomes || []).forEach(function (o) {
          var k = String(o.line); byLine[k] = byLine[k] || {}; byLine[k][String(o.selection).toLowerCase()] = o.odds;
        });
        var main = Object.keys(byLine).filter(function (k) { return byLine[k].over != null && byLine[k].under != null; })[0];
        if (main == null) return;
        var ln = Number(main); var o = byLine[main];
        var po = implied(o.over); var pu = implied(o.under);
        var sim = overOf(who.p.stats[stat].dist, ln);
        if (!po || !pu || !sim) return;
        var nv = po / (po + pu);
        rows.push({ player: who.p.name, side: who.side, prop: mk._stat, line: ln, over_price: o.over, under_price: o.under,
          book_over: nv, sim_over: sim.over, push: sim.push, fair_over: fairAmerican(sim.over), diff: (sim.over - nv) * 100, n: sim.n });
      });
    });
    return rows.sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });
  }
  function propsSection(rows, d, source) {
    var m = d.matchup || {};
    var wrap = el('div', 'tb-alt tb-props');
    var h = el('h4', '', 'Player props');
    wrap.appendChild(h);
    var shown = 10;
    var tableHost = el('div');
    function draw() {
      tableHost.textContent = '';
      tableHost.appendChild(table(['Player', 'Prop', 'Book over', 'No-vig', 'Sim over', 'Fair', 'Sim − book'],
        rows.slice(0, shown).map(function (r) {
          var abbr = r.side === 'home' ? (m.home && m.home.abbr) : (m.away && m.away.abbr);
          return [r.player + (abbr ? ' (' + abbr + ')' : ''), r.prop + ' ' + r.line, am(r.over_price), pct(r.book_over), pct(r.sim_over), am(r.fair_over), diff(r.diff)];
        })));
    }
    draw();
    wrap.appendChild(el('div', 'tb-scroll')).appendChild(tableHost);
    if (rows.length > shown) {
      var more = el('button', 'tb-more', 'Show all ' + rows.length + ' props');
      more.type = 'button';
      more.addEventListener('click', function () { shown = rows.length; draw(); more.remove(); });
      wrap.appendChild(more);
    }
    wrap.appendChild(el('p', 'tb-note', 'Book main lines' + (source ? ' from ' + String(source).split('+').map(function (s) { return ({ fanduel: 'FanDuel', espn: 'ESPN', draftkings: 'DraftKings', bovada: 'Bovada' })[s] || s; }).join(' and ') : '') + ', vig removed. Sim over is the share of '
      + (rows[0] && rows[0].n ? rows[0].n : '') + ' simulated games the player played in, pushes left out. Prop probabilities are the simulator’s own (not anchored to the book).'));
    return wrap;
  }
  // PROPS HELD BACK (11/21): on the 11/21 slate the simulated player lines sat
  // 10 to 20 points under the book on 85 to 90 percent of props, a calibration
  // gap, not a finding. The section only renders in preview (?props_preview=1)
  // until the prop ledger shows the distributions are calibrated.
  function propsEnabled() {
    try { return global.TMR_SIM_PROPS === true || /[?&]props_preview=1/.test(global.location.search); } catch (e) { return false; }
  }
  function addProps(panel, app, d) {
    var sport = app && app.sport;
    if (!BOARD_KEYS[sport] || !propsEnabled()) return;
    propBoard(sport).then(function (board) {
      if (!panel.isConnected && panel.parentNode == null) return;
      var rows = propRows(sport, d, board);
      if (!rows.length) return;
      var note = panel.querySelector('.tb-note:last-child');
      panel.insertBefore(propsSection(rows, d, board && board.source), note || null);
    });
  }

  /* ---------- tonight's board: every game's read, from /slate-bets ---------- */

  // Today's games show the time; a game on another day leads with the weekday.
  function startText(iso) {
    var d = new Date(iso); var now = new Date();
    var t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return d.toDateString() === now.toDateString() ? t : d.toLocaleDateString([], { weekday: 'short' }) + ' ' + t;
  }
  function boardTable(sport, data) {
    var box = el('section', 'tmr-bet tb-board');
    box.setAttribute('aria-label', 'Tonight’s board: simulation against the sportsbook');
    var top = el('div', 'tb-top');
    var left = el('div');
    left.appendChild(el('h3', '', 'Tonight’s board'));
    left.appendChild(el('div', 'tb-src', 'Every game with a sportsbook line, ' + (data.simulations || 10000).toLocaleString() + ' simulations each. Sim and fair prices against the book’s no-vig line.'));
    top.appendChild(left);
    box.appendChild(top);
    var rows = (data.games || []).map(function (g) {
      var b = g.betting || {}; var ml = b.moneyline || {}; var sp = b.spread || {}; var t = b.total || {};
      var H = (g.home && (g.home.abbr || g.home.key)) || ''; var A = (g.away && (g.away.abbr || g.away.key)) || '';
      var when = startText(g.commence_time);
      if (g.locked) {
        return [A + ' @ ' + H, when, am(ml.book_home_price), sp.home_line != null ? H + ' ' + line(sp.home_line) : '–', t.line != null ? String(t.line) : '–', 'TMR Pro', '', ''];
      }
      return [A + ' @ ' + H, when, am(ml.book_home_price),
        sp.home_line != null ? H + ' ' + line(sp.home_line) : '–',
        t.line != null ? String(t.line) : '–',
        H + ' ' + pct(ml.sim_home_win_prob) + ' (' + am(ml.fair_home_price) + ')',
        sp.home_cover_ex_push != null ? pct(sp.home_cover_ex_push) + (sp.book_novig_home_prob != null ? ' · book ' + pct(sp.book_novig_home_prob) : '') : '–',
        t.over_ex_push != null ? pct(t.over_ex_push) + (t.book_novig_over_prob != null ? ' · book ' + pct(t.book_novig_over_prob) : '') + (t.basis === 'model' ? '*' : '') : '–'];
    });
    var scroll = el('div', 'tb-scroll');
    var tbl = table(['Game', 'Start', 'Home ML', 'Spread', 'Total', 'Sim win (fair)', 'Home covers', 'Over'], rows);
    tbl.className = 'tb-boardtbl';
    // Each game opens the simulator with that matchup selected.
    Array.prototype.forEach.call(tbl.querySelectorAll ? tbl.querySelectorAll('tbody tr') : [], function (tr, i) {
      var g = data.games[i]; if (!g) return;
      var a = el('a', '', tr.firstChild.textContent);
      a.href = '?away=' + encodeURIComponent((g.away.abbr || g.away.key || '').toLowerCase()) + '&home=' + encodeURIComponent((g.home.abbr || g.home.key || '').toLowerCase());
      tr.firstChild.textContent = ''; tr.firstChild.appendChild(a);
      if (g.locked) {
        var lk = el('a', 'tb-lock', 'Unlock with TMR Pro'); lk.href = '/premium/?entry=sim_board';
        var cell = tr.children[5]; cell.textContent = ''; cell.className = 'tb-lockcell'; cell.appendChild(lk);
        cell.setAttribute('colspan', '3'); if (tr.children[7]) tr.removeChild(tr.children[7]); if (tr.children[6]) tr.removeChild(tr.children[6]);
      }
    });
    scroll.appendChild(tbl);
    box.appendChild(scroll);
    // Phones: one card per game, every number on screen (the table needs 720px).
    var cards = el('div', 'tb-cards');
    (data.games || []).forEach(function (g) {
      var b = g.betting || {}; var ml = b.moneyline || {}; var sp = b.spread || {}; var t = b.total || {};
      var H = (g.home && (g.home.abbr || g.home.key)) || ''; var A = (g.away && (g.away.abbr || g.away.key)) || '';
      var c = el('div', 'tb-card tb-gcard');
      var hd = el('div', 'tb-ghead');
      var a = el('a', '', A + ' @ ' + H);
      a.href = '?away=' + encodeURIComponent(A.toLowerCase()) + '&home=' + encodeURIComponent(H.toLowerCase());
      hd.appendChild(a);
      hd.appendChild(el('span', '', startText(g.commence_time)));
      c.appendChild(hd);
      function row(label, bookTxt, simTxt) {
        var r = el('div', 'tb-grow');
        r.appendChild(el('span', 'tb-glabel', label));
        r.appendChild(el('span', 'tb-gbook', bookTxt));
        if (simTxt != null) r.appendChild(el('span', 'tb-gsim', simTxt));
        c.appendChild(r);
      }
      if (g.locked) {
        row('Moneyline', H + ' ' + am(ml.book_home_price));
        row('Spread', sp.home_line != null ? H + ' ' + line(sp.home_line) : '–');
        row('Total', t.line != null ? String(t.line) : '–');
        var lk = el('a', 'tb-lock', 'Unlock the sim read with TMR Pro'); lk.href = '/premium/?entry=sim_board';
        var lr = el('div', 'tb-grow tb-glock'); lr.appendChild(lk); c.appendChild(lr);
      } else {
        row('Moneyline', H + ' ' + am(ml.book_home_price) + (ml.book_novig_home_prob != null ? ' · ' + pct(ml.book_novig_home_prob) : ''),
          'Sim ' + pct(ml.sim_home_win_prob) + ' (' + am(ml.fair_home_price) + ')');
        if (sp.home_line != null) row('Spread', H + ' ' + line(sp.home_line) + (sp.book_novig_home_prob != null ? ' · ' + pct(sp.book_novig_home_prob) : ''),
          'Sim ' + pct(sp.home_cover_ex_push));
        if (t.line != null) row('Over ' + t.line, t.book_novig_over_prob != null ? pct(t.book_novig_over_prob) : '–',
          'Sim ' + pct(t.over_ex_push) + (t.basis === 'model' ? '*' : ''));
      }
      cards.appendChild(c);
    });
    box.appendChild(cards);
    var notes = 'Book is the sportsbook’s own chance with the vig removed.';
    if ((data.games || []).some(function (g) { return g.betting && g.betting.total && g.betting.total.basis === 'model'; })) notes += ' * Total is the simulator’s own (not anchored to the book).';
    if (!data.pro && data.free_games) notes += ' The first ' + data.free_games + ' games are open to everyone; TMR Pro opens the full board.';
    box.appendChild(el('p', 'tb-note', notes));
    return box;
  }
  var boardDone = {};
  function mountBoard(app) {
    var sport = app && app.sport;
    if (!BOARD_KEYS[sport] || boardDone[sport]) return;
    var pane = app.nodes && (app.nodes.schedulePane || app.nodes.result);
    if (!pane) return;
    boardDone[sport] = true;
    var host = (global.TMRSim && global.TMRSim.API_HOST) || 'https://api.trustmyrecord.com';
    var headers = { Accept: 'application/json' };
    try { if (global.api && global.api.token) headers.Authorization = 'Bearer ' + global.api.token; } catch (e) { /* anonymous */ }
    fetch(host + '/api/' + sport + '/public/slate-bets', { headers: headers })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.games || !data.games.length) return;
        injectCss();
        var board = boardTable(sport, data);
        pane.insertBefore(board, pane.firstChild);
      })
      .catch(function () { boardDone[sport] = false; });
  }

  function mount(app, d) {
    var host = app && app.nodes && app.nodes.result;
    if (!host) return;
    var old = host.querySelector('.tmr-bet'); if (old) old.remove();
    var panel = build(d);
    if (!panel) return;
    // Right under the score and win chance, the first things a bettor reads.
    // Broadcast view: under the win chance bar (.bc-odds); classic view: under the scoreboard.
    var anchor = null;
    ['.bc-odds', '.sb', '.scoreboard', '.kpis', '.panel'].some(function (sel) { anchor = host.querySelector(sel); return anchor && anchor.parentNode === host; });
    var after = anchor && anchor.parentNode === host ? anchor.nextSibling : host.firstChild;
    host.insertBefore(panel, after);
    addProps(panel, app, d);
  }

  function hook() {
    var S = global.TMRSim;
    if (!S || !S.SimApp || !S.SimApp.prototype.render || S.SimApp.prototype.__tmrBet) return !!(S && S.SimApp && S.SimApp.prototype.__tmrBet);
    var render = S.SimApp.prototype.render;
    S.SimApp.prototype.render = function (d) {
      var r = render.apply(this, arguments);
      try { mount(this, d); } catch (e) { /* the page works without the panel */ }
      return r;
    };
    S.SimApp.prototype.__tmrBet = true;
    // Tonight's board goes up once the page's app exists.
    var tries = 0;
    (function waitApp() {
      var app = global.TMRNbaSim || global.TMRNhlSim;
      if (app) { try { mountBoard(app); } catch (e) { /* the page works without it */ } return; }
      if ((tries += 1) < 40) global.setTimeout(waitApp, 250);
    }());
    return true;
  }
  global.TMRSimBettor = { build: build, mount: mount, split: split, fairAmerican: fairAmerican, propRows: propRows, propsSection: propsSection, overOf: overOf, boardTable: boardTable };
  if (!hook()) document.addEventListener('DOMContentLoaded', hook);
}());
