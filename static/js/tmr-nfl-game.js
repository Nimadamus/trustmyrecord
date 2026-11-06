/* NFL game simulator finish, runs after the page app and tmr-sim-broadcast.js. Moves
   existing blocks only; it never changes a run or a number.
   Order on the result: score, win chance, line score, team stats, then the pick,
   then the deep tabs. The first pick reminder sits under the result, so it cannot
   push the Simulate button down while the page loads. */
(function (global) {
  'use strict';
  var doc = global.document;
  function $(s, r) { return (r || doc).querySelector(s); }

  function reminder() {
    var n = $('#tmr-fp-reminder');
    var res = $('#result');
    if (n && res && res.parentNode && n.previousElementSibling !== res) {
      res.parentNode.insertBefore(n, res.nextSibling);
    }
  }

  function pick() {
    var out = $('#result');
    var panel = out && $('#simConvertPanel', out);
    if (!panel) return;
    var before = $('.bc-nflbox', out) || (($('#simTab_box', out) || panel).closest('.panel'));
    if (!before || before === panel || before.parentNode !== out) return;
    var next = $('#simNextGames', out);
    if (panel.nextElementSibling !== before && !(next && next.nextElementSibling === before)) {
      out.insertBefore(panel, before);
      if (next) out.insertBefore(next, before);
    }
  }

  function settle() { reminder(); pick(); }

  /* The run in flight shows on the stage, whichever control started it. */
  function busy() {
    var res = $('#result');
    var stage = $('.bc-stage');
    var games = $('#games');
    if (games && !games.hasAttribute('tabindex')) games.tabIndex = 0;
    if (!res || res.getAttribute('data-nfl') === '1') return;
    res.setAttribute('data-nfl', '1');
    new global.MutationObserver(function () {
      var on = res.getAttribute('aria-busy') === 'true';
      var st = stage || $('.bc-stage');
      if (st) st.classList.toggle('bc-running', on);
    }).observe(res, { attributes: true, attributeFilter: ['aria-busy'] });
  }

  function settings() {
    var outer = $('.bc-set');
    var inner = $('#advSettings');
    if (!outer || !inner || outer.getAttribute('data-nfl') === '1') return;
    outer.setAttribute('data-nfl', '1');
    outer.addEventListener('toggle', function () { if (outer.open) inner.open = true; });
  }

  var queued = false;
  var mo = new global.MutationObserver(function () {
    reminder();
    settings();
    busy();
    if (queued) return;
    queued = true;
    global.setTimeout(function () { queued = false; settle(); }, 0);
  });
  mo.observe(doc.documentElement, { childList: true, subtree: true });
  settle();
  settings();
  busy();
})(window);
