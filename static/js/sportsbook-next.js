/* ============================================================================
 * SPORTSBOOK_NEXT_20260903 — redesigned sportsbook, PREVIEW ONLY.
 *
 * Lives at /sportsbook/next/ and shares NOTHING with the production page except
 * the read-only board APIs, the proven api.createPick submit path and the
 * existing auth session. Nothing in this file is loaded by /sportsbook/.
 *
 * Design reference: DraftKings-style organisation (compact game cards, fixed
 * market order, market-group tabs, More Markets, right-hand slip). Branding and
 * implementation are TMR's own.
 *
 * Data integrity (audited 2026-09-03, ALT_ODDS_AUDIT):
 *   - a game's alternate ladder must come from ONE sportsbook. The board feed
 *     blends FanDuel + Bovada items into one group while the primary markets are
 *     DraftKings, which is what made alt prices fail a sanity check against the
 *     moneyline. We keep the single best-covered book per ladder and name it.
 *   - prices worse than -500, |price| > 20000, or inside (-100, 100) are dropped
 *     (ALT_LINE_INTEGRITY_20260530 thresholds), as are non-numeric line/price.
 *   - a ladder must be monotonic: a harder line may never pay less than an
 *     easier one. Offending rungs are dropped, never rewritten.
 *   - MLB team totals below 2.5 stay dropped.
 * Nothing is ever estimated or back-filled: if a market cannot be validated it
 * is hidden.
 * ========================================================================== */
