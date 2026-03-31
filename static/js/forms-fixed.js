// Fixed Forms Handling - Local Auth Only (No Backend)
console.log('[TMR forms-fixed.js] Loaded successfully!');

// Wrap everything in try-catch to catch any errors
async function handleLogin(event) {
    event.preventDefault();
    event.stopPropagation();
    console.log('[TMR] ==================== LOGIN STARTED ====================');
    
    try {
        const email = document.getElementById('loginEmail')?.value;
        const password = document.getElementById('loginPassword')?.value;
        console.log('[TMR] Login attempt for:', email);
        
        // Check if auth exists
        if (typeof auth === 'undefined') {
            console.error('[TMR] auth object is undefined!');
            alert('Auth system not loaded. Please refresh the page.');
            return;
        }
        console.log('[TMR] auth object found');
        
        // Check if auth.login is a function
        if (typeof auth.login !== 'function') {
            console.error('[TMR] auth.login is not a function!', auth);
            alert('Auth system error. Please refresh the page.');
            return;
        }
        console.log('[TMR] auth.login is a function');
        
        // Get remember me
        const rememberMeEl = document.getElementById('rememberMe');
        const rememberMe = rememberMeEl ? rememberMeEl.checked : true;
        console.log('[TMR] Remember me:', rememberMe);
        
        // Attempt login
        console.log('[TMR] Calling auth.login...');
        let result = auth.login(email, password, rememberMe);
        // Handle both sync and async login
        if (result && typeof result.then === 'function') {
            result = await result;
        }
        console.log('[TMR] auth.login returned:', result);

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

        console.log('[TMR] Login successful for:', user.username);

        // Reset form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) loginForm.reset();

        // Close modal
        const modal = document.getElementById('loginModal');
        if (modal) modal.style.display = 'none';

        // Navigate to profile within SPA
        console.log('[TMR] Navigating to profile...');
        if (typeof window.showSection === 'function') {
            window.showSection('profile');
        }
        // Update nav UI
        if (typeof updateHeaderAuthButtons === 'function') updateHeaderAuthButtons();
        if (typeof updateProfileLink === 'function') updateProfileLink();

        console.log('[TMR] ==================== LOGIN COMPLETE ====================');
        
    } catch (error) {
        console.error('[TMR] ==================== LOGIN ERROR ====================');
        console.error('[TMR] Error name:', error.name);
        console.error('[TMR] Error message:', error.message);
        console.error('[TMR] Error stack:', error.stack);
        alert('Login failed: ' + error.message);
    }
}

async function handleSignup(event) {
    event.preventDefault();
    event.stopPropagation();
    console.log('[TMR] ==================== SIGNUP STARTED ====================');
    
    try {
        const username = document.getElementById('signupUsername')?.value;
        const email = document.getElementById('signupEmail')?.value;
        const password = document.getElementById('signupPassword')?.value;
        const confirmPassword = document.getElementById('confirmPassword')?.value;
        
        console.log('[TMR] Signup attempt for:', username, email);
        
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
        
        console.log('[TMR] Calling auth.register...');
        let result = auth.register(username, email, password);
        // Handle both sync and async register
        if (result && typeof result.then === 'function') {
            result = await result;
        }
        console.log('[TMR] auth.register returned:', result);

        if (result && result.success === false) {
            throw new Error(result.error || 'Registration failed');
        }

        // Ensure tmr_* keys are set (belt and suspenders)
        localStorage.setItem('tmr_is_logged_in', 'true');
        if (result && result.user) {
            localStorage.setItem('tmr_current_user', JSON.stringify(result.user));
        } else {
            localStorage.setItem('tmr_current_user', JSON.stringify({ username: username, email: email }));
        }

        alert('Account created successfully! You are now logged in.');

        const signupForm = document.getElementById('signupForm');
        if (signupForm) signupForm.reset();

        const modal = document.getElementById('signupModal');
        if (modal) modal.style.display = 'none';

        // Navigate to profile within SPA
        if (typeof window.showSection === 'function') {
            window.showSection('profile');
        }
        if (typeof updateHeaderAuthButtons === 'function') updateHeaderAuthButtons();
        if (typeof updateProfileLink === 'function') updateProfileLink();

        console.log('[TMR] ==================== SIGNUP COMPLETE ====================');
        
    } catch (error) {
        console.error('[TMR] Signup error:', error);
        alert('Registration failed: ' + error.message);
    }
}

// Attach event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('[TMR] DOM loaded, attaching form handlers...');
    
    // Try both ID formats: camelCase and hyphenated
    const loginForm = document.getElementById('loginForm') || document.getElementById('login-form');
    const signupForm = document.getElementById('signupForm') || document.getElementById('signup-form');

    if (loginForm) {
        console.log('[TMR] Found login form (id=' + loginForm.id + '), attaching handler...');
        // Remove any existing handlers
        loginForm.onsubmit = null;
        // Remove all existing event listeners by cloning
        const newLoginForm = loginForm.cloneNode(true);
        loginForm.parentNode.replaceChild(newLoginForm, loginForm);
        // Add our handler
        newLoginForm.addEventListener('submit', handleLogin);
        console.log('[TMR] login form handler attached successfully');
    } else {
        console.error('[TMR] login form NOT found!');
    }

    if (signupForm) {
        console.log('[TMR] Found signup form (id=' + signupForm.id + '), attaching handler...');
        const newSignupForm = signupForm.cloneNode(true);
        signupForm.parentNode.replaceChild(newSignupForm, signupForm);
        newSignupForm.addEventListener('submit', handleSignup);
        console.log('[TMR] signup form handler attached successfully');
    } else {
        console.log('[TMR] signup form NOT found (may not be on this page)');
    }
});

console.log('[TMR forms-fixed.js] Script parsed successfully');
