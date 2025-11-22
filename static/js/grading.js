// Pick Grading System for Trust My Record
// Automatically grades picks based on game results

class PickGradingSystem {
    constructor() {
        this.api = null;
        this.isGrading = false;
        this.lastGradeCheck = null;
    }

    /**
     * Initialize grading system with API
     */
    init(sportsAPI) {
        this.api = sportsAPI;
        console.log('📊 Pick Grading System initialized');

        // Run grading on page load
        this.gradeAllPendingPicks();

        // Auto-grade every 5 minutes
        setInterval(() => {
            this.gradeAllPendingPicks();
        }, 5 * 60 * 1000);
    }

    /**
     * Grade all pending picks
     */
    async gradeAllPendingPicks() {
        if (this.isGrading) {
            console.log('⏳ Grading already in progress, skipping...');
            return;
        }

        this.isGrading = true;
        console.log('📊 Starting pick grading process...');

        try {
            const picks = JSON.parse(localStorage.getItem('trustmyrecord_picks') || '[]');
            const pendingPicks = picks.filter(pick => pick.status === 'pending');

            if (pendingPicks.length === 0) {
                console.log('✅ No pending picks to grade');
                this.isGrading = false;
                return;
            }

            console.log(`Found ${pendingPicks.length} pending picks to grade`);

            // Group picks by sport to minimize API calls
            const picksBySport = {};
            pendingPicks.forEach(pick => {
                if (!picksBySport[pick.sport]) {
                    picksBySport[pick.sport] = [];
                }
                picksBySport[pick.sport].push(pick);
            });

            let gradedCount = 0;

            // Grade picks for each sport
            for (const [sport, sportPicks] of Object.entries(picksBySport)) {
                console.log(`Grading ${sportPicks.length} ${sport} picks...`);

                try {
                    // Fetch scores from last 3 days
                    const scores = await this.api.getScores(sport, 3);

                    if (!scores || scores.length === 0) {
                        console.log(`No scores found for ${sport}`);
                        continue;
                    }

                    // Grade each pick
                    for (const pick of sportPicks) {
                        const gradeResult = this.gradePick(pick, scores);
                        if (gradeResult) {
                            gradedCount++;
                        }
                    }
                } catch (error) {
                    console.error(`Error grading ${sport} picks:`, error);
                }
            }

            if (gradedCount > 0) {
                // Save updated picks
                localStorage.setItem('trustmyrecord_picks', JSON.stringify(picks));

                // Recalculate all user stats
                this.recalculateAllUserStats();

                console.log(`✅ Graded ${gradedCount} picks successfully`);

                // Refresh UI if feed is visible
                if (typeof renderFeed === 'function') {
                    renderFeed();
                }
            }

            this.lastGradeCheck = new Date();

        } catch (error) {
            console.error('❌ Error in grading system:', error);
        } finally {
            this.isGrading = false;
        }
    }

    /**
     * Grade a single pick against game scores
     */
    gradePick(pick, scores) {
        if (!pick.gameId) {
            console.warn('Pick missing gameId, cannot grade:', pick.id);
            return false;
        }

        // Find the completed game
        const game = scores.find(s => s.id === pick.gameId);

        if (!game) {
            // Game hasn't finished yet
            return false;
        }

        if (!game.completed || !game.scores) {
            // Game not completed yet
            return false;
        }

        console.log(`Grading pick ${pick.id} for game ${game.id}`);

        // Get final scores
        const homeScore = game.scores.find(s => s.name === pick.team2)?.score;
        const awayScore = game.scores.find(s => s.name === pick.team1)?.score;

        if (homeScore === undefined || awayScore === undefined) {
            console.warn('Missing scores for game:', game.id);
            return false;
        }

        // Determine result based on bet type
        let result = null;

        if (pick.betType === 'moneyline') {
            result = this.gradeMoneyline(pick, homeScore, awayScore);
        } else if (pick.betType === 'spread') {
            result = this.gradeSpread(pick, homeScore, awayScore);
        } else if (pick.betType === 'total') {
            result = this.gradeTotal(pick, homeScore, awayScore);
        }

        if (result) {
            pick.status = result.status;
            pick.profit = result.profit;
            pick.finalScore = `${pick.team1} ${awayScore} - ${pick.team2} ${homeScore}`;
            pick.gradedAt = new Date().toISOString();

            console.log(`✅ Pick ${pick.id} graded as ${result.status} (${result.profit > 0 ? '+' : ''}${result.profit.toFixed(2)}u)`);
            return true;
        }

        return false;
    }

