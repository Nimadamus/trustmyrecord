// Enhanced Authentication System with PERMANENT Login
// v3.2 - Apr 5, 2026

class PersistentAuthSystem {
    constructor() {
        this.currentUser = null;
        this.users = this.loadUsers();
        this.sessionKey = 'trustmyrecord_session';
        this.usersKey = 'trustmyrecord_users';
        this.rememberKey = 'trustmyrecord_remember';
        this.pruneSeedUsers();
        this.init();
    }

    pruneSeedUsers() {
        const removableUsernames = new Set(['demo', 'testuser', 'admin', 'betlegend']);
        const filteredUsers = this.users.filter(user => !removableUsernames.has(String(user && user.username).toLowerCase()));
        if (filteredUsers.length !== this.users.length) {
            this.users = filteredUsers;
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

    hasBackendCredentials() {
        const tokenKeys = [
            'trustmyrecord_token',
            'accessToken',
            'access_token',
            'token',
            'tmr_token',
            'trustmyrecord_refresh_token',
            'refreshToken',
            'refresh_token',
            'tmr_refresh_token'
        ];
        return tokenKeys.some((key) => {
            try {
                return !!localStorage.getItem(key);
            } catch (error) {
                return false;
            }
        });
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
        if (!user || (!user.username && !user.email)) return false;
        if (user.backendUser && !this.hasBackendCredentials()) {
            return false;
        }
        return true;
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
        if (this.currentUser) this.updateUIForLoggedInUser();
        else this.updateUIForLoggedOutUser();
    }

    async register(username, email, password, rememberMe = true) {
        if (!username || !email || !password) throw new Error('All fields are required');
        if (username.length < 3) throw new Error('Username must be at least 3 characters');
        if (!/^[a-zA-Z0-9_]+$/.test(username)) throw new Error('Username can only contain letters, numbers, and underscores');
        if (password.length < 8) throw new Error('Password must be at least 8 characters');

        // Wait for backend detection to finish
        if (typeof api !== 'undefined' && api.ready) {
            try { await api.ready; } catch (e) { /* detection failed */ }
        }

        const backendReady = typeof CONFIG !== 'undefined'
            && CONFIG.features?.useBackendAPI
            && typeof api !== 'undefined'
            && typeof api.register === 'function';
        
        if (!backendReady) {
            throw new Error('Server connection unavailable. Please try again later.');
        }

        try {
            const data = await api.register({ username, email, password });
            const userData = data.user || {};

            // Email verification flow: account exists, but session should not be created yet.
            if (!data.accessToken && data.nextStep === 'CHECK_EMAIL') {
                return {
                    pendingVerification: true,
                    nextStep: data.nextStep,
                    email: userData.email || email,
                    username: userData.username || username,
                    message: data.message || 'Account created. Please check your email to verify your account.'
                };
            }

            const user = {
                id: userData.id || this.generateUserId(),
                username: userData.username || username,
                email: userData.email || email,
                displayName: userData.displayName || username,
                avatar: userData.avatarUrl || this.getDefaultAvatar(username),
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
            console.error('[Auth] Backend register failed:', err.message);
            throw err;
        }
    }

    async login(usernameOrEmail, password, rememberMe = true) {
        // Wait for backend detection to finish
        if (typeof api !== 'undefined' && api.ready) {
            try { await api.ready; } catch (e) { /* detection failed */ }
        }

        const backendReady = typeof CONFIG !== 'undefined'
            && CONFIG.features?.useBackendAPI
            && typeof api !== 'undefined'
            && typeof api.login === 'function';
        
        if (!backendReady) {
            throw new Error('Server connection unavailable. Please try again later.');
        }

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

    async logout() {
        // Try backend logout
        if (typeof api !== 'undefined' && api.isLoggedIn && api.isLoggedIn()) {
            try { await api.logout(); } catch (e) { /* ignore */ }
        }
        this.clearSession();
        this.updateUIForLoggedOutUser();
        if (typeof updateHeroCta === 'function') updateHeroCta();
        if (typeof showSection === 'function') {
            try { showSection('home'); } catch(e) {}
        }
    }

    async updateProfile(updates) {
        if (!this.currentUser) throw new Error('Not logged in');

        if (this.currentUser.backendUser && typeof api !== 'undefined' && typeof api.updateProfile === 'function') {
            const payload = {};
            if (updates.displayName != null) payload.display_name = updates.displayName;
            if (updates.bio != null) payload.bio = updates.bio;
            if (updates.location != null) payload.location = updates.location;
            if (updates.avatarUrl != null) payload.avatar_url = updates.avatarUrl;
            if (updates.favoriteTeam) payload.favorite_teams = [updates.favoriteTeam];
            if (updates.favoriteSport) payload.favorite_sports = [updates.favoriteSport];

            const result = await api.updateProfile(payload);
            const userData = result.user || {};
            this.currentUser = {
                ...this.currentUser,
                displayName: userData.display_name || this.currentUser.displayName,
                bio: userData.bio ?? this.currentUser.bio,
                location: userData.location ?? this.currentUser.location,
                avatar: userData.avatar_url || this.currentUser.avatar
            };
            this.persistSession();
            return this.currentUser;
        }

        const userIndex = this.users.findIndex(u => u.id === this.currentUser.id);
        if (userIndex === -1) {
            // Backend-authenticated users are not guaranteed to exist in the legacy local user store.
            // Keep session state aligned without forcing a local-only account shadow record.
            this.currentUser = { ...this.currentUser, ...updates };
            this.persistSession();
            return this.currentUser;
        }

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
        if (!this.currentUser) return;
        
        const username = this.currentUser.username || this.currentUser.displayName || 'User';
        const avatar = this.currentUser.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + username;
        const profileUrl = 'profile/?user=' + encodeURIComponent(username);
        
        // Update main navigation - modify "My Profile" link to show username
        const profileLink = document.querySelector('.profile-link');
        if (profileLink) {
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
            headerAuthButtons.innerHTML = `
                <a href="${profileUrl}" style="display: inline-flex; align-items: center; gap: 8px; color: var(--neon-cyan); text-decoration: none; font-weight: 600;">
                    <img src="${avatar}" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--neon-cyan);">
                    <span>${username}</span>
                </a>
                <button onclick="auth.logout(); window.location.href='/'" class="btn btn-secondary" style="padding: 8px 16px; font-size: 13px;">Logout</button>
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
            usernameLink.setAttribute('onclick', "if(typeof showSection==='function'){showSection('profile')}else{window.location.href='/profile/'}");
            usernameLink.textContent = 'My Profile';
        }
        // Remove user button from header-actions
        const userBtn = document.querySelector('.user-menu-btn');
        if (userBtn) userBtn.remove();
        
        // Restore header auth buttons to Login
        const headerAuthButtons = document.getElementById('headerAuthButtons');
        if (headerAuthButtons) {
                    headerAuthButtons.innerHTML = '<button onclick="if(typeof showSection===\'function\'){showSection(\'login\')}else{window.location.href=\'/sportsbook.html#login\'}" class="btn btn-primary" style="padding: 8px 20px; font-size: 14px;">Login</button>';
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
