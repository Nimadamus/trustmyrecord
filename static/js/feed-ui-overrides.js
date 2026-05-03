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
    if (wins != null || losses != null || pushes != null) {
        const record = [wins || 0, losses || 0, pushes || 0].join('-');
        const unitsNum = Number(units || 0);
        return record + ', ' + (unitsNum >= 0 ? '+' : '') + unitsNum.toFixed(2) + 'u';
    }
    return 'public record pending';
}

function getSportOrTeam(item) {
    const team = item.primary_team || item.team || item.favorite_team;
    const sport = formatSport(item.sport || item.sport_key || item.league || item.primary_sport);
    if (team && sport) return esc(team) + ' - ' + esc(sport);
    return esc(team || sport || 'Sports');
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
    const action = status === 'won' || status === 'win'
        ? '<i class="fas fa-circle-check"></i> won a pick'
        : status === 'lost' || status === 'loss'
            ? '<i class="fas fa-circle-xmark"></i> lost a pick'
            : status === 'push'
                ? '<i class="fas fa-minus-circle"></i> pushed a pick'
                : isPending
                    ? '<i class="fas fa-lock"></i> locked a pick'
                    : '<i class="fas fa-clipboard-check"></i> pick was graded';
    const market = formatMarketLabel(item.market_type || item.market || item.pick_type);
    const line = item.line_snapshot ?? item.line ?? item.spread ?? '';
    const odds = item.odds_snapshot ?? item.odds ?? '';
    const units = item.result_units ?? item.units_result ?? item.units_profit;
    const selection = item.selection || item.pick || item.team || '';
    const matchup = item.matchup || [item.away_team, item.home_team].filter(Boolean).join(' @ ');
    const sport = formatSport(item.sport_key || item.sport || item.league);
    const resultClass = status.indexOf('win') >= 0 || status === 'won' ? 'is-won' : (status.indexOf('loss') >= 0 || status === 'lost' ? 'is-lost' : '');

    let body = '';
    if (isPending) {
        body = '<div class="pick-embed is-private"><div class="pe-row"><span class="pe-chip is-sport"><i class="fas fa-lock"></i> Pending pick</span></div><div style="font-size:0.9rem;color:var(--text-secondary);line-height:1.5;">Details stay private until they are allowed publicly or the pick is graded.</div></div>';
    } else {
        body = '<div class="pick-embed">' +
            '<div class="pe-row">' +
                (sport ? '<span class="pe-chip is-sport">' + esc(sport) + '</span>' : '') +
                '<span class="pe-chip">' + esc(market) + '</span>' +
                (resultClass ? '<span class="pe-chip ' + resultClass + '">' + esc(status.toUpperCase()) + '</span>' : '') +
                (units != null ? '<span class="pe-chip is-units">' + (Number(units) >= 0 ? '+' : '') + esc(Number(units).toFixed(2)) + 'u</span>' : '') +
            '</div>' +
            '<div class="pe-team">' + esc(selection + (line !== '' && line != null ? ' ' + line : '')) + '</div>' +
            (matchup ? '<div style="margin-top:5px;color:var(--text-muted);font-size:0.86rem;">' + esc(matchup) + '</div>' : '') +
            (odds !== '' && odds != null ? '<div style="margin-top:8px;color:var(--text-secondary);font-size:0.82rem;">Odds: ' + (Number(odds) > 0 ? '+' : '') + esc(odds) + '</div>' : '') +
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
