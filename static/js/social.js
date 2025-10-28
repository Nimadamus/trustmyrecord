// Social Features for Trust My Record
// Feed, Search, Comments, Likes, etc.

class SocialSystem {
    constructor() {
        this.posts = this.loadPosts();
        this.comments = this.loadComments();
        this.likes = this.loadLikes();
    }

    /**
     * Search users by name, username, location, favorite team
     */
    searchUsers(query) {
        if (!query || query.length < 2) return [];

        query = query.toLowerCase();
        const allUsers = auth.users;

        return allUsers.filter(user => {
            return (
                user.username.toLowerCase().includes(query) ||
                user.displayName?.toLowerCase().includes(query) ||
                user.bio?.toLowerCase().includes(query) ||
                user.location?.toLowerCase().includes(query) ||
                user.favoriteTeam?.toLowerCase().includes(query) ||
                user.favoriteSport?.toLowerCase().includes(query)
            );
        }).slice(0, 20); // Limit to 20 results
    }

    /**
     * Get feed of picks from followed users
     */
    getFeed(limit = 50) {
        if (!auth.isLoggedIn()) {
            return this.getGlobalFeed(limit);
        }

        const following = auth.currentUser.social.following;
        const allPicks = this.loadAllPicks();

        // Get picks from followed users
        let feedPicks = allPicks.filter(pick =>
            following.includes(pick.userId) || pick.userId === auth.currentUser.id
        );

        // Sort by timestamp
        feedPicks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return feedPicks.slice(0, limit);
    }

    /**
     * Get global feed (all public picks)
     */
    getGlobalFeed(limit = 50) {
        const allPicks = this.loadAllPicks();

        // Filter public picks only
        const publicPicks = allPicks.filter(pick => pick.isPublic !== false);

        // Sort by timestamp
        publicPicks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return publicPicks.slice(0, limit);
    }

    /**
     * Like/Unlike a pick
     */
    toggleLike(pickId) {
        if (!auth.isLoggedIn()) {
            throw new Error('Must be logged in to like picks');
        }

        const likeKey = `${auth.currentUser.id}_${pickId}`;
        const hasLiked = this.likes.has(likeKey);

        if (hasLiked) {
            this.likes.delete(likeKey);
        } else {
            this.likes.add(likeKey);
        }

        this.saveLikes();
        return !hasLiked;
    }

    /**
     * Get like count for a pick
     */
    getLikeCount(pickId) {
        return Array.from(this.likes).filter(like => like.endsWith(`_${pickId}`)).length;
    }

    /**
     * Check if current user liked a pick
     */
    hasLiked(pickId) {
        if (!auth.isLoggedIn()) return false;
        return this.likes.has(`${auth.currentUser.id}_${pickId}`);
    }

    /**
     * Add comment to pick
     */
    addComment(pickId, content) {
        if (!auth.isLoggedIn()) {
            throw new Error('Must be logged in to comment');
        }

        const comment = {
            id: this.generateId(),
            pickId,
            userId: auth.currentUser.id,
            username: auth.currentUser.username,
            avatar: auth.currentUser.avatar,
            content,
            timestamp: new Date().toISOString(),
            likes: 0
        };

        this.comments.push(comment);
        this.saveComments();

        return comment;
    }