    /**
     * Grade moneyline bet
     */
    gradeMoneyline(pick, homeScore, awayScore) {
        let won = false;

        if (pick.pickSide === 'home') {
            won = homeScore > awayScore;
        } else if (pick.pickSide === 'away') {
            won = awayScore > homeScore;
        }

        // Check for push (tie)
        if (homeScore === awayScore) {
            return {
                status: 'push',
                profit: 0
            };
        }

        if (won) {
            return {
                status: 'win',
                profit: this.calculateProfit(pick.odds, pick.units, true)
            };
        } else {
            return {
                status: 'loss',
                profit: -pick.units
            };
        }
    }

    /**
     * Grade spread bet
     */
    gradeSpread(pick, homeScore, awayScore) {
        // Extract spread value from pick text
        const spreadMatch = pick.pick.match(/([+-]?\d+\.?\d*)/);
        if (!spreadMatch) {
            console.error('Could not extract spread from pick:', pick.pick);
            return null;
        }

        const spread = parseFloat(spreadMatch[1]);
        let adjustedScore;

        if (pick.pickSide === 'home') {
            adjustedScore = homeScore + spread;
            const won = adjustedScore > awayScore;
            const push = adjustedScore === awayScore;

            if (push) {
                return { status: 'push', profit: 0 };
            } else if (won) {
                return { status: 'win', profit: this.calculateProfit(pick.odds, pick.units, true) };
            } else {
                return { status: 'loss', profit: -pick.units };
            }
        } else if (pick.pickSide === 'away') {
            adjustedScore = awayScore + spread;
            const won = adjustedScore > homeScore;
            const push = adjustedScore === homeScore;

            if (push) {
                return { status: 'push', profit: 0 };
            } else if (won) {
                return { status: 'win', profit: this.calculateProfit(pick.odds, pick.units, true) };
            } else {
                return { status: 'loss', profit: -pick.units };
            }
        }

        return null;
    }

    /**
     * Grade total (over/under) bet
     */
    gradeTotal(pick, homeScore, awayScore) {
        const totalScore = homeScore + awayScore;

        // Extract total value from pick text
        const totalMatch = pick.pick.match(/(\d+\.?\d*)/);
        if (!totalMatch) {
            console.error('Could not extract total from pick:', pick.pick);
            return null;
        }

        const line = parseFloat(totalMatch[1]);

        if (pick.pickSide === 'over') {
            if (totalScore > line) {
                return { status: 'win', profit: this.calculateProfit(pick.odds, pick.units, true) };
            } else if (totalScore === line) {
                return { status: 'push', profit: 0 };
            } else {
                return { status: 'loss', profit: -pick.units };
            }
        } else if (pick.pickSide === 'under') {
            if (totalScore < line) {
                return { status: 'win', profit: this.calculateProfit(pick.odds, pick.units, true) };
            } else if (totalScore === line) {
                return { status: 'push', profit: 0 };
            } else {
                return { status: 'loss', profit: -pick.units };
            }
        }

        return null;
    }

    /**
     * Calculate profit based on American odds using "to win" system
     * Units represent the amount you want to WIN
     */
    calculateProfit(odds, units, won) {
        if (won) {
            // Always win the specified units
            return units;
        }

        // Calculate loss amount (risk)
        if (odds > 0) {
            // Positive odds (underdog) - risk less to win units
            // Example: +150 odds, to win 5 units, you risk 3.33 units
            return -(100 / odds) * units;
        } else {
            // Negative odds (favorite) - risk more to win units
            // Example: -150 odds, to win 5 units, you risk 7.5 units
            return -(Math.abs(odds) / 100) * units;
        }
    }

