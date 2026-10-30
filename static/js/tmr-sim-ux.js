/* =============================================================================
   TMR SIM UX LAYER                                           SIM_UX_20261030
   -----------------------------------------------------------------------------
   Shared behaviour for every simulator page; styles in static/css/tmr-sim-ux.css.
   Injected by scripts/sim-ux.js (builders) and scripts/stamp-sim-ux.js (hand
   pages), so a sim page cannot ship without it (tests/sim-ux-layer-test.js).

     1. Skip link to the page's main content (WCAG 2.4.1).
     2. Every horizontally scrolling table box: keyboard focusable region with a
        name (axe scrollable-region-focusable), and when it overflows a sticky
        first column, an edge fade and a "Scroll for more" hint (CHECKLIST #14).
     3. The Live help launcher steps aside while it would cover a button, link,
        input or table cell, and comes back when clear (CHECKLIST #15).
     4. Toggle groups that are not real tab sets expose aria-pressed.
     5. window.TMRSimUX.state(el, ...) for one loading / error-with-retry look.
   It never changes copy, numbers, URLs or anything a crawler reads.
   ============================================================================= */
(function () {
  'use strict';
  if (window.TMRSimUX) return;
  var doc = document;

  /* ---------------------------------------------------------- 1. skip link */
  function skipLink() {
    if (doc.querySelector('.simux-skip')) return;
    var first = doc.body.querySelector('a[href^="#"]');
    if (first && /skip/i.test(first.textContent || '')) return;   // the page has its own
    var main = doc.querySelector('main, [role="main"]');
    if (!main) {
      var h1 = doc.querySelector('h1');
      main = h1 && (h1.closest('section, article, .wrap, .container, div') || h1);
    }
    if (!main) return;
    if (!main.id) main.id = 'simux-main';
    main.setAttribute('data-simux-main', '');
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    var a = doc.createElement('a');
    a.className = 'simux-skip';
    a.href = '#' + main.id;
    a.textContent = 'Skip to main content';
    doc.body.insertBefore(a, doc.body.firstChild);
  }

  /* ------------------------------------------------------ 2. table regions */
  function opaqueBg(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var c = getComputedStyle(n).backgroundColor;
      if (c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c)) {
        var m = c.match(/rgba\(([^,]+),([^,]+),([^,]+),\s*([\d.]+)\)/);
        if (!m || Number(m[4]) > 0.85) return c;
      }
    }
    return doc.body.classList.contains('tmr-light') ? '#ffffff' : '#0d1526';
  }
  function scrollBoxOf(table) {
    for (var n = table.parentElement; n && n !== doc.body; n = n.parentElement) {
      var ox = getComputedStyle(n).overflowX;
      // <details> never scrolls its content (Chromium), so a table in one needs its own box.
      if ((ox === 'auto' || ox === 'scroll') && n.tagName !== 'DETAILS') return n;
      if (n.children.length > 1 && n.tagName !== 'DIV') break;
    }
    return null;
  }
  function labelFor(table, box) {
    var cap = table.querySelector('caption');
    if (cap && cap.textContent.trim()) return cap.textContent.trim();
    for (var n = box; n && n !== doc.body; n = n.parentElement) {
      for (var p = n.previousElementSibling; p; p = p.previousElementSibling) {
        if (/^H[1-6]$/.test(p.tagName) || p.classList.contains('sechead')) return p.textContent.trim().slice(0, 80);
        var h = p.querySelector && p.querySelector('h2, h3, h4');
        if (h) return h.textContent.trim().slice(0, 80);
      }
    }
    var th = table.querySelector('th');
    return th ? th.textContent.trim() + ' table' : 'Data table';
  }
  function updateBox(box) {
    var over = box.scrollWidth > box.clientWidth + 2;
    box.classList.toggle('simux-overflow', over);
    box.classList.toggle('simux-more-r', over && box.scrollLeft + box.clientWidth < box.scrollWidth - 4);
    if (over) box.style.setProperty('--simux-bg', opaqueBg(box));
    var hint = box.previousElementSibling;
    if (hint && hint.classList.contains('simux-hint')) hint.hidden = !over;
    else if (over) {
      hint = doc.createElement('p');
      hint.className = 'simux-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = (matchMedia('(pointer:coarse)').matches ? 'Swipe' : 'Scroll') + ' sideways for more columns →';
      box.parentNode.insertBefore(hint, box);
    }
  }
  function tables() {
    var list = doc.querySelectorAll('table');
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t.closest('.tmr-lc')) continue;
      var box = scrollBoxOf(t);
      if (!box) {
        if (t.offsetWidth <= (t.parentElement ? t.parentElement.clientWidth : 0) + 2) continue;
        box = doc.createElement('div');
        t.parentNode.insertBefore(box, t);
        box.appendChild(t);
      }
      if (!box.classList.contains('simux-scroll')) {
        box.classList.add('simux-scroll');
        box.addEventListener('scroll', function () { updateBox(this); }, { passive: true });
      }
      if (box.scrollWidth > box.clientWidth + 2 || box.hasAttribute('tabindex')) {
        if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '0');
        if (!box.getAttribute('role')) box.setAttribute('role', 'region');
        if (!box.getAttribute('aria-label') && !box.getAttribute('aria-labelledby')) box.setAttribute('aria-label', labelFor(t, box));
      }
      updateBox(box);
    }
    // Any other scrolling box with no focusable content (axe scrollable-region-focusable).
    var boxes = doc.querySelectorAll('.tscroll, .tablewrap, .linescore, .sb-line');
    for (var j = 0; j < boxes.length; j++) {
      var b = boxes[j];
      if (b.scrollWidth > b.clientWidth + 2 && !b.hasAttribute('tabindex') && !b.querySelector('a[href], button, input, select, [tabindex]')) {
        b.setAttribute('tabindex', '0');
        if (!b.getAttribute('role')) b.setAttribute('role', 'region');
        if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', 'Scrollable table');
      }
    }
  }

  /* -------------------------------------------- 3. live help launcher yield */
  var COVERS = 'button, a[href], input, select, textarea, label, summary, td, th, [role="button"], [role="tab"], .pb-t, canvas, svg';
  function bubble() {
    var lc = doc.querySelector('.tmr-lc-launcher');
    if (!lc) return;
    var root = lc.closest('.tmr-lc');
    if (root && root.classList.contains('is-open')) { lc.classList.remove('simux-yield'); return; }
    var r = lc.getBoundingClientRect();
    if (!r.width) return;
    var pts = [[r.left + 3, r.top + 3], [r.right - 3, r.top + 3], [r.left + 3, r.bottom - 3], [r.right - 3, r.bottom - 3],
      [r.left + r.width / 2, r.top + r.height / 2], [r.left + 3, r.top + r.height / 2], [r.right - 3, r.top + r.height / 2]];
    var cover = false;
    for (var i = 0; i < pts.length && !cover; i++) {
      var stack = doc.elementsFromPoint(pts[i][0], pts[i][1]);
      for (var k = 0; k < stack.length; k++) {
        var e = stack[k];
        if (e === doc.body || e === doc.documentElement) break;
        if (e.closest('.tmr-lc')) continue;
        if (e.closest(COVERS)) { cover = true; }
        break;
      }
    }
    lc.classList.toggle('simux-yield', cover);
  }

  /* -------------------------------------------- 4. toggle groups (aria) */
  function toggles() {
    var bars = doc.querySelectorAll('.modebar');
    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      var btns = bar.querySelectorAll('button');
      var realTabs = bar.querySelector('[role="tab"]');
      if (!realTabs && bar.getAttribute('role') === 'tablist') bar.setAttribute('role', 'group');
      for (var j = 0; j < btns.length; j++) if (!btns[j].getAttribute('role')) btns[j].setAttribute('aria-pressed', btns[j].classList.contains('on') ? 'true' : 'false');
    }
  }

  /* -------------------------------------------- 5. loading / error state */
  function state(host, kind, text, retry) {
    if (!host) return null;
    var box = host.querySelector(':scope > .simux-state');
    if (kind === 'clear') { if (box) box.remove(); return null; }
    if (!box) { box = doc.createElement('div'); box.className = 'simux-state'; host.insertBefore(box, host.firstChild); }
    box.className = 'simux-state' + (kind === 'error' ? ' is-error' : '');
    box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    box.innerHTML = '';
    if (kind === 'loading') { var s = doc.createElement('span'); s.className = 'simux-spin'; s.setAttribute('aria-hidden', 'true'); box.appendChild(s); }
    var t = doc.createElement('span'); t.textContent = text || (kind === 'error' ? 'Could not load the latest data.' : 'Loading the latest data…'); box.appendChild(t);
    if (kind === 'error' && typeof retry === 'function') {
      var b = doc.createElement('button'); b.type = 'button'; b.textContent = 'Try again';
      b.addEventListener('click', function () { state(host, 'loading'); retry(); });
      box.appendChild(b);
    }
    return box;
  }

  var queued = false;
  function run() {
    queued = false;
    try { tables(); } catch (e) { /* never break a page */ }
    try { toggles(); } catch (e) {}
    try { bubble(); } catch (e) {}
  }
  function queue() {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || setTimeout)(run);
  }

  window.TMRSimUX = { state: state, refresh: queue };

  function start() {
    skipLink();
    run();
    window.addEventListener('scroll', function () { try { bubble(); } catch (e) {} }, { passive: true });
    window.addEventListener('resize', queue);
    if (window.MutationObserver) new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var t = muts[i].target;
        if (muts[i].type === 'attributes' && t && t.closest && (t.closest('.tmr-lc') || t.classList.contains('simux-scroll'))) continue;
        if (t && t.classList && t.classList.contains('simux-hint')) continue;
        queue(); return;
      }
    }).observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
