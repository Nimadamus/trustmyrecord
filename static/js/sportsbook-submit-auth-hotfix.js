(function() {
    'use strict';

    function getStoredToken() {
        try {
            return localStorage.getItem('trustmyrecord_token') ||
                localStorage.getItem('accessToken') ||
                localStorage.getItem('access_token') ||
                localStorage.getItem('token') ||
                localStorage.getItem('tmr_token') ||
                '';
        } catch (error) {
            return '';
        }
    }

    function getStoredRefreshToken() {
        try {
            return localStorage.getItem('trustmyrecord_refresh_token') ||
                localStorage.getItem('refreshToken') ||
                localStorage.getItem('tmr_refresh_token') ||
                localStorage.getItem('refresh_token') ||
                '';
        } catch (error) {
            return '';
        }
    }

    function hasCurrentUser() {
        try {
            if (window.auth && typeof window.auth.getCurrentUser === 'function') {
                var authUser = window.auth.getCurrentUser();
                if (authUser && (authUser.username || authUser.email)) return true;
            }
        } catch (error) {}
        try {
            return !!(window.auth && window.auth.currentUser && (window.auth.currentUser.username || window.auth.currentUser.email));
        } catch (error) {
            return false;
        }
    }

    function rememberUser(user) {
        if (!user || (!user.username && !user.email)) return null;
        try {
            if (window.api) window.api._cachedUser = user;
        } catch (error) {}
        try {
            if (window.auth) {
                window.auth.currentUser = user;
                if (typeof window.auth.persistSession === 'function') window.auth.persistSession();
            }
        } catch (error) {}
        try {
            localStorage.setItem('trustmyrecord_session', JSON.stringify({
                user: user,
                timestamp: Date.now(),
                rememberMe: true
            }));
        } catch (error) {}
        try {
            window.dispatchEvent(new CustomEvent('tmr-auth-changed', {
                detail: { loggedIn: true, user: user }
            }));
        } catch (error) {}
        return user;
    }

    async function hydrateBackendUser() {
        if (hasCurrentUser()) return true;
        if (!window.api || typeof window.api.getCurrentUser !== 'function') return false;
        if (!getStoredToken() && !getStoredRefreshToken() && !window.api.token && !window.api.refreshToken) return false;

        try {
            if (typeof window.api.loadTokens === 'function') window.api.loadTokens();
            if (!window.api.token && window.api.refreshToken && typeof window.api.refreshAccessToken === 'function') {
                await window.api.refreshAccessToken();
            }
            var data = await window.api.getCurrentUser();
            var user = data && (data.user || data);
            return !!rememberUser(user);
        } catch (error) {
            return false;
        }
    }

    async function submitAfterHydration() {
        await hydrateBackendUser();
        if (typeof window.__tmrProductionLockInPick === 'function') {
            await window.__tmrProductionLockInPick();
            return;
        }
        if (typeof window.submitPick === 'function') {
            await window.submitPick();
            return;
        }
        if (typeof window.lockInPick === 'function') {
            await window.lockInPick();
        }
    }

    document.addEventListener('click', function(event) {
        var target = event.target && event.target.closest && event.target.closest('#ttSlipSubmit,#submitPickBtn,#submitPickButton,button.submit-pick-btn,button.lock-pick-btn,[data-lock-pick-btn]');
        if (!target || target.dataset.tmrAuthHydrating === '1') return;
        if (!getStoredToken() && !getStoredRefreshToken() && !hasCurrentUser()) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        target.dataset.tmrAuthHydrating = '1';
        var originalText = target.textContent;
        if (/lock pick|submit/i.test(originalText || '')) target.textContent = 'Locking...';
        submitAfterHydration().finally(function() {
            delete target.dataset.tmrAuthHydrating;
            if (/locking/i.test(target.textContent || '') && originalText) target.textContent = originalText;
        });
    }, true);
})();
