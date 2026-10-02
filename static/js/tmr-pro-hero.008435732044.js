/* TMR Pro hero live panel (2026-10-02). Reads the same live Watchdog numbers as the Watchdog module below
   (GET /api/pro/watchdog/stats). Nothing is typed into the page: if the call fails the panel hides. */
(function () {
  var panel = document.getElementById('pxhPanel');
  if (!panel) return;
  var api = 'https://trustmyrecord-api.onrender.com/api';
  try { if (window.TMR_SESSION && window.TMR_SESSION.api) api = window.TMR_SESSION.api; } catch (e) {}
  function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
  function ago(iso) {
    var t = Date.parse(iso); if (!t) return 'recently';
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60); return h + (h === 1 ? ' hour ago' : ' hours ago');
  }
  function count(el, to) {
    var start = null, from = 0, dur = 900;
    function step(ts) {
      if (start === null) start = ts;
      var k = Math.min(1, (ts - start) / dur), v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      el.textContent = fmt(v);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  fetch(api + '/pro/watchdog/stats', { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error(r.status); return r.json();
  }).then(function (d) {
    var src = d.sources || [];
    var vals = {
      accounts: d.accounts != null ? d.accounts : src.reduce(function (a, s) { return a + (s.accounts || 0); }, 0),
      graded_picks: d.graded_picks != null ? d.graded_picks : src.reduce(function (a, s) { return a + (s.graded_picks || 0); }, 0),
      pending_picks: d.pending_picks != null ? d.pending_picks : src.reduce(function (a, s) { return a + (s.pending_picks || 0); }, 0),
      platforms: d.platforms != null ? d.platforms : src.length
    };
    if (!vals.accounts) throw new Error('empty');
    panel.querySelectorAll('[data-pxh]').forEach(function (el) {
      var v = vals[el.getAttribute('data-pxh')];
      if (v == null) return;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) el.textContent = fmt(v);
      else count(el, v);
    });
    panel.querySelectorAll('[data-pxh-ago]').forEach(function (el) { el.textContent = ago(d[el.getAttribute('data-pxh-ago')]); });
    panel.classList.add('is-live');
  }).catch(function () { panel.hidden = true; });
})();
