// Enhanced Authentication System with PERMANENT Login
// v3.2 - Apr 5, 2026

class PersistentAuthSystem {
    constructor() {
        this.currentUser = null;
        this.users = this.loadUsers();
        this.sessionKey = 'trustmyrecord_session';
        this.usersKey = 'trustmyrecord_users';
        this.rememberKey = 'trustmyrecord_remember';
        this.ensureDefaultUsers();
        this.init();
    }

    ensureDefaultUsers() {
        if (!this.users.find(u => u.username === 'admin')) {
            this.users.push({
                id: 'user_admin_default',
                username: 'admin',
                email: 'admin@trustmyrecord.com',
                passwordHash: this.hashPassword('admin123'),
                displayName: 'Admin',
                avatar: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23ef4444%22/><text x=%2250%22 y=%2265%22 font-size=%2250%22 text-anchor=%22middle%22 fill=%22white%22>A</text></svg>',
                bio: 'Site Administrator',
                joinedDate: new Date().toISOString(),
                verified: true,
                stats: { totalPicks: 0, wins: 0, losses: 0, pushes: 0, winRate: 0, roi: 0 },
                social: { followers: [], following: [], reputation: 0, badges: ['admin'] },
                isPremium: true
            });
            this.saveUsers();
        }

        if (!this.users.find(u => u.username === 'BetLegend')) {
            this.users.push({
                id: 'user_betlegend',
                username: 'BetLegend',
                email: 'nima@betlegendpicks.com',
                passwordHash: this.hashPassword('betlegend2025'),
                displayName: 'BetLegend',
                avatar: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%2322c55e%22/><text x=%2250%22 y=%2265%22 font-size=%2250%22 text-anchor=%22middle%22 fill=%22white%22>B</text></svg>',
                bio: 'Founder',
                joinedDate: '2025-10-01',
                verified: true,
                stats: { totalPicks: 0, wins: 0, losses: 0, pushes: 0, winRate: 0, roi: 0 },
                social: { followers: [], following: [], reputation: 0, badges: ['founder', 'verified'] },
                isPremium: true
            });
            this.saveUsers();
        }

        if (!this.users.find(u => u.username === 'demo')) {
            this.users.push({
                id: 'user_demo',
                username: 'demo',
                email: 'demo@trustmyrecord.com',
                passwordHash: this.hashPassword('demo123'),
                displayName: 'Demo User',
                avatar: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%230ea5e9%22/><text x=%2250%22 y=%2265%22 font-size=%2250%22 text-anchor=%22middle%22 fill=%22white%22>D</text></svg>',
                bio: 'Test Account',
                joinedDate: '2025-11-01',
                verified: false,
                stats: { totalPicks: 0, wins: 0, losses: 0, pushes: 0, winRate: 0, roi: 0 },
                social: { followers: [], following: [], reputation: 0, badges: ['newbie'] },
                isPremium: false
            });
            this.saveUsers();
        }

        if (!this.users.find(u => u.username === 'testuser')) {
            this.users.push({
                id: 'user_testuser',
                username: 'testuser',
                email: 'test@example.com',
                passwordHash: this.hashPassword('password123'),
                displayName: 'Test User',
                avatar: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23f59e0b%22/><text x=%2250%22 y=%2265%22 font-size=%2250%22 text-anchor=%22middle%22 fill=%22white%22>T</text></svg>',
                bio: 'Test Account for Development',
                joinedDate: new Date().toISOString(),
                verified: true,
                stats: { totalPicks: 0, wins: 0, losses: 0, pushes: 0, winRate: 0, roi: 0 },
                social: { followers: [], following: [], reputation: 0, badges: ['tester'] },
                isPremium: true
            });
            this.saveUsers();
        }
    }

