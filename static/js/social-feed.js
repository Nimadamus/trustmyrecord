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
        this.pruneSeedData();
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
        if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.postCreated({ post_type: post.type, sport: post.sport, has_tags: (tags && tags.length > 0) });
        if (post.type === 'poll' && typeof TMRAnalytics !== 'undefined') TMRAnalytics.forumThreadCreated({ post_type: 'poll', sport: post.sport, thread_id: post.id });
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
            if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.postLiked({ post_id: targetId });
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
        if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.commentAdded({ post_id: postId });
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
        if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.pollVoted({ poll_id: postId, sport: post.sport });
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

    pruneSeedData() {
        const isSeedPost = (post) => post && typeof post.id === 'string' && post.id.indexOf('seed_') === 0;
        const isSeedLike = (like) => like && typeof like.targetId === 'string' && like.targetId.indexOf('seed_') === 0;
        const isSeedComment = (comment) => comment && ((typeof comment.id === 'string' && comment.id.indexOf('scmt_') === 0) || (typeof comment.postId === 'string' && comment.postId.indexOf('seed_') === 0));

        const nextPosts = this.posts.filter(post => !isSeedPost(post));
        const nextLikes = this.likes.filter(like => !isSeedLike(like) && String(like.userId || '').toLowerCase() !== 'user_demo');
        const nextComments = this.comments.filter(comment => !isSeedComment(comment) && String(comment.userId || '').toLowerCase() !== 'user_demo');

        if (nextPosts.length !== this.posts.length || nextLikes.length !== this.likes.length || nextComments.length !== this.comments.length) {
            this.posts = nextPosts;
            this.likes = nextLikes;
            this.comments = nextComments;
            this.save(this.POSTS_KEY, this.posts);
            this.save(this.LIKES_KEY, this.likes);
            this.save(this.COMMENTS_KEY, this.comments);
        }
    }
}

// Global instance
const socialFeed = new SocialFeedEngine();
if (typeof window !== 'undefined') {
    window.socialFeed = socialFeed;
}
