// Enhanced Authentication System with PERMANENT Login
// v3.1 - Dec 8, 2025

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
                avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
                bio: 'Site Administrator',
                joinedDate: new Date().toISOString(),
                verified: true,
                stats: { totalPicks: 0, wins: 0, losses: 0, pushes: 0, winRate: 0, roi: 0 },
                social: { followers: [], following: [], reputation: 100, badges: ['admin'] },
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
                avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=betlegend',
                bio: 'Founder',
                joinedDate: '2025-10-01',
                verified: true,
                stats: { totalPicks: 247, wins: 152, losses: 89, pushes: 6, winRate: 63.1, roi: 14.7 },
                social: { followers: [], following: [], reputation: 500, badges: ['founder', 'verified'] },
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
                avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
                bio: 'Test Account',
                joinedDate: '2025-11-01',
                verified: false,
                stats: { totalPicks: 25, wins: 15, losses: 9, pushes: 1, winRate: 62.5, roi: 8.3 },
                social: { followers: [], following: [], reputation: 50, badges: ['newbie'] },
                isPremium: false
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
    }

    isRememberMe() { return localStorage.getItem(this.rememberKey) === 'true'; }
    setRememberMe(value) { localStorage.setItem(this.rememberKey, value ? 'true' : 'false'); }

    initializeUI() {
        if (this.currentUser) this.updateUIForLoggedInUser();
        else this.updateUIForLoggedOutUser();
    }

    register(username, email, password, rememberMe = true) {
        if (!username || !email || !password) throw new Error('All fields are required');
        if (username.length < 3) throw new Error('Username must be at least 3 characters');
        if (password.length < 6) throw new Error('Password must be at least 6 characters');
        if (this.users.find(u => u.username.toLowerCase() === username.toLowerCase())) throw new Error('Username already taken');
        if (this.users.find(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error('Email already registered');

        const user = {
            id: this.generateUserId(),
            username, email,
            passwordHash: this.hashPassword(password),
            displayName: username,
            avatar: this.getDefaultAvatar(),
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

    login(usernameOrEmail, password, rememberMe = true) {
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

    logout() {
        this.clearSession();
        this.updateUIForLoggedOutUser();
        if (typeof showSection === 'function') showSection('record');
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
        if (!this.currentUser) return;
        const nav = document.querySelector('nav');
        if (nav) {
            nav.innerHTML = '<a onclick="showSection(\'record\')">The Record</a><a onclick="showSection(\'arena\')">The Arena</a><a onclick="showSection(\'search\')">Search</a><a onclick="showSection(\'feed\')">Feed</a><a onclick="showSection(\'picks\')" class="make-picks-link">Make Picks</a><a onclick="showSection(\'leaderboards\')">Leaderboards</a><a onclick="showProfile(\'' + this.currentUser.username + '\')"><img src="' + this.currentUser.avatar + '" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:5px;">' + this.currentUser.username + '</a><a onclick="auth.logout()" style="color: var(--neon-red);">Logout</a>';
        }
    }

    updateUIForLoggedOutUser() {
        const nav = document.querySelector('nav');
        if (nav) {
            nav.innerHTML = '<a onclick="showSection(\'record\')">The Record</a><a onclick="showSection(\'arena\')">The Arena</a><a onclick="showSection(\'picks\')" class="make-picks-link">Make Your Picks</a><a onclick="showSection(\'leaderboards\')">Leaderboards</a><a onclick="showSection(\'forums\')">Forums</a><a onclick="showSection(\'login\')" class="login-btn">Login</a><a onclick="showSection(\'signup\')" class="signup-btn">Sign Up</a>';
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

    getDefaultAvatar() {
        const avatars = ['https://api.dicebear.com/7.x/avataaars/svg?seed=1','https://api.dicebear.com/7.x/avataaars/svg?seed=2','https://api.dicebear.com/7.x/avataaars/svg?seed=3'];
        return avatars[Math.floor(Math.random() * avatars.length)];
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
}
console.log('Auth System loaded');