    init() {
        const restored = this.restoreSession();
        this.initializeUI();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeUI());
        }
        window.addEventListener('beforeunload', () => this.persistSession());
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.currentUser) this.initializeUI();
        });
        setInterval(() => { if (this.currentUser) this.persistSession(); }, 30000);
    }

    restoreSession() {
        try {
            let sessionData = localStorage.getItem(this.sessionKey);
            if (!sessionData) {
                sessionData = localStorage.getItem('currentUser');
                if (sessionData) {
                    localStorage.setItem(this.sessionKey, sessionData);
                    localStorage.removeItem('currentUser');
                }
            }
            if (sessionData) {
                const parsed = JSON.parse(sessionData);
                if (this.isSessionValid(parsed)) {
                    this.currentUser = parsed.user || parsed;
                    return true;
                } else {
                    this.clearSession();
                }
            }
        } catch (error) {
            this.clearSession();
        }
        return false;
    }

    persistSession() {
        if (this.currentUser) {
            localStorage.setItem(this.sessionKey, JSON.stringify({
                user: this.currentUser,
                timestamp: Date.now(),
                rememberMe: true
            }));
        }
    }

    isSessionValid(sessionData) {
        if (!sessionData) return false;
        const user = sessionData.user || sessionData;
        return user && (user.username || user.email);
    }

    clearSession() {
        this.currentUser = null;
        localStorage.removeItem(this.sessionKey);
        localStorage.removeItem('currentUser');
        localStorage.removeItem(this.rememberKey);
        // Clear belt-and-suspenders keys set by forms-fixed.js
        localStorage.removeItem('tmr_is_logged_in');
        localStorage.removeItem('tmr_current_user');
    }

    isRememberMe() { return localStorage.getItem(this.rememberKey) === 'true'; }
    setRememberMe(value) { localStorage.setItem(this.rememberKey, value ? 'true' : 'false'); }

    initializeUI() {
        console.log('[Auth] Initializing UI. Current user:', (this.currentUser ? this.currentUser.username : null) || 'none');
        if (this.currentUser) this.updateUIForLoggedInUser();
        else this.updateUIForLoggedOutUser();
    }

    async register(username, email, password, rememberMe = true) {
        if (!username || !email || !password) throw new Error('All fields are required');
        if (username.length < 3) throw new Error('Username must be at least 3 characters');
        if (password.length < 6) throw new Error('Password must be at least 6 characters');

        // Try backend API first (only if backend is detected as available)
        const backendReady = typeof CONFIG !== 'undefined' && CONFIG.features?.useBackendAPI && typeof api !== 'undefined' && api.backendAvailable === true;
        if (backendReady) {
            try {
                const data = await api.register({ username, email, password });
                const user = {
                    id: data.user?.id || this.generateUserId(),
                    username: data.user?.username || username,
                    email: data.user?.email || email,
                    displayName: data.user?.displayName || username,
                    avatar: this.getDefaultAvatar(username),
                    bio: '',
                    joinedDate: new Date().toISOString(),
                    verified: data.user?.emailVerified || false,
                    stats: { totalPicks: 0, wins: 0, losses: 0, pushes: 0, winRate: 0, roi: 0 },
                    social: { followers: [], following: [], reputation: 0, badges: ['newbie'] },
                    isPremium: false,
                    backendUser: true
                };
                this.currentUser = user;
                this.setRememberMe(rememberMe);
                this.persistSession();
                this.updateUIForLoggedInUser();
                return user;
            } catch (err) {
                console.error('[Auth] Backend register failed:', err.message);
                throw err;
            }
        }

        // Fallback to localStorage
        if (this.users.find(u => u.username.toLowerCase() === username.toLowerCase())) throw new Error('Username already taken');
        if (this.users.find(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error('Email already registered');

        const user = {
            id: this.generateUserId(),
            username, email,
            passwordHash: this.hashPassword(password),
            displayName: username,
            avatar: this.getDefaultAvatar(username),
            bio: '',
            joinedDate: new Date().toISOString(),
            verified: false,
            stats: { totalPicks: 0, wins: 0, losses: 0, pushes: 0, winRate: 0, roi: 0 },
            social: { followers: [], following: [], reputation: 0, badges: ['newbie'] },
            isPremium: false
        };

        this.users.push(user);
        this.saveUsers();
        this.currentUser = user;
        this.setRememberMe(rememberMe);
        this.persistSession();
        this.updateUIForLoggedInUser();
        return user;
    }

    async login(usernameOrEmail, password, rememberMe = true) {
        // Try backend API first (only if backend is detected as available)
        const backendReady = typeof CONFIG !== 'undefined' && CONFIG.features?.useBackendAPI && typeof api !== 'undefined' && api.backendAvailable === true;
        if (backendReady) {
            try {
                const data = await api.login(usernameOrEmail, password);
                const userData = data.user || {};
                const user = {
                    id: userData.id || this.generateUserId(),
                    username: userData.username || usernameOrEmail,
                    email: userData.email || '',
                    displayName: userData.displayName || userData.username || usernameOrEmail,
                    avatar: userData.avatarUrl || this.getDefaultAvatar(userData.username || usernameOrEmail),
                    bio: userData.bio || '',
                    joinedDate: userData.created_at || new Date().toISOString(),
                    verified: userData.emailVerified || false,
                    stats: { totalPicks: 0, wins: 0, losses: 0, pushes: 0, winRate: 0, roi: 0 },
                    social: { followers: [], following: [], reputation: 0, badges: [] },
                    isPremium: false,
                    backendUser: true
                };
                this.currentUser = user;
                this.setRememberMe(rememberMe);
                this.persistSession();
                this.updateUIForLoggedInUser();
                return user;
            } catch (err) {
                console.error('[Auth] Backend login failed:', err.message);
                throw err;
            }
        }

        // Fallback to localStorage
        const user = this.users.find(u =>
            u.username.toLowerCase() === usernameOrEmail.toLowerCase() ||
            u.email.toLowerCase() === usernameOrEmail.toLowerCase()
        );
        if (!user) throw new Error('User not found');
        if (user.passwordHash !== this.hashPassword(password)) throw new Error('Invalid password');
        this.currentUser = user;
        this.setRememberMe(rememberMe);
        this.persistSession();
        this.updateUIForLoggedInUser();
        return user;
    }

    async logout() {
        // Try backend logout
        if (typeof api !== 'undefined' && api.isLoggedIn && api.isLoggedIn()) {
            try { await api.logout(); } catch (e) { /* ignore */ }
        }
        this.clearSession();
        this.updateUIForLoggedOutUser();
        if (typeof showSection === 'function') {
            try { showSection('home'); } catch(e) {}
        }
    }

    updateProfile(updates) {
        if (!this.currentUser) throw new Error('Not logged in');
        const userIndex = this.users.findIndex(u => u.id === this.currentUser.id);
        if (userIndex === -1) throw new Error('User not found');
        this.users[userIndex] = { ...this.users[userIndex], ...updates };
        this.currentUser = this.users[userIndex];
        this.saveUsers();
        this.persistSession();
        return this.currentUser;
    }

    getUser(idOrUsername) {
        return this.users.find(u => u.id === idOrUsername || u.username.toLowerCase() === idOrUsername.toLowerCase());
    }

    toggleFollow(targetUserId) {
        if (!this.currentUser) throw new Error('Must be logged in to follow');
        const targetUser = this.users.find(u => u.id === targetUserId);
        if (!targetUser) throw new Error('User not found');
        const isFollowing = this.currentUser.social.following.includes(targetUserId);
        if (isFollowing) {
            this.currentUser.social.following = this.currentUser.social.following.filter(id => id !== targetUserId);
            targetUser.social.followers = targetUser.social.followers.filter(id => id !== this.currentUser.id);
        } else {
            this.currentUser.social.following.push(targetUserId);
            targetUser.social.followers.push(this.currentUser.id);
        }
        this.saveUsers();
        this.persistSession();
        return !isFollowing;
    }

    updateUIForLoggedInUser() {
        console.log('[Auth] Updating UI for logged in user:', (this.currentUser ? this.currentUser.username : null));
        if (!this.currentUser) return;
        
        const username = this.currentUser.username || this.currentUser.displayName || 'User';
        const avatar = this.currentUser.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + username;
        const profileUrl = 'profile.html?username=' + encodeURIComponent(username);
        
        // Update main navigation - modify "My Profile" link to show username
        const profileLink = document.querySelector('.profile-link');
        if (profileLink) {
            console.log('[Auth] Found profile link, updating...');
            profileLink.href = profileUrl;
            profileLink.classList.remove('profile-link');
            profileLink.classList.add('nav-username-link');
            profileLink.style.cssText = 'color: var(--neon-cyan); font-weight: 600; display: inline-flex; align-items: center; gap: 8px;';
            profileLink.removeAttribute('onclick');
            profileLink.innerHTML = '<img src="' + avatar + '" style="width:28px;height:28px;border-radius:50%; border: 2px solid var(--neon-cyan);"><span>@' + username + '</span>';
        }
        
        // Update header auth buttons to show username + logout
        const headerAuthButtons = document.getElementById('headerAuthButtons');
        if (headerAuthButtons) {
            console.log('[Auth] Updating header auth buttons...');
            headerAuthButtons.innerHTML = `
                <a href="${profileUrl}" style="display: inline-flex; align-items: center; gap: 8px; color: var(--neon-cyan); text-decoration: none; font-weight: 600;">
                    <img src="${avatar}" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--neon-cyan);">
                    <span>${username}</span>
                </a>
                <button onclick="auth.logout(); window.location.href='index.html';" class="btn btn-secondary" style="padding: 8px 16px; font-size: 13px;">Logout</button>
            `;
        }
    }

    updateUIForLoggedOutUser() {
        // Restore "My Profile" link if it was modified
        const usernameLink = document.querySelector('.nav-username-link');
        if (usernameLink) {
            usernameLink.href = '#profile';
            usernameLink.classList.remove('nav-username-link');
            usernameLink.classList.add('profile-link');
            usernameLink.removeAttribute('style');
            usernameLink.setAttribute('onclick', "if(typeof showSection==='function'){showSection('profile')}else{window.location.href='profile.html'}");
            usernameLink.textContent = 'My Profile';
        }
        // Remove user button from header-actions
        const userBtn = document.querySelector('.user-menu-btn');
        if (userBtn) userBtn.remove();
        
        // Restore header auth buttons to Login
        const headerAuthButtons = document.getElementById('headerAuthButtons');
        if (headerAuthButtons) {
            headerAuthButtons.innerHTML = '<button onclick="if(typeof showSection===\'function\'){showSection(\'login\')}else{window.location.href=\'index.html\'}" class="btn btn-primary" style="padding: 8px 20px; font-size: 14px;">Login</button>';
        }
    }

    generateUserId() { return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); }

    hashPassword(password) {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }

    getDefaultAvatar(seed) {
        const colors = ['0ea5e9', '22c55e', 'ef4444', 'f59e0b', '8b5cf6'];
        const color = colors[(seed ? seed.length : 0) % colors.length];
        const letter = seed ? seed.charAt(0).toUpperCase() : 'U';
        return `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23${color}%22/><text x=%2250%22 y=%2265%22 font-size=%2250%22 text-anchor=%22middle%22 fill=%22white%22>${letter}</text></svg>`;
    }

    loadUsers() {
        const stored = localStorage.getItem(this.usersKey);
        return stored ? JSON.parse(stored) : [];
    }

    saveUsers() { localStorage.setItem(this.usersKey, JSON.stringify(this.users)); }
    isLoggedIn() { return this.currentUser !== null; }
    getCurrentUser() { return this.currentUser; }
    requireAuth() {
        if (!this.isLoggedIn()) {
            if (typeof showSection === 'function') showSection('signup');
            throw new Error('You must be logged in to do that');
        }
    }
}

