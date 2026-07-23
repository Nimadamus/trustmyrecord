/*
 * TMR doubleheader labels — DOUBLEHEADER_GAME_ID_20260723
 *
 * When a matchup is played twice in one day, "Baltimore Orioles @ Boston Red
 * Sox" names two different games. On Jul 22 2026 a user backed the Orioles in
 * game 2 and the pick settled against game 1's result; the display gave him no
 * way to see which game his pick was even on.
 *
 * The API now returns `doubleheader_game_number` (1 or 2, null for a normal
 * single game) on board games and on picks. These helpers render it the same
 * way everywhere: the sportsbook, pick history, profiles, share cards and the
 * admin tools.
 */
(function () {
  window.TMR = window.TMR || {};

  function leg(obj) {
    if (!obj) return null;
    var raw = obj.doubleheader_game_number;
    if (raw === undefined || raw === null) raw = obj.doubleheaderGameNumber;
    if (raw === undefined || raw === null) raw = obj.game_number;
    var n = parseInt(raw, 10);
    return (n >= 1 && n <= 9) ? n : null;
  }

  function esc(s) {
    return ('' + (s == null ? '' : s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 2 -> "Game 2"; null when this is not a doubleheader.
  window.TMR.dhLeg = leg;
  window.TMR.dhLabel = function (obj) {
    var n = leg(obj);
    return n ? 'Game ' + n : '';
  };

  // " · Game 2", ready to append to a matchup string. Empty for normal games.
  window.TMR.dhSuffix = function (obj, separator) {
    var n = leg(obj);
    return n ? (separator || ' · ') + 'Game ' + n : '';
  };

  // A pill for card headers.
  window.TMR.dhBadge = function (obj) {
    var n = leg(obj);
    if (!n) return '';
    return '<span class="tmr-dh-badge" title="Doubleheader: this is game ' + n
      + ' of two played today. Your pick is tied to this game only.">Game ' + n + '</span>';
  };

  // "Baltimore Orioles @ Boston Red Sox · Game 2" (HTML-escaped).
  window.TMR.dhMatchup = function (obj) {
    if (!obj) return '';
    var away = obj.away_team || obj.awayTeam || '';
    var home = obj.home_team || obj.homeTeam || '';
    if (!away || !home) return '';
    return esc(away) + ' @ ' + esc(home) + esc(window.TMR.dhSuffix(obj));
  };

  var STYLE_ID = 'tmr-dh-badge-style';
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '.tmr-dh-badge{display:inline-block;margin-left:8px;padding:2px 7px;'
      + 'border-radius:999px;background:rgba(56,189,248,.16);color:#38bdf8;'
      + 'border:1px solid rgba(56,189,248,.38);font-size:10px;font-weight:800;'
      + 'letter-spacing:.06em;text-transform:uppercase;vertical-align:middle;'
      + 'line-height:1.5;white-space:nowrap;}';
    (document.head || document.documentElement).appendChild(style);
  }
})();
