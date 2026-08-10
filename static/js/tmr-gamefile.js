/* ============================================================================
   tmr-gamefile.js — MATCHUP_OF_THE_DAY_PHASE1_20260810

   Progressive enhancement for a TMR Game File, and nothing more.

   The article is fully baked: title, byline, dates, every module, every table
   and every internal link are in the HTML before this file runs. Nothing here
   is required for the page to be read, indexed, or understood. If this script
   404s the page is unchanged.

   That constraint is the whole point. Every indexation failure in this repo's
   history came from a page whose content arrived after the shell.
   ========================================================================== */
(function () {
  'use strict';

  var article = document.querySelector('.gf-article');
  if (!article) return;

  /* Anchor jumps land the heading under the top of the viewport rather than
     flush against it. Done in JS rather than scroll-padding-top because the nav
     is injected at runtime and its height is not known at parse time. */
  function headerOffset() {
    var nav = document.querySelector('.tmr-ds-nav, .tmrnav, header[role="banner"]');
    return nav ? Math.round(nav.getBoundingClientRect().height) + 12 : 16;
  }

  var toc = document.querySelector('.gf-toc');
  if (toc) {
    toc.addEventListener('click', function (ev) {
      var link = ev.target.closest('a[href^="#"]');
      if (!link) return;
      var target = document.getElementById(link.getAttribute('href').slice(1));
      if (!target) return;              // the anchor still works natively
      ev.preventDefault();
      var top = target.getBoundingClientRect().top + window.scrollY - headerOffset();
      window.scrollTo({ top: top, behavior: 'smooth' });
      // Keep the URL shareable; replaceState so Back does not walk the TOC.
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', link.getAttribute('href'));
      }
    });
  }

  /* A wide table on a phone is only usable if the reader knows it scrolls.
     The shadow appears on the side there is more content, and disappears when
     the table is fully visible — no instruction text, no layout shift. */
  Array.prototype.forEach.call(document.querySelectorAll('.gf-tablewrap'), function (wrap) {
    function paint() {
      var overflowing = wrap.scrollWidth - wrap.clientWidth;
      if (overflowing <= 1) { wrap.style.boxShadow = ''; return; }
      var atStart = wrap.scrollLeft <= 1;
      var atEnd = wrap.scrollLeft >= overflowing - 1;
      var shadows = [];
      if (!atStart) shadows.push('inset 12px 0 12px -12px rgba(2,10,20,.55)');
      if (!atEnd) shadows.push('inset -12px 0 12px -12px rgba(2,10,20,.55)');
      wrap.style.boxShadow = shadows.join(', ');
    }
    wrap.addEventListener('scroll', paint, { passive: true });
    window.addEventListener('resize', paint, { passive: true });
    paint();
  });
}());
