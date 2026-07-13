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

const TMR_GENERATED_USER_RE = /^(qa_|test|audit|tmrverify|tmrtest|tmrcheck|tmrflow|tmrhangout|tmrlogin|tmrfast|tmrnhl|tmrlive|tmrpick|tmrprobe|tmrtokens|tmr_ui_|tmr_probe_|nhlverify|flowverify|cleanprobe|freshcool|freshafter|sportsbook_|user_|probe|signup_test|smoke_|playwright|cypress|demo)|(^|[_-])(test|demo|mock|seed|sample|fixture|dummy|placeholder|synthetic|fake)([_-]|[0-9]|$)/i;

function isRealPublicFeedUser(item) {
    const username = String(getUsername(item) || '').trim();
    const display = String(getDisplayName(item) || '').trim();
    if (username && TMR_GENERATED_USER_RE.test(username)) return false;
    if (display && TMR_GENERATED_USER_RE.test(display)) return false;
    return true;
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

// Builds a privacy-safe aggregate breakdown of a graded-pick batch.
// Distinguishes picks PROCESSED from picks that COUNT toward the win/loss record
// (pushes, voids, and cancellations are processed but record-neutral). Never
// exposes individual pick details. Returns '' when batch outcome data is absent
// or incoherent (e.g. cumulative vs. batch scope mismatch).
function getGradedBreakdownText(item) {
    const processed = Number(item.pick_count || item.count || 0);
    const wins = Number(item.wins_count || 0);
    const losses = Number(item.losses_count || 0);
    const pushes = Number(item.pushes_count || 0);
    const voids = Number(item.voids_count || 0);
    const counted = wins + losses + pushes + voids;
    // Only render when batch counts are present and consistent with the processed total.
    if (counted === 0 || counted > processed) return '';
    const parts = [];
    if (wins > 0) parts.push(wins + (wins === 1 ? ' win' : ' wins'));
    if (losses > 0) parts.push(losses + (losses === 1 ? ' loss' : ' losses'));
    const neutral = pushes + voids;
    if (neutral > 0) parts.push(neutral + ' push/void/ineligible');
    const unresolved = processed - counted;
    if (unresolved > 0) parts.push(unresolved + ' pending');
    if (!parts.length) return '';
    return processed + ' pick' + (processed === 1 ? '' : 's') + ' processed: ' + parts.join(', ');
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

// Single source of the grading-rules explanation. The text lives in ONE shared
// popover element appended to <body>; every "How grading works" trigger beside a
// "Picks graded" heading points at that single element. It is never duplicated
// inside individual graded-pick cards. Hover or click opens it; it is clamped to
// the viewport so it never overflows on mobile.
var GRADING_EXPLAIN_TEXT = 'Pushes, voids, and ineligible picks are processed but do not change the win/loss record. Pick details stay hidden until eligible for public record.';

function gradingInfoHtml() {
    // Renders only the trigger button -- no per-card explanation text.
    return ' <button type="button" class="grading-info-btn" aria-label="How grading works" aria-expanded="false"' +
        ' onclick="toggleGradingInfo(event,this)" onmouseenter="showGradingInfo(this)" onmouseleave="scheduleHideGradingInfo()">' +
        '<i class="fas fa-circle-info"></i> How grading works</button>';
}

function gradingInfoPopEl() {
    var el = document.getElementById('gradingInfoPopover');
    if (!el) {
        el = document.createElement('div');
        el.id = 'gradingInfoPopover';
        el.className = 'grading-info-pop';
        el.setAttribute('role', 'tooltip');
        el.textContent = GRADING_EXPLAIN_TEXT;
        el.addEventListener('mouseenter', function () { if (_gradingHideTimer) { clearTimeout(_gradingHideTimer); _gradingHideTimer = null; } });
        el.addEventListener('mouseleave', scheduleHideGradingInfo);
        (document.body || document.documentElement).appendChild(el);
    }
    return el;
}

function positionGradingInfo(btn) {
    var el = gradingInfoPopEl();
    var r = btn.getBoundingClientRect();
    var pw = el.offsetWidth || 260;
    var ph = el.offsetHeight || 80;
    var left = Math.max(10, Math.min(r.left, window.innerWidth - pw - 10));
    var top = r.bottom + 8;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 8); // flip above if no room below
    el.style.left = left + 'px';
    el.style.top = top + 'px';
}

var _gradingHideTimer = null;
var _gradingPinned = false;

function showGradingInfo(btn) {
    if (_gradingHideTimer) { clearTimeout(_gradingHideTimer); _gradingHideTimer = null; }
    positionGradingInfo(btn);
    gradingInfoPopEl().classList.add('is-visible');
}

function scheduleHideGradingInfo() {
    if (_gradingPinned) return;
    _gradingHideTimer = setTimeout(function () { gradingInfoPopEl().classList.remove('is-visible'); }, 140);
}

function toggleGradingInfo(ev, btn) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    var el = gradingInfoPopEl();
    _gradingPinned = !_gradingPinned;
    btn.setAttribute('aria-expanded', _gradingPinned ? 'true' : 'false');
    if (_gradingPinned) {
        positionGradingInfo(btn);
        el.classList.add('is-visible');
        setTimeout(function () {
            document.addEventListener('click', function closer(e) {
                if (e.target !== btn && !el.contains(e.target)) {
                    _gradingPinned = false;
                    el.classList.remove('is-visible');
                    btn.setAttribute('aria-expanded', 'false');
                    document.removeEventListener('click', closer);
                }
            });
        }, 0);
    } else {
        el.classList.remove('is-visible');
    }
}

