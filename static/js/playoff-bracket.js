/**
 * PLAYOFF_BRACKET_20260929: the interactive playoff bracket picker shared by the
 * NFL, NBA and NHL playoff simulator pages. Not loaded by any MLB page.
 *
 * One module, two jobs:
 *   node     render(cfg, state) returns the bracket as HTML, so the builders bake
 *            a complete bracket into the page and it reads without JavaScript.
 *   browser  mount(el) hydrates that baked bracket: click a team to advance it,
 *            edit the seeds, fill with favorites, simulate the rest, share a link.
 *
 * Each league runs its real format:
 *   nfl  7 seeds a conference, the 1 seed byes, wild card 2v7 3v6 4v5, every later
 *        round RESEEDS, single games, the Super Bowl at a neutral site.
 *   nba  play-in for seeds 7 to 10 (7v8 for the 7 seed, 9v10 to survive, the loser
 *        of 7v8 hosts the 9v10 winner for the 8 seed), then 1v8 4v5 2v7 3v6 on a
 *        fixed bracket, best of seven, 2-2-1-1-1.
 *   nhl  top three in each division plus two wild cards a conference; the division
 *        winner with more points plays the second wild card, 2v3 inside each
 *        division, the bracket stays in the division through round two, best of
 *        seven, 2-2-1-1-1.
 *
 * cfg (baked as JSON by the page builder):
 *   league, season, confs[2], teams{abbr: {n, s, l, c, d, r}}   r = projected wins
 *   or points, used for Finals home court and NHL home ice
 *   seeds  nfl/nba: {conf: [abbr...]}   nhl: {conf: {divs: {name: [a,b,c]}, order: [first div, second], wc: [w1, w2]}}
 *   prob   nba/nhl: {k: [abbr...], p: [[home win prob]]}   nfl: {r: {abbr: rating}, hfa}
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TMRBracket = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ROUND = {
    nfl: ['Wild Card', 'Divisional', 'Conference Championship', 'Super Bowl'],
    nba: ['First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'],
    nhl: ['First Round', 'Second Round', 'Conference Final', 'Stanley Cup Final'],
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------------------------------------ probability */

  /** Chance the home side wins one game. */
  function gameP(cfg, home, away, neutral) {
    if (cfg.league === 'nfl') {
      var r = cfg.prob.r, x = (r[home] || 0) - (r[away] || 0) + (neutral ? 0 : cfg.prob.hfa);
      return 1 / (1 + Math.exp(-x));
    }
    var k = cfg.prob.k, i = k.indexOf(home), j = k.indexOf(away);
    if (i < 0 || j < 0) return 0.5;
    if (!neutral) return cfg.prob.p[i][j];
    return (cfg.prob.p[i][j] + 1 - cfg.prob.p[j][i]) / 2;
  }

  var PATTERN = [1, 1, 0, 0, 1, 0, 1]; // games at the better team's arena, 2-2-1-1-1

  /** Chance `hi` (home court or ice) wins a best of seven, exactly, game by game. */
  function seriesP(cfg, hi, lo) {
    var pH = gameP(cfg, hi, lo), pA = 1 - gameP(cfg, lo, hi);
    var memo = {};
    function f(w, l) {
      if (w === 4) return 1;
      if (l === 4) return 0;
      var key = w * 5 + l;
      if (key in memo) return memo[key];
      var p = PATTERN[w + l] ? pH : pA;
      return (memo[key] = p * f(w + 1, l) + (1 - p) * f(w, l + 1));
    }
    return f(0, 0);
  }

  /* -------------------------------------------------------------- structure */

  /**
   * Walk the bracket in play order. Every match gets both teams (or null while
   * an earlier match is unpicked), the better team first, and that team's
   * chance. A pick naming a team that is not in its match is ignored, which is
   * how changing an early pick clears everything that depended on it.
   */
  function build(cfg, state) {
    var L = cfg.league, T = cfg.teams, picks = state.picks || {}, seeds = state.seeds;
    var out = { matches: [], byId: {}, confs: {}, final: null, champion: null };

    function match(id, conf, round, label, a, b, opts) {
      opts = opts || {};
      var hi = a, lo = b;
      if (a && b && opts.order) { var o = opts.order(a, b); hi = o[0]; lo = o[1]; }
      var m = { id: id, conf: conf, round: round, label: label, hi: hi, lo: lo, len: opts.len || 1,
        neutral: !!opts.neutral, seedOf: opts.seedOf || {}, note: opts.note || '' };
      if (hi && lo) {
        m.p = m.len > 1 ? seriesP(cfg, hi, lo) : gameP(cfg, hi, lo, m.neutral);
        var pk = picks[id];
        m.winner = pk === hi || pk === lo ? pk : null;
        m.loser = m.winner ? (m.winner === hi ? lo : hi) : null;
      } else { m.p = null; m.winner = null; m.loser = null; }
      out.matches.push(m);
      out.byId[id] = m;
      (out.confs[conf] = out.confs[conf] || []).push(m);
      return m;
    }

    var champs = {};
    cfg.confs.forEach(function (conf, ci) {
      var p = conf.charAt(0);
      if (L === 'nfl') {
        var s = seeds[conf];
        var seedOf = {};
        s.forEach(function (t, i) { seedOf[t] = i + 1; });
        var bySeed = function (a, b) { return seedOf[a] < seedOf[b] ? [a, b] : [b, a]; };
        var wc = [[1, 6], [2, 5], [3, 4]].map(function (x, i) {
          return match(p + '-wc-' + i, conf, 0, x[0] + 1 + ' vs ' + (x[1] + 1), s[x[0]], s[x[1]], { order: bySeed, seedOf: seedOf });
        });
        var alive = [s[0]].concat(wc.map(function (m) { return m.winner; }));
        var full = alive.every(Boolean);
        var dv;
        if (full) {
          alive.sort(function (a, b) { return seedOf[a] - seedOf[b]; });
          dv = [[alive[0], alive[3]], [alive[1], alive[2]]];
        } else {
          dv = [[s[0], null], [null, null]];
        }
        var d = dv.map(function (x, i) {
          return match(p + '-dv-' + i, conf, 1, i === 0 ? 'Top seed vs lowest seed left' : 'The other two', x[0], x[1], { order: bySeed, seedOf: seedOf });
        });
        var cc = match(p + '-cc', conf, 2, conf + ' Championship', d[0].winner, d[1].winner, { order: bySeed, seedOf: seedOf });
        champs[conf] = cc.winner;
        return;
      }
      if (L === 'nba') {
        var n = seeds[conf], sd = {};
        n.forEach(function (t, i) { sd[t] = i + 1; });
        var ord = function (a, b) { return sd[a] < sd[b] ? [a, b] : [b, a]; };
        var A = match(p + '-pi-a', conf, -1, '7 vs 8, winner is the 7 seed', n[6], n[7], { order: ord, seedOf: sd });
        var B = match(p + '-pi-b', conf, -1, '9 vs 10, loser is out', n[8], n[9], { order: ord, seedOf: sd });
        var C = match(p + '-pi-c', conf, -1, 'For the 8 seed', A.loser, B.winner, { seedOf: sd, note: 'The loser of 7 vs 8 hosts' });
        var s7 = A.winner, s8 = C.winner;
        var seedNow = {};
        n.slice(0, 6).forEach(function (t, i) { seedNow[t] = i + 1; });
        if (s7) seedNow[s7] = 7;
        if (s8) seedNow[s8] = 8;
        var o2 = function (a, b) { return seedNow[a] < seedNow[b] ? [a, b] : [b, a]; };
        var r1 = [[n[0], s8, '1 vs 8'], [n[3], n[4], '4 vs 5'], [n[1], s7, '2 vs 7'], [n[2], n[5], '3 vs 6']].map(function (x, i) {
          return match(p + '-r1-' + i, conf, 0, x[2], x[0], x[1], { order: o2, len: 7, seedOf: seedNow });
        });
        var r2 = [0, 1].map(function (i) {
          return match(p + '-r2-' + i, conf, 1, '', r1[i * 2].winner, r1[i * 2 + 1].winner, { order: o2, len: 7, seedOf: seedNow });
        });
        var cf = match(p + '-cf', conf, 2, conf + ' Conference Finals', r2[0].winner, r2[1].winner, { order: o2, len: 7, seedOf: seedNow });
        champs[conf] = cf.winner;
        return;
      }
      // nhl
      var c = seeds[conf], rank = {}, k = 1;
      var first = c.order[0], second = c.order[1];
      rank[c.divs[first][0]] = k++;
      rank[c.divs[second][0]] = k++;
      var mids = [];
      c.order.forEach(function (dv2) { mids = mids.concat(c.divs[dv2].slice(1)); });
      mids.sort(function (a, b) { return (T[b].r || 0) - (T[a].r || 0); }).forEach(function (t) { rank[t] = k++; });
      rank[c.wc[0]] = k++;
      rank[c.wc[1]] = k++;
      var ordH = function (a, b) { return rank[a] < rank[b] ? [a, b] : [b, a]; };
      var label = {};
      c.order.forEach(function (dv2) {
        label[c.divs[dv2][0]] = dv2.charAt(0) + '1';
        label[c.divs[dv2][1]] = dv2.charAt(0) + '2';
        label[c.divs[dv2][2]] = dv2.charAt(0) + '3';
      });
      label[c.wc[0]] = 'WC1';
      label[c.wc[1]] = 'WC2';
      var divWin = c.order.map(function (dv2, di) {
        var t = c.divs[dv2];
        var x1 = match(p + '-' + di + '-r1-a', conf, 0, dv2 + ': division winner vs ' + (di === 0 ? 'WC2' : 'WC1'), t[0], di === 0 ? c.wc[1] : c.wc[0], { order: ordH, len: 7, seedOf: label });
        var x2 = match(p + '-' + di + '-r1-b', conf, 0, dv2 + ': 2 vs 3', t[1], t[2], { order: ordH, len: 7, seedOf: label });
        return match(p + '-' + di + '-r2', conf, 1, dv2 + ' Division Final', x1.winner, x2.winner, { order: ordH, len: 7, seedOf: label });
      });
      var cfn = match(p + '-cf', conf, 2, conf + ' Conference Final', divWin[0].winner, divWin[1].winner, { order: ordH, len: 7, seedOf: label });
      champs[conf] = cfn.winner;
    });

    var a = champs[cfg.confs[0]], b = champs[cfg.confs[1]];
    var byR = function (x, y) { return (T[x].r || 0) >= (T[y].r || 0) ? [x, y] : [y, x]; };
    var fin = L === 'nfl'
      ? match('F', 'final', 3, 'Neutral site', a, b, { neutral: true })
      : match('F', 'final', 3, 'Home ' + (L === 'nhl' ? 'ice' : 'court') + ' to the better regular season', a, b, { order: byR, len: 7 });
    out.final = fin;
    out.champion = fin.winner;
    return out;
  }

  /** Every pick that still stands, so a stale pick never rides along in a share link. */
  function prune(cfg, state) {
    var b = build(cfg, state), keep = {};
    b.matches.forEach(function (m) { if (m.winner) keep[m.id] = m.winner; });
    return { seeds: state.seeds, picks: keep };
  }

  /** Fill every open match: 'fav' takes the model favorite, 'sim' draws one. */
  function fill(cfg, state, how, rng) {
    rng = rng || Math.random;
    var s = { seeds: state.seeds, picks: Object.assign({}, state.picks) };
    for (var guard = 0; guard < 64; guard++) {
      var b = build(cfg, s), open = null;
      for (var i = 0; i < b.matches.length; i++) {
        var m = b.matches[i];
        if (m.hi && m.lo && !m.winner) { open = m; break; }
      }
      if (!open) break;
      s.picks[open.id] = how === 'fav' ? (open.p >= 0.5 ? open.hi : open.lo) : (rng() < open.p ? open.hi : open.lo);
    }
    return prune(cfg, s);
  }

  /** Chance the model gives this exact set of picks, multiplied through. */
  function bracketOdds(b) {
    var p = 1, any = false;
    b.matches.forEach(function (m) {
      if (!m.winner) return;
      any = true;
      p *= m.winner === m.hi ? m.p : 1 - m.p;
    });
    return any ? p : null;
  }

  /* ----------------------------------------------------------------- render */

  function pct(v) {
    if (v == null) return '';
    var x = Math.round(v * 100);
    return (x >= 100 ? '>99' : x <= 0 ? '<1' : x) + '%';
  }

  function teamBtn(cfg, m, t, p) {
    if (!t) return '<div class="pb-t pb-tbd">To be decided</div>';
    var T = cfg.teams[t] || { n: t, s: t };
    var on = m.winner === t, out = m.winner && !on;
    var sd = m.seedOf[t];
    return '<button type="button" class="pb-t' + (on ? ' on' : '') + (out ? ' out' : '') + '" data-m="' + esc(m.id)
      + '" data-t="' + esc(t) + '" aria-pressed="' + (on ? 'true' : 'false') + '" title="' + esc(T.n) + '">'
      + (sd ? '<span class="pb-sd">' + esc(sd) + '</span>' : '')
      + (T.l ? '<img src="' + esc(T.l) + '" alt="" width="22" height="22" loading="lazy">' : '')
      + '<span class="pb-n">' + esc(T.s || T.n) + '</span>'
      + '<span class="pb-p">' + pct(p) + '</span></button>';
  }

  function matchHtml(cfg, m) {
    var head = m.label ? '<div class="pb-mh">' + esc(m.label) + (m.len > 1 ? ' &middot; best of 7' : '') + '</div>' : '';
    return '<div class="pb-m" data-id="' + esc(m.id) + '">' + head
      + teamBtn(cfg, m, m.hi, m.p) + teamBtn(cfg, m, m.lo, m.p == null ? null : 1 - m.p)
      + (m.note ? '<div class="pb-note">' + esc(m.note) + '</div>' : '') + '</div>';
  }

  function seedEditor(cfg, state) {
    var L = cfg.league, T = cfg.teams, html = '';
    function sel(conf, path, cur, pool, label) {
      var opts = pool.slice().sort(function (a, b) { return T[a].n < T[b].n ? -1 : 1; }).map(function (t) {
        return '<option value="' + esc(t) + '"' + (t === cur ? ' selected' : '') + '>' + esc(T[t].n) + '</option>';
      }).join('');
      return '<label class="pb-sl"><span>' + esc(label) + '</span><select data-seed="' + esc(conf + '|' + path) + '">' + opts + '</select></label>';
    }
    cfg.confs.forEach(function (conf) {
      var pool = Object.keys(T).filter(function (t) { return T[t].c === conf; });
      html += '<fieldset class="pb-seeds"><legend>' + esc(conf) + '</legend>';
      if (L === 'nhl') {
        var c = state.seeds[conf];
        c.order.forEach(function (d) {
          var dp = pool.filter(function (t) { return T[t].d === d; });
          c.divs[d].forEach(function (t, i) { html += sel(conf, 'd:' + d + ':' + i, t, dp, d + ' ' + (i + 1)); });
        });
        c.wc.forEach(function (t, i) { html += sel(conf, 'w:' + i, t, pool, 'Wild card ' + (i + 1)); });
      } else {
        state.seeds[conf].forEach(function (t, i) { html += sel(conf, 's:' + i, t, pool, 'Seed ' + (i + 1)); });
      }
      html += '</fieldset>';
    });
    return html;
  }

  function oddsText(p) {
    if (p == null) return '';
    if (p >= 0.1) return pct(p);
    return '1 in ' + Math.round(1 / p).toLocaleString('en-US');
  }

  function render(cfg, state) {
    var b = build(cfg, state), R = ROUND[cfg.league], T = cfg.teams;
    var html = '<div class="pb-confs">';
    cfg.confs.forEach(function (conf) {
      var ms = b.confs[conf] || [];
      html += '<div class="pb-conf"><h3>' + esc(conf) + (cfg.league === 'nfl' ? '' : ' Conference') + '</h3><div class="pb-rounds">';
      var rounds = cfg.league === 'nba' ? [-1, 0, 1, 2] : [0, 1, 2];
      rounds.forEach(function (r) {
        var list = ms.filter(function (m) { return m.round === r; });
        var name = r === -1 ? 'Play-In' : R[r];
        var extra = '';
        if (cfg.league === 'nfl' && r === 0) {
          var one = state.seeds[conf][0];
          extra = '<div class="pb-m pb-bye"><div class="pb-mh">1 seed, first round bye</div><div class="pb-t on"><span class="pb-sd">1</span>'
            + (T[one].l ? '<img src="' + esc(T[one].l) + '" alt="" width="22" height="22" loading="lazy">' : '')
            + '<span class="pb-n">' + esc(T[one].s || T[one].n) + '</span></div></div>';
        }
        html += '<div class="pb-round"><h4>' + esc(name) + '</h4>' + extra + list.map(function (m) { return matchHtml(cfg, m); }).join('') + '</div>';
      });
      html += '</div></div>';
    });
    html += '</div>';
    var c = b.champion ? T[b.champion] : null;
    html += '<div class="pb-final"><div class="pb-round"><h4>' + esc(R[3]) + '</h4>' + matchHtml(cfg, b.final) + '</div>'
      + '<div class="pb-champ" aria-live="polite">' + (c
        ? (c.l ? '<img src="' + esc(c.l) + '" alt="" width="44" height="44">' : '') + '<div><small>Your ' + esc(cfg.trophy) + ' pick</small><b>' + esc(c.n) + '</b><span>Model odds of this exact bracket: ' + esc(oddsText(bracketOdds(b))) + '</span></div>'
        : '<div><small>Your ' + esc(cfg.trophy) + ' pick</small><b>Not picked yet</b><span>Pick a winner in every matchup, or press Simulate the rest.</span></div>')
      + '</div></div>';
    return html;
  }

  /** The whole widget as baked HTML: data, buttons, seed editor slot and the bracket. */
  function widget(cfg, state) {
    var json = JSON.stringify(Object.assign({}, cfg, { defaultPicks: state.picks })).replace(/</g, '\\u003c');
    return '<div class="pb" data-playoff-bracket>'
      + '<script type="application/json">' + json + '</script>'
      + '<div class="pb-bar">'
      + '<button type="button" class="primary pb-js" data-pb="sim">Simulate the rest</button>'
      + '<button type="button" class="pb-js" data-pb="fav">Fill with favorites</button>'
      + '<button type="button" class="pb-js" data-pb="clear">Clear picks</button>'
      + '<button type="button" class="pb-js" data-pb="seeds" aria-expanded="false">Edit seeds</button>'
      + '<button type="button" class="pb-js" data-pb="reset">Reset</button>'
      + '<button type="button" class="pb-js" data-pb="share">Share bracket</button>'
      + '</div>'
      + '<p class="pb-status" role="status" aria-live="polite"></p>'
      + '<div class="pb-editor" hidden></div>'
      + '<div class="pb-board">' + render(cfg, state) + '</div>'
      + '</div>';
  }

  /* ---------------------------------------------------------------- browser */

  function encode(o) {
    var s = JSON.stringify(o);
    try { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch (e) { return ''; }
  }
  function decode(s) {
    try {
      s = s.replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      return JSON.parse(decodeURIComponent(escape(atob(s))));
    } catch (e) { return null; }
  }

  function validSeeds(cfg, seeds) {
    if (!seeds) return false;
    var T = cfg.teams;
    return cfg.confs.every(function (conf) {
      var s = seeds[conf], all;
      if (!s) return false;
      if (cfg.league === 'nhl') {
        if (!s.divs || !s.wc || !s.order) return false;
        all = [].concat(s.divs[s.order[0]] || [], s.divs[s.order[1]] || [], s.wc);
        if (all.length !== 8) return false;
      } else {
        all = s;
        if (all.length !== cfg.seeds[conf].length) return false;
      }
      var seen = {};
      return all.every(function (t) { var ok = T[t] && T[t].c === conf && !seen[t]; seen[t] = 1; return ok; });
    });
  }

  /** NHL: the division winner with more projected points plays the second wild card. */
  function reorderNhl(cfg, s) {
    var T = cfg.teams;
    Object.keys(s).forEach(function (conf) {
      var c = s[conf];
      c.order.sort(function (x, y) { return (T[c.divs[y][0]].r || 0) - (T[c.divs[x][0]].r || 0); });
    });
    return s;
  }

  function mount(el) {
    var data = el.querySelector('script[type="application/json"]');
    if (!data) return;
    var cfg = JSON.parse(data.textContent);
    var KEY = 'tmr-bracket-' + cfg.league + '-' + cfg.season;
    var board = el.querySelector('.pb-board');
    var editor = el.querySelector('.pb-editor');
    var status = el.querySelector('.pb-status');
    var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
    var state = { seeds: clone(cfg.seeds), picks: clone(cfg.defaultPicks || {}) };

    var fromHash = /[#&]bracket=([^&]+)/.exec(location.hash);
    var saved = null;
    if (fromHash) saved = decode(fromHash[1]);
    if (!saved) { try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; } }
    if (saved && validSeeds(cfg, saved.seeds)) state = prune(cfg, { seeds: saved.seeds, picks: saved.picks || {} });

    function say(msg) { if (status) status.textContent = msg || ''; }
    function store() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ } }
    function paint() {
      board.innerHTML = render(cfg, state);
      if (editor && !editor.hidden) editor.innerHTML = seedEditor(cfg, state);
    }

    board.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('button.pb-t') : null;
      if (!t) return;
      var id = t.getAttribute('data-m'), team = t.getAttribute('data-t');
      state.picks[id] = team;
      state = prune(cfg, state);
      store(); paint(); say('');
      var again = board.querySelector('button.pb-t[data-m="' + id + '"][data-t="' + team + '"]');
      if (again) again.focus();
    });

    el.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-pb]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-pb');
      if (act === 'fav') { state = fill(cfg, state, 'fav'); say('Every open matchup filled with the model favorite.'); }
      if (act === 'sim') { state = fill(cfg, state, 'sim'); say('Every open matchup drawn from the model odds. Press again after clearing for a different bracket.'); }
      if (act === 'clear') { state = { seeds: state.seeds, picks: {} }; say('Picks cleared. Seeds kept.'); }
      if (act === 'reset') { state = { seeds: clone(cfg.seeds), picks: {} }; say('Seeds back to the projection, picks cleared.'); }
      if (act === 'seeds') {
        editor.hidden = !editor.hidden;
        btn.setAttribute('aria-expanded', editor.hidden ? 'false' : 'true');
        if (!editor.hidden) editor.innerHTML = seedEditor(cfg, state);
        return;
      }
      if (act === 'share') {
        var url = location.origin + location.pathname + '#bracket=' + encode(state);
        var done = function () { say('Link copied. Anyone who opens it sees this bracket.'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { say(url); });
        else say(url);
        return;
      }
      store(); paint();
    });

    if (editor) editor.addEventListener('change', function (e) {
      var s = e.target;
      if (!s.matches || !s.matches('select[data-seed]')) return;
      var parts = s.getAttribute('data-seed').split('|'), conf = parts[0], path = parts[1].split(':');
      var seeds = clone(state.seeds), c = seeds[conf], team = s.value;
      var slots = [];
      if (cfg.league === 'nhl') {
        c.order.forEach(function (d) { c.divs[d].forEach(function (_, i) { slots.push(['d', d, i]); }); });
        c.wc.forEach(function (_, i) { slots.push(['w', i]); });
      } else c.forEach(function (_, i) { slots.push(['s', i]); });
      var get = function (x) { return x[0] === 'd' ? c.divs[x[1]][x[2]] : x[0] === 'w' ? c.wc[x[1]] : c[x[1]]; };
      var put = function (x, v) { if (x[0] === 'd') c.divs[x[1]][x[2]] = v; else if (x[0] === 'w') c.wc[x[1]] = v; else c[x[1]] = v; };
      var target = path[0] === 'd' ? ['d', path[1], +path[2]] : [path[0], +path[1]];
      var old = get(target);
      // Swap with the slot that already holds the chosen team, so a seed list never repeats a club.
      slots.forEach(function (x) { if (get(x) === team && !(x.join() === target.join())) put(x, old); });
      put(target, team);
      if (cfg.league === 'nhl') {
        // A club moved into a division slot must belong to that division; if the swap broke that, refuse it.
        var ok = c.order.every(function (d) { return c.divs[d].every(function (t) { return cfg.teams[t].d === d; }); });
        if (!ok) { say('That club plays in another division. Pick it as a wild card instead.'); paint(); return; }
        reorderNhl(cfg, seeds);
      }
      state = prune(cfg, { seeds: seeds, picks: state.picks });
      store(); paint(); say('Seeds updated. Picks that no longer fit were cleared.');
    });

    /* A page can hand the bracket new seeds, for example the NFL simulator
       after the reader picks the rest of the regular season. */
    el.addEventListener('tmr:bracket-seeds', function (e) {
      var seeds = e.detail && e.detail.seeds;
      if (!validSeeds(cfg, seeds)) return;
      state = prune(cfg, { seeds: clone(seeds), picks: state.picks });
      store(); paint(); say(e.detail.message || 'Seeds updated.');
    });

    paint();
    el.classList.add('pb-live');
  }

  if (typeof document !== 'undefined') {
    var go = function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-playoff-bracket]'), mount);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }

  return { build: build, fill: fill, prune: prune, render: render, widget: widget,seriesP: seriesP, gameP: gameP, bracketOdds: bracketOdds, reorderNhl: reorderNhl, validSeeds: validSeeds, encode: encode, decode: decode, ROUND: ROUND };
}));
