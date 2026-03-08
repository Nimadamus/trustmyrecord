// Forums System for Trust My Record
// Categories, Threads, Replies, Voting

class ForumsSystem {
    constructor() {
        this.categories = this.initializeCategories();
        this.threads = this.loadThreads();
        this.replies = this.loadReplies();
        this.votes = this.loadVotes();
    }

    /**
     * Initialize forum categories
     */
    initializeCategories() {
        return [
            { id: 'nfl', name: 'NFL Betting', description: 'NFL handicapping discussion, game analysis, spreads, totals, and player props', icon: '🏈', color: '#013369', group: 'sports' },
            { id: 'nba', name: 'NBA Betting', description: 'NBA matchups, player props, system plays, and betting angles', icon: '🏀', color: '#C9082A', group: 'sports' },
            { id: 'mlb', name: 'MLB Betting', description: 'Baseball betting, run lines, totals, player props, and advanced analytics', icon: '⚾', color: '#002D72', group: 'sports' },
            { id: 'nhl', name: 'NHL Betting', description: 'Hockey betting, puck lines, totals, goalie matchups, and playoff action', icon: '🏒', color: '#A2AAAD', group: 'sports' },
            { id: 'soccer', name: 'Soccer Betting', description: 'Premier League, La Liga, Champions League, MLS, and worldwide football betting', icon: '⚽', color: '#00A651', group: 'sports' },
            { id: 'tennis', name: 'Tennis Betting', description: 'ATP, WTA, Grand Slams, match betting, sets, and tournament futures', icon: '🎾', color: '#CFB53B', group: 'sports' },
            { id: 'international', name: 'International Sports', description: 'Rugby, cricket, F1, boxing, MMA, golf, and more from around the world', icon: '🌍', color: '#2196F3', group: 'sports' },
            { id: 'handicappers', name: "Handicapper's Corner", description: 'Discuss betting systems, strategies, bankroll management, and handicapping methods', icon: '📊', color: '#FF9800', group: 'strategy' },
            { id: 'food', name: 'Food & Drink', description: 'Restaurant reviews, recipes, cooking tips, and food culture', icon: '🍔', color: '#E91E63', group: 'offtopic' },
            { id: 'travel', name: 'Travel', description: 'Travel destinations, tips, stories, and recommendations', icon: '✈️', color: '#00BCD4', group: 'offtopic' },
            { id: 'history', name: 'History', description: 'Historical discussions, debates, and fascinating stories from the past', icon: '📚', color: '#795548', group: 'offtopic' }
        ];
    }

    /**
     * Create a new thread
     */
    createThread(categoryId, title, content, tags = []) {
        if (!auth.isLoggedIn()) {
            throw new Error('Must be logged in to create threads');
        }

        if (!title || title.length < 5) {
            throw new Error('Title must be at least 5 characters');
        }

        if (!content || content.length < 10) {
            throw new Error('Content must be at least 10 characters');
        }

        const thread = {
            id: this.generateId(),
            categoryId,
            authorId: auth.currentUser.id,
            authorUsername: auth.currentUser.username,
            authorAvatar: auth.currentUser.avatar,
            title,
            content,
            tags,
            timestamp: new Date().toISOString(),
            lastActivityTime: new Date().toISOString(),
            views: 0,
            replyCount: 0,
            isPinned: false,
            isLocked: false,
            upvotes: 0,
            downvotes: 0
        };

        this.threads.push(thread);
        this.saveThreads();

        return thread;
    }

    /**
     * Add reply to thread
     */
    addReply(threadId, content, replyToId = null) {
        if (!auth.isLoggedIn()) {
            throw new Error('Must be logged in to reply');
        }

        const thread = this.getThread(threadId);
        if (!thread) {
            throw new Error('Thread not found');
        }

        if (thread.isLocked) {
            throw new Error('This thread is locked');
        }

        if (!content || content.length < 5) {
            throw new Error('Reply must be at least 5 characters');
        }

        const reply = {
            id: this.generateId(),
            threadId,
            authorId: auth.currentUser.id,
            authorUsername: auth.currentUser.username,
            authorAvatar: auth.currentUser.avatar,
            content,
            replyToId, // For nested replies
            timestamp: new Date().toISOString(),
            upvotes: 0,
            downvotes: 0,
            isBestAnswer: false
        };

        this.replies.push(reply);

        // Update thread stats
        thread.replyCount++;
        thread.lastActivityTime = new Date().toISOString();

        this.saveReplies();
        this.saveThreads();

        return reply;
    }

