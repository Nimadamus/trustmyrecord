/* TrustMyRecord analytics loader (GA4 G-V5MCVXS2HE)
   Loads gtag once, then wires page-level engagement + simulator events.
   Safe to include on any page: it no-ops if gtag is already present. */
(function () {
  var GA_ID = 'G-V5MCVXS2HE';

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function () { window.dataLayer.push(arguments); };
  }

  if (!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
  }

  function track(name, params) {
    try { window.gtag('event', name, params || {}); } catch (e) {}
  }
  window.tmrTrack = track;

  /* ---- time-on-page milestones (visible time only) ---- */
  var visibleMs = 0, last = Date.now(), fired = {};
  var MARKS = [15, 30, 60, 120, 300, 600];
  function tick() {
    var now = Date.now();
    if (document.visibilityState === 'visible') visibleMs += now - last;
    last = now;
    var secs = Math.round(visibleMs / 1000);
    for (var i = 0; i < MARKS.length; i++) {
      if (secs >= MARKS[i] && !fired[MARKS[i]]) {
        fired[MARKS[i]] = true;
        track('time_on_page', { seconds: MARKS[i], page_path: location.pathname });
      }
    }
  }
  setInterval(tick, 5000);
  document.addEventListener('visibilitychange', tick);

  /* ---- scroll depth ---- */
  var depths = [25, 50, 75, 90], hitDepth = {};
  window.addEventListener('scroll', function () {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (h <= 0) return;
    var pct = Math.round((window.scrollY / h) * 100);
    for (var i = 0; i < depths.length; i++) {
      if (pct >= depths[i] && !hitDepth[depths[i]]) {
        hitDepth[depths[i]] = true;
        track('scroll_depth', { percent: depths[i], page_path: location.pathname });
      }
    }
  }, { passive: true });

  /* ---- simulator interactions (delegated; harmless on other pages) ---- */
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('button, a') : null;
    if (!t) return;
    var id = t.id || '';
    if (id === 'runSimulationButton' || id === 'runSeasonSimulationButton') {
      var active = document.querySelector('button[data-mode].active');
      track('sim_run', {
        simulator: location.pathname.replace(/\//g, '') || 'unknown',
        mode: active ? active.getAttribute('data-mode') : 'default'
      });
    } else if (t.hasAttribute && t.hasAttribute('data-mode')) {
      track('sim_mode_change', { mode: t.getAttribute('data-mode') });
    } else if (id === 'copyBoxScoreButton' || id === 'saveBoxScoreButton') {
      track('sim_boxscore_action', { action: id === 'copyBoxScoreButton' ? 'copy' : 'save' });
    }
  }, true);
})();
