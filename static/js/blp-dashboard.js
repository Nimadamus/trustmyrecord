/* BetLegend Pro research dashboard (BLP_DASHBOARD_20261116).
 *
 * The cards organise the app's own situation library (GET
 * /betlegend-pro/matchup-filters) into research categories. A card opens a
 * drawer listing that category's real situations for the chosen sport; "Open
 * in BetLegend Pro" hands the ids to the embedded app (#blpLiveFrame), which
 * narrows its situation picker to them. No query, value or calculation is
 * made here: the app keeps every control, availability rule and the engine.
 *
 * Library source: the live library for a signed-in member, otherwise the
 * snapshot in blp-catalog.js. Favorites are a per-browser convenience
 * (localStorage). Activity comes from the member's saved report library.
 */
(function () {
    'use strict';
    var CAT = window.BLP_CATALOG;
    if (!CAT || !document.getElementById('bxGrid')) return;

    var SPORTS = ['MLB', 'NFL', 'NBA', 'NHL'];
    var $ = function (id) { return document.getElementById(id); };
    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }
    var loggedIn = function () { return !!(window.api && window.api.isLoggedIn && window.api.isLoggedIn()); };

    // ------------------------------------------------------------ icons
    var I = {
        trend: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 35 17 22l8 7 16-17"/><path d="M33 12h8v8"/><path d="M8 44V40M16 44V34M24 44V37M32 44V30M40 44V26" stroke-width="4"/></svg>',
        cal: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="9" width="36" height="33" rx="5"/><path d="M6 19h36M16 5v8M32 5v8"/><path d="M14 26h4M22 26h4M30 26h4M14 33h4M22 33h4M30 33h4" stroke-width="3.6"/></svg>',
        nodes: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="10" r="6"/><circle cx="10" cy="38" r="6"/><circle cx="38" cy="38" r="6"/><path d="M21 15 13 33M27 15l8 18M16 38h16"/></svg>',
        bolt: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M27 4 9 27h13l-3 17 20-25H26z" fill="currentColor" fill-opacity=".18"/></svg>',
        team: '<svg viewBox="0 0 48 48" fill="currentColor"><circle cx="24" cy="13" r="7"/><circle cx="10" cy="17" r="5" opacity=".8"/><circle cx="38" cy="17" r="5" opacity=".8"/><path d="M12 40c0-8 5-14 12-14s12 6 12 14z"/><path d="M1 38c0-6 4-10 9-10 2 0 3 .4 4 1-2 3-3 6-3 9zM47 38c0-6-4-10-9-10-2 0-3 .4-4 1 2 3 3 6 3 9z" opacity=".8"/></svg>',
        player: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="9" r="5"/><path d="M18 15v13l-7 15M18 28l7 15M10 20l8 2 8-5"/><path d="M27 14 44 5" stroke-width="3.6"/><circle cx="38" cy="27" r="4"/></svg>',
        venue: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="24" cy="20" rx="19" ry="8"/><path d="M5 20v12c0 4.5 8.5 8 19 8s19-3.5 19-8V20"/><ellipse cx="24" cy="20" rx="10" ry="3.5"/><path d="M9 6v6M17 4v6M31 4v6M39 6v6"/></svg>',
        vs: '<svg viewBox="0 0 48 48" fill="currentColor"><circle cx="12" cy="11" r="6"/><circle cx="36" cy="11" r="6"/><path d="M1 34c0-8 5-14 11-14s11 6 11 14zM25 34c0-8 5-14 11-14s11 6 11 14z" opacity=".85"/><text x="24" y="46" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="900" font-size="15">VS</text></svg>',
        arrow: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h12M11 5l5 5-5 5"/></svg>',
        star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>',
        search: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="6"/><path d="m13 13 5 5"/></svg>',
        plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
    };

    // -------------------------------------------------------- categories
    // Explicit ids first; any library id not named here falls into the card
    // that owns its server group, so a situation the server adds can never
    // go missing from the dashboard.
    var CARDS = [
        { key: 'lines', color: 'blue', icon: 'trend', title: 'Moneyline & Line Range',
          desc: 'Find games by closing moneyline, spread or total, and favorite or underdog.',
          ids: ['moneyline_range', 'role', 'spread_range', 'total_range', 'su_result', 'ats_result', 'ou_result'],
          groups: ['market'] },
        { key: 'dates', color: 'purple', icon: 'cal', title: 'Game & Date Filters',
          desc: 'Analyze results by rest, back-to-backs, day of week, month or start time.',
          ids: ['min_rest_days', 'back_to_back', 'day_of_week', 'rest_days_range', 'long_rest', 'month', 'start_time',
                'games_last_7', 'season_type', 'nfl_week', 'nfl_game_slot', 'nfl_primetime'],
          groups: ['schedule', 'matchup'] },
        { key: 'trends', color: 'gold', icon: 'nodes', title: 'Spread & Total Trends',
          desc: 'ATS and over/under streaks, recent covers and overs going in.',
          ids: ['ats_streak', 'ou_streak', 'prev_ats_result', 'prev_ou_result', 'ats_covers_last_5', 'ats_covers_last_10',
                'ou_overs_last_5', 'ou_overs_last_10', 'over_threshold_streak', 'under_threshold_streak',
                'prev_combined_total', 'avg_total_last_5', 'season_ats_wins', 'season_ats_losses'] },
        { key: 'edges', color: 'green', icon: 'bolt', title: 'Situational Edges',
          desc: 'Spots like off a blowout, after a close game, and win or loss streaks.',
          ids: ['after_blowout_loss', 'after_close_game', 'after_blowout_win', 'prev_result', 'prev_margin', 'su_streak',
                'prev_points_scored', 'prev_points_allowed', 'prev_scored_threshold', 'prev_allowed_threshold',
                'last10_win_pct', 'scoring_trend'],
          groups: ['form'] },
        { key: 'team', color: 'red', icon: 'team', title: 'Team Performance',
          desc: 'Season record, rolling scoring and margin, and team stat profiles.',
          ids: ['season_wins', 'season_losses', 'season_win_pct', 'avg_scored_last_3', 'avg_scored_last_5',
                'avg_scored_last_10', 'avg_allowed_last_5', 'avg_allowed_last_10', 'avg_margin_last_3',
                'avg_margin_last_5'],
          groups: ['performance'] },
        { key: 'player', color: 'sky', icon: 'player', title: 'Pitcher & Lineup',
          titleBy: { NFL: 'Quarterback & Lineup' },
          desc: 'Starting pitcher or quarterback, and starter handedness on both sides.',
          ids: ['starter_name', 'opp_starter_name', 'starter_hand', 'opp_starter_hand', 'nfl_qb'],
          groups: ['player'] },
        { key: 'venue', color: 'violet', icon: 'venue', title: 'Venue & Conditions',
          desc: 'Stadium, roof, surface, temperature, wind, and day or night.',
          ids: ['venue_name', 'day_night', 'roof', 'surface', 'temperature', 'wind', 'neutral_site', 'attendance'],
          groups: ['venue'] },
        { key: 'h2h', color: 'teal', icon: 'vs', title: 'Head-to-Head & Opponent',
          desc: 'Every report is head to head. Add what the opponent brought in.',
          ids: ['opp_prev_result', 'opp_su_streak', 'opp_win_pct', 'opp_avg_scored_last_5', 'opp_rest_days',
                'opp_back_to_back'],
          groups: ['h2h'] }
    ];
    var SHORT = {
        moneyline_range: 'Moneyline range', role: 'Fav or dog', spread_range: 'Spread range', total_range: 'Total range',
        min_rest_days: 'Rest days', back_to_back: 'Back-to-back', day_of_week: 'Day of week', month: 'Month',
        nfl_primetime: 'Primetime', start_time: 'Start time', season_type: 'Postseason',
        ats_streak: 'ATS streaks', ou_streak: 'O/U streaks', ats_covers_last_10: 'Covers last 10', ou_overs_last_10: 'Overs last 10',
        after_blowout_loss: 'Blowout loss', after_blowout_win: 'Blowout win', prev_ats_result: 'Last ATS', prev_ou_result: 'Last O/U', rest_days_range: 'Rest range', su_result: 'SU result', ats_result: 'ATS result', after_close_game: 'Close game', prev_result: 'Last result', su_streak: 'Win streaks',
        season_win_pct: 'Season win %', avg_scored_last_5: 'Scoring L5', avg_margin_last_5: 'Margin L5', nhl_shots: 'Shots',
        starter_name: 'Starting pitcher', opp_starter_name: 'Opp. starter', season_wins: 'Season wins', season_losses: 'Season losses', starter_hand: 'Handedness', opp_starter_hand: 'Opp. hand', nfl_qb: 'Starting QB',
        roof: 'Indoor/Outdoor', temperature: 'Temperature', wind: 'Wind', day_night: 'Day/Night', venue_name: 'Stadium',
        surface: 'Surface', opp_prev_result: 'Opp. last result', opp_su_streak: 'Opp. streak', opp_win_pct: 'Opp. win %',
        opp_rest_days: 'Opp. rest'
    };

    // ------------------------------------------------------- library
    // live[sport] = { on: {id:1}, spec: {id: {...}} } once fetched.
    var live = {};
    function specOf(id) { return CAT.filters[id] || null; }
    function onFor(sport) {
        if (live[sport]) return live[sport].on;
        var on = {};
        ((CAT.sports[sport] || {}).on || []).forEach(function (i) { on[i] = 1; });
        return on;
    }
    var cardOf = {};       // id -> card key
    function rebuildMap() {
        cardOf = {};
        CARDS.forEach(function (c) { c.ids.forEach(function (i) { if (!cardOf[i]) cardOf[i] = c.key; }); });
        CAT.order.forEach(function (i) {
            if (cardOf[i]) return;
            var g = (specOf(i) || {}).g;
            var c = CARDS.filter(function (x) { return (x.groups || []).indexOf(g) !== -1; })[0];
            cardOf[i] = c ? c.key : 'edges';
        });
    }
    function idsOf(card) {
        var named = card.ids.filter(function (i) { return specOf(i); });
        var extra = CAT.order.filter(function (i) { return cardOf[i] === card.key && named.indexOf(i) === -1; });
        return named.concat(extra);
    }
    /** ids of a card offered for a sport ('ALL' = offered in any sport). */
    function availIds(card, sport) {
        return idsOf(card).filter(function (i) {
            if (sport !== 'ALL') return !!onFor(sport)[i];
            return SPORTS.some(function (s) { return onFor(s)[i]; });
        });
    }
    function sportsFor(id) { return SPORTS.filter(function (s) { return onFor(s)[id]; }); }
    function titleOf(card, sport) { return (card.titleBy && card.titleBy[sport]) || card.title; }

    async function loadLive() {
        if (!loggedIn() || !window.api.getBetLegendProMatchupFilters) return;
        await Promise.all(SPORTS.map(async function (s) {
            try {
                var lib = await window.api.getBetLegendProMatchupFilters(s);
                if (!lib || !Array.isArray(lib.groups)) return;
                var on = {};
                lib.groups.forEach(function (g) {
                    (g.filters || []).forEach(function (f) {
                        if (!CAT.filters[f.id] && !/_all$/.test(f.id) && ['venue', 'head_to_head_only', 'opponent_type'].indexOf(f.id) === -1) {
                            CAT.filters[f.id] = { l: f.label, h: f.help || '', a: f.applies_to === 'game' ? 'g' : 't', g: g.id };
                            CAT.order.push(f.id);
                        }
                        if (f.available && CAT.filters[f.id]) on[f.id] = 1;
                    });
                });
                live[s] = { on: on };
                var c = lib.database_coverage;
                if (c && c.earliest_season) CAT.sports[s] = Object.assign({}, CAT.sports[s], { from: c.earliest_season, to: c.latest_season });
            } catch (e) { /* snapshot stays */ }
        }));
        rebuildMap();
        paintAll();
    }

    // ------------------------------------------------------ state
    var state = { sport: 'ALL', favOnly: false, q: '' };
    var FAV_KEY = 'blp_dash_favorites';
    function favs() { try { var v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
    function setFavs(v) { try { localStorage.setItem(FAV_KEY, JSON.stringify(v)); } catch (e) { toast('Favorites could not be saved in this browser.'); } }
    function isFav(k) { return favs().indexOf(k) !== -1; }
    function toggleFav(k) {
        var f = favs(), i = f.indexOf(k);
        if (i === -1) f.push(k); else f.splice(i, 1);
        setFavs(f);
        paintAll();
        var c = CARDS.filter(function (x) { return x.key === k; })[0];
        toast((i === -1 ? 'Pinned ' : 'Unpinned ') + (c ? titleOf(c, state.sport) : 'tool'));
    }
    var toastT;
    function toast(msg) {
        var el = $('bxToast');
        if (!el) { el = document.createElement('div'); el.id = 'bxToast'; el.className = 'bx-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
        el.textContent = msg; el.hidden = false;
        clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 2200);
    }

    // ------------------------------------------------------ paint
    function cardHtml(c) {
        var ids = availIds(c, state.sport);
        var chips = ids.slice(0, 3);
        var t = titleOf(c, state.sport);
        var fav = isFav(c.key);
        return '<article class="bx-card bx-card--' + c.color + '" data-card="' + c.key + '">'
            + '<span class="bx-card-wm" aria-hidden="true">' + I[c.icon] + '</span>'
            + '<button type="button" class="bx-star" data-fav="' + c.key + '" aria-pressed="' + fav + '" aria-label="'
            + (fav ? 'Unpin ' : 'Pin ') + esc(t) + '" title="' + (fav ? 'Unpin from favorites' : 'Pin to favorites') + '">' + I.star + '</button>'
            + '<span class="bx-card-ic" aria-hidden="true">' + I[c.icon] + '</span>'
            + '<h3><button type="button" data-open="' + c.key + '">' + esc(t) + '</button></h3>'
            + '<p>' + esc(c.desc) + '</p>'
            + '<div class="bx-card-foot"><span class="bx-chips">'
            + chips.map(function (i) {
                return '<button type="button" class="bx-chip" data-use="' + esc(i) + '" title="' + esc(specOf(i).l) + '">'
                    + esc(SHORT[i] || specOf(i).l) + '</button>';
            }).join('') + '</span>'
            + '<button type="button" class="bx-go" data-open="' + c.key + '" aria-label="Open ' + esc(t) + '">' + I.arrow + '</button>'
            + '</div>'
            + '<span class="bx-count">' + ids.length + (ids.length === 1 ? ' filter' : ' filters')
            + (state.sport === 'ALL' ? '' : ' for ' + state.sport) + '</span>'
            + '</article>';
    }
    function visibleCards() {
        var f = favs();
        return CARDS.filter(function (c) {
            if (!availIds(c, state.sport).length) return false;        // nothing to offer in this sport
            if (state.favOnly && f.indexOf(c.key) === -1) return false;
            return true;
        });
    }
    function paintGrid() {
        var list = visibleCards();
        if (state.q) {
            var hitCards = searchHits().cards;
            list = list.filter(function (c) { return hitCards[c.key]; });
        }
        $('bxGrid').innerHTML = list.length ? list.map(cardHtml).join('')
            : '<p class="bx-empty">' + (state.favOnly && !state.q
                ? 'No favorites yet. Tap the star on any tool to pin it here.'
                : 'No tool matches that search.') + '</p>';
    }
    function paintSports() {
        document.querySelectorAll('[data-sport-pick]').forEach(function (b) {
            b.setAttribute('aria-pressed', String(b.getAttribute('data-sport-pick') === state.sport));
        });
        $('bxFavTab').setAttribute('aria-pressed', String(state.favOnly));
    }
    function paintPins() {
        var f = favs();
        var html = f.map(function (k) {
            var c = CARDS.filter(function (x) { return x.key === k; })[0];
            if (!c) return '';
            return '<button type="button" class="bx-pin" style="--c1:var(--pin-' + c.color + ')" data-open="' + c.key + '" title="'
                + esc(titleOf(c, state.sport)) + '" aria-label="Open ' + esc(titleOf(c, state.sport)) + '">' + I[c.icon] + '</button>';
        }).join('');
        $('bxPins').innerHTML = html + '<button type="button" class="bx-pin bx-pin--add" id="bxPinAdd" title="How to pin a tool" aria-label="How to pin a tool">' + I.plus + '</button>';
        $('bxPinNote').hidden = f.length > 0;
    }
    function paintCounts() {
        var all = {};
        SPORTS.forEach(function (s) { Object.keys(onFor(s)).forEach(function (i) { all[i] = 1; }); });
        var n = Object.keys(all).length;
        if ($('bxFilterCount')) $('bxFilterCount').textContent = String(n);
        var from = Math.min.apply(null, SPORTS.map(function (s) { return (CAT.sports[s] || {}).from || 9999; }));
        var to = Math.max.apply(null, SPORTS.map(function (s) { return (CAT.sports[s] || {}).to || 0; }));
        if ($('bxYears') && from < 9999 && to) $('bxYears').textContent = 'Since ' + from;
    }

    // ------------------------------------------------------ search
    function norm(s) { return String(s || '').toLowerCase(); }
    function searchHits() {
        var q = norm(state.q).trim(), cards = {}, filters = [];
        if (!q) return { cards: cards, filters: filters };
        var words = q.split(/\s+/);
        var match = function (txt) { txt = norm(txt); return words.every(function (w) { return txt.indexOf(w) !== -1; }); };
        CARDS.forEach(function (c) {
            if (match(titleOf(c, state.sport) + ' ' + c.desc)) cards[c.key] = 1;
        });
        CAT.order.forEach(function (i) {
            var s = specOf(i);
            if (!s || !match(s.l + ' ' + s.h + ' ' + (SHORT[i] || ''))) return;
            var sp = sportsFor(i);
            if (!sp.length || (state.sport !== 'ALL' && sp.indexOf(state.sport) === -1)) return;
            filters.push(i);
            cards[cardOf[i]] = 1;
        });
        return { cards: cards, filters: filters };
    }
    function paintResults() {
        var box = $('bxResults');
        if (!state.q.trim()) { box.hidden = true; box.innerHTML = ''; return; }
        var h = searchHits();
        var f = h.filters.slice(0, 18);
        box.innerHTML = '<h3>' + (h.filters.length ? h.filters.length + (h.filters.length === 1 ? ' filter' : ' filters') + ' match' + (h.filters.length === 1 ? 'es' : '')
            : 'No filter matches') + ' &ldquo;' + esc(state.q.trim()) + '&rdquo;</h3>'
            + (f.length ? '<ul>' + f.map(function (i) {
                var s = specOf(i), card = CARDS.filter(function (c) { return c.key === cardOf[i]; })[0];
                return '<li><button type="button" class="bx-hit" data-use="' + esc(i) + '"><span>' + esc(s.l)
                    + '<small>' + esc(card ? titleOf(card, state.sport) : '') + ' &middot; ' + esc(sportsFor(i).join(', ')) + '</small></span>'
                    + '<span class="bx-hit-go" aria-hidden="true">Open &rarr;</span></button></li>';
            }).join('') + '</ul>'
                : '<p class="bx-empty">Try rest, streak, blowout, moneyline, pitcher, wind or primetime.</p>');
        box.hidden = false;
    }
    function paintAll() { paintSports(); paintGrid(); paintPins(); paintResults(); paintCounts(); if (drawer.card) paintDrawer(); }

    // ------------------------------------------------------ drawer
    var drawer = { card: null, sport: null, q: '', lastFocus: null };
    function openDrawer(key) {
        var c = CARDS.filter(function (x) { return x.key === key; })[0];
        if (!c) return;
        drawer.card = c;
        var offered = SPORTS.filter(function (s) { return availIds(c, s).length; });
        drawer.sport = (state.sport !== 'ALL' && offered.indexOf(state.sport) !== -1) ? state.sport : offered[0];
        drawer.q = '';
        drawer.lastFocus = document.activeElement;
        paintDrawer();
        $('bxDrawer').hidden = false;
        document.documentElement.style.overflow = 'hidden';
        setTimeout(function () { var x = $('bxDrX'); if (x) x.focus(); }, 30);
    }
    function closeDrawer() {
        $('bxDrawer').hidden = true;
        drawer.card = null;
        document.documentElement.style.overflow = '';
        if (drawer.lastFocus && drawer.lastFocus.focus) try { drawer.lastFocus.focus({ preventScroll: true }); } catch (e) { /* gone */ }
    }
    function paintDrawer() {
        var c = drawer.card, sport = drawer.sport;
        var panel = $('bxDrPanel');
        panel.style.setProperty('--c1', 'var(--pin-' + c.color + ')');
        var offered = SPORTS.filter(function (s) { return availIds(c, s).length; });
        var ids = availIds(c, sport);
        var q = norm(drawer.q).trim();
        var shown = ids.filter(function (i) { var s = specOf(i); return !q || norm(s.l + ' ' + s.h).indexOf(q) !== -1; });
        var team = shown.filter(function (i) { return specOf(i).a !== 'g'; });
        var game = shown.filter(function (i) { return specOf(i).a === 'g'; });
        var row = function (i) {
            var s = specOf(i);
            return '<div class="bx-opt"><div class="bx-opt-t"><span class="bx-opt-l">' + esc(s.l) + '</span>'
                + (s.h ? '<span class="bx-opt-h">' + esc(s.h) + '</span>' : '')
                + '<span class="bx-opt-who' + (s.a === 'g' ? ' is-game' : '') + '">' + (s.a === 'g' ? 'The game' : 'Either team') + '</span></div>'
                + '<button type="button" class="bx-btn" data-use-one="' + esc(i) + '">Use &rarr;</button></div>';
        };
        $('bxDrHead').innerHTML = '<div class="bx-dr-top"><span class="bx-card-ic" aria-hidden="true">' + I[c.icon] + '</span>'
            + '<div><h2 id="bxDrTitle">' + esc(titleOf(c, sport)) + '</h2><p>' + esc(c.desc) + '</p></div>'
            + '<button type="button" class="bx-dr-x" id="bxDrX" aria-label="Close">&times;</button></div>'
            + '<div class="bx-dr-sports" role="group" aria-label="Sport">' + offered.map(function (s) {
                return '<button type="button" class="bx-sport" data-dr-sport="' + s + '" aria-pressed="' + (s === sport) + '"><span class="bx-lg bx-lg--' + s + '">' + s + '</span>'
                    + availIds(c, s).length + '</button>';
            }).join('') + '</div>';
        var body = $('bxDrBody');
        var keepFocus = document.activeElement && document.activeElement.id === 'bxDrQ';
        body.innerHTML = '<label class="bx-dr-filter"><span class="bx-sr">Search this category</span>' + I.search
            + '<input id="bxDrQ" type="search" placeholder="Search ' + esc(titleOf(c, sport).toLowerCase()) + '&hellip;" value="' + esc(drawer.q) + '" autocomplete="off"></label>'
            + (team.length ? '<p class="bx-sec-h">For either team</p>' + team.map(row).join('') : '')
            + (game.length ? '<p class="bx-sec-h">For the game itself</p>' + game.map(row).join('') : '')
            + (!shown.length ? '<p class="bx-empty">No filter in this category matches that search.</p>' : '');
        if (keepFocus) { var qi = $('bxDrQ'); qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
        $('bxDrOpen').textContent = loggedIn() ? 'Open all ' + ids.length + ' in BetLegend Pro' : 'Log in to open in BetLegend Pro';
        $('bxDrOpen').setAttribute('data-sport', sport);
    }

    // ------------------------------------------------- hand-off to app
    var frameReady = false, pending = null;
    function frame() { return $('blpLiveFrame'); }
    function appUrl(msg) {
        if (msg.tool && msg.tool !== 'matchup') return '/betlegend-pro/app/?tool=' + msg.tool + '#' + msg.tool;
        if (!msg.ids || !msg.ids.length) return '/betlegend-pro/app/';
        return '/betlegend-pro/app/?sport=' + encodeURIComponent(msg.sport || '') + '&focus=' + encodeURIComponent(msg.ids.join(','))
            + '&focusLabel=' + encodeURIComponent(String(msg.label || '').replace(/&/g, 'and'));
    }
    function post(msg) {
        // The app needs an account. Signed out, go through login and land in
        // the app with the same category already open.
        if (!loggedIn()) { location.href = '/login/?next=' + encodeURIComponent(appUrl(msg)); return; }
        var f = frame();
        if (!f || !f.contentWindow) { location.href = appUrl(msg); return; }
        // The app's listener exists once its page has loaded; its own ready
        // note can arrive before this script listens, so check the page too.
        if (frameReady || appLoaded(f)) f.contentWindow.postMessage(msg, location.origin); else pending = msg;
        var tool = $('tool') || f;
        tool.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function appLoaded(f) {
        try {
            var w = f.contentWindow;
            return w.location.pathname.indexOf('/betlegend-pro/app/') === 0 && w.document.readyState === 'complete';
        } catch (e) { return false; }
    }
    function flush() {
        var f = frame();
        if (pending && f && f.contentWindow) { f.contentWindow.postMessage(pending, location.origin); pending = null; }
    }
    window.addEventListener('message', function (ev) {
        if (ev.origin !== location.origin || !ev.data || ev.data.type !== 'blp-embed-ready') return;
        frameReady = true; flush();
    });
    if (frame()) frame().addEventListener('load', function () { if (appLoaded(frame())) flush(); });
    function sportForIds(ids) {
        if (state.sport !== 'ALL') return state.sport;
        for (var k = 0; k < SPORTS.length; k++) if (ids.every(function (i) { return onFor(SPORTS[k])[i]; })) return SPORTS[k];
        return sportsFor(ids[0])[0] || 'MLB';
    }
    function useIds(ids, label, sport) {
        sport = sport || sportForIds(ids);
        ids = ids.filter(function (i) { return onFor(sport)[i]; });
        if (!ids.length) return;
        if (drawer.card) closeDrawer();
        post({ type: 'blp-focus', tool: 'matchup', sport: sport, ids: ids, label: label });
        if (!loggedIn()) return;
        setNav('matchup');
        toast('Opening ' + label + ' for ' + sport + ' in BetLegend Pro');
    }
    function useOne(id, sport) { var s = specOf(id); if (s) useIds([id], s.l, sport); }
    function openTool(tool) { post({ type: 'blp-focus', tool: tool }); if (loggedIn()) setNav(tool); }
    function setNav(k) {
        document.querySelectorAll('[data-nav]').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-nav') === k); });
    }

    // ------------------------------------------------------ events
    document.addEventListener('click', function (ev) {
        var t = ev.target.closest && ev.target.closest('button,a');
        if (!t) return;
        if (t.hasAttribute('data-fav')) { ev.preventDefault(); toggleFav(t.getAttribute('data-fav')); return; }
        if (t.hasAttribute('data-use')) { useOne(t.getAttribute('data-use')); return; }
        if (t.hasAttribute('data-use-one')) { useOne(t.getAttribute('data-use-one'), drawer.sport); return; }
        if (t.hasAttribute('data-open')) { openDrawer(t.getAttribute('data-open')); return; }
        if (t.hasAttribute('data-sport-pick')) { state.sport = t.getAttribute('data-sport-pick'); state.favOnly = false; paintAll(); return; }
        if (t.id === 'bxFavTab') { state.favOnly = !state.favOnly; paintAll(); return; }
        if (t.hasAttribute('data-dr-sport')) { drawer.sport = t.getAttribute('data-dr-sport'); paintDrawer(); return; }
        if (t.id === 'bxDrX') { closeDrawer(); return; }
        if (t.id === 'bxDrOpen') { useIds(availIds(drawer.card, drawer.sport), titleOf(drawer.card, drawer.sport), drawer.sport); return; }
        if (t.id === 'bxPinAdd') { toast('Tap the star on any research tool to pin it here.'); return; }
        if (t.hasAttribute('data-qs')) {
            var p = t.getAttribute('data-qs').split(':');
            useOne(p[1], p[0]); return;
        }
        if (t.hasAttribute('data-nav')) {
            var k = t.getAttribute('data-nav');
            if (k === 'home') { setNav('home'); $('tools-home').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
            if (k === 'search') { setNav('search'); var s = $('bxSearch'); s.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { s.focus({ preventScroll: true }); }, 250); return; }
            if (k === 'how') return;      // plain anchor
            openTool(k); return;
        }
        if (t.id === 'bxActOpen') { openTool('library'); }
    });
    $('bxDrawer').addEventListener('click', function (ev) { if (ev.target.classList.contains('bx-drawer-bg')) closeDrawer(); });
    document.addEventListener('keydown', function (ev) {
        if ($('bxDrawer').hidden) return;
        if (ev.key === 'Escape') { closeDrawer(); return; }
        if (ev.key === 'Tab') {        // keep focus inside the drawer
            var f = $('bxDrPanel').querySelectorAll('button,input,a[href]');
            if (!f.length) return;
            var first = f[0], last = f[f.length - 1];
            if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
            else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
        }
    });
    document.addEventListener('input', function (ev) {
        if (ev.target.id === 'bxSearch') { state.q = ev.target.value; paintGrid(); paintResults(); }
        else if (ev.target.id === 'bxDrQ') { drawer.q = ev.target.value; paintDrawer(); }
    });

    // ------------------------------------------------------ activity
    async function paintActivity() {
        var box = $('bxActivity');
        if (!loggedIn() || !window.api.getBetLegendProHistory) {
            box.innerHTML = '<p class="bx-act-note">Your saved reports appear here. '
                + '<a href="/login/?next=/betlegend-pro/">Sign in</a> to see them.</p>';
            return;
        }
        try {
            var res = await window.api.getBetLegendProHistory(100);
            var items = (res && res.items) || [];
            var wk = Date.now() - 7 * 864e5;
            var last7 = items.filter(function (it) { return it.created_at && new Date(it.created_at).getTime() >= wk; }).length;
            var newest = items.reduce(function (m, it) { var t = it.created_at ? new Date(it.created_at).getTime() : 0; return t > m ? t : m; }, 0);
            var latest = newest ? new Date(newest).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'None yet';
            var cap = function (n) { return items.length >= 100 && n >= 100 ? '100+' : String(n); };
            box.innerHTML = '<div class="bx-stats">'
                + '<div class="bx-stat"><b>' + last7 + '</b><span>Reports (7d)</span></div>'
                + '<div class="bx-stat"><b>' + cap(items.length) + '</b><span>Saved reports</span></div>'
                + '<div class="bx-stat"><b>' + esc(latest) + '</b><span>Latest report</span></div>'
                + '</div><p class="bx-act-note">' + (items.length
                    ? 'Reopening a saved report is always free. <button type="button" class="bx-linkbtn" id="bxActOpen">Open My Reports &rarr;</button>'
                    : 'Run your first report and it is kept here.') + '</p>';
        } catch (e) {
            box.innerHTML = '<p class="bx-act-note">Your report library could not be read right now. '
                + '<button type="button" class="bx-linkbtn" id="bxActOpen">Open My Reports &rarr;</button></p>';
        }
    }

    // Entitlement is painted by the page script (paintAccess) onto
    // #accessBar; mirror it in the pill and the sidebar box.
    function paintEntitled() {
        var bar = $('accessBar');
        if (!bar || !bar.classList.contains('is-entitled')) return false;
        if ($('bxQueries')) $('bxQueries').textContent = 'Unlimited reports';
        var t = ($('accessTitle') || {}).textContent || 'Access active';
        if ($('bxPromoTitle')) $('bxPromoTitle').innerHTML = '<em>' + esc(t) + '</em>';
        if ($('bxPromoText')) $('bxPromoText').textContent = 'Stack situations for both teams, then read the games behind every number.';
        var btn = $('bxPromoBtn');
        if (btn) { btn.setAttribute('href', '#how'); btn.innerHTML = 'How it works <span aria-hidden="true">&rarr;</span>'; }
        return true;
    }
    if (!paintEntitled() && window.MutationObserver && $('accessBar')) {
        var mo = new MutationObserver(function () { if (paintEntitled()) mo.disconnect(); });
        mo.observe($('accessBar'), { attributes: true, attributeFilter: ['class'] });
    }

    // ------------------------------------------------------ boot
    // The drawer must sit above the site header, outside main's stacking context.
    document.body.appendChild($('bxDrawer'));
    rebuildMap();
    paintAll();
    paintActivity();
    loadLive();
})();
