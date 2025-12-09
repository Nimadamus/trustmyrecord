// Enhanced Authentication System with Persistent Login
// Fixes the "keep logging out" issue

class PersistentAuthSystem {
    constructor() {
        this.currentUser = null;
        this.users = this.loadUsers();
        this.sessionKey = 'trustmyrecord_session';
        this.usersKey = 'trustmyrecord_users';
        this.rememberKey = 'trustmyrecord_remember';

        // Ensure default admin account exists
        this.ensureDefaultUsers();

        this.init();
    }

    ensureDefaultUsers() {
        const adminExists = this.users.find(u => u.username === 'admin');
        if (!adminExists) {
            this.users.push({
                id: 'user_admin_default',
                username: 'admin',
                email: 'admin@trustmyrecord.com',
                passwordHash: this.hashPassword('admin123'),
                displayName: 'Admin',
                avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
                bio: 'Site Administrator',
                joinedDate: new Date().toISOString(),
                verified: true,
                stats: { totalPicks: 0, wins: 0, losses: 0, pushes: 0, winRate: 0, roi: 0 },
                social: { followers: [], following: [], reputation: 100, badges: ['admin'] },
                isPremium: true
            });
            this.saveUsers();
            console.log('✅ Default admin account created');
}        if (!this.users.find(u => u.username === 'BetLegend')) {            this.users.push({ id: 'user_betlegend', username: 'BetLegend', email: 'nima@betlegendpicks.com', passwordHash: this.hashPassword('betlegend2025'), displayName: 'BetLegend', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=betlegend', bio: 'Founder', joinedDate: '2025-10-01', verified: true, stats: { totalPicks: 247, wins: 152, losses: 89, pushes: 6, winRate: 63.1, roi: 14.7, currentStreak: 4, longestWinStreak: 11, totalUnits: 370.5, profitUnits: 54.5 }, social: { followers: [], following: [], reputation: 500, badges: ['founder', 'verified'] }, isPremium: true });            this.saveUsers();            console.log('BetLegend account created');        }        if (!this.users.find(u => u.username === 'demo')) {            this.users.push({ id: 'user_demo', username: 'demo', email: 'demo@trustmyrecord.com', passwordHash: this.hashPassword('demo123'), displayName: 'Demo', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo', bio: 'Test', joinedDate: '2025-11-01', verified: false, stats: { totalPicks: 25, wins: 15, losses: 9, pushes: 1, winRate: 62.5, roi: 8.3, currentStreak: 2, longestWinStreak: 5, totalUnits: 37.5, profitUnits: 3.1 }, social: { followers: [], following: [], reputation: 50, badges: ['newbie'] }, isPremium: false });            this.saveUsers();            console.log('Demo account created');
        }
    }

