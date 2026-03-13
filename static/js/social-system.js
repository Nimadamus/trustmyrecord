// Complete Social System for Trust My Record
// Followers, Following, Friends, User Discovery, Activity Feed

class SocialSystem {
    constructor() {
        this.USERS_KEY = 'trustmyrecord_users';
        this.FOLLOW_REQUESTS_KEY = 'tmr_follow_requests';
        this.ACTIVITY_KEY = 'tmr_social_activity';
        this.BLOCKED_KEY = 'tmr_blocked_users';
        this.PRIVACY_KEY = 'tmr_privacy_settings';
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        const userStr = localStorage.getItem('trustmyrecord_current_user');
        if (!userStr) return null;
        try {
            return JSON.parse(userStr);
        } catch {
            return null;
        }
    }

    /**
     * Get all users
     */
    getAllUsers() {
        return JSON.parse(localStorage.getItem(this.USERS_KEY) || '[]');
    }

    /**
     * Get user by username
     */
    getUser(username) {
        const users = this.getAllUsers();
        return users.find(u => u.username === username);
    }

    /**
     * Save users array
     */
    saveUsers(users) {
        localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
    }

    /**
     * Follow a user
     */
    followUser(targetUsername) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) {
            return { success: false, error: 'Not logged in' };
        }

        if (currentUser.username === targetUsername) {
            return { success: false, error: 'Cannot follow yourself' };
        }

        const users = this.getAllUsers();
        const currentIndex = users.findIndex(u => u.username === currentUser.username);
        const targetIndex = users.findIndex(u => u.username === targetUsername);

        if (currentIndex === -1 || targetIndex === -1) {
            return { success: false, error: 'User not found' };
        }

        // Check if already following
        if (!users[currentIndex].social) {
            users[currentIndex].social = { followers: [], following: [], reputation: 0, badges: [] };
        }
        if (!users[targetIndex].social) {
            users[targetIndex].social = { followers: [], following: [], reputation: 0, badges: [] };
        }

        if (users[currentIndex].social.following.includes(targetUsername)) {
            return { success: false, error: 'Already following this user' };
        }

        // Add to following
        users[currentIndex].social.following.push(targetUsername);
        
        // Add to target's followers
        users[targetIndex].social.followers.push(currentUser.username);

        // Update timestamps
        users[currentIndex].updated_at = new Date().toISOString();
        users[targetIndex].updated_at = new Date().toISOString();

        this.saveUsers(users);

        // Create activity
        this.createActivity('follow', currentUser.username, { target: targetUsername });

        // Check if mutual follow (new friendship)
        const isNowFriends = users[targetIndex].social.following.includes(currentUser.username);
        if (isNowFriends) {
            this.createActivity('new_friendship', currentUser.username, { 
                target: targetUsername,
                mutual: true 
            });
        }

        return { 
            success: true, 
            isMutual: isNowFriends,
            followingCount: users[currentIndex].social.following.length,
            followersCount: users[targetIndex].social.followers.length
        };
    }

    /**
     * Unfollow a user
     */
    unfollowUser(targetUsername) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) {
            return { success: false, error: 'Not logged in' };
        }

        const users = this.getAllUsers();
        const currentIndex = users.findIndex(u => u.username === currentUser.username);
        const targetIndex = users.findIndex(u => u.username === targetUsername);

        if (currentIndex === -1 || targetIndex === -1) {
            return { success: false, error: 'User not found' };
        }

        // Remove from following
        if (users[currentIndex].social?.following) {
            users[currentIndex].social.following = users[currentIndex].social.following
                .filter(u => u !== targetUsername);
        }

        // Remove from target's followers
        if (users[targetIndex].social?.followers) {
            users[targetIndex].social.followers = users[targetIndex].social.followers
                .filter(u => u !== currentUser.username);
        }

        this.saveUsers(users);

        return { 
            success: true,
            followingCount: users[currentIndex].social?.following?.length || 0,
            followersCount: users[targetIndex].social?.followers?.length || 0
        };
    }

    /**
     * Get followers for a user
     */
    getFollowers(username) {
        const user = this.getUser(username);
        if (!user || !user.social?.followers) return [];

        return user.social.followers.map(followerUsername => {
            const follower = this.getUser(followerUsername);
            if (!follower) return null;

            // Check if mutual (follows back)
            const isMutual = follower.social?.following?.includes(username);

            return {
                username: follower.username,
                displayName: follower.displayName || follower.username,
                bio: follower.bio || '',
                isMutual,
                isFollowing: true
            };
        }).filter(Boolean);
    }

    /**
     * Get following for a user
     */
    getFollowing(username) {
        const user = this.getUser(username);
        if (!user || !user.social?.following) return [];

        const currentUser = this.getCurrentUser();

        return user.social.following.map(followingUsername => {
            const following = this.getUser(followingUsername);
            if (!following) return null;

            // Check if they follow back
            const followsBack = following.social?.followers?.includes(username);
            
            // Check if current user follows them
            const amIFollowing = currentUser && currentUser.username !== username ?
                this.isFollowing(currentUser.username, followingUsername) : false;

            return {
                username: following.username,
                displayName: following.displayName || following.username,
                bio: following.bio || '',
                followsBack,
                amIFollowing
            };
        }).filter(Boolean);
    }

    /**
     * Get friends (mutual follows)
     */
    getFriends(username) {
        const user = this.getUser(username);
        if (!user || !user.social) return [];

        const following = user.social.following || [];
        const followers = user.social.followers || [];

        // Friends = intersection
        const friendUsernames = following.filter(f => followers.includes(f));

        return friendUsernames.map(friendUsername => {
            const friend = this.getUser(friendUsername);
            if (!friend) return null;

            return {
                username: friend.username,
                displayName: friend.displayName || friend.username,
                bio: friend.bio || '',
                isFriend: true,
                isOnline: this.isUserOnline(friend.username)
            };
        }).filter(Boolean);
    }

    /**
     * Check if user A follows user B
     */
    isFollower(followerUsername, targetUsername) {
        const target = this.getUser(targetUsername);
        if (!target || !target.social?.followers) return false;
        return target.social.followers.includes(followerUsername);
    }

    /**
     * Check if user A follows user B
     */
    isFollowing(followerUsername, targetUsername) {
        const follower = this.getUser(followerUsername);
        if (!follower || !follower.social?.following) return false;
        return follower.social.following.includes(targetUsername);
    }

    /**
     * Check if two users are friends (mutual)
     */
    areFriends(username1, username2) {
        return this.isFollowing(username1, username2) && this.isFollowing(username2, username1);
    }

    /**
     * Search users
     */
    searchUsers(query, filters = {}) {
        const users = this.getAllUsers();
        const currentUser = this.getCurrentUser();
        const searchLower = query.toLowerCase();

        return users
            .filter(user => {
                // Exclude current user
                if (currentUser && user.username === currentUser.username) return false;

                // Search in username, display name, bio
                const matches = 
                    user.username.toLowerCase().includes(searchLower) ||
                    (user.displayName && user.displayName.toLowerCase().includes(searchLower)) ||
                    (user.bio && user.bio.toLowerCase().includes(searchLower));

                if (!matches) return false;

                // Apply filters
                if (filters.minFollowers && (user.social?.followers?.length || 0) < filters.minFollowers) {
                    return false;
                }

                if (filters.verifiedOnly && !user.verified) {
                    return false;
                }

                return true;
            })
            .map(user => ({
                username: user.username,
                displayName: user.displayName || user.username,
                bio: user.bio || '',
                followers: user.social?.followers?.length || 0,
                following: user.social?.following?.length || 0,
                verified: user.verified || false,
                isFollowing: currentUser ? this.isFollowing(currentUser.username, user.username) : false
            }))
            .sort((a, b) => b.followers - a.followers);
    }

    /**
     * Get suggested users to follow
     */
    getSuggestedUsers(limit = 10) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return [];

        const users = this.getAllUsers();
        const myFollowing = currentUser.social?.following || [];

        // Find users who are followed by people I follow (friend-of-friend)
        const suggestions = new Map();

        myFollowing.forEach(followingUsername => {
            const following = this.getUser(followingUsername);
            if (following && following.social?.following) {
                following.social.following.forEach(theirFollowing => {
                    if (theirFollowing !== currentUser.username && !myFollowing.includes(theirFollowing)) {
                        const count = suggestions.get(theirFollowing) || 0;
                        suggestions.set(theirFollowing, count + 1);
                    }
                });
            }
        });

        // Sort by number of mutual connections
        return Array.from(suggestions.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([username, mutualCount]) => {
                const user = this.getUser(username);
                return user ? {
                    username: user.username,
                    displayName: user.displayName || user.username,
                    bio: user.bio || '',
                    mutualCount,
                    followers: user.social?.followers?.length || 0
                } : null;
            })
            .filter(Boolean);
    }

    /**
     * Get trending users (most new followers in last 7 days)
     */
    getTrendingUsers(limit = 10) {
        const users = this.getAllUsers();
        const currentUser = this.getCurrentUser();

        return users
            .filter(u => !currentUser || u.username !== currentUser.username)
            .map(user => ({
                username: user.username,
                displayName: user.displayName || user.username,
                followers: user.social?.followers?.length || 0,
                isFollowing: currentUser ? this.isFollowing(currentUser.username, user.username) : false
            }))
            .sort((a, b) => b.followers - a.followers)
            .slice(0, limit);
    }

    /**
     * Create a social activity entry
     */
    createActivity(type, username, data = {}) {
        const activities = JSON.parse(localStorage.getItem(this.ACTIVITY_KEY) || '[]');
        
        const activity = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            type,
            username,
            data,
            timestamp: new Date().toISOString(),
            visibility: data.visibility || 'public'
        };

        activities.unshift(activity);

        // Keep only last 1000 activities
        if (activities.length > 1000) {
            activities.pop();
        }

        localStorage.setItem(this.ACTIVITY_KEY, JSON.stringify(activities));
        return activity;
    }

    /**
     * Get activity feed for a user
     */
    getActivityFeed(username, options = {}) {
        const { limit = 50, types = [], includeOwn = false } = options;
        const activities = JSON.parse(localStorage.getItem(this.ACTIVITY_KEY) || '[]');
        
        // Get user's following
        const user = this.getUser(username);
        const following = user?.social?.following || [];

        return activities
            .filter(a => {
                // Include activities from followed users
                if (following.includes(a.username)) return true;
                // Include own activities if requested
                if (includeOwn && a.username === username) return true;
                // Include activities about the user
                if (a.data.target === username) return true;
                return false;
            })
            .filter(a => types.length === 0 || types.includes(a.type))
            .slice(0, limit);
    }

    /**
     * Get recent picks from followed users
     */
    getFollowingPicks(username, limit = 20) {
        const user = this.getUser(username);
        if (!user) return [];

        const following = user.social?.following || [];
        const allPicks = JSON.parse(localStorage.getItem('tmr_picks') || '[]');

        return allPicks
            .filter(p => following.includes(p.user_id || p.username))
            .sort((a, b) => new Date(b.locked_at || b.created_at) - new Date(a.locked_at || a.created_at))
            .slice(0, limit)
            .map(pick => {
                const picker = this.getUser(pick.user_id || pick.username);
                return {
                    ...pick,
                    picker: {
                        username: picker?.username || pick.user_id,
                        displayName: picker?.displayName || picker?.username || pick.user_id
                    }
                };
            });
    }

    /**
     * Block a user
     */
    blockUser(targetUsername) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return { success: false, error: 'Not logged in' };

        const blocked = JSON.parse(localStorage.getItem(this.BLOCKED_KEY) || '{}');
        if (!blocked[currentUser.username]) {
            blocked[currentUser.username] = [];
        }

        if (!blocked[currentUser.username].includes(targetUsername)) {
            blocked[currentUser.username].push(targetUsername);
            localStorage.setItem(this.BLOCKED_KEY, JSON.stringify(blocked));
        }

        // Unfollow each other
        this.unfollowUser(targetUsername);
        
        // Remove from followers (other person unfollows current user)
        const users = this.getAllUsers();
        const targetIndex = users.findIndex(u => u.username === targetUsername);
        if (targetIndex !== -1 && users[targetIndex].social?.following) {
            users[targetIndex].social.following = users[targetIndex].social.following
                .filter(u => u !== currentUser.username);
            this.saveUsers(users);
        }

        return { success: true };
    }

    /**
     * Unblock a user
     */
    unblockUser(targetUsername) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return { success: false, error: 'Not logged in' };

        const blocked = JSON.parse(localStorage.getItem(this.BLOCKED_KEY) || '{}');
        if (blocked[currentUser.username]) {
            blocked[currentUser.username] = blocked[currentUser.username]
                .filter(u => u !== targetUsername);
            localStorage.setItem(this.BLOCKED_KEY, JSON.stringify(blocked));
        }

        return { success: true };
    }

    /**
     * Check if user is blocked
     */
    isBlocked(blocker, blocked) {
        const blockedList = JSON.parse(localStorage.getItem(this.BLOCKED_KEY) || '{}');
        return blockedList[blocker]?.includes(blocked) || false;
    }

    /**
     * Get user statistics
     */
    getUserSocialStats(username) {
        const user = this.getUser(username);
        if (!user) return null;

        const following = user.social?.following || [];
        const followers = user.social?.followers || [];

        // Calculate friends (mutual)
        const friends = following.filter(f => followers.includes(f));

        return {
            username,
            following: following.length,
            followers: followers.length,
            friends: friends.length,
            ratio: followers.length > 0 ? (following.length / followers.length).toFixed(2) : following.length,
            isFollowing: false, // Will be set by caller if needed
            isFollower: false
        };
    }

    /**
     * Track user online status (simplified)
     */
    updateOnlineStatus() {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return;

        const onlineKey = 'tmr_online_users';
        const online = JSON.parse(localStorage.getItem(onlineKey) || '{}');
        
        online[currentUser.username] = {
            lastSeen: new Date().toISOString(),
            isOnline: true
        };

        localStorage.setItem(onlineKey, JSON.stringify(online));
    }

    /**
     * Check if user is online (active in last 5 minutes)
     */
    isUserOnline(username) {
        const online = JSON.parse(localStorage.getItem('tmr_online_users') || '{}');
        const userStatus = online[username];
        
        if (!userStatus) return false;

        const lastSeen = new Date(userStatus.lastSeen);
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        
        return lastSeen > fiveMinutesAgo;
    }
}

// Create global instance
const socialSystem = new SocialSystem();

// Auto-update online status
setInterval(() => {
    socialSystem.updateOnlineStatus();
}, 60000); // Every minute
