// Fixed Forms Handling
function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe')?.checked ?? true;

    try {
        console.log('Attempting login for:', email);
        auth.login(email, password, rememberMe);
        console.log('Login successful');
        document.getElementById('loginForm').reset();
        showSection('profile'); if (typeof updateProfilePage === 'function') updateProfilePage();
    } catch (error) {
        const users = auth.users.map(u => u.username).join(', ') || 'none';
        alert('Login failed: ' + error.message + '\n\nAccounts: ' + users + '\n\nTry: BetLegend / betlegend2025');
        console.error('Login error:', error);
    }
}

function handleSignup(event) {
    event.preventDefault();
    const username = document.getElementById('signupUsername')?.value;
    const email = document.getElementById('signupEmail')?.value;
    const password = document.getElementById('signupPassword')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;

    if (!username || !email || !password) {
        alert('All fields are required');
        return;
    }
    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }

    try {
        auth.register(username, email, password, true);
        alert('Account created successfully!');
        if (typeof showSection === 'function') showSection('profile'); if (typeof updateProfilePage === 'function') updateProfilePage();
        const form = document.getElementById('signupForm');
        if (form) form.reset();
    } catch (error) {
        alert('Registration failed: ' + error.message);
    }
}

function handlePickSubmit(event) {
    if (event) event.preventDefault();
    if (!auth || !auth.isLoggedIn()) {
        alert('You must be logged in to submit picks');
        if (typeof showSection === 'function') showSection('login');
        return;
    }
    if (typeof submitPick === 'function') submitPick();
}

if (typeof window !== 'undefined') {
    window.handleLogin = handleLogin;
    window.handleSignup = handleSignup;
    window.handlePickSubmit = handlePickSubmit;
}
console.log('Forms handler loaded');
