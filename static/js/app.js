/**
 * TrustMyRecord - Main Application
 * Simple static site with localStorage auth
 */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('[TMR App] Initializing...');
    TMRApp.init();
});

const TMRApp = {
    init: function() {
        // Check if user is logged in using auth-persistent
        if (typeof auth !== 'undefined' && auth.isLoggedIn()) {
            this.onUserLoggedIn();
        } else {
            this.onUserLoggedOut();
        }

        // Set up event listeners
        this.setupEventListeners();

        console.log('[TMR App] Initialization complete');
    },

    setupEventListeners: function() {
        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', this.handleLogin.bind(this));
            console.log('[TMR] Login form listener attached');
        }

        // Signup form
        const signupForm = document.getElementById('signupForm');
        if (signupForm) {
            signupForm.addEventListener('submit', this.handleSignup.bind(this));
            console.log('[TMR] Signup form listener attached');
        }
    },

    // ============================================
    // AUTHENTICATION
    // ============================================

    handleLogin: function(e) {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const rememberMe = document.getElementById('rememberMe')?.checked ?? true;

        if (!email || !password) {
            this.showNotification('Please enter email and password', 'error');
            return;
        }

        try {
            const user = auth.login(email, password, rememberMe);
            console.log('[TMR] Login successful:', user.username);

            this.showNotification('Welcome back, ' + user.username + '!', 'success');
            this.onUserLoggedIn();

            // Redirect to feed
            if (typeof showSection === 'function') {
                showSection('feed');
            }

        } catch (error) {
            console.error('[TMR] Login error:', error);
            this.showNotification(error.message || 'Login failed', 'error');
        }
    },

    handleSignup: function(e) {
        e.preventDefault();

        const username = document.getElementById('username').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (!username || !email || !password) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }

        if (password !== confirmPassword) {
            this.showNotification('Passwords do not match', 'error');
            return;
        }

        try {
            const user = auth.register(username, email, password, true);
            console.log('[TMR] Registration successful:', user.username);

            this.showNotification('Account created! Welcome, ' + user.username + '!', 'success');
            this.onUserLoggedIn();

            // Redirect to feed
            if (typeof showSection === 'function') {
                showSection('feed');
            }

        } catch (error) {
            console.error('[TMR] Signup error:', error);
            this.showNotification(error.message || 'Registration failed', 'error');
        }
    },

    handleLogout: function() {
        auth.logout();
        this.onUserLoggedOut();
        this.showNotification('You have been logged out', 'info');
        if (typeof showSection === 'function') {
            showSection('record');
        }
    },

    onUserLoggedIn: function() {
        const user = auth.getCurrentUser();
        if (!user) return;

        // Update navigation
        this.updateNavForLoggedIn(user);

        console.log('[TMR] User logged in:', user.username);
    },

    onUserLoggedOut: function() {
        this.updateNavForLoggedOut();
        console.log('[TMR] User logged out');
    },

    updateNavForLoggedIn: function(user) {
        // Update header nav if it exists
        const userMenu = document.getElementById('userMenu');
        if (userMenu) {
            userMenu.innerHTML = `
                <a href="profile.html?username=${user.username}" class="user-avatar" style="text-decoration: none;">
                    ${user.username.charAt(0).toUpperCase()}
                </a>
                <button onclick="TMRApp.handleLogout()" class="btn btn-secondary" style="margin-left: 10px;">Logout</button>
            `;
        }

        // Update auth buttons if they exist
        const authButtons = document.getElementById('authButtons');
        if (authButtons) {
            authButtons.innerHTML = `
                <span style="color: var(--text-secondary); margin-right: 15px;">${user.username}</span>
                <a href="profile.html?username=${user.username}" class="btn btn-primary">Profile</a>
                <button onclick="TMRApp.handleLogout()" class="btn btn-secondary" style="margin-left: 10px;">Logout</button>
            `;
        }
    },

    updateNavForLoggedOut: function() {
        const userMenu = document.getElementById('userMenu');
        if (userMenu) {
            userMenu.innerHTML = `
                <button onclick="showSection('login')" class="btn btn-primary">Login</button>
            `;
        }

        const authButtons = document.getElementById('authButtons');
        if (authButtons) {
            authButtons.innerHTML = `
                <button onclick="showSection('login')" class="btn btn-secondary">Login</button>
                <button onclick="showSection('signup')" class="btn btn-primary" style="margin-left: 10px;">Sign Up</button>
            `;
        }
    },

    // ============================================
    // NOTIFICATIONS
    // ============================================

    showNotification: function(message, type = 'info') {
        // Create notification element
        const notif = document.createElement('div');
        notif.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        `;
        
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        
        notif.style.background = colors[type] || colors.info;
        notif.textContent = message;
        
        document.body.appendChild(notif);
        
        setTimeout(() => {
            notif.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notif.remove(), 300);
        }, 3000);
    }
};

// Add CSS animations
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
`;
document.head.appendChild(style);
