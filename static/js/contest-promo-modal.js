/* JustBet MLB Handicapping Contest sitewide promo modal */
(function () {
    'use strict';

    var CONTEST_LANDING_PATH = '/contests/justbet-mlb/';
    var STORAGE_KEY = 'tmr_contest_promo_justbet_mlb_v2';
    var SUPPRESS_HOURS = 24;
    var DELAY_MS = 1200;

    function shouldSuppress() {
        try {
            // Don't show on the contest pages themselves.
            var p = window.location.pathname.replace(/\/$/, '/');
            if (p.indexOf('/contests/justbet-mlb') === 0) return true;
            // Don't show in iframes (e.g., embedded widgets).
            if (window.top !== window.self) return true;
            // Honor previous dismissal within the suppression window.
            var raw = window.localStorage.getItem(STORAGE_KEY);
            if (raw) {
                var ts = parseInt(raw, 10);
                if (!isNaN(ts)) {
                    var ageMs = Date.now() - ts;
                    if (ageMs < SUPPRESS_HOURS * 60 * 60 * 1000) return true;
                }
            }
            // Per-session suppression so a single visit doesn't bounce the modal.
            if (window.sessionStorage.getItem(STORAGE_KEY + '_session') === '1') return true;
        } catch (err) { /* storage unavailable, fall through and show once */ }
        return false;
    }

    function rememberDismiss() {
        try {
            window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
            window.sessionStorage.setItem(STORAGE_KEY + '_session', '1');
        } catch (err) { /* ignore */ }
    }

    function loadStylesheet() {
        if (document.querySelector('link[data-contest-promo-modal]')) return;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/static/css/contest-promo-modal.css?v=20260520c';
        link.setAttribute('data-contest-promo-modal', '1');
        document.head.appendChild(link);
    }

    function build() {
        var backdrop = document.createElement('div');
        backdrop.className = 'tmr-contest-modal-backdrop';
        backdrop.setAttribute('data-contest-promo-modal-backdrop', '1');

        var modal = document.createElement('div');
        modal.className = 'tmr-contest-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'tmr-contest-promo-title');
        modal.innerHTML = [
            '<button type="button" class="tmr-contest-modal__close" aria-label="Close contest promo">&times;</button>',
            '<div class="tmr-contest-modal__body">',
            '  <div>',
            '    <span class="tmr-contest-modal__brand" aria-label="JustBet"><img src="/static/media/justbet-logo.png?v=20260520a" alt="JustBet" width="260" height="26"></span>',
            '    <span class="tmr-contest-modal__status"><span class="pulse"></span> Coming This Week</span>',
            '  </div>',
            '  <h2 id="tmr-contest-promo-title">$2,500 JustBet MLB Handicapping Contest</h2>',
            '  <p class="tmr-contest-modal__sub">A free-to-enter handicapping contest. Pick 50 MLB games, ranked by net units. Top 3 finishers paid.</p>',
            '  <div class="tmr-contest-modal__pool">',
            '    <div>',
            '      <div class="pool-label">Total Prize Pool</div>',
            '      <div class="pool-amount"><span class="currency">$</span>2,500</div>',
            '    </div>',
            '    <div class="pool-breakdown">',
            '      <span>1st&nbsp;$1,500</span><span>2nd&nbsp;$750</span><span>3rd&nbsp;$250</span>',
            '    </div>',
            '  </div>',
            '  <ul class="tmr-contest-modal__features">',
            '    <li>50 MLB picks per entrant</li>',
            '    <li>Picks sealed until first pitch</li>',
            '    <li>Ranked by net units</li>',
            '    <li>Top 3 finishers paid</li>',
            '  </ul>',
            '  <div class="tmr-contest-modal__cta-row">',
            '    <a class="tmr-contest-modal__cta" href="' + CONTEST_LANDING_PATH + '" data-contest-promo-cta="1">View Contest Details</a>',
            '    <button type="button" class="tmr-contest-modal__skip" data-contest-promo-skip="1">Maybe later</button>',
            '  </div>',
            '  <div class="tmr-contest-modal__footer">Sponsored by JustBet. 21+ where applicable. Please play responsibly.</div>',
            '</div>'
        ].join('');

        document.body.appendChild(backdrop);
        document.body.appendChild(modal);
        return { backdrop: backdrop, modal: modal };
    }

    function close(parts) {
        rememberDismiss();
        parts.backdrop.classList.remove('is-open');
        parts.modal.classList.remove('is-open');
        var prevOverflow = document.body.getAttribute('data-tmr-contest-prev-overflow');
        if (prevOverflow !== null) {
            document.body.style.overflow = prevOverflow;
            document.body.removeAttribute('data-tmr-contest-prev-overflow');
        }
        setTimeout(function () {
            if (parts.backdrop.parentNode) parts.backdrop.parentNode.removeChild(parts.backdrop);
            if (parts.modal.parentNode) parts.modal.parentNode.removeChild(parts.modal);
        }, 240);
    }

    function open() {
        var parts = build();
        // Lock body scroll while open without clobbering any prior inline value.
        document.body.setAttribute('data-tmr-contest-prev-overflow', document.body.style.overflow || '');
        document.body.style.overflow = 'hidden';

        requestAnimationFrame(function () {
            parts.backdrop.classList.add('is-open');
            parts.modal.classList.add('is-open');
        });

        function onKey(evt) {
            if (evt.key === 'Escape') {
                close(parts);
                document.removeEventListener('keydown', onKey);
            }
        }
        document.addEventListener('keydown', onKey);

        parts.backdrop.addEventListener('click', function () { close(parts); document.removeEventListener('keydown', onKey); });
        parts.modal.querySelector('.tmr-contest-modal__close').addEventListener('click', function () { close(parts); document.removeEventListener('keydown', onKey); });
        parts.modal.querySelector('[data-contest-promo-skip]').addEventListener('click', function () { close(parts); document.removeEventListener('keydown', onKey); });
        parts.modal.querySelector('[data-contest-promo-cta]').addEventListener('click', function () {
            rememberDismiss();
            // Let the anchor's default navigation happen.
        });
    }

    function init() {
        if (shouldSuppress()) return;
        loadStylesheet();
        setTimeout(open, DELAY_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
