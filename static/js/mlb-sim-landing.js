/* =============================================================================
   MLB SIMULATOR — LANDING/CONVERSION LAYER (mlb-sim-landing.js)  simv2 20260730
   -----------------------------------------------------------------------------
   Additive companion to mlb-simulator.js (which it never edits or replaces).
   Owns: hero CTA auth-swap, Today's Matchups slate, step-progress state,
   swap-teams control, post-result pick panel, contest panel, live site stats,
   logged-in return loop, and the simulator_* analytics funnel.

   Kill switch: window.SIM_LANDING_FLAGS = { landing:false } disables everything
   here; the core simulator is untouched either way. Every network render is
   live-gated: nothing paints until real data arrives (dashes/skeletons only),
   and every panel that lacks real data stays hidden rather than faking it.
   ============================================================================= */
(function () {
    'use strict';

    var FLAGS = window.SIM_LANDING_FLAGS || {};
    if (FLAGS.landing === false) return;

    var API_BASE = (window.CONFIG && CONFIG.api && CONFIG.api.baseUrl) ||
        'https://trustmyrecord-api.onrender.com/api';
    var PICK_INTENT_KEY = 'tmr_sim_pick_intent';
    var PICK_INTENT_TTL_MS = 6 * 60 * 60 * 1000;

    function byId(id) { return document.getElementById(id); }

    function track(name, params) {
        try {
            var p = params || {};
            if (window.TMRAnalytics && typeof window.TMRAnalytics.track === 'function') {
                window.TMRAnalytics.track(name, p);
            } else if (typeof window.tmrTrack === 'function') {
                window.tmrTrack(name, p);
            }
        } catch (e) { /* analytics must never break the page */ }
    }

    function isLoggedIn() {
        try { return !!(window.api && window.api.isLoggedIn && window.api.isLoggedIn()); }
        catch (e) { return false; }
    }

    function esc(s) {
        return ('' + (s == null ? '' : s)).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function fetchJson(url, timeoutMs) {
        return new Promise(function (resolve) {
            var done = false;
            var t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, timeoutMs || 8000);
            fetch(url, { credentials: 'omit' }).then(function (r) {
                if (!r.ok) throw new Error('http ' + r.status);
                return r.json();
            }).then(function (j) {
                if (!done) { done = true; clearTimeout(t); resolve(j); }
            }).catch(function () {
                if (!done) { done = true; clearTimeout(t); resolve(null); }
            });
        });
    }

    /* ------------------------------------------------------------------ */
    /* Hero CTAs                                                           */
    /* ------------------------------------------------------------------ */
    function initHero() {
        var primary = byId('simv2HeroPrimary');
        var secondary = byId('simv2HeroSecondary');
        if (primary) {
            primary.addEventListener('click', function (e) {
                e.preventDefault();
                var slate = byId('todaysMatchups');
                var target = (slate && !slate.hidden) ? slate : document.querySelector('.sim-workspace');
                if (target) target.scrollIntoView({ behavior: motionOk() ? 'smooth' : 'auto', block: 'start' });
            });
        }
        if (secondary && isLoggedIn()) {
            secondary.textContent = 'Make a Verified Pick';
            secondary.setAttribute('href', '/sportsbook/');
        }
    }

    function motionOk() {
        try { return !window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
        catch (e) { return true; }
    }

    /* ------------------------------------------------------------------ */
    /* Step progress                                                       */
    /* ------------------------------------------------------------------ */
    var STEP_ORDER = ['matchup', 'starters', 'settings', 'simulate', 'results'];
    var stepReached = { matchup: true };

    function setStep(active) {
        var list = byId('simv2Steps');
        if (!list) return;
        stepReached[active] = true;
        var activeIdx = STEP_ORDER.indexOf(active);
        Array.prototype.forEach.call(list.children, function (li, i) {
            li.classList.toggle('is-active', i === activeIdx);
            li.classList.toggle('is-done', i < activeIdx);
            var btn = li.querySelector('button');
            if (btn) btn.setAttribute('aria-current', i === activeIdx ? 'step' : 'false');
        });
    }

    function initSteps() {
        var list = byId('simv2Steps');
        if (!list) return;
        var anchors = {
            matchup: '.team-picker-grid', starters: '.team-picker-grid',
            settings: '.sim-actions', simulate: '.sim-actions', results: '#resultCard'
        };
        list.addEventListener('click', function (e) {
            var btn = e.target.closest('button[data-step]');
            if (!btn) return;
            var step = btn.getAttribute('data-step');
            if (!stepReached[step] && !btn.closest('li').classList.contains('is-done')) return;
            var el = document.querySelector(anchors[step] || '.sim-workspace');
            if (el) el.scrollIntoView({ behavior: motionOk() ? 'smooth' : 'auto', block: 'center' });
        });

        function on(id, ev, fn) { var el = byId(id); if (el) el.addEventListener(ev, fn); }
        ['awayTeamSelect', 'homeTeamSelect'].forEach(function (id) {
            on(id, 'change', function () {
                var a = byId('awayTeamSelect'), h = byId('homeTeamSelect');
                if (a && h && a.value && h.value) setStep('starters');
            });
        });
        ['awayPitcherSelect', 'homePitcherSelect'].forEach(function (id) {
            on(id, 'change', function () { if (stepReached.starters) setStep('settings'); });
        });
        on('runSimulationButton', 'click', function () {
            setStep('simulate');
            if (!initSteps._started) {
                initSteps._started = true;
                track('simulator_started', { source: 'run_button' });
            }
        });
        var panel = byId('boxScorePanel');
        if (panel && window.MutationObserver) {
            new MutationObserver(function () {
                if (panel.getAttribute('data-box-score-state') === 'projected') {
                    setStep('results');
                    onResultProjected();
                }
            }).observe(panel, { attributes: true, attributeFilter: ['data-box-score-state'] });
        }
    }

    /* ------------------------------------------------------------------ */
    /* Today's Matchups                                                    */
    /* ------------------------------------------------------------------ */
    var slateGames = [];

    function initSlate() {
        var section = byId('todaysMatchups');
        if (!section) return;
        fetchJson(API_BASE + '/nav/mlb-slate', 9000).then(function (data) {
            var games = (data && data.ok && Array.isArray(data.games)) ? data.games.filter(function (g) {
                return g && g.status === 'scheduled';
            }) : [];
            slateGames = games;
            if (!games.length) {
                renderSlateEmpty(section, data);
                return;
            }
            renderSlate(section, games, data);
        });
    }

    function renderSlateEmpty(section, data) {
        var grid = byId('simv2SlateGrid');
        if (!grid) return;
        var msg = (data && data.ok) ?
            'No MLB games left on today’s board. Build any matchup you want below — current, classic, or mixed era.' :
            'Today’s live schedule is temporarily unavailable. The full matchup builder below works either way.';
        grid.innerHTML = '<div class="simv2-slate-empty"><strong>' +
            ((data && data.ok) ? 'No games remaining today' : 'Schedule unavailable') +
            '</strong><p>' + msg + '</p></div>';
        section.hidden = false;
    }

    function renderSlate(section, games, data) {
        var grid = byId('simv2SlateGrid');
        var note = byId('simv2SlateNote');
        if (!grid) return;
        grid.innerHTML = games.map(function (g, i) {
            var sp = '';
            if (g.away_pitcher || g.home_pitcher) {
                sp = '<div class="simv2-g-sp">' +
                    '<span>' + esc(g.away_pitcher || 'TBD') + '</span>' +
                    '<em>vs</em><span>' + esc(g.home_pitcher || 'TBD') + '</span>' +
                    '<i class="simv2-tag">PROBABLES</i></div>';
            }
            return '<article class="simv2-game">' +
                '<div class="simv2-g-top"><span>' + esc(g.start_time_pt ? g.start_time_pt + ' PT' : (g.start_time_tbd ? 'Time TBD' : '')) + '</span>' +
                '<span>' + esc(g.game_label || '') + '</span></div>' +
                '<div class="simv2-g-team">' + logoImg(g.away_logo, g.away) + '<b>' + esc(g.away_team_name) + '</b></div>' +
                '<div class="simv2-g-team">' + logoImg(g.home_logo, g.home) + '<b>' + esc(g.home_team_name) + '</b></div>' +
                sp +
                '<div class="simv2-g-foot">' +
                '<button type="button" class="simv2-btn simv2-btn-primary simv2-g-sim" data-slate-idx="' + i + '">Simulate Matchup</button>' +
                '</div></article>';
        }).join('');
        if (note && data && data.generated_at) {
            note.textContent = 'Live MLB schedule · probable starters from the official feed · updated ' +
                new Date(data.generated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        }
        section.hidden = false;
        grid.addEventListener('click', function (e) {
            var btn = e.target.closest('.simv2-g-sim');
            if (!btn) return;
            var g = slateGames[Number(btn.getAttribute('data-slate-idx'))];
            if (g) loadSlateMatchup(g, btn);
        });
    }

    function logoImg(url, abbr) {
        if (!url) return '<span class="simv2-logo-fallback">' + esc(abbr || '?') + '</span>';
        return '<img class="simv2-g-logo" src="' + esc(url) + '" alt="" loading="lazy" width="30" height="30" ' +
            'onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'simv2-logo-fallback\',textContent:\'' + esc(abbr || '?') + '\'}))">';
    }

    function selectByLabel(sel, name) {
        if (!sel || !name) return false;
        var want = name.toLowerCase();
        for (var i = 0; i < sel.options.length; i++) {
            var txt = (sel.options[i].textContent || '').toLowerCase();
            if (txt.indexOf(want) !== -1 || want.indexOf(txt.trim()) !== -1) {
                if (sel.value !== sel.options[i].value) {
                    sel.value = sel.options[i].value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                }
                return true;
            }
        }
        return false;
    }

    function retrySelect(selId, name, tries, delay, cb) {
        var sel = byId(selId);
        if (selectByLabel(sel, name)) { if (cb) cb(true); return; }
        if (tries <= 0) { if (cb) cb(false); return; }
        setTimeout(function () { retrySelect(selId, name, tries - 1, delay, cb); }, delay);
    }

    function loadSlateMatchup(g, btn) {
        var cur = byId('currentModeButton');
        if (cur && !cur.classList.contains('active')) cur.click();
        btn.disabled = true;
        btn.textContent = 'Loading…';
        setTimeout(function () {
            retrySelect('awayTeamSelect', g.away_team_name, 20, 400, function () {
                retrySelect('homeTeamSelect', g.home_team_name, 20, 400, function () {
                    if (g.away_pitcher) retrySelect('awayPitcherSelect', g.away_pitcher, 20, 400);
                    if (g.home_pitcher) retrySelect('homePitcherSelect', g.home_pitcher, 20, 400);
                    window.__simv2ActiveSlateGame = g;
                    btn.disabled = false;
                    btn.textContent = 'Simulate Matchup';
                    setStep('starters');
                    var ws = document.querySelector('.sim-workspace');
                    if (ws) ws.scrollIntoView({ behavior: motionOk() ? 'smooth' : 'auto', block: 'start' });
                    track('simulator_matchup_loaded', { source: 'slate' });
                });
            });
        }, 150);
    }

    /* ------------------------------------------------------------------ */
    /* Swap teams                                                          */
    /* ------------------------------------------------------------------ */
    function initSwap() {
        var btn = byId('simv2SwapTeams');
        if (!btn) return;
        btn.addEventListener('click', function () {
            var a = byId('awayTeamSelect'), h = byId('homeTeamSelect');
            var ap = byId('awayPitcherSelect'), hp = byId('homePitcherSelect');
            if (!a || !h || !a.value || !h.value) return;
            var aTxt = a.options[a.selectedIndex] ? a.options[a.selectedIndex].textContent : '';
            var hTxt = h.options[h.selectedIndex] ? h.options[h.selectedIndex].textContent : '';
            var apName = ap && ap.selectedIndex > -1 ? ap.options[ap.selectedIndex].textContent : '';
            var hpName = hp && hp.selectedIndex > -1 ? hp.options[hp.selectedIndex].textContent : '';
            selectByLabel(a, hTxt.trim());
            selectByLabel(h, aTxt.trim());
            if (hpName) retrySelect('awayPitcherSelect', hpName.split('·')[0].trim(), 15, 400);
            if (apName) retrySelect('homePitcherSelect', apName.split('·')[0].trim(), 15, 400);
        });
    }

    /* ------------------------------------------------------------------ */
    /* Post-result pick panel                                              */
    /* ------------------------------------------------------------------ */
    var pickPanelShown = false;

    function onResultProjected() {
        track('simulator_completed', { source: 'landing_observer' });
        watchResultViewed();
        if (pickPanelShown) { refreshPickPanel(); return; }
        pickPanelShown = true;
        renderPickPanel();
    }

    function watchResultViewed() {
        if (watchResultViewed._done) return;
        var card = byId('resultCard');
        if (!card || !window.IntersectionObserver) return;
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting && !watchResultViewed._done) {
                    watchResultViewed._done = true;
                    track('simulator_result_viewed', {});
                    io.disconnect();
                }
            });
        }, { threshold: 0.4 });
        io.observe(card);
    }

    function currentMatchup() {
        var away = (byId('awayHeaderName') || {}).textContent || '';
        var home = (byId('homeHeaderName') || {}).textContent || '';
        var winner = (byId('winnerBadge') || {}).textContent || '';
        return { away: away.trim(), home: home.trim(), winner: winner.trim() };
    }

    function renderPickPanel() {
        var anchor = byId('simcConversionPanel') || byId('boxScorePanel');
        if (!anchor) return;
        var m = currentMatchup();
        var panel = document.createElement('section');
        panel.id = 'simv2PickPanel';
        panel.className = 'simv2-convert';
        panel.setAttribute('aria-label', 'Lock in your prediction');
        panel.innerHTML =
            '<h2>Think the simulator got it right?</h2>' +
            '<p>Lock in your prediction before the game starts. Your pick is timestamped, graded automatically, and added to a public record you cannot edit afterward. Picks are submitted one at a time as straight picks — never a parlay — and nothing is submitted until you confirm it on the pick board.</p>' +
            '<div class="simv2-pickteam" role="radiogroup" aria-label="Team to back" id="simv2PickTeamGroup"></div>' +
            '<div class="simv2-convert-row" id="simv2ConvertRow"></div>';
        anchor.after(panel);
        refreshPickPanel();
    }

    function refreshPickPanel() {
        var m = currentMatchup();
        var group = byId('simv2PickTeamGroup');
        var row = byId('simv2ConvertRow');
        if (!group || !row || !m.away || !m.home) return;
        var def = (m.winner && m.winner.toLowerCase().indexOf(m.away.toLowerCase()) !== -1) ? m.away : m.home;
        group.innerHTML = [m.away, m.home].map(function (t) {
            return '<button type="button" role="radio" aria-checked="' + (t === def) + '" class="simv2-teamchoice' +
                (t === def ? ' is-on' : '') + '" data-team="' + esc(t) + '">' + esc(t) + '</button>';
        }).join('');
        group.onclick = function (e) {
            var b = e.target.closest('.simv2-teamchoice');
            if (!b) return;
            Array.prototype.forEach.call(group.children, function (c) {
                c.classList.toggle('is-on', c === b);
                c.setAttribute('aria-checked', c === b ? 'true' : 'false');
            });
        };
        if (isLoggedIn()) {
            row.innerHTML = '<button type="button" class="simv2-btn simv2-btn-gold" id="simv2PickCta">Add This Pick to My Slip</button>' +
                '<a class="simv2-btn simv2-btn-ghost" href="/handicappers/">View Verified Handicappers</a>';
        } else {
            row.innerHTML = '<button type="button" class="simv2-btn simv2-btn-gold" id="simv2PickCta">Create Free Account &amp; Lock This Pick</button>' +
                '<a class="simv2-btn simv2-btn-ghost" href="/handicappers/">View Verified Handicappers</a>';
        }
        var cta = byId('simv2PickCta');
        if (cta) cta.addEventListener('click', onPickCta);
    }

    function onPickCta() {
        var group = byId('simv2PickTeamGroup');
        var sel = group ? group.querySelector('.is-on') : null;
        var m = currentMatchup();
        var g = window.__simv2ActiveSlateGame || null;
        var intent = {
            v: 1,
            ts: Date.now(),
            pick_team: sel ? sel.getAttribute('data-team') : m.winner,
            away_team_name: g ? g.away_team_name : m.away,
            home_team_name: g ? g.home_team_name : m.home,
            board_game_id: g ? g.board_game_id : null,
            source: 'mlb-simulator'
        };
        try { localStorage.setItem(PICK_INTENT_KEY, JSON.stringify(intent)); } catch (e) { }
        track('simulator_pick_started', { logged_in: isLoggedIn() ? 'yes' : 'no' });
        if (isLoggedIn()) {
            window.location.href = '/sportsbook/?simpick=1';
        } else {
            track('simulator_signup_clicked', { source: 'pick_panel' });
            window.location.href = '/register/?return=' + encodeURIComponent('/sportsbook/?simpick=1');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Contest panel — renders ONLY from live contest config               */
    /* ------------------------------------------------------------------ */
    function initContest() {
        var section = byId('simv2Contest');
        if (!section) return;
        Promise.all([
            fetchJson(API_BASE + '/contests/justbet-mlb', 9000),
            fetchJson(API_BASE + '/contests/justbet-mlb/registrations', 9000)
        ]).then(function (res) {
            var meta = res[0], regs = res[1];
            if (!meta || meta.is_active !== true) return;               // no live active contest -> no panel
            var now = Date.now();
            var ends = meta.ends_at ? Date.parse(meta.ends_at) : null;
            var starts = meta.starts_at ? Date.parse(meta.starts_at) : null;
            var upcoming = starts && starts > now;
            if (ends && ends <= now && !upcoming) return;               // configured window already over -> no panel
            var bits = [];
            if (meta.prize_pool_cents > 0) {
                bits.push('<div><b>$' + (meta.prize_pool_cents / 100).toLocaleString() + '</b><span>Prize pool</span></div>');
            }
            if (regs && typeof regs.count === 'number') {
                bits.push('<div><b>' + regs.count + '</b><span>Entrants</span></div>');
            }
            if (ends && ends > now) {
                bits.push('<div><b>' + new Date(ends).toLocaleDateString([], { month: 'short', day: 'numeric' }) + '</b><span>Entry deadline</span></div>');
            } else if (upcoming) {
                bits.push('<div><b>' + new Date(starts).toLocaleDateString([], { month: 'short', day: 'numeric' }) + '</b><span>Starts</span></div>');
            } else {
                bits.push('<div><b>Open</b><span>Registration</span></div>');
            }
            byId('simv2ContestName').textContent = meta.name || 'MLB Contest';
            byId('simv2ContestMeta').innerHTML = bits.join('');
            byId('simv2ContestElig').textContent =
                'Eligibility: free TrustMyRecord account plus contest registration. Up to ' +
                (meta.picks_max || 50) + ' verified picks count toward the leaderboard.';
            section.hidden = false;
            section.addEventListener('click', function (e) {
                if (e.target.closest('a,button')) track('contest_cta_clicked', { contest: 'justbet-mlb' });
            });
        });
    }

    /* ------------------------------------------------------------------ */
    /* Live site stats (social proof)                                      */
    /* ------------------------------------------------------------------ */
    function initStats() {
        fetchJson(API_BASE + '/users/directory-metrics', 9000).then(function (d) {
            if (d && d.metrics) {
                setStat('simv2StatMembers', d.metrics.total_members);
                setStat('simv2StatVerified', d.metrics.verified_handicappers);
            }
        });
        fetchJson(API_BASE + '/users/directory-counts', 9000).then(function (d) {
            if (d && d.counts) setStat('simv2StatPicks', d.counts.total_valid_picks);
        });
        fetchJson(API_BASE + '/users/leaderboard?sortBy=net_units&limit=3', 9000).then(function (d) {
            var el = byId('simv2LeaderPreview');
            if (!el || !d || !Array.isArray(d.leaderboard) || !d.leaderboard.length) return;
            el.innerHTML = d.leaderboard.map(function (u, i) {
                var rec = (u.wins != null && u.losses != null) ? (u.wins + '–' + u.losses) : '';
                var units = (u.net_units != null) ? ((u.net_units >= 0 ? '+' : '') + Number(u.net_units).toFixed(1) + 'u') : '';
                return '<a class="simv2-leader" href="/profile/?username=' + encodeURIComponent(u.username) + '">' +
                    '<i>#' + (i + 1) + '</i><b>' + esc(u.display_name || u.username) + '</b>' +
                    '<span>' + esc(rec) + '</span><em>' + esc(units) + '</em></a>';
            }).join('');
            el.previousElementSibling && (el.previousElementSibling.hidden = false);
            el.hidden = false;
        });
    }

    function setStat(id, val) {
        var el = byId(id);
        if (el && val != null && isFinite(val)) el.textContent = Number(val).toLocaleString();
    }

    /* ------------------------------------------------------------------ */
    /* Logged-in return loop                                               */
    /* ------------------------------------------------------------------ */
    function initReturnLoop() {
        if (!isLoggedIn() || !window.api || typeof window.api.request !== 'function') return;
        var section = byId('simv2ReturnLoop');
        if (!section) return;
        window.api.request('/mlb-simulator-save?limit=3', { method: 'GET' }).then(function (resp) {
            var results = resp && Array.isArray(resp.results) ? resp.results : [];
            var list = byId('simv2RecentSims');
            if (results.length && list) {
                list.innerHTML = results.map(function (r) {
                    var s = r.summarized_result || {};
                    var label = (s.away_team && s.home_team) ? (s.away_team + ' @ ' + s.home_team) : ('Simulation #' + r.id);
                    return '<a href="/mlb-simulator/?savedId=' + encodeURIComponent(r.id) + '&mode=view">' + esc(label) + '</a>';
                }).join('');
            } else if (list) {
                list.innerHTML = '<span class="simv2-muted">No saved simulations yet — run one and save it.</span>';
            }
            var slateLine = byId('simv2ReturnSlate');
            if (slateLine && slateGames.length) {
                slateLine.textContent = slateGames.length + ' MLB game' + (slateGames.length === 1 ? '' : 's') +
                    ' still to be played today.';
            }
            section.hidden = false;
        }).catch(function () { /* stay hidden on failure — never show stale personal data */ });
    }

    /* ------------------------------------------------------------------ */
    /* Boot                                                                */
    /* ------------------------------------------------------------------ */
    function boot() {
        track('simulator_page_view', { logged_in: isLoggedIn() ? 'yes' : 'no' });
        try {
            var seen = localStorage.getItem('tmr_sim_seen');
            if (seen) track('simulator_return_visit', {});
            localStorage.setItem('tmr_sim_seen', String(Date.now()));
        } catch (e) { }
        var coin = byId('simv2CoinLearn');
        if (coin) coin.addEventListener('click', function () { track('tmr_coin_learn_clicked', {}); });
        initHero();
        initSteps();
        initSlate();
        initSwap();
        initContest();
        initStats();
        initReturnLoop();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