    /**
     * Recalculate stats for all users
     */
    recalculateAllUserStats() {
        if (!auth || !auth.users) {
            console.warn('Auth system not available for stats calculation');
            return;
        }

        const picks = JSON.parse(localStorage.getItem('trustmyrecord_picks') || '[]');

        auth.users.forEach(user => {
            const userPicks = picks.filter(p => p.userId === user.id);
            const stats = this.calculateUserStats(userPicks);

            // Update user stats
            user.stats = {
                ...user.stats,
                ...stats
            };
        });

        // Save updated users
        auth.saveUsers();

        // Update current user in session
        if (auth.currentUser) {
            const updatedCurrentUser = auth.users.find(u => u.id === auth.currentUser.id);
            if (updatedCurrentUser) {
                auth.currentUser = updatedCurrentUser;
                auth.persistSession();
            }
        }

        console.log('✅ User stats recalculated');
    }

    /**
     * Calculate stats for a user's picks
     */
    calculateUserStats(picks) {
        const totalPicks = picks.length;
        const wins = picks.filter(p => p.status === 'win').length;
        const losses = picks.filter(p => p.status === 'loss').length;
        const pushes = picks.filter(p => p.status === 'push').length;

        const winRate = totalPicks > 0 ? (wins / (wins + losses)) * 100 : 0;

        // Calculate total units wagered and profit
        const totalUnits = picks.reduce((sum, p) => sum + (p.units || 0), 0);
        const profitUnits = picks.reduce((sum, p) => sum + (p.profit || 0), 0);

        const roi = totalUnits > 0 ? (profitUnits / totalUnits) * 100 : 0;

        // Calculate streaks
        let currentStreak = 0;
        let longestWinStreak = 0;
        let tempWinStreak = 0;

        // Sort by timestamp descending (newest first)
        const sortedPicks = [...picks].sort((a, b) =>
            new Date(b.timestamp) - new Date(a.timestamp)
        );

        for (let i = 0; i < sortedPicks.length; i++) {
            const pick = sortedPicks[i];

            // Current streak (only from most recent)
            if (i === 0) {
                if (pick.status === 'win') currentStreak = 1;
                else if (pick.status === 'loss') currentStreak = -1;
            } else if (currentStreak !== 0) {
                if ((currentStreak > 0 && pick.status === 'win') ||
                    (currentStreak < 0 && pick.status === 'loss')) {
                    currentStreak += currentStreak > 0 ? 1 : -1;
                } else {
                    // Streak broken, stop counting
                    currentStreak = 0;
                }
            }

            // Longest win streak
            if (pick.status === 'win') {
                tempWinStreak++;
                longestWinStreak = Math.max(longestWinStreak, tempWinStreak);
            } else if (pick.status === 'loss') {
                tempWinStreak = 0;
            }
        }

        return {
            totalPicks,
            wins,
            losses,
            pushes,
            winRate: parseFloat(winRate.toFixed(2)),
            roi: parseFloat(roi.toFixed(2)),
            currentStreak,
            longestWinStreak,
            totalUnits: parseFloat(totalUnits.toFixed(2)),
            profitUnits: parseFloat(profitUnits.toFixed(2))
        };
    }

}

// Initialize grading system
const gradingSystem = new PickGradingSystem();

// Export
if (typeof window !== 'undefined') {
    window.gradingSystem = gradingSystem;
    window.PickGradingSystem = PickGradingSystem;
}

// Auto-initialize when API is ready
document.addEventListener('DOMContentLoaded', function() {
    // Wait for API to be initialized
    setTimeout(() => {
        if (window.sportsAPI) {
            gradingSystem.init(window.sportsAPI);
        } else {
            console.warn('⚠️ SportsAPI not found, grading system waiting...');

            // Try again in a few seconds
            setTimeout(() => {
                if (window.sportsAPI) {
                    gradingSystem.init(window.sportsAPI);
                } else {
                    console.error('❌ SportsAPI still not available, grading disabled');
                }
            }, 3000);
        }
    }, 1000);
});

console.log('✅ Grading system loaded');
