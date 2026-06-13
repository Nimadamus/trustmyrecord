/* ============================================================================
   JustBet Weekend Partner Bonus — TEMPORARY promo (TrustMyRecord.com)
   ----------------------------------------------------------------------------
   This is a JustBet partner/affiliate bonus campaign, NOT a TrustMyRecord
   contest. It is branded as a JustBet offer available to TrustMyRecord users.

   >>> WEEKEND TEMPORARY PROMO <<<
   This placement is for the JustBet "SportsCapper Bonus Bonanza Weekend"
   campaign and is expected to be REMOVED or UPDATED after the campaign ends.
   To take it down: set ENABLED:false below (boxes vanish sitewide), or update
   PROMO_URL / PROMO_CODE / copy here. Everything reads from this one object.

   >>> SINGLE SOURCE OF TRUTH — EDIT ONLY THIS OBJECT <<<
   ========================================================================== */
(function () {
    'use strict';

    var TMR_JUSTBET_PROMO = {
        // Master on/off. Set false after the weekend to hide every box sitewide.
        ENABLED: true,
        // JustBet SportsCapper Bonus Bonanza Weekend landing page (current).
        PROMO_URL: 'https://www.justbet.co/with-invitation/sportscapper-bonus-bonanza-weekend',
        // Referral / bonus code — shown prominently.
        PROMO_CODE: 'SB09G',
        // Human-readable removal note. Weekend campaign; remove/update after it ends.
        REMOVE_AFTER: 'End of this weekend campaign (temporary). Set ENABLED:false to remove.',
        HEADLINE: 'Weekend JustBet Bonus for TrustMyRecord Users',
        LEAD: 'Use code <strong>SB09G</strong> to claim the JustBet SportsCapper Bonus Bonanza Weekend offer.',
        BODY: 'Eligible users can receive a 125% Free Play bonus, 20% extra on eligible weekend game wins, and access to JustBet’s $1,000 Sports Free Play casino tournament.',
        TERMS: 'Bonus terms and rollover requirements apply. The 125% Free Play bonus has a 12x rollover on deposit plus free play before withdrawal. The $1,000 Free Play prize has a 3x rollover. JustBet is a third-party sportsbook; eligibility and terms are set by JustBet. 21+ where applicable. Please play responsibly.',
        CTA: 'Claim JustBet Bonus'
    };

    // Single source of truth, exposed for quick swaps.
    window.TMR_JUSTBET_PROMO = TMR_JUSTBET_PROMO;

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    var P = TMR_JUSTBET_PROMO;
    var url = esc(P.PROMO_URL);
    var code = esc(P.PROMO_CODE);

    function renderBox(el) {
        var variant = el.getAttribute('data-variant') || 'home';

        if (variant === 'dashboard') {
            el.innerHTML = [
                '<div class="tmr-jb-bonus tmr-jb-bonus--mini">',
                '  <div class="tmr-jb-bonus__eyebrow">JustBet Partner Bonus</div>',
                '  <div class="tmr-jb-bonus__title">Claim JustBet Bonus</div>',
                '  <div class="tmr-jb-bonus__code">Code <span>' + code + '</span></div>',
                '  <p class="tmr-jb-bonus__text">Weekend offer for TrustMyRecord users: 125% Free Play bonus + $1,000 Free Play tournament.</p>',
                '  <a class="tmr-jb-bonus__cta" href="' + url + '" target="_blank" rel="sponsored noopener" data-affiliate-link="justbet-bonus-dashboard">' + esc(P.CTA) + ' &rarr;</a>',
                '  <div class="tmr-jb-bonus__fine">Rollover/terms apply. Set by JustBet. 21+.</div>',
                '</div>'
            ].join('');
            return;
        }

        var heading = (variant === 'contest') ? 'Partner Bonus Offer' : esc(P.HEADLINE);
        el.innerHTML = [
            '<div class="tmr-jb-bonus">',
            '  <div class="tmr-jb-bonus__eyebrow">JustBet Partner Bonus</div>',
            '  <div class="tmr-jb-bonus__row">',
            '    <div class="tmr-jb-bonus__copy">',
            '      <div class="tmr-jb-bonus__title">' + heading + '</div>',
            '      <p class="tmr-jb-bonus__lead">' + P.LEAD + '</p>',
            '      <p class="tmr-jb-bonus__text">' + esc(P.BODY) + '</p>',
            '      <div class="tmr-jb-bonus__code">Bonus code: <span>' + code + '</span></div>',
            '    </div>',
            '    <a class="tmr-jb-bonus__cta" href="' + url + '" target="_blank" rel="sponsored noopener" data-affiliate-link="justbet-bonus-' + esc(variant) + '">' + esc(P.CTA) + ' &rarr;</a>',
            '  </div>',
            '  <div class="tmr-jb-bonus__fine">' + esc(P.TERMS) + '</div>',
            '</div>'
        ].join('');
    }

    function fillCodeSlots() {
        var slots = document.querySelectorAll('[data-promo-code-slot]');
        for (var i = 0; i < slots.length; i++) {
            slots[i].innerHTML = 'Use bonus code <strong style="color:#ffd766;letter-spacing:0.06em;">'
                + code + '</strong> when you open your JustBet account.';
        }
    }

    function injectStyles() {
        if (document.getElementById('tmr-jb-bonus-styles')) return;
        var css = [
            '.tmr-jb-bonus{width:min(1180px,calc(100% - 36px));margin:18px auto;padding:20px 24px;border-radius:16px;',
            'border:1px solid rgba(255,184,0,0.40);background:linear-gradient(135deg,rgba(255,184,0,0.08),rgba(8,18,31,0.04)),rgba(8,18,31,0.92);',
            'box-shadow:0 14px 34px rgba(15,20,38,0.10);}',
            '.tmr-jb-bonus--mini{width:auto;margin:0;padding:16px 18px;}',
            '.tmr-jb-bonus__eyebrow{font-family:"Barlow","Inter",sans-serif;font-weight:900;font-size:0.72rem;letter-spacing:0.10em;',
            'text-transform:uppercase;color:#ffb800;margin-bottom:8px;}',
            '.tmr-jb-bonus__row{display:flex;flex-wrap:wrap;align-items:center;gap:14px 24px;}',
            '.tmr-jb-bonus__copy{flex:1;min-width:260px;}',
            '.tmr-jb-bonus__title{font-weight:800;font-size:1.08rem;color:#fff;margin-bottom:6px;}',
            '.tmr-jb-bonus--mini .tmr-jb-bonus__title{font-size:1rem;}',
            '.tmr-jb-bonus__lead{margin:0 0 6px;color:#dbe5f2;font-size:0.95rem;line-height:1.5;}',
            '.tmr-jb-bonus__lead strong{color:#ffd766;letter-spacing:0.04em;}',
            '.tmr-jb-bonus__text{margin:0 0 8px;color:#c7d3e2;font-size:0.92rem;line-height:1.55;}',
            '.tmr-jb-bonus__code{font-size:0.85rem;color:#9fb0c4;font-weight:600;margin-bottom:8px;}',
            '.tmr-jb-bonus__code span{display:inline-block;margin-left:4px;padding:3px 11px;border-radius:6px;background:rgba(255,184,0,0.16);',
            'border:1px dashed rgba(255,184,0,0.6);color:#ffd766;font-weight:800;letter-spacing:0.08em;font-size:0.95em;}',
            '.tmr-jb-bonus__cta{flex-shrink:0;display:inline-flex;align-items:center;gap:8px;padding:13px 24px;border-radius:10px;',
            'background:#ffb800;color:#0f1f3d;font-weight:800;font-size:0.95rem;text-decoration:none;white-space:nowrap;}',
            '.tmr-jb-bonus__cta:hover{background:#ffc733;}',
            '.tmr-jb-bonus--mini .tmr-jb-bonus__cta{width:100%;justify-content:center;margin-top:4px;}',
            '.tmr-jb-bonus__fine{margin-top:12px;font-size:0.72rem;line-height:1.5;color:#7f8da0;}',
            /* Dashboard mini box: only on the logged-in user\'s OWN profile (the
               /dashboard redirect target). Hidden on public profile views. */
            '.tmr-jb-dash-only{display:none;}',
            'body.tmrx-is-own-profile .tmr-jb-dash-only{display:block;margin-bottom:14px;}',
            '@media (max-width:640px){.tmr-jb-bonus__cta{width:100%;justify-content:center;}}'
        ].join('');
        var style = document.createElement('style');
        style.id = 'tmr-jb-bonus-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function init() {
        var boxes = document.querySelectorAll('[data-justbet-bonus-box]');
        if (!P.ENABLED) {
            // Promo disabled: clear any boxes/slots so nothing renders.
            for (var j = 0; j < boxes.length; j++) boxes[j].innerHTML = '';
            return;
        }
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
