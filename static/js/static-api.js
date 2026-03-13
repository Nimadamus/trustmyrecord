// 100% STATIC API - No backend calls, all localStorage
// Replaces backend-api.js for static deployment

(function() {
    'use strict';
    
    // Storage keys
    const STORAGE_KEYS = {
        USERS: 'trustmyrecord_users',
        PICKS: 'trustmyrecord_picks',
        THREADS: 'trustmyrecord_threads',
        MESSAGES: 'trustmyrecord_messages',
        POLLS: 'trustmyrecord_polls',
        TRIVIA: 'trustmyrecord_trivia',
        CONTESTS: 'trustmyrecord_contests',
        SESSION: 'trustmyrecord_session'
    };
    
    // Helper: Get from storage
    function getStorage(key, defaultVal = []) {
        try {
            return JSON.parse(localStorage.getItem(key)) || defaultVal;
        } catch(e) {
            return defaultVal;
        }
    }
    
    // Helper: Save to storage
    function setStorage(key, val) {
        localStorage.setItem(key, JSON.stringify(val));
    }
    
    // Helper: Generate ID
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    // Initialize default data
    function initDefaults() {
        // Default users
        let users = getStorage(STORAGE_KEYS.USERS);
        if (users.length === 0) {
            users = [
                {
                    id: 'user_1',
                    username: 'demo',
                    email: 'demo@trustmyrecord.com',
                    password: 'demo123',
                    displayName: 'Demo User',
                    avatar: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%230ea5e9%22/><text x=%2250%22 y=%2265%22 font-size=%2250%22 text-anchor=%22middle%22 fill=%22white%22>D</text></svg>',
                    bio: 'Just here to win!',
                    joinedDate: new Date().toISOString(),
                    verified: true,
                    stats: { totalPicks: 0, wins: 0, losses: 0, pushes: 0, winRate: 0, roi: 0 },
                    social: { followers: [], following: [], reputation: 0, badges: ['verified'] },
                    isPremium: false
                },
                {
                    id: 'user_2',
                    username: 'betlegend',
                    email: 'admin@trustmyrecord.com',
                    password: 'admin123',
                    displayName: 'BetLegend',
                    avatar: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%2322c55e%22/><text x=%2250%22 y=%2265%22 font-size=%2250%22 text-anchor=%22middle%22 fill=%22white%22>B</text></svg>',
                    bio: 'Founder of TrustMyRecord',
                    joinedDate: '2024-01-01',
                    verified: true,
                    stats: { totalPicks: 0, wins: 0, losses: 0, pushes: 0, winRate: 0, roi: 0 },
                    social: { followers: [], following: [], reputation: 0, badges: ['founder', 'verified'] },
                    isPremium: true
                }
            ];
            setStorage(STORAGE_KEYS.USERS, users);
        }
        
        // No seeded threads - all data comes from real user activity
        let threads = getStorage(STORAGE_KEYS.THREADS);
        // Threads start empty until users create them
        
        // No seeded polls - all data comes from real user activity
        let polls = getStorage(STORAGE_KEYS.POLLS);
        // Polls start empty until users create them
        
        // Default trivia
        let trivia = getStorage(STORAGE_KEYS.TRIVIA);
        if (trivia.length === 0) {
            trivia = [
                {
                    id: 'trivia_1',
                    question: 'Which team has won the most NBA championships?',
                    options: ['Boston Celtics', 'Los Angeles Lakers', 'Chicago Bulls', 'Golden State Warriors'],
                    correctAnswer: 0,
                    category: 'nba',
                    difficulty: 'easy',
                    points: 100
                },
                {
                    id: 'trivia_2',
                    question: 'Who holds the NFL record for most career passing touchdowns?',
                    options: ['Tom Brady', 'Peyton Manning', 'Drew Brees', 'Aaron Rodgers'],
                    correctAnswer: 0,
                    category: 'nfl',
                    difficulty: 'easy',
                    points: 100
                },
                {
                    id: 'trivia_3',
                    question: 'In what year did the MLB introduce the designated hitter rule?',
                    options: ['1970', '1973', '1975', '1980'],
                    correctAnswer: 1,
                    category: 'mlb',
                    difficulty: 'hard',
                    points: 300
                }
            ];
            setStorage(STORAGE_KEYS.TRIVIA, trivia);
        }
        
        // No seeded picks - all data comes from real user activity
        // No seeded contests - all data comes from real user activity
        // No seeded messages - all data comes from real user activity
    }
    
    // Mock API object
    const api = {
        // Auth methods
        isLoggedIn() {
            return localStorage.getItem('trustmyrecord_session') !== null;
        },
        
        getCurrentUser() {
            const session = getStorage(STORAGE_KEYS.SESSION);
            if (!session) return null;
            const users = getStorage(STORAGE_KEYS.USERS);
            return users.find(u => u.id === session.userId) || null;
        },
        
        async login(email, password) {
            const users = getStorage(STORAGE_KEYS.USERS);
            const user = users.find(u => u.email === email && u.password === password);
            if (user) {
                setStorage(STORAGE_KEYS.SESSION, { userId: user.id, timestamp: Date.now() });
                // Sync tmr_* keys for compatibility with inline auth
                localStorage.setItem('tmr_is_logged_in', 'true');
                localStorage.setItem('tmr_current_user', JSON.stringify(user));
                return { success: true, user };
            }
            return { success: false, error: 'Invalid credentials' };
        },

        async register(username, email, password) {
            let users = getStorage(STORAGE_KEYS.USERS);
            if (users.find(u => u.email === email)) {
                return { success: false, error: 'Email already registered' };
            }
            if (users.find(u => u.username === username)) {
                return { success: false, error: 'Username taken' };
            }
            const newUser = {
                id: generateId(),
                username,
                email,
                password,
                displayName: username,
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
                bio: '',
                joinedDate: new Date().toISOString(),
                verified: false,
                stats: { totalPicks: 0, wins: 0, losses: 0, pushes: 0, winRate: 0, roi: 0 },
                social: { followers: [], following: [], reputation: 0, badges: [] },
                isPremium: false
            };
            users.push(newUser);
            setStorage(STORAGE_KEYS.USERS, users);
            setStorage(STORAGE_KEYS.SESSION, { userId: newUser.id, timestamp: Date.now() });
            // Sync tmr_* keys for compatibility with inline auth
            localStorage.setItem('tmr_is_logged_in', 'true');
            localStorage.setItem('tmr_current_user', JSON.stringify(newUser));
            return { success: true, user: newUser };
        },

        logout() {
            localStorage.removeItem(STORAGE_KEYS.SESSION);
            // Sync tmr_* keys for compatibility
            localStorage.removeItem('tmr_is_logged_in');
            localStorage.removeItem('tmr_current_user');
        },
        
        // User methods
        async getUserProfile(username) {
            const users = getStorage(STORAGE_KEYS.USERS);
            const user = users.find(u => u.username === username);
            if (!user) throw new Error('User not found');
            return { user };
        },
        
        async updateProfile(data) {
            const currentUser = this.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            
            let users = getStorage(STORAGE_KEYS.USERS);
            const idx = users.findIndex(u => u.id === currentUser.id);
            if (idx === -1) throw new Error('User not found');
            
            users[idx] = { ...users[idx], ...data };
            setStorage(STORAGE_KEYS.USERS, users);
            return { user: users[idx] };
        },
        
        // Picks methods
        async getMyPicks() {
            const currentUser = this.getCurrentUser();
            if (!currentUser) return { picks: [] };
            const picks = getStorage(STORAGE_KEYS.PICKS).filter(p => p.userId === currentUser.username);
            return { picks };
        },
        
        async createPick(data) {
            const currentUser = this.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            
            const pick = {
                id: generateId(),
                userId: currentUser.username,
                ...data,
                createdAt: new Date().toISOString(),
                status: 'pending'
            };
            
            let picks = getStorage(STORAGE_KEYS.PICKS);
            picks.push(pick);
            setStorage(STORAGE_KEYS.PICKS, picks);
            
            // Update user stats
            let users = getStorage(STORAGE_KEYS.USERS);
            const idx = users.findIndex(u => u.id === currentUser.id);
            if (idx !== -1) {
                users[idx].stats.totalPicks++;
                setStorage(STORAGE_KEYS.USERS, users);
            }
            
            return { pick };
        },
        
        // Forum methods
        async getForumStats() {
            const threads = getStorage(STORAGE_KEYS.THREADS);
            return {
                totalThreads: threads.length,
                totalReplies: threads.reduce((sum, t) => sum + (t.replies?.length || 0), 0),
                activeUsers: getStorage(STORAGE_KEYS.USERS).length
            };
        },
        
        async getForumCategories() {
            return {
                categories: [
                    { id: 'general', name: 'General Discussion', description: 'Talk about anything sports betting', icon: '💬', threadCount: 15 },
                    { id: 'nfl', name: 'NFL', description: 'Football picks and discussion', icon: '🏈', threadCount: 42 },
                    { id: 'nba', name: 'NBA', description: 'Basketball betting talk', icon: '🏀', threadCount: 38 },
                    { id: 'mlb', name: 'MLB', description: 'Baseball season discussion', icon: '⚾', threadCount: 23 },
                    { id: 'nhl', name: 'NHL', description: 'Hockey picks', icon: '🏒', threadCount: 12 },
                    { id: 'soccer', name: 'Soccer', description: 'Football from around the world', icon: '⚽', threadCount: 18 },
                    { id: 'ufc', name: 'UFC/MMA', description: 'Fight night predictions', icon: '🥊', threadCount: 8 }
                ]
            };
        },
        
        async getRecentThreads(limit = 10) {
            const threads = getStorage(STORAGE_KEYS.THREADS)
                .sort((a, b) => new Date(b.lastActivityTime) - new Date(a.lastActivityTime))
                .slice(0, limit);
            return { threads };
        },
        
        async getThreadsByCategory(categoryId) {
            const threads = getStorage(STORAGE_KEYS.THREADS)
                .filter(t => t.categoryId === categoryId)
                .sort((a, b) => new Date(b.lastActivityTime) - new Date(a.lastActivityTime));
            return { threads };
        },
        
        async getThread(threadId) {
            const threads = getStorage(STORAGE_KEYS.THREADS);
            const thread = threads.find(t => t.id === threadId);
            if (!thread) throw new Error('Thread not found');
            thread.views = (thread.views || 0) + 1;
            setStorage(STORAGE_KEYS.THREADS, threads);
            return { thread };
        },
        
        async createThread(data) {
            const currentUser = this.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            
            const thread = {
                id: generateId(),
                ...data,
                authorId: currentUser.id,
                authorUsername: currentUser.username,
                timestamp: new Date().toISOString(),
                lastActivityTime: new Date().toISOString(),
                replyCount: 0,
                views: 0,
                replies: []
            };
            
            let threads = getStorage(STORAGE_KEYS.THREADS);
            threads.push(thread);
            setStorage(STORAGE_KEYS.THREADS, threads);
            return { thread };
        },
        
        async addReply(threadId, content) {
            const currentUser = this.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            
            let threads = getStorage(STORAGE_KEYS.THREADS);
            const idx = threads.findIndex(t => t.id === threadId);
            if (idx === -1) throw new Error('Thread not found');
            
            const reply = {
                id: generateId(),
                authorId: currentUser.id,
                authorUsername: currentUser.username,
                content,
                timestamp: new Date().toISOString(),
                likes: 0
            };
            
            threads[idx].replies = threads[idx].replies || [];
            threads[idx].replies.push(reply);
            threads[idx].replyCount = threads[idx].replies.length;
            threads[idx].lastActivityTime = new Date().toISOString();
            setStorage(STORAGE_KEYS.THREADS, threads);
            return { reply };
        },
        
        // Poll methods
        async getPollStats() {
            const polls = getStorage(STORAGE_KEYS.POLLS);
            return {
                totalPolls: polls.length,
                totalVotes: polls.reduce((sum, p) => sum + p.totalVotes, 0)
            };
        },
        
        async getPollCategories() {
            return {
                categories: [
                    { id: 'nfl', name: 'NFL', icon: '🏈' },
                    { id: 'nba', name: 'NBA', icon: '🏀' },
                    { id: 'mlb', name: 'MLB', icon: '⚾' },
                    { id: 'general', name: 'General', icon: '📊' }
                ]
            };
        },
        
        async getActivePolls(options = {}) {
            const polls = getStorage(STORAGE_KEYS.POLLS)
                .filter(p => new Date(p.endsAt) > new Date())
                .slice(0, options.limit || 20);
            return { polls };
        },
        
        async getPoll(pollId) {
            const polls = getStorage(STORAGE_KEYS.POLLS);
            const poll = polls.find(p => p.id === pollId);
            if (!poll) throw new Error('Poll not found');
            return { poll };
        },
        
        async votePoll(pollId, optionId) {
            const currentUser = this.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            
            let polls = getStorage(STORAGE_KEYS.POLLS);
            const idx = polls.findIndex(p => p.id === pollId);
            if (idx === -1) throw new Error('Poll not found');
            
            // Check if already voted
            if (polls[idx].userVotes[currentUser.id]) {
                throw new Error('Already voted');
            }
            
            // Record vote
            const optionIdx = polls[idx].options.findIndex(o => o.id === optionId);
            if (optionIdx === -1) throw new Error('Invalid option');
            
            polls[idx].options[optionIdx].votes++;
            polls[idx].totalVotes++;
            polls[idx].userVotes[currentUser.id] = optionId;
            setStorage(STORAGE_KEYS.POLLS, polls);
            return { success: true };
        },
        
        async getPollLeaderboard(options = {}) {
            const users = getStorage(STORAGE_KEYS.USERS)
                .sort((a, b) => (b.social?.reputation || 0) - (a.social?.reputation || 0))
                .slice(0, options.limit || 20)
                .map(u => ({
                    username: u.username,
                    displayName: u.displayName,
                    avatar: u.avatar,
                    correctVotes: Math.floor(Math.random() * 50) + 10,
                    totalVotes: Math.floor(Math.random() * 100) + 50
                }));
            return { users };
        },
        
        // Trivia methods
        async getTriviaStats() {
            const trivia = getStorage(STORAGE_KEYS.TRIVIA);
            return {
                totalQuestions: trivia.length,
                totalPlayers: getStorage(STORAGE_KEYS.USERS).length
            };
        },
        
        async getTriviaCategories() {
            return {
                categories: [
                    { id: 'all', name: 'All Categories', icon: '🎯' },
                    { id: 'nfl', name: 'NFL', icon: '🏈' },
                    { id: 'nba', name: 'NBA', icon: '🏀' },
                    { id: 'mlb', name: 'MLB', icon: '⚾' }
                ]
            };
        },
        
        async getRandomTriviaQuestion(category = 'all') {
            let trivia = getStorage(STORAGE_KEYS.TRIVIA);
            if (category !== 'all') {
                trivia = trivia.filter(t => t.category === category);
            }
            if (trivia.length === 0) throw new Error('No questions available');
            const question = trivia[Math.floor(Math.random() * trivia.length)];
            return { question };
        },
        
        async submitTriviaAnswer(questionId, answerIndex) {
            const currentUser = this.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            
            const trivia = getStorage(STORAGE_KEYS.TRIVIA);
            const question = trivia.find(t => t.id === questionId);
            if (!question) throw new Error('Question not found');
            
            const correct = question.correctAnswer === answerIndex;
            return {
                correct,
                correctAnswer: question.correctAnswer,
                points: correct ? question.points : 0
            };
        },
        
        async getTriviaLeaderboard(options = {}) {
            const users = getStorage(STORAGE_KEYS.USERS)
                .sort((a, b) => (b.stats?.winRate || 0) - (a.stats?.winRate || 0))
                .slice(0, options.limit || 20)
                .map(u => ({
                    username: u.username,
                    displayName: u.displayName,
                    avatar: u.avatar,
                    score: (u.social?.reputation || 0) * 10 + Math.floor(Math.random() * 500)
                }));
            return { users };
        },
        
        // Message methods
        async getConversations() {
            const currentUser = this.getCurrentUser();
            if (!currentUser) return { conversations: [] };
            
            const messages = getStorage(STORAGE_KEYS.MESSAGES);
            const conversations = [];
            const userIds = new Set();
            
            messages.forEach(m => {
                if (m.senderId === currentUser.id) userIds.add(m.recipientId);
                if (m.recipientId === currentUser.id) userIds.add(m.senderId);
            });
            
            const users = getStorage(STORAGE_KEYS.USERS);
            userIds.forEach(id => {
                const user = users.find(u => u.id === id);
                if (user) {
                    const userMessages = messages.filter(m => 
                        (m.senderId === currentUser.id && m.recipientId === id) ||
                        (m.senderId === id && m.recipientId === currentUser.id)
                    );
                    const lastMessage = userMessages.sort((a, b) => 
                        new Date(b.timestamp) - new Date(a.timestamp)
                    )[0];
                    
                    conversations.push({
                        userId: id,
                        username: user.username,
                        displayName: user.displayName,
                        avatar: user.avatar,
                        lastMessage: lastMessage?.content || '',
                        lastMessageTime: lastMessage?.timestamp,
                        unreadCount: userMessages.filter(m => m.recipientId === currentUser.id && !m.read).length
                    });
                }
            });
            
            return { conversations };
        },
        
        async getMessages(userId) {
            const currentUser = this.getCurrentUser();
            if (!currentUser) return { messages: [] };
            
            const messages = getStorage(STORAGE_KEYS.MESSAGES)
                .filter(m => 
                    (m.senderId === currentUser.id && m.recipientId === userId) ||
                    (m.senderId === userId && m.recipientId === currentUser.id)
                )
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            // Mark as read
            let allMessages = getStorage(STORAGE_KEYS.MESSAGES);
            allMessages.forEach(m => {
                if (m.recipientId === currentUser.id && m.senderId === userId) {
                    m.read = true;
                }
            });
            setStorage(STORAGE_KEYS.MESSAGES, allMessages);
            
            return { messages };
        },
        
        async sendMessage(userId, content) {
            const currentUser = this.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            
            const message = {
                id: generateId(),
                senderId: currentUser.id,
                senderUsername: currentUser.username,
                recipientId: userId,
                content,
                timestamp: new Date().toISOString(),
                read: false
            };
            
            let messages = getStorage(STORAGE_KEYS.MESSAGES);
            messages.push(message);
            setStorage(STORAGE_KEYS.MESSAGES, messages);
            return { message };
        },
        
        // Contest methods
        async getContests(options = {}) {
            let contests = getStorage(STORAGE_KEYS.CONTESTS);
            if (options.status) {
                contests = contests.filter(c => c.status === options.status);
            }
            if (options.sport) {
                contests = contests.filter(c => c.sport === options.sport);
            }
            return { contests };
        },
        
        // Subscription methods
        async getSubscriptionTiers() {
            return {
                tiers: [
                    { id: 'free', name: 'Free', price: 0, features: ['Basic picks', 'Forum access'] },
                    { id: 'pro', name: 'Pro', price: 9.99, features: ['All picks', 'Premium stats', 'Ad-free'] },
                    { id: 'elite', name: 'Elite', price: 29.99, features: ['Everything', 'VIP forum', 'Direct messaging'] }
                ]
            };
        },
        
        async getSubscriptionStatus() {
            const currentUser = this.getCurrentUser();
            if (!currentUser) return { status: 'none' };
            return {
                status: currentUser.isPremium ? 'active' : 'none',
                tier: currentUser.isPremium ? 'pro' : 'free',
                expiresAt: null
            };
        }
    };
    
    // Initialize
    initDefaults();
    
    // Expose globally
    window.api = api;
    
    // Also expose auth for compatibility
    window.auth = {
        isLoggedIn: () => api.isLoggedIn(),
        getCurrentUser: () => api.getCurrentUser(),
        login: api.login.bind(api),
        register: api.register.bind(api),
        logout: api.logout.bind(api)
    };
    
    console.log('[TMR Static API] Initialized - 100% localStorage mode');
})();
