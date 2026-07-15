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

  // ---- snapshot the baked SEO head before it is destroyed ----
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
    h1: (function () {
      var h = document.querySelector('h1');
      return h ? (h.textContent || '').trim() : '';
    }()),
    ld: ldNode ? ldNode.textContent : null
  };

  fetch('/forum/', { headers: { Accept: 'text/html' }, credentials: 'same-origin' })
    .then(function (r) {
      if (!r.ok) throw new Error('shell HTTP ' + r.status);
      return r.text();
    })
    .then(function (html) {
      // Sanity: only swap if this really is the forum app shell. If /forum/ ever
      // changes shape, keep the baked page rather than blanking the screen.
      if (html.indexOf('viewThread') < 0 || html.indexOf('showThreadDetail') < 0) {
        throw new Error('unexpected shell payload');
      }

      var head = '<script>' +
        'window.__TMR_FORUM_THREAD_ID=' + safeJson(tid) + ';' +
        'window.__TMR_FORUM_THREAD_SLUG=' + safeJson(window.__TMR_FORUM_THREAD_SLUG || '') + ';' +
        'window.__TMR_FORUM_SEO=' + safeJson(seo) + ';' +
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
      /* Baked static thread remains on screen. Nothing to do. */
    });
}());
