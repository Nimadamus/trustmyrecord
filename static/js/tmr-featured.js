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
 *   [data-tmr-featured-door]  a stable door: forwards to the live article, or
 *                             to the latest one when nothing is live. Never a
 *                             placeholder page.
 *   [data-tmr-featured]       a card or strip: filled from the same entry.
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

  function graceMinutes(reg, sport) {
    var s = reg && reg.sports && reg.sports[sport];
    if (s && s.grace_minutes != null) return Number(s.grace_minutes);
    return reg && reg.grace_minutes != null ? Number(reg.grace_minutes) : DEFAULT_GRACE_MINUTES;
  }

  /* Earliest live game across every sport, for the all sports surfaces. */
  function resolveAny(reg, now) {
    var best = null, bestK = null, sports = Object.keys((reg && reg.sports) || {}).sort();
    var i, f;
    for (i = 0; i < sports.length; i++) {
      f = resolveLive(reg, sports[i], now);
      if (f && (best === null || t(f.kickoff_utc) < bestK)) { best = f; bestK = t(f.kickoff_utc); }
    }
    if (best !== null) return best;
    for (i = 0; i < sports.length; i++) {
      f = resolveLatest(reg, sports[i], now);
      if (f && (best === null || t(f.kickoff_utc) > bestK)) { best = f; bestK = t(f.kickoff_utc); }
    }
    return best;
  }

  /* Live entry, else the latest published one: a door never lands on a
     placeholder. Same as resolve() in featured_matchups.py. */
  function resolve(reg, sport, now) {
    if (sport === '*') return resolveAny(reg, now);
    return resolveLive(reg, sport, now) || resolveLatest(reg, sport, now);
  }

  function resolveLatest(reg, sport, now) {
    var s = reg && reg.sports && reg.sports[sport];
    if (!s) return null;
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
      if (best === null || k > bestK) { best = f; bestK = k; }
    }
    return best;
  }

  function resolveLive(reg, sport, now) {
    var s = reg && reg.sports && reg.sports[sport];
    if (!s) return null;
    var grace = graceMinutes(reg, sport) * 60000;
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
    var hub = el.getAttribute('data-hub') || '/';
    var gone = false;
    function go(url) {
      if (gone) return;
      gone = true;
      if (url && url !== w.location.pathname) w.location.replace(url);
    }
    /* The registry could not be read in time: trust the bake. A finished game
       is still the latest article, which beats any placeholder. */
    function fallback() { go(safeHref(baked) || hub); }
    var timer = setTimeout(fallback, 2500);
    load(function (reg) {
      clearTimeout(timer);
      if (!reg) return fallback();
      var f = resolve(reg, sport, Date.now());
      go((f && safeHref(f.href)) || safeHref(baked) || hub);
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

  /* Any baked element that names the moment its game ends (data-tmr-expires)
     is removed from view at that moment, registry or not. Used for cards baked
     from a Game File, such as the Matchup of the Day section's lead card. */
  function expire() {
    var els = d.querySelectorAll('[data-tmr-expires]'), now = Date.now();
    for (var i = 0; i < els.length; i++) {
      var x = t(els[i].getAttribute('data-tmr-expires'));
      if (x !== null && now >= x) els[i].hidden = true;
    }
  }

  function refresh() { expire(); load(bindAll); }

  w.TMRFeatured = { resolve: resolve, resolveLive: resolveLive, resolveLatest: resolveLatest, resolveAny: resolveAny, load: load, door: door, refresh: refresh };

  if (d.querySelector && d.querySelectorAll) {
    var start = function () {
      if (!d.querySelector('[data-tmr-featured],[data-tmr-expires]')) return;
      refresh();
      /* A tab left open across the end of a broadcast retires the game too. */
      setInterval(refresh, 60000);
    };
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(window, document);
