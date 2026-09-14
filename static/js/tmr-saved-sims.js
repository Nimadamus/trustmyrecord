/* My Saved Simulations (/sports-simulators/saved/). SAVED_SIMS_REDESIGN_20260913
 *
 * One history for every simulator that writes to the owner-scoped store
 * (/api/mlb-simulator-save). Rows carry simulation_type; View and Run again send
 * the member back to the simulator that produced the row.
 *
 * Score honesty. Two different numbers have been saved under the same
 * awayScore/homeScore keys:
 *   - MLB rows ('game') have always saved the box score of one simulated game.
 *   - NFL rows ('nfl_game') saved before SIM_SCORE_SYNC_20260913 hold only the
 *     rounded average of the whole run. They are labelled "Model average"
 *     and nothing here invents a single game for them.
 *   - NFL rows saved after it carry scoreKind:'simulated' plus the average in
 *     projectedAwayScore/projectedHomeScore, and are labelled accordingly.
 */
(function () {
    'use strict';

    var API_PREFIX = '/mlb-simulator-save';
    var PAGE_SIZE = 24;
    var SPORTS = {
        nfl: { type: 'nfl_game', label: 'NFL', path: '/nfl-simulator/' },
        mlb: { type: 'game', label: 'MLB', path: '/mlb-simulator/' }
    };
    var TYPE_TO_SPORT = { nfl_game: 'nfl', game: 'mlb' };

    var NFL_TEAMS = {
        'Arizona Cardinals': ['ARI', 'ari'], 'Atlanta Falcons': ['ATL', 'atl'], 'Baltimore Ravens': ['BAL', 'bal'],
        'Buffalo Bills': ['BUF', 'buf'], 'Carolina Panthers': ['CAR', 'car'], 'Chicago Bears': ['CHI', 'chi'],
        'Cincinnati Bengals': ['CIN', 'cin'], 'Cleveland Browns': ['CLE', 'cle'], 'Dallas Cowboys': ['DAL', 'dal'],
        'Denver Broncos': ['DEN', 'den'], 'Detroit Lions': ['DET', 'det'], 'Green Bay Packers': ['GB', 'gb'],
        'Houston Texans': ['HOU', 'hou'], 'Indianapolis Colts': ['IND', 'ind'], 'Jacksonville Jaguars': ['JAX', 'jax'],
        'Kansas City Chiefs': ['KC', 'kc'], 'Las Vegas Raiders': ['LV', 'lv'], 'Los Angeles Chargers': ['LAC', 'lac'],
        'Los Angeles Rams': ['LA', 'lar'], 'Miami Dolphins': ['MIA', 'mia'], 'Minnesota Vikings': ['MIN', 'min'],
        'New England Patriots': ['NE', 'ne'], 'New Orleans Saints': ['NO', 'no'], 'New York Giants': ['NYG', 'nyg'],
        'New York Jets': ['NYJ', 'nyj'], 'Philadelphia Eagles': ['PHI', 'phi'], 'Pittsburgh Steelers': ['PIT', 'pit'],
        'San Francisco 49ers': ['SF', 'sf'], 'Seattle Seahawks': ['SEA', 'sea'], 'Tampa Bay Buccaneers': ['TB', 'tb'],
        'Tennessee Titans': ['TEN', 'ten'], 'Washington Commanders': ['WAS', 'wsh']
    };
    // MLB current-era select ids -> [abbr, ESPN logo slug]. Historical teams
    // ('classic-1927-nyy') get an initials badge: a modern logo on a 1927 club
    // would be wrong.
    var MLB_CURRENT = {
        ari: ['ARI', 'ari'], atl: ['ATL', 'atl'], bal: ['BAL', 'bal'], bos: ['BOS', 'bos'], chc: ['CHC', 'chc'],
        cws: ['CWS', 'chw'], cin: ['CIN', 'cin'], cle: ['CLE', 'cle'], col: ['COL', 'col'], det: ['DET', 'det'],
        hou: ['HOU', 'hou'], kc: ['KC', 'kc'], laa: ['LAA', 'laa'], lad: ['LAD', 'lad'], mia: ['MIA', 'mia'],
        mil: ['MIL', 'mil'], min: ['MIN', 'min'], nym: ['NYM', 'nym'], nyy: ['NYY', 'nyy'], ath: ['ATH', 'oak'],
        phi: ['PHI', 'phi'], pit: ['PIT', 'pit'], sd: ['SD', 'sd'], sf: ['SF', 'sf'], sea: ['SEA', 'sea'],
        stl: ['STL', 'stl'], tb: ['TB', 'tb'], tex: ['TEX', 'tex'], tor: ['TOR', 'tor'], wsh: ['WSH', 'wsh']
    };

    var state = {
        sport: 'all', q: '', sort: 'newest',
        rows: [], total: 0, counts: {}, offset: 0,
        loading: false, requestSeq: 0,
        serverQuery: null,       // null = unknown, true = backend filters, false = legacy backend
        legacyAll: null,         // legacy backend: every row, filtered here
        renamingId: null
    };

    function byId(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function fmtN(n) { return Number(n).toLocaleString('en-US'); }
    function api(path, options) {
        if (!window.api || typeof window.api.request !== 'function') {
            return Promise.reject(new Error('Backend client unavailable.'));
        }
        return window.api.request(API_PREFIX + path, options || {});
    }
    function track(name, params) {
        try { if (window.TMRAnalytics && typeof window.TMRAnalytics.track === 'function') window.TMRAnalytics.track(name, params || {}); } catch (e) {}
    }

    /* ------------------------------------------------------------ model */

    function sportOf(saved) { return TYPE_TO_SPORT[saved.simulation_type] || String(saved.simulation_type || 'other').toLowerCase(); }
    function sportMeta(key) {
        return SPORTS[key] || { type: key, label: key.replace(/_game$/, '').toUpperCase(), path: '/sports-simulators/' };
    }
    function initials(name) {
        var words = String(name || '').replace(/^\d{4}\s+/, '').split(/\s+/).filter(Boolean);
        if (!words.length) return '?';
        if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
        return words.map(function (w) { return w[0]; }).join('').slice(0, 3).toUpperCase();
    }
    function teamInfo(sport, name, selectId, abbrHint) {
        var t = { name: name || (sport === 'mlb' ? 'Team' : 'Team'), abbr: abbrHint || '', logo: '' };
        if (sport === 'nfl' && NFL_TEAMS[name]) {
            t.abbr = t.abbr || NFL_TEAMS[name][0];
            t.logo = 'https://a.espncdn.com/i/teamlogos/nfl/500/' + NFL_TEAMS[name][1] + '.png';
        } else if (sport === 'mlb') {
            var m = /^current-([a-z]+)$/.exec(selectId || '');
            if (m && MLB_CURRENT[m[1]]) {
                t.abbr = MLB_CURRENT[m[1]][0];
                t.logo = 'https://a.espncdn.com/i/teamlogos/mlb/500/' + MLB_CURRENT[m[1]][1] + '.png';
            }
        }
        if (!t.abbr) t.abbr = initials(name);
        return t;
    }
    function num(v) {
        if (v === null || v === undefined || v === '' || v === '--') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    /* SAVED_SIMS_POLISH_20260913. Every figure on a card is read from the saved
       row itself. Nothing is looked up from the current model, so an old save
       shows exactly what it held when it was made, and a field it never saved
       is simply left off the card. */
    var MLB_WEATHER = { clear: 'Clear weather', cloudy: 'Cloudy', 'light-rain': 'Light rain', 'heavy-rain': 'Heavy rain', wind: 'Windy', heat: 'Extreme heat', cold: 'Cold' };
    var MLB_DEPTH = { '500': 'Quick depth (500 games)', '2000': 'Standard depth (2,000 games)', '10000': 'Deep depth (10,000 games)' };
    var MLB_MARKET = { pure: 'Pure TMR model', market: 'Market-informed' };

    function pctText(v) {
        var m = /(\d+(?:\.\d+)?)\s*%/.exec(String(v || ''));
        return m ? m[1] + '%' : '';
    }
    function winProbability(m, r) {
        var pct = pctText(r.winProbability);
        if (!pct) return null;
        var team = '';
        if (m.sport === 'nfl') {
            team = r.winner || '';
        } else {
            var abbr = String(r.winProbability).replace(/\s*\d+(?:\.\d+)?\s*%.*$/, '').trim().toUpperCase();
            if (abbr && abbr === m.away.abbr) team = m.away.name;
            else if (abbr && abbr === m.home.abbr) team = m.home.name;
            else if (r.winner) team = String(r.winner).replace(/\s*\d+(?:\.\d+)?\s*%.*$/, '').trim();
            else team = abbr;
        }
        return team ? { team: team, pct: pct } : null;
    }
    function configChips(m, r, inp) {
        var chips = [];
        if (m.sport === 'nfl') {
            if (inp.mode === 'custom') chips.push('Custom matchup');
            else {
                var wk = /^2:(\d+)$/.exec(String(inp.week || ''));
                if (wk && inp.season) chips.push(inp.season + ' Week ' + wk[1]);
                else if (wk) chips.push('Week ' + wk[1]);
            }
            if (r.venue) chips.push(String(r.venue).replace(/\s*\((home)\)\s*$/i, ' home'));
            if (r.kickoffWindow) chips.push(String(r.kickoffWindow));
        } else if (m.sport === 'mlb') {
            if (inp.simWeatherSelect && MLB_WEATHER[inp.simWeatherSelect]) chips.push(MLB_WEATHER[inp.simWeatherSelect]);
            if (inp.simDepthSelect && MLB_DEPTH[inp.simDepthSelect]) chips.push(MLB_DEPTH[inp.simDepthSelect]);
            if (inp.simMarketModeSelect && MLB_MARKET[inp.simMarketModeSelect]) chips.push(MLB_MARKET[inp.simMarketModeSelect]);
            if (r.simulationMode) chips.push(String(r.simulationMode));
        }
        return chips;
    }

    function model(saved) {
        var r = saved.summarized_result || {};
        var inp = saved.input_parameters || {};
        var sport = sportOf(saved);
        var m = {
            id: saved.id, sport: sport, meta: sportMeta(sport), raw: saved,
            away: teamInfo(sport, r.awayTeam, inp.awayTeamSelect, r.awayAbbr),
            home: teamInfo(sport, r.homeTeam, inp.homeTeamSelect, r.homeAbbr),
            created: saved.created_at, rerun: saved.last_rerun_at,
            sims: num(r.simulations) || (sport === 'mlb' ? num(inp.simulationCountSelect) : null),
            score: null, stats: [], chips: []
        };
        m.defaultName = m.away.name + ' @ ' + m.home.name;
        m.customName = (saved.name && saved.name.trim() && saved.name.trim() !== m.defaultName) ? saved.name.trim() : '';
        m.winProb = winProbability(m, r);

        if (sport === 'nfl') {
            if (r.scoreKind === 'simulated' && num(r.simulatedAwayScore) !== null) {
                m.score = { away: num(r.simulatedAwayScore), home: num(r.simulatedHomeScore), kind: 'simulated', ot: !!r.simulatedOt };
                if (num(r.projectedAwayScore) !== null && num(r.projectedHomeScore) !== null) {
                    m.stats.push(['Model average', m.away.abbr + ' ' + r.projectedAwayScore + ' · ' + m.home.abbr + ' ' + r.projectedHomeScore]);
                }
            } else if (num(r.awayScore) !== null) {
                // Saved before single games were kept: the only score this row holds is the average.
                m.score = { away: num(r.awayScore), home: num(r.homeScore), kind: 'average' };
            }
        } else if (sport === 'mlb') {
            if (num(r.awayScore) !== null) m.score = { away: num(r.awayScore), home: num(r.homeScore), kind: 'simulated' };
            // The MLB engine's expected runs are its own run expectation for the
            // matchup, not a mean of the games played, so they are named as such.
            if (r.expectedRuns) m.stats.push(['Model expected runs', String(r.expectedRuns).replace(/\s*\/\s*/, ' · ')]);
        } else if (num(r.awayScore) !== null) {
            m.score = { away: num(r.awayScore), home: num(r.homeScore), kind: 'unknown' };
        }
        if (m.winProb) m.stats.push([m.winProb.team + ' win probability', m.winProb.pct]);
        if (m.sims && !(m.score && m.score.kind === 'average')) m.stats.push([sport === 'nfl' ? 'Simulations in model average' : 'Simulations run', fmtN(m.sims)]);
        m.chips = configChips(m, r, inp);
        return m;
    }

    /* ----------------------------------------------------------- render */

    function fmtWhen(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d)) return '';
        var opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
        if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
        return d.toLocaleString(undefined, opts);
    }
    // Two runs of one matchup can be seconds apart, so cards carry the second and the zone.
    function fmtPrecise(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d)) return '';
        return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
    }
    function logoHtml(t) {
        return '<span class="ss-logo" aria-hidden="true"><b>' + esc(t.abbr) + '</b>' +
            (t.logo ? '<img src="' + esc(t.logo) + '" alt="" loading="lazy" onerror="this.remove()" onload="this.previousSibling.style.visibility=\'hidden\'">' : '') +
            '</span>';
    }
    function scoreLabel(m) {
        if (!m.score) return 'Score not saved';
        if (m.score.kind === 'simulated') return 'This run' + (m.score.ot ? ' · overtime' : '');
        if (m.score.kind === 'average') return 'Model average' + (m.sims ? ' of ' + fmtN(m.sims) + ' simulations' : '');
        return 'Saved score';
    }
    function teamRow(t, pts, side, m) {
        var s = m.score;
        var cls = 'ss-team';
        var won = false;
        if (s && s.kind !== 'average' && s.away !== s.home) {
            won = side === 'away' ? s.away > s.home : s.home > s.away;
            cls += won ? ' is-win' : ' is-loss';
        }
        return '<div class="' + cls + '">' + logoHtml(t) +
            '<span class="ss-tname">' + esc(t.name) + '<small>' + (side === 'away' ? 'Away' : 'Home') + '</small></span>' +
            '<span class="ss-pts">' + (won ? '<span class="ss-sr">Winner, </span>' : '') + (pts === null || pts === undefined ? '&ndash;' : esc(pts)) + '</span></div>';
    }

    function cardHtml(m) {
        var title = m.customName || m.defaultName;
        var renaming = state.renamingId === m.id;
        var viewHref = m.meta.path + '?savedId=' + encodeURIComponent(m.id) + '&mode=view';
        var rerunHref = m.meta.path + '?savedId=' + encodeURIComponent(m.id) + '&mode=rerun';
        var menuId = 'ssCardMenu' + m.id;
        var precise = fmtPrecise(m.created);

        return '<article class="ss-card" data-id="' + m.id + '" data-sport="' + esc(m.sport) + '" data-score-kind="' + (m.score ? m.score.kind : 'none') + '" aria-labelledby="ssCardTitle' + m.id + '">' +
            '<div class="ss-card-top">' +
            '<span class="ss-badge" data-sport="' + esc(m.sport) + '">' + esc(m.meta.label) + '</span>' +
            '<div class="ss-card-id">' +
            (renaming
                ? '<form class="ss-rename" data-id="' + m.id + '">' +
                  '<label class="ss-sr" for="ssRename' + m.id + '">Simulation name</label>' +
                  '<input id="ssRename' + m.id + '" type="text" maxlength="120" value="' + esc(title) + '" placeholder="' + esc(m.defaultName) + '">' +
                  '<span class="ss-rename-actions"><button type="submit" class="ss-btn ss-btn-primary ss-btn-sm">Save name</button>' +
                  '<button type="button" class="ss-btn ss-btn-ghost ss-btn-sm" data-action="rename-cancel">Cancel</button></span>' +
                  '<small class="ss-dim">Leave blank to use the matchup name.</small></form>'
                : '<h3 class="ss-title" id="ssCardTitle' + m.id + '">' + esc(title) + '</h3>') +
            '<time datetime="' + esc(m.created) + '">Saved ' + esc(precise) + '</time>' +
            '</div>' +
            '<div class="ss-more">' +
            '<button type="button" class="ss-more-btn" data-action="menu" aria-haspopup="menu" aria-expanded="false" aria-controls="' + menuId + '" aria-label="More actions for ' + esc(title) + ', saved ' + esc(precise) + '">' +
            '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="4" cy="10" r="1.8" fill="currentColor"/><circle cx="10" cy="10" r="1.8" fill="currentColor"/><circle cx="16" cy="10" r="1.8" fill="currentColor"/></svg></button>' +
            '<div class="ss-card-menu" id="' + menuId + '" role="menu" hidden>' +
            '<button type="button" role="menuitem" data-action="rename">Rename</button>' +
            '<button type="button" role="menuitem" data-action="delete" class="is-danger">Delete</button>' +
            '</div></div>' +
            '</div>' +
            '<div class="ss-board" aria-label="' + esc(scoreLabel(m) + ': ' + m.away.name + ' ' + (m.score ? m.score.away : '') + ', ' + m.home.name + ' ' + (m.score ? m.score.home : '')) + '">' +
            '<p class="ss-scorekind" data-kind="' + (m.score ? m.score.kind : 'none') + '">' + esc(scoreLabel(m)) + '</p>' +
            teamRow(m.away, m.score ? m.score.away : null, 'away', m) +
            teamRow(m.home, m.score ? m.score.home : null, 'home', m) +
            '</div>' +
            (m.stats.length
                ? '<dl class="ss-stats">' + m.stats.map(function (s) { return '<div><dt>' + esc(s[0]) + '</dt><dd>' + esc(s[1]) + '</dd></div>'; }).join('') + '</dl>'
                : '') +
            (m.chips.length || m.rerun
                ? '<ul class="ss-config" aria-label="Saved settings">' + m.chips.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') +
                  (m.rerun ? '<li class="is-rerun">Last run again ' + esc(fmtWhen(m.rerun)) + '</li>' : '') + '</ul>'
                : '') +
            '<div class="ss-actions">' +
            '<a class="ss-btn ss-btn-primary" href="' + viewHref + '" data-action="view">View result</a>' +
            '<a class="ss-btn ss-btn-ghost" href="' + rerunHref + '" data-action="rerun">Run again</a>' +
            '</div>' +
            '</article>';
    }

    function skeletonHtml(n) {
        var out = '';
        for (var i = 0; i < n; i++) out += '<div class="ss-card ss-skel" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
        return out;
    }

    function renderCounts() {
        var c = state.counts;
        var all = 0;
        Object.keys(c).forEach(function (k) { all += c[k]; });
        var set = function (key, n) {
            var el = document.querySelector('[data-count="' + key + '"]');
            if (el) el.textContent = n ? fmtN(n) : '0';
        };
        set('all', all);
        set('nfl', c.nfl_game || 0);
        set('mlb', c.game || 0);
        // Any other simulator that starts saving gets its own chip automatically.
        var wrap = byId('ssFilters');
        Object.keys(c).forEach(function (type) {
            var key = TYPE_TO_SPORT[type] || type;
            if (wrap.querySelector('[data-sport="' + key + '"]')) { set(key, c[type]); return; }
            var b = document.createElement('button');
            b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
            b.setAttribute('data-sport', key);
            b.innerHTML = esc(sportMeta(key).label) + ' <span class="ss-n" data-count="' + esc(key) + '">' + fmtN(c[type]) + '</span>';
            wrap.appendChild(b);
        });
        if (!state.q) {
            byId('ssCountLine').textContent = all
                ? fmtN(all) + (all === 1 ? ' saved simulation' : ' saved simulations') + ' across ' + Object.keys(c).length + (Object.keys(c).length === 1 ? ' sport' : ' sports')
                : 'Every simulation you run while signed in is saved here.';
        }
    }

    function renderList() {
        var list = byId('ssList');
        var more = byId('ssMore');
        list.setAttribute('aria-busy', 'false');
        renderCounts();
        if (!state.rows.length) {
            var anySaves = Object.keys(state.counts).some(function (k) { return state.counts[k] > 0; });
            list.setAttribute('data-state', 'empty');
            more.hidden = true;
            byId('ssResultLine').textContent = '';
            byId('ssMoreNote').textContent = '';
            if (state.q || (state.sport !== 'all' && anySaves)) {
                list.innerHTML = '<div class="ss-empty"><h2>No saved simulations match</h2><p>' +
                    (state.q ? 'Nothing matches “' + esc(state.q) + '”' : 'You have no ' + esc(sportMeta(state.sport).label) + ' saves yet') +
                    (state.sport !== 'all' ? ' in ' + esc(sportMeta(state.sport).label) : '') + '.</p>' +
                    '<button type="button" class="ss-btn ss-btn-ghost" data-action="clear-filters">Clear filters</button></div>';
            } else {
                list.innerHTML = '<div class="ss-empty"><h2>No saved simulations yet</h2>' +
                    '<p>Run a matchup while you are signed in and it is saved here automatically, with its score and settings.</p>' +
                    '<div class="ss-empty-actions"><a class="ss-btn ss-btn-primary" href="/nfl-simulator/">Run an NFL simulation</a>' +
                    '<a class="ss-btn ss-btn-ghost" href="/mlb-simulator/">Run an MLB simulation</a></div></div>';
            }
            return;
        }
        list.setAttribute('data-state', 'loaded');
        list.innerHTML = state.rows.map(function (s) { return cardHtml(model(s)); }).join('');
        byId('ssResultLine').textContent = 'Showing ' + fmtN(state.rows.length) + ' of ' + fmtN(state.total) +
            (state.q ? ' matching “' + state.q + '”' : '') +
            (state.sport !== 'all' ? ' · ' + sportMeta(state.sport).label : '') +
            ' · ' + (state.sort === 'oldest' ? 'oldest first' : 'newest first');
        more.hidden = state.rows.length >= state.total;
        more.textContent = 'Load ' + fmtN(Math.min(PAGE_SIZE, state.total - state.rows.length)) + ' more';
        byId('ssMoreNote').textContent = state.rows.length >= state.total
            ? 'All ' + fmtN(state.total) + ' shown'
            : fmtN(state.rows.length) + ' of ' + fmtN(state.total) + ' shown';
    }

    function renderError(err) {
        var list = byId('ssList');
        var offline = err && /Failed to fetch|NetworkError|network|timeout/i.test(err.message || '');
        list.setAttribute('data-state', 'error');
        list.setAttribute('aria-busy', 'false');
        byId('ssMore').hidden = true;
        list.innerHTML = '<div class="ss-empty ss-error" role="alert"><h2>' + (offline ? 'You appear to be offline' : 'Your saved simulations did not load') + '</h2>' +
            '<p>' + (offline ? 'Check your connection, then try again.' : 'Nothing was changed or lost. Try again in a moment.') + '</p>' +
            '<button type="button" class="ss-btn ss-btn-primary" data-action="retry">Try again</button></div>';
    }

    /* ------------------------------------------------------------- data */

    function queryString(offset, limit) {
        var p = new URLSearchParams();
        p.set('limit', String(limit));
        p.set('offset', String(offset));
        if (state.sport !== 'all') p.set('sport', state.sport);
        if (state.q) p.set('q', state.q);
        if (state.sort !== 'newest') p.set('sort', state.sort);
        return '?' + p.toString();
    }

    // Older backend (limit/offset only, newest first). Pull every row once and
    // filter here so the page still works before the API change ships.
    function legacyLoadAll() {
        if (state.legacyAll) return Promise.resolve(state.legacyAll);
        var rows = [];
        function page(offset) {
            return api('?limit=100&offset=' + offset).then(function (resp) {
                var got = (resp && resp.results) || [];
                rows = rows.concat(got);
                if (got.length === 100 && rows.length < 5000) return page(offset + 100);
                state.legacyAll = rows;
                return rows;
            });
        }
        return page(0);
    }
    function legacySlice(all, offset) {
        var q = state.q.toLowerCase();
        var matchQ = function (s) {
            if (!q) return true;
            var r = s.summarized_result || {};
            return [s.name, r.awayTeam, r.homeTeam].some(function (v) { return String(v || '').toLowerCase().indexOf(q) !== -1; });
        };
        var counts = {};
        var filtered = all.filter(function (s) {
            if (!matchQ(s)) return false;
            counts[s.simulation_type] = (counts[s.simulation_type] || 0) + 1;
            return state.sport === 'all' || sportOf(s) === state.sport;
        });
        filtered.sort(function (a, b) {
            var d = new Date(a.created_at) - new Date(b.created_at) || a.id - b.id;
            return state.sort === 'oldest' ? d : -d;
        });
        return { results: filtered.slice(offset, offset + PAGE_SIZE), total: filtered.length, counts: counts };
    }

    function fetchPage(offset) {
        if (state.serverQuery === false) {
            return legacyLoadAll().then(function (all) { return legacySlice(all, offset); });
        }
        return api(queryString(offset, PAGE_SIZE)).then(function (resp) {
            if (resp && typeof resp.total === 'number' && resp.counts) {
                state.serverQuery = true;
                return resp;
            }
            state.serverQuery = false;
            return legacyLoadAll().then(function (all) { return legacySlice(all, offset); });
        });
    }

    function load(reset) {
        var seq = ++state.requestSeq;
        var list = byId('ssList');
        var more = byId('ssMore');
        state.loading = true;
        if (reset) {
            state.offset = 0;
            list.setAttribute('data-state', 'loading');
            list.setAttribute('aria-busy', 'true');
            if (!state.rows.length) list.innerHTML = skeletonHtml(6);
            else list.classList.add('is-refreshing');
        } else {
            more.disabled = true;
            more.textContent = 'Loading…';
        }
        return fetchPage(reset ? 0 : state.rows.length).then(function (resp) {
            if (seq !== state.requestSeq) return;
            var got = (resp && resp.results) || [];
            state.rows = reset ? got : state.rows.concat(got);
            state.total = resp.total;
            state.counts = resp.counts || {};
            renderList();
        }).catch(function (err) {
            if (seq !== state.requestSeq) return;
            console.error('[saved-sims] load failed', err);
            if (reset || !state.rows.length) renderError(err);
            else toast('More saves did not load. Try again.');
        }).then(function () {
            if (seq !== state.requestSeq) return;
            state.loading = false;
            list.classList.remove('is-refreshing');
            more.disabled = false;
        });
    }

    function syncUrl() {
        try {
            var u = new URL(location.href);
            ['sport', 'q', 'sort'].forEach(function (k) { u.searchParams.delete(k); });
            if (state.sport !== 'all') u.searchParams.set('sport', state.sport);
            if (state.q) u.searchParams.set('q', state.q);
            if (state.sort !== 'newest') u.searchParams.set('sort', state.sort);
            history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
        } catch (e) {}
    }
    function readUrl() {
        try {
            var p = new URLSearchParams(location.search);
            var sport = (p.get('sport') || 'all').toLowerCase();
            state.sport = /^[a-z0-9_]{1,40}$/.test(sport) ? sport : 'all';
            state.q = (p.get('q') || '').slice(0, 80);
            state.sort = p.get('sort') === 'oldest' ? 'oldest' : 'newest';
        } catch (e) {}
        byId('ssSearch').value = state.q;
        byId('ssSort').value = state.sort;
        syncFilterChips();
    }
    function syncFilterChips() {
        Array.prototype.forEach.call(byId('ssFilters').querySelectorAll('[data-sport]'), function (b) {
            b.setAttribute('aria-checked', b.getAttribute('data-sport') === state.sport ? 'true' : 'false');
        });
    }

    /* ---------------------------------------------------------- actions */

    var toastTimer = null;
    function toast(msg) {
        var t = byId('ssToast');
        t.textContent = msg;
        t.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
    }
    function rowById(id) {
        for (var i = 0; i < state.rows.length; i++) if (String(state.rows[i].id) === String(id)) return state.rows[i];
        return null;
    }
    function rerenderCard(id) {
        var row = rowById(id);
        var el = document.querySelector('.ss-card[data-id="' + id + '"]');
        if (!row || !el) return null;
        var wrap = document.createElement('div');
        wrap.innerHTML = cardHtml(model(row));
        var fresh = wrap.firstChild;
        el.parentNode.replaceChild(fresh, el);
        return fresh;
    }

    function startRename(id) {
        var prev = state.renamingId;
        state.renamingId = Number(id);
        if (prev !== null && prev !== state.renamingId) rerenderCard(prev);
        var card = rerenderCard(id);
        var input = card && card.querySelector('.ss-rename input');
        if (input) { input.focus(); input.select(); }
    }
    function cancelRename(id) {
        state.renamingId = null;
        var card = rerenderCard(id);
        var btn = card && card.querySelector('.ss-more-btn');
        if (btn) btn.focus();
    }
    function submitRename(form) {
        var id = form.getAttribute('data-id');
        var row = rowById(id);
        var input = form.querySelector('input');
        var value = input.value.trim();
        var m = row ? model(row) : null;
        var name = (!value || (m && value === m.defaultName)) ? null : value;
        var buttons = form.querySelectorAll('button');
        Array.prototype.forEach.call(buttons, function (b) { b.disabled = true; });
        api('/' + encodeURIComponent(id), { method: 'PATCH', body: { name: name } }).then(function (resp) {
            if (row && resp && resp.saved) row.name = resp.saved.name;
            else if (row) row.name = name;
            state.renamingId = null;
            var card = rerenderCard(id);
            var btn = card && card.querySelector('.ss-more-btn');
            if (btn) btn.focus();
            toast(name ? 'Renamed to “' + name + '”' : 'Name reset to the matchup');
            track('simulator_saved_renamed', { simulation_type: row && row.simulation_type });
        }).catch(function (err) {
            Array.prototype.forEach.call(buttons, function (b) { b.disabled = false; });
            toast((err && err.message) || 'Rename did not save. Try again.');
        });
    }

    var pendingDelete = null;
    var lastFocus = null;
    function openDelete(id, keepFocusTarget) {
        var row = rowById(id);
        if (!row) return;
        var m = model(row);
        pendingDelete = id;
        if (!keepFocusTarget) lastFocus = document.activeElement;
        var when = fmtPrecise(m.created);
        byId('ssDeleteBody').innerHTML = '<b>' + esc(m.customName || m.defaultName) + '</b>' +
            (m.score ? ' · ' + esc(m.away.abbr) + ' ' + esc(m.score.away) + ', ' + esc(m.home.abbr) + ' ' + esc(m.score.home) : '') +
            (when ? ' · saved ' + esc(when) : '');
        var modal = byId('ssDelete');
        modal.hidden = false;
        document.body.classList.add('ss-modal-open');
        modal.querySelector('[data-modal="cancel"]').focus();
    }
    function closeDelete() {
        pendingDelete = null;
        byId('ssDelete').hidden = true;
        document.body.classList.remove('ss-modal-open');
        if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    }
    function confirmDelete() {
        var id = pendingDelete;
        if (id === null) return;
        var btn = byId('ssDelete').querySelector('[data-modal="confirm"]');
        btn.disabled = true;
        btn.textContent = 'Deleting…';
        var row = rowById(id);
        api('/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
            state.rows = state.rows.filter(function (r) { return String(r.id) !== String(id); });
            if (state.legacyAll) state.legacyAll = state.legacyAll.filter(function (r) { return String(r.id) !== String(id); });
            state.total = Math.max(0, state.total - 1);
            if (row && state.counts[row.simulation_type]) state.counts[row.simulation_type] -= 1;
            closeDelete();
            renderList();
            toast('Saved simulation deleted');
            track('simulator_saved_deleted', { simulation_type: row && row.simulation_type });
            // Keep the page full: pull the next row in behind the one removed.
            if (state.rows.length < state.total && state.rows.length % PAGE_SIZE !== 0) {
                fetchPage(state.rows.length).then(function (resp) {
                    var got = (resp && resp.results) || [];
                    var have = {};
                    state.rows.forEach(function (r) { have[r.id] = true; });
                    got.forEach(function (r) { if (!have[r.id] && state.rows.length % PAGE_SIZE !== 0) state.rows.push(r); });
                    renderList();
                }).catch(function () {});
            }
        }).catch(function (err) {
            toast((err && err.message) || 'Delete failed. Nothing was removed.');
        }).then(function () {
            btn.disabled = false;
            btn.textContent = 'Delete';
        });
    }

    /* ---- per-card overflow menu (Rename, Delete) ---- */
    var openMenu = null;
    function closeCardMenu(focusButton) {
        if (!openMenu) return;
        var btn = openMenu.btn;
        openMenu.menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        openMenu = null;
        if (focusButton && document.contains(btn)) btn.focus();
    }
    function toggleCardMenu(btn) {
        var menu = byId(btn.getAttribute('aria-controls'));
        if (!menu) return;
        var wasOpen = openMenu && openMenu.menu === menu;
        closeCardMenu(false);
        if (wasOpen) return;
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        openMenu = { btn: btn, menu: menu };
        var first = menu.querySelector('[role="menuitem"]');
        if (first) first.focus();
    }

    /* ---- come back to the same place after View result / Run again ----
       The filters already live in the URL. What a reload loses is how far the
       member had paged and where the card sat on screen, so that is kept for the
       tab, for an hour, and used only when they arrive back from a simulator. */
    var RETURN_KEY = 'tmr_saved_sims_return';
    function rememberPlace(id) {
        try {
            var c = document.querySelector('.ss-card[data-id="' + id + '"]');
            sessionStorage.setItem(RETURN_KEY, JSON.stringify({
                search: location.search, rows: state.rows.length, id: String(id),
                offset: c ? Math.round(c.getBoundingClientRect().top) : 0,
                scrollY: Math.round(window.scrollY), at: Date.now()
            }));
        } catch (e) {}
    }
    function takePlace() {
        var saved = null;
        try { saved = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null'); sessionStorage.removeItem(RETURN_KEY); } catch (e) { return null; }
        if (!saved || Date.now() - saved.at > 60 * 60 * 1000) return null;
        var nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {};
        var fromSim = /\/(nfl|mlb)-simulator\//.test(document.referrer || '');
        if (nav.type !== 'back_forward' && !fromSim) return null;
        if (location.search && location.search !== saved.search) return null;
        return saved;
    }
    function restorePlace(place) {
        if (!place) return;
        if (!location.search && place.search) {
            try { history.replaceState(null, '', location.pathname + place.search + location.hash); } catch (e) {}
        }
        try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}
    }
    function scrollToPlace(place) {
        var card = document.querySelector('.ss-card[data-id="' + place.id + '"]');
        if (card) {
            window.scrollTo(0, Math.max(0, card.getBoundingClientRect().top + window.scrollY - (place.offset || 0)));
            card.classList.add('is-returned');
            var link = card.querySelector('[data-action="view"]');
            if (link) try { link.focus({ preventScroll: true }); } catch (e) {}
        } else {
            window.scrollTo(0, place.scrollY || 0);
        }
    }
    function loadUntil(place) {
        return load(true).then(function () {
            function step() {
                var need = Math.min(place.rows || PAGE_SIZE, state.total);
                var have = !!document.querySelector('.ss-card[data-id="' + place.id + '"]');
                if (have || state.rows.length >= need || state.rows.length >= state.total) return null;
                return load(false).then(step);
            }
            return step();
        }).then(function () { requestAnimationFrame(function () { scrollToPlace(place); }); });
    }

    function wire() {
        var searchTimer = null;
        byId('ssSearch').addEventListener('input', function (e) {
            clearTimeout(searchTimer);
            var v = e.target.value.trim().slice(0, 80);
            searchTimer = setTimeout(function () {
                if (v === state.q) return;
                state.q = v;
                syncUrl();
                load(true);
            }, 250);
        });
        byId('ssSort').addEventListener('change', function (e) {
            state.sort = e.target.value === 'oldest' ? 'oldest' : 'newest';
            syncUrl();
            load(true);
        });
        byId('ssFilters').addEventListener('click', function (e) {
            var b = e.target.closest('[data-sport]');
            if (!b) return;
            var sport = b.getAttribute('data-sport');
            if (sport === state.sport) return;
            state.sport = sport;
            syncFilterChips();
            syncUrl();
            load(true);
        });
        byId('ssFilters').addEventListener('keydown', function (e) {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            var chips = Array.prototype.slice.call(byId('ssFilters').querySelectorAll('[data-sport]'));
            var i = chips.indexOf(document.activeElement);
            if (i < 0) return;
            var next = chips[(i + (e.key === 'ArrowRight' ? 1 : chips.length - 1)) % chips.length];
            next.focus();
            next.click();
            e.preventDefault();
        });
        byId('ssMore').addEventListener('click', function () { if (!state.loading) load(false); });

        var list = byId('ssList');
        list.addEventListener('click', function (e) {
            var el = e.target.closest('[data-action]');
            if (!el) return;
            var card = el.closest('.ss-card');
            var id = card && card.getAttribute('data-id');
            var action = el.getAttribute('data-action');
            if (action === 'menu') { toggleCardMenu(el); return; }
            if (el.getAttribute('role') === 'menuitem') closeCardMenu(false);
            if (action === 'rename') startRename(id);
            else if (action === 'rename-cancel') cancelRename(id);
            else if (action === 'delete') { lastFocus = card && card.querySelector('.ss-more-btn'); openDelete(id, true); }
            else if (action === 'retry') load(true);
            else if (action === 'clear-filters') {
                state.q = ''; state.sport = 'all';
                byId('ssSearch').value = '';
                syncFilterChips(); syncUrl(); load(true);
            } else if (action === 'view' || action === 'rerun') {
                var row = rowById(id);
                rememberPlace(id);
                track(action === 'view' ? 'simulator_saved_view_clicked' : 'simulator_saved_rerun_clicked', { simulation_type: row && row.simulation_type });
            }
        });
        list.addEventListener('submit', function (e) {
            var form = e.target.closest('.ss-rename');
            if (!form) return;
            e.preventDefault();
            submitRename(form);
        });
        list.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && e.target.closest('.ss-rename')) cancelRename(e.target.closest('.ss-rename').getAttribute('data-id'));
            var menu = e.target.closest('.ss-card-menu');
            if (menu) {
                var items = Array.prototype.slice.call(menu.querySelectorAll('[role="menuitem"]'));
                var i = items.indexOf(document.activeElement);
                if (e.key === 'Escape') { closeCardMenu(true); e.preventDefault(); }
                else if (e.key === 'ArrowDown') { items[(i + 1) % items.length].focus(); e.preventDefault(); }
                else if (e.key === 'ArrowUp') { items[(i + items.length - 1) % items.length].focus(); e.preventDefault(); }
                else if (e.key === 'Tab') closeCardMenu(false);
            }
        });
        document.addEventListener('click', function (e) { if (openMenu && !e.target.closest('.ss-more')) closeCardMenu(false); });

        var modal = byId('ssDelete');
        modal.addEventListener('click', function (e) {
            if (e.target === modal || e.target.closest('[data-modal="cancel"]')) closeDelete();
            else if (e.target.closest('[data-modal="confirm"]')) confirmDelete();
        });
        document.addEventListener('keydown', function (e) {
            if (modal.hidden) return;
            if (e.key === 'Escape') { closeDelete(); return; }
            if (e.key === 'Tab') {
                var f = modal.querySelectorAll('button');
                var first = f[0], last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
                else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
            }
        });

        byId('ssFollowed').addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action="unfollow"]');
            if (!btn) return;
            btn.disabled = true;
            api('/follow/teams/' + encodeURIComponent(btn.getAttribute('data-team-id')), { method: 'DELETE' })
                .then(loadFollowed)
                .catch(function () { btn.disabled = false; toast('Could not unfollow. Try again.'); });
        });
    }

    function wireNewMenu() {
        var btn = byId('ssNewBtn');
        var menu = byId('ssNewMenu');
        var close = function (focusBtn) {
            menu.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
            if (focusBtn) btn.focus();
        };
        btn.addEventListener('click', function () {
            var open = menu.hidden;
            menu.hidden = !open;
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) { var first = menu.querySelector('a'); if (first) first.focus(); }
        });
        document.addEventListener('click', function (e) { if (!menu.hidden && !e.target.closest('#ssNew')) close(false); });
        menu.addEventListener('keydown', function (e) {
            var items = Array.prototype.slice.call(menu.querySelectorAll('a'));
            var i = items.indexOf(document.activeElement);
            if (e.key === 'Escape') { close(true); e.preventDefault(); }
            else if (e.key === 'ArrowDown') { items[(i + 1) % items.length].focus(); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { items[(i + items.length - 1) % items.length].focus(); e.preventDefault(); }
        });
    }

    function loadFollowed() {
        var box = byId('ssFollowed');
        return api('/follow/teams').then(function (resp) {
            var teams = (resp && resp.teams) || [];
            box.setAttribute('data-state', teams.length ? 'loaded' : 'empty');
            box.innerHTML = teams.length
                ? teams.map(function (t) {
                    var n = esc(t.team_name || t.team_id);
                    return '<span class="ss-chip">' + n + '<button type="button" data-action="unfollow" data-team-id="' + esc(t.team_id) + '" aria-label="Unfollow ' + n + '">&times;</button></span>';
                }).join('')
                : '<p class="ss-dim">You are not following any teams yet. Follow a team from a simulation result.</p>';
        }).catch(function () {
            box.setAttribute('data-state', 'error');
            box.innerHTML = '<p class="ss-dim">Followed teams did not load.</p>';
        });
    }

    function init() {
        wireNewMenu();
        var gate = byId('ssGate');
        var content = byId('ssContent');
        if (!window.api || typeof window.api.getCurrentUser !== 'function') {
            gate.setAttribute('data-state', 'error');
            gate.innerHTML = '<p>My Saved Simulations could not load. Refresh the page to try again.</p>';
            return;
        }
        window.api.getCurrentUser().then(function (me) {
            var user = me && (me.user || me);
            if (!user || !user.id) throw new Error('not authenticated');
            gate.hidden = true;
            content.hidden = false;
            var place = takePlace();
            restorePlace(place);
            readUrl();
            wire();
            if (place) loadUntil(place); else load(true);
            loadFollowed();
            track('simulator_return_visit', {});
        }).catch(function () {
            gate.setAttribute('data-state', 'unauthenticated');
            var next = location.pathname + location.search;
            gate.innerHTML = '<h2>Sign in to see your saved simulations</h2>' +
                '<p>Every MLB and NFL simulation you run while signed in is kept here, ready to reopen or run again.</p>' +
                '<div class="ss-empty-actions"><a class="ss-btn ss-btn-primary" href="/login/?next=' + encodeURIComponent(next) + '">Sign in</a>' +
                '<a class="ss-btn ss-btn-ghost" href="/signup/?next=' + encodeURIComponent(next) + '">Create a free account</a></div>';
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
