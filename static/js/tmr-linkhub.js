/* =============================================================================
   TrustMyRecord — INTERNAL LINKING / NAVIGATION HUB  (tmr-linkhub.js)
   -----------------------------------------------------------------------------
   One shared component, loaded by every public page, that guarantees three
   things the site was missing:

     1. A HOME PATH ON EVERY PAGE. Every public page gets a breadcrumb bar whose
        first crumb is a prominent, always-visible link to https://trustmyrecord.com/.
        If a page already ships its own breadcrumb trail (forum threads, forum
        categories) the home crumb is prepended to that existing trail instead of
        adding a second one.

     2. CONTEXTUAL INTERNAL LINKS. A "More on TrustMyRecord" block is appended to
        the main content with a link set chosen by section — forum pages reach
        handicappers/sportsbook/leaderboards/tools/challenges/sports hubs,
        profiles reach that user's picks/record/posts/followers/storefront, tool
        pages reach their sport hub and forum category, articles reach their
        category and siblings. Pages stop being dead ends.

     3. A FOOTER EVERYWHERE. Pages with no footer at all get a compact global one
        linking home plus every major section.

   RULES THIS FILE OBEYS:
     * Additive only. It never removes, hides, renames, or redirects anything,
       and it never emits a noindex.
     * Idempotent and deferential. If the page already has a nav, a breadcrumb,
       a related block, or a footer, the corresponding piece is skipped or merged
       rather than duplicated. The two existing shells (tmr-sitewide.js and
       tmr-ds-nav.js) both inject their own footer, so the footer step runs after
       window load and bails the moment it sees one.
     * Every href below points at a route that already exists in this repo.

   Created Jul 21, 2026.
   ============================================================================= */
