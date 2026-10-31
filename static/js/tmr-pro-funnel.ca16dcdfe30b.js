/* TMR_PRO_FUNNEL_20260929 (Nima 2026-09-29: show the paid products where the traffic already is).

   Loaded on every page by tmr-ds-nav.js; it only acts where it has something real to show:
     - Picks Board (/sportsbook/): on each game that tracked outside handicappers have pending picks on,
       a line "N tracked handicappers have pending picks on this game". Count public, picks locked.
     - Homepage: a live Handicapper Watchdog block with real counts from the Watchdog.
     - Handicappers Around the Web: "N pending" on every tracked handicapper with open picks.
     - Leaderboards: a live Watchdog line (member picks stay private until kickoff, so members get no badge).
   Every one of them opens the same preview: TMR Pro members see the picks; everyone else sees counts,
   locked rows and the Pro offer (PAYWALL_20261024: the free daily reveal is closed).

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
    /* PAYWALL_20261024 (Nima): which games the proven handicappers are on is TMR Pro only. The API
       answers it to a signed in Pro member only; everyone else gets no game lines at all. */
    var gamesP = null, proMember = false;
    function proGames() {
        if (!signedIn()) return Promise.resolve({ games: [] });
        if (!gamesP) gamesP = authGet('/pro/watchdog/games').then(function (b) { if (b.__status === 200) { proMember = true; return b; } return { games: [] }; })
            .catch(function () { gamesP = null; return { games: [] }; });
        return gamesP;
    }
    var cache = {};
    function getJSON(p) {
        if (!cache[p]) cache[p] = fetch(api() + p, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); })
            .catch(function (e) { cache[p] = null; throw e; });
        return cache[p];
    }
    /* the biggest consensus on the board: the upcoming game the most handicappers outside TMR have picks on */
    function topGame(games) {
        var now = Date.now(), best = null;
        (games || []).forEach(function (g) {
            if (Date.parse(g.start) <= now) return;
            if (!best || g.handicappers > best.handicappers || (g.handicappers === best.handicappers && (g.proven || 0) > (best.proven || 0))) best = g;
        });
        return best;
    }
    function boardFacts() {
        return Promise.all([getJSON('/pro/pending-board/summary').catch(function () { return {}; }),
                            proGames().catch(function () { return { games: [] }; })]).then(function (r) {
            var sm = r[0] || {}, games = r[1].games || [];
            return { picks: sm.picks || 0, handicappers: sm.handicappers || 0, games: games.length,
                     proven3: games.filter(function (g) { return (g.proven || 0) >= 3; }).length, top: topGame(games), list: games };
        });
    }
    function consensusText(g) {
        if (!g) return '';
        return '<b>' + esc(g.away) + ' at ' + esc(g.home) + '</b>: ' + g.handicappers + ' handicappers outside TMR'
            + (g.proven ? ' (' + g.proven + ' proven)' : '') + ' have picks in, sides hidden';
    }
    function upsell(comp) {
        return boardFacts().then(function (f) {
            return '<div class="tpf-up"><div class="tpf-k">On the Watchdog board right now</div>'
                + '<div class="tpf-nums"><div><b>' + f.picks + '</b><small>pending picks</small></div><div><b>' + f.handicappers + '</b><small>handicappers outside TMR</small></div>'
                + '<div><b>' + f.games + '</b><small>upcoming games covered</small></div>' + (f.proven3 ? '<div><b>' + f.proven3 + '</b><small>games where 3+ proven handicappers have picks</small></div>' : '') + '</div>'
                + (f.top ? '<p class="tpf-muted">Biggest consensus: ' + consensusText(f.top) + '.</p>' : '')
                + '<p style="margin:10px 0 4px"><b>TMR Pro unlocks all of it:</b></p><ul class="tpf-ul">'
                + '<li>Every pending pick on the board, beside each handicapper&#39;s graded record, units, ROI and streak</li>'
                + '<li>Where the proven handicappers agree, game by game, before kickoff</li>'
                + '<li>Bet Legend Pro, unlimited simulators, TrendSpotter money figures and 15 tracked models</li></ul>'
                + '<div class="tpf-row">' + proCta(comp, 'Unlock the full Watchdog board') + '</div></div>';
        }).catch(function () { return '<div class="tpf-row">' + proCta(comp, 'Unlock all picks with TMR Pro') + '</div>'; });
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
    /* SPORTSBOOK_PROOF_20261016 (Nima): the proven group's combined graded record on a game,
       straight from /pro/watchdog/games. Shown as it is, good or bad, with its window. */
    var WINDOW = { since: 'Sep 14' };
    function n0(v) { return Number(v || 0).toLocaleString('en-US'); }
    function proofText(g) {
        var r = g && g.proven_record;
        if (!r || !g.proven) return '';
        /* PRICE_SANITY_20261019: units are withheld (null) while some Watchdog grades carry futures prices */
        var u = g.proven_units == null ? null : Number(g.proven_units);
        return 'The ' + g.proven + ' proven handicapper' + (g.proven === 1 ? '' : 's') + ' on this game: combined ' + n0(r.w) + '-' + n0(r.l) + (r.p ? '-' + n0(r.p) : '')
            + (u == null ? ' record' : ', ' + (u > 0 ? '+' : u < 0 ? '&minus;' : '') + Math.abs(u).toFixed(1) + 'u') + ' since ' + WINDOW.since + ' (graded by TMR)';
    }
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
            '.tpf-simline{margin:14px 0 6px}.tpf-simline .tpf-chip{max-width:100%;white-space:normal;border-radius:14px}',
            '.tpf-simlink{display:block;padding:10px 14px;border-radius:12px;border:1px solid rgba(140,196,255,.25);background:rgba(140,196,255,.06);color:inherit;text-decoration:none;font:500 13.5px/1.5 Inter,system-ui,sans-serif}',
            '.tpf-simlink u{color:#F5C542;font-weight:800}.tpf-simlink:hover{border-color:#F5C542}',
            '.tpf-offer{margin:14px 0;padding:16px 18px;border-radius:14px;border:1px solid rgba(245,197,66,.45);background:linear-gradient(180deg,rgba(245,197,66,.10),rgba(140,196,255,.05));color:inherit;font:500 14px/1.5 Inter,system-ui,sans-serif;max-width:100%;box-sizing:border-box}',
            '.tpf-offer-k{font:800 11px/1.3 Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#F5C542;margin-bottom:6px}',
            '.tpf-offer-fine{display:block;margin-top:8px;font-size:12px;opacity:.75}',
            '.tpf-offer-h{display:block;font:800 17px/1.3 Inter,system-ui,sans-serif;margin-bottom:8px}',
            '.tpf-offer ul{margin:0 0 10px;padding-left:18px}.tpf-offer li{margin:3px 0}',
            '.tpf-spot{margin:0 0 12px;padding:8px 10px;border-radius:10px;background:rgba(140,196,255,.08);font-size:13px}',
            '.tpf-offer-btn{display:inline-block;padding:11px 22px;border-radius:10px;background:#F5C542;color:#111;font:800 15px/1 Inter,system-ui,sans-serif;text-decoration:none}.tpf-offer-btn:hover{filter:brightness(1.06)}',
            '@media (max-width:480px){.tpf-offer{padding:14px}.tpf-offer-btn{display:block;text-align:center}}',
            '.tpf-proof{display:block;margin-top:3px;font-weight:600;font-size:11.5px;color:#cbd8e6}',
            '.tpf-sbhead{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin:0 0 12px;padding:10px 14px;border-radius:12px;border:1px solid rgba(245,197,66,.45);background:rgba(245,197,66,.08);color:#dce8f5;text-decoration:none;font:600 14px/1.45 Inter,system-ui,sans-serif}',
            '.tpf-sbhead b{color:#fff}.tpf-sbhead u{color:#F5C542;font-weight:800}.tpf-sbhead:hover{border-color:#F5C542}',
            '.tpf-ov{position:fixed;inset:0;z-index:99990;background:rgba(3,10,20,.72);display:flex;align-items:center;justify-content:center;padding:16px}',
            '.tpf-card{width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#0b1a2e;color:#dce8f5;border:1px solid rgba(140,196,255,.25);border-radius:16px;padding:22px;box-shadow:0 30px 80px -20px rgba(0,0,0,.8);font:15px/1.5 Inter,system-ui,sans-serif}',
            '.tpf-card h3{margin:0 0 6px;font:800 21px/1.2 Barlow,Inter,sans-serif;color:#fff}',
            '.tpf-k{font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#F5C542}',
            '.tpf-x{float:right;background:none;border:0;color:#9fb5cc;font-size:24px;cursor:pointer;line-height:1}',
            '.tpf-muted{color:#9fb5cc;font-size:13px}',
            '.tpf-cap{display:block;margin:8px 0 10px;padding:10px 14px;border-radius:12px;border:1px solid rgba(140,196,255,.25);background:rgba(140,196,255,.06);color:inherit;font:500 13.5px/1.5 Inter,system-ui,sans-serif;box-sizing:border-box;max-width:100%;position:relative}',
            '.tpf-cap b{display:block;margin-bottom:6px}.tpf-cap-row{display:flex;gap:8px;flex-wrap:wrap}',
            '.tpf-cap input[type=email]{flex:1 1 200px;min-width:0;padding:8px 10px;border-radius:8px;border:1px solid rgba(140,196,255,.4);background:#fff;color:#0b1a2e;font:500 14px Inter,system-ui,sans-serif}',
            '.tpf-cap button{padding:8px 14px;border-radius:8px;border:1px solid #F5C542;background:transparent;color:inherit;font:700 13.5px Inter,system-ui,sans-serif;cursor:pointer}',
            '.tpf-cap label{display:flex;gap:8px;align-items:flex-start;margin-top:8px;font-size:12px;opacity:.85;text-align:left}.tpf-cap label input[type=checkbox]{width:16px!important;height:16px!important;min-width:16px;flex:0 0 16px;margin:2px 0 0!important;padding:0!important;appearance:auto;-webkit-appearance:checkbox}',
            '.tpf-cap .tpf-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}.tpf-cap-msg{display:block;margin-top:6px;font-size:12.5px}',
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
            '.tpf-up{margin-top:14px;padding-top:14px;border-top:1px solid rgba(140,196,255,.18)}',
            '.tpf-ul{margin:0 0 4px;padding-left:18px}.tpf-ul li{margin:4px 0;color:#dce8f5}',
            '.tpf-ctx{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:12px 0;padding:11px 14px;border-radius:12px;border:1px solid rgba(245,197,66,.45);background:linear-gradient(90deg,#0b1a2e,#10305a);color:#dce8f5;box-shadow:0 10px 26px -14px rgba(3,10,20,.7);font:600 14px/1.45 Inter,system-ui,sans-serif;cursor:pointer;text-align:left;width:100%;box-sizing:border-box}',
            '.tpf-ctx b{color:#fff}.tpf-ctx u{color:#F5C542;font-weight:800;white-space:nowrap}.tpf-ctx:hover{border-color:#F5C542}',
            '.tpf-ctx .tpf-dot{margin-right:2px}',
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
    function proHref(component, hash) { var c = encodeURIComponent(component || 'unknown'); return '/premium/?from=' + c + '&src=' + c + (hash || '#pricing'); }
    function proCta(component, label) {
        return '<a class="tpf-btn gold" data-tpf-cta="' + esc(component) + '" href="' + proHref(component) + '">' + esc(label || 'Unlock Handicapper Watchdog') + '</a>';
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
                : count + ' pending pick' + (count === 1 ? '' : 's') + ' right now.') + ' Collected from Covers, X, Reddit and other public sources, with each handicapper&#39;s graded record.</p>'
            + (g && proofText(g) ? '<p class="tpf-muted" style="margin-top:-2px">' + proofText(g) + '.</p>' : '');
        var ov = openModal(head + '<div id="tpfBody"><p class="tpf-muted">Loading&hellip;</p></div>');
        var body = ov.querySelector('#tpfBody');
        myStatus().then(function (st) {
            if (st.pro && g) {
                /* PRO_INLINE_20261016: a Pro member sees every pending pick on the game. */
                return authGet('/pro/pending-board').then(function (b) {
                    var rows = [];
                    (b.handicappers || []).forEach(function (c) {
                        (c.picks || []).forEach(function (p) {
                            if (findGame([{ home: p.home, away: p.away }], g.home, g.away)) rows.push(revealCard({ handicapper: c, pick: p }));
                        });
                    });
                    body.innerHTML = (rows.length ? rows.join('') : '<p>No pending pick is open for this game right now.</p>')
                        + '<div class="tpf-row"><a class="tpf-btn gold" href="' + proHref(comp, '#board') + '">Open the full Watchdog board</a></div>';
                });
            }
            if (st.pro) {
                return authPost('/pro/watchdog/reveal', g ? { home: g.home, away: g.away, source: comp } : { key: opts.key, source: comp }).then(function (r) {
                    body.innerHTML = r.reveal ? revealCard(r.reveal) + '<div class="tpf-row"><a class="tpf-btn gold" href="' + proHref(comp, '#board') + '">Open the full Watchdog board</a></div>'
                        : '<p>No pending pick is open for this right now.</p>';
                });
            }
            track('watchdog_paywall_view', { component: comp, signed_in: st.signedIn ? 'yes' : 'no' });
            /* PAYWALL_20261024 (Nima): the free daily reveal is closed. Anyone without TMR Pro sees the
               counts above, locked rows and the Pro offer; the API returns no pick to them. */
            body.innerHTML = lockedRows(count)
                + '<p><b>Unlock ' + (g ? 'every pick on this game' : 'every pick from ' + esc(opts.name || 'this handicapper')) + ' with TMR Pro.</b> See the handicapper, the exact pick and price, their graded record, units, ROI and streak, and where the proven handicappers agree.</p>'
                + '<div class="tpf-row">' + proCta(comp, 'Unlock with TMR Pro, $49.99/month') + '</div>'
                + '<p class="tpf-muted" style="margin-top:10px">TMR Pro: every pending pick from every tracked handicapper, full histories and records. $49.99/month or $500/year, cancel anytime.</p>';
            wireCtas(body);
        }).catch(function () { body.innerHTML = '<p>The Watchdog could not answer right now. Try again in a minute.</p>'; });
    }

    /* ------------------------------------------------------------ picks board */
    function mountBoard() {
        var host = document.getElementById('sbnBoardRows') || document.getElementById('sbnBoard');
        if (!host) return false;
        injectStyle();
        mountSportsbookCapture(host);
        proGames().then(function (d) {
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
                    var proof = proofText(g);
                    btn.innerHTML = '<span>&#128274; <b>' + g.handicappers + '</b> handicapper' + (g.handicappers === 1 ? ' outside TMR has a pending pick' : 's outside TMR have pending picks') + ' on this game' + (g.proven ? ' &middot; <b>' + g.proven + ' proven</b> (25+ graded picks)' : '') + ' &middot; <u>See who and what they picked</u>'
                        + (proof ? '<small class="tpf-proof">' + proof + '</small>' : '') + '</span>';
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
            mountBoardHeader(host);
            new MutationObserver(function () { clearTimeout(paint.t); paint.t = setTimeout(paint, 250); }).observe(host.parentNode || host, { childList: true, subtree: true });
        }).catch(function () { });
        return true;
    }

    /* SPORTSBOOK_HEADER_20261016 (Nima): one text line above the board, live count, no price. */
    function mountBoardHeader(host) {
        if (document.getElementById('tpfSbHead')) return;
        getJSON('/pro/pending-board/summary').then(function (sm) {
            var n = sm && sm.handicappers;
            if (!n || document.getElementById('tpfSbHead')) return;
            var a = document.createElement('a');
            a.id = 'tpfSbHead';
            a.className = 'tpf-sbhead';
            a.href = proHref('sportsbook_header', '#board');
            a.setAttribute('data-tpf-cta', 'sportsbook_header');
            a.innerHTML = '<span class="tpf-dot"></span><b>' + n0(n) + '</b> handicapper' + (n === 1 ? ' outside TMR has a pick' : 's outside TMR have picks') + ' up on games that haven&#39;t started. <u>See the Watchdog board</u>';
            host.parentNode.insertBefore(a, host);
            wireCtas(a.parentNode);
            once('tmr_pro_impression', { component: 'sportsbook_header' });
        }).catch(function () { });
    }

    /* SIM_POSTRUN_20261016 (Nima): our one paying member came through the simulators. After a
       simulation finishes, one quiet line under the result: if outside handicappers have pending
       picks on the game just simulated, the same game line as the Picks Board (opens the same
       preview); otherwise a plain text link to TMR Pro. Never before a run, never a banner, never
       on the simulator landing state (NO_SIM_BANNERS_20261007 stands). */
    var SIMS = {
        '/mlb-simulator/': { sport: 'mlb', result: '#resultCard', away: '#awayTeamSelect', home: '#homeTeamSelect' },
        '/nfl-simulator/': { sport: 'nfl', result: '#result', away: '#t1', home: '#t2' },
        '/nba-simulator/': { sport: 'nba', result: '#result', away: '#awayTeam', home: '#homeTeam' },
        '/nhl-simulator/': { sport: 'nhl', result: '#result', away: '#awayTeam', home: '#homeTeam' }
    };
    function optText(sel) {
        var el = document.querySelector(sel);
        if (!el || el.tagName !== 'SELECT' || el.selectedIndex < 0) return '';
        return (el.options[el.selectedIndex].text || el.value || '').replace(/\(.*?\)/g, ' ').trim();
    }
    function sameTeam(a, b) {
        var x = norm(a), y = norm(b);
        if (!x || !y) return false;
        return x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0;
    }
    function gameFor(games, a, b) {
        var now = Date.now();
        for (var i = 0; i < games.length; i++) {
            var g = games[i];
            if (Date.parse(g.start) <= now) continue;
            if ((sameTeam(g.home, a) && sameTeam(g.away, b)) || (sameTeam(g.home, b) && sameTeam(g.away, a))) return g;
        }
        return null;
    }
    /* CONSENSUS_CAPTURE_20261019 (Phase 9): text only email capture on the sportsbook and inside
       the simulator post run note. Explicit consent checkbox (unticked), honeypot, posts to
       /api/pro/consensus-signup which stores only; nothing is sent from there. Hidden for the
       rest of the visit once this browser signs up. */
    var CAP_CONSENT = 'I agree to receive the proven handicapper consensus and TrustMyRecord updates by email. Unsubscribe anytime.';
    function capDone() { try { return localStorage.getItem('tpf_cap_done') === '1'; } catch (e) { return false; } }
    function captureForm(source) {
        if (capDone()) return null;
        var f = document.createElement('form');
        f.className = 'tpf-cap';
        f.setAttribute('novalidate', '');
        f.innerHTML = '<b>Get tonight&#39;s proven handicapper consensus free.</b>'
            + '<div class="tpf-cap-row"><input type="email" name="email" autocomplete="email" placeholder="you@example.com" aria-label="Email address" required>'
            + '<button type="submit">Send it to me</button></div>'
            + '<input class="tpf-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">'
            + '<label><input type="checkbox" name="consent"> <span>' + esc(CAP_CONSENT) + '</span></label>'
            + '<span class="tpf-cap-msg" role="status" aria-live="polite"></span>';
        var msg = f.querySelector('.tpf-cap-msg');
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var email = f.elements.email.value.trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Enter a valid email address.'; return; }
            if (!f.elements.consent.checked) { msg.textContent = 'Tick the box to agree to receive the email.'; return; }
            var btn = f.querySelector('button'); btn.disabled = true; msg.textContent = 'Saving...';
            fetch(api() + '/pro/consensus-signup', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, consent: true, source: source, website: f.elements.website.value }) })
                .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, b: b }; }); })
                .then(function (x) {
                    if (x.ok) {
                        try { localStorage.setItem('tpf_cap_done', '1'); } catch (e2) { }
                        f.innerHTML = '<b>You are on the list.</b><span class="tpf-cap-msg">Unsubscribe anytime from any email we send.</span>';
                        track('tmr_consensus_signup', { component: source });
                    } else { btn.disabled = false; msg.textContent = (x.b && x.b.error) || 'Signup did not go through. Try again in a minute.'; }
                }).catch(function () { btn.disabled = false; msg.textContent = 'Signup did not go through. Try again in a minute.'; });
        });
        once('tmr_consensus_capture_impression', { component: source });
        return f;
    }
    function mountSportsbookCapture(host) {
        if (document.getElementById('tpfCapSb')) return;
        var f = captureForm('sportsbook');
        if (!f) return;
        f.id = 'tpfCapSb';
        host.parentNode.insertBefore(f, host);
    }

    /* PRO_SPOTLIGHT_20261031 (Nima "go"): names stay anonymous (10/26), so the proof is a record,
       never a name and never a game. Reads the public Around the Web directory (anonymous ids,
       refreshed by every Watchdog publish), once per visit and only after a finished run. Picks
       the best unit result among handicappers with 200+ unit graded picks who posted in the last
       3 days. Shows the record exactly as graded, with the sample size. Omitted silently on any
       failure. */
    var spotP = null;
    function spotlight() {
        if (spotP) return spotP;
        try { var c = JSON.parse(sessionStorage.getItem('tpf_spot') || 'null'); if (c && c.handle) return (spotP = Promise.resolve(c)); } catch (e) { }
        spotP = fetch('/around-the-web/', { cache: 'default' }).then(function (r) { if (!r.ok) throw new Error('atw ' + r.status); return r.text(); }).then(function (t) {
            var i = t.indexOf('__ATW_DATA = '); if (i < 0) return null;
            var j = t.indexOf('</script>', i);
            var d = JSON.parse(t.slice(i + 13, j).trim().replace(/;\s*$/, ''));
            var cut = Date.now() - 3 * 864e5, best = null;
            (d.handicappers || []).forEach(function (h) {
                if (!h || (h.unit_picks || 0) < 200 || typeof h.units !== 'number' || h.units <= 0) return;
                if (!h.last_pick_at || Date.parse(h.last_pick_at) < cut) return;
                if (!/^Tracked Handicapper #\d+$/.test(h.handle || '')) return;   /* anonymous ids only */
                if (!best || h.units > best.units) best = h;
            });
            if (!best) return null;
            var out = { handle: best.handle, record: best.record, units: best.units, roi: best.roi, n: best.unit_picks, src: best.source_label || '' };
            try { sessionStorage.setItem('tpf_spot', JSON.stringify(out)); } catch (e) { }
            return out;
        }).catch(function () { return null; });
        return spotP;
    }
    function spotlightHtml(s) {
        if (!s) return '';
        return '<p class="tpf-spot">&#128269; Watchdog record: <b>' + esc(s.handle) + '</b>' + (s.src ? ' (' + esc(s.src) + ')' : '') + ' is <b>' + esc(s.record) + '</b>, <b>+' + esc(s.units.toFixed(1)) + ' units</b> over ' + s.n + ' graded picks. Pro shows their picks before the games start.</p>';
    }
    function simOfferHtml(comp, sport, s) {
        return '<div class="tpf-offer">'
            + '<div class="tpf-offer-k">TMR Pro &middot; 3 days free, then $49.99/month</div>'
            + '<b class="tpf-offer-h">Run this ' + esc(sport.toUpperCase()) + ' simulator as often as you want</b>'
            + '<ul><li>Unlimited runs on every simulator, every day</li>'
            + '<li>The Handicapper Watchdog board: pending picks of graded handicappers outside TMR, before kickoff</li>'
            + '<li>BetLegend Pro research included</li></ul>'
            + spotlightHtml(s)
            + '<a class="tpf-offer-btn" data-tpf-cta="' + comp + '" href="' + proHref(comp, '#pricing') + '">Start 3 days free</a>'
            + '<small class="tpf-offer-fine">Card required. Cancel before the trial ends and you pay nothing.</small>'
            + '</div>';
    }

    function mountSimPostRun(cfg) {
        var comp = 'sim_postrun_' + cfg.sport;
        var shownFor = null;
        /* Only after a run this page view: a Run click, or the simulator reporting a finished run.
           A result card already on screen at load (a saved or sample result) never counts. */
        var ranAt = 0, before = null;
        function resText() { var el = document.querySelector(cfg.result); return el ? el.textContent : ''; }
        document.addEventListener('click', function (e) {
            var t = e.target && e.target.closest && e.target.closest('button, input[type="submit"], [role="button"]');
            if (t && /simulat|run/i.test(t.textContent || t.value || '') && !/tpf-/.test(t.className || '')) { ranAt = Date.now(); before = resText(); shownFor = null; }
        }, true);
        (function hookGate(n) {
            var G = window.TMRSimGate;
            if (G && !G.__tpf) {
                G.__tpf = 1;
                ['markCompleted', 'runSucceeded'].forEach(function (m) {
                    var f = G[m]; if (typeof f !== 'function') return;
                    G[m] = function () { if (!ranAt) { ranAt = Date.now(); before = null; } return f.apply(this, arguments); };
                });
            } else if (!G && n < 40) setTimeout(function () { hookGate(n + 1); }, 500);
        })(0);
        function render() {
            if (!ranAt) return;
            var res = document.querySelector(cfg.result);
            if (!res || res.hidden || !res.offsetParent || !res.textContent.trim()) return;
            if (before !== null && res.textContent === before) return;
            var a = optText(cfg.away), b = optText(cfg.home);
            var sig = a + '|' + b;
            if (!a || !b || sig === shownFor) return;
            shownFor = sig;
            injectStyle();
            var old = document.getElementById('tpfSimLine'); if (old) old.parentNode.removeChild(old);
            proGames().catch(function () { return { games: [] }; }).then(function (d) {
                if (shownFor !== sig) return;
                var g = gameFor(d.games || [], a, b);
                var wrap = document.createElement('div');
                wrap.id = 'tpfSimLine';
                wrap.className = 'tpf-simline';
                if (g) {
                    var proof = proofText(g);
                    wrap.innerHTML = '<button type="button" class="tpf-chip"><span>&#128274; <b>' + g.handicappers + '</b> handicapper' + (g.handicappers === 1 ? ' outside TMR has a pending pick' : 's outside TMR have pending picks')
                        + ' on ' + esc(g.away) + ' at ' + esc(g.home) + (g.proven ? ' &middot; <b>' + g.proven + ' proven</b>' : '') + ' &middot; <u>See who and what they picked</u>'
                        + (proof ? '<small class="tpf-proof">' + proof + '</small>' : '') + '</span></button>';
                    wrap.querySelector('button').addEventListener('click', function () { preview({ game: g, component: comp }); });
                } else if (proMember) {
                    return;   /* a Pro member with no Watchdog game here: nothing to sell */
                } else {
                    /* PRO_SIM_OFFER_20261031 (Nima "go"): all three Pro buyers so far landed on a
                       simulator. After a finished run, a compact offer card replaces the one line link.
                       Still never before a run and never on the landing state. */
                    return spotlight().then(function (s) {
                        if (shownFor !== sig) return;
                        wrap.innerHTML = simOfferHtml(comp, cfg.sport, s);
                        wireCtas(wrap);
                        res.parentNode.insertBefore(wrap, res.nextSibling);
                        track('tmr_pro_impression', { component: comp, matched_game: 'no', spotlight: s ? 'yes' : 'no' });
                    });
                }
                var cap = captureForm('sim_' + cfg.sport);
                if (cap) wrap.appendChild(cap);
                res.parentNode.insertBefore(wrap, res.nextSibling);
                track('tmr_pro_impression', { component: comp, matched_game: 'yes' });
            });
        }
        new MutationObserver(function () { clearTimeout(render.t); render.t = setTimeout(render, 400); })
            .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
    }

    /* ------------------------------------------------------------ homepage */
    function mountHome() {
        var hero = document.querySelector('section.hero');
        if (!hero || document.getElementById('tpfLive')) return;
        injectStyle();
        Promise.all([getJSON('/pro/pending-board/summary'), proGames().catch(function () { return { games: [] }; })]).then(function (r) {
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
                + (topGame(r[1].games) ? '<p style="margin:0 0 12px">&#128274; Biggest consensus right now: ' + consensusText(topGame(r[1].games)) + '.</p>' : '')
                + (games.length ? '<div class="tpf-games">' + games.map(function (g, i) {
                    return '<button type="button" class="tpf-game" data-i="' + i + '"><span><b>' + esc(g.away) + ' at ' + esc(g.home) + '</b><br><span class="tpf-muted">' + esc(g.league) + ' &middot; ' + esc(kick(g.start)) + '</span></span>'
                        + '<span class="tpf-pill">&#128274; ' + g.handicappers + ' handicapper' + (g.handicappers === 1 ? '' : 's') + ' outside TMR</span></button>';
                }).join('') + '</div>' : '')
                + '<div class="tpf-row"><a class="tpf-btn gold" data-tpf-cta="home_live" href="' + proHref('home_live', '#board') + '">See the full Watchdog board</a>'
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
        mountContext('leaderboards', h1.closest('header, section, div') || h1, 'tpfLb');
    }

    /* ------------------------------------------------------------ contextual Watchdog line (PRO_EXPOSURE_20261002) */
    /* Placed once, under the page heading, only on pages where the visitor is already weighing picks or handicappers:
       leaderboards, Around the Web profiles and the simulators. Live counts and the
       biggest consensus game; the sides stay locked. */
    function mountContext(comp, anchor, id, profileKey) {
        if (!anchor || document.getElementById(id)) return;
        injectStyle();
        boardFacts().then(function (f) {
            if (!f.picks || document.getElementById(id)) return;
            var b = document.createElement('button');
            b.type = 'button'; b.id = id; b.className = 'tpf-ctx';
            var own = profileKey && profileKey.pending;
            b.innerHTML = '<span class="tpf-dot"></span>' + (own
                ? '<span><b>' + own.pending + ' pending pick' + (own.pending === 1 ? '' : 's') + '</b> from this handicapper right now, locked until kickoff.</span><u>See the pick' + (own.pending === 1 ? '' : 's') + ' and record</u>'
                : '<span>Watchdog live: <b>' + f.picks + ' pending picks</b> from <b>' + f.handicappers + ' handicappers outside TMR</b>.'
                  + (f.top ? ' Biggest consensus: ' + consensusText(f.top) + '.' : '') + '</span><u>See the consensus before kickoff</u>');
            b.addEventListener('click', function () {
                if (own) preview({ key: own.key, name: profileKey.name, pending: own.pending, component: comp });
                else if (f.top) preview({ game: f.top, component: comp });
                else preview({ key: null, name: 'Handicapper Watchdog', pending: f.picks, component: comp });
            });
            anchor.parentNode.insertBefore(b, anchor.nextSibling);
            once('tmr_pro_impression', { component: comp });
            /* some pages re-render their header after load (Around the Web profiles): put the line back under the new one */
            var n = 0, keep = setInterval(function () {
                if (++n > 30) { clearInterval(keep); return; }
                if (document.body.contains(b)) return;
                var h = document.querySelector('main h1, h1');
                var a2 = h && (h.closest('header, section, div') || h);
                if (a2 && a2.parentNode) a2.parentNode.insertBefore(b, a2.nextSibling);
            }, 1000);
        }).catch(function () { });
    }
    function mountAtwProfile(tries) {
        var h1 = document.querySelector('main h1, h1');
        if (!h1) { if ((tries || 0) < 40) setTimeout(function () { mountAtwProfile((tries || 0) + 1); }, 500); return; }
        getJSON('/pro/watchdog/pending-by-profile').catch(function () { return { profiles: {} }; }).then(function (d) {
            var p = location.pathname.replace(/\/?$/, '/');
            var own = (d.profiles || {})[p];
            var hh = document.querySelector('main h1, h1') || h1;     /* the profile page re-renders its header after load */
            mountContext('atw_profile', hh.closest('header, section, div') || hh, 'tpfAtwP', own ? { pending: own, name: hh.textContent } : null);
        });
    }

    /* LOCK_LIVE_20261019 (Phase 4): one live text line under the TrendSpotter units/ROI/avg price
       lock and the Model Builder 3rd model lock. The page script leaves a hidden
       [data-tpf-live="<component>"] slot; this fills it with the count of proven handicappers
       (25+ graded picks) whose picks are up on games that have not started, from the public
       summary. Stays hidden when the count is 0 or the API fails. No price, no record. */
    function fillLockLines() {
        var els = [].filter.call(document.querySelectorAll('[data-tpf-live]'), function (el) { return !el.getAttribute('data-tpf-done'); });
        if (!els.length) return;
        els.forEach(function (el) { el.setAttribute('data-tpf-done', '1'); });
        getJSON('/pro/pending-board/summary').then(function (sm) {
            var n = Math.floor(Number(sm && sm.proven_handicappers) || 0);
            if (n <= 0) return;
            els.forEach(function (el) {
                var comp = el.getAttribute('data-tpf-live');
                el.style.display = 'block';
                el.style.marginTop = '6px';
                el.innerHTML = '<a data-tpf-cta="' + esc(comp) + '" href="' + proHref(comp, '#board') + '"><b>' + n0(n) + '</b> proven handicapper'
                    + (n === 1 ? ' has picks' : 's have picks') + ' up on games that have not started. See the Watchdog board</a>';
                el.hidden = false;
                wireCtas(el);
                once('tmr_pro_impression', { component: comp });
            });
        }).catch(function () { });
    }
    function mountLockLines() {
        fillLockLines();
        new MutationObserver(function () { clearTimeout(fillLockLines.t); fillLockLines.t = setTimeout(fillLockLines, 300); })
            .observe(document.body, { childList: true, subtree: true });
    }

    /* ------------------------------------------------------------ public API (BLP app, Pro page) */
    window.TMRFunnel = {
        track: track, setSrc: setSrc, src: src, preview: preview,
        games: function () { return proGames().then(function (d) { return d.games || []; }); },
        findGame: findGame
    };

    function start() {
        ensureGA();
        if (path === '/' || path === '/index.html') mountHome();
        else if (path.indexOf('/sportsbook') === 0) {
            if (!mountBoard()) { var n = 0, t = setInterval(function () { if (mountBoard() || ++n > 40) clearInterval(t); }, 500); }
        } else if (path === '/around-the-web/' || path === '/around-the-web') mountAtw();
        else if (path.indexOf('/leaderboards') === 0) mountLeaderboards();
        else if (/^\/around-the-web\/[^/]+\/?$/.test(path)) mountAtwProfile();
        else if (SIMS[path] || SIMS[path + '/']) mountSimPostRun(SIMS[path] || SIMS[path + '/']);
        else if (path.indexOf('/trendspotter') === 0 || path.indexOf('/model-builder') === 0) mountLockLines();
        /* NO_SIM_BANNERS_20261007 (Nima): no Watchdog line on the simulator pages.
           It mounted on /sports-simulators and the MLB, NFL, NBA and NHL hubs and
           showed an unrelated (often college football) consensus. Removed. */
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