const auth = new PersistentAuthSystem();
if (typeof window !== 'undefined') {
    window.auth = auth;
    window.PersistentAuthSystem = PersistentAuthSystem;

    /**
     * Look up team affiliations for a username.
     * Checks: auth user object (favoriteTeam), trustMyRecordProfile (favoriteTeams[]).
     * Returns array of { sport, name, icon } or empty array.
     */
    window.getUserTeamBadges = function(username) {
        var teams = [];
        // 1. Check auth users list for favoriteTeam field
        var users = [];
        try { users = JSON.parse(localStorage.getItem('trustmyrecord_users') || '[]'); } catch(e) {}
        var user = users.find(function(u) { return u.username && u.username.toLowerCase() === (username || '').toLowerCase(); });
        if (user && user.favoriteTeam) {
            teams.push({ sport: user.favoriteSport || '', name: user.favoriteTeam, icon: '' });
        }

        // 2. Check trustMyRecordProfile for favoriteTeams (only for current user)
        var current = auth.getCurrentUser();
        if (current && current.username && current.username.toLowerCase() === (username || '').toLowerCase()) {
            try {
                var profile = JSON.parse(localStorage.getItem('trustMyRecordProfile') || '{}');
                if (profile.favoriteTeams && profile.favoriteTeams.length > 0) {
                    teams = profile.favoriteTeams.slice(0, 3); // max 3 badges
                }
            } catch(e) {}
        }

        return teams;
    };

    /**
     * Render team badge HTML for a username. Returns HTML string.
     * Shows up to 3 team badges inline.
     */
    window.renderTeamBadges = function(username) {
        var teams = window.getUserTeamBadges(username);
        if (!teams || teams.length === 0) return '';
        return teams.map(function(t) {
            var icon = t.icon || '';
            return '<span class="user-team-badge" style="display:inline-block;font-size:0.7rem;padding:1px 6px;margin-left:4px;border-radius:3px;background:rgba(255,215,0,0.12);color:#ffd700;font-weight:600;vertical-align:middle;white-space:nowrap;">' +
                (icon ? icon + ' ' : '') + (t.name || '') + '</span>';
        }).join('');
    };
}
console.log('Auth System loaded');


// Debug: Log all clicks on nav-username-link
document.addEventListener('click', function(e) {
    if (e.target.closest('.nav-username-link')) {
        console.log('[Debug] Username link clicked!', e.target.closest('.nav-username-link').href);
    }
});
