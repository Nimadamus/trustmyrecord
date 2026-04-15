/**
 * TrustMyRecord Social Feed - Backend-Powered
 * Renders unified feed from PostgreSQL: picks, text posts, hot takes,
 * polls, trivia wins, challenges - all real activity.
 */

let currentFilter = 'all';
let postType = 'post';
let feedOffset = 0;
const FEED_LIMIT = 20;
let viewerUser = null;
let followingUserIds = new Set();

function formatMarketLabel(marketType) {
    return {
        h2h: 'Moneyline',
        spreads: 'Spread',
        totals: 'Game Total',
        team_totals: 'Team Total',
        f5_h2h: 'First 5 ML',
        f5_spreads: 'First 5 Spread',
        f5_totals: 'First 5 Total',
        first_half_h2h: 'First Half ML',
        first_half_spreads: 'First Half Spread',
        first_half_totals: 'First Half Total',
        second_half_h2h: 'Second Half ML',
        second_half_spreads: 'Second Half Spread',
        second_half_totals: 'Second Half Total',
        period_1_h2h: '1st Period ML',
        period_1_totals: '1st Period Total',
        alt_spreads: 'Alt Spread',
        alt_totals: 'Alt Total'
    }[marketType] || String(marketType || 'pick').replace(/_/g, ' ');
}

document.addEventListener('DOMContentLoaded', async () => {
    await initAuth();
    await loadFeed();
    loadTrending();
    loadSuggested();
    loadNotificationBadge();
});

function setRailCardVisibility(contentId, visible) {
    const content = document.getElementById(contentId);
    if (!content) return;
    const card = content.closest('.rs-card');
    if (!card) return;
    card.style.display = visible ? '' : 'none';
}

// ==================== AUTH INIT ====================
async function initAuth() {
    if (typeof api !== 'undefined' && api.ready) {
        try { await api.ready; } catch(e) {}
    }
    const user = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
    viewerUser = user;
    if (user) {
        document.getElementById('loginBanner').style.display = 'none';
        document.getElementById('composerCard').style.display = 'block';
        document.getElementById('compAvatar').textContent = (user.displayName || user.username || '?')[0].toUpperCase();
        document.getElementById('headerActions').innerHTML = `
            <a href="sportsbook.html" class="btn btn-primary"><i class="fas fa-plus"></i> Make Pick</a>
            <span class="notif-bell" id="notifBell" onclick="location.href='notifications.html'" title="Notifications">
                <i class="fas fa-bell"></i><span class="notif-badge" id="notifBadge" style="display:none;">0</span>
            </span>
            <a href="profile.html" class="btn btn-ghost"><i class="fas fa-user"></i> ${user.username}</a>
        `;
        // Load sidebar stats from backend
        loadSidebarStats(user);
        await hydrateFollowingState();
    } else {
        document.getElementById('composerCard').style.display = 'none';
        document.getElementById('loginBanner').style.display = 'block';
    }
    document.getElementById('compInput').addEventListener('input', e => {
        document.getElementById('postBtn').disabled = e.target.value.trim().length === 0;
    });
}