    /**
     * Vote on thread or reply
     */
    vote(itemType, itemId, voteType) {
        if (!auth.isLoggedIn()) {
            throw new Error('Must be logged in to vote');
        }

        const voteKey = `${auth.currentUser.id}_${itemType}_${itemId}`;
        const existingVote = this.votes.get(voteKey);

        // Remove existing vote if clicking same button
        if (existingVote === voteType) {
            this.votes.delete(voteKey);
            this.updateVoteCount(itemType, itemId, voteType, -1);
        }
        // Change vote
        else if (existingVote) {
            this.votes.set(voteKey, voteType);
            // Remove old vote and add new one
            this.updateVoteCount(itemType, itemId, existingVote, -1);
            this.updateVoteCount(itemType, itemId, voteType, 1);
        }
        // New vote
        else {
            this.votes.set(voteKey, voteType);
            this.updateVoteCount(itemType, itemId, voteType, 1);
        }

        this.saveVotes();
        return this.getVoteCount(itemType, itemId);
    }

    /**
     * Update vote count
     */
    updateVoteCount(itemType, itemId, voteType, delta) {
        const item = itemType === 'thread' ?
            this.getThread(itemId) :
            this.getReply(itemId);

        if (!item) return;

        if (voteType === 'up') {
            item.upvotes += delta;
        } else {
            item.downvotes += delta;
        }

        if (itemType === 'thread') {
            this.saveThreads();
        } else {
            this.saveReplies();
        }
    }

    /**
     * Get vote count for item
     */
    getVoteCount(itemType, itemId) {
        const item = itemType === 'thread' ?
            this.getThread(itemId) :
            this.getReply(itemId);

        if (!item) return { upvotes: 0, downvotes: 0, score: 0 };

        return {
            upvotes: item.upvotes,
            downvotes: item.downvotes,
            score: item.upvotes - item.downvotes
        };
    }

    /**
     * Get user's vote on item
     */
    getUserVote(itemType, itemId) {
        if (!auth.isLoggedIn()) return null;
        const voteKey = `${auth.currentUser.id}_${itemType}_${itemId}`;
        return this.votes.get(voteKey) || null;
    }

