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
        cat: 'game_lines',    // selected market category (see categories())
        drawer: null,         // gameId whose full market list is open
        drawerCat: null,      // category the drawer scrolled to
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
    // SBN_BOOK_SCOPE_20260904: one book per GROUP threw real markets away. Player
    // props are several ladders in one group and the feed prices them at
    // different books (pitcher walks at DraftKings, the batter markets at
    // FanDuel), so scoping the rule to the group dropped pitcher walks entirely.
    // Alt ladders mix books by rung (Bovada posts the whole numbers, FanDuel the
    // half points), so the same rule dropped every whole number line. Scope the
    // rule to what is actually one market.
    function scopeBooks(key, items) {
        if (key === 'alt_spreads' || key === 'alt_totals') return mergeLadder(items);
        var buckets = {}, order = [];
        items.forEach(function (i) {
            var k = i.marketType || key;
            if (!buckets[k]) { buckets[k] = []; order.push(k); }
            buckets[k].push(i);
        });
        var out = [], books = {};
        order.forEach(function (k) {
            var one = singleBook(buckets[k]);
            if (one.book) books[one.book] = 1;
            out = out.concat(one.items);
        });
        return { book: onlyBook(books), items: out };
    }
    // Rungs from different books may share a ladder, but a side and line may
    // never carry two prices. When both books post the same rung, the book that
    // prices more of this ladder wins. The monotonicity pass below still throws
    // out any rung the merge leaves incoherent.
    function mergeLadder(items) {
        var count = {};
        items.forEach(function (i) { var b = i.book || '(unknown)'; count[b] = (count[b] || 0) + 1; });
        var at = {}, out = [], books = {};
        items.forEach(function (i) {
            var k = String(i.selection) + '|' + i.line;
            if (at[k] == null) { at[k] = out.length; out.push(i); return; }
            var cur = out[at[k]];
            if ((count[i.book || '(unknown)'] || 0) > (count[cur.book || '(unknown)'] || 0)) out[at[k]] = i;
        });
        out.forEach(function (i) { if (i.book) books[i.book] = 1; });
        return { book: onlyBook(books), items: out };
    }
    // A group header names a book only when every price in it came from that
    // book. Mixed groups name the book on the pick itself instead.
    function onlyBook(books) {
        var names = Object.keys(books);
        return names.length === 1 ? names[0] : null;
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
                    side: i.side || null,
                    player: i.player_name || null,
                    playerTeam: i.player_team || null,
                    propLabel: i.prop_label || null,
                    marketType: i.market_type || i.market_key || grp.key,
                    displayOnly: i.display_only === true,
                    pickable: i.pickable !== false
                };
            }).filter(function (i) {
                if (i.displayOnly || !i.pickable) return false;
                // A moneyline has no line, so requiring one dropped every
                // moneyline-only market: 62 of 80 NCAAF games were losing their
                // Second Half group outright because it held nothing else.
                var needsLine = !/(^|_)h2h$/.test(String(i.marketType || ''));
                if (!i.selection || !validOdds(i.odds)) return false;
                if (needsLine && !validLine(i.line)) return false;
                // MLB team totals below 2.5 are unit-farming lines, not markets.
                if (/team_totals/.test(grp.key) && sport === 'MLB' && Math.abs(i.line) < 2.5) return false;
                return true;
            });
            if (!items.length) return;
            var one = scopeBooks(grp.key, items);
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
        state.sport = sportKey; state.cat = 'game_lines'; state.loading = true; state.error = null; state.games = [];
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
        // opts: { top, bottom, sel, disabled, data, botLine, single }
        var single = opts.single || opts.bottom == null || opts.bottom === '';
        var cls = 'sbn-chip' + (opts.sel ? ' is-sel' : '') + (opts.disabled ? ' is-off' : '') + (single ? ' is-single' : '');
        if (opts.disabled) {
            return '<span class="' + cls + '" aria-hidden="true"><span class="sbn-chip-top">&mdash;</span></span>';
        }
        var body = '<span class="sbn-chip-top">' + esc(opts.top) + '</span>' +
            (single ? '' : '<span class="sbn-chip-bot' + (opts.botLine ? ' is-line' : '') + '">' + esc(opts.bottom) + '</span>');
        return '<button type="button" class="' + cls + '"' + (opts.sel ? ' aria-pressed="true"' : '') +
            ' data-pick="' + esc(JSON.stringify(opts.data)) + '">' + body + '</button>';
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


    // ---- Team crests ---------------------------------------------------------
    // Same source the live board uses: the ESPN logo CDN, keyed by team slug.
    // a.espncdn.com is an image host (no CORS/API involved), so this is safe from
    // the browser. Anything not in the map falls back to a clean initials badge,
    // never a broken image.
    var LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/';
    var SLUGS = {
        baseball_mlb: { 'arizona diamondbacks': 'ari', 'atlanta braves': 'atl', 'baltimore orioles': 'bal', 'boston red sox': 'bos', 'chicago cubs': 'chc', 'chicago white sox': 'chw', 'cincinnati reds': 'cin', 'cleveland guardians': 'cle', 'colorado rockies': 'col', 'detroit tigers': 'det', 'houston astros': 'hou', 'kansas city royals': 'kc', 'los angeles angels': 'laa', 'los angeles dodgers': 'lad', 'miami marlins': 'mia', 'milwaukee brewers': 'mil', 'minnesota twins': 'min', 'new york mets': 'nym', 'new york yankees': 'nyy', 'athletics': 'oak', 'oakland athletics': 'oak', 'philadelphia phillies': 'phi', 'pittsburgh pirates': 'pit', 'san diego padres': 'sd', 'san francisco giants': 'sf', 'seattle mariners': 'sea', 'st. louis cardinals': 'stl', 'st louis cardinals': 'stl', 'tampa bay rays': 'tb', 'texas rangers': 'tex', 'toronto blue jays': 'tor', 'washington nationals': 'wsh' },
        americanfootball_nfl: { 'arizona cardinals': 'ari', 'atlanta falcons': 'atl', 'baltimore ravens': 'bal', 'buffalo bills': 'buf', 'carolina panthers': 'car', 'chicago bears': 'chi', 'cincinnati bengals': 'cin', 'cleveland browns': 'cle', 'dallas cowboys': 'dal', 'denver broncos': 'den', 'detroit lions': 'det', 'green bay packers': 'gb', 'houston texans': 'hou', 'indianapolis colts': 'ind', 'jacksonville jaguars': 'jax', 'kansas city chiefs': 'kc', 'las vegas raiders': 'lv', 'los angeles chargers': 'lac', 'los angeles rams': 'lar', 'miami dolphins': 'mia', 'minnesota vikings': 'min', 'new england patriots': 'ne', 'new orleans saints': 'no', 'new york giants': 'nyg', 'new york jets': 'nyj', 'philadelphia eagles': 'phi', 'pittsburgh steelers': 'pit', 'san francisco 49ers': 'sf', 'seattle seahawks': 'sea', 'tampa bay buccaneers': 'tb', 'tennessee titans': 'ten', 'washington commanders': 'wsh' },
        basketball_nba: { 'atlanta hawks': 'atl', 'boston celtics': 'bos', 'brooklyn nets': 'bkn', 'charlotte hornets': 'cha', 'chicago bulls': 'chi', 'cleveland cavaliers': 'cle', 'dallas mavericks': 'dal', 'denver nuggets': 'den', 'detroit pistons': 'det', 'golden state warriors': 'gs', 'houston rockets': 'hou', 'indiana pacers': 'ind', 'la clippers': 'lac', 'los angeles clippers': 'lac', 'los angeles lakers': 'lal', 'memphis grizzlies': 'mem', 'miami heat': 'mia', 'milwaukee bucks': 'mil', 'minnesota timberwolves': 'min', 'new orleans pelicans': 'no', 'new york knicks': 'ny', 'oklahoma city thunder': 'okc', 'orlando magic': 'orl', 'philadelphia 76ers': 'phi', 'phoenix suns': 'phx', 'portland trail blazers': 'por', 'sacramento kings': 'sac', 'san antonio spurs': 'sa', 'toronto raptors': 'tor', 'utah jazz': 'utah', 'washington wizards': 'wsh' },
        icehockey_nhl: { 'anaheim ducks': 'ana', 'boston bruins': 'bos', 'buffalo sabres': 'buf', 'calgary flames': 'cgy', 'carolina hurricanes': 'car', 'chicago blackhawks': 'chi', 'colorado avalanche': 'col', 'columbus blue jackets': 'cbj', 'dallas stars': 'dal', 'detroit red wings': 'det', 'edmonton oilers': 'edm', 'florida panthers': 'fla', 'los angeles kings': 'la', 'minnesota wild': 'min', 'montreal canadiens': 'mtl', 'nashville predators': 'nsh', 'new jersey devils': 'nj', 'new york islanders': 'nyi', 'new york rangers': 'nyr', 'ottawa senators': 'ott', 'philadelphia flyers': 'phi', 'pittsburgh penguins': 'pit', 'san jose sharks': 'sj', 'seattle kraken': 'sea', 'st. louis blues': 'stl', 'tampa bay lightning': 'tb', 'toronto maple leafs': 'tor', 'utah hockey club': 'utah', 'vancouver canucks': 'van', 'vegas golden knights': 'vgk', 'washington capitals': 'wsh', 'winnipeg jets': 'wpg' }
    };
    var LEAGUE_PATH = { baseball_mlb: 'mlb', americanfootball_nfl: 'nfl', basketball_nba: 'nba', icehockey_nhl: 'nhl' };
    function initials(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '--';
        if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
        return (parts[parts.length - 2].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    function crest(team) {
        var api = sportMeta(state.sport).api;
        var url = crestUrl(api, team);
        if (url) {
            return '<img class="sbn-crest" src="' + url + '" alt="" loading="lazy" ' +
                'onerror="this.replaceWith(Object.assign(document.createElement(&#39;span&#39;),{className:&#39;sbn-crest sbn-crest--fb&#39;,textContent:this.getAttribute(&#39;data-i&#39;)||&#39;&#39;}))" ' +
                'data-i="' + esc(initials(team)) + '">';
        }
        return '<span class="sbn-crest sbn-crest--fb">' + esc(initials(team)) + '</span>';
    }
    // The generated map (sportsbook-next-logos.js) covers every league; the small
    // hand map below stays as a fallback if that file ever fails to load.
    function crestUrl(api, team) {
        var L = window.TMR_SBN_LOGOS, canon = window.TMR_SBN_LOGO_CANON;
        if (L && canon && L[api]) {
            var m = L[api];
            var key = canon(team);
            var hit = m[key];
            // College feeds append a nickname our source and ESPN do not always
            // share ("Nicholls State Colonels" against "Nicholls State"), so drop
            // trailing words until the location matches. Two words is the floor,
            // below which a name is too generic to match safely.
            var parts = key.split(' ');
            while (!hit && parts.length > 2) { parts.pop(); hit = m[parts.join(' ')]; }
            if (hit) return hit.charAt(0) === '~' ? (window.TMR_SBN_LOGO_PREFIX || '') + hit.slice(1) : hit;
        }
        var slug = SLUGS[api] && SLUGS[api][String(team || '').trim().toLowerCase()];
        var pathPart = LEAGUE_PATH[api];
        return slug && pathPart ? LOGO_BASE + pathPart + '/500/' + slug + '.png' : '';
    }

    // ---- Market categories ---------------------------------------------------
    // Built from the inventory the feed actually returns for the loaded sport.
    // Nothing here is invented: a category appears only when at least one game
    // carries that group_key, and its long name is the feed's own group_label.
    var CAT_ORDER = ['game_lines', 'alt_spreads', 'alt_totals', 'team_totals', 'player_props',
        'first_5', 'first_inning', 'first_half', 'second_half',
        'period_1', 'period_2', 'period_3', 'period_4'];
    // Shorter tab captions for our own long labels. The full feed label is kept
    // as the tab's title attribute and as the drawer heading.
    var CAT_SHORT = {
        alt_spreads: 'Alt Lines', alt_totals: 'Alt Totals', team_totals: 'Team Totals',
        player_props: 'Player Props', first_5: 'First 5', first_inning: '1st Inning',
        first_half: '1st Half', second_half: '2nd Half'
    };
    var LINE_GROUPS = { full_game: 1, spread: 1, total: 1 };   // folded into Game Lines
    function catLabel(key, long) {
        if (key === 'game_lines') return 'Game Lines';
        return CAT_SHORT[key] || long || key;
    }
    function catLayout(key) {
        if (key === 'team_totals') return 'ou';
        if (key === 'alt_spreads' || key === 'alt_totals' || key === 'player_props') return 'strip';
        return 'lines';   // game lines, halves, periods, First 5: h2h + spread + total
    }
    function categories() {
        var count = {}, long = {};
        state.games.forEach(function (g) {
            var seen = {};
            if (g.main) seen.game_lines = 1;
            Object.keys(g.groups).forEach(function (k) {
                if (LINE_GROUPS[k]) { seen.game_lines = 1; return; }
                seen[k] = 1; long[k] = g.groups[k].label || k;
            });
            Object.keys(seen).forEach(function (k) { count[k] = (count[k] || 0) + 1; });
        });
        var keys = Object.keys(count).sort(function (a, b) {
            var ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
            if (ia < 0) ia = 99; if (ib < 0) ib = 99;
            return ia - ib || a.localeCompare(b);
        });
        return keys.map(function (k) {
            return { key: k, label: catLabel(k, long[k]), long: long[k] || catLabel(k, null), games: count[k], layout: catLayout(k) };
        });
    }
    function activeCat() {
        var cats = categories();
        for (var i = 0; i < cats.length; i++) if (cats[i].key === state.cat) return cats[i];
        return cats[0] || null;
    }

    // ---- Reading one category out of a game ---------------------------------
    // Period / half / First 5 buckets hold three market types at once. Split them
    // the same way the primary board is split so every category reads alike.
    function isH2H(mt) { return /(^|_)h2h$/.test(mt); }
    function isSpread(mt) { return /spreads$/.test(mt) && !/team/.test(mt); }
    // UFC posts its round market as mma_total_rounds, which does not end in
    // "totals", so it matched no column and the tab priced nothing at all.
    function isTotal(mt) { return (/totals$/.test(mt) || /_rounds$/.test(mt)) && !/team/.test(mt); }
    function catLines(g, key) {
        if (key === 'game_lines') return g.main;
        var grp = g.groups[key];
        if (!grp) return null;
        var out = { book: grp.book, spread: [], h2h: [], total: [] };
        grp.items.forEach(function (i) {
            var mt = String(i.marketType || '');
            if (isH2H(mt)) out.h2h.push(i);
            else if (isSpread(mt)) out.spread.push(i);
            else if (isTotal(mt)) out.total.push(i);
        });
        if (!out.spread.length && !out.h2h.length && !out.total.length) return null;
        return out;
    }
    function catStrips(g, key) {
        var grp = g.groups[key];
        if (!grp || !grp.items.length) return [];
        var buckets = {}, order = [];
        grp.items.forEach(function (i) {
            var label;
            if (key === 'alt_totals') label = String(i.side || i.selection).toLowerCase() === 'under' ? 'Under' : 'Over';
            else if (key === 'player_props') label = (i.player || i.selection) + ' \u00b7 ' + (i.propLabel || '');
            else label = i.selection;
            if (!buckets[label]) { buckets[label] = []; order.push(label); }
            buckets[label].push(i);
        });
        return order.map(function (l) {
            return { label: l, book: grp.book, items: buckets[l].slice().sort(function (a, b) { return (a.line || 0) - (b.line || 0); }) };
        });
    }

    // ---- Board rows ----------------------------------------------------------
    function findSel(list, team) {
        if (!list) return null;
        for (var i = 0; i < list.length; i++) if (list[i].selection === team) return list[i];
        return null;
    }
    function findSide(list, over) {
        if (!list) return null;
        for (var i = 0; i < list.length; i++) {
            var t = String(list[i].side || list[i].selection).toLowerCase();
            if (over ? t === 'over' : t === 'under') return list[i];
        }
        return null;
    }
    function linesCols(cat) {
        var has = { spread: false, total: false, h2h: false };
        state.games.forEach(function (g) {
            var m = catLines(g, cat.key);
            if (!m) return;
            if ((m.spread || []).length) has.spread = true;
            if ((m.total || []).length) has.total = true;
            if ((m.h2h || []).length) has.h2h = true;
        });
        var cols = [];
        if (has.spread) cols.push('spread');
        if (has.total) cols.push('total');
        if (has.h2h) cols.push('h2h');
        return cols.length ? cols : ['spread', 'total', 'h2h'];
    }
    function linesCells(g, cat, team, isAway, cols) {
        var m = catLines(g, cat.key);
        var blank = cols.map(function () { return chip({ disabled: true }); }).join('');
        if (!m) return blank;
        var fixed = cat.key === 'game_lines' && !!FIXED_LINE_SPORTS[state.sport];
        var sp = findSel(m.spread, team), ml = findSel(m.h2h, team), to = findSide(m.total, isAway);
        var gl = cat.long, bk = m.book;
        var cell = {};
        cell.spread = sp && validOdds(sp.odds)
            ? chip({ top: fixed ? fmtOdds(sp.odds) : fmtLine(sp.line, true),
                bottom: fixed ? fmtLine(sp.line, true) : fmtOdds(sp.odds), botLine: fixed,
                sel: isSel(g, sp.marketType || 'spreads', team, sp.line),
                data: pickData(g, sp.marketType || 'spreads', team, team + ' ' + fmtLine(sp.line, true), sp.line, sp.odds, gl, bk) })
            : chip({ disabled: true });
        cell.total = to && validOdds(to.odds)
            ? chip({ top: (isAway ? 'O ' : 'U ') + fmtLine(to.line), bottom: fmtOdds(to.odds),
                sel: isSel(g, to.marketType || 'totals', isAway ? 'Over' : 'Under', to.line),
                data: pickData(g, to.marketType || 'totals', isAway ? 'Over' : 'Under', (isAway ? 'Over ' : 'Under ') + fmtLine(to.line), to.line, to.odds, gl, bk) })
            : chip({ disabled: true });
        cell.h2h = ml && validOdds(ml.odds)
            ? chip({ top: fmtOdds(ml.odds), single: true,
                sel: isSel(g, ml.marketType || 'h2h', team, null),
                data: pickData(g, ml.marketType || 'h2h', team, team + ' ML', null, ml.odds, gl, bk) })
            : chip({ disabled: true });
        return cols.map(function (c) { return cell[c]; }).join('');
    }
    function ouCells(g, cat, team) {
        var grp = g.groups[cat.key];
        var pick = function (over) {
            if (!grp) return null;
            var want = team + (over ? ' Over' : ' Under');
            for (var i = 0; i < grp.items.length; i++) if (grp.items[i].selection === want) return grp.items[i];
            return null;
        };
        return [true, false].map(function (over) {
            var it = pick(over);
            if (!it || !validOdds(it.odds)) return chip({ disabled: true });
            var selName = team + (over ? ' Over' : ' Under');
            return chip({ top: (over ? 'O ' : 'U ') + fmtLine(it.line), bottom: fmtOdds(it.odds),
                sel: isSel(g, it.marketType, selName, it.line),
                data: pickData(g, it.marketType, selName, it.label || selName + ' ' + fmtLine(it.line), it.line, it.odds, cat.long, it.book || grp.book) });
        }).join('');
    }
    var STRIP_MAX = 6;
    // A ladder holds far more rungs than a row can show. Pick the window around
    // the line the game is actually priced at rather than the first six, which
    // would be the longest shots on the board.
    function anchorLine(g, cat, row) {
        var m = g.main;
        if (!m) return null;
        if (cat.key === 'alt_spreads') {
            var sp = findSel(m.spread, row.label);
            return sp ? sp.line : null;
        }
        if (cat.key === 'alt_totals') {
            var to = findSide(m.total, row.label !== 'Under');
            return to ? to.line : null;
        }
        return null;
    }
    function ladderWindow(items, anchor, size) {
        if (items.length <= size) return { shown: items, from: 0 };
        var at = 0;
        if (anchor != null) {
            var best = Infinity;
            items.forEach(function (i, idx) {
                var d = Math.abs((i.line == null ? 0 : i.line) - anchor);
                if (d < best) { best = d; at = idx; }
            });
        } else {
            at = Math.floor(items.length / 2);
        }
        var from = Math.max(0, Math.min(items.length - size, at - Math.floor(size / 2)));
        return { shown: items.slice(from, from + size), from: from };
    }
    var STRIP_ROWS = { alt_spreads: 2, alt_totals: 2, player_props: 4 };
    function stripRow(g, cat, row) {
        var win = ladderWindow(row.items, anchorLine(g, cat, row), STRIP_MAX);
        var shown = win.shown;
        var rest = row.items.length - shown.length;
        var cells = shown.map(function (i) {
            var isOU = cat.key !== 'alt_spreads';
            var sel = cat.key === 'alt_totals' ? row.label : i.selection;
            var top = cat.key === 'alt_spreads' ? fmtLine(i.line, true)
                : (cat.key === 'alt_totals' ? (row.label === 'Under' ? 'U ' : 'O ') + fmtLine(i.line)
                    : ((i.side === 'Under' ? 'U ' : 'O ') + fmtLine(i.line)));
            if (cat.key === 'player_props') sel = i.selection;
            return chip({ top: top, bottom: fmtOdds(i.odds),
                sel: isSel(g, i.marketType, sel, i.line),
                data: pickData(g, i.marketType, sel, i.label || (sel + ' ' + fmtLine(i.line)), i.line, i.odds, cat.long, i.book || row.book) });
        }).join('');
        var isTeamRow = cat.key === 'alt_spreads' && (row.label === g.away || row.label === g.home);
        return '<div class="sbn-strip">' +
            '<span class="sbn-striplabel">' + (isTeamRow ? crest(row.label) : '') + '<b>' + esc(row.label) + '</b></span>' +
            '<div class="sbn-striptrack">' + cells +
            (rest > 0 ? '<button type="button" class="sbn-more" data-drawer="' + esc(g.id) + '" data-drawercat="' + esc(cat.key) + '">+' + rest + '</button>' : '') +
            '</div></div>';
    }

    var PRIMARY_KEYS = { h2h: 1, spreads: 1, totals: 1, moneyline: 1,
        full_game: 1, spread: 1, total: 1, run_line: 1, puck_line: 1, game_total: 1 };
    function deepKeys(g) {
        return Object.keys(g.groups).filter(function (k) {
            return !PRIMARY_KEYS[k] && g.groups[k].items.length;
        });
    }
    function countPrices(g) {
        var n = g.main ? ((g.main.spread || []).length + (g.main.h2h || []).length + (g.main.total || []).length) : 0;
        Object.keys(g.groups).forEach(function (k) { if (!LINE_GROUPS[k]) n += g.groups[k].items.length; });
        return n;
    }
    /* Every card names its own matchup, whatever market it is showing. On Game
       Lines the two club names are the rows themselves, but on Alt Totals the
       rows are Over and Under, on Player Props they are players, and the card
       had nothing on it that said which game those prices belonged to. The
       header is built from the same game object the prices come from, so it
       cannot drift onto the wrong card. It rides in the existing top line, so
       the card does not get taller. */
    function matchHead(g) {
        return '<span class="sbn-rowmatch">' +
            crest(g.away) + '<b>' + esc(g.away) + '</b>' +
            '<i>vs</i>' +
            crest(g.home) + '<b>' + esc(g.home) + '</b>' +
            '</span>';
    }
    function gameCard(g, cat, cols) {
        var body;
        if (cat.layout === 'strip') {
            var want = STRIP_ROWS[cat.key] || 3;
            var all = catStrips(g, cat.key);
            var rows = all.slice(0, want);
            var restRows = all.length - rows.length;
            body = rows.length ? rows.map(function (r) { return stripRow(g, cat, r); }).join('')
                : '<div class="sbn-norow">Not posted for this game.</div>';
            // pad so every card in this category is exactly the same height
            for (var pad = rows.length; rows.length && pad < want; pad++) body += '<div class="sbn-strip is-blank"></div>';
            if (rows.length) body += '<button type="button" class="sbn-striprest" data-drawer="' + esc(g.id) +
                '" data-drawercat="' + esc(cat.key) + '">' +
                (restRows > 0 ? restRows + ' more in ' + cat.label : 'See every ' + cat.label + ' price') + '</button>';
        } else if (cat.layout === 'ou') {
            body = '<div class="sbn-trow"><span class="sbn-tname">' + crest(g.away) + '<b>' + esc(g.away) + '</b></span>' + ouCells(g, cat, g.away) + '</div>' +
                '<div class="sbn-trow"><span class="sbn-tname">' + crest(g.home) + '<b>' + esc(g.home) + '</b></span>' + ouCells(g, cat, g.home) + '</div>';
        } else {
            body = '<div class="sbn-trow"><span class="sbn-tname">' + crest(g.away) + '<b>' + esc(g.away) + '</b></span>' + linesCells(g, cat, g.away, true, cols) + '</div>' +
                '<div class="sbn-trow"><span class="sbn-tname">' + crest(g.home) + '<b>' + esc(g.home) + '</b></span>' + linesCells(g, cat, g.home, false, cols) + '</div>';
        }
        var ncol = cat.layout === 'ou' ? 2 : (cols ? cols.length : 3);
        return '<article class="sbn-row sbn-row--' + cat.layout + ' sbn-cols' + ncol + '" data-game="' + esc(g.id) + '">' +
            '<div class="sbn-rowtop">' +
            matchHead(g) +
            '<span class="sbn-rowtime">' + esc(whenText(g.when)) + '</span>' +
            '<button type="button" class="sbn-deep" data-drawer="' + esc(g.id) + '">' +
            'All markets <b>' + countPrices(g) + '</b></button>' +
            '</div>' +
            '<div class="sbn-teams">' + body + '</div></article>';
    }
    var COL_NAME = { spread: 'Spread', total: 'Total', h2h: 'Moneyline' };
    function colHead(cat, cols) {
        if (cat.layout === 'strip') return '';
        var names = cat.layout === 'ou'
            ? ['Over', 'Under']
            : cols.map(function (c) {
                return c === 'spread' && cat.key === 'game_lines' ? (SPREAD_LABEL[state.sport] || 'Spread') : COL_NAME[c];
            });
        return '<div class="sbn-colhead sbn-colhead--' + cat.layout + ' sbn-cols' + names.length + '"><span></span>' +
            names.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div>';
    }
    // A11Y_20260904. The market chips are a tablist; these two give each tab a
    // stable id and name the panel it controls, so a screen reader announces
    // "Game Lines, tab, selected, 1 of 7" and can jump to the board it labels.
    var BOARD_PANEL_ID = 'sbnBoardRows';
    function catTabId(key) {
        return 'sbnCat-' + String(key).replace(/[^A-Za-z0-9_-]/g, '');
    }

    function catNav() {
        var cats = categories();
        if (!cats.length) return '';
        var active = activeCat();
        var total = state.games.reduce(function (n, g) { return n + countPrices(g); }, 0);
        return '<div class="sbn-toolbar">' +
            '<span class="sbn-boardname">' + esc(sportMeta(state.sport).label) + '</span>' +
            // A11Y_20260904: these controls switch which market the board below
            // is showing, which is a tablist, so they say so. Roles and state
            // only - the classes, the markup order and the styling are
            // untouched, so nothing about the look or the click behaviour
            // changes. tabindex is roving (the selected tab is the one in the
            // tab order) and catTabId() ties each tab to the panel it labels.
            '<nav class="sbn-cats" role="tablist" aria-label="Market categories">' +
            cats.map(function (c) {
                var on = !!(active && c.key === active.key);
                return '<button type="button" role="tab" id="' + catTabId(c.key) +
                    '" class="sbn-cat' + (on ? ' is-on' : '') +
                    '" data-cat="' + esc(c.key) +
                    '" aria-selected="' + (on ? 'true' : 'false') +
                    '" aria-controls="' + BOARD_PANEL_ID +
                    '" tabindex="' + (on ? '0' : '-1') +
                    '" title="' + esc(c.long) + '">' +
                    esc(c.label) + '<i>' + c.games + '</i></button>';
            }).join('') +
            '</nav>' +
            '<span class="sbn-tally">' + state.games.length + ' games \u00b7 ' + total.toLocaleString() + ' prices</span>' +
            '</div>';
    }

    // ---- Drawer: the whole market inventory for one game ---------------------
    function drawerGroup(g, key, title, book, items, open) {
        if (!items || !items.length) return '';
        var buckets = {}, order = [];
        items.forEach(function (i) {
            var side;
            if (key === 'player_props') side = (i.player || i.selection) + ' \u00b7 ' + (i.propLabel || '');
            else if (isTotal(String(i.marketType)) || key === 'alt_totals') side = String(i.side || i.selection).toLowerCase() === 'under' ? 'Under' : 'Over';
            else side = i.selection;
            if (!buckets[side]) { buckets[side] = []; order.push(side); }
            buckets[side].push(i);
        });
        var body = order.map(function (side) {
            var list = buckets[side].slice().sort(function (a, b) { return (a.line || 0) - (b.line || 0); });
            var cells = list.map(function (i) {
                var mt = i.marketType;
                var ou = /^(Over|Under)$/.test(side);
                // A moneyline has no line to lead with, so the price is the hero there,
                // exactly as it is in the Moneyline column on the board.
                var noLine = i.line == null;
                var top = ou ? ((side === 'Under' ? 'U ' : 'O ') + fmtLine(i.line))
                    : (noLine ? fmtOdds(i.odds) : fmtLine(i.line, !isTotal(String(mt))));
                var bottom = noLine ? '' : fmtOdds(i.odds);
                var sel = ou && key !== 'player_props' ? side : i.selection;
                var label = i.label || (sel + (noLine ? '' : ' ' + fmtLine(i.line)));
                return '<span class="sbn-dcell">' + chip({
                    top: top, bottom: bottom, sel: isSel(g, mt, sel, i.line),
                    data: pickData(g, mt, sel, label, i.line, i.odds, title, i.book || book)
                }) + '</span>';
            }).join('');
            return '<div class="sbn-drow"><span class="sbn-dside">' + esc(side) + '</span><div class="sbn-dgrid">' + cells + '</div></div>';
        }).join('');
        return '<section class="sbn-dsec' + (open ? ' is-open' : '') + '"><h4>' + esc(title) +
            '<span class="sbn-count">' + items.length + '</span>' +
            (book ? '<span class="sbn-book">' + esc(book) + '</span>' : '') + '</h4>' + body + '</section>';
    }
    function drawerHtml() {
        var g = null;
        for (var i = 0; i < state.games.length; i++) if (state.games[i].id === state.drawer) g = state.games[i];
        if (!g) return '';
        var secs = '';
        if (g.main) {
            var mainItems = [];
            (g.main.spread || []).forEach(function (x) { mainItems.push({ selection: x.selection, label: x.selection + ' ' + fmtLine(x.line, true), line: x.line, odds: x.odds, marketType: 'spreads' }); });
            (g.main.total || []).forEach(function (x) { mainItems.push({ selection: x.selection, label: x.selection + ' ' + fmtLine(x.line), line: x.line, odds: x.odds, marketType: 'totals', side: x.selection }); });
            (g.main.h2h || []).forEach(function (x) { mainItems.push({ selection: x.selection, label: x.selection + ' ML', line: null, odds: x.odds, marketType: 'h2h' }); });
            secs += drawerGroup(g, 'game_lines', 'Game Lines', g.main.book, mainItems, state.drawerCat === 'game_lines' || !state.drawerCat);
        }
        var keys = Object.keys(g.groups).filter(function (k) { return !LINE_GROUPS[k] && g.groups[k].items.length; })
            .sort(function (a, b) {
                var ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
                if (ia < 0) ia = 99; if (ib < 0) ib = 99;
                return ia - ib || a.localeCompare(b);
            });
        keys.forEach(function (k) {
            var grp = g.groups[k];
            secs += drawerGroup(g, k, grp.label || k, grp.book, grp.items, state.drawerCat === k);
        });
        return '<div class="sbn-drawer-back" data-drawerclose="1"></div>' +
            '<div class="sbn-drawer-panel" role="dialog" aria-modal="true" aria-label="All markets">' +
            '<header class="sbn-dhead"><div><div class="sbn-dmatch">' + crest(g.away) + esc(g.away) + ' <i>@</i> ' + crest(g.home) + esc(g.home) + '</div>' +
            '<div class="sbn-dwhen">' + esc(whenText(g.when)) + ' \u00b7 ' + countPrices(g) + ' prices</div></div>' +
            '<button type="button" class="sbn-dclose" data-drawerclose="1" aria-label="Close">&times;</button></header>' +
            '<div class="sbn-dbody">' + (secs || '<div class="sbn-empty">No markets are posted for this game.</div>') + '</div></div>';
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
                // A11Y_20260904: the "Units" label was floating free - no `for`,
                // so it named nothing and the field leaned on an aria-label that
                // duplicated it. Associated properly now, one id per slip row.
                '<div class="sbn-slipunits"><label for="sbnUnits' + i + '">Units</label>' +
                '<button type="button" class="sbn-step" data-units="' + i + '" data-dir="-1" aria-label="Decrease units">&minus;</button>' +
                '<input id="sbnUnits' + i + '" type="number" min="0.5" max="5" step="0.5" value="' + p.units + '" data-unitsinput="' + i + '">' +
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
            else {
                var cat = activeCat();
                var cols = cat.layout === 'lines' ? linesCols(cat) : null;
                // The rows are the tab's panel. An unstyled block wrapper: it
                // adds no padding, border or display of its own, so the column
                // header and the rows lay out exactly as they did.
                board.innerHTML = catNav() +
                    '<div id="' + BOARD_PANEL_ID + '" role="tabpanel" aria-labelledby="' +
                    catTabId(cat.key) + '">' +
                    colHead(cat, cols) +
                    state.games.map(function (g) { return gameCard(g, cat, cols); }).join('') +
                    '</div>';
            }
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

    // A11Y_20260904: a tablist is expected to be walked with the arrow keys,
    // Home and End - that is what the roving tabindex is for. Only fires when
    // focus is already on a market tab, so it takes no key away from the page.
    // Selecting re-renders the tablist and throws away the focused node, so
    // focus is put back on its replacement or the next arrow press would go
    // nowhere.
    function onTabKey(ev) {
        if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft'
            && ev.key !== 'Home' && ev.key !== 'End') return;
        var t = ev.target;
        var current = t && t.closest && t.closest('.sbn-cats [role="tab"]');
        if (!current) return;
        var list = current.parentNode;
        var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
        var i = tabs.indexOf(current);
        if (i === -1) return;
        var next;
        if (ev.key === 'Home') next = tabs[0];
        else if (ev.key === 'End') next = tabs[tabs.length - 1];
        else next = tabs[(i + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        if (!next || next === current) return;
        ev.preventDefault();
        var key = next.getAttribute('data-cat');
        next.focus();
        state.cat = key;
        render();
        var replacement = document.getElementById(catTabId(key));
        if (replacement && replacement !== document.activeElement) replacement.focus();
    }

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
        var catBtn = t.closest && t.closest('[data-cat]');
        if (catBtn) { state.cat = catBtn.getAttribute('data-cat'); render(); return; }
        var dOpen = t.closest && t.closest('[data-drawer]');
        if (dOpen) {
            state.drawer = dOpen.getAttribute('data-drawer');
            state.drawerCat = dOpen.getAttribute('data-drawercat') || state.cat;
            render();
            return;
        }
        if (t.closest && t.closest('[data-drawerclose]')) { state.drawer = null; state.drawerCat = null; render(); return; }
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
        // The engine only runs where it has a mount: the standalone preview
        // shell, or the nodes the embed script inserts into the live page when
        // its rollout flag is on. Loading this file alone changes nothing.
        if (!el('sbnBoard')) return;
        document.addEventListener('click', onClick, false);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.drawer) { state.drawer = null; render(); } }, false);
        document.addEventListener('keydown', onTabKey, false);
        document.addEventListener('change', onChange, false);
        var q = new URLSearchParams(location.search || '');
        var s = q.get('sport');
        load(s && sportMeta(s).key === s ? s : 'MLB');
        window.__sbNext = { state: state, load: load, validOdds: validOdds, singleBook: singleBook,
            monotonic: monotonic, categories: categories, render: render };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
