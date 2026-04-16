(function() {
    'use strict';

    const SPORT_KEY_MAP = {
        NFL: 'americanfootball_nfl',
        NBA: 'basketball_nba',
        WNBA: 'basketball_wnba',
        MLB: 'baseball_mlb',
        NHL: 'icehockey_nhl',
        Soccer: 'soccer_epl',
        MLS: 'soccer_usa_mls',
        UCL: 'soccer_uefa_champs_league',
        LaLiga: 'soccer_spain_la_liga',
        SerieA: 'soccer_italy_serie_a',
        Bundesliga: 'soccer_germany_bundesliga',
        Ligue1: 'soccer_france_ligue_one',
        NCAAB: 'basketball_ncaab',
        NCAAF: 'americanfootball_ncaaf',
        ATP: 'tennis_atp',
        WTA: 'tennis_wta'
    };

    const STATUS_MAP = {
        win: 'won',
        won: 'won',
        loss: 'lost',
        lost: 'lost',
        push: 'push',
        pushed: 'push',
        pending: 'pending',
        void: 'void'
    };

    const state = {
        selectedSport: null,
        currentBoard: [],
        currentOptions: new Map(),
        selectedOption: null,
        currentUserPicks: []
    };
    const BOARD_CACHE_TTL_MS = 15000;
    const LIVE_REFRESH_MS = 20000;
    const boardCache = new Map();
    const boardRequests = new Map();
    let latestBoardRequestId = 0;

    const MARKET_LABELS = {
        h2h: 'Moneyline',
        spreads: 'Spread',
        totals: 'Game Total',
        total: 'Game Total',
        team_totals: 'Team Total',
        f5_h2h: 'First 5 ML',
        f5_spreads: 'First 5 Spread',
        f5_totals: 'First 5 Total',
        first_half_h2h: 'First Half ML',
        first_half_spreads: 'First Half Spread',
        first_half_totals: 'First Half Total',
        second_half_h2h: 'Second Half ML',
        second_half_spreads: 'Second Half Spread',
        second_half_totals: 'Second Half Total',
        period_1_h2h: '1st Period ML',
        period_1_totals: '1st Period Total',
        alt_spreads: 'Alt Spread',
        alt_totals: 'Alt Total',
        h2h_3_way: '3-Way Moneyline',
        draw_no_bet: 'Draw No Bet',
        double_chance: 'Double Chance',
        btts: 'Both Teams To Score',
        player_points: 'Player Points',
        player_rebounds: 'Player Rebounds',
        player_assists: 'Player Assists',
        player_threes: 'Player Threes',
        player_hits: 'Player Hits',
        player_home_runs: 'Player Home Runs',
        player_shots_on_goal: 'Shots On Goal'
    };

    function lockFunction(target, key, value) {
        if (!target) return;
        try {
            Object.defineProperty(target, key, {
                configurable: true,
                enumerable: true,
                get: function() {
                    return value;
                },
                set: function() {}
            });
        } catch (error) {
            target[key] = value;
        }
    }

    function normalizeStatus(rawStatus, rawResult) {
        const normalized = STATUS_MAP[String(rawStatus || rawResult || 'pending').toLowerCase()];
        return normalized || 'pending';
    }

    function getMarketLabel(marketType) {
        return MARKET_LABELS[marketType] || String(marketType || 'Pick').replace(/_/g, ' ');
    }

    function normalizePick(pick) {
        return Object.assign({}, pick, {
            status: normalizeStatus(pick.status, pick.result),
            odds_snapshot: pick.odds_snapshot != null ? pick.odds_snapshot : pick.odds,
            line_snapshot: pick.line_snapshot != null ? pick.line_snapshot : pick.line,
            units: pick.units != null ? parseFloat(pick.units) : 1
        });
    }

    function getCurrentUser() {
        if (window.auth && typeof window.auth.getCurrentUser === 'function' && window.auth.isLoggedIn()) {
            return window.auth.getCurrentUser();
        }
        return null;
    }

    function getStoredAuthToken() {
        try {
            return localStorage.getItem('trustmyrecord_token') ||
                localStorage.getItem('token') ||
                localStorage.getItem('tmr_token') ||
                '';
        } catch (error) {
            return '';
        }
    }

    function getStoredRefreshToken() {
        try {
            return localStorage.getItem('trustmyrecord_refresh_token') ||
                localStorage.getItem('refreshToken') ||
                localStorage.getItem('refresh_token') ||
                '';
        } catch (error) {
            return '';
        }
    }

    async function waitForApi() {
        if (!window.api) return null;
        if (typeof window.api.loadTokens === 'function') {
            try { window.api.loadTokens(); } catch (error) {}
        }
        if (window.api.ready) {
            try { await window.api.ready; } catch (error) {}
        }
        if (!window.api.backendAvailable && typeof window.api.detectBackend === 'function') {
            try {
                await window.api.detectBackend();
            } catch (error) {}
        }
        if (!window.api.token && window.api.refreshToken && typeof window.api.refreshAccessToken === 'function') {
            try {
                await window.api.refreshAccessToken();
            } catch (error) {}
        }
        if (window.api.baseUrl || typeof window.api.createPick === 'function' || typeof window.api.getMarketBoard === 'function') {
            return window.api;
        }
        return null;
    }

    async function ensureBackendAccessToken(apiClient) {
        const client = apiClient || window.api;
        if (client && typeof client.loadTokens === 'function') {
            try { client.loadTokens(); } catch (error) {}
        }

        if (client && client.token) return client.token;

        const storedToken = getStoredAuthToken();
        if (storedToken) {
            if (client) client.token = storedToken;
            return storedToken;
        }

        const storedRefresh = (client && client.refreshToken) || getStoredRefreshToken();
        if (storedRefresh && client) {
            client.refreshToken = storedRefresh;
            if (typeof client.refreshAccessToken === 'function') {
                try {
                    const refreshed = await client.refreshAccessToken();
                    if (refreshed && client.token) return client.token;
                } catch (error) {}
            }
        }

        throw new Error('Your login session is missing a backend access token. Please log in again before submitting picks.');
    }

    function getDirectApiBases() {
        const bases = [];
        if (window.api && window.api.baseUrl) bases.push(window.api.baseUrl);
        if (window.CONFIG && CONFIG.api) {
            if (CONFIG.api.baseUrl) bases.push(CONFIG.api.baseUrl);
            if (Array.isArray(CONFIG.api.fallbackUrls)) {
                CONFIG.api.fallbackUrls.forEach(function(url) {
                    if (url) bases.push(url);
                });
            }
        }
        bases.push('https://trustmyrecord-api.onrender.com/api');
        return bases.filter(function(base, index, arr) {
            return base && arr.indexOf(base) === index;
        }).sort(function(a, b) {
            return rankApiBase(a) - rankApiBase(b);
        });
    }

    function rankApiBase(base) {
        const value = String(base || '').toLowerCase();
        if (!value) return 99;
        if (value.indexOf('trustmyrecord-api.onrender.com') !== -1) return 0;
        if (value.indexOf('localhost') !== -1 || value.indexOf('127.0.0.1') !== -1) return 3;
        if (value.indexOf('loca.lt') !== -1) return 2;
        if (value.indexOf('https://') === 0) return 1;
        return 4;
    }

    async function directApiRequest(endpoint, options) {
        const settings = options || {};
        const timeoutMs = Number(settings.timeoutMs) || 8000;
        const method = settings.method || 'GET';
        const body = settings.body;
        const requireAuth = settings.auth === true;
        let lastError = null;
        for (const base of getDirectApiBases()) {
            try {
                const headers = {};
                if (String(base).includes('loca.lt')) {
                    headers['bypass-tunnel-reminder'] = 'true';
                }
                if (body != null) {
                    headers['Content-Type'] = 'application/json';
                }
                if (requireAuth) {
                    const token = getStoredAuthToken();
                    if (!token) {
                        throw new Error('Your login session is missing a backend access token. Please log in again before submitting picks.');
                    }
                    headers['Authorization'] = 'Bearer ' + token;
                }
                const response = await fetch(String(base).replace(/\/$/, '') + endpoint, {
                    method: method,
                    headers: headers,
                    body: body != null ? JSON.stringify(body) : undefined,
                    signal: AbortSignal.timeout(timeoutMs)
                });
                if (!response.ok) {
                    const rawMessage = await response.text().catch(function() { return ''; });
                    let message = rawMessage;
                    try {
                        const parsed = JSON.parse(rawMessage || '{}');
                        if (parsed) {
                            message = parsed.error || parsed.message;
                            if (!message && Array.isArray(parsed.errors) && parsed.errors.length) {
                                const first = parsed.errors[0] || {};
                                message = first.msg || first.message;
                            }
                        }
                    } catch (error) {}
                    throw new Error(message || ('HTTP ' + response.status + ' from ' + base));
                }
                return await response.json();
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('Direct API request failed');
    }

    async function getApiClientOrFallback() {
        const liveApi = await waitForApi();
        if (liveApi) return liveApi;

        return {
            createPick: function(pickData) {
                return directApiRequest('/picks', {
                    method: 'POST',
                    body: pickData,
                    auth: true,
                    timeoutMs: 15000
                });
            },
            getPicks: function(params) {
                const search = new URLSearchParams();
                if (params && params.userId != null) search.set('userId', params.userId);
                if (params && params.limit != null) search.set('limit', params.limit);
                if (params && params.offset != null) search.set('offset', params.offset);
                if (params && params.sport) search.set('sport', params.sport);
                if (params && params.status) search.set('status', params.status);
                const suffix = search.toString() ? ('?' + search.toString()) : '';
                return directApiRequest('/picks' + suffix, {
                    auth: true,
                    timeoutMs: 15000
                });
            }
        };
    }

    function getCachedBoard(sportKey) {
        const cached = boardCache.get(sportKey);
        if (!cached) return null;
        if ((Date.now() - cached.timestamp) > BOARD_CACHE_TTL_MS) {
            boardCache.delete(sportKey);
            return null;
        }
        return cached.data;
    }

    function setCachedBoard(sportKey, data) {
        if (!sportKey || !data) return;
        boardCache.set(sportKey, {
            data: data,
            timestamp: Date.now()
        });
    }

    async function fetchMarketBoardFast(sportKey, forceRefresh) {
        if (!sportKey) throw new Error('Missing sport key');
        if (!forceRefresh) {
            const cached = getCachedBoard(sportKey);
            if (cached) return cached;
        }
        if (boardRequests.has(sportKey)) {
            return boardRequests.get(sportKey);
        }

        const request = (async function() {
            try {
                const directBoard = await directApiRequest('/games/board/' + encodeURIComponent(sportKey), { timeoutMs: 8000 });
                setCachedBoard(sportKey, directBoard);
                return directBoard;
            } catch (directError) {
                const api = await waitForApi();
                const response = await api.getMarketBoard(sportKey);
                setCachedBoard(sportKey, response);
                return response;
            } finally {
                boardRequests.delete(sportKey);
            }
        })();

        boardRequests.set(sportKey, request);
        return request;
    }

    function updateBoardBadge(badge, totalGames) {
        if (!badge) return;
        badge.textContent = totalGames + ' game' + (totalGames === 1 ? '' : 's');
    }

    function renderBoardIfCurrent(requestId, sport, badge, response) {
        if (requestId !== latestBoardRequestId || state.selectedSport !== sport) return false;
        state.currentBoard = response.games || [];
        updateBoardBadge(badge, state.currentBoard.length);
        renderBoard(response.summary || null, state.currentBoard);
        return true;
    }

    function prefetchSportBoard(sport) {
        const sportKey = SPORT_KEY_MAP[sport];
        if (!sportKey || getCachedBoard(sportKey) || boardRequests.has(sportKey)) return;
        fetchMarketBoardFast(sportKey, false).catch(function() {});
    }

    function wireSportPrefetch() {
        document.querySelectorAll('.sport-card[data-sport]').forEach(function(card) {
            if (card.dataset.prefetchBound === 'true') return;
            const sport = card.dataset.sport;
            const triggerPrefetch = function() {
                prefetchSportBoard(sport);
            };
            card.addEventListener('mouseenter', triggerPrefetch, { passive: true });
            card.addEventListener('focus', triggerPrefetch, { passive: true });
            card.addEventListener('touchstart', triggerPrefetch, { passive: true });
            card.dataset.prefetchBound = 'true';
        });
    }

    async function fetchCurrentUserPicks() {
        const user = getCurrentUser();
        if (!user) {
            state.currentUserPicks = [];
            window._cachedBackendPicks = [];
            return [];
        }

        const api = await getApiClientOrFallback();
        const response = await api.getPicks({ userId: user.id, limit: 100 });
        const picks = (response.picks || []).map(normalizePick).sort(function(a, b) {
            return new Date(b.locked_at || b.created_at || 0) - new Date(a.locked_at || a.created_at || 0);
        });
        state.currentUserPicks = picks;
        window._cachedBackendPicks = picks;
        return picks;
    }

    function getRecordStats(picks) {
        if (typeof window.computeCanonicalRecordStats === 'function') {
            return window.computeCanonicalRecordStats(picks);
        }
        const normalized = (picks || []).map(normalizePick);
        const wins = normalized.filter(function(pick) { return pick.status === 'won'; }).length;
        const losses = normalized.filter(function(pick) { return pick.status === 'lost'; }).length;
        const pushes = normalized.filter(function(pick) { return pick.status === 'push'; }).length;
        const pending = normalized.filter(function(pick) { return pick.status === 'pending'; }).length;
        const graded = wins + losses + pushes;
        const totalUnits = normalized.reduce(function(sum, pick) {
            return sum + (pick.status === 'pending' ? 0 : (parseFloat(pick.result_units) || 0));
        }, 0);
        const risked = normalized.reduce(function(sum, pick) {
            return sum + (pick.status === 'pending' ? 0 : (parseFloat(pick.units) || 0));
        }, 0);

        return {
            wins: wins,
            losses: losses,
            pushes: pushes,
            pending: pending,
            graded: graded,
            record: wins + '-' + losses + '-' + pushes,
            winRate: (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0',
            totalUnits: totalUnits,
            roi: risked > 0 ? ((totalUnits / risked) * 100).toFixed(1) : '0.0'
        };
    }

    function updateText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function syncRecordWidgets(picks) {
        const stats = getRecordStats(picks);
        updateText('advRecordDisplay', stats.record);
        updateText('profileRecord', stats.record);
        updateText('myStatsRecord', stats.record);
        updateText('myStatsWinRate', stats.winRate + '%');
        updateText('pendingCount', String(stats.pending));
        updateText('myStatsPending', String(stats.pending));
        updateText('advWinRate', stats.winRate + '%');

        const unitsEl = document.getElementById('myStatsUnits');
        if (unitsEl) {
            unitsEl.textContent = (stats.totalUnits >= 0 ? '+' : '') + stats.totalUnits.toFixed(2);
            unitsEl.style.color = stats.totalUnits >= 0 ? '#00c853' : '#ff5252';
        }
    }

    function ensureMetadataFields() {
        const details = document.querySelector('#pickDetails .pick-options');
        if (!details) return;

        if (!document.getElementById('pickMarketInput')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'option-group';
            wrapper.innerHTML =
                '<label>Market</label>' +
                '<input type="text" id="pickMarketInput" readonly style="width: 100%; padding: 12px 14px; background: var(--card-bg); border: 2px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 16px; font-family: \'Exo 2\', sans-serif;" />';
            details.insertBefore(wrapper, details.firstChild);
        }

        if (!document.getElementById('pickBookInput')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'option-group';
            wrapper.innerHTML =
                '<label>Sportsbook</label>' +
                '<input type="text" id="pickBookInput" placeholder="DraftKings" style="width: 100%; padding: 12px 14px; background: var(--card-bg); border: 2px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 16px; font-family: \'Exo 2\', sans-serif;" />';
            details.appendChild(wrapper);
        }

        if (!document.getElementById('pickTimestampInput')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'option-group';
            wrapper.innerHTML =
                '<label>Line Timestamp</label>' +
                '<input type="text" id="pickTimestampInput" readonly style="width: 100%; padding: 12px 14px; background: var(--card-bg); border: 2px solid var(--glass-border); border-radius: 10px; color: var(--text-primary); font-size: 16px; font-family: \'Exo 2\', sans-serif;" />';
            details.appendChild(wrapper);
        }
    }

    function injectStyles() {
        if (document.getElementById('tmr-prod-fix-style')) return;
        const style = document.createElement('style');
        style.id = 'tmr-prod-fix-style';
        style.textContent = [
            '.tmr-board-banner{margin:0 0 20px;padding:16px 18px;border-radius:16px;border:1px solid rgba(255,255,255,0.12);font-size:14px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;backdrop-filter:blur(12px);box-shadow:0 18px 40px rgba(0,0,0,0.18);}',
            '.tmr-board-banner.warning{background:rgba(245,158,11,0.12);border-color:rgba(245,158,11,0.35);color:#fbbf24;}',
            '.tmr-board-banner.info{background:rgba(14,165,233,0.12);border-color:rgba(14,165,233,0.35);color:#7dd3fc;}',
            '.tmr-board-banner.success{background:rgba(34,197,94,0.12);border-color:rgba(34,197,94,0.35);color:#86efac;}',
            '.tmr-board-actions{display:flex;gap:10px;align-items:center;}',
            '.tmr-board-button{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);color:#fff;padding:9px 13px;border-radius:10px;cursor:pointer;font-weight:700;transition:transform .15s ease,border-color .15s ease,background .15s ease;}',
            '.tmr-board-button:hover{transform:translateY(-1px);background:rgba(255,255,255,0.14);border-color:rgba(255,255,255,0.28);}',
            '.tmr-market-card{position:relative;background:linear-gradient(180deg,rgba(18,21,28,0.97),rgba(11,15,22,0.96));border:1px solid rgba(125,211,252,0.12);border-radius:22px;margin-bottom:18px;overflow:hidden;box-shadow:0 20px 44px rgba(0,0,0,0.26);}',
            '.tmr-market-card::before{content:"";position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(90deg,rgba(0,255,255,0),rgba(0,255,255,0.45),rgba(251,191,36,0.3),rgba(0,255,255,0));pointer-events:none;}',
            '.tmr-market-head{display:flex;justify-content:space-between;gap:16px;padding:20px 22px;align-items:flex-start;cursor:pointer;}',
            '.tmr-market-matchup{font-size:clamp(19px,2.3vw,24px);font-weight:800;color:#fff;letter-spacing:-0.03em;line-height:1.1;}',
            '.tmr-market-meta{display:flex;gap:8px;flex-wrap:wrap;color:#a0a8b8;font-size:12px;margin-top:10px;}',
            '.tmr-market-chip{padding:5px 9px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.06);}',
            '.tmr-market-chip.real{background:rgba(34,197,94,0.15);color:#86efac;}',
            '.tmr-market-chip.fallback{background:rgba(245,158,11,0.15);color:#fbbf24;}',
            '.tmr-market-summary{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;}',
            '.tmr-market-count{padding:8px 12px;border-radius:999px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);font-size:12px;font-weight:700;color:#dbe4f0;white-space:nowrap;}',
            '.tmr-market-body{padding:0 22px 22px;display:none;}',
            '.tmr-market-card.open .tmr-market-body{display:block;}',
            '.tmr-scope-tabs{display:flex;gap:0;margin-top:18px;border:1px solid rgba(255,255,255,0.08);border-radius:14px;overflow:hidden;background:rgba(255,255,255,0.03);}',
            '.tmr-scope-tab{flex:1;padding:11px 13px;background:transparent;border:none;color:#a0a8b8;font-weight:800;cursor:pointer;transition:background .15s ease,color .15s ease;}',
            '.tmr-scope-tab + .tmr-scope-tab{border-left:1px solid rgba(255,255,255,0.08);}',
            '.tmr-scope-tab.active{background:#fbbf24;color:#111827;}',
            '.tmr-group{margin-top:18px;}',
            '.tmr-group[data-scope="f5"]{display:none;}',
            '.tmr-market-card[data-scope="f5"] .tmr-group[data-scope="full"]{display:none;}',
            '.tmr-market-card[data-scope="f5"] .tmr-group[data-scope="f5"]{display:block;}',
            '.tmr-group-title{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#7dd3fc;margin:0 0 11px;font-weight:800;}',
            '.tmr-group-count{font-size:11px;letter-spacing:0.04em;color:#8b95a7;}',
            '.tmr-option-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;}',
            '.tmr-option-btn{background:linear-gradient(180deg,rgba(25,31,42,0.98),rgba(17,22,31,0.96));border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:15px 16px;text-align:left;color:#fff;cursor:pointer;transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease,background .15s ease;display:flex;justify-content:space-between;gap:12px;align-items:flex-start;min-height:86px;}',
            '.tmr-option-btn:hover{transform:translateY(-1px);border-color:rgba(0,255,255,0.45);box-shadow:0 0 0 1px rgba(0,255,255,0.16) inset;}',
            '.tmr-option-btn.active{border-color:#00ffff;box-shadow:0 0 0 1px rgba(0,255,255,0.25) inset,0 12px 26px rgba(0,255,255,0.08);background:linear-gradient(180deg,rgba(18,34,44,0.98),rgba(13,25,35,0.96));}',
            '.tmr-option-main{display:flex;flex-direction:column;gap:6px;min-width:0;}',
            '.tmr-option-market{font-size:15px;font-weight:800;line-height:1.28;color:#f8fafc;}',
            '.tmr-option-detail{font-size:11px;color:#8b95a7;line-height:1.35;}',
            '.tmr-option-odds{font-size:17px;font-weight:900;white-space:nowrap;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.06);color:#fbbf24;}',
            '.tmr-empty-state{padding:48px 22px;text-align:center;color:#8b95a7;border:1px dashed rgba(125,211,252,0.16);border-radius:18px;background:rgba(255,255,255,0.02);}',
            '.tmr-loading-grid{display:grid;gap:14px;}',
            '.tmr-loading-card{height:132px;border-radius:20px;background:linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.08),rgba(255,255,255,0.04));background-size:200% 100%;animation:tmrShimmer 1.35s linear infinite;border:1px solid rgba(255,255,255,0.06);}',
            '@keyframes tmrShimmer{0%{background-position:200% 0;}100%{background-position:-200% 0;}}',
            '@media (max-width: 700px){.tmr-market-head{padding:16px;flex-direction:column;align-items:flex-start;}.tmr-market-body{padding:0 16px 16px;}.tmr-market-summary{width:100%;justify-content:flex-start;}.tmr-option-grid{grid-template-columns:1fr;}.tmr-market-matchup{font-size:17px;}.tmr-option-btn{min-height:auto;}}'
        ].join('');
        document.head.appendChild(style);
    }

    function renderBoardLoading(container) {
        if (!container) return;
        container.innerHTML = '<div class="tmr-loading-grid">' +
            '<div class="tmr-loading-card"></div>' +
            '<div class="tmr-loading-card"></div>' +
            '<div class="tmr-loading-card"></div>' +
            '</div>';
    }

    function formatTimestamp(value) {
        if (!value) return 'Unavailable';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Unavailable';
        return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function formatOdds(odds) {
        if (odds == null || Number.isNaN(Number(odds))) return 'Manual';
        const numeric = Number(odds);
        return numeric > 0 ? '+' + numeric : String(numeric);
    }

    function createFallbackOption(game, index, groupLabel, marketType, selection, selectionLabel, odds, line, detailLabel) {
        return {
            id: 'fallback-' + index + '-' + marketType + '-' + String(selection).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            game_id: game.id,
            sport_key: game.sport_key,
            market_type: marketType,
            market_key: marketType,
            selection: selection,
            selection_label: selectionLabel,
            odds: odds,
            odds_display: formatOdds(odds),
            line: line != null ? Number(line) : null,
            line_display: line != null ? String(line) : '',
            book_title: game._bookTitle || 'Sportsbook feed',
            book_key: game._bookKey || '',
            group_label: groupLabel,
            source: 'sportsbook',
            source_label: detailLabel || game._bookTitle || 'Sportsbook feed',
            source_updated_at: game.updated_at || game.commence_time || null
        };
    }

    function buildFallbackBoardGames(games, sportKey) {
        return (games || []).map(function(game, index) {
            const bookmaker = (game.bookmakers || [])[0] || null;
            const markets = bookmaker && Array.isArray(bookmaker.markets) ? bookmaker.markets : [];
            const h2h = markets.find(function(market) { return market.key === 'h2h'; }) || null;
            const spreads = markets.find(function(market) { return market.key === 'spreads'; }) || null;
            const totals = markets.find(function(market) { return market.key === 'totals'; }) || null;
            const teamTotals = markets.find(function(market) { return market.key === 'team_totals'; }) || null;
            const f5H2h = markets.find(function(market) { return market.key === 'f5_h2h'; }) || null;
            const f5Spreads = markets.find(function(market) { return market.key === 'f5_spreads'; }) || null;
            const f5Totals = markets.find(function(market) { return market.key === 'f5_totals'; }) || null;
            const awayMl = h2h && h2h.outcomes ? h2h.outcomes.find(function(outcome) { return outcome.name === game.away_team; }) : null;
            const homeMl = h2h && h2h.outcomes ? h2h.outcomes.find(function(outcome) { return outcome.name === game.home_team; }) : null;
            const awaySpread = spreads && spreads.outcomes ? spreads.outcomes.find(function(outcome) { return outcome.name === game.away_team; }) : null;
            const homeSpread = spreads && spreads.outcomes ? spreads.outcomes.find(function(outcome) { return outcome.name === game.home_team; }) : null;
            const over = totals && totals.outcomes ? totals.outcomes.find(function(outcome) { return outcome.name === 'Over'; }) : null;
            const under = totals && totals.outcomes ? totals.outcomes.find(function(outcome) { return outcome.name === 'Under'; }) : null;

            game._bookTitle = bookmaker ? bookmaker.title : 'Sportsbook feed';
            game._bookKey = bookmaker ? bookmaker.key : '';
            const marketGroups = [];
            const fullGameItems = [];

            if (awayMl) fullGameItems.push(createFallbackOption(game, index, 'Full Game', 'h2h', game.away_team, game.away_team + ' ML', awayMl.price, null));
            if (homeMl) fullGameItems.push(createFallbackOption(game, index, 'Full Game', 'h2h', game.home_team, game.home_team + ' ML', homeMl.price, null));
            if (awaySpread) fullGameItems.push(createFallbackOption(game, index, 'Full Game', 'spreads', game.away_team, game.away_team + ' ' + (awaySpread.point > 0 ? '+' : '') + awaySpread.point, awaySpread.price, awaySpread.point));
            if (homeSpread) fullGameItems.push(createFallbackOption(game, index, 'Full Game', 'spreads', game.home_team, game.home_team + ' ' + (homeSpread.point > 0 ? '+' : '') + homeSpread.point, homeSpread.price, homeSpread.point));
            if (over) fullGameItems.push(createFallbackOption(game, index, 'Game Total', 'totals', 'Over', 'Over ' + over.point, over.price, over.point));
            if (under) fullGameItems.push(createFallbackOption(game, index, 'Game Total', 'totals', 'Under', 'Under ' + under.point, under.price, under.point));

            if (fullGameItems.length) {
                marketGroups.push({
                    key: 'full_game',
                    label: 'Full Game',
                    items: fullGameItems
                });
            }

            if (teamTotals && Array.isArray(teamTotals.outcomes) && teamTotals.outcomes.length) {
                marketGroups.push({
                    key: 'team_totals',
                    label: 'Team Totals',
                    items: teamTotals.outcomes.map(function(outcome) {
                        return createFallbackOption(
                            game,
                            index,
                            'Team Totals',
                            'team_totals',
                            outcome.name,
                            outcome.point != null ? (outcome.name + ' ' + outcome.point) : outcome.name,
                            outcome.price,
                            outcome.point != null ? outcome.point : null,
                            bookmaker ? bookmaker.title : 'Sportsbook feed'
                        );
                    })
                });
            }

            if (sportKey === 'baseball_mlb' && (f5H2h || f5Spreads || f5Totals)) {
                const f5AwayMl = f5H2h && f5H2h.outcomes ? f5H2h.outcomes.find(function(outcome) { return outcome.name === game.away_team; }) : null;
                const f5HomeMl = f5H2h && f5H2h.outcomes ? f5H2h.outcomes.find(function(outcome) { return outcome.name === game.home_team; }) : null;
                const f5AwaySpread = f5Spreads && f5Spreads.outcomes ? f5Spreads.outcomes.find(function(outcome) { return outcome.name === game.away_team; }) : null;
                const f5HomeSpread = f5Spreads && f5Spreads.outcomes ? f5Spreads.outcomes.find(function(outcome) { return outcome.name === game.home_team; }) : null;
                const f5Over = f5Totals && f5Totals.outcomes ? f5Totals.outcomes.find(function(outcome) { return outcome.name === 'Over'; }) : null;
                const f5Under = f5Totals && f5Totals.outcomes ? f5Totals.outcomes.find(function(outcome) { return outcome.name === 'Under'; }) : null;
                const first5Items = [];
                if (f5AwaySpread) first5Items.push(createFallbackOption(game, index, 'First 5', 'f5_spreads', game.away_team, game.away_team + ' ' + (f5AwaySpread.point > 0 ? '+' : '') + f5AwaySpread.point, f5AwaySpread.price, f5AwaySpread.point, bookmaker ? bookmaker.title : 'Sportsbook feed'));
                if (f5HomeSpread) first5Items.push(createFallbackOption(game, index, 'First 5', 'f5_spreads', game.home_team, game.home_team + ' ' + (f5HomeSpread.point > 0 ? '+' : '') + f5HomeSpread.point, f5HomeSpread.price, f5HomeSpread.point, bookmaker ? bookmaker.title : 'Sportsbook feed'));
                if (f5AwayMl) first5Items.push(createFallbackOption(game, index, 'First 5', 'f5_h2h', game.away_team, game.away_team + ' F5 ML', f5AwayMl.price, null, bookmaker ? bookmaker.title : 'Sportsbook feed'));
                if (f5HomeMl) first5Items.push(createFallbackOption(game, index, 'First 5', 'f5_h2h', game.home_team, game.home_team + ' F5 ML', f5HomeMl.price, null, bookmaker ? bookmaker.title : 'Sportsbook feed'));
                if (f5Over) first5Items.push(createFallbackOption(game, index, 'First 5', 'f5_totals', 'Over', 'F5 Over ' + f5Over.point, f5Over.price, f5Over.point, bookmaker ? bookmaker.title : 'Sportsbook feed'));
                if (f5Under) first5Items.push(createFallbackOption(game, index, 'First 5', 'f5_totals', 'Under', 'F5 Under ' + f5Under.point, f5Under.price, f5Under.point, bookmaker ? bookmaker.title : 'Sportsbook feed'));
                if (first5Items.length) {
                    marketGroups.push({
                        key: 'first_5',
                        label: 'First 5',
                        items: first5Items
                    });
                }
            }

            return Object.assign({}, game, {
                updated_at: game.updated_at || game.commence_time,
                has_sportsbook_odds: marketGroups.length > 0,
                market_groups: marketGroups
            });
        }).filter(function(game) {
            return game.market_groups && game.market_groups.length > 0;
        });
    }

    function toggleCard(cardId) {
        const card = document.getElementById(cardId);
        if (card) card.classList.toggle('open');
    }

    function getGroupScope(group) {
        return group && group.key === 'first_5' ? 'f5' : 'full';
    }

    function setCardScope(cardId, scope) {
        const card = document.getElementById(cardId);
        if (!card) return;
        card.dataset.scope = scope;
        card.querySelectorAll('.tmr-scope-tab').forEach(function(button) {
            button.classList.toggle('active', button.dataset.scope === scope);
        });
    }

    function renderBoard(summary, games) {
        const container = document.getElementById('gamesListContainer');
        if (!container) return;

        state.currentOptions.clear();
        const bannerClass = summary && summary.severity ? summary.severity : 'info';
        let html = '';

        if (summary) {
            html += '<div class="tmr-board-banner ' + bannerClass + '">' +
                '<div>' + summary.message + '</div>' +
                '<div class="tmr-board-actions"><button class="tmr-board-button" onclick="window.tmrSportsbookRefresh()">Retry Feed</button></div>' +
                '</div>';
        }

        if (!games || games.length === 0) {
            container.innerHTML = html + '<div class="tmr-empty-state">No upcoming games are available for this sport right now.</div>';
            return;
        }

        html += games.map(function(rawGame, index) {
            const game = rawGame;
            const cardId = 'tmr-market-card-' + index;
            const sourceClass = game.has_sportsbook_odds ? 'real' : 'fallback';
            const sourceText = game.has_sportsbook_odds ? 'Sportsbook feed' : 'Manual entry';
            let groupsHtml = '';
            const hasFirst5 = (game.market_groups || []).some(function(group) {
                return group && group.key === 'first_5' && group.items && group.items.length;
            });

            const orderedGroups = (game.market_groups || []).slice().sort(function(a, b) {
                const order = { full_game: 1, spread: 2, total: 3, team_totals: 4, first_half: 5, second_half: 6, period_1: 7, first_5: 8, alt_spreads: 9, alt_totals: 10 };
                return (order[a && a.key] || 99) - (order[b && b.key] || 99);
            });

            orderedGroups.forEach(function(group, groupIndex) {
                const groupItems = group.items || [];
                const buttons = (group.items || []).map(function(option, optionIndex) {
                    const optionKey = [
                        game.id || ('game-' + index),
                        group.key || ('group-' + groupIndex),
                        option.id || ('option-' + optionIndex),
                        optionIndex
                    ].join('|');
                    const optionDomId = 'option-' + safeDomId(optionKey);
                    state.currentOptions.set(optionKey, Object.assign({ game: game, _domId: optionDomId, _optionKey: optionKey }, option));
                    const detailLabel = option.book_title || option.source_label || option.group_label || 'Sportsbook feed';
                    return '<button class="tmr-option-btn" id="' + optionDomId + '" data-option-id="' + escapeHtml(optionKey) + '" onclick="window.tmrSelectOption(this.dataset.optionId)">' +
                        '<div class="tmr-option-main">' +
                        '<div class="tmr-option-market">' + escapeHtml(option.selection_label) + '</div>' +
                        '<div class="tmr-option-detail">' + escapeHtml(detailLabel) + '</div>' +
                        '</div>' +
                        '<div class="tmr-option-odds">' + escapeHtml(option.odds_display || 'Manual') + '</div>' +
                        '</button>';
                }).join('');

                if (buttons) {
                    const groupTitle = group.label;
                    groupsHtml += '<div class="tmr-group" data-scope="' + getGroupScope(group) + '">' +
                        '<div class="tmr-group-title"><span>' + escapeHtml(groupTitle) + '</span><span class="tmr-group-count">' + groupItems.length + ' lines</span></div>' +
                        '<div class="tmr-option-grid">' + buttons + '</div>' +
                        '</div>';
                }
            });

            const scopeTabsHtml = hasFirst5
                ? '<div class="tmr-scope-tabs">' +
                    '<button class="tmr-scope-tab active" data-scope="full" onclick="event.stopPropagation(); window.tmrSetCardScope(\'' + cardId + '\', \'full\')">Full Game</button>' +
                    '<button class="tmr-scope-tab" data-scope="f5" onclick="event.stopPropagation(); window.tmrSetCardScope(\'' + cardId + '\', \'f5\')">5 Innings</button>' +
                  '</div>'
                : '';

            return '<div class="tmr-market-card' + (index === 0 ? ' open' : '') + '" id="' + cardId + '" data-scope="full">' +
                '<div class="tmr-market-head" onclick="window.tmrToggleCard(\'' + cardId + '\')">' +
                '<div>' +
                '<div class="tmr-market-matchup">' + escapeHtml(game.away_team) + ' @ ' + escapeHtml(game.home_team) + '</div>' +
                '<div class="tmr-market-meta">' +
                '<span class="tmr-market-chip">' + escapeHtml(new Date(game.commence_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '</span>' +
                '<span class="tmr-market-chip ' + sourceClass + '">' + sourceText + '</span>' +
                '<span class="tmr-market-chip">Updated ' + escapeHtml(formatTimestamp(game.updated_at)) + '</span>' +
                '</div>' +
                '</div>' +
                '<div class="tmr-market-summary"><div class="tmr-market-count">' + (game.market_groups || []).length + ' sections</div></div>' +
                '</div>' +
                '<div class="tmr-market-body">' + scopeTabsHtml + groupsHtml + '</div>' +
                '</div>';
        }).join('');

        container.innerHTML = html;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function safeDomId(value) {
        return String(value == null ? '' : value).replace(/[^a-zA-Z0-9_-]+/g, '-');
    }

    async function selectSportAndShowGames(sport) {
        const requestId = ++latestBoardRequestId;
        state.selectedSport = sport;
        window.TMR = window.TMR || {};
        window.TMR.selectedSport = sport;
        const sportKey = SPORT_KEY_MAP[sport];
        const container = document.getElementById('gamesListContainer');
        const title = document.getElementById('selectedSportTitle');
        const badge = document.getElementById('gamesCountBadge');
        const cachedBoard = getCachedBoard(sportKey);

        if (title) title.textContent = sport + ' Markets';
        if (container && !cachedBoard) {
            renderBoardLoading(container);
        }
        if (typeof window.showPickStep === 'function') window.showPickStep('gamesListSection');

        if (cachedBoard) {
            renderBoardIfCurrent(requestId, sport, badge, cachedBoard);
        }

        try {
            const response = await fetchMarketBoardFast(sportKey, false);
            renderBoardIfCurrent(requestId, sport, badge, response);
        } catch (error) {
            try {
                let fallbackGames = null;
                try {
                    fallbackGames = await directApiRequest('/games/odds/' + encodeURIComponent(sportKey), { timeoutMs: 8000 });
                } catch (directOddsError) {}
                if (!Array.isArray(fallbackGames)) {
                    const api = await waitForApi();
                    fallbackGames = await api.request('/games/odds/' + encodeURIComponent(sportKey));
                }
                if (requestId !== latestBoardRequestId || state.selectedSport !== sport) return;
                state.currentBoard = buildFallbackBoardGames(fallbackGames || [], sportKey);
                updateBoardBadge(badge, state.currentBoard.length);
                renderBoard({
                    severity: 'warning',
                    message: 'Live fallback markets loaded while the advanced market board is unavailable.'
                }, state.currentBoard);
                return;
            } catch (fallbackError) {
                if (requestId !== latestBoardRequestId || state.selectedSport !== sport) return;
                if (container && !cachedBoard) {
                    container.innerHTML = '<div class="tmr-empty-state">Unable to load markets right now. ' +
                        '<div style="margin-top:12px;"><button class="tmr-board-button" onclick="window.tmrSportsbookRefresh()">Retry</button></div></div>';
                }
            }
        }
    }

    function disableLegacyFeed() {
        const message = 'Legacy odds feed disabled. Use /api/games/board instead.';
        window.TMR = window.TMR || {};
        lockFunction(window.TMR, 'fetchGamesFromESPN', function(sportKey, callback) {
            if (typeof callback === 'function') {
                callback([], new Error(message));
            }
        });
        lockFunction(window.TMR, 'fetchOddsFromSummary', function(games, espnPath, callback) {
            if (typeof callback === 'function') {
                callback(Array.isArray(games) ? games : []);
            }
        });
    }

    async function loadGamesWithAllBetsOverride() {
        const sport = state.selectedSport || (window.TMR && window.TMR.selectedSport) || null;
        const container = document.getElementById('gamesListContainer');

        if (!sport) {
            if (container) {
                container.innerHTML = '<div class="tmr-empty-state">Choose a sport to load live sportsbook markets.</div>';
            }
            return;
        }

        return selectSportAndShowGames(sport);
    }

    function selectOption(optionId) {
        const option = state.currentOptions.get(optionId);
        if (!option) return;

        state.selectedOption = option;
        document.querySelectorAll('.tmr-option-btn.active').forEach(function(button) {
            button.classList.remove('active');
        });
        const active = option._domId ? document.getElementById(option._domId) : null;
        if (active) active.classList.add('active');

        ensureMetadataFields();

        updateText('summaryGame', option.game.away_team + ' @ ' + option.game.home_team);
        updateText('summaryPick', option.selection_label);
        updateText('summaryOdds', option.odds_display || 'Manual');

        const lineInput = document.getElementById('pickLineInput');
        const oddsInput = document.getElementById('pickOddsInput');
        const marketInput = document.getElementById('pickMarketInput');
        const bookInput = document.getElementById('pickBookInput');
        const timestampInput = document.getElementById('pickTimestampInput');
        const lineGroup = document.getElementById('lineInputGroup');

        if (lineGroup) lineGroup.style.display = option.line != null ? 'block' : 'none';
        if (lineInput) lineInput.value = option.line_display || '';
        if (oddsInput) oddsInput.value = option.odds != null ? option.odds : '';
        if (marketInput) marketInput.value = option.group_label + ' / ' + getMarketLabel(option.market_type);
        if (bookInput) bookInput.value = option.book_title || '';
        if (timestampInput) timestampInput.value = formatTimestamp(option.source_updated_at);

        if (typeof window.showPickStep === 'function') window.showPickStep('pickDetails');
    }

    function updatePickSummary() {
        if (!state.selectedOption) return;
        const lineInput = document.getElementById('pickLineInput');
        const oddsInput = document.getElementById('pickOddsInput');
        const lineValue = lineInput ? lineInput.value.trim() : '';
        const oddsValue = oddsInput ? oddsInput.value.trim() : '';
        updateText('summaryPick', state.selectedOption.selection + (lineValue ? ' ' + lineValue : ''));
        updateText('summaryOdds', oddsValue || 'Manual');
    }

    async function lockInPick() {
        const option = state.selectedOption;
        if (!option) {
            alert('Select a market before submitting a pick.');
            return;
        }

        const user = getCurrentUser();
        if (!user) {
            alert('Please log in to submit a pick.');
            if (typeof window.showSection === 'function') window.showSection('login');
            return;
        }

        const oddsInput = document.getElementById('pickOddsInput');
        const lineInput = document.getElementById('pickLineInput');
        const unitsInput = document.getElementById('unitsInput');
        const bookInput = document.getElementById('pickBookInput');
        const reasoningInput = document.getElementById('pickReasoning');

        const oddsValue = oddsInput ? parseInt(oddsInput.value, 10) : NaN;
        const lineValue = lineInput && lineInput.value !== '' ? parseFloat(lineInput.value) : null;
        const unitsValue = unitsInput ? parseFloat(unitsInput.value || '1') : 1;

        if (Number.isNaN(oddsValue) || (oddsValue > -100 && oddsValue < 100)) {
            alert('Enter valid American odds like -110 or +150.');
            return;
        }

        if (window.api && typeof window.api.loadTokens === 'function') {
            try { window.api.loadTokens(); } catch (error) {}
        }

        try {
            const api = await getApiClientOrFallback();
            await ensureBackendAccessToken(api);
            const response = await api.createPick({
                game_id: option.game_id,
                sport_key: option.sport_key,
                market_type: option.market_type,
                selection: option.selection,
                line_snapshot: lineValue,
                odds_snapshot: oddsValue,
                units: unitsValue,
                book_title: bookInput ? bookInput.value.trim() : option.book_title,
                book_key: option.book_key,
                market_key: option.market_key,
                market_label: option.group_label,
                source_type: option.source,
                source_updated_at: option.source_updated_at,
                reasoning: reasoningInput ? reasoningInput.value.trim() : ''
            });

            await fetchCurrentUserPicks();
            syncRecordWidgets(state.currentUserPicks);
            updateText('confirmPickDetail', option.selection_label + ' (' + (oddsValue > 0 ? '+' : '') + oddsValue + ')');
            updateText('confirmPickMeta', (option.game.away_team + ' @ ' + option.game.home_team) + ' | Status: pending');
            if (typeof window.showPickStep === 'function') window.showPickStep('pickConfirmation');
        } catch (error) {
            alert('Pick submission failed: ' + (error.message || 'Unknown error'));
        }
    }

    function renderPickCard(pick) {
        const status = normalizeStatus(pick.status, pick.result);
        const statusColor = status === 'won' ? '#00c853' : status === 'lost' ? '#ff5252' : status === 'push' ? '#94a3b8' : '#f59e0b';
        const recordText = pick.selection + (pick.line_snapshot != null ? ' ' + pick.line_snapshot : '');
        const marketText = getMarketLabel(pick.market_type);
        const dateText = new Date(pick.locked_at || pick.created_at || Date.now()).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        });
        return '<div style="background:#22262e;border-radius:12px;padding:16px;margin-bottom:12px;border-left:4px solid ' + statusColor + ';">' +
            '<div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;">' +
            '<div>' +
            '<div style="font-size:18px;font-weight:700;color:#fff;">' + escapeHtml(recordText) + '</div>' +
            '<div style="font-size:13px;color:#94a3b8;margin-top:4px;">' + escapeHtml((pick.away_team || '') + ' @ ' + (pick.home_team || '')) + '</div>' +
            '<div style="font-size:12px;color:#6c7380;margin-top:6px;">' + escapeHtml(marketText) + ' | ' + escapeHtml(dateText) + '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
            '<div style="font-size:16px;font-weight:700;color:#fff;">' + (pick.odds_snapshot > 0 ? '+' : '') + escapeHtml(pick.odds_snapshot) + '</div>' +
            '<div style="font-size:12px;color:' + statusColor + ';text-transform:uppercase;font-weight:700;margin-top:4px;">' + escapeHtml(status) + '</div>' +
            '</div>' +
            '</div>' +
            '</div>';
    }

    async function loadMyPicks(tab) {
        const container = document.getElementById('myPicksList');
        if (!container) return;

        try {
            const picks = await fetchCurrentUserPicks();
            syncRecordWidgets(picks);

            let filtered = picks;
            if (tab === 'pending') filtered = picks.filter(function(pick) { return pick.status === 'pending'; });
            if (tab === 'graded') filtered = picks.filter(function(pick) { return pick.status !== 'pending'; });

            container.innerHTML = filtered.length
                ? filtered.map(renderPickCard).join('')
                : '<div class="tmr-empty-state">No ' + (tab || 'current') + ' picks found.</div>';
        } catch (error) {
            container.innerHTML = '<div class="tmr-empty-state">Unable to load picks from the backend.</div>';
        }
    }

    async function loadMyRecordPage() {
        try {
            const picks = await fetchCurrentUserPicks();
            syncRecordWidgets(picks);
        } catch (error) {}
    }

    async function refreshCurrentSport() {
        if (state.selectedSport) {
            await selectSportAndShowGames(state.selectedSport);
        }
    }

    function startLiveRefreshLoop() {
        if (window.__tmrSportsbookRefreshTimer) return;
        window.__tmrSportsbookRefreshTimer = window.setInterval(function() {
            if (document.hidden || !state.selectedSport) return;
            refreshCurrentSport().catch(function() {});
        }, LIVE_REFRESH_MS);
    }

    function calculateUserStatsById(userId) {
        const user = getCurrentUser();
        const picks = state.currentUserPicks || [];
        if (user && String(user.id) !== String(userId) && String(user.username) !== String(userId)) {
            return getRecordStats([]);
        }
        const stats = getRecordStats(picks);
        return {
            totalPicks: picks.length,
            wins: stats.wins,
            losses: stats.losses,
            pushes: stats.pushes,
            record: stats.record,
            winRate: stats.winRate,
            units: stats.totalUnits,
            roi: stats.roi,
            currentStreak: '-'
        };
    }

    function boot() {
        const hasPicksUi = !!(
            document.getElementById('gamesListContainer') &&
            document.getElementById('selectedSportTitle') &&
            document.getElementById('myPicksList')
        );
        if (!hasPicksUi) {
            console.log('[TMR] sportsbook-production-fix skipped; picks UI not present');
            return;
        }

        injectStyles();
        ensureMetadataFields();
        disableLegacyFeed();
        wireSportPrefetch();

        window.tmrToggleCard = toggleCard;
        window.tmrSetCardScope = setCardScope;
        window.tmrSelectOption = selectOption;
        window.tmrSportsbookRefresh = refreshCurrentSport;
        lockFunction(window, 'selectSportAndShowGames', selectSportAndShowGames);
        lockFunction(window, 'submitPick', lockInPick);
        lockFunction(window, 'lockInPick', lockInPick);
        window.__tmrProductionLockInPick = lockInPick;
        window.selectGameBet = function() {};
        window.updatePickSummary = updatePickSummary;
        lockFunction(window, 'loadGamesWithAllBets', loadGamesWithAllBetsOverride);
        lockFunction(window, 'loadMyPicks', loadMyPicks);
        lockFunction(window, 'loadMyRecordPage', loadMyRecordPage);
        lockFunction(window, 'calculateUserStatsById', calculateUserStatsById);
        window.ensureBackendPicks = function(callback) {
            fetchCurrentUserPicks().then(function(picks) {
                syncRecordWidgets(picks);
                if (typeof callback === 'function') callback();
            }).catch(function() {
                if (typeof callback === 'function') callback();
            });
        };
        startLiveRefreshLoop();

        const originalShowSection = window.showSection;
        if (typeof originalShowSection === 'function' && !window.__tmrProdShowSectionWrapped) {
            window.__tmrProdShowSectionWrapped = true;
            window.showSection = function(sectionId) {
                originalShowSection(sectionId);
                if (sectionId === 'mypicks') {
                    loadMyPicks(window.currentPicksTab || 'pending');
                } else if (sectionId === 'my-record' || sectionId === 'profile') {
                    loadMyRecordPage();
                }
            };
        }

        fetchCurrentUserPicks().then(syncRecordWidgets).catch(function() {});
        setTimeout(function() {
            prefetchSportBoard('MLB');
        }, 1200);
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
