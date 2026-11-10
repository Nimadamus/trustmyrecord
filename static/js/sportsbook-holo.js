/* SPORTSBOOK_HOLO_20261110: presentation only. Adds the banner above the Make Picks board, league marks on the
   sports rail and board title, and the TMR Tools panel. It never touches prices, picks, the slip or any request. */
(function () {
  'use strict';
  var ESPN = 'https://a.espncdn.com/i/teamlogos/leagues/500/';
  function svg(inner) { return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' + inner + '</svg>'); }
  var BALL_FB = svg('<ellipse cx="24" cy="24" rx="20" ry="12" fill="#8a4a22" transform="rotate(-35 24 24)"/><path d="M16 30L32 18M20 23l3 3M23.500 20.500l3 3M27 18l3 3" stroke="#fff" stroke-width="2" stroke-linecap="round"/>');
  var BALL_BK = svg('<circle cx="24" cy="24" r="19" fill="#e2641a"/><path d="M5 24h38M24 5v38M10.500 10.500c5 4.500 7.500 9 7.500 13.500s-2.500 9-7.500 13.500M37.500 10.500c-5 4.500-7.500 9-7.500 13.500s2.500 9 7.500 13.500" fill="none" stroke="#2a1205" stroke-width="2"/>');
  var BALL_SC = svg('<circle cx="24" cy="24" r="19" fill="#f4f6fa" stroke="#1b2333" stroke-width="2"/><path d="M24 15l8 6-3 9.500H19L16 21z" fill="#1b2333"/><path d="M24 15V6M32 21l8-3M29 30.500l5 7.500M19 30.500l-5 7.500M16 21l-8-3" stroke="#1b2333" stroke-width="2"/>');
  var FLAG_JP = svg('<rect x="4" y="10" width="40" height="28" rx="3" fill="#fff"/><circle cx="24" cy="24" r="8" fill="#d62828"/>');
  var ICON = { 'MLB': ESPN + 'mlb.png', 'NFL': ESPN + 'nfl.png', 'NBA': ESPN + 'nba.png', 'NHL': ESPN + 'nhl.png', 'WNBA': ESPN + 'wnba.png', 'UFC': ESPN + 'ufc.png',
    'NCAAF': BALL_FB, 'NCAAB': BALL_BK, 'Soccer': BALL_SC, 'Japan NPB': FLAG_JP };

  function mark(el, label) {
    var src = ICON[label]; if (!el || !src || el.querySelector('.sbh-ic')) return;
    var img = document.createElement('img');
    img.className = 'sbh-ic'; img.alt = ''; img.setAttribute('aria-hidden', 'true'); img.decoding = 'async'; img.src = src;
    img.onerror = function () { if (img.parentNode) { img.parentNode.classList.remove('sbh-has-ic'); img.parentNode.removeChild(img); } };
    el.insertBefore(img, el.firstChild); el.classList.add('sbh-has-ic');
  }
  function marks() {
    Array.prototype.forEach.call(document.querySelectorAll('#sbnRail .sbn-railbtn'), function (b) {
      var t = b.querySelector('b'); if (t) mark(b, t.textContent.trim());
    });
    var name = document.querySelector('#sbnBoard .sbn-boardname');
    if (name) {
      var label = (name.textContent || '').trim(), old = name.querySelector('.sbh-ic');
      if (old && old.getAttribute('data-for') !== label) { name.removeChild(old); name.classList.remove('sbh-has-ic'); old = null; }
      if (!old && ICON[label]) { mark(name, label); var im = name.querySelector('.sbh-ic'); if (im) im.setAttribute('data-for', label); }
    }
  }

  function hero() {
    /* placed beside the picks section, never inside it: the board's own scripts own everything in there */
    var sec = document.getElementById('picks'); if (!sec || !sec.parentNode || document.querySelector('.sbh-hero')) return;
    var h = document.createElement('div'); h.className = 'sbh-hero';
    h.innerHTML = '<b>The Ultimate <i>Sports Betting</i> Edge</b><span>Simulations<em>&bull;</em>Verified Handicappers<em>&bull;</em>Deep Stats<em>&bull;</em>Pro Tools</span>';
    sec.parentNode.insertBefore(h, sec);
  }

  var TOOLS = [
    ['/sports-simulators/', 'Simulators', '', '<rect x="5" y="26" width="9" height="16" rx="1.5"/><rect x="19.500" y="16" width="9" height="26" rx="1.5"/><rect x="34" y="6" width="9" height="36" rx="1.5"/>'],
    ['/betlegend-pro/', 'BetLegend Pro', 'gold', '<path d="M24 4a20 20 0 1 0 20 20h-5a15 15 0 1 1-15-15z"/><path d="M24 13a11 11 0 1 0 11 11h-5a6 6 0 1 1-6-6z"/><path d="M22 26l14-14 3 1 1 3-14 14z"/>'],
    ['/premium/#watchdog', 'Watchdog', 'ln', '<circle cx="13" cy="30" r="8"/><circle cx="35" cy="30" r="8"/><path d="M21 30h6M9 23l4-13h6l2 12M39 23l-4-13h-6l-2 12"/>'],
    ['/tmr-coin/', 'TMR Coin', 'gold', '<ellipse cx="20" cy="12" rx="14" ry="6"/><path d="M6 17c0 3.300 6.300 6 14 6s14-2.700 14-6v5c0 3.300-6.300 6-14 6S6 25.300 6 22z"/><path d="M6 27c0 3.300 6.300 6 14 6s14-2.700 14-6v5c0 3.300-6.300 6-14 6S6 35.300 6 32z"/><circle cx="36" cy="34" r="9"/>'],
    ['/leaderboards/', 'Leaderboards', 'gold', '<path d="M13 5h22v5h8v6a8 8 0 0 1-8.400 8A11 11 0 0 1 27 31v6h6v6H15v-6h6v-6a11 11 0 0 1-7.600-7A8 8 0 0 1 5 16v-6h8zm0 9H9v2a4 4 0 0 0 4 4zm22 0v6a4 4 0 0 0 4-4v-2z"/>'],
    ['/tools/', 'Stats &amp; Trends', 'ln', '<path d="M6 42V30M17 42V22M28 42V26M39 42V14"/><path d="M5 20l11-9 10 5L42 4M33 4h9v9"/>']
  ];
  function tools() {
    var slip = document.getElementById('sbnSlip'); if (!slip || !slip.parentNode || document.querySelector('.sbh-tools')) return;
    var box = document.createElement('section'); box.className = 'sbh-tools'; box.setAttribute('aria-label', 'TMR tools');
    box.innerHTML = '<h2><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.500 5.500a4 4 0 0 0 5 5l-9 9a2.100 2.100 0 0 1-3-3zM4 4l5 5M3 6l3-3 3 3-3 3z"/></svg>TMR Tools</h2><div class="sbh-tools-grid">'
      + TOOLS.map(function (t) { return '<a class="sbh-tool ' + t[2] + '" href="' + t[0] + '"><svg viewBox="0 0 48 48" aria-hidden="true">' + t[3] + '</svg><span>' + t[1] + '</span></a>'; }).join('') + '</div>';
    slip.appendChild(box);
  }

  function run() { try { marks(); tools(); } catch (e) {} }
  /* Nothing is added inside the board until the board has finished building itself. */
  function whenBoard(cb) {
    var n = 0;
    (function look() {
      if (document.querySelector('#sbnShell #sbnRail .sbn-railbtn') && document.querySelector('#sbnShell .sbn-chip, #sbnShell .sbn-row')) return cb();
      if (++n < 120) setTimeout(look, 250);
    })();
  }
  function start() {
    try { hero(); } catch (e) {}
    whenBoard(function () {
      run();
      if (window.MutationObserver) {
        var queued = false;
        new MutationObserver(function () {
          if (queued) return; queued = true;
          setTimeout(function () { queued = false; run(); }, 120);
        }).observe(document.getElementById('sbnShell'), { childList: true, subtree: true });
      }
    });
  }
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
