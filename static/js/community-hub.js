/* COMMUNITY_HUB_20261117: /community/ is a link hub. This only fills the three
   Community Numbers tiles from the public API and swaps the join bar for
   signed-in members. A tile whose number does not load is removed. */
(function () {
  'use strict';
  var API = (window.TMRSession && window.TMRSession.api) ||
            (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) ||
            'https://api.trustmyrecord.com/api';
  function $(id) { return document.getElementById(id); }
  function signedIn() { try { return !!(window.TMRSession && window.TMRSession.hasTokens()); } catch (_) { return false; } }
  function boot() {
    if (signedIn()) {
      var st = $('hubStatus');
      if (st) st.classList.add('is-in');
      $('hubStatusTitle').textContent = 'You’re in the community';
      $('hubStatusSub').textContent = 'Post a take, lock a pick, or jump into the forums.';
      $('hubStatusCta').innerHTML = '<a class="bx-btn" href="/profile/">My profile</a>' +
        '<a class="bx-btn bx-btn--gold" href="/feed/#composerCard">Post to the feed <span aria-hidden="true">&rarr;</span></a>';
    }
    fetch(API + '/users/directory-counts', { headers: { accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) {
        var c = (d && d.counts) || {};
        var v = { members: c.public_directory_eligible_users, week: c.active_pick_makers_7d, picks: c.total_valid_picks };
        Array.prototype.forEach.call(document.querySelectorAll('#hubStats [data-k]'), function (b) {
          var n = v[b.getAttribute('data-k')];
          if (n == null || isNaN(n)) b.parentNode.remove(); else b.textContent = Number(n).toLocaleString('en-US');
        });
      })
      .catch(function () { var s = $('hubStats'); if (s) s.closest('section').remove(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
