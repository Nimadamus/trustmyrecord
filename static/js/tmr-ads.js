/* =============================================================================
   TrustMyRecord: MANUAL ADSENSE PLACEMENTS  (tmr-ads.js)
   -----------------------------------------------------------------------------
   Loaded by tmr-linkhub.js and tmr-gamefile.js. This file owns every ad rule on
   the site: which pages, which spot, which ad unit. Nothing else places ads, and
   AdSense Auto Ads stay OFF in the AdSense account.

   Stage 1 placements (one per page, a second only on long matchup pages):
     home        homepage, between "More on the platform" and the final CTA
     article     handicapping matchup pages and Matchup of the Day articles,
                 between editorial sections after several have rendered
     article2    Matchup of the Day articles with 8+ sections only, four sections
                 below the first ad (matchup pages stop at one)
     leaderboard /leaderboards/, below every ranking panel
     (around-the-web profiles hydrate into the tabbed profile app with wallet
      and pick panels, so they carry no ad)

   Rules that keep ads out of the product:
     - BLOCKED paths never load this file's ads (sportsbook, wallet, auth, picks,
       simulators, contests, affiliate sportsbook pages, admin, messages).
     - A placement is only revealed while its insertion point is still BELOW the
       viewport, so revealing it can never move content the reader is looking at.
     - The frame gets a fixed pixel size before the ad requests, so the ad
       loading can never shift the page (Google's documented CSS sizing, with
       data-ad-format removed).
     - adsbygoogle.js is requested only when the first placement is about to be
       revealed; pages where no placement qualifies make no Google ad request.

   Switches:
     ENABLED                  false stops every ad request
     SLOTS[key] empty         that placement stays off even when ENABLED
     ?tmr_ads=preview         draws labelled grey boxes in the real spots, no Google
     ?tmr_ads=off             disables ads for that page view
   ============================================================================= */
