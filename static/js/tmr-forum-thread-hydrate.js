/* tmr-forum-thread-hydrate.js
 * Progressive enhancement for static /forum/thread/<id>/<slug>/ pages.
 *
 * The baked page (scripts/build_forum_threads.py) is the crawler / no-JS view:
 * real title, H1, opening post, replies, authors, timestamps, DiscussionForumPosting
 * schema, self-canonical. For JS visitors this loads the real interactive /forum/
 * app IN PLACE at the clean URL, so replies, likes, follow, moderation and the
 * composer all behave exactly as they do at /forum/?thread=<id>.
 *
 * Same pattern as /u/ + tmr-profile-hydrate.js: fetch the app shell, inject the
 * identity the router should boot into, document.write it.
 *
 * CRITICAL — SEO head carry-over. /forum/ hardcodes
 *   <link rel="canonical" href="https://trustmyrecord.com/forum/">
 * plus the generic forum <title> and <h1>. document.write()ing that shell would
 * hand Googlebot (which renders JS) canonical=/forum/ on every thread URL and
 * collapse all threads back into one page -- the exact defect these pages exist
 * to fix. So we snapshot the baked page's canonical/title/robots/JSON-LD BEFORE
 * the swap and re-apply them to the shell's head afterwards.
 *
 * Fails safe: if anything goes wrong the baked static thread stays on screen.
 */