(function () {
    'use strict';

    var API = (window.TMR_CONFIG && window.TMR_CONFIG.baseUrl) ||
        (window.api && window.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api';
    var BOARD_LIMIT = 60;
    var ALT_PREVIEW = 6;      // rungs shown per ladder before "Show all"

    var SPORTS = [
        { key: 'MLB', label: 'MLB', sub: 'Baseball', api: 'baseball_mlb' },
        { key: 'NFL', label: 'NFL', sub: 'Pro Football', api: 'americanfootball_nfl' },
        { key: 'NCAAF', label: 'NCAAF', sub: 'College Football', api: 'americanfootball_ncaaf' },
        { key: 'NBA', label: 'NBA', sub: 'Pro Basketball', api: 'basketball_nba' },
        { key: 'NCAAB', label: 'NCAAB', sub: 'College Basketball', api: 'basketball_ncaab' },
        { key: 'WNBA', label: 'WNBA', sub: 'Pro Basketball', api: 'basketball_wnba' },
        { key: 'NHL', label: 'NHL', sub: 'Hockey', api: 'icehockey_nhl' },
        { key: 'NPB', label: 'Japan NPB', sub: 'Baseball', api: 'baseball_npb' },
        { key: 'Soccer', label: 'Soccer', sub: 'All leagues', api: 'soccer' },
        { key: 'UFC', label: 'UFC', sub: 'Mixed Martial Arts', api: 'mma_ufc' }
    ];
    // The first market column is a fixed +/-1.5 line on these boards, so the
    // PRICE carries the information there, not the line.
    var FIXED_LINE_SPORTS = { MLB: 1, NPB: 1, NHL: 1 };
    var SPREAD_LABEL = { MLB: 'Run Line', NPB: 'Run Line', NHL: 'Puck Line', Soccer: 'Handicap' };

    var state = {
        sport: 'MLB',
        games: [],
        loading: false,
        picks: [],            // [{ key, game, market, betType, selection, label, line, odds, units, book }]
        stakeMode: 'risk',
        drawer: null,         // gameId whose full market list is open
        error: null,
        reqId: 0
    };

    // ---- small helpers -----------------------------------------------------
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function num(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
    function fmtOdds(o) { var n = num(o); if (n == null) return ''; return n > 0 ? '+' + n : String(n); }
    function fmtLine(v, signed) {
        var n = num(v); if (n == null) return '';
        var s = String(n);
        return (signed && n > 0) ? '+' + s : s;
    }
    function impliedProb(o) {
        var n = num(o); if (n == null) return null;
        return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
    }
    function whenText(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        } catch (_) { return ''; }
    }
    function started(iso) { var t = Date.parse(iso); return Number.isFinite(t) && t <= Date.now(); }
    function el(id) { return document.getElementById(id); }

    // ---- validation --------------------------------------------------------
    // A price we are willing to show. Never adjusted, only accepted or dropped.
    function validOdds(o) {
        var n = num(o);
        if (n == null) return false;
        if (n > -100 && n < 100) return false;      // not a real American price
        if (Math.abs(n) > 20000) return false;      // junk rung (-50000 etc.)
        if (n < -500) return false;                 // ALT_LINE_INTEGRITY_20260530
        return true;
    }
    function validLine(v) { return num(v) != null; }

    // Keep the single best-covered sportsbook for a ladder, so a game's
    // alternates are one book's prices rather than a blend of several.
    function singleBook(items) {
        var byBook = {}, best = null, bestN = 0;
        items.forEach(function (i) {
            var b = i.book || '(unknown)';
            byBook[b] = (byBook[b] || 0) + 1;
            if (byBook[b] > bestN) { bestN = byBook[b]; best = b; }
        });
        if (!best) return { book: null, items: [] };
        return { book: best === '(unknown)' ? null : best, items: items.filter(function (i) { return (i.book || '(unknown)') === best; }) };
    }
    // A harder rung may never pay less than an easier one. Drop the rungs that
    // break the ladder instead of "fixing" a price.
    function monotonic(items, harderIsLowerLine) {
        var out = items.slice().sort(function (a, b) { return a.line - b.line; });
        if (harderIsLowerLine) out.reverse();   // walk easiest -> hardest
        var kept = [], lastProb = null;
        out.forEach(function (i) {
            var p = impliedProb(i.odds);
            if (p == null) return;
            if (lastProb != null && p > lastProb + 0.0001) return; // harder yet likelier: drop
            lastProb = p; kept.push(i);
        });
        return kept.sort(function (a, b) { return a.line - b.line; });
    }

    // ---- feed normalisation -------------------------------------------------
    function readMain(g) {
        var bk = (g.bookmakers || [])[0];
        if (!bk || !bk.markets) return null;
        var pick = function (k) {
            var m = null;
            bk.markets.forEach(function (x) { if (x && x.key === k) m = x; });
            if (!m || !m.outcomes) return null;
            var list = m.outcomes.map(function (o) {
                return { selection: o.name, line: o.point == null ? null : num(o.point), odds: num(o.price) };
            }).filter(function (o) { return o.odds != null && o.odds > -100000; });
            return list.length ? list : null;
        };
        var main = { book: bk.title || bk.key || null, spread: pick('spreads'), h2h: pick('h2h'), total: pick('totals') };
        return (main.spread || main.h2h || main.total) ? main : null;
    }
    function readGroups(g, sport) {
        var out = {};
        (g.market_groups || []).forEach(function (grp) {
            if (!grp || !grp.key) return;
            var items = (grp.items || []).map(function (i) {
                return {
                    selection: i.selection != null ? i.selection : i.selection_label,
                    label: i.selection_label || i.selection,
                    line: num(i.line),
                    odds: num(i.odds),
                    book: i.book_title || null,
                    marketType: grp.key
                };
            }).filter(function (i) {
                if (!i.selection || !validLine(i.line) || !validOdds(i.odds)) return false;
                // MLB team totals below 2.5 are unit-farming lines, not markets.
                if (/team_totals/.test(grp.key) && sport === 'MLB' && Math.abs(i.line) < 2.5) return false;
                return true;
            });
            if (!items.length) return;
            var one = singleBook(items);
            out[grp.key] = { key: grp.key, label: grp.label || grp.key, book: one.book, items: one.items };
        });
        // Ladders get the monotonicity pass, bucketed per side.
        ['alt_spreads', 'alt_totals'].forEach(function (k) {
            var grp = out[k];
            if (!grp) return;
            var buckets = {};
            grp.items.forEach(function (i) {
                var side = k === 'alt_totals'
                    ? (String(i.selection).toLowerCase() === 'under' ? 'Under' : 'Over')
                    : i.selection;
                (buckets[side] = buckets[side] || []).push(i);
            });
            var kept = [];
            Object.keys(buckets).forEach(function (side) {
                // spreads: a LOWER line is harder. totals: Over harder as the line rises,
                // Under harder as it falls.
                var harderIsLower = (k === 'alt_spreads') ? true : (side === 'Under');
                kept = kept.concat(monotonic(buckets[side], harderIsLower));
            });
            grp.items = kept;
            if (!kept.length) delete out[k];
        });
        return out;
    }
    function normalise(g, sport) {
        return {
            id: g.id,
            sportKey: g.sport_key,
            away: g.away_team,
            home: g.home_team,
            when: g.commence_time,
            started: started(g.commence_time),
            main: readMain(g),
            groups: readGroups(g, sport),
            raw: g
        };
    }

    // ---- data --------------------------------------------------------------
    function sportMeta(key) {
        for (var i = 0; i < SPORTS.length; i++) if (SPORTS[i].key === key) return SPORTS[i];
        return SPORTS[0];
    }
    function load(sportKey) {
        var meta = sportMeta(sportKey);
        var id = ++state.reqId;
        state.sport = sportKey; state.loading = true; state.error = null; state.games = [];
        render();
        fetch(API.replace(/\/$/, '') + '/games/board/' + encodeURIComponent(meta.api) + '?limit=' + BOARD_LIMIT, { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (id !== state.reqId) return;
                var games = (d && d.games) || [];
                state.games = games.map(function (g) { return normalise(g, sportKey); })
                    .filter(function (g) { return !g.started && (g.main || Object.keys(g.groups).length); });
                state.loading = false;
                render();
            })
            .catch(function () {
                if (id !== state.reqId) return;
                state.loading = false; state.error = 'The odds feed did not respond. Try again in a moment.';
                render();
            });
    }

    // ---- pick slip ----------------------------------------------------------
    function pickKey(p) { return [p.gameId, p.marketType, p.selection, p.line == null ? '' : p.line].join('|'); }
    function findPick(k) { for (var i = 0; i < state.picks.length; i++) if (state.picks[i].key === k) return i; return -1; }
    function togglePick(p) {
        p.key = pickKey(p);
        var i = findPick(p.key);
        if (i >= 0) { state.picks.splice(i, 1); }
        else {
            if (state.picks.length >= 12) { announce('The slip holds 12 picks. Remove one first.'); return; }
            p.units = 1;
            state.picks.push(p);
        }
        render();
    }
    function announce(msg) {
        var live = el('sbnLive'); if (live) live.textContent = msg;
    }
    function stakeFor(p) {
        var dec = p.odds > 0 ? p.odds / 100 : 100 / Math.abs(p.odds);
        return state.stakeMode === 'to_win'
            ? { risk: p.units / dec, win: p.units }
            : { risk: p.units, win: p.units * dec };
    }

    // ---- submission ---------------------------------------------------------
    function seed() {
        try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (_) {}
        return 'sbn-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
    function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16); }
    function payloadFor(p) {
        var st = stakeFor(p);
        var round = function (n) { return Math.round(n * 100) / 100; };
        var body = {
            game_id: p.gameId,
            external_game_id: p.gameId,
            sport_key: p.sportKey,
            market_type: p.marketType,
            bet_type: p.marketType,
            selection: p.selection,
            selection_label: p.label,
            line_snapshot: p.line == null ? null : p.line,
            odds_snapshot: p.odds,
            units: p.units,
            stake_mode: state.stakeMode,
            units_mode: state.stakeMode,
            risk_units: round(st.risk),
            to_win_units: round(st.win),
            book_title: p.book || 'Sportsbook feed',
            book_key: '',
            market_key: p.marketType,
            market_label: p.groupLabel || 'Full Game',
            source_type: 'sportsbook',
            game_snapshot: p.snapshot,
            reasoning: ''
        };
        body.submission_batch_id = (p.seed || (p.seed = seed())) + ':' +
            hash([body.game_id, body.market_type, body.selection, body.line_snapshot, body.odds_snapshot, body.units, body.stake_mode].join('|'));
        body.submission_item_key = String(body.game_id || 'single') + '|' + body.market_type + '|' + body.selection;
        return body;
    }
    function loggedIn() {
        try {
            if (window.auth && typeof window.auth.isLoggedIn === 'function' && window.auth.isLoggedIn()) return true;
            if (window.api && typeof window.api.isLoggedIn === 'function' && window.api.isLoggedIn()) return true;
        } catch (_) {}
        return false;
    }
    function submitAll() {
        if (!state.picks.length) return;
        if (!loggedIn()) { announce('Log in to lock these picks to your record.'); window.location.href = '/login/?return=' + encodeURIComponent(location.pathname); return; }
        var btn = el('sbnSubmit'); if (btn) { btn.disabled = true; btn.textContent = 'Locking…'; }
        var client = window.api;
        if (!client || typeof client.createPick !== 'function') { announce('The pick service is unavailable right now.'); if (btn) { btn.disabled = false; btn.textContent = 'Lock picks'; } return; }
        var queue = state.picks.slice(), done = 0, failed = 0;
        (function next(i) {
            if (i >= queue.length) {
                state.picks = state.picks.filter(function (p) { return p.__failed; });
                state.picks.forEach(function (p) { delete p.__failed; });
                announce(done + (done === 1 ? ' pick locked.' : ' picks locked.') + (failed ? ' ' + failed + ' could not be saved.' : ''));
                if (btn) { btn.disabled = false; btn.textContent = 'Lock picks'; }
                render();
                return;
            }
            var p = queue[i];
            client.createPick(payloadFor(p)).then(function (res) {
                if (res && res.pick && res.pick.id != null) done++; else { failed++; p.__failed = true; }
            }).catch(function () { failed++; p.__failed = true; })
                .then(function () { next(i + 1); });
        })(0);
    }

    // ---- rendering ----------------------------------------------------------
    function chip(opts) {
        // opts: { top, bottom, heroTop, sel, disabled, data }
        var cls = 'sbn-chip' + (opts.sel ? ' is-sel' : '') + (opts.disabled ? ' is-off' : '') + (opts.heroTop ? ' hero-top' : '');
        if (opts.disabled) {
            return '<span class="' + cls + '" aria-hidden="true"><span class="sbn-chip-top">&mdash;</span><span class="sbn-chip-bot"></span></span>';
        }
        return '<button type="button" class="' + cls + '"' + (opts.sel ? ' aria-pressed="true"' : '') +
            ' data-pick="' + esc(JSON.stringify(opts.data)) + '">' +
            '<span class="sbn-chip-top">' + esc(opts.top) + '</span>' +
            '<span class="sbn-chip-bot">' + esc(opts.bottom) + '</span></button>';
    }
    function pickData(g, marketType, selection, label, line, odds, groupLabel, book) {
        return {
            gameId: g.id, sportKey: g.sportKey, marketType: marketType, selection: selection,
            label: label, line: line == null ? null : line, odds: odds, groupLabel: groupLabel || '',
            book: book || (g.main && g.main.book) || '', game: g.away + ' @ ' + g.home,
            snapshot: { id: g.id, sport_key: g.sportKey, home_team: g.home, away_team: g.away, commence_time: g.when, bookmakers: g.raw.bookmakers || [] }
        };
    }
    function isSel(g, marketType, selection, line) {
        return findPick([g.id, marketType, selection, line == null ? '' : line].join('|')) >= 0;
    }

    // ---- Main board: one compact row per game --------------------------------
    // The board is for SCANNING. It carries only the three primary markets, at a
    // fixed row height, with the column headers printed once above the list.
    // Every deeper market lives behind More markets, which opens a drawer.
    function marketCols(g) {
        var m = g.main || {};
        var find = function (arr, name) {
            if (!arr) return null;
            for (var i = 0; i < arr.length; i++) if (arr[i].selection === name) return arr[i];
            return null;
        };
        var side = function (over) {
            if (!m.total) return null;
            for (var i = 0; i < m.total.length; i++) {
                var t = String(m.total[i].selection).toLowerCase();
                if (over && t === 'over') return m.total[i];
                if (!over && t === 'under') return m.total[i];
            }
            return null;
        };
        return { find: find, side: side };
    }
    function rowCells(g, team, isAway) {
        var m = g.main || {};
        var c = marketCols(g);
        var fixed = !!FIXED_LINE_SPORTS[state.sport];
        var sp = c.find(m.spread, team), ml = c.find(m.h2h, team), to = isAway ? c.side(true) : c.side(false);
        var out = '';
        out += sp && validOdds(sp.odds)
            ? chip({ top: fixed ? fmtOdds(sp.odds) : fmtLine(sp.line, true),
                bottom: fixed ? fmtLine(sp.line, true) : fmtOdds(sp.odds), heroTop: true,
                sel: isSel(g, 'spreads', team, sp.line),
                data: pickData(g, 'spreads', team, team + ' ' + fmtLine(sp.line, true), sp.line, sp.odds, 'Full Game') })
            : chip({ disabled: true });
        out += to && validOdds(to.odds)
            ? chip({ top: (isAway ? 'O ' : 'U ') + fmtLine(to.line), bottom: fmtOdds(to.odds), heroTop: true,
                sel: isSel(g, 'totals', isAway ? 'Over' : 'Under', to.line),
                data: pickData(g, 'totals', isAway ? 'Over' : 'Under', (isAway ? 'Over ' : 'Under ') + fmtLine(to.line), to.line, to.odds, 'Full Game') })
            : chip({ disabled: true });
        out += ml && validOdds(ml.odds)
            ? chip({ top: fmtOdds(ml.odds), bottom: 'ML', heroTop: true, sel: isSel(g, 'h2h', team, null),
                data: pickData(g, 'h2h', team, team + ' ML', null, ml.odds, 'Full Game') })
            : chip({ disabled: true });
        return out;
    }
    // The board row already carries h2h / spreads / totals, so the drawer lists
    // only the markets you cannot reach from the row.
    var PRIMARY_KEYS = { h2h: 1, spreads: 1, totals: 1, moneyline: 1,
        full_game: 1, spread: 1, total: 1, run_line: 1, puck_line: 1, game_total: 1 };
    function deepKeys(g) {
        return Object.keys(g.groups).filter(function (k) {
            return !PRIMARY_KEYS[k] && g.groups[k].items.length;
        });
    }
    function countDeep(g) { return deepKeys(g).length; }
    function gameCard(g) {
        var deep = countDeep(g);
        return '<article class="sbn-row" data-game="' + esc(g.id) + '">' +
            '<div class="sbn-rowtop">' +
            '<span class="sbn-rowtime">' + esc(whenText(g.when)) + '</span>' +
            '<button type="button" class="sbn-deep" data-drawer="' + esc(g.id) + '">' +
            'More markets' + (deep ? ' <b>' + deep + '</b>' : '') + '</button>' +
            '</div>' +
            '<div class="sbn-teams">' +
            '<div class="sbn-trow"><span class="sbn-tname">' + esc(g.away) + '</span>' + rowCells(g, g.away, true) + '</div>' +
            '<div class="sbn-trow"><span class="sbn-tname">' + esc(g.home) + '</span>' + rowCells(g, g.home, false) + '</div>' +
            '</div></article>';
    }

    // ---- Drawer: the whole market inventory for one game ---------------------
    var GROUP_ORDER = [
        ['alt_spreads', 'Alternate spreads'],
        ['alt_totals', 'Alternate totals'],
        ['team_totals', 'Team totals'],
        ['f5_h2h', 'First 5 moneyline'], ['f5_spreads', 'First 5 run line'],
        ['f5_totals', 'First 5 total'], ['f5_team_totals', 'First 5 team totals'],
        ['first_inning_totals', 'First inning (NRFI / YRFI)'],
        ['first_half_h2h', 'First half moneyline'], ['first_half_spreads', 'First half spread'],
        ['first_half_totals', 'First half total'],
        ['second_half_h2h', 'Second half moneyline'], ['second_half_spreads', 'Second half spread'],
        ['second_half_totals', 'Second half total'],
        ['first_5', 'First 5 innings'],
        ['first_inning', 'First inning (NRFI / YRFI)'],
        ['mma_total_rounds', 'Total rounds']
    ];
    function drawerGroup(g, key, title) {
        var grp = g.groups[key];
        if (!grp || !grp.items.length) return '';
        var buckets = {}, order = [];
        grp.items.forEach(function (i) {
            var sl = String(i.selection).toLowerCase();
            var side = (sl === 'over' || sl === 'under') ? (sl === 'under' ? 'Under' : 'Over') : i.selection;
            if (!buckets[side]) { buckets[side] = []; order.push(side); }
            buckets[side].push(i);
        });
        var body = order.map(function (side) {
            var list = buckets[side].slice().sort(function (a, b) { return (a.line || 0) - (b.line || 0); });
            var cells = list.map(function (i) {
                var mt = key === 'alt_spreads' ? 'spreads' : (key === 'alt_totals' ? 'totals' : key);
                var isOU = (side === 'Over' || side === 'Under');
                var noLine = (i.line == null || Number(i.line) === 0);
                var top = isOU ? ((side === 'Under' ? 'U ' : 'O ') + fmtLine(i.line))
                    : (noLine ? 'ML' : fmtLine(i.line, true));
                var sel = isOU ? side : i.selection;
                var label = isOU ? (side + ' ' + fmtLine(i.line))
                    : (i.label || (i.selection + (noLine ? ' ML' : ' ' + fmtLine(i.line, true))));
                return '<span class="sbn-dcell">' + chip({
                    top: top, bottom: fmtOdds(i.odds), sel: isSel(g, mt, sel, i.line),
                    data: pickData(g, mt, sel, label, i.line, i.odds, title, grp.book)
                }) + '</span>';
            }).join('');
            return '<div class="sbn-drow"><span class="sbn-dside">' + esc(side) + '</span><div class="sbn-dgrid">' + cells + '</div></div>';
        }).join('');
        return '<section class="sbn-dsec"><h4>' + esc(title) +
            '<span class="sbn-count">' + grp.items.length + '</span>' +
            (grp.book ? '<span class="sbn-book">' + esc(grp.book) + '</span>' : '') + '</h4>' + body + '</section>';
    }
    function drawerHtml() {
        var g = null;
        for (var i = 0; i < state.games.length; i++) if (state.games[i].id === state.drawer) g = state.games[i];
        if (!g) return '';
        var secs = GROUP_ORDER.filter(function (p) { return !PRIMARY_KEYS[p[0]]; })
            .map(function (p) { return drawerGroup(g, p[0], p[1]); }).join('');
        var known = {}; GROUP_ORDER.forEach(function (p) { known[p[0]] = 1; });
        secs += deepKeys(g).filter(function (k) { return !known[k]; })
            .map(function (k) { return drawerGroup(g, k, g.groups[k].label || k); }).join('');
        return '<div class="sbn-drawer-back" data-drawerclose="1"></div>' +
            '<div class="sbn-drawer-panel" role="dialog" aria-modal="true" aria-label="All markets">' +
            '<header class="sbn-dhead"><div><div class="sbn-dmatch">' + esc(g.away) + ' <i>@</i> ' + esc(g.home) + '</div>' +
            '<div class="sbn-dwhen">' + esc(whenText(g.when)) + '</div></div>' +
            '<button type="button" class="sbn-dclose" data-drawerclose="1" aria-label="Close">&times;</button></header>' +
            '<div class="sbn-dbody">' + (secs || '<div class="sbn-empty">No additional markets are posted for this game.</div>') + '</div></div>';
    }

    function slipHtml() {
        var n = state.picks.length;
        var rows = state.picks.map(function (p, i) {
            var st = stakeFor(p);
            return '<div class="sbn-sliprow">' +
                '<div class="sbn-slipmain"><div class="sbn-slipsel">' + esc(p.label) + '</div>' +
                '<div class="sbn-slipgame">' + esc(p.game) + '</div>' +
                '<div class="sbn-slipmeta">' + esc(p.groupLabel || 'Full Game') + ' &middot; <b>' + fmtOdds(p.odds) + '</b>' +
                (p.book ? ' &middot; ' + esc(p.book) : '') + '</div></div>' +
                '<button type="button" class="sbn-slipx" data-remove="' + i + '" aria-label="Remove ' + esc(p.label) + '">&times;</button>' +
                '<div class="sbn-slipunits"><label>Units</label>' +
                '<button type="button" class="sbn-step" data-units="' + i + '" data-dir="-1" aria-label="Decrease units">&minus;</button>' +
                '<input type="number" min="0.5" max="5" step="0.5" value="' + p.units + '" data-unitsinput="' + i + '" aria-label="Units">' +
                '<button type="button" class="sbn-step" data-units="' + i + '" data-dir="1" aria-label="Increase units">+</button>' +
                '<span class="sbn-slipcalc">' + (state.stakeMode === 'to_win' ? 'Risk ' + (Math.round(st.risk * 100) / 100) : 'To win ' + (Math.round(st.win * 100) / 100)) + 'u</span>' +
                '</div></div>';
        }).join('');
        var totalRisk = state.picks.reduce(function (a, p) { return a + stakeFor(p).risk; }, 0);
        var totalWin = state.picks.reduce(function (a, p) { return a + stakeFor(p).win; }, 0);
        return '<div class="sbn-sliphead"><h3>Pick slip</h3><span class="sbn-slipcount">' + n + '</span>' +
            (n ? '<button type="button" class="sbn-clear" data-clear="1">Clear</button>' : '') + '</div>' +
            (n ? '<div class="sbn-mode" role="group" aria-label="Stake mode">' +
                '<button type="button" class="sbn-modebtn' + (state.stakeMode === 'risk' ? ' is-on' : '') + '" data-mode="risk">Risk</button>' +
                '<button type="button" class="sbn-modebtn' + (state.stakeMode === 'to_win' ? ' is-on' : '') + '" data-mode="to_win">To win</button></div>' : '') +
            '<div class="sbn-sliplist">' + (n ? rows : '<div class="sbn-slipempty"><strong>Your slip is empty</strong>Tap any price to add a pick.</div>') + '</div>' +
            (n ? '<div class="sbn-sliptotals"><span>Total risk <b>' + (Math.round(totalRisk * 100) / 100) + 'u</b></span>' +
                '<span>To win <b>' + (Math.round(totalWin * 100) / 100) + 'u</b></span></div>' +
                '<button type="button" class="sbn-submit" id="sbnSubmit">Lock ' + n + (n === 1 ? ' pick' : ' picks') + '</button>' : '');
    }

    function render() {
        var rail = el('sbnRail');
        if (rail && !rail.dataset.built) {
            rail.innerHTML = SPORTS.map(function (s) {
                return '<button type="button" class="sbn-railbtn" data-sport="' + esc(s.key) + '">' +
                    '<b>' + esc(s.label) + '</b><small>' + esc(s.sub) + '</small></button>';
            }).join('');
            rail.dataset.built = '1';
        }
        if (rail) {
            [].forEach.call(rail.querySelectorAll('.sbn-railbtn'), function (b) {
                b.classList.toggle('is-on', b.getAttribute('data-sport') === state.sport);
            });
        }
        var title = el('sbnTitle'); if (title) title.textContent = sportMeta(state.sport).label + ' board';
        var board = el('sbnBoard');
        if (board) {
            if (state.loading) board.innerHTML = '<div class="sbn-note">Loading ' + esc(sportMeta(state.sport).label) + ' odds…</div>';
            else if (state.error) board.innerHTML = '<div class="sbn-note">' + esc(state.error) + '</div>';
            else if (!state.games.length) board.innerHTML = '<div class="sbn-note">No upcoming ' + esc(sportMeta(state.sport).label) + ' games with posted odds right now.</div>';
            else board.innerHTML = '<div class="sbn-colhead"><span></span><span>' + esc(SPREAD_LABEL[state.sport] || 'Spread') + '</span><span>Total</span><span>Moneyline</span></div>' + state.games.map(gameCard).join('');
        }
        var slip = el('sbnSlip'); if (slip) slip.innerHTML = slipHtml();
        var dw = el('sbnDrawer');
        if (dw) { dw.innerHTML = state.drawer ? drawerHtml() : ''; dw.classList.toggle('is-open', !!state.drawer); }
        document.documentElement.classList.toggle('sbn-locked', !!state.drawer);
        var bar = el('sbnBar');
        if (bar) {
            bar.classList.toggle('is-on', state.picks.length > 0);
            bar.querySelector('.sbn-bartext').textContent = state.picks.length
                ? state.picks.length + (state.picks.length === 1 ? ' pick' : ' picks') + ' on your slip'
                : 'Tap a price to start';
        }
    }

    // ---- events -------------------------------------------------------------
    function onClick(ev) {
        var t = ev.target;
        var railBtn = t.closest && t.closest('.sbn-railbtn');
        if (railBtn) { load(railBtn.getAttribute('data-sport')); return; }
        var chipBtn = t.closest && t.closest('.sbn-chip[data-pick]');
        if (chipBtn) {
            var data = null;
            try { data = JSON.parse(chipBtn.getAttribute('data-pick')); } catch (_) { return; }
            togglePick(data);
            return;
        }
        var dOpen = t.closest && t.closest('[data-drawer]');
        if (dOpen) { state.drawer = dOpen.getAttribute('data-drawer'); render(); return; }
        if (t.closest && t.closest('[data-drawerclose]')) { state.drawer = null; render(); return; }
        var rm = t.closest && t.closest('[data-remove]');
        if (rm) { state.picks.splice(parseInt(rm.getAttribute('data-remove'), 10), 1); render(); return; }
        var clear = t.closest && t.closest('[data-clear]');
        if (clear) { state.picks = []; render(); return; }
        var mode = t.closest && t.closest('[data-mode]');
        if (mode) { state.stakeMode = mode.getAttribute('data-mode'); render(); return; }
        var step = t.closest && t.closest('[data-units]');
        if (step) {
            var i = parseInt(step.getAttribute('data-units'), 10);
            var dir = parseInt(step.getAttribute('data-dir'), 10);
            var p = state.picks[i]; if (!p) return;
            p.units = Math.min(5, Math.max(0.5, Math.round((p.units + dir * 0.5) * 2) / 2));
            render();
            return;
        }
        if (t.closest && t.closest('#sbnSubmit')) { submitAll(); return; }
        if (t.closest && t.closest('#sbnBar')) { document.documentElement.classList.toggle('sbn-slip-open'); return; }
        if (t.closest && t.closest('.sbn-slipclose')) { document.documentElement.classList.remove('sbn-slip-open'); return; }
    }
    function onChange(ev) {
        var inp = ev.target.closest && ev.target.closest('[data-unitsinput]');
        if (!inp) return;
        var i = parseInt(inp.getAttribute('data-unitsinput'), 10);
        var p = state.picks[i]; if (!p) return;
        var v = Math.round(parseFloat(inp.value) * 2) / 2;
        p.units = Number.isFinite(v) ? Math.min(5, Math.max(0.5, v)) : 1;
        render();
    }

    function boot() {
        document.addEventListener('click', onClick, false);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.drawer) { state.drawer = null; render(); } }, false);
        document.addEventListener('change', onChange, false);
        var q = new URLSearchParams(location.search || '');
        var s = q.get('sport');
        load(s && sportMeta(s).key === s ? s : 'MLB');
        window.__sbNext = { state: state, load: load, validOdds: validOdds, singleBook: singleBook, monotonic: monotonic };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
