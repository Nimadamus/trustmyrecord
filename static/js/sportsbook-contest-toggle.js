/**
 * Sportsbook bet-slip contest toggle — DISABLED PLACEHOLDER (May 22, 2026).
 *
 * Renders a "JustBet MLB Contest Pick" section inside the existing Pick
 * Slip with a permanently disabled checkbox and the helper text
 * "Contest picks are not open yet." The control is purely visual at this
 * stage. There is NO contest routing, NO backend probe, NO fetch
 * interceptor. Normal single-pick submission is untouched.
 *
 * Injects into BOTH known slip containers so whichever one the user's
 * page is actually rendering picks up the placeholder:
 *   1. .sportsbook-ticket-preview-card (lobby aside slip — primary)
 *   2. #pickDetails (legacy in-row slip — secondary, in case the
 *      DUPLICATE_PICK_SLIP_FIX_20260522 CSS does not take effect on a
 *      given viewport / build)
 *
 * Re-injects on every MutationObserver tick AND on a 700 ms interval to
 * survive _ttPopulateSlip rebuilding the card via card.innerHTML.
 */
(function () {
    'use strict';

    var CONTEST_NAME = 'JustBet MLB';

    var qs = new URLSearchParams(window.location.search);
    if ((qs.get('contest') || '').trim()) {
        // contest-mode.js owns the page in the ?contest= flow.
        return;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    (function injectCss() {
        if (document.getElementById('tmr-contest-toggle-css')) return;
        var s = document.createElement('style');
        s.id = 'tmr-contest-toggle-css';
        s.textContent = [
            '.tmr-contest-toggle-block {',
            '  margin: 12px 0 10px;',
            '  padding: 12px 14px;',
            '  border-radius: 12px;',
            '  background: linear-gradient(180deg, rgba(60,42,8,0.45) 0%, rgba(28,22,8,0.45) 100%);',
            '  border: 1px solid rgba(255,184,0,0.45);',
            '  color: #ffe4a3;',
            '  font: 600 0.86rem/1.45 "Inter", system-ui, sans-serif;',
            '  opacity: 0.85;',
            '}',
            '.tmr-contest-toggle-block .tmr-cgt-title {',
            '  font-family: "Barlow","Inter",sans-serif;',
            '  font-weight: 900;',
            '  font-size: 0.78rem;',
            '  letter-spacing: 0.08em;',
            '  text-transform: uppercase;',
            '  color: #ffe4a3;',
            '  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;',
            '}',
            '.tmr-contest-toggle-block .tmr-cgt-title i { color:#f0c449; }',
            '.tmr-contest-toggle-block label.tmr-cgt-row {',
            '  display: flex; align-items: flex-start; gap: 10px;',
            '  cursor: not-allowed; padding: 4px 0;',
            '  margin: 0;',
            '}',
            '.tmr-contest-toggle-block input[type=checkbox] {',
            '  margin-top: 3px;',
            '  width: 16px; height: 16px;',
            '  accent-color: #f0c449;',
            '  cursor: not-allowed;',
            '  opacity: 0.6;',
            '}',
            '.tmr-contest-toggle-block .tmr-cgt-label { color:#f5e8c9; font-weight:800; font-size:0.92rem; line-height:1.3; display:block; }',
            '.tmr-contest-toggle-block .tmr-cgt-help { color:#f5e8c9; font-size:0.78rem; margin-top:3px; display:block; }',
            '.tmr-contest-toggle-block .tmr-cgt-status {',
            '  margin-top:8px; padding:6px 10px; border-radius:8px;',
            '  background:rgba(15,23,42,0.55); border:1px solid rgba(255,184,0,0.4);',
            '  color:#ffe4a3; font-size:0.78rem; font-weight:700;',
            '  display:inline-flex; align-items:center; gap:6px;',
            '}',
        ].join('\n');
        document.head.appendChild(s);
    })();

    function buildBlock(idSuffix) {
        var block = document.createElement('div');
        block.className = 'tmr-contest-toggle-block';
        block.id = 'tmr-contest-toggle-block-' + idSuffix;
        block.setAttribute('data-tmr-contest-toggle', '');
        block.setAttribute('aria-disabled', 'true');
        block.innerHTML =
            '<div class="tmr-cgt-title"><i class="fas fa-trophy" aria-hidden="true"></i> ' + escapeHtml(CONTEST_NAME) + ' Contest Pick</div>' +
            '<label class="tmr-cgt-row">' +
                '<input type="checkbox" disabled aria-disabled="true" tabindex="-1">' +
                '<span>' +
                    '<span class="tmr-cgt-label">Submit this as a contest pick</span>' +
                    '<span class="tmr-cgt-help">Contest picks will be tracked separately from your public profile record once the contest opens.</span>' +
                '</span>' +
            '</label>' +
            '<div class="tmr-cgt-status"><i class="fas fa-lock" aria-hidden="true"></i> Contest picks are not open yet.</div>';
        return block;
    }

    // Injection target 1: lobby aside slip card (.sportsbook-ticket-preview-card).
    function injectInAside() {
        var card = document.querySelector('.sportsbook-ticket-preview .sportsbook-ticket-preview-card')
                || document.querySelector('.sportsbook-ticket-preview-card');
        if (!card) return;
        if (card.querySelector('#tmr-contest-toggle-block-aside')) return;
        var block = buildBlock('aside');
        var submit = card.querySelector('.sportsbook-ticket-preview-submit, #ttSlipSubmit');
        if (submit && submit.parentNode === card) {
            card.insertBefore(block, submit);
        } else {
            card.appendChild(block);
        }
    }

    // Injection target 2: legacy in-row #pickDetails (visible on some viewports
    // when the DUPLICATE_PICK_SLIP_FIX CSS does not take effect).
    function injectInPickDetails() {
        var details = document.getElementById('pickDetails');
        if (!details) return;
        if (details.querySelector('#tmr-contest-toggle-block-details')) return;
        var block = buildBlock('details');
        var submit = details.querySelector('.submit-pick-btn');
        if (submit && submit.parentNode === details) {
            details.insertBefore(block, submit);
        } else {
            details.appendChild(block);
        }
    }

    function applyAll() {
        try { injectInAside(); } catch (_) {}
        try { injectInPickDetails(); } catch (_) {}
    }

    function watch() {
        // Set up observers on both containers as they become available.
        var asideTries = 0, detailsTries = 0;
        function bindAside() {
            var aside = document.querySelector('.sportsbook-ticket-preview');
            if (!aside) {
                if (++asideTries < 40) setTimeout(bindAside, 250);
                return;
            }
            new MutationObserver(function () { injectInAside(); }).observe(aside, { childList: true, subtree: true });
            injectInAside();
        }
        function bindDetails() {
            var details = document.getElementById('pickDetails');
            if (!details) {
                if (++detailsTries < 40) setTimeout(bindDetails, 250);
                return;
            }
            new MutationObserver(function () { injectInPickDetails(); }).observe(details, { childList: true, subtree: true });
            injectInPickDetails();
        }
        bindAside();
        bindDetails();
        // Defensive heartbeat in case innerHTML rewrites outrun the
        // MutationObserver microtask schedule on some browsers.
        setInterval(applyAll, 700);
        applyAll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watch);
    } else {
        watch();
    }
})();
