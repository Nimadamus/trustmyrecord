/* WELCOME_SIM_FIRST_20261101 - /welcome/ simulator chooser.
 *
 * Orders the four simulator tiles so the most relevant one comes first:
 *   1. the sport of the simulator this browser first landed on (tmr_first_touch),
 *   2. sports in season this month (Pacific),
 *   3. offseason sports last.
 * Labels each tile "In season" or "Offseason". Reads nothing from the API and
 * writes nothing except GA4 events: welcome_viewed and welcome_action_clicked.
 * With JavaScript off the page still works: the tiles are plain links.
 */
(function () {
  'use strict';
  if (window.__tmrWelcomeSimFirst) return;
  window.__tmrWelcomeSimFirst = true;

  /* Months (1-12) each league plays games, regular season through finals. */
  var SEASON = {
    nfl: [9, 10, 11, 12, 1, 2],
    nba: [10, 11, 12, 1, 2, 3, 4, 5, 6],
    nhl: [10, 11, 12, 1, 2, 3, 4, 5, 6],
    mlb: [3, 4, 5, 6, 7, 8, 9, 10]
  };

  /* This file loads before analytics.js defines gtag, so an event sent at page start was
     dropped (11/01: welcome_viewed never reached GA4). Events wait for gtag, up to 10 s. */
  function track(name, params) {
    var p = Object.assign({ variant: 'sim_first_20261101' }, params || {});
    var tries = 0;
    (function send() {
      if (typeof window.gtag === 'function') { try { window.gtag('event', name, p); } catch (e) {} return; }
      if (++tries < 40) setTimeout(send, 250);
    })();
  }

  function pacificMonth() {
    try {
      return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'numeric' }).format(new Date()));
    } catch (e) { return new Date().getMonth() + 1; }
  }

  function firstTouchSport() {
    try {
      var t = JSON.parse(localStorage.getItem('tmr_first_touch') || 'null');
      var m = t && String(t.landing || '').match(/\/(nfl|nba|nhl|mlb)-/);
      return m ? m[1] : '';
    } catch (e) { return ''; }
  }

  function init() {
    var grid = document.getElementById('wcSports');
    if (!grid) return;
    var month = pacificMonth();
    var landed = firstTouchSport();
    var tiles = Array.prototype.slice.call(grid.querySelectorAll('.wc-sport'));
    tiles.forEach(function (a, i) {
      var s = a.getAttribute('data-sport');
      var on = (SEASON[s] || []).indexOf(month) !== -1;
      var tag = a.querySelector('[data-season]');
      if (tag) { tag.textContent = on ? 'In season' : 'Offseason'; if (!on) tag.className = 'wc-tag off'; }
      a.__rank = (s === landed ? 0 : 10) + (on ? 0 : 20) + i;
    });
    tiles.sort(function (x, y) { return x.__rank - y.__rank; });
    tiles.forEach(function (a) { grid.appendChild(a); });
    if (tiles[0]) tiles[0].classList.add('is-first');

    track('welcome_viewed', { first_sport: tiles[0] ? tiles[0].getAttribute('data-sport') : '', landed_sport: landed || 'none' });

    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
      if (!a) return;
      if (a.classList.contains('wc-sport')) {
        track('welcome_action_clicked', { action: 'sim', sport: a.getAttribute('data-sport'), position: tiles.indexOf(a) + 1 });
      } else if (a.id === 'wcPro') {
        track('welcome_action_clicked', { action: 'pro' });
      } else if (a.getAttribute('data-action')) {
        track('welcome_action_clicked', { action: a.getAttribute('data-action') });
      }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
