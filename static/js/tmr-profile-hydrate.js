/* tmr-profile-hydrate.js
 * Progressive enhancement for static /u/<username>/ pages.
 * The baked HTML is the durable, crawler-visible source of truth; this only
 * refreshes the visible summary numbers for JS users so the page stays live.
 * It does NOT touch robots/canonical (those are static and correct).
 */
(function () {
  var un = window.__TMR_PROFILE_USERNAME;
  if (!un) return;
  var API = (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) ||
            'https://trustmyrecord-api.onrender.com/api';
  function n(v, d) { var x = Number(v); return isNaN(x) ? (d || 0) : x; }
  function units(v) { v = n(v); return (v > 0 ? '+' : '') + v.toFixed(2) + 'u'; }
  fetch(API + '/users/' + encodeURIComponent(un))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j) return;
      var d = j.user || j;
      var box = document.getElementById('uStats');
      if (!box) return;
      var w = n(d.wins), l = n(d.losses), p = n(d.pushes);
      var rec = w + '-' + l + (p ? '-' + p : '');
      var vals = [
        rec, units(d.net_units), n(d.roi).toFixed(2) + '%',
        n(d.win_rate).toFixed(1) + '%', String(n(d.total_picks)),
        String(n(d.current_streak))
      ];
      var stats = box.querySelectorAll('.u-stat b');
      for (var i = 0; i < stats.length && i < vals.length; i++) {
        stats[i].textContent = vals[i];
      }
    })
    .catch(function () { /* keep baked values on failure */ });
})();
