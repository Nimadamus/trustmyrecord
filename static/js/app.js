/**
 * TrustMyRecord - Main Application
 * Initializes all features and wires up backend API
 */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('[TMR App] Initializing...');

    // Initialize the application
    TMRApp.init();
});

const TMRApp = {
    init: function() {
        // Check if user is logged in
        if (api.isLoggedIn()) {
            this.onUserLoggedIn();
        }

        // Set up event listeners
        this.setupEventListeners();

        // Initialize sections
        this.initFeed();
        this.initLeaderboards();
        this.initChallenges();

        console.log('[TMR App] Initialization complete');
    },

    setupEventListeners: function() {
        // Override default form submissions
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.onsubmit = this.handleLogin.bind(this);
        }

        const signupForm = document.getElementById('signupForm');
        if (signupForm) {
            signupForm.onsubmit = this.handleSignup.bind(this);
        }
    },

    // ============================================
    // AUTHENTICATION
    // ============================================

    handleLogin: async function(e) {
        e.preventDefault();

        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const result = await api.login(email, password);
            console.log('[TMR] Login successful:', result.user.username);

            this.showNotification('Welcome back, ' + result.user.username + '!', 'success');
            this.onUserLoggedIn();

            // Redirect to feed or my picks
            showSection('feed');

        } catch (error) {
            console.error('[TMR] Login error:', error);
            this.showNotification(error.message || 'Login failed', 'error');
        }
    },

    handleSignup: async function(e) {
        e.preventDefault();

        const username = document.getElementById('signupUsername').value;
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('signupConfirmPassword')?.value || password;

        if (password !== confirmPassword) {
            this.showNotification('Passwords do not match', 'error');
            return;
        }

        try {
            const result = await api.register(username, email, password);
            console.log('[TMR] Registration successful:', result.user.username);

            this.showNotification('Account created! Welcome to TrustMyRecord!', 'success');
            this.onUserLoggedIn();

            // Redirect to make picks
            showSection('picks');

        } catch (error) {
            console.error('[TMR] Signup error:', error);
            this.showNotification(error.message || 'Registration failed', 'error');
        }
    },

    handleLogout: function() {
        api.logout();
        this.onUserLoggedOut();
        this.showNotification('You have been logged out', 'info');
        showSection('record');
    },

    onUserLoggedIn: function() {
        const user = api.getCurrentUser();
        if (!user) return;

        // Update navigation
        this.updateNavForLoggedIn(user);

        // Load user-specific data
        this.loadUserStats();
        this.loadUserPicks();
        this.loadFeed();
        this.loadNotifications();
    },

    onUserLoggedOut: function() {
        this.updateNavForLoggedOut();
    },

    updateNavForLoggedIn: function(user) {
        const nav = document.querySelector('nav');
        if (!nav) return;

        nav.innerHTML = `
            <a onclick="showSection('record')">The Record</a>
            <a onclick="showSection('my-record')" style="color: var(--neon-gold);">My Record</a>
            <a onclick="showSection('arena')">The Arena</a>
            <a onclick="showSection('feed')">Feed</a>
            <a onclick="showSection('picks')" class="make-picks-link">Make Picks</a>
            <a onclick="showSection('mypicks')">My Picks</a>
            <a onclick="showSection('leaderboards')">Leaderboards</a>
            <a onclick="TMRApp.showNotificationsPanel()" class="notif-link">
                🔔 <span id="notifCount" class="notif-badge" style="display:none;">0</span>
            </a>
            <a onclick="showProfile('${user.username}')">
                <img src="${user.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.id}"
                     style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:5px;">
                ${user.username}
            </a>
            <a onclick="TMRApp.handleLogout()" style="color: #ff6b6b;">Logout</a>
        `;
    },

    updateNavForLoggedOut: function() {
        const nav = document.querySelector('nav');
        if (!nav) return;

        nav.innerHTML = `
            <a onclick="showSection('record')">The Record</a>
            <a onclick="showSection('my-record')" style="color: var(--neon-gold);">My Record</a>
            <a onclick="showSection('arena')">The Arena</a>
            <a onclick="showSection('picks')" class="make-picks-link">Make Picks</a>
            <a onclick="showSection('leaderboards')">Leaderboards</a>
            <a onclick="showSection('forums')">Forums</a>
            <a onclick="showSection('login')" class="login-btn">Login</a>
            <a onclick="showSection('signup')" class="signup-btn">Sign Up</a>
        `;
    },

    // ============================================
    // FEED
    // ============================================

    initFeed: function() {
        // Will load feed when user navigates to it
    },

    loadFeed: async function(filter = 'following') {
        const container = document.getElementById('socialFeedContainer');
        if (!container) return;

        if (!api.isLoggedIn() && filter === 'following') {
            filter = 'trending';
        }

        container.innerHTML = '<div class="loading">Loading feed...</div>';

        try {
            let data;
            if (filter === 'following' && api.isLoggedIn()) {
                data = await api.request('/social/feed');
            } else {
                data = await api.request('/social/discover');
            }

            const picks = data.feed || data.picks || [];

            if (picks.length === 0) {
                container.innerHTML = `
                    <div class="empty-feed" style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
                        <div style="font-size: 48px; margin-bottom: 20px;">📡</div>
                        <h3>No picks yet</h3>
                        <p>${filter === 'following' ? 'Follow some users to see their picks here!' : 'Be the first to share a pick!'}</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = picks.map(pick => this.renderFeedPick(pick)).join('');

        } catch (error) {
            console.error('[TMR] Feed error:', error);
            container.innerHTML = `
                <div class="error-state" style="text-align: center; padding: 40px; color: #ff6b6b;">
                    <p>Failed to load feed. Please try again.</p>
                </div>
            `;
        }
    },

    renderFeedPick: function(pick) {
        const isWin = pick.status === 'won';
        const isLoss = pick.status === 'lost';
        const isPending = pick.status === 'pending';

        const statusClass = isWin ? 'pick-win' : isLoss ? 'pick-loss' : 'pick-pending';
        const statusText = isWin ? 'WON' : isLoss ? 'LOST' : isPending ? 'PENDING' : pick.status.toUpperCase();

        const resultUnits = pick.result_units ? (pick.result_units > 0 ? '+' + pick.result_units : pick.result_units) + 'u' : '';

        return `
            <div class="feed-pick glass-card" style="margin-bottom: 15px; padding: 20px;">
                <div class="pick-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div class="pick-user" style="display: flex; align-items: center; gap: 10px;">
                        <img src="${pick.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + pick.user_id}"
                             style="width: 40px; height: 40px; border-radius: 50%;"
                             onclick="showProfile('${pick.username}')">
                        <div>
                            <strong onclick="showProfile('${pick.username}')" style="cursor: pointer; color: var(--text-primary);">
                                ${pick.display_name || pick.username}
                                ${pick.verification_status === 'verified' ? '✓' : ''}
                            </strong>
                            <div style="font-size: 12px; color: var(--text-muted);">
                                ${this.timeAgo(pick.created_at)}
                            </div>
                        </div>
                    </div>
                    <span class="pick-status ${statusClass}" style="padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                        ${statusText} ${resultUnits}
                    </span>
                </div>

                <div class="pick-content">
                    <div class="pick-teams" style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">
                        ${pick.team} ${pick.bet_details || ''}
                    </div>
                    <div style="color: var(--text-secondary); font-size: 14px;">
                        ${pick.opponent ? 'vs ' + pick.opponent : ''}
                        <span style="color: var(--neon-cyan);">${pick.odds > 0 ? '+' : ''}${pick.odds}</span>
                        <span style="margin-left: 10px;">${pick.units}u</span>
                    </div>
                    ${pick.reasoning ? `<p style="margin-top: 10px; color: var(--text-secondary); font-style: italic;">"${pick.reasoning}"</p>` : ''}
                </div>

                <div class="pick-actions" style="display: flex; gap: 20px; margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--glass-border);">
                    <button onclick="TMRApp.toggleLike(${pick.id})" class="action-btn ${pick.is_liked ? 'liked' : ''}" style="background: none; border: none; color: ${pick.is_liked ? '#ff6b6b' : 'var(--text-muted)'}; cursor: pointer;">
                        ${pick.is_liked ? '❤️' : '🤍'} <span id="likes-${pick.id}">${pick.likes_count || 0}</span>
                    </button>
                    <button onclick="TMRApp.showComments(${pick.id})" class="action-btn" style="background: none; border: none; color: var(--text-muted); cursor: pointer;">
                        💬 ${pick.comments_count || 0}
                    </button>
                    <button onclick="TMRApp.sharePick(${pick.id})" class="action-btn" style="background: none; border: none; color: var(--text-muted); cursor: pointer;">
                        🔗 Share
                    </button>
                </div>
            </div>
        `;
    },

    toggleLike: async function(pickId) {
        if (!api.isLoggedIn()) {
            this.showNotification('Please login to like picks', 'info');
            showSection('login');
            return;
        }

        try {
            // Toggle like
            const likeSpan = document.getElementById('likes-' + pickId);
            const currentLikes = parseInt(likeSpan.textContent) || 0;

            // Optimistically update UI
            likeSpan.textContent = currentLikes + 1;

            await api.likePick(pickId);

        } catch (error) {
            // If error, try unlike
            try {
                await api.unlikePick(pickId);
                const likeSpan = document.getElementById('likes-' + pickId);
                const currentLikes = parseInt(likeSpan.textContent) || 0;
                likeSpan.textContent = Math.max(0, currentLikes - 1);
            } catch (e) {
                console.error('[TMR] Like toggle error:', e);
            }
        }
    },

    showComments: async function(pickId) {
        // TODO: Implement comments modal
        this.showNotification('Comments feature coming soon!', 'info');
    },

    sharePick: function(pickId) {
        const url = window.location.origin + '/pick/' + pickId;
        if (navigator.share) {
            navigator.share({ url: url });
        } else {
            navigator.clipboard.writeText(url);
            this.showNotification('Link copied to clipboard!', 'success');
        }
    },

    // ============================================
    // LEADERBOARDS
    // ============================================

    initLeaderboards: function() {
        // Load leaderboards when section is shown
    },

    loadLeaderboard: async function(type = 'units', period = 'all', sport = null) {
        const container = document.getElementById(type + 'LeaderboardBody');
        if (!container) return;

        container.innerHTML = '<div class="loading" style="text-align:center;padding:40px;">Loading...</div>';

        try {
            const data = await api.getGlobalLeaderboard({ period, sport, limit: 50 });

            if (!data.leaderboard || data.leaderboard.length === 0) {
                container.innerHTML = `
                    <div class="leaderboard-empty" style="text-align: center; padding: 40px 20px; color: #6c7380;">
                        <div style="font-size: 48px; margin-bottom: 15px;">🏆</div>
                        <p style="font-size: 16px; margin-bottom: 8px;">No rankings yet</p>
                        <p style="font-size: 13px; opacity: 0.7;">Be the first to compete and claim the top spot!</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = data.leaderboard.map((user, index) => `
                <div class="lb-row ${index < 3 ? 'top-' + (index + 1) : ''}" style="display: flex; align-items: center; padding: 12px 15px; border-bottom: 1px solid var(--glass-border);">
                    <div class="lb-col-rank" style="width: 50px; font-weight: 700; color: ${index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : 'var(--text-secondary)'};">
                        ${index < 3 ? ['🥇', '🥈', '🥉'][index] : '#' + (index + 1)}
                    </div>
                    <div class="lb-col-user" style="flex: 1; display: flex; align-items: center; gap: 10px;">
                        <img src="${user.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.id}"
                             style="width: 32px; height: 32px; border-radius: 50%;">
                        <span onclick="showProfile('${user.username}')" style="cursor: pointer;">
                            ${user.username}
                            ${user.is_verified ? '✓' : ''}
                        </span>
                    </div>
                    <div class="lb-col-stat" style="width: 100px; text-align: center;">${user.wins}-${user.losses}${user.pushes > 0 ? '-' + user.pushes : ''}</div>
                    <div class="lb-col-stat" style="width: 80px; text-align: center;">${user.win_rate}%</div>
                    <div class="lb-col-total" style="width: 100px; text-align: right; font-weight: 700; color: ${parseFloat(user.total_units) >= 0 ? '#00c853' : '#ff6b6b'};">
                        ${parseFloat(user.total_units) >= 0 ? '+' : ''}${parseFloat(user.total_units).toFixed(2)}u
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('[TMR] Leaderboard error:', error);
            container.innerHTML = `
                <div class="error" style="text-align: center; padding: 40px; color: #ff6b6b;">
                    Failed to load leaderboard
                </div>
            `;
        }
    },

    // ============================================
    // CHALLENGES
    // ============================================

    initChallenges: function() {
        // Challenges are on a separate page
    },

    loadChallenges: async function() {
        try {
            const data = await api.getChallenges();
            console.log('[TMR] Challenges loaded:', data);
            return data;
        } catch (error) {
            console.error('[TMR] Challenges error:', error);
            return { challenges: [] };
        }
    },

    createChallenge: async function(challengedUserId, options = {}) {
        if (!api.isLoggedIn()) {
            this.showNotification('Please login to create challenges', 'info');
            showSection('login');
            return;
        }

        try {
            const data = await api.createChallenge({
                challenged_id: challengedUserId,
                title: options.title || 'Head-to-Head Challenge',
                sport: options.sport || null,
                start_date: options.start_date || new Date().toISOString(),
                end_date: options.end_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                min_picks: options.min_picks || 5,
                stake_type: options.stake_type || 'bragging_rights'
            });

            this.showNotification('Challenge sent!', 'success');
            return data;

        } catch (error) {
            console.error('[TMR] Create challenge error:', error);
            this.showNotification(error.message || 'Failed to create challenge', 'error');
        }
    },

    // ============================================
    // USER PICKS
    // ============================================

    loadUserPicks: async function() {
        if (!api.isLoggedIn()) return;

        const user = api.getCurrentUser();
        const container = document.getElementById('myPicksList');
        if (!container) return;

        try {
            const data = await api.getUserPicks(user.id);

            if (!data.picks || data.picks.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; color: #6c7380;">
                        <div style="font-size: 48px; margin-bottom: 20px;">🎯</div>
                        <h3 style="margin-bottom: 10px;">No picks yet</h3>
                        <p style="margin-bottom: 20px;">Start building your verified track record!</p>
                        <button onclick="showSection('picks')" style="background: linear-gradient(135deg, #00c853, #00a648); border: none; padding: 12px 24px; border-radius: 8px; color: #000; font-weight: 700; cursor: pointer;">
                            Make Your First Pick
                        </button>
                    </div>
                `;
                return;
            }

            container.innerHTML = data.picks.map(pick => this.renderUserPick(pick)).join('');

            // Update stats
            this.updatePickStats(data.picks);

        } catch (error) {
            console.error('[TMR] Load picks error:', error);
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#ff6b6b;">Failed to load picks</div>';
        }
    },

    renderUserPick: function(pick) {
        const isWin = pick.status === 'won';
        const isLoss = pick.status === 'lost';
        const isPending = pick.status === 'pending';

        const statusColor = isWin ? '#00c853' : isLoss ? '#ff6b6b' : '#ff9800';
        const resultText = pick.result_units ? (pick.result_units > 0 ? '+' : '') + pick.result_units + 'u' : '';

        return `
            <div class="pick-item" style="background: #242830; border-radius: 10px; padding: 15px; margin-bottom: 10px; border-left: 4px solid ${statusColor};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div style="font-weight: 600; font-size: 16px; color: #fff; margin-bottom: 5px;">
                            ${pick.team} ${pick.bet_details || ''}
                        </div>
                        <div style="color: #6c7380; font-size: 14px;">
                            ${pick.opponent ? 'vs ' + pick.opponent : ''} | ${pick.sport}
                        </div>
                        <div style="color: #00ffff; font-size: 14px; margin-top: 5px;">
                            ${pick.odds > 0 ? '+' : ''}${pick.odds} | ${pick.units}u
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 700; color: ${statusColor}; font-size: 14px;">
                            ${pick.status.toUpperCase()}
                        </div>
                        ${resultText ? `<div style="font-weight: 600; color: ${statusColor}; font-size: 16px;">${resultText}</div>` : ''}
                        <div style="color: #6c7380; font-size: 12px; margin-top: 5px;">
                            ${new Date(pick.game_date).toLocaleDateString()}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    updatePickStats: function(picks) {
        const wins = picks.filter(p => p.status === 'won').length;
        const losses = picks.filter(p => p.status === 'lost').length;
        const pending = picks.filter(p => p.status === 'pending').length;
        const totalUnits = picks.reduce((sum, p) => sum + (parseFloat(p.result_units) || 0), 0);
        const winRate = (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

        const recordEl = document.getElementById('myStatsRecord');
        const winRateEl = document.getElementById('myStatsWinRate');
        const unitsEl = document.getElementById('myStatsUnits');
        const pendingEl = document.getElementById('myStatsPending');
        const pendingCount = document.getElementById('pendingCount');

        if (recordEl) recordEl.textContent = wins + '-' + losses;
        if (winRateEl) winRateEl.textContent = winRate + '%';
        if (unitsEl) {
            unitsEl.textContent = (totalUnits >= 0 ? '+' : '') + totalUnits.toFixed(2);
            unitsEl.style.color = totalUnits >= 0 ? '#00c853' : '#ff6b6b';
        }
        if (pendingEl) pendingEl.textContent = pending;
        if (pendingCount) pendingCount.textContent = pending;
    },

    loadUserStats: async function() {
        // Update sidebar stats
        const user = api.getCurrentUser();
        if (!user) return;

        try {
            const profile = await api.getProfile(user.username);

            const sidebarPicks = document.getElementById('sidebarPicks');
            const sidebarWinRate = document.getElementById('sidebarWinRate');
            const sidebarFollowers = document.getElementById('sidebarFollowers');

            if (sidebarPicks && profile.stats) sidebarPicks.textContent = profile.stats.total_picks || 0;
            if (sidebarWinRate && profile.stats) sidebarWinRate.textContent = (profile.stats.win_rate || 0).toFixed(1) + '%';
            if (sidebarFollowers && profile.social) sidebarFollowers.textContent = profile.social.followers_count || 0;

        } catch (error) {
            console.error('[TMR] Load stats error:', error);
        }
    },

    // ============================================
    // NOTIFICATIONS
    // ============================================

    loadNotifications: async function() {
        if (!api.isLoggedIn()) return;

        try {
            const data = await api.getUnreadCount();
            const count = data.count || 0;

            const badge = document.getElementById('notifCount');
            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'inline-block' : 'none';
            }

        } catch (error) {
            console.error('[TMR] Notifications error:', error);
        }
    },

    showNotificationsPanel: async function() {
        if (!api.isLoggedIn()) {
            this.showNotification('Please login to view notifications', 'info');
            showSection('login');
            return;
        }

        // TODO: Implement notifications panel/modal
        this.showNotification('Notifications panel coming soon!', 'info');
    },

    // ============================================
    // UTILITIES
    // ============================================

    showNotification: function(message, type = 'info') {
        // Create notification element
        const notif = document.createElement('div');
        notif.className = 'tmr-notification ' + type;
        notif.innerHTML = message;
        notif.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 10px;
            color: #fff;
            font-weight: 600;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            background: ${type === 'success' ? '#00c853' : type === 'error' ? '#ff6b6b' : '#00bcd4'};
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;

        document.body.appendChild(notif);

        // Remove after 3 seconds
        setTimeout(() => {
            notif.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notif.remove(), 300);
        }, 3000);
    },

    timeAgo: function(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'just now';
        if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
        if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
        if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';

        return date.toLocaleDateString();
    }
};

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    .pick-win { background: rgba(0, 200, 83, 0.2); color: #00c853; }
    .pick-loss { background: rgba(255, 107, 107, 0.2); color: #ff6b6b; }
    .pick-pending { background: rgba(255, 152, 0, 0.2); color: #ff9800; }
    .notif-badge {
        background: #ff6b6b;
        color: #fff;
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 11px;
        margin-left: 3px;
    }
`;
document.head.appendChild(style);

// Export globally
window.TMRApp = TMRApp;

// Override global functions
window.handleLogin = function(e) { TMRApp.handleLogin(e); };
window.handleSignup = function(e) { TMRApp.handleSignup(e); };
window.filterFeed = function(filter) { TMRApp.loadFeed(filter); };
window.switchLeaderboard = function(type) { TMRApp.loadLeaderboard(type); };
