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

        if (!this.users.find(u => u.username === 'testuser')) {
            this.users.push({
                id: 'user_testuser',
                username: 'testuser',
                email: 'test@example.com',
                passwordHash: this.hashPassword('password123'),
                displayName: 'Test User',
                avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=testuser',
                bio: 'Test Account for Development',
                joinedDate: new Date().toISOString(),
                verified: true,
                stats: { totalPicks: 16, wins: 10, losses: 5, pushes: 1, winRate: 62.5, roi: 12.5 },
                social: { followers: [], following: [], reputation: 100, badges: ['tester'] },
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
    }

    isRememberMe() { return localStorage.getItem(this.rememberKey) === 'true'; }
    setRememberMe(value) { localStorage.setItem(this.rememberKey, value ? 'true' : 'false'); }

    initializeUI() {
        console.log('[Auth] Initializing UI. Current user:', (this.currentUser ? this.currentUser.username : null) || 'none');
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
                <button onclick="auth.logout(); location.reload();" class="btn btn-secondary" style="padding: 8px 16px; font-size: 13px;">Logout</button>
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
            usernameLink.setAttribute('onclick', "showSection('profile')");
            usernameLink.textContent = 'My Profile';
        }
        // Remove user button from header-actions
        const userBtn = document.querySelector('.user-menu-btn');
        if (userBtn) userBtn.remove();
        
        // Restore header auth buttons to Login
        const headerAuthButtons = document.getElementById('headerAuthButtons');
        if (headerAuthButtons) {
            headerAuthButtons.innerHTML = '<button onclick="showSection('login')" class="btn btn-primary" style="padding: 8px 20px; font-size: 14px;">Login</button>';
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


// Debug: Log all clicks on nav-username-link
document.addEventListener('click', function(e) {
    if (e.target.closest('.nav-username-link')) {
        console.log('[Debug] Username link clicked!', e.target.closest('.nav-username-link').href);
    }
});