async function loadSidebarStats(user) {
    const sc = document.getElementById('myStatsCard');
    sc.style.display = 'block';
    try {
        if (api && typeof api.request === 'function') {
            const data = await api.request(`/users/${user.username}`);
            const u = data.user || {};
            const wins = u.wins || 0, losses = u.losses || 0, pushes = u.pushes || 0;
            const total = wins + losses + pushes;
            const wr = total > 0 ? (wins / total * 100) : 0;
            document.getElementById('sidebarMyStats').innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem;color:var(--text-secondary);">
                    <div><span style="font-weight:700;color:var(--text-primary);">${u.total_picks || 0}</span> picks</div>
                    <div><span style="font-weight:700;color:var(--accent-green);">${wr.toFixed(0)}%</span> win rate</div>
                    <div><span style="font-weight:700;color:var(--text-primary);">${wins}-${losses}-${pushes}</span> record</div>
                    <div><span style="font-weight:700;color:${parseFloat(u.net_units || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">${parseFloat(u.net_units || 0) >= 0 ? '+' : ''}${parseFloat(u.net_units || 0).toFixed(1)}u</span></div>
                </div>`;
        }
    } catch(e) {
        document.getElementById('sidebarMyStats').innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">Stats loading...</div>';
    }
}

// ==================== NOTIFICATION BADGE ====================
async function loadNotificationBadge() {
    try {
        if (!api || typeof api.request !== 'function') return;
        const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
        if (!user) return;
        const data = await api.request('/notifications/unread-count');
        const count = Number(data.unreadCount ?? data.unread_count ?? 0);
        const badge = document.getElementById('notifBadge');
        if (badge && count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'inline-flex';
        }
    } catch(e) {}
}

// ==================== POST TYPE TOGGLE ====================
function toggleType(type) {
    const takeBtn = document.getElementById('takeBtn');
    const pollBtnEl = document.getElementById('pollBtn');
    const pb = document.getElementById('pollBuilder');
    if (type === 'hot-take') {
        if (postType === 'hot-take') { postType = 'post'; takeBtn.classList.remove('active-take'); }
        else { postType = 'hot-take'; takeBtn.classList.add('active-take'); pollBtnEl.classList.remove('active-poll'); pb.classList.remove('show'); }
    } else if (type === 'poll') {
        if (postType === 'poll') { postType = 'post'; pollBtnEl.classList.remove('active-poll'); pb.classList.remove('show'); }
        else { postType = 'poll'; pollBtnEl.classList.add('active-poll'); takeBtn.classList.remove('active-take'); pb.classList.add('show'); }
    }
    document.getElementById('compInput').placeholder = postType === 'hot-take' ? "Drop your hottest take..." : postType === 'poll' ? "Ask a question..." : "What's your take?";
}

// ==================== POLL BUILDER ====================
function addPollOpt() {
    const c = document.getElementById('pollOpts');
    if (c.children.length >= 6) return;
    const r = document.createElement('div');
    r.className = 'poll-row';
    r.innerHTML = `<input class="poll-input" placeholder="Option ${c.children.length + 1}" maxlength="60"><button class="poll-rm" onclick="rmPollOpt(this)"><i class="fas fa-times"></i></button>`;
    c.appendChild(r);
}
function rmPollOpt(btn) {
    const c = document.getElementById('pollOpts');
    if (c.children.length <= 2) return;
    btn.closest('.poll-row').remove();
}

// ==================== SUBMIT POST ====================
async function submitPost() {
    const content = document.getElementById('compInput').value.trim();
    if (!content) return;
    const sport = document.getElementById('sportPick').value || null;
    const btn = document.getElementById('postBtn');
    btn.disabled = true;
    btn.textContent = 'Posting...';

    try {
        if (postType === 'poll') {
            const opts = Array.from(document.querySelectorAll('#pollOpts .poll-input')).map(i => i.value.trim()).filter(Boolean);
            if (opts.length < 2) { alert('Need at least 2 options.'); btn.disabled = false; btn.textContent = 'Post'; return; }
            if (api && typeof api.request === 'function') {
                await api.request('/polls', {
                    method: 'POST',
                    body: { title: content, options: opts.map(t => ({ text: t })), sport: sport || undefined, scoring_type: 'binary', points_correct: 100 }
                });
            }
        } else {
            if (api && typeof api.request === 'function') {
                await api.request('/feed', {
                    method: 'POST',
                    body: { content, post_type: postType === 'hot-take' ? 'hot_take' : 'text', sport }
                });
            }
        }
    } catch(e) {
        alert('Failed to post: ' + (e.message || 'Unknown error'));
    }

    // Reset
    document.getElementById('compInput').value = '';
    btn.disabled = true;
    btn.textContent = 'Post';
    document.getElementById('sportPick').value = '';
    if (postType !== 'post') toggleType(postType);
    document.getElementById('pollOpts').innerHTML = '<div class="poll-row"><input class="poll-input" placeholder="Option 1" maxlength="60"><button class="poll-rm" onclick="rmPollOpt(this)"><i class="fas fa-times"></i></button></div><div class="poll-row"><input class="poll-input" placeholder="Option 2" maxlength="60"><button class="poll-rm" onclick="rmPollOpt(this)"><i class="fas fa-times"></i></button></div>';
    feedOffset = 0;
    await loadFeed();
}

// ==================== LOAD FEED ====================
async function loadFeed() {
    const c = document.getElementById('feedList');
    c.innerHTML = '<div class="tmr-loading-state" id="feedLoadingState"><div class="tmr-spinner"></div><p>Loading feed...</p><p class="tmr-loading-slow" id="feedLoadingSlow">Preparing the latest community activity.</p></div>';
    const _feedSlowTimer = setTimeout(() => { const el = document.getElementById('feedLoadingSlow'); if (el) el.style.display = 'block'; }, 5000);

    let items = [];

    try {
        if (api && typeof api.request === 'function') {
            // Fetch unified feed
            const filterParam = currentFilter === 'hot-takes' ? 'posts' : currentFilter;
            const data = await api.request(`/feed?limit=${FEED_LIMIT}&offset=${feedOffset}&filter=${filterParam}`);
            const feedItems = data.feed || [];

            // Also fetch recent polls to show in feed
            let polls = [];
            if (currentFilter === 'all' || currentFilter === 'polls') {
                try {
                    const pollData = await api.request('/polls/active?limit=5');
                    polls = (pollData.polls || []).map(p => ({
                        item_type: 'poll',
                        post_type: 'poll',
                        item_id: 'poll_' + p.id,
                        poll_id: p.id,
                        content: p.title,
                        description: p.description,
                        username: p.creator_username || p.username || 'Unknown',
                        display_name: p.creator_display_name || p.display_name || p.username || 'Unknown',
                        avatar_url: p.avatar_url,
                        sport: p.sport,
                        created_at: p.created_at,
                        options: p.options || [],
                        total_votes: parseInt(p.total_votes) || 0,
                        status: p.status,
                        likes_count: 0,
                        comments_count: 0,
                        user_voted: p.user_vote != null,
                        user_vote_option: p.user_vote
                    }));
                } catch(e) {}
            }

            // Also fetch recent notifications for activity items
            let activityItems = [];
            if (currentFilter === 'all') {
                try {
                    const notifData = await api.request('/notifications?limit=5');
                    const notifs = (notifData.notifications || []).filter(n =>
                        ['pick_graded', 'friend_accepted', 'achievement'].includes(n.type)
                    );
                    activityItems = notifs.map(n => ({
                        item_type: 'activity',
                        post_type: 'activity',
                        item_id: 'notif_' + n.id,
                        content: n.content,
                        username: n.username || '',
                        display_name: n.display_name || n.username || '',
                        avatar_url: n.avatar_url,
                        created_at: n.created_at,
                        notif_type: n.type,
                        likes_count: 0,
                        comments_count: 0
                    }));
                } catch(e) {}
            }

            // Merge everything, dedupe polls by title
            const seenPolls = new Set();
            items = [...feedItems];

            for (const poll of polls) {
                if (!seenPolls.has(poll.content)) {
                    seenPolls.add(poll.content);
                    items.push(poll);
                }
            }

            items.push(...activityItems);

            // Sort by created_at desc
            items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            // Filter hot takes locally
            if (currentFilter === 'hot-takes') {
                items = items.filter(i => i.post_type === 'hot_take');
            }
        }
    } catch(e) {
        clearTimeout(_feedSlowTimer);
        renderFeedUnavailable('Live feed data is temporarily unavailable. Only real community posts are shown here.');
        return;
    }

    clearTimeout(_feedSlowTimer);

    if (!items.length) {
        updateHeroCounts(0);
        const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
        const message = currentFilter === 'following'
            ? 'No posts from followed accounts yet.'
            : (user ? 'No posts yet.' : 'Your feed is empty. Sign in to post, follow accounts, and build your timeline.');
        c.innerHTML = `<div class="empty-state"><i class="fas fa-stream"></i><h3 style="margin-bottom:6px;">Your feed is empty</h3><p>${message}</p><div class="feed-state-actions"><button class="btn btn-primary" onclick="loadFeed()">Refresh Feed</button><a class="btn btn-ghost" href="sportsbook.html">Make a Pick</a></div></div>`;
        return;
    }

    updateHeroCounts(items.length);
    c.innerHTML = items.map(renderFeedItem).join('');
    document.getElementById('loadMore').style.display = items.length >= FEED_LIMIT ? 'block' : 'none';
}

function updateHeroCounts(visibleCount) {
    const visibleEl = document.getElementById('heroVisibleCount');
    const filterEl = document.getElementById('heroFilterLabel');
    if (visibleEl) visibleEl.textContent = String(visibleCount || 0);
    if (filterEl) {
        const labels = {
            all: 'For You',
            picks: 'Picks',
            'hot-takes': 'Hot Takes',
            polls: 'Polls',
            following: 'Following'
        };
        filterEl.textContent = labels[currentFilter] || 'For You';
    }
}

function renderFeedUnavailable(message) {
    const c = document.getElementById('feedList');
    if (!c) return;
    updateHeroCounts(0);
    document.getElementById('loadMore').style.display = 'none';
    c.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-database"></i>
            <h3 style="margin-bottom:6px;">Feed unavailable</h3>
            <p>${esc(message || 'Live data is not connected right now.')}</p>
            <div class="feed-state-actions">
                <button class="btn btn-primary" onclick="loadFeed()">Refresh Feed</button>
                <a class="btn btn-ghost" href="sportsbook.html">Open Board</a>
            </div>
        </div>
    `;
}

// ==================== RENDER FEED ITEM (UNIFIED) ====================
function renderFeedItem(item) {
    const type = item.item_type || 'feed_post';
    const ptype = item.post_type || 'text';

    if (type === 'pick' || ptype === 'pick_share' || ptype === 'pick') {
        return renderPickCard(item);
    }
    if (type === 'poll' || ptype === 'poll') {
        return renderPollCard(item);
    }
    if (type === 'activity') {
        return renderActivityCard(item);
    }
    // Text post or hot take
    return renderTextPost(item);
}

// ==================== RENDER TEXT POST ====================
function renderTextPost(p) {
    const letter = (p.display_name || p.username || '?')[0].toUpperCase();
    const isHot = p.post_type === 'hot_take';
    const liked = p.liked_by_user || false;

    return `<div class="feed-item${isHot ? ' hot-take' : ''}" data-id="${p.item_id}" data-type="feed_post">
        <div class="fi-header">
            <div class="fi-avatar" style="${isHot ? 'background:var(--accent-red);' : ''}">${letter}</div>
            <div class="fi-meta">
                <div class="fi-top-row">
                    <span class="fi-name"><a href="profile.html?user=${p.username}">${p.display_name || p.username}</a></span>
                    <span class="fi-handle">@${p.username}</span>
                    <span class="fi-dot">&bull;</span>
                    <span class="fi-time">${timeAgo(p.created_at)}</span>
                </div>
                <div style="display:flex;gap:4px;margin-top:3px;">
                    ${isHot ? '<span class="fi-badge fi-badge-take"><i class="fas fa-fire"></i> Hot Take</span>' : ''}
                    ${p.sport ? `<span class="fi-sport">${formatSport(p.sport)}</span>` : ''}
                </div>
            </div>
        </div>
        <div class="fi-content">${esc(p.content)}</div>
        <div class="fi-actions">
            <button class="fi-action ${liked ? 'liked' : ''}" onclick="likeFeedPost(${p.item_id}, this)"><i class="fas fa-heart"></i> <span>${p.likes_count || 0}</span></button>
            <button class="fi-action" onclick="toggleComments(${p.item_id}, 'feed_post')"><i class="fas fa-comment"></i> <span>${p.comments_count || 0}</span></button>
            <button class="fi-action" onclick="sharePost('${p.item_id}')"><i class="fas fa-share"></i></button>
        </div>
        <div class="comments-section" id="cs-fp-${p.item_id}"></div>
    </div>`;
}

// ==================== RENDER PICK CARD ====================
function renderPickCard(p) {
    const letter = (p.display_name || p.username || '?')[0].toUpperCase();
    const sel = p.pick_selection || p.selection || '';
    const mkt = p.pick_market_type || p.market_type || 'pick';
    const odds = p.pick_odds || p.odds_snapshot || 0;
    const oddsStr = odds > 0 ? `+${odds}` : `${odds}`;
    const line = p.pick_line || p.line_snapshot;
    const units = p.pick_units || p.units || '';
    const status = p.pick_status || p.status || 'pending';
    const home = p.pick_home_team || p.home_team || '';
    const away = p.pick_away_team || p.away_team || '';
    const sport = p.pick_sport_key || p.sport || p.sport_key || '';
    const liked = p.liked_by_user || false;
    const pickId = p.pick_id || p.item_id;
    const mktLabel = formatMarketLabel(mkt);
    const statusClass = status === 'won' ? 'won' : status === 'lost' ? 'lost' : status === 'push' ? 'push' : 'pending';

    return `<div class="feed-item" data-id="${p.item_id}" data-type="${p.item_type || 'pick'}">
        <div class="fi-header">
            <div class="fi-avatar" style="background:var(--accent-blue);">${letter}</div>
            <div class="fi-meta">
                <div class="fi-top-row">
                    <span class="fi-name"><a href="profile.html?user=${p.username}">${p.display_name || p.username}</a></span>
                    <span class="fi-handle">@${p.username}</span>
                    <span class="fi-dot">&bull;</span>
                    <span class="fi-time">${timeAgo(p.created_at)}</span>
                </div>
                <div style="display:flex;gap:4px;margin-top:3px;">
                    <span class="fi-badge fi-badge-pick"><i class="fas fa-crosshairs"></i> Pick</span>
                    ${sport ? `<span class="fi-sport">${formatSport(sport)}</span>` : ''}
                </div>
            </div>
        </div>
        ${p.content ? `<div class="fi-content" style="margin-bottom:8px;">${esc(p.content)}</div>` : ''}
        <div class="pick-embed">
            <div class="pe-matchup">
                <span class="pe-team">${away || sel}</span>
                <span class="pe-vs">@</span>
                <span class="pe-team">${home}</span>
            </div>
            <div class="pe-details">
                <span class="pe-chip"><i class="fas fa-crosshairs"></i> ${mktLabel}</span>
                <span class="pe-chip"><i class="fas fa-bullseye"></i> ${sel}${line ? ' ' + (line > 0 ? '+' : '') + line : ''}</span>
                <span class="pe-chip"><i class="fas fa-chart-line"></i> ${oddsStr}</span>
                ${units ? `<span class="pe-chip"><i class="fas fa-coins"></i> ${units}u</span>` : ''}
            </div>
            <span class="pe-status ${statusClass}">${status.toUpperCase()}</span>
        </div>
        <div class="fi-actions">
            <button class="fi-action ${liked ? 'liked' : ''}" onclick="likePick(${pickId}, this)"><i class="fas fa-heart"></i> <span>${p.likes_count || 0}</span></button>
            <button class="fi-action" onclick="toggleComments(${pickId}, 'pick')"><i class="fas fa-comment"></i> <span>${p.comments_count || 0}</span></button>
            <button class="fi-action" onclick="sharePost('pick-${pickId}')"><i class="fas fa-share"></i></button>
        </div>
        <div class="comments-section" id="cs-pick-${pickId}"></div>
    </div>`;
}

// ==================== RENDER POLL CARD ====================
function renderPollCard(p) {
    const letter = (p.display_name || p.username || '?')[0].toUpperCase();
    const total = p.total_votes || 0;
    const options = p.options || [];

    let optionsHtml = options.map(opt => {
        const votes = parseInt(opt.vote_count || opt.votes || 0);
        const pct = total > 0 ? Math.round(votes / total * 100) : 0;
        const isVoted = p.user_voted;
        return `<div class="poll-opt ${isVoted ? 'voted' : ''}" ${!isVoted ? `onclick="votePoll(${p.poll_id}, ${opt.id})"` : ''}>
            ${isVoted ? `<div class="poll-bar" style="width:${pct}%"></div>` : ''}
            <div class="poll-opt-inner"><span>${esc(opt.text || opt.option_text || '')}</span>${isVoted ? `<span class="poll-pct">${pct}%</span>` : ''}</div>
        </div>`;
    }).join('');

    return `<div class="feed-item" data-id="${p.item_id}" data-type="poll">
        <div class="fi-header">
            <div class="fi-avatar" style="background:var(--accent-purple);">${letter}</div>
            <div class="fi-meta">
                <div class="fi-top-row">
                    <span class="fi-name"><a href="profile.html?user=${p.username}">${p.display_name || p.username}</a></span>
                    <span class="fi-handle">@${p.username}</span>
                    <span class="fi-dot">&bull;</span>
                    <span class="fi-time">${timeAgo(p.created_at)}</span>
                </div>
                <div style="display:flex;gap:4px;margin-top:3px;">
                    <span class="fi-badge fi-badge-poll"><i class="fas fa-poll"></i> Poll</span>
                    ${p.sport ? `<span class="fi-sport">${p.sport}</span>` : ''}
                </div>
            </div>
        </div>
        <div class="fi-content" style="font-weight:600;font-size:1.05rem;">${esc(p.content)}</div>
        ${p.description ? `<div style="color:var(--text-secondary);font-size:0.9rem;margin-top:4px;">${esc(p.description)}</div>` : ''}
        <div class="poll-display">${optionsHtml}
            <div class="poll-total">${total} vote${total !== 1 ? 's' : ''}</div>
        </div>
    </div>`;
}

// ==================== RENDER ACTIVITY CARD ====================
function renderActivityCard(item) {
    const iconMap = {
        pick_graded: { icon: 'fa-check-circle', color: 'var(--accent-green)', label: 'Pick Graded' },
        friend_accepted: { icon: 'fa-user-check', color: 'var(--accent-blue)', label: 'New Friend' },
        achievement: { icon: 'fa-trophy', color: 'var(--accent-gold)', label: 'Achievement' },
    };
    const cfg = iconMap[item.notif_type] || { icon: 'fa-bell', color: 'var(--accent-blue)', label: 'Activity' };

    return `<div class="feed-item activity-item">
        <div class="fi-header">
            <div class="fi-avatar" style="background:${cfg.color};font-size:0.85rem;"><i class="fas ${cfg.icon}"></i></div>
            <div class="fi-meta">
                <div class="fi-top-row">
                    <span class="fi-badge" style="background:${cfg.color}20;color:${cfg.color};font-size:0.75rem;padding:2px 8px;border-radius:10px;">${cfg.label}</span>
                    <span class="fi-dot">&bull;</span>
                    <span class="fi-time">${timeAgo(item.created_at)}</span>
                </div>
            </div>
        </div>
        <div class="fi-content" style="color:var(--text-secondary);">${esc(item.content)}</div>
    </div>`;
}

// ==================== INTERACTIONS ====================
async function likeFeedPost(id, btn) {
    const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!user) { openModal('login'); return; }
    try {
        const isLiked = btn.classList.contains('liked');
        let data = null;
        if (isLiked) {
            data = await api.request(`/feed/${id}/like`, { method: 'DELETE' });
            btn.classList.remove('liked');
        } else {
            data = await api.request(`/feed/${id}/like`, { method: 'POST' });
            btn.classList.add('liked');
        }
        const span = btn.querySelector('span');
        if (span) {
            if (data && typeof data.likes_count === 'number') {
                span.textContent = data.likes_count;
            } else {
                let count = parseInt(span.textContent) || 0;
                span.textContent = isLiked ? Math.max(0, count - 1) : count + 1;
            }
        }
    } catch(e) {}
}

async function likePick(id, btn) {
    const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!user) { openModal('login'); return; }
    try {
        const isLiked = btn.classList.contains('liked');
        if (isLiked) {
            await api.request(`/picks/${id}/like`, { method: 'DELETE' });
            btn.classList.remove('liked');
        } else {
            await api.request(`/picks/${id}/like`, { method: 'POST' });
            btn.classList.add('liked');
        }
        const span = btn.querySelector('span');
        if (span) {
            let count = parseInt(span.textContent) || 0;
            span.textContent = isLiked ? Math.max(0, count - 1) : count + 1;
        }
    } catch(e) {}
}

