/* =============================================================================
   TrustMyRecord — shared session resolver for the site header.
   -----------------------------------------------------------------------------
   WHY THIS FILE EXISTS (Jul 20, 2026)
   Access tokens live 60 minutes; refresh tokens live 365 days (rememberMe
   defaults to true on /api/auth/login and /api/auth/signup). The two header
   implementations (tmr-home-auth.js on the homepage, tmr-ds-nav.js on the other
   69 pages) each called GET /api/auth/me with the ACCESS token only. Any return
   visit more than an hour after logging in therefore got a 401 and the header
   fell back to "Log in / Start Free" -- while a perfectly valid 365-day refresh
   token sat unused in localStorage. That is the whole bug.

   Rules encoded here:
     * A 401/403 on a protected call is NOT proof of logout. Try the refresh
       token first, retry once, and only surface "signed out" when the refresh
       endpoint gives a DEFINITIVE rejection (401/403 from /auth/refresh).
     * A network error, a CORS failure or a 5xx (Render cold start) resolves to
       'unknown' -- the caller keeps whatever header it already has. One flaky
       request must never tear down a live session.
     * The cached identity is mirrored to every key the site has ever used, so
       one script cannot orphan another's cache.
     * Tokens are proactively refreshed shortly before they expire, so a tab
       left open overnight is still signed in when it is used again.
   ============================================================================= */
