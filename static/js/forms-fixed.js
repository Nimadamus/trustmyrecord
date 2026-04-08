// Fixed Forms Handling - Local Auth Only (No Backend)

// Wrap everything in try-catch to catch any errors
async function handleLogin(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.loginStarted({ button_location: 'login_modal' });

    try {
        const email = document.getElementById('loginEmail')?.value;
        const password = document.getElementById('loginPassword')?.value;

        // Check if auth exists
        if (typeof auth === 'undefined') {
            console.error('[TMR] auth object is undefined!');
            alert('Auth system not loaded. Please refresh the page.');
            return;
        }

        // Check if auth.login is a function
        if (typeof auth.login !== 'function') {
            console.error('[TMR] auth.login is not a function!', auth);
            alert('Auth system error. Please refresh the page.');
            return;
        }

        // Get remember me
        const rememberMeEl = document.getElementById('rememberMe');
        const rememberMe = rememberMeEl ? rememberMeEl.checked : true;

        // Attempt login
        let result = auth.login(email, password, rememberMe);
        // Handle both sync and async login
        if (result && typeof result.then === 'function') {
            result = await result;
        }

        // Check result format (some return {success, user}, some return user directly)
        var user = null;
        if (result && result.success === false) {
            throw new Error(result.error || 'Invalid credentials');
        } else if (result && result.user) {
            user = result.user;
        } else if (result && result.username) {
            user = result;
        }

        if (!user) {
            throw new Error('Login returned no user');
        }

        // Ensure tmr_* keys are set (belt and suspenders)
        localStorage.setItem('tmr_is_logged_in', 'true');
        localStorage.setItem('tmr_current_user', JSON.stringify(user));

        // Reset form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) loginForm.reset();

        // Close modal
        const modal = document.getElementById('loginModal');
        if (modal) modal.style.display = 'none';

        // Check for post-auth redirect (e.g., user clicked "Post a Pick" from homepage)
        var postAuthRedirect = sessionStorage.getItem('tmr_post_auth_redirect');
        if (postAuthRedirect) {
            sessionStorage.removeItem('tmr_post_auth_redirect');
            if (typeof window.showSection === 'function') {
                window.showSection(postAuthRedirect);
            }
        } else {
            // Navigate to profile within SPA
            if (typeof window.showSection === 'function') {
                window.showSection('profile');
            }
        }
        // Update hero CTA and nav UI
        if (typeof updateHeroCta === 'function') updateHeroCta();
        if (typeof updateHeaderAuthButtons === 'function') updateHeaderAuthButtons();
        if (typeof updateProfileLink === 'function') updateProfileLink();

        if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.loginCompleted({ username: user.username });

    } catch (error) {
        console.error('[TMR] Login error:', error.message);
        alert('Login failed: ' + error.message);
    }
}

async function handleSignup(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.signUpStarted({ button_location: 'signup_modal' });

    try {
        const username = document.getElementById('signupUsername')?.value;
        const email = document.getElementById('signupEmail')?.value;
        const password = document.getElementById('signupPassword')?.value;
        const confirmPassword = document.getElementById('confirmPassword')?.value;
        const favoriteTeam = document.getElementById('favoriteTeam')?.value?.trim() || '';
        const favoriteSport = document.getElementById('favoriteSport')?.value || '';
        const displayName = document.getElementById('displayName')?.value?.trim() || '';
        const location = document.getElementById('location')?.value?.trim() || '';
        const bio = document.getElementById('bio')?.value?.trim() || '';

        if (!username || !email || !password) {
            alert('All fields are required');
            return;
        }
        if (password !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }

        if (typeof auth === 'undefined') {
            console.error('[TMR] auth object is undefined!');
            alert('Auth system not loaded. Please refresh the page.');
            return;
        }

        let result = auth.register(username, email, password);
        // Handle both sync and async register
        if (result && typeof result.then === 'function') {
            result = await result;
        }

        if (result && result.success === false) {
            throw new Error(result.error || 'Registration failed');
        }

        // Save optional profile fields that register() doesn't capture
        if (result && typeof auth.updateProfile === 'function') {
            var profileUpdates = {};
            if (displayName) profileUpdates.displayName = displayName;
            if (bio) profileUpdates.bio = bio;
            if (location) profileUpdates.location = location;
            if (favoriteTeam) profileUpdates.favoriteTeam = favoriteTeam;
            if (favoriteSport) profileUpdates.favoriteSport = favoriteSport;
            if (Object.keys(profileUpdates).length > 0) {
                try { auth.updateProfile(profileUpdates); } catch(e) { console.warn('[TMR] Profile update after signup:', e.message); }
            }
        }

        // Ensure tmr_* keys are set (belt and suspenders)
        localStorage.setItem('tmr_is_logged_in', 'true');
        // auth.register() returns user object directly (not wrapped in {user:...})
        var userData = (result && result.user) ? result.user : (result && result.username) ? result : { username: username, email: email };
        localStorage.setItem('tmr_current_user', JSON.stringify(userData));

        alert('Account created successfully! You are now logged in.');

        const signupForm = document.getElementById('signupForm');
        if (signupForm) signupForm.reset();

        const modal = document.getElementById('signupModal');
        if (modal) modal.style.display = 'none';

        // Check for post-auth redirect (e.g., user clicked "Post a Pick" from homepage)
        var postAuthRedirect = sessionStorage.getItem('tmr_post_auth_redirect');
        if (postAuthRedirect) {
            sessionStorage.removeItem('tmr_post_auth_redirect');
            if (typeof window.showSection === 'function') {
                window.showSection(postAuthRedirect);
            }
        } else {
            // Navigate to profile within SPA
            if (typeof window.showSection === 'function') {
                window.showSection('profile');
            }
        }
        if (typeof updateHeroCta === 'function') updateHeroCta();
        if (typeof updateHeaderAuthButtons === 'function') updateHeaderAuthButtons();
        if (typeof updateProfileLink === 'function') updateProfileLink();

        if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.signUpCompleted({ username: username, favorite_sport: favoriteSport });

    } catch (error) {
        console.error('[TMR] Signup error:', error);
        alert('Registration failed: ' + error.message);
    }
}

// Attach event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Try both ID formats: camelCase and hyphenated
    const loginForm = document.getElementById('loginForm') || document.getElementById('login-form');
    const signupForm = document.getElementById('signupForm') || document.getElementById('signup-form');

    if (loginForm) {
        // Remove any existing handlers
        loginForm.onsubmit = null;
        // Remove all existing event listeners by cloning
        const newLoginForm = loginForm.cloneNode(true);
        loginForm.parentNode.replaceChild(newLoginForm, loginForm);
        // Add our handler
        newLoginForm.addEventListener('submit', handleLogin);
    }

    if (signupForm) {
        const newSignupForm = signupForm.cloneNode(true);
        signupForm.parentNode.replaceChild(newSignupForm, signupForm);
        newSignupForm.addEventListener('submit', handleSignup);
    }
});