(function injectGradingInfoStyles() {
    if (typeof document === 'undefined' || document.getElementById('grading-info-styles')) return;
    var css =
        '.grading-info-btn{display:inline-flex;align-items:center;gap:5px;margin-left:8px;vertical-align:middle;font-weight:400;background:transparent;border:1px solid var(--border-color,rgba(255,255,255,.15));color:var(--text-secondary,#9aa4b2);font-size:0.72rem;line-height:1;padding:3px 8px;border-radius:999px;cursor:pointer;}' +
        '.grading-info-btn:hover,.grading-info-btn:focus{color:var(--text-primary,#fff);border-color:var(--accent,#3b82f6);outline:none;}' +
        '.grading-info-btn i{font-size:0.78rem;}' +
        '.grading-info-pop{position:fixed;left:0;top:0;z-index:9999;width:260px;max-width:calc(100vw - 20px);background:var(--card-bg,#1a2230);color:var(--text-secondary,#c5cdd8);border:1px solid var(--border-color,rgba(255,255,255,.18));border-radius:10px;padding:10px 12px;font-size:0.78rem;line-height:1.45;box-shadow:0 10px 28px rgba(0,0,0,.4);font-weight:400;opacity:0;visibility:hidden;transform:translateY(-4px);transition:opacity .12s,transform .12s,visibility .12s;pointer-events:none;}' +
        '.grading-info-pop.is-visible{opacity:1;visibility:visible;transform:translateY(0);pointer-events:auto;}';
    var style = document.createElement('style');
    style.id = 'grading-info-styles';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
})();

