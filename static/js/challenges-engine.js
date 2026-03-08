// Complete Challenges/Arena Engine for Trust My Record
// Head-to-head, Tournaments, Daily Trivia, Polls, Betting Challenges

class ChallengesEngine {
    constructor() {
        this.CHALLENGES_KEY = 'tmr_challenges';
        this.COMPETITIONS_KEY = 'tmr_competitions';
        this.TRIVIA_KEY = 'tmr_trivia';
        this.TRIVIA_POINTS_KEY = 'tmr_trivia_points';
        this.POLLS_KEY = 'tmr_polls';
        this.POLL_VOTES_KEY = 'tmr_poll_votes';
        this.CHALLENGE_HISTORY_KEY = 'tmr_challenge_history';
        
        this.initializeTrivia();
        this.initializePolls();
    }

    /**
     * Initialize daily trivia questions
     */
    initializeTrivia() {
        const existing = localStorage.getItem(this.TRIVIA_KEY);
        if (existing) return;

        const questions = [
            {
                question: "Which NFL team has won the most Super Bowls?",
                options: ["New England Patriots", "Pittsburgh Steelers", "Dallas Cowboys", "San Francisco 49ers"],
                correct: 0,
                explanation: "The New England Patriots and Pittsburgh Steelers are tied with 6 Super Bowl wins each!",
                category: 'NFL',
                difficulty: 'easy'
            },
            {
                question: "What does 'covering the spread' mean in sports betting?",
                options: [
                    "Winning the game outright",
                    "Beating the point spread by the required margin",
                    "Betting on the favorite",
                    "Placing multiple bets"
                ],
                correct: 1,
                explanation: "Covering means winning by more than the spread (favorite) or losing by less (underdog).",
                category: 'Betting Basics',
                difficulty: 'easy'
            },
            {
                question: "What is the 'vig' or 'juice' in sports betting?",
                options: [
                    "The maximum bet allowed",
                    "The commission/bookmaker's edge",
                    "The total amount wagered",
                    "The payout multiplier"
                ],
                correct: 1,
                explanation: "The vig is the bookmaker's commission, typically built into -110 odds.",
                category: 'Betting Basics',
                difficulty: 'medium'
            },
            {
                question: "Which player holds the NBA record for most points in a single game?",
                options: ["Michael Jordan", "Kobe Bryant", "Wilt Chamberlain", "LeBron James"],
                correct: 2,
                explanation: "Wilt Chamberlain scored 100 points on March 2, 1962!",
                category: 'NBA',
                difficulty: 'easy'
            },
            {
                question: "In sports betting, what is a 'parlay'?",
                options: [
                    "A single bet on one game",
                    "Multiple bets combined into one with higher odds",
                    "A refund on a losing bet",
                    "A type of prop bet"
                ],
                correct: 1,
                explanation: "A parlay combines multiple selections into one bet with multiplied odds!",
                category: 'Betting Basics',
                difficulty: 'easy'
            },
            {
                question: "Which college football team has the most all-time wins?",
                options: ["Alabama", "Notre Dame", "Michigan", "Ohio State"],
                correct: 2,
                explanation: "Michigan holds the record for most all-time wins in college football!",
                category: 'NCAAF',
                difficulty: 'medium'
            },
            {
                question: "What does 'EV' stand for in sports betting?",
                options: ["Expected Value", "Even Vig", "Every Victory", "Edge Variance"],
                correct: 0,
                explanation: "Expected Value (EV) measures the theoretical long-term profitability of a bet.",
                category: 'Advanced',
                difficulty: 'medium'
            },
            {
                question: "What is a 'teaser' bet?",
                options: [
                    "A single game bet",
                    "A parlay where you adjust spreads/totals for lower payouts",
                    "A bet on the first quarter only",
                    "A live in-game bet"
                ],
                correct: 1,
                explanation: "Teasers let you adjust lines in your favor but pay lower odds than standard parlays.",
                category: 'Betting Basics',
                difficulty: 'medium'
            },
            {
                question: "Who won the World Series in 2024?",
                options: ["Los Angeles Dodgers", "Texas Rangers", "Houston Astros", "Atlanta Braves"],
                correct: 0,
                explanation: "The Dodgers defeated the Yankees in the 2024 World Series!",
                category: 'MLB',
                difficulty: 'easy'
            },
            {
                question: "What is 'closing line value' (CLV)?",
                options: [
                    "The final odds when betting closes",
                    "Getting better odds than the final line",
                    "The average odds across all books",
                    "The minimum odds to bet"
                ],
                correct: 1,
                explanation: "Positive CLV means you beat the closing line, often a sign of sharp betting.",
                category: 'Advanced',
                difficulty: 'hard'
            }
        ];

        localStorage.setItem(this.TRIVIA_KEY, JSON.stringify(questions));
    }

