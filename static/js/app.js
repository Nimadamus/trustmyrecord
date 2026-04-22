/**
 * Trust My Record - Main Application
 * Handles routing, UI interactions, and page initialization
 */

const App = {
    currentPage: null,
    currentUser: null,

    // ============================================
    // INITIALIZATION
    // ============================================

    init() {
        this.checkAuth();
        this.bindGlobalEvents();
        this.updateNavigation();
        this.initCurrentPage();
    },

    checkAuth() {
        // Use auth-persistent system which has localStorage fallback
        if (typeof auth !== 'undefined' && auth.isLoggedIn()) {
            this.currentUser = auth.getCurrentUser();
            this.updateUserUI();
        }
    },

    bindGlobalEvents() {
        // Mobile menu toggle
        document.getElementById('mobile-menu-btn')?.addEventListener('click', this.toggleMobileMenu);
        document.getElementById('close-mobile-menu')?.addEventListener('click', this.toggleMobileMenu);
        document.getElementById('mobile-menu-overlay')?.addEventListener('click', this.toggleMobileMenu);

        // Auth modals
        document.getElementById('login-btn')?.addEventListener('click', () => {
            if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.loginStarted({ button_location: 'nav_bar' });
            this.showModal('login-modal');
        });
        document.getElementById('signup-btn')?.addEventListener('click', () => {
            if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.signUpStarted({ button_location: 'nav_bar' });
            this.showModal('signup-modal');
        });
        document.getElementById('mobile-login-btn')?.addEventListener('click', () => {
            this.toggleMobileMenu();
            this.showModal('login-modal');
        });
        document.getElementById('mobile-signup-btn')?.addEventListener('click', () => {
            this.toggleMobileMenu();
            this.showModal('signup-modal');
        });

        // Close modals
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                this.hideModal(modal.id);
            });
        });

        // Click outside to close
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });

        // Auth forms
        document.getElementById('login-form')?.addEventListener('submit', this.handleLogin.bind(this));
        document.getElementById('signup-form')?.addEventListener('submit', this.handleSignup.bind(this));

        // Logout
        document.getElementById('logout-btn')?.addEventListener('click', this.handleLogout.bind(this));

        // Pick form
        document.getElementById('pick-form')?.addEventListener('submit', this.handlePickSubmit.bind(this));

        // Odds type toggle
        document.getElementById('odds-type')?.addEventListener('change', (e) => {
            const value = e.target.value;
            document.getElementById('american-odds-group').style.display = value === 'american' ? 'block' : 'none';
            document.getElementById('decimal-odds-group').style.display = value === 'decimal' ? 'block' : 'none';
        });
    },

    initCurrentPage() {
        const path = window.location.pathname;
        
        if (path === '/' || path === '/index.html') {
            this.initDashboard();
        } else if (path.includes('/leaderboard')) {
            this.initLeaderboard();
        } else if (path.includes('/picks')) {
            this.initPicksPage();
        } else if (path.includes('/forum')) {
            this.initForum();
        } else if (path.includes('/profile')) {
            this.initProfile();
        }
    },

    // ============================================
    // UI HELPERS
    // ============================================

    toggleMobileMenu() {
        const menu = document.getElementById('mobile-menu');
        const overlay = document.getElementById('mobile-menu-overlay');
        menu.classList.toggle('hidden');
        overlay.classList.toggle('hidden');
        document.body.classList.toggle('overflow-hidden');
    },

    showModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    },

    hideModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
        document.body.style.overflow = '';
    },

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 z-50 ${
            type === 'success' ? 'bg-green-500' : 'bg-red-500'
        } text-white`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // ============================================
    // AUTHENTICATION
    // ============================================

    async handleLogin(e) {
        e.preventDefault();
        // Delegate to forms-fixed.js / auth-persistent.js handler
        // This is a fallback in case forms-fixed.js didn't attach
        const form = e.target;
        const email = form.querySelector('#loginEmail')?.value;
        const password = form.querySelector('#loginPassword')?.value;
        const rememberMe = form.querySelector('#rememberMe')?.checked;

        if (!email || !password) {
            this.showToast('Please enter both email and password', 'error');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Logging in...';
        }

        try {
            // Use auth system which has localStorage fallback
            if (typeof auth !== 'undefined' && auth.login) {
                await auth.login(email, password, rememberMe);
            } else {
                throw new Error('Auth system not available');
            }
            this.showToast('Welcome back!');
            if (typeof showSection === 'function') showSection('profile');
        } catch (error) {
            this.showToast(error.message || 'Login failed', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'LOGIN';
            }
        }
    },

    async handleSignup(e) {
        e.preventDefault();
        const form = e.target;
        const username = form.querySelector('#signupUsername')?.value;
        const email = form.querySelector('#signupEmail')?.value;
        const password = form.querySelector('#signupPassword')?.value;
        const confirmPassword = form.querySelector('#confirmPassword')?.value;

        if (!username || !email || !password) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }

        if (password !== confirmPassword) {
            this.showToast('Passwords do not match', 'error');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating account...';
        }

        try {
            if (typeof auth !== 'undefined' && auth.register) {
                await auth.register(username, email, password);
            } else {
                throw new Error('Auth system not available');
            }
            this.showToast('Account created successfully!');
            if (typeof showSection === 'function') showSection('profile');
        } catch (error) {
            this.showToast(error.message || 'Registration failed', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'CREATE ACCOUNT';
            }
        }
    },

    handleLogout() {
        if (typeof auth !== 'undefined') {
            auth.logout();
        }
        this.updateNavigation();
        this.showToast('Logged out successfully');
        setTimeout(() => window.location.href = '/', 500);
    },

    updateNavigation() {
        const authBtns = document.getElementById('auth-buttons');
        const userMenu = document.getElementById('user-menu');
        const mobileAuthBtns = document.getElementById('mobile-auth-buttons');
        const mobileUserMenu = document.getElementById('mobile-user-menu');

        const loggedIn = (typeof auth !== 'undefined' && auth.isLoggedIn());
        if (loggedIn) {
            authBtns?.classList.add('hidden');
            userMenu?.classList.remove('hidden');
            mobileAuthBtns?.classList.add('hidden');
            mobileUserMenu?.classList.remove('hidden');
        } else {
            authBtns?.classList.remove('hidden');
            userMenu?.classList.add('hidden');
            mobileAuthBtns?.classList.remove('hidden');
            mobileUserMenu?.classList.add('hidden');
        }
    },

    updateUserUI() {
        if (this.currentUser) {
            const usernameEl = document.getElementById('user-username');
            const avatarEl = document.getElementById('user-avatar');
            if (usernameEl) usernameEl.textContent = this.currentUser.username;
            if (avatarEl && this.currentUser.avatar_url) {
                avatarEl.src = this.currentUser.avatar_url;
            }
        }
    },

    // ============================================
    // PICKS
    // ============================================

    async handlePickSubmit(e) {
        e.preventDefault();
        if (!api.isLoggedIn()) {
            this.showModal('login-modal');
            return;
        }

        if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.makePickStarted({ button_location: 'pick_form' });

        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Posting...';

        const oddsType = form.querySelector('#odds-type').value;
        const odds = oddsType === 'american'
            ? form.querySelector('#american-odds').value
            : form.querySelector('#decimal-odds').value;

        const pickData = {
            event: form.event.value,
            pick: form.pick.value,
            odds: parseFloat(odds),
            odds_type: oddsType,
            sport: form.sport.value,
            league: form.league.value,
            stake: parseFloat(form.stake.value) || null
        };

        try {
            await api.createPick(pickData);
            form.reset();
            this.showToast('Pick posted successfully!');
            if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.pickSubmitted({ sport: pickData.sport, pick_type: pickData.pick, odds: pickData.odds, units: pickData.stake, league: pickData.league });
            this.loadFeed();
        } catch (error) {
            this.showToast(error.message || 'Failed to post pick', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Post Pick';
        }
    },

    createPickCard(pick) {
        const statusColors = {
            pending: 'bg-yellow-500',
            won: 'bg-green-500',
            lost: 'bg-red-500',
            push: 'bg-gray-500'
        };

        const card = document.createElement('div');
        card.className = 'bg-slate-800 rounded-lg p-4 border border-slate-700 mb-4';
        card.innerHTML = `
            <div class="flex items-start gap-3">
                <img src="${pick.user_avatar || '/static/images/default-avatar.png'}" 
                     alt="${pick.username}" 
                     class="w-10 h-10 rounded-full">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <a href="/profile/${pick.username}" class="font-semibold hover:text-blue-400">${pick.username}</a>
                        <span class="text-xs text-slate-400">${this.formatTime(pick.created_at)}</span>
                        <span class="text-xs px-2 py-0.5 rounded ${statusColors[pick.status]} text-white">${pick.status}</span>
                    </div>
                    <div class="mt-2">
                        <div class="text-lg font-bold">${pick.pick}</div>
                        <div class="text-sm text-slate-400">${pick.event}</div>
                        <div class="flex items-center gap-4 mt-2 text-sm">
                            <span class="text-green-400 font-semibold">${pick.odds > 0 ? '+' : ''}${pick.odds}</span>
                            <span class="text-slate-400">${pick.sport} • ${pick.league}</span>
                        </div>
                    </div>
                    ${pick.result ? `
                    <div class="mt-3 pt-3 border-t border-slate-700 flex items-center gap-4">
                        <span class="text-sm">Result: <span class="font-bold ${pick.result === 'won' ? 'text-green-400' : pick.result === 'lost' ? 'text-red-400' : 'text-gray-400'}">${pick.result.toUpperCase()}</span></span>
                        ${pick.profit_loss !== undefined ? `
                            <span class="text-sm ${pick.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}">
                                ${pick.profit_loss >= 0 ? '+' : ''}${pick.profit_loss.toFixed(2)}u
                            </span>
                        ` : ''}
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        return card;
    },

    // ============================================
    // DASHBOARD
    // ============================================

    async initDashboard() {
        this.loadFeed();
        this.loadTrendingPicks();
        this.loadLeaderboardPreview();
    },

    async loadFeed() {
        const feedContainer = document.getElementById('feed-container');
        if (!feedContainer) return;

        try {
            feedContainer.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
            const picks = await api.getPicks({ limit: 10 });
            feedContainer.innerHTML = '';
            picks.forEach(pick => {
                feedContainer.appendChild(this.createPickCard(pick));
            });
        } catch (error) {
            feedContainer.innerHTML = '<div class="text-center py-8 text-slate-400">Failed to load feed</div>';
        }
    },

    async loadTrendingPicks() {
        const container = document.getElementById('trending-picks');
        if (!container) return;

        try {
            const picks = await api.getPicks({ trending: true, limit: 5 });
            container.innerHTML = '';
            picks.forEach(pick => {
                container.appendChild(this.createTrendingItem(pick));
            });
        } catch (error) {
            container.innerHTML = '<div class="text-sm text-slate-400">No trending picks</div>';
        }
    },

    createTrendingItem(pick) {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between py-2 border-b border-slate-700 last:border-0';
        div.innerHTML = `
            <div>
                <div class="font-medium text-sm">${pick.pick}</div>
                <div class="text-xs text-slate-400">${pick.username} • ${pick.odds > 0 ? '+' : ''}${pick.odds}</div>
            </div>
            <span class="text-xs text-green-400">${pick.likes || 0} likes</span>
        `;
        return div;
    },

    async loadLeaderboardPreview() {
        const container = document.getElementById('leaderboard-preview');
        if (!container) return;

        try {
            const data = await api.getLeaderboard('roi', { limit: 5 });
            container.innerHTML = '';
            data.leaderboard.forEach((user, index) => {
                container.appendChild(this.createLeaderboardItem(user, index + 1));
            });
        } catch (error) {
            container.innerHTML = '<div class="text-sm text-slate-400">Leaderboard unavailable</div>';
        }
    },

    createLeaderboardItem(user, rank) {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between py-2 border-b border-slate-700 last:border-0';
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="font-bold ${rank <= 3 ? 'text-yellow-400' : 'text-slate-400'} w-6">#${rank}</span>
                <img src="${user.avatar_url || '/static/images/default-avatar.png'}" class="w-8 h-8 rounded-full">
                <span class="font-medium">${user.username}</span>
            </div>
            <span class="text-green-400 font-semibold">${user.roi.toFixed(1)}% ROI</span>
        `;
        return div;
    },

    // ============================================
    // LEADERBOARD
    // ============================================

    async initLeaderboard() {
        const metricBtns = document.querySelectorAll('[data-metric]');
        metricBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                metricBtns.forEach(b => b.classList.remove('bg-blue-600', 'text-white'));
                e.target.classList.add('bg-blue-600', 'text-white');
                this.loadFullLeaderboard(e.target.dataset.metric);
            });
        });

        // Load initial
        this.loadFullLeaderboard('roi');
    },

    initPicksPage() {
        const path = window.location.pathname || '';
        const onSportsbookDocument = path.includes('/sportsbook') || path.endsWith('/sportsbook.html');

        // Legacy deep links like /picks should land on the sportsbook picks board.
        if (!onSportsbookDocument) {
            window.location.replace('/sportsbook.html#picks');
            return;
        }

        if (typeof window.showSection === 'function') {
            try {
                window.showSection('picks');
            } catch (error) {
                // Leave the page as-is if the sportsbook shell owns routing.
            }
        }
    },

    async loadFullLeaderboard(metric) {
        const container = document.getElementById('leaderboard-full');
        if (!container) return;

        try {
            container.innerHTML = '<div class="text-center py-12"><i class="fas fa-spinner fa-spin text-3xl"></i></div>';
            const data = await api.getLeaderboard(metric, { limit: 50 });
            container.innerHTML = '';
            
            data.leaderboard.forEach((user, index) => {
                container.appendChild(this.createLeaderboardRow(user, index + 1, metric));
            });
        } catch (error) {
            container.innerHTML = '<div class="text-center py-12 text-slate-400">Failed to load leaderboard</div>';
        }
    },

    createLeaderboardRow(user, rank, metric) {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between p-4 bg-slate-800 rounded-lg border border-slate-700 mb-2';
        
        const medalColors = {
            1: 'text-yellow-400',
            2: 'text-gray-400',
            3: 'text-amber-600'
        };

        const metricValue = user[metric] || 0;
        const displayValue = metric === 'roi' ? `${metricValue.toFixed(1)}%` : 
                           metric === 'win_rate' ? `${metricValue.toFixed(1)}%` : 
                           metricValue.toFixed(1);

        row.innerHTML = `
            <div class="flex items-center gap-4">
                <span class="font-bold text-lg ${medalColors[rank] || 'text-slate-400'} w-8">#${rank}</span>
                <img src="${user.avatar_url || '/static/images/default-avatar.png'}" class="w-12 h-12 rounded-full">
                <div>
                    <a href="/profile/${user.username}" class="font-bold text-lg hover:text-blue-400">${user.username}</a>
                    <div class="text-sm text-slate-400">${user.total_picks || 0} picks</div>
                </div>
            </div>
            <div class="text-right">
                <div class="text-2xl font-bold ${metricValue >= 0 ? 'text-green-400' : 'text-red-400'}">${displayValue}</div>
                <div class="text-sm text-slate-400">${metric.toUpperCase()}</div>
            </div>
        `;
        return row;
    },

    // ============================================
    // UTILITIES
    // ============================================

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = (now - date) / 1000;

        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return (date.getMonth()+1) + '/' + date.getDate() + '/' + String(date.getFullYear()).slice(-2);
    },

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
