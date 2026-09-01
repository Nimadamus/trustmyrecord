/* ==========================================================================
   sportsbook-market-nav.js  (MARKET_NAV_ONE_ROW_20260831)

   Overflow controller for the sportsbook market / period tab strip
   (#lobbyPeriodBar / .sportsbook-period-bar) shared by every sport on the
   Make Picks board. It is a behaviour layer only: it never creates, renames
   or removes a market tab, and it never touches pick selection. The tab
   buttons themselves are still rendered by renderPeriodBar() in
   /sportsbook/, so every sport and every account gets this automatically.

   Rules:
     1. The strip is a single non-wrapping row (see sportsbook-market-nav.css).
     2. If the catalog does not fit, the trailing (lowest priority) markets -
        Alt Lines and Player Props are last in every PERIOD_CATALOG - fold
        into a MORE dropdown until the row fits.
     3. If fewer than MIN_VISIBLE tabs would survive beside MORE, the strip
        becomes a smooth horizontal scroller and nothing is hidden.
     4. Never a partial second row, in any mode.

   Tabs are MOVED, not cloned, so the click handler bound by bindPeriodTabs()
   and the is-active toggling done by window.TMR.setPeriod() keep working
   unchanged for tabs sitting inside the dropdown.
   ========================================================================== */