    /**
     * Initialize daily polls
     */
    initializePolls() {
        const existing = localStorage.getItem(this.POLLS_KEY);
        if (existing) return;

        const polls = [
            {
                question: "Who will win Super Bowl 2025?",
                options: ["Kansas City Chiefs", "San Francisco 49ers", "Baltimore Ravens", "Philadelphia Eagles", "Buffalo Bills", "Other"]
            },
            {
                question: "Best sport to bet on?",
                options: ["NFL", "NBA", "MLB", "NHL", "Soccer", "College Football", "College Basketball"]
            },
            {
                question: "Favorite type of bet?",
                options: ["Spread", "Moneyline", "Over/Under", "Parlay", "Player Props", "Live Betting"]
            },
            {
                question: "Best betting strategy?",
                options: ["Fade the public", "Bet favorites", "Bet underdogs", "Martingale", "Unit betting", "Kelly Criterion"]
            },
            {
                question: "Which NBA team wins the 2025 championship?",
                options: ["Celtics", "Thunder", "Cavaliers", "Knicks", "Nuggets", "Clippers", "Other"]
            },
            {
                question: "Most profitable betting approach?",
                options: ["Single bets", "2-team parlays", "3-team parlays", "4+ team parlays", "Live betting", "Arbitrage"]
            },
            {
                question: "Best time to place bets?",
                options: ["Early in week", "Right before game", "Halftime", "When lines move", "Random", "Open/Middle/Closing"]
            }
        ];

        localStorage.setItem(this.POLLS_KEY, JSON.stringify(polls));
    }

