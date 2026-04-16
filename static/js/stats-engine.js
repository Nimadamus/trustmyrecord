// Advanced Statistics Engine for Trust My Record
// Calculates ROI, CLV, streaks, sport breakdowns, and all handicapping metrics

class StatsEngine {
    constructor() {
        this.PICKS_KEY = 'tmr_picks';
        this.STATS_KEY = 'tmr_user_stats';
        this.CHALLENGES_KEY = 'tmr_challenges';
        this.COMPETITIONS_KEY = 'tmr_competitions';
    }

    /**
     * Get all picks for a user
     */
    getUserPicks(username) {
        const userKey = String(username || '').toLowerCase();
        const backendPicks = Array.isArray(window._cachedBackendPicks) ? window._cachedBackendPicks : [];
        const source = backendPicks.length ? backendPicks : this.getLocalPicks();
        return source
            .filter(pick => {
                if (!userKey) return true;
                return [pick.user_id, pick.userId, pick.username, pick.user_email, pick.email]
                    .map(value => String(value || '').toLowerCase())
                    .includes(userKey);
            })
            .map(pick => this.normalizePick(pick));
    }

    getLocalPicks() {
        try {
            const picks = JSON.parse(localStorage.getItem(this.PICKS_KEY) || '[]');
            return Array.isArray(picks) ? picks : [];
        } catch (error) {
            return [];
        }
    }

    normalizePick(pick) {
        const normalized = { ...(pick || {}) };
        const status = String(normalized.status || normalized.result || 'pending').toLowerCase();
        normalized.status = status === 'win' ? 'won'
            : status === 'loss' ? 'lost'
            : status === 'pushed' ? 'push'
            : status || 'pending';
        normalized.units = Number(normalized.units || normalized.stake || 1);
        normalized.odds = Number(normalized.odds || normalized.price || normalized.odds_snapshot || -110);
        if (normalized.result_units == null && typeof window.computeCanonicalRecordStats === 'function') {
            const computed = window.computeCanonicalRecordStats([normalized]);
            normalized.result_units = computed.totalUnits;
        }
        return normalized;
    }

    /**
     * Calculate comprehensive stats for a user
     */
    calculateUserStats(username) {
        const picks = this.getUserPicks(username);
        
        if (picks.length === 0) {
            return this.getDefaultStats();
        }

        const wonPicks = picks.filter(p => p.status === 'won');
        const lostPicks = picks.filter(p => p.status === 'lost');
        const pushPicks = picks.filter(p => p.status === 'pushed' || p.status === 'push');
        const pendingPicks = picks.filter(p => p.status === 'pending');
        const gradedPicks = picks.filter(p => p.status !== 'pending');

        const wins = wonPicks.length;
        const losses = lostPicks.length;
        const pushes = pushPicks.length;
        const pending = pendingPicks.length;
        const totalGraded = wins + losses + pushes;

        // Basic record
        const record = { wins, losses, pushes, pending };

        // Win rate (excluding pushes)
        const winRate = totalGraded > 0 ? (wins / (wins + losses)) * 100 : 0;

        // ROI Calculation
        const roi = this.calculateROI(picks);

        // Units calculation
        const units = this.calculateUnits(picks);

        // Average odds
        const avgOdds = this.calculateAverageOdds(gradedPicks);

        // Sport breakdown
        const sportBreakdown = this.calculateSportBreakdown(picks);

        // Bet type breakdown
        const betTypeBreakdown = this.calculateBetTypeBreakdown(picks);

        // Streaks
        const streaks = this.calculateStreaks(picks);

        // Monthly performance
        const monthlyPerformance = this.calculateMonthlyPerformance(picks);

        // Closing Line Value (CLV)
        const clv = this.calculateCLV(picks);

        // Best and worst picks
        const bestPick = this.findBestPick(wonPicks);
        const worstPick = this.findWorstPick(lostPicks);

        // Recent form (last 10, 20, 30 picks)
        const recentForm = this.calculateRecentForm(picks);

        return {
            username,
            lastUpdated: new Date().toISOString(),
            record,
            totalPicks: picks.length,
            totalGraded,
            winRate: parseFloat(winRate.toFixed(1)),
            roi: parseFloat(roi.toFixed(2)),
            units: parseFloat(units.toFixed(2)),
            avgOdds,
            sportBreakdown,
            betTypeBreakdown,
            streaks,
            monthlyPerformance,
            clv,
            bestPick,
            worstPick,
            recentForm,
            // Derived stats
            profitLoss: this.calculateProfitLoss(picks),
            expectedValue: this.calculateExpectedValue(picks),
            confidenceScore: this.calculateConfidenceScore(picks)
        };
    }

