// Configuration for Trust My Record

const CONFIG = {
    // ESPN API Configuration (FREE - no API key needed!)
    oddsApi: {
        key: null,
        baseUrl: "https://site.api.espn.com/apis/v2/scoreboard/header",
        provider: "ESPN (DraftKings data)",
    },

    // API Configuration
    // The frontend tries these URLs in order until one responds
    api: {
        baseUrl: "https://trustmyrecord-api.onrender.com/api",
        fallbackUrls: [
            "http://localhost:3000/api",
        ],
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
