/**
 * TrustMyRecord Backend API Client
 * Handles all communication with the backend server
 */

class BackendAPI {
    constructor(baseUrl) {
        this.baseUrl = baseUrl || (typeof CONFIG !== 'undefined' && CONFIG.api ? CONFIG.api.baseUrl : 'http://localhost:3000/api');
        this.token = localStorage.getItem('tmr_token');
        this.refreshToken = localStorage.getItem('tmr_refresh_token');
        this.user = null;

        // Try to restore user from token
        if (this.token) {
            this.loadUser();
        }
    }

    /**
     * Get auth headers
     */
    getHeaders(includeAuth = true) {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (includeAuth && this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return headers;
    }

    /**
     * Make API request
     */
    async request(endpoint, options = {}, _isRetry = false) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            headers: this.getHeaders(options.auth !== false),
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                // On 401/403, try token refresh once
                if ((response.status === 401 || response.status === 403) && !_isRetry && this.refreshToken) {
                    const refreshed = await this._tryRefresh();
                    if (refreshed) {
                        return this.request(endpoint, options, true);
                    }
                }
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    }

    /**
     * Attempt to refresh the access token
     */
    async _tryRefresh() {
        try {
            const res = await fetch(`${this.baseUrl}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: this.refreshToken })
            });
            if (!res.ok) {
                this.logout();
                return false;
            }
            const data = await res.json();
            this.token = data.accessToken;
            localStorage.setItem('tmr_token', this.token);
            return true;
        } catch (e) {
            this.logout();
            return false;
        }
    }

    // ============================================
    // AUTHENTICATION
    // ============================================

    /**
     * Register new user
     */
    async register(username, email, password) {
        const data = await this.request('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ username, email, password }),
            auth: false
        });

        this.token = data.accessToken || data.token;
        this.refreshToken = data.refreshToken || null;
        this.user = data.user;
        localStorage.setItem('tmr_token', this.token);
        if (this.refreshToken) localStorage.setItem('tmr_refresh_token', this.refreshToken);
        localStorage.setItem('tmr_user', JSON.stringify(data.user));

        return data;
    }

    /**
     * Login user
     */
    async login(email, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email: email, password: password }),
            auth: false
        });

        this.token = data.accessToken || data.token;
        this.refreshToken = data.refreshToken || null;
        this.user = data.user;
        localStorage.setItem('tmr_token', this.token);
        if (this.refreshToken) localStorage.setItem('tmr_refresh_token', this.refreshToken);
        localStorage.setItem('tmr_user', JSON.stringify(data.user));

        return data;
    }

    /**
     * Logout user
     */
    logout() {
        this.token = null;
        this.refreshToken = null;
        this.user = null;
        localStorage.removeItem('tmr_token');
        localStorage.removeItem('tmr_refresh_token');
        localStorage.removeItem('tmr_user');
    }

    /**
     * Load user from stored token
     */
    async loadUser() {
        try {
            const data = await this.request('/auth/me');
            this.user = data.user;
            localStorage.setItem('tmr_user', JSON.stringify(data.user));
            return data.user;
        } catch (error) {
            // Token invalid, clear it
            this.logout();
            return null;
        }
    }

    /**
     * Check if logged in
     */
    isLoggedIn() {
        return !!this.token && !!this.user;
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        if (!this.user) {
            const stored = localStorage.getItem('tmr_user');
            if (stored) {
                this.user = JSON.parse(stored);
            }
        }
        return this.user;
    }

    isEmailVerified() {
        const user = this.getCurrentUser();
        return user && user.email_verified === true;
    }

    async resendVerification(email) {
        return this.request('/auth/resend-verification', {
            method: 'POST',
            body: JSON.stringify({ email }),
            auth: false
        });
    }

    async verifyEmail(token) {
        const data = await this.request(`/auth/verify-email?token=${token}`, {
            method: 'GET',
            auth: false
        });
        if (data.accessToken) {
            this.token = data.accessToken;
            this.refreshToken = data.refreshToken || null;
            this.user = data.user;
            localStorage.setItem('tmr_token', this.token);
            if (this.refreshToken) localStorage.setItem('tmr_refresh_token', this.refreshToken);
            localStorage.setItem('tmr_user', JSON.stringify(data.user));
        }
        return data;
    }

    async forgotPassword(email) {
        return this.request('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email }),
            auth: false
        });
    }

    async resetPassword(token, newPassword) {
        return this.request('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, newPassword }),
            auth: false
        });
    }

    // ============================================
    // USERS & PROFILES
    // ============================================

    /**
     * Get user profile by username
     */
    async getProfile(username) {
        return this.request(`/users/${username}`);
    }

    /**
     * Get user's sport-specific stats
     */
    async getUserSportStats(username, sport) {
        return this.request(`/users/${username}/stats/${sport}`);
    }

    /**
     * Get user's comprehensive community stats (trivia, polls, forum)
     */
    async getUserCommunityStats(username) {
        return this.request(`/users/${username}/community-stats`);
    }

    /**
     * Get comprehensive profile stats (NEW API - includes all stats)
     */
    async getProfileStats(username) {
        return this.request(`/profile/${username}/stats`);
    }

    /**
     * Get user's friends list
     */
    async getProfileFriends(username) {
        return this.request(`/profile/${username}/friends`);
    }

    /**
     * Get user's competition history
     */
    async getProfileCompetitions(username) {
        return this.request(`/profile/${username}/competitions`);
    }

    /**
     * Get user's challenge history
     */
    async getProfileChallenges(username) {
        return this.request(`/profile/${username}/challenges`);
    }

    /**
     * Get user's poll and trivia stats
     */
    async getProfilePollTriviaStats(username) {
        return this.request(`/profile/${username}/poll-trivia-stats`);
    }

    /**
     * Get user's followers list
     */
    async getProfileFollowers(username) {
        return this.request(`/profile/${username}/followers`);
    }

    /**
     * Get users this person is following
     */
    async getProfileFollowing(username) {
        return this.request(`/profile/${username}/following`);
    }

    /**
     * Follow a user
     */
    async followUser(userId) {
        return this.request(`/users/${userId}/follow`, {
            method: 'POST'
        });
    }

    /**
     * Unfollow a user
     */
    async unfollowUser(userId) {
        return this.request(`/users/${userId}/unfollow`, {
            method: 'POST'
        });
    }

    /**
     * Update current user's profile
     */
    async updateProfile(updates) {
        const data = await this.request('/users/profile', {
            method: 'PUT',
            body: JSON.stringify(updates)
        });

        this.user = data.user;
        localStorage.setItem('tmr_user', JSON.stringify(data.user));
        return data;
    }

    /**
     * Search users
     */
    async searchUsers(query) {
        return this.request(`/users/search?q=${encodeURIComponent(query)}`);
    }

    /**
     * Get global leaderboard
     */
    async getLeaderboard(options = {}) {
        const params = new URLSearchParams();
        if (options.sport) params.append('sport', options.sport);
        if (options.period) params.append('period', options.period);
        if (options.limit) params.append('limit', options.limit);

        return this.request(`/users/leaderboard?${params}`);
    }

    // ============================================
    // GAMES
    // ============================================

    /**
     * Get games with odds from backend (Odds API compatible format)
     * Returns array of games with bookmakers array
     */
    async getGamesWithOdds(sportKey) {
        return this.request(`/games/odds/${encodeURIComponent(sportKey)}`, { auth: false });
    }

    /**
     * Get single game detail
     */
    async getGame(gameId) {
        return this.request(`/games/${encodeURIComponent(gameId)}`, { auth: false });
    }

    /**
     * Get available markets for a game (for pick submission)
     */
    async getGameMarkets(gameId) {
        return this.request(`/games/${encodeURIComponent(gameId)}/markets`, { auth: false });
    }

    // ============================================
    // PICKS
    // ============================================

    /**
     * Create a new pick
     */
    async createPick(pickData) {
        return this.request('/picks', {
            method: 'POST',
            body: JSON.stringify(pickData)
        });
    }

    /**
     * Get user's picks
     */
    async getUserPicks(userId, options = {}) {
        const params = new URLSearchParams();
        if (userId) params.append('userId', userId);
        if (options.status) params.append('status', options.status);
        if (options.sport) params.append('sport', options.sport);
        if (options.limit) params.append('limit', options.limit);
        if (options.offset) params.append('offset', options.offset);

        return this.request(`/picks?${params}`);
    }

    /**
     * Submit a pick (convenience wrapper)
     */
    async submitPick(gameId, marketType, selection, units) {
        return this.createPick({
            game_id: gameId,
            market_type: marketType,
            selection: selection,
            units: units
        });
    }

    /**
     * Get a specific pick
     */
    async getPick(pickId) {
        return this.request(`/picks/${pickId}`);
    }

    /**
     * Like a pick
     */
    async likePick(pickId) {
        return this.request(`/picks/${pickId}/like`, { method: 'POST' });
    }

    /**
     * Unlike a pick
     */
    async unlikePick(pickId) {
        return this.request(`/picks/${pickId}/like`, { method: 'DELETE' });
    }

    /**
     * Comment on a pick
     */
    async commentOnPick(pickId, content) {
        return this.request(`/picks/${pickId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
    }

    /**
     * Get comments for a pick
     */
    async getPickComments(pickId) {
        return this.request(`/picks/${pickId}/comments`);
    }

    /**
     * Delete a pick (before game starts)
     */
    async deletePick(pickId) {
        return this.request(`/picks/${pickId}`, { method: 'DELETE' });
    }

    // ============================================
    // SOCIAL
    // ============================================

    /**
     * Follow a user
     */
    async followUser(userId) {
        return this.request(`/social/follow/${userId}`, { method: 'POST' });
    }

    /**
     * Unfollow a user
     */
    async unfollowUser(userId) {
        return this.request(`/social/follow/${userId}`, { method: 'DELETE' });
    }

    /**
     * Get user's followers
     */
    async getFollowers(userId) {
        return this.request(`/social/followers/${userId}`);
    }

    /**
     * Get users that a user follows
     */
    async getFollowing(userId) {
        return this.request(`/social/following/${userId}`);
    }

    /**
     * Block a user
     */
    async blockUser(userId) {
        return this.request(`/social/block/${userId}`, { method: 'POST' });
    }

    /**
     * Unblock a user
     */
    async unblockUser(userId) {
        return this.request(`/social/block/${userId}`, { method: 'DELETE' });
    }

    // ============================================
    // ACTIVITY FEED
    // ============================================

    /**
     * Get activity feed (picks from followed users)
     */
    async getFeed(options = {}) {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit);
        if (options.offset) params.append('offset', options.offset);

        return this.request(`/social/feed?${params}`);
    }

    // ============================================
    // CHALLENGES
    // ============================================

    /**
     * Create a head-to-head challenge
     */
    async createChallenge(challengeData) {
        return this.request('/challenges', {
            method: 'POST',
            body: JSON.stringify(challengeData)
        });
    }

    /**
     * Respond to a challenge (accept/decline)
     */
    async respondToChallenge(challengeId, action) {
        return this.request(`/challenges/${challengeId}/respond`, {
            method: 'PUT',
            body: JSON.stringify({ action })
        });
    }

    /**
     * Get user's challenges
     */
    async getChallenges(status = null) {
        const params = status ? `?status=${status}` : '';
        return this.request(`/challenges${params}`);
    }

    /**
     * Get specific challenge details
     */
    async getChallenge(challengeId) {
        return this.request(`/challenges/${challengeId}`);
    }

    /**
     * Cancel a pending challenge
     */
    async cancelChallenge(challengeId) {
        return this.request(`/challenges/${challengeId}`, { method: 'DELETE' });
    }

    // ============================================
    // CONTESTS
    // ============================================

    /**
     * Get list of contests
     */
    async getContests(options = {}) {
        const params = new URLSearchParams();
        if (options.status) params.append('status', options.status);
        if (options.sport) params.append('sport', options.sport);
        if (options.contest_type) params.append('contest_type', options.contest_type);

        return this.request(`/challenges/contests/list?${params}`);
    }

    /**
     * Get contest details with leaderboard
     */
    async getContest(contestId) {
        return this.request(`/challenges/contests/${contestId}`);
    }

    /**
     * Join a contest
     */
    async joinContest(contestId) {
        return this.request(`/challenges/contests/${contestId}/join`, { method: 'POST' });
    }

    /**
     * Leave a contest (before it starts)
     */
    async leaveContest(contestId) {
        return this.request(`/challenges/contests/${contestId}/leave`, { method: 'DELETE' });
    }

    /**
     * Create a custom contest
     */
    async createContest(contestData) {
        return this.request('/challenges/contests', {
            method: 'POST',
            body: JSON.stringify(contestData)
        });
    }

    // ============================================
    // LEADERBOARDS
    // ============================================

    /**
     * Get global leaderboard with filters
     */
    async getGlobalLeaderboard(options = {}) {
        const params = new URLSearchParams();
        if (options.period) params.append('period', options.period);
        if (options.sport) params.append('sport', options.sport);
        if (options.limit) params.append('limit', options.limit);

        return this.request(`/challenges/leaderboards?${params}`);
    }

    // ============================================
    // NOTIFICATIONS
    // ============================================

    /**
     * Get user's notifications
     */
    async getNotifications(unreadOnly = false) {
        const params = unreadOnly ? '?unread=true' : '';
        return this.request(`/notifications${params}`);
    }

    /**
     * Mark notification as read
     */
    async markNotificationRead(notificationId) {
        return this.request(`/notifications/${notificationId}/read`, { method: 'PUT' });
    }

    /**
     * Mark all notifications as read
     */
    async markAllNotificationsRead() {
        return this.request('/notifications/read-all', { method: 'PUT' });
    }

    /**
     * Get unread notification count
     */
    async getUnreadCount() {
        return this.request('/notifications/unread-count');
    }

    // ============================================
    // FORUMS
    // ============================================

    /**
     * Get forum categories
     */
    async getForumCategories() {
        return this.request('/forum/categories');
    }

    /**
     * Get threads in a category
     */
    async getForumThreads(categorySlug, options = {}) {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit);
        if (options.offset) params.append('offset', options.offset);

        return this.request(`/forum/categories/${categorySlug}/threads?${params}`);
    }

    /**
     * Get a specific thread with posts
     */
    async getThread(threadId) {
        return this.request(`/forum/threads/${threadId}`);
    }

    /**
     * Create a new thread
     */
    async createThread(categorySlug, title, content) {
        return this.request(`/forum/categories/${categorySlug}/threads`, {
            method: 'POST',
            body: JSON.stringify({ title, content })
        });
    }

    /**
     * Reply to a thread
     */
    async replyToThread(threadId, content) {
        return this.request(`/forum/threads/${threadId}/posts`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
    }

    /**
     * Get recent forum threads
     */
    async getRecentThreads(limit = 20) {
        return this.request(`/forum/threads/recent?limit=${limit}`);
    }

    /**
     * Search forum
     */
    async searchForum(query, category = null) {
        const params = new URLSearchParams({ q: query });
        if (category) params.append('category', category);
        return this.request(`/forum/search?${params}`);
    }

    /**
     * Like a forum post
     */
    async likeForumPost(postId) {
        return this.request(`/forum/posts/${postId}/like`, { method: 'POST' });
    }

    /**
     * Subscribe to thread
     */
    async subscribeToThread(threadId) {
        return this.request(`/forum/threads/${threadId}/subscribe`, { method: 'POST' });
    }

    /**
     * Get forum stats
     */
    async getForumStats() {
        return this.request('/forum/stats');
    }

    // ============================================
    // TRIVIA
    // ============================================

    /**
     * Get trivia categories
     */
    async getTriviaCategories() {
        return this.request('/trivia/categories');
    }

    /**
     * Get trivia category with questions
     */
    async getTriviaCategory(slug, options = {}) {
        const params = new URLSearchParams();
        if (options.page) params.append('page', options.page);
        if (options.limit) params.append('limit', options.limit);
        return this.request(`/trivia/categories/${slug}?${params}`);
    }

    /**
     * Create a trivia question
     */
    async createTriviaQuestion(questionData) {
        return this.request('/trivia/questions', {
            method: 'POST',
            body: JSON.stringify(questionData)
        });
    }

    /**
     * Start playing a trivia question (starts timer)
     */
    async playTriviaQuestion(questionId) {
        return this.request(`/trivia/questions/${questionId}/play`);
    }

    /**
     * Submit answer to trivia question
     */
    async submitTriviaAnswer(questionId, attemptId, answerId) {
        return this.request(`/trivia/questions/${questionId}/answer`, {
            method: 'POST',
            body: JSON.stringify({ attempt_id: attemptId, answer_id: answerId })
        });
    }

    /**
     * Get random question from category
     */
    async getRandomTriviaQuestion(categorySlug, difficulty = null) {
        const params = difficulty ? `?difficulty=${difficulty}` : '';
        return this.request(`/trivia/categories/${categorySlug}/random${params}`);
    }

    /**
     * Start a trivia session (multi-question game)
     */
    async startTriviaSession(options = {}) {
        return this.request('/trivia/sessions', {
            method: 'POST',
            body: JSON.stringify(options)
        });
    }

    /**
     * Get next question in trivia session
     */
    async getTriviaSessionNext(sessionId) {
        return this.request(`/trivia/sessions/${sessionId}/next`);
    }

    /**
     * Submit answer in trivia session
     */
    async submitTriviaSessionAnswer(sessionId, questionId, answerId) {
        return this.request(`/trivia/sessions/${sessionId}/answer`, {
            method: 'POST',
            body: JSON.stringify({ question_id: questionId, answer_id: answerId })
        });
    }

    /**
     * Get trivia leaderboard
     */
    async getTriviaLeaderboard(options = {}) {
        const params = new URLSearchParams();
        if (options.category) params.append('category', options.category);
        if (options.period) params.append('period', options.period);
        if (options.limit) params.append('limit', options.limit);
        return this.request(`/trivia/leaderboard?${params}`);
    }

    /**
     * Get user's trivia stats
     */
    async getUserTriviaStats(username) {
        return this.request(`/trivia/users/${username}/stats`);
    }

    /**
     * Get trivia stats overview
     */
    async getTriviaStats() {
        return this.request('/trivia/stats');
    }

    // ============================================
    // PREDICTION POLLS
    // ============================================

    /**
     * Get poll categories
     */
    async getPollCategories() {
        return this.request('/polls/categories');
    }

    /**
     * Get poll category with polls
     */
    async getPollCategory(slug, options = {}) {
        const params = new URLSearchParams();
        if (options.page) params.append('page', options.page);
        if (options.limit) params.append('limit', options.limit);
        if (options.status) params.append('status', options.status);
        return this.request(`/polls/categories/${slug}?${params}`);
    }

    /**
     * Get active polls
     */
    async getActivePolls(options = {}) {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit);
        if (options.sport) params.append('sport', options.sport);
        return this.request(`/polls/active?${params}`);
    }

    /**
     * Create a prediction poll
     */
    async createPoll(pollData) {
        return this.request('/polls', {
            method: 'POST',
            body: JSON.stringify(pollData)
        });
    }

    /**
     * Get single poll with details
     */
    async getPoll(pollId) {
        return this.request(`/polls/${pollId}`);
    }

    /**
     * Vote on a poll
     */
    async voteOnPoll(pollId, optionId, confidence = null) {
        return this.request(`/polls/${pollId}/vote`, {
            method: 'POST',
            body: JSON.stringify({ option_id: optionId, confidence })
        });
    }

    /**
     * Resolve a poll (creator only)
     */
    async resolvePoll(pollId, winningOptionId, notes = null) {
        return this.request(`/polls/${pollId}/resolve`, {
            method: 'PUT',
            body: JSON.stringify({ winning_option_id: winningOptionId, resolution_notes: notes })
        });
    }

    /**
     * Add comment to poll
     */
    async commentOnPoll(pollId, content) {
        return this.request(`/polls/${pollId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
    }

    /**
     * Get poll comments
     */
    async getPollComments(pollId, options = {}) {
        const params = new URLSearchParams();
        if (options.page) params.append('page', options.page);
        if (options.limit) params.append('limit', options.limit);
        return this.request(`/polls/${pollId}/comments?${params}`);
    }

    /**
     * Get poll leaderboard
     */
    async getPollLeaderboard(options = {}) {
        const params = new URLSearchParams();
        if (options.category) params.append('category', options.category);
        if (options.period) params.append('period', options.period);
        if (options.limit) params.append('limit', options.limit);
        return this.request(`/polls/leaderboard?${params}`);
    }

    /**
     * Get user's poll stats
     */
    async getUserPollStats(username) {
        return this.request(`/polls/users/${username}/stats`);
    }

    /**
     * Get user's created polls
     */
    async getUserCreatedPolls(username, limit = 20) {
        return this.request(`/polls/users/${username}/created?limit=${limit}`);
    }

    /**
     * Get poll stats overview
     */
    async getPollStats() {
        return this.request('/polls/stats');
    }

    // ============================================
    // PREMIUM SUBSCRIPTIONS
    // ============================================

    /**
     * Get available subscription tiers
     */
    async getSubscriptionTiers() {
        return this.request('/premium/tiers', { auth: false });
    }

    /**
     * Get current user's subscription status
     */
    async getSubscriptionStatus() {
        return this.request('/premium/status');
    }

    /**
     * Check if user has access to a specific feature
     */
    async checkFeatureAccess(featureName) {
        return this.request(`/premium/check/${featureName}`);
    }

    /**
     * Upgrade subscription
     */
    async upgradeSubscription(tier, billingPeriod = 'monthly') {
        return this.request('/premium/upgrade', {
            method: 'POST',
            body: JSON.stringify({ tier, billing_period: billingPeriod })
        });
    }

    /**
     * Get advanced analytics (premium feature)
     */
    async getPremiumAnalytics() {
        return this.request('/premium/analytics');
    }

    /**
     * Get premium-only contests
     */
    async getPremiumContests(status = null) {
        const params = status ? `?status=${status}` : '';
        return this.request(`/premium/contests${params}`);
    }

    /**
     * Get subscription history
     */
    async getSubscriptionHistory() {
        return this.request('/premium/history');
    }

    /**
     * Check if user is premium (convenience method)
     */
    isPremiumUser() {
        const user = this.getCurrentUser();
        if (!user) return false;
        return user.subscription_tier && user.subscription_tier !== 'free';
    }

    /**
     * Get user's current tier
     */
    getUserTier() {
        const user = this.getCurrentUser();
        return user?.subscription_tier || 'free';
    }
}

// Create global instance
const api = new BackendAPI();

// Export
if (typeof window !== 'undefined') {
    window.api = api;
    window.BackendAPI = BackendAPI;
}
