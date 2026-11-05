/*
 * BROADCAST_PRESENTATION_20261105. Presentation only, for the NBA and NHL game
 * simulators. It never changes what is simulated or how a run is paid for: the
 * real #runBtn is moved, not replaced, so the auth gate and the meter still see
 * it, and every number here is read from the same result the page already has.
 *
 *   choose a game -> the matchup stage fills -> Simulate -> scoreboard
 *
 * One behaviour change: tapping a slate card now selects the game instead of
 * running it at once, so a visitor sees the matchup and does not spend a free
 * run on a tap.
 */
(function (global) {
  'use strict';
  var document = global.document;
  var S = global.TMRSim;
  if (!S || !document.body.classList.contains('simbc')) return;

  var calm = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LEAGUE = { nhl: 'NHL', nba: 'NBA' };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  /* A colour too dark to read on navy still has to mark its side. */
  function lum(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return -1;
    var v = parseInt(m[1], 16);
    return 0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
  }
  function glow(team) {
    var c = team && team.color, alt = team && team.altColor;
    if (lum(c) >= 60) return c.charAt(0) === '#' ? c : '#' + c;
    if (lum(alt) >= 60 && lum(alt) < 235) return alt.charAt(0) === '#' ? alt : '#' + alt;
    return '#1f8fff';
  }

  function record(t) {
    var r = t && t.record;
    if (!r || r.wins === undefined) return '';
    return r.wins + '-' + r.losses + (r.otLosses !== undefined ? '-' + r.otLosses : '');
  }

  function nickname(t) {
    if (t.common) return t.common;
    var parts = String(t.name || '').split(' ');
    return parts[parts.length - 1];
  }

  /* The default result view is the scoreboard; a visitor's own choice still wins. */
  try {
    if (global.localStorage && !global.localStorage.getItem('tmr-sim-view')) {
      global.localStorage.setItem('tmr-sim-view', 'box');
    }
  } catch (e) { /* private window: the page default applies */ }

  function buildStage(app) {
    var setup = document.getElementById('setup');
    var runBtn = document.getElementById('runBtn');
    if (!setup || !runBtn) return;

    var stage = el('section', 'bc-stage');
    stage.setAttribute('aria-label', 'Selected matchup');
    stage.setAttribute('aria-live', 'polite');
    var face = el('div', 'bc-face');
    var sides = {};
    ['away', 'home'].forEach(function (side, i) {
      var s = el('div', 'bc-side ' + side);
      var crest = el('div', 'bc-crest');
      var role = el('div', 'bc-role', side === 'away' ? 'Away' : 'Home');
      var name = el('div', 'bc-name');
      var rec = el('div', 'bc-rec');
      s.appendChild(crest); s.appendChild(role); s.appendChild(name); s.appendChild(rec);
      sides[side] = { box: s, crest: crest, name: name, rec: rec, role: role };
      face.appendChild(s);
      if (i === 0) {
        var mid = el('div', 'bc-at');
        mid.appendChild(el('span', 'bc-at-word', 'at'));
        face.appendChild(mid);
      }
    });
    stage.appendChild(face);
    var runRow = el('div', 'bc-run');
    runRow.appendChild(runBtn);
    stage.appendChild(runRow);

    /* Everything a casual visitor can ignore, one tap away and unchanged. */
    var more = el('details', 'bc-more');
    more.appendChild(el('summary', '', 'Game settings'));
    var extra = document.getElementById('extraControls');
    if (extra) more.appendChild(extra);
    var grid = setup.querySelector('.setgrid');
    if (grid) more.appendChild(grid);
    var pre = setup.querySelector('.prerun');
    if (pre) {
      pre.parentNode.insertBefore(stage, pre);
      pre.parentNode.insertBefore(more, pre);
    } else {
      setup.appendChild(stage);
      setup.appendChild(more);
    }

    function paint() {
      var t = app.currentTeams();
      stage.classList.toggle('ready', !!(t.away && t.home && t.away.ref !== t.home.ref));
      ['away', 'home'].forEach(function (side) {
        var team = t[side];
        var s = sides[side];
        var key = team ? team.ref : 'none';
        if (s.box.getAttribute('data-ref') === key) return;
        s.box.setAttribute('data-ref', key);
        s.crest.innerHTML = '';
        if (team) {
          s.crest.appendChild(S.crest(team, 168));
          s.name.textContent = nickname(team);
          s.rec.textContent = record(team);
          stage.style.setProperty('--' + side, glow(team));
          if (!calm) {
            s.box.classList.remove('bc-in');
            void s.box.offsetWidth;
            s.box.classList.add('bc-in');
          }
        } else {
          s.name.textContent = 'Select team';
          s.rec.textContent = '';
          stage.style.removeProperty('--' + side);
        }
      });
      var neutral = app.state.venue === 'neutral';
      sides.away.role.textContent = neutral ? 'Neutral' : 'Away';
      sides.home.role.textContent = neutral ? 'Neutral' : 'Home';
    }

    var renderPrerun = app.renderPrerun;
    app.renderPrerun = function () {
      renderPrerun.apply(app, arguments);
      paint();
    };
    paint();
  }

  /* ---------- the slate selects, the Simulate button runs ------------------ */

  function wireSlate(app) {
    var host = document.getElementById('games');
    var games = [];
    var renderSchedule = app.renderSchedule;
    app.renderSchedule = function (d) {
      games = (d && d.games) || [];
      renderSchedule.apply(app, arguments);
      autoPick();
    };

    function select(card) {
      var cards = host.querySelectorAll('.game');
      var g = games[Array.prototype.indexOf.call(cards, card)];
      if (!g) return false;
      Array.prototype.forEach.call(cards, function (x) { x.classList.remove('sel'); });
      card.classList.add('sel');
      app.nodes.away.value = g.away.ref;
      app.nodes.home.value = g.home.ref;
      app.state.away = g.away.ref;
      app.state.home = g.home.ref;
      app.state.venue = g.neutralSite ? 'neutral' : 'home';
      Array.prototype.forEach.call(app.nodes.venueSeg.querySelectorAll('button'), function (x) {
        x.classList.toggle('on', x.getAttribute('data-venue') === app.state.venue);
      });
      app.clearScenario();
      if (app.cfg.onMatchupChanged) app.cfg.onMatchupChanged(app);
      app.renderPrerun();
      return true;
    }

    function take(e, card) {
      if (!select(card)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var st = document.querySelector('.bc-stage');
      if (!st) return;
      var b = st.getBoundingClientRect();
      if (b.top < 60 || b.bottom > global.innerHeight) {
        st.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
      }
    }
    global.addEventListener('click', function (e) {
      var card = e.target && e.target.closest ? e.target.closest('#games .game') : null;
      if (card) take(e, card);
    }, true);
    global.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target && e.target.closest ? e.target.closest('#games .game') : null;
      if (card) take(e, card);
    }, true);

    /* Open on the next game rather than two empty slots. Selects; never runs. */
    function autoPick() {
      if (app.state.away || app.state.home) return;
      var cards = host.querySelectorAll('.game');
      for (var i = 0; i < cards.length; i += 1) {
        if (games[i] && games[i].state !== 'post') { select(cards[i]); return; }
      }
    }
  }

  /* ---------- result ------------------------------------------------------- */

  function countUp(node, to) {
    if (calm || !isFinite(to) || to <= 0) { node.textContent = String(to); return; }
    var t0 = null;
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min((t - t0) / 700, 1);
      node.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) global.requestAnimationFrame(step);
    }
    node.textContent = '0';
    global.requestAnimationFrame(step);
  }

  function pctText(v) { return Math.round(v * 100) + '%'; }

  /* What the two clubs did in this one game, side by side. */
  function compare(sport, d) {
    var a = (d.result.box_score.away || {}).totals || {};
    var h = (d.result.box_score.home || {}).totals || {};
    var list = sport === 'nhl'
      ? [['Shots on goal', 'shots'], ['Hits', 'hits'], ['Blocked shots', 'blocks'], ['Faceoff %', 'faceoffPct', '%'], ['Takeaways', 'takeaways']]
      : [['Field goal %', 'fgPct', '%'], ['3 point %', 'threePct', '%'], ['Rebounds', 'reb'], ['Assists', 'ast'], ['Turnovers', 'tov']];
    var rows = list.filter(function (r) { return typeof a[r[1]] === 'number' && typeof h[r[1]] === 'number'; });
    if (!rows.length) return null;
    var box = el('div', 'bc-compare');
    box.appendChild(el('div', 'bc-band', 'Team comparison'));
    rows.forEach(function (r) {
      var av = a[r[1]], hv = h[r[1]], unit = r[2] || '';
      var total = (av + hv) || 1;
      var line = el('div', 'bc-cmp');
      line.appendChild(el('div', 'v', (Math.round(av * 10) / 10) + unit));
      var mid = el('div', 'mid');
      mid.appendChild(el('div', 'lb', r[0]));
      var bar = el('div', 'bar');
      var ab = el('span', 'a'); ab.style.width = (av / total * 100).toFixed(1) + '%';
      var hb = el('span', 'h'); hb.style.width = (hv / total * 100).toFixed(1) + '%';
      bar.appendChild(ab); bar.appendChild(hb);
      mid.appendChild(bar);
      line.appendChild(mid);
      line.appendChild(el('div', 'v', (Math.round(hv * 10) / 10) + unit));
      box.appendChild(line);
    });
    return box;
  }

  /*
   * THE SCOREBOARD SHOWS ONE GAME; THE ODDS COME FROM ALL OF THEM. A batch run's
   * final is a single draw, so the band under it says so and carries the share of
   * simulated games each side won, straight from the projection.
   */
  function oddsBand(d) {
    var p = d.projection || {};
    var n = (d.meta && d.meta.simulations) || 0;
    if (n < 2 || !p.win_probability || p.sample_supports_projection === false) return null;
    var a = d.matchup.away, h = d.matchup.home;
    var aw = p.win_probability.away, hw = p.win_probability.home;
    var box = el('div', 'bc-odds');
    box.appendChild(el('div', 'bc-band', 'Across ' + n.toLocaleString() + ' simulated games'));
    var row = el('div', 'bc-odds-row');
    row.appendChild(el('div', 'pc', pctText(aw)));
    var bar = el('div', 'bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', a.name + ' ' + pctText(aw) + ', ' + h.name + ' ' + pctText(hw));
    var ab = el('span', 'a'); ab.style.width = (aw * 100).toFixed(1) + '%';
    var hb = el('span', 'h'); hb.style.width = (hw * 100).toFixed(1) + '%';
    bar.appendChild(ab); bar.appendChild(hb);
    row.appendChild(bar);
    row.appendChild(el('div', 'pc', pctText(hw)));
    box.appendChild(row);
    var names = el('div', 'bc-odds-names');
    names.appendChild(el('span', '', a.abbr + ' win probability'));
    if (p.projected_score) {
      names.appendChild(el('span', 'ps', 'Projected ' + Number(p.projected_score.away).toFixed(1) + ' to ' + Number(p.projected_score.home).toFixed(1)));
    }
    names.appendChild(el('span', '', h.abbr + ' win probability'));
    box.appendChild(names);
    return box;
  }

  function dressResult(app) {
    var box = document.getElementById('result');
    var sb = box && box.querySelector('.sb');
    var d = app.lastResult;
    if (!sb || sb.getAttribute('data-bc') || !d || !d.matchup) return;
    sb.setAttribute('data-bc', '1');
    var a = d.matchup.away, h = d.matchup.home;
    box.style.setProperty('--away', glow(a));
    box.style.setProperty('--home', glow(h));

    Array.prototype.forEach.call(sb.querySelectorAll('.sb-team'), function (cell, i) {
      var t = i === 0 ? a : h;
      var old = cell.querySelector('.crest, .crest-fallback');
      if (old) old.parentNode.replaceChild(S.crest(t, 104), old);
      var score = cell.querySelector('.sb-score');
      if (score) countUp(score, parseInt(score.textContent, 10));
      var nm = cell.querySelector('.sb-name');
      if (nm) nm.textContent = nickname(t);
    });

    var n = (d.meta && d.meta.simulations) || 0;
    var sub = sb.querySelector('.sb-sub');
    if (sub) sub.textContent = n > 1 ? 'Sample game from ' + n.toLocaleString() + ' runs' : 'One simulated game';

    var bug = el('div', 'bc-bug');
    bug.appendChild(el('span', 'lg', 'TMR ' + (LEAGUE[app.sport] || '') + ' Simulation'));
    bug.appendChild(el('span', 'vn', d.meta && d.meta.neutral_site ? 'Neutral site' : 'At ' + h.name));
    sb.insertBefore(bug, sb.firstChild);

    var after = sb.nextSibling;
    var odds = oddsBand(d);
    if (odds) box.insertBefore(odds, after);
    var cmp = compare(app.sport, d);
    if (cmp) box.insertBefore(cmp, after);

    box.classList.add('bc-show');
    box.style.minHeight = '';
  }

  function boot() {
    var app = global.TMRNhlSim || global.TMRNbaSim;
    if (!app) return;
    buildStage(app);
    wireSlate(app);
    var box = document.getElementById('result');
    new global.MutationObserver(function () { dressResult(app); }).observe(box, { childList: true });
    /* A run started from the stage lands below it: follow it down. */
    var run = app.run;
    app.run = function () {
      var out = run.apply(app, arguments);
      box.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
      return out;
    };
  }

  document.addEventListener('DOMContentLoaded', boot);
}(window));