async function toggleComments(id, type) {
    const elId = type === 'pick' ? `cs-pick-${id}` : `cs-fp-${id}`;
    const el = document.getElementById(elId);
    if (!el) return;

    if (el.classList.contains('show')) {
        el.classList.remove('show');
        return;
    }

    el.classList.add('show');
    el.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:0.85rem;">Loading comments...</div>';

    try {
        const endpoint = type === 'pick' ? `/picks/${id}/comments` : `/feed/${id}/comments`;
        const data = await api.request(endpoint);
        const comments = data.comments || [];
        const user = (typeof auth !== 'undefined') ? auth.currentUser : null;

        let html = '';
        if (user) {
            html += `<div class="cmt-input-row">
                <input class="cmt-input" id="ci-${type}-${id}" placeholder="Write a comment..." onkeypress="if(event.key==='Enter')postComment(${id},'${type}')">
                <button class="cmt-submit" onclick="postComment(${id},'${type}')">Post</button>
            </div>`;
        }

        if (comments.length) {
            html += comments.map(c => `
                <div class="cmt-item">
                    <div class="cmt-avatar">${(c.display_name || c.username || '?')[0].toUpperCase()}</div>
                    <div class="cmt-body">
                        <div class="cmt-author"><a href="profile.html?user=${c.username}">${c.display_name || c.username}</a></div>
                        <div class="cmt-text">${esc(c.content)}</div>
                        <div class="cmt-time">${timeAgo(c.created_at)}</div>
                    </div>
                </div>
            `).join('');
        } else {
            html += '<div style="padding:8px 12px;color:var(--text-muted);font-size:0.85rem;">No comments yet</div>';
        }

        el.innerHTML = html;
    } catch(e) {
        el.innerHTML = '<div style="padding:12px;color:var(--accent-red);font-size:0.85rem;">Failed to load comments</div>';
    }
}

