// API Integration for Trust My Record - 100% Static Version
// All data stored in localStorage, no backend required

class TrustMyRecordAPI {
    constructor() {
        // ESPN endpoints for live sports data (read-only, no auth needed)
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
        
        this.initLocalStorage();
    }

    // Initialize localStorage with default data if empty
    initLocalStorage() {
        const defaults = {
            'tmr_users': [],
            'tmr_picks': [],
            'tmr_feed': [],
            'tmr_following': [],
            'tmr_polls': [],
            'tmr_poll_votes': [],
            'tmr_prediction_polls': [],
            'tmr_poll_responses': [],
            'tmr_trivia_scores': [],
            'tmr_trivia_questions': [],
            'tmr_messages': [],
            'tmr_notifications': [],
            'tmr_challenges': [],
            'tmr_forums': [],
            'tmr_threads': [],
            'tmr_posts': [],
            'tmr_user': null
        };

        for (const [key, value] of Object.entries(defaults)) {
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, JSON.stringify(value));
            }
        }

        const users = this.getLocal('tmr_users');
        if (users.length === 0) {
            this.seedDemoData();
        }
        
        // Seed forums if empty
        const forums = this.getLocal('tmr_forums');
        if (forums.length === 0) {
            this.seedForums();
        }
    }

    // No demo data - all data comes from real user activity
    seedDemoData() {
        // No seeded data. Everything starts at zero.
    }

    // LocalStorage helpers
    getLocal(key) {
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch {
            return [];
        }
    }

    setLocal(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    // AUTHENTICATION - Client-side only
    
    async login(credentials) {
        const users = this.getLocal('tmr_users');
        const user = users.find(u => u.username === credentials.username && u.password === credentials.password);
        
        if (!user) {
            // Auto-create user if not exists
            const newUser = {
                id: 'user_' + Date.now(),
                username: credentials.username,
                email: `${credentials.username}@local.com`,
                password: credentials.password,
                displayName: credentials.username,
                bio: '',
                avatar: null,
                tier: 'bronze',
                verified: false,
                createdAt: new Date().toISOString(),
                stats: { wins: 0, losses: 0, pushes: 0, units: 0 }
            };
            users.push(newUser);
            this.setLocal('tmr_users', users);
            this.setLocal('tmr_user', newUser);
            return { user: newUser, success: true };
        }
        
        this.setLocal('tmr_user', user);
        return { user, success: true };
    }

    async register(userData) {
        const users = this.getLocal('tmr_users');
        
        if (users.some(u => u.username === userData.username)) {
            throw new Error('Username already exists');
        }
        if (users.some(u => u.email === userData.email)) {
            throw new Error('Email already exists');
        }

        const newUser = {
            id: 'user_' + Date.now(),
            username: userData.username,
            email: userData.email,
            password: userData.password,
            displayName: userData.displayName || userData.username,
            bio: '',
            avatar: null,
            tier: 'bronze',
            verified: false,
            createdAt: new Date().toISOString(),
            stats: { wins: 0, losses: 0, pushes: 0, units: 0 }
        };
        
        users.push(newUser);
        this.setLocal('tmr_users', users);
        this.setLocal('tmr_user', newUser);
        
        return { user: newUser, success: true };
    }

    logout() {
        this.setLocal('tmr_user', null);
    }

    isLoggedIn() {
        return !!this.getLocal('tmr_user');
    }

    getCurrentUser() {
        return this.getLocal('tmr_user');
    }

    // PICKS API
    
    async getPicks(filters = {}) {
        let picks = this.getLocal('tmr_picks');
        
        if (filters.userId) {
            picks = picks.filter(p => p.userId === filters.userId);
        }
        if (filters.sport) {
            picks = picks.filter(p => p.sport === filters.sport);
        }
        if (filters.result) {
            picks = picks.filter(p => p.result === filters.result);
        }
        
        // Sort by date desc
        return picks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    async createPick(pickData) {
        const picks = this.getLocal('tmr_picks');
        const user = this.getCurrentUser();
        
        // Add Closing Line Value tracking data
        const clvData = {
            pickType: pickData.pickType || 'spread', // spread, moneyline, total
            lineAtPick: pickData.line || null,
            oddsAtPick: pickData.odds || null,
            timestamp: new Date().toISOString(),
            closingLine: null, // Will be updated when game starts
            clvValue: null // Calculated later: (oddsAtPick - closingOdds) for ML, (lineAtPick - closingLine) for spreads
        };
        
        const newPick = {
            id: 'pick_' + Date.now(),
            userId: user.id,
            ...pickData,
            clv: clvData,
            createdAt: new Date().toISOString(),
            result: 'pending'
        };
        
        picks.push(newPick);
        this.setLocal('tmr_picks', picks);
        
        // Add to feed
        this.addToFeed('pick', newPick);
        
        return newPick;
    }
    
    // Update closing line when game starts (called by scheduled job or manually)
    async updateClosingLine(pickId, closingLine, closingOdds) {
        const picks = this.getLocal('tmr_picks');
        const pick = picks.find(p => p.id === pickId);
        
        if (!pick || !pick.clv) return null;
        
        pick.clv.closingLine = closingLine;
        pick.clv.closingOdds = closingOdds;
        
        // Calculate CLV value
        if (pick.clv.pickType === 'moneyline' && pick.clv.oddsAtPick && closingOdds) {
            // For moneyline: positive CLV means you got better odds than closing
            pick.clv.clvValue = this.calculateOddsCLV(pick.clv.oddsAtPick, closingOdds);
        } else if ((pick.clv.pickType === 'spread' || pick.clv.pickType === 'total') && 
                   pick.clv.lineAtPick !== null && closingLine !== null) {
            // For spreads/totals: positive CLV means you got better line than closing
            pick.clv.clvValue = pick.clv.lineAtPick - closingLine;
        }
        
        this.setLocal('tmr_picks', picks);
        return pick;
    }
    
    calculateOddsCLV(pickOdds, closingOdds) {
        // Convert both to implied probability
        const toImplied = (odds) => {
            if (odds > 0) {
                return 100 / (odds + 100);
            } else {
                return Math.abs(odds) / (Math.abs(odds) + 100);
            }
        };
        
        const pickImplied = toImplied(pickOdds);
        const closingImplied = toImplied(closingOdds);
        
        // CLV is the difference in implied probability
        // Positive means you got better value
        return ((closingImplied - pickImplied) * 100).toFixed(2);
    }
    
    // Get CLV statistics for a user
    async getCLVStats(userId) {
        const picks = this.getLocal('tmr_picks').filter(p => 
            p.userId === userId && 
            p.clv && 
            p.clv.clvValue !== null
        );
        
        if (picks.length === 0) {
            return {
                totalPicks: 0,
                avgCLV: 0,
                positiveCLV: 0,
                negativeCLV: 0,
                bestCLV: 0,
                worstCLV: 0
            };
        }
        
        const clvValues = picks.map(p => parseFloat(p.clv.clvValue));
        const positiveCount = clvValues.filter(v => v > 0).length;
        
        return {
            totalPicks: picks.length,
            avgCLV: (clvValues.reduce((a, b) => a + b, 0) / picks.length).toFixed(2),
            positiveCLV: positiveCount,
            negativeCLV: picks.length - positiveCount,
            positiveRate: ((positiveCount / picks.length) * 100).toFixed(1),
            bestCLV: Math.max(...clvValues).toFixed(2),
            worstCLV: Math.min(...clvValues).toFixed(2)
        };
    }

    async settlePick(pickId, result) {
        const picks = this.getLocal('tmr_picks');
        const pick = picks.find(p => p.id === pickId);
        
        if (!pick) throw new Error('Pick not found');
        
        pick.result = result;
        pick.settledAt = new Date().toISOString();
        
        if (result === 'win') {
            pick.profit = (pick.stake * (pick.odds > 0 ? pick.odds / 100 : 100 / Math.abs(pick.odds))).toFixed(2);
        } else if (result === 'loss') {
            pick.profit = -pick.stake;
        } else {
            pick.profit = 0;
        }
        
        this.setLocal('tmr_picks', picks);
        this.updateUserStats(pick.userId);
        
        return pick;
    }

    updateUserStats(userId) {
        const users = this.getLocal('tmr_users');
        const picks = this.getLocal('tmr_picks').filter(p => p.userId === userId);
        
        const user = users.find(u => u.id === userId);
        if (user) {
            user.stats = {
                wins: picks.filter(p => p.result === 'win').length,
                losses: picks.filter(p => p.result === 'loss').length,
                pushes: picks.filter(p => p.result === 'push').length,
                units: picks.reduce((sum, p) => sum + (parseFloat(p.profit) || 0), 0).toFixed(2)
            };
            this.setLocal('tmr_users', users);
        }
    }

    // FEED API
    
    async getFeed() {
        return this.getLocal('tmr_feed').sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );
    }

    addToFeed(type, data) {
        const feed = this.getLocal('tmr_feed');
        const user = this.getCurrentUser();
        
        feed.unshift({
            id: 'feed_' + Date.now(),
            type,
            userId: user.id,
            username: user.username,
            displayName: user.displayName,
            data,
            createdAt: new Date().toISOString()
        });
        
        // Keep only last 100 items
        if (feed.length > 100) feed.pop();
        
        this.setLocal('tmr_feed', feed);
    }

    async createPost(content) {
        const feed = this.getLocal('tmr_feed');
        const user = this.getCurrentUser();
        
        const post = {
            id: 'post_' + Date.now(),
            type: 'post',
            userId: user.id,
            username: user.username,
            displayName: user.displayName,
            content,
            likes: [],
            comments: [],
            createdAt: new Date().toISOString()
        };
        
        feed.unshift(post);
        this.setLocal('tmr_feed', feed);
        return post;
    }

    // PROFILE API
    
    async getProfile(username) {
        const users = this.getLocal('tmr_users');
        return users.find(u => u.username === username) || null;
    }

    async updateProfile(updates) {
        const users = this.getLocal('tmr_users');
        const current = this.getCurrentUser();
        
        const userIndex = users.findIndex(u => u.id === current.id);
        if (userIndex === -1) throw new Error('User not found');
        
        users[userIndex] = { ...users[userIndex], ...updates };
        this.setLocal('tmr_users', users);
        this.setLocal('tmr_user', users[userIndex]);
        
        return users[userIndex];
    }

    // FOLLOWING API
    
    async getFollowing(userId) {
        const following = this.getLocal('tmr_following');
        return following.filter(f => f.followerId === userId);
    }

    async getFollowers(userId) {
        const following = this.getLocal('tmr_following');
        return following.filter(f => f.followingId === userId);
    }

    async followUser(userId) {
        const following = this.getLocal('tmr_following');
        const current = this.getCurrentUser();
        
        if (!following.some(f => f.followerId === current.id && f.followingId === userId)) {
            following.push({
                id: 'follow_' + Date.now(),
                followerId: current.id,
                followingId: userId,
                createdAt: new Date().toISOString()
            });
            this.setLocal('tmr_following', following);
        }
        return { success: true };
    }

    async unfollowUser(userId) {
        let following = this.getLocal('tmr_following');
        const current = this.getCurrentUser();
        
        following = following.filter(f => !(f.followerId === current.id && f.followingId === userId));
        this.setLocal('tmr_following', following);
        return { success: true };
    }

    // NOTIFICATIONS API
    
    async getNotifications() {
        return this.getLocal('tmr_notifications');
    }

    async markNotificationRead(notificationId) {
        const notifications = this.getLocal('tmr_notifications');
        const notif = notifications.find(n => n.id === notificationId);
        if (notif) {
            notif.read = true;
            this.setLocal('tmr_notifications', notifications);
        }
        return notif;
    }

    async clearNotifications() {
        this.setLocal('tmr_notifications', []);
        return { success: true };
    }

    // MESSAGES API
    
    async getConversations() {
        const messages = this.getLocal('tmr_messages');
        const current = this.getCurrentUser();
        
        // Group by conversation partner
        const conversations = {};
        messages.forEach(msg => {
            const partnerId = msg.senderId === current.id ? msg.receiverId : msg.senderId;
            if (!conversations[partnerId]) {
                conversations[partnerId] = {
                    partnerId,
                    messages: [],
                    unread: 0
                };
            }
            conversations[partnerId].messages.push(msg);
            if (msg.receiverId === current.id && !msg.read) {
                conversations[partnerId].unread++;
            }
        });
        
        return Object.values(conversations).map(c => ({
            ...c,
            lastMessage: c.messages[c.messages.length - 1]
        }));
    }

    async getMessages(partnerId) {
        const messages = this.getLocal('tmr_messages');
        const current = this.getCurrentUser();
        
        return messages.filter(m => 
            (m.senderId === current.id && m.receiverId === partnerId) ||
            (m.senderId === partnerId && m.receiverId === current.id)
        ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }

    async sendMessage(partnerId, content) {
        const messages = this.getLocal('tmr_messages');
        const current = this.getCurrentUser();
        
        const message = {
            id: 'msg_' + Date.now(),
            senderId: current.id,
            receiverId: partnerId,
            content,
            read: false,
            createdAt: new Date().toISOString()
        };
        
        messages.push(message);
        this.setLocal('tmr_messages', messages);
        
        return message;
    }

    // PREDICTION POLLS API - Full Poll Management
    
    async getPolls(filter = 'active') {
        let polls = this.getLocal('tmr_prediction_polls');
        const now = new Date().toISOString();
        
        if (filter === 'active') {
            polls = polls.filter(p => p.status === 'active' && p.endTime > now);
        } else if (filter === 'resolved') {
            polls = polls.filter(p => p.status === 'resolved' || p.endTime <= now);
        }
        
        return polls.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    async createPoll(pollData) {
        const current = this.getCurrentUser();
        if (!current) {
            throw new Error('Must be logged in to create polls');
        }
        
        const polls = this.getLocal('tmr_prediction_polls');
        
        const newPoll = {
            id: 'poll_' + Date.now(),
            authorId: current.id,
            authorUsername: current.username,
            title: pollData.title,
            description: pollData.description || '',
            sport: pollData.sport,
            league: pollData.league,
            gameId: pollData.gameId || null,
            gameInfo: pollData.gameInfo || null,
            questions: pollData.questions.map((q, idx) => ({
                id: 'q_' + idx + '_' + Date.now(),
                text: q.text,
                answerType: q.answerType, // 'multiple_choice' or 'numeric'
                options: q.options || [],
                points: q.points || 10,
                correctAnswer: null,
                resolved: false
            })),
            status: 'active',
            createdAt: new Date().toISOString(),
            endTime: pollData.endTime || new Date(Date.now() + 86400000 * 3).toISOString(),
            totalPoints: pollData.questions.reduce((sum, q) => sum + (q.points || 10), 0)
        };
        
        polls.push(newPoll);
        this.setLocal('tmr_prediction_polls', polls);
        
        return newPoll;
    }
    
    async submitPollResponse(pollId, responses) {
        const current = this.getCurrentUser();
        if (!current) {
            throw new Error('Must be logged in to submit poll responses');
        }
        
        const pollResponses = this.getLocal('tmr_poll_responses');
        const polls = this.getLocal('tmr_prediction_polls');
        
        const poll = polls.find(p => p.id === pollId);
        if (!poll) throw new Error('Poll not found');
        
        // Check if already responded
        const existing = pollResponses.find(r => r.pollId === pollId && r.userId === current.id);
        if (existing) {
            throw new Error('You have already submitted answers for this poll');
        }
        
        const responseEntry = {
            id: 'response_' + Date.now(),
            pollId,
            userId: current.id,
            username: current.username,
            responses: responses.map(r => ({
                questionId: r.questionId,
                answer: r.answer,
                correct: null, // Will be set when poll is resolved
                points: 0
            })),
            totalScore: 0,
            submittedAt: new Date().toISOString()
        };
        
        pollResponses.push(responseEntry);
        this.setLocal('tmr_poll_responses', pollResponses);
        
        return { success: true, responseId: responseEntry.id };
    }
    
    async resolvePollQuestion(pollId, questionId, correctAnswer) {
        const polls = this.getLocal('tmr_prediction_polls');
        const pollResponses = this.getLocal('tmr_poll_responses');
        
        const poll = polls.find(p => p.id === pollId);
        if (!poll) throw new Error('Poll not found');
        
        const question = poll.questions.find(q => q.id === questionId);
        if (!question) throw new Error('Question not found');
        
        // Mark question as resolved
        question.correctAnswer = correctAnswer;
        question.resolved = true;
        
        // Score all responses
        pollResponses.forEach(response => {
            if (response.pollId === pollId) {
                const qResponse = response.responses.find(r => r.questionId === questionId);
                if (qResponse) {
                    const isCorrect = this.checkPollAnswer(question, qResponse.answer, correctAnswer);
                    qResponse.correct = isCorrect;
                    qResponse.points = isCorrect ? question.points : 0;
                    
                    // Recalculate total score
                    response.totalScore = response.responses.reduce((sum, r) => sum + (r.points || 0), 0);
                }
            }
        });
        
        this.setLocal('tmr_prediction_polls', polls);
        this.setLocal('tmr_poll_responses', pollResponses);
        
        return poll;
    }
    
    checkPollAnswer(question, userAnswer, correctAnswer) {
        if (question.answerType === 'numeric') {
            // For numeric answers, allow some tolerance (e.g., within 0.5)
            const userNum = parseFloat(userAnswer);
            const correctNum = parseFloat(correctAnswer);
            return Math.abs(userNum - correctNum) <= 0.5;
        }
        return userAnswer === correctAnswer;
    }
    
    async getPollLeaderboard(pollId = null, limit = 10) {
        const pollResponses = this.getLocal('tmr_poll_responses');
        const polls = this.getLocal('tmr_prediction_polls');
        
        // Get active or resolved polls
        const now = new Date().toISOString();
        
        if (pollId) {
            // Leaderboard for specific poll
            const responses = pollResponses.filter(r => r.pollId === pollId);
            return responses
                .sort((a, b) => b.totalScore - a.totalScore)
                .slice(0, limit);
        } else {
            // Overall leaderboard - aggregate scores across all polls
            const userScores = {};
            
            pollResponses.forEach(response => {
                const poll = polls.find(p => p.id === response.pollId);
                // Only count resolved polls
                if (poll && (poll.status === 'resolved' || poll.endTime <= now)) {
                    if (!userScores[response.userId]) {
                        userScores[response.userId] = {
                            userId: response.userId,
                            username: response.username,
                            totalScore: 0,
                            pollsEntered: 0
                        };
                    }
                    userScores[response.userId].totalScore += response.totalScore;
                    userScores[response.userId].pollsEntered += 1;
                }
            });
            
            return Object.values(userScores)
                .sort((a, b) => b.totalScore - a.totalScore)
                .slice(0, limit);
        }
    }
    
    async getUserPollResponses(userId) {
        const pollResponses = this.getLocal('tmr_poll_responses');
        return pollResponses.filter(r => r.userId === userId);
    }
    
    // Legacy simple polls for backwards compatibility
    async getSimplePolls() {
        return this.getLocal('tmr_polls');
    }

    async votePoll(pollId, optionId) {
        const polls = this.getLocal('tmr_polls');
        const votes = this.getLocal('tmr_poll_votes');
        const current = this.getCurrentUser();
        
        const poll = polls.find(p => p.id === pollId);
        if (!poll) throw new Error('Poll not found');
        
        const option = poll.options.find(o => o.id === optionId);
        if (option) {
            option.votes = (option.votes || 0) + 1;
        }
        
        votes.push({
            id: 'vote_' + Date.now(),
            pollId,
            optionId,
            userId: current.id,
            createdAt: new Date().toISOString()
        });
        
        this.setLocal('tmr_polls', polls);
        this.setLocal('tmr_poll_votes', votes);
        
        return poll;
    }

    // TRIVIA API - Full Question Management
    
    async getTriviaQuestions(filters = {}) {
        let questions = this.getLocal('tmr_trivia_questions');
        
        if (filters.sport && filters.sport !== 'all') {
            questions = questions.filter(q => q.sport === filters.sport);
        }
        
        if (filters.difficulty) {
            questions = questions.filter(q => q.difficulty === filters.difficulty);
        }
        
        return questions;
    }
    
    async createTriviaQuestion(questionData) {
        const current = this.getCurrentUser();
        if (!current) {
            throw new Error('Must be logged in to create trivia questions');
        }
        
        const questions = this.getLocal('tmr_trivia_questions');
        
        const newQuestion = {
            id: 'trivia_q_' + Date.now(),
            authorId: current.id,
            authorUsername: current.username,
            sport: questionData.sport,
            question: questionData.question,
            optionA: questionData.optionA,
            optionB: questionData.optionB,
            optionC: questionData.optionC,
            optionD: questionData.optionD,
            correctAnswer: questionData.correctAnswer, // 'A', 'B', 'C', or 'D'
            difficulty: questionData.difficulty || 'medium',
            createdAt: new Date().toISOString(),
            approved: true // Auto-approve for now
        };
        
        questions.push(newQuestion);
        this.setLocal('tmr_trivia_questions', questions);
        
        return newQuestion;
    }
    
    async getRandomTriviaQuestion(filters = {}) {
        const questions = await this.getTriviaQuestions(filters);
        
        if (questions.length === 0) {
            return null;
        }
        
        // Get random question
        const randomIndex = Math.floor(Math.random() * questions.length);
        const question = questions[randomIndex];
        
        // Return without correct answer for gameplay
        return {
            id: question.id,
            sport: question.sport,
            question: question.question,
            optionA: question.optionA,
            optionB: question.optionB,
            optionC: question.optionC,
            optionD: question.optionD,
            difficulty: question.difficulty
        };
    }
    
    async submitTriviaAnswer(questionId, answer) {
        const questions = this.getLocal('tmr_trivia_questions');
        const question = questions.find(q => q.id === questionId);
        
        if (!question) {
            throw new Error('Question not found');
        }
        
        const isCorrect = question.correctAnswer === answer;
        
        return {
            correct: isCorrect,
            correctAnswer: question.correctAnswer,
            points: isCorrect ? this.getTriviaPoints(question.difficulty) : 0
        };
    }
    
    getTriviaPoints(difficulty) {
        switch (difficulty) {
            case 'easy': return 10;
            case 'medium': return 20;
            case 'hard': return 30;
            default: return 20;
        }
    }
    
    async getTriviaScores() {
        return this.getLocal('tmr_trivia_scores');
    }

    async saveTriviaScore(scoreData) {
        const scores = this.getLocal('tmr_trivia_scores');
        const current = this.getCurrentUser();
        
        const scoreEntry = {
            id: 'trivia_score_' + Date.now(),
            userId: current?.id || 'anonymous',
            username: current?.username || 'Anonymous',
            score: scoreData.score,
            correct: scoreData.correct,
            total: scoreData.total,
            sport: scoreData.sport || 'all',
            createdAt: new Date().toISOString()
        };
        
        scores.push(scoreEntry);
        this.setLocal('tmr_trivia_scores', scores);
        return { success: true };
    }
    
    async getTriviaLeaderboard(sport = 'all', limit = 10) {
        let scores = this.getLocal('tmr_trivia_scores');
        
        if (sport !== 'all') {
            scores = scores.filter(s => s.sport === sport);
        }
        
        // Group by user and get their best score
        const userBestScores = {};
        scores.forEach(score => {
            const key = score.userId;
            if (!userBestScores[key] || score.score > userBestScores[key].score) {
                userBestScores[key] = score;
            }
        });
        
        // Sort by score descending
        return Object.values(userBestScores)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    // CHALLENGES API
    
    async getChallenges() {
        return this.getLocal('tmr_challenges');
    }

    async createChallenge(challengeData) {
        const challenges = this.getLocal('tmr_challenges');
        const current = this.getCurrentUser();
        
        const challenge = {
            id: 'challenge_' + Date.now(),
            creatorId: current.id,
            ...challengeData,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        
        challenges.push(challenge);
        this.setLocal('tmr_challenges', challenges);
        return challenge;
    }

    async joinChallenge(challengeId) {
        const challenges = this.getLocal('tmr_challenges');
        const current = this.getCurrentUser();
        
        const challenge = challenges.find(c => c.id === challengeId);
        if (!challenge) throw new Error('Challenge not found');
        
        challenge.participants = challenge.participants || [];
        if (!challenge.participants.includes(current.id)) {
            challenge.participants.push(current.id);
        }
        
        this.setLocal('tmr_challenges', challenges);
        return challenge;
    }

    // UPCOMING GAMES WITH ODDS - ESPN only. Do not invent fallback lines.
    
    async getUpcomingGames(sportKey) {
        const sportMap = {
            'NBA': 'basketball_nba',
            'NFL': 'americanfootball_nfl',
            'MLB': 'baseball_mlb',
            'NHL': 'icehockey_nhl',
            'NCAAF': 'americanfootball_ncaaf',
            'NCAAB': 'basketball_ncaab'
        };
        
        const espnKey = sportMap[sportKey];
        if (!espnKey) {
            console.warn('No ESPN mapping for sport:', sportKey);
            return [];
        }

        // Check cache first
        const cacheKey = `games_${sportKey}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry * 5) {
            return cached.data;
        }

        try {
            // Fetch from ESPN scoreboard API
            const espnPath = espnKey.replace(/_/g, '/');
            const url = `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/scoreboard`;
            console.log('[TMR] Fetching games from:', url);
            
            const response = await fetch(url);
            const data = await response.json();
            
            const events = data.events || [];
            const games = [];
            
            for (const event of events) {
                const comp = event.competitions?.[0];
                if (!comp) continue;
                
                const competitors = comp.competitors || [];
                const homeComp = competitors.find(c => c.homeAway === 'home');
                const awayComp = competitors.find(c => c.homeAway === 'away');
                
                if (!homeComp || !awayComp) continue;
                
                const homeTeam = homeComp.team?.displayName;
                const awayTeam = awayComp.team?.displayName;
                
                if (!homeTeam || !awayTeam) continue;
                
                // Check game status - skip completed games
                const status = comp.status?.type?.state;
                if (status === 'post') continue;
                
                games.push({
                    id: event.id,
                    sport: sportKey.toLowerCase(),
                    sport_title: sportKey,
                    home_team: homeTeam,
                    away_team: awayTeam,
                    commence_time: event.date,
                    status: status,
                    odds: null
                });
            }
            
            // Cache the results
            this.cache.set(cacheKey, {
                data: games,
                timestamp: Date.now()
            });
            
            if (games.length === 0) {
                return [];
            }
            
            return games;
            
        } catch (error) {
            console.error('[TMR] Failed to fetch games from ESPN:', error);
            return [];
        }
    }
    
    getSampleGames(sportKey) {
        return [];
    }

    // SPORTS DATA - External API calls (ESPN, read-only)
    
    async getLiveScores(sport) {
        const endpoint = this.espnEndpoints[sport];
        if (!endpoint) {
            console.warn('No endpoint for sport:', sport);
            return null;
        }

        const cacheKey = `scores_${sport}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        try {
            const response = await fetch(endpoint);
            const data = await response.json();
            
            this.cache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });
            
            return data;
        } catch (error) {
            console.error('Failed to fetch scores:', error);
            return cached?.data || null;
        }
    }

    // ==================== FORUM API ====================
    
    seedForums() {
        const defaultForums = [
            {
                id: 'cat_sportsbetting',
                name: 'Sports Betting',
                type: 'category',
                order: 1,
                subforums: [
                    {
                        id: 'forum_mlb',
                        name: 'MLB',
                        description: 'Major League Baseball betting discussion',
                        icon: 'baseball',
                        order: 1
                    },
                    {
                        id: 'forum_nfl',
                        name: 'NFL',
                        description: 'National Football League betting discussion',
                        icon: 'football',
                        order: 2
                    },
                    {
                        id: 'forum_nba',
                        name: 'NBA',
                        description: 'National Basketball Association betting discussion',
                        icon: 'basketball',
                        order: 3
                    },
                    {
                        id: 'forum_nhl',
                        name: 'NHL',
                        description: 'National Hockey League betting discussion',
                        icon: 'hockey',
                        order: 4
                    },
                    {
                        id: 'forum_soccer',
                        name: 'Soccer',
                        description: 'Soccer/football betting from around the world',
                        icon: 'soccer',
                        order: 5
                    },
                    {
                        id: 'forum_tennis',
                        name: 'Tennis',
                        description: 'ATP, WTA, and Grand Slam betting',
                        icon: 'tennis',
                        order: 6
                    },
                    {
                        id: 'forum_livebetting',
                        name: 'Live Betting',
                        description: 'In-game betting strategies and discussion',
                        icon: 'zap',
                        order: 7
                    }
                ]
            },
            {
                id: 'cat_generaldiscussion',
                name: 'General Discussion',
                type: 'category',
                order: 2,
                subforums: [
                    {
                        id: 'forum_strategy',
                        name: 'Handicapping Strategy',
                        description: 'Share and discuss betting strategies and systems',
                        icon: 'brain',
                        order: 1
                    },
                    {
                        id: 'forum_bankroll',
                        name: 'Bankroll Management',
                        description: 'Discuss unit sizing, staking plans, and money management',
                        icon: 'wallet',
                        order: 2
                    },
                    {
                        id: 'forum_sportsbooks',
                        name: 'Sportsbook Discussion',
                        description: 'Review and discuss online sportsbooks',
                        icon: 'building',
                        order: 3
                    }
                ]
            },
            {
                id: 'cat_sitediscussion',
                name: 'Site Discussion',
                type: 'category',
                order: 3,
                subforums: [
                    {
                        id: 'forum_announcements',
                        name: 'Announcements',
                        description: 'Official site announcements and updates',
                        icon: 'megaphone',
                        order: 1
                    },
                    {
                        id: 'forum_features',
                        name: 'Feature Requests',
                        description: 'Suggest new features for TrustMyRecord',
                        icon: 'lightbulb',
                        order: 2
                    },
                    {
                        id: 'forum_bugs',
                        name: 'Bug Reports',
                        description: 'Report issues and bugs',
                        icon: 'bug',
                        order: 3
                    }
                ]
            },
            {
                id: 'cat_cappers',
                name: 'Cappers',
                type: 'category',
                order: 4,
                subforums: [
                    {
                        id: 'forum_verified',
                        name: 'Verified Cappers',
                        description: 'Discuss verified handicappers on the platform',
                        icon: 'check-circle',
                        order: 1
                    },
                    {
                        id: 'forum_reviews',
                        name: 'Service Reviews',
                        description: 'Reviews of paid and free handicapping services',
                        icon: 'star',
                        order: 2
                    },
                    {
                        id: 'forum_scams',
                        name: 'Scam Reports',
                        description: 'Report fraudulent services and scams',
                        icon: 'alert-triangle',
                        order: 3
                    }
                ]
            }
        ];
        
        this.setLocal('tmr_forums', defaultForums);
        
        // No seeded threads or posts - all data comes from real user activity
        const sampleThreads = [];
        const samplePosts = [];

        this.setLocal('tmr_threads', sampleThreads);
        this.setLocal('tmr_posts', samplePosts);
    }
    
    async getForumCategories() {
        return this.getLocal('tmr_forums');
    }
    
    async getForum(forumId) {
        const forums = this.getLocal('tmr_forums');
        
        for (const category of forums) {
            const forum = category.subforums.find(f => f.id === forumId);
            if (forum) {
                // Get stats
                const threads = this.getLocal('tmr_threads').filter(t => t.forumId === forumId);
                const posts = this.getLocal('tmr_posts');
                
                const lastThread = threads.length > 0 
                    ? threads.sort((a, b) => new Date(b.lastPostAt) - new Date(a.lastPostAt))[0]
                    : null;
                    
                const totalPosts = posts.filter(p => 
                    threads.some(t => t.id === p.threadId)
                ).length;
                
                return {
                    ...forum,
                    categoryName: category.name,
                    threadCount: threads.length,
                    postCount: totalPosts,
                    lastPost: lastThread ? {
                        threadId: lastThread.id,
                        threadTitle: lastThread.title,
                        authorUsername: lastThread.lastPostBy || lastThread.authorUsername,
                        postedAt: lastThread.lastPostAt
                    } : null
                };
            }
        }
        
        return null;
    }
    
    async getForumThreads(forumId, page = 1, perPage = 20) {
        let threads = this.getLocal('tmr_threads').filter(t => t.forumId === forumId);
        
        // Sort: pinned first, then by last post
        threads.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return new Date(b.lastPostAt) - new Date(a.lastPostAt);
        });
        
        const total = threads.length;
        const start = (page - 1) * perPage;
        const paginated = threads.slice(start, start + perPage);
        
        // Get last post info for each thread
        const posts = this.getLocal('tmr_posts');
        const enrichedThreads = paginated.map(thread => {
            const threadPosts = posts.filter(p => p.threadId === thread.id);
            const lastPost = threadPosts.sort((a, b) => 
                new Date(b.createdAt) - new Date(a.createdAt)
            )[0];
            
            return {
                ...thread,
                replyCount: threadPosts.length - 1,
                lastPost: lastPost ? {
                    authorUsername: lastPost.authorUsername,
                    postedAt: lastPost.createdAt
                } : null
            };
        });
        
        return {
            threads: enrichedThreads,
            total,
            page,
            perPage,
            totalPages: Math.ceil(total / perPage)
        };
    }
    
    async getThread(threadId) {
        const threads = this.getLocal('tmr_threads');
        const thread = threads.find(t => t.id === threadId);
        
        if (!thread) return null;
        
        // Get all posts
        const posts = this.getLocal('tmr_posts')
            .filter(p => p.threadId === threadId)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        // Increment view count
        thread.viewCount = (thread.viewCount || 0) + 1;
        this.setLocal('tmr_threads', threads);
        
        return {
            ...thread,
            posts
        };
    }
    
    async createThread(forumId, title, content) {
        const current = this.getCurrentUser();
        if (!current) {
            throw new Error('Must be logged in to create threads');
        }
        
        const threads = this.getLocal('tmr_threads');
        const posts = this.getLocal('tmr_posts');
        const now = new Date().toISOString();
        
        const newThread = {
            id: 'thread_' + Date.now(),
            forumId,
            title,
            authorId: current.id,
            authorUsername: current.username,
            createdAt: now,
            lastPostAt: now,
            lastPostBy: current.username,
            viewCount: 0,
            replyCount: 0,
            pinned: false
        };
        
        threads.push(newThread);
        
        const firstPost = {
            id: 'post_' + Date.now(),
            threadId: newThread.id,
            authorId: current.id,
            authorUsername: current.username,
            content,
            createdAt: now,
            isFirstPost: true
        };
        
        posts.push(firstPost);
        
        this.setLocal('tmr_threads', threads);
        this.setLocal('tmr_posts', posts);
        
        return newThread;
    }
    
    async createReply(threadId, content) {
        const current = this.getCurrentUser();
        if (!current) {
            throw new Error('Must be logged in to reply');
        }
        
        const threads = this.getLocal('tmr_threads');
        const posts = this.getLocal('tmr_posts');
        
        const thread = threads.find(t => t.id === threadId);
        if (!thread) {
            throw new Error('Thread not found');
        }
        
        const newPost = {
            id: 'post_' + Date.now(),
            threadId,
            authorId: current.id,
            authorUsername: current.username,
            content,
            createdAt: new Date().toISOString(),
            isFirstPost: false
        };
        
        posts.push(newPost);
        
        // Update thread's last post info
        thread.lastPostAt = newPost.createdAt;
        thread.lastPostBy = current.username;
        thread.replyCount = (thread.replyCount || 0) + 1;
        
        this.setLocal('tmr_threads', threads);
        this.setLocal('tmr_posts', posts);
        
        return newPost;
    }
    
    async getRecentPosts(limit = 10) {
        const posts = this.getLocal('tmr_posts');
        const threads = this.getLocal('tmr_threads');
        
        return posts
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit)
            .map(post => {
                const thread = threads.find(t => t.id === post.threadId);
                return {
                    ...post,
                    threadTitle: thread?.title || 'Unknown Thread',
                    forumId: thread?.forumId
                };
            });
    }
    
    // ==================== UTILITY ====================
    
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

// Create global API instance
const api = new TrustMyRecordAPI();

// Export for module systems if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TrustMyRecordAPI, api };
}
