/**
 * G10_PLAYOFF_UI_20260913 -- the NFL Playoff Simulator page.
 *
 * All state lives in one object and every render is a pure function of it, so
 * the share link, localStorage and the DOM can never disagree about what the
 * user picked.
 *
 * The engine (static/js/nfl-playoff-engine.js) owns every rule. This file owns
 * pixels, events and persistence, and knows nothing about tiebreakers.
 */
(function () {
  'use strict';

  var E = window.TMRPlayoffEngine;
  var SEASON = 2026;
  var STORAGE = 'tmr-nfl-playoff-picks-v1';
  // The live endpoint in production; the local branch route when previewing.
  // Whichever answers first wins, and the baked snapshot is the last resort, so
  // the page is never blank because an API is down.
  var API = (location.port === '8100'
    ? 'http://127.0.0.1:8199/api/nfl/public/playoff-inputs?season='
    : 'https://trustmyrecord-api.onrender.com/api/nfl/public/playoff-inputs?season=') + SEASON;
  var FALLBACK = 'data/playoff-inputs-' + SEASON + '.json';

  var S = {
    data: null, picks: {}, focus: null, sims: null, simN: 10000, seed: 20260913,
    week: 1, tab: 'AFC', loading: true, error: null, source: null,
  };

  /* ------------------------------------------------------------- utilities */

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined && txt !== null) n.textContent = txt;
    return n;
  };
  function teamById(id) { return S.data ? S.data.teamIndex[id] : null; }
  function abbr(id) { var t = teamById(id); return t ? t.abbr : id; }
  function name(id) { var t = teamById(id); return t ? t.name : id; }
  function logo(id) {
    var t = teamById(id);
    return t && t.espn_id
      ? 'https://a.espncdn.com/i/teamlogos/nfl/500/' + String(t.abbr).toLowerCase() + '.png'
      : null;
  }
  function pctText(x) { return (x * 100).toFixed(x >= 0.995 || x <= 0.005 ? 0 : 1) + '%'; }

  /* ------------------------------------------------------- share + storage */

  /** Picks encode as winner initials keyed by game index: compact and readable. */
  function encodePicks() {
    if (!S.data) return '';
    var out = [];
    S.data.games.forEach(function (g, i) {
      var p = S.picks[g.id];
      if (p) out.push(i + '-' + (p === g.home ? 'h' : 'a'));
    });
    return out.join('.');
  }
  function decodePicks(str) {
    var picks = {};
    if (!str || !S.data) return picks;
    str.split('.').forEach(function (tok) {
      var m = /^(\d+)-(h|a)$/.exec(tok);
      if (!m) return;
      var g = S.data.games[Number(m[1])];
      if (g && !g.completed) picks[g.id] = m[2] === 'h' ? g.home : g.away;
    });
    return picks;
  }
  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify({ picks: S.picks, focus: S.focus })); } catch (e) { /* private window */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------------ data */

  function normalise(d) {
    d.teamIndex = {};
    d.teams.forEach(function (t) { d.teamIndex[t.id] = t; });
    d.weeks = [];
    d.games.forEach(function (g) { if (d.weeks.indexOf(g.week) === -1) d.weeks.push(g.week); });
    d.weeks.sort(function (a, b) { return a - b; });
    return d;
  }

  function fetchJson(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function boot() {
    fetchJson(API)
      .then(function (d) { S.source = 'live'; return d; })
      .catch(function () { return fetchJson(FALLBACK).then(function (d) { S.source = 'snapshot'; return d; }); })
      .then(function (d) {
        S.data = normalise(d);
        var stored = load();
        var fromUrl = new URLSearchParams(location.search).get('p');
        S.picks = fromUrl ? decodePicks(fromUrl) : ((stored && stored.picks) || {});
        S.focus = (stored && stored.focus) || null;
        var firstOpen = S.data.games.filter(function (g) { return !g.completed; })[0];
        S.week = firstOpen ? firstOpen.week : S.data.weeks[0];
        S.loading = false;
        render();
      })
      .catch(function (e) {
        S.loading = false; S.error = e.message; render();
      });
  }

  /* --------------------------------------------------------------- actions */

  function pick(gameId, winner) {
    if (S.picks[gameId] === winner) delete S.picks[gameId]; else S.picks[gameId] = winner;
    S.sims = null;
    save(); render();
  }
  function clearPicks() { S.picks = {}; S.sims = null; save(); render(); }

  function autoFill(mode) {
    S.data.games.forEach(function (g) {
      if (g.completed || S.picks[g.id]) return;
      if (mode === 'home') S.picks[g.id] = g.home;
      else if (mode === 'model') {
        var p = typeof g.home_win_prob === 'number' ? g.home_win_prob : 0.5;
        S.picks[g.id] = p >= 0.5 ? g.home : g.away;
      }
    });
    S.sims = null; save(); render();
  }

  function runSim() {
    var btn = $('#runSim');
    if (btn) { btn.disabled = true; btn.textContent = 'Simulating…'; }
    setTimeout(function () {
      var t0 = performance.now();
      S.sims = E.simulateSeason(S.data.teams, S.data.games, S.picks, S.simN, S.seed, { withBracket: true });
      S.sims.ms = Math.round(performance.now() - t0);
      render();
    }, 20);
  }

  /* ---------------------------------------------------------------- render */

  function render() {
    var root = $('#app');
    if (!root) return;
    root.innerHTML = '';
    if (S.loading) { root.appendChild(el('p', 'muted', 'Loading the 2026 schedule…')); return; }
    if (S.error) {
      var e = el('div', 'notice');
      e.appendChild(el('p', null, 'The schedule could not be loaded. Try again in a moment.'));
      root.appendChild(e); return;
    }
    root.appendChild(controls());
    root.appendChild(seedingPanel());
    root.appendChild(bracketPanel());
    root.appendChild(weekPanel());
    if (S.focus) root.appendChild(focusPanel());
    root.appendChild(tiebreakerPanel());
  }

  function controls() {
    var w = el('section', 'ctl');
    w.setAttribute('aria-label', 'Simulator controls');

    var picked = Object.keys(S.picks).length;
    var open = S.data.games.filter(function (g) { return !g.completed && !S.picks[g.id]; }).length;
    var played = S.data.games.filter(function (g) { return g.completed; }).length;

    var stat = el('p', 'ctl-stat');
    stat.appendChild(el('b', null, played + ' played'));
    stat.appendChild(document.createTextNode(' · ' + picked + ' picked · ' + open + ' still open'));
    w.appendChild(stat);

    var row = el('div', 'ctl-row');
    [['Pick the model favourites', function () { autoFill('model'); }, !S.data.projections_available],
      ['Pick every home team', function () { autoFill('home'); }, false],
      ['Clear my picks', clearPicks, picked === 0]].forEach(function (b) {
      var btn = el('button', 'btn ghost', b[0]);
      btn.type = 'button'; btn.disabled = !!b[2];
      btn.addEventListener('click', b[1]);
      row.appendChild(btn);
    });
    w.appendChild(row);

    // FRESHNESS. A projection that cannot say how old it is, is a stale
    // projection. The stamp is always shown when odds are on offer, and when the
    // snapshot is absent the odds module is omitted entirely rather than
    // replaced with a guess.
    if (S.data.projections_available && S.data.projections_generated_at) {
      var when = new Date(S.data.projections_generated_at);
      // Age is recomputed from the timestamp, never read from the payload's own
      // age field. The stored fallback carries the age it had when it was WRITTEN,
      // so trusting it made an hour-old snapshot announce itself as built just now.
      var age = Math.max(0, Math.round((Date.now() - when.getTime()) / 1000));
      var maxAge = S.data.projections_max_age_seconds || 43200;
      var f = el('p', 'fresh');
      f.appendChild(el('span', 'dot' + (age > maxAge / 2 ? ' warm' : ''), ''));
      var howLong = age < 90 ? 'just now'
        : age < 5400 ? (Math.round(age / 60) + ' minutes ago')
          : age < 172800 ? (Math.round(age / 3600) + ' hours ago')
            : (Math.round(age / 86400) + ' days ago');
      f.appendChild(document.createTextNode(S.source === 'snapshot'
        ? ('Live data is unavailable, so this is a stored snapshot. Game projections built '
          + howLong + ' (' + when.toLocaleString() + ') from the TrustMyRecord NFL model.')
        : ('Game projections built ' + howLong + ' (' + when.toLocaleString() + ') '
          + 'from the TrustMyRecord NFL model.')));
      w.appendChild(f);
    } else if (S.data.projection_state === 'building') {
      w.appendChild(el('p', 'fresh', 'Game projections are being built. Picking and the bracket work now; odds appear on the next load.'));
    }

    // SOURCE freshness, a different question from projection freshness: numbers
    // rebuilt a minute ago on three-day-old scores are three days old. The last
    // completed kickoff is the one stamp a reader can check against the real
    // world, so it is shown rather than described.
    var src = S.data.source_data;
    if (src && src.last_completed_kickoff) {
      var k = new Date(src.last_completed_kickoff);
      w.appendChild(el('p', 'fresh sub',
        'Results are current through the game that kicked off ' + k.toLocaleString() + '.'));
    }
    var status = S.data.freshness_status;
    if (status === 'stale_sources' && src && src.stale_feeds && src.stale_feeds.length) {
      w.appendChild(el('p', 'stale-warning', 'Some source feeds have not refreshed on schedule ('
        + src.stale_feeds.join(', ') + '), so the scores and rosters behind these numbers may be '
        + 'behind the real world. Picking and the bracket are unaffected.'));
    } else if (status === 'stale_projection') {
      w.appendChild(el('p', 'stale-warning', 'These projections are more than half a day old and '
        + 'are due to be rebuilt. Picking and the bracket are unaffected.'));
    }

    if (S.data.projections_available) {
      var sim = el('div', 'ctl-row');
      var lbl = el('label', 'sr-only', 'Number of simulations'); lbl.htmlFor = 'simN';
      var sel = el('select', 'sel'); sel.id = 'simN';
      [1000, 5000, 10000, 25000].forEach(function (n) {
        var o = el('option', null, n.toLocaleString() + ' simulations');
        o.value = String(n); if (n === S.simN) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () { S.simN = Number(sel.value); S.sims = null; render(); });
      sim.appendChild(lbl); sim.appendChild(sel);
      var run = el('button', 'btn primary', 'Simulate the rest of the season');
      run.type = 'button'; run.id = 'runSim';
      run.addEventListener('click', runSim);
      sim.appendChild(run);
      w.appendChild(sim);
    }

    var share = el('div', 'ctl-row');
    var sb = el('button', 'btn ghost', 'Copy a link to these picks');
    sb.type = 'button';
    sb.addEventListener('click', function () {
      var url = location.origin + location.pathname + (encodePicks() ? '?p=' + encodePicks() : '');
      // The address bar is the share link. The clipboard is a convenience on
      // top of it: it is denied outright in a lot of contexts, and writeText
      // REJECTS rather than returning false, which threw an uncaught error on
      // every denied click. A share button that can only work with clipboard
      // permission is a share button that does not work.
      try { history.replaceState(null, '', url); } catch (e) { /* file:// and the like */ }
      var done = function (msg) {
        sb.textContent = msg;
        setTimeout(function () { sb.textContent = 'Copy a link to these picks'; }, 2200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { done('Link copied'); },
          function () { done('Link is in the address bar'); });
      } else {
        done('Link is in the address bar');
      }
    });
    share.appendChild(sb);
    w.appendChild(share);
    return w;
  }


  /**
   * PROVISIONAL SEEDING.
   *
   * In the first weeks of a season almost every club is level, so the order that
   * falls out of the tiebreaker chain is not an earned seed: it is the chain
   * running out of evidence. Showing "1 seed" against an 0-0 club with no
   * qualification implies a standing that does not exist yet, so the table says
   * so instead. The threshold is three games, which is the point at which
   * division and conference records start separating clubs on their own.
   */
  var PROVISIONAL_GAMES = 3;
  function playedCount(st, id) {
    var r = st[id].overall;
    return r.w + r.l + r.t;
  }
  function provisionalSet(s, c) {
    var out = {};
    var notes = s[c].notes || [];
    notes.forEach(function (n) { n.teams.forEach(function (id) { out[id] = true; }); });
    s[c].seeds.forEach(function (id) {
      if (playedCount(s.standings, id) < PROVISIONAL_GAMES) out[id] = true;
    });
    return out;
  }

  function seeded() {
    return E.seedAll(S.data.teams, S.data.games, S.picks, null);
  }

  function seedingPanel() {
    var s = seeded();
    var sec = el('section', 'panel');
    sec.id = 'seeding';
    var h = el('h2', null, 'Playoff picture');
    sec.appendChild(h);

    var tabs = el('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    ['AFC', 'NFC'].forEach(function (c) {
      var b = el('button', 'tab' + (S.tab === c ? ' is-on' : ''), c);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', S.tab === c ? 'true' : 'false');
      b.addEventListener('click', function () { S.tab = c; render(); });
      tabs.appendChild(b);
    });
    sec.appendChild(tabs);

    ['AFC', 'NFC'].forEach(function (c) {
      var box = el('div', 'confbox' + (S.tab === c ? '' : ' is-hidden'));
      box.setAttribute('role', 'tabpanel');
      box.setAttribute('aria-label', c + ' seeding');
      var prov = provisionalSet(s, c);
      var provCount = s[c].seeds.filter(function (id) { return prov[id]; }).length;
      if (provCount) {
        var pb = el('p', 'provisional-banner');
        pb.appendChild(el('b', null, 'Provisional order.'));
        pb.appendChild(document.createTextNode(
          ' ' + (provCount === s[c].seeds.length ? 'All ' + provCount : provCount + ' of these ' + s[c].seeds.length)          + ' clubs are level on the records played so far, '
          + 'so their position comes from the tiebreaker chain rather than from anything earned on the field. '
          + 'Seeds firm up as the season separates them.'));
        box.appendChild(pb);
      }
      var tbl = el('table', 'seeds');
      var cap = el('caption', null, c + ' seeds. One to four are division winners, five to seven are wild cards.');
      tbl.appendChild(cap);
      var thead = el('thead');
      var tr = el('tr');
      // The numeric columns are right aligned in the body, so their headers have
      // to be too: left aligned headers sat a column-width away from the figures
      // they name and RECORD appeared to label the DIV column.
      [['Seed', 0], ['Team', 0], ['Record', 1], ['Div', 1], ['Conf', 1],
        [S.sims ? 'Playoff odds' : '', 1]].forEach(function (h) {
        if (h[0] === '') return;
        var th = el('th', h[1] ? 'num' : null, h[0]); th.scope = 'col'; tr.appendChild(th);
      });
      thead.appendChild(tr); tbl.appendChild(thead);
      var tb = el('tbody');
      s[c].seeds.forEach(function (id, i) {
        var st = s.standings[id];
        var row = el('tr', i === 0 ? 'is-bye' : (i < 4 ? 'is-div' : 'is-wc'));
        if (S.focus === id) row.className += ' is-focus';
        var seedCell = el('td', 'seed', String(i + 1));
        if (prov[id]) {
          var pc = el('span', 'badge prov', 'prov');
          pc.title = 'Provisional: level with other clubs on the records played so far.';
          seedCell.appendChild(pc);
          row.className += ' is-prov';
        } else if (i === 0) seedCell.appendChild(el('span', 'badge', 'bye'));
        row.appendChild(seedCell);
        var tdTeam = el('td', 'team');
        var lg = logo(id);
        if (lg) { var im = el('img'); im.src = lg; im.alt = ''; im.loading = 'lazy'; im.width = 22; im.height = 22; tdTeam.appendChild(im); }
        var btn = el('button', 'linkish', name(id));
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Focus on ' + name(id));
        btn.addEventListener('click', function () { S.focus = S.focus === id ? null : id; save(); render(); });
        tdTeam.appendChild(btn);
        row.appendChild(tdTeam);
        row.appendChild(el('td', 'num', E.recLabel(st.overall)));
        row.appendChild(el('td', 'num', E.recLabel(st.division)));
        row.appendChild(el('td', 'num', E.recLabel(st.conference)));
        if (S.sims) {
          var p = S.sims.probabilities[id];
          row.appendChild(el('td', 'num strong', p ? pctText(p.playoff) : '—'));
        }
        tb.appendChild(row);
      });
      tbl.appendChild(tb);
      // The odds column pushes the table past 390px, and a page that scrolls
      // sideways as a whole is a broken page. The table scrolls inside its own
      // box instead, which is the one element allowed to.
      var tw = el('div', 'tablewrap');
      tw.appendChild(tbl);
      box.appendChild(tw);

      // In the hunt: the next clubs out, which is the half of the picture a
      // seeds-only table hides.
      var rest = S.data.teams.filter(function (t) {
        return t.conference === c && s[c].seeds.indexOf(t.id) === -1;
      }).sort(function (a, b) {
        return E.pct(s.standings[b.id].overall) - E.pct(s.standings[a.id].overall);
      }).slice(0, 5);
      if (rest.length) {
        var h3 = el('h3', 'sub', 'In the hunt');
        box.appendChild(h3);
        var ul = el('ul', 'hunt');
        rest.forEach(function (t) {
          var li = el('li');
          li.appendChild(el('span', 'ab', t.abbr));
          li.appendChild(document.createTextNode(' ' + E.recLabel(s.standings[t.id].overall)));
          if (S.sims && S.sims.probabilities[t.id]) {
            li.appendChild(el('span', 'odds', pctText(S.sims.probabilities[t.id].playoff)));
          }
          ul.appendChild(li);
        });
        box.appendChild(ul);
      }
      sec.appendChild(box);
    });

    if (S.sims) {
      var note = el('p', 'muted small',
        'Odds from ' + S.sims.iterations.toLocaleString() + ' simulated seasons of the '
        + S.sims.simulatedGames + ' games you have not picked, computed in ' + S.sims.ms
        + ' ms in your browser. Your picks were held fixed.');
      sec.appendChild(note);
    }
    return sec;
  }

  /**
   * Both conferences and the Super Bowl they produce.
   *
   * The advancement rule is the better seed, every round. That is a CONVENTION,
   * not a prediction, and the panel says so: the model projects regular-season
   * games, and nothing here knows who wins a hypothetical January matchup.
   * Showing only the conference of the open standings tab, which is what the
   * first cut did, also left the Super Bowl unreachable while the page promised
   * a bracket through it.
   */
  function bracketPanel() {
    var s = seeded();
    var sec = el('section', 'panel');
    sec.id = 'bracket';
    sec.appendChild(el('h2', null, 'The bracket'));
    var wrap = el('div', 'brackets');
    var champions = {};
    ['AFC', 'NFC'].forEach(function (c) {
      var seeds = s[c].seeds;
      var b = E.bracket(seeds, function (h, a) { return seeds.indexOf(h) < seeds.indexOf(a) ? h : a; });
      champions[c] = b.champion;
      var col = el('div', 'bracket');
      col.appendChild(el('h3', null, c));
      [['Wild Card', b.wildcard], ['Divisional', b.divisional], ['Conference Championship', b.conference]]
        .forEach(function (r) {
          var rd = el('div', 'round');
          rd.appendChild(el('h4', null, r[0]));
          r[1].forEach(function (m) {
            var g = el('div', 'match');
            [m.home, m.away].forEach(function (id) {
              var row = el('div', 'mteam' + (m.winner === id ? ' is-win' : ''));
              row.appendChild(el('span', 'mseed', String(seeds.indexOf(id) + 1)));
              row.appendChild(el('span', 'mab', abbr(id)));
              g.appendChild(row);
            });
            rd.appendChild(g);
          });
          col.appendChild(rd);
        });
      if (seeds.length) {
        var bye = el('p', 'bye-note');
        bye.appendChild(el('b', null, abbr(seeds[0])));
        bye.appendChild(document.createTextNode(' has the first-round bye as the 1 seed.'));
        col.appendChild(bye);
      }
      wrap.appendChild(col);
    });
    sec.appendChild(wrap);

    if (champions.AFC && champions.NFC) {
      var sb = el('div', 'superbowl');
      sb.appendChild(el('h3', null, 'Super Bowl'));
      var card = el('div', 'match sb');
      [['AFC', champions.AFC], ['NFC', champions.NFC]].forEach(function (r) {
        var row = el('div', 'mteam');
        row.appendChild(el('span', 'mseed', r[0]));
        row.appendChild(el('span', 'mab', abbr(r[1])));
        row.appendChild(el('span', 'mfull', name(r[1])));
        sb.title = '';
        card.appendChild(row);
      });
      sb.appendChild(card);
      sb.appendChild(el('p', 'bye-note',
        'Neither club is marked as the winner. Nothing on this page projects a Super Bowl.'));
      sec.appendChild(sb);
    }

    sec.appendChild(el('p', 'bye-note',
      'Every round after the wild card reseeds, so the lowest surviving seed always visits the highest. '
      + 'The bracket advances the better seed in every round: it shows the path your picks create, '
      + 'not a forecast of who wins in January.'));
    return sec;
  }

  function weekPanel() {
    var sec = el('section', 'panel');
    sec.id = 'games';
    sec.appendChild(el('h2', null, 'Pick the games'));

    var nav = el('div', 'weeknav');
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', 'Week');
    S.data.weeks.forEach(function (w) {
      var b = el('button', 'wk' + (S.week === w ? ' is-on' : ''), String(w));
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', S.week === w ? 'true' : 'false');
      b.setAttribute('aria-label', 'Week ' + w);
      b.addEventListener('click', function () { S.week = w; render(); });
      nav.appendChild(b);
    });
    sec.appendChild(nav);

    var list = el('div', 'games');
    S.data.games.filter(function (g) { return g.week === S.week; }).forEach(function (g) {
      var card = el('div', 'game' + (g.completed ? ' is-final' : ''));
      var grp = el('div', 'gbtns');
      grp.setAttribute('role', 'group');
      grp.setAttribute('aria-label', name(g.away) + ' at ' + name(g.home));
      [g.away, g.home].forEach(function (id) {
        var chosen = S.picks[g.id] === id;
        var won = g.completed && ((id === g.home && g.home_score > g.away_score) || (id === g.away && g.away_score > g.home_score));
        var b = el('button', 'gteam' + (chosen ? ' is-pick' : '') + (won ? ' is-won' : ''));
        b.type = 'button';
        b.disabled = !!g.completed;
        b.setAttribute('aria-pressed', chosen ? 'true' : 'false');
        // Which club is at home is the whole point of a home win probability, and
        // nothing in the card said so. The marker sits in a fixed-width slot on
        // both rows so the logos stay in one column.
        b.appendChild(el('span', 'gat', id === g.home ? '@' : ''));
        var lg = logo(id);
        if (lg) { var im = el('img'); im.src = lg; im.alt = ''; im.loading = 'lazy'; im.width = 20; im.height = 20; b.appendChild(im); }
        b.appendChild(el('span', 'gab', abbr(id)));
        if (g.completed) b.appendChild(el('span', 'gscore', String(id === g.home ? g.home_score : g.away_score)));
        else if (typeof g.home_win_prob === 'number') {
          var p = id === g.home ? g.home_win_prob : 1 - g.home_win_prob;
          b.appendChild(el('span', 'gprob', pctText(p)));
        }
        b.addEventListener('click', function () { if (!g.completed) pick(g.id, id); });
        grp.appendChild(b);
      });
      card.appendChild(grp);
      if (g.completed) card.appendChild(el('span', 'tag', 'Final'));
      list.appendChild(card);
    });
    sec.appendChild(list);
    return sec;
  }

  function focusPanel() {
    var id = S.focus;
    var s = seeded();
    var sec = el('section', 'panel focus');
    sec.id = 'focus';
    sec.appendChild(el('h2', null, name(id)));
    var st = s.standings[id];
    var line = el('p', 'focus-line');
    line.appendChild(el('b', null, E.recLabel(st.overall)));
    line.appendChild(document.createTextNode(
      ' overall · ' + E.recLabel(st.division) + ' in the division · ' + E.recLabel(st.conference) + ' in the conference'));
    sec.appendChild(line);

    var t = teamById(id);
    var seedIdx = s[t.conference].seeds.indexOf(id);
    var verdict = el('p', 'verdict');
    verdict.textContent = seedIdx === -1
      ? 'Outside the field as things stand.'
      : 'Currently the ' + (seedIdx + 1) + ' seed in the ' + t.conference + '.';
    sec.appendChild(verdict);

    var c = E.clinchStatus(S.data.teams, S.data.games, S.picks, id, { cap: 4096 });
    if (c.status === 'clinched') sec.appendChild(el('p', 'clinch in', 'Clinched a playoff place: in under every remaining combination.'));
    else if (c.status === 'eliminated') sec.appendChild(el('p', 'clinch out', 'Eliminated: out under every remaining combination.'));
    else if (c.exhaustive) sec.appendChild(el('p', 'clinch', 'Still alive and not yet clinched. Both outcomes remain possible.'));

    if (S.sims && S.sims.probabilities[id]) {
      var p = S.sims.probabilities[id];
      var ul = el('ul', 'odds-list');
      // The first two come from simulating the remaining SCHEDULE with the
      // model's own game probabilities. The last two add playoff rounds, and the
      // model does not project hypothetical January matchups, so those rounds are
      // coin flips. The labels say so rather than passing a 50/50 bracket off as
      // a forecast.
      [['Make the playoffs', p.playoff], ['Take the 1 seed', p.topSeed],
        ['Win the conference \u2020', p.conference],
        ['Win the Super Bowl \u2020', p.superbowl]].forEach(function (r) {
        var li = el('li');
        li.appendChild(el('span', null, r[0]));
        li.appendChild(el('b', null, pctText(r[1])));
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      sec.appendChild(el('p', 'odds-note',
        '\u2020 Playoff rounds are treated as 50/50. The model projects regular-season '
        + 'games only, so these two figures measure seeding and the bye, not matchup quality.'));
    }

    var rem = S.data.games.filter(function (g) {
      return !g.completed && (g.home === id || g.away === id);
    });
    if (rem.length) {
      sec.appendChild(el('h3', 'sub', 'Remaining schedule'));
      var ul2 = el('ul', 'sched');
      rem.forEach(function (g) {
        var li = el('li');
        var opp = g.home === id ? g.away : g.home;
        li.appendChild(el('span', 'wk-chip', 'W' + g.week));
        li.appendChild(document.createTextNode((g.home === id ? 'vs ' : 'at ') + abbr(opp)));
        if (S.picks[g.id]) li.appendChild(el('span', 'pickchip', S.picks[g.id] === id ? 'W' : 'L'));
        ul2.appendChild(li);
      });
      sec.appendChild(ul2);
    }

    var close = el('button', 'btn ghost', 'Clear team focus');
    close.type = 'button';
    close.addEventListener('click', function () { S.focus = null; save(); render(); });
    sec.appendChild(close);
    return sec;
  }

  function tiebreakerPanel() {
    var s = seeded();
    var sec = el('section', 'panel');
    sec.id = 'tiebreakers';
    sec.appendChild(el('h2', null, 'How the ties were broken'));
    var notes = [].concat(s.AFC.notes, s.NFC.notes);
    if (!notes.length) {
      sec.appendChild(el('p', 'muted', 'No ties needed breaking in the current standings.'));
    } else {
      // resolvedBy already reads 'tied through net points in all games', so the
      // UI must not prepend 'are tied through' as well. It did, and every
      // unresolved line read 'are tied through tied through net points'.
      var ul = el('ul', 'tb');
      var anyUnresolved = false;
      notes.forEach(function (n) {
        var li = el('li');
        li.appendChild(el('b', null, n.teams.map(abbr).join(', ')));
        if (n.unresolved) {
          anyUnresolved = true;
          li.appendChild(document.createTextNode(' are ' + n.resolvedBy
            + ', and the next step is ' + (n.remaining || E.UNIMPLEMENTABLE).join(' and ') + '.'));
        } else {
          li.appendChild(document.createTextNode(' separated by ' + n.resolvedBy + '.'));
        }
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      // Said once, under the list, rather than repeated on all twelve lines.
      if (anyUnresolved) {
        sec.appendChild(el('p', 'odds-note',
          'Steps this simulator does not compute are named rather than guessed, and the clubs stay shown as tied. Early in a season most groups reach them, because clubs level on every record played so far are genuinely inseparable.'));
      }
    }
    return sec;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
