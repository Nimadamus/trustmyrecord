// API Integration for Trust My Record
// Full API client with authentication support

class TrustMyRecordAPI {
    constructor() {
        this.baseUrl = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') 
            ? 'http://localhost:5000/api' 
            : '/api';
        this.token = null;
        this.user = null;
        this.initialized = false;
        
        // ESPN endpoints for sports data
        this.espnEndpoints = {
            'basketball_nba': 'https://site.api.espn.com/apis/v2/scoreboard/header?sport=basketball&league=nba',
            'icehockey_nhl': 'https://site.api.espn.com/apis/v2/scoreboard/header?sport=hockey&league=nhl',
            'americanfootball_nfl': 'https://site.api.espn.com/apis/v2/scoreboard/header?sport=football&league=nfl',
            'baseball_mlb': 'https://site.api.espn.com/apis/v2/scoreboard/header?sport=baseball&league=mlb',
            'basketball_ncaab': 'https://site.api.espn.com/apis/v2/scoreboard/header?sport=basketball&league=mens-college-basketball',
            'americanfootball_ncaaf': 'https://site.api.espn.com/apis/v2/scoreboard/header?sport=football&league=college-football',
        };
        this.cache = new Map();
        this.cacheExpiry = 60000;
        
        // Load token from localStorage
        this.loadAuth();
    }

    // AUTHENTICATION METHODS
    
    loadAuth() {
        try {
            this.token = localStorage.getItem('access_token');
            const userJson = localStorage.getItem('user');
            this.user = userJson ? JSON.parse(userJson) : null;
            this.initialized = true;
        } catch (e) {
            console.error('Failed to load auth:', e);
            this.initialized = true;
        }
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('access_token', token);
    }

    setUser(user) {
        this.user = user;
        localStorage.setItem('user', JSON.stringify(user));
    }

    clearAuth() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
    }

    isLoggedIn() {
        return !!this.token;
    }

    getAuthHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    // AUTH API CALLS

    async login(credentials) {
        const data = await this.post('/auth/login', credentials);
        const token = data.tokens?.access_token || data.access_token;
        if (token) {
            this.setToken(token);
            this.setUser(data.user);
        }
        return data;
    }

    async register(userData) {
        const data = await this.post('/auth/register', userData);
        const token = data.tokens?.access_token || data.access_token;
        if (token) {
            this.setToken(token);
            this.setUser(data.user);
        }
        return data;
    }

    logout() {
        this.clearAuth();
    }

    async getCurrentUser() {
        const data = await this.get('/auth/me');
        this.setUser(data);
        return data;
    }

    // CORE HTTP METHODS

    async get(endpoint) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'GET',
            headers: this.getAuthHeaders()
        });
        return this.handleResponse(response);
    }

    async post(endpoint, data) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(data)
        });
        return this.handleResponse(response);
    }

    async put(endpoint, data) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'PUT',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(data)
        });
        return this.handleResponse(response);
    }

    async delete(endpoint) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'DELETE',
            headers: this.getAuthHeaders()
        });
        return this.handleResponse(response);
    }

    async handleResponse(response) {
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }
        return response.json();
    }

    // SPORTS DATA METHODS

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
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch from ESPN');
            
            const data = await response.json();
            const games = this.parseESPNData(data, sportKey);
            this.setCache(cacheKey, games);
            return games;
        } catch (error) {
            console.error('ESPN fetch failed:', error);
            return this.getFromCache(cacheKey, true) || [];
        }
    }

    parseESPNData(data, sportKey) {
        if (!data.events) return [];
        
        return data.events.map(event => {
            const homeTeam = event.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home');
            const awayTeam = event.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away');
            
            return {
                id: event.id,
                home_team: homeTeam?.team?.displayName || 'TBD',
                away_team: awayTeam?.team?.displayName || 'TBD',
                home_team_abbreviation: homeTeam?.team?.abbreviation || '',
                away_team_abbreviation: awayTeam?.team?.abbreviation || '',
                commence_time: event.date,
                sport: sportKey,
                status: event.status?.type?.shortDetail || 'Scheduled',
                odds: this.extractOdds(event)
            };
        });
    }

    extractOdds(event) {
        try {
            const oddsData = event.competitions?.[0]?.odds?.[0];
            if (!oddsData) return null;
            
            return {
                spread: oddsData.spread,
                overUnder: oddsData.overUnder,
                homeMoneyline: oddsData.homeTeamOdds?.moneyLine,
                awayMoneyline: oddsData.awayTeamOdds?.moneyLine
            };
        } catch (e) {
            return null;
        }
    }

    // CACHE METHODS

    getFromCache(key, allowExpired = false) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        if (!allowExpired && Date.now() - cached.timestamp > this.cacheExpiry) {
            this.cache.delete(key);
            return null;
        }
        return cached.data;
    }

    setCache(key, data) {
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    clearCache() {
        this.cache.clear();
    }
}

// Create global instance
const api = new TrustMyRecordAPI();