    /**
     * Get threads by category
     */
    getThreadsByCategory(categoryId, sortBy = 'activity', limit = 50) {
        let threads = this.threads.filter(t => t.categoryId === categoryId);

        // Sort threads
        switch(sortBy) {
            case 'activity':
                threads.sort((a, b) => new Date(b.lastActivityTime) - new Date(a.lastActivityTime));
                break;
            case 'newest':
                threads.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                break;
            case 'popular':
                threads.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
                break;
            case 'replies':
                threads.sort((a, b) => b.replyCount - a.replyCount);
                break;
        }

        // Pinned threads first
        threads.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return 0;
        });

        return threads.slice(0, limit);
    }

    /**
     * Get all threads (for homepage)
     */
    getAllThreads(sortBy = 'activity', limit = 50) {
        let threads = [...this.threads];

        switch(sortBy) {
            case 'activity':
                threads.sort((a, b) => new Date(b.lastActivityTime) - new Date(a.lastActivityTime));
                break;
            case 'newest':
                threads.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                break;
            case 'hot':
                // Hot = recent activity + high score
                threads.sort((a, b) => {
                    const aScore = (a.upvotes - a.downvotes) + (a.replyCount * 0.5);
                    const bScore = (b.upvotes - b.downvotes) + (b.replyCount * 0.5);
                    return bScore - aScore;
                });
                break;
        }

        return threads.slice(0, limit);
    }

    /**
     * Get single thread
     */
    getThread(threadId) {
        return this.threads.find(t => t.id === threadId);
    }

    /**
     * Get replies for thread
     */
    getReplies(threadId, sortBy = 'oldest') {
        let replies = this.replies.filter(r => r.threadId === threadId && !r.replyToId);

        switch(sortBy) {
            case 'oldest':
                replies.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                break;
            case 'newest':
                replies.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                break;
            case 'popular':
                replies.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
                break;
        }

        return replies;
    }

    /**
     * Get nested replies
     */
    getNestedReplies(replyId) {
        return this.replies
            .filter(r => r.replyToId === replyId)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    /**
     * Get single reply
     */
    getReply(replyId) {
        return this.replies.find(r => r.id === replyId);
    }

    /**
     * Search threads
     */
    searchThreads(query, categoryId = null) {
        if (!query || query.length < 2) return [];

        query = query.toLowerCase();

        let results = this.threads.filter(thread => {
            const matchesQuery =
                thread.title.toLowerCase().includes(query) ||
                thread.content.toLowerCase().includes(query) ||
                thread.tags.some(tag => tag.toLowerCase().includes(query));

            const matchesCategory = !categoryId || thread.categoryId === categoryId;

            return matchesQuery && matchesCategory;
        });

        return results.slice(0, 50);
    }

    /**
     * Increment thread views
     */
    incrementViews(threadId) {
        const thread = this.getThread(threadId);
        if (thread) {
            thread.views++;
            this.saveThreads();
        }
    }

    /**
     * Get category stats
     */
    getCategoryStats(categoryId) {
        const threads = this.threads.filter(t => t.categoryId === categoryId);
        const totalReplies = threads.reduce((sum, t) => sum + t.replyCount, 0);

        let lastActivity = null;
        if (threads.length > 0) {
            lastActivity = threads.reduce((latest, t) => {
                const time = new Date(t.lastActivityTime);
                return time > latest ? time : latest;
            }, new Date(0));
        }

        return {
            threadCount: threads.length,
            replyCount: totalReplies,
            lastActivity
        };
    }

    /**
     * Load/Save helpers
     */
    loadThreads() {
        const stored = localStorage.getItem('trustmyrecord_threads');
        if (stored) return JSON.parse(stored);

        // Initialize with sample threads
        const sampleThreads = [
            {
                id: 'thread_sample_1', categoryId: 'handicappers', authorId: 'user_sample_1', authorUsername: 'SharpBettor',
                authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sharp',
                title: 'Welcome to Trust My Record Forums!',
                content: 'This is the official community forum. Share picks, discuss strategies, and connect with other bettors. Every pick is tracked and verified. Let's build a community of honest handicappers!',
                tags: ['welcome', 'community'],
                timestamp: new Date(Date.now() - 7*24*60*60*1000).toISOString(),
                lastActivityTime: new Date(Date.now() - 1*24*60*60*1000).toISOString(),
                views: 342, replyCount: 15, isPinned: true, isLocked: false, upvotes: 47, downvotes: 2
            },
            {
                id: 'thread_sample_2', categoryId: 'nfl', authorId: 'user_sample_2', authorUsername: 'GridironGuru',
                authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=gridiron',
                title: 'NFL Week 15 Discussion Thread',
                content: 'What are everyone's thoughts on the Week 15 slate? I'm liking the Chiefs at home, Bills on the road.',
                tags: ['nfl', 'week15', 'picks'],
                timestamp: new Date(Date.now() - 2*24*60*60*1000).toISOString(),
                lastActivityTime: new Date(Date.now() - 3*60*60*1000).toISOString(),
                views: 156, replyCount: 23, isPinned: false, isLocked: false, upvotes: 28, downvotes: 3
            },
            {
                id: 'thread_sample_3', categoryId: 'nba', authorId: 'user_sample_3', authorUsername: 'HoopsMaster',
                authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=hoops',
                title: 'Best NBA betting strategies for 2024-25 season',
                content: 'Most profitable NBA angles: 1) Fade back-to-backs 2) Home dogs after 3+ losses 3) Unders in divisional games.',
                tags: ['nba', 'strategy'],
                timestamp: new Date(Date.now() - 5*24*60*60*1000).toISOString(),
                lastActivityTime: new Date(Date.now() - 12*60*60*1000).toISOString(),
                views: 289, replyCount: 31, isPinned: false, isLocked: false, upvotes: 52, downvotes: 4
            },
            {
                id: 'thread_sample_4', categoryId: 'handicappers', authorId: 'user_sample_4', authorUsername: 'BankrollKing',
                authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bank',
                title: 'Bankroll Management 101 - The Key to Long-Term Success',
                content: 'Never bet more than 2-3% per play. Use flat betting until 6+ months tracked. The goal is sustainable profits.',
                tags: ['bankroll', 'strategy'],
                timestamp: new Date(Date.now() - 10*24*60*60*1000).toISOString(),
                lastActivityTime: new Date(Date.now() - 2*24*60*60*1000).toISOString(),
                views: 412, replyCount: 18, isPinned: false, isLocked: false, upvotes: 89, downvotes: 1
            },
            {
                id: 'thread_sample_5', categoryId: 'handicappers', authorId: 'user_sample_5', authorUsername: 'ValueFinder',
                authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=value',
                title: 'How I'm up 45 units this month - Process breakdown',
                content: 'Line shopping, waiting for my number, heavy on player props, fading public on primetime. Verified record: 67-41 (+45.2u)',
                tags: ['process', 'winning'],
                timestamp: new Date(Date.now() - 3*24*60*60*1000).toISOString(),
                lastActivityTime: new Date(Date.now() - 6*60*60*1000).toISOString(),
                views: 567, replyCount: 42, isPinned: false, isLocked: false, upvotes: 112, downvotes: 8
            }
        ];
        localStorage.setItem('trustmyrecord_threads', JSON.stringify(sampleThreads));
        return sampleThreads;
    }

    saveThreads() {
        localStorage.setItem('trustmyrecord_threads', JSON.stringify(this.threads));
    }

    loadReplies() {
        const stored = localStorage.getItem('trustmyrecord_replies');
        if (stored) return JSON.parse(stored);

        // Initialize with sample replies
        const sampleReplies = [
            {
                id: 'reply_1', threadId: 'thread_sample_1', authorId: 'user_sample_2', authorUsername: 'GridironGuru',
                authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=gridiron',
                content: 'Love this platform! Finally a place where everyone's record is transparent. No more fake gurus.',
                timestamp: new Date(Date.now() - 6*24*60*60*1000).toISOString(),
                upvotes: 12, downvotes: 0, replyToId: null
            },
            {
                id: 'reply_2', threadId: 'thread_sample_2', authorId: 'user_sample_3', authorUsername: 'HoopsMaster',
                authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=hoops',
                content: 'Chiefs at home is solid. I'm also looking at the Eagles this week - their defense has been elite lately.',
                timestamp: new Date(Date.now() - 1*24*60*60*1000).toISOString(),
                upvotes: 8, downvotes: 1, replyToId: null
            },
            {
                id: 'reply_3', threadId: 'thread_sample_3', authorId: 'user_sample_4', authorUsername: 'BankrollKing',
                authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bank',
                content: 'The back-to-back fade is my bread and butter. Especially in the second half of the season when fatigue sets in.',
                timestamp: new Date(Date.now() - 4*24*60*60*1000).toISOString(),
                upvotes: 18, downvotes: 0, replyToId: null
            },
            {
                id: 'reply_4', threadId: 'thread_sample_5', authorId: 'user_sample_1', authorUsername: 'SharpBettor',
                authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sharp',
                content: 'Congrats on the month! What books are you using for line shopping? I mainly stick to DraftKings and FanDuel.',
                timestamp: new Date(Date.now() - 2*24*60*60*1000).toISOString(),
                upvotes: 5, downvotes: 0, replyToId: null
            },
            {
                id: 'reply_5', threadId: 'thread_sample_5', authorId: 'user_sample_5', authorUsername: 'ValueFinder',
                authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=value',
                content: 'DK, FD, Caesars, and BetMGM. Sometimes Pinnacle for the sharpest lines. Line shopping alone adds 2-3 units/month.',
                timestamp: new Date(Date.now() - 1*24*60*60*1000).toISOString(),
                upvotes: 22, downvotes: 0, replyToId: 'reply_4'
            }
        ];
        localStorage.setItem('trustmyrecord_replies', JSON.stringify(sampleReplies));
        return sampleReplies;
    }

    saveReplies() {
        localStorage.setItem('trustmyrecord_replies', JSON.stringify(this.replies));
    }

    loadVotes() {
        const stored = localStorage.getItem('trustmyrecord_forum_votes');
        if (!stored) return new Map();

        const obj = JSON.parse(stored);
        return new Map(Object.entries(obj));
    }

    saveVotes() {
        const obj = Object.fromEntries(this.votes);
        localStorage.setItem('trustmyrecord_forum_votes', JSON.stringify(obj));
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

// Clear old forum data if categories changed (v2 = new categories with groups)
(function() {
    const FORUM_VERSION = 'v2_groups';
    if (localStorage.getItem('tmr_forum_version') !== FORUM_VERSION) {
        localStorage.removeItem('trustmyrecord_threads');
        localStorage.removeItem('trustmyrecord_replies');
        localStorage.removeItem('trustmyrecord_forum_votes');
        localStorage.setItem('tmr_forum_version', FORUM_VERSION);
    }
})();

// Initialize forums system
const forums = new ForumsSystem();

// Export
if (typeof window !== 'undefined') {
    window.forums = forums;
    window.ForumsSystem = ForumsSystem;
}
