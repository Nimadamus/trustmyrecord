/* SITEWIDE_APLUS_20261113. Decorative only: marks the page hero and gives it the stadium stage used by
   Bet Legend Pro and /premium/. No content, link or behaviour changes. Runs on body.tmr-aplus pages. */
(function () {
    function run() {
        var b = document.body;
        if (!b || !b.classList.contains('tmr-aplus') || document.querySelector('.aplus-hero')) return;
        var h1 = document.querySelector('main h1, .page h1, body > section h1, body > div h1, h1');
        if (!h1) return;
        var hero = h1.closest('.ss-hero, .as-hero, .tmr-page-header, .hero, .page-hero, .page-header, header.tmr-hero, [class*="-hero"], [class*="hero-"], section, header');
        if (!hero || hero === b || hero.tagName === 'MAIN' || hero.closest('nav, .tmr-ds-nav, #tmr-global-nav')) hero = h1.parentElement;
        if (!hero || hero === b) return;
        /* a title row is not the hero: grow to the block that also holds the lead text and actions */
        while (hero.offsetHeight < 180 && hero.parentElement && !/^(MAIN|BODY)$/.test(hero.parentElement.tagName) &&
               hero.parentElement.querySelectorAll('h1').length === 1 && hero.parentElement.offsetHeight < 900) hero = hero.parentElement;
        if (hero.offsetHeight > 1000 && h1.parentElement) {
            /* the h1 sits in a whole page shell: wrap only the intro (kicker, crumbs, h1, lead, actions) */
            var par = h1.parentElement, first = h1, last = h1, n = 0, el;
            while ((el = first.previousElementSibling) && n < 3 && !/^(H2|SECTION|TABLE|SCRIPT|STYLE)$/.test(el.tagName) && el.offsetHeight < 140) { first = el; n++; }
            while ((el = last.nextElementSibling) && !/^(H2|H3|SECTION|TABLE|SCRIPT|STYLE)$/.test(el.tagName) && !el.querySelector('h2, h3, table, section') && el.offsetHeight < 400) last = el;
            var wrap = document.createElement('div'), cur = first, stop = last.nextElementSibling;
            par.insertBefore(wrap, first);
            while (cur && cur !== stop) { var nx = cur.nextElementSibling; wrap.appendChild(cur); cur = nx; }
            hero = wrap;
        }
        hero.classList.add('aplus-hero');
        h1.classList.add('aplus-h1');
        var st = document.createElement('div');
        st.className = 'aplus-stage';
        st.setAttribute('aria-hidden', 'true');
        st.innerHTML = '<i class="ap-photo"></i><i class="ap-shade"></i><i class="ap-glow"></i><i class="ap-floor"></i><i class="ap-emblem"></i>';
        hero.insertBefore(st, hero.firstChild);
    }
    /* Pages that came back from the old light layer can keep a few light panels or inputs from their own
       inline CSS. Turn those into dark glass, and lift dark text inside them, so nothing reads as a white hole. */
    function lum(c) { var m = c && c.match(/[\d.]+/g); if (!m || (m.length > 3 && +m[3] < 0.5)) return -1; return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; }
    function darkfix() {
        if (!document.body || !document.body.classList.contains('tmr-aplus')) return;
        var skip = /^(IMG|SVG|CANVAS|VIDEO|PICTURE|IFRAME|BUTTON|A|path|I|svg)$/;
        document.querySelectorAll('body *').forEach(function (e) {
            if (skip.test(e.tagName) || e.closest('nav, header.tmr-ds-header, #tmr-global-nav, .tmr-ds-nav, [class*="live-chat"], .aplus-stage')) return;
            var cs = getComputedStyle(e);
            var bi = cs.backgroundImage, lightImg = false;
            if (bi !== 'none') {
                if (bi.indexOf('url(') >= 0) return;
                var cols = bi.match(/rgba?\([^)]*\)/g) || [];
                lightImg = cols.length > 0 && cols.every(function (c) { var l = lum(c); return l < 0 || l >= 215; }) && cols.some(function (c) { return lum(c) >= 215; });
                if (!lightImg) return;
            } else if (lum(cs.backgroundColor) < 215) return;
            var r = e.getBoundingClientRect();
            if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName)) { if (e.type !== 'checkbox' && e.type !== 'radio') e.classList.add('aplus-fieldfix'); return; }
            if (r.width < 120 || r.height < 24) return;
            e.classList.add('aplus-darkfix');
            e.querySelectorAll('*').forEach(function (k) { var l = lum(getComputedStyle(k).color); if (l >= 0 && l < 110) k.classList.add('aplus-inkfix'); });
            var l0 = lum(cs.color); if (l0 >= 0 && l0 < 110) e.classList.add('aplus-inkfix');
        });
    }
    function bgOf(e) {
        for (var p = e; p && p !== document.documentElement; p = p.parentElement) {
            var c = getComputedStyle(p); if (c.backgroundImage !== 'none' && c.backgroundImage.indexOf('gradient') >= 0) { var m = c.backgroundImage.match(/rgba?\([^)]*\)/); if (m && lum(m[0]) >= 0) return lum(m[0]); }
            var l = lum(c.backgroundColor); if (l >= 0) return l;
        }
        return 10;
    }
    function inkfix() {
        if (!document.body || !document.body.classList.contains('tmr-aplus')) return;
        document.querySelectorAll('main *, .aplus-hero *, body > section *, body > div *').forEach(function (e) {
            if (/^(SCRIPT|STYLE|SVG|path|IMG)$/.test(e.tagName) || e.classList.contains('aplus-inkfix')) return;
            var has = false; for (var n = e.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) { has = true; break; }
            if (!has) return;
            var l = lum(getComputedStyle(e).color); if (l < 0 || l >= 95) return;
            if (bgOf(e) < 70) e.classList.add('aplus-inkfix');
        });
    }
    function boot() { run(); darkfix(); inkfix(); setTimeout(function () { darkfix(); inkfix(); }, 1500); setTimeout(function () { darkfix(); inkfix(); }, 4000); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