async function postComment(id, type) {
    const input = document.getElementById(`ci-${type}-${id}`);
    if (!input || !input.value.trim()) return;

    try {
        const endpoint = type === 'pick' ? `/picks/${id}/comment` : `/feed/${id}/comment`;
        await api.request(endpoint, { method: 'POST', body: { content: input.value.trim() } });
        input.value = '';
        bumpCommentCount(id, type);
        // Reload comments
        const elId = type === 'pick' ? `cs-pick-${id}` : `cs-fp-${id}`;
        const el = document.getElementById(elId);
        if (el) el.classList.remove('show');
        toggleComments(id, type);
    } catch(e) {
        alert('Failed to post comment');
    }
}

async function votePoll(pollId, optionId) {
    const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!user) { openModal('login'); return; }
    try {
        await api.request(`/polls/${pollId}/vote`, { method: 'POST', body: { option_id: optionId } });
        await loadFeed();
    } catch(e) {
        alert(e.message || 'Failed to vote');
    }
}

function sharePost(id) {
    navigator.clipboard?.writeText(`${location.origin}/feed.html?post=${id}`);
    const el = event.currentTarget;
    const orig = el.innerHTML;
    el.innerHTML = '<i class="fas fa-check"></i> Copied!';
    setTimeout(() => el.innerHTML = orig, 1500);
}