(function () {
    'use strict';

    if (window.__tmrMarketNavLoaded) return;
    window.__tmrMarketNavLoaded = true;

    var BAR_SEL = '.sportsbook-period-bar';
    var TAB_SEL = '.sportsbook-period-tab';
    var MIN_VISIBLE = 3;   // below this, scroll instead of folding
    var controllers = [];

    function matches(el, sel) {
        return !!(el && el.nodeType === 1 && el.matches && el.matches(sel));
    }

    function MarketNav(bar) {
        var self = this;
        this.bar = bar;
        this.busy = false;
        this.isOpen = false;
        bar.classList.add('tmr-mktnav');

        this.more = document.createElement('button');
        this.more.type = 'button';
        this.more.className = 'tmr-mktnav-more';
        this.more.hidden = true;
        this.more.setAttribute('aria-haspopup', 'true');
        this.more.setAttribute('aria-expanded', 'false');
        this.more.setAttribute('aria-label', 'More markets');
        this.more.innerHTML = '<span class="tmr-mktnav-more-text">More</span>'
            + '<span class="tmr-mktnav-more-caret" aria-hidden="true"></span>';

        this.menu = document.createElement('div');
        this.menu.className = 'tmr-mktnav-menu';
        this.menu.hidden = true;
        this.menu.setAttribute('role', 'tablist');
        this.menu.setAttribute('aria-label', 'More markets');
        document.body.appendChild(this.menu);

        this.more.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.toggle();
        });
        this.menu.addEventListener('click', function (e) {
            if (e.target && e.target.closest && e.target.closest(TAB_SEL)) {
                self.close();
                requestAnimationFrame(function () { self.sync(); });
            }
        });

        this.schedule = this.schedule.bind(this);
        if (window.ResizeObserver) {
            this.ro = new ResizeObserver(this.schedule);
            this.ro.observe(bar);
        }
        this.mo = new MutationObserver(function () { self.schedule(); });
        this.observe();
        this.layout();
    }

    MarketNav.prototype.observe = function () {
        // childList only: renderPeriodBar() replaces the strip's innerHTML on
        // every sport switch, which is exactly when a relayout is needed.
        try { this.mo.observe(this.bar, { childList: true }); } catch (e) { /* no-op */ }
    };

    MarketNav.prototype.schedule = function () {
        var self = this;
        if (this._raf) return;
        this._raf = requestAnimationFrame(function () {
            self._raf = 0;
            self.layout();
        });
    };

    MarketNav.prototype.layout = function () {
        var bar = this.bar;
        if (this.busy || !bar || !bar.isConnected) return;
        this.busy = true;
        this.mo.disconnect();
        try {
            var i, tabs, kids;

            // 1. Reset. renderPeriodBar() rebuilds the strip with innerHTML on
            //    every sport switch, which leaves the tabs we folded orphaned
            //    in the dropdown. Tabs we have already handled carry an owner
            //    mark, so an unmarked tab in the strip means it was re-rendered
            //    and everything still parked in the dropdown belongs to the
            //    PREVIOUS sport and must be discarded, never appended back.
            kids = bar.children;
            var rerendered = false;
            for (i = 0; i < kids.length; i++) {
                if (matches(kids[i], TAB_SEL) && kids[i].__tmrMktNavOwner !== this) { rerendered = true; break; }
            }
            if (rerendered) {
                this.menu.textContent = '';
            } else {
                var parked = this.menu.querySelectorAll(TAB_SEL);
                for (i = 0; i < parked.length; i++) {
                    parked[i].classList.remove('tmr-mktnav-item');
                    bar.appendChild(parked[i]);
                }
                this.menu.textContent = '';
            }
            this.close();
            bar.classList.remove('is-scroll');
            this.more.hidden = true;
            bar.appendChild(this.more);          // always the last child

            tabs = [];
            kids = bar.children;
            for (i = 0; i < kids.length; i++) {
                if (kids[i] !== this.more && matches(kids[i], TAB_SEL)) tabs.push(kids[i]);
            }
            if (!tabs.length) return;
            for (i = 0; i < tabs.length; i++) tabs[i].__tmrMktNavOwner = this;

            var cs = window.getComputedStyle(bar);
            var gap = parseFloat(cs.columnGap || cs.gap) || 0;
            var avail = bar.clientWidth
                - (parseFloat(cs.paddingLeft) || 0)
                - (parseFloat(cs.paddingRight) || 0);
            if (!(avail > 0)) return;           // hidden tab pane; retry on resize

            var w = [], total = 0;
            for (i = 0; i < tabs.length; i++) {
                w[i] = tabs[i].getBoundingClientRect().width;
                total += w[i];
            }
            total += gap * (tabs.length - 1);

            // 2. Everything fits: one clean row, no MORE, no scrollbar.
            if (total <= avail + 0.5) return;

            // 3. Fold the trailing markets into MORE.
            this.more.hidden = false;
            var budget = avail - this.more.getBoundingClientRect().width - gap;
            var used = 0, keep = 0;
            for (i = 0; i < tabs.length; i++) {
                var next = used + (keep ? gap : 0) + w[i];
                if (next > budget) break;
                used = next;
                keep++;
            }

            // 4. Too narrow to fold gracefully: smooth horizontal scroll.
            if (keep < Math.min(MIN_VISIBLE, tabs.length)) {
                this.more.hidden = true;
                bar.classList.add('is-scroll');
                return;
            }

            for (i = keep; i < tabs.length; i++) {
                tabs[i].classList.add('tmr-mktnav-item');
                this.menu.appendChild(tabs[i]);
            }
        } finally {
            this.busy = false;
            this.observe();
            this.sync();
        }
    };

    // Keep MORE showing the electric-blue active pill while the selected
    // market is one of the folded ones.
    MarketNav.prototype.sync = function () {
        var folded = this.menu.querySelectorAll(TAB_SEL);
        var on = false;
        for (var i = 0; i < folded.length; i++) {
            if (folded[i].classList.contains('is-active')
                || folded[i].classList.contains('active')
                || folded[i].getAttribute('aria-selected') === 'true') { on = true; break; }
        }
        this.more.classList.toggle('is-active', on);
    };

    MarketNav.prototype.place = function () {
        var r = this.more.getBoundingClientRect();
        var m = this.menu;
        m.style.minWidth = Math.max(r.width, 148) + 'px';
        var mw = m.offsetWidth, mh = m.offsetHeight;
        var left = Math.min(r.right - mw, window.innerWidth - mw - 8);
        var top = r.bottom + 6;
        if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
        m.style.left = Math.max(8, left) + 'px';
        m.style.top = top + 'px';
    };

    MarketNav.prototype.open = function () {
        if (this.isOpen || !this.menu.querySelector(TAB_SEL)) return;
        this.isOpen = true;
        this.menu.hidden = false;
        this.more.setAttribute('aria-expanded', 'true');
        this.place();
    };

    MarketNav.prototype.close = function () {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.menu.hidden = true;
        this.more.setAttribute('aria-expanded', 'false');
    };

    MarketNav.prototype.toggle = function () {
        if (this.isOpen) this.close(); else this.open();
    };

    function eachOpen(fn) {
        for (var i = 0; i < controllers.length; i++) if (controllers[i].isOpen) fn(controllers[i]);
    }
    function relayoutAll() {
        for (var i = 0; i < controllers.length; i++) controllers[i].schedule();
    }

    document.addEventListener('click', function (e) {
        for (var i = 0; i < controllers.length; i++) {
            var c = controllers[i];
            if (!c.isOpen) continue;
            if (c.menu.contains(e.target) || c.more.contains(e.target)) continue;
            c.close();
        }
    }, true);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') eachOpen(function (c) { c.close(); c.more.focus(); });
    });

    // A tab click anywhere re-syncs the MORE pill after setPeriod() has run.
    document.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest(TAB_SEL)) {
            requestAnimationFrame(function () {
                for (var i = 0; i < controllers.length; i++) controllers[i].sync();
            });
        }
    });

    window.addEventListener('resize', relayoutAll);
    window.addEventListener('scroll', function () { eachOpen(function (c) { c.place(); }); }, true);

    function attach(bar) {
        if (!bar || bar.__tmrMarketNav) return;
        bar.__tmrMarketNav = new MarketNav(bar);
        controllers.push(bar.__tmrMarketNav);
    }

    function init() {
        var bars = document.querySelectorAll(BAR_SEL);
        for (var i = 0; i < bars.length; i++) attach(bars[i]);
        relayoutAll();
    }

    window.TMR = window.TMR || {};
    window.TMR.initMarketNav = init;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    // The board sits in a tab pane that can be hidden at first paint, and the
    // webfont swap changes tab widths; re-measure once both have settled.
    window.addEventListener('load', relayoutAll);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayoutAll);
    setTimeout(init, 1200);
    setTimeout(init, 3000);
})();