(function () {
  var tid = window.__TMR_FORUM_THREAD_ID;
  if (!tid) return;

  // Escape so the payload can never terminate the injected <script> element.
  function safeJson(v) {
    return JSON.stringify(v).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');
  }

  // Debug hatch: ?static=1 keeps the baked page (used to inspect crawler view).
  try {
    if (new URLSearchParams(window.location.search).get('static') === '1') return;
  } catch (e) { /* no URLSearchParams -> continue */ }

  /* FLASH-OF-BAKED-CONTENT FIX (2026-07-29, same pattern as
     tmr-profile-hydrate.js): this script is `defer`, so without this the baked
     SEO snapshot painted first and was then wholesale-replaced by the live
     /forum/ app — a visible stale-then-correct swap. Hiding the baked body
     before first paint turns that into a brief blank/loading beat. Revealed
     only on the fallback paths; the success path replaces the document. */
  var HIDE_STYLE_ID = 'tmr-forum-boot-hide';
  function hideBaked() {
    if (document.getElementById(HIDE_STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = HIDE_STYLE_ID;
    st.textContent = 'body>*:not(script){visibility:hidden !important;}';
    document.head.appendChild(st);
  }
  function revealBaked() {
    var st = document.getElementById(HIDE_STYLE_ID);
    if (st && st.parentNode) st.parentNode.removeChild(st);
  }
  hideBaked();
  // Fail-safe: never leave visitors staring at a hidden page if the shell
  // fetch hangs — after 6s the baked page shows.
  setTimeout(revealBaked, 6000);

  // ---- snapshot the baked SEO head before it is destroyed ----
  function attr(sel, name) {
    var el = document.querySelector(sel);
    return el ? el.getAttribute(name) : null;
  }
  /* CLS_RESERVE_20260912: the shell's #postsContainer starts as a one-line
     "Loading..." placeholder and then grows to the full thread -- 165px to 4,444px
     on a 390px viewport. Everything below it moves, which is measured as CLS 0.93
     on mobile, the worst Core Web Vitals number on the site.
     This baked page has the SAME posts laid out at the SAME viewport width right
     now, so its own content height is the best available estimate of what the shell
     is about to render. Measure it before the swap and hand it over, so the space is
     reserved instead of appearing underneath the reader. Estimate only -- the shell
     clears it once the real content is at least that tall. */
  var reservePx = 0;
  try {
    var postNodes = document.querySelectorAll('article.ft-post, .ft-post');
    for (var pi = 0; pi < postNodes.length; pi++) {
      reservePx += Math.round(postNodes[pi].getBoundingClientRect().height);
    }
    // TUNING, and the mistake in it: I first widened this to
    // max(sum of baked posts, <main>) on the theory that the sum reads low
    // because the shell adds chrome the crawler view lacks. Measured on a 390px
    // viewport that produced 4,866px against a real 4,235px of rendered posts --
    // 631px of reserved blank space, 75% of the viewport, that never released
    // because the content never reached it. The tighter estimate measured better
    // on BOTH counts: CLS 0.126 and no gap. Under-reserving costs a small
    // residual shift; over-reserving costs a visible hole. Take the small shift.
    // Never reserve something absurd if the measurement goes wrong.
    if (!(reservePx > 0) || reservePx > 20000) reservePx = 0;
  } catch (e) { reservePx = 0; }

  var ldNode = document.querySelector('script[type="application/ld+json"]');
  var seo = {
    canonical: attr('link[rel=canonical]', 'href'),
    robots: attr('meta[name=robots]', 'content') || 'index, follow',
    title: document.title,
    desc: attr('meta[name=description]', 'content'),
    h1: (function () {
      var h = document.querySelector('h1');
      return h ? (h.textContent || '').trim() : '';
    }()),
    ld: ldNode ? ldNode.textContent : null
  };

  /* PERF_SHELL_SPLIT_20260911: the /forum/ shell no longer carries its CSS and JS
     inline -- they are two cacheable files now. In this document.write() path the
     shell's own <link rel=preload> is useless, because it is not discovered until
     the shell has already been written and parsed, which is the same moment the
     real tags are found. So kick both fetches off HERE, in parallel with the shell
     fetch, and by the time the shell is parsed they are in flight or already in
     cache. The ?v= tags are content hashes; scripts/version_static_refs.py repins
     references inside .js sources, so these stay correct automatically. */
  try {
    [['/static/js/tmr-forum-app.js?v=953cfac11dc4', 'script'],
     ['/static/css/tmr-forum-app.css?v=2403843992ed', 'style']].forEach(function (a) {
      var l = document.createElement('link');
      l.rel = 'preload'; l.as = a[1]; l.href = a[0];
      document.head.appendChild(l);
    });
  } catch (e) { /* preload is an optimisation only; never block the swap */ }

  fetch('/forum/', { headers: { Accept: 'text/html' }, credentials: 'same-origin' })
    .then(function (r) {
      if (!r.ok) throw new Error('shell HTTP ' + r.status);
      return r.text();
    })
    .then(function (html) {
      // Sanity: only swap if this really is the forum app shell. If /forum/ ever
      // changes shape, keep the baked page rather than blanking the screen.
      // PERF_SHELL_SPLIT_20260911: this used to look for function NAMES
      // (showThreadDetail / showThreadsList), which only worked while the whole
      // app was inline in the shell. The app now lives in tmr-forum-app.js, so the
      // markers are the shell's own view container plus the script tag that pulls
      // the app in -- both of which are what actually has to be present for the
      // swap to produce a working page.
      if (html.indexOf('id="viewThread"') < 0 || html.indexOf('/static/js/tmr-forum-app.js?v=953cfac11dc4') < 0) {
        throw new Error('unexpected shell payload');
      }

      var head = '<script>' +
        'window.__TMR_FORUM_THREAD_ID=' + safeJson(tid) + ';' +
        'window.__TMR_FORUM_THREAD_SLUG=' + safeJson(window.__TMR_FORUM_THREAD_SLUG || '') + ';' +
        'window.__TMR_FORUM_SEO=' + safeJson(seo) + ';' +
        'window.__TMR_FORUM_RESERVE_PX=' + safeJson(reservePx) + ';' +
        '<\/script>';

      // Runs at the END of the shell's <head>, so the shell's own canonical/title
      // have already been parsed and can be overwritten with this thread's values.
      var restore = '<script>(function(){var s=window.__TMR_FORUM_SEO;if(!s)return;' +
        'function meta(n,v){if(!v)return;var m=document.querySelector(\'meta[name="\'+n+\'"]\');' +
        'if(!m){m=document.createElement("meta");m.setAttribute("name",n);document.head.appendChild(m);}' +
        'm.setAttribute("content",v);}' +
        'if(s.title)document.title=s.title;' +
        'var c=document.querySelector("link[rel=canonical]");' +
        'if(!c){c=document.createElement("link");c.setAttribute("rel","canonical");document.head.appendChild(c);}' +
        'if(s.canonical)c.setAttribute("href",s.canonical);' +
        'meta("robots",s.robots);meta("description",s.desc);' +
        // Drop the shell's own /forum/ BreadcrumbList: on a thread URL it would
        // compete with this thread's more specific Forums > Category > Thread trail.
        'if(s.ld){var old=document.head.querySelectorAll(\'script[type="application/ld+json"]\');' +
        'for(var i=0;i<old.length;i++)old[i].parentNode.removeChild(old[i]);' +
        'var j=document.createElement("script");j.type="application/ld+json";' +
        'j.textContent=s.ld;document.head.appendChild(j);}' +
        '}());<\/script>';

      html = html.replace(/<head>/i, '<head>' + head);
      if (/<\/head>/i.test(html)) {
        html = html.replace(/<\/head>/i, restore + '</head>');
      } else {
        html += restore;
      }

      document.open();
      document.write(html);
      document.close();

      // The shell's single <h1> is the generic forum title. On a clean thread URL
      // the page IS the thread, so the visible H1 should say so. Runs after the
      // app's own DOMContentLoaded work settles.
      try {
        var setH1 = function () {
          var h = document.getElementById('forumPageTitle');
          if (h && seo.h1) h.textContent = seo.h1;
        };
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', setH1);
        } else {
          setH1();
        }
        setTimeout(setH1, 1200);
      } catch (e) { /* non-fatal */ }
    })
    .catch(function () {
      /* Baked static thread remains on screen. */
      revealBaked();
    });
}());
