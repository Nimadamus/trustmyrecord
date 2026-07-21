/* ============================================================
   SHARE_SYSTEM_PHASE1_20260721 - sitewide share menu.

   One component for every shareable thing on TrustMyRecord: profiles, verified
   records, individual picks, graded results, forum threads, forum posts,
   leaderboard entries and contest standings.

   Usage - declarative (preferred):
     <button data-tmr-share
             data-share-type="profile"      profile | pick | thread | post | page
             data-share-id="BetLegend"
             data-share-url="https://trustmyrecord.com/u/BetLegend/"
             data-share-title="..."         optional, overrides the API title
             data-share-text="...">Share</button>

   Usage - imperative:
     TMRShare.open({ type:'pick', id:2893, url:'...', title:'...', text:'...' });

   Copy that appears in the menu is fetched from /api/share/meta/<type>/<id>,
   which reads the live ledger. The component NEVER composes a record, a result
   or a streak on its own - if the API cannot be reached it falls back to the
   page's own <title> / og:description and shares the link alone rather than
   risk publishing a number that is not real.
   ============================================================ */
(function () {
  'use strict';

  // /u/ and /forum/thread/ pages hydrate by document.write()-ing the real app
  // shell over themselves. The implicit document.open() that triggers KEEPS the
  // Document object identity but REMOVES every listener registered on it, and
  // `window` survives, so this file runs a second time with window.TMRShare
  // already defined and zero delegation attached. Returning early there left
  // every in-app share button dead; identity checks cannot detect it either.
  // Always re-bind. addEventListener de-duplicates identical
  // (type, listener, capture) triples, so binding twice is a no-op.
  if (window.TMRShare && typeof window.TMRShare.__bind === 'function') {
    window.TMRShare.__bind();
    return;
  }

  var API_BASE = (function () {
    try {
      if (typeof CONFIG !== 'undefined' && CONFIG.api && CONFIG.api.baseUrl) return CONFIG.api.baseUrl;
    } catch (e) {}
    return 'https://trustmyrecord-api.onrender.com/api';
  }());

  var SITE = 'https://trustmyrecord.com';

  // ---------------------------------------------------------
  // helpers
  // ---------------------------------------------------------
  function track(event, params) {
    try {
      if (window.TMRAnalytics && typeof window.TMRAnalytics.track === 'function') {
        window.TMRAnalytics.track(event, params || {});
      }
    } catch (e) {}
  }

  function absolute(url) {
    if (!url) return location.href;
    if (/^https?:\/\//i.test(url)) return url;
    return SITE + (url.charAt(0) === '/' ? '' : '/') + url;
  }

  // Referral parameters go on the OUTBOUND link only. The page's own
  // <link rel="canonical"> stays clean, so indexing is never split across
  // tagged copies of the same URL.
  function tagged(url, platform, type, id) {
    try {
      var u = new URL(absolute(url));
      u.searchParams.set('utm_source', platform);
      u.searchParams.set('utm_medium', 'social_share');
      u.searchParams.set('utm_campaign', 'tmr_share');
      if (type) u.searchParams.set('utm_content', id ? type + '_' + id : type);
      return u.toString();
    } catch (e) {
      return absolute(url);
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function metaContent(sel) {
    var el = document.querySelector(sel);
    return el ? (el.getAttribute('content') || '').trim() : '';
  }

  // ---------------------------------------------------------
  // icons (inline so the menu needs no icon font and no network)
  // ---------------------------------------------------------
  var ICONS = {
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.1c-.8 0-1.5.3-2 .8l-7.1-4.2c.1-.2.1-.5.1-.7s0-.5-.1-.7L16 7.1c.5.5 1.2.8 2 .8 1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 .2 0 .5.1.7L8 9.8c-.5-.5-1.2-.8-2-.8-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2-.8l7.1 4.2c-.1.2-.1.4-.1.7 0 1.6 1.3 2.9 2.9 2.9s2.9-1.3 2.9-2.9-1.2-3-2.8-3z"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 3h3.2l-7 8 8.2 10.9h-6.4l-5-6.6-5.8 6.6H1.5l7.5-8.6L1.1 3h6.6l4.6 6.1L17.5 3zm-1.1 17h1.8L7.7 4.8H5.8L16.4 20z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z"/></svg>',
    reddit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12a2.1 2.1 0 0 0-3.6-1.5 10.3 10.3 0 0 0-5.3-1.7l.9-4.2 2.9.6a1.7 1.7 0 1 0 .2-1.3l-3.6-.8a.6.6 0 0 0-.7.5l-1.1 5.2a10.4 10.4 0 0 0-5.4 1.7A2.1 2.1 0 1 0 3.6 14a4 4 0 0 0 0 .6c0 3.1 3.7 5.6 8.3 5.6s8.3-2.5 8.3-5.6a4 4 0 0 0 0-.6A2.1 2.1 0 0 0 22 12zM7.7 13.5a1.4 1.4 0 1 1 1.4 1.4 1.4 1.4 0 0 1-1.4-1.4zm7.9 3.9a5.6 5.6 0 0 1-3.6 1.1 5.6 5.6 0 0 1-3.6-1.1.5.5 0 0 1 .7-.7 4.7 4.7 0 0 0 2.9.8 4.7 4.7 0 0 0 2.9-.8.5.5 0 1 1 .7.7zm-.7-2.5a1.4 1.4 0 1 1 1.4-1.4 1.4 1.4 0 0 1-1.4 1.4z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 3H3.6A.6.6 0 0 0 3 3.6v16.8a.6.6 0 0 0 .6.6h16.8a.6.6 0 0 0 .6-.6V3.6a.6.6 0 0 0-.6-.6zM8.3 18.3H5.6V9.7h2.7v8.6zM7 8.5a1.6 1.6 0 1 1 1.5-1.6A1.6 1.6 0 0 1 7 8.5zm11.4 9.8h-2.7v-4.2c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2v4.3H9.9V9.7h2.6v1.2a2.9 2.9 0 0 1 2.6-1.4c2.8 0 3.3 1.8 3.3 4.2v4.6z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a9.9 9.9 0 0 0-8.5 15L2 22l5.2-1.4A9.9 9.9 0 1 0 12 2zm0 18.1a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.1zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8s-.4-.1-.5.1-.6.8-.7 1-.3.2-.5.1a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.4-1.7c-.1-.3 0-.4.1-.5l.4-.4.2-.4v-.4c0-.1-.5-1.3-.7-1.8s-.4-.4-.5-.4H8.3a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4 5.2 5.2 0 0 0 3.2.7 2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.9 4.3 18.8 19c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.9 12.8 2.1 11.3c-1-.3-1-1 .2-1.5l18.3-7c.9-.3 1.6.2 1.3 1.5z"/></svg>',
    email: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4.2-8 5-8-5V6l8 5 8-5z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z"/></svg>',
    device: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 8 6h3v9h2V6h3l-4-4zM5 10v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10h-2v10H7V10H5z"/></svg>'
  };

  // ---------------------------------------------------------
  // intent builders
  // ---------------------------------------------------------
  var TARGETS = [
    {
      key: 'x', label: 'X', icon: ICONS.x,
      href: function (s) { return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(s.text) + '&url=' + encodeURIComponent(tagged(s.url, 'x', s.type, s.id)); }
    },
    {
      key: 'facebook', label: 'Facebook', icon: ICONS.facebook,
      href: function (s) { return 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(tagged(s.url, 'facebook', s.type, s.id)); }
    },
    {
      key: 'reddit', label: 'Reddit', icon: ICONS.reddit,
      href: function (s) { return 'https://www.reddit.com/submit?url=' + encodeURIComponent(tagged(s.url, 'reddit', s.type, s.id)) + '&title=' + encodeURIComponent(s.title); }
    },
    {
      key: 'linkedin', label: 'LinkedIn', icon: ICONS.linkedin,
      href: function (s) { return 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(tagged(s.url, 'linkedin', s.type, s.id)); }
    },
    {
      key: 'whatsapp', label: 'WhatsApp', icon: ICONS.whatsapp,
      href: function (s) { return 'https://api.whatsapp.com/send?text=' + encodeURIComponent(s.text + ' ' + tagged(s.url, 'whatsapp', s.type, s.id)); }
    },
    {
      key: 'telegram', label: 'Telegram', icon: ICONS.telegram,
      href: function (s) { return 'https://t.me/share/url?url=' + encodeURIComponent(tagged(s.url, 'telegram', s.type, s.id)) + '&text=' + encodeURIComponent(s.text); }
    },
    {
      key: 'email', label: 'Email', icon: ICONS.email,
      href: function (s) { return 'mailto:?subject=' + encodeURIComponent(s.title) + '&body=' + encodeURIComponent(s.text + '\n\n' + tagged(s.url, 'email', s.type, s.id)); }
    }
  ];

  // ---------------------------------------------------------
  // metadata resolution
  // ---------------------------------------------------------
  var metaCache = {};

  function fallbackShare(cfg) {
    var title = cfg.title || document.title || 'TrustMyRecord';
    var text = cfg.text || metaContent('meta[property="og:description"]') || metaContent('meta[name="description"]') || title;
    return {
      type: cfg.type || 'page',
      id: cfg.id || '',
      url: absolute(cfg.url || (document.querySelector('link[rel="canonical"]') || {}).href || location.href),
      title: title,
      text: text
    };
  }

  function resolveShare(cfg) {
    var base = fallbackShare(cfg);
    if (!cfg.type || !cfg.id || cfg.type === 'page') return Promise.resolve(base);
    var key = cfg.type + ':' + cfg.id;
    if (metaCache[key]) return Promise.resolve(Object.assign({}, base, metaCache[key]));

    return fetch(API_BASE + '/share/meta/' + encodeURIComponent(cfg.type) + '/' + encodeURIComponent(cfg.id), { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return base;
        var resolved = {
          // An explicit data-share-title/text on the trigger still wins: the
          // forum SPA knows the post it is looking at better than a generic
          // lookup does.
          title: cfg.title || d.title || base.title,
          text: cfg.text || d.description || base.text,
          url: absolute(cfg.url || d.url || base.url)
        };
        metaCache[key] = resolved;
        return Object.assign({}, base, resolved);
      })
      .catch(function () { return base; });
  }

  // ---------------------------------------------------------
  // menu
  // ---------------------------------------------------------
  var openState = null;

  function close() {
    if (!openState) return;
    var st = openState;
    openState = null;
    document.removeEventListener('keydown', st.onKey, true);
    if (st.overlay && st.overlay.parentNode) st.overlay.parentNode.removeChild(st.overlay);
    document.documentElement.style.overflow = st.prevOverflow || '';
    if (st.opener && typeof st.opener.focus === 'function') st.opener.focus();
  }

  function buildSheet(s) {
    var nativeRow = (typeof navigator !== 'undefined' && typeof navigator.share === 'function')
      ? '<button type="button" class="tmrsh-item tmrsh-item--wide" data-target="device">' + ICONS.device + '<span>Share via device</span></button>'
      : '';

    var items = TARGETS.map(function (t) {
      return '<a class="tmrsh-item" data-target="' + t.key + '" href="' + esc(t.href(s)) + '"' +
        (t.key === 'email' ? '' : ' target="_blank" rel="noopener noreferrer"') +
        ' aria-label="Share on ' + esc(t.label) + '">' + t.icon + '<span>' + esc(t.label) + '</span></a>';
    }).join('');

    return '<div class="tmrsh-sheet" role="dialog" aria-modal="true" aria-labelledby="tmrshTitle">' +
      '<div class="tmrsh-head">' +
        '<div class="tmrsh-title">' +
          '<div class="tmrsh-title-main" id="tmrshTitle">Share</div>' +
          '<div class="tmrsh-title-sub">' + esc(s.title) + '</div>' +
        '</div>' +
        '<button type="button" class="tmrsh-close" aria-label="Close share menu">&times;</button>' +
      '</div>' +
      '<div class="tmrsh-grid">' + nativeRow + items + '</div>' +
      '<div class="tmrsh-linkrow">' +
        '<input class="tmrsh-url" type="text" readonly value="' + esc(s.url) + '" aria-label="Shareable link">' +
        '<button type="button" class="tmrsh-copy">Copy</button>' +
      '</div>' +
      '<div class="tmrsh-sr" role="status" aria-live="polite"></div>' +
    '</div>';
  }

  function copyLink(s, sheet) {
    var input = sheet.querySelector('.tmrsh-url');
    var btn = sheet.querySelector('.tmrsh-copy');
    var live = sheet.querySelector('.tmrsh-sr');
    var url = tagged(s.url, 'copy_link', s.type, s.id);
    var done = function () {
      btn.textContent = 'Copied';
      btn.setAttribute('data-copied', '1');
      if (live) live.textContent = 'Link copied to clipboard';
      track('share_link_copied', { share_type: s.type, share_id: String(s.id || ''), share_url: s.url });
      setTimeout(function () { btn.textContent = 'Copy'; btn.removeAttribute('data-copied'); }, 2200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(function () {
        input.select(); document.execCommand('copy'); done();
      });
    } else {
      input.select(); document.execCommand('copy'); done();
    }
  }

  // Repoints an already-open sheet once the API returns richer copy. The menu
  // is never blocked on the network: it opens instantly with what the page
  // already knows, then upgrades in place.
  function applyShare(sheet, s) {
    var sub = sheet.querySelector('.tmrsh-title-sub');
    if (sub) sub.textContent = s.title;
    var input = sheet.querySelector('.tmrsh-url');
    if (input) input.value = s.url;
    TARGETS.forEach(function (t) {
      var el = sheet.querySelector('[data-target="' + t.key + '"]');
      if (el && el.tagName === 'A') el.href = t.href(s);
    });
  }

  function open(cfg) {
    cfg = cfg || {};
    close();

    var overlay = document.createElement('div');
    overlay.className = 'tmrsh-overlay';
    var opener = document.activeElement;

    (function () {
      var s = fallbackShare(cfg);
      overlay.innerHTML = buildSheet(s);
      var sheet = overlay.firstChild;

      // Live copy (real record, real result) replaces the page-derived
      // placeholder as soon as the ledger answers. `s` is mutated so the
      // handlers bound below always act on the newest values.
      resolveShare(cfg).then(function (resolved) {
        Object.keys(resolved).forEach(function (k) { s[k] = resolved[k]; });
        if (openState && openState.overlay === overlay) applyShare(sheet, s);
      });

      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
      sheet.querySelector('.tmrsh-close').addEventListener('click', close);
      sheet.querySelector('.tmrsh-copy').addEventListener('click', function () { copyLink(s, sheet); });
      sheet.querySelector('.tmrsh-url').addEventListener('focus', function () { this.select(); });

      Array.prototype.forEach.call(sheet.querySelectorAll('[data-target]'), function (el) {
        el.addEventListener('click', function (e) {
          var key = el.getAttribute('data-target');
          if (key === 'device') {
            e.preventDefault();
            navigator.share({ title: s.title, text: s.text, url: tagged(s.url, 'device_share', s.type, s.id) })
              .then(function () {
                track('share_platform_selected', { share_platform: 'device', share_type: s.type, share_id: String(s.id || '') });
                close();
              })
              .catch(function () { /* user dismissed the OS sheet - keep the menu open */ });
            return;
          }
          track('share_platform_selected', { share_platform: key, share_type: s.type, share_id: String(s.id || ''), share_url: s.url });
          close();
        });
      });

      // ---- keyboard: ESC closes, Tab is trapped inside the dialog ----
      var focusables = sheet.querySelectorAll('a[href], button, input');
      var onKey = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key !== 'Tab' || !focusables.length) return;
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      };
      document.addEventListener('keydown', onKey, true);

      openState = { overlay: overlay, onKey: onKey, opener: opener, prevOverflow: document.documentElement.style.overflow };
      document.documentElement.style.overflow = 'hidden';
      // In the DOM before focus() - an element outside the document cannot
      // take focus, which would leave a keyboard user stranded on the page
      // behind the dialog.
      document.body.appendChild(overlay);
      if (focusables.length) focusables[0].focus();

      track('share_menu_opened', { share_type: s.type, share_id: String(s.id || ''), share_url: s.url });
    }());
  }

  // ---------------------------------------------------------
  // declarative wiring
  // ---------------------------------------------------------
  function configFromEl(el) {
    return {
      type: el.getAttribute('data-share-type') || 'page',
      id: el.getAttribute('data-share-id') || '',
      url: el.getAttribute('data-share-url') || '',
      title: el.getAttribute('data-share-title') || '',
      text: el.getAttribute('data-share-text') || ''
    };
  }

  function onDocClick(e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-tmr-share]') : null;
    if (!el) return;
    e.preventDefault();
    open(configFromEl(el));
  }

  // Space/Enter on a non-button element carrying data-tmr-share.
  function onDocKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var el = e.target && e.target.closest ? e.target.closest('[data-tmr-share]') : null;
    if (!el || el.tagName === 'BUTTON' || el.tagName === 'A') return;
    e.preventDefault();
    open(configFromEl(el));
  }

  function bind() {
    // CAPTURE phase, deliberately. The forum app stops propagation on clicks
    // inside its own action rows, which would swallow a bubbling delegate and
    // leave every in-app share button dead. Capture only ever acts on elements
    // carrying our own data-tmr-share attribute, so it cannot pre-empt any
    // existing handler.
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onDocKey, true);
  }

  // ---------------------------------------------------------
  // markup helper for pages that build rows in JS
  // ---------------------------------------------------------
  function buttonHtml(cfg) {
    cfg = cfg || {};
    var compact = cfg.compact ? ' tmrsh-btn--icon' : '';
    var label = cfg.label || 'Share';
    return '<button type="button" class="tmrsh-btn' + compact + (cfg.className ? ' ' + esc(cfg.className) : '') + '" data-tmr-share' +
      ' data-share-type="' + esc(cfg.type || 'page') + '"' +
      ' data-share-id="' + esc(cfg.id || '') + '"' +
      (cfg.url ? ' data-share-url="' + esc(cfg.url) + '"' : '') +
      (cfg.title ? ' data-share-title="' + esc(cfg.title) + '"' : '') +
      (cfg.text ? ' data-share-text="' + esc(cfg.text) + '"' : '') +
      ' title="' + esc(cfg.tooltip || 'Share') + '"' +
      ' aria-label="' + esc(cfg.ariaLabel || label) + '">' +
      ICONS.share + (cfg.compact ? '' : '<span>' + esc(label) + '</span>') +
      '</button>';
  }

  // Records that a visitor arrived from a shared link, once per session, so the
  // share -> visit -> signup path is measurable without polluting the canonical
  // URL. The parameters are read, not required: a clean link still works.
  function trackArrival() {
    try {
      var p = new URLSearchParams(location.search);
      if (p.get('utm_campaign') !== 'tmr_share') return;
      var key = 'tmr_share_arrival_' + (p.get('utm_content') || 'page');
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      track('shared_page_visited', {
        share_platform: p.get('utm_source') || 'unknown',
        share_content: p.get('utm_content') || '',
        page_path: location.pathname
      });
    } catch (e) {}
  }

  window.TMRShare = { open: open, close: close, buttonHtml: buttonHtml, icons: ICONS, __bind: bind };
  bind();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackArrival);
  } else {
    trackArrival();
  }
}());
