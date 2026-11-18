// TMR service worker. Network first for everything; nothing the site serves is
// ever cached, so it can never show stale content. The only cached file is
// /offline.html, shown when a page navigation fails because the phone has no
// connection (instead of the browser's error screen). Kill switch kept.
var OFFLINE_CACHE = 'tmr-offline-v1';
var OFFLINE_URL = '/offline.html';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(OFFLINE_CACHE)
      .then(function (c) { return c.add(new Request(OFFLINE_URL, { cache: 'reload' })); })
      .catch(function () {})
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('tmr-offline-') === 0 && k !== OFFLINE_CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).catch(function () {}).then(function () {
      if (self.registration.navigationPreload) return self.registration.navigationPreload.enable().catch(function () {});
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) { if (e.data === 'TMR_SW_KILL') self.registration.unregister(); });

// Only top-level page loads are handled; every other request goes straight to
// the network untouched.
self.addEventListener('fetch', function (e) {
  if (e.request.mode !== 'navigate') return;
  e.respondWith((async function () {
    try {
      var pre = await e.preloadResponse;
      if (pre) return pre;
      return await fetch(e.request);
    } catch (err) {
      var cached = await caches.match(OFFLINE_URL);
      return cached || Response.error();
    }
  })());
});
