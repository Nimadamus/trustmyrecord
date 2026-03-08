/**
 * Trust My Record - Real Auto-Grader using ESPN API
 * Fetches actual game scores and grades picks accurately
 */

const TMR_GRADER = {
    PICKS_KEY: 'tmr_picks',
    CACHE_KEY: 'tmr_scores_cache',
    CACHE_TTL: 5 * 60 * 1000, // 5 minutes
    
    // ESPN API endpoints for different sports
    ESPN_ENDPOINTS: {
        'NBA': 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
        'NFL': 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
        'MLB': 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
        'NHL': 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard',
        'NCAAB': 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard',
        'NCAAF': 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard'
    },
    
    init: function() {
        console.log('[TMR Grader] Real-time grader initialized');
        this.runAutoGrading();
        
        // Run grading every 2 minutes
        setInterval(() => this.runAutoGrading(), 2 * 60 * 1000);
        
        // Run when page becomes visible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.runAutoGrading();
        });
    },
    
    getPicks: function() {
        try {
            const stored = localStorage.getItem(this.PICKS_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    },
    
    savePicks: function(picks) {
        localStorage.setItem(this.PICKS_KEY, JSON.stringify(picks));
    },
    
    // Fetch real scores from ESPN API
    fetchScores: async function(sport) {
        const endpoint = this.ESPN_ENDPOINTS[sport];
        if (!endpoint) return null;
        
        try {
            const response = await fetch(endpoint);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return this.parseESPNGames(data, sport);
        } catch (e) {
            console.error(`[TMR Grader] Failed to fetch ${sport} scores:`, e);
            return null;
        }
    },
    
    // Parse ESPN API response into game objects
    parseESPNGames: function(data, sport) {
        if (!data || !data.events) return [];
        
        return data.events.map(event => {
            const competition = event.competitions?.[0];
            if (!competition) return null;
            
            const homeTeam = competition.competitors?.find(c => c.homeAway === 'home');
            const awayTeam = competition.competitors?.find(c => c.homeAway === 'away');
            
            if (!homeTeam || !awayTeam) return null;
            
            return {
                id: event.id,
                sport: sport,
                status: event.status?.type?.state || 'pre',
                statusDetail: event.status?.type?.shortDetail || '',
                isFinal: event.status?.type?.completed === true || event.status?.type?.state === 'post',
                date: event.date,
                homeTeam: {
                    name: homeTeam.team?.displayName || homeTeam.team?.shortDisplayName,
                    abbreviation: homeTeam.team?.abbreviation,
                    score: parseInt(homeTeam.score) || 0
                },
                awayTeam: {
                    name: awayTeam.team?.displayName || awayTeam.team?.shortDisplayName,
                    abbreviation: awayTeam.team?.abbreviation,
                    score: parseInt(awayTeam.score) || 0
                }
            };
        }).filter(g => g !== null);
    },
    
    // Find matching game for a pick
    findGameForPick: function(pick, games) {
        const pickTeams = [
            pick.team?.toLowerCase(),
            pick.opponent?.toLowerCase(),
            pick.homeTeam?.toLowerCase(),
            pick.awayTeam?.toLowerCase()
        ].filter(Boolean);
        
        return games.find(game => {
            const gameTeams = [
                game.homeTeam.name?.toLowerCase(),
                game.homeTeam.abbreviation?.toLowerCase(),
                game.awayTeam.name?.toLowerCase(),
                game.awayTeam.abbreviation?.toLowerCase()
            ];
            
            return pickTeams.some(pt => 
                gameTeams.some(gt => gt && pt && (gt.includes(pt) || pt.includes(gt)))
            );
        });
    },
    
    // Grade a pick based on real game result
    gradePick: function(pick, game) {
        if (!game || !game.isFinal) return null;
        
        const homeScore = game.homeTeam.score;
        const awayScore = game.awayTeam.score;
        const total = homeScore + awayScore;
        const spread = homeScore - awayScore;
        
        const pickType = (pick.pickType || pick.betType || '').toLowerCase();
        const pickLine = parseFloat(pick.line || pick.spread || 0);
        const pickTotal = parseFloat(pick.total || 0);
        const pickTeam = (pick.pickTeam || pick.team || '').toLowerCase();
        const homeTeamName = (game.homeTeam.name || '').toLowerCase();
        
        let result = 'lost';
        
        // Moneyline
        if (pickType.includes('moneyline') || pickType === 'ml') {
            const pickedHome = pickTeam && homeTeamName.includes(pickTeam);
            const homeWon = homeScore > awayScore;
            
            if (homeScore === awayScore) {
                result = 'pushed';
            } else if (pickedHome && homeWon) {
                result = 'won';
            } else if (!pickedHome && !homeWon) {
                result = 'won';
            }
        }
        // Spread
        else if (pickType.includes('spread') || pickType === 'ats') {
            const pickedHome = pickTeam && homeTeamName.includes(pickTeam);
            const adjustedSpread = pickedHome ? spread : -spread;
            
            if (adjustedSpread === pickLine) {
                result = 'pushed';
            } else if (pickLine < 0) { // Favorite
                result = adjustedSpread > Math.abs(pickLine) ? 'won' : 'lost';
            } else { // Underdog
                result = adjustedSpread + pickLine > 0 ? 'won' : 'lost';
            }
        }
        // Total/Over-Under
        else if (pickType.includes('total') || pickType.includes('over') || pickType.includes('under')) {
            const isOver = pickType.includes('over') || (pick.pick && pick.pick.toLowerCase().includes('over'));
            
            if (total === pickTotal) {
                result = 'pushed';
            } else if (isOver) {
                result = total > pickTotal ? 'won' : 'lost';
            } else {
                result = total < pickTotal ? 'won' : 'lost';
            }
        }
        
        return {
            result: result,
            finalScore: `${awayScore}-${homeScore}`,
            settledAt: new Date().toISOString(),
            gradedBy: 'espn-api',
            gameDate: game.date
        };
    },
    
    // Calculate profit
    calculateProfit: function(pick, result) {
        if (result === 'pushed') return 0;
        
        const stake = parseFloat(pick.stake) || 1;
        const odds = parseFloat(pick.odds) || -110;
        
        if (result === 'won') {
            return odds > 0 ? stake * (odds / 100) : stake * (100 / Math.abs(odds));
        }
        return -stake;
    },
    
    // Main grading function
    runAutoGrading: async function() {
        const picks = this.getPicks();
        const pendingPicks = picks.filter(p => p.status === 'pending');
        
        if (pendingPicks.length === 0) return;
        
        // Group by sport
        const bySport = {};
        pendingPicks.forEach(p => {
            const sport = p.sport || 'NBA';
            if (!bySport[sport]) bySport[sport] = [];
            bySport[sport].push(p);
        });
        
        let gradedCount = 0;
        const newResults = [];
        
        // Fetch scores for each sport and grade
        for (const [sport, sportPicks] of Object.entries(bySport)) {
            const games = await this.fetchScores(sport);
            if (!games || games.length === 0) continue;
            
            sportPicks.forEach(pick => {
                const game = this.findGameForPick(pick, games);
                if (game && game.isFinal) {
                    const grade = this.gradePick(pick, game);
                    if (grade) {
                        pick.status = 'settled';
                        pick.result = grade.result;
                        pick.settledAt = grade.settledAt;
                        pick.gradedBy = grade.gradedBy;
                        pick.finalScore = grade.finalScore;
                        pick.profit = this.calculateProfit(pick, grade.result);
                        
                        newResults.push({ pick, grade });
                        gradedCount++;
                    }
                }
            });
        }
        
        if (gradedCount > 0) {
            this.savePicks(picks);
            this.updateUserStats(picks);
            console.log(`[TMR Grader] Graded ${gradedCount} picks`);
            
            // Show notifications
            newResults.forEach(({ pick, grade }) => {
                if (pick.result === 'won') {
                    this.showToast(`✅ ${pick.pickTeam} WON! +${pick.profit?.toFixed(2) || '1.00'} units`, 'success');
                } else if (pick.result === 'lost') {
                    this.showToast(`❌ ${pick.pickTeam} lost`, 'error');
                }
            });
            
            // Refresh UI if on picks page
            if (typeof loadPicksHistory === 'function') loadPicksHistory();
            if (typeof updateUserStats === 'function') updateUserStats();
        }
    },
    
    // Update user stats
    updateUserStats: function(picks) {
        const stats = picks.reduce((acc, p) => {
            if (p.status === 'settled') {
                acc.totalPicks++;
                if (p.result === 'won') {
                    acc.wins++;
                    acc.profit += p.profit || 0;
                } else if (p.result === 'lost') {
                    acc.losses++;
                    acc.profit -= parseFloat(p.stake) || 0;
                } else if (p.result === 'pushed') {
                    acc.pushes++;
                }
            }
            return acc;
        }, { wins: 0, losses: 0, pushes: 0, profit: 0, totalPicks: 0 });
        
        stats.winRate = stats.totalPicks > 0 ? ((stats.wins / stats.totalPicks) * 100).toFixed(1) : 0;
        stats.units = stats.profit.toFixed(2);
        
        localStorage.setItem('tmr_user_stats', JSON.stringify(stats));
        return stats;
    },
    
    // Get current stats
    getStats: function() {
        const stored = localStorage.getItem('tmr_user_stats');
        if (stored) return JSON.parse(stored);
        return this.updateUserStats(this.getPicks());
    },
    
    // Show toast notification
    showToast: function(message, type = 'info') {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 9999;
            animation: slideIn 0.3s ease;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#06b6d4'};
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
};

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
    TMR_GRADER.init();
});

// Make globally available
window.TMR_GRADER = TMR_GRADER;
