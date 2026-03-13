// Complete Forum Engine for Trust My Record
// Categories, Threads, Replies, Voting, Moderation

class ForumEngine {
    constructor() {
        this.CATEGORIES_KEY = 'tmr_forum_categories';
        this.THREADS_KEY = 'tmr_forum_threads';
        this.REPLIES_KEY = 'tmr_forum_replies';
        this.VOTES_KEY = 'tmr_forum_votes';
        this.SUBSCRIPTIONS_KEY = 'tmr_forum_subscriptions';
        this.MODERATION_KEY = 'tmr_forum_moderation';
        
        this.initializeCategories();
    }

    /**
     * Initialize default forum categories
     */
    initializeCategories() {
        const existing = localStorage.getItem(this.CATEGORIES_KEY);
        if (existing) return;

        const defaultCategories = [
            {
                id: 'general',
                name: 'General Discussion',
                description: 'General sports betting talk, strategies, and discussions',
                icon: '💬',
                color: '#00ffff',
                order: 1,
                requiresAuth: false
            },
            {
                id: 'picks',
                name: 'Pick Analysis',
                description: 'Discuss specific picks, matchups, and betting opportunities',
                icon: '🎯',
                color: '#ffd700',
                order: 2,
                requiresAuth: false
            },
            {
                id: 'nfl',
                name: 'NFL',
                description: 'All things NFL betting - spreads, totals, props, and more',
                icon: '🏈',
                color: '#4ade80',
                order: 3,
                requiresAuth: false
            },
            {
                id: 'nba',
                name: 'NBA',
                description: 'Basketball betting discussion and analysis',
                icon: '🏀',
                color: '#a855f7',
                order: 4,
                requiresAuth: false
            },
            {
                id: 'mlb',
                name: 'MLB',
                description: 'Baseball betting, MLB props, and daily picks',
                icon: '⚾',
                color: '#00ffff',
                order: 5,
                requiresAuth: false
            },
            {
                id: 'nhl',
                name: 'NHL',
                description: 'Hockey betting talk and analysis',
                icon: '🏒',
                color: '#00ffff',
                order: 6,
                requiresAuth: false
            },
            {
                id: 'soccer',
                name: 'Soccer',
                description: 'Soccer/Football betting worldwide',
                icon: '⚽',
                color: '#4ade80',
                order: 7,
                requiresAuth: false
            },
            {
                id: 'strategies',
                name: 'Strategies & Systems',
                description: 'Betting strategies, bankroll management, and mathematical approaches',
                icon: '📊',
                color: '#ffd700',
                order: 8,
                requiresAuth: false
            },
            {
                id: 'tools',
                name: 'Tools & Resources',
                description: 'Betting tools, data sources, spreadsheets, and helpful resources',
                icon: '🔧',
                color: '#a855f7',
                order: 9,
                requiresAuth: false
            },
            {
                id: 'announcements',
                name: 'Announcements',
                description: 'Official site news and updates',
                icon: '📢',
                color: '#ef4444',
                order: 0,
                requiresAuth: false,
                adminOnly: true
            }
        ];

        localStorage.setItem(this.CATEGORIES_KEY, JSON.stringify(defaultCategories));
    }

    /**
     * Get all categories
     */
    getCategories() {
        return JSON.parse(localStorage.getItem(this.CATEGORIES_KEY) || '[]')
            .sort((a, b) => a.order - b.order);
    }

    /**
     * Get category by ID
     */
    getCategory(categoryId) {
        const categories = this.getCategories();
        return categories.find(c => c.id === categoryId);
    }

