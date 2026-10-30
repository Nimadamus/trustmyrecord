/**
 * NFL_SEASON_PICKS_20261030 -- "Pick the games" on /nfl-season-simulator/.
 *
 * A visitor picks winners for the remaining games, week by week or one club's
 * whole schedule. Standings, seeds and the bracket redraw at once from the
 * official tiebreaker engine (static/js/nfl-playoff-engine.js); Run plays every
 * remaining season with those results locked in (static/js/nfl-season-sim.js).
 *
 * Picking is free and is not a run: it computes no simulation, only the
 * standings your picks produce. Pressing Run is a run, under the one policy in
 * scripts/sim-run-policy.js (the same split as the NFL Playoff Simulator and the
 * NBA and NHL season pages).
 *
 * Picks are held by matchup ("KC-BUF" = Kansas City at Buffalo), never by list
 * position, so a saved or shared pick always lands on the same game
 * (E.encodePicks / E.decodePicks). Share links use the #picks= fragment, so they
 * never create a new URL for the page.
 *
 * UMD: the page builder bakes the same markup this file draws in the browser, so
 * the first paint and the hydrated page are identical (no layout shift).
 */
(function (root, factory) {
  var api = factory(root.TMRPlayoffEngine || (typeof require === 'function' ? require('./nfl-playoff-engine.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TMRNflSeasonPicks = api;
}(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';
  var LIVE = null;   // set by mount(): the picks on screen

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function logo(id) { return 'https://a.espncdn.com/i/teamlogos/nfl/500/' + String(id).toLowerCase() + '.png'; }
  function teamMap(data) { var m = {}; data.teams.forEach(function (t) { m[t.id] = t; }); return m; }
  function pairPct(p) {
    var h = Math.round(p * 100);
    return [100 - h, h];
  }

  /** Picks by matchup key -> picks by game id, open games of THIS game list only. */
  function byId(games, picksByKey) {
    var out = {};
    games.forEach(function (g) {
      var w = picksByKey[E.gameKey(g)];
      if (w && !g.completed && (w === g.home || w === g.away)) out[g.id] = w;
    });
    return out;
  }
  function byKey(games, picksById) {
    var out = {};
    games.forEach(function (g) { if (picksById[g.id]) out[E.gameKey(g)] = picksById[g.id]; });
    return out;
  }

  function openWeeks(data) {
    var w = [];
    data.games.forEach(function (g) { if (!g.completed && w.indexOf(g.week) < 0) w.push(g.week); });
    return w.sort(function (a, b) { return a - b; });
  }

  /** The game cards for one week or one club. */
  function gamesHtml(data, view, picksByKey) {
    var T = teamMap(data);
    var list = data.games.filter(function (g) {
      return view.team ? (g.home === view.team || g.away === view.team) : g.week === view.week;
    });
    if (!list.length) return '<p class="small">No games.</p>';
    return list.map(function (g) {
      var key = E.gameKey(g), pick = picksByKey[key];
      var pr = typeof g.home_win_prob === 'number' ? pairPct(g.home_win_prob) : null;
      var side = function (id, isHome) {
        var t = T[id] || { nickname: id };
        var on = pick === id;
        var won = g.completed && (isHome ? g.home_score > g.away_score : g.away_score > g.home_score);
        var tail = g.completed ? String(isHome ? g.home_score : g.away_score) : (pr ? pr[isHome ? 1 : 0] + '%' : '');
        return '<button type="button" class="pk' + (on || won ? ' on' : '') + '" data-side="' + (isHome ? 'h' : 'a') + '"'
          + (g.completed ? ' disabled' : '') + ' aria-pressed="' + (on ? 'true' : 'false') + '">'
          + '<img src="' + logo(id) + '" alt="" width="22" height="22" loading="lazy"><span>' + esc(t.nickname || id) + '</span><small>' + tail + '</small></button>';
      };
      var label = view.team ? '<span class="wkc">W' + g.week + '</span>' : '';
      return '<div class="pick' + (g.completed ? ' fin' : '') + '" data-key="' + esc(key) + '">' + label + side(g.away, false) + '<span class="at">at</span>' + side(g.home, true) + '</div>';
    }).join('');
  }

  /** Seeds from the real results plus the picks, with record bound clinch marks. */
  function seedsHtml(data, picksById) {
    var T = teamMap(data);
    var s = E.seedAll(data.teams, data.games, picksById, null);
    var unpicked = data.games.filter(function (g) { return !g.completed && !picksById[g.id]; }).length;
    var mark = function (id) {
      var b;
      if (unpicked === 0) {
        var t = T[id];
        return s[t.conference].seeds.indexOf(id) >= 0 ? (s[t.conference].divisionWinners.indexOf(id) >= 0 ? 'Won div' : 'In') : 'Out';
      }
      b = E.clinchBound(data.teams, data.games, picksById, id);
      if (b.status === 'clinched') return b.division ? 'Clinched div' : 'Clinched';
      if (b.status === 'eliminated') return 'Eliminated';
      return '';
    };
    var rec = function (id) { return E.recLabel(s.standings[id].overall); };
    var row = function (id, seed, spot) {
      var t = T[id], m = mark(id);
      return '<tr><td class="num">' + seed + '</td><th scope="row"><span class="lt"><img src="' + logo(id) + '" alt="" width="22" height="22" loading="lazy"><span class="ln">' + esc(t.name) + '</span><span class="ls">' + esc(t.nickname || id) + '</span></span></th>'
        + '<td class="num">' + rec(id) + '</td><td class="sp">' + spot + '</td><td class="cm' + (m === 'Eliminated' || m === 'Out' ? ' out' : m ? ' in' : '') + '">' + esc(m) + '</td></tr>';
    };
    return ['AFC', 'NFC'].map(function (c) {
      var seeds = s[c].seeds;
      var rows = seeds.map(function (id, k) { return row(id, k + 1, k < 4 ? 'Division' : 'Wild card'); }).join('');
      var hunt = data.teams.filter(function (t) { return t.conference === c && seeds.indexOf(t.id) < 0; })
        .sort(function (a, b) { return E.pct(s.standings[b.id].overall) - E.pct(s.standings[a.id].overall); })
        .slice(0, 3).map(function (t) { return row(t.id, '', 'In the hunt'); }).join('');
      return '<div class="lsim-card"><h3>' + c + '</h3><div class="tscroll"><table class="lsim nsp"><thead><tr><th scope="col">Seed</th><th scope="col">Team</th><th scope="col">Record</th><th scope="col" class="sp">Spot</th><th scope="col">Status</th></tr></thead><tbody>'
        + rows + hunt + '</tbody></table></div></div>';
    }).join('');
  }

  function noteText(data, picksById) {
    var done = data.games.filter(function (g) { return g.completed; }).length;
    var picked = Object.keys(picksById).length;
    var open = data.games.length - done - picked;
    return done + ' final games' + (picked ? ' plus your ' + picked + (picked === 1 ? ' pick' : ' picks') : '') + ', with the NFL tiebreakers. '
      + (open ? open + ' unpicked games are not counted yet, so this is the order if the season stopped there. ' : 'Every game is decided, so this is your final field. ')
      + 'A Clinched or Eliminated mark comes from a record bound that holds whatever the tiebreakers say; a club with no mark is not settled yet.';
  }

  /* ---------------------------------------------------------------- browser */

  function mount() {
    var panel = document.getElementById('nflPicks');
    var dataEl = document.getElementById('nflSeasonData');
    if (!panel || !dataEl) return;
    var data = JSON.parse(dataEl.textContent);
    var KEY = 'tmr-nfl-season-picks-' + data.season;
    var list = panel.querySelector('#nspGames');
    var count = panel.querySelector('#nspCount');
    var weeks = panel.querySelector('#nspWeeks');
    var teamSel = panel.querySelector('#nspTeam');
    var linkMsg = panel.querySelector('#nspLinkMsg');
    var seedsEl = document.getElementById('nspSeeds');
    var noteEl = document.getElementById('nspNote');
    var picker = document.querySelector('[data-playoff-bracket]');
    var weeksOpen = openWeeks(data);
    var view = { week: weeksOpen[0] || data.games[data.games.length - 1].week, team: null };
    var picks = {};

    var fromHash = /[#&]picks=([^&]*)/.exec(location.hash);
    if (fromHash) picks = byKey(data.games, E.decodePicks(data.games, decodeURIComponent(fromHash[1])));
    else { try { picks = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { picks = {}; } }
    // drop picks on games that are now final or no longer on the schedule
    picks = byKey(data.games, byId(data.games, picks));

    function store() { try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch (e) { /* private mode */ } }
    function paintGames() {
      list.innerHTML = gamesHtml(data, view, picks);
      Array.prototype.forEach.call(weeks.querySelectorAll('button[data-week]'), function (b) {
        var on = !view.team && Number(b.getAttribute('data-week')) === view.week;
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (teamSel) teamSel.value = view.team || '';
    }
    var lastSeeds = '';
    function paintTable() {
      var ids = byId(data.games, picks);
      var n = Object.keys(ids).length;
      count.textContent = n ? n + (n === 1 ? ' game picked.' : ' games picked.') : 'No games picked yet.';
      if (seedsEl) seedsEl.innerHTML = seedsHtml(data, ids);
      if (noteEl) noteEl.textContent = noteText(data, ids);
      var s = E.seedAll(data.teams, data.games, ids, null);
      var seeds = { AFC: s.AFC.seeds.slice(), NFC: s.NFC.seeds.slice() };
      var sig = JSON.stringify(seeds);
      if (picker && sig !== lastSeeds && seeds.AFC.length === 7 && seeds.NFC.length === 7) {
        if (lastSeeds) picker.dispatchEvent(new CustomEvent('tmr:bracket-seeds', { detail: { seeds: seeds, message: 'Bracket seeded from your picks. Picks that no longer fit were cleared.' } }));
        lastSeeds = sig;
      }
    }

    panel.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      var pk = t.closest('.pick .pk');
      if (pk && !pk.disabled) {
        var key = pk.closest('.pick').getAttribute('data-key');
        var g = data.games.filter(function (x) { return E.gameKey(x) === key; })[0];
        if (!g || g.completed) return;
        var team = pk.getAttribute('data-side') === 'h' ? g.home : g.away;
        if (picks[key] === team) delete picks[key]; else picks[key] = team;
        store(); paintGames(); paintTable();
        var again = list.querySelector('.pick[data-key="' + key + '"] .pk[data-side="' + pk.getAttribute('data-side') + '"]');
        if (again) again.focus();
        return;
      }
      var wk = t.closest('button[data-week]');
      if (wk) { view = { week: Number(wk.getAttribute('data-week')), team: null }; paintGames(); return; }
      var act = t.closest('[data-nsp]');
      if (!act) return;
      var a = act.getAttribute('data-nsp');
      if (a === 'fav' || a === 'favweek') {
        data.games.forEach(function (g) {
          if (g.completed || picks[E.gameKey(g)] || typeof g.home_win_prob !== 'number') return;
          if (a === 'favweek' && (view.team ? (g.home !== view.team && g.away !== view.team) : g.week !== view.week)) return;
          picks[E.gameKey(g)] = g.home_win_prob >= 0.5 ? g.home : g.away;
        });
      }
      if (a === 'clear') picks = {};
      if (a === 'share') {
        var code = E.encodePicks(data.games, byId(data.games, picks));
        var url = location.origin + location.pathname + location.search + (code ? '#picks=' + code : '');
        try { history.replaceState(null, '', url); } catch (err) { /* file:// */ }
        var said = function (m) { if (linkMsg) linkMsg.textContent = m; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { said('Link copied. Anyone who opens it sees these picks.'); }, function () { said('The link to these picks is in the address bar.'); });
        else said('The link to these picks is in the address bar.');
        return;
      }
      if (a === 'run') {
        var run = document.getElementById('runSim');
        if (run) { run.click(); var top = document.querySelector('.lsim-run'); if (top && top.scrollIntoView) top.scrollIntoView({ block: 'center' }); }
        return;
      }
      store(); paintGames(); paintTable();
    });
    if (teamSel) teamSel.addEventListener('change', function () {
      view = teamSel.value ? { week: view.week, team: teamSel.value } : { week: weeksOpen[0] || view.week, team: null };
      paintGames();
    });

    LIVE = function () { return picks; };
    paintGames(); paintTable();
    panel.classList.add('nsp-live');
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }

  /** Page API for the Run button: the picks on screen, keyed to a (fresh) game list. */
  function current(games) { return byId(games, LIVE ? LIVE() : {}); }

  return { gamesHtml: gamesHtml, seedsHtml: seedsHtml, noteText: noteText, openWeeks: openWeeks, byId: byId, byKey: byKey, current: current };
}));
