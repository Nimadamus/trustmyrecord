/* ============================================================
   TMR — Pick Marketplace shell (header + section nav + fee strip).

   WHY THIS EXISTS
   ---------------
   The marketplace used to read as two marketplaces stacked on each other: a
   cash storefront at /marketplace/ and a second, independently navigable
   "Picks for TMR" at /marketplace/tmr/ with its own Buy / Purchases / Sell
   tabs. They were never two marketplaces. They are ONE set of listings --
   marketplace_listings rows that carry BOTH a price_cents and a price_tmr --
   sold through two payment methods.

   So every /marketplace/* page renders this same header and the same section
   nav. Whichever page a member lands on, the structure they see is:

       BUY PICKS    Cash | TMR Coin | My Purchases
       SELL PICKS   My Listings | Create/Edit | Pricing | Sales | Payouts

   USAGE
   -----
     <div class="mpx" data-mp-tab="cash" data-mp-fees="1"></div>
     <link rel="stylesheet" href="/static/css/tmr-marketplace-shell.css?v=5369acad7f75">
     <script src="/static/js/tmr-marketplace-shell.js"></script>

   data-mp-tab   which tab is current: cash | tmr | purchases | listings |
                 editor | pricing | sales | payouts
   data-mp-fees  "1" renders the both-rails fee strip under the nav
   data-mp-sub   override the one-line description under the title

   The Cash and TMR Coin tabs are FILTERS on one board, not destinations for
   two boards: on /marketplace/ they switch in place without a navigation.
   ============================================================ */
