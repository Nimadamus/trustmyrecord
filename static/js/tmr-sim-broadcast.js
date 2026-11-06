/*
 * BROADCAST_PRESENTATION_20261105. Presentation only, for every simulator page.
 * Loaded by the SIM_BC block (scripts/sim-ux.js), which sets on <html>:
 *   simbc + simbc-game | simbc-hub | simbc-shell | simbc-run, and data-bc=<sport>.
 *
 * The tool is the page. Nothing here is deleted: long copy moves into one closed
 * About accordion at the foot, secondary tools into one quiet More control.
 * It never changes what is simulated or how a run is paid for: the real run
 * control is moved, not replaced, so the gate and the meter still see it, and
 * every number shown is read from the result the page already has.
 *
 * One behaviour change: tapping a slate card selects the game instead of running
 * it, so a visitor sees the matchup and does not spend a free run on a tap.
 */
(function (global) {
  'use strict';
  var document = global.document;
  var root = document.documentElement;
  if (!root.classList.contains('simbc')) return;

  var SPORT = root.getAttribute('data-bc');
  var calm = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LEAGUE = { nhl: 'NHL', nba: 'NBA', nfl: 'NFL', mlb: 'MLB' };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function hexOf(c) { return c ? (String(c).charAt(0) === '#' ? String(c) : '#' + c) : ''; }
  /* A colour too dark to read on navy still has to mark its side. */
  function lum(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return -1;
    var v = parseInt(m[1], 16);
    return 0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
  }
  /* A vivid dark red still reads on navy; only a truly dim colour is swapped. */
  function shows(c) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(c || ''));
    if (!m) return false;
    var v = parseInt(m[1], 16);
    return lum(c) >= 60 || Math.max(v >> 16, (v >> 8) & 255, v & 255) >= 170;
  }
  function glow(c, alt) {
    if (shows(c)) return hexOf(c);
    if (shows(alt) && lum(alt) < 235) return hexOf(alt);
    return '#1f8fff';
  }
  /* Two sides must never share a colour, or a split bar reads as one bar. */
  function sides(node, a, h) {
    node.style.setProperty('--away', a);
    node.style.setProperty('--home', a === h ? '#2fe0ff' : h);
  }
  function nick(name) {
    var parts = String(name || '').split(' ');
    return parts[parts.length - 1];
  }
  function ready() { root.classList.add('bc-ready'); }
  function goTo(node) {
    if (node) node.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------- one About, one More ---------------------------------------- */

  function fold(cls, label) {
    var d = el('details', 'bc-fold ' + cls);
    d.appendChild(el('summary', '', label));
    var body = el('div', 'bc-fold-body');
    d.appendChild(body);
    return { d: d, body: body };
  }

  var SKIP = 'script,style,link,noscript,template';

  /*
   * keep: stays on the page. more: goes behind the quiet control. The rest of
   * main, and the copy sections after it, goes into About. `loose` are nodes
   * deeper in the page that belong in About too (hero paragraphs).
   */
  function shelve(o) {
    var main = $('main');
    if (!main) return;
    var about = fold('bc-about', o.aboutLabel || 'About this simulator');
    var more = o.more ? fold('bc-morefold', o.moreLabel || 'More') : null;
    $$(o.loose || '.hero p', main).forEach(function (n) { about.body.appendChild(n); });
    var list = Array.prototype.slice.call(main.children);
    for (var n = main.nextElementSibling; n; n = n.nextElementSibling) {
      if (n.matches('section,.sa-root,.methodwrap')) list.push(n);
    }
    list.forEach(function (n) {
      if (n.matches(SKIP) || n.matches(o.keep)) return;
      if (more && n.matches(o.more)) more.body.appendChild(n);
      else about.body.appendChild(n);
    });
    var at = main.nextSibling;
    if (more && more.body.children.length) main.parentNode.insertBefore(more.d, at);
    if (about.body.children.length) main.parentNode.insertBefore(about.d, at);
    openForHash();
    global.addEventListener('hashchange', openForHash);
  }

  /* A link into folded content still lands: open whatever holds the target. */
  function openForHash() {
    var id = global.location.hash.slice(1);
    var t = id && document.getElementById(id);
    if (!t) return;
    var hit = false;
    for (var p = t.parentNode; p && p.nodeType === 1; p = p.parentNode) {
      if (p.tagName === 'DETAILS' && !p.open) { p.open = true; hit = true; }
    }
    if (hit) t.scrollIntoView();
  }

  /* The post run Pro offer lands right under the result. It belongs after the
     folds, as one line; its full copy stays in the node. */
  function proBelowFolds() {
    var main = $('main');
    if (!main) return;
    function move() {
      var line = $('#tpfSimLine', main);
      var last = $$('body > .bc-fold').pop();
      if (!line || !last) return;
      line.classList.add('bc-proline');
      last.parentNode.insertBefore(line, last.nextSibling);
    }
    new global.MutationObserver(move).observe(main, { childList: true });
  }

  /* Season and playoff pages: a table needs its heading, not its essay. Any long
     paragraph moves into About, in page order, ids intact so live notes still update.
     A stamp keeps its first sentence on the page. */
  function words(n) { return (n.textContent.trim().match(/\S+/g) || []).length; }
  function quietPanels() {
    var main = $('main');
    var body = $('.bc-about .bc-fold-body');
    if (!main || !body) return;
    var notes = el('div', 'bc-notes');
    $$('p', main).forEach(function (p) {
      if (words(p) < 20 || p.id === 'lsimStamp' || p.closest('table,form,dialog')) return;
      if (p.classList.contains('pb-status')) return;
      if (/^Standings after /.test(p.textContent.trim())) {
        var lead = /^.*?\.(?=\s|$)/.exec(p.textContent.trim());
        if (lead) p.parentNode.insertBefore(el('p', 'bc-stamp', lead[0]), p);
      }
      notes.appendChild(p);
    });
    if (notes.children.length) body.insertBefore(notes, body.firstChild);
  }

  /* One archived run: the board and team stats show, the rest folds. */
  function bootRun() {
    var host = $('[data-sa="run"]');
    if (!host) return;
    function dress() {
      var head = $('.sa-head', host);
      if (!head || head.getAttribute('data-bc')) return;
      head.setAttribute('data-bc', '1');
      var named = function (re) {
        return $$('.sa-panel', host).filter(function (s) { return re.test(($('h2', s) || {}).textContent || ''); });
      };
      var detail = fold('bc-rundetail', 'Box score and scoring');
      named(/^(Box score|Starting lineups|Scoring summary)$/).forEach(function (s) { detail.body.appendChild(s); });
      var about = fold('bc-about bc-runabout', 'About this simulation');
      $$('.sa-sub', head).forEach(function (n) { about.body.appendChild(n); });
      named(/^How this simulation was produced$/).forEach(function (s) { about.body.appendChild(s); });
      var left = $$(':scope > .sa-panel', host);
      var at = left.length ? left[left.length - 1].nextSibling : null;
      if (detail.body.children.length) host.insertBefore(detail.d, at);
      if (about.body.children.length) host.appendChild(about.d);
    }
    new global.MutationObserver(dress).observe(host, { childList: true });
    dress();
  }

  /* ---------- matchup stage ---------------------------------------------- */

  function makeStage(o) {
    var stage = el('section', 'bc-stage');
    stage.setAttribute('aria-label', 'Selected matchup');
    var kick = el('div', 'bc-kick');
    stage.appendChild(kick);
    var face = el('div', 'bc-face');
    var sides = {};
    ['away', 'home'].forEach(function (side, i) {
      var b = el('button', 'bc-side ' + side);
      b.type = 'button';
      var crest = el('span', 'bc-crest');
      var name = el('span', 'bc-name');
      var rec = el('span', 'bc-rec');
      b.appendChild(crest); b.appendChild(name); b.appendChild(rec);
      b.addEventListener('click', function () { picker.open(side); });
      sides[side] = { b: b, crest: crest, name: name, rec: rec };
      face.appendChild(b);
      if (i === 0) face.appendChild(el('span', 'bc-at', 'at'));
    });
    stage.appendChild(face);
    var runRow = el('div', 'bc-run');
    runRow.appendChild(o.run);
    stage.appendChild(runRow);
    var other = el('button', 'bc-other', 'Try another matchup');
    other.type = 'button';
    other.addEventListener('click', function () { picker.flow(); });
    stage.appendChild(other);

    var picker = makePicker(o);

    return {
      node: stage,
      picker: picker,
      kicker: function (t) { kick.textContent = t || ''; },
      set: function (side, t) {
        var s = sides[side];
        var key = t ? t.key : 'none';
        s.b.setAttribute('aria-label', (t ? t.name + ', ' : '') + 'change ' + side + ' team');
        if (s.b.getAttribute('data-key') === key) { s.rec.textContent = (t && t.rec) || ''; return; }
        s.b.setAttribute('data-key', key);
        s.crest.innerHTML = '';
        if (t) {
          s.crest.appendChild(t.crest());
          s.name.textContent = t.short || nick(t.name);
          s.rec.textContent = t.rec || '';
          stage.style.setProperty('--' + side, t.color || '#1f8fff');
          if (!calm) {
            s.b.classList.remove('bc-in');
            void s.b.offsetWidth;
            s.b.classList.add('bc-in');
          }
        } else {
          s.name.textContent = 'Choose team';
          s.rec.textContent = '';
          stage.style.removeProperty('--' + side);
        }
      },
      busy: function (on) { stage.classList.toggle('bc-running', !!on); },
    };
  }

  /* The logo grid. The selects stay the source of truth; this only sets them. */
  function makePicker(o) {
    var dlg = el('dialog', 'bc-pick');
    dlg.setAttribute('aria-label', 'Choose a team');
    var head = el('div', 'bc-pick-head');
    var title = el('h2', '', 'Choose team');
    var close = el('button', 'bc-pick-x', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', function () { dlg.close(); });
    head.appendChild(title); head.appendChild(close);
    var grid = el('div', 'bc-pick-grid');
    dlg.appendChild(head); dlg.appendChild(grid);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
    var side = 'away';
    /* Try another matchup is one flow: away, then straight on to home. */
    var thenHome = false;
    dlg.addEventListener('cancel', function () { thenHome = false; });
    close.addEventListener('click', function () { thenHome = false; });
    function fill(skip) {
      grid.innerHTML = '';
      o.teams().forEach(function (t) {
        if (skip && t.key === skip) return;
        var b = el('button', 'bc-pick-team');
        b.type = 'button';
        var c = el('span', 'bc-pick-crest');
        c.appendChild(t.crest(56));
        b.appendChild(c);
        b.appendChild(el('span', 'bc-pick-name', t.short || nick(t.name)));
        b.setAttribute('aria-label', t.name);
        b.addEventListener('click', function () {
          dlg.close();
          o.choose(side, t.key);
          if (thenHome && side === 'away') {
            thenHome = false;
            show('home', t.key);
          }
        });
        grid.appendChild(b);
      });
    }
    function show(s, skip) {
      side = s;
      title.textContent = 'Choose ' + s + ' team';
      fill(skip);
      if (dlg.showModal) dlg.showModal();
    }
    return {
      open: function (s) { thenHome = false; show(s); },
      flow: function () { thenHome = true; show('away'); },
    };
  }

  /* ---------- shared result pieces --------------------------------------- */

  function countUp(node, to) {
    if (calm || !isFinite(to) || to <= 0) { node.textContent = String(to); return; }
    var t0 = null;
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min((t - t0) / 600, 1);
      node.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) global.requestAnimationFrame(step);
    }
    node.textContent = '0';
    global.requestAnimationFrame(step);
  }

  /* Two chances side by side round as a pair (largest remainder), so they add up
     to the rounded total: 80.5 and 19.5 must not print as 81% and 20%. */
  function pctPair(a, h) {
    var total = Math.round((a + h) * 100);
    var fa = a * 100, fh = h * 100;
    var ra = Math.floor(fa), rh = Math.floor(fh);
    var left = total - ra - rh;
    while (left > 0) {
      if (fa - ra >= fh - rh) { ra += 1; fa = ra; } else { rh += 1; fh = rh; }
      left -= 1;
    }
    return [ra + '%', rh + '%'];
  }
  function r1(v) { return Math.round(v * 10) / 10; }

  /* rows: [label, awayValue, homeValue, unit] */
  function compareBox(rows) {
    rows = rows.filter(function (r) { return typeof r[1] === 'number' && typeof r[2] === 'number'; });
    if (!rows.length) return null;
    var box = el('div', 'bc-compare');
    rows.forEach(function (r) {
      var av = r[1], hv = r[2], unit = r[3] || '';
      var total = (av + hv) || 1;
      var line = el('div', 'bc-cmp');
      line.appendChild(el('div', 'v', r1(av) + unit));
      var mid = el('div', 'mid');
      mid.appendChild(el('div', 'lb', r[0]));
      var bar = el('div', 'bar');
      var ab = el('span', 'a'); ab.style.width = (av / total * 100).toFixed(1) + '%';
      var hb = el('span', 'h'); hb.style.width = (hv / total * 100).toFixed(1) + '%';
      bar.appendChild(ab); bar.appendChild(hb);
      mid.appendChild(bar);
      line.appendChild(mid);
      line.appendChild(el('div', 'v', r1(hv) + unit));
      box.appendChild(line);
    });
    return box;
  }

  /* The share of simulated games each side won. Keeps the one game on the board
     from reading as the forecast. */
  function oddsBand(aName, hName, aw, hw, n, score) {
    var box = el('div', 'bc-odds');
    var row = el('div', 'bc-odds-row');
    var pair = pctPair(aw, hw);
    row.appendChild(el('div', 'pc', pair[0]));
    var bar = el('div', 'bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', aName + ' ' + pair[0] + ', ' + hName + ' ' + pair[1]);
    var ab = el('span', 'a'); ab.style.width = (aw * 100).toFixed(1) + '%';
    var hb = el('span', 'h'); hb.style.width = (hw * 100).toFixed(1) + '%';
    bar.appendChild(ab); bar.appendChild(hb);
    row.appendChild(bar);
    row.appendChild(el('div', 'pc', pair[1]));
    box.appendChild(row);
    var cap = 'Win chance, ' + Number(n).toLocaleString() + ' games';
    if (score) cap += ' · projected ' + score;
    box.appendChild(el('div', 'bc-cap', cap));
    return box;
  }

  /* cards: [value, label]; lines: [when, team, what] */
  function highlights(cards, lines) {
    var box = el('div', 'bc-high');
    var any = false;
    if (cards.length) {
      var g = el('div', 'bc-cards');
      cards.forEach(function (c) {
        var k = el('div', 'bc-card');
        k.appendChild(el('div', 'n', c[0]));
        k.appendChild(el('div', 'l', c[1]));
        g.appendChild(k);
      });
      box.appendChild(g);
      any = true;
    }
    if (lines.length) {
      var ul = el('ul', 'bc-moments');
      lines.forEach(function (m) {
        var li = el('li');
        li.appendChild(el('span', 'w', m[0]));
        li.appendChild(el('b', '', m[1]));
        li.appendChild(el('span', 'd', m[2]));
        ul.appendChild(li);
      });
      box.appendChild(ul);
      any = true;
    }
    return any ? box : null;
  }

  function afterBar(again, stage) {
    var bar = el('div', 'bc-after');
    var a = el('button', 'bc-again', 'Run again');
    a.type = 'button';
    a.addEventListener('click', again);
    var t = el('button', 'bc-try', 'Try another matchup');
    t.type = 'button';
    t.addEventListener('click', function () { goTo(stage.node); stage.picker.flow(); });
    bar.appendChild(a); bar.appendChild(t);
    return bar;
  }

  /* ---------- NBA and NHL ------------------------------------------------ */

  function bootLeagueApp() {
    var S = global.TMRSim;
    var app = global.TMRNhlSim || global.TMRNbaSim;
    if (!S || !app) return;
    var setup = $('#setup');
    var runBtn = $('#runBtn');
    var box = $('#result');

    /* The result opens on the scoreboard; a visitor's own choice still wins. */
    try {
      if (global.localStorage && !global.localStorage.getItem('tmr-sim-view')) {
        global.localStorage.setItem('tmr-sim-view', 'box');
      }
    } catch (e) { /* private window: the page default applies */ }

    function view(t) {
      if (!t) return null;
      var r = t.record;
      return {
        key: t.ref,
        name: t.name,
        short: t.common || nick(t.name),
        rec: r && r.wins !== undefined ? r.wins + '-' + r.losses + (r.otLosses !== undefined ? '-' + r.otLosses : '') : '',
        color: glow(t.color, t.altColor),
        crest: function (size) { return S.crest(t, size || 168); },
      };
    }

    var stage = makeStage({
      run: runBtn,
      teams: function () { return (app.teams || []).map(view); },
      choose: function (side, ref) {
        var other = side === 'away' ? 'home' : 'away';
        var was = app.state[side];
        if (app.state[other] === ref && was) {
          app.nodes[other].value = was;
          app.nodes[other].dispatchEvent(new global.Event('change', { bubbles: true }));
        }
        app.nodes[side].value = ref;
        app.nodes[side].dispatchEvent(new global.Event('change', { bubbles: true }));
        $$('#games .game').forEach(function (x) { x.classList.remove('sel'); });
        stage.kicker('Custom matchup');
      },
    });
    setup.insertBefore(stage.node, setup.firstChild);

    var set = fold('bc-set', 'Game settings');
    ['#modebar', '.slatebar', '#customPane', '#extraControls', '.setgrid'].forEach(function (s) {
      var n = $(s, setup);
      if (n) set.body.appendChild(n);
    });
    var pre = $('.prerun', setup);
    if (pre) set.body.appendChild(pre);
    setup.appendChild(set.d);

    function paint() {
      var t = app.currentTeams();
      stage.set('away', view(t.away));
      stage.set('home', view(t.home));
    }
    var renderPrerun = app.renderPrerun;
    app.renderPrerun = function () {
      renderPrerun.apply(app, arguments);
      paint();
    };
    paint();

    /* The slate selects, the Simulate button runs. */
    var host = $('#games');
    var games = [];
    var renderSchedule = app.renderSchedule;
    app.renderSchedule = function (d) {
      games = (d && d.games) || [];
      renderSchedule.apply(app, arguments);
      autoPick();
    };
    function select(card) {
      var cards = $$('.game', host);
      var g = games[cards.indexOf(card)];
      if (!g) return false;
      cards.forEach(function (x) { x.classList.remove('sel'); });
      card.classList.add('sel');
      app.nodes.away.value = g.away.ref;
      app.nodes.home.value = g.home.ref;
      app.state.away = g.away.ref;
      app.state.home = g.home.ref;
      app.state.venue = g.neutralSite ? 'neutral' : 'home';
      $$('button', app.nodes.venueSeg).forEach(function (x) {
        x.classList.toggle('on', x.getAttribute('data-venue') === app.state.venue);
      });
      app.clearScenario();
      if (app.cfg.onMatchupChanged) app.cfg.onMatchupChanged(app);
      app.renderPrerun();
      stage.kicker('Next game');
      return true;
    }
    function take(e, card) {
      if (!select(card)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var b = stage.node.getBoundingClientRect();
      if (b.top < 60 || b.bottom > global.innerHeight) {
        stage.node.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
      }
    }
    function onCard(e) {
      var card = e.target && e.target.closest ? e.target.closest('#games .game') : null;
      if (card) take(e, card);
    }
    global.addEventListener('click', onCard, true);
    global.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') onCard(e);
    }, true);
    /* Open on the next game rather than two empty slots. Selects; never runs. */
    function autoPick() {
      if (app.state.away || app.state.home) return;
      var cards = $$('.game', host);
      for (var i = 0; i < cards.length; i += 1) {
        if (games[i] && games[i].state !== 'post') { select(cards[i]); return; }
      }
    }
    stage.kicker('Next game');

    function dress() {
      var sb = $('.sb', box);
      var d = app.lastResult;
      if (!sb || sb.getAttribute('data-bc') || !d || !d.matchup) return;
      stage.busy(false);
      sb.setAttribute('data-bc', '1');
      var a = d.matchup.away, h = d.matchup.home;
      sides(box, glow(a.color, a.altColor), glow(h.color, h.altColor));
      $$('.sb-team', sb).forEach(function (cell, i) {
        var t = i === 0 ? a : h;
        var old = $('.crest, .crest-fallback', cell);
        if (old) old.parentNode.replaceChild(S.crest(t, 104), old);
        var score = $('.sb-score', cell);
        if (score) countUp(score, parseInt(score.textContent, 10));
        var nm = $('.sb-name', cell);
        if (nm) nm.textContent = t.common || nick(t.name);
      });
      var n = (d.meta && d.meta.simulations) || 0;
      var sub = $('.sb-sub', sb);
      if (sub) sub.textContent = n > 1 ? 'One game of ' + n.toLocaleString() : 'One simulated game';

      var after = sb.nextSibling;
      var p = d.projection || {};
      if (n > 1 && p.win_probability && p.sample_supports_projection !== false) {
        var ps = p.projected_score ? r1(p.projected_score.away) + ' to ' + r1(p.projected_score.home) : '';
        box.insertBefore(oddsBand(a.name, h.name, p.win_probability.away, p.win_probability.home, n, ps), after);
      }
      var ta = (d.result.box_score.away || {}).totals || {};
      var th = (d.result.box_score.home || {}).totals || {};
      var list = app === global.TMRNhlSim
        ? [['Shots', 'shots'], ['Hits', 'hits'], ['Blocks', 'blocks'], ['Faceoff', 'faceoffPct', '%']]
        : [['FG', 'fgPct', '%'], ['3PT', 'threePct', '%'], ['Rebounds', 'reb'], ['Assists', 'ast'], ['Turnovers', 'tov']];
      var cmp = compareBox(list.map(function (r) { return [r[0], ta[r[1]], th[r[1]], r[2]]; }));
      if (cmp) box.insertBefore(cmp, after);

      var f = d.result.game_flow;
      var cards = [];
      if (f) {
        if (f.lead_changes) cards.push([f.lead_changes, 'Lead changes']);
        if (f.times_tied) cards.push([f.times_tied, 'Ties']);
        if (f.biggest_lead) cards.push([Math.max(f.biggest_lead.home, f.biggest_lead.away), 'Biggest lead']);
      }
      var lines = (d.result.key_moments || []).slice(0, 3).map(function (m) {
        return [m.quarter || m.period || '', m.team || '', m.detail || ''];
      });
      (d.result.three_stars || []).slice(0, 3).forEach(function (s) {
        var t = s.team === 'home' ? h : a;
        lines.push(['Star ' + s.star, t.abbr, s.name + ', ' + s.line]);
      });
      var hi = highlights(cards, lines);
      if (hi) box.insertBefore(hi, after);
      /* The real Run again, so the gate and the meter see the same press. */
      box.insertBefore(afterBar(function () {
        var again = $('.actionbar button.primary', box);
        if (again) again.click();
      }, stage), after);

      /* The highlights above replace the summary tab: open on the box score. */
      var tabs = $$('.tabs button', box);
      var boxTab = tabs.filter(function (b) { return /^Box score$/.test(b.textContent.trim()); })[0];
      if (boxTab && tabs[0] && /summary/i.test(tabs[0].textContent)) {
        tabs[0].hidden = true;
        boxTab.click();
      }

      box.classList.add('bc-show');
      box.style.minHeight = '';
      goTo(box);
    }
    new global.MutationObserver(dress).observe(box, { childList: true });
    var run = app.run;
    app.run = function () {
      stage.busy(true);
      var out = run.apply(app, arguments);
      if (out && out.then) out.then(function () { stage.busy(false); }, function () { stage.busy(false); });
      return out;
    };
    ready();
  }

  /* ---------- NFL -------------------------------------------------------- */

  /* eslint no-undef: the page's own classic script declares these globals. */
  function bootNfl() {
    var pg = global;
    var featBtn = $('#featBtn');
    var setup = $('.setup');
    var box = $('#result');
    if (!featBtn || !setup || typeof pg.teamMark !== 'function') { ready(); return; }
    /* const STATE is script scoped, not a window property. */
    /* global STATE, col */
    var state = function () { return STATE; };
    var colour = function (abbr) { return glow(col(abbr)); };

    function view(abbr, name, key) {
      return {
        key: key || abbr,
        name: name,
        short: nick(name),
        rec: '',
        color: colour(abbr),
        crest: function (size) { return pg.teamMark(abbr, size || 168); },
      };
    }
    var cur = { away: null, home: null };
    function show(a, h, kicker, runner) {
      cur.away = a; cur.home = h;
      stage.set('away', a);
      stage.set('home', h);
      stage.kicker(kicker);
      featBtn.disabled = false;
      featBtn.textContent = 'Simulate';
      if (runner) featBtn.onclick = runner;
    }

    var stage = makeStage({
      run: featBtn,
      teams: function () {
        return (state().teams || []).map(function (t) { return view(t.abbr, t.name, t.ref); });
      },
      choose: function (side, ref) {
        var st = state();
        var byAbbr = function (v) {
          return v && (st.teams || []).filter(function (t) { return t.abbr === v.abbr0 || t.ref === v.key; })[0];
        };
        var teamOf = function (r) { return (st.teams || []).filter(function (t) { return t.ref === r; })[0]; };
        var picked = teamOf(ref);
        var other = byAbbr(cur[side === 'away' ? 'home' : 'away']);
        if (!picked) return;
        if (st.mode !== 'custom') {
          pg.setMode('custom');
          $('#games').style.display = '';
        }
        var a = side === 'away' ? picked : other;
        var h = side === 'home' ? picked : other;
        if (!a || !h || a.ref === h.ref) {
          var alt = (st.teams || []).filter(function (t) { return t.ref !== picked.ref; })[0];
          if (side === 'away') h = (h && h.ref !== picked.ref) ? h : alt; else a = (a && a.ref !== picked.ref) ? a : alt;
        }
        st.t1 = a.ref; st.t2 = h.ref;
        $('#t1').value = a.ref; $('#t2').value = h.ref;
        st.venue = 'team2';
        st.lastRun = null;
        pg.relabelVenue(); pg.updateChips();
        $$('#games .game').forEach(function (c) { pg.markCard(c, false); });
        var av = view(a.abbr, a.name, a.ref); av.abbr0 = a.abbr;
        var hv = view(h.abbr, h.name, h.ref); hv.abbr0 = h.abbr;
        show(av, hv, 'Custom matchup', function () { $('#runBtn').click(); });
      },
    });
    setup.insertBefore(stage.node, setup.firstChild);
    var games = $('#games');
    setup.insertBefore(games, stage.node.nextSibling);
    var set = fold('bc-set', 'Game settings');
    ['#modebar', '#weeklyControls', '#customControls', '#advSettings'].forEach(function (s) {
      var n = $(s, setup);
      if (n) set.body.appendChild(n);
    });
    setup.insertBefore(set.d, games.nextSibling);

    /* The page's own featured game fills the stage. */
    function fromFeatured() {
      var marks = $$('#featTitle .team');
      if (marks.length < 2) return;
      var read = function (m) {
        var b = $('.badge', m);
        var v = view(b ? b.textContent : '', ($('.tn', m) || {}).textContent || '');
        v.abbr0 = b ? b.textContent : '';
        return v;
      };
      if (state().selRef && cur.picked) return;
      var keep = featBtn.onclick;
      show(read(marks[0]), read(marks[1]), ($('#featWhen') || {}).textContent ? $('#featKicker').textContent + ' · ' + $('#featWhen').textContent : $('#featKicker').textContent, keep);
    }
    new global.MutationObserver(fromFeatured).observe($('#featTitle'), { childList: true });
    new global.MutationObserver(function () {
      if (featBtn.textContent !== 'Simulate' && !featBtn.disabled) { featBtn.textContent = 'Simulate'; }
    }).observe(featBtn, { childList: true });
    fromFeatured();

    /* Tap a card to select it. */
    global.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest || t.closest('.g-sim')) return;
      var card = t.closest('#games .game');
      if (!card) return;
      e.stopImmediatePropagation();
      var st = state();
      var g = (st.games || []).filter(function (x) { return x.ref === card.dataset.ref; })[0];
      if (!g) return;
      st.selRef = g.ref;
      $$('#games .game').forEach(function (c) { pg.markCard(c, c === card); });
      if (global.TMRSimGate && global.TMRSimGate.markConfigured) global.TMRSimGate.markConfigured({ control: 'game' });
      cur.picked = true;
      var a = view(g.away_abbr, g.away); a.abbr0 = g.away_abbr;
      var h = view(g.home_abbr, g.home); h.abbr0 = g.home_abbr;
      if (st.mode !== 'weekly') { pg.setMode('weekly'); }
      show(a, h, 'Selected game', function () { pg.pickGame(g); });
      stage.node.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
    }, true);

    var renderResult = pg.renderResult;
    pg.renderResult = function (out, d) {
      var r = renderResult.apply(this, arguments);
      try { dress(out, d); } catch (e) { /* a dressing failure never costs the result */ }
      stage.busy(false);
      return r;
    };
    var startProgress = pg.startProgress;
    pg.startProgress = function () {
      stage.busy(true);
      return startProgress.apply(this, arguments);
    };
    var simRunError = pg.simRunError;
    if (simRunError) {
      pg.simRunError = function () {
        stage.busy(false);
        return simRunError.apply(this, arguments);
      };
    }

    function quarterRow(rep) {
      var a = rep.away && rep.away.line, h = rep.home && rep.home.line;
      if (!Array.isArray(a) || !Array.isArray(h) || !a.length) return null;
      var sum = function (x) { return x.reduce(function (s, v) { return s + (+v || 0); }, 0); };
      if (sum(a) !== rep.away_score || sum(h) !== rep.home_score) return null;
      return { a: a, h: h };
    }

    function dress(out, d) {
      var mh = $('#simHeadline', out);
      if (!mh || !d || !d.game) return;
      var g = d.game, p = d.projection;
      var aAbbr = g.away_abbr, hAbbr = g.home_abbr;
      sides(out, colour(aAbbr), colour(hAbbr));
      out.classList.add('bc-show');

      var rep = d.box_score && !d.box_score.unavailable && d.box_score.representative;
      var after = mh.nextSibling;
      var n = (d.meta && d.meta.simulations) || 0;
      if (p && p.win_probability) {
        mh.parentNode.insertBefore(oddsBand(g.away, g.home, p.win_probability.away, p.win_probability.home, n, ''), after);
      }
      if (rep) {
        var q = quarterRow(rep);
        if (q) {
          var wrap = el('div', 'bc-line');
          wrap.appendChild(el('div', 'bc-cap', 'One game of ' + Number(n).toLocaleString()));
          var tb = el('table');
          var cols = q.a.map(function (v, i) { return i < 4 ? String(i + 1) : 'OT'; });
          var hr = el('tr');
          hr.appendChild(el('th', '', ''));
          cols.forEach(function (c) { hr.appendChild(el('th', '', c)); });
          hr.appendChild(el('th', 'tot', 'T'));
          tb.appendChild(hr);
          [[aAbbr, q.a, rep.away_score], [hAbbr, q.h, rep.home_score]].forEach(function (r) {
            var tr = el('tr');
            tr.appendChild(el('td', 'name', r[0]));
            r[1].forEach(function (v) { tr.appendChild(el('td', '', v)); });
            tr.appendChild(el('td', 'tot', r[2]));
            tb.appendChild(tr);
          });
          wrap.appendChild(tb);
          mh.parentNode.insertBefore(wrap, after);
        }
        var sa = (rep.away && rep.away.summary) || {}, sh = (rep.home && rep.home.summary) || {};
        var cmp = compareBox([
          ['Total yards', sa.total_yards, sh.total_yards],
          ['Rush yards', sa.rush_yards, sh.rush_yards],
          ['Pass yards', sa.net_pass_yards, sh.net_pass_yards],
          ['First downs', sa.first_downs, sh.first_downs],
          ['Turnovers', sa.turnovers, sh.turnovers],
        ]);
        if (cmp) mh.parentNode.insertBefore(cmp, after);
        var tds = (rep.scoring || []).filter(function (s) { return s.type === 'TD'; }).slice(0, 4).map(function (s) {
          return [s.quarter + ' ' + (s.clock || ''), s.team, s.detail];
        });
        var hi = highlights([], tds);
        if (hi) mh.parentNode.insertBefore(hi, after);
      }
      var try2 = el('button', 'btn ghost bc-try', 'Try another matchup');
      try2.type = 'button';
      try2.addEventListener('click', function () { goTo(stage.node); stage.picker.flow(); });
      var again = $('button', mh.lastElementChild);
      if (again && again.parentNode) again.parentNode.insertBefore(try2, again.nextSibling);

      /* Charts and the how-the-games-landed cards, one tap away. */
      var charts = $('.chartgrid', out);
      var kpis = $$('.kpis', out);
      if (charts) {
        var fc = fold('bc-charts', 'Charts');
        out.insertBefore(fc.d, charts);
        if (kpis[1]) fc.body.appendChild(kpis[1]);
        fc.body.appendChild(charts);
        var sharePanel = $('#nflSharePanel', out);
        if (sharePanel) fc.body.appendChild(sharePanel);
        fc.d.firstChild.textContent = 'Charts and share card';
      }
      var boxTab = $('#simTab_box', out);
      if (boxTab) boxTab.click();
      /* Phone: the score, the odds and the line, then folds. */
      if (global.matchMedia && global.matchMedia('(max-width:640px)').matches) {
        var stats = fold('bc-charts bc-nflstats', 'Team stats and scoring');
        ['.bc-compare', '.bc-high'].forEach(function (s) {
          var n = $(s, out);
          if (n) stats.body.appendChild(n);
        });
        var tabsPanel = boxTab ? boxTab.closest('.panel') : null;
        var boxFold = fold('bc-charts bc-nflbox', 'Full box score');
        if (tabsPanel) {
          tabsPanel.parentNode.insertBefore(boxFold.d, tabsPanel);
          boxFold.body.appendChild(tabsPanel);
        }
        var chartFold = $('.bc-charts:not(.bc-nflstats):not(.bc-nflbox)', out);
        if (kpis[0] && chartFold) {
          var cb = $('.bc-fold-body', chartFold);
          cb.insertBefore(kpis[0], cb.firstChild);
        }
        if (stats.body.children.length) out.insertBefore(stats.d, chartFold || boxFold.d);
      }
      goTo(box);
    }

    ready();
  }

  /* ---------- MLB -------------------------------------------------------- */

  function bootMlb() {
    var api = global.TMRMlbSimulator;
    var run = $('#runSimulationButton');
    var work = $('.sim-workspace');
    var score = $('.sim-score-panel');
    var control = $('.sim-control-panel');
    if (!api || !run || !work || !control) { ready(); return; }
    var main = $('main');
    var sel = { away: $('#awayTeamSelect'), home: $('#homeTeamSelect') };
    var pit = { away: $('#awayPitcherSelect'), home: $('#homePitcherSelect') };
    var ident = { away: $('#awayPickerIdentity'), home: $('#homePickerIdentity') };

    function logoFor(abbr) {
      var t = (api.localTeams || []).filter(function (x) { return x.abbreviation === abbr; })[0];
      return t;
    }
    function current(side) {
      var s = sel[side];
      if (!s || !s.value) return null;
      var o = s.options[s.selectedIndex];
      var src = ident[side] ? $('img', ident[side]) : null;
      var starter = pit[side] && pit[side].value ? pit[side].options[pit[side].selectedIndex].text : '';
      return {
        key: s.value,
        name: o ? o.text : '',
        rec: /preparing|select|choose/i.test(starter) ? '' : starter.split(' (')[0],
        color: '#1f8fff',
        crest: function (size) {
          var w = el('span', 'bc-mono');
          if (src) { var i = new global.Image(); i.src = src.src; i.alt = ''; w.appendChild(i); } else { w.textContent = nick(o ? o.text : '').slice(0, 3).toUpperCase(); }
          void size;
          return w;
        },
      };
    }
    var stage = makeStage({
      run: run,
      teams: function () {
        return Array.prototype.slice.call(sel.away.options).filter(function (o) { return o.value; }).map(function (o) {
          var slug = o.value.replace('current-', '');
          return {
            key: o.value,
            name: o.text,
            crest: function () {
              var w = el('span', 'bc-mono');
              var i = new global.Image();
              i.alt = ''; i.loading = 'lazy';
              i.onerror = function () { w.textContent = slug.toUpperCase(); };
              i.src = 'https://a.espncdn.com/i/teamlogos/mlb/500/' + slug + '.png';
              w.appendChild(i);
              return w;
            },
          };
        });
      },
      choose: function (side, key) {
        var s = sel[side];
        s.value = key;
        s.dispatchEvent(new global.Event('change', { bubbles: true }));
        stage.kicker('Custom matchup');
      },
    });
    void logoFor;

    /* The title stays; the pitch goes to About with the rest. */
    var hero = $('.simv2-hero', main);
    var h1 = hero ? $('h1', hero) : null;
    var title = el('header', 'bc-title');
    if (h1) title.appendChild(h1);
    main.insertBefore(title, main.firstChild);

    var tool = el('section', 'setup bc-mlb-tool');
    tool.appendChild(stage.node);
    var set = fold('bc-set', 'Game settings');
    set.body.appendChild(control);
    tool.appendChild(set.d);
    main.insertBefore(tool, title.nextSibling);

    /* Everything past the box score sits behind one control. */
    var detail = fold('bc-detail', 'Projection, bullpens and notes');
    ['#projectionShell', '#aggregatePanel', '#probabilityLab', '#modelVsMarket', '#bullpenPanel',
      '.sim-compare-panel', '.sim-notes-panel', '#simcConversionPanel'].forEach(function (s) {
      var n = $(s, work);
      if (n) detail.body.appendChild(n);
    });
    if (detail.body.children.length) work.appendChild(detail.d);

    function paint() {
      stage.set('away', current('away'));
      stage.set('home', current('home'));
    }
    ['away', 'home'].forEach(function (s) {
      if (ident[s]) new global.MutationObserver(paint).observe(ident[s], { childList: true, subtree: true });
      if (pit[s]) pit[s].addEventListener('change', paint);
    });

    /* Offseason: open on the World Series the banner already names. Selecting is
       not a visitor's configuring, so the funnel listener is kept out of it. */
    var banner = $('.mlb-season-banner');
    var phase = banner ? banner.getAttribute('data-mlb-phase') : '';
    stage.kicker(phase === 'complete' ? 'Offseason' : 'Next game');
    function preset() {
      /* The page always fills two teams. A link that names a matchup wins. */
      if (global.location.search) { paint(); return; }
      var txt = banner ? banner.textContent : '';
      var m = /the ([A-Z].+?) won the World Series\. They beat the (.+?) \d/.exec(txt);
      if (!m) return;
      var find = function (name) {
        return Array.prototype.slice.call(sel.away.options).filter(function (o) { return o.text.indexOf(name) >= 0; })[0];
      };
      var w = find(m[1]), l = find(m[2]);
      if (!w || !l) return;
      /* One at a time: each change rebuilds both selects from state. */
      var gate = global.TMRSimGate;
      var mark = gate && gate.markConfigured;
      if (mark) gate.markConfigured = function () {};
      sel.away.value = l.value;
      sel.away.dispatchEvent(new global.Event('change'));
      sel.home.value = w.value;
      sel.home.dispatchEvent(new global.Event('change'));
      if (mark) gate.markConfigured = mark;
      stage.kicker('World Series rematch');
    }
    var tries = 0;
    (function wait() {
      if (sel.away.options.length > 5) { preset(); paint(); return; }
      tries += 1;
      if (tries < 40) global.setTimeout(wait, 150);
    }());

    root.classList.add('bc-idle');
    var top = $('#topScoreboard');
    function dress() {
      if (!top || top.getAttribute('data-state') === 'empty') return;
      var sim = api.state && api.state.simulation;
      if (!sim || sim === dress.last) return;
      dress.last = sim;
      stage.busy(false);
      root.classList.remove('bc-idle');
      var old = $('.bc-mlb-odds', score);
      if (old) old.remove();
      var late = ['#simcConversionPanel', '#postseasonPanel', '#tpfSimLine'];
      late.forEach(function (s) {
        var p = $(s);
        if (p && !detail.d.contains(p)) detail.body.appendChild(p);
      });
      var n = parseInt(($('#simDepthSelect') || {}).value, 10) || 0;
      if (typeof sim.awayWin === 'number' && typeof sim.homeWin === 'number' && n) {
        var scale = sim.awayWin > 1 ? 100 : 1;
        var nameOf = function (s) { var o = sel[s].options[sel[s].selectedIndex]; return o ? o.text : s; };
        var band = oddsBand(nameOf('away'), nameOf('home'), sim.awayWin / scale, sim.homeWin / scale, n, '');
        band.classList.add('bc-mlb-odds');
        top.parentNode.insertBefore(band, top.nextSibling);
      }
      if (!$('.bc-after', score)) {
        top.parentNode.insertBefore(afterBar(function () { run.click(); }, stage), top.nextSibling);
      }
      goTo($('#resultCard'));
    }
    if (top) new global.MutationObserver(dress).observe(top, { attributes: true, childList: true, subtree: true });
    run.addEventListener('click', function () { stage.busy(true); global.setTimeout(function () { stage.busy(false); }, 20000); });
    ready();
  }

  /* ---------- boot ------------------------------------------------------- */

  var KEEP_GAME = '.simcrumb,.hero,.setup,#simStatus,#result,#featured,#boardAimNote,#games,nav,[aria-label="Breadcrumb"]';

  function boot() {
    try {
      if (root.classList.contains('simbc-game')) {
        if (SPORT === 'mlb') {
          bootMlb();
          shelve({
            keep: '.bc-title,.bc-mlb-tool,.sim-workspace,#todaysMatchups,nav,[aria-label="Breadcrumb"]',
            more: '.sa-root,.simv2-duo',
            moreLabel: 'Saved runs and history',
            loose: 'none-',
          });
        } else {
          shelve({
            keep: KEEP_GAME,
            more: '#todaysGames,#weekSims,#projectedLeaders,.sa-root',
            moreLabel: 'Schedule and simulation history',
          });
          if (SPORT === 'nfl') bootNfl(); else bootLeagueApp();
          proBelowFolds();
        }
      } else if (root.classList.contains('simbc-hub')) {
        shelve({
          keep: '.simcrumb,.simhero',
          more: '#simlive',
          moreLabel: 'Simulation activity',
          loose: '.simlead,.simsteps,.simhero .kicker',
          aboutLabel: 'About the simulators',
        });
      } else if (root.classList.contains('simbc-shell')) {
        var main = $('main');
        var copy = '.lsim-copy,.seo,.ss-section,.cl-faq,.cl-cluster,.cl-angle,.tmr-internal-cluster,p[class^="tmr-"]';
        var bare = main ? $$('section.panel', main).filter(function (s) {
          return !$('table,button,select,input,svg,.lsim-bar', s);
        }) : [];
        bare.forEach(function (s) { s.classList.add('bc-bare'); });
        shelve({
          keep: ':not(' + copy + '):not(.bc-bare)',
          loose: '.hero > p,.lsim-hero > p,.ss-hero p,.cl-hero p',
          aboutLabel: 'About this simulator',
        });
        quietPanels();
      } else if (root.classList.contains('simbc-run')) {
        bootRun();
      }
    } finally {
      ready();
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
}(window));