    /**
     * Get default stats for new users
     */
    getDefaultStats() {
        return {
            record: { wins: 0, losses: 0, pushes: 0, pending: 0 },
            totalPicks: 0,
            totalGraded: 0,
            winRate: 0,
            roi: 0,
            units: 0,
            avgOdds: null,
            sportBreakdown: {},
            betTypeBreakdown: {},
            streaks: { current: 0, best: 0, worst: 0 },
            monthlyPerformance: [],
            clv: { avg: 0, positive: 0, negative: 0 },
            bestPick: null,
            worstPick: null,
            recentForm: { last10: '-', last20: '-', last30: '-' },
            profitLoss: 0,
            expectedValue: 0,
            confidenceScore: 0
        };
    }

    /**
     * Calculate ROI (Return on Investment)
     * Standard: Risk 1 unit per bet, calculate net profit/loss percentage
     */
    calculateROI(picks) {
        const graded = picks.filter(p => p.status !== 'pending' && p.status !== 'void');
        if (graded.length === 0) return 0;

        let totalRisk = 0;
        let totalReturn = 0;

        graded.forEach(pick => {
            const stake = pick.stake || pick.units || 1;
            const odds = pick.odds || pick.price || pick.odds_snapshot || -110;

            // Risk depends on favorite vs underdog
            const risk = odds < 0 ? (stake * Math.abs(odds) / 100) : stake;
            totalRisk += risk;

            if (pick.status === 'won') {
                totalReturn += risk + this.calculatePayout(stake, odds);
            } else if (pick.status === 'pushed' || pick.status === 'push') {
                totalReturn += risk; // Push = risk returned
            }
            // Loss = 0 return
        });

        if (totalRisk === 0) return 0;
        return ((totalReturn - totalRisk) / totalRisk) * 100;
    }

    /**
     * Calculate total units won/lost
     */
    calculateUnits(picks) {
        const graded = picks.filter(p => p.status !== 'pending');

        return graded.reduce((total, pick) => {
            const stake = pick.stake || pick.units || 1;
            const odds = pick.odds || pick.price || pick.odds_snapshot || -110;

            if (pick.status === 'won') {
                return total + this.calculatePayout(stake, odds);
            } else if (pick.status === 'lost') {
                // Match autograder: favorite loss = stake * |odds|/100, underdog loss = stake
                if (odds < 0) {
                    return total - (stake * Math.abs(odds) / 100);
                } else {
                    return total - stake;
                }
            }
            // Push = no change
            return total;
        }, 0);
    }

    /**
     * Calculate payout for a winning bet
     * Matches autograder formula: favorites win = stake (units you're trying to win)
     * Underdogs win = stake * odds / 100
     */
    calculatePayout(stake, odds) {
        if (odds > 0) {
            return stake * (odds / 100);
        } else {
            // Favorite win: you win exactly your stake (units wagered = what you're trying to win)
            return stake;
        }
    }

    /**
     * Calculate average odds
     */
    calculateAverageOdds(picks) {
        if (picks.length === 0) return null;

        const oddsList = picks
            .filter(p => p.odds || p.price)
            .map(p => p.odds || p.price);

        if (oddsList.length === 0) return null;

        const sum = oddsList.reduce((a, b) => a + b, 0);
        return Math.round(sum / oddsList.length);
    }

    /**
     * Calculate sport-by-sport breakdown
     */
    calculateSportBreakdown(picks) {
        const bySport = {};

        picks.forEach(pick => {
            const sport = pick.sport_display || pick.sport || 'Other';
            
            if (!bySport[sport]) {
                bySport[sport] = {
                    wins: 0, losses: 0, pushes: 0, pending: 0,
                    total: 0, units: 0, roi: 0
                };
            }

            bySport[sport].total++;
            
            if (pick.status === 'won') bySport[sport].wins++;
            else if (pick.status === 'lost') bySport[sport].losses++;
            else if (pick.status === 'pushed' || pick.status === 'push') bySport[sport].pushes++;
            else if (pick.status === 'pending') bySport[sport].pending++;
        });

        // Calculate win rates and ROI for each sport
        Object.keys(bySport).forEach(sport => {
            const s = bySport[sport];
            const graded = s.wins + s.losses + s.pushes;
            s.winRate = graded > 0 ? ((s.wins / (s.wins + s.losses)) * 100).toFixed(1) : 0;
            
            // Calculate units for this sport
            const sportPicks = picks.filter(p => (p.sport_display || p.sport || 'Other') === sport);
            s.units = this.calculateUnits(sportPicks).toFixed(2);
            s.roi = this.calculateROI(sportPicks).toFixed(1);
        });

        return bySport;
    }

