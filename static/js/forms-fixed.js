// Fixed Forms Handling - Backend API version
async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        console.log('Attempting login for:', email);

        if (window.api) {
            const data = await window.api.login(email, password);
            console.log('Backend login successful:', data.user?.username);
            // Store for nav UI backward compat
            localStorage.setItem('currentUser', JSON.stringify(data.user));
        } else if (typeof auth !== 'undefined') {
            // Fallback to old auth if BackendAPI not loaded
            const rememberMe = document.getElementById('rememberMe')?.checked ?? true;
            auth.login(email, password, rememberMe);
        } else {
            throw new Error('No auth system available');
        }

        console.log('Login successful');
        document.getElementById('loginForm').reset();
        // Close modal if open
        const modal = document.getElementById('loginModal');
        if (modal) modal.style.display = 'none';
        showSection('profile'); if (typeof updateProfilePage === 'function') updateProfilePage();
    } catch (error) {
        alert('Login failed: ' + error.message);
        console.error('Login error:', error);
    }
}

async function handleSignup(event) {
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
        if (window.api) {
            const data = await window.api.register(username, email, password);
            console.log('Backend registration successful:', data.user?.username);
            // Store for nav UI backward compat
            localStorage.setItem('currentUser', JSON.stringify(data.user));
        } else if (typeof auth !== 'undefined') {
            auth.register(username, email, password, true);
        } else {
            throw new Error('No auth system available');
        }

        alert('Account created successfully!');
        // Close modal if open
        const modal = document.getElementById('loginModal');
        if (modal) modal.style.display = 'none';
        if (typeof showSection === 'function') showSection('profile'); if (typeof updateProfilePage === 'function') updateProfilePage();
        const form = document.getElementById('signupForm');
        if (form) form.reset();
    } catch (error) {
        alert('Registration failed: ' + error.message);
    }
}

function handlePickSubmit(event) {
    if (event) event.preventDefault();
    if (window.api) {
        if (!window.api.isLoggedIn()) {
            alert('You must be logged in to submit picks');
            if (typeof openLoginModal === 'function') openLoginModal();
            else if (typeof showSection === 'function') showSection('login');
            return;
        }
    } else if (!auth || !auth.isLoggedIn()) {
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
console.log('Forms handler loaded (backend-api version)');