// ==================== FILTER TABS ====================
function setFilter(f, btn) {
    currentFilter = f;
    feedOffset = 0;
    document.querySelectorAll('.feed-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadFeed();
}

function loadMorePosts() {
    feedOffset += FEED_LIMIT;
    loadFeed();
}

// ==================== SIDEBAR ====================
async function loadTrending() {
    const el = document.getElementById('trendingList');
    const heroTrending = document.getElementById('heroTrendingCount');
    if (!el) return;
    try {
        if (api && typeof api.request === 'function') {
            const data = await api.request('/social/discover?limit=5');
            const picks = data.picks || [];
            if (picks.length) {
                if (heroTrending) heroTrending.textContent = String(picks.length);
                setRailCardVisibility('trendingList', true);
                el.innerHTML = picks.map((p, i) => {
                    const sport = (p.sport_key || '').split('_')[1]?.toUpperCase() || '';
                    return `<div class="rs-item"><span class="rs-rank">${i + 1}</span><span class="rs-text">${p.selection} ${formatMarketLabel(p.market_type)}</span><span class="rs-count">${sport}</span></div>`;
                }).join('');
                return;
            }
        }
    } catch(e) {}
    if (heroTrending) heroTrending.textContent = '0';
    setRailCardVisibility('trendingList', true);
    el.innerHTML = '<div class="rs-empty">No live trending picks yet.</div>';
}

async function loadSuggested() {
    const el = document.getElementById('suggestedList');
    const heroSuggested = document.getElementById('heroSuggestedCount');
    if (!el) return;
    try {
        if (api && typeof api.request === 'function') {
            const data = await api.request('/users?limit=5');
            const users = (data.users || []).filter(u => !viewerUser || String(u.id) !== String(viewerUser.id));
            if (users.length) {
                if (heroSuggested) heroSuggested.textContent = String(users.length);
                setRailCardVisibility('suggestedList', true);
                el.innerHTML = users.map(u => {
                    const isFollowing = followingUserIds.has(String(u.id));
                    const buttonHtml = viewerUser
                        ? `<button class="rs-follow-btn ${isFollowing ? 'is-following' : ''}" onclick="toggleFollowFromFeed('${u.id}', this)">${isFollowing ? 'Following' : 'Follow'}</button>`
                        : `<a href="profile.html?user=${u.username}" class="rs-follow-btn">View</a>`;
                    return (
                    `<div class="rs-user">
                        <div class="rs-user-avatar" style="background:var(--accent-blue);">${(u.display_name || u.username || '?')[0].toUpperCase()}</div>
                        <div class="rs-user-info">
                            <div class="rs-user-name"><a href="profile.html?user=${u.username}" style="color:inherit;text-decoration:none;">${u.display_name || u.username}</a></div>
                            <div class="rs-user-detail">${u.total_picks || 0} picks${u.roi != null ? ` • ${Number(u.roi).toFixed(1)}% ROI` : ''}</div>
                        </div>
                        ${buttonHtml}
                    </div>`
                    );
                }).join('');
                return;
            }
        }
    } catch(e) {}
    if (heroSuggested) heroSuggested.textContent = '0';
    setRailCardVisibility('suggestedList', true);
    el.innerHTML = '<div class="rs-empty">No suggested users from live data yet.</div>';
}

async function hydrateFollowingState() {
    if (!viewerUser || !api || typeof api.getFollowing !== 'function') return;
    try {
        const userId = viewerUser.id || (await fetchCurrentViewerId());
        if (!userId) return;
        const data = await api.getFollowing(userId, { limit: 100, offset: 0 });
        followingUserIds = new Set((data.following || []).map(u => String(u.id)));
        if (!viewerUser.id) viewerUser.id = userId;
    } catch (e) {
        followingUserIds = new Set();
    }
}

async function fetchCurrentViewerId() {
    try {
        const data = await api.getCurrentUser();
        const user = data.user || data;
        if (viewerUser && user?.id) viewerUser.id = user.id;
        return user?.id || null;
    } catch (e) {
        return null;
    }
}

async function toggleFollowFromFeed(userId, btn) {
    if (!viewerUser) {
        openModal('login');
        return;
    }

    const normalizedId = String(userId);
    const isFollowing = followingUserIds.has(normalizedId);
    const originalText = btn.textContent;
    btn.disabled = true;

    try {
        if (isFollowing) {
            await api.unfollowUser(userId);
            followingUserIds.delete(normalizedId);
            btn.textContent = 'Follow';
            btn.classList.remove('is-following');
        } else {
            await api.followUser(userId);
            followingUserIds.add(normalizedId);
            btn.textContent = 'Following';
            btn.classList.add('is-following');
        }

        if (currentFilter === 'following') {
            feedOffset = 0;
            await loadFeed();
        }
    } catch (e) {
        btn.textContent = originalText;
        alert(e.message || 'Failed to update follow state');
    } finally {
        btn.disabled = false;
    }
}

function bumpCommentCount(id, type) {
    const selector = type === 'pick'
        ? `.feed-item[data-type="pick"] [onclick="toggleComments(${id}, 'pick')"] span, .feed-item[data-type="pick"] [onclick="toggleComments(${id},'pick')"] span`
        : `.feed-item[data-type="feed_post"] [onclick="toggleComments(${id}, 'feed_post')"] span, .feed-item[data-type="feed_post"] [onclick="toggleComments(${id},'feed_post')"] span`;
    const target = document.querySelector(selector);
    if (!target) return;
    const count = parseInt(target.textContent, 10) || 0;
    target.textContent = count + 1;
}

// ==================== AUTH MODALS ====================
function openModal(type) {
    closeModals();
    document.getElementById(type + 'Modal').classList.add('show');
}

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
}

