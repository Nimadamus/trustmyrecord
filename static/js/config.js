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

    // The Odds API Configuration
    oddsApi: {
        // Check localStorage first, then fall back to hardcoded value
        key: (typeof localStorage !== 'undefined' && localStorage.getItem('oddsAPIKey')) || "deac7e7af6a8f1a5ac84c625e04973a",
        baseUrl: "https://api.the-odds-api.com/v4",
        endpoints: {
            sports: "/sports",
            odds: "/sports/{sport}/odds",
            scores: "/sports/{sport}/scores"
        }
    },

    // API Configuration
    api: {
        baseUrl: "https://trustmyrecord.com/api",
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
