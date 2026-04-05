/**
 * Social Feed Engine for TrustMyRecord
 * Handles posts, hot takes, likes, comments - all localStorage powered
 * with backend pick integration
 */

class SocialFeedEngine {
    constructor() {
        this.POSTS_KEY = 'tmr_social_posts';
        this.LIKES_KEY = 'tmr_social_likes';
        this.COMMENTS_KEY = 'tmr_social_comments';
        this.posts = this.load(this.POSTS_KEY, []);
        this.likes = this.load(this.LIKES_KEY, []);
        this.comments = this.load(this.COMMENTS_KEY, []);
        this.ensureSeedData();
    }

    // ==================== STORAGE ====================

    load(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch { return fallback; }
    }

    save(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    // ==================== POSTS ====================

    createPost({ type, content, sport, tags, pollOptions }) {
        const user = this.getCurrentUser();
        if (!user) throw new Error('Must be logged in');

        const post = {
            id: 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            userId: user.id || user.username,
            username: user.username,
            displayName: user.displayName || user.username,
            avatar: user.avatar || null,
            type: type || 'post', // post, hot-take, poll, pick-share
            content,
            sport: sport || null,
            tags: tags || [],
            pollOptions: pollOptions || null, // [{text, votes: 0}]
            pollVoters: [],
            createdAt: new Date().toISOString(),
            pinned: false
        };

        this.posts.unshift(post);
        this.save(this.POSTS_KEY, this.posts);
        return post;
    }

    deletePost(postId) {
        const user = this.getCurrentUser();
        if (!user) return false;
        const idx = this.posts.findIndex(p => p.id === postId && (p.userId === user.id || p.userId === user.username));
        if (idx === -1) return false;
        this.posts.splice(idx, 1);
        this.save(this.POSTS_KEY, this.posts);
        // Clean up likes and comments
        this.likes = this.likes.filter(l => l.targetId !== postId);
        this.save(this.LIKES_KEY, this.likes);
        this.comments = this.comments.filter(c => c.postId !== postId);
        this.save(this.COMMENTS_KEY, this.comments);
        return true;
    }

    getPosts({ filter, sport, limit, offset } = {}) {
        let result = [...this.posts];

        if (filter === 'hot-takes') {
            result = result.filter(p => p.type === 'hot-take');
        } else if (filter === 'polls') {
            result = result.filter(p => p.type === 'poll');
        } else if (filter === 'following') {
            const user = this.getCurrentUser();
            if (user) {
                const following = user.social?.following || [];
                result = result.filter(p => following.includes(p.userId) || p.userId === user.id || p.userId === user.username);
            }
        }

        if (sport) {
            result = result.filter(p => p.sport === sport);
        }

        const start = offset || 0;
        const end = start + (limit || 50);
        return result.slice(start, end);
    }

    // ==================== LIKES ====================

    toggleLike(targetId, targetType) {
        const user = this.getCurrentUser();
        if (!user) throw new Error('Must be logged in');

        const uid = user.id || user.username;
        const existing = this.likes.findIndex(l => l.targetId === targetId && l.userId === uid);

        if (existing >= 0) {
            this.likes.splice(existing, 1);
            this.save(this.LIKES_KEY, this.likes);
            return false; // unliked
        } else {
            this.likes.push({
                targetId,
                targetType: targetType || 'post',
                userId: uid,
                username: user.username,
                createdAt: new Date().toISOString()
            });
            this.save(this.LIKES_KEY, this.likes);
            return true; // liked
        }
    }

    getLikeCount(targetId) {
        return this.likes.filter(l => l.targetId === targetId).length;
    }

    hasLiked(targetId) {
        const user = this.getCurrentUser();
        if (!user) return false;
        const uid = user.id || user.username;
        return this.likes.some(l => l.targetId === targetId && l.userId === uid);
    }

    // ==================== COMMENTS ====================

    addComment(postId, content) {
        const user = this.getCurrentUser();
        if (!user) throw new Error('Must be logged in');

        const comment = {
            id: 'cmt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            postId,
            userId: user.id || user.username,
            username: user.username,
            displayName: user.displayName || user.username,
            avatar: user.avatar || null,
            content,
            createdAt: new Date().toISOString()
        };

        this.comments.push(comment);
        this.save(this.COMMENTS_KEY, this.comments);
        return comment;
    }

    getComments(postId) {
        return this.comments
            .filter(c => c.postId === postId)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }

    getCommentCount(postId) {
        return this.comments.filter(c => c.postId === postId).length;
    }

    // ==================== POLLS ====================

    votePoll(postId, optionIndex) {
        const user = this.getCurrentUser();
        if (!user) throw new Error('Must be logged in');

        const post = this.posts.find(p => p.id === postId);
        if (!post || post.type !== 'poll') return null;

        const uid = user.id || user.username;
        if (post.pollVoters.includes(uid)) return null; // already voted

        post.pollOptions[optionIndex].votes++;
        post.pollVoters.push(uid);
        this.save(this.POSTS_KEY, this.posts);
        return post;
    }

    hasVotedPoll(postId) {
        const user = this.getCurrentUser();
        if (!user) return false;
        const uid = user.id || user.username;
        const post = this.posts.find(p => p.id === postId);
        return post ? post.pollVoters.includes(uid) : false;
    }

    // ==================== HELPERS ====================

    getCurrentUser() {
        // Check persistent auth
        if (typeof auth !== 'undefined' && auth.currentUser) {
            return auth.currentUser;
        }
        // Check session storage
        try {
            const session = localStorage.getItem('trustmyrecord_session');
            if (session) {
                const parsed = JSON.parse(session);
                return parsed.user || parsed;
            }
        } catch {}
        return null;
    }

    timeAgo(timestamp) {
        const d = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
        const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return d.toLocaleDateString();
    }

    // ==================== SEED DATA ====================

    ensureSeedData() {
        if (this.posts.length > 0) return;

        const seedPosts = [
            {
                id: 'seed_1',
                userId: 'user_betlegend',
                username: 'BetLegend',
                displayName: 'BetLegend',
                avatar: null,
                type: 'hot-take',
                content: 'The Thunder are winning it all this year. OKC repeats. Book it.',
                sport: 'NBA',
                tags: ['NBA', 'Thunder', 'Finals'],
                pollOptions: null,
                pollVoters: [],
                createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                pinned: false
            },
            {
                id: 'seed_2',
                userId: 'user_betlegend',
                username: 'BetLegend',
                displayName: 'BetLegend',
                avatar: null,
                type: 'poll',
                content: 'Who wins the AL East in 2026?',
                sport: 'MLB',
                tags: ['MLB', 'AL East'],
                pollOptions: [
                    { text: 'Yankees', votes: 3 },
                    { text: 'Orioles', votes: 5 },
                    { text: 'Blue Jays', votes: 2 },
                    { text: 'Red Sox', votes: 1 }
                ],
                pollVoters: ['seed_voter_1', 'seed_voter_2', 'seed_voter_3', 'seed_voter_4', 'seed_voter_5', 'seed_voter_6', 'seed_voter_7', 'seed_voter_8', 'seed_voter_9', 'seed_voter_10', 'seed_voter_11'],
                createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
                pinned: false
            },
            {
                id: 'seed_3',
                userId: 'user_demo',
                username: 'demo',
                displayName: 'Demo User',
                avatar: null,
                type: 'post',
                content: 'Just went 4-1 on NBA last night. The under on Pacers/Hornets was free money. Back at it tonight with some NHL plays.',
                sport: 'NBA',
                tags: ['NBA', 'Winning'],
                pollOptions: null,
                pollVoters: [],
                createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
                pinned: false
            },
            {
                id: 'seed_4',
                userId: 'user_demo',
                username: 'demo',
                displayName: 'Demo User',
                avatar: null,
                type: 'hot-take',
                content: 'Sasaki is going to be the best pitcher in baseball by the All-Star break. The Dodgers rotation is unfair.',
                sport: 'MLB',
                tags: ['MLB', 'Dodgers', 'Sasaki'],
                pollOptions: null,
                pollVoters: [],
                createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
                pinned: false
            },
            {
                id: 'seed_5',
                userId: 'user_admin_default',
                username: 'admin',
                displayName: 'Admin',
                avatar: null,
                type: 'post',
                content: 'Welcome to TrustMyRecord! Post your takes, track your picks, and prove you know your stuff. Your record speaks for itself.',
                sport: null,
                tags: ['Welcome'],
                pollOptions: null,
                pollVoters: [],
                createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                pinned: true
            }
        ];

        // Add seed likes
        const seedLikes = [
            { targetId: 'seed_1', targetType: 'post', userId: 'user_demo', username: 'demo', createdAt: new Date().toISOString() },
            { targetId: 'seed_1', targetType: 'post', userId: 'user_admin_default', username: 'admin', createdAt: new Date().toISOString() },
            { targetId: 'seed_3', targetType: 'post', userId: 'user_betlegend', username: 'BetLegend', createdAt: new Date().toISOString() },
            { targetId: 'seed_5', targetType: 'post', userId: 'user_betlegend', username: 'BetLegend', createdAt: new Date().toISOString() },
            { targetId: 'seed_5', targetType: 'post', userId: 'user_demo', username: 'demo', createdAt: new Date().toISOString() },
        ];

        // Add seed comments
        const seedComments = [
            { id: 'scmt_1', postId: 'seed_1', userId: 'user_demo', username: 'demo', displayName: 'Demo User', avatar: null, content: 'SGA is a monster. Hard to argue with this take.', createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() },
            { id: 'scmt_2', postId: 'seed_3', userId: 'user_betlegend', username: 'BetLegend', displayName: 'BetLegend', avatar: null, content: 'Nice run! What NHL plays are you looking at?', createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString() },
        ];

        this.posts = seedPosts;
        this.likes = seedLikes;
        this.comments = seedComments;
        this.save(this.POSTS_KEY, this.posts);
        this.save(this.LIKES_KEY, this.likes);
        this.save(this.COMMENTS_KEY, this.comments);
    }
}

// Global instance
const socialFeed = new SocialFeedEngine();
if (typeof window !== 'undefined') {
    window.socialFeed = socialFeed;
}