    /**
     * Calculate breakdown by bet type (spread, moneyline, total)
     */
    calculateBetTypeBreakdown(picks) {
        const byType = {
            spread: { wins: 0, losses: 0, pushes: 0, total: 0, winRate: 0, units: 0 },
            moneyline: { wins: 0, losses: 0, pushes: 0, total: 0, winRate: 0, units: 0 },
            total: { wins: 0, losses: 0, pushes: 0, total: 0, winRate: 0, units: 0 },
            other: { wins: 0, losses: 0, pushes: 0, total: 0, winRate: 0, units: 0 }
        };

        picks.forEach(pick => {
            let type = 'other';
            const betType = (pick.bet_type || pick.type || '').toLowerCase();
            const selection = (pick.selection || '').toLowerCase();

            if (betType.includes('spread') || selection.includes('+') || selection.includes('-')) {
                if (!selection.includes('over') && !selection.includes('under')) {
                    type = 'spread';
                }
            } else if (betType.includes('moneyline') || (!selection.includes('over') && !selection.includes('under') && !betType.includes('total'))) {
                type = 'moneyline';
            } else if (betType.includes('total') || selection.includes('over') || selection.includes('under')) {
                type = 'total';
            }

            byType[type].total++;
            if (pick.status === 'won') byType[type].wins++;
            else if (pick.status === 'lost') byType[type].losses++;
            else if (pick.status === 'pushed' || pick.status === 'push') byType[type].pushes++;
        });

        // Calculate win rates
        Object.keys(byType).forEach(type => {
            const t = byType[type];
            const graded = t.wins + t.losses;
            t.winRate = graded > 0 ? ((t.wins / graded) * 100).toFixed(1) : 0;
            
            const typePicks = picks.filter(p => {
                const bt = (p.bet_type || p.type || '').toLowerCase();
                const sel = (p.selection || '').toLowerCase();
                if (type === 'spread') return bt.includes('spread') || (sel.includes('+') || sel.includes('-'));
                if (type === 'moneyline') return bt.includes('moneyline');
                if (type === 'total') return bt.includes('total') || sel.includes('over') || sel.includes('under');
                return true;
            });
            t.units = this.calculateUnits(typePicks).toFixed(2);
        });

        return byType;
    }

    /**
     * Calculate current and best streaks
     */
    calculateStreaks(picks) {
        const graded = picks
            .filter(p => p.status !== 'pending')
            .sort((a, b) => new Date(b.locked_at || b.created_at) - new Date(a.locked_at || a.created_at));

        if (graded.length === 0) {
            return { current: 0, best: 0, worst: 0, type: 'none' };
        }

        let currentStreak = 0;
        let currentType = 'none';
        let bestStreak = 0;
        let worstStreak = 0;
        let tempStreak = 0;
        let tempType = 'none';

        // Calculate current streak (most recent results)
        for (let i = 0; i < graded.length; i++) {
            const pick = graded[i];
            
            if (i === 0) {
                if (pick.status === 'won') {
                    currentStreak = 1;
                    currentType = 'win';
                } else if (pick.status === 'lost') {
                    currentStreak = -1;
                    currentType = 'loss';
                } else {
                    continue;
                }
            } else {
                if (pick.status === 'won' && currentType === 'win') {
                    currentStreak++;
                } else if (pick.status === 'lost' && currentType === 'loss') {
                    currentStreak--;
                } else {
                    break;
                }
            }
        }

        // Calculate best and worst streaks
        for (const pick of graded) {
            if (pick.status === 'won') {
                if (tempType === 'win') {
                    tempStreak++;
                } else {
                    tempStreak = 1;
                    tempType = 'win';
                }
                bestStreak = Math.max(bestStreak, tempStreak);
            } else if (pick.status === 'lost') {
                if (tempType === 'loss') {
                    tempStreak++;
                } else {
                    tempStreak = 1;
                    tempType = 'loss';
                }
                worstStreak = Math.max(worstStreak, tempStreak);
            } else {
                tempStreak = 0;
                tempType = 'none';
            }
        }

        return {
            current: currentStreak,
            best: bestStreak,
            worst: worstStreak,
            type: currentType
        };
    }

