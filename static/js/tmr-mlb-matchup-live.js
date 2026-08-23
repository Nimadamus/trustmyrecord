/* =============================================================================
   TrustMyRecord - keep a baked MLB matchup page's prices honest.

   A matchup page is baked static so a crawler and a first paint both get real
   numbers with no JavaScript. Prices move, so the baked line carries the exact
   time it was read, and this script replaces it with the live one when the board
   still has the game.

   RULES
     - It only ever REPLACES a value it actually received. A failed fetch, a
       game that has dropped off the board, a missing market: the baked number
       and its baked timestamp stay exactly as they are. Nothing is blanked and
       nothing is invented.
     - It writes into slots that already contain a number, so nothing resizes
       and no layout shifts.
     - One request, no polling, no retry storm.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-mm-live]');
  if (!root) return;

  var awayTeam = root.getAttribute('data-away-team') || '';
  var homeTeam = root.getAttribute('data-home-team') || '';
  var gameDate = root.getAttribute('data-game-date') || '';
  if (!awayTeam || !homeTeam) return;

  var API = (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl)
    || 'https://trustmyrecord-api.onrender.com/api';

  function fmtOdds(v) {
    var n = Number(v);
    if (!isFinite(n)) return null;
    return n > 0 ? '+' + n : String(n);
  }
  function fmtLine(v) {
    var n = Number(v);
    if (!isFinite(n)) return null;
    return (n > 0 ? '+' : '') + n;
  }

  function put(key, text) {
    if (text === null || text === undefined || text === '') return false;
    var el = root.querySelector('[data-live="' + key + '"]');
    if (!el) return false;
    if (el.textContent.trim() === String(text)) return true;
    el.textContent = text;
    el.setAttribute('data-live-updated', '1');
    return true;
  }

  fetch(API + '/games/board/baseball_mlb?limit=80', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.games) return;
      var game = null;
      for (var i = 0; i < d.games.length; i++) {
        var g = d.games[i];
        if (g.away_team === awayTeam && g.home_team === homeTeam &&
            String(g.commence_time || '').slice(0, 10) === gameDate) { game = g; break; }
      }
      if (!game || !game.market_groups) return;

      var wrote = 0;
      game.market_groups.forEach(function (mg) {
        (mg.items || []).forEach(function (it) {
          var sel = it.selection, odds = fmtOdds(it.odds), line = fmtLine(it.line);
          if (mg.key === 'full_game' && it.market_type === 'h2h') {
            if (sel === awayTeam && put('ml-away', odds)) wrote++;
            if (sel === homeTeam && put('ml-home', odds)) wrote++;
          } else if (mg.key === 'spread') {
            if (sel === awayTeam && line !== null) { if (put('rl-away', line + ' (' + odds + ')')) wrote++; }
            if (sel === homeTeam && line !== null) { if (put('rl-home', line + ' (' + odds + ')')) wrote++; }
          } else if (mg.key === 'total') {
            var s = String(sel || '').toLowerCase();
            if (s.indexOf('over') === 0 && put('tot-over', 'Over ' + it.line + ' (' + odds + ')')) wrote++;
            if (s.indexOf('under') === 0 && put('tot-under', 'Under ' + it.line + ' (' + odds + ')')) wrote++;
          }
        });
      });

      if (!wrote) return;
      var stamp = root.querySelector('[data-live="as-of"]');
      if (stamp && game.updated_at) {
        var t = new Date(game.updated_at);
        if (!isNaN(t)) {
          stamp.textContent = t.toLocaleString([], {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
          }) + ' local';
        }
      }
      if (typeof window.tmrTrack === 'function') {
        window.tmrTrack('mlb_matchup_odds_refreshed', { fields: wrote });
      }
    })
    .catch(function () { /* baked values stand */ });
})();
