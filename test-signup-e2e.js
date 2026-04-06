/**
 * E2E Signup Simulation - TrustMyRecord
 * Mocks browser localStorage + DOM, runs actual auth code paths
 */

// ========== MOCK BROWSER ENVIRONMENT ==========
const store = {};
const localStorage = {
    getItem(k) { return store[k] || null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); }
};
global.localStorage = localStorage;
global.setInterval = global.setInterval || (() => {});
global.window = { auth: null, showSection: () => {}, event: null, TMR: {}, addEventListener: () => {}, scrollTo: () => {}, PersistentAuthSystem: null };
global.document = {
    readyState: 'complete',
    hidden: false,
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null
};
global.CONFIG = { features: { useBackendAPI: false }, api: {} };

// ========== LOAD AUTH SYSTEM ==========
const fs = require('fs');
const authCode = fs.readFileSync('./static/js/auth-persistent.js', 'utf8');
const cleanCode = authCode
    .replace(/document\.addEventListener\('click'[\s\S]*$/, '')
    .replace(/console\.log\('Auth System loaded'\);/, '');
eval(cleanCode);
const auth = window.auth;
const PersistentAuthSystem = window.PersistentAuthSystem;

// ========== TEST HELPERS ==========
let passed = 0, failed = 0;
function assert(condition, label) {
    if (condition) { console.log(`  \x1b[32mPASS\x1b[0m  ${label}`); passed++; }
    else { console.log(`  \x1b[31mFAIL\x1b[0m  ${label}`); failed++; }
}
function section(title) { console.log(`\n\x1b[36m--- ${title} ---\x1b[0m`); }

// ========== ASYNC TESTS ==========
(async function() {

const testUser = { username: 'newuser42', email: 'new42@test.com', password: 'Secret99' };

// ---------- TEST 1 ----------
section('TEST 1: Fresh signup with new credentials');
localStorage.clear();
auth.users = [];
auth.currentUser = null;
auth.ensureDefaultUsers();

await auth.register(testUser.username, testUser.email, testUser.password);

const regUser = auth.getCurrentUser();
assert(regUser !== null, 'Register returns a user object');
assert(regUser && regUser.username === testUser.username, `Username is "${testUser.username}"`);
assert(regUser && regUser.email === testUser.email, `Email is "${testUser.email}"`);
assert(regUser && regUser.id && regUser.id.startsWith('user_'), 'User ID generated correctly');
assert(regUser && regUser.stats && regUser.stats.totalPicks === 0, 'Stats initialized to zero');
assert(regUser && regUser.social && Array.isArray(regUser.social.followers), 'Social data initialized');
assert(auth.isLoggedIn() === true, 'auth.isLoggedIn() returns true after signup');

// ---------- TEST 2 ----------
section('TEST 2: User persisted in localStorage');
const storedSession = localStorage.getItem('trustmyrecord_session');
assert(storedSession !== null, 'Session saved to trustmyrecord_session');
const parsedSession = JSON.parse(storedSession);
assert(parsedSession.user && parsedSession.user.username === testUser.username, 'Session contains correct username');
assert(parsedSession.timestamp > 0, 'Session has timestamp');

const storedUsers = JSON.parse(localStorage.getItem('trustmyrecord_users') || '[]');
const foundUser = storedUsers.find(u => u.username === testUser.username);
assert(foundUser !== undefined, 'User exists in trustmyrecord_users array');
assert(foundUser && foundUser.passwordHash !== undefined, 'Password hash stored (not plaintext)');
assert(foundUser && foundUser.passwordHash !== testUser.password, 'Password hash differs from plaintext');

// ---------- TEST 3 ----------
section('TEST 3: Duplicate account handling');
let dupeError = null;
try { await auth.register(testUser.username, 'other@test.com', 'Pass1234'); } catch(e) { dupeError = e.message; }
assert(dupeError === 'Username already taken', `Duplicate username blocked: "${dupeError}"`);

let dupeEmailError = null;
try { await auth.register('otheruser', testUser.email, 'Pass1234'); } catch(e) { dupeEmailError = e.message; }
assert(dupeEmailError === 'Email already registered', `Duplicate email blocked: "${dupeEmailError}"`);

// ---------- TEST 4 ----------
section('TEST 4: Validation rules');
let shortUser = null;
try { await auth.register('ab', 'x@y.com', 'Pass1234'); } catch(e) { shortUser = e.message; }
assert(shortUser === 'Username must be at least 3 characters', `Short username rejected: "${shortUser}"`);

let shortPass = null;
try { await auth.register('validuser', 'valid@test.com', '12345'); } catch(e) { shortPass = e.message; }
assert(shortPass === 'Password must be at least 6 characters', `Short password rejected: "${shortPass}"`);

let emptyFields = null;
try { await auth.register('', 'a@b.com', 'Pass1234'); } catch(e) { emptyFields = e.message; }
assert(emptyFields === 'All fields are required', `Empty username rejected: "${emptyFields}"`);

// ---------- TEST 5 ----------
section('TEST 5: Logout clears all state');
// Set tmr_* keys like forms-fixed.js does
localStorage.setItem('tmr_is_logged_in', 'true');
localStorage.setItem('tmr_current_user', JSON.stringify(auth.getCurrentUser()));

await auth.logout();
assert(auth.isLoggedIn() === false, 'auth.isLoggedIn() false after logout');
assert(auth.getCurrentUser() === null, 'getCurrentUser() null after logout');
assert(localStorage.getItem('trustmyrecord_session') === null, 'trustmyrecord_session cleared');
assert(localStorage.getItem('tmr_is_logged_in') === null, 'tmr_is_logged_in cleared');
assert(localStorage.getItem('tmr_current_user') === null, 'tmr_current_user cleared');
assert(localStorage.getItem('trustmyrecord_remember') === null, 'trustmyrecord_remember cleared');

// ---------- TEST 6 ----------
section('TEST 6: Login with email after logout');
await auth.login(testUser.email, testUser.password);
const loginUser = auth.getCurrentUser();
assert(loginUser !== null, 'Login returns user');
assert(loginUser && loginUser.username === testUser.username, 'Logged in as correct user');
assert(auth.isLoggedIn() === true, 'auth.isLoggedIn() true after login');
assert(localStorage.getItem('trustmyrecord_session') !== null, 'Session persisted after login');

// ---------- TEST 7 ----------
section('TEST 7: Login with username (not email)');
await auth.logout();
await auth.login(testUser.username, testUser.password);
assert(auth.isLoggedIn() === true, 'Can login with username');
assert(auth.getCurrentUser().email === testUser.email, 'Correct user found by username');

// ---------- TEST 8 ----------
section('TEST 8: Wrong password rejected');
await auth.logout();
let wrongPass = null;
try { await auth.login(testUser.email, 'WrongPassword'); } catch(e) { wrongPass = e.message; }
assert(wrongPass === 'Invalid password', `Wrong password rejected: "${wrongPass}"`);
assert(auth.isLoggedIn() === false, 'Not logged in after wrong password');

// ---------- TEST 9 ----------
section('TEST 9: Nonexistent user rejected');
let noUser = null;
try { await auth.login('nobody@nowhere.com', 'Pass1234'); } catch(e) { noUser = e.message; }
assert(noUser === 'User not found', `Nonexistent user rejected: "${noUser}"`);

// ---------- TEST 10 ----------
section('TEST 10: Session restore after page refresh simulation');
await auth.login(testUser.email, testUser.password);
assert(auth.isLoggedIn() === true, 'Logged in before simulated refresh');

const auth2 = new PersistentAuthSystem();
assert(auth2.isLoggedIn() === true, 'Session restored after refresh');
assert(auth2.getCurrentUser().username === testUser.username, 'Correct user restored');

// ---------- TEST 11 ----------
section('TEST 11: Profile update');
await auth.login(testUser.email, testUser.password);
const updated = auth.updateProfile({ displayName: 'New Display Name', bio: 'Hello world' });
assert(updated.displayName === 'New Display Name', 'Display name updated');
assert(updated.bio === 'Hello world', 'Bio updated');
assert(auth.getCurrentUser().displayName === 'New Display Name', 'getCurrentUser reflects update');

// Verify persisted by reading localStorage directly
const persistedUsers = JSON.parse(localStorage.getItem('trustmyrecord_users'));
const persistedUser = persistedUsers.find(u => u.username === testUser.username);
assert(persistedUser && persistedUser.displayName === 'New Display Name', 'Profile update persisted to localStorage');

// ---------- TEST 12 ----------
section('TEST 12: Follow/unfollow');
await auth.login(testUser.email, testUser.password);
const adminUser = auth.users.find(u => u.username === 'admin');
assert(adminUser !== undefined, 'Admin default user exists');

const isFollowing = auth.toggleFollow(adminUser.id);
assert(isFollowing === true, 'Follow toggled ON');
assert(auth.getCurrentUser().social.following.includes(adminUser.id), 'Following list updated');

const isUnfollowed = auth.toggleFollow(adminUser.id);
assert(isUnfollowed === false, 'Follow toggled OFF');
assert(!auth.getCurrentUser().social.following.includes(adminUser.id), 'Unfollowed successfully');

// ---------- TEST 13 ----------
section('TEST 13: Multiple users coexist');
await auth.logout();
const user2 = { username: 'seconduser', email: 'second@test.com', password: 'Pass2222' };
await auth.register(user2.username, user2.email, user2.password);
assert(auth.getCurrentUser().username === 'seconduser', 'Second user created and logged in');

await auth.logout();
await auth.login(testUser.email, testUser.password);
assert(auth.getCurrentUser().username === testUser.username, 'Can switch back to first user');

await auth.logout();
await auth.login(user2.email, user2.password);
assert(auth.getCurrentUser().username === user2.username, 'Can switch to second user');

// ---------- TEST 14 ----------
section('TEST 14: Case-insensitive login');
await auth.logout();
await auth.login(testUser.username.toUpperCase(), testUser.password);
assert(auth.isLoggedIn() === true, 'Login with uppercase username works');
assert(auth.getCurrentUser().username === testUser.username, 'Returns original-case username');

await auth.logout();
await auth.login(testUser.email.toUpperCase(), testUser.password);
assert(auth.isLoggedIn() === true, 'Login with uppercase email works');

// ---------- TEST 15 ----------
section('TEST 15: forms-fixed.js tmr_current_user stores full data');
await auth.logout();
localStorage.clear();
auth.users = [];
auth.ensureDefaultUsers();
await auth.register('formtest', 'form@test.com', 'FormPass1');

const result = auth.getCurrentUser();
// Simulate FIXED forms-fixed.js logic
var userData = (result && result.user) ? result.user : (result && result.username) ? result : { username: 'formtest', email: 'form@test.com' };
localStorage.setItem('tmr_current_user', JSON.stringify(userData));
localStorage.setItem('tmr_is_logged_in', 'true');

const storedTmr = JSON.parse(localStorage.getItem('tmr_current_user'));
assert(storedTmr.username === 'formtest', 'tmr_current_user has username');
assert(storedTmr.id !== undefined, 'tmr_current_user has full user ID (not minimal)');
assert(storedTmr.stats !== undefined, 'tmr_current_user has stats object');
assert(storedTmr.social !== undefined, 'tmr_current_user has social object');

// ---------- TEST 16 ----------
section('TEST 16: Logout + tmr keys + re-login cycle');
// Full cycle: signup, logout (clears tmr_*), login (sets tmr_*), logout, verify clean
await auth.logout();
localStorage.clear();
auth.users = [];
auth.ensureDefaultUsers();

await auth.register('cycletest', 'cycle@test.com', 'Cycle123');
localStorage.setItem('tmr_is_logged_in', 'true');
localStorage.setItem('tmr_current_user', JSON.stringify(auth.getCurrentUser()));
assert(localStorage.getItem('tmr_is_logged_in') === 'true', 'tmr_is_logged_in set after signup');

await auth.logout();
assert(localStorage.getItem('tmr_is_logged_in') === null, 'tmr_is_logged_in cleared after logout');
assert(localStorage.getItem('tmr_current_user') === null, 'tmr_current_user cleared after logout');

await auth.login('cycle@test.com', 'Cycle123');
assert(auth.isLoggedIn() === true, 'Re-login after full cycle works');
assert(auth.getCurrentUser().username === 'cycletest', 'Correct user after re-login');

await auth.logout();
assert(auth.isLoggedIn() === false, 'Final logout clean');

// ========== RESULTS ==========
console.log('\n' + '='.repeat(55));
console.log(`\x1b[1m  RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed}\x1b[0m`);
if (failed === 0) {
    console.log('\x1b[32m\x1b[1m  ALL TESTS PASSED - Signup flow works end-to-end.\x1b[0m');
} else {
    console.log('\x1b[31m\x1b[1m  SOME TESTS FAILED - see above.\x1b[0m');
}
console.log('='.repeat(55));
process.exit(failed > 0 ? 1 : 0);

})().catch(err => { console.error('Fatal:', err); process.exit(1); });
