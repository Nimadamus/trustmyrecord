/**
 * TrustMyRecord API Client
 * Handles all communication with the backend API
 */

// API Configuration
// Automatically detect environment
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'  // Local development
    : 'https://trustmyrecord-backend.onrender.com/api';  // Production (update this when you deploy backend)

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getAuthToken() {
  return localStorage.getItem('accessToken');
}

function getRefreshToken() {
  return localStorage.getItem('refreshToken');
}

function setTokens(accessToken, refreshToken) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

function getCurrentUser() {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
}

function setCurrentUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

function isLoggedIn() {
  return !!getAuthToken();
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

async function signup(username, email, password, displayName) {
  try {
    const response = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, displayName })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Signup failed');
    }

    setTokens(data.accessToken, data.refreshToken);
    setCurrentUser(data.user);

    return data.user;
  } catch (error) {
    console.error('Signup error:', error);
    throw error;
  }
}

async function login(login, password) {
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    setTokens(data.accessToken, data.refreshToken);
    setCurrentUser(data.user);

    return data.user;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

async function logout() {
  const refreshToken = getRefreshToken();

  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ refreshToken })
    });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    clearTokens();
    window.location.href = '/index.html';
  }
}

// ============================================================================
// PICKS
// ============================================================================

async function submitPick(pickData) {
  try {
    const response = await fetch(`${API_URL}/picks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify(pickData)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to submit pick');
    }

    return data.pick;
  } catch (error) {
    console.error('Submit pick error:', error);
    throw error;
  }
}

async function getPicksFeed(filters = {}) {
  try {
    const params = new URLSearchParams(filters);
    const token = getAuthToken();

    const response = await fetch(`${API_URL}/picks?${params}`, {
      headers: token ? {
        'Authorization': `Bearer ${token}`
      } : {}
    });

    const data = await response.json();
    return data.picks;
  } catch (error) {
    console.error('Get picks error:', error);
    throw error;
  }
}

async function likePick(pickId) {
  try {
    const response = await fetch(`${API_URL}/picks/${pickId}/like`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });

    return await response.json();
  } catch (error) {
    console.error('Like pick error:', error);
    throw error;
  }
}

async function unlikePick(pickId) {
  try {
    const response = await fetch(`${API_URL}/picks/${pickId}/like`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });

    return await response.json();
  } catch (error) {
    console.error('Unlike pick error:', error);
    throw error;
  }
}

async function commentOnPick(pickId, content) {
  try {
    const response = await fetch(`${API_URL}/picks/${pickId}/comment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ content })
    });

    return await response.json();
  } catch (error) {
    console.error('Comment error:', error);
    throw error;
  }
}

// ============================================================================
// USERS
// ============================================================================

async function getUserProfile(username) {
  try {
    const token = getAuthToken();

    const response = await fetch(`${API_URL}/users/${username}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });

    const data = await response.json();
    return data.user;
  } catch (error) {
    console.error('Get user profile error:', error);
    throw error;
  }
}

async function getLeaderboard(sport = null, sortBy = 'roi', limit = 50) {
  try {
    const params = new URLSearchParams({ sortBy, limit });
    if (sport) params.append('sport', sport);

    const response = await fetch(`${API_URL}/users/leaderboard?${params}`);
    const data = await response.json();

    return data.leaderboard;
  } catch (error) {
    console.error('Get leaderboard error:', error);
    throw error;
  }
}

// ============================================================================
// UI HELPER FUNCTIONS
// ============================================================================

function updateAuthUI() {
  const user = getCurrentUser();
  const authButtons = document.querySelector('.header-right');

  if (!authButtons) return;

  if (user) {
    // User is logged in
    const signUpButton = authButtons.querySelector('.nav-cta');
    if (signUpButton) {
      signUpButton.textContent = user.displayName || user.username;
      signUpButton.href = `/profile.html?user=${user.username}`;
    }

    // Add logout button if not exists
    if (!document.getElementById('logout-btn')) {
      const logoutBtn = document.createElement('a');
      logoutBtn.id = 'logout-btn';
      logoutBtn.href = '#';
      logoutBtn.textContent = 'Logout';
      logoutBtn.className = 'nav-link';
      logoutBtn.onclick = (e) => {
        e.preventDefault();
        logout();
      };
      authButtons.appendChild(logoutBtn);
    }
  } else {
    // User is not logged in
    const signUpButton = authButtons.querySelector('.nav-cta');
    if (signUpButton) {
      signUpButton.textContent = 'Sign Up';
      signUpButton.href = '/register.html';
    }

    // Remove logout button if exists
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.remove();
    }
  }
}

function showError(message, elementId = 'error-message') {
  const errorEl = document.getElementById(elementId);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  } else {
    alert(message);
  }
}

function showSuccess(message, elementId = 'success-message') {
  const successEl = document.getElementById(elementId);
  if (successEl) {
    successEl.textContent = message;
    successEl.style.display = 'block';
  } else {
    alert(message);
  }
}

function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
    return false;
  }
  return true;
}

// Initialize auth UI on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateAuthUI);
} else {
  updateAuthUI();
}
