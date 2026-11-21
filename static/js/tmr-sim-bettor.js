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
    if (hasBook) diffs.push('Moneyline: ' + H + ' ' + diff(ml.difference_pts));
    if (b.spread && b.spread.difference_pts != null) diffs.push('Spread: ' + H + ' ' + diff(b.spread.difference_pts));
    if (b.total && b.total.difference_pts != null) diffs.push('Over: ' + diff(b.total.difference_pts));
    if (diffs.length) box.appendChild(el('p', 'tb-ind', 'Sim minus book, no-vig: ' + diffs.join(' · ')));
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
      + 'Priced from ' + (b.simulations || 'the') + ' simulated games. ' + (b.disclaimer || '')));
    return box;
  }

  function mount(app, d) {
    var host = app && app.nodes && app.nodes.result;
    if (!host) return;
    var old = host.querySelector('.tmr-bet'); if (old) old.remove();
    var panel = build(d);
    if (!panel) return;
    // Right under the score and win chance, the first things a bettor reads.
    var anchor = host.querySelector('.scoreboard, .kpis, .panel');
    var after = anchor && anchor.parentNode === host ? anchor.nextSibling : host.firstChild;
    host.insertBefore(panel, after);
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
    return true;
  }
  global.TMRSimBettor = { build: build, mount: mount, split: split, fairAmerican: fairAmerican };
  if (!hook()) document.addEventListener('DOMContentLoaded', hook);
}());
