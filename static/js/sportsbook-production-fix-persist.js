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
        currentBoardSummary: null,
        activeBoardFilter: null,
        currentOptions: new Map(),
        selectedOption: null,
        currentUserPicks: [],
        lastBoardRenderAt: 0,
        lastBoardRenderSport: null
    };
    const BOARD_CACHE_TTL_MS = 15000;
    const LIVE_REFRESH_MS = 20000;
    const MIN_VISIBLE_REFRESH_GAP_MS = 30000;
    const boardCache = new Map();
    const boardRequests = new Map();
    const boardDiagnostics = [];
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

    function snapshotBoardPayload(response) {
        const games = Array.isArray(response && response.games) ? response.games : [];
        return {
            sport_key: response && response.sport_key ? response.sport_key : '',
            game_count: games.length,
            severity: response && response.summary ? response.summary.severity || '' : '',
            message: response && response.summary ? response.summary.message || '' : '',
            diagnostics: response && response.diagnostics ? response.diagnostics : null
        };
    }

    function recordBoardEvent(type, details) {
        const event = Object.assign({
            type: type,
            at: new Date().toISOString(),
            selectedSport: state.selectedSport || '',
            requestId: latestBoardRequestId
        }, details || {});
        boardDiagnostics.push(event);
        while (boardDiagnostics.length > 60) boardDiagnostics.shift();
        window.__tmrBoardDiagnostics = boardDiagnostics.slice();
        window.__tmrLastBoardEvent = event;
        if (type.indexOf('error') !== -1 || type.indexOf('failed') !== -1) {
            console.error('[TMR][Board]', type, event);
        } else if (type.indexOf('warning') !== -1 || type.indexOf('empty') !== -1 || type.indexOf('fallback') !== -1) {
            console.warn('[TMR][Board]', type, event);
        } else {
            console.log('[TMR][Board]', type, event);
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

    function clearFrontendAuthState() {
        try {
            if (window.api && typeof window.api.clearTokens === 'function') {
                window.api.clearTokens();
                return;
            }
        } catch (error) {}

        [
            'trustmyrecord_session',
            'tmr_current_user',
            'currentUser',
            'trustmyrecord_remember',
            'tmr_is_logged_in',
            'trustmyrecord_token',
            'trustmyrecord_refresh_token',
            'token',
            'tmr_token',
            'refreshToken',
            'refresh_token'
        ].forEach(function(key) {
            try { localStorage.removeItem(key); } catch (error) {}
        });

        try {
            if (window.auth && typeof window.auth.clearSession === 'function') {
                window.auth.clearSession();
            }
        } catch (error) {}

        try {
            window.dispatchEvent(new CustomEvent('tmr-auth-changed', {
                detail: { loggedIn: false, user: null }
            }));
        } catch (error) {}
    }

    function redirectToLoginForPicks(message) {
        try {
            sessionStorage.setItem('tmr_post_auth_redirect', 'picks');
        } catch (error) {}
        if (message) {
            alert(message);
        }
        if (typeof window.showSection === 'function') {
            window.showSection('login');
        }
    }

    function getStoredAuthToken() {
        try {
            return localStorage.getItem('trustmyrecord_token') ||
                localStorage.getItem('accessToken') ||
                localStorage.getItem('access_token') ||
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
                localStorage.getItem('tmr_refresh_token') ||
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

    async function ensurePicksAccess() {
        const user = getCurrentUser();
        if (!user) {
            showSubmitTrace('Access blocked: no logged-in user was found.');
            redirectToLoginForPicks('Please log in to submit a pick.');
            return false;
        }

        const apiClient = await waitForApi();
        const token = getStoredAuthToken();
        const refreshToken = getStoredRefreshToken() || (apiClient && apiClient.refreshToken);

        if (token) {
            return true;
        }

        if (refreshToken && apiClient && typeof apiClient.refreshAccessToken === 'function') {
            apiClient.refreshToken = refreshToken;
            try {
                const refreshed = await apiClient.refreshAccessToken();
                if (refreshed && getStoredAuthToken()) {
                    return true;
                }
            } catch (error) {}
        }

        clearFrontendAuthState();
        showSubmitTrace('Access blocked: login session expired before submit.');
        redirectToLoginForPicks('Your login session expired. Please log in again before making picks.');
        return false;
    }

    function showSubmitTrace(message) {
        try {
            console.info('[TMR submit]', message);
            const oldBox = document.getElementById('tmrSubmitTrace');
            if (oldBox) oldBox.style.display = 'none';
        } catch (error) {}
    }

    function describeSubmitError(error) {
        if (!error) return 'Unknown error';
        const data = error.data || error.response || null;
        if (data && typeof data === 'object') {
            return data.error || data.message || error.message || String(error);
        }
        return error.message || String(error);
    }

    function hasGameStarted(game) {
        if (!game || !game.commence_time) return false;
        const ms = Date.parse(game.commence_time);
        if (Number.isNaN(ms)) return false;
        return ms <= Date.now();
    }

    if (!window.TMRSubmitDiagnosticsBound) {
        window.TMRSubmitDiagnosticsBound = true;
        window.addEventListener('error', function(event) {
            showSubmitTrace('JavaScript error: ' + (event && event.message ? event.message : 'unknown'));
        });
        window.addEventListener('unhandledrejection', function(event) {
            const reason = event && event.reason;
            showSubmitTrace('Promise error: ' + describeSubmitError(reason));
        });
        document.addEventListener('click', function(event) {
            const target = event.target && event.target.closest && event.target.closest('#ttSlipSubmit,#submitPickBtn,button.submit-pick-btn,button.lock-pick-btn,[data-lock-pick-btn]');
            if (target) showSubmitTrace('Lock button click captured.');
        }, true);
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
        const shouldTraceBoardRequest = endpoint.indexOf('/games/board/') === 0 || endpoint.indexOf('/games/odds/') === 0 || endpoint.indexOf('/picks') === 0;
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
                const parsed = await response.json();
                if (shouldTraceBoardRequest) {
                    recordBoardEvent('api_success', {
                        endpoint: endpoint,
                        method: method,
                        base: base,
                        status: response.status,
                        snapshot: endpoint.indexOf('/games/') === 0 ? snapshotBoardPayload(parsed) : null
                    });
                }
                return parsed;
            } catch (error) {
                if (shouldTraceBoardRequest) {
                    recordBoardEvent('api_error', {
                        endpoint: endpoint,
                        method: method,
                        base: base,
                        message: error && error.message ? error.message : String(error || 'Unknown error')
                    });
                }
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
            if (cached) {
                recordBoardEvent('board_cache_hit', {
                    sport_key: sportKey,
                    snapshot: snapshotBoardPayload(cached)
                });
                return cached;
            }
        }
        if (forceRefresh && boardRequests.has(sportKey)) {
            boardRequests.delete(sportKey);
        }
        if (boardRequests.has(sportKey)) {
            recordBoardEvent('board_request_reused', { sport_key: sportKey });
            return boardRequests.get(sportKey);
        }

        const request = (async function() {
            try {
                const directBoard = await directApiRequest('/games/board/' + encodeURIComponent(sportKey), { timeoutMs: 8000 });
                setCachedBoard(sportKey, directBoard);
                recordBoardEvent(forceRefresh ? 'board_refresh_success' : 'board_fetch_success', {
                    sport_key: sportKey,
                    source: 'direct',
                    snapshot: snapshotBoardPayload(directBoard)
                });
                return directBoard;
            } catch (directError) {
                recordBoardEvent(forceRefresh ? 'board_refresh_direct_failed' : 'board_fetch_direct_failed', {
                    sport_key: sportKey,
                    source: 'direct',
                    message: directError && directError.message ? directError.message : String(directError || 'Unknown error')
                });
                const api = await waitForApi();
                const response = await api.getMarketBoard(sportKey);
                setCachedBoard(sportKey, response);
                recordBoardEvent(forceRefresh ? 'board_refresh_fallback_success' : 'board_fetch_fallback_success', {
                    sport_key: sportKey,
                    source: 'api_client',
                    snapshot: snapshotBoardPayload(response)
                });
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

    function forceSectionActive(sectionId) {
        if (!sectionId) return;
        const target = document.getElementById(sectionId);
        if (!target || !target.classList.contains('page-section')) return;
        document.querySelectorAll('.page-section').forEach(function(section) {
            section.classList.remove('active');
        });
        target.classList.add('active');
    }

    function pinPicksSectionIfRequested() {
        const normalizedPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
        const wantsPicks = window.location.hash === '#picks' || normalizedPath === '/picks';
        if (!wantsPicks) return;
        forceSectionActive('picks');
        let attempts = 0;
        const interval = window.setInterval(function() {
            attempts += 1;
            forceSectionActive('picks');
            if (attempts >= 8) {
                window.clearInterval(interval);
            }
        }, 500);
    }

    function pinRequestedAuthSection() {
        const params = new URLSearchParams(window.location.search || '');
        const rawHash = (window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
        const rawQuery = (params.get('auth') || '').trim().toLowerCase();
        let requested = '';

        if (rawHash === 'login') requested = 'login';
        if (rawHash === 'register' || rawHash === 'signup') requested = 'signup';
        if (!requested && rawQuery === 'login') requested = 'login';
        if (!requested && (rawQuery === 'register' || rawQuery === 'signup')) requested = 'signup';

        // Always clear any stale tmr_force_section. The old session-storage
        // handoff caused a "click Log In, then click Make Picks → land on
        // the login section instead of the picks board" bug. Auth intent must
        // come from the URL itself (#login / ?auth=login) -- never from
        // leftover storage from a prior nav click.
        try {
            sessionStorage.removeItem('tmr_force_section');
        } catch (error) {}

        if (!requested) return;

        forceSectionActive(requested);

        if (typeof window.showSection === 'function') {
            try {
                const activeSection = document.querySelector('.page-section.active');
                if (!activeSection || activeSection.id !== requested) {
                    window.showSection(requested, { preserveScroll: true });
                }
            } catch (error) {}
        }
    }

    function renderBoardIfCurrent(requestId, sport, badge, response) {
        if (state.selectedSport !== sport) return false;
        if (requestId !== latestBoardRequestId) {
            recordBoardEvent('board_render_recovered', {
                sport: sport,
                request_id: requestId,
                latest_request_id: latestBoardRequestId,
                snapshot: snapshotBoardPayload(response)
            });
        }
        state.currentBoard = response.games || [];
        window.TMR = window.TMR || {};
        window.TMR.currentGames = state.currentBoard;
        state.lastBoardRenderAt = Date.now();
        state.lastBoardRenderSport = sport;
        updateBoardBadge(badge, state.currentBoard.length);
        recordBoardEvent('board_rendered', {
            sport: sport,
            snapshot: snapshotBoardPayload(response)
        });
        renderBoard(response.summary || null, state.currentBoard);
        return true;
    }

    function prefetchSportBoard(sport) {
        const sportKey = SPORT_KEY_MAP[sport];
        if (!sportKey || getCachedBoard(sportKey) || boardRequests.has(sportKey)) return;
        fetchMarketBoardFast(sportKey, false).catch(function() {});
    }

    function prewarmCoreBoards() {
        ['MLB', 'NHL', 'NBA', 'WNBA', 'NFL', 'NCAAB', 'NCAAF', 'Soccer', 'MLS', 'UCL', 'LaLiga', 'SerieA', 'Bundesliga', 'Ligue1', 'ATP', 'WTA'].forEach(function(sport, index) {
            window.setTimeout(function() {
                prefetchSportBoard(sport);
            }, 200 + (index * 120));
        });
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
        let response;
        try {
            response = await api.getPicks({ userId: user.id, limit: 100 });
        } catch (error) {
            if (error && (error.status === 401 || error.status === 403)) {
                clearFrontendAuthState();
            }
            throw error;
        }
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

    function getLineInputLabel(option) {
        const marketType = String(option && option.market_type || '').toLowerCase();
        if (!marketType || option == null || option.line == null) return 'Line';
        if (marketType.indexOf('total') !== -1 || marketType === 'btts') return 'Total / Number';
        if (marketType.indexOf('spread') !== -1) return 'Spread / Handicap';
        if (marketType.indexOf('player_') === 0) return 'Prop Line';
        return 'Line';
    }

    function syncPickDetailsLayout(option) {
        const selectorIds = ['betScopeSelector', 'betTypeSelector', 'betTypeSelector2', 'betTypeSelectorF5'];
        selectorIds.forEach(function(id) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        const lineGroup = document.getElementById('lineInputGroup');
        if (lineGroup) {
            lineGroup.style.display = option && option.line != null ? 'block' : 'none';
            const label = lineGroup.querySelector('label');
            if (label) label.textContent = getLineInputLabel(option);
            const hint = lineGroup.querySelector('p');
            if (hint) hint.textContent = option && option.line != null
                ? 'Line loaded from the live market. You can adjust it if your book differs.'
                : 'No line is required for this market.';
        }
    }

    function injectStyles() {
        if (document.getElementById('tmr-prod-fix-style')) return;
        const style = document.createElement('style');
        style.id = 'tmr-prod-fix-style';
        style.textContent = [
            '.tmr-board-banner{margin:0 0 18px;padding:14px 16px;border-radius:18px;border:1px solid rgba(255,255,255,0.08);font-size:13px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;background:linear-gradient(180deg,rgba(28,33,40,0.96),rgba(18,22,28,0.96));box-shadow:0 20px 36px rgba(0,0,0,0.2);}',
            '.tmr-board-banner.warning{border-color:rgba(255,184,0,0.28);color:#ffd76a;}',
            '.tmr-board-banner.info{border-color:rgba(82,185,255,0.26);color:#9fdbff;}',
            '.tmr-board-banner.success{border-color:rgba(88,214,141,0.24);color:#a7f3c5;}',
            '.tmr-board-actions{display:flex;gap:10px;align-items:center;}',
            '.tmr-board-button{background:#2f8f53;border:1px solid rgba(120,255,181,0.25);color:#f5fff8;padding:9px 13px;border-radius:12px;cursor:pointer;font-weight:800;transition:transform .15s ease,border-color .15s ease,background .15s ease;}',
            '.tmr-board-button:hover{transform:translateY(-1px);background:#36a45f;border-color:rgba(170,255,204,0.45);}',
            '.tmr-board-filter-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 18px;padding:14px 16px;border-radius:18px;border:1px solid rgba(255,255,255,0.07);background:linear-gradient(180deg,rgba(18,22,28,0.98),rgba(13,16,21,0.98));box-shadow:0 18px 34px rgba(0,0,0,0.22);}',
            '.tmr-board-filter-label{font-size:11px;font-weight:900;letter-spacing:0.16em;text-transform:uppercase;color:#7f8da2;white-space:nowrap;}',
            '.tmr-board-filter-tabs{display:flex;gap:10px;flex-wrap:wrap;}',
            '.tmr-board-filter-tab{padding:11px 14px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);color:#9aa7b8;font-size:11px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease,transform .15s ease;min-width:132px;text-align:center;}',
            '.tmr-board-filter-tab:hover{transform:translateY(-1px);border-color:rgba(255,255,255,0.16);}',
            '.tmr-board-filter-tab.active{background:linear-gradient(180deg,rgba(59,130,246,0.18),rgba(18,24,33,0.96));border-color:rgba(125,211,252,0.48);color:#f8fafc;box-shadow:0 10px 22px rgba(0,0,0,0.16);}',
            '.tmr-board-filter-tab:disabled,.tmr-board-filter-tab.disabled{cursor:not-allowed;opacity:0.42;color:#6f7d90;background:rgba(255,255,255,0.02);border-color:rgba(255,255,255,0.06);box-shadow:none;transform:none;}',
            '.tmr-market-card{position:relative;background:linear-gradient(180deg,rgba(17,21,28,0.99),rgba(10,13,18,0.99));border:1px solid rgba(255,255,255,0.08);border-radius:22px;margin-bottom:18px;overflow:hidden;box-shadow:0 22px 48px rgba(0,0,0,0.28);--tmr-accent:#2f8f53;--tmr-accent-soft:#f2c94c;}',
            '.tmr-market-card::before{content:"";position:absolute;inset:0 0 auto 0;height:4px;background:linear-gradient(90deg,var(--tmr-accent),var(--tmr-accent-soft),#f2c94c);pointer-events:none;}',
            '.tmr-market-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;padding:20px 22px 16px;align-items:start;cursor:pointer;background:linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0));}',
            '.tmr-market-topline{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;}',
            '.tmr-market-league{font-size:11px;font-weight:900;letter-spacing:0.16em;text-transform:uppercase;color:var(--tmr-accent-soft);}',
            '.tmr-market-status{padding:7px 11px;border-radius:999px;background:color-mix(in srgb, var(--tmr-accent) 18%, rgba(255,255,255,0.02));border:1px solid color-mix(in srgb, var(--tmr-accent) 40%, rgba(255,255,255,0.08));font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;color:#f8fafc;}',
            '.tmr-market-matchup{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;padding:0;border-radius:18px;}',
            '.tmr-team-row{display:grid;grid-template-columns:auto auto minmax(0,1fr);align-items:center;gap:10px;color:#f8fafc;}',
            '.tmr-team-side{display:inline-flex;align-items:center;justify-content:center;min-width:54px;padding:5px 9px;border-radius:999px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;color:#aeb8c6;}',
            '.tmr-team-abbr{width:30px;height:30px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);font-size:11px;font-weight:900;letter-spacing:0.08em;color:#dbe7ef;flex-shrink:0;}',
            '.tmr-team-name{font-size:clamp(18px,2vw,22px);font-weight:800;letter-spacing:-0.03em;line-height:1.05;}',
            '.tmr-matchup-divider{display:flex;align-items:center;gap:10px;padding-left:66px;color:#6f7a89;font-size:10px;font-weight:900;letter-spacing:0.18em;text-transform:uppercase;}',
            '.tmr-matchup-divider::before,.tmr-matchup-divider::after{content:"";height:1px;flex:1;background:rgba(255,255,255,0.08);}',
            '.tmr-market-meta{display:flex;gap:8px;flex-wrap:wrap;color:#aab4c3;font-size:11px;margin-top:16px;}',
            '.tmr-market-chip{padding:6px 10px;border-radius:999px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.06);font-weight:700;}',
            '.tmr-market-chip.real{background:rgba(47,143,83,0.18);color:#98f0b6;border-color:rgba(98,222,142,0.22);}',
            '.tmr-market-chip.fallback{background:rgba(242,201,76,0.16);color:#ffe08a;border-color:rgba(242,201,76,0.2);}',
            '.tmr-market-chip.accent{background:color-mix(in srgb, var(--tmr-accent) 18%, transparent);color:#eefcf3;border-color:color-mix(in srgb, var(--tmr-accent) 42%, rgba(255,255,255,0.06));}',
            '.tmr-market-summary{display:flex;align-items:flex-start;justify-content:flex-end;gap:10px;flex-wrap:wrap;}',
            '.tmr-market-count{padding:10px 14px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);font-size:11px;font-weight:800;color:#dbe4f0;white-space:nowrap;text-transform:uppercase;letter-spacing:0.08em;}',
            '.tmr-market-caret{font-size:18px;color:#98a4b3;transition:transform .18s ease;color:var(--tmr-accent-soft);padding-top:8px;}',
            '.tmr-market-card.open .tmr-market-caret{transform:rotate(180deg);}',
            '.tmr-market-body{padding:0 22px 22px;display:none;}',
            '.tmr-market-card.open .tmr-market-body{display:block;}',
            '.tmr-group{margin-top:14px;border:1px solid rgba(255,255,255,0.05);border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.015));padding:0;overflow:hidden;}',
            '.tmr-group[data-scope="f5"]{display:none;}',
            '.tmr-market-card[data-scope="f5"] .tmr-group[data-scope="full"]{display:none;}',
            '.tmr-market-card[data-scope="f5"] .tmr-group[data-scope="f5"]{display:block;}',
            '.tmr-group-header{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:12px;padding:14px 14px 10px;border-bottom:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);}',
            '.tmr-group-title{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:#f2c94c;margin:0;font-weight:900;}',
            '.tmr-group-metahead{font-size:10px;letter-spacing:0.12em;color:#69778c;text-transform:uppercase;font-weight:800;}',
            '.tmr-group-count{font-size:10px;letter-spacing:0.08em;color:#8b95a7;background:rgba(255,255,255,0.04);padding:5px 8px;border-radius:999px;border:1px solid rgba(255,255,255,0.05);}',
            '.tmr-option-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0;padding:10px;}',
            '.tmr-option-btn{background:linear-gradient(180deg,rgba(33,38,47,0.98),rgba(24,28,35,0.98));border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:14px 14px;text-align:left;color:#fff;cursor:pointer;transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease,background .15s ease;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;min-height:82px;}',
            '.tmr-option-btn:hover{transform:translateY(-1px);border-color:color-mix(in srgb, var(--tmr-accent) 35%, white 65%);box-shadow:0 0 0 1px color-mix(in srgb, var(--tmr-accent) 15%, transparent) inset,0 12px 24px rgba(0,0,0,0.18);}',
            '.tmr-option-btn.active{border-color:var(--tmr-accent);box-shadow:0 0 0 1px color-mix(in srgb, var(--tmr-accent) 24%, transparent) inset,0 10px 22px rgba(0,0,0,0.2);background:linear-gradient(180deg,color-mix(in srgb, var(--tmr-accent) 18%, rgba(45,60,49,0.98)),rgba(22,31,26,0.98));}',
            '.tmr-option-main{display:flex;flex-direction:column;gap:6px;min-width:0;}',
            '.tmr-option-topline{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
            '.tmr-option-tag{display:inline-flex;align-items:center;justify-content:center;padding:4px 7px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:#c8d0dc;}',
            '.tmr-option-line{font-size:12px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;color:var(--tmr-accent-soft);}',
            '.tmr-option-market{font-size:18px;font-weight:800;line-height:1.15;color:#f8fafc;letter-spacing:-0.02em;}',
            '.tmr-option-detail{font-size:11px;color:#8b95a7;line-height:1.35;}',
            '.tmr-option-detail.manual{color:#fbbf24;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;}',
            '.tmr-option-odds-wrap{display:flex;flex-direction:column;align-items:flex-end;gap:6px;}',
            '.tmr-option-odds-label{font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#6f7d90;font-weight:800;}',
            '.tmr-option-odds{font-size:24px;font-weight:900;white-space:nowrap;padding:10px 14px;border-radius:12px;background:linear-gradient(180deg,rgba(56,63,76,0.98),rgba(39,44,53,0.98));border:1px solid rgba(255,255,255,0.08);color:#f8fff9;min-width:82px;text-align:center;letter-spacing:-0.03em;}',
            '.tmr-option-btn.active .tmr-option-odds{background:var(--tmr-accent);border-color:color-mix(in srgb, var(--tmr-accent) 50%, white 50%);}',
            '.tmr-empty-state{padding:44px 22px;text-align:center;color:#a8b4c6;border:1px dashed rgba(255,255,255,0.1);border-radius:18px;background:linear-gradient(180deg,rgba(20,24,31,0.98),rgba(13,16,22,0.98));box-shadow:0 20px 40px rgba(0,0,0,0.24);}',
            '.tmr-loading-slate{display:grid;gap:16px;}',
            '.tmr-loading-topline{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 18px;border-radius:18px;border:1px solid rgba(255,255,255,0.06);background:linear-gradient(180deg,rgba(18,22,29,0.98),rgba(12,15,21,0.98));box-shadow:0 18px 36px rgba(0,0,0,0.22);}',
            '.tmr-loading-kicker{height:12px;width:144px;border-radius:999px;background:linear-gradient(90deg,rgba(255,255,255,0.03),rgba(255,255,255,0.11),rgba(255,255,255,0.03));background-size:220% 100%;animation:tmrShimmer 1.25s linear infinite;}',
            '.tmr-loading-meta{height:12px;width:92px;border-radius:999px;background:linear-gradient(90deg,rgba(255,255,255,0.03),rgba(255,255,255,0.11),rgba(255,255,255,0.03));background-size:220% 100%;animation:tmrShimmer 1.25s linear infinite;}',
            '.tmr-loading-tabs{display:flex;gap:10px;flex-wrap:wrap;}',
            '.tmr-loading-tab{height:40px;min-width:132px;border-radius:14px;border:1px solid rgba(255,255,255,0.05);background:linear-gradient(90deg,rgba(255,255,255,0.03),rgba(255,255,255,0.09),rgba(255,255,255,0.03));background-size:220% 100%;animation:tmrShimmer 1.25s linear infinite;}',
            '.tmr-loading-grid{display:grid;gap:16px;}',
            '.tmr-loading-card{padding:18px 18px 16px;border-radius:20px;background:linear-gradient(180deg,rgba(19,23,30,0.99),rgba(11,14,20,0.99));border:1px solid rgba(255,255,255,0.06);box-shadow:0 22px 48px rgba(0,0,0,0.26);}',
            '.tmr-loading-card-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:16px;}',
            '.tmr-loading-card-title{height:14px;width:210px;border-radius:999px;background:linear-gradient(90deg,rgba(255,255,255,0.03),rgba(255,255,255,0.11),rgba(255,255,255,0.03));background-size:220% 100%;animation:tmrShimmer 1.25s linear infinite;}',
            '.tmr-loading-card-badge{height:30px;width:84px;border-radius:999px;background:linear-gradient(90deg,rgba(255,255,255,0.03),rgba(255,255,255,0.11),rgba(255,255,255,0.03));background-size:220% 100%;animation:tmrShimmer 1.25s linear infinite;}',
            '.tmr-loading-matchup{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:14px;}',
            '.tmr-loading-team{height:62px;border-radius:16px;background:linear-gradient(90deg,rgba(255,255,255,0.03),rgba(255,255,255,0.09),rgba(255,255,255,0.03));background-size:220% 100%;animation:tmrShimmer 1.25s linear infinite;border:1px solid rgba(255,255,255,0.04);}',
            '.tmr-loading-lines{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}',
            '.tmr-loading-line{height:88px;border-radius:16px;background:linear-gradient(90deg,rgba(255,255,255,0.03),rgba(255,255,255,0.08),rgba(255,255,255,0.03));background-size:220% 100%;animation:tmrShimmer 1.25s linear infinite;border:1px solid rgba(255,255,255,0.04);}',
            '#picks .sport-cards-grid{grid-template-columns:repeat(auto-fit,minmax(165px,1fr))!important;gap:14px!important;}',
            '#picks .sport-card{min-height:148px;border:1px solid rgba(255,255,255,0.08)!important;border-radius:18px!important;padding:18px 16px!important;background:linear-gradient(180deg,rgba(27,31,38,0.98),rgba(17,20,26,0.98))!important;box-shadow:0 14px 28px rgba(0,0,0,0.18)!important;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-start;text-align:left;overflow:hidden;}',
            '#picks .sport-card::before{left:auto!important;top:0!important;inset:0 0 auto 0!important;width:100%!important;height:3px!important;background:linear-gradient(90deg,#2f8f53,#4eb66f,#f2c94c)!important;opacity:.95;}',
            '#picks .sport-card:hover{transform:translateY(-3px)!important;border-color:rgba(120,255,181,0.24)!important;box-shadow:0 18px 36px rgba(0,0,0,0.24)!important;}',
            '#picks .sport-card.selected{border-color:rgba(120,255,181,0.34)!important;background:linear-gradient(180deg,rgba(38,50,42,0.98),rgba(21,30,24,0.98))!important;box-shadow:0 20px 38px rgba(0,0,0,0.24)!important;}',
            '#picks .sport-icon{font-size:28px!important;margin:0 0 14px!important;line-height:1;}',
            '#picks .sport-name{font-size:18px!important;font-weight:800!important;color:#f8fafc!important;margin:0 0 8px!important;}',
            '#picks .sport-games{font-size:12px!important;font-weight:700!important;color:#f2c94c!important;letter-spacing:0.06em;text-transform:uppercase;}',
            '#picks .games-header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.08);}',
            '#picks #selectedSportTitle{font-size:clamp(24px,3vw,32px)!important;letter-spacing:-0.03em;line-height:1.05;margin:0;}',
            '#picks .games-count{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#dbe4f0;}',
            '#picks #pickDetails > h3,#picks #picksList > h3{font-size:clamp(24px,3vw,32px);letter-spacing:-0.03em;margin:0 0 16px;color:#f8fafc;}',
            '#picks #betScopeSelector,#picks #betTypeSelector,#picks #betTypeSelector2,#picks #betTypeSelectorF5{border:1px solid rgba(255,255,255,0.08)!important;border-radius:14px!important;background:rgba(255,255,255,0.03)!important;overflow:hidden;}',
            '#picks .bt-toggle-btn,#picks .bt-scope-btn,#picks .units-mode-btn{letter-spacing:0.06em;text-transform:uppercase;font-weight:800!important;}',
            '#picks .pick-summary-card{border:1px solid rgba(255,255,255,0.08)!important;border-radius:18px!important;background:linear-gradient(180deg,rgba(27,31,38,0.98),rgba(17,20,26,0.98))!important;box-shadow:0 16px 30px rgba(0,0,0,0.18)!important;padding:18px 20px!important;}',
            '#picks .pick-summary-card::before{height:3px!important;background:linear-gradient(90deg,#2f8f53,#4eb66f,#f2c94c)!important;}',
            '#picks .summary-section{padding:14px 0!important;border-bottom:1px solid rgba(255,255,255,0.08)!important;}',
            '#picks .summary-label{font-size:11px!important;font-weight:800!important;letter-spacing:0.12em!important;text-transform:uppercase;color:#9aa7b8!important;}',
            '#picks .summary-value{font-size:18px!important;font-weight:800!important;color:#f8fafc!important;}',
            '#picks .pick-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 18px;margin:22px 0 24px!important;}',
            '#picks .option-group{margin:0!important;padding:16px 16px 14px;border:1px solid rgba(255,255,255,0.08);border-radius:16px;background:linear-gradient(180deg,rgba(27,31,38,0.94),rgba(18,21,27,0.94));}',
            '#picks .option-group:last-child{grid-column:1/-1;}',
            '#picks .option-group label{font-size:11px!important;font-weight:800!important;letter-spacing:0.12em!important;text-transform:uppercase;color:#f2c94c!important;margin-bottom:10px!important;}',
            '#picks #pickLineInput,#picks #pickOddsInput,#picks #unitsInput,#picks #pickReasoning{background:#14181f!important;border:1px solid rgba(255,255,255,0.08)!important;border-radius:12px!important;color:#f8fafc!important;box-shadow:none!important;}',
            '#picks #pickLineInput:focus,#picks #pickOddsInput:focus,#picks #unitsInput:focus,#picks #pickReasoning:focus{outline:none;border-color:rgba(120,255,181,0.34)!important;box-shadow:0 0 0 3px rgba(47,143,83,0.15)!important;}',
            '#picks #pickReasoning{min-height:110px;padding:14px 16px;font-size:15px;resize:vertical;}',
            '#picks #unitsModeToggle{border:1px solid rgba(255,255,255,0.08)!important;border-radius:12px!important;background:#14181f!important;}',
            '#picks .submit-pick-btn{width:100%;padding:16px 20px;border-radius:16px;border:1px solid rgba(120,255,181,0.26);background:linear-gradient(180deg,#2f8f53,#257444);color:#f8fff9;font-size:15px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;box-shadow:0 16px 30px rgba(0,0,0,0.2);}',
            '#picks .submit-pick-btn:hover{transform:translateY(-1px);background:linear-gradient(180deg,#38a35f,#2a7c49);}',
            '#picks #pickConfirmation > div{background:linear-gradient(180deg,rgba(35,63,42,0.98),rgba(19,31,23,0.98))!important;border:1px solid rgba(120,255,181,0.26)!important;border-radius:20px!important;box-shadow:0 20px 40px rgba(0,0,0,0.22)!important;}',
            '#picks #confirmPickDetail{font-size:26px!important;line-height:1.15!important;color:#f8fafc!important;}',
            '#picks #confirmPickMeta{font-size:13px!important;letter-spacing:0.04em;color:#b8c2cf!important;}',
            '#picks #gamesListContainer{display:grid;gap:20px;}',
            '.tmr-board-filter-bar{padding:16px 18px;border-radius:16px;background:linear-gradient(180deg,rgba(20,24,31,0.99),rgba(12,15,21,0.99));border-color:rgba(255,255,255,0.06);}',
            '.tmr-board-filter-tabs{display:flex;gap:10px;flex-wrap:wrap;}',
            '.tmr-board-filter-tab{min-width:140px;padding:12px 16px;border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015));}',
            '.tmr-board-filter-tab.active{background:linear-gradient(180deg,rgba(47,143,83,0.28),rgba(18,24,33,0.98));border-color:rgba(98,222,142,0.42);box-shadow:0 14px 30px rgba(7,12,18,0.26);}',
            '.tmr-market-card{border-radius:18px;box-shadow:0 26px 54px rgba(0,0,0,0.30);background:linear-gradient(180deg,rgba(16,19,25,0.995),rgba(9,12,17,0.995));}',
            '.tmr-market-card::before{height:3px;background:linear-gradient(90deg,#29c06f,#56f0a3,#f6c851);}',
            '.tmr-market-head{padding:18px 18px 14px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0));}',
            '.tmr-market-summary{align-items:center;}',
            '.tmr-market-count{padding:9px 12px;border-radius:12px;background:rgba(255,255,255,0.035);font-size:10px;letter-spacing:0.14em;}',
            '.tmr-market-body{padding:0 18px 18px;}',
            '.tmr-group{border-radius:16px;background:linear-gradient(180deg,rgba(20,24,31,0.98),rgba(15,18,24,0.98));border-color:rgba(255,255,255,0.04);overflow:hidden;}',
            '.tmr-group-header{padding:10px 14px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;background:rgba(255,255,255,0.018);}',
            '.tmr-group-title{color:#f4d35e;font-size:11px;letter-spacing:0.15em;}',
            '.tmr-group-metahead{display:none;}',
            '.tmr-option-grid{display:grid;grid-template-columns:1fr;gap:8px;padding:12px;}',
            '.tmr-option-btn{min-height:78px;padding:12px 12px 12px 14px;border-radius:14px;background:linear-gradient(180deg,rgba(35,41,52,0.98),rgba(24,29,37,0.98));border:1px solid rgba(255,255,255,0.05);box-shadow:inset 0 1px 0 rgba(255,255,255,0.03);grid-template-columns:minmax(0,1fr) auto;}',
            '.tmr-option-btn:hover{transform:translateY(-1px);border-color:rgba(86,240,163,0.18);background:linear-gradient(180deg,rgba(38,45,57,1),rgba(27,32,40,1));}',
            '.tmr-option-btn.active{border-color:rgba(86,240,163,0.34);box-shadow:0 14px 30px rgba(0,0,0,0.24), inset 0 0 0 1px rgba(86,240,163,0.14);}',
            '.tmr-option-main{display:grid;grid-template-columns:minmax(0,1fr);gap:5px;min-width:0;}',
            '.tmr-option-topline{gap:10px;justify-content:flex-start;}',
            '.tmr-option-tag{background:rgba(255,255,255,0.07);min-width:56px;padding:5px 8px;}',
            '.tmr-option-line{color:#56f0a3;font-weight:900;}',
            '.tmr-option-market{font-size:16px;font-weight:800;line-height:1.15;}',
            '.tmr-option-detail{font-size:10px;letter-spacing:0.05em;color:#8fa0b5;text-transform:uppercase;}',
            '.tmr-option-odds-wrap{gap:6px;align-items:flex-end;justify-content:center;}',
            '.tmr-option-odds{min-width:94px;padding:13px 14px;border-radius:12px;background:linear-gradient(180deg,rgba(63,72,88,0.98),rgba(40,46,58,0.98));font-size:30px;letter-spacing:-0.05em;}',
            '@keyframes tmrShimmer{0%{background-position:200% 0;}100%{background-position:-200% 0;}}',
            '@media (max-width: 700px){.tmr-loading-topline{padding:14px 14px 12px;align-items:flex-start;flex-direction:column;}.tmr-loading-tabs{width:100%;}.tmr-loading-tab{flex:1 1 calc(50% - 6px);min-width:unset;}.tmr-loading-matchup,.tmr-loading-lines{grid-template-columns:1fr;}.tmr-market-head{padding:16px;grid-template-columns:1fr;align-items:flex-start;}.tmr-market-body{padding:0 16px 16px;}.tmr-market-summary{width:100%;justify-content:space-between;}.tmr-option-grid{grid-template-columns:1fr;}.tmr-team-name{font-size:16px;}.tmr-team-side{min-width:46px;padding:4px 7px;}.tmr-matchup-divider{padding-left:56px;}.tmr-option-btn{min-height:auto;padding:12px 13px;grid-template-columns:minmax(0,1fr) auto;}.tmr-market-count{width:100%;text-align:center;}.tmr-market-caret{display:none;}.tmr-board-filter-tab{min-width:unset;flex:1 1 calc(50% - 6px);}.tmr-group-header{grid-template-columns:minmax(0,1fr) auto;}.tmr-group-metahead{display:none;}#picks .pick-options{grid-template-columns:1fr;}#picks .games-header{align-items:flex-start;flex-direction:column;}#picks .sport-cards-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;}#picks .sport-card{min-height:132px;padding:16px 14px!important;}#picks .sport-name{font-size:16px!important;}#picks .submit-pick-btn{padding:15px 16px;font-size:14px;}}'
        ].join('');
        document.head.appendChild(style);
    }

    function renderBoardLoading(container, sport) {
        if (!container) return;
        const loadingFilters = getPreferredFilters({ sport_key: SPORT_KEY_MAP[sport] || '' }, new Set(['game-lines', 'team-totals', 'first-5', 'segments', 'alt-lines'])).slice(0, 5);
        const tabsHtml = loadingFilters.map(function(filter) {
            return '<div class="tmr-loading-tab" aria-hidden="true" title="' + escapeHtml(getFilterLabel(filter)) + '"></div>';
        }).join('');
        const cardHtml = '<div class="tmr-loading-card">' +
            '<div class="tmr-loading-card-head"><div class="tmr-loading-card-title"></div><div class="tmr-loading-card-badge"></div></div>' +
            '<div class="tmr-loading-matchup"><div class="tmr-loading-team"></div><div class="tmr-loading-team"></div></div>' +
            '<div class="tmr-loading-lines"><div class="tmr-loading-line"></div><div class="tmr-loading-line"></div><div class="tmr-loading-line"></div></div>' +
            '</div>';
        container.innerHTML = '<div class="tmr-loading-slate">' +
            '<div class="tmr-loading-topline"><div class="tmr-loading-kicker"></div><div class="tmr-loading-meta"></div></div>' +
            '<div class="tmr-loading-tabs">' + tabsHtml + '</div>' +
            '<div class="tmr-loading-grid">' + cardHtml + cardHtml + '</div>' +
            '</div>';
    }

    function formatTimestamp(value) {
        if (!value) return 'Unavailable';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Unavailable';
        return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function formatStartsIn(value) {
        if (!value) return 'Schedule pending';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Schedule pending';
        const diff = date.getTime() - Date.now();
        if (diff <= 0) return 'Started';
        const totalMinutes = Math.round(diff / 60000);
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const minutes = totalMinutes % 60;
        if (days > 0) return 'Starts in ' + days + 'd ' + (hours || 0) + 'h';
        if (hours > 0) return 'Starts in ' + hours + 'h ' + minutes + 'm';
        return 'Starts in ' + minutes + 'm';
    }

    function formatOdds(odds) {
        if (odds == null || Number.isNaN(Number(odds))) return 'Manual';
        const numeric = Number(odds);
        return numeric > 0 ? '+' + numeric : String(numeric);
    }

    function isPlaceholderTeamName(value) {
        const normalized = String(value || '').trim().toLowerCase();
        return !normalized || ['tbd', 'unknown', 'team a', 'team b', 'home', 'away'].includes(normalized);
    }

    function deriveTeamsFromBookmakers(game) {
        const bookmakers = Array.isArray(game && game.bookmakers) ? game.bookmakers : [];
        for (let i = 0; i < bookmakers.length; i += 1) {
            const bookmaker = bookmakers[i];
            const markets = Array.isArray(bookmaker && bookmaker.markets) ? bookmaker.markets : [];
            const h2h = markets.find(function(market) {
                return market && market.key === 'h2h' && Array.isArray(market.outcomes) && market.outcomes.length >= 2;
            });
            if (h2h) {
                const first = String(h2h.outcomes[0] && h2h.outcomes[0].name || '').trim();
                const second = String(h2h.outcomes[1] && h2h.outcomes[1].name || '').trim();
                if (!isPlaceholderTeamName(first) && !isPlaceholderTeamName(second)) {
                    return { home_team: first, away_team: second };
                }
            }
        }
        return null;
    }

    function repairGameTeams(game) {
        if (!game) return game;
        if (!isPlaceholderTeamName(game.home_team) && !isPlaceholderTeamName(game.away_team)) {
            return game;
        }
        const derived = deriveTeamsFromBookmakers(game);
        if (!derived) return game;
        return Object.assign({}, game, {
            home_team: isPlaceholderTeamName(game.home_team) ? derived.home_team : game.home_team,
            away_team: isPlaceholderTeamName(game.away_team) ? derived.away_team : game.away_team
        });
    }

    function boardHasBrokenTeamPlaceholders(response) {
        const games = Array.isArray(response && response.games) ? response.games : [];
        return games.some(function(game) {
            if (!game || (!isPlaceholderTeamName(game.home_team) && !isPlaceholderTeamName(game.away_team))) {
                return false;
            }
            return Boolean(deriveTeamsFromBookmakers(game));
        });
    }

    function normalizeBoardResponse(response, sport) {
        const games = Array.isArray(response && response.games) ? response.games : [];
        let repairedCount = 0;
        let droppedCount = 0;
        const normalizedGames = games.map(function(game, index) {
            const repaired = repairGameTeams(game);
            if (repaired !== game) repairedCount += 1;
            return stripManualMarketTemplates(repaired);
        }).filter(function(game) {
            const unresolved = game && (isPlaceholderTeamName(game.home_team) || isPlaceholderTeamName(game.away_team));
            if (unresolved) {
                droppedCount += 1;
                console.warn('[TMR] Dropping board game with unresolved placeholder teams:', {
                    sport: sport,
                    gameId: game && game.id,
                    home_team: game && game.home_team,
                    away_team: game && game.away_team
                });
                return false;
            }
            return true;
        });

        const summary = Object.assign({}, response && response.summary ? response.summary : {});
        if (droppedCount > 0) {
            summary.severity = summary.severity === 'success' ? 'warning' : (summary.severity || 'warning');
            summary.message = droppedCount === games.length
                ? 'Live markets are temporarily unavailable for this sport right now.'
                : 'Some matchups were hidden because their team data was incomplete. The remaining live markets are still available.';
        } else if (repairedCount > 0 && !summary.message) {
            summary.message = repairedCount + ' game' + (repairedCount === 1 ? '' : 's') + ' had missing team names repaired from sportsbook data.';
            summary.severity = summary.severity || 'info';
        }

        return {
            sport_key: response && response.sport_key ? response.sport_key : '',
            summary: summary,
            games: normalizedGames,
            diagnostics: Object.assign({}, response && response.diagnostics ? response.diagnostics : {}, {
                frontend_repaired_games: repairedCount,
                frontend_dropped_games: droppedCount
            })
        };
    }

    function stripManualMarketTemplates(game) {
        if (!game || !Array.isArray(game.market_groups)) return game;

        const marketGroups = game.market_groups.map(function(group) {
            const items = Array.isArray(group && group.items) ? group.items.filter(function(item) {
                if (!item) return false;
                if (item.source === 'manual') return false;
                if (!item.odds_display && (item.odds == null || Number.isNaN(Number(item.odds)))) return false;
                return true;
            }) : [];

            if (!items.length) return null;
            return Object.assign({}, group, { items: items });
        }).filter(Boolean);

        return Object.assign({}, game, { market_groups: marketGroups });
    }

    function createFallbackOption(game, index, groupLabel, marketType, selection, selectionLabel, odds, line, detailLabel, sourceType) {
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
            book_title: sourceType === 'manual' ? 'Manual entry' : (game._bookTitle || 'Sportsbook feed'),
            book_key: game._bookKey || '',
            group_label: groupLabel,
            source: sourceType || 'sportsbook',
            source_label: detailLabel || (sourceType === 'manual' ? 'Enter line and odds manually' : (game._bookTitle || 'Sportsbook feed')),
            source_updated_at: game.updated_at || game.commence_time || null
        };
    }

    function buildFallbackBoardGames(games, sportKey) {
        return (games || []).map(function(game, index) {
            game = repairGameTeams(game);
            const bookmakers = Array.isArray(game.bookmakers) ? game.bookmakers : [];
            const bookmaker = bookmakers[0] || null;
            const markets = bookmakers.reduce(function(all, book) {
                return all.concat(Array.isArray(book && book.markets) ? book.markets : []);
            }, []);
            const findMarketByKeys = function(keys) {
                return keys.map(function(key) {
                    return markets.find(function(market) { return market.key === key; }) || null;
                }).find(Boolean) || null;
            };
            const h2h = markets.find(function(market) { return market.key === 'h2h'; }) || null;
            const spreads = markets.find(function(market) { return market.key === 'spreads'; }) || null;
            const totals = markets.find(function(market) { return market.key === 'totals'; }) || null;
            const teamTotals = findMarketByKeys(['team_totals']);
            const f5H2h = findMarketByKeys(['f5_h2h', 'h2h_1st_5_innings']);
            const f5Spreads = findMarketByKeys(['f5_spreads', 'spreads_1st_5_innings']);
            const f5Totals = findMarketByKeys(['f5_totals', 'totals_1st_5_innings']);
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

            const addRawMarketGroup = function(groupKey, groupLabel, marketKeys) {
                const items = [];
                marketKeys.forEach(function(marketKey) {
                    const market = findMarketByKeys([marketKey]);
                    if (!market || !Array.isArray(market.outcomes) || !market.outcomes.length) return;

                    market.outcomes.forEach(function(outcome) {
                        const line = outcome.point != null ? outcome.point : null;
                        const isTotal = marketKey.indexOf('totals') !== -1 || marketKey === 'alt_totals';
                        const isMoneyline = marketKey.indexOf('h2h') !== -1 || marketKey === 'h2h_3_way';
                        let label = outcome.name || groupLabel;

                        if (isTotal && line != null) {
                            label = outcome.name + ' ' + line;
                        } else if (!isMoneyline && line != null) {
                            label = outcome.name + ' ' + (line > 0 ? '+' : '') + line;
                        } else if (isMoneyline) {
                            label = outcome.name + ' ML';
                        }

                        items.push(createFallbackOption(
                            game,
                            index,
                            groupLabel,
                            marketKey,
                            outcome.name,
                            label,
                            outcome.price,
                            line,
                            bookmaker ? bookmaker.title : 'Sportsbook feed'
                        ));
                    });
                });

                if (items.length) {
                    marketGroups.push({
                        key: groupKey,
                        label: groupLabel,
                        items: items
                    });
                }
            };

            addRawMarketGroup('first_half', 'First Half', ['first_half_h2h', 'h2h_h1', 'first_half_spreads', 'spreads_h1', 'first_half_totals', 'totals_h1']);
            addRawMarketGroup('second_half', 'Second Half', ['second_half_h2h', 'h2h_h2', 'second_half_spreads', 'spreads_h2', 'second_half_totals', 'totals_h2']);
            addRawMarketGroup('period_1', '1st Period', ['period_1_h2h', 'h2h_p1', 'period_1_spreads', 'period_1_totals', 'totals_p1']);
            addRawMarketGroup('alt_spreads', 'Alt Spreads', ['alt_spreads', 'alternate_spreads']);
            addRawMarketGroup('alt_totals', 'Alt Totals', ['alt_totals', 'alternate_totals']);
            addRawMarketGroup('three_way', '3-Way Moneyline', ['h2h_3_way']);

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

    function getGroupCategory(group) {
        const key = group && group.key;
        if (key === 'full_game' || key === 'spread' || key === 'total' || key === 'h2h' || key === 'spreads' || key === 'totals' || key === 'run_line') return 'game-lines';
        if (key === 'team_totals') return 'team-totals';
        if (key === 'first_5') return 'first-5';
        if (key === 'first_half' || key === 'second_half' || key === 'period_1') return 'segments';
        if (key === 'alt_spreads' || key === 'alt_totals') return 'alt-lines';
        return 'specials';
    }

    function getFilterLabel(category, game) {
        const sportKey = String(game && game.sport_key || '').toLowerCase();
        if (category === 'first-5') {
            return sportKey.indexOf('baseball_') !== -1 ? '1st 5' : 'Early Lines';
        }
        if (category === 'segments') {
            if (sportKey.indexOf('icehockey_') !== -1) return 'Periods';
            if (sportKey.indexOf('basketball_') !== -1) return 'Quarters';
            if (sportKey.indexOf('football_') !== -1) return 'Halves';
            if (sportKey.indexOf('soccer_') !== -1) return '1H Lines';
            return 'Segments';
        }
        const labels = {
            'game-lines': 'Game Lines',
            'team-totals': 'Team Totals',
            'alt-lines': 'Alt Lines',
            specials: 'Props'
        };
        return labels[category] || 'Markets';
    }

    function getPreferredFilters(game, availableCategories) {
        const sportKey = String(game && game.sport_key || '').toLowerCase();
        let preferred = ['game-lines', 'team-totals', 'first-5', 'segments', 'alt-lines', 'specials'];
        if (sportKey.indexOf('icehockey_nhl') !== -1) {
            preferred = ['game-lines', 'team-totals', 'segments', 'alt-lines', 'specials'];
        } else if (sportKey.indexOf('basketball_') !== -1 || sportKey.indexOf('football_') !== -1) {
            preferred = ['game-lines', 'team-totals', 'segments', 'alt-lines', 'specials'];
        } else if (sportKey.indexOf('baseball_mlb') !== -1) {
            preferred = ['game-lines', 'team-totals', 'first-5', 'alt-lines', 'specials'];
        }

        if (!availableCategories || !availableCategories.size) {
            return preferred;
        }

        return preferred.filter(function(filter) {
            return availableCategories.has(filter) || filter === 'game-lines' || filter === 'team-totals' || filter === 'first-5';
        });
    }

    function setCardScope(cardId, scope) {
        const card = document.getElementById(cardId);
        if (!card) return;
        card.dataset.scope = scope;
        card.querySelectorAll('.tmr-scope-tab').forEach(function(button) {
            button.classList.toggle('active', button.dataset.scope === scope);
        });
    }

    function setCardFilter(cardId, filter) {
        const card = document.getElementById(cardId);
        if (!card) return;
        card.dataset.marketFilter = filter;
        card.querySelectorAll('.tmr-family-tab, .tmr-filter-pill').forEach(function(button) {
            button.classList.toggle('active', button.dataset.filter === filter);
        });
    }

    function renderBoardOptionButton(option, optionKey, optionDomId, game) {
        state.currentOptions.set(optionKey, Object.assign({
            game: game,
            _domId: optionDomId,
            _optionKey: optionKey
        }, option));
        const detailLabel = option.source === 'manual'
            ? 'Enter your book'
            : (option.book_title || option.source_label || 'Sportsbook board');
        const detailClass = option.source === 'manual' ? 'tmr-option-detail manual' : 'tmr-option-detail';
        const optionTag = getOptionTag(option, game);
        const optionLine = getOptionLineText(option);
        return '<button class="tmr-option-btn" id="' + optionDomId + '" data-option-id="' + escapeHtml(optionKey) + '" onclick="window.tmrSelectOption(this.dataset.optionId)">' +
            '<div class="tmr-option-main">' +
            '<div class="tmr-option-topline"><span class="tmr-option-tag">' + escapeHtml(optionTag) + '</span>' + (optionLine ? '<span class="tmr-option-line">' + escapeHtml(optionLine) + '</span>' : '') + '</div>' +
            '<div class="tmr-option-market">' + escapeHtml(option.selection_label) + '</div>' +
            '<div class="' + detailClass + '">' + escapeHtml(detailLabel) + '</div>' +
            '</div>' +
            '<div class="tmr-option-odds-wrap"><span class="tmr-option-odds-label">American</span><div class="tmr-option-odds">' + escapeHtml(option.odds_display || 'Manual') + '</div></div>' +
            '</button>';
    }

    function getGroupPrompt(group) {
        const category = getGroupCategory(group);
        if (category === 'game-lines') return 'Spread, moneyline, and game total prices';
        if (category === 'team-totals') return 'Team-specific totals';
        if (category === 'first-5') return 'Early-game lines';
        if (category === 'segments') return 'Segment and period markets';
        if (category === 'alt-lines') return 'Alternate price ladders';
        return 'Additional board markets';
    }

    function renderBoardGroup(group, groupIndex, game, cardIndex) {
        const groupItems = group.items || [];
        const buttons = groupItems.map(function(option, optionIndex) {
            const optionKey = [
                game.id || ('game-' + cardIndex),
                group.key || ('group-' + groupIndex),
                option.id || ('option-' + optionIndex),
                optionIndex
            ].join('|');
            const optionDomId = 'option-' + safeDomId(optionKey);
            return renderBoardOptionButton(option, optionKey, optionDomId, game);
        }).join('');

        if (!buttons) return '';

        return '<div class="tmr-group" data-scope="' + getGroupScope(group) + '" data-category="' + getGroupCategory(group) + '">' +
            '<div class="tmr-group-header"><div class="tmr-group-title"><span>' + escapeHtml(group.label) + '</span><small class="tmr-group-subtitle">' + escapeHtml(getGroupPrompt(group)) + '</small></div><div class="tmr-group-metahead">Selection</div><div class="tmr-group-count">' + groupItems.length + ' prices</div></div>' +
            '<div class="tmr-option-grid">' + buttons + '</div>' +
            '</div>';
    }

    function setBoardFilter(filter) {
        state.activeBoardFilter = filter || null;
        renderBoard(state.currentBoardSummary || null, state.currentBoard || []);
    }

    function renderBoard(summary, games) {
        const container = document.getElementById('gamesListContainer');
        if (!container) return;

        state.currentOptions.clear();
        state.currentBoardSummary = summary || null;
        const bannerClass = summary && summary.severity ? summary.severity : 'info';
        let html = '';

        if (summary) {
            html += '<div class="tmr-board-banner ' + bannerClass + '">' +
                '<div>' + summary.message + '</div>' +
                '<div class="tmr-board-actions"><button class="tmr-board-button" onclick="window.tmrSportsbookRefresh()">Retry Feed</button></div>' +
                '</div>';
        }

        if (!games || games.length === 0) {
            container.innerHTML = html + '<div class="tmr-empty-state">No ' + (state.selectedSport || 'games') + ' games available right now.</div>';
            return;
        }

        const boardCategorySet = new Set();
        (games || []).forEach(function(game) {
            ((game && game.market_groups) || []).forEach(function(group) {
                boardCategorySet.add(getGroupCategory(group));
            });
        });

        const boardTabFilters = getPreferredFilters({ sport_key: SPORT_KEY_MAP[state.selectedSport] || '' }, boardCategorySet);
        const availableBoardFilters = boardTabFilters.filter(function(filter) {
            return boardCategorySet.has(filter);
        });
        const activeBoardFilter = availableBoardFilters.indexOf(state.activeBoardFilter) !== -1
            ? state.activeBoardFilter
            : (availableBoardFilters[0] || 'all');
        state.activeBoardFilter = activeBoardFilter;

        if (boardTabFilters.length) {
            html += '<div class="tmr-board-filter-bar">' +
                '<div class="tmr-board-filter-label">Markets</div>' +
                '<div class="tmr-board-filter-tabs">' +
                boardTabFilters.map(function(filter) {
                    const available = boardCategorySet.has(filter);
                    const classes = 'tmr-board-filter-tab' + (available && filter === activeBoardFilter ? ' active' : '') + (available ? '' : ' disabled');
                    if (!available) {
                        return '<button class="' + classes + '" type="button" data-filter="' + filter + '" disabled aria-disabled="true">' + escapeHtml(getFilterLabel(filter, { sport_key: SPORT_KEY_MAP[state.selectedSport] || '' })) + '</button>';
                    }
                    return '<button class="' + classes + '" type="button" data-filter="' + filter + '" onclick="window.tmrSetBoardFilter(\'' + filter + '\')">' + escapeHtml(getFilterLabel(filter, { sport_key: SPORT_KEY_MAP[state.selectedSport] || '' })) + '</button>';
                }).join('') +
                '</div>' +
                '</div>';
        }

        html += games.map(function(rawGame, index) {
            const game = rawGame;
            const cardId = 'tmr-market-card-' + index;
            const boardNumber = 701 + (index * 2);
            const sourceClass = game.has_sportsbook_odds ? 'real' : 'fallback';
            const sourceText = game.has_sportsbook_odds ? 'Board Live' : 'Manual Board';
            const accent = getSportAccent(game.sport_key);
            const orderedGroups = (game.market_groups || []).slice().sort(function(a, b) {
                const order = { full_game: 1, spread: 2, total: 3, team_totals: 4, first_half: 5, second_half: 6, period_1: 7, first_5: 8, alt_spreads: 9, alt_totals: 10 };
                return (order[a && a.key] || 99) - (order[b && b.key] || 99);
            });
            const cardCategorySet = new Set();
            orderedGroups.forEach(function(group) {
                cardCategorySet.add(getGroupCategory(group));
            });
            const cardTabFilters = getPreferredFilters(game, cardCategorySet).filter(function(filter) {
                return cardCategorySet.has(filter);
            });
            const activeCardFilter = cardCategorySet.has(activeBoardFilter)
                ? activeBoardFilter
                : (cardTabFilters[0] || 'game-lines');
            const groupsHtml = orderedGroups.map(function(group, groupIndex) {
                return renderBoardGroup(group, groupIndex, game, index);
            }).join('');
            const cardTabsHtml = cardTabFilters.length > 1
                ? '<div class="tmr-card-filter-bar"><div class="tmr-card-filter-tabs">' +
                    cardTabFilters.map(function(filter) {
                        const active = filter === activeCardFilter ? ' active' : '';
                        return '<button class="tmr-card-filter-tab' + active + '" type="button" data-filter="' + filter + '" onclick="event.stopPropagation();window.tmrSetCardFilter(\'' + cardId + '\',\'' + filter + '\')">' + escapeHtml(getFilterLabel(filter, game)) + '</button>';
                    }).join('') +
                  '</div></div>'
                : '';

            if (!groupsHtml) {
                return '';
            }

            return '<div class="tmr-market-card' + (index === 0 ? ' open' : '') + '" id="' + cardId + '" data-scope="full" data-market-filter="' + activeCardFilter + '" style="--tmr-accent:' + escapeHtml(accent.primary) + ';--tmr-accent-soft:' + escapeHtml(accent.secondary) + ';">' +
                '<div class="tmr-market-head" onclick="window.tmrToggleCard(\'' + cardId + '\')">' +
                '<div>' +
                '<div class="tmr-market-topline"><span class="tmr-market-league">Game ' + boardNumber + ' • ' + escapeHtml(state.selectedSport || game.sport_title || 'Board') + '</span><span class="tmr-market-status">' + escapeHtml(formatStartsIn(game.commence_time)) + '</span></div>' +
                '<div class="tmr-market-matchup">' +
                '<div class="tmr-team-row"><span class="tmr-team-side">Away</span><span class="tmr-team-abbr">' + escapeHtml(teamBadge(game.away_team)) + '</span><span class="tmr-team-name">' + escapeHtml(game.away_team) + '</span></div>' +
                '<div class="tmr-matchup-divider">@</div>' +
                '<div class="tmr-team-row"><span class="tmr-team-side">Home</span><span class="tmr-team-abbr">' + escapeHtml(teamBadge(game.home_team)) + '</span><span class="tmr-team-name">' + escapeHtml(game.home_team) + '</span></div>' +
                '</div>' +
                '<div class="tmr-market-meta">' +
                '<span class="tmr-market-chip accent">' + escapeHtml(new Date(game.commence_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '</span>' +
                '<span class="tmr-market-chip ' + sourceClass + '">' + sourceText + '</span>' +
                '<span class="tmr-market-chip">Updated ' + escapeHtml(formatTimestamp(game.updated_at)) + '</span>' +
                '</div>' +
                '</div>' +
                '<div class="tmr-market-summary"><div class="tmr-market-count">' + (game.market_groups || []).length + ' markets</div><div class="tmr-market-caret">⌄</div></div>' +
                '</div>' +
                '<div class="tmr-market-body">' + cardTabsHtml + groupsHtml + '</div>' +
                '</div>';
        }).join('');

        container.innerHTML = html;
    }

    function recoverRenderedBoardIfBlank() {
        const container = document.getElementById('gamesListContainer');
        if (!container) return;
        if (!Array.isArray(state.currentBoard) || !state.currentBoard.length) return;
        const hasCards = !!container.querySelector('.tmr-market-card, .market-card, .game-card');
        const hasMeaningfulText = (container.innerText || '').trim().length > 0;
        if (hasCards || hasMeaningfulText) return;
        recordBoardEvent('board_dom_recovered', {
            sport: state.selectedSport || '',
            game_count: state.currentBoard.length
        });
        renderBoard({ severity: 'success', message: '' }, state.currentBoard);
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

    function teamBadge(name) {
        return String(name || '')
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(function(part) { return part.charAt(0); })
            .join('')
            .toUpperCase() || '--';
    }

    function getOptionTag(option, game) {
        const selection = String(option && option.selection || '').toLowerCase();
        const away = String(game && game.away_team || '').toLowerCase();
        const home = String(game && game.home_team || '').toLowerCase();
        if (selection && away && selection.indexOf(away) !== -1) return 'Away';
        if (selection && home && selection.indexOf(home) !== -1) return 'Home';
        if (selection.indexOf('over') !== -1) return 'Over';
        if (selection.indexOf('under') !== -1) return 'Under';
        return option && option.source === 'manual' ? 'Manual' : 'Market';
    }

    function getOptionLineText(option) {
        if (!option) return '';
        if (option.line_display != null && String(option.line_display).trim()) {
            const line = String(option.line_display).trim();
            if (/^[+-]/.test(line)) return line;
            return /^\d/.test(line) ? 'O/U ' + line : line;
        }
        const selectionLabel = String(option.selection_label || '');
        const match = selectionLabel.match(/([+-]\d+(\.\d+)?|\d+(\.\d+)?)$/);
        return match ? match[1] : '';
    }

    function getSportAccent(sportKey) {
        const accents = {
            basketball_nba: { primary: '#f97316', secondary: '#fb923c' },
            basketball_wnba: { primary: '#f59e0b', secondary: '#fbbf24' },
            americanfootball_nfl: { primary: '#22c55e', secondary: '#86efac' },
            icehockey_nhl: { primary: '#38bdf8', secondary: '#7dd3fc' },
            baseball_mlb: { primary: '#10b981', secondary: '#6ee7b7' },
            basketball_ncaab: { primary: '#ef4444', secondary: '#fca5a5' },
            americanfootball_ncaaf: { primary: '#a855f7', secondary: '#d8b4fe' },
            soccer_epl: { primary: '#f43f5e', secondary: '#fda4af' },
            soccer_usa_mls: { primary: '#0ea5e9', secondary: '#7dd3fc' },
            tennis_atp: { primary: '#14b8a6', secondary: '#99f6e4' },
            tennis_wta: { primary: '#ec4899', secondary: '#f9a8d4' }
        };
        return accents[sportKey] || { primary: '#2f8f53', secondary: '#f2c94c' };
    }

    async function selectSportAndShowGames(sport) {
        const requestId = ++latestBoardRequestId;
        state.selectedSport = sport;
        window.TMR = window.TMR || {};
        window.TMR.selectedSport = sport;
        forceSectionActive('picks');
        const sportKey = SPORT_KEY_MAP[sport];
        const container = document.getElementById('gamesListContainer');
        const title = document.getElementById('selectedSportTitle');
        const badge = document.getElementById('gamesCountBadge');
        const cachedBoard = getCachedBoard(sportKey);

        if (title) title.textContent = sport + ' Markets';
        if (container && !cachedBoard) {
            renderBoardLoading(container, sport);
        }
        if (typeof window.showPickStep === 'function') window.showPickStep('gamesListSection');

        // Hard timeout so the loading state can never hang silently if both
        // the primary fetch and the fallback chain stall. After 14s, if this
        // request is still the latest and the board still hasn't rendered,
        // show a real error with a Retry button instead of leaving the user
        // staring at "Loading…" forever (Apr 30 incident).
        var loadingTimeoutTimer = window.setTimeout(function() {
            if (requestId !== latestBoardRequestId) return;
            if (state.lastBoardRenderSport === sport && state.lastBoardRenderAt > Date.now() - 14000) return;
            var c = document.getElementById('gamesListContainer');
            if (!c) return;
            if (c.querySelector('.tmr-board-loading') || c.textContent.indexOf('Loading') !== -1) {
                c.innerHTML = '<div class="tmr-empty-state">Sportsbook feed is taking longer than usual to respond. ' +
                    '<div style="margin-top:12px;"><button class="tmr-board-button" onclick="window.tmrSportsbookRefresh && window.tmrSportsbookRefresh()">Retry</button></div></div>';
            }
        }, 14000);

        if (cachedBoard) {
            renderBoardIfCurrent(requestId, sport, badge, cachedBoard);
        }

        try {
            let response = normalizeBoardResponse(await fetchMarketBoardFast(sportKey, !cachedBoard), sport);
            if ((!response.games || response.games.length === 0) && !cachedBoard) {
                recordBoardEvent('board_empty_initial', {
                    sport: sport,
                    sport_key: sportKey,
                    snapshot: snapshotBoardPayload(response)
                });
                try {
                    const refreshed = normalizeBoardResponse(await fetchMarketBoardFast(sportKey, true), sport);
                    if (refreshed.games && refreshed.games.length) {
                        response = refreshed;
                        recordBoardEvent('board_empty_recovered', {
                            sport: sport,
                            sport_key: sportKey,
                            snapshot: snapshotBoardPayload(refreshed)
                        });
                    }
                } catch (refreshError) {
                    recordBoardEvent('board_empty_refresh_failed', {
                        sport: sport,
                        sport_key: sportKey,
                        message: refreshError && refreshError.message ? refreshError.message : String(refreshError || 'Unknown error')
                    });
                }
            }
            renderBoardIfCurrent(requestId, sport, badge, response);
            window.clearTimeout(loadingTimeoutTimer);
        } catch (error) {
            window.clearTimeout(loadingTimeoutTimer);
            recordBoardEvent('board_primary_failed', {
                sport: sport,
                sport_key: sportKey,
                message: error && error.message ? error.message : String(error || 'Unknown error')
            });
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
                recordBoardEvent('board_odds_fallback_loaded', {
                    sport: sport,
                    sport_key: sportKey,
                    game_count: state.currentBoard.length
                });
                renderBoard({
                    severity: 'warning',
                    message: 'Live fallback markets loaded while the advanced market board is unavailable.'
                }, state.currentBoard);
                return;
            } catch (fallbackError) {
                recordBoardEvent('board_total_failure', {
                    sport: sport,
                    sport_key: sportKey,
                    message: fallbackError && fallbackError.message ? fallbackError.message : String(fallbackError || 'Unknown error')
                });
                if (requestId !== latestBoardRequestId || state.selectedSport !== sport) return;
                if (container && !cachedBoard) {
                    container.innerHTML = '<div class="tmr-empty-state">Unable to load markets right now. ' +
                        '<div style="margin-top:12px;"><button class="tmr-board-button" onclick="window.tmrSportsbookRefresh()">Retry</button></div></div>';
                }
            }
        }
    }

    window.__tmrSelectSportBoard = selectSportAndShowGames;

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

        // CRITICAL fix Apr 30 2026: flip #pickDetails into "has-selection"
        // mode. Without this, the desktop two-column layout (.picks-board-row
        // grid w/ #gamesListSection + #pickDetails sticky right rail) keeps
        // the bet form, summary, and submit button hidden because the CSS
        // gate `#pickDetails.has-selection` never fires. Visible symptom:
        // user clicks an odds button on the MLB board, nothing appears, slip
        // stays in its empty-state placeholder ("Tap a price on the board")
        // even though the underlying form fields were populated. Same path
        // for every sport — fix lives here so every selectOption caller
        // (bridge, ESPN, market_groups, team-totals) gets it.
        const pickDetailsEl = document.getElementById('pickDetails');
        if (pickDetailsEl) pickDetailsEl.classList.add('has-selection');

        ensureMetadataFields();

        updateText('summaryGame', option.game.away_team + ' @ ' + option.game.home_team);
        updateText('summaryPick', option.selection_label);
        updateText('summaryOdds', option.odds_display || 'Manual');

        const lineInput = document.getElementById('pickLineInput');
        const oddsInput = document.getElementById('pickOddsInput');
        const marketInput = document.getElementById('pickMarketInput');
        const bookInput = document.getElementById('pickBookInput');
        const timestampInput = document.getElementById('pickTimestampInput');
        syncPickDetailsLayout(option);
        if (lineInput) lineInput.value = option.line_display || '';
        if (oddsInput) oddsInput.value = option.odds != null ? option.odds : '';
        if (marketInput) marketInput.value = option.group_label + ' / ' + getMarketLabel(option.market_type);
        if (bookInput) bookInput.value = option.book_title || '';
        if (timestampInput) timestampInput.value = formatTimestamp(option.source_updated_at);

        // CRITICAL fix Apr 30 2026: populate the VISIBLE lobby pick slip
        // (.sportsbook-ticket-preview aside) for EVERY market type, not
        // just team_totals. The user-visible slip on the lobby was stuck
        // at "0 Picks / No picks selected yet" because spread / ML / total
        // / over / under clicks filled the hidden #pickDetails form but
        // never touched the aside the user is actually looking at. The
        // _ttPopulateSlip helper repaints the aside in place with the
        // selection summary + a working "Lock Pick" button — and writes
        // through to window.TMR.currentSelectedPick so window.lockInPick()
        // submits the right thing. Same path for every sport.
        if (window.TMR && typeof window.TMR._ttPopulateSlip === 'function') {
            try {
                const label = String(option.selection_label || option.selection || '');
                const market = option.market_type || '';
                const game = option.game || {};
                const awayTeam = game.away_team || '';
                const homeTeam = game.home_team || '';

                // Map (market_type, label) -> ({betType, displayTeam, sideLabel}) for
                // the slip headline. Match the labels selectGameBet legacy bridge uses.
                let betType = 'ml';
                let displayTeam = '';
                let sideLabel = '';
                switch (market) {
                    case 'team_totals':
                        betType = /under/i.test(label) ? 'teamunder' : 'teamover';
                        displayTeam = label.replace(/\s*(Over|Under).*$/i, '').trim() || homeTeam || awayTeam;
                        sideLabel = /under/i.test(label) ? 'Under' : 'Over';
                        break;
                    case 'totals':
                        betType = /under/i.test(label) ? 'under' : 'over';
                        displayTeam = '';
                        sideLabel = /under/i.test(label) ? 'Under' : 'Over';
                        break;
                    case 'f5_totals':
                        betType = /under/i.test(label) ? 'f5under' : 'f5over';
                        displayTeam = '';
                        sideLabel = /under/i.test(label) ? 'F5 Under' : 'F5 Over';
                        break;
                    case 'spreads':
                        betType = 'spread';
                        displayTeam = option.selection || label.split(' ')[0] || '';
                        sideLabel = '';
                        break;
                    case 'f5_spreads':
                        betType = 'f5spread';
                        displayTeam = option.selection || '';
                        sideLabel = 'F5';
                        break;
                    case 'h2h':
                        betType = 'ml';
                        displayTeam = option.selection || '';
                        sideLabel = 'ML';
                        break;
                    case 'f5_h2h':
                        betType = 'f5ml';
                        displayTeam = option.selection || '';
                        sideLabel = 'F5 ML';
                        break;
                    default:
                        betType = 'ml';
                        displayTeam = option.selection || '';
                        sideLabel = '';
                }

                window.TMR._ttPopulateSlip({
                    gameIndex: null,
                    betType: betType,
                    team: displayTeam,
                    line: option.line != null ? option.line : (parseFloat(option.line_display) || null),
                    odds: option.odds,
                    awayTeam: awayTeam,
                    homeTeam: homeTeam,
                    sport: (window.TMR && window.TMR.selectedSport) || '',
                    market: option.group_label || sideLabel || 'Pick',
                    marketType: market,
                    book: option.book_title || '',
                    gameTime: game.commence_time || null,
                    gameId: option.game_id || game.id || null,
                    game: game
                });
            } catch (e) {
                console.warn('[TMR][slip] _ttPopulateSlip wiring failed:', e && e.message);
            }
        }

        // showPickStep would HIDE the lobby (#sportSelection) and the lobby
        // slip the user is actually looking at, then "advance" them to
        // #pickDetails which on desktop is below the fold and on mobile is
        // a fresh screen. Skip it — the lobby slip is now repainted in place
        // by _ttPopulateSlip above, which is what the user actually sees.
        // (Old behavior is preserved when an explicit caller sets
        // __suppressPickStep=false AND we're already past the lobby.)
        if (!(window.TMR && window.TMR.__suppressPickStep) && typeof window.showPickStep === 'function') {
            const lobbyActive = !!document.querySelector('#sportSelection.active');
            if (!lobbyActive) {
                window.showPickStep('pickDetails');
            }
        }
    }

    function updatePickSummary() {
        if (!state.selectedOption) return;
        const lineInput = document.getElementById('pickLineInput');
        const oddsInput = document.getElementById('pickOddsInput');
        const lineValue = lineInput ? lineInput.value.trim() : '';
        const oddsValue = oddsInput ? oddsInput.value.trim() : '';
        const summaryText = state.selectedOption.selection_label || state.selectedOption.selection || 'Pick';
        updateText('summaryPick', lineValue && summaryText.indexOf(lineValue) === -1 ? (summaryText + ' (' + lineValue + ')') : summaryText);
        updateText('summaryOdds', oddsValue || 'Manual');
    }

    // Inline error rendering for the pick slip. Replaces the legacy alert()
    // pop-ups so a failed lock surfaces inside the slip itself, where the
    // user is already looking. Cleared on the next click of any odds button
    // and on every fresh lockInPick attempt.
    function showPickSlipError(message) {
        const slip = document.getElementById('pickDetails') || document.body;
        let box = document.getElementById('pickSlipError');
        if (!box) {
            box = document.createElement('div');
            box.id = 'pickSlipError';
            box.setAttribute('role', 'alert');
            box.style.cssText = 'margin:10px 0;padding:12px 14px;border-radius:10px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.55);color:#fecaca;font-size:13.5px;line-height:1.45;';
            const submitBtn = document.getElementById('submitPickBtn') || document.querySelector('#pickDetails button[type="submit"]') || slip.firstElementChild;
            if (submitBtn && submitBtn.parentNode) {
                submitBtn.parentNode.insertBefore(box, submitBtn);
            } else {
                slip.appendChild(box);
            }
        }
        box.textContent = message;
        box.style.display = 'block';
    }

    function showPickSlipSuccess(title, message) {
        const slip = document.getElementById('pickDetails') || document.body;
        let box = document.getElementById('pickSlipSuccess');
        if (!box) {
            box = document.createElement('div');
            box.id = 'pickSlipSuccess';
            box.setAttribute('role', 'status');
            box.style.cssText = 'margin:10px 0;padding:14px 16px;border-radius:10px;background:rgba(34,197,94,0.14);border:1px solid rgba(34,197,94,0.62);color:#dcfce7;font-size:14px;line-height:1.45;';
            const submitBtn = document.getElementById('submitPickBtn') || document.getElementById('ttSlipSubmit') || document.querySelector('#pickDetails button[type="submit"]') || slip.firstElementChild;
            if (submitBtn && submitBtn.parentNode) {
                submitBtn.parentNode.insertBefore(box, submitBtn);
            } else {
                slip.appendChild(box);
            }
        }
        box.innerHTML = '<strong style="display:block;color:#bbf7d0;font-size:15px;margin-bottom:3px;">' + escapeHtml(title) + '</strong><span>' + escapeHtml(message) + '</span>';
        box.style.display = 'block';
    }

    function clearPickSlipError() {
        const box = document.getElementById('pickSlipError');
        if (box) box.style.display = 'none';
        const success = document.getElementById('pickSlipSuccess');
        if (success) success.style.display = 'none';
    }

    // Reset every "Locking…" / disabled submit button across the page back
    // to its labelled, clickable state. The ttSlipSubmit handler in
    // sportsbook/index.html sets `Locking…` synchronously and never awaits
    // lockInPick, so without an unconditional reset the team-totals submit
    // button hangs on "Locking…" forever after the first click. Called from
    // every early return AND from the finally-block of the API try/catch.
    function resetLockButtons() {
        const list = [
            document.getElementById('ttSlipSubmit'),
            document.getElementById('submitPickBtn')
        ].filter(Boolean);
        try {
            document.querySelectorAll('button.submit-pick-btn, button.lock-pick-btn, [data-lock-pick-btn]').forEach(function (b) { list.push(b); });
        } catch (_) {}
        list.forEach(function (btn) {
            try {
                btn.disabled = false;
                btn.removeAttribute('disabled');
                if (/locking/i.test(btn.textContent || '')) {
                    btn.textContent = btn.getAttribute('data-original-label') || 'Lock Pick';
                }
            } catch (_) {}
        });
    }

    async function lockInPick() {
        // Re-entry guard: a user hammering the Lock Pick button (or a double
        // event listener fired from a touch device) used to queue a fresh
        // POST /api/picks for every click. Backend has a partial unique
        // index so dupes never persist, but the wasted requests caused the
        // JS sim to flag 5 createPick calls in a row. Block re-entry while
        // a request is mid-flight; the finally{} below clears the flag.
        if (window.__tmrLockInFlight) {
            try { console.info('[TMR submit] re-entry blocked (lock already in flight).'); } catch (_) {}
            return;
        }
        window.__tmrLockInFlight = true;
        clearPickSlipError();
        showSubmitTrace('lockInPick started.');
        const option = state.selectedOption;
        if (!option) {
            showSubmitTrace('Submit stopped: no selected option in state.');
            showPickSlipError('Select a market before submitting a pick.');
            resetLockButtons();
            window.__tmrLockInFlight = false;
            return;
        }

        if (!option.game_id || /unknown/i.test(String(option.game_id))) {
            showSubmitTrace('Submit stopped: selected option is missing game_id.');
            showPickSlipError('That market is missing its game ID. Refresh the board (Ctrl-F5) and re-select the bet.');
            resetLockButtons();
            window.__tmrLockInFlight = false;
            return;
        }

        if (hasGameStarted(option.game)) {
            showSubmitTrace('Submit stopped: selected game has already started locally.');
            showPickSlipError('This game has already started, so picks are locked.');
            resetLockButtons();
            window.__tmrLockInFlight = false;
            return;
        }

        showSubmitTrace('Checking account access for ' + option.market_type + ' / ' + option.game_id + '.');
        const allowed = await ensurePicksAccess();
        if (!allowed) {
            showSubmitTrace('Submit stopped: account access check failed.');
            resetLockButtons();
            window.__tmrLockInFlight = false;
            return;
        }

        const oddsInput = document.getElementById('pickOddsInput');
        const lineInput = document.getElementById('pickLineInput');
        const unitsInput = document.getElementById('unitsInput');
        const bookInput = document.getElementById('pickBookInput');
        const reasoningInput = document.getElementById('pickReasoning');

        const oddsValue = oddsInput ? parseInt(oddsInput.value, 10) : NaN;
        const lineValue = lineInput && lineInput.value !== '' ? parseFloat(lineInput.value) : null;
        const unitsRaw = unitsInput ? parseFloat(unitsInput.value || '1') : 1;
        // Frontend hard-cap: units must be a whole number in [1, 5]. Backend
        // enforces the same range, but clamping here gives the user
        // immediate feedback and prevents a wasted API round trip on a 6u
        // typo.
        const unitsValue = Math.max(1, Math.min(5, Math.round(Number.isFinite(unitsRaw) ? unitsRaw : 1)));
        if (unitsInput && String(unitsValue) !== String(unitsInput.value)) {
            unitsInput.value = String(unitsValue);
        }
        const submittedSelection = buildSubmittedSelection(option, lineValue);

        if (Number.isNaN(oddsValue) || (oddsValue > -100 && oddsValue < 100)) {
            showSubmitTrace('Submit stopped: invalid odds value.');
            showPickSlipError('Enter valid American odds like -110 or +150.');
            resetLockButtons();
            window.__tmrLockInFlight = false;
            return;
        }

        if (option.market_type === 'team_totals') {
            if (!/\b(over|under)\b/i.test(submittedSelection) || lineValue == null) {
                showSubmitTrace('Submit stopped: incomplete team total payload.');
                showPickSlipError('This team total is missing its side or line. Reselect the market and try again.');
                resetLockButtons();
                window.__tmrLockInFlight = false;
                return;
            }
        }

        if (window.api && typeof window.api.loadTokens === 'function') {
            try { window.api.loadTokens(); } catch (error) {}
        }

        let finalPayload = null;
        try {
            const api = await getApiClientOrFallback();
            await ensureBackendAccessToken(api);
            showSubmitTrace('Submitting pick to API: ' + option.game_id + ' / ' + option.market_type + '.');
            const payload = {
                game_id: option.game_id,
                external_game_id: option.game_id,
                sport_key: option.sport_key,
                market_type: option.market_type,
                selection: submittedSelection,
                selection_label: option.selection_label || submittedSelection,
                line_snapshot: lineValue,
                odds_snapshot: oddsValue,
                units: unitsValue,
                book_title: bookInput ? bookInput.value.trim() : option.book_title,
                book_key: option.book_key,
                market_key: option.market_key,
                market_label: option.group_label,
                source_type: option.source,
                source_updated_at: option.source_updated_at,
                game_snapshot: buildSubmittedGameSnapshot(option),
                reasoning: reasoningInput ? reasoningInput.value.trim() : ''
            };
            finalPayload = payload;
            try { console.info('[TMR][lockInPick] final payload', payload); } catch (_) {}
            const response = await api.createPick(payload);

            showSubmitTrace('API saved pick. Refreshing pick history.');
            await fetchCurrentUserPicks();
            syncRecordWidgets(state.currentUserPicks);
            const savedSelectionLabel = option.selection_label || submittedSelection || 'Pick';
            updateText('confirmPickDetail', savedSelectionLabel + ' (' + (oddsValue > 0 ? '+' : '') + oddsValue + ')');
            const responseGame = response && response.pick && response.pick.game ? response.pick.game : null;
            const metaGame = option.game || responseGame || {};
            const awayTeam = metaGame.away_team || option.away_team || '';
            const homeTeam = metaGame.home_team || option.home_team || '';
            const confirmationTitle = document.querySelector('#pickConfirmation h3');
            if (confirmationTitle) confirmationTitle.textContent = 'Pick Locked In';
            updateText('confirmPickMeta', 'Your pick has been saved to your permanent public record.' + (awayTeam && homeTeam ? ' ' + awayTeam + ' @ ' + homeTeam + ' | Status: pending' : ''));
            showPickSlipSuccess('Pick Locked In', 'Your pick has been saved to your permanent public record.');
            if (typeof window.showPickStep === 'function') window.showPickStep('pickConfirmation');
            showSubmitTrace('Pick saved and confirmation shown.');
        } catch (error) {
            const raw = String(error && error.message || 'Unknown error');
            const status = error && error.status;
            const data = error && error.data;
            // Diagnostic dump: show exactly what was sent and what the backend
            // said. This is intentionally verbose so the user can copy the
            // text and a maintainer can see status code + game_id + sport_key
            // in one shot. Replaces the prior "friendly" string which hid the
            // info needed to debug a real "Game not found" 404.
            const dumped = [
                'status=' + (status || 'n/a'),
                'msg=' + raw,
                'game_id=' + (option.game_id || ''),
                'sport_key=' + (option.sport_key || ''),
                'market=' + (option.market_type || ''),
                'sel=' + (submittedSelection || option.selection || ''),
                'line=' + (lineValue == null ? '' : lineValue),
                'odds=' + (Number.isNaN(oddsValue) ? '' : oddsValue),
                'payload=' + (finalPayload ? JSON.stringify(finalPayload) : 'not-built')
            ].join(' | ');
            try { console.error('[TMR][lockInPick] failure', { error, option, data }); } catch (e) {}
            showSubmitTrace('Submit failed: ' + dumped);
            showPickSlipError('Pick Not Submitted. Something went wrong. Please try again.');
        } finally {
            resetLockButtons();
            window.__tmrLockInFlight = false;
        }
    }

    function buildSubmittedSelection(option, lineValue) {
        if (!option || option.market_type !== 'team_totals') {
            return option && option.selection ? option.selection : '';
        }

        const visible = String(option.selection_label || option.selection || '').trim();
        const sideMatch = visible.match(/\b(Over|Under)\b/i);
        const side = sideMatch ? (sideMatch[1][0].toUpperCase() + sideMatch[1].slice(1).toLowerCase()) : '';
        const team = String(option.selection || visible)
            .replace(/\s+\b(over|under)\b.*$/i, '')
            .trim();
        const line = lineValue != null && Number.isFinite(Number(lineValue)) ? String(Number(lineValue)) : '';
        if (team && side && line) return team + ' ' + side + ' ' + line;
        if (team && side) return team + ' ' + side;
        return visible || team;
    }

    function buildSubmittedGameSnapshot(option) {
        const game = option && option.game ? option.game : {};
        return {
            id: option.game_id || game.id || null,
            sport_key: option.sport_key || game.sport_key || null,
            sport_title: game.sport_title || null,
            home_team: game.home_team || option.home_team || null,
            away_team: game.away_team || option.away_team || null,
            commence_time: game.commence_time || option.commence_time || null,
            updated_at: game.updated_at || option.source_updated_at || null,
            bookmakers: Array.isArray(game.bookmakers) ? game.bookmakers : []
        };
    }

    // Clear inline error whenever the user picks a new market.
    document.addEventListener('click', function (ev) {
        const btn = ev.target && ev.target.closest && ev.target.closest('.odds-btn, .market-card, [data-tt-direct-click], [data-bet-type]');
        if (btn) clearPickSlipError();
    }, true);

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
            const renderedRecently = state.lastBoardRenderSport === state.selectedSport &&
                state.lastBoardRenderAt &&
                (Date.now() - state.lastBoardRenderAt) < MIN_VISIBLE_REFRESH_GAP_MS;
            if (renderedRecently) {
                recordBoardEvent('board_refresh_skipped_recent', {
                    sport: state.selectedSport,
                    age_ms: Date.now() - state.lastBoardRenderAt
                });
                return;
            }
            await selectSportAndShowGames(state.selectedSport);
        }
    }

    function setSportsbookTabActive(activeButton) {
        document.querySelectorAll('[data-sportsbook-tab]').forEach(function(button) {
            button.classList.toggle('active', button === activeButton);
        });
    }

    function renderPromoNotes() {
        const list = document.getElementById('promoNotesList');
        if (!list) return;
        let notes = [];
        try {
            notes = JSON.parse(localStorage.getItem('tmr_promo_notes') || '[]');
        } catch (error) {
            notes = [];
        }

        list.innerHTML = notes.length
            ? notes.map(function(note) {
                return '<div class="tmr-empty-state" style="text-align:left;margin-bottom:10px;">' +
                    '<strong>' + escapeHtml(note.book || 'Sportsbook') + '</strong><br>' +
                    '<span>' + escapeHtml(note.offer || 'Offer') + '</span><br>' +
                    '<small>' + escapeHtml(note.notes || '') + '</small>' +
                    '</div>';
            }).join('')
            : '<div class="tmr-empty-state">No saved promo notes yet. Use this panel to track real sportsbook offers and your plan for attacking them.</div>';
    }

    function addPromoNote() {
        const book = document.getElementById('promoBook');
        const offer = document.getElementById('promoOffer');
        const notes = document.getElementById('promoNotes');
        const record = {
            book: book ? book.value.trim() : '',
            offer: offer ? offer.value.trim() : '',
            notes: notes ? notes.value.trim() : '',
            created_at: new Date().toISOString()
        };
        if (!record.book && !record.offer && !record.notes) {
            alert('Enter a sportsbook, offer, or note before saving.');
            return;
        }

        let saved = [];
        try {
            saved = JSON.parse(localStorage.getItem('tmr_promo_notes') || '[]');
        } catch (error) {
            saved = [];
        }
        saved.unshift(record);
        localStorage.setItem('tmr_promo_notes', JSON.stringify(saved.slice(0, 25)));
        if (book) book.value = '';
        if (offer) offer.value = '';
        if (notes) notes.value = '';
        renderPromoNotes();
    }

    async function renderConsensusPanel() {
        const panel = document.getElementById('consensusPicksPanel');
        if (!panel) return;

        let picks = [];
        try {
            picks = await fetchCurrentUserPicks();
        } catch (error) {
            picks = [];
        }

        const settled = picks.map(normalizePick).filter(function(pick) {
            return pick.selection && pick.status !== 'pending';
        });

        if (!settled.length) {
            panel.innerHTML = '<div class="tmr-empty-state">Consensus appears once settled picks create a real sample of graded positions.</div>';
            return;
        }

        const clusters = new Map();
        settled.forEach(function(pick) {
            const key = [
                pick.sport_key || '',
                pick.away_team || '',
                pick.home_team || '',
                pick.market_type || '',
                pick.selection || '',
                pick.line_snapshot == null ? '' : pick.line_snapshot
            ].join('|');
            const existing = clusters.get(key) || {
                count: 0,
                wins: 0,
                losses: 0,
                pushes: 0,
                units: 0,
                label: pick.selection + (pick.line_snapshot != null ? ' ' + pick.line_snapshot : ''),
                matchup: (pick.away_team || '') + ' @ ' + (pick.home_team || ''),
                market: getMarketLabel(pick.market_type)
            };
            existing.count += 1;
            if (pick.status === 'won') existing.wins += 1;
            if (pick.status === 'lost') existing.losses += 1;
            if (pick.status === 'push') existing.pushes += 1;
            existing.units += parseFloat(pick.result_units || 0);
            clusters.set(key, existing);
        });

        const rows = Array.from(clusters.values()).sort(function(a, b) {
            return b.count - a.count || b.units - a.units;
        }).slice(0, 8);

        panel.innerHTML = rows.map(function(row) {
            const decisions = row.wins + row.losses;
            const winRate = decisions ? Math.round((row.wins / decisions) * 100) + '%' : '0%';
            const units = (row.units >= 0 ? '+' : '') + row.units.toFixed(2) + 'u';
            return '<div class="tmr-empty-state" style="text-align:left;margin-bottom:10px;">' +
                '<strong>' + escapeHtml(row.label) + '</strong>' +
                '<div style="margin-top:4px;">' + escapeHtml(row.matchup) + ' | ' + escapeHtml(row.market) + '</div>' +
                '<div style="margin-top:8px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">' +
                row.count + ' loaded pick' + (row.count === 1 ? '' : 's') + ' | ' +
                row.wins + '-' + row.losses + '-' + row.pushes + ' | ' +
                winRate + ' | ' + units +
                '</div>' +
                '</div>';
        }).join('');
    }

    function wireSportsbookTabs() {
        document.querySelectorAll('[data-sportsbook-tab]').forEach(function(button) {
            if (button.__tmrSportsbookTabWired) return;
            button.__tmrSportsbookTabWired = true;
            button.addEventListener('click', function(event) {
                event.preventDefault();
                const tab = button.getAttribute('data-sportsbook-tab');
                setSportsbookTabActive(button);

                if (tab === 'sport') {
                    const sport = button.getAttribute('data-sport') || 'MLB';
                    ensurePicksAccess().then(function(allowed) {
                        if (!allowed) return;
                        if (typeof window.showSection === 'function') window.showSection('picks');
                        selectSportAndShowGames(sport).catch(function() {});
                    });
                    return;
                }

                if (tab === 'picks') {
                    ensurePicksAccess().then(function(allowed) {
                        if (!allowed) return;
                        if (typeof window.showSection === 'function') window.showSection(tab);
                    });
                    return;
                }

                if (typeof window.showSection === 'function') window.showSection(tab);
                if (tab === 'promos') renderPromoNotes();
                if (tab === 'consensus') renderConsensusPanel();
            });
        });
    }

    function redirectLegacySportsbookSection(sectionId) {
        const routeMap = {
            feed: 'feed.html',
            forums: 'forum.html',
            arena: 'arena.html',
            trivia: 'trivia.html',
            'polls-trivia': 'hangout.html',
            predictions: 'hangout.html',
            contests: 'arena.html',
            profile: 'profile.html',
            messages: 'messages.html',
            groups: 'friends.html',
            marketplace: 'premium.html',
            premium: 'premium.html'
        };
        const route = routeMap[sectionId];
        if (!route) return false;
        window.location.href = route;
        return true;
    }

    function isPicksBoardVisible() {
        const picksSection = document.getElementById('picks');
        const gamesListStep = document.getElementById('gamesListSection');
        return !!(
            picksSection &&
            picksSection.classList.contains('active') &&
            gamesListStep &&
            gamesListStep.classList.contains('active')
        );
    }

    function startLiveRefreshLoop() {
        if (window.__tmrSportsbookRefreshTimer) return;
        window.__tmrSportsbookRefreshTimer = window.setInterval(function() {
            if (document.hidden || !state.selectedSport || !isPicksBoardVisible()) return;
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
        pinRequestedAuthSection();
        pinPicksSectionIfRequested();
        wireSportPrefetch();
        wireSportsbookTabs();
        window.tmrAddPromoNote = addPromoNote;
        window.tmrRenderConsensusPanel = renderConsensusPanel;
        window.setInterval(recoverRenderedBoardIfBlank, 1000);

        window.tmrToggleCard = toggleCard;
        window.tmrSetCardScope = setCardScope;
        window.tmrSetCardFilter = setCardFilter;
        window.tmrSetBoardFilter = setBoardFilter;
        window.tmrSelectOption = selectOption;
        window.tmrSportsbookRefresh = refreshCurrentSport;
        window.tmrDumpBoardDiagnostics = function() {
            return boardDiagnostics.slice();
        };
        lockFunction(window, 'selectSportAndShowGames', selectSportAndShowGames);
        lockFunction(window, 'submitPick', lockInPick);
        lockFunction(window, 'lockInPick', lockInPick);
        window.__tmrProductionLockInPick = lockInPick;

        // Bridge: the legacy team-totals / F5 / fallback renderers in
        // sportsbook/index.html still emit odds buttons that call
        // window.selectGameBet(gameIndex, betType, team, line, odds,
        // awayTeam, homeTeam). Previously this was a no-op stub, so
        // every Team Totals click silently did nothing — user couldn't
        // submit a team-total pick. Route legacy clicks through the
        // canonical selectOption flow instead by synthesizing a
        // production-fix option object and registering it in
        // state.currentOptions.
        window.selectGameBet = function(gameIndex, betType, team, line, odds, awayTeam, homeTeam) {
            try {
                var board = state.currentBoard || [];
                var tmrGames = (window.TMR && Array.isArray(window.TMR.currentGames)) ? window.TMR.currentGames : [];
                var game = board[gameIndex] || tmrGames[gameIndex] || null;
                if (!game) {
                    var sportKeyMap = (window.TMR && window.TMR.sportKeyMap) || {};
                    var sportDisplay = (window.TMR && window.TMR.selectedSport) || state.selectedSport || '';
                    game = {
                        id: 'legacy_' + String(awayTeam || '').replace(/\s+/g, '_') + '_at_' + String(homeTeam || '').replace(/\s+/g, '_'),
                        sport_key: sportKeyMap[sportDisplay] || sportDisplay || '',
                        home_team: homeTeam || '',
                        away_team: awayTeam || '',
                        commence_time: new Date().toISOString(),
                        _bookTitle: 'Sportsbook feed',
                        _bookKey: ''
                    };
                }

                if (hasGameStarted(game)) {
                    showSubmitTrace('Selection blocked: game already started (' + (game.id || 'unknown') + ').');
                    showPickSlipError('This game has already started, so picks are locked.');
                    return;
                }

                var rawLine = (line === '' || line === 'ML' || line === 'Pick' || line == null) ? null : line;
                var lineNum = rawLine == null ? null : parseFloat(rawLine);
                if (lineNum != null && isNaN(lineNum)) lineNum = null;
                var oddsNum = (odds === '' || odds == null) ? null : parseInt(odds, 10);
                if (oddsNum != null && isNaN(oddsNum)) oddsNum = null;

                var marketType = 'h2h';
                var groupLabel = 'Full Game';
                var selection = team || '';
                var selectionLabel = team || '';
                var teamRaw = String(team || '').trim();

                switch (betType) {
                    case 'teamover': {
                        marketType = 'team_totals';
                        groupLabel = 'Team Totals';
                        // The legacy renderer passes "<TeamName> Over"
                        // for the team arg. Strip the suffix so the
                        // backend gets a clean selection that matches
                        // its team_totals contract (team name + side
                        // is encoded by the market_type + line).
                        var teamOver = teamRaw.replace(/\s+over\s*$/i, '').trim();
                        selectionLabel = teamOver + ' Over' + (lineNum != null ? ' ' + lineNum : '');
                        selection = selectionLabel;
                        break;
                    }
                    case 'teamunder': {
                        marketType = 'team_totals';
                        groupLabel = 'Team Totals';
                        var teamUnder = teamRaw.replace(/\s+under\s*$/i, '').trim();
                        selectionLabel = teamUnder + ' Under' + (lineNum != null ? ' ' + lineNum : '');
                        selection = selectionLabel;
                        break;
                    }
                    case 'over':
                        marketType = 'totals'; groupLabel = 'Game Total';
                        selection = 'Over';
                        selectionLabel = 'Over' + (lineNum != null ? ' ' + lineNum : '');
                        break;
                    case 'under':
                        marketType = 'totals'; groupLabel = 'Game Total';
                        selection = 'Under';
                        selectionLabel = 'Under' + (lineNum != null ? ' ' + lineNum : '');
                        break;
                    case 'spread':
                        marketType = 'spreads'; groupLabel = 'Full Game';
                        selection = teamRaw;
                        selectionLabel = teamRaw + (lineNum != null ? ' ' + (lineNum > 0 ? '+' : '') + lineNum : '');
                        break;
                    case 'ml':
                        marketType = 'h2h'; groupLabel = 'Full Game';
                        selection = teamRaw;
                        selectionLabel = teamRaw + ' ML';
                        break;
                    case 'f5over':
                        marketType = 'f5_totals'; groupLabel = 'First 5';
                        selection = 'Over';
                        selectionLabel = 'F5 Over' + (lineNum != null ? ' ' + lineNum : '');
                        break;
                    case 'f5under':
                        marketType = 'f5_totals'; groupLabel = 'First 5';
                        selection = 'Under';
                        selectionLabel = 'F5 Under' + (lineNum != null ? ' ' + lineNum : '');
                        break;
                    case 'f5spread':
                        marketType = 'f5_spreads'; groupLabel = 'First 5';
                        selection = teamRaw;
                        selectionLabel = teamRaw + ' F5' + (lineNum != null ? ' ' + (lineNum > 0 ? '+' : '') + lineNum : '');
                        break;
                    case 'f5ml':
                        marketType = 'f5_h2h'; groupLabel = 'First 5';
                        selection = teamRaw;
                        selectionLabel = teamRaw + ' F5 ML';
                        break;
                }

                var option = createFallbackOption(
                    game,
                    gameIndex,
                    groupLabel,
                    marketType,
                    selection,
                    selectionLabel,
                    oddsNum,
                    lineNum,
                    game._bookTitle || 'Sportsbook feed',
                    'sportsbook'
                );
                var key = 'legacy-' + (option.id || (marketType + '-' + selection)) + '-' + Date.now();
                var registered = Object.assign({
                    game: game,
                    _domId: key,
                    _optionKey: key
                }, option);
                state.currentOptions.set(key, registered);
                selectOption(key);
            } catch (err) {
                console.error('[TMR] selectGameBet bridge failed:', err);
            }
        };
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
                if (redirectLegacySportsbookSection(sectionId)) return;
                if (sectionId === 'picks') {
                    ensurePicksAccess().then(function(allowed) {
                        if (!allowed) return;
                        originalShowSection(sectionId);
                    });
                    return;
                }
                originalShowSection(sectionId);
                if (sectionId === 'mypicks') {
                    loadMyPicks(window.currentPicksTab || 'pending');
                } else if (sectionId === 'my-record' || sectionId === 'profile') {
                    loadMyRecordPage();
                } else if (sectionId === 'promos') {
                    renderPromoNotes();
                } else if (sectionId === 'consensus') {
                    renderConsensusPanel();
                }
            };
        }

        fetchCurrentUserPicks().then(syncRecordWidgets).catch(function() {});
        prewarmCoreBoards();
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