document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeModals(); });
});

async function handleLogin() {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value;
    if (!user || !pass) { showErr('loginError', 'All fields required.'); return; }
    try {
        if (typeof auth !== 'undefined' && auth.login) {
            await auth.login(user, pass);
            closeModals();
            location.reload();
            return;
        }
        showErr('loginError', 'Login failed.');
    } catch (e) {
        if (e && e.code === 'EMAIL_NOT_VERIFIED') {
            const email = e.data?.email || '';
            showErr('loginError', e.message || 'Please verify your email before logging in.');
            setTimeout(() => {
                location.href = 'verify-email.html' + (email ? ('?email=' + encodeURIComponent(email)) : '');
            }, 900);
            return;
        }
        showErr('loginError', e.message || 'Invalid credentials.');
    }
}

async function handleSignup() {
    const username = document.getElementById('signupUser').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const pass = document.getElementById('signupPass').value;
    if (!username || !email || !pass) { showErr('signupError', 'All fields required.'); return; }
    if (pass.length < 8) { showErr('signupError', 'Password must be 8+ characters.'); return; }
    try {
        if (typeof auth !== 'undefined' && auth.register) {
            const result = await auth.register(username, email, pass);
            if (result && result.pendingVerification) {
                closeModals();
                alert(result.message || 'Account created. Check your email to verify your account.');
                location.href = 'verify-email.html?email=' + encodeURIComponent(result.email || email);
                return;
            }
            closeModals();
            location.reload();
            return;
        }
        showErr('signupError', 'Registration failed.');
    } catch (e) { showErr('signupError', e.message || 'Signup failed.'); }
}

function showErr(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 4000);
}

// ==================== HELPERS ====================
function esc(t) {
    if (!t) return '';
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

function formatSport(key) {
    if (!key) return '';
    const map = {
        'basketball_nba': 'NBA', 'icehockey_nhl': 'NHL', 'baseball_mlb': 'MLB',
        'americanfootball_nfl': 'NFL', 'basketball_ncaab': 'NCAAB', 'americanfootball_ncaaf': 'NCAAF',
        'NFL': 'NFL', 'NBA': 'NBA', 'MLB': 'MLB', 'NHL': 'NHL', 'NCAAB': 'NCAAB', 'Soccer': 'Soccer'
    };
    return map[key] || key.split('_').pop()?.toUpperCase() || key;
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
