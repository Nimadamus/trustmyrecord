/* SIM_BOARD_MATCH_20261127
   One board game, or none. A Take button may attach board_game_id only when
   exactly one board row matches both clubs. Two rows, or an id whose clubs
   disagree with the simulated matchup, do not select a game. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TMRSimBoard = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function norm(s) {
    var t = String(s || '');
    try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { }
    return t.toLowerCase().replace(/[.']/g, '').replace(/\s+/g, ' ').trim().replace(/^la /, 'los angeles ');
  }
  function sameTeam(a, b) {
    a = norm(a); b = norm(b);
    return !!a && !!b && (a === b || a.indexOf(b) !== -1 || b.indexOf(a) !== -1);
  }
  function teamOf(game) {
    if (!game) return { home: '', away: '' };
    return {
      home: game.home_team || game.home || game.home_team_name || '',
      away: game.away_team || game.away || game.away_team_name || ''
    };
  }
  function orientation(game, home, away) {
    var t = teamOf(game);
    if (sameTeam(t.home, home) && sameTeam(t.away, away)) return 'exact';
    if (sameTeam(t.home, away) && sameTeam(t.away, home)) return 'swap';
    return '';
  }
  function uniqueBoardGame(games, home, away) {
    var exact = [];
    var swap = [];
    (games || []).forEach(function (g) {
      if (!g) return;
      var o = orientation(g, home, away);
      if (o === 'exact') exact.push(g);
      else if (o === 'swap') swap.push(g);
    });
    var hits = exact.length ? exact : swap;
    if (hits.length !== 1 || hits[0].id == null || hits[0].id === '') return { id: null, count: hits.length, game: null };
    return { id: hits[0].id, count: 1, game: hits[0] };
  }
  /* An id that names a different matchup loses. It does not fall through to
     another game. With no id, exactly one name match is required. */
  function prefillIndex(games, intent) {
    var list = games || [];
    if (!intent) return -1;
    var home = intent.home_team_name, away = intent.away_team_name;
    var hit = uniqueBoardGame(list, home, away);
    if (intent.board_game_id != null && intent.board_game_id !== '') {
      if (!hit.id || String(hit.id) !== String(intent.board_game_id)) return -1;
    } else if (!hit.id) {
      return -1;
    }
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === String(hit.id)) return i;
    }
    return -1;
  }
  function intentFor(teamName, home, away, games, sport, source) {
    var hit = uniqueBoardGame(games, home, away);
    return {
      v: 1,
      pick_team: teamName,
      selection: teamName,
      away_team_name: away,
      home_team_name: home,
      board_game_id: hit.id,
      market: 'h2h',
      sport: sport,
      source: source,
      board_match_count: hit.count
    };
  }
  return { norm: norm, sameTeam: sameTeam, uniqueBoardGame: uniqueBoardGame, prefillIndex: prefillIndex, intentFor: intentFor };
});