    init() {
        console.log('🔐 PersistentAuthSystem initializing...');

        // Check for existing session IMMEDIATELY
        const restored = this.restoreSession();
        console.log('Session restore result:', restored, '| Current user:', this.currentUser?.username || 'none');

        // Update UI immediately if we can
        this.initializeUI();

        // Also update when DOM is ready (in case we ran too early)
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initializeUI();
            });
        }

        // Persist session on page unload
        window.addEventListener('beforeunload', () => {
            this.persistSession();
        });

        // Re-check session when tab becomes visible again
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.currentUser) {
                this.initializeUI();
            }
        });

        // Persist session every 30 seconds while page is open
        setInterval(() => {
            if (this.currentUser) {
                this.persistSession();
            }
        }, 30000);
    }

    /**
     * Restore session from storage
     */
    restoreSession() {
        try {
            // Try localStorage first (persistent)
            let sessionData = localStorage.getItem(this.sessionKey);

            // Also check old currentUser key for backwards compatibility
            if (!sessionData) {
                sessionData = localStorage.getItem('currentUser');
                if (sessionData) {
                    // Migrate to new key
                    localStorage.setItem(this.sessionKey, sessionData);
                    localStorage.removeItem('currentUser');
                }
            }

            if (sessionData) {
                const parsed = JSON.parse(sessionData);

                // Verify session is still valid (not expired)
                if (this.isSessionValid(parsed)) {
                    this.currentUser = parsed.user || parsed;
                    console.log('✅ Session restored:', this.currentUser.username);
                    return true;
                } else {
                    console.log('⚠️ Session expired, clearing...');
                    this.clearSession();
                }
            } else {
                console.log('ℹ️ No existing session found');
            }
        } catch (error) {
            console.error('❌ Error restoring session:', error);
            this.clearSession();
        }
        return false;
    }

    /**
     * Persist session to storage - ALWAYS persists, never expires
     */
    persistSession() {
        if (this.currentUser) {
            const sessionData = {
                user: this.currentUser,
                timestamp: Date.now(),
                rememberMe: true  // ALWAYS true - sessions never expire
            };

            localStorage.setItem(this.sessionKey, JSON.stringify(sessionData));
            console.log('💾 Session persisted for:', this.currentUser.username);
        }
    }

    /**
     * Check if session is still valid - SESSIONS NEVER EXPIRE
     */
    isSessionValid(sessionData) {
        // Session is valid as long as we have user data
        if (!sessionData) {
            return false;
        }

        // Accept both formats: {user: {...}} or just {...}
        const user = sessionData.user || sessionData;

        // Valid if we have a username
        return user && (user.username || user.email);
    }

    /**
     * Clear session
     */
    clearSession() {
        this.currentUser = null;
        localStorage.removeItem(this.sessionKey);
        localStorage.removeItem('currentUser'); // Remove old key too
        localStorage.removeItem(this.rememberKey);
    }

    /**
     * Check/Set Remember Me
     */
    isRememberMe() {
        return localStorage.getItem(this.rememberKey) === 'true';
    }

    setRememberMe(value) {
        localStorage.setItem(this.rememberKey, value ? 'true' : 'false');
    }

    initializeUI() {
        if (this.currentUser) {
            this.updateUIForLoggedInUser();
        } else {
            this.updateUIForLoggedOutUser();
        }
    }

    /**
     * Register a new user
     */
    register(username, email, password, rememberMe = true) {
        // Validation
        if (!username || !email || !password) {
            throw new Error('All fields are required');
        }

        if (username.length < 3) {
            throw new Error('Username must be at least 3 characters');
        }

        if (password.length < 6) {
            throw new Error('Password must be at least 6 characters');
        }

        // Check if username exists
        if (this.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            throw new Error('Username already taken');
        }

        // Check if email exists
        if (this.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
            throw new Error('Email already registered');
        }

        // Create new user
        const user = {
            id: this.generateUserId(),
            username,
            email,
            passwordHash: this.hashPassword(password),
            displayName: username,
            avatar: this.getDefaultAvatar(),
            bio: '',
            joinedDate: new Date().toISOString(),
            verified: false,
            stats: {
                totalPicks: 0,
                wins: 0,
                losses: 0,
                pushes: 0,
                winRate: 0,
                roi: 0,
                currentStreak: 0,
                longestWinStreak: 0,
                totalUnits: 0,
                profitUnits: 0
            },
            social: {
                followers: [],
                following: [],
                reputation: 0,
                badges: ['newbie']
            },
            isPremium: false,
            settings: {
                isPrivate: false,
                notifications: {
                    email: true,
                    push: true
                },
                rememberMe: rememberMe
            }
        };

        this.users.push(user);
        this.saveUsers();

        // Auto-login after registration
        this.currentUser = user;
        this.setRememberMe(rememberMe);
        this.persistSession();
        this.updateUIForLoggedInUser();

        console.log('✅ User registered and logged in:', username);

        return user;
    }

    /**
     * Login user
     */
    login(usernameOrEmail, password, rememberMe = true) {
        const user = this.users.find(u =>
            u.username.toLowerCase() === usernameOrEmail.toLowerCase() ||
            u.email.toLowerCase() === usernameOrEmail.toLowerCase()
        );

        if (!user) {
            throw new Error('User not found');
        }

        if (user.passwordHash !== this.hashPassword(password)) {
            throw new Error('Invalid password');
        }

        // Set current user
        this.currentUser = user;
        this.setRememberMe(rememberMe);
        this.persistSession();
        this.updateUIForLoggedInUser();

        console.log('✅ User logged in:', user.username, '| Remember Me:', rememberMe);

        return user;
    }

    /**
     * Logout user
     */
    logout() {
        console.log('👋 User logged out:', this.currentUser?.username);
        this.clearSession();
        this.updateUIForLoggedOutUser();

        // Redirect to home
        if (typeof showSection === 'function') {
            showSection('record');
        }
    }

    /**
     * Update user profile
     */
    updateProfile(updates) {
        if (!this.currentUser) {
            throw new Error('Not logged in');
        }

        // Find user and update
        const userIndex = this.users.findIndex(u => u.id === this.currentUser.id);
        if (userIndex === -1) {
            throw new Error('User not found');
        }

        // Merge updates
        this.users[userIndex] = { ...this.users[userIndex], ...updates };
        this.currentUser = this.users[userIndex];

        this.saveUsers();
        this.persistSession();

        return this.currentUser;
    }

    /**
     * Get user by ID or username
     */
    getUser(idOrUsername) {
        return this.users.find(u =>
            u.id === idOrUsername ||
            u.username.toLowerCase() === idOrUsername.toLowerCase()
        );
    }

    /**
     * Follow/Unfollow user
     */
    toggleFollow(targetUserId) {
        if (!this.currentUser) {
            throw new Error('Must be logged in to follow');
        }

        const targetUser = this.users.find(u => u.id === targetUserId);
        if (!targetUser) {
            throw new Error('User not found');
        }

        const isFollowing = this.currentUser.social.following.includes(targetUserId);

        if (isFollowing) {
            // Unfollow
            this.currentUser.social.following = this.currentUser.social.following.filter(id => id !== targetUserId);
            targetUser.social.followers = targetUser.social.followers.filter(id => id !== this.currentUser.id);
        } else {
            // Follow
            this.currentUser.social.following.push(targetUserId);
            targetUser.social.followers.push(this.currentUser.id);
        }

        this.saveUsers();
        this.persistSession();

        return !isFollowing;
    }

    /**
     * Update UI for logged in user
     */
    updateUIForLoggedInUser() {
        if (!this.currentUser) return;

        const navHTML = `
            <a onclick="showSection('record')">The Record</a>
            <a onclick="showSection('arena')">The Arena</a>
            <a onclick="showSection('search')">Search</a>
            <a onclick="showSection('feed')">Feed</a>
            <a onclick="showSection('picks')" class="make-picks-link">Make Picks</a>
            <a onclick="showSection('leaderboards')">Leaderboards</a>
            <a onclick="showProfile('${this.currentUser.username}')">
                <img src="${this.currentUser.avatar}" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:5px;">
                ${this.currentUser.username}
            </a>
            <a onclick="auth.logout()" style="color: var(--neon-red);">Logout</a>
        `;

        const nav = document.querySelector('nav');
        if (nav) {
            nav.innerHTML = navHTML;
        }

        // Update any welcome messages
        const welcomeElements = document.querySelectorAll('.user-welcome');
        welcomeElements.forEach(el => {
            el.textContent = `Welcome back, ${this.currentUser.username}!`;
        });
    }

    /**
     * Update UI for logged out user
     */
    updateUIForLoggedOutUser() {
        const navHTML = `
            <a onclick="showSection('record')">The Record</a>
            <a onclick="showSection('arena')">The Arena</a>
            <a onclick="showSection('picks')" class="make-picks-link">Make Your Picks</a>
            <a onclick="showSection('leaderboards')">Leaderboards</a>
            <a onclick="showSection('forums')">Forums</a>
            <a onclick="showSection('login')" class="login-btn">Login</a>
            <a onclick="showSection('signup')" class="signup-btn">Sign Up</a>
        `;

        const nav = document.querySelector('nav');
        if (nav) {
            nav.innerHTML = navHTML;
        }
    }

    /**
     * Helper methods
     */
    generateUserId() {
        return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    hashPassword(password) {
        // Simple hash for demo - use bcrypt in production
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }

    getDefaultAvatar() {
        const avatars = [
            'https://api.dicebear.com/7.x/avataaars/svg?seed=1',
            'https://api.dicebear.com/7.x/avataaars/svg?seed=2',
            'https://api.dicebear.com/7.x/avataaars/svg?seed=3',
            'https://api.dicebear.com/7.x/avataaars/svg?seed=4',
            'https://api.dicebear.com/7.x/avataaars/svg?seed=5'
        ];
        return avatars[Math.floor(Math.random() * avatars.length)];
    }

    loadUsers() {
        const stored = localStorage.getItem(this.usersKey);
        return stored ? JSON.parse(stored) : [];
    }

    saveUsers() {
        localStorage.setItem(this.usersKey, JSON.stringify(this.users));
    }

    /**
     * Check if logged in
     */
    isLoggedIn() {
        return this.currentUser !== null;
    }

    /**
     * Require authentication
     */
    requireAuth() {
        if (!this.isLoggedIn()) {
            if (typeof showSection === 'function') {
                showSection('signup');
            }
            throw new Error('You must be logged in to do that');
        }
    }

    /**
     * Debug: Print session status
     */
    debugSession() {
        console.log('=== SESSION DEBUG ===');
        console.log('Current User:', this.currentUser?.username || 'None');
        console.log('Remember Me:', this.isRememberMe());
        console.log('Session Data:', localStorage.getItem(this.sessionKey));
        console.log('==================');
    }
}

// Initialize persistent auth system
const auth = new PersistentAuthSystem();

// Export
if (typeof window !== 'undefined') {
    window.auth = auth;
    window.PersistentAuthSystem = PersistentAuthSystem;
}

console.log('✅ Persistent Auth System loaded');