function renderPickCard(item) {
    const id = item.pick_id || item.id || item.item_id;
    const status = normalizePickStatus(item);
    const isPending = status === 'pending' || status === 'locked';
    const count = Number(item.pick_count || item.count || 1);
    const action = isPending
        ? '<i class="fas fa-lock"></i> Submitted locked picks'
        : '<i class="fas fa-clipboard-check"></i> Picks graded' + gradingInfoHtml();
    let body;
    if (isPending) {
        body = '<div class="pick-embed is-private">' +
            '<div class="pe-row"><span class="pe-chip is-sport"><i class="fas fa-lock"></i> Status: Awaiting grade</span><span class="pe-chip">' + count + ' locked pick' + (count === 1 ? '' : 's') + '</span></div>' +
            '<div class="pe-team">Pick details hidden until eligible for public record.</div>' +
        '</div>';
    } else {
        const breakdown = getGradedBreakdownText(item);
        body = '<div class="pick-embed">' +
            '<div class="pe-row">' +
                '<span class="pe-chip is-sport">Verified record update</span>' +
                '<span class="pe-chip is-won">' + count + ' pick' + (count === 1 ? '' : 's') + ' processed</span>' +
            '</div>' +
            (breakdown
                ? '<div class="pe-team">' + esc(breakdown) + '</div>'
                : '<div class="pe-team">Verified record updated.</div>') +
            '<div style="margin-top:5px;color:var(--text-muted);font-size:0.86rem;">Current overall record: ' + esc(getRecordText(item)) + '</div>' +
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
    const questionCount = Number(item.question_count || 0);
    const optionsHtml = opts.length
        ? opts.map((opt, idx) => {
            const optionId = opt.id || opt.option_id || idx;
            const votes = Number(opt.votes || opt.vote_count || 0);
            const pct = total > 0 ? Math.round(votes / total * 100) : 0;
            return '<button class="poll-option" onclick="votePoll(' + jsArg(id) + ', ' + jsArg(optionId) + ')"><span>' + esc(opt.text || opt.label || ('Option ' + (idx + 1))) + '</span><strong>' + pct + '%</strong></button>';
        }).join('')
        : questionCount > 1
            ? '<a class="poll-option" href="/polls/#poll-' + esc(id) + '" style="text-decoration:none;"><span>' + questionCount + '-question prediction quiz</span><strong>Enter &rarr;</strong></a>'
            : '<a class="poll-option" href="/polls/#poll-' + esc(id) + '" style="text-decoration:none;"><span>Open this poll to vote</span><strong>View &rarr;</strong></a>';
    return '<div class="feed-item" data-id="' + esc(id) + '" data-type="feed_post">' +
        renderFeedHeader(item, '<i class="fas fa-square-poll-vertical"></i> created a poll') +
        '<div class="fi-content">' + esc(item.content || item.title || '') + '</div>' +
        '<div class="pick-embed"><div style="display:grid;gap:8px;">' + optionsHtml + '</div><div style="margin-top:9px;color:var(--text-muted);font-size:0.78rem;">' + total + ' vote' + (total === 1 ? '' : 's') + '</div></div>' +
        renderActionRow(id, 'feed_post', item.liked_by_user || item.user_liked, item.likes_count, item.comments_count, true) +
    '</div>';
}

// ==================== COMMUNITY MILESTONES ====================
var MILESTONE_META = {
    joined: { icon: 'fa-user-plus', label: 'joined the community' },
    first_pick: { icon: 'fa-flag-checkered', label: 'made their first official pick' },
    first_win: { icon: 'fa-medal', label: 'recorded their first win' },
    pick_count: { icon: 'fa-chart-line', label: 'hit a pick milestone' },
    verified: { icon: 'fa-certificate', label: 'earned Verified Handicapper status' },
    win_streak: { icon: 'fa-fire', label: 'is heating up' },
    first_follower: { icon: 'fa-user-group', label: 'gained their first follower' },
    profitable_month: { icon: 'fa-arrow-trend-up', label: 'finished a profitable month' },
    award: { icon: 'fa-trophy', label: 'earned an award' },
    joined_summary: { icon: 'fa-users', label: 'community update' }
};

function renderMilestoneCard(item) {
    const mtype = String(item.post_type || item.milestone_type || 'milestone');
    const meta = MILESTONE_META[mtype] || { icon: 'fa-star', label: 'community milestone' };
    const badge = '<span class="fi-badge fi-badge-milestone"><i class="fas ' + meta.icon + '"></i> Milestone</span>';
    const id = String(item.item_id || '');
    const username = getUsername(item);

    // Daily signup summary rows have no single user — render a compact site card.
    if (mtype === 'joined_summary' || !username) {
        return '<div class="feed-item fi-milestone" data-id="' + esc(id) + '" data-type="milestone">' +
            '<div class="fi-header">' +
                '<div class="fi-avatar fi-avatar-site"><i class="fas fa-users"></i></div>' +
                '<div class="fi-meta"><div class="fi-top-row">' +
                    '<span class="fi-name">TrustMyRecord</span>' +
                    '<span class="fi-dot">&bull;</span>' +
                    '<span class="fi-time">' + esc(timeAgo(item.created_at)) + '</span>' +
                '</div></div>' +
            '</div>' +
            '<div class="fi-action-label">' + badge + '</div>' +
            '<div class="fi-content">' + esc(item.content || '') + '</div>' +
        '</div>';
    }

    const action = badge + ' <i class="fas ' + meta.icon + '"></i> ' + meta.label;
    let detailLink = '';
    if (mtype === 'award') {
        detailLink = '<a class="fi-milestone-link" href="/profile/?user=' + encodeURIComponent(username) + '#awards"><i class="fas fa-trophy"></i> View awards</a>';
    } else if (['pick_count', 'win_streak', 'first_win', 'first_pick', 'verified', 'profitable_month'].indexOf(mtype) !== -1) {
        detailLink = '<a class="fi-milestone-link" href="/profile/?user=' + encodeURIComponent(username) + '&view=picks"><i class="fas fa-clipboard-list"></i> View record</a>';
    }

    const congrats = '<div class="fi-actions">' +
        '<button class="fi-action fi-congrats ' + (item.congratsed_by_user ? 'is-congratsed' : '') + '" onclick="toggleCongrats(' + jsArg(id) + ', this)">' +
            '<i class="fas fa-hands-clapping"></i> Congrats <span>' + (Number(item.likes_count) || 0) + '</span>' +
        '</button>' +
    '</div>';

    return '<div class="feed-item fi-milestone" data-id="' + esc(id) + '" data-type="milestone">' +
        renderFeedHeader(item, action) +
        '<div class="fi-content">' + esc(item.content || '') + (detailLink ? ' ' + detailLink : '') + '</div>' +
        congrats +
    '</div>';
}

async function toggleCongrats(itemId, btn) {
    const viewer = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
    if (!viewer) { openModal('login'); return; }
    const mid = String(itemId).replace(/^milestone:/, '');
    if (!/^\d+$/.test(mid)) return;
    const isOn = btn.classList.contains('is-congratsed');
    btn.disabled = true;
    try {
        const res = await api.request('/milestones/' + mid + '/congrats', { method: isOn ? 'DELETE' : 'POST' });
        btn.classList.toggle('is-congratsed', !isOn);
        const span = btn.querySelector('span');
        if (span && res && typeof res.congrats_count !== 'undefined') span.textContent = String(res.congrats_count);
    } catch (e) {}
    btn.disabled = false;
}

// Milestone privacy preference (small row near the feed tabs, logged-in only).
async function initMilestonePref() {
    const row = document.getElementById('milestonePrefRow');
    if (!row) return;
    const viewer = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
    if (!viewer) { row.style.display = 'none'; return; }
    try {
        const s = await api.request('/milestones/settings');
        row.style.display = 'flex';
        renderMilestonePref(row, s.milestones_public !== false);
    } catch (e) { row.style.display = 'none'; }
}

function renderMilestonePref(row, isOn) {
    row.innerHTML = '<span><i class="fas fa-bullhorn"></i> Public milestone announcements</span>' +
        '<button class="milestone-pref-toggle ' + (isOn ? 'is-on' : '') + '" onclick="toggleMilestonePref(this)">' + (isOn ? 'On' : 'Off') + '</button>';
}

async function toggleMilestonePref(btn) {
    const row = document.getElementById('milestonePrefRow');
    const next = !btn.classList.contains('is-on');
    btn.disabled = true;
    try {
        const res = await api.request('/milestones/settings', { method: 'PUT', body: { milestones_public: next } });
        renderMilestonePref(row, res.milestones_public !== false);
    } catch (e) { btn.disabled = false; }
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
    const activityCount = Number(item.activity_count || item.pick_count || 0);
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
        created_at: item.graded_at || item.grade_verified_at || item.created_at || item.locked_at,
        pick_count: activityCount || undefined,
        wins: item.record_wins != null ? item.record_wins : item.wins,
        losses: item.record_losses != null ? item.record_losses : item.losses,
        pushes: item.record_pushes != null ? item.record_pushes : item.pushes,
        net_units: item.net_units != null ? item.net_units : item.user_net_units,
        win_rate: item.win_rate,
        wins_count: item.wins_count,
        losses_count: item.losses_count,
        pushes_count: item.pushes_count,
        voids_count: item.voids_count
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
        const itemCount = Number(item.pick_count || item.activity_count || 1) || 1;
        if (!existing) {
            pickGroups.set(key, {
                ...item,
                item_id: 'pick_group_' + feedId(key),
                pick_id: 'pick_group_' + feedId(key),
                pick_count: itemCount,
                wins_count: Number(item.wins_count || 0),
                losses_count: Number(item.losses_count || 0),
                pushes_count: Number(item.pushes_count || 0),
                voids_count: Number(item.voids_count || 0),
                status: bucket === 'locked' ? 'pending' : 'graded'
            });
            return;
        }
        existing.pick_count += itemCount;
        existing.wins_count = Number(existing.wins_count || 0) + Number(item.wins_count || 0);
        existing.losses_count = Number(existing.losses_count || 0) + Number(item.losses_count || 0);
        existing.pushes_count = Number(existing.pushes_count || 0) + Number(item.pushes_count || 0);
        existing.voids_count = Number(existing.voids_count || 0) + Number(item.voids_count || 0);
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
            const filterParam = currentFilter === 'hot-takes' ? 'posts'
                : currentFilter === 'site-updates' ? 'site_updates'
                : currentFilter;
            const data = await api.request('/feed?limit=' + FEED_LIMIT + '&offset=' + feedOffset + '&filter=' + encodeURIComponent(filterParam));
            items = (data.feed || []).filter(isRealPublicFeedUser).map(item => {
                if (
                    item.item_type === 'pick' ||
                    item.item_type === 'pick_activity' ||
                    item.post_type === 'pick' ||
                    item.post_type === 'pick_share' ||
                    item.post_type === 'graded_pick_summary' ||
                    item.post_type === 'locked_pick_summary'
                ) return normalizePublicPick(item);
                return item;
            });

            if (currentFilter === 'all' || currentFilter === 'picks') {
                try {
                    const discover = await api.request('/social/discover?limit=12');
                    const picks = (discover.picks || [])
                        .filter(isRealPublicFeedUser)
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
                    const activePolls = (pollData.polls || []).filter(isRealPublicFeedUser);
                    // /polls/active does not include the per-option array, which left
                    // feed poll cards rendering "Poll options are not available."
                    // Hydrate the options (and true vote totals) from each poll detail.
                    const hydrated = await Promise.all(activePolls.map(async p => {
                        const questionCount = parseInt(p.question_count) || 0;
                        let options = Array.isArray(p.options) ? p.options : [];
                        let totalVotes = parseInt(p.total_votes != null ? p.total_votes : p.vote_count) || 0;
                        if (!options.length && questionCount <= 1) {
                            try {
                                const detail = await api.request('/polls/' + p.id);
                                options = (detail.options || []).map(o => ({
                                    id: o.id,
                                    text: o.option_text,
                                    votes: parseInt(o.vote_count) || 0
                                }));
                                totalVotes = parseInt(detail.total_votes) || totalVotes;
                            } catch(e) {}
                        }
                        return { p: p, options: options, totalVotes: totalVotes, questionCount: questionCount };
                    }));
                    hydrated.forEach(h => items.push({
                        item_type: 'poll',
                        post_type: 'poll',
                        item_id: 'poll_' + h.p.id,
                        poll_id: h.p.id,
                        content: h.p.title,
                        description: h.p.description,
                        username: h.p.creator_username || h.p.username,
                        display_name: h.p.creator_display_name || h.p.display_name || h.p.username,
                        avatar_url: h.p.avatar_url,
                        sport: h.p.sport,
                        created_at: h.p.created_at,
                        options: h.options,
                        total_votes: h.totalVotes,
                        question_count: h.questionCount,
                        status: h.p.status,
                        likes_count: 0,
                        comments_count: 0
                    }));
                } catch(e) {}
            }

            // Authenticated viewers: merge real notifications as activity rows so
            // graded picks, friend accepts, challenge wins, comments, replies, and
            // trivia events surface in the feed when the backend emits them.
            if (currentFilter === 'all' || currentFilter === 'following') {
                try {
                    const viewer = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
                    if (viewer) {
                        const notif = await api.request('/notifications?limit=20');
                        const allowed = new Set(['pick_graded','friend_accepted','achievement','challenge_joined','challenge_won','challenge_lost','trivia_created','trivia_answered','comment_created','reply_created','poll_voted','blog_published','recap_posted','follow','followed']);
                        (notif.notifications || []).filter(n => allowed.has(String(n.type))).filter(isRealPublicFeedUser).forEach(n => items.push({
                            item_type: 'activity',
                            post_type: 'activity',
                            item_id: 'notif_' + n.id,
                            content: n.content || n.message || '',
                            username: n.actor_username || n.username || viewer.username,
                            display_name: n.actor_display_name || n.display_name || n.username || viewer.username,
                            avatar_url: n.actor_avatar_url || n.avatar_url,
                            sport: n.sport,
                            created_at: n.created_at,
                            notif_type: n.type,
                            activity_type: n.type,
                            likes_count: 0,
                            comments_count: 0
                        }));
                    }
                } catch(e) {}
            }

            const userMap = await fetchPublicUsersByName(items.map(i => getUsername(i)));
            items = items.map(i => attachUserRecord(i, userMap[getUsername(i)]));
            items = aggregateFeedItems(items);
            items.sort((a, b) => new Date(b.graded_at || b.created_at || b.locked_at || 0) - new Date(a.graded_at || a.created_at || a.locked_at || 0));
            if (currentFilter === 'hot-takes') items = items.filter(i => i.post_type === 'hot_take');
            if (currentFilter === 'picks') items = items.filter(i => i.item_type === 'pick' || i.post_type === 'pick' || i.post_type === 'pick_share');
            if (currentFilter === 'polls') items = items.filter(i => i.item_type === 'poll' || i.post_type === 'poll');
            if (currentFilter === 'milestones') items = items.filter(i => i.item_type === 'milestone');
        }
    } catch(e) {
        renderFeedUnavailable('Live feed data is temporarily unavailable. TrustMyRecord does not substitute fake feed posts when the backend is unavailable.');
        return;
    }

    updateHeroCounts(items.length);
    if (!items.length) {
        c.innerHTML = '<div class="empty-state"><i class="fas fa-stream"></i><h3>No activity yet.</h3><p>Follow handicappers or make your first pick to start building the feed.</p></div>';
        const lm = document.getElementById('loadMore');
        if (lm) lm.style.display = 'none';
        return;
    }

    c.innerHTML = items.map(renderFeedItem).join('');
    const lm = document.getElementById('loadMore');
    if (lm) lm.style.display = items.length >= FEED_LIMIT ? 'block' : 'none';

    if (!window.__msPrefInit) {
        window.__msPrefInit = true;
        try { initMilestonePref(); } catch (e) {}
    }
}

