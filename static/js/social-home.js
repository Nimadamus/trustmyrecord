/**
 * TrustMyRecord Social Homepage
 * Feed rendering, auth modals, composer, interactions
 */

let currentFilter = 'all';
let postType = 'post';
let backendPicks = [];

document.addEventListener('DOMContentLoaded', async () => {
    initAuth();
    await loadFeed();
    loadTrending();
    loadSuggested();
});

// ==================== AUTH INIT ====================
function initAuth() {
    const user = socialFeed.getCurrentUser();
    if (user) {
        document.getElementById('loginBanner').style.display = 'none';
        document.getElementById('composerCard').style.display = 'block';
        document.getElementById('compAvatar').textContent = (user.displayName || user.username || '?')[0].toUpperCase();
        document.getElementById('headerActions').innerHTML = `
            <a href="sportsbook.html" class="btn btn-primary"><i class="fas fa-plus"></i> Make Pick</a>
            <a href="profile.html" class="btn btn-ghost"><i class="fas fa-user"></i> ${user.username}</a>
        `;
        const sc = document.getElementById('myStatsCard');
        sc.style.display = 'block';
        const s = user.stats || {};
        document.getElementById('sidebarMyStats').innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem;color:var(--text-secondary);">
                <div><span style="font-weight:700;color:var(--text-primary);">${s.totalPicks || 0}</span> picks</div>
                <div><span style="font-weight:700;color:var(--accent-green);">${(s.winRate || 0).toFixed(0)}%</span> win rate</div>
                <div><span style="font-weight:700;color:var(--text-primary);">${s.wins || 0}-${s.losses || 0}</span> record</div>
                <div><span style="font-weight:700;color:${(s.roi || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">${(s.roi || 0).toFixed(1)}%</span> ROI</div>
            </div>`;
    } else {
        document.getElementById('composerCard').style.display = 'none';
        document.getElementById('loginBanner').style.display = 'block';
    }
    document.getElementById('compInput').addEventListener('input', e => {
        document.getElementById('postBtn').disabled = e.target.value.trim().length === 0;
    });
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
function submitPost() {
    const content = document.getElementById('compInput').value.trim();
    if (!content) return;
    const sport = document.getElementById('sportPick').value || null;
    let pollOptions = null;
    if (postType === 'poll') {
        const opts = Array.from(document.querySelectorAll('#pollOpts .poll-input')).map(i => i.value.trim()).filter(Boolean);
        if (opts.length < 2) { alert('Need at least 2 options.'); return; }
        pollOptions = opts.map(t => ({ text: t, votes: 0 }));
    }
    socialFeed.createPost({ type: postType, content, sport, tags: sport ? [sport] : [], pollOptions });
    // Reset
    document.getElementById('compInput').value = '';
    document.getElementById('postBtn').disabled = true;
    document.getElementById('sportPick').value = '';
    if (postType !== 'post') toggleType(postType);
    document.getElementById('pollOpts').innerHTML = '<div class="poll-row"><input class="poll-input" placeholder="Option 1" maxlength="60"><button class="poll-rm" onclick="rmPollOpt(this)"><i class="fas fa-times"></i></button></div><div class="poll-row"><input class="poll-input" placeholder="Option 2" maxlength="60"><button class="poll-rm" onclick="rmPollOpt(this)"><i class="fas fa-times"></i></button></div>';
    loadFeed();
}

// ==================== LOAD FEED ====================
async function loadFeed() {
    const localPosts = socialFeed.getPosts({ filter: currentFilter === 'picks' ? null : currentFilter });
    backendPicks = [];
    if (currentFilter === 'all' || currentFilter === 'picks') {
        try {
            await api.ready;
            if (api.backendAvailable) {
                const d = await api.request('/social/discover?limit=15&offset=0');
                backendPicks = (d.picks || []).map(p => ({ ...p, _source: 'backend', type: 'pick-backend', createdAt: p.created_at || p.locked_at }));
            }
        } catch (e) { /* backend unavailable */ }
    }
    let items = currentFilter === 'picks' ? backendPicks : [...localPosts, ...backendPicks];
    items.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    const c = document.getElementById('feedList');
    if (!items.length) {
        c.innerHTML = `<div class="empty-state"><i class="fas fa-stream"></i><h3 style="margin-bottom:6px;">No posts yet</h3><p>${socialFeed.getCurrentUser() ? 'Be the first to share a take!' : 'Sign up to start posting'}</p></div>`;
        return;
    }
    c.innerHTML = items.map(i => i._source === 'backend' ? renderPick(i) : renderPost(i)).join('');
}

// ==================== RENDER POST ====================
function renderPost(p) {
    const likes = socialFeed.getLikeCount(p.id);
    const cmts = socialFeed.getCommentCount(p.id);
    const liked = socialFeed.hasLiked(p.id);
    const user = socialFeed.getCurrentUser();
    const isOwn = user && (p.userId === user.id || p.userId === user.username);
    const letter = (p.displayName || p.username || '?')[0].toUpperCase();
    const cls = `feed-item${p.pinned ? ' pinned' : ''}${p.type === 'hot-take' ? ' hot-take' : ''}`;

    let badge = '';
    if (p.type === 'hot-take') badge = '<span class="fi-badge fi-badge-take">Hot Take</span>';
    else if (p.type === 'poll') badge = '<span class="fi-badge fi-badge-poll">Poll</span>';
    if (p.pinned) badge += ' <span class="fi-badge fi-badge-pinned"><i class="fas fa-thumbtack"></i> Pinned</span>';

    let content = `<div class="fi-content">${esc(p.content)}</div>`;

    if (p.type === 'poll' && p.pollOptions) {
        const total = p.pollOptions.reduce((s, o) => s + o.votes, 0);
        const voted = socialFeed.hasVotedPoll(p.id);
        content += '<div class="poll-display">';
        p.pollOptions.forEach((o, i) => {
            const pct = total > 0 ? Math.round(o.votes / total * 100) : 0;
            content += `<div class="poll-opt ${voted ? 'voted' : ''}" onclick="${voted ? '' : `votePoll('${p.id}',${i})`}">
                ${voted ? `<div class="poll-bar" style="width:${pct}%"></div>` : ''}
                <div class="poll-opt-inner"><span>${esc(o.text)}</span>${voted ? `<span class="poll-pct">${pct}%</span>` : ''}</div>
            </div>`;
        });
        content += `<div class="poll-total">${total} vote${total !== 1 ? 's' : ''}</div></div>`;
    }

    return `<div class="${cls}" id="c-${p.id}">
        <div class="fi-header">
            <div class="fi-avatar">${letter}</div>
            <div class="fi-meta">
                <div class="fi-top-row">
                    <span class="fi-name"><a href="profile.html?user=${p.username}">${p.displayName || p.username}</a></span>
                    <span class="fi-handle">@${p.username}</span>
                    <span class="fi-dot">&bull;</span>
                    <span class="fi-time">${socialFeed.timeAgo(p.createdAt)}</span>
                </div>
                <div style="display:flex;gap:4px;margin-top:3px;">${badge} ${p.sport ? `<span class="fi-sport">${p.sport}</span>` : ''}</div>
            </div>
            ${isOwn ? `<button class="fi-delete" onclick="delPost('${p.id}')"><i class="fas fa-trash-alt"></i></button>` : ''}
        </div>
        ${content}
        <div class="fi-actions">
            <button class="fi-action ${liked ? 'liked' : ''}" onclick="like('${p.id}',this)"><i class="fas fa-heart"></i> ${likes}</button>
            <button class="fi-action" onclick="togCmts('${p.id}')"><i class="fas fa-comment"></i> ${cmts}</button>
            <button class="fi-action" onclick="share('${p.id}')"><i class="fas fa-share"></i> Share</button>
        </div>
        <div class="comments-section" id="cs-${p.id}">
            <div class="cmt-input-row">
                <input class="cmt-input" id="ci-${p.id}" placeholder="Write a comment..." onkeypress="if(event.key==='Enter')postCmt('${p.id}')">
                <button class="cmt-submit" onclick="postCmt('${p.id}')">Post</button>
            </div>
            <div id="cl-${p.id}">${renderCmts(p.id)}</div>
        </div>
    </div>`;
}

// ==================== RENDER BACKEND PICK ====================
function renderPick(p) {
    const un = p.username || 'Unknown';
    const letter = un[0].toUpperCase();
    const odds = p.odds_snapshot > 0 ? `+${p.odds_snapshot}` : `${p.odds_snapshot}`;
    const st = p.status || 'pending';
    const sport = p.sport_key?.split('_')[1]?.toUpperCase() || '';

    return `<div class="feed-item" id="c-pick-${p.id}">
        <div class="fi-header">
            <div class="fi-avatar">${letter}</div>
            <div class="fi-meta">
                <div class="fi-top-row">
                    <span class="fi-name"><a href="profile.html?user=${un}">${un}</a></span>
                    <span class="fi-handle">@${un}</span>
                    <span class="fi-dot">&bull;</span>
                    <span class="fi-time">${socialFeed.timeAgo(p.createdAt)}</span>
                </div>
                <div style="display:flex;gap:4px;margin-top:3px;">
                    <span class="fi-badge fi-badge-pick">Pick</span>
                    ${sport ? `<span class="fi-sport">${sport}</span>` : ''}
                </div>
            </div>
        </div>
        <div class="pick-embed">
            <div class="pe-matchup">
                <div class="pe-team-icon">${(p.away_team || p.selection || '?')[0]}</div>
                <span>${p.away_team || p.selection || 'TBD'}</span>
                <span class="pe-vs">VS</span>
                <div class="pe-team-icon">${(p.home_team || '?')[0]}</div>
                <span>${p.home_team || 'TBD'}</span>
            </div>
            <div class="pe-details">
                <span><i class="fas fa-crosshairs"></i>${p.market_type || 'Pick'}: ${p.selection || 'N/A'}</span>
                <span><i class="fas fa-chart-line"></i>${odds}</span>
                ${p.units ? `<span><i class="fas fa-coins"></i>${p.units}u</span>` : ''}
            </div>
            <span class="pe-status ${st}">${st}</span>
        </div>
        <div class="fi-actions">
            <button class="fi-action" onclick="like('pick-${p.id}',this)"><i class="fas fa-heart"></i> ${p.likes_count || 0}</button>
            <button class="fi-action" onclick="togCmts('pick-${p.id}')"><i class="fas fa-comment"></i> ${p.comments_count || 0}</button>
            <button class="fi-action" onclick="share('pick-${p.id}')"><i class="fas fa-share"></i> Share</button>
        </div>
        <div class="comments-section" id="cs-pick-${p.id}">
            <div class="cmt-input-row">
                <input class="cmt-input" id="ci-pick-${p.id}" placeholder="Write a comment..." onkeypress="if(event.key==='Enter')postCmt('pick-${p.id}')">
                <button class="cmt-submit" onclick="postCmt('pick-${p.id}')">Post</button>
            </div>
            <div id="cl-pick-${p.id}"></div>
        </div>
    </div>`;
}

// ==================== COMMENTS ====================
function renderCmts(id) {
    return socialFeed.getComments(id).map(c =>
        `<div class="cmt-item"><div class="cmt-avatar">${(c.displayName || c.username || '?')[0].toUpperCase()}</div><div class="cmt-body"><div class="cmt-author">${c.displayName || c.username}</div><div class="cmt-text">${esc(c.content)}</div><div class="cmt-time">${socialFeed.timeAgo(c.createdAt)}</div></div></div>`
    ).join('');
}

function togCmts(id) {
    document.getElementById(`cs-${id}`)?.classList.toggle('show');
}

function postCmt(id) {
    if (!socialFeed.getCurrentUser()) { alert('Log in to comment.'); return; }
    const inp = document.getElementById(`ci-${id}`);
    if (!inp.value.trim()) return;
    socialFeed.addComment(id, inp.value.trim());
    inp.value = '';
    document.getElementById(`cl-${id}`).innerHTML = renderCmts(id);
    const card = document.getElementById(`c-${id}`);
    if (card) {
        const b = card.querySelectorAll('.fi-action')[1];
        if (b) b.innerHTML = `<i class="fas fa-comment"></i> ${socialFeed.getCommentCount(id)}`;
    }
}

// ==================== INTERACTIONS ====================
function like(id, btn) {
    if (!socialFeed.getCurrentUser()) { alert('Log in to like.'); return; }
    const liked = socialFeed.toggleLike(id, 'post');
    btn.classList.toggle('liked', liked);
    btn.innerHTML = `<i class="fas fa-heart"></i> ${socialFeed.getLikeCount(id)}`;
}

function delPost(id) {
    if (confirm('Delete this post?')) { socialFeed.deletePost(id); loadFeed(); }
}

function share(id) {
    navigator.clipboard?.writeText(`${location.origin}/activity.html?post=${id}`);
    alert('Link copied!');
}

function votePoll(id, i) {
    if (!socialFeed.getCurrentUser()) { alert('Log in to vote.'); return; }
    socialFeed.votePoll(id, i);
    loadFeed();
}

function setFilter(f, btn) {
    currentFilter = f;
    document.querySelectorAll('.feed-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadFeed();
}

function loadMorePosts() { loadFeed(); }

// ==================== SIDEBAR ====================
function loadTrending() {
    const tags = {};
    socialFeed.posts.forEach(p => {
        (p.tags || []).forEach(t => { tags[t] = (tags[t] || 0) + 1; });
        if (p.sport && !p.tags?.includes(p.sport)) tags[p.sport] = (tags[p.sport] || 0) + 1;
    });
    const sorted = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 5);
    document.getElementById('trendingList').innerHTML = sorted.length > 0
        ? sorted.map(([t, c], i) => `<div class="rs-item"><span class="rs-rank">${i + 1}</span><span class="rs-text">${t}</span><span class="rs-count">${c} posts</span></div>`).join('')
        : '<div style="color:var(--text-muted);font-size:0.85rem;">No trends yet</div>';
}

function loadSuggested() {
    const users = JSON.parse(localStorage.getItem('trustmyrecord_users') || '[]').slice(0, 3);
    const el = document.getElementById('suggestedList');
    if (!users.length) {
        el.innerHTML = `
            <div class="rs-user"><div class="rs-user-avatar" style="background:#22c55e;">B</div><div class="rs-user-info"><div class="rs-user-name">BetLegend</div><div class="rs-user-detail">Founder</div></div><button class="rs-follow-btn">Follow</button></div>
            <div class="rs-user"><div class="rs-user-avatar" style="background:#3b82f6;">D</div><div class="rs-user-info"><div class="rs-user-name">Demo User</div><div class="rs-user-detail">12 picks</div></div><button class="rs-follow-btn">Follow</button></div>`;
        return;
    }
    el.innerHTML = users.map(u =>
        `<div class="rs-user"><div class="rs-user-avatar" style="background:#3b82f6;">${(u.displayName || u.username || '?')[0].toUpperCase()}</div><div class="rs-user-info"><div class="rs-user-name">${u.displayName || u.username}</div><div class="rs-user-detail">${u.stats?.totalPicks || 0} picks</div></div><button class="rs-follow-btn">Follow</button></div>`
    ).join('');
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

function handleLogin() {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value;
    if (!user || !pass) { showErr('loginError', 'All fields required.'); return; }
    try {
        if (typeof auth !== 'undefined' && auth.login) {
            const r = auth.login(user, pass);
            if (r) { closeModals(); location.reload(); return; }
        }
        showErr('loginError', 'Invalid credentials.');
    } catch (e) { showErr('loginError', e.message || 'Login failed.'); }
}

function handleSignup() {
    const username = document.getElementById('signupUser').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const pass = document.getElementById('signupPass').value;
    if (!username || !email || !pass) { showErr('signupError', 'All fields required.'); return; }
    if (pass.length < 6) { showErr('signupError', 'Password must be 6+ characters.'); return; }
    try {
        if (typeof auth !== 'undefined' && auth.register) {
            const r = auth.register(username, email, pass);
            if (r) { closeModals(); location.reload(); return; }
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
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}
