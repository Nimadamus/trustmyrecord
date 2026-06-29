/**
 * TrustMyRecord - Official Community Account badge
 * ------------------------------------------------
 * Marks posts/polls/trivia authored by the official community accounts
 * (TMR Polls, TMR Trivia & Challenges) with a clear "Official" chip so they
 * are transparently community-generated and never mistaken for an independent
 * handicapper. Username tokens are unique brand strings, so matching on them is
 * safe across the forum, polls, and trivia renderers without per-page edits.
 */
(function () {
  if (typeof window === 'undefined' || window.__tmrOfficialBadge) return;
  window.__tmrOfficialBadge = true;

  // Known official accounts (hardcoded fallback; refreshed from the API below).
  var OFFICIAL = { tmrpolls: 'TMR Polls', tmrtrivia: 'TMR Trivia & Challenges' };

  function injectStyle() {
    if (document.getElementById('tmr-official-badge-css')) return;
    var s = document.createElement('style');
    s.id = 'tmr-official-badge-css';
    s.textContent =
      '.tmr-official-chip{display:inline-flex;align-items:center;gap:4px;margin-left:6px;' +
      'padding:1px 7px;border-radius:999px;font-size:11px;font-weight:700;line-height:1.6;' +
      'background:linear-gradient(135deg,#d9a441,#b9822a);color:#1a1205;border:1px solid #e6b75a;' +
      'vertical-align:middle;white-space:nowrap;letter-spacing:.2px;cursor:help;}' +
      '.tmr-official-chip svg{width:11px;height:11px;display:block;}';
    document.head.appendChild(s);
  }

  function chip() {
    var el = document.createElement('span');
    el.className = 'tmr-official-chip';
    el.title = 'Official TrustMyRecord community account. Posts polls, trivia and discussion prompts. Never makes picks, enters contests, or affects records or rankings.';
    el.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>Official';
    return el;
  }

  function isOfficial(name) {
    if (!name) return false;
    return Object.prototype.hasOwnProperty.call(OFFICIAL, String(name).trim().toLowerCase());
  }

  function tag(el) {
    if (!el || el.__tmrTagged) return;
    var txt = (el.textContent || '').trim();
    var dataName = el.getAttribute && el.getAttribute('data-tmr-username');
    if (!isOfficial(dataName) && !isOfficial(txt)) return;
    // avoid double-badging if a sibling chip already exists
    if (el.nextSibling && el.nextSibling.classList && el.nextSibling.classList.contains('tmr-official-chip')) { el.__tmrTagged = true; return; }
    el.__tmrTagged = true;
    if (el.parentNode) el.parentNode.insertBefore(chip(), el.nextSibling);
  }

  function scan(root) {
    root = root || document;
    var els = root.querySelectorAll('[data-tmr-username], b, strong, a');
    for (var i = 0; i < els.length; i++) tag(els[i]);
  }

  function refreshOfficialList() {
    try {
      var base = (window.CONFIG && CONFIG.api && CONFIG.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api';
      fetch(base + '/community-bots/public').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (d && Array.isArray(d.bots)) {
          d.bots.forEach(function (b) { if (b.username) OFFICIAL[String(b.username).toLowerCase()] = b.display_name || b.username; });
          scan(document);
        }
      }).catch(function () {});
    } catch (e) {}
  }

  function start() {
    injectStyle();
    scan(document);
    refreshOfficialList();
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        for (var j = 0; j < muts[i].addedNodes.length; j++) {
          var n = muts[i].addedNodes[j];
          if (n.nodeType === 1) { tag(n); if (n.querySelectorAll) scan(n); }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
