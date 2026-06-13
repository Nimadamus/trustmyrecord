/* ============================================================================
   JustBet Partner Bonus — SOFT LAUNCH placement (TrustMyRecord.com)
   ----------------------------------------------------------------------------
   This is a soft-launch partner bonus placement. Keep it understated until the
   JustBet landing page is updated with TrustMyRecord.com-branded co-branding.
   Once that revised landing page is live, this offer can be promoted harder.

   >>> SINGLE SOURCE OF TRUTH — SWAP THESE TWO VALUES TO UPDATE EVERYWHERE <<<
   When Gigi sends the revised TrustMyRecord-branded landing page, change
   PROMO_URL (and PROMO_CODE if it changes) below. Every partner bonus box on
   the site reads from this object, so one edit updates the homepage box and the
   contest-page box together. Do NOT hardcode the URL anywhere else.
   ========================================================================== */
(function () {
    'use strict';

    var TMR_JUSTBET_PROMO = {
        // Current live JustBet partner link (revshare). Swap when revised
        // TrustMyRecord-branded landing page is provided.
        PROMO_URL: 'https://record.revshare.ag/_RFP1Ust_FFzUOsjNOfgKeWNd7ZgqdRLk/1/',
        PROMO_CODE: 'SB09G',
        // Soft-launch flag. While true, copy stays understated ("partner bonus").
        SOFT_LAUNCH: true
    };

    // Expose for quick console swaps / future config, single source of truth.
    window.TMR_JUSTBET_PROMO = TMR_JUSTBET_PROMO;

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function renderBox(el) {
        var variant = el.getAttribute('data-variant') || 'home';
        var heading = (variant === 'contest')
            ? 'Partner Bonus Offer'
            : 'JustBet Partner Bonus';
        var url = esc(TMR_JUSTBET_PROMO.PROMO_URL);
        var code = esc(TMR_JUSTBET_PROMO.PROMO_CODE);

        el.innerHTML = [
            '<div class="tmr-jb-bonus">',
            '  <div class="tmr-jb-bonus__eyebrow">Partner Bonus</div>',
            '  <div class="tmr-jb-bonus__row">',
            '    <div class="tmr-jb-bonus__copy">',
            '      <div class="tmr-jb-bonus__title">' + heading + '</div>',
            '      <p class="tmr-jb-bonus__text">TrustMyRecord has partnered with JustBet. Open a JustBet account through our partner link and use bonus code <strong>' + code + '</strong> to claim the current new-account offer. Bonus terms are set by JustBet.</p>',
            '      <div class="tmr-jb-bonus__code">Bonus code: <span>' + code + '</span></div>',
            '    </div>',
            '    <a class="tmr-jb-bonus__cta" href="' + url + '" target="_blank" rel="sponsored noopener" data-affiliate-link="justbet-partner-bonus-' + esc(variant) + '">Claim Bonus &rarr;</a>',
            '  </div>',
            '  <div class="tmr-jb-bonus__fine">Soft-launch partner offer. JustBet is a third-party sportsbook; bonus eligibility, terms, and availability are determined by JustBet.</div>',
            '</div>'
        ].join('');
    }

    function injectStyles() {
        if (document.getElementById('tmr-jb-bonus-styles')) return;
        var css = [
            '.tmr-jb-bonus{width:min(1180px,calc(100% - 36px));margin:18px auto;padding:20px 24px;border-radius:16px;',
            'border:1px solid rgba(255,184,0,0.40);background:linear-gradient(135deg,rgba(255,184,0,0.08),rgba(8,18,31,0.04)),rgba(8,18,31,0.92);',
            'box-shadow:0 14px 34px rgba(15,20,38,0.10);}',
            '.tmr-jb-bonus__eyebrow{font-family:"Barlow","Inter",sans-serif;font-weight:900;font-size:0.72rem;letter-spacing:0.10em;',
            'text-transform:uppercase;color:#ffb800;margin-bottom:8px;}',
            '.tmr-jb-bonus__row{display:flex;flex-wrap:wrap;align-items:center;gap:14px 24px;}',
            '.tmr-jb-bonus__copy{flex:1;min-width:260px;}',
            '.tmr-jb-bonus__title{font-weight:800;font-size:1.08rem;color:#fff;margin-bottom:6px;}',
            '.tmr-jb-bonus__text{margin:0 0 8px;color:#c7d3e2;font-size:0.93rem;line-height:1.55;}',
            '.tmr-jb-bonus__text strong{color:#ffd766;}',
            '.tmr-jb-bonus__code{font-size:0.85rem;color:#9fb0c4;font-weight:600;}',
            '.tmr-jb-bonus__code span{display:inline-block;margin-left:4px;padding:2px 9px;border-radius:6px;background:rgba(255,184,0,0.16);',
            'border:1px dashed rgba(255,184,0,0.55);color:#ffd766;font-weight:800;letter-spacing:0.06em;}',
            '.tmr-jb-bonus__cta{flex-shrink:0;display:inline-flex;align-items:center;gap:8px;padding:13px 24px;border-radius:10px;',
            'background:#ffb800;color:#0f1f3d;font-weight:800;font-size:0.95rem;text-decoration:none;white-space:nowrap;}',
            '.tmr-jb-bonus__cta:hover{background:#ffc733;}',
            '.tmr-jb-bonus__fine{margin-top:12px;font-size:0.72rem;line-height:1.5;color:#7f8da0;}',
            '@media (max-width:640px){.tmr-jb-bonus__cta{width:100%;justify-content:center;}}'
        ].join('');
        var style = document.createElement('style');
        style.id = 'tmr-jb-bonus-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function fillCodeSlots() {
        var slots = document.querySelectorAll('[data-promo-code-slot]');
        for (var i = 0; i < slots.length; i++) {
            slots[i].innerHTML = 'Use bonus code <strong style="color:#ffd766;letter-spacing:0.06em;">'
                + esc(TMR_JUSTBET_PROMO.PROMO_CODE) + '</strong> when you open your JustBet account.';
        }
    }

    function init() {
        var boxes = document.querySelectorAll('[data-justbet-bonus-box]');
        fillCodeSlots();
        if (!boxes.length) return;
        injectStyles();
        for (var i = 0; i < boxes.length; i++) renderBox(boxes[i]);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