    /**
     * Get comments for a pick
     */
    getComments(pickId) {
        return this.comments
            .filter(c => c.pickId === pickId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    /**
     * Get trending picks (most likes/comments in last 24h)
     */
    getTrendingPicks(limit = 10) {
        const allPicks = this.loadAllPicks();
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const recentPicks = allPicks.filter(pick =>
            new Date(pick.timestamp) > oneDayAgo
        );

        // Score by engagement
        const scored = recentPicks.map(pick => ({
            ...pick,
            score: this.getLikeCount(pick.id) * 2 + this.getComments(pick.id).length
        }));

        scored.sort((a, b) => b.score - a.score);

        return scored.slice(0, limit);
    }

    /**
     * Get user's picks
     */
    getUserPicks(userId, limit = 20) {
        const allPicks = this.loadAllPicks();
        return allPicks
            .filter(pick => pick.userId === userId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    /**
     * Load/Save helpers
     */
    loadPosts() {
        const stored = localStorage.getItem('trustmyrecord_posts');
        return stored ? JSON.parse(stored) : [];
    }

    savePosts() {
        localStorage.setItem('trustmyrecord_posts', JSON.stringify(this.posts));
    }

    loadComments() {
        const stored = localStorage.getItem('trustmyrecord_comments');
        return stored ? JSON.parse(stored) : [];
    }

    saveComments() {
        localStorage.setItem('trustmyrecord_comments', JSON.stringify(this.comments));
    }

    loadLikes() {
        const stored = localStorage.getItem('trustmyrecord_likes');
        return stored ? new Set(JSON.parse(stored)) : new Set();
    }

    saveLikes() {
        localStorage.setItem('trustmyrecord_likes', JSON.stringify(Array.from(this.likes)));
    }

    loadAllPicks() {
        const stored = localStorage.getItem('trustmyrecord_picks');
        return stored ? JSON.parse(stored) : [];
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

// Initialize social system
const social = new SocialSystem();

// Export
if (typeof window !== 'undefined') {
    window.social = social;
    window.SocialSystem = SocialSystem;
}

/**
 * Render user search results
 */
function renderUserSearch(query) {
    const results = social.searchUsers(query);
    const container = document.getElementById('searchResults');

    if (!container) return;

    if (results.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No users found</p>';
        return;
    }

    container.innerHTML = results.map(user => `
        <div class="user-card" onclick="showProfile('${user.username}')">
            <img src="${user.avatar}" class="user-avatar">
            <div class="user-info">
                <div class="user-name">
                    ${user.displayName || user.username}
                    ${user.verified ? '<span class="verified-badge">✓</span>' : ''}
                </div>
                <div class="user-handle">@${user.username}</div>
                ${user.favoriteTeam ? `
                    <div class="user-team">
                        <span class="team-badge">${user.favoriteTeam}</span>
                        ${user.favoriteSport ? `<span class="sport-tag">${user.favoriteSport}</span>` : ''}
                    </div>
                ` : ''}
                ${user.location ? `<div class="user-location">📍 ${user.location}</div>` : ''}
                <div class="user-stats">
                    <span>${user.stats.totalPicks} picks</span>
                    <span>${user.stats.winRate.toFixed(1)}% win rate</span>
                    <span>${user.social.followers.length} followers</span>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Calculate FanIQ score
 */
function calculateFanIQ(user) {
    // FanIQ is based on multiple factors
    let score = 1000; // Base score

    // Betting performance (up to +500 points)
    const winBonus = user.stats.wins * 10;
    const winRateBonus = user.stats.winRate * 2;
    const roiBonus = (user.stats.roi || 0) * 5;
    score += winBonus + winRateBonus + roiBonus;

    // Social engagement (up to +300 points)
    const followerBonus = user.social.followers.length * 2;
    const reputationBonus = (user.social.reputation || 0) * 5;
    score += followerBonus + reputationBonus;

    // Forum activity (up to +200 points)
    if (typeof forums !== 'undefined') {
        const userThreads = forums.threads.filter(t => t.authorId === user.id);
        const userReplies = forums.replies.filter(r => r.authorId === user.id);
        const threadBonus = userThreads.length * 5;
        const replyBonus = userReplies.length * 2;
        const threadUpvotes = userThreads.reduce((sum, t) => sum + t.upvotes, 0);
        score += threadBonus + replyBonus + threadUpvotes;
    }

    // Activity bonus
    const daysSinceJoined = (Date.now() - new Date(user.joinedDate)) / (1000 * 60 * 60 * 24);
    const activityBonus = Math.min(daysSinceJoined * 0.5, 100);
    score += activityBonus;

    return Math.round(Math.max(0, Math.min(9999, score))); // Cap between 0-9999
}

/**
 * Get user forum stats
 */
function getUserForumStats(userId) {
    if (typeof forums === 'undefined') {
        return { threads: 0, posts: 0, upvotes: 0 };
    }

    const userThreads = forums.threads.filter(t => t.authorId === userId);
    const userReplies = forums.replies.filter(r => r.authorId === userId);
    const totalUpvotes = userThreads.reduce((sum, t) => sum + t.upvotes, 0) +
                         userReplies.reduce((sum, r) => sum + r.upvotes, 0);

    return {
        threads: userThreads.length,
        posts: userReplies.length,
        upvotes: totalUpvotes
    };
}

/**
 * Show user profile
 */
function showProfile(username) {
    const user = auth.getUser(username);
    if (!user) {
        alert('User not found');
        return;
    }

    // Calculate FanIQ and get forum stats
    const fanIQ = calculateFanIQ(user);
    const forumStats = getUserForumStats(user.id);

    // Build profile page dynamically
    const isOwnProfile = auth.currentUser?.id === user.id;
    const isFollowing = auth.currentUser?.social.following.includes(user.id);

    const profileHTML = `
        <div class="profile-container">
            <div class="profile-header" style="background: linear-gradient(135deg, var(--neon-purple), var(--neon-cyan));">
                <img src="${user.avatar}" class="profile-avatar">
                <div class="profile-info">
                    <h1>${user.displayName || user.username} ${user.verified ? '<span class="verified-badge">✓</span>' : ''}</h1>
                    <p class="profile-handle">@${user.username}</p>
                    ${user.favoriteTeam ? `
                        <div class="profile-team">
                            <span class="team-badge-large">${user.favoriteTeam} Fan</span>
                            ${user.favoriteSport ? `<span class="sport-tag">${user.favoriteSport}</span>` : ''}
                        </div>
                    ` : ''}
                    ${user.location ? `<p class="profile-location">📍 ${user.location}</p>` : ''}
                    ${user.bio ? `<p class="profile-bio">${user.bio}</p>` : ''}

                    <!-- FanIQ Score -->
                    <div class="faniq-score">
                        <span class="faniq-label">FanIQ Score</span>
                        <span class="faniq-value">${fanIQ}</span>
                    </div>

                    <!-- Profile Stats Grid -->
                    <div class="profile-stats-grid">
                        <div class="profile-stats">
                            <h3>Betting Stats</h3>
                            <div class="stat-row">
                                <div class="stat-item">
                                    <span class="stat-value">${user.stats.totalPicks}</span>
                                    <span class="stat-label">Total Picks</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${user.stats.wins}-${user.stats.losses}</span>
                                    <span class="stat-label">Record</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${user.stats.winRate.toFixed(1)}%</span>
                                    <span class="stat-label">Win Rate</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${user.stats.roi?.toFixed(1) || 0}%</span>
                                    <span class="stat-label">ROI</span>
                                </div>
                            </div>
                        </div>

                        <div class="profile-stats">
                            <h3>Social Stats</h3>
                            <div class="stat-row">
                                <div class="stat-item">
                                    <span class="stat-value">${user.social.followers.length}</span>
                                    <span class="stat-label">Followers</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${user.social.following.length}</span>
                                    <span class="stat-label">Following</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${user.social.reputation || 0}</span>
                                    <span class="stat-label">Reputation</span>
                                </div>
                            </div>
                        </div>

                        <div class="profile-stats">
                            <h3>Forum Activity</h3>
                            <div class="stat-row">
                                <div class="stat-item">
                                    <span class="stat-value">${forumStats.threads}</span>
                                    <span class="stat-label">Threads</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${forumStats.posts}</span>
                                    <span class="stat-label">Posts</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${forumStats.upvotes}</span>
                                    <span class="stat-label">Upvotes</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    ${!isOwnProfile && auth.isLoggedIn() ? `
                        <button class="follow-btn ${isFollowing ? 'following' : ''}" onclick="toggleFollow('${user.id}')">
                            ${isFollowing ? 'Unfollow' : 'Follow'}
                        </button>
                    ` : ''}
                </div>
            </div>
            <div class="profile-picks">
                <h2>Recent Picks</h2>
                <div id="userPicksContainer"></div>
            </div>
        </div>
    `;

    // Create or update profile section
    let profileSection = document.getElementById('profile-view');
    if (!profileSection) {
        profileSection = document.createElement('div');
        profileSection.id = 'profile-view';
        profileSection.className = 'page-section';
        document.querySelector('main').appendChild(profileSection);
    }

    profileSection.innerHTML = profileHTML;
    showSection('profile-view');

    // Load user's picks
    loadUserPicks(user.id);
}

/**
 * Load user picks
 */
function loadUserPicks(userId) {
    const picks = social.getUserPicks(userId);
    const container = document.getElementById('userPicksContainer');

    if (!container) return;

    if (picks.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);">No picks yet</p>';
        return;
    }

    container.innerHTML = picks.map(pick => renderPickCard(pick)).join('');
}

/**
 * Render a pick card
 */
function renderPickCard(pick) {
    const user = auth.getUser(pick.userId);
    const likeCount = social.getLikeCount(pick.id);
    const commentCount = social.getComments(pick.id).length;
    const hasLiked = social.hasLiked(pick.id);

    return `
        <div class="pick-card ${pick.status}">
            <div class="pick-header">
                <img src="${user?.avatar}" class="pick-user-avatar" onclick="showProfile('${user?.username}')">
                <div>
                    <div class="pick-user-name">${user?.displayName || user?.username}</div>
                    <div class="pick-timestamp">${timeAgo(pick.timestamp)}</div>
                </div>
            </div>
            <div class="pick-content">
                <div class="pick-matchup">${pick.team1} vs ${pick.team2}</div>
                <div class="pick-bet">${pick.pick} (${pick.odds}) | ${pick.units} units</div>
                ${pick.reasoning ? `<div class="pick-reasoning">"${pick.reasoning}"</div>` : ''}
                <div class="pick-status-badge ${pick.status}">${pick.status.toUpperCase()}</div>
            </div>
            <div class="pick-actions">
                <button class="action-btn ${hasLiked ? 'liked' : ''}" onclick="togglePickLike('${pick.id}')">
                    ❤️ ${likeCount}
                </button>
                <button class="action-btn" onclick="showComments('${pick.id}')">
                    💬 ${commentCount}
                </button>
                <button class="action-btn">🔄 Share</button>
            </div>
        </div>
    `;
}

/**
 * Helper: Time ago
 */
function timeAgo(timestamp) {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return new Date(timestamp).toLocaleDateString();
}

// Export functions
if (typeof window !== 'undefined') {
    window.renderUserSearch = renderUserSearch;
    window.showProfile = showProfile;
    window.renderPickCard = renderPickCard;
    window.timeAgo = timeAgo;
    window.calculateFanIQ = calculateFanIQ;
    window.getUserForumStats = getUserForumStats;
}
