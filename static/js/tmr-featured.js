/* TMR FEATURED MATCHUPS, browser half. FEATURED_SOURCE_OF_TRUTH_20260914.
 *
 * data/featured-matchups.json is the only place a featured article is named.
 * scripts/featured_matchups.py bakes every door, hub card and sportsbook strip
 * from it; this file runs the SAME resolution rule against the same JSON when
 * the page loads, so a page baked hours before kickoff still retires a finished
 * game and hands over to the next designated one on time, without a rebuild.
 *
 * resolve() must stay line for line equal to resolve() in featured_matchups.py.
 * tests/featured-matchups-sync-test.js runs both over the same fixtures.
 *
 * Surfaces:
 *   [data-tmr-featured-door]  a stable door: forwards to the active article,
 *                             or to the sport hub when nothing is featured.
 *   [data-tmr-featured]       a card or strip: filled from the active entry,
 *                             hidden when nothing is featured.
 * Text is set with textContent, never innerHTML.
 */
(function (w, d) {
  'use strict';

  var REGISTRY = '/data/featured-matchups.json';
  var DEFAULT_GRACE_MINUTES = 210;
  var pending = null;

  function t(value) {
    if (!value || typeof value !== 'string') return null;
    /* An offset is required, exactly as in Python: a bare local time would
       parse in the reader's own zone here and be rejected there. */
    if (!/(Z|[+-]\d\d:\d\d)$/.test(value.trim())) return null;
    var n = Date.parse(value.trim());
    return isNaN(n) ? null : n;
  }

  function resolve(reg, sport, now) {
    var s = reg && reg.sports && reg.sports[sport];
    if (!s) return null;
    var grace = (reg.grace_minutes == null ? DEFAULT_GRACE_MINUTES : Number(reg.grace_minutes)) * 60000;
    var best = null, bestK = null;
    var list = s.features || [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!f || typeof f !== 'object' || (f.status || 'active') !== 'active') continue;
      if (!f.href) continue;
      var k = t(f.kickoff_utc);
      if (k === null) continue;
      if (f.start_utc) {
        var st = t(f.start_utc);
        if (st === null || now < st) continue;
      }
      if (now >= k + grace) continue;
      if (best === null || k < bestK) { best = f; bestK = k; }
    }
    return best;
  }

  function load(cb) {
    if (!pending) {
      pending = [];
      var done = function (reg) {
        var q = pending; pending = null;
        for (var i = 0; i < q.length; i++) q[i](reg);
      };
      var bucket = Math.floor(Date.now() / 60000);
      if (!w.fetch) { pending.push(cb); done(null); return; }
      w.fetch(REGISTRY + '?b=' + bucket, { credentials: 'omit', cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (reg) { done(reg && reg.sports ? reg : null); })
        .catch(function () { done(null); });
    }
    pending.push(cb);
  }

  function safeHref(href) {
    return typeof href === 'string' && /^\/[^\/]/.test(href) ? href : null;
  }

  function door(el) {
    if (!el) return;
    var sport = el.getAttribute('data-tmr-featured-door');
    var baked = el.getAttribute('data-baked-href');
    var bakedKick = t(el.getAttribute('data-baked-kickoff'));
    var hub = el.getAttribute('data-hub') || '/';
    var gone = false;
    function go(url) {
      if (gone) return;
      gone = true;
      if (url && url !== w.location.pathname) w.location.replace(url);
    }
    /* The registry could not be read in time. Trust the bake, unless the bake
       itself names a game that has already finished. */
    function fallback() {
      if (!baked) return;   // baked with nothing featured: this page is the answer
      if (bakedKick !== null && Date.now() >= bakedKick + DEFAULT_GRACE_MINUTES * 60000) go(hub);
      else go(baked);
    }
    var timer = setTimeout(fallback, 2500);
    load(function (reg) {
      clearTimeout(timer);
      if (!reg) return fallback();
      var f = resolve(reg, sport, Date.now());
      /* Nothing featured: a door baked empty stays put (it already links the
         hub); a door baked with a game that has since finished goes to the hub. */
      if (f) go(safeHref(f.href));
      else if (baked) go(safeHref(reg.sports[sport] && reg.sports[sport].hub) || hub);
    });
  }

  function fill(el, f) {
    var link = el.hasAttribute('data-feat-link') ? el : el.querySelector('[data-feat-link]');
    if (link) link.setAttribute('href', f.href);
    var nodes = el.querySelectorAll('[data-feat]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-feat');
      var v = key === 'matchup_when'
        ? [f.matchup, f.when].filter(Boolean).join(' · ')
        : (f[key] == null ? '' : String(f[key]));
      if (nodes[i].textContent !== v) nodes[i].textContent = v;
    }
    var imgs = el.querySelectorAll('[data-feat-img]');
    for (var j = 0; j < imgs.length; j++) {
      var src = f[imgs[j].getAttribute('data-feat-img')];
      if (src) { imgs[j].setAttribute('src', src); imgs[j].hidden = false; }
      else imgs[j].hidden = true;
    }
    if (link && (el.getAttribute('data-tmr-featured-role') === 'strip')) {
      link.setAttribute('aria-label', [f.label, f.matchup, f.when].filter(Boolean).join('. '));
    }
  }

  function bindAll(reg) {
    if (!reg) return;   // unreadable registry: leave the baked surface as it is
    var els = d.querySelectorAll('[data-tmr-featured]');
    var now = Date.now();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var f = resolve(reg, el.getAttribute('data-tmr-featured'), now);
      var href = f && safeHref(f.href);
      if (!href) { el.hidden = true; continue; }
      fill(el, f);
      el.hidden = false;
    }
  }

  function refresh() { load(bindAll); }

  w.TMRFeatured = { resolve: resolve, load: load, door: door, refresh: refresh };

  if (d.querySelector && d.querySelectorAll) {
    var start = function () {
      if (!d.querySelector('[data-tmr-featured]')) return;
      refresh();
      /* A tab left open across the end of a broadcast retires the game too. */
      setInterval(refresh, 60000);
    };
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(window, document);
