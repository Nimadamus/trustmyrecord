/**
 * Sportsbook bet-slip contest toggle — DISABLED PLACEHOLDER (May 22, 2026).
 *
 * Renders a "JustBet MLB Contest Pick" section inside the existing Pick
 * Slip with a permanently disabled checkbox and the helper text
 * "Contest picks are not open yet." The control is purely visual at this
 * stage. There is NO contest routing, NO backend probe, NO fetch
 * interceptor. Normal single-pick submission is untouched.
 *
 * When the contest pick-entry workflow is approved to go live (see the
 * STRONGEST RULE memory on contest-pick CTAs), this file will be
 * replaced with the eligibility-gated, fetch-rerouting version. For now:
 * disabled-only.
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
            '  margin: 10px 0 8px;',
            '  padding: 12px 14px;',
            '  border-radius: 12px;',
            '  background: linear-gradient(180deg, rgba(60,42,8,0.45) 0%, rgba(28,22,8,0.45) 100%);',
            '  border: 1px solid rgba(255,184,0,0.35);',
            '  color: #ffe4a3;',
            '  font: 600 0.86rem/1.45 "Inter", system-ui, sans-serif;',
            '  opacity: 0.82;',
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
            '}',
            '.tmr-contest-toggle-block input[type=checkbox] {',
            '  margin-top: 3px;',
            '  width: 16px; height: 16px;',
            '  accent-color: #f0c449;',
            '  cursor: not-allowed;',
            '  opacity: 0.6;',
            '}',
            '.tmr-contest-toggle-block .tmr-cgt-label { color:#f5e8c9; font-weight:800; font-size:0.92rem; line-height:1.3; }',
            '.tmr-contest-toggle-block .tmr-cgt-help { color:#f5e8c9; font-size:0.78rem; margin-top:3px; }',
            '.tmr-contest-toggle-block .tmr-cgt-status {',
            '  margin-top:8px; padding:6px 10px; border-radius:8px;',
            '  background:rgba(15,23,42,0.55); border:1px solid rgba(255,184,0,0.32);',
            '  color:#ffe4a3; font-size:0.78rem; font-weight:700;',
            '  display:inline-flex; align-items:center; gap:6px;',
            '}',
        ].join('\n');
        document.head.appendChild(s);
    })();

    function findSlipCard() {
        return document.querySelector('.sportsbook-ticket-preview .sportsbook-ticket-preview-card')
            || document.querySelector('.sportsbook-ticket-preview-card');
    }

    function buildBlock() {
        var block = document.createElement('div');
        block.className = 'tmr-contest-toggle-block';
        block.id = 'tmr-contest-toggle-block';
        block.setAttribute('aria-disabled', 'true');
        block.innerHTML =
            '<div class="tmr-cgt-title"><i class="fas fa-trophy" aria-hidden="true"></i> ' + escapeHtml(CONTEST_NAME) + ' Contest Pick</div>' +
            '<label class="tmr-cgt-row">' +
                // Hard-disabled. No change handler, no routing — purely visual.
                '<input type="checkbox" id="tmrContestPickToggle" disabled aria-disabled="true" tabindex="-1">' +
                '<span>' +
                    '<span class="tmr-cgt-label">Submit this as a contest pick</span>' +
                    '<span class="tmr-cgt-help">Contest picks will be tracked separately from your public profile record once the contest opens.</span>' +
                '</span>' +
            '</label>' +
            '<div class="tmr-cgt-status"><i class="fas fa-lock" aria-hidden="true"></i> Contest picks are not open yet.</div>';
        return block;
    }

    function applyState() {
        var card = findSlipCard();
        if (!card) return;
        if (document.getElementById('tmr-contest-toggle-block')) return;
        var block = buildBlock();
        var submit = card.querySelector('.sportsbook-ticket-preview-submit');
        if (submit && submit.parentNode === card) {
            card.insertBefore(block, submit);
        } else {
            card.appendChild(block);
        }
    }

    function watchSlip() {
        var aside = document.querySelector('.sportsbook-ticket-preview');
        if (!aside) {
            setTimeout(watchSlip, 500);
            return;
        }
        // _ttPopulateSlip rebuilds the card on every board-price click;
        // re-inject the disabled block whenever the slip DOM changes.
        var mo = new MutationObserver(function () { applyState(); });
        mo.observe(aside, { childList: true, subtree: true });
        applyState();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchSlip);
    } else {
        watchSlip();
    }
})();
