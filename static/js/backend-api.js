/**
 * TrustMyRecord Backend API Client
 * Connects frontend to Node.js/Express backend
 */

class TrustMyRecordAPI {
    constructor() {
        this.baseUrl = CONFIG?.api?.baseUrl || 'http://localhost:3000/api';
        this.token = null;
        this.refreshToken = null;
        this.backendAvailable = null; // null = not checked, true/false
        this.loadTokens();
        // Store the detection promise so callers can await it
        this.ready = this.detectBackend();
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
        console.warn('[TMR API] No backend available after retries. Using localStorage fallback.');
    }

    // Token Management
    loadTokens() {
        this.token = localStorage.getItem('trustmyrecord_token');
        this.refreshToken = localStorage.getItem('trustmyrecord_refresh_token');
    }

    saveTokens(token, refreshToken) {
        this.token = token;
        this.refreshToken = refreshToken;
        localStorage.setItem('trustmyrecord_token', token);
        localStorage.setItem('trustmyrecord_refresh_token', refreshToken);
    }

    clearTokens() {
        this.token = null;
        this.refreshToken = null;
        localStorage.removeItem('trustmyrecord_token');
        localStorage.removeItem('trustmyrecord_refresh_token');
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
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            headers: this.getAuthHeaders(),
            ...options
        };

        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);
            
            // Handle token expiration
            if (response.status === 401 && this.refreshToken) {
                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    // Retry request with new token
                    config.headers['Authorization'] = `Bearer ${this.token}`;
                    const retryResponse = await fetch(url, config);
                    return this.handleResponse(retryResponse);
                }
            }

            return this.handleResponse(response);
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    }

    async handleResponse(response) {
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
            const error = new Error(data.error || data.message || `HTTP ${response.status}`);
            error.status = response.status;
            error.code = data.code;
            error.data = data;
            error.backendDown = false;
            throw error;
        }

        return data;
    }

    async refreshAccessToken() {
        try {
            const response = await fetch(`${this.baseUrl}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: this.refreshToken })
            });

            if (response.ok) {
                const data = await response.json();
                this.saveTokens(data.accessToken, data.refreshToken || this.refreshToken);
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
        
        if (tokens.accessToken) {
            this.saveTokens(tokens.accessToken, tokens.refreshToken);
        }
        
        return { user, tokens };
    }

    async register(userData) {
        const data = await this.request('/auth/signup', {
            method: 'POST',
            body: userData
        });
        // If tokens returned (no email verification required), save them
        if (data.accessToken) {
            this.saveTokens(data.accessToken, data.refreshToken);
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
        return this.request('/auth/me');
    }

    async verifyEmail(token) {
        const data = await this.request(`/auth/verify-email?token=${encodeURIComponent(token)}`);
        
        // Auto-login after verification if tokens provided
        if (data.tokens?.accessToken) {
            this.saveTokens(data.tokens.accessToken, data.tokens.refreshToken);
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
            body: { token, newPassword }
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

    async getLeaderboard(options = {}) {
        const { sport, sortBy = 'roi', limit = 50 } = options;
        let url = `/users/leaderboard?sortBy=${sortBy}&limit=${limit}`;
        if (sport) url += `&sport=${sport}`;
        return this.request(url);
    }

    async getUserStats(userId) {
        return this.request(`/users/${userId}/stats`);
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
        return this.request(url);
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
        // Check JWT token first
        if (this.token) return true;
        // Fallback: check localStorage auth session (PersistentAuthSystem)
        try {
            const session = localStorage.getItem('trustmyrecord_session');
            if (session) {
                const parsed = JSON.parse(session);
                const user = parsed.user || parsed;
                if (user && (user.username || user.email)) return true;
            }
        } catch(e) {}
        return false;
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
        return this.request('/gaming/titles');
    }

    async getGamerProfile(username) {
        return this.request(`/gaming/profile/${username}`);
    }

    async updateGamerProfile(data) {
        return this.request('/gaming/profile', { method: 'PUT', body: data });
    }

    async getFavoriteTeams(username) {
        return this.request(`/gaming/teams/${username}`);
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
        return this.request(`/gaming/challenges?${params}`);
    }

    async createGamingChallenge(data) {
        return this.request('/gaming/challenges', { method: 'POST', body: data });
    }

    async respondGamingChallenge(id, action) {
        return this.request(`/gaming/challenges/${id}/respond`, { method: 'PUT', body: { action } });
    }

    async getGamingChallenge(id) {
        return this.request(`/gaming/challenges/${id}`);
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
        return this.request(`/gaming/matches?${params}`);
    }

    async getGamingMatch(id) {
        return this.request(`/gaming/matches/${id}`);
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
        return this.request(`/gaming/leaderboard?${params}`);
    }

    async getGamingH2H(user1, user2) {
        return this.request(`/gaming/h2h/${user1}/${user2}`);
    }

    async getGamingStats(username) {
        return this.request(`/gaming/stats/${username}`);
    }

    async getGamingActivity(options = {}) {
        const params = new URLSearchParams();
        params.set('page', options.page || 1);
        params.set('limit', options.limit || 30);
        return this.request(`/gaming/activity?${params}`);
    }
}

// Create global API instance
const api = new TrustMyRecordAPI();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TrustMyRecordAPI, api };
}
