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

  fetch('/forum/', { headers: { Accept: 'text/html' }, credentials: 'same-origin' })
    .then(function (r) {
      if (!r.ok) throw new Error('shell HTTP ' + r.status);
      return r.text();
    })
    .then(function (html) {
      // Only swap if this really is the forum app shell.
      if (html.indexOf('showThreadsList') < 0 || html.indexOf('viewThreads') < 0) {
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
      // Baked page stays; log for diagnostics only.
      if (window.console && console.warn) console.warn('cat hydrate skipped:', err && err.message);
    });
})();
