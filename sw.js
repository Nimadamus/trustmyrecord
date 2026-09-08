// TMR service worker — intentionally minimal. Network passthrough only.
// No precache, no HTML caching: it exists to satisfy installability and can
// never serve stale content or take the site offline. Includes a kill switch.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('message', (e) => { if (e.data === 'TMR_SW_KILL') self.registration.unregister(); });
self.addEventListener('fetch', () => { /* passthrough: let the network handle every request */ });
