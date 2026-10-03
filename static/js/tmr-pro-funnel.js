/* TMR_PRO_FUNNEL_20260929 (Nima 2026-09-29: show the paid products where the traffic already is).

   Loaded on every page by tmr-ds-nav.js; it only acts where it has something real to show:
     - Picks Board (/sportsbook/): on each game that tracked outside handicappers have pending picks on,
       a line "N tracked handicappers have pending picks on this game". Count public, picks locked.
     - Homepage: a live Handicapper Watchdog block with real counts from the Watchdog.
     - Handicappers Around the Web: "N pending" on every tracked handicapper with open picks.
     - Leaderboards: a live Watchdog line (member picks stay private until kickoff, so members get no badge).
   Every one of them opens the same preview: TMR Pro members see the picks, a signed in free member can
   reveal ONE real pick a day, a visitor is asked to create a free account.

   Also: loads GA4 on pages that never had it, and records the funnel source so checkout and purchase events
   say which page and component sent the buyer (window.TMRFunnel.src()).

   Adds nothing to the HTML a crawler reads: every element is created after load, no URL or metadata changes. */
(function () {
    'use strict';
    if (window.TMRFunnel) return;
    var API = 'https://trustmyrecord-api.onrender.com/api';
    var path = (location.pathname || '/').toLowerCase();
    var SRC_KEY = 'tmr_funnel_src';

    /* ------------------------------------------------------------ analytics */
    function ensureGA() {
        if (typeof window.gtag === 'function' || document.querySelector('script[src*="tmr-analytics"]')) return;
        var s = document.createElement('script');
        s.src = '/static/js/tmr-analytics.js?v=d9a28154fb06';
        s.async = true;
        document.head.appendChild(s);
    }
    function src() {
        try { var v = JSON.parse(localStorage.getItem(SRC_KEY) || 'null'); if (v && Date.now() - v.at < 7 * 864e5) return v; } catch (e) { }
        return null;
    }
    function setSrc(component) {
        try { localStorage.setItem(SRC_KEY, JSON.stringify({ src: component, page: location.pathname, at: Date.now() })); } catch (e) { }
    }
    function track(name, params) {
        var p = params || {};
        var s = src();
        p.page_path = p.page_path || location.pathname;
        if (s && !p.funnel_source) { p.funnel_source = s.src; p.funnel_page = s.page; }
        try {
            window.dataLayer = window.dataLayer || [];
            if (typeof window.gtag !== 'function') window.gtag = function () { window.dataLayer.push(arguments); };
            window.gtag('event', name, p);
        } catch (e) { }
    }
    var seen = {};
    function once(name, params) { if (seen[name + (params && params.component || '')]) return; seen[name + (params && params.component || '')] = 1; track(name, params); }

    /* ------------------------------------------------------------ data */
    function S() { return window.TMRSession || null; }
    function api() { var s = S(); return (s && s.api) || API; }
    function signedIn() { var s = S(); return !!(s && s.hasTokens && s.hasTokens()); }
    function authGet(p) { return S().authFetch(api() + p).then(function (r) { return r.json().then(function (b) { b.__status = r.status; return b; }); }); }
    function authPost(p, body) {
        return S().authFetch(api() + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
            .then(function (r) { return r.json().then(function (b) { b.__status = r.status; return b; }); });
    }
    var cache = {};
    function getJSON(p) {
        if (!cache[p]) cache[p] = fetch(api() + p, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); })
            .catch(function (e) { cache[p] = null; throw e; });
        return cache[p];
    }
    var statusP = null;
    function myStatus() {
        if (!signedIn()) return Promise.resolve({ signedIn: false });
        if (!statusP) statusP = authGet('/pro/watchdog/reveal').then(function (b) { b.signedIn = true; return b; }).catch(function () { statusP = null; return { signedIn: true }; });
        return statusP;
    }
    var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); };
    function findGame(games, a, b) {
        var x = norm(a), y = norm(b);
        for (var i = 0; i < games.length; i++) {
            var g = games[i], h = norm(g.home), w = norm(g.away);
            if ((h === x && w === y) || (h === y && w === x)) return g;
        }
        return null;
    }
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var odds = function (o) { return o == null ? '' : (o > 0 ? '+' + o : String(o)); };
    var signed = function (n) { return n == null ? 'n/a' : (n > 0 ? '+' : '') + Number(n).toFixed(2); };
    function kick(iso) { try { return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) + ' PT'; } catch (e) { return ''; } }

    /* ------------------------------------------------------------ styles */
    function injectStyle() {
        if (document.getElementById('tpfStyle')) return;
        var st = document.createElement('style');
        st.id = 'tpfStyle';
        st.textContent = [
            '.tpf-chip{display:inline-flex;align-items:center;gap:8px;margin:8px 0 2px;padding:7px 12px;border-radius:999px;border:1px solid rgba(245,197,66,.55);background:rgba(245,197,66,.10);color:#F5C542;font:700 12.5px/1.2 Inter,system-ui,sans-serif;cursor:pointer;text-align:left}',
            '.tpf-chip:hover{background:rgba(245,197,66,.18)}',
            '.tpf-chipline{display:block;width:100%;padding:0 12px 6px;box-sizing:border-box}',
            '.tpf-chipline .tpf-chip{margin:2px 0 4px;max-width:100%;white-space:normal}',
            '.tpf-chip b{color:#fff}',
            '.tpf-ov{position:fixed;inset:0;z-index:99990;background:rgba(3,10,20,.72);display:flex;align-items:center;justify-content:center;padding:16px}',
            '.tpf-card{width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#0b1a2e;color:#dce8f5;border:1px solid rgba(140,196,255,.25);border-radius:16px;padding:22px;box-shadow:0 30px 80px -20px rgba(0,0,0,.8);font:15px/1.5 Inter,system-ui,sans-serif}',
            '.tpf-card h3{margin:0 0 6px;font:800 21px/1.2 Barlow,Inter,sans-serif;color:#fff}',
            '.tpf-k{font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#F5C542}',
            '.tpf-x{float:right;background:none;border:0;color:#9fb5cc;font-size:24px;cursor:pointer;line-height:1}',
            '.tpf-muted{color:#9fb5cc;font-size:13px}',
            '.tpf-lock{display:flex;gap:10px;align-items:center;padding:10px 12px;border-top:1px solid rgba(140,196,255,.14)}',
            '.tpf-lock span{flex:1;height:9px;border-radius:5px;background:rgba(140,196,255,.18)}',
            '.tpf-box{margin:14px 0;border:1px solid rgba(140,196,255,.2);border-radius:12px;overflow:hidden}',
            '.tpf-pick{padding:14px;border:2px solid #F5C542;border-radius:12px;margin:12px 0;background:rgba(245,197,66,.06)}',
            '.tpf-pick .sel{font:800 20px/1.2 Barlow,Inter,sans-serif;color:#fff}',
            '.tpf-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}',
            '.tpf-stats div{background:rgba(140,196,255,.08);border-radius:8px;padding:8px}',
            '.tpf-stats small{display:block;color:#9fb5cc;font-size:11px;text-transform:uppercase;letter-spacing:.05em}',
            '.tpf-stats b{color:#fff;font-size:15px}',
            '.tpf-btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border-radius:11px;font-weight:800;text-decoration:none;cursor:pointer;border:0;font-size:15px}',
            '.tpf-btn.gold{background:#F5C542;color:#1a1400}',
            '.tpf-btn.ghost{background:transparent;color:#8cc4ff;border:1px solid rgba(140,196,255,.35)}',
            '.tpf-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}',
            '.tpf-live{margin:0 auto;max-width:1180px;padding:22px 20px;border-radius:18px;background:linear-gradient(160deg,#07182A,#0B2A4D);color:#dce8f5;border:1px solid rgba(140,196,255,.2);font:15px/1.5 Inter,system-ui,sans-serif}',
            '.tpf-livewrap{padding:28px 16px 8px}',
            '.tpf-live h2{margin:4px 0 6px;font:800 26px/1.15 Barlow,Inter,sans-serif;color:#fff}',
            '.tpf-nums{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}',
            '.tpf-nums div{flex:1 1 150px;background:rgba(140,196,255,.08);border-radius:12px;padding:12px}',
            '.tpf-nums b{display:block;font:800 26px/1.1 Barlow,Inter,sans-serif;color:#fff;font-variant-numeric:tabular-nums}',
            '.tpf-nums small{color:#9fb5cc;font-size:12.5px}',
            '.tpf-games{display:grid;gap:8px}',
            '.tpf-game{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 12px;border-radius:10px;background:rgba(140,196,255,.06);border:1px solid rgba(140,196,255,.14);cursor:pointer;color:#dce8f5;text-align:left;font:inherit}',
            '.tpf-game:hover{border-color:#F5C542}',
            '.tpf-pill{white-space:nowrap;color:#F5C542;font-weight:800;font-size:13px}',
            '.tpf-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#34d399;margin-right:6px;box-shadow:0 0 0 4px rgba(52,211,153,.18)}',
            '.tpf-atw{margin-left:8px;padding:2px 8px;border-radius:999px;border:1px solid rgba(245,197,66,.55);background:rgba(245,197,66,.10);color:#b8860b;font-size:11.5px;font-weight:800;cursor:pointer;white-space:nowrap}',
            '@media (max-width:560px){.tpf-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.tpf-live h2{font-size:22px}}'
        ].join('\n');
        document.head.appendChild(st);
    }

    /* ------------------------------------------------------------ the preview modal */
    function close(ov) { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); document.removeEventListener('keydown', ov && ov.__k, true); }
    function openModal(html) {
        injectStyle();
        var ov = document.createElement('div');
        ov.className = 'tpf-ov';
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.innerHTML = '<div class="tpf-card"><button type="button" class="tpf-x" aria-label="Close">&times;</button>' + html + '</div>';
        ov.addEventListener('click', function (e) { if (e.target === ov || (e.target.classList && e.target.classList.contains('tpf-x'))) close(ov); });
        ov.__k = function (e) { if (e.key === 'Escape') close(ov); };
        document.addEventListener('keydown', ov.__k, true);
        document.body.appendChild(ov);
        return ov;
    }
    function proCta(component, label) {
        return '<a class="tpf-btn gold" data-tpf-cta="' + esc(component) + '" href="/premium/#pricing">' + esc(label || 'Unlock Handicapper Watchdog') + '</a>';
    }
    function wireCtas(root) {
        [].forEach.call(root.querySelectorAll('[data-tpf-cta]'), function (a) {
            a.addEventListener('click', function () { setSrc(a.getAttribute('data-tpf-cta')); track('tmr_pro_cta_click', { component: a.getAttribute('data-tpf-cta') }); });
        });
    }
    function revealCard(rv, extra) {
        var h = rv.handicapper || {}, p = rv.pick || {}, r = h.record || {};
        var line = [p.selection, p.line != null && String(p.selection || '').indexOf(String(Math.abs(p.line))) < 0 ? p.line : '', odds(p.odds)].filter(Boolean).join(' ');
        return '<div class="tpf-pick"><div class="tpf-k">' + esc(h.name) + ' &middot; ' + esc(h.source || '') + (h.proven ? ' &middot; Proven' : '') + '</div>'
            + '<div class="sel">' + esc(line) + '</div>'
            + '<div class="tpf-muted">' + esc(p.league || '') + ' &middot; ' + esc(p.matchup || '') + ' &middot; ' + esc(p.bet_type || '') + ' &middot; starts ' + esc(kick(p.start)) + '</div>'
            + '<div class="tpf-stats">'
            + '<div><small>Record</small><b>' + (r.w || 0) + '-' + (r.l || 0) + (r.p ? '-' + r.p : '') + '</b></div>'
            + '<div><small>Units</small><b>' + signed(h.units) + 'u</b></div>'
            + '<div><small>ROI</small><b>' + (h.roi == null ? 'n/a' : Number(h.roi).toFixed(1) + '%') + '</b></div>'
            + '<div><small>Streak</small><b>' + (h.streak ? (h.streak > 0 ? 'W' : 'L') + Math.abs(h.streak) : 'n/a') + '</b></div>'
            + '<div><small>Last 10</small><b>' + (h.last10 ? h.last10.w + '-' + h.last10.l : 'n/a') + '</b></div>'
            + '<div><small>Graded picks</small><b>' + (h.graded || 0) + '</b></div></div>'
            + '<div class="tpf-row" style="margin-top:10px">'
            + (p.source_post ? '<a class="tpf-muted" href="' + esc(p.source_post) + '" target="_blank" rel="nofollow noopener">Original post</a>' : '')
            + (h.profile_url ? '<a class="tpf-muted" href="' + esc(h.profile_url.replace(/^https?:\/\/[^/]+/, '')) + '">Full record and history</a>' : '')
            + (p.home && p.away ? '<a class="tpf-muted" data-tpf-blp href="' + blpLink(p) + '">Research this matchup in Bet Legend Pro</a>' : '')
            + '</div></div>' + (extra || '');
    }
    function blpLink(p) {
        var lg = String(p.league || '').toUpperCase();
        var sport = { NFL: 'NFL', NBA: 'NBA', MLB: 'MLB', NHL: 'NHL' }[lg];
        return '/betlegend-pro/app/' + (sport ? '?sport=' + sport + '&away=' + encodeURIComponent(p.away) + '&home=' + encodeURIComponent(p.home) : '');
    }
    function lockedRows(n) {
        var h = '';
        for (var i = 0; i < Math.min(n, 5); i++) h += '<div class="tpf-lock">&#128274;<span></span><span style="flex:.5"></span><span style="flex:.3"></span></div>';
        return h ? '<div class="tpf-box">' + h + '</div>' : '';
    }

    /* opts: {game: {home, away, league, start, handicappers, picks}} or {key, name, pending} ; component */
    function preview(opts) {
        var comp = opts.component || 'unknown';
        setSrc(comp);
        track('watchdog_preview_click', { component: comp });
        var g = opts.game, what = g ? esc(g.away) + ' at ' + esc(g.home) : esc(opts.name || 'this handicapper');
        var count = g ? g.handicappers : (opts.pending || 1);
        var head = '<div class="tpf-k">Handicapper Watchdog &middot; live</div><h3>' + what + '</h3>'
            + '<p class="tpf-muted">' + (g ? count + ' handicapper' + (count === 1 ? ' outside TMR has a' : 's outside TMR have') + ' pending pick' + (g.picks === 1 ? '' : 's') + ' on this game' + (g.proven ? ', ' + g.proven + ' of them proven (25+ graded picks)' : '') + '.'
                : count + ' pending pick' + (count === 1 ? '' : 's') + ' right now.') + ' Collected from Covers, X, Reddit and other public sources, with each handicapper&#39;s graded record.</p>';
        var ov = openModal(head + '<div id="tpfBody"><p class="tpf-muted">Loading&hellip;</p></div>');
        var body = ov.querySelector('#tpfBody');
        myStatus().then(function (st) {
            if (st.pro) {
                return authPost('/pro/watchdog/reveal', g ? { home: g.home, away: g.away, source: comp } : { key: opts.key, source: comp }).then(function (r) {
                    body.innerHTML = r.reveal ? revealCard(r.reveal) + '<div class="tpf-row"><a class="tpf-btn gold" href="/premium/#board">Open the full Watchdog board</a></div>'
                        : '<p>No pending pick is open for this right now.</p>';
                });
            }
            track('watchdog_paywall_view', { component: comp, signed_in: st.signedIn ? 'yes' : 'no' });
            if (!st.signedIn) {
                body.innerHTML = lockedRows(count)
                    + '<p><b>Create a free account</b> and reveal one real Watchdog pick every day: handicapper, exact pick, record, units and streak.</p>'
                    + '<div class="tpf-row"><a class="tpf-btn ghost" data-tpf-signup href="/register/?return=' + encodeURIComponent(location.pathname) + '">Create free account</a>'
                    + proCta(comp, 'Unlock all picks with TMR Pro') + '</div>'
                    + '<p class="tpf-muted" style="margin-top:10px">TMR Pro: every pending pick from every tracked handicapper, full histories and records, $49.99/month or $500/year.</p>';
                wireCtas(body);
                return;
            }
            if (st.used) {
                body.innerHTML = '<p><b>You&#39;ve used today&#39;s free Watchdog reveal.</b> ' + (st.total_picks || 'More') + ' tracked picks are pending right now.</p>'
                    + (st.reveal ? '<p class="tpf-muted">Your reveal today:</p>' + revealCard(st.reveal) : '') + lockedRows(count)
                    + '<div class="tpf-row">' + proCta(comp, 'Unlock all picks with TMR Pro') + '</div>';
                wireCtas(body);
                return;
            }
            body.innerHTML = lockedRows(count)
                + '<p><b>You have 1 free reveal today.</b> See one real pick' + (g ? ' on this game' : ' from ' + esc(opts.name || 'this handicapper')) + ', with the handicapper&#39;s record, units and streak.</p>'
                + '<div class="tpf-row"><button type="button" class="tpf-btn gold" id="tpfReveal">Reveal 1 pick free</button>' + proCta(comp, 'Unlock all with TMR Pro').replace('tpf-btn gold', 'tpf-btn ghost') + '</div>';
            wireCtas(body);
            body.querySelector('#tpfReveal').addEventListener('click', function (e) {
                e.target.disabled = true; e.target.textContent = 'Revealing…';
                authPost('/pro/watchdog/reveal', g ? { home: g.home, away: g.away, source: comp } : { key: opts.key, source: comp }).then(function (r) {
                    statusP = null;
                    if (r.reveal) {
                        track('watchdog_free_reveal', { component: comp, already_used: r.__status === 409 ? 'yes' : 'no' });
                        body.innerHTML = revealCard(r.reveal)
                            + '<p><b>You&#39;ve used today&#39;s free Watchdog reveal.</b> ' + Math.max(0, (r.total_picks || 1) - 1) + ' more tracked picks are available right now.</p>'
                            + '<div class="tpf-row">' + proCta(comp, 'Unlock all picks with TMR Pro') + '</div>';
                        wireCtas(body);
                    } else {
                        body.innerHTML = '<p>That pick just closed. The board changes as games start.</p>';
                    }
                }).catch(function () { body.innerHTML = '<p>The Watchdog could not answer right now. Try again in a minute.</p>'; });
            });
        }).catch(function () { body.innerHTML = '<p>The Watchdog could not answer right now. Try again in a minute.</p>'; });
    }

    /* ------------------------------------------------------------ picks board */
    function mountBoard() {
        var host = document.getElementById('sbnBoardRows') || document.getElementById('sbnBoard');
        if (!host) return false;
        injectStyle();
        getJSON('/pro/watchdog/games').then(function (d) {
            var games = d.games || [];
            if (!games.length) return;
            function paint() {
                [].forEach.call(document.querySelectorAll('article.sbn-row'), function (row) {
                    if (row.querySelector('.tpf-chipline')) return;
                    var bs = row.querySelectorAll('.sbn-rowmatch b');
                    if (bs.length < 2) return;
                    var g = findGame(games, bs[0].textContent, bs[bs.length - 1].textContent);
                    if (!g) return;
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'tpf-chip';
                    btn.innerHTML = '<span>&#128274; <b>' + g.handicappers + '</b> handicapper' + (g.handicappers === 1 ? ' outside TMR has a pending pick' : 's outside TMR have pending picks') + ' on this game' + (g.proven ? ' &middot; <b>' + g.proven + ' proven</b> (25+ graded picks)' : '') + ' &middot; <u>See who and what they picked</u></span>';
                    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); preview({ game: g, component: 'picks_board_game' }); });
                    var wrap = document.createElement('div');
                    wrap.className = 'tpf-chipline';
                    wrap.appendChild(btn);
                    var top = row.querySelector('.sbn-rowtop');
                    if (top && top.parentNode === row) row.insertBefore(wrap, top.nextSibling); else row.appendChild(wrap);
                    once('tmr_pro_impression', { component: 'picks_board_game' });
                });
            }
            paint();
            new MutationObserver(function () { clearTimeout(paint.t); paint.t = setTimeout(paint, 250); }).observe(host.parentNode || host, { childList: true, subtree: true });
        }).catch(function () { });
        return true;
    }

    /* ------------------------------------------------------------ homepage */
    function mountHome() {
        var hero = document.querySelector('section.hero');
        if (!hero || document.getElementById('tpfLive')) return;
        injectStyle();
        Promise.all([getJSON('/pro/pending-board/summary'), getJSON('/pro/watchdog/games').catch(function () { return { games: [] }; })]).then(function (r) {
            var sm = r[0] || {}, games = (r[1].games || []).slice(0, 4), net = sm.network || {}, dir = net.directory || {};
            var nums = [];
            if (dir.accounts) nums.push([Number(dir.accounts).toLocaleString('en-US'), 'accounts monitored']);
            if (dir.with_record) nums.push([Number(dir.with_record).toLocaleString('en-US'), 'handicappers outside TMR with graded records']);
            nums.push([String(sm.picks || 0), 'pending picks right now']);
            if (sm.posted_last_24h != null) nums.push([String(sm.posted_last_24h), 'of them posted in the last 24 hours']);
            var wrap = document.createElement('div');
            wrap.className = 'tpf-livewrap';
            wrap.id = 'tpfLive';
            wrap.innerHTML = '<section class="tpf-live" aria-label="Handicapper Watchdog live">'
                + '<div class="tpf-k"><span class="tpf-dot"></span>Handicapper Watchdog &middot; live</div>'
                + '<h2>What the handicappers around the web are betting right now</h2>'
                + '<p class="tpf-muted" style="font-size:15px;margin:0">The Watchdog monitors Covers, X, Reddit, TheRX, Sportsbook Review and Predictem around the clock, grades every pick and keeps a full record for every handicapper. Counts are live; the picks are TMR Pro.</p>'
                + '<div class="tpf-nums">' + nums.map(function (n) { return '<div><b>' + esc(n[0]) + '</b><small>' + esc(n[1]) + '</small></div>'; }).join('') + '</div>'
                + (games.length ? '<div class="tpf-games">' + games.map(function (g, i) {
                    return '<button type="button" class="tpf-game" data-i="' + i + '"><span><b>' + esc(g.away) + ' at ' + esc(g.home) + '</b><br><span class="tpf-muted">' + esc(g.league) + ' &middot; ' + esc(kick(g.start)) + '</span></span>'
                        + '<span class="tpf-pill">&#128274; ' + g.handicappers + ' handicapper' + (g.handicappers === 1 ? '' : 's') + ' outside TMR</span></button>';
                }).join('') + '</div>' : '')
                + '<div class="tpf-row"><a class="tpf-btn gold" data-tpf-cta="home_live" href="/premium/#board">View Watchdog</a>'
                + '<a class="tpf-btn ghost" href="/around-the-web/">Browse the tracked handicappers</a></div></section>';
            hero.parentNode.insertBefore(wrap, hero.nextSibling);
            [].forEach.call(wrap.querySelectorAll('.tpf-game'), function (b) {
                b.addEventListener('click', function () { preview({ game: games[+b.getAttribute('data-i')], component: 'home_live' }); });
            });
            wireCtas(wrap);
            once('tmr_pro_impression', { component: 'home_live' });
        }).catch(function () { });
    }

    /* ------------------------------------------------------------ Around the Web directory */
    function mountAtw() {
        injectStyle();
        getJSON('/pro/watchdog/pending-by-profile').then(function (d) {
            var prof = d.profiles || {};
            if (!Object.keys(prof).length) return;
            function paint() {
                [].forEach.call(document.querySelectorAll('.hm-row[data-href]'), function (row) {
                    if (row.querySelector('.tpf-atw')) return;
                    var href = row.getAttribute('data-href') || '';
                    var hp = href.replace(/^https?:\/\/[^/]+/, '');
                    var x = prof[hp] || prof[hp + '/'];
                    if (!x) return;
                    var name = row.querySelector('.hm-profile-name, strong');
                    var b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'tpf-atw';
                    b.innerHTML = x.pending + ' pending &#128274;';
                    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); preview({ key: x.key, name: name ? name.textContent : '', pending: x.pending, component: 'atw_directory' }); });
                    (name && name.parentNode ? name.parentNode : row).appendChild(b);
                    once('tmr_pro_impression', { component: 'atw_directory' });
                });
            }
            paint();
            var host = document.getElementById('awRows') || document.body;
            new MutationObserver(function () { clearTimeout(paint.t); paint.t = setTimeout(paint, 250); }).observe(host, { childList: true, subtree: true });
        }).catch(function () { });
    }

    /* ------------------------------------------------------------ leaderboards (members: no pending badge) */
    function mountLeaderboards() {
        var h1 = document.querySelector('main h1, h1');
        if (!h1 || document.getElementById('tpfLb')) return;
        injectStyle();
        getJSON('/pro/pending-board/summary').then(function (sm) {
            if (!sm || !sm.picks) return;
            var d = document.createElement('div');
            d.id = 'tpfLb';
            d.style.margin = '10px 0 4px';
            d.innerHTML = '<button type="button" class="tpf-chip"><span>&#128274; <b>' + sm.picks + '</b> pending picks from <b>' + sm.handicappers + '</b> handicappers outside TMR right now &middot; <u>Unlock Handicapper Watchdog</u></span></button>';
            d.querySelector('button').addEventListener('click', function () { preview({ key: null, name: 'Handicapper Watchdog', pending: sm.picks, component: 'leaderboards' }); });
            var anchor = h1.closest('header, section, div') || h1;
            anchor.parentNode.insertBefore(d, anchor.nextSibling);
            once('tmr_pro_impression', { component: 'leaderboards' });
        }).catch(function () { });
    }

    /* ------------------------------------------------------------ public API (BLP app, Pro page) */
    window.TMRFunnel = {
        track: track, setSrc: setSrc, src: src, preview: preview,
        games: function () { return getJSON('/pro/watchdog/games').then(function (d) { return d.games || []; }); },
        findGame: findGame
    };

    function start() {
        ensureGA();
        if (path === '/' || path === '/index.html') mountHome();
        else if (path.indexOf('/sportsbook') === 0) {
            if (!mountBoard()) { var n = 0, t = setInterval(function () { if (mountBoard() || ++n > 40) clearInterval(t); }, 500); }
        } else if (path === '/around-the-web/' || path === '/around-the-web') mountAtw();
        else if (path.indexOf('/leaderboards') === 0) mountLeaderboards();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