    /**
     * Create a new thread
     */
    createThread(categoryId, title, content, options = {}) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) {
            return { success: false, error: 'Must be logged in to create threads' };
        }

        const category = this.getCategory(categoryId);
        if (!category) {
            return { success: false, error: 'Category not found' };
        }

        if (category.adminOnly && !currentUser.isAdmin) {
            return { success: false, error: 'Only admins can post in this category' };
        }

        // Validate
        if (!title || title.trim().length < 5) {
            return { success: false, error: 'Title must be at least 5 characters' };
        }
        if (!content || content.trim().length < 10) {
            return { success: false, error: 'Content must be at least 10 characters' };
        }

        const threads = this.getThreads();
        const thread = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            categoryId,
            title: title.trim(),
            content: this.sanitizeContent(content.trim()),
            author: currentUser.username,
            authorDisplay: currentUser.displayName || currentUser.username,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            replyCount: 0,
            viewCount: 0,
            votes: { up: 0, down: 0 },
            isPinned: options.isPinned || false,
            isLocked: false,
            tags: options.tags || [],
            lastReplyAt: new Date().toISOString(),
            lastReplyBy: currentUser.username
        };

        threads.unshift(thread);
        this.saveThreads(threads);

        // Create activity
        this.createActivity('new_thread', currentUser.username, { threadId: thread.id, categoryId });

        return { success: true, thread };
    }

    /**
     * Get threads with filtering
     */
    getThreads(options = {}) {
        const { 
            categoryId, 
            page = 1, 
            perPage = 20, 
            sortBy = 'lastReply',
            author,
            search
        } = options;

        let threads = JSON.parse(localStorage.getItem(this.THREADS_KEY) || '[]');

        // Filter by category
        if (categoryId) {
            threads = threads.filter(t => t.categoryId === categoryId);
        }

        // Filter by author
        if (author) {
            threads = threads.filter(t => t.author === author);
        }

        // Search
        if (search) {
            const searchLower = search.toLowerCase();
            threads = threads.filter(t => 
                t.title.toLowerCase().includes(searchLower) ||
                t.content.toLowerCase().includes(searchLower)
            );
        }

        // Sort
        switch (sortBy) {
            case 'newest':
                threads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case 'popular':
                threads.sort((a, b) => (b.replyCount + b.viewCount) - (a.replyCount + a.viewCount));
                break;
            case 'votes':
                threads.sort((a, b) => (b.votes.up - b.votes.down) - (a.votes.up - a.votes.down));
                break;
            case 'lastReply':
            default:
                threads.sort((a, b) => new Date(b.lastReplyAt) - new Date(a.lastReplyAt));
        }

        // Pin pinned threads to top
        const pinned = threads.filter(t => t.isPinned);
        const unpinned = threads.filter(t => !t.isPinned);
        threads = [...pinned, ...unpinned];

        // Pagination
        const start = (page - 1) * perPage;
        const paginated = threads.slice(start, start + perPage);

        return {
            threads: paginated,
            total: threads.length,
            page,
            perPage,
            totalPages: Math.ceil(threads.length / perPage)
        };
    }

    /**
     * Get single thread
     */
    getThread(threadId, incrementViews = true) {
        const threads = JSON.parse(localStorage.getItem(this.THREADS_KEY) || '[]');
        const thread = threads.find(t => t.id === threadId);

        if (thread && incrementViews) {
            thread.viewCount = (thread.viewCount || 0) + 1;
            this.saveThreads(threads);
        }

        return thread;
    }

    /**
     * Update thread
     */
    updateThread(threadId, updates) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return { success: false, error: 'Not logged in' };

        const threads = JSON.parse(localStorage.getItem(this.THREADS_KEY) || '[]');
        const index = threads.findIndex(t => t.id === threadId);

        if (index === -1) return { success: false, error: 'Thread not found' };

        const thread = threads[index];
        if (thread.author !== currentUser.username && !currentUser.isAdmin) {
            return { success: false, error: 'Not authorized' };
        }

        // Only allow certain updates
        if (updates.title) thread.title = updates.title.trim();
        if (updates.content) thread.content = this.sanitizeContent(updates.content.trim());
        if (updates.tags) thread.tags = updates.tags;
        if (currentUser.isAdmin) {
            if (typeof updates.isPinned !== 'undefined') thread.isPinned = updates.isPinned;
            if (typeof updates.isLocked !== 'undefined') thread.isLocked = updates.isLocked;
        }

        thread.updatedAt = new Date().toISOString();
        this.saveThreads(threads);

        return { success: true, thread };
    }

    /**
     * Delete thread
     */
    deleteThread(threadId) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return { success: false, error: 'Not logged in' };

        const threads = JSON.parse(localStorage.getItem(this.THREADS_KEY) || '[]');
        const thread = threads.find(t => t.id === threadId);

        if (!thread) return { success: false, error: 'Thread not found' };
        if (thread.author !== currentUser.username && !currentUser.isAdmin) {
            return { success: false, error: 'Not authorized' };
        }

        // Delete thread and all replies
        const filteredThreads = threads.filter(t => t.id !== threadId);
        this.saveThreads(filteredThreads);

        const replies = this.getReplies(threadId);
        const allReplies = JSON.parse(localStorage.getItem(this.REPLIES_KEY) || '[]');
        const filteredReplies = allReplies.filter(r => r.threadId !== threadId);
        localStorage.setItem(this.REPLIES_KEY, JSON.stringify(filteredReplies));

        return { success: true };
    }

    /**
     * Add reply to thread
     */
    addReply(threadId, content, options = {}) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) {
            return { success: false, error: 'Must be logged in to reply' };
        }

        const thread = this.getThread(threadId, false);
        if (!thread) {
            return { success: false, error: 'Thread not found' };
        }

        if (thread.isLocked) {
            return { success: false, error: 'Thread is locked' };
        }

        if (!content || content.trim().length < 3) {
            return { success: false, error: 'Reply must be at least 3 characters' };
        }

        const replies = JSON.parse(localStorage.getItem(this.REPLIES_KEY) || '[]');
        
        const reply = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            threadId,
            content: this.sanitizeContent(content.trim()),
            author: currentUser.username,
            authorDisplay: currentUser.displayName || currentUser.username,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            votes: { up: 0, down: 0 },
            isEdited: false,
            parentId: options.parentId || null // For nested replies
        };

        replies.push(reply);
        localStorage.setItem(this.REPLIES_KEY, JSON.stringify(replies));

        // Update thread
        const threads = JSON.parse(localStorage.getItem(this.THREADS_KEY) || '[]');
        const threadIndex = threads.findIndex(t => t.id === threadId);
        if (threadIndex !== -1) {
            threads[threadIndex].replyCount = replies.filter(r => r.threadId === threadId).length;
            threads[threadIndex].lastReplyAt = new Date().toISOString();
            threads[threadIndex].lastReplyBy = currentUser.username;
            threads[threadIndex].updatedAt = new Date().toISOString();
            this.saveThreads(threads);
        }

        // Notify subscribers
        this.notifySubscribers(threadId, 'new_reply', reply);

        return { success: true, reply };
    }

    /**
     * Get replies for a thread
     */
    getReplies(threadId, options = {}) {
        const { sortBy = 'oldest', page = 1, perPage = 50 } = options;
        
        const allReplies = JSON.parse(localStorage.getItem(this.REPLIES_KEY) || '[]');
        let replies = allReplies.filter(r => r.threadId === threadId);

        // Sort
        switch (sortBy) {
            case 'newest':
                replies.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case 'votes':
                replies.sort((a, b) => (b.votes.up - b.votes.down) - (a.votes.up - a.votes.down));
                break;
            case 'oldest':
            default:
                replies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        }

        // Build nested structure if needed
        const nestedReplies = this.buildNestedReplies(replies);

        const start = (page - 1) * perPage;
        return {
            replies: nestedReplies.slice(start, start + perPage),
            total: replies.length,
            page,
            perPage,
            totalPages: Math.ceil(replies.length / perPage)
        };
    }

    /**
     * Build nested reply structure
     */
    buildNestedReplies(replies, parentId = null) {
        return replies
            .filter(r => r.parentId === parentId)
            .map(r => ({
                ...r,
                children: this.buildNestedReplies(replies, r.id)
            }));
    }

    /**
     * Edit reply
     */
    editReply(replyId, newContent) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return { success: false, error: 'Not logged in' };

        const replies = JSON.parse(localStorage.getItem(this.REPLIES_KEY) || '[]');
        const index = replies.findIndex(r => r.id === replyId);

        if (index === -1) return { success: false, error: 'Reply not found' };

        const reply = replies[index];
        if (reply.author !== currentUser.username && !currentUser.isAdmin) {
            return { success: false, error: 'Not authorized' };
        }

        reply.content = this.sanitizeContent(newContent.trim());
        reply.isEdited = true;
        reply.updatedAt = new Date().toISOString();

        localStorage.setItem(this.REPLIES_KEY, JSON.stringify(replies));

        return { success: true, reply };
    }

    /**
     * Delete reply
     */
    deleteReply(replyId) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return { success: false, error: 'Not logged in' };

        const replies = JSON.parse(localStorage.getItem(this.REPLIES_KEY) || '[]');
        const index = replies.findIndex(r => r.id === replyId);

        if (index === -1) return { success: false, error: 'Reply not found' };

        const reply = replies[index];
        if (reply.author !== currentUser.username && !currentUser.isAdmin) {
            return { success: false, error: 'Not authorized' };
        }

        const threadId = reply.threadId;
        replies.splice(index, 1);
        localStorage.setItem(this.REPLIES_KEY, JSON.stringify(replies));

        // Update thread reply count
        const threads = JSON.parse(localStorage.getItem(this.THREADS_KEY) || '[]');
        const thread = threads.find(t => t.id === threadId);
        if (thread) {
            thread.replyCount = replies.filter(r => r.threadId === threadId).length;
            this.saveThreads(threads);
        }

        return { success: true };
    }

    /**
     * Vote on thread or reply
     */
    vote(targetType, targetId, voteType) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return { success: false, error: 'Not logged in' };

        const votes = JSON.parse(localStorage.getItem(this.VOTES_KEY) || '{}');
        const voteKey = `${currentUser.username}:${targetType}:${targetId}`;
        
        const existingVote = votes[voteKey];

        // Remove existing vote if same type (toggle off)
        if (existingVote === voteType) {
            delete votes[voteKey];
            this.updateVoteCount(targetType, targetId, voteType, -1);
        } else {
            // Remove old vote if exists
            if (existingVote) {
                this.updateVoteCount(targetType, targetId, existingVote, -1);
            }
            // Add new vote
            votes[voteKey] = voteType;
            this.updateVoteCount(targetType, targetId, voteType, 1);
        }

        localStorage.setItem(this.VOTES_KEY, JSON.stringify(votes));

        // Get current vote count
        const currentItem = targetType === 'thread' 
            ? this.getThread(targetId, false)
            : this.getReply(targetId);

        return { 
            success: true, 
            votes: currentItem ? currentItem.votes : { up: 0, down: 0 },
            userVote: votes[voteKey] || null
        };
    }

    /**
     * Get user's vote on an item
     */
    getUserVote(targetType, targetId) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return null;

        const votes = JSON.parse(localStorage.getItem(this.VOTES_KEY) || '{}');
        const voteKey = `${currentUser.username}:${targetType}:${targetId}`;
        return votes[voteKey] || null;
    }

    /**
     * Update vote count on target
     */
    updateVoteCount(targetType, targetId, voteType, delta) {
        if (targetType === 'thread') {
            const threads = JSON.parse(localStorage.getItem(this.THREADS_KEY) || '[]');
            const thread = threads.find(t => t.id === targetId);
            if (thread) {
                if (!thread.votes) thread.votes = { up: 0, down: 0 };
                thread.votes[voteType] = Math.max(0, (thread.votes[voteType] || 0) + delta);
                this.saveThreads(threads);
            }
        } else {
            const replies = JSON.parse(localStorage.getItem(this.REPLIES_KEY) || '[]');
            const reply = replies.find(r => r.id === targetId);
            if (reply) {
                if (!reply.votes) reply.votes = { up: 0, down: 0 };
                reply.votes[voteType] = Math.max(0, (reply.votes[voteType] || 0) + delta);
                localStorage.setItem(this.REPLIES_KEY, JSON.stringify(replies));
            }
        }
    }

    /**
     * Get single reply
     */
    getReply(replyId) {
        const replies = JSON.parse(localStorage.getItem(this.REPLIES_KEY) || '[]');
        return replies.find(r => r.id === replyId);
    }

    /**
     * Subscribe to thread
     */
    subscribeToThread(threadId) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return { success: false, error: 'Not logged in' };

        const subscriptions = JSON.parse(localStorage.getItem(this.SUBSCRIPTIONS_KEY) || '{}');
        if (!subscriptions[currentUser.username]) {
            subscriptions[currentUser.username] = [];
        }

        if (!subscriptions[currentUser.username].includes(threadId)) {
            subscriptions[currentUser.username].push(threadId);
            localStorage.setItem(this.SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions));
        }

        return { success: true };
    }

    /**
     * Unsubscribe from thread
     */
    unsubscribeFromThread(threadId) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return { success: false, error: 'Not logged in' };

        const subscriptions = JSON.parse(localStorage.getItem(this.SUBSCRIPTIONS_KEY) || '{}');
        if (subscriptions[currentUser.username]) {
            subscriptions[currentUser.username] = subscriptions[currentUser.username]
                .filter(id => id !== threadId);
            localStorage.setItem(this.SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions));
        }

        return { success: true };
    }

    /**
     * Check if user is subscribed to thread
     */
    isSubscribed(threadId) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return false;

        const subscriptions = JSON.parse(localStorage.getItem(this.SUBSCRIPTIONS_KEY) || '{}');
        return subscriptions[currentUser.username]?.includes(threadId) || false;
    }

    /**
     * Notify subscribers of new activity
     */
    notifySubscribers(threadId, type, data) {
        // This would typically send notifications
        // For now, just log it
        console.log(`Notification: ${type} in thread ${threadId}`);
    }

    /**
     * Get forum stats
     */
    getForumStats() {
        const threads = JSON.parse(localStorage.getItem(this.THREADS_KEY) || '[]');
        const replies = JSON.parse(localStorage.getItem(this.REPLIES_KEY) || '[]');
        
        const categories = this.getCategories();
        const categoryStats = categories.map(c => ({
            ...c,
            threadCount: threads.filter(t => t.categoryId === c.id).length
        }));

        return {
            totalThreads: threads.length,
            totalReplies: replies.length,
            totalPosts: threads.length + replies.length,
            categories: categoryStats,
            recentThreads: threads
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 5),
            hotThreads: threads
                .sort((a, b) => (b.replyCount + b.viewCount) - (a.replyCount + a.viewCount))
                .slice(0, 5)
        };
    }

    /**
     * Get user's forum activity
     */
    getUserActivity(username) {
        const threads = JSON.parse(localStorage.getItem(this.THREADS_KEY) || '[]')
            .filter(t => t.author === username);
        const replies = JSON.parse(localStorage.getItem(this.REPLIES_KEY) || '[]')
            .filter(r => r.author === username);

        return {
            threadsStarted: threads.length,
            repliesPosted: replies.length,
            totalPosts: threads.length + replies.length,
            reputation: this.calculateReputation(username, threads, replies),
            recentThreads: threads
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 5),
            recentReplies: replies
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 5)
        };
    }

    /**
     * Calculate forum reputation
     */
    calculateReputation(username, threads, replies) {
        const threadVotes = threads.reduce((sum, t) => sum + (t.votes?.up || 0) - (t.votes?.down || 0), 0);
        const replyVotes = replies.reduce((sum, r) => sum + (r.votes?.up || 0) - (r.votes?.down || 0), 0);
        
        const baseRep = 100;
        const voteBonus = (threadVotes + replyVotes) * 5;
        const activityBonus = (threads.length + replies.length) * 2;

        return Math.max(0, baseRep + voteBonus + activityBonus);
    }

    /**
     * Save threads
     */
    saveThreads(threads) {
        localStorage.setItem(this.THREADS_KEY, JSON.stringify(threads));
    }

    /**
     * Sanitize content (basic)
     */
    sanitizeContent(content) {
        return content
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
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
     * Create activity entry
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
const forumEngine = new ForumEngine();
