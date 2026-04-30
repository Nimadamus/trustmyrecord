/**
 * TrustMyRecord Backend API Client
 * Connects frontend to Node.js/Express backend
 */

class TrustMyRecordAPI {
    constructor() {
        this.baseUrl = CONFIG?.api?.baseUrl || 'https://trustmyrecord-api.onrender.com/api';
        this.token = null;
        this.refreshToken = null;
        this.backendAvailable = null; // null = not checked, true/false
        this.loadTokens();
        // Store the detection promise so callers can await it
        this.ready = this.detectBackend();
    }

    getCandidateBaseUrls(preferredUrl) {
        const urls = [];
        const pushUrl = (value) => {
            if (value && !urls.includes(value)) urls.push(value);
        };

        pushUrl(preferredUrl);
        pushUrl(this.baseUrl);
        pushUrl(CONFIG?.api?.baseUrl);

        const fallbackUrls = CONFIG?.api?.fallbackUrls || [];
        fallbackUrls.forEach(pushUrl);

        return urls;
    }

    // Auto-detect which backend URL is reachable
    // Render free tier cold-starts can take 30-60s, so we retry
    async detectBackend() {
        const urls = [this.baseUrl, ...(CONFIG?.api?.fallbackUrls || [])];
        const maxAttempts = 3;
        const attemptTimeout = 15000; // 15s per attempt (covers cold-start)

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            for (const url of urls) {
                try {
                    const headers = {};
                    if (url.includes('loca.lt')) {
                        headers['bypass-tunnel-reminder'] = 'true';
                    }
                    const res = await fetch(url + '/health', {
                        signal: AbortSignal.timeout(attemptTimeout),
                        headers
                    });
                    if (res.ok) {
                        const data = await res.json().catch(() => null);
                        if (data && data.status === 'ok') {
                            this.baseUrl = url;
                            this.backendAvailable = true;
                            this.isLocaltunnel = url.includes('loca.lt');
                            console.log('[TMR API] Backend detected at:', url, `(attempt ${attempt})`);
                            return;
                        }
                    }
                } catch (e) { /* try next */ }
            }
            if (attempt < maxAttempts) {
                console.log(`[TMR API] Backend not ready, retrying (${attempt}/${maxAttempts})...`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
        this.backendAvailable = false;
        console.warn('[TMR API] No backend available after retries.');
    }

    // Token Management
    loadTokens() {
        this.token = localStorage.getItem('trustmyrecord_token') ||
            localStorage.getItem('accessToken') ||
            localStorage.getItem('access_token') ||
            localStorage.getItem('token') ||
            localStorage.getItem('tmr_token') ||
            null;
        this.refreshToken = localStorage.getItem('trustmyrecord_refresh_token') ||
            localStorage.getItem('refreshToken') ||
            localStorage.getItem('accessRefreshToken') ||
            localStorage.getItem('tmr_refresh_token') ||
            localStorage.getItem('refresh_token') ||
            null;
    }

    saveTokens(token, refreshToken) {
        this.token = token;
        this.refreshToken = refreshToken || null;
        if (token) {
            localStorage.setItem('trustmyrecord_token', token);
            localStorage.setItem('accessToken', token);
            localStorage.setItem('access_token', token);
            localStorage.setItem('token', token);
            localStorage.setItem('tmr_token', token);
        } else {
            localStorage.removeItem('trustmyrecord_token');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('access_token');
            localStorage.removeItem('token');
            localStorage.removeItem('tmr_token');
        }
        if (refreshToken) {
            localStorage.setItem('trustmyrecord_refresh_token', refreshToken);
            localStorage.setItem('refreshToken', refreshToken);
            localStorage.setItem('refresh_token', refreshToken);
            localStorage.setItem('tmr_refresh_token', refreshToken);
        } else {
            localStorage.removeItem('trustmyrecord_refresh_token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('tmr_refresh_token');
        }
    }

    clearFrontendSession() {
        this._cachedUser = null;

        try {
            if (typeof window !== 'undefined' && window.auth && typeof window.auth.clearSession === 'function') {
                window.auth.clearSession();
            }
        } catch (error) {
            console.warn('[TMR API] Failed to clear auth session via auth system:', error);
        }

        [
            'trustmyrecord_session',
            'tmr_current_user',
            'currentUser',
            'trustmyrecord_remember',
            'tmr_is_logged_in'
        ].forEach((key) => {
            try {
                localStorage.removeItem(key);
            } catch (error) {}
        });

        try {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('tmr-auth-changed', {
                    detail: { loggedIn: false, user: null }
                }));
            }
        } catch (error) {}
    }

    clearTokens() {
        this.token = null;
        this.refreshToken = null;
        this._cachedUser = null;
        localStorage.removeItem('trustmyrecord_token');
        localStorage.removeItem('trustmyrecord_refresh_token');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('access_token');
        localStorage.removeItem('token');
        localStorage.removeItem('tmr_token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('tmr_refresh_token');
        this.clearFrontendSession();
    }

    getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        // localtunnel bypass header
        if (this.isLocaltunnel) {
            headers['bypass-tunnel-reminder'] = 'true';
        }
        return headers;
    }

    // HTTP Request Helper
    async request(endpoint, options = {}) {
        this.loadTokens();
        const candidateUrls = this.getCandidateBaseUrls();
        let lastError = null;

        for (const baseUrl of candidateUrls) {
            const url = `${baseUrl}${endpoint}`;
            const config = {
                ...options,
                headers: {
                    ...this.getAuthHeaders(),
                    ...(options.headers || {})
                }
            };

            if (config.body && typeof config.body === 'object') {
                config.body = JSON.stringify(config.body);
            }

            try {
                if (!this.token && this.refreshToken) {
                    await this.refreshAccessToken(baseUrl);
                    config.headers = {
                        ...this.getAuthHeaders(),
                        ...(options.headers || {})
                    };
                }

                const requestContext = {
                    sentAuth: !!this.token,
                    refreshAttempted: false
                };

                let response = await fetch(url, config);

                // Handle token expiration
                if (response.status === 401 && this.refreshToken) {
                    requestContext.refreshAttempted = true;
                    const refreshed = await this.refreshAccessToken(baseUrl);
                    if (refreshed) {
                        requestContext.sentAuth = true;
                        response = await fetch(url, {
                            ...config,
                            headers: {
                                ...config.headers,
                                Authorization: `Bearer ${this.token}`
                            }
                        });
                    }
                }

                const data = await this.handleResponse(response, requestContext);
                this.baseUrl = baseUrl;
                this.backendAvailable = true;
                this.isLocaltunnel = baseUrl.includes('loca.lt');
                return data;
            } catch (error) {
                lastError = error;
                const isRetryable = !error || error.backendDown || error.name === 'TypeError';
                if (!isRetryable) {
                    throw error;
                }
            }
        }

        this.backendAvailable = false;
        console.error('API Request Error:', lastError);
        throw lastError || new Error('Backend unavailable');
    }

    async handleResponse(response, requestContext) {
        const text = await response.text();
        let data = {};
        try {
            data = JSON.parse(text);
        } catch (e) {
            // Non-JSON response (e.g., Render's plain "Not Found" when service is down)
            if (!response.ok) {
                const error = new Error(`Backend unavailable (HTTP ${response.status})`);
                error.status = response.status;
                error.backendDown = true;
                throw error;
            }
        }

        if (!response.ok) {
            let message = data.error || data.message;
            if (!message && Array.isArray(data.errors) && data.errors.length > 0) {
                const first = data.errors[0];
                message = first.msg || first.message || 'Request validation failed';
            }
            // Only nuke the session on 401/403 when we actually sent a token
            // AND the refresh attempt has already been tried (or refreshToken is
            // gone). A bare 401 from an anonymous call must NOT log a user out.
            // (Bug fix Apr 30 2026: stray 401s were clearing sessions on every
            // page switch.)
            if (response.status === 401 || response.status === 403) {
                const triedAuthedRequest = !!(requestContext && requestContext.sentAuth);
                const refreshAttempted = !!(requestContext && requestContext.refreshAttempted);
                const noWayToRecover = !this.refreshToken;
                if (triedAuthedRequest && (refreshAttempted || noWayToRecover)) {
                    this.clearTokens();
                }
            }
            const error = new Error(message || `HTTP ${response.status}`);
            error.status = response.status;
            error.code = data.code;
            error.data = data;
            error.backendDown = false;
            throw error;
        }

        return data;
    }

    async refreshAccessToken(baseUrlOverride) {
        try {
            const refreshBaseUrl = baseUrlOverride || this.baseUrl;
            const response = await fetch(`${refreshBaseUrl}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: this.refreshToken })
            });

            if (response.ok) {
                const data = await response.json();
                this.baseUrl = refreshBaseUrl;
                this.backendAvailable = true;
                this.saveTokens(data.accessToken || data.access_token, data.refreshToken || data.refresh_token || this.refreshToken);
                return true;
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
        }
        
        this.clearTokens();
        return false;
    }

    // ==================== AUTH ROUTES ====================

    async login(usernameOrEmail, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: { login: usernameOrEmail, password }
        });
        
        // Handle different response formats
        const tokens = data.tokens || data;
        const user = data.user || data;
        
        const accessToken = tokens.accessToken || tokens.access_token;
        const refreshToken = tokens.refreshToken || tokens.refresh_token;
        if (accessToken) {
            this.saveTokens(accessToken, refreshToken);
        }
        if (user && typeof user === 'object') {
            this._cachedUser = user;
        }
        
        return { user, tokens };
    }

    async register(userData) {
        const data = await this.request('/auth/signup', {
            method: 'POST',
            body: userData
        });
        // If tokens returned (no email verification required), save them
        const accessToken = data.accessToken || data.access_token;
        const refreshToken = data.refreshToken || data.refresh_token;
        if (accessToken) {
            this.saveTokens(accessToken, refreshToken);
        }
        if (data.user && typeof data.user === 'object') {
            this._cachedUser = data.user;
        }
        return data;
    }

    async logout() {
        try {
            await this.request('/auth/logout', { method: 'POST' });
        } finally {
            this.clearTokens();
        }
    }

    async getCurrentUser() {
        const data = await this.request('/auth/me');
        const user = data?.user || data;
        if (user && typeof user === 'object') {
            this._cachedUser = user;
        }
        return data;
    }

    async verifyEmail(token) {
        const data = await this.request(`/auth/verify-email?token=${encodeURIComponent(token)}`);
        
        // Auto-login after verification if tokens provided
        const tokenPayload = data.tokens || data;
        const accessToken = tokenPayload?.accessToken || tokenPayload?.access_token;
        const refreshToken = tokenPayload?.refreshToken || tokenPayload?.refresh_token;
        if (accessToken) {
            this.saveTokens(accessToken, refreshToken);
        }
        if (data.user && typeof data.user === 'object') {
            this._cachedUser = data.user;
        }
        
        return data;
    }

    async resendVerification(email) {
        return this.request('/auth/resend-verification', {
            method: 'POST',
            body: { email }
        });
    }

    async forgotPassword(email) {
        return this.request('/auth/forgot-password', {
            method: 'POST',
            body: { email }
        });
    }

    async resetPassword(token, newPassword) {
        return this.request('/auth/reset-password', {
            method: 'POST',
            body: { token, password: newPassword }
        });
    }

    // ==================== USER ROUTES ====================

    async getUserProfile(username) {
        return this.request(`/users/${username}`);
    }

    async updateProfile(updates) {
        return this.request('/users/profile', {
            method: 'PUT',
            body: updates
        });
    }

    async searchUsers(query, options = {}) {
        const { limit = 20, offset = 0 } = options;
        return this.request(`/users?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`);
    }

    async getLeaderboard(options = {}, legacyOptions = {}) {
        const normalizedOptions = typeof options === 'string'
            ? { ...legacyOptions, sortBy: options }
            : (options || {});
        const { sport, sortBy = 'roi', limit = 50 } = normalizedOptions;
        let url = `/users/leaderboard?sortBy=${sortBy}&limit=${limit}`;
        if (sport) url += `&sport=${sport}`;
        return this.request(url);
    }

    async getUserStats(userId) {
        return this.request(`/users/${userId}/stats`);
    }

    async getUserAdvancedStats(username, filters = {}) {
        const params = new URLSearchParams();
        Object.entries(filters || {}).forEach(([key, value]) => {
            if (value != null && value !== '' && value !== 'all') {
                params.append(key, value);
            }
        });
        const query = params.toString();
        return this.request(`/users/${encodeURIComponent(username)}/stats/advanced${query ? `?${query}` : ''}`);
    }

    // ==================== PICKS ROUTES ====================

    async getPicks(options = {}) {
        const { userId, sport, status, page, limit = 20, offset } = options;
        // Backend uses offset, not page. Support both for compatibility.
        const effectiveOffset = offset != null ? offset : (page ? (page - 1) * limit : 0);
        let url = `/picks?limit=${limit}&offset=${effectiveOffset}`;
        if (userId) url += `&userId=${userId}`;
        if (sport) url += `&sport=${sport}`;
        if (status) url += `&status=${status}`;
        const data = await this.request(url);
        const picks = Array.isArray(data?.picks) ? data.picks : [];

        // Preserve array-style callers from older pages while keeping metadata access.
        picks.picks = picks;
        if (data && typeof data === 'object') {
            Object.keys(data).forEach((key) => {
                if (key !== 'picks') {
                    picks[key] = data[key];
                }
            });
        }

        return picks;
    }

    async createPick(pickData) {
        return this.request('/picks', {
            method: 'POST',
            body: pickData
        });
    }

    async getPick(pickId) {
        return this.request(`/picks/${pickId}`);
    }

    async updatePick(pickId, updates) {
        return this.request(`/picks/${pickId}`, {
            method: 'PUT',
            body: updates
        });
    }

    async deletePick(pickId) {
        return this.request(`/picks/${pickId}`, {
            method: 'DELETE'
        });
    }

    // ==================== GAMES ROUTES ====================

    async getGames(options = {}) {
        const { sport, date, status } = options;
        let url = '/games?';
        const params = [];
        if (sport) params.push(`sport=${sport}`);
        if (date) params.push(`date=${date}`);
        if (status) params.push(`status=${status}`);
        return this.request(url + params.join('&'));
    }

    async getMarketBoard(sportKey) {
        return this.request(`/games/board/${encodeURIComponent(sportKey)}`);
    }

    async getGame(gameId) {
        return this.request(`/games/${gameId}`);
    }

    // ==================== CHALLENGES ROUTES ====================

    async getChallenges(options = {}) {
        const { status, type, page = 1, limit = 20 } = options;
        let url = `/challenges?page=${page}&limit=${limit}`;
        if (status) url += `&status=${status}`;
        if (type) url += `&type=${type}`;
        return this.request(url);
    }

    async createChallenge(challengeData) {
        return this.request('/challenges', {
            method: 'POST',
            body: challengeData
        });
    }

    async respondToChallenge(challengeId, action) {
        return this.request(`/challenges/${challengeId}/respond`, {
            method: 'PUT',
            body: { action }
        });
    }

    async getContests(options = {}) {
        const { status, page = 1, limit = 20 } = options;
        let url = `/challenges/contests?page=${page}&limit=${limit}`;
        if (status) url += `&status=${status}`;
        return this.request(url);
    }

    async joinContest(contestId) {
        return this.request(`/challenges/contests/${contestId}/join`, {
            method: 'POST'
        });
    }

    // ==================== SOCIAL ROUTES ====================

    async followUser(userId) {
        return this.request(`/social/follow/${userId}`, {
            method: 'POST'
        });
    }

    async unfollowUser(userId) {
        return this.request(`/social/follow/${userId}`, {
            method: 'DELETE'
        });
    }

    async getFollowers(userId, options = {}) {
        const { limit = 50, offset = 0 } = options;
        return this.request(`/social/followers/${userId}?limit=${limit}&offset=${offset}`);
    }

    async getFollowing(userId, options = {}) {
        const { limit = 50, offset = 0 } = options;
        return this.request(`/social/following/${userId}?limit=${limit}&offset=${offset}`);
    }

    // ==================== MESSAGING ROUTES ====================
    // Note: These may need to be added to backend if not present

    async getConversations() {
        return this.request('/messages/conversations');
    }

    async getMessages(userId, options = {}) {
        const { limit = 50, offset = 0 } = options;
        return this.request(`/messages/${userId}?limit=${limit}&offset=${offset}`);
    }

    async sendMessage(userId, content) {
        return this.request('/messages', {
            method: 'POST',
            body: { recipientId: userId, content }
        });
    }

    async markAsRead(userId) {
        return this.request(`/messages/${userId}/read`, {
            method: 'PUT'
        });
    }

    // ==================== NOTIFICATIONS ROUTES ====================

    async getNotifications(options = {}) {
        const { unreadOnly = false, limit = 20 } = options;
        let url = `/notifications?limit=${limit}`;
        if (unreadOnly) url += '&unreadOnly=true';
        return this.request(url);
    }

    async markNotificationRead(notificationId) {
        return this.request(`/notifications/${notificationId}/read`, {
            method: 'PUT'
        });
    }

    async markAllNotificationsRead() {
        return this.request('/notifications/read-all', {
            method: 'PUT'
        });
    }

    // ==================== PREMIUM ROUTES ====================

    async getSubscriptionTiers() {
        return this.request('/premium/tiers');
    }

    async getSubscriptionStatus() {
        return this.request('/premium/status');
    }

    async upgradeSubscription(tier, billingPeriod = 'monthly') {
        return this.request('/premium/upgrade', {
            method: 'POST',
            body: { tier, billing_period: billingPeriod }
        });
    }

    async checkFeatureAccess(feature) {
        return this.request(`/premium/check/${encodeURIComponent(feature)}`);
    }

    async getPremiumAnalytics() {
        return this.request('/premium/analytics');
    }

    // ==================== FORUM ROUTES ====================

    async getForumCategories() {
        return this.request('/forum/categories');
    }

    async getForumThreads(options = {}) {
        const { categoryId, page = 1, limit = 20 } = options;
        let url = `/forum/threads?page=${page}&limit=${limit}`;
        if (categoryId) url += `&category=${categoryId}`;
        return this.request(url);
    }

    async getForumThread(threadId) {
        return this.request(`/forum/threads/${threadId}`);
    }

    async createForumThread(categoryId, title, content) {
        return this.request('/forum/threads', {
            method: 'POST',
            body: { category_id: categoryId, title, content }
        });
    }

    async getThreadPosts(threadId, options = {}) {
        const { page = 1, limit = 20 } = options;
        return this.request(`/forum/threads/${threadId}/posts?page=${page}&limit=${limit}`);
    }

    async replyToThread(threadId, content, parentPostId = null) {
        const body = { content };
        if (parentPostId) body.parent_post_id = parentPostId;
        return this.request(`/forum/threads/${threadId}/posts`, {
            method: 'POST',
            body
        });
    }

    async likeForumPost(postId) {
        return this.request(`/forum/posts/${postId}/like`, {
            method: 'POST'
        });
    }

    async searchForum(query, options = {}) {
        const { limit = 20 } = options;
        return this.request(`/forum/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    }

    // ==================== UTILITY ====================

    isLoggedIn() {
        return !!(this.token || this.refreshToken);
    }

    /**
     * Get current username from any auth source
     */
    getLoggedInUsername() {
        // From JWT user (if backend available)
        if (this._cachedUser) return this._cachedUser.username;
        // From localStorage auth session
        try {
            const session = localStorage.getItem('trustmyrecord_session');
            if (session) {
                const parsed = JSON.parse(session);
                const user = parsed.user || parsed;
                return user.username || null;
            }
        } catch(e) {}
        return null;
    }

    async checkAuth() {
        if (!this.token) return false;
        try {
            await this.getCurrentUser();
            return true;
        } catch (error) {
            return false;
        }
    }
    // ============================================================
    // Gaming Arena API Methods
    // ============================================================

    async getGamingTitles() {
        try {
            return await this.request('/gaming/titles');
        } catch (error) {
            return { games: [] };
        }
    }

    async getGamerProfile(username) {
        try {
            const data = await this.request(`/gaming/profile/${username}`);
            if (data && data.gamer_profile && !data.profile) {
                data.profile = data.gamer_profile;
            }
            return data;
        } catch (error) {
            return {
                user: null,
                profile: null,
                gamer_profile: null,
                favorite_teams: [],
                gaming_stats: [],
                badges: [],
                recent_matches: []
            };
        }
    }

    async updateGamerProfile(data) {
        return this.request('/gaming/profile', { method: 'PUT', body: data });
    }

    async getFavoriteTeams(username) {
        try {
            return await this.request(`/gaming/teams/${username}`);
        } catch (error) {
            return { favorite_teams: [] };
        }
    }

    async updateFavoriteTeams(teams) {
        return this.request('/gaming/teams', { method: 'PUT', body: { teams } });
    }

    async getGamingChallenges(options = {}) {
        const params = new URLSearchParams();
        if (options.status) params.set('status', options.status);
        if (options.game) params.set('game', options.game);
        if (options.user) params.set('user', options.user);
        params.set('page', options.page || 1);
        params.set('limit', options.limit || 20);
        try {
            return await this.request(`/gaming/challenges?${params}`);
        } catch (error) {
            return { challenges: [], total: 0, page: Number(options.page || 1), limit: Number(options.limit || 20) };
        }
    }

    async createGamingChallenge(data) {
        return this.request('/gaming/challenges', { method: 'POST', body: data });
    }

    async respondGamingChallenge(id, action) {
        return this.request(`/gaming/challenges/${id}/respond`, { method: 'PUT', body: { action } });
    }

    async getGamingChallenge(id) {
        try {
            return await this.request(`/gaming/challenges/${id}`);
        } catch (error) {
            return { challenge: null, matches: [] };
        }
    }

    async cancelGamingChallenge(id) {
        return this.request(`/gaming/challenges/${id}`, { method: 'DELETE' });
    }

    async logGamingMatch(data) {
        return this.request('/gaming/matches', { method: 'POST', body: data });
    }

    async getGamingMatches(options = {}) {
        const params = new URLSearchParams();
        if (options.game) params.set('game', options.game);
        if (options.user) params.set('user', options.user);
        params.set('page', options.page || 1);
        params.set('limit', options.limit || 20);
        try {
            return await this.request(`/gaming/matches?${params}`);
        } catch (error) {
            return { matches: [], page: Number(options.page || 1), limit: Number(options.limit || 20) };
        }
    }

    async getGamingMatch(id) {
        try {
            return await this.request(`/gaming/matches/${id}`);
        } catch (error) {
            return { match: null, box_score: null };
        }
    }

    async confirmGamingMatch(id) {
        return this.request(`/gaming/matches/${id}/confirm`, { method: 'PUT' });
    }

    async disputeGamingMatch(id, reason) {
        return this.request(`/gaming/matches/${id}/dispute`, { method: 'PUT', body: { reason } });
    }

    async getGamingLeaderboard(options = {}) {
        const params = new URLSearchParams();
        if (options.game) params.set('game', options.game);
        params.set('sort', options.sort || 'wins');
        params.set('limit', options.limit || 25);
        try {
            return await this.request(`/gaming/leaderboard?${params}`);
        } catch (error) {
            return { leaderboard: [] };
        }
    }

    async getGamingH2H(user1, user2) {
        try {
            return await this.request(`/gaming/h2h/${user1}/${user2}`);
        } catch (error) {
            return { user1: null, user2: null, h2h_records: [], recent_matches: [] };
        }
    }

    async getGamingStats(username) {
        try {
            return await this.request(`/gaming/stats/${username}`);
        } catch (error) {
            return { user: null, stats_by_game: [], totals: {}, top_rivals: [] };
        }
    }

    async getGamingActivity(options = {}) {
        const params = new URLSearchParams();
        params.set('page', options.page || 1);
        params.set('limit', options.limit || 30);
        try {
            return await this.request(`/gaming/activity?${params}`);
        } catch (error) {
            return { activity: [] };
        }
    }
}

// Create global API instance
const api = new TrustMyRecordAPI();
if (typeof window !== 'undefined') {
    window.api = api;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TrustMyRecordAPI, api };
}
