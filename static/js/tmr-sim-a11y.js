/* TMR SIM A11Y                                                 SIM_A11Y_20261105
   NFL, NBA and NHL hub, season and playoff pages only. Loaded by the SIM_A11Y block
   (scripts/sim-ux.js). Baked tables already carry captions and scope from the stamp;
   this does the same for tables drawn after a run, says when a run starts and ends,
   and keeps Tab inside a modal. It changes no copy a visitor sees and no numbers. */
(function () {
  'use strict';
  if (window.TMRSimA11y) return;
  var doc = document;

  function headingFor(table) {
    var named = table.getAttribute('aria-label');
    if (named) return named;
    for (var n = table; n && n !== doc.body; n = n.parentElement) {
      for (var s = n.previousElementSibling; s; s = s.previousElementSibling) {
        if (/^H[1-6]$/.test(s.tagName)) return s.textContent.trim();
        var h = s.querySelectorAll ? s.querySelectorAll('h1,h2,h3,h4,h5,h6') : [];
        if (h.length) return h[h.length - 1].textContent.trim();
      }
    }
    return 'Simulation table';
  }

  function dressTable(table) {
    var cells = table.querySelectorAll('th:not([scope])');
    for (var i = 0; i < cells.length; i++) {
      var row = cells[i].parentElement;
      var inHead = cells[i].closest('thead') || !row.querySelector('td');
      cells[i].setAttribute('scope', inHead ? 'col' : 'row');
    }
    if (!table.caption) {
      var c = doc.createElement('caption');
      c.className = 'simux-sr';
      c.textContent = headingFor(table);
      table.insertBefore(c, table.firstChild);
    }
    table.setAttribute('data-simux-a11y', '');
  }

  function dressAll(root) {
    var list = (root || doc).querySelectorAll('table:not([data-simux-a11y])');
    for (var i = 0; i < list.length; i++) dressTable(list[i]);
  }

  /* Tab stays inside an open modal, and focus goes back to what opened it. A native
     dialog opened with showModal already does this, so only role="dialog" overlays. */
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  var modal = null;
  var opener = null;

  function openModalNode() {
    var list = doc.querySelectorAll('[role="dialog"][aria-modal="true"]');
    for (var i = list.length - 1; i >= 0; i--) if (list[i].tagName !== 'DIALOG') return list[i];
    return null;
  }

  function syncModal() {
    var now = openModalNode();
    if (now === modal) return;
    if (now && !modal) opener = doc.activeElement;
    if (!now && opener) {
      if (doc.contains(opener) && opener.focus) opener.focus();
      opener = null;
    }
    modal = now;
  }

  function onTab(e) {
    if (e.key !== 'Tab') return;
    syncModal();
    if (!modal) return;
    var items = Array.prototype.filter.call(modal.querySelectorAll(FOCUSABLE), function (n) {
      return !n.hidden && n.getAttribute('aria-hidden') !== 'true';
    });
    if (!items.length) { e.preventDefault(); return; }
    var first = items[0], last = items[items.length - 1], at = doc.activeElement;
    if (!modal.contains(at)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  }

  /* The hubs' result box is too long to read aloud, so one short line says the state. */
  var running = false;
  var previous = null;
  function say(text) {
    var n = doc.getElementById('simuxRun');
    if (n) n.textContent = text;
  }
  function settle() {
    var result = doc.getElementById('result');
    if (!running || !result || !result.firstElementChild || result.firstElementChild === previous) return;
    running = false;
    previous = null;
    var bad = result.querySelector('.simux-state');
    say(bad ? bad.textContent.trim().slice(0, 120) : 'Results ready.');
  }
  function onRunClick(e) {
    var t = e.target;
    if (t && t.closest && t.closest('#runBtn,#featBtn')) {
      var result = doc.getElementById('result');
      running = true;
      say('Simulation running.');
      /* An old result stays in the box until the new one lands; only a change counts. */
      previous = result ? result.firstElementChild : null;
    }
  }

  var timer = 0;
  function sweep() {
    timer = 0;
    dressAll();
    syncModal();
    settle();
  }
  function schedule() { if (!timer) timer = setTimeout(sweep, 250); }

  function boot() {
    sweep();
    doc.addEventListener('keydown', onTab, true);
    doc.addEventListener('click', onRunClick, true);
    /* Trailing debounce and childList only: a sweep adds a caption at most once per
       table, so it cannot feed itself while a run is animating. */
    if (window.MutationObserver) new MutationObserver(schedule).observe(doc.body, { childList: true, subtree: true });
  }

  window.TMRSimA11y = { sweep: sweep };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
}());