    /**
     * Create a head-to-head challenge
     */
    createChallenge(opponentUsername, options = {}) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) {
            return { success: false, error: 'Must be logged in to create challenges' };
        }

        if (currentUser.username === opponentUsername) {
            return { success: false, error: 'Cannot challenge yourself' };
        }

        const { 
            type = 'win_rate', // win_rate, units, picks_count, custom
            duration = 7, // days
            stake = 0, // units (0 = honor system)
            sport = 'all',
            description = ''
        } = options;

        const challenges = this.getChallenges();
        
        const challenge = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            type,
            status: 'pending', // pending, active, completed, cancelled
            challenger: currentUser.username,
            opponent: opponentUsername,
            createdAt: new Date().toISOString(),
            startDate: null,
            endDate: null,
            duration,
            stake,
            sport,
            description,
            winner: null,
            stats: {
                challenger: { start: null, current: null },
                opponent: { start: null, current: null }
            },
            messages: []
        };

        challenges.push(challenge);
        this.saveChallenges(challenges);

        // Create notification/activity
        this.createActivity('challenge_created', currentUser.username, { 
            challengeId: challenge.id, 
            opponent: opponentUsername 
        });

        return { success: true, challenge };
    }

    /**
     * Accept a challenge
     */
    acceptChallenge(challengeId) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) {
            return { success: false, error: 'Not logged in' };
        }

        const challenges = this.getChallenges();
        const challenge = challenges.find(c => c.id === challengeId);

        if (!challenge) {
            return { success: false, error: 'Challenge not found' };
        }

        if (challenge.opponent !== currentUser.username) {
            return { success: false, error: 'Not authorized' };
        }

        if (challenge.status !== 'pending') {
            return { success: false, error: 'Challenge is no longer pending' };
        }

        // Start the challenge
        challenge.status = 'active';
        challenge.startDate = new Date().toISOString();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + challenge.duration);
        challenge.endDate = endDate.toISOString();

        // Capture starting stats
        challenge.stats.challenger.start = this.getUserStatsForPeriod(challenge.challenger, challenge.sport);
        challenge.stats.opponent.start = this.getUserStatsForPeriod(challenge.opponent, challenge.sport);

        this.saveChallenges(challenges);

        this.createActivity('challenge_accepted', currentUser.username, { 
            challengeId: challenge.id 
        });

        return { success: true, challenge };
    }

    /**
     * Decline a challenge
     */
    declineChallenge(challengeId, reason = '') {
        const currentUser = this.getCurrentUser();
        if (!currentUser) {
            return { success: false, error: 'Not logged in' };
        }

        const challenges = this.getChallenges();
        const challenge = challenges.find(c => c.id === challengeId);

        if (!challenge) {
            return { success: false, error: 'Challenge not found' };
        }

        if (challenge.opponent !== currentUser.username) {
            return { success: false, error: 'Not authorized' };
        }

        challenge.status = 'declined';
        challenge.declineReason = reason;
        challenge.endedAt = new Date().toISOString();

        this.saveChallenges(challenges);

        return { success: true };
    }

    /**
     * Cancel a challenge
     */
    cancelChallenge(challengeId) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) {
            return { success: false, error: 'Not logged in' };
        }

        const challenges = this.getChallenges();
        const challenge = challenges.find(c => c.id === challengeId);

        if (!challenge) {
            return { success: false, error: 'Challenge not found' };
        }

        if (challenge.challenger !== currentUser.username) {
            return { success: false, error: 'Not authorized' };
        }

        if (challenge.status !== 'pending') {
            return { success: false, error: 'Cannot cancel active challenge' };
        }

        challenge.status = 'cancelled';
        challenge.endedAt = new Date().toISOString();

        this.saveChallenges(challenges);

        return { success: true };
    }

    /**
     * Get challenges for a user
     */
    getUserChallenges(username, options = {}) {
        const { status, type, asChallenger, asOpponent } = options;
        
        const challenges = this.getChallenges();
        
        return challenges.filter(c => {
            const isInvolved = c.challenger === username || c.opponent === username;
            if (!isInvolved) return false;

            if (status && c.status !== status) return false;
            if (type && c.type !== type) return false;
            if (asChallenger && c.challenger !== username) return false;
            if (asOpponent && c.opponent !== username) return false;

            return true;
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    /**
     * Update challenge progress
     */
    updateChallengeProgress(challengeId) {
        const challenges = this.getChallenges();
        const challenge = challenges.find(c => c.id === challengeId);

        if (!challenge || challenge.status !== 'active') return null;

        // Check if challenge has ended
        if (new Date() > new Date(challenge.endDate)) {
            return this.completeChallenge(challengeId);
        }

        // Update current stats
        challenge.stats.challenger.current = this.getUserStatsForPeriod(
            challenge.challenger, 
            challenge.sport,
            challenge.startDate
        );
        challenge.stats.opponent.current = this.getUserStatsForPeriod(
            challenge.opponent, 
            challenge.sport,
            challenge.startDate
        );

        this.saveChallenges(challenges);

        return { success: true, challenge };
    }

    /**
     * Complete a challenge and determine winner
     */
    completeChallenge(challengeId) {
        const challenges = this.getChallenges();
        const challenge = challenges.find(c => c.id === challengeId);

        if (!challenge) return { success: false, error: 'Challenge not found' };

        // Final stats update
        challenge.stats.challenger.current = this.getUserStatsForPeriod(
            challenge.challenger, 
            challenge.sport,
            challenge.startDate
        );
        challenge.stats.opponent.current = this.getUserStatsForPeriod(
            challenge.opponent, 
            challenge.sport,
            challenge.startDate
        );

        // Determine winner based on challenge type
        let winner = null;
        const cStats = challenge.stats.challenger.current;
        const oStats = challenge.stats.opponent.current;

        switch (challenge.type) {
            case 'win_rate':
                winner = cStats.winRate > oStats.winRate ? challenge.challenger :
                        oStats.winRate > cStats.winRate ? challenge.opponent : 'tie';
                break;
            case 'units':
                winner = cStats.units > oStats.units ? challenge.challenger :
                        oStats.units > cStats.units ? challenge.opponent : 'tie';
                break;
            case 'picks_count':
                winner = cStats.picks > oStats.picks ? challenge.challenger :
                        oStats.picks > cStats.picks ? challenge.opponent : 'tie';
                break;
            case 'roi':
                winner = cStats.roi > oStats.roi ? challenge.challenger :
                        oStats.roi > cStats.roi ? challenge.opponent : 'tie';
                break;
            default:
                winner = 'tie';
        }

        challenge.status = 'completed';
        challenge.winner = winner;
        challenge.endedAt = new Date().toISOString();

        this.saveChallenges(challenges);

        // Record in history
        this.recordChallengeResult(challenge);

        // Create activity
        this.createActivity('challenge_completed', winner, { 
            challengeId: challenge.id,
            opponent: winner === challenge.challenger ? challenge.opponent : challenge.challenger
        });

        return { success: true, challenge, winner };
    }

    /**
     * Get user stats for a period
     */
    getUserStatsForPeriod(username, sport, startDate = null) {
        const allPicks = JSON.parse(localStorage.getItem('tmr_picks') || '[]');
        
        let picks = allPicks.filter(p => (p.user_id || p.username) === username);

        // Filter by sport
        if (sport && sport !== 'all') {
            picks = picks.filter(p => 
                (p.sport_display || p.sport || '').toLowerCase().includes(sport.toLowerCase())
            );
        }

        // Filter by date
        if (startDate) {
            picks = picks.filter(p => new Date(p.locked_at || p.created_at) >= new Date(startDate));
        }

        const won = picks.filter(p => p.status === 'won').length;
        const lost = picks.filter(p => p.status === 'lost').length;
        const pushed = picks.filter(p => p.status === 'pushed').length;
        const total = won + lost + pushed;

        return {
            picks: picks.length,
            wins: won,
            losses: lost,
            pushes: pushed,
            winRate: total > 0 ? ((won / (won + lost)) * 100).toFixed(1) : 0,
            units: this.calculateUnits(picks),
            roi: this.calculateROI(picks)
        };
    }

    /**
     * Calculate units
     */
    calculateUnits(picks) {
        return picks.reduce((total, pick) => {
            const stake = pick.stake || pick.units || 1;
            const odds = pick.odds || pick.price || -110;

            if (pick.status === 'won') {
                return total + this.calculatePayout(stake, odds);
            } else if (pick.status === 'lost') {
                return total - stake;
            }
            return total;
        }, 0).toFixed(2);
    }

    /**
     * Calculate ROI
     */
    calculateROI(picks) {
        const graded = picks.filter(p => p.status !== 'pending');
        if (graded.length === 0) return 0;

        let totalRisk = 0;
        let totalReturn = 0;

        graded.forEach(pick => {
            const stake = pick.stake || pick.units || 1;
            const odds = pick.odds || pick.price || -110;
            
            totalRisk += stake;

            if (pick.status === 'won') {
                totalReturn += stake + this.calculatePayout(stake, odds);
            } else if (pick.status === 'pushed') {
                totalReturn += stake;
            }
        });

        return totalRisk > 0 ? (((totalReturn - totalRisk) / totalRisk) * 100).toFixed(2) : 0;
    }

    /**
     * Calculate payout
     */
    calculatePayout(stake, odds) {
        if (odds > 0) {
            return stake * (odds / 100);
        } else {
            return stake * (100 / Math.abs(odds));
        }
    }

    /**
     * Record challenge result in history
     */
    recordChallengeResult(challenge) {
        const history = JSON.parse(localStorage.getItem(this.CHALLENGE_HISTORY_KEY) || '[]');
        history.push({
            challengeId: challenge.id,
            challenger: challenge.challenger,
            opponent: challenge.opponent,
            winner: challenge.winner,
            type: challenge.type,
            date: challenge.endedAt,
            stats: challenge.stats
        });
        localStorage.setItem(this.CHALLENGE_HISTORY_KEY, JSON.stringify(history.slice(-100)));
    }

    /**
     * Get challenge history for a user
     */
    getUserChallengeHistory(username) {
        const history = JSON.parse(localStorage.getItem(this.CHALLENGE_HISTORY_KEY) || '[]');
        return history.filter(h => h.challenger === username || h.opponent === username);
    }

    /**
     * Get daily trivia question
     */
    getDailyTrivia() {
        const questions = JSON.parse(localStorage.getItem(this.TRIVIA_KEY) || '[]');
        const today = this.getTodayIndex();
        return questions[today % questions.length];
    }

    /**
     * Submit trivia answer
     */
    submitTriviaAnswer(questionIndex, selectedIndex) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) {
            return { success: false, error: 'Not logged in' };
        }

        const questions = JSON.parse(localStorage.getItem(this.TRIVIA_KEY) || '[]');
        const question = questions[questionIndex];
        
        if (!question) {
            return { success: false, error: 'Question not found' };
        }

        const isCorrect = selectedIndex === question.correct;
        
        // Update points
        const points = this.getTriviaPoints(currentUser.username);
        const todayStr = new Date().toDateString();

        if (points.lastAnswered === todayStr) {
            return { success: false, error: 'Already answered today' };
        }

        if (isCorrect) {
            points.total += this.getPointsForDifficulty(question.difficulty);
            points.streak += 1;
            points.correct += 1;
        } else {
            points.streak = 0;
            points.incorrect += 1;
        }

        points.lastAnswered = todayStr;
        points.totalAnswered += 1;
        this.saveTriviaPoints(currentUser.username, points);

        // Update user stats
        this.updateUserTriviaStats(currentUser.username, isCorrect);

        return {
            success: true,
            correct: isCorrect,
            points: points,
            explanation: question.explanation
        };
    }

    /**
     * Get points based on difficulty
     */
    getPointsForDifficulty(difficulty) {
        switch (difficulty) {
            case 'easy': return 50;
            case 'medium': return 100;
            case 'hard': return 200;
            default: return 50;
        }
    }

    /**
     * Get user's trivia points
     */
    getTriviaPoints(username) {
        const allPoints = JSON.parse(localStorage.getItem(this.TRIVIA_POINTS_KEY) || '{}');
        return allPoints[username] || {
            total: 0,
            streak: 0,
            correct: 0,
            incorrect: 0,
            totalAnswered: 0,
            lastAnswered: null
        };
    }

    /**
     * Save trivia points
     */
    saveTriviaPoints(username, points) {
        const allPoints = JSON.parse(localStorage.getItem(this.TRIVIA_POINTS_KEY) || '{}');
        allPoints[username] = points;
        localStorage.setItem(this.TRIVIA_POINTS_KEY, JSON.stringify(allPoints));
    }

    /**
     * Update user's trivia stats
     */
    updateUserTriviaStats(username, wasCorrect) {
        const users = JSON.parse(localStorage.getItem('trustmyrecord_users') || '[]');
        const userIndex = users.findIndex(u => u.username === username);
        
        if (userIndex !== -1) {
            if (!users[userIndex].stats) users[userIndex].stats = {};
            if (!users[userIndex].stats.triviaPoints) users[userIndex].stats.triviaPoints = 0;
            if (!users[userIndex].stats.triviaGames) users[userIndex].stats.triviaGames = 0;
            if (!users[userIndex].stats.triviaWins) users[userIndex].stats.triviaWins = 0;

            const points = this.getTriviaPoints(username);
            users[userIndex].stats.triviaPoints = points.total;
            users[userIndex].stats.triviaGames = points.totalAnswered;
            users[userIndex].stats.triviaWins = points.correct;

            localStorage.setItem('trustmyrecord_users', JSON.stringify(users));
        }
    }

    /**
     * Get daily poll
     */
    getDailyPoll() {
        const polls = JSON.parse(localStorage.getItem(this.POLLS_KEY) || '[]');
        const today = this.getTodayIndex();
        return polls[today % polls.length];
    }

    /**
     * Submit poll vote
     */
    submitPollVote(pollIndex, optionIndex) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) {
            return { success: false, error: 'Not logged in' };
        }

        const votes = JSON.parse(localStorage.getItem(this.POLL_VOTES_KEY) || '{}');
        const todayStr = new Date().toDateString();

        if (votes[currentUser.username]?.date === todayStr) {
            return { success: false, error: 'Already voted today' };
        }

        votes[currentUser.username] = {
            pollIndex,
            optionIndex,
            date: todayStr
        };

        localStorage.setItem(this.POLL_VOTES_KEY, JSON.stringify(votes));

        // Update user stats
        this.updateUserPollStats(currentUser.username);

        return { success: true };
    }

    /**
     * Get poll results
     */
    getPollResults(pollIndex) {
        const votes = JSON.parse(localStorage.getItem(this.POLL_VOTES_KEY) || '{}');
        const polls = JSON.parse(localStorage.getItem(this.POLLS_KEY) || '[]');
        const poll = polls[pollIndex];

        if (!poll) return null;

        const results = poll.options.map((option, idx) => ({
            option,
            votes: 0,
            percentage: 0
        }));

        let totalVotes = 0;

        Object.values(votes).forEach(vote => {
            if (vote.pollIndex === pollIndex) {
                results[vote.optionIndex].votes++;
                totalVotes++;
            }
        });

        results.forEach(r => {
            r.percentage = totalVotes > 0 ? ((r.votes / totalVotes) * 100).toFixed(1) : 0;
        });

        return { results, totalVotes };
    }

    /**
     * Check if user has voted today
     */
    hasVotedToday() {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return false;

        const votes = JSON.parse(localStorage.getItem(this.POLL_VOTES_KEY) || '{}');
        const todayStr = new Date().toDateString();

        return votes[currentUser.username]?.date === todayStr;
    }

    /**
     * Update user poll stats
     */
    updateUserPollStats(username) {
        const users = JSON.parse(localStorage.getItem('trustmyrecord_users') || '[]');
        const userIndex = users.findIndex(u => u.username === username);
        
        if (userIndex !== -1) {
            if (!users[userIndex].stats) users[userIndex].stats = {};
            users[userIndex].stats.pollsAnswered = (users[userIndex].stats.pollsAnswered || 0) + 1;
            localStorage.setItem('trustmyrecord_users', JSON.stringify(users));
        }
    }

    /**
     * Get today's index for daily rotation
     */
    getTodayIndex() {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const diff = now - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }

    /**
     * Get leaderboard
     */
    getLeaderboard(type = 'trivia', limit = 10) {
        switch (type) {
            case 'trivia':
                return this.getTriviaLeaderboard(limit);
            case 'challenges':
                return this.getChallengeLeaderboard(limit);
            case 'win_rate':
                return this.getWinRateLeaderboard(limit);
            case 'units':
                return this.getUnitsLeaderboard(limit);
            default:
                return [];
        }
    }

    /**
     * Get trivia leaderboard
     */
    getTriviaLeaderboard(limit) {
        const allPoints = JSON.parse(localStorage.getItem(this.TRIVIA_POINTS_KEY) || '{}');
        
        return Object.entries(allPoints)
            .map(([username, data]) => ({ username, ...data }))
            .sort((a, b) => b.total - a.total)
            .slice(0, limit);
    }

    /**
     * Get challenge leaderboard
     */
    getChallengeLeaderboard(limit) {
        const history = JSON.parse(localStorage.getItem(this.CHALLENGE_HISTORY_KEY) || '[]');
        const wins = {};

        history.forEach(h => {
            if (h.winner && h.winner !== 'tie') {
                wins[h.winner] = (wins[h.winner] || 0) + 1;
            }
        });

        return Object.entries(wins)
            .map(([username, wins]) => ({ username, wins }))
            .sort((a, b) => b.wins - a.wins)
            .slice(0, limit);
    }

    /**
     * Get win rate leaderboard
     */
    getWinRateLeaderboard(limit) {
        // This would integrate with stats engine
        const users = JSON.parse(localStorage.getItem('trustmyrecord_users') || '[]');
        
        return users
            .map(u => ({
                username: u.username,
                displayName: u.displayName || u.username,
                winRate: u.record ? ((u.record.wins / (u.record.wins + u.record.losses)) * 100).toFixed(1) : 0,
                picks: u.total_picks || 0
            }))
            .filter(u => u.picks >= 10) // Minimum sample size
            .sort((a, b) => b.winRate - a.winRate)
            .slice(0, limit);
    }

    /**
     * Get units leaderboard
     */
    getUnitsLeaderboard(limit) {
        const users = JSON.parse(localStorage.getItem('trustmyrecord_users') || '[]');
        
        return users
            .map(u => ({
                username: u.username,
                displayName: u.displayName || u.username,
                units: u.units || 0,
                picks: u.total_picks || 0
            }))
            .filter(u => u.picks >= 5)
            .sort((a, b) => b.units - a.units)
            .slice(0, limit);
    }

    /**
     * Get challenges
     */
    getChallenges() {
        return JSON.parse(localStorage.getItem(this.CHALLENGES_KEY) || '[]');
    }

    /**
     * Save challenges
     */
    saveChallenges(challenges) {
        localStorage.setItem(this.CHALLENGES_KEY, JSON.stringify(challenges));
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem('trustmyrecord_current_user'));
        } catch {
            return null;
        }
    }

    /**
     * Create activity
     */
    createActivity(type, username, data) {
        const activities = JSON.parse(localStorage.getItem('tmr_social_activity') || '[]');
        activities.unshift({
            id: Date.now().toString(36),
            type,
            username,
            data,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('tmr_social_activity', JSON.stringify(activities.slice(0, 1000)));
    }
}

// Create global instance
const challengesEngine = new ChallengesEngine();
