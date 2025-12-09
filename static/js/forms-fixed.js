// Fixed Forms Handling - Actually calls auth system

/**
 * Handle login form submission
 */
function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe')?.checked ?? true;

    try {
        console.log('Attempting login for:', email);
        auth.login(email, password, rememberMe);
        console.log('✅ Login successful');

        // Clear form first
        document.getElementById('loginForm').reset();

        // Redirect to home/record section (no alert - just redirect)
        showSection('record');

    } catch (error) {
        const users = auth.users.map(u => u.username).join(', ') || 'none'; alert('Login failed: ' + error.message + '

Accounts: ' + users + '

Try: BetLegend / betlegend2025');
        console.error('Login error:', error);
    }
}

/**
 * Handle signup form submission
 */
function handleSignup(event) {
    event.preventDefault();

    const username = document.getElementById('signupUsername')?.value;
    const email = document.getElementById('signupEmail')?.value;
    const password = document.getElementById('signupPassword')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;
    const rememberMe = true; // Always remember for new signups

    // Validation
    if (!username || !email || !password) {
        alert('❌ All fields are required');
        return;
    }

    if (password !== confirmPassword) {
        alert('❌ Passwords do not match');
        return;
    }

    try {
        // Register and auto-login
        console.log('Attempting registration for:', username);
        auth.register(username, email, password, rememberMe);

        alert('✅ Account created successfully! Welcome to Trust My Record!');

        // Redirect to feed
        if (typeof showSection === 'function') {
            showSection('feed');
        }

        // Clear form
        const form = document.getElementById('signupForm');
        if (form) form.reset();
    } catch (error) {
        alert('❌ Registration failed: ' + error.message);
        console.error('Signup error:', error);
    }
}

/**
 * Handle pick submission
 */
function handlePickSubmit(event) {
    if (event) event.preventDefault();

    // Check if logged in
    if (!auth || !auth.isLoggedIn()) {
        alert('❌ You must be logged in to submit picks');
        if (typeof showSection === 'function') {
            showSection('login');
        }
        return;
    }

    // Submit pick (implementation in picks.js)
    if (typeof submitPick === 'function') {
        submitPick();
    }
}

// Export functions
if (typeof window !== 'undefined') {
    window.handleLogin = handleLogin;
    window.handleSignup = handleSignup;
    window.handlePickSubmit = handlePickSubmit;
}

console.log('✅ Fixed forms handler loaded');
