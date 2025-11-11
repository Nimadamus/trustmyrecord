// Authentication System for Trust My Record
// Using localStorage for now, will upgrade to Firebase/Supabase

class AuthSystem {
    constructor() {
        this.currentUser = null;
        this.users = this.loadUsers();
        this.init();
    }

    init() {
        // Wait for DOM to be ready before updating UI
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initializeUI();
            });
        } else {
            this.initializeUI();
        }
    }

    initializeUI() {
        // Check if user is already logged in
        const sessionUser = localStorage.getItem('currentUser');
        if (sessionUser) {
            this.currentUser = JSON.parse(sessionUser);
            this.updateUIForLoggedInUser();
        } else {
            // Initialize navigation for logged-out users
            this.updateUIForLoggedOutUser();
        }
    }

    /**
     * Register a new user
     */
    register(username, email, password) {
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
            passwordHash: this.hashPassword(password), // Simple hash for demo
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
                }
            }
        };

        this.users.push(user);
        this.saveUsers();

        return user;
    }

    /**
     * Login user
     */
    login(usernameOrEmail, password) {
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
        localStorage.setItem('currentUser', JSON.stringify(user));

        this.updateUIForLoggedInUser();

        return user;
    }

    /**
     * Logout user
     */
    logout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        this.updateUIForLoggedOutUser();
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
        localStorage.setItem('currentUser', JSON.stringify(this.currentUser));

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
        localStorage.setItem('currentUser', JSON.stringify(this.currentUser));

        return !isFollowing; // Return new follow state
    }

    /**
     * Update UI for logged in user
     */
    updateUIForLoggedInUser() {
        // Update nav
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
            <a onclick="auth.logout()">Logout</a>
        `;

        const nav = document.querySelector('nav');
        if (nav) {
            nav.innerHTML = navHTML;
        }
    }

    /**
     * Update UI for logged out user
     */
    updateUIForLoggedOutUser() {
        const navHTML = `
            <a onclick="showSection('record')">The Record</a>
            <a onclick="showSection('arena')">The Arena</a>
            <a onclick="showSection('data')">Data Core</a>
            <a onclick="showSection('blog')">Blog</a>
            <a onclick="showSection('forums')">Forums</a>
            <a onclick="showSection('picks')" class="make-picks-link">Make Your Picks</a>
            <a onclick="showSection('app')">App</a>
            <a onclick="showSection('odds')">Live Odds</a>
            <a onclick="showSection('leaderboards')">Leaderboards</a>
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
        const stored = localStorage.getItem('trustmyrecord_users');
        return stored ? JSON.parse(stored) : [];
    }

    saveUsers() {
        localStorage.setItem('trustmyrecord_users', JSON.stringify(this.users));
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
            showSection('signup');
            throw new Error('You must be logged in to do that');
        }
    }
}

// Initialize auth system
const auth = new AuthSystem();

// Export
if (typeof window !== 'undefined') {
    window.auth = auth;
    window.AuthSystem = AuthSystem;
}