(function () {
  'use strict';
  if (window.TMRSession) return;

  var API = (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl)
    ? String(window.CONFIG.api.baseUrl).replace(/\/+$/, '')
    : 'https://trustmyrecord-api.onrender.com/api';

  var ACCESS_KEYS = ['trustmyrecord_token', 'accessToken', 'access_token', 'token', 'tmr_token'];
  var REFRESH_KEYS = ['trustmyrecord_refresh_token', 'refreshToken', 'refresh_token', 'tmr_refresh_token'];
  // Read order matters: `currentUser` is the key the pre-paint header reads,
  // `trustmyrecord_session` is auth-persistent.js's canonical blob.
  var USER_KEYS = ['currentUser', 'trustmyrecord_session', 'tmr_current_user', 'trustMyRecordProfile'];

  function ls(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }
  function get(k) { return ls(function () { return localStorage.getItem(k); }, null); }
  function firstOf(keys) {
    for (var i = 0; i < keys.length; i++) { var v = get(keys[i]); if (v) return v; }
    return null;
  }

  function getAccessToken() { return firstOf(ACCESS_KEYS); }
  function getRefreshToken() { return firstOf(REFRESH_KEYS); }

  function saveAccessToken(t) {
    if (!t) return;
    ls(function () { ACCESS_KEYS.forEach(function (k) { localStorage.setItem(k, t); }); });
  }

  function clearTokens() {
    ls(function () {
      ACCESS_KEYS.concat(REFRESH_KEYS).forEach(function (k) { localStorage.removeItem(k); });
    });
  }

  /* Normalise whatever shape a cached identity was stored in. */
  function unwrapUser(raw) {
    if (!raw) return null;
    var o = ls(function () { return JSON.parse(raw); }, null);
    if (!o) return null;
    var u = o.user || o;
    if (!u || (!u.username && !u.display_name && !u.displayName)) return null;
    return u;
  }

  function getCachedUser() {
    for (var i = 0; i < USER_KEYS.length; i++) {
      var u = unwrapUser(get(USER_KEYS[i]));
      if (u) return u;
    }
    return null;
  }

  /* Write the identity to every consumer's key so no script can orphan it. */
  function cacheUser(u) {
    if (!u) return;
    ls(function () {
      var json = JSON.stringify(u);
      localStorage.setItem('currentUser', json);
      localStorage.setItem('trustmyrecord_session', JSON.stringify({
        user: u, timestamp: Date.now(), rememberMe: true
      }));
    });
  }

  /* seconds-until-expiry from a JWT's exp claim; null when unreadable. */
  function secondsToExpiry(tok) {
    if (!tok) return null;
    var parts = String(tok).split('.');
    if (parts.length !== 3) return null;
    var payload = ls(function () {
      return JSON.parse(decodeURIComponent(escape(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))));
    }, null);
    if (!payload || !payload.exp) return null;
    return payload.exp - Math.floor(Date.now() / 1000);
  }

  function isAccessTokenExpired() {
    var s = secondsToExpiry(getAccessToken());
    if (s === null) return false;      // unreadable -> let the 401 path decide
    return s <= 30;                    // 30s skew
  }

  /* --- refresh (single-flight) --------------------------------------------
     Resolves 'success' | 'invalid' | 'network'.
     'invalid' is the ONLY outcome that may sign a user out.                  */
  var inflight = null;
  function refresh() {
    if (inflight) return inflight;
    var rt = getRefreshToken();
    if (!rt) return Promise.resolve('invalid');

    inflight = fetch(API + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken: rt })
    }).then(function (r) {
      if (r.ok) {
        return r.json().then(function (d) {
          var t = d && (d.accessToken || d.access_token);
          if (!t) return 'network';
          saveAccessToken(t);
          if (window.api) { try { window.api.token = t; } catch (e) {} }
          scheduleProactiveRefresh();
          return 'success';
        }, function () { return 'network'; });
      }
      // 401/403 = the server definitively rejected this refresh token.
      if (r.status === 401 || r.status === 403) return 'invalid';
      return 'network';                 // 5xx / cold start / gateway: keep the session
    }, function () {
      return 'network';                 // offline, CORS, DNS: keep the session
    }).then(function (outcome) {
      inflight = null;
      return outcome;
    });

    return inflight;
  }

  /* Refresh a few minutes before expiry so an open tab never 401s mid-use. */
  var timer = null;
  function scheduleProactiveRefresh() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!getRefreshToken()) return;
    var s = secondsToExpiry(getAccessToken());
    if (s === null) return;
    var delay = Math.max(15, s - 300) * 1000;      // 5 min before exp, min 15s
    if (delay > 2147483000) return;
    timer = setTimeout(function () { refresh(); }, delay);
  }

  /* --- authenticated fetch with one refresh-and-retry ---------------------- */
  function authFetch(url, opts) {
    opts = opts || {};
    function go(tok) {
      var headers = {};
      var src = opts.headers || {};
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) headers[k] = src[k];
      headers.Accept = headers.Accept || 'application/json';
      if (tok) headers.Authorization = 'Bearer ' + tok;
      var o = {};
      for (var j in opts) if (Object.prototype.hasOwnProperty.call(opts, j)) o[j] = opts[j];
      o.headers = headers;
      return fetch(url, o);
    }

    var pre = (isAccessTokenExpired() || !getAccessToken()) && getRefreshToken()
      ? refresh().then(function () { return null; })
      : Promise.resolve(null);

    return pre.then(function () {
      return go(getAccessToken()).then(function (r) {
        if (r.status !== 401 && r.status !== 403) return r;
        if (!getRefreshToken()) return r;
        return refresh().then(function (outcome) {
          if (outcome === 'success') return go(getAccessToken());
          return r;                      // 'invalid' -> caller reads the 401
        });
      });
    });
  }

  /* --- the header's single question: who is signed in? ---------------------
     { state: 'ok', user }   -> render the signed-in header
     { state: 'signed-out' } -> the session is genuinely dead, show Log in
     { state: 'unknown' }    -> transient failure, DO NOT change the header    */
  function resolveUser() {
    if (!getAccessToken() && !getRefreshToken()) {
      return Promise.resolve({ state: 'signed-out' });
    }
    return authFetch(API + '/auth/me').then(function (r) {
      if (r.ok) {
        return r.json().then(function (d) {
          var u = d && (d.user || d);
          if (!u || (!u.username && !u.display_name)) return { state: 'unknown' };
          cacheUser(u);
          scheduleProactiveRefresh();
          return { state: 'ok', user: u };
        }, function () { return { state: 'unknown' }; });
      }
      if (r.status === 401 || r.status === 403) {
        // authFetch already tried the refresh token. Getting here means either
        // there was no refresh token or the server rejected it outright.
        if (!getRefreshToken()) { clearTokens(); return { state: 'signed-out' }; }
        // Refresh token present but /auth/me still 401s: re-check the refresh
        // endpoint's verdict so a transient 5xx cannot log anyone out.
        return refresh().then(function (outcome) {
          if (outcome === 'success') return { state: 'unknown' };   // race; next load resolves
          if (outcome === 'invalid') { clearTokens(); return { state: 'signed-out' }; }
          return { state: 'unknown' };
        });
      }
      return { state: 'unknown' };       // 5xx / cold start: keep current header
    }, function () {
      return { state: 'unknown' };       // network blip: keep current header
    });
  }

  window.TMRSession = {
    api: API,
    getAccessToken: getAccessToken,
    getRefreshToken: getRefreshToken,
    hasTokens: function () { return !!(getAccessToken() || getRefreshToken()); },
    getCachedUser: getCachedUser,
    cacheUser: cacheUser,
    saveAccessToken: saveAccessToken,
    clearTokens: clearTokens,
    isAccessTokenExpired: isAccessTokenExpired,
    refresh: refresh,
    authFetch: authFetch,
    resolveUser: resolveUser,
    scheduleProactiveRefresh: scheduleProactiveRefresh
  };

  scheduleProactiveRefresh();
})();
