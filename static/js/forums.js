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
            {
                id: 'general',
                name: 'General Discussion',
                description: 'General sports betting talk, strategies, and discussions',
                icon: '💬',
                color: 'var(--neon-cyan)'
            },
            {
                id: 'picks',
                name: 'Pick Analysis',
                description: 'Discuss specific picks, matchups, and betting opportunities',
                icon: '🎯',
                color: 'var(--neon-gold)'
            },
            {
                id: 'nfl',
                name: 'NFL',
                description: 'All things NFL betting',
                icon: '🏈',
                color: 'var(--neon-green)'
            },
            {
                id: 'nba',
                name: 'NBA',
                description: 'Basketball betting discussion',
                icon: '🏀',
                color: 'var(--neon-purple)'
            },
            {
                id: 'mlb',
                name: 'MLB',
                description: 'Baseball betting and analysis',
                icon: '⚾',
                color: 'var(--neon-cyan)'
            },
            {
                id: 'nhl',
                name: 'NHL',
                description: 'Hockey betting talk',
                icon: '🏒',
                color: 'var(--neon-cyan)'
            },
            {
                id: 'soccer',
                name: 'Soccer',
                description: 'Soccer/Football betting worldwide',
                icon: '⚽',
                color: 'var(--neon-green)'
            },
            {
                id: 'strategies',
                name: 'Strategies & Systems',
                description: 'Betting strategies, bankroll management, and systems',
                icon: '📊',
                color: 'var(--neon-gold)'
            },
            {
                id: 'tools',
                name: 'Tools & Resources',
                description: 'Betting tools, data sources, and helpful resources',
                icon: '🔧',
                color: 'var(--neon-purple)'
            },
            {
                id: 'newbies',
                name: 'Newbie Corner',
                description: 'Questions and help for new bettors',
                icon: '🆕',
                color: 'var(--neon-cyan)'
            }
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
        return stored ? JSON.parse(stored) : [];
    }

    saveThreads() {
        localStorage.setItem('trustmyrecord_threads', JSON.stringify(this.threads));
    }

    loadReplies() {
        const stored = localStorage.getItem('trustmyrecord_replies');
        return stored ? JSON.parse(stored) : [];
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

// Initialize forums system
const forums = new ForumsSystem();

// Export
if (typeof window !== 'undefined') {
    window.forums = forums;
    window.ForumsSystem = ForumsSystem;
}
