// Fixed Forms Handling - Backend API Integration
// v2.0 - Apr 12, 2026

// Wrap everything in try-catch to catch any errors
async function handleLogin(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.loginStarted({ button_location: 'login_modal' });

    try {
        const email = document.getElementById('loginEmail')?.value;
        const password = document.getElementById('loginPassword')?.value;
        const loginMessage = document.getElementById('loginFormMessage');
        const forgotPasswordLink = document.getElementById('forgotPasswordLink');

        if (loginMessage) {
            loginMessage.style.display = 'none';
            loginMessage.textContent = '';
        }
        if (forgotPasswordLink) {
            const loginValue = String(email || '').trim();
            forgotPasswordLink.href = '/reset-password/' + (loginValue ? ('?login=' + encodeURIComponent(loginValue)) : '');
        }

        // Check if auth exists
        if (typeof auth === 'undefined') {
            console.error('[TMR] auth object is undefined!');
            alert('Auth system not loaded. Please refresh the page.');
            return;
        }

        // Get remember me
        const rememberMeEl = document.getElementById('rememberMe');
        const rememberMe = rememberMeEl ? rememberMeEl.checked : true;

        // Attempt login via backend-aware auth system
        const user = await auth.login(email, password, rememberMe);

        // Reset form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) loginForm.reset();

        // Close modal
        const modal = document.getElementById('loginModal');
        if (modal) modal.style.display = 'none';

        // Check for post-auth redirect
        var postAuthRedirect = sessionStorage.getItem('tmr_post_auth_redirect');
        if (postAuthRedirect) {
            sessionStorage.removeItem('tmr_post_auth_redirect');
            if (typeof window.showSection === 'function') {
                window.showSection(postAuthRedirect);
            }
        } else {
            // Navigate to profile
            if (typeof window.showSection === 'function') {
                window.showSection('profile');
            }
        }
        
        // Update UI
        if (typeof updateHeroCta === 'function') updateHeroCta();
        if (typeof updateHeaderAuthButtons === 'function') updateHeaderAuthButtons();
        if (typeof updateProfileLink === 'function') updateProfileLink();

        if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.loginCompleted({ username: user.username });

    } catch (error) {
        console.error('[TMR] Login error:', error.message);
        if (error && error.code === 'EMAIL_NOT_VERIFIED') {
            const email = error.data?.email || '';
            const message = error.message || 'Please verify your email before logging in.';
            alert(message);
            window.location.href = '/verify-email/' + (email ? ('?email=' + encodeURIComponent(email)) : '');
            return;
        }
        const loginMessage = document.getElementById('loginFormMessage');
        if (loginMessage && error && error.message === 'Invalid credentials') {
            loginMessage.style.display = 'block';
            loginMessage.style.borderColor = 'rgba(255, 107, 107, 0.35)';
            loginMessage.style.background = 'rgba(255, 107, 107, 0.08)';
            loginMessage.style.color = '#ffd5d5';
            const loginValue = String(document.getElementById('loginEmail')?.value || '').trim();
            const resetHref = '/reset-password/' + (loginValue ? ('?login=' + encodeURIComponent(loginValue)) : '');
            loginMessage.innerHTML = 'That username/email and password do not match. If this is your account, <a href=\"' + resetHref + '\" style=\"color:#ffffff;text-decoration:underline;font-weight:700;\">reset your password here</a>.';
        } else {
            alert('Login failed: ' + error.message);
        }
    }
}

function setSubmitState(form, isBusy, buttonText) {
    if (!form) return;
    const submitButton = form.querySelector('button[type="submit"]');
    if (!submitButton) return;
    if (!submitButton.dataset.originalText) {
        submitButton.dataset.originalText = submitButton.textContent;
    }
    submitButton.disabled = !!isBusy;
    submitButton.textContent = isBusy ? buttonText : submitButton.dataset.originalText;
}

function validateSignupInput(username, email, password, confirmPassword) {
    const cleanUsername = String(username || '').trim();
    const cleanEmail = String(email || '').trim();

    if (!cleanUsername || !cleanEmail || !password) {
        return 'All required fields must be filled out.';
    }
    if (cleanUsername.length < 3) {
        return 'Username must be at least 3 characters.';
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
        return 'Username can only use letters, numbers, and underscores.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return 'Enter a valid email address.';
    }
    if (String(password).length < 8) {
        return 'Password must be at least 8 characters.';
    }
    if (confirmPassword != null && confirmPassword !== '' && password !== confirmPassword) {
        return 'Passwords do not match.';
    }
    return '';
}

async function handleSignup(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.signUpStarted({ button_location: 'signup_modal' });

    const signupForm = document.getElementById('signupForm') || document.getElementById('signup-form');

    try {
        const username = document.getElementById('signupUsername')?.value?.trim() || '';
        const email = document.getElementById('signupEmail')?.value?.trim() || '';
        const password = document.getElementById('signupPassword')?.value || '';
        const confirmPassword = document.getElementById('confirmPassword')?.value || '';
        
        // Optional profile fields
        const favoriteTeam = document.getElementById('favoriteTeam')?.value?.trim() || '';
        const favoriteSport = document.getElementById('favoriteSport')?.value || '';
        const displayName = document.getElementById('displayName')?.value?.trim() || '';
        const location = document.getElementById('location')?.value?.trim() || '';
        const bio = document.getElementById('bio')?.value?.trim() || '';

        const validationError = validateSignupInput(username, email, password, confirmPassword);
        if (validationError) {
            alert(validationError);
            return;
        }

        if (typeof auth === 'undefined') {
            alert('Auth system not loaded. Please refresh.');
            return;
        }

        setSubmitState(signupForm, true, 'Creating Account...');

        // Register via backend-aware auth system
        const user = await auth.register(username, email, password);

        if (user && user.pendingVerification) {
            if (signupForm) signupForm.reset();

            const modal = document.getElementById('signupModal');
            if (modal) modal.style.display = 'none';

            alert(user.message || ('Account created. Check ' + user.email + ' to verify your account.'));
            window.location.href = '/verify-email/?email=' + encodeURIComponent(user.email || email);
            return;
        }

        // Update optional profile fields via backend if possible
        if (typeof auth.updateProfile === 'function') {
            const profileUpdates = {};
            if (displayName) profileUpdates.displayName = displayName;
            if (bio) profileUpdates.bio = bio;
            if (location) profileUpdates.location = location;
            if (favoriteTeam) profileUpdates.favoriteTeam = favoriteTeam;
            if (favoriteSport) profileUpdates.favoriteSport = favoriteSport;
            
            if (Object.keys(profileUpdates).length > 0) {
                try { await auth.updateProfile(profileUpdates); } catch(e) { console.warn('[TMR] Profile update after signup:', e.message); }
            }
        }

        alert('Account created successfully! You are now logged in.');

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
    } finally {
        setSubmitState(signupForm, false, 'Creating Account...');
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
