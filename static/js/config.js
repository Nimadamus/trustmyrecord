// Configuration for Trust My Record
// Replace these values with your actual API keys

const CONFIG = {
    // Firebase Configuration (get from Firebase Console)
    firebase: {
        apiKey: "YOUR_FIREBASE_API_KEY",
        authDomain: "trustmyrecord.firebaseapp.com",
        projectId: "trustmyrecord",
        storageBucket: "trustmyrecord.appspot.com",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID"
    },

    // ESPN API Configuration (FREE - no API key needed!)
    // Powered by DraftKings data via ESPN's public API
    oddsApi: {
        // No key needed - ESPN is free!
        key: null,
        baseUrl: "https://site.api.espn.com/apis/v2/scoreboard/header",
        provider: "ESPN (DraftKings data)",
        note: "No API key required - completely free!"
    },

    // API Configuration
    api: {
        baseUrl: "https://trustmyrecord-api.onrender.com/api",
        timeout: 10000
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

// Export config
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