(function () {
    'use strict';
    if (window.__tmrAds) return;
    window.__tmrAds = true;

    var CLIENT = 'ca-pub-3995543166394162';
    var ENABLED = true;
    var SLOTS = {
        home: '1899274090',         /* tmr-home-lower */
        article: '9142892189',      /* tmr-article-mid */
        article2: '3890565501',     /* tmr-article-lower */
        leaderboard: '3030366247'   /* tmr-leaderboard-lower */
    };

    var mode = '';
    try { mode = new URLSearchParams(location.search).get('tmr_ads') || ''; } catch (e) {}
    var preview = mode === 'preview';
    if (mode === 'off' || (!ENABLED && !preview)) return;

    var path = location.pathname.replace(/index\.html$/, '');
    if (path.charAt(path.length - 1) !== '/') path += '/';

    var BLOCKED = /^\/(sportsbook|login|signin|signup|register|join|reset-password|activation|account|wallet|withdraw|withdrawals|store|coin|premium|checkout|admin|make-picks|my-pending-picks|mypicks|my-record|pick|picks|messages|notifications|chat|dashboard|settings|marketplace|best-online-sportsbooks|promos|contest|contests|line-shopping|challenges|arena|model-builder|[a-z0-9-]*simulator[a-z0-9-]*)\//;
    if (BLOCKED.test(path)) return;

    /* Direct children of `parent` matching `selector`, in document order. */
    function kids(parent, selector) {
        if (!parent) return [];
        return Array.prototype.filter.call(parent.children, function (el) {
            return el.matches(selector);
        });
    }

    /* Each page type returns a list of { key, anchor, where } insertion points. */
    var PAGES = [
        {
            test: /^\/$/,
            find: function () {
                var explore = document.querySelector('section.explore');
                var fin = document.querySelector('section.final');
                return explore && fin ? [{ key: 'home', anchor: explore, where: 'after' }] : [];
            }
        },
        {
            test: /^\/handicapping\/[a-z0-9-]+\/[a-z0-9-]+\/$/,
            find: function () {
                var secs = kids(document.querySelector('main.hx-wrap'), 'section.hx-sec');
                if (!secs.length) secs = kids(document.querySelector('main.mm-shell'), 'section.mm-sec');
                return sectioned(secs, 5, 2, 10, 6);
            }
        },
        {
            test: /^\/matchup-of-the-day\/[a-z0-9-]+\/$/,
            find: function () {
                var main = document.querySelector('main.ed');
                return sectioned(main ? main.querySelectorAll('section.gf-sect') : [], 4, 1, 8, 5);
            }
        },
        {
            test: /^\/leaderboards\/$/,
            find: function () {
                var related = document.querySelector('main section.lb-related');
                return related ? [{ key: 'leaderboard', anchor: related, where: 'before' }] : [];
            }
        }
    ];

    /* First ad after section `at` once the page has `min` sections; a second
       after section `at2` only when it has `min2` or more. */
    function sectioned(list, min, at, min2, at2) {
        list = Array.prototype.slice.call(list);
        var out = [];
        if (list.length >= min) out.push({ key: 'article', anchor: list[at], where: 'after' });
        if (list.length >= min2) out.push({ key: 'article2', anchor: list[at2], where: 'after' });
        return out;
    }

    var page = null;
    for (var i = 0; i < PAGES.length; i++) {
        if (PAGES[i].test.test(path)) { page = PAGES[i]; break; }
    }
    if (!page) return;

    var CSS =
        '.tmr-ad{display:block;clear:both;box-sizing:border-box;max-width:970px;margin:40px auto;padding:0;text-align:center}' +
        '.tmr-ad-label{font:600 11px/1.2 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.12em;text-transform:uppercase;opacity:.55;margin:0 0 8px}' +
        '.tmr-ad-frame{display:block;margin:0 auto;overflow:hidden}' +
        '.tmr-ad-frame ins.adsbygoogle{display:inline-block}' +
        '.tmr-ad-preview{display:flex;align-items:center;justify-content:center;width:100%;height:100%;box-sizing:border-box;border:2px dashed rgba(120,140,160,.6);border-radius:10px;background:rgba(120,140,160,.12);font:600 13px/1.3 Inter,system-ui,sans-serif;color:inherit;opacity:.8}' +
        '@media (max-width:767px){.tmr-ad{margin:24px auto}}';

    function addStyle() {
        if (document.getElementById('tmr-ads-css')) return;
        var st = document.createElement('style');
        st.id = 'tmr-ads-css';
        st.textContent = CSS;
        document.head.appendChild(st);
    }

    var libRequested = false;
    function loadLib() {
        if (libRequested) return;
        libRequested = true;
        var s = document.createElement('script');
        s.async = true;
        s.crossOrigin = 'anonymous';
        s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + CLIENT;
        document.head.appendChild(s);
    }

    /* Standard IAB sizes that fit the column the ad actually sits in. */
    function sizeFor(width) {
        if (width >= 970) return [970, 250];
        if (width >= 728) return [728, 250];
        if (width >= 336) return [336, 280];
        if (width >= 300) return [300, 250];
        return null;
    }

    function place(spot) {
        var slot = SLOTS[spot.key];
        if (!spot.anchor || !spot.anchor.parentNode || (!preview && !slot)) return;

        var box = document.createElement('aside');
        box.className = 'tmr-ad';
        box.setAttribute('aria-label', 'Advertisements');
        box.setAttribute('data-tmr-ad', spot.key);
        box.hidden = true;
        if (spot.where === 'before') spot.anchor.parentNode.insertBefore(box, spot.anchor);
        else spot.anchor.parentNode.insertBefore(box, spot.anchor.nextSibling);

        var io = new IntersectionObserver(function (entries) {
            if (!entries[0].isIntersecting) return;
            io.disconnect();
            reveal(box, spot, slot);
        }, { rootMargin: '0px 0px 900px 0px' });
        io.observe(spot.anchor);
    }

    function reveal(box, spot, slot) {
        /* Insertion point already on screen or scrolled past: showing the ad now
           would push visible content, so this page view goes without it. */
        var edge = spot.where === 'before'
            ? spot.anchor.getBoundingClientRect().top
            : spot.anchor.getBoundingClientRect().bottom;
        if (edge < window.innerHeight) { box.remove(); return; }

        /* Measure the box itself (margins, padding and max-width applied), still
           below the fold, so the chosen size can never be cropped. */
        box.hidden = false;
        var size = sizeFor(Math.min(box.getBoundingClientRect().width, 970));
        if (!size) { box.remove(); return; }

        var frame = document.createElement('div');
        frame.className = 'tmr-ad-frame';
        frame.style.width = size[0] + 'px';
        frame.style.height = size[1] + 'px';

        var label = document.createElement('div');
        label.className = 'tmr-ad-label';
        label.textContent = 'Advertisements';

        box.appendChild(label);
        box.appendChild(frame);

        if (preview) {
            frame.innerHTML = '<div class="tmr-ad-preview">Ad placement: ' + spot.key + ' (' + size[0] + '&times;' + size[1] + ')</div>';
            return;
        }

        var ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.width = size[0] + 'px';
        ins.style.height = size[1] + 'px';
        ins.setAttribute('data-ad-client', CLIENT);
        ins.setAttribute('data-ad-slot', slot);
        frame.appendChild(ins);

        /* No fill: collapse only while the box is still below the fold. */
        new MutationObserver(function (m, obs) {
            if (ins.getAttribute('data-ad-status') !== 'unfilled') return;
            obs.disconnect();
            if (box.getBoundingClientRect().top > window.innerHeight) box.remove();
        }).observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });

        loadLib();
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    }

    function start() {
        if (!('IntersectionObserver' in window)) return;
        var spots = [];
        try { spots = page.find(); } catch (e) { return; }
        if (!spots.length) return;
        addStyle();
        spots.forEach(function (spot) { try { place(spot); } catch (e) {} });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