    /**
     * Calculate monthly performance
     */
    calculateMonthlyPerformance(picks) {
        const byMonth = {};

        picks.forEach(pick => {
            const date = new Date(pick.locked_at || pick.created_at || pick.graded_at);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!byMonth[monthKey]) {
                byMonth[monthKey] = {
                    month: monthKey,
                    wins: 0, losses: 0, pushes: 0, total: 0,
                    units: 0, roi: 0
                };
            }

            byMonth[monthKey].total++;
            if (pick.status === 'won') byMonth[monthKey].wins++;
            else if (pick.status === 'lost') byMonth[monthKey].losses++;
            else if (pick.status === 'pushed' || pick.status === 'push') byMonth[monthKey].pushes++;
        });

        // Sort by month and calculate rates
        const months = Object.values(byMonth)
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-12); // Last 12 months

        months.forEach(m => {
            const graded = m.wins + m.losses;
            m.winRate = graded > 0 ? ((m.wins / graded) * 100).toFixed(1) : 0;
        });

        return months;
    }

    /**
     * Calculate Closing Line Value (CLV)
     * Compare line at bet time vs closing line
     */
    calculateCLV(picks) {
        const withCLV = picks.filter(p => p.opening_line && p.closing_line);
        
        if (withCLV.length === 0) {
            return { avg: 0, positive: 0, negative: 0, total: 0 };
        }

        let totalCLV = 0;
        let positive = 0;
        let negative = 0;

        withCLV.forEach(pick => {
            const clvValue = this.calculateSingleCLV(pick);
            totalCLV += clvValue;
            if (clvValue > 0) positive++;
            else if (clvValue < 0) negative++;
        });

        return {
            avg: (totalCLV / withCLV.length).toFixed(2),
            positive,
            negative,
            total: withCLV.length,
            percentPositive: ((positive / withCLV.length) * 100).toFixed(1)
        };
    }

    /**
     * Calculate CLV for a single pick
     */
    calculateSingleCLV(pick) {
        // Simplified CLV: positive means you got better line than closing
        // For spreads: lower spread (or higher if underdog) is better
        // For totals: depends on over/under
        // This is a simplified version - real CLV needs more context
        return 0; // Placeholder - would need opening/closing odds data
    }

    /**
     * Find best pick (highest payout)
     */
    findBestPick(wonPicks) {
        if (wonPicks.length === 0) return null;

        return wonPicks
            .map(p => ({
                ...p,
                payout: this.calculatePayout(p.stake || 1, p.odds || -110)
            }))
            .sort((a, b) => b.payout - a.payout)[0];
    }

    /**
     * Find worst pick (biggest loss or most confident wrong pick)
     */
    findWorstPick(lostPicks) {
        if (lostPicks.length === 0) return null;

        // Worst = highest stake lost or biggest odds favorite that lost
        return lostPicks
            .map(p => ({
                ...p,
                stake: p.stake || p.units || 1
            }))
            .sort((a, b) => b.stake - a.stake)[0];
    }

    /**
     * Calculate recent form (last 10, 20, 30 picks)
     */
    calculateRecentForm(picks) {
        const graded = picks
            .filter(p => p.status !== 'pending')
            .sort((a, b) => new Date(b.locked_at || b.created_at) - new Date(a.locked_at || a.created_at));

        const getRecord = (count) => {
            const subset = graded.slice(0, count);
            const w = subset.filter(p => p.status === 'won').length;
            const l = subset.filter(p => p.status === 'lost').length;
            return `${w}-${l}`;
        };

        return {
            last10: graded.length >= 1 ? getRecord(10) : '-',
            last20: graded.length >= 1 ? getRecord(20) : '-',
            last30: graded.length >= 1 ? getRecord(30) : '-'
        };
    }

    /**
     * Calculate P&L in dollars (if stake info available)
     */
    calculateProfitLoss(picks) {
        return this.calculateUnits(picks); // Same as units if betting 1 unit = $1
    }

    /**
     * Calculate expected value based on win rate and average odds
     */
    calculateExpectedValue(picks) {
        const graded = picks.filter(p => p.status !== 'pending');
        if (graded.length < 10) return 0;

        const winRate = graded.filter(p => p.status === 'won').length / graded.filter(p => p.status !== 'pushed' && p.status !== 'push').length;
        const avgOdds = this.calculateAverageOdds(graded);

        if (!avgOdds) return 0;

        // Convert odds to implied probability
        let impliedProb;
        if (avgOdds > 0) {
            impliedProb = 100 / (avgOdds + 100);
        } else {
            impliedProb = Math.abs(avgOdds) / (Math.abs(avgOdds) + 100);
        }

        // EV = (Win Rate * Avg Payout) - (Loss Rate * Stake)
        const avgPayout = this.calculatePayout(1, avgOdds);
        const ev = (winRate * avgPayout) - ((1 - winRate) * 1);

        return (ev * 100).toFixed(2); // As percentage
    }

    /**
     * Calculate a confidence score (0-100) based on sample size and consistency
     */
    calculateConfidenceScore(picks) {
        const graded = picks.filter(p => p.status !== 'pending');
        if (graded.length < 5) return 0;

        // Factors:
        // 1. Sample size (more picks = more confident, max at 100 picks)
        const sampleScore = Math.min(graded.length / 100 * 40, 40);

        // 2. Win rate consistency (closer to 50-60% is more sustainable)
        const winRate = (graded.filter(p => p.status === 'won').length / graded.filter(p => p.status !== 'pushed' && p.status !== 'push').length) * 100;
        const consistencyScore = winRate >= 45 && winRate <= 65 ? 30 : 15;

        // 3. Recent activity (picks in last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentPicks = graded.filter(p => new Date(p.locked_at || p.created_at) > thirtyDaysAgo).length;
        const activityScore = Math.min(recentPicks * 3, 30);

        return Math.round(sampleScore + consistencyScore + activityScore);
    }

    /**
     * Get leaderboard data
     */
    getLeaderboard(category = 'winRate', limit = 50) {
        const users = JSON.parse(localStorage.getItem('trustmyrecord_users') || '[]');
        const leaderboard = [];

        users.forEach(user => {
            const stats = this.calculateUserStats(user.username);
            
            // Only include users with minimum sample size
            if (stats.totalGraded >= 5) {
                leaderboard.push({
                    username: user.username,
                    displayName: user.displayName || user.username,
                    ...stats
                });
            }
        });

        // Sort by category
        leaderboard.sort((a, b) => {
            switch (category) {
                case 'winRate':
                    return b.winRate - a.winRate;
                case 'units':
                    return b.units - a.units;
                case 'roi':
                    return b.roi - a.roi;
                case 'totalPicks':
                    return b.totalPicks - a.totalPicks;
                default:
                    return b.winRate - a.winRate;
            }
        });

        return leaderboard.slice(0, limit);
    }

    /**
     * Save stats to cache
     */
    saveUserStats(username, stats) {
        const allStats = JSON.parse(localStorage.getItem(this.STATS_KEY) || '{}');
        allStats[username] = stats;
        localStorage.setItem(this.STATS_KEY, JSON.stringify(allStats));
    }

    /**
     * Get cached stats (or calculate if not cached)
     */
    getUserStats(username, useCache = true) {
        if (useCache) {
            const allStats = JSON.parse(localStorage.getItem(this.STATS_KEY) || '{}');
            const cached = allStats[username];
            
            // Use cache if less than 1 hour old
            if (cached && cached.lastUpdated) {
                const age = Date.now() - new Date(cached.lastUpdated).getTime();
                if (age < 3600000) { // 1 hour
                    return cached;
                }
            }
        }

        const stats = this.calculateUserStats(username);
        this.saveUserStats(username, stats);
        return stats;
    }

    /**
     * Invalidate cache for a user
     */
    invalidateCache(username) {
        const allStats = JSON.parse(localStorage.getItem(this.STATS_KEY) || '{}');
        delete allStats[username];
        localStorage.setItem(this.STATS_KEY, JSON.stringify(allStats));
    }

    /**
     * Get head-to-head comparison between two users
     */
    getHeadToHead(username1, username2) {
        const stats1 = this.getUserStats(username1);
        const stats2 = this.getUserStats(username2);

        // Find common games/opponents if available
        const picks1 = this.getUserPicks(username1);
        const picks2 = this.getUserPicks(username2);

        return {
            user1: stats1,
            user2: stats2,
            advantage: stats1.units > stats2.units ? username1 : 
                      stats2.units > stats1.units ? username2 : 'tie',
            totalPicks1: picks1.length,
            totalPicks2: picks2.length
        };
    }
}

// Create global instance
const statsEngine = new StatsEngine();
