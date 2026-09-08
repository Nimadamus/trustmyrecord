// Configuration for TrustMyRecord

const TMR_IS_LOCAL_HOST =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);

const CONFIG = {
    // DEAD_ODDSAPI_REMOVED_20260901. This advertised a browser-side ESPN odds
    // endpoint that nothing in the codebase read, and that could not have worked
    // anyway: ESPN answers 403 to browser User-Agents and a 403 carries no CORS
    // header. Odds come from the backend board. Do not re-add a browser ESPN URL.

    // API Configuration
    // Only expose localhost fallbacks when the site is actually running locally.
    api: {
        baseUrl: "https://trustmyrecord-api.onrender.com/api",
        fallbackUrls: TMR_IS_LOCAL_HOST ? [
            "http://localhost:3000/api",
        ] : [],
        timeout: 8000
    },

    // Feature flags
    features: {
        useBackendAPI: true,
        requireEmailVerification: false
    },

    // Analytics Configuration (GA4)
    analytics: {
        enabled: true,
        measurementId: 'G-V5MCVXS2HE',
        gtmId: '',
        debug: false
    },

    // App Settings
    settings: {
        itemsPerPage: 20,
        maxPicksPerDay: 10,
        minOdds: -1000,
        maxOdds: 1000,
        supportedSports: [
            { id: "americanfootball_nfl", name: "NFL", category: "American Football" },
            { id: "basketball_nba", name: "NBA", category: "Basketball" },
            { id: "basketball_nba_summer", name: "NBA Summer League", category: "Basketball" },
            { id: "basketball_wnba", name: "WNBA", category: "Basketball" },
            { id: "baseball_mlb", name: "MLB", category: "Baseball" },
            { id: "icehockey_nhl", name: "NHL", category: "Ice Hockey" },
            { id: "soccer_epl", name: "Premier League", category: "Soccer" },
            { id: "basketball_ncaab", name: "NCAA Basketball", category: "Basketball" },
            { id: "americanfootball_ncaaf", name: "NCAA Football", category: "American Football" }
        ]
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}

// JustBet MLB Contest sitewide promo modal loader (idempotent, defers itself).
(function () {
    if (typeof document === 'undefined') return;
    if (document.querySelector('script[data-contest-promo-modal]')) return;
    var s = document.createElement('script');
    s.src = '/static/js/contest-promo-modal.js?v=5f439ce6c10e';
    s.defer = true;
    s.setAttribute('data-contest-promo-modal', '1');
    (document.head || document.documentElement).appendChild(s);
})();

// Official community-account badge loader (TMR Polls / TMR Trivia). Idempotent.
(function () {
    if (typeof document === 'undefined') return;
    if (document.querySelector('script[data-official-badge]')) return;
    var s = document.createElement('script');
    s.src = '/static/js/official-badge.js?v=3b74b4b9bd77';
    s.defer = true;
    s.setAttribute('data-official-badge', '1');
    (document.head || document.documentElement).appendChild(s);
})();

// PWA installability: link the web manifest + register a passthrough service
// worker (see /sw.js — network passthrough, no HTML caching, cannot serve stale
// content or take the site offline). Idempotent and fully fail-safe. Added 20260908.
(function () {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (window.__tmrPwaInit) return; window.__tmrPwaInit = true;
    try {
        var head = document.head || document.documentElement;
        if (!document.querySelector('link[rel="manifest"]')) {
            var m = document.createElement('link'); m.rel = 'manifest'; m.href = '/manifest.webmanifest'; head.appendChild(m);
        }
        if (!document.querySelector('meta[name="theme-color"]')) {
            var t = document.createElement('meta'); t.name = 'theme-color'; t.content = '#0b0f14'; head.appendChild(t);
        }
        if (!document.querySelector('link[rel="apple-touch-icon"]')) {
            var a = document.createElement('link'); a.rel = 'apple-touch-icon'; a.href = '/static/media/pwa-icon-192.png'; head.appendChild(a);
        }
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('/sw.js').catch(function () {});
            });
        }
    } catch (e) {}
})();
