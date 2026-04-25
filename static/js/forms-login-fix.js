// Live login hotfix - bypass stale cached auth wrappers when needed
(function() {
    async function directBackendLoginFallback(usernameOrEmail, password, rememberMe) {
        const baseUrl = (typeof CONFIG !== 'undefined' && CONFIG.api && CONFIG.api.baseUrl)
            ? String(CONFIG.api.baseUrl).replace(/\/+$/, '')
            : 'https://trustmyrecord-api.onrender.com/api';

        const response = await fetch(baseUrl + '/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                login: usernameOrEmail,
                password
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || data.message || 'Login failed');
            error.code = data.code;
            error.data = data;
            throw error;
        }

        if (typeof api !== 'undefined' && typeof api.saveTokens === 'function') {
            api.saveTokens(data.accessToken || data.access_token, data.refreshToken || data.refresh_token);
        }

        const userData = data.user || {};
        const user = {
            id: userData.id || (typeof auth !== 'undefined' && typeof auth.generateUserId === 'function' ? auth.generateUserId() : ('user_' + Date.now())),
            username: userData.username || usernameOrEmail,
            email: userData.email || '',
            displayName: userData.displayName || userData.username || usernameOrEmail,
            avatar: userData.avatarUrl || (typeof auth !== 'undefined' && typeof auth.getDefaultAvatar === 'function' ? auth.getDefaultAvatar(userData.username || usernameOrEmail) : ''),
            bio: userData.bio || '',
            joinedDate: userData.created_at || new Date().toISOString(),
            verified: !!userData.emailVerified,
            stats: { totalPicks: 0, wins: 0, losses: 0, pushes: 0, winRate: 0, roi: 0 },
            social: { followers: [], following: [], reputation: 0, badges: [] },
            isPremium: false,
            backendUser: true
        };

        if (typeof auth !== 'undefined') {
            auth.currentUser = user;
            if (typeof auth.setRememberMe === 'function') auth.setRememberMe(rememberMe);
            if (typeof auth.persistSession === 'function') auth.persistSession();
            if (typeof auth.updateUIForLoggedInUser === 'function') auth.updateUIForLoggedInUser();
        }

        return user;
    }

    async function enhancedHandleLogin(event) {
        event.preventDefault();
        event.stopPropagation();

        const loginValue = String(document.getElementById('loginEmail')?.value || '').trim();
        const password = document.getElementById('loginPassword')?.value || '';
        const loginMessage = document.getElementById('loginFormMessage');
        const forgotPasswordLink = document.getElementById('forgotPasswordLink');
        const rememberMe = !!document.getElementById('rememberMe')?.checked;

        if (loginMessage) {
            loginMessage.style.display = 'none';
            loginMessage.textContent = '';
        }
        if (forgotPasswordLink) {
            forgotPasswordLink.href = '/reset-password/' + (loginValue ? ('?login=' + encodeURIComponent(loginValue)) : '');
        }

        try {
            let user;
            try {
                if (typeof auth === 'undefined' || typeof auth.login !== 'function') {
                    throw new Error('Auth system not loaded. Please refresh the page.');
                }
                user = await auth.login(loginValue, password, rememberMe);
            } catch (error) {
                if (error && error.message === 'Invalid credentials') {
                    user = await directBackendLoginFallback(loginValue, password, rememberMe);
                } else {
                    throw error;
                }
            }

            const loginForm = document.getElementById('loginForm') || document.getElementById('login-form');
            if (loginForm) loginForm.reset();

            const modal = document.getElementById('loginModal');
            if (modal) modal.style.display = 'none';

            const postAuthRedirect = sessionStorage.getItem('tmr_post_auth_redirect');
            if (postAuthRedirect) {
                sessionStorage.removeItem('tmr_post_auth_redirect');
                if (typeof window.showSection === 'function') window.showSection(postAuthRedirect);
            } else if (typeof window.showSection === 'function') {
                window.showSection('profile');
            }

            if (typeof updateHeroCta === 'function') updateHeroCta();
            if (typeof updateHeaderAuthButtons === 'function') updateHeaderAuthButtons();
            if (typeof updateProfileLink === 'function') updateProfileLink();
            if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.loginCompleted({ username: user.username });
        } catch (error) {
            console.error('[TMR] Enhanced login error:', error.message);
            if (error && error.code === 'EMAIL_NOT_VERIFIED') {
                const email = error.data?.email || '';
                window.location.href = '/verify-email/' + (email ? ('?email=' + encodeURIComponent(email)) : '');
                return;
            }
            if (loginMessage && error && error.message === 'Invalid credentials') {
                loginMessage.style.display = 'block';
                loginMessage.style.borderColor = 'rgba(255, 107, 107, 0.35)';
                loginMessage.style.background = 'rgba(255, 107, 107, 0.08)';
                loginMessage.style.color = '#ffd5d5';
                const resetHref = '/reset-password/' + (loginValue ? ('?login=' + encodeURIComponent(loginValue)) : '');
                loginMessage.innerHTML = 'That username/email and password do not match. If this is your account, <a href="' + resetHref + '" style="color:#ffffff;text-decoration:underline;font-weight:700;">reset your password here</a>.';
                return;
            }
            alert('Login failed: ' + (error && error.message ? error.message : 'Unknown error'));
        }
    }

    function bindEnhancedLogin() {
        const loginForm = document.getElementById('loginForm') || document.getElementById('login-form');
        if (!loginForm || loginForm.dataset.tmrEnhancedLoginBound === 'true') return;
        loginForm.onsubmit = null;
        const newLoginForm = loginForm.cloneNode(true);
        loginForm.parentNode.replaceChild(newLoginForm, loginForm);
        newLoginForm.dataset.tmrEnhancedLoginBound = 'true';
        newLoginForm.addEventListener('submit', enhancedHandleLogin);
    }

    document.addEventListener('DOMContentLoaded', bindEnhancedLogin);
    window.addEventListener('load', bindEnhancedLogin);
    setTimeout(bindEnhancedLogin, 1200);
})();
