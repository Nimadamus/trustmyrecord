// API Integration for Trust My Record
// Handles all external API calls for sports data

class SportsAPI {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.the-odds-api.com/v4';
        this.cache = new Map();
        this.cacheExpiry = 60000; // 1 minute
    }

    /**
     * Fetch available sports
     */
    async getSports() {
        const cacheKey = 'sports';
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await fetch(`${this.baseUrl}/sports?apiKey=${this.apiKey}`);
            if (!response.ok) throw new Error('Failed to fetch sports');

            const data = await response.json();
            this.setCache(cacheKey, data);
            return data;
        } catch (error) {
            console.error('Error fetching sports:', error);
            return this.getFallbackSports();
        }
    }

    /**
     * Fetch upcoming games for a sport with ALL available markets
     */
    async getUpcomingGames(sportKey) {
        const cacheKey = `games_${sportKey}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            // Request ALL available markets
            const url = `${this.baseUrl}/sports/${sportKey}/odds?` +
                        `apiKey=${this.apiKey}&` +
                        `regions=us,us2,uk,eu,au&` + // Multiple regions for more coverage
                        `markets=h2h,spreads,totals,outrights,h2h_lay,outrights_lay&` + // All markets
                        `oddsFormat=american&` +
                        `dateFormat=iso`;

            const response = await fetch(url);

            // Log API usage
            const remaining = response.headers.get('x-requests-remaining');
            const used = response.headers.get('x-requests-used');
            if (remaining) {
                console.log(`API Requests - Used: ${used}, Remaining: ${remaining}`);
            }

            if (!response.ok) throw new Error('Failed to fetch games');

            const data = await response.json();
            console.log(`Fetched ${data.length} games for ${sportKey}`);

            const games = this.formatGamesData(data);
            this.setCache(cacheKey, games);
            return games;
        } catch (error) {
            console.error('Error fetching games:', error);
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
            // First get all active sports
            const sports = await this.getSports();
            const activeSports = sports.filter(s => s.active);

            console.log(`Fetching games from ${activeSports.length} active sports...`);

            // Fetch games for each sport in parallel
            const allGamesPromises = activeSports.map(sport =>
                this.getUpcomingGames(sport.key).catch(err => {
                    console.error(`Error fetching ${sport.key}:`, err);
                    return [];
                })
            );

            const allGamesArrays = await Promise.all(allGamesPromises);

            // Flatten and combine all games
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
     * Fetch scores for grading picks
     */
    async getScores(sportKey, daysFrom = 1) {
        try {
            const url = `${this.baseUrl}/sports/${sportKey}/scores?` +
                        `apiKey=${this.apiKey}&` +
                        `daysFrom=${daysFrom}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch scores');

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching scores:', error);
            return [];
        }
    }

    /**
     * Format games data for display - extracts ALL available markets
     */
    formatGamesData(rawGames) {
        return rawGames.map(game => {
            // Use first bookmaker, or try multiple if first doesn't have all markets
            const bookmakers = game.bookmakers || [];
            const allMarkets = this.consolidateMarkets(bookmakers);

            const h2h = allMarkets.find(m => m.key === 'h2h');
            const spreads = allMarkets.find(m => m.key === 'spreads');
            const totals = allMarkets.find(m => m.key === 'totals');
            const outrights = allMarkets.find(m => m.key === 'outrights');

            return {
                id: game.id,
                sport: game.sport_key,
                sport_title: game.sport_title,
                commence_time: game.commence_time,
                home_team: game.home_team,
                away_team: game.away_team,
                bookmakers_count: bookmakers.length,
                odds: {
                    moneyline: h2h ? {
                        home: h2h.outcomes.find(o => o.name === game.home_team)?.price,
                        away: h2h.outcomes.find(o => o.name === game.away_team)?.price,
                        bookmaker: h2h.bookmaker
                    } : null,
                    spread: spreads ? {
                        home: {
                            point: spreads.outcomes.find(o => o.name === game.home_team)?.point,
                            price: spreads.outcomes.find(o => o.name === game.home_team)?.price
                        },
                        away: {
                            point: spreads.outcomes.find(o => o.name === game.away_team)?.point,
                            price: spreads.outcomes.find(o => o.name === game.away_team)?.price
                        },
                        bookmaker: spreads.bookmaker
                    } : null,
                    totals: totals ? {
                        over: {
                            point: totals.outcomes.find(o => o.name === 'Over')?.point,
                            price: totals.outcomes.find(o => o.name === 'Over')?.price
                        },
                        under: {
                            point: totals.outcomes.find(o => o.name === 'Under')?.point,
                            price: totals.outcomes.find(o => o.name === 'Under')?.price
                        },
                        bookmaker: totals.bookmaker
                    } : null,
                    outrights: outrights ? {
                        outcomes: outrights.outcomes,
                        bookmaker: outrights.bookmaker
                    } : null,
                    // Store all bookmakers for comparison
                    allBookmakers: bookmakers.map(b => ({
                        name: b.key,
                        title: b.title,
                        markets: b.markets
                    }))
                }
            };
        });
    }

    /**
     * Consolidate markets from multiple bookmakers
     * Prefers DraftKings, FanDuel, then any US bookmaker
     */
    consolidateMarkets(bookmakers) {
        const preferredBooks = ['draftkings', 'fanduel', 'betmgm', 'caesars'];
        const allMarkets = [];

        // Try preferred bookmakers first
        for (const bookKey of preferredBooks) {
            const book = bookmakers.find(b => b.key === bookKey);
            if (book?.markets) {
                book.markets.forEach(market => {
                    market.bookmaker = book.title;
                    allMarkets.push(market);
                });
                return allMarkets; // Use first preferred book found
            }
        }

        // Fall back to first available bookmaker
        if (bookmakers.length > 0 && bookmakers[0].markets) {
            bookmakers[0].markets.forEach(market => {
                market.bookmaker = bookmakers[0].title;
                allMarkets.push(market);
            });
        }

        return allMarkets;
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

    /**
     * Fallback sports list if API fails
     */
    getFallbackSports() {
        return [
            { key: 'americanfootball_nfl', title: 'NFL', group: 'American Football', active: true },
            { key: 'basketball_nba', title: 'NBA', group: 'Basketball', active: true },
            { key: 'baseball_mlb', title: 'MLB', group: 'Baseball', active: true },
            { key: 'icehockey_nhl', title: 'NHL', group: 'Ice Hockey', active: true }
        ];
    }
}

/**
 * Mock API for development (when API key not set)
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
        // Return mock data for development
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
                        home: {
                            point: -7.5,
                            price: -110
                        },
                        away: {
                            point: 7.5,
                            price: -110
                        }
                    },
                    totals: {
                        over: {
                            point: 45.5,
                            price: -110
                        },
                        under: {
                            point: 45.5,
                            price: -110
                        }
                    }
                }
            });
        });

        return games;
    }

    async getScores(sportKey, daysFrom = 1) {
        return [];
    }
}

// Initialize API
let sportsAPI;

function initSportsAPI(apiKey) {
    if (!apiKey || apiKey === 'YOUR_ODDS_API_KEY') {
        console.warn('Using Mock Sports API - Set real API key in config.js');
        sportsAPI = new MockSportsAPI();
    } else {
        sportsAPI = new SportsAPI(apiKey);
    }
    return sportsAPI;
}

// Export
if (typeof window !== 'undefined') {
    window.SportsAPI = SportsAPI;
    window.MockSportsAPI = MockSportsAPI;
    window.initSportsAPI = initSportsAPI;
}
