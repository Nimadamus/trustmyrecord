/* tmr-forum-cat-hydrate.js
 * Progressive enhancement for static /forum/<category-slug>/ pages.
 *
 * The baked page (scripts/build_forum_threads.py, category section) is the
 * crawler / no-JS view: real category H1, description, thread list with real
 * links, CollectionPage schema, self-canonical. For JS visitors this loads the
 * interactive /forum/ app IN PLACE at the clean URL, booting straight into the
 * category's thread list (window.__TMR_FORUM_CAT_SLUG, read by the shell's
 * DOMContentLoaded boot).
 *
 * Same pattern as tmr-forum-thread-hydrate.js: fetch the app shell, inject the
 * identity the router should boot into, document.write it, then restore this
 * page's own canonical/title/robots/JSON-LD over the shell's generic /forum/
 * head so Googlebot's rendered view keeps the category's unique SEO identity.
 *
 * Fails safe: if anything goes wrong the baked static category page stays.
 */
(function () {
  var slug = window.__TMR_FORUM_CAT_SLUG;
  if (!slug) return;

  function safeJson(v) {
    return JSON.stringify(v).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');
  }

  // Debug hatch: ?static=1 keeps the baked page (crawler view inspection).
  try {
    if (new URLSearchParams(window.location.search).get('static') === '1') return;
  } catch (e) { /* continue */ }

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

  function attr(sel, name) {
    var el = document.querySelector(sel);
    return el ? el.getAttribute(name) : null;
  }
  var ldNode = document.querySelector('script[type="application/ld+json"]');
  var seo = {
    canonical: attr('link[rel=canonical]', 'href'),
    robots: attr('meta[name=robots]', 'content') || 'index, follow',
    title: document.title,
    desc: attr('meta[name=description]', 'content'),
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
    [['/static/js/tmr-forum-app.js?v=03aed4aa5842', 'script'],
     ['/static/css/tmr-forum-app.css?v=2403843992ed', 'style']].forEach(function (a) {
      var l = document.createElement('link');
      l.rel = 'preload'; l.as = a[1]; l.href = a[0];
      document.head.appendChild(l);
    });
  } catch (e) { /* preload is an optimisation only; never block the swap */ }

  /* CLS_FOOTER_CHURN_20260912: tell tmr-linkhub.js not to build a sitewide
     footer on this page. The shell that replaces it carries its own, and
     adding then removing one measured as a 0.335 layout shift on a 390px
     viewport. The catch() below lowers this again if the swap never happens,
     and linkhub's 1s reconcile loop then puts the footer back. */
  window.__TMRLH_SWAP_PENDING = true;

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
      if (html.indexOf('id="viewThreads"') < 0 || html.indexOf('/static/js/tmr-forum-app.js?v=03aed4aa5842') < 0) {
        throw new Error('unexpected shell payload');
      }

      var head = '<script>' +
        'window.__TMR_FORUM_CAT_SLUG=' + safeJson(slug) + ';' +
        'window.__TMR_FORUM_SEO=' + safeJson(seo) + ';' +
        '<\/script>';

      var restore = '<script>(function(){var s=window.__TMR_FORUM_SEO;if(!s)return;' +
        'function meta(n,v){if(!v)return;var m=document.querySelector(\'meta[name="\'+n+\'"]\');' +
        'if(!m){m=document.createElement("meta");m.setAttribute("name",n);document.head.appendChild(m);}' +
        'm.setAttribute("content",v);}' +
        'if(s.title)document.title=s.title;' +
        'var c=document.querySelector("link[rel=canonical]");' +
        'if(!c){c=document.createElement("link");c.setAttribute("rel","canonical");document.head.appendChild(c);}' +
        'if(s.canonical)c.setAttribute("href",s.canonical);' +
        'meta("robots",s.robots);meta("description",s.desc);' +
        'if(s.ld){var old=document.head.querySelectorAll(\'script[type="application/ld+json"]\');' +
        'for(var i=0;i<old.length;i++)old[i].parentNode.removeChild(old[i]);' +
        'var j=document.createElement("script");j.type="application/ld+json";' +
        'j.textContent=s.ld;document.head.appendChild(j);}' +
        '}());<\/script>';

      var out = html.replace(/<head([^>]*)>/i, '<head$1>' + head);
      out = out.replace(/<\/head>/i, restore + '</head>');
      document.open();
      document.write(out);
      document.close();
    })
    .catch(function (err) {
      /* Swap failed: the baked page is what the visitor gets, so it needs the
         sitewide footer after all. linkhub's reconcile loop picks this up. */
      window.__TMRLH_SWAP_PENDING = false;
      // Baked page stays; log for diagnostics only.
      revealBaked();
      if (window.console && console.warn) console.warn('cat hydrate skipped:', err && err.message);
    });
})();
