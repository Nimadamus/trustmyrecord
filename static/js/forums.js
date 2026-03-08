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
            { id: 'nfl', name: 'NFL', description: 'National Football League discussion', icon: '🏈', color: '#013369', group: 'sports' },
            { id: 'nhl', name: 'NHL', description: 'National Hockey League discussion', icon: '🏒', color: '#A2AAAD', group: 'sports' },
            { id: 'nba', name: 'NBA', description: 'National Basketball Association discussion', icon: '🏀', color: '#C9082A', group: 'sports' },
            { id: 'mlb', name: 'MLB', description: 'Major League Baseball discussion', icon: '⚾', color: '#002D72', group: 'sports' },
            { id: 'soccer', name: 'Soccer', description: 'Soccer and football worldwide', icon: '⚽', color: '#00A651', group: 'sports' },
            { id: 'tennis', name: 'Tennis', description: 'ATP, WTA, and Grand Slam discussion', icon: '🎾', color: '#CFB53B', group: 'sports' },
            { id: 'travel', name: 'Travel', description: 'Travel tips, destinations, and stories', icon: '✈️', color: '#00BCD4', group: 'other' },
            { id: 'food', name: 'Food', description: 'Restaurants, recipes, and food culture', icon: '🍔', color: '#E91E63', group: 'other' },
            { id: 'history', name: 'History', description: 'Historical events and discussion', icon: '📜', color: '#795548', group: 'other' },
            { id: 'worldnews', name: 'World News', description: 'Current events and global news', icon: '🌍', color: '#2196F3', group: 'other' }
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
        return [];
    }

    saveThreads() {
        localStorage.setItem('trustmyrecord_threads', JSON.stringify(this.threads));
    }

    loadReplies() {
        const stored = localStorage.getItem('trustmyrecord_replies');
        if (stored) return JSON.parse(stored);
        return [];
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
