/* Feed UI override: render real backend activity as compact social timeline cards. */
function feedId(value) {
    return String(value == null ? '' : value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function jsArg(value) {
    return "'" + String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function getDisplayName(item) {
    return item.display_name || item.displayName || item.creator_display_name || item.user_display_name || item.username || item.creator_username || 'User';
}

function getUsername(item) {
    return item.username || item.creator_username || item.user_username || item.handle || '';
}

function getAvatarHtml(item, className) {
    const display = getDisplayName(item);
    const src = item.avatar_url || item.avatar || item.profile_image || item.profile_image_url || item.user_avatar_url;
    if (src) {
        return '<div class="' + className + '"><img src="' + esc(src) + '" alt="' + esc(display) + ' avatar" loading="lazy"></div>';
    }
    return '<div class="' + className + '">' + esc((display || '?')[0].toUpperCase()) + '</div>';
}

function getRecordText(item) {
    const raw = item.record || item.public_record || item.user_record;
    if (raw) return String(raw);
    const wins = item.wins ?? item.user_wins;
    const losses = item.losses ?? item.user_losses;
    const pushes = item.pushes ?? item.user_pushes;
    const units = item.net_units ?? item.user_net_units ?? item.units_profit;
    const winRate = item.win_rate ?? item.user_win_rate;
    if (wins != null || losses != null || pushes != null) {
        const record = pushes != null && Number(pushes) > 0 ? [wins || 0, losses || 0, pushes || 0].join('-') : [wins || 0, losses || 0].join('-');
        const unitsNum = Number(units || 0);
        return record + ', ' + (unitsNum >= 0 ? '+' : '') + unitsNum.toFixed(2) + 'u' + (winRate != null ? ', ' + Number(winRate).toFixed(1) + '%' : '');
    }
    return 'public record pending';
}

function getSportOrTeam(item) {
    const sport = formatSport(item.sport || item.sport_key || item.league || item.primary_sport);
    return esc(sport || 'Verified record');
}

function renderFeedHeader(item, actionHtml) {
    const username = getUsername(item);
    const display = getDisplayName(item);
    const profile = username ? '/profile/?user=' + encodeURIComponent(username) : '/handicappers/';
    return '<div class="fi-header">' +
        getAvatarHtml(item, 'fi-avatar') +
        '<div class="fi-meta">' +
            '<div class="fi-top-row">' +
                '<span class="fi-name"><a href="' + profile + '">' + esc(display) + '</a></span>' +
                (username ? '<span class="fi-handle">@' + esc(username) + '</span>' : '') +
                '<span class="fi-dot">&bull;</span>' +
                '<span class="fi-time">' + esc(timeAgo(item.created_at || item.locked_at || item.graded_at || item.updated_at)) + '</span>' +
            '</div>' +
            '<div class="fi-user-subline">' +
                '<span class="fi-sport">' + getSportOrTeam(item) + '</span>' +
                '<span class="fi-dot">&bull;</span>' +
                '<span class="fi-record">Record: ' + esc(getRecordText(item)) + '</span>' +
            '</div>' +
        '</div>' +
    '</div>' +
    '<div class="fi-action-label">' + actionHtml + '</div>';
}

function renderActionRow(itemId, type, liked, likesCount, commentsCount, includeReply) {
    const likeFn = type === 'pick' ? 'likePick' : 'likeFeedPost';
    const idArg = jsArg(itemId);
    const typeArg = jsArg(type);
    return '<div class="fi-actions">' +
        '<button class="fi-action ' + (liked ? 'is-liked liked' : '') + '" onclick="' + likeFn + '(' + idArg + ', this)"><i class="fas fa-heart"></i> Like <span>' + (Number(likesCount) || 0) + '</span></button>' +
        '<button class="fi-action" onclick="toggleComments(' + idArg + ', ' + typeArg + ')"><i class="fas fa-comment"></i> Comment <span>' + (Number(commentsCount) || 0) + '</span></button>' +
        (includeReply ? '<button class="fi-action" onclick="toggleComments(' + idArg + ', ' + typeArg + ')"><i class="fas fa-reply"></i> Reply</button>' : '') +
        '<button class="fi-action" onclick="sharePost(' + idArg + ')"><i class="fas fa-share"></i> Share</button>' +
    '</div>' +
    '<div class="comments-section" id="cs-' + (type === 'pick' ? 'pick' : 'fp') + '-' + feedId(itemId) + '"></div>';
}

function normalizePickStatus(item) {
    return String(item.status || item.result || item.pick_status || '').toLowerCase();
}

function renderPickCard(item) {
    const id = item.pick_id || item.id || item.item_id;
    const status = normalizePickStatus(item);
    const isPending = status === 'pending' || status === 'locked';
    const count = Number(item.pick_count || item.count || 1);
    const action = isPending
        ? '<i class="fas fa-lock"></i> Submitted locked picks'
        : '<i class="fas fa-clipboard-check"></i> Picks graded';
    let body;
    if (isPending) {
        body = '<div class="pick-embed is-private">' +
            '<div class="pe-row"><span class="pe-chip is-sport"><i class="fas fa-lock"></i> Status: Awaiting grade</span><span class="pe-chip">' + count + ' locked pick' + (count === 1 ? '' : 's') + '</span></div>' +
            '<div class="pe-team">Pick details hidden until eligible for public record.</div>' +
        '</div>';
    } else {
        body = '<div class="pick-embed">' +
            '<div class="pe-row">' +
                '<span class="pe-chip is-sport">Verified record update</span>' +
                '<span class="pe-chip is-won">' + count + ' pick' + (count === 1 ? '' : 's') + ' graded</span>' +
            '</div>' +
            '<div class="pe-team">Verified record updated.</div>' +
            '<div style="margin-top:5px;color:var(--text-muted);font-size:0.86rem;">Current record: ' + esc(getRecordText(item)) + '</div>' +
            '<div style="margin-top:8px;color:var(--text-secondary);font-size:0.82rem;">Pick details hidden until eligible for public record.</div>' +
        '</div>';
    }

    return '<div class="feed-item" data-id="' + esc(id) + '" data-type="pick">' +
        renderFeedHeader(item, action) +
        body +
        renderActionRow(id, 'pick', item.liked_by_user || item.user_liked, item.likes_count, item.comments_count, false) +
    '</div>';
}

function renderTextPost(item) {
    const id = item.post_id || item.id || item.item_id;
    const isHotTake = String(item.post_type || '').toLowerCase() === 'hot_take' || String(item.type || '').toLowerCase() === 'hot-take';
    const action = isHotTake ? '<i class="fas fa-fire"></i> posted a hot take' : '<i class="fas fa-pen"></i> posted';
    return '<div class="feed-item" data-id="' + esc(id) + '" data-type="feed_post">' +
        renderFeedHeader(item, action) +
        '<div class="fi-content">' + esc(item.content || item.body || item.text || '') + '</div>' +
        renderActionRow(id, 'feed_post', item.liked_by_user || item.user_liked, item.likes_count, item.comments_count, true) +
    '</div>';
}

function renderPollCard(item) {
    const id = item.poll_id || item.id || item.item_id;
    const opts = Array.isArray(item.options) ? item.options : [];
    const total = Number(item.total_votes || item.votes_count || 0);
    const optionsHtml = opts.length
        ? opts.map((opt, idx) => {
            const optionId = opt.id || opt.option_id || idx;
            const votes = Number(opt.votes || opt.vote_count || 0);
            const pct = total > 0 ? Math.round(votes / total * 100) : 0;
            return '<button class="poll-option" onclick="votePoll(' + jsArg(id) + ', ' + jsArg(optionId) + ')"><span>' + esc(opt.text || opt.label || ('Option ' + (idx + 1))) + '</span><strong>' + pct + '%</strong></button>';
        }).join('')
        : '<div style="color:var(--text-muted);font-size:0.86rem;">Poll options are not available.</div>';
    return '<div class="feed-item" data-id="' + esc(id) + '" data-type="feed_post">' +
        renderFeedHeader(item, '<i class="fas fa-square-poll-vertical"></i> created a poll') +
        '<div class="fi-content">' + esc(item.content || item.title || '') + '</div>' +
        '<div class="pick-embed"><div style="display:grid;gap:8px;">' + optionsHtml + '</div><div style="margin-top:9px;color:var(--text-muted);font-size:0.78rem;">' + total + ' vote' + (total === 1 ? '' : 's') + '</div></div>' +
        renderActionRow(id, 'feed_post', item.liked_by_user || item.user_liked, item.likes_count, item.comments_count, true) +
    '</div>';
}

function renderActivityCard(item) {
    const type = item.notif_type || item.activity_type || item.type || 'activity';
    const labels = {
        pick_graded: '<i class="fas fa-clipboard-check"></i> pick was graded',
        challenge_joined: '<i class="fas fa-trophy"></i> joined a challenge',
        challenge_won: '<i class="fas fa-trophy"></i> won a challenge',
        challenge_lost: '<i class="fas fa-trophy"></i> lost a challenge',
        trivia_created: '<i class="fas fa-question-circle"></i> created trivia',
        trivia_answered: '<i class="fas fa-question-circle"></i> answered trivia',
        comment_created: '<i class="fas fa-comment"></i> commented on a feed item',
        reply_created: '<i class="fas fa-reply"></i> replied to a post'
    };
    return '<div class="feed-item" data-id="' + esc(item.item_id || item.id || '') + '" data-type="activity">' +
        renderFeedHeader(item, labels[type] || '<i class="fas fa-bell"></i> public activity') +
        '<div class="fi-content">' + esc(item.content || item.message || '') + '</div>' +
    '</div>';
}

function renderPollActivityCard(item) {
    item.post_type = 'poll';
    return renderPollCard(item);
}

function renderTriviaActivityCard(item) {
    return '<div class="feed-item" data-id="' + esc(item.item_id || item.id || '') + '" data-type="trivia_activity">' +
        renderFeedHeader(item, '<i class="fas fa-question-circle"></i> created trivia') +
        '<div class="fi-content">' + esc(item.content || item.title || 'Trivia activity') + '</div>' +
    '</div>';
}

function openModal(type) {
    const modal = document.getElementById(type + 'Modal');
    if (modal) {
        closeModals();
        modal.classList.add('show');
        return;
    }
    window.location.href = type === 'signup' ? '/register/' : '/login/';
}

async function toggleComments(id, type) {
    const normalizedType = type === 'pick' ? 'pick' : 'feed_post';
    const elId = normalizedType === 'pick' ? 'cs-pick-' + feedId(id) : 'cs-fp-' + feedId(id);
    const el = document.getElementById(elId);
    if (!el) return;

    if (el.classList.contains('show')) {
        el.classList.remove('show');
        return;
    }

    el.classList.add('show');
    el.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:0.85rem;">Loading comments...</div>';

    try {
        const endpoint = normalizedType === 'pick' ? '/picks/' + encodeURIComponent(id) + '/comments' : '/feed/' + encodeURIComponent(id) + '/comments';
        const data = await api.request(endpoint);
        const comments = data.comments || [];
        const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
        let html = '';

        if (user) {
            html += '<div class="cmt-input-row">' +
                '<input class="cmt-input" id="ci-' + normalizedType + '-' + feedId(id) + '" placeholder="Write a comment..." onkeypress="if(event.key===\'Enter\')postComment(' + jsArg(id) + ',' + jsArg(normalizedType) + ')">' +
                '<button class="cmt-submit" onclick="postComment(' + jsArg(id) + ',' + jsArg(normalizedType) + ')">Post</button>' +
            '</div>';
        }

        if (comments.length) {
            html += comments.map(c => {
                const username = c.username || '';
                return '<div class="cmt-item">' +
                    '<div class="cmt-avatar">' + esc((c.display_name || c.username || '?')[0].toUpperCase()) + '</div>' +
                    '<div class="cmt-body">' +
                        '<div class="cmt-author"><a href="/profile/?user=' + encodeURIComponent(username) + '">' + esc(c.display_name || c.username || 'User') + '</a></div>' +
                        '<div class="cmt-text">' + esc(c.content) + '</div>' +
                        '<div class="cmt-time">' + esc(timeAgo(c.created_at)) + '</div>' +
                    '</div>' +
                '</div>';
            }).join('');
        } else {
            html += '<div style="padding:8px 12px;color:var(--text-muted);font-size:0.85rem;">No comments yet</div>';
        }

        el.innerHTML = html;
    } catch(e) {
        el.innerHTML = '<div style="padding:12px;color:var(--accent-red);font-size:0.85rem;">Failed to load comments</div>';
    }
}

async function postComment(id, type) {
    const normalizedType = type === 'pick' ? 'pick' : 'feed_post';
    const input = document.getElementById('ci-' + normalizedType + '-' + feedId(id));
    if (!input || !input.value.trim()) return;

    try {
        const endpoint = normalizedType === 'pick' ? '/picks/' + encodeURIComponent(id) + '/comment' : '/feed/' + encodeURIComponent(id) + '/comment';
        await api.request(endpoint, { method: 'POST', body: { content: input.value.trim() } });
        input.value = '';
        const elId = normalizedType === 'pick' ? 'cs-pick-' + feedId(id) : 'cs-fp-' + feedId(id);
        const el = document.getElementById(elId);
        if (el) el.classList.remove('show');
        toggleComments(id, normalizedType);
    } catch(e) {
        alert('Failed to post comment');
    }
}

async function initAuth() {
    if (typeof api !== 'undefined' && api.ready) {
        try {
            await Promise.race([
                api.ready,
                new Promise(resolve => setTimeout(resolve, 2500))
            ]);
        } catch(e) {}
    }
    const user = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
    viewerUser = user;
    const composerCard = document.getElementById('composerCard');
    const loginBanner = document.getElementById('loginBanner');
    const compAvatar = document.getElementById('compAvatar');

    if (user) {
        if (loginBanner) loginBanner.style.display = 'none';
        if (composerCard) composerCard.style.display = 'block';
        if (compAvatar) {
            const avatar = user.avatar_url || user.avatar || user.profile_image_url;
            if (avatar) compAvatar.innerHTML = '<img src="' + esc(avatar) + '" alt="' + esc(user.username || 'User') + ' avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
            else compAvatar.textContent = (user.displayName || user.display_name || user.username || '?')[0].toUpperCase();
        }
        loadSidebarStats(user);
        await hydrateFollowingState();
    } else {
        if (composerCard) composerCard.style.display = 'none';
        if (loginBanner) loginBanner.style.display = 'flex';
    }

    const compInput = document.getElementById('compInput');
    const postBtn = document.getElementById('postBtn');
    if (compInput && postBtn) {
        compInput.addEventListener('input', function(e) {
            postBtn.disabled = e.target.value.trim().length === 0;
        });
    }
}

function normalizePublicPick(item) {
    return {
        item_id: item.item_id || item.id || item.pick_id,
        item_type: 'pick',
        post_type: 'pick',
        pick_id: item.pick_id || item.id || item.item_id,
        status: item.status || item.pick_status,
        sport: item.sport || item.pick_sport_key || item.sport_key,
        username: item.username,
        display_name: item.display_name,
        avatar_url: item.avatar_url,
        user_id: item.user_id,
        likes_count: item.likes_count,
        comments_count: item.comments_count,
        liked_by_user: item.liked_by_user,
        graded_at: item.graded_at || item.grade_verified_at,
        created_at: item.graded_at || item.grade_verified_at || item.created_at || item.locked_at
    };
}

async function fetchPublicUsersByName(names) {
    const out = {};
    const unique = Array.from(new Set((names || []).filter(Boolean)));
    await Promise.all(unique.map(async username => {
        try {
            const data = await api.request('/users/' + encodeURIComponent(username));
            if (data && data.user) out[username] = data.user;
        } catch(e) {}
    }));
    return out;
}

function attachUserRecord(item, user) {
    if (!user) return item;
    return {
        ...item,
        avatar_url: item.avatar_url || user.avatar_url,
        primary_sport: item.primary_sport || (Array.isArray(user.favorite_sports) ? user.favorite_sports[0] : null),
        wins: user.wins,
        losses: user.losses,
        pushes: user.pushes,
        net_units: user.net_units,
        win_rate: user.win_rate
    };
}

function pickActivityBucket(item) {
    const status = normalizePickStatus(item);
    if (status === 'pending' || status === 'locked') return 'locked';
    return 'graded';
}

function aggregateFeedItems(items) {
    const nonPicks = [];
    const pickGroups = new Map();
    items.forEach(item => {
        const isPick = item.item_type === 'pick' || item.post_type === 'pick' || item.post_type === 'pick_share';
        if (!isPick) {
            nonPicks.push(item);
            return;
        }
        const username = getUsername(item) || String(item.user_id || 'user');
        const day = new Date(item.graded_at || item.created_at || item.locked_at || Date.now()).toISOString().slice(0, 10);
        const bucket = pickActivityBucket(item);
        const key = username + '|' + bucket + '|' + day;
        const existing = pickGroups.get(key);
        if (!existing) {
            pickGroups.set(key, {
                ...item,
                item_id: 'pick_group_' + feedId(key),
                pick_id: 'pick_group_' + feedId(key),
                pick_count: 1,
                status: bucket === 'locked' ? 'pending' : 'graded'
            });
            return;
        }
        existing.pick_count += 1;
        const existingTime = new Date(existing.graded_at || existing.created_at || 0).getTime();
        const itemTime = new Date(item.graded_at || item.created_at || 0).getTime();
        if (itemTime > existingTime) {
            existing.created_at = item.created_at;
            existing.graded_at = item.graded_at;
        }
    });
    return [...pickGroups.values(), ...nonPicks];
}

async function loadFeed() {
    const c = document.getElementById('feedList');
    if (!c) return;

    let items = [];
    try {
        if (api && typeof api.request === 'function') {
            const filterParam = currentFilter === 'hot-takes' ? 'posts' : currentFilter;
            const data = await api.request('/feed?limit=' + FEED_LIMIT + '&offset=' + feedOffset + '&filter=' + encodeURIComponent(filterParam));
            items = (data.feed || []).map(item => {
                if (item.item_type === 'pick' || item.post_type === 'pick' || item.post_type === 'pick_share') return normalizePublicPick(item);
                return item;
            });

            if (currentFilter === 'all' || currentFilter === 'picks') {
                try {
                    const discover = await api.request('/social/discover?limit=12');
                    const picks = (discover.picks || [])
                        .filter(p => p && p.is_public !== false && !p.is_private && !['pending', 'locked'].includes(String(p.status || '').toLowerCase()))
                        .map(normalizePublicPick);
                    const seen = new Map(items.map((i, idx) => [String(i.pick_id || i.item_id || i.id), idx]));
                    picks.forEach(p => {
                        const key = String(p.pick_id || p.item_id || p.id);
                        if (seen.has(key)) {
                            items[seen.get(key)] = { ...items[seen.get(key)], ...p };
                        } else {
                            seen.set(key, items.length);
                            items.push(p);
                        }
                    });
                } catch(e) {}
            }

            if (currentFilter === 'all' || currentFilter === 'polls') {
                try {
                    const pollData = await api.request('/polls/active?limit=5');
                    (pollData.polls || []).forEach(p => items.push({
                        item_type: 'poll',
                        post_type: 'poll',
                        item_id: 'poll_' + p.id,
                        poll_id: p.id,
                        content: p.title,
                        description: p.description,
                        username: p.creator_username || p.username,
                        display_name: p.creator_display_name || p.display_name || p.username,
                        avatar_url: p.avatar_url,
                        sport: p.sport,
                        created_at: p.created_at,
                        options: p.options || [],
                        total_votes: parseInt(p.total_votes) || 0,
                        status: p.status,
                        likes_count: 0,
                        comments_count: 0
                    }));
                } catch(e) {}
            }

            const userMap = await fetchPublicUsersByName(items.map(i => getUsername(i)));
            items = items.map(i => attachUserRecord(i, userMap[getUsername(i)]));
            items = aggregateFeedItems(items);
            items.sort((a, b) => new Date(b.graded_at || b.created_at || b.locked_at || 0) - new Date(a.graded_at || a.created_at || a.locked_at || 0));
            if (currentFilter === 'hot-takes') items = items.filter(i => i.post_type === 'hot_take');
            if (currentFilter === 'picks') items = items.filter(i => i.item_type === 'pick' || i.post_type === 'pick' || i.post_type === 'pick_share');
            if (currentFilter === 'polls') items = items.filter(i => i.item_type === 'poll' || i.post_type === 'poll');
        }
    } catch(e) {
        renderFeedUnavailable('Live feed data is temporarily unavailable. TrustMyRecord does not substitute fake feed posts when the backend is unavailable.');
        return;
    }

    updateHeroCounts(items.length);
    if (!items.length) {
        c.innerHTML = '<div class="empty-state"><i class="fas fa-stream"></i><h3>No public activity in this filter yet.</h3><p>Real graded picks, posts, polls, challenges, and trivia will appear here once available.</p></div>';
        const lm = document.getElementById('loadMore');
        if (lm) lm.style.display = 'none';
        return;
    }

    c.innerHTML = items.map(renderFeedItem).join('');
    const lm = document.getElementById('loadMore');
    if (lm) lm.style.display = items.length >= FEED_LIMIT ? 'block' : 'none';
}

function compactPickLabel(p) {
    const status = String(p.status || p.pick_status || '').toLowerCase();
    return status === 'pending' || status === 'locked' ? 'Locked picks submitted' : 'Picks graded';
}

async function loadTrending() {
    const el = document.getElementById('trendingList');
    if (!el) return;
    try {
        const data = await api.request('/social/discover?limit=5');
        const picks = (data.picks || []).filter(p => p.is_public !== false && !p.is_private && !['pending', 'locked'].includes(String(p.status || '').toLowerCase()));
        if (picks.length) {
            const grouped = {};
            picks.forEach(p => {
                const username = p.username || p.display_name || 'User';
                grouped[username] = (grouped[username] || 0) + 1;
            });
            el.innerHTML = Object.keys(grouped).slice(0, 3).map((username, i) => {
                const count = grouped[username];
                return '<div class="rs-item"><span class="rs-rank">' + (i + 1) + '</span><span class="rs-text">' + esc(username) + ' had picks graded<span class="rs-count">' + count + ' record update' + (count === 1 ? '' : 's') + '</span></span></div>';
            }).join('');
            return;
        }
    } catch(e) {}
    el.innerHTML = '<div class="rs-empty">No public graded picks are trending yet.</div>';
}

async function loadTopCappers() {
    const el = document.getElementById('topCappersList');
    if (!el) return;
    try {
        const data = await api.request('/users?limit=10');
        const users = (data.users || []).filter(u => Number(u.total_picks || 0) > 0);
        if (users.length) {
            users.sort((a, b) => Number(b.net_units || 0) - Number(a.net_units || 0));
            el.innerHTML = users.slice(0, 3).map(u => {
                const units = Number(u.net_units || 0);
                const sign = units >= 0 ? '+' : '';
                const display = u.display_name || u.username || 'User';
                const avatar = u.avatar_url ? '<img src="' + esc(u.avatar_url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">' : esc(display[0] || '?');
                return '<div class="rs-user"><div class="rs-user-avatar">' + avatar + '</div><div class="rs-user-info"><div class="rs-user-name"><a href="/profile/?user=' + encodeURIComponent(u.username || '') + '">' + esc(display) + '</a></div><div class="rs-user-detail">' + esc(String(u.total_picks || 0)) + ' picks - <span style="color:' + (units >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') + ';font-weight:700;">' + sign + units.toFixed(2) + 'u</span>' + (u.roi != null ? ' - ' + Number(u.roi).toFixed(1) + '% ROI' : '') + '</div></div></div>';
            }).join('');
            return;
        }
    } catch(e) {}
    el.innerHTML = '<div class="rs-empty">Top cappers will appear once public records are available.</div>';
}

async function loadArenaWatch() {
    const el = document.getElementById('arenaWatchList');
    if (!el) return;
    try {
        const data = await api.request('/social/discover?limit=3');
        const picks = (data.picks || []).filter(p => p.is_public !== false && !p.is_private && !['pending', 'locked'].includes(String(p.status || '').toLowerCase()));
        if (picks.length) {
            const grouped = {};
            picks.forEach(p => {
                const username = p.display_name || p.username || 'User';
                grouped[username] = (grouped[username] || 0) + 1;
            });
            el.innerHTML = Object.keys(grouped).slice(0, 3).map(username => {
                return '<div class="rs-item"><span class="rs-rank"><i class="fas fa-circle-check"></i></span><span class="rs-text">' + esc(username) + ' had picks graded<span class="rs-count">Verified record updated</span></span></div>';
            }).join('');
            return;
        }
    } catch(e) {}
    el.innerHTML = '<div class="rs-empty">Recent graded public activity will appear here.</div>';
}

function toggleType(type) {
    const takeBtn = document.getElementById('takeBtn');
    const pollBtnEl = document.getElementById('pollBtn');
    const recapBtn = document.getElementById('recapBtn');
    const pb = document.getElementById('pollBuilder');
    [takeBtn, pollBtnEl, recapBtn].forEach(btn => {
        if (btn) btn.classList.remove('active-take', 'active-poll', 'active-recap');
    });
    if (pb) pb.classList.remove('show');

    if (postType === type) {
        postType = 'post';
    } else {
        postType = type;
        if (type === 'hot-take' && takeBtn) takeBtn.classList.add('active-take');
        if (type === 'poll') {
            if (pollBtnEl) pollBtnEl.classList.add('active-poll');
            if (pb) pb.classList.add('show');
        }
        if (type === 'pick-recap' && recapBtn) recapBtn.classList.add('active-recap');
    }
    const input = document.getElementById('compInput');
    if (input) input.placeholder = postType === 'hot-take' ? 'What is your hottest take?' : postType === 'poll' ? 'Ask the community a sports question...' : postType === 'pick-recap' ? 'Recap a graded pick or angle...' : 'What is your take?';
}