function updateHeroCounts(visibleCount) {
    const activityEl = document.getElementById('heroActivityCount');
    const visibleEl = document.getElementById('heroVisibleCount');
    const filterEl = document.getElementById('heroFilterLabel');
    const labels = {
        all: 'For You',
        picks: 'Picks',
        milestones: 'Milestones',
        'hot-takes': 'Hot Takes',
        polls: 'Polls',
        following: 'Following',
        'site-updates': 'Site Updates'
    };

    if (activityEl) activityEl.textContent = visibleCount > 0 ? String(visibleCount) : 'Live';
    if (visibleEl) visibleEl.textContent = String(visibleCount || 0);
    if (filterEl) filterEl.textContent = labels[currentFilter] || 'For You';
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
        const picks = (data.picks || []).filter(isRealPublicFeedUser).filter(p => p.is_public !== false && !p.is_private && !['pending', 'locked'].includes(String(p.status || '').toLowerCase()));
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
    el.innerHTML = '<div class="rs-empty">Public graded picks will surface here as real records update. Pending pick details stay private.</div>';
}

async function loadTopCappers() {
    const el = document.getElementById('topCappersList');
    if (!el) return;
    try {
        const data = await api.request('/users?limit=10');
        const users = (data.users || []).filter(isRealPublicFeedUser).filter(u => Number(u.total_picks || 0) > 0);
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
    el.innerHTML = '<div class="rs-empty">Top cappers will appear once verified public records have enough graded picks.</div>';
}

async function loadArenaWatch() {
    const el = document.getElementById('arenaWatchList');
    if (!el) return;
    try {
        const data = await api.request('/social/discover?limit=3');
        const picks = (data.picks || []).filter(isRealPublicFeedUser).filter(p => p.is_public !== false && !p.is_private && !['pending', 'locked'].includes(String(p.status || '').toLowerCase()));
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
    el.innerHTML = '<div class="rs-empty">Arena challenges, forum momentum, polls, trivia, and graded record updates will appear here as real activity builds.</div>';
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

// Honor /feed/?filter=<tab> deep links (used by milestone notifications).
(function () {
    try {
        const f = new URLSearchParams(location.search).get('filter');
        const valid = ['all', 'picks', 'milestones', 'hot-takes', 'polls', 'following', 'site-updates'];
        if (f && valid.indexOf(f) !== -1 && typeof currentFilter !== 'undefined') {
            currentFilter = f;
            document.addEventListener('DOMContentLoaded', function () {
                document.querySelectorAll('.feed-tab').forEach(b => {
                    b.classList.toggle('active', (b.getAttribute('onclick') || '').indexOf("'" + f + "'") !== -1);
                });
            });
        }
    } catch (e) {}
})();