(function () {
    'use strict';

    if (window.__TMR_LINKHUB__) return;
    window.__TMR_LINKHUB__ = true;

    var HOME = 'https://trustmyrecord.com/';

    /* --- helpers ---------------------------------------------------------- */

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function qs(sel, root) { return (root || document).querySelector(sel); }

    function segments() {
        return location.pathname.split('/').filter(Boolean);
    }

    function titleize(slug) {
        return String(slug || '')
            .replace(/[-_]+/g, ' ')
            .replace(/\.html$/i, '')
            .replace(/\b\w/g, function (m) { return m.toUpperCase(); })
            .trim();
    }

    function param(name) {
        try { return new URLSearchParams(location.search).get(name) || ''; }
        catch (e) { return ''; }
    }

    /* TMR pages are a mix of the classic light forum skin and the dark design
       system, so the injected blocks pick their palette from the container they
       are actually sitting in.

       Order matters. The first opaque background-color up the tree is the real
       backdrop and is checked first. Only when nothing up the chain paints an
       opaque background — pages whose backdrop is a `background:` shorthand
       carrying a gradient, which leaves computed background-color transparent
       all the way to <html> — do we fall back to the container's text colour,
       which those skins always set explicitly. */
    function lum(rgb) {
        var m = rgb && rgb.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        var p = m[1].split(',').map(parseFloat);
        if (p.length > 3 && p[3] < 0.1) return null;
        return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
    }

    function tone(el) {
        var node = el || document.body;

        var probe = node;
        while (probe) {
            var bgLum = lum(getComputedStyle(probe).backgroundColor);
            if (bgLum !== null) return bgLum > 0.5 ? 'light' : 'dark';
            probe = probe.parentElement;
        }

        var textLum = lum(getComputedStyle(node).color);
        if (textLum !== null) return textLum > 0.5 ? 'dark' : 'light';
        return 'dark';
    }

    /* --- label map -------------------------------------------------------- */
    /* Only slugs whose title-cased form would be wrong or unhelpful. */
    var LABELS = {
        'u': 'Handicappers',
        'forum': 'Forum',
        'forums': 'Forum',
        'thread': 'Threads',
        'sports-talk': 'Sports Talk',
        'mlb': 'MLB',
        'nba': 'NBA',
        'nfl': 'NFL',
        'nhl': 'NHL',
        'ncaa': 'NCAA',
        'mma': 'MMA',
        'ufc': 'UFC',
        'roi': 'ROI',
        'usercp': 'User Control Panel',
        'mypicks': 'My Picks',
        'my-record': 'My Record',
        'my-pending-picks': 'My Pending Picks',
        'how-it-works': 'How It Works',
        'how-grading-works': 'How Grading Works',
        'dmca': 'DMCA',
        'faq': 'FAQ',
        'nfl-simulator': 'NFL Simulator',
        'mlb-simulator': 'MLB Simulator',
        'mlb-game-simulator': 'MLB Game Simulator',
        'mlb-season-simulator': 'MLB Season Simulator',
        'mlb-playoff-simulator': 'MLB Playoff Simulator',
        'mlb-pick-tracker': 'MLB Pick Tracker',
        'nba-pick-tracker': 'NBA Pick Tracker',
        'nfl-pick-tracker': 'NFL Pick Tracker',
        'nhl-pick-tracker': 'NHL Pick Tracker',
        'soccer-pick-tracker': 'Soccer Pick Tracker',
        'mlb-handicappers': 'MLB Handicappers',
        'nba-handicappers': 'NBA Handicappers',
        'nfl-handicappers': 'NFL Handicappers',
        'mlb-the-show-stat-league': 'MLB The Show Stat League',
        'online-gaming': 'MLB The Show',
        'polls-trivia': 'Polls & Trivia',
        'trustmyrecord-tools': 'Tools',
        'sell-sports-picks': 'Sell Sports Picks',
        'sell-your-picks': 'Sell Your Picks',
        'sports-betting-roi-explained': 'Sports Betting ROI Explained'
    };

    function label(slug) {
        return LABELS[slug] || titleize(slug);
    }

    /* --- link sets -------------------------------------------------------- */

    var SPORT_HUB = {
        mlb: ['/handicapping/mlb/', 'MLB Handicapping Hub'],
        nba: ['/nba-pick-tracker/', 'NBA Pick Tracker'],
        nfl: ['/nfl-pick-tracker/', 'NFL Pick Tracker'],
        nhl: ['/nhl-pick-tracker/', 'NHL Pick Tracker'],
        soccer: ['/soccer-pick-tracker/', 'Soccer Pick Tracker']
    };

    var CORE = [
        ['/sportsbook/', 'Sportsbook'],
        ['/leaderboards/', 'Leaderboards'],
        ['/handicappers/', 'Find Handicappers'],
        ['/tools/', 'Tools & Simulators'],
        ['/challenges/', 'Challenges'],
        ['/forum/', 'Forum']
    ];

    /* Section => contextual link set. Keyed by first path segment. */
    var RELATED = {
        'forum': [
            ['/forum/', 'All forum boards'],
            ['/handicappers/', 'Verified handicappers'],
            ['/leaderboards/', 'Leaderboards'],
            ['/sportsbook/', 'Make a verified pick'],
            ['/tools/', 'Tools & simulators'],
            ['/challenges/', 'Challenges'],
            ['/marketplace/', 'Pick marketplace'],
            ['/sports-talk/', 'Sports Talk'],
            ['/forum/mlb/', 'MLB board'],
            ['/forum/nba/', 'NBA board'],
            ['/forum/nfl/', 'NFL board'],
            ['/forum/nhl/', 'NHL board']
        ],
        'forums': null,        /* alias, resolved to 'forum' below */
        'sports-talk': [
            ['/forum/', 'Betting forum'],
            ['/chat/', 'Live chat'],
            ['/handicappers/', 'Verified handicappers'],
            ['/leaderboards/', 'Leaderboards'],
            ['/polls/', 'Polls'],
            ['/trivia/', 'Trivia']
        ],
        'handicappers': [
            ['/leaderboards/', 'Leaderboards'],
            ['/sportsbook/', 'Sportsbook'],
            ['/mlb-handicappers/', 'MLB handicappers'],
            ['/nba-handicappers/', 'NBA handicappers'],
            ['/nfl-handicappers/', 'NFL handicappers'],
            ['/forum/', 'Forum'],
            ['/how-it-works/', 'How verification works'],
            ['/marketplace/', 'Pick marketplace']
        ],
        'leaderboards': [
            ['/handicappers/', 'Find handicappers'],
            ['/sportsbook/', 'Sportsbook'],
            ['/mlb-pick-tracker/', 'MLB pick tracker'],
            ['/nba-pick-tracker/', 'NBA pick tracker'],
            ['/nfl-pick-tracker/', 'NFL pick tracker'],
            ['/nhl-pick-tracker/', 'NHL pick tracker'],
            ['/challenges/', 'Challenges'],
            ['/forum/', 'Forum']
        ],
        'sportsbook': [
            ['/my-record/', 'My record'],
            ['/mypicks/', 'My picks'],
            ['/leaderboards/', 'Leaderboards'],
            ['/handicapping/', 'Handicapping Hub'],
            ['/tools/', 'Tools & simulators'],
            ['/challenges/', 'Challenges'],
            ['/forum/', 'Forum'],
            ['/how-grading-works/', 'How grading works']
        ],
        'handicapping': [
            ['/sportsbook/', 'Sportsbook'],
            ['/tools/', 'Tools & simulators'],
            ['/mlb-simulator/', 'MLB simulator'],
            ['/trendspotter/', 'TrendSpotter'],
            ['/forum/mlb/', 'MLB forum board'],
            ['/leaderboards/', 'Leaderboards'],
            ['/handicappers/', 'Verified handicappers']
        ],
        'tools': [
            ['/mlb-simulator/', 'MLB simulator'],
            ['/nfl-simulator/', 'NFL simulator'],
            ['/trendspotter/', 'TrendSpotter'],
            ['/model-builder/', 'Model builder'],
            ['/handicapping/', 'Handicapping Hub'],
            ['/sportsbook/', 'Sportsbook'],
            ['/forum/strategy/', 'Strategy forum'],
            ['/leaderboards/', 'Leaderboards']
        ],
        'challenges': [
            ['/sportsbook/', 'Sportsbook'],
            ['/leaderboards/', 'Leaderboards'],
            ['/contests/', 'Contests'],
            ['/handicappers/', 'Handicappers'],
            ['/forum/', 'Forum'],
            ['/rules/', 'Rules']
        ],
        'contests': [
            ['/challenges/', 'Challenges'],
            ['/leaderboards/', 'Leaderboards'],
            ['/sportsbook/', 'Sportsbook'],
            ['/forum/', 'Forum'],
            ['/rules/', 'Rules']
        ],
        'marketplace': [
            ['/handicappers/', 'Verified handicappers'],
            ['/leaderboards/', 'Leaderboards'],
            ['/sell-your-picks/', 'Sell your picks'],
            ['/how-it-works/', 'How it works'],
            ['/forum/', 'Forum'],
            ['/rules/', 'Rules']
        ],
        'picks': [
            ['/sportsbook/', 'Sportsbook'],
            ['/my-record/', 'My record'],
            ['/leaderboards/', 'Leaderboards'],
            ['/handicappers/', 'Handicappers'],
            ['/how-grading-works/', 'How grading works'],
            ['/forum/', 'Forum']
        ],
        'polls': [
            ['/trivia/', 'Trivia'],
            ['/forum/', 'Forum'],
            ['/sports-talk/', 'Sports Talk'],
            ['/leaderboards/', 'Leaderboards']
        ],
        'trivia': [
            ['/polls/', 'Polls'],
            ['/forum/', 'Forum'],
            ['/sports-talk/', 'Sports Talk'],
            ['/leaderboards/', 'Leaderboards']
        ]
    };
    RELATED['forums'] = RELATED['forum'];

    var AUTH_PAGES = /^\/(login|signin|register|signup|account|usercp|verify-email|reset-password|activation|join)\/?$/;

    /* Profile-scoped links: picks, record, posts, followers, storefront. */
    function profileLinks(username) {
        var u = encodeURIComponent(username);
        return [
            /* The profile app deep-links by hash (#record, #charts, ...), not by
               a ?tab= query param — using ?tab= here would silently land on the
               overview tab instead of the requested one. */
            ['/profile/?user=' + u, 'Full profile'],
            ['/profile/?user=' + u + '#record', username + "'s picks & record"],
            ['/profile/?user=' + u + '#charts', 'Performance charts'],
            ['/profile/?user=' + u + '#challenges', 'Challenges entered'],
            ['/marketplace/seller/?u=' + u, 'Pick storefront'],
            ['/forum/', 'Forum posts & threads'],
            ['/leaderboards/', 'Leaderboards'],
            ['/handicappers/', 'All verified handicappers']
        ];
    }

    /* Every page falls back to the core section set rather than nothing. */
    function relatedFor(segs) {
        var first = segs[0] || '';

        if (first === 'u' && segs[1]) return profileLinks(decodeURIComponent(segs[1]));
        if (first === 'profile') {
            var who = param('user');
            return who ? profileLinks(who) : CORE.concat([['/handicappers/', 'Handicappers']]);
        }

        if (RELATED[first]) {
            var set = RELATED[first].slice();
            /* Forum + sport boards also surface that sport's hub. */
            var sport = SPORT_HUB[segs[1]];
            if (first === 'forum' && sport) set.unshift(sport);
            return set;
        }

        /* Sport-slug landing pages / articles: point at the matching hub. */
        var sportMatch = first.match(/^(mlb|nba|nfl|nhl|soccer)\b/);
        if (sportMatch) {
            var s = sportMatch[1];
            var out = [];
            if (SPORT_HUB[s]) out.push(SPORT_HUB[s]);
            out.push(['/forum/' + s + '/', label(s) + ' forum board']);
            out.push(['/' + s + '-pick-tracker/', label(s) + ' pick tracker']);
            return out.concat(CORE);
        }

        return CORE.concat([['/how-it-works/', 'How TrustMyRecord works']]);
    }

    /* --- breadcrumb trail ------------------------------------------------- */

    function homeCrumbHtml() {
        /* Every anchor this file emits carries `tmrlh-a` purely to raise CSS
           specificity: tmr-redesign-overrides.css sets
           `body a:not(.sportsbook-sports-nav a){color:var(--tmr-teal)!important}`,
           which outranks a single-class `.tmrlh-footer a` rule. See the note in
           tmr-linkhub.css. */
        return '<a class="tmrlh-home tmrlh-a" href="' + HOME + '" rel="home" ' +
               'aria-label="TrustMyRecord home">' +
               '<span class="tmrlh-home-mark" aria-hidden="true">TMR</span>' +
               '<span>TrustMyRecord Home</span></a>';
    }

    function trail(segs) {
        var out = [];
        var path = '';

        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];

            /* /forum/thread/<id>/<slug>/ — neither "thread" nor the numeric id
               is a page, so the trail jumps straight from the already-pushed
               Forum crumb to the thread title. */
            if (segs[0] === 'forum' && seg === 'thread') {
                var titleEl = qs('h1');
                var t = titleEl ? titleEl.textContent.trim() : document.title.split('|')[0].trim();
                out.push([null, t]);
                return out;
            }

            /* /u/<username>/ reads as Handicappers > <username>. The bare /u/
               segment is skipped entirely — it is not a page, and buildCrumbs
               supplies the /handicappers/ crumb that stands in for it. */
            if (segs[0] === 'u') {
                if (i === 0) continue;
                out.push([null, decodeURIComponent(seg)]);
                return out;
            }

            path += '/' + seg;
            var isLast = (i === segs.length - 1);
            var text = label(seg.replace(/\.html$/i, ''));
            out.push([isLast ? null : path + '/', text]);
        }
        return out;
    }

    function buildCrumbs() {
        var segs = segments();
        if (!segs.length) return null;                 /* homepage needs no trail */

        var items = trail(segs);
        if (segs[0] === 'u') items.unshift(['/handicappers/', 'Handicappers']);

        var html = homeCrumbHtml();
        for (var i = 0; i < items.length; i++) {
            html += '<span class="tmrlh-sep" aria-hidden="true">&rsaquo;</span>';
            html += items[i][0]
                ? '<a class="tmrlh-a" href="' + esc(items[i][0]) + '">' + esc(items[i][1]) + '</a>'
                : '<span class="tmrlh-current" aria-current="page">' + esc(items[i][1]) + '</span>';
        }

        var nav = document.createElement('nav');
        nav.className = 'tmrlh-crumbs';
        nav.setAttribute('aria-label', 'Breadcrumb');
        nav.setAttribute('data-tmr-linkhub', 'crumbs');
        nav.setAttribute('data-path', location.pathname);
        nav.innerHTML = html;
        return nav;
    }

    /* Breadcrumb trails the site already renders. The aria-labelled ones are the
       baked crawler views; the class-based ones belong to the interactive apps
       (the forum shell's .fcrumb, the profile shell's .u-crumb), which replace
       the baked markup wholesale after they hydrate. Both are adopted rather
       than duplicated. */
    var EXISTING_CRUMB_SEL = [
        '[aria-label="Breadcrumb"]', '[aria-label="breadcrumb"]',
        '.fcrumb', '.ft-crumb', '.fc-crumb', '.u-crumb', '.breadcrumb', '.breadcrumbs'
    ].map(function (s) { return s + ':not(.tmrlh-crumbs)'; }).join(', ');

    /* A page that already has a trail keeps it — we only guarantee the home
       link is the first thing in it. */
    function visible(el) {
        if (!el) return false;
        var r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    /* True only when a home crumb is actually on screen. An adopted trail that
       the host app has since hidden does not count. */
    function haveVisibleCrumbs() {
        var own = qs('.tmrlh-crumbs');
        /* The forum app pushState's between boards without a reload, so a bar
           built for the old path is stale and has to be rebuilt. */
        if (own && own.getAttribute('data-path') !== location.pathname) {
            if (own.parentNode) own.parentNode.removeChild(own);
            own = null;
        }
        if (visible(own)) return true;
        var a = qs('.tmrlh-adopted');
        /* The forum app rewrites .fcrumb's innerHTML on every view change, which
           wipes the home link but leaves our marker class on the node — so the
           marker alone is not proof the crumb is still there. */
        return visible(a) && !!a.querySelector('.tmrlh-home-inline');
    }

    /* Drop the marker from a trail we adopted that is no longer rendered, so the
       next attempt is free to inject our own bar instead. */
    function releaseHiddenAdoption() {
        var a = qs('.tmrlh-adopted');
        if (a && !visible(a)) {
            a.classList.remove('tmrlh-adopted');
            var inline = a.querySelector('.tmrlh-home-inline');
            if (inline && inline.parentNode) inline.parentNode.remove();
        }
    }

    function adoptExistingCrumbs(existing) {
        if (existing.querySelector('.tmrlh-home-inline')) return;
        var first = existing.querySelector('a');
        if (first && (first.getAttribute('href') === '/' || first.getAttribute('href') === HOME)) return;

        var frag = document.createElement('span');
        frag.innerHTML = '<a class="tmrlh-home-inline tmrlh-a" href="' + HOME + '" rel="home">' +
                         '<span class="tmrlh-home-mark" aria-hidden="true">TMR</span>Home</a>' +
                         '<span class="tmrlh-sep" aria-hidden="true"> &rsaquo; </span>';
        existing.insertBefore(frag, existing.firstChild);
        existing.setAttribute('data-tone', tone(existing));
        existing.classList.add('tmrlh-adopted');
    }

    /* --- related block ---------------------------------------------------- */

    function buildRelated(segs) {
        /* The homepage already links to everything, and login/signup/account
           pages are a task the visitor is mid-way through — both get the home
           crumb and the footer, but no extra link rail. */
        if (!segs.length) return null;
        if (AUTH_PAGES.test(location.pathname)) return null;

        var links = relatedFor(segs);
        if (!links || !links.length) return null;

        var seen = {}, html = '';
        for (var i = 0; i < links.length; i++) {
            var href = links[i][0];
            if (seen[href] || href === location.pathname) continue;
            seen[href] = 1;
            html += '<a class="tmrlh-a" href="' + esc(href) + '">' + esc(links[i][1]) + '</a>';
        }
        if (!html) return null;

        var box = document.createElement('section');
        box.className = 'tmrlh-related';
        box.setAttribute('data-tmr-linkhub', 'related');
        box.setAttribute('aria-label', 'More on TrustMyRecord');
        box.innerHTML =
            '<h2>More on TrustMyRecord</h2>' +
            '<p class="tmrlh-related-note">Keep exploring verified records, live boards and the community.</p>' +
            '<nav class="tmrlh-related-links">' + html + '</nav>';
        return box;
    }

    /* --- fallback footer -------------------------------------------------- */

    var FOOTER = [
        ['Platform', [
            ['/sportsbook/', 'Sportsbook'],
            ['/my-record/', 'My Record'],
            ['/mypicks/', 'My Picks'],
            ['/leaderboards/', 'Leaderboards'],
            ['/handicappers/', 'Handicappers'],
            ['/marketplace/', 'Marketplace']
        ]],
        ['Explore', [
            ['/handicapping/', 'Handicapping Hub'],
            ['/tools/', 'Tools & Simulators'],
            ['/mlb-simulator/', 'MLB Simulator'],
            ['/nfl-simulator/', 'NFL Simulator'],
            ['/trendspotter/', 'TrendSpotter'],
            ['/predictions/', 'Predictions']
        ]],
        ['Community', [
            ['/forum/', 'Forum'],
            ['/sports-talk/', 'Sports Talk'],
            ['/chat/', 'Chat'],
            ['/challenges/', 'Challenges'],
            ['/contests/', 'Contests'],
            ['/polls/', 'Polls']
        ]],
        ['Support', [
            ['/how-it-works/', 'How It Works'],
            ['/how-grading-works/', 'How Grading Works'],
            ['/rules/', 'Rules'],
            ['/contact/', 'Contact'],
            ['/report-bug/', 'Report a Bug'],
            ['/about/', 'About']
        ]]
    ];

    var LEGAL = [
        ['/privacy/', 'Privacy'],
        ['/terms/', 'Terms'],
        ['/dmca/', 'DMCA']
    ];

    function linkList(rows) {
        return rows.map(function (r) {
            return '<a class="tmrlh-a" href="' + esc(r[0]) + '">' + esc(r[1]) + '</a>';
        }).join('');
    }

    function buildFooter() {
        var wrap = document.createElement('div');
        wrap.className = 'tmrlh-footwrap';
        wrap.setAttribute('data-tmr-linkhub', 'footer');
        wrap.innerHTML =
            /* The footer is appended to <body>, so it takes its tone from the
               body backdrop, not from whatever the content column uses. */
            '<footer class="tmrlh-footer" data-tone="' + tone(document.body) + '">' +
              '<div class="tmrlh-footer-in">' +
                '<div class="tmrlh-footer-grid">' +
                  '<div class="tmrlh-footer-brand">' +
                    '<a class="tmrlh-a" href="' + HOME + '" rel="home">' +
                      '<span class="tmrlh-home-mark" aria-hidden="true">TMR</span>TrustMyRecord</a>' +
                    '<p>Every pick timestamped before the game starts. Public records, ' +
                    'public grades, no edits after the fact.</p>' +
                  '</div>' +
                  FOOTER.map(function (sec) {
                      return '<div><h3>' + esc(sec[0]) + '</h3>' +
                             '<div class="tmrlh-footer-links">' + linkList(sec[1]) + '</div></div>';
                  }).join('') +
                '</div>' +
                '<div class="tmrlh-footer-bottom">' +
                  '<nav class="tmrlh-footer-legal" aria-label="Legal">' +
                    '<a class="tmrlh-a" href="' + HOME + '" rel="home">Home</a>' + linkList(LEGAL) +
                  '</nav>' +
                  '<p class="tmrlh-footer-note">TrustMyRecord is not a gambling platform. ' +
                  'No real money is wagered on this site.</p>' +
                '</div>' +
              '</div>' +
            '</footer>';
        return wrap;
    }

    /* --- mount ------------------------------------------------------------ */

    function contentHost() {
        return qs('main') || qs('.fshell') || qs('.container') || document.body;
    }

    function mountCrumbs() {
        var segs = segments();
        var t = tone(contentHost());

        /* Visibility matters: the forum shell ships a .fcrumb node that is only
           populated on a thread view and is display:none on the board index —
           and it is still measurable at DOMContentLoaded, before the app hides
           it. Adopting it silently swallowed the home crumb on /forum/. So we
           only adopt trails that are rendered, and we hand back an adoption the
           app has since hidden. */
        releaseHiddenAdoption();

        var existing = null;
        var candidates = document.querySelectorAll(EXISTING_CRUMB_SEL);
        for (var ci = 0; ci < candidates.length; ci++) {
            if (visible(candidates[ci])) { existing = candidates[ci]; break; }
        }

        if (existing) {
            /* The host app rendered its own trail — ours would be a duplicate. */
            var ours = qs('.tmrlh-crumbs');
            if (ours && ours.parentNode) ours.parentNode.removeChild(ours);
            adoptExistingCrumbs(existing);
        } else if (segs.length && !qs('.tmrlh-crumbs')) {
            var bar = buildCrumbs();
            if (bar) {
                bar.setAttribute('data-tone', t);
                var host = contentHost();

                /* Prefer the top of the content column, because that inherits the
                   page's own width and gutters. But some shells (the profile app)
                   render their hero OUTSIDE <main>, leaving main's top ~1900px
                   down — a breadcrumb buried mid-page is not a way home, so in
                   that case the bar goes into the body flow under the header
                   instead, with its own centred width. */
                var hostTop = host === document.body
                    ? Infinity
                    : host.getBoundingClientRect().top + (window.pageYOffset || 0);

                if (host !== document.body && hostTop < 600) {
                    host.insertBefore(bar, host.firstChild);
                } else {
                    /* Sit under whatever header the page injected, never above it. */
                    var header = qs('.tmr-global-nav, .ds-nav, .tmrfh, header, nav');
                    if (header && header.parentNode === document.body && header.nextSibling) {
                        document.body.insertBefore(bar, header.nextSibling);
                    } else {
                        document.body.insertBefore(bar, document.body.firstChild);
                    }
                    bar.style.margin = '12px auto 16px';
                    bar.style.maxWidth = '1180px';
                    bar.style.width = 'calc(100% - 32px)';
                }
            }
        }
    }

    function mountRelated() {
        if (qs('.tmrlh-related')) return;
        var box = buildRelated(segments());
        if (!box) return;
        var h = contentHost();
        box.setAttribute('data-tone', tone(h));
        if (h === document.body) {
            box.style.margin = '30px auto 0';
            box.style.maxWidth = '1180px';
            box.style.width = 'calc(100% - 32px)';
        }
        h.appendChild(box);
    }

    /* /forum/thread/... and /u/... bake a crawler view that the forum and
       profile apps then replace wholesale once they hydrate, taking our
       breadcrumb with them. Re-mount a bounded number of times so the home crumb
       survives that swap; each attempt adopts the app's own trail if it has one,
       so this can never stack two breadcrumbs. */
    /* The forum and profile shells replace their content — and rewrite their own
       breadcrumb — on every in-app view change, long after load. Rather than
       guess at a settling time, watch the document and restore the home crumb
       whenever it goes missing. Debounced, and a no-op the moment a visible home
       crumb exists, so a busy board costs one cheap selector check. */
    var crumbCheckPending = false;

    function scheduleCrumbCheck() {
        if (crumbCheckPending) return;
        crumbCheckPending = true;
        setTimeout(function () {
            crumbCheckPending = false;
            if (!haveVisibleCrumbs()) {
                try { mountCrumbs(); } catch (e) {}
            }
        }, 400);
    }

    function watchCrumbs() {
        scheduleCrumbCheck();
        if (typeof MutationObserver !== 'function') return;
        new MutationObserver(scheduleCrumbCheck)
            .observe(document.body, { childList: true, subtree: true });
    }


    /* Reconciles rather than fires once. tmr-sitewide.js and tmr-ds-nav.js append
       their footer on their own schedule, and on a hydrating page (a /u/ profile
       on mobile) that can land AFTER ours — which shipped two stacked footers.
       So: if a native footer exists, ours is removed; if none exists, ours is
       added. Safe to call repeatedly. */
    function nativeFooter() {
        var all = document.querySelectorAll('footer');
        for (var i = 0; i < all.length; i++) {
            if (!all[i].closest('.tmrlh-footwrap')) return all[i];
        }
        return null;
    }

    function syncFooter() {
        var ours = qs('.tmrlh-footwrap');
        if (nativeFooter()) {
            if (ours && ours.parentNode) ours.parentNode.removeChild(ours);
            return;
        }
        if (!ours) document.body.appendChild(buildFooter());
    }

    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    ready(function () {
        try { mountCrumbs(); } catch (e) { /* never break the page */ }
        try { mountRelated(); } catch (e) {}

        /* A settling window on top of the observer. The forum board can finish
           rendering with no further DOM mutations, and a hydrating profile can
           append its own footer seconds after load — an observer alone left
           /forum/ with no crumb and /u/ on mobile with two footers in a live
           run. Fifteen one-second reconciles cover both, then it goes quiet and
           the observer handles later in-app navigation. */
        var late = function () {
            try { syncFooter(); } catch (e) {}
            try { watchCrumbs(); } catch (e) {}

            var ticks = 0;
            var timer = setInterval(function () {
                ticks++;
                try { syncFooter(); } catch (e) {}
                try { scheduleCrumbCheck(); } catch (e) {}
                if (ticks >= 15) clearInterval(timer);
            }, 1000);
        };
        if (document.readyState === 'complete') setTimeout(late, 400);
        else window.addEventListener('load', function () { setTimeout(late, 400); });
    });
})();
