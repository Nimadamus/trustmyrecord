/* JustBet MLB Handicapping Contest sitewide promo modal */
(function () {
    'use strict';

    var CONTEST_LANDING_PATH = '/contests/justbet-mlb/';
    var STORAGE_KEY = 'tmr_contest_promo_justbet_mlb_v2';
    var SUPPRESS_HOURS = 24;
    var DELAY_MS = 1200;

    var BLOCKED_PATHS = [
        '/about/', '/about',
        '/contact/', '/contact',
        '/terms/', '/terms',
        '/privacy/', '/privacy',
        '/report-bug/', '/report-bug',
        '/login/', '/login',
        '/register/', '/register',
        '/signup/', '/signup',
        '/reset-password/', '/reset-password',
        '/verify-email/', '/verify-email',
        '/how-it-works/', '/how-it-works',
        // SPORTSBOOK_PROMO_SUPPRESS_20260604: never cover the pick-submission
        // board. A full-viewport backdrop (z-index 9998, pointer-events:auto)
        // intercepts every odds button, which reads to users as "I can't click
        // or select anything on the pick screen."
        '/sportsbook/', '/sportsbook'
    ];

    // EAGER session claim: decide once at script execution whether THIS page
    // load is the "first time this session" and immediately write the flag.
    // Doing it here (instead of inside init) guarantees the flag is persisted
    // even if the user navigates away before DOMContentLoaded fires or before
    // the 1200ms open delay elapses. Subsequent page loads in the same tab
    // see the flag and silently skip.
    var IS_FIRST_THIS_SESSION = false;
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            if (window.sessionStorage.getItem(STORAGE_KEY + '_session') !== '1') {
                IS_FIRST_THIS_SESSION = true;
                window.sessionStorage.setItem(STORAGE_KEY + '_session', '1');
            }
        }
    } catch (err) { /* storage unavailable -- treat as first-and-only show */
        IS_FIRST_THIS_SESSION = true;
    }

    function shouldSuppress() {
        try {
            // Don't show on the contest pages themselves.
            var p = window.location.pathname.replace(/\/$/, '/');
            if (p.indexOf('/contests/justbet-mlb') === 0) return true;
            // Don't show on informational / auth / legal pages.
            for (var i = 0; i < BLOCKED_PATHS.length; i++) {
                if (p === BLOCKED_PATHS[i] || p.indexOf(BLOCKED_PATHS[i] + '/') === 0) return true;
            }
            // Don't show in iframes (e.g., embedded widgets).
            if (window.top !== window.self) return true;
        } catch (err) { /* fall through */ }
        // Session-scoped: only the first load this session may show the modal.
        return !IS_FIRST_THIS_SESSION;
    }

    function rememberDismiss() {
        try {
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

        // Close on backdrop click as a safety net so the page can never become
        // permanently click-trapped behind the modal (SPORTSBOOK_PROMO_SUPPRESS_20260604).
        // A short arming delay avoids dismissing on any auto-dispatched click that
        // fires immediately after page-ready.
        var backdropArmed = false;
        setTimeout(function () { backdropArmed = true; }, 400);
        parts.backdrop.addEventListener('click', function () {
            if (!backdropArmed) return;
            close(parts);
            document.removeEventListener('keydown', onKey);
        });
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
        // Flag was already written at IIFE-top (IS_FIRST_THIS_SESSION claim).
        setTimeout(open, DELAY_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