(function () {
  'use strict';

  var API_BASE = (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl)
    || 'https://trustmyrecord-api.onrender.com/api';

  // Defaults match the shipped settings, so the strip is correct the instant it
  // paints and merely re-confirmed when /status answers.
  var FEES = { cashBps: 2000, tmrBps: 500 };

  var BUY = [
    ['cash',      '/marketplace/?pay=cash',  'Cash',         '$'],
    ['tmr',       '/marketplace/?pay=tmr',   'TMR Coin',     '◎'],
    ['purchases', '/marketplace/purchases/', 'My Purchases', '']
  ];
  var SELL = [
    ['listings', '/marketplace/sell/#listings', 'My Listings', ''],
    ['editor',   '/marketplace/sell/#editor',   'Create/Edit Listing', ''],
    ['pricing',  '/marketplace/sell/#pricing',  'Pricing', ''],
    ['sales',    '/marketplace/sell/#sales',    'Sales', ''],
    ['payouts',  '/marketplace/sell/#payouts',  'Payout Settings', '']
  ];

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function pct(bps) { return (Number(bps) / 100).toFixed(Number(bps) % 100 ? 2 : 0) + '%'; }

  function tabsHtml(rows, current) {
    return rows.map(function (r) {
      var on = r[0] === current;
      return '<a class="mpx-tab" data-mpx-tab="' + r[0] + '" href="' + r[1] + '"'
        + (on ? ' aria-current="page"' : '') + '>'
        + (r[3] ? '<span class="mpx-ico">' + r[3] + '</span>' : '')
        + esc(r[2])
        + '<span class="mpx-cnt" data-mpx-count="' + r[0] + '"></span></a>';
    }).join('');
  }

  function feesHtml() {
    return '<div class="mpx-fees">'
      + '<h3>What TrustMyRecord keeps</h3>'
      + '<div class="mpx-fee-grid">'
      + '<div class="mpx-fee"><div class="mpx-fee-h"><span class="mpx-fee-n">Cash sale</span>'
      +   '<span class="mpx-fee-v" data-mpx-fee="cash">' + pct(FEES.cashBps) + '</span></div>'
      +   '<p>Paid by card through the seller’s own Stripe account. The commission is taken as a Stripe application fee at the moment of sale; the seller keeps the rest and Stripe pays it out to their bank.</p></div>'
      + '<div class="mpx-fee"><div class="mpx-fee-h"><span class="mpx-fee-n">TMR Coin sale</span>'
      +   '<span class="mpx-fee-v" data-mpx-fee="tmr">' + pct(FEES.tmrBps) + '</span></div>'
      +   '<p>Paid from the buyer’s TMR balance. The commission is deducted on the TMR ledger and the balance moves to the seller immediately.</p></div>'
      + '</div>'
      + '<p class="mpx-fee-why"><b>Why the two rates differ.</b> A cash sale carries card processing, payouts to a bank account, refunds, chargebacks and the dispute handling that comes with them, and every one of those costs money on every order. A TMR Coin sale is a transfer on TrustMyRecord’s own ledger with none of that attached, so it is priced at what it costs to run. The rate that applies is shown on the listing before anyone pays, either way.</p>'
      + '</div>';
  }

  function render(host) {
    var current = host.getAttribute('data-mp-tab') || '';
    var sub = host.getAttribute('data-mp-sub')
      || 'One marketplace for verified picks, with <b>two ways to pay</b>: cash or TMR Coin. '
       + 'Sellers set both prices on the same listing, so a single package can take either.';
    host.innerHTML =
      '<div class="mpx-top"><div>'
      + '<h1 class="mpx-title">Pick <span class="mpx-accent">Marketplace</span></h1>'
      + '<p class="mpx-sub">' + sub + '</p>'
      + '</div><div class="mpx-slot" data-mpx-slot></div></div>'
      + '<nav class="mpx-nav" aria-label="Pick Marketplace sections">'
      +   '<div class="mpx-row"><span class="mpx-row-label">Buy picks</span>'
      +     '<div class="mpx-tabs">' + tabsHtml(BUY, current) + '</div></div>'
      +   '<div class="mpx-row"><span class="mpx-row-label">Sell picks</span>'
      +     '<div class="mpx-tabs">' + tabsHtml(SELL, current) + '</div></div>'
      + '</nav>'
      + (host.getAttribute('data-mp-fees') === '1' ? feesHtml() : '');
  }

  function applyFees(host, status) {
    if (!status) return;
    var pm = status.payment_methods || {};
    if (pm.cash && pm.cash.fee_bps != null) FEES.cashBps = pm.cash.fee_bps;
    else if (status.platform_fee_bps != null) FEES.cashBps = status.platform_fee_bps;
    if (pm.tmr && pm.tmr.fee_bps != null) FEES.tmrBps = pm.tmr.fee_bps;
    else if (status.tmr_platform_fee_bps != null) FEES.tmrBps = status.tmr_platform_fee_bps;
    var c = host.querySelector('[data-mpx-fee="cash"]');
    var t = host.querySelector('[data-mpx-fee="tmr"]');
    if (c) c.textContent = pct(FEES.cashBps);
    if (t) t.textContent = pct(FEES.tmrBps);
  }

  var statusPromise = null;
  function loadStatus() {
    if (!statusPromise) {
      statusPromise = fetch(API_BASE + '/marketplace/status', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }
    return statusPromise;
  }

  function boot() {
    var hosts = document.querySelectorAll('.mpx[data-mp-tab]');
    if (!hosts.length) return;
    Array.prototype.forEach.call(hosts, render);
    loadStatus().then(function (s) {
      Array.prototype.forEach.call(hosts, function (h) { applyFees(h, s); });
      window.TMR_MARKETPLACE_STATUS = s;
      document.dispatchEvent(new CustomEvent('tmr:marketplace-status', { detail: s }));
    });
  }

  /* Public helpers so a page can drive its own tab state (the Cash / TMR Coin
     switch on /marketplace/ changes the board in place, without navigating). */
  window.TMRMarketplaceShell = {
    fees: function () { return { cashBps: FEES.cashBps, tmrBps: FEES.tmrBps }; },
    status: loadStatus,
    setTab: function (key) {
      Array.prototype.forEach.call(document.querySelectorAll('.mpx [data-mpx-tab]'), function (a) {
        if (a.getAttribute('data-mpx-tab') === key) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
    },
    setCount: function (key, n) {
      Array.prototype.forEach.call(document.querySelectorAll('.mpx [data-mpx-count="' + key + '"]'), function (el) {
        el.textContent = (n == null || n === '') ? '' : String(n);
      });
    },
    slot: function () { return document.querySelector('.mpx [data-mpx-slot]'); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
