/*
 * BetLegend Pro service worker.
 *
 * SCOPE. This file lives at /betlegend-pro/sw.js, so its scope is
 * /betlegend-pro/ and it can never take control of the rest of
 * TrustMyRecord. Even inside that scope it handles a deliberately narrow set
 * of requests and returns early for everything else, so an unhandled request
 * falls through to the browser exactly as if no worker were installed.
 *
 * NEVER CACHED. Anything that is per-account or priced:
 *   - every call to the API origin (reports, status, balance, entitlement)
 *   - any request carrying credentials
 * A cached report is a report shown to the wrong person, or a stale balance
 * shown as a live one. The offline story here is "say you are offline", not
 * "serve yesterday's research as if it were today's".
 *
 * HTML IS NETWORK-FIRST. The app is one hand-maintained HTML file that ships
 * several times a week; a cache-first shell would pin users to whichever build
 * they first installed. The cache is only the offline fallback.
 *
 * KILL SWITCH. Replacing this file's body with
 *   self.addEventListener('install', () => self.skipWaiting());
 *   self.addEventListener('activate', (e) => e.waitUntil(
 *     self.registration.unregister().then(() => caches.keys())
 *       .then(k => Promise.all(k.map(n => caches.delete(n))))));
 * uninstalls it from every client on their next visit. A service worker is
 * sticky, so the way out has to be written down before it is needed.
 */
const VERSION = 'blp-2026-08-16-1';
const SHELL_CACHE = 'blp-shell-' + VERSION;
const ASSET_CACHE = 'blp-assets-' + VERSION;
const SCOPE_PATH = '/betlegend-pro/';
const OFFLINE_URL = '/betlegend-pro/app/offline.html';

// Precached at install: the offline page and the identity that has to render
// without a network. Everything else is cached only once it has been asked
// for, so a new icon or stylesheet never has to be listed here by hand.
const PRECACHE = [
  OFFLINE_URL,
  '/betlegend-pro/app/icon-192.png',
  '/betlegend-pro/app/icon-512.png',
  '/betlegend-pro/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // `reload` so an install never adopts an entry the HTTP cache is already
      // holding stale.
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      // A precache miss (one file 404s during a deploy) must not leave the
      // scope with no worker at all -- the fetch handler degrades to
      // network-only on its own.
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith('blp-') && name !== SHELL_CACHE && name !== ASSET_CACHE)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

/** Same-origin GETs inside this scope, and nothing else. */
function isOwn(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(SCOPE_PATH);
}

/** A versioned static asset: safe to serve from cache and refresh behind. */
function isAsset(url) {
  return isOwn(url) && /\.(css|js|png|svg|webp|woff2?|webmanifest)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (_) { return; }

  // The API lives on another origin and is per-account. Never touched.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    if (!isOwn(url)) return;                       // login, pricing, the rest of TMR
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match(OFFLINE_URL)))
    );
    return;
  }

  if (!isAsset(url)) return;

  // Stale-while-revalidate: instant paint from cache, fresh copy written back
  // for next time. The `?v=` on console.css means a new build is a new cache
  // key, so this can never pin an old stylesheet to a new page.
  event.respondWith(
    caches.open(ASSET_CACHE).then((cache) => cache.match(request).then((hit) => {
      const network = fetch(request).then((response) => {
        if (response && response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => hit);
      return hit || network;
    }))
  );
});

// Lets the page hand control to a waiting worker on the user's say-so instead
// of on a reload they did not ask for.
self.addEventListener('message', (event) => {
  if (event.data === 'blp-skip-waiting') self.skipWaiting();
});
