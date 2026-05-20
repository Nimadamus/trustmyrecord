// Configuration for TrustMyRecord

const TMR_IS_LOCAL_HOST =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);

const CONFIG = {
    // ESPN API Configuration (FREE - no API key needed!)
    oddsApi: {
        key: null,
        baseUrl: "https://site.api.espn.com/apis/v2/scoreboard/header",
        provider: "ESPN (DraftKings data)",
    },

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

// Auth links must remain native, reliable navigation even if later header scripts fail.
(function () {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (window.__tmrAuthClickFallbackInstalled) return;
    window.__tmrAuthClickFallbackInstalled = true;

    var authSelector = 'a.auth-link, a[data-tmr-auth-route], a[href="/login/"], a[href="/register/"], a[href="login/"], a[href="register/"]';

    function findAuthLink(event) {
        var target = event.target;
        var link = target && target.closest && target.closest(authSelector);
        if (link) return link;
        if (typeof document.elementsFromPoint !== 'function') return null;
        var stack = document.elementsFromPoint(event.clientX, event.clientY) || [];
        for (var i = 0; i < stack.length; i += 1) {
            var element = stack[i];
            if (element && element.closest) {
                link = element.closest(authSelector);
                if (link) return link;
            }
        }
        return null;
    }

    function destinationFor(link) {
        if (!link) return '';
        var href = String(link.getAttribute('href') || '');
        var route = String(link.getAttribute('data-tmr-auth-route') || '');
        if (route === 'signup' || /(^|\/)register\/?$/i.test(href)) return '/register/';
        if (route === 'login' || /(^|\/)login\/?$/i.test(href)) return '/login/';
        return '';
    }

    document.addEventListener('click', function (event) {
        var destination = destinationFor(findAuthLink(event));
        if (!destination) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        window.location.assign(destination);
    }, true);
})();

// JustBet MLB Contest sitewide promo modal loader (DISABLED).
// The modal's full-screen backdrop intercepts homepage Log in / Sign up clicks
// and the elementsFromPoint workaround still leaves the page visually blocked.
// Disabling the sitewide auto-open until the modal can re-launch without
// covering the auth controls. The contest landing page itself is untouched.
// Re-enable by restoring the document.createElement('script') loader.
