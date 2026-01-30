// API Integration for Trust My Record
// Uses FREE ESPN API (powered by DraftKings data) - NO API KEY REQUIRED!

class SportsAPI {
    constructor() {
        // ESPN endpoints - completely free, no API key needed
        this.espnEndpoints = {
            'basketball_nba': 'https://site.api.espn.com/apis/v2/scoreboard/header?sport=basketball&league=nba',
            'icehockey_nhl': 'https://site.api.espn.com/apis/v2/scoreboard/header?sport=hockey&league=nhl',
            'americanfootball_nfl': 'https://site.api.espn.com/apis/v2/scoreboard/header?sport=football&league=nfl',
            'baseball_mlb': 'https://site.api.espn.com/apis/v2/scoreboard/header?sport=baseball&league=mlb',
            'basketball_ncaab': 'https://site.api.espn.com/apis/v2/scoreboard/header?sport=basketball&league=mens-college-basketball',
            'americanfootball_ncaaf': 'https://site.api.espn.com/apis/v2/scoreboard/header?sport=football&league=college-football',
        };
        this.cache = new Map();
        this.cacheExpiry = 60000; // 1 minute
    }

    /**
     * Fetch available sports - returns list of supported sports
     */
    async getSports() {
        return [
            { key: 'basketball_nba', title: 'NBA', group: 'Basketball', active: true },
            { key: 'icehockey_nhl', title: 'NHL', group: 'Ice Hockey', active: true },
            { key: 'americanfootball_nfl', title: 'NFL', group: 'American Football', active: true },
            { key: 'baseball_mlb', title: 'MLB', group: 'Baseball', active: true },
            { key: 'basketball_ncaab', title: 'NCAA Basketball', group: 'Basketball', active: true },
            { key: 'americanfootball_ncaaf', title: 'NCAA Football', group: 'American Football', active: true },
        ];
    }

    /**
     * Fetch upcoming games for a sport from ESPN (FREE!)
     */
    async getUpcomingGames(sportKey) {
        const cacheKey = `games_${sportKey}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        const url = this.espnEndpoints[sportKey];
        if (!url) {
            console.warn(`No ESPN endpoint for sport: ${sportKey}`);
            return [];
        }

        try {
            console.log(`Fetching ${sportKey} from ESPN (FREE)...`);
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch from ESPN');

            const data = await response.json();
            const games = this.formatESPNData(data, sportKey);

            console.log(`Fetched ${games.length} games for ${sportKey} from ESPN`);
            this.setCache(cacheKey, games);
            return games;
        } catch (error) {
            console.error('Error fetching games from ESPN:', error);
            return [];
        }
    }

    /**
     * Fetch games from ALL active sports at once
     */
    async getAllUpcomingGames() {
        const cacheKey = 'all_games';
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const sports = await this.getSports();
            const activeSports = sports.filter(s => s.active);

            console.log(`Fetching games from ${activeSports.length} sports (FREE via ESPN)...`);

            const allGamesPromises = activeSports.map(sport =>
                this.getUpcomingGames(sport.key).catch(err => {
                    console.error(`Error fetching ${sport.key}:`, err);
                    return [];
                })
            );

            const allGamesArrays = await Promise.all(allGamesPromises);
            const allGames = allGamesArrays.flat();

            console.log(`Total games fetched: ${allGames.length}`);

            this.setCache(cacheKey, allGames);
            return allGames;
        } catch (error) {
            console.error('Error fetching all games:', error);
            return [];
        }
    }

    /**
     * Format ESPN data to match the expected format
     */
    formatESPNData(data, sportKey) {
        const games = [];

        try {
            for (const sport of data.sports || []) {
                for (const league of sport.leagues || []) {
                    for (const event of league.events || []) {
                        const oddsData = event.odds || {};

                        // Skip events without odds
                        if (!oddsData || Object.keys(oddsData).length === 0) continue;

                        const awayTeamData = oddsData.awayTeamOdds?.team || {};
                        const homeTeamData = oddsData.homeTeamOdds?.team || {};

                        const game = {
                            id: event.id,
                            sport: sportKey,
                            sport_title: this.getSportTitle(sportKey),
                            commence_time: event.date,
                            home_team: homeTeamData.displayName || event.name?.split(' at ')[1] || 'Home',
                            away_team: awayTeamData.displayName || event.name?.split(' at ')[0] || 'Away',
                            bookmakers_count: 1,
                            odds: {
                                moneyline: null,
                                spread: null,
                                totals: null
                            }
                        };

                        // Extract moneyline
                        const homeML = oddsData.homeTeamOdds?.moneyLine;
                        const awayML = oddsData.awayTeamOdds?.moneyLine;
                        if (homeML !== undefined && awayML !== undefined) {
                            game.odds.moneyline = {
                                home: homeML,
                                away: awayML,
                                bookmaker: oddsData.provider?.name || 'DraftKings'
                            };
                        }

                        // Extract spread
                        const spread = oddsData.spread;
                        if (spread !== undefined) {
                            const homeSpreadOdds = oddsData.homeTeamOdds?.spreadOdds || -110;
                            const awaySpreadOdds = oddsData.awayTeamOdds?.spreadOdds || -110;
                            game.odds.spread = {
                                home: {
                                    point: spread,
                                    price: homeSpreadOdds
                                },
                                away: {
                                    point: -spread,
                                    price: awaySpreadOdds
                                },
                                bookmaker: oddsData.provider?.name || 'DraftKings'
                            };
                        }

                        // Extract totals
                        const total = oddsData.overUnder;
                        if (total !== undefined) {
                            const overOdds = oddsData.overOdds || -110;
                            const underOdds = oddsData.underOdds || -110;
                            game.odds.totals = {
                                over: {
                                    point: total,
                                    price: overOdds
                                },
                                under: {
                                    point: total,
                                    price: underOdds
                                },
                                bookmaker: oddsData.provider?.name || 'DraftKings'
                            };
                        }

                        // Only add games that have at least one type of odds
                        if (game.odds.moneyline || game.odds.spread || game.odds.totals) {
                            games.push(game);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing ESPN data:', error);
        }

        return games;
    }

    /**
     * Get sport title from key
     */
    getSportTitle(sportKey) {
        const titles = {
            'basketball_nba': 'NBA',
            'icehockey_nhl': 'NHL',
            'americanfootball_nfl': 'NFL',
            'baseball_mlb': 'MLB',
            'basketball_ncaab': 'NCAA Basketball',
            'americanfootball_ncaaf': 'NCAA Football'
        };
        return titles[sportKey] || sportKey;
    }

    /**
     * Fetch scores for grading picks - uses ESPN scoreboard
     */
    async getScores(sportKey, daysFrom = 1) {
        try {
            const sportMap = {
                'basketball_nba': 'basketball/nba',
                'icehockey_nhl': 'hockey/nhl',
                'americanfootball_nfl': 'football/nfl',
                'baseball_mlb': 'baseball/mlb',
                'basketball_ncaab': 'basketball/mens-college-basketball',
                'americanfootball_ncaaf': 'football/college-football'
            };

            const espnPath = sportMap[sportKey];
            if (!espnPath) return [];

            const url = `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/scoreboard`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch scores');

            const data = await response.json();

            // Format scores for grading
            return (data.events || []).map(event => {
                const competition = event.competitions?.[0] || {};
                const competitors = competition.competitors || [];

                const homeTeam = competitors.find(c => c.homeAway === 'home');
                const awayTeam = competitors.find(c => c.homeAway === 'away');

                return {
                    id: event.id,
                    sport_key: sportKey,
                    commence_time: event.date,
                    completed: event.status?.type?.completed || false,
                    home_team: homeTeam?.team?.displayName || '',
                    away_team: awayTeam?.team?.displayName || '',
                    scores: [
                        { name: homeTeam?.team?.displayName, score: homeTeam?.score },
                        { name: awayTeam?.team?.displayName, score: awayTeam?.score }
                    ]
                };
            });
        } catch (error) {
            console.error('Error fetching scores:', error);
            return [];
        }
    }

    /**
     * Cache management
     */
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        if (Date.now() - cached.timestamp > this.cacheExpiry) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }
}

/**
 * Mock API for development (fallback if ESPN fails)
 */
class MockSportsAPI {
    async getSports() {
        return [
            { key: 'americanfootball_nfl', title: 'NFL', group: 'American Football', active: true },
            { key: 'basketball_nba', title: 'NBA', group: 'Basketball', active: true },
            { key: 'baseball_mlb', title: 'MLB', group: 'Baseball', active: true },
            { key: 'icehockey_nhl', title: 'NHL', group: 'Ice Hockey', active: true }
        ];
    }

    async getUpcomingGames(sportKey) {
        const now = new Date();
        const games = [];

        const teams = {
            'americanfootball_nfl': [
                ['Kansas City Chiefs', 'Las Vegas Raiders'],
                ['Buffalo Bills', 'Miami Dolphins'],
                ['Philadelphia Eagles', 'Dallas Cowboys']
            ],
            'basketball_nba': [
                ['Los Angeles Lakers', 'Golden State Warriors'],
                ['Boston Celtics', 'Miami Heat'],
                ['Milwaukee Bucks', 'Phoenix Suns']
            ],
            'baseball_mlb': [
                ['New York Yankees', 'Boston Red Sox'],
                ['Los Angeles Dodgers', 'San Francisco Giants'],
                ['Atlanta Braves', 'New York Mets']
            ],
            'icehockey_nhl': [
                ['Toronto Maple Leafs', 'Montreal Canadiens'],
                ['Edmonton Oilers', 'Calgary Flames'],
                ['New York Rangers', 'New Jersey Devils']
            ]
        };

        const sportTeams = teams[sportKey] || teams['americanfootball_nfl'];

        sportTeams.forEach((matchup, i) => {
            games.push({
                id: `${sportKey}_game_${i}`,
                sport: sportKey,
                commence_time: new Date(now.getTime() + (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
                home_team: matchup[0],
                away_team: matchup[1],
                odds: {
                    moneyline: {
                        home: -150 + Math.floor(Math.random() * 100),
                        away: 130 + Math.floor(Math.random() * 100)
                    },
                    spread: {
                        home: { point: -7.5, price: -110 },
                        away: { point: 7.5, price: -110 }
                    },
                    totals: {
                        over: { point: 45.5, price: -110 },
                        under: { point: 45.5, price: -110 }
                    }
                }
            });
        });

        return games;
    }

    async getAllUpcomingGames() {
        const sports = await this.getSports();
        const allGames = [];
        for (const sport of sports) {
            const games = await this.getUpcomingGames(sport.key);
            allGames.push(...games);
        }
        return allGames;
    }

    async getScores(sportKey, daysFrom = 1) {
        return [];
    }
}

// Initialize API - now uses ESPN by default (no API key needed!)
let sportsAPI;

function initSportsAPI(apiKey) {
    // Always use the real ESPN-based API - it's FREE!
    console.log('🎉 Using FREE ESPN Sports API (powered by DraftKings data)');
    sportsAPI = new SportsAPI();
    return sportsAPI;
}

// Export
if (typeof window !== 'undefined') {
    window.SportsAPI = SportsAPI;
    window.MockSportsAPI = MockSportsAPI;
    window.initSportsAPI = initSportsAPI;
}
