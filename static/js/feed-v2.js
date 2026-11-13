/* FEED_V2_20261113: feed redesign layer. Loads after feed-ui-overrides.js and
   re-declares the card renderers and the rail loaders so the page matches the
   new feed layout. Real backend data only: every module here reads the same
   endpoints the feed already used and closes up silently when one is empty. */

function fvApiBase() {
    return (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) || 'https://api.trustmyrecord.com/api';
}

function fvAva(username, url) {
    return url || (fvApiBase() + '/users/' + encodeURIComponent(username || '') + '/avatar?s=96');
}

function fvUnits(value, digits) {
    const n = Number(value);
    if (!isFinite(n)) return '';
    return (n >= 0 ? '+' : '') + n.toFixed(digits == null ? 2 : digits) + 'u';
}

function fvPlural(n, word, plural) {
    return n + ' ' + (n === 1 ? word : (plural || word + 's'));
}

function fvKind(item) {
    const it = String(item.item_type || '');
    const pt = String(item.post_type || '').toLowerCase();
    if (it === 'milestone') return { cls: 'milestone', icon: 'fa-trophy', label: 'Milestone' };
    if (it === 'poll' || pt === 'poll') return { cls: 'poll', icon: 'fa-chart-simple', label: 'Poll' };
    if (it === 'pick' || pt === 'pick' || pt === 'pick_share') return { cls: 'pick', icon: 'fa-check', label: 'Pick' };
    if (pt === 'hot_take') return { cls: 'take', icon: 'fa-fire', label: 'Hot Take' };
    if (pt === 'pick_recap') return { cls: 'recap', icon: 'fa-chart-line', label: 'Recap' };
    if (it === 'activity') return { cls: 'activity', icon: 'fa-bell', label: 'Activity' };
    if (it === 'trivia_activity') return { cls: 'poll', icon: 'fa-circle-question', label: 'Trivia' };
    return { cls: 'post', icon: 'fa-pen', label: 'Post' };
}

// ==================== CARD RENDERERS ====================
function renderFeedHeader(item, actionHtml) {
    const username = getUsername(item);
    const display = getDisplayName(item);
    const profile = username ? '/profile/?user=' + encodeURIComponent(username) : '/handicappers/';
    const kind = fvKind(item);
    const record = getRecordText(item);
    const graded = Number(item.record_wins ?? item.wins ?? item.user_wins ?? 0) + Number(item.record_losses ?? item.losses ?? item.user_losses ?? 0) + Number(item.record_pushes ?? item.pushes ?? item.user_pushes ?? 0);
    const hasRecord = record !== 'public record pending' && graded > 0;
    return '<div class="fi-header">' +
        getAvatarHtml(item, 'fi-avatar') +
        '<div class="fi-meta">' +
            '<div class="fi-top-row">' +
                '<span class="fi-name"><a href="' + profile + '">' + esc(display) + '</a></span>' +
                '<span class="fi-time">' + esc(timeAgo(item.created_at || item.locked_at || item.graded_at || item.updated_at)) + '</span>' +
            '</div>' +
            '<div class="fi-user-subline">' +
                '<span class="fi-sport">' + getSportOrTeam(item) + '</span>' +
                (hasRecord
                    ? '<span class="fi-dot">&middot;</span><span class="fi-record"' + recordDrillAttrs(item, 'Community feed') + '>Record: ' + esc(record) + '</span>'
                    : '') +
            '</div>' +
        '</div>' +
        '<span class="fv-kind fv-kind--' + kind.cls + '"><i class="fas ' + kind.icon + '"></i> ' + kind.label + '</span>' +
    '</div>' +
    (actionHtml ? '<div class="fi-action-label">' + actionHtml + '</div>' : '');
}

function fvShareBtn(itemId) {
    return '<button type="button" class="fi-action" onclick="sharePost(' + jsArg(itemId) + ')"><i class="fas fa-share"></i> Share</button>';
}

function fvMoreBtn(itemId) {
    return '<button type="button" class="fi-action fv-more" aria-label="More options" aria-haspopup="menu" onclick="fvOpenMore(event, ' + jsArg(itemId) + ')"><i class="fas fa-ellipsis"></i></button>';
}

function renderActionRow(itemId, type, liked, likesCount, commentsCount) {
    const likeFn = type === 'pick' ? 'likePick' : 'likeFeedPost';
    const idArg = jsArg(itemId);
    const typeArg = jsArg(type);
    return '<div class="fi-actions">' +
        '<button type="button" class="fi-action fv-like ' + (liked ? 'is-liked liked' : '') + '" onclick="' + likeFn + '(' + idArg + ', this)"><i class="fas fa-thumbs-up"></i> Like <span>' + (Number(likesCount) || 0) + '</span></button>' +
        '<button type="button" class="fi-action" onclick="toggleComments(' + idArg + ', ' + typeArg + ')"><i class="fas fa-comment"></i> Comment <span>' + (Number(commentsCount) || 0) + '</span></button>' +
        fvShareBtn(itemId) +
        fvMoreBtn(itemId) +
    '</div>' +
    '<div class="comments-section" id="cs-' + (type === 'pick' ? 'pick' : 'fp') + '-' + feedId(itemId) + '"></div>';
}

/* A record update card groups a member's graded picks for one day. Likes and
   comments belong to ONE pick, so they render only when the card is exactly one
   pick with a real pick id; a grouped card gets Share and the menu. */
function fvPickActions(cardId, item, count) {
    const ids = Array.isArray(item._pick_ids) ? item._pick_ids : [];
    if (count === 1 && ids.length === 1) {
        const pid = ids[0];
        return '<div class="fi-actions">' +
            '<button type="button" class="fi-action fv-like ' + ((item.liked_by_user || item.user_liked) ? 'is-liked liked' : '') + '" onclick="likePick(' + jsArg(pid) + ', this)"><i class="fas fa-thumbs-up"></i> Like <span>' + (Number(item.likes_count) || 0) + '</span></button>' +
            '<button type="button" class="fi-action" onclick="toggleComments(' + jsArg(pid) + ', ' + jsArg('pick') + ')"><i class="fas fa-comment"></i> Comment <span>' + (Number(item.comments_count) || 0) + '</span></button>' +
            fvShareBtn(cardId) + fvMoreBtn(cardId) +
        '</div>' +
        '<div class="comments-section" id="cs-pick-' + feedId(pid) + '"></div>';
    }
    return '<div class="fi-actions">' + fvShareBtn(cardId) + fvMoreBtn(cardId) + '</div>';
}

function fvPickRow(icon, text, chipCls, chipText) {
    return '<div class="fv-pr"><i class="fas ' + icon + '"></i><span>' + esc(text) + '</span><b class="fv-chip fv-chip--' + chipCls + '">' + chipText + '</b></div>';
}

function renderPickCard(item) {
    const id = item.pick_id || item.id || item.item_id;
    const status = normalizePickStatus(item);
    const isPending = status === 'pending' || status === 'locked';
    const count = Number(item.pick_count || item.count || 1);
    const username = getUsername(item);
    const picksUrl = username ? '/profile/?user=' + encodeURIComponent(username) + '&view=picks' : '/handicappers/';
    let title, text, rows = '';

    if (isPending) {
        title = '<i class="fas fa-lock"></i> Locked picks submitted';
        text = '<p class="fv-pick-line">' + fvPlural(count, 'locked pick') + ' awaiting grade</p>' +
            '<p class="fv-pick-sub">Pick details hidden until eligible for public record.</p>';
        rows = fvPickRow('fa-lock', fvPlural(count, 'pick'), 'pending', 'PENDING');
    } else {
        title = '<i class="fas fa-circle-check"></i> Picks graded';
        const breakdown = getGradedBreakdownText(item);
        text = '<p class="fv-pick-line">' + esc(breakdown || 'Verified record updated.') + '</p>' +
            '<p class="fv-pick-sub"' + recordDrillAttrs(item, 'Community feed, graded pick update') + '>Current overall record: ' + esc(getRecordText(item)) + '</p>';
        const wins = Number(item.wins_count || 0);
        const losses = Number(item.losses_count || 0);
        const neutral = Number(item.pushes_count || 0) + Number(item.voids_count || 0);
        const counted = wins + losses + neutral;
        if (counted > 0 && counted <= count) {
            if (wins) rows += fvPickRow('fa-circle-check', fvPlural(wins, 'pick'), 'win', 'WIN');
            if (losses) rows += fvPickRow('fa-circle-xmark', fvPlural(losses, 'pick'), 'loss', 'LOSS');
            if (neutral) rows += fvPickRow('fa-circle-minus', fvPlural(neutral, 'pick'), 'push', 'PUSH');
            if (count - counted > 0) rows += fvPickRow('fa-clock', fvPlural(count - counted, 'pick'), 'pending', 'PENDING');
        } else {
            rows = fvPickRow('fa-circle-check', fvPlural(count, 'pick'), 'graded', 'GRADED');
        }
        if (item.batch_net_units != null && isFinite(Number(item.batch_net_units))) {
            const bu = Number(item.batch_net_units);
            rows += '<div class="fv-pr fv-pr--net"><span>This update</span><b class="' + (bu >= 0 ? 'fv-pos' : 'fv-neg') + '">' + fvUnits(bu) + '</b></div>';
        }
    }

    return '<div class="feed-item" data-id="' + esc(id) + '" data-type="pick">' +
        renderFeedHeader(item, '') +
        '<div class="fv-pick-grid">' +
            '<div class="fv-pick-text"><div class="fv-title">' + title + '</div>' + text + followingBuyLink(item) + '</div>' +
            '<div class="fv-pick-side"><div class="fv-pick-box">' + rows + '</div>' +
                '<a class="fv-view-picks" href="' + picksUrl + '">View Picks <i class="fas fa-chevron-right"></i></a></div>' +
        '</div>' +
        fvPickActions(id, item, count) +
    '</div>';
}

/* Matchup art for a Take written about a game ("LAC @ NYJ simulation"). Club
   marks come from the same logo host the hubs use; if either one is missing the
   art removes itself and the card closes up. */
const FV_ART_LEAGUES = { nfl: 'nfl', nba: 'nba', mlb: 'mlb', nhl: 'nhl' };
function fvContextArt(item) {
    const label = String(item.context_label || '');
    const m = label.match(/^([A-Z]{2,4})\s*@\s*([A-Z]{2,4})\b/);
    if (!m) return '';
    const url = String(item.context_url || '');
    const hint = (url.match(/^\/(nfl|nba|mlb|nhl)\b/) || [])[1] || String(item.sport || '').toLowerCase();
    const league = FV_ART_LEAGUES[hint];
    if (!league) return '';
    const safe = /^\/(?!\/)[^\s<>"']*$/.test(url) ? url : '';
    // dark-background mark first, the standard mark second, then give up.
    const gone = "if(this.src.indexOf('/500-dark/')>-1){this.src=this.src.replace('/500-dark/','/500/');return;}var c=this.closest('.feed-item');if(c)c.classList.remove('has-art');var a=this.closest('.fv-art');if(a)a.remove();";
    const logo = (abbr) => '<img src="https://a.espncdn.com/i/teamlogos/' + league + '/500-dark/' + abbr.toLowerCase() + '.png" alt="" loading="lazy" onerror="' + gone + '">';
    const inner = '<span class="fv-art-logos">' + logo(m[1]) + '<em>vs</em>' + logo(m[2]) + '</span>' +
        '<span class="fv-art-label">' + esc(m[1] + ' @ ' + m[2]) + '</span>';
    return safe
        ? '<a class="fv-art fv-art--' + league + '" href="' + esc(safe) + '" aria-label="' + esc(label) + '">' + inner + '</a>'
        : '<div class="fv-art fv-art--' + league + '" aria-hidden="true">' + inner + '</div>';
}

function renderTextPost(item) {
    const id = item.post_id || item.id || item.item_id;
    const isHotTake = String(item.post_type || '').toLowerCase() === 'hot_take' || String(item.type || '').toLowerCase() === 'hot-take';
    const art = fvContextArt(item);
    return '<div class="feed-item' + (art ? ' has-art' : '') + '" data-id="' + esc(id) + '" data-type="feed_post">' +
        art +
        '<div class="fv-post-main">' +
            renderFeedHeader(item, '') +
            '<div class="fi-content' + (isHotTake ? ' is-take' : '') + '">' + (isHotTake ? '<i class="fas fa-fire"></i>' : '') + '<span>' + esc(item.content || item.body || item.text || '') + '</span></div>' +
            renderTakeContext(item) +
            renderActionRow(id, 'feed_post', item.liked_by_user || item.user_liked, item.likes_count, item.comments_count) +
        '</div>' +
    '</div>';
}

function renderPollCard(item) {
    const id = item.poll_id || item.id || item.item_id;
    const questionCount = Number(item.question_count || item.total_questions || 0);
    // A prediction quiz never renders its questions or answer controls in the
    // feed: the feed only gets a compact preview that links to the quiz page.
    const isQuiz = questionCount > 1 || item.is_game === true || item.game_mode === true ||
        String(item.poll_type || item.type || '') === 'game';
    const pollUrl = '/polls/#poll-' + encodeURIComponent(id);
    let body;
    if (isQuiz) {
        const qLabel = questionCount > 1 ? questionCount + '-question prediction quiz' : 'Prediction quiz';
        body = '<div class="tmrp" data-poll-id="' + esc(id) + '">' +
            '<a class="tmrp-opt tmrp-link" href="' + pollUrl + '">' +
            '<span class="tmrp-label">' + esc(qLabel) + '</span>' +
            '<span class="tmrp-pct">Play Quiz &rarr;</span></a></div>';
    } else if (window.TMRPoll) {
        body = window.TMRPoll.optionsHTML(item);
    } else {
        body = '<a class="tmrp-opt tmrp-link" href="' + pollUrl + '"><span class="tmrp-label">Open this poll to vote</span><span class="tmrp-pct">View &rarr;</span></a>';
    }
    /* Likes and comments are keyed to feed post ids, not poll ids, so a poll
       card carries the actions that are really its own: open it, share it. */
    return '<div class="feed-item" data-id="' + esc(id) + '" data-type="feed_post">' +
        renderFeedHeader(item, '') +
        '<div class="fi-content is-question">' + esc(item.content || item.title || '') + '</div>' +
        '<div class="pick-embed">' + body + '</div>' +
        '<div class="fi-actions">' +
            '<a class="fi-action" href="' + pollUrl + '"><i class="fas fa-chart-simple"></i> ' + (isQuiz ? 'Play quiz' : 'Open poll') + '</a>' +
            '<button type="button" class="fi-action" onclick="fvShareUrl(' + jsArg(pollUrl) + ', ' + jsArg('Poll on TrustMyRecord') + ', this)"><i class="fas fa-share"></i> Share</button>' +
        '</div>' +
    '</div>';
}

// ==================== SHARE + MORE MENU ====================
function fvCopy(text, btn, doneHtml) {
    const done = () => {
        if (!btn) return;
        const orig = btn.innerHTML;
        btn.innerHTML = doneHtml || '<i class="fas fa-check"></i> Copied';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
    };
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, done);
            return;
        }
    } catch (e) {}
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;left:-999px;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
    done();
}

function fvShareUrl(path, title, btn) {
    const url = location.origin + path;
    if (window.TMRShare && typeof window.TMRShare.open === 'function') {
        window.TMRShare.open({ type: 'page', id: '', url: url, title: title });
        return;
    }
    fvCopy(url, btn);
}

function fvCloseMenus(except) {
    document.querySelectorAll('.fv-menu--float').forEach(m => { if (m !== except) m.remove(); });
    const sortMenu = document.getElementById('fvSortMenu');
    const sortBtn = document.getElementById('fvSortBtn');
    if (sortMenu && sortMenu !== except) { sortMenu.hidden = true; if (sortBtn) sortBtn.setAttribute('aria-expanded', 'false'); }
    const emoji = document.getElementById('fvEmoji');
    const emojiBtn = document.getElementById('fvEmojiBtn');
    if (emoji && emoji !== except) { emoji.hidden = true; if (emojiBtn) emojiBtn.setAttribute('aria-expanded', 'false'); }
}

function fvOpenMore(ev, itemId) {
    if (ev) ev.stopPropagation();
    const btn = ev && ev.currentTarget;
    if (!btn) return;
    const row = btn.closest('.fi-actions');
    const open = row.querySelector('.fv-menu--float');
    fvCloseMenus();
    if (open) return;
    const card = btn.closest('.feed-item');
    const profileLink = card ? card.querySelector('.fi-name a') : null;
    const postUrl = location.origin + '/feed/?post=' + encodeURIComponent(String(itemId));
    const menu = document.createElement('div');
    menu.className = 'fv-menu fv-menu--float';
    menu.setAttribute('role', 'menu');
    menu.innerHTML =
        '<button type="button" role="menuitem" data-act="copy"><i class="fas fa-link"></i> Copy link</button>' +
        '<a role="menuitem" href="' + esc(postUrl) + '"><i class="fas fa-up-right-from-square"></i> Open post</a>' +
        (profileLink ? '<a role="menuitem" href="' + esc(profileLink.getAttribute('href')) + '"><i class="fas fa-circle-user"></i> View profile</a>' : '');
    menu.addEventListener('click', e => {
        e.stopPropagation();
        const copy = e.target.closest('[data-act="copy"]');
        if (copy) {
            fvCopy(postUrl, copy, '<i class="fas fa-check"></i> Link copied');
            setTimeout(fvCloseMenus, 900);
        }
    });
    row.appendChild(menu);
}

document.addEventListener('click', () => fvCloseMenus());
document.addEventListener('keydown', e => { if (e.key === 'Escape') fvCloseMenus(); });

// ==================== SORT ====================
let fvSort = 'latest';
const FV_SORT_LABELS = { latest: 'Latest', liked: 'Most Liked', discussed: 'Most Discussed' };

function fvSortItems(items) {
    if (fvSort === 'latest') return items;
    const key = fvSort === 'liked' ? 'likes_count' : 'comments_count';
    // Array.prototype.sort is stable, so ties keep the newest-first order.
    return items.slice().sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0));
}

function fvToggleSort(ev) {
    if (ev) ev.stopPropagation();
    const menu = document.getElementById('fvSortMenu');
    const btn = document.getElementById('fvSortBtn');
    if (!menu) return;
    const willOpen = menu.hidden;
    fvCloseMenus();
    menu.hidden = !willOpen;
    if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
}

function fvSetSort(mode) {
    if (!FV_SORT_LABELS[mode]) return;
    fvSort = mode;
    const label = document.getElementById('fvSortLabel');
    if (label) label.textContent = FV_SORT_LABELS[mode];
    document.querySelectorAll('#fvSortMenu button').forEach(b => {
        b.setAttribute('aria-checked', (b.getAttribute('onclick') || '').indexOf("'" + mode + "'") !== -1 ? 'true' : 'false');
    });
    fvCloseMenus();
    feedOffset = 0;
    loadFeed();
}

// ==================== COMPOSER ====================
const FV_EMOJI = ['🔥', '💰', '🎯', '🏆', '📈', '📉', '🔒', '✅', '❌', '👀', '😂', '😤', '🤝', '🙌', '💪', '🧊', '🏈', '🏀', '⚾', '🏒', '⚽', '🎾', '🥊', '🐐'];
const FV_PLACEHOLDER = 'Share a pick, hot take, milestone, or opinion...';
const FV_TYPE_LABELS = { 'post': 'Post', 'hot-take': 'Hot Take', 'poll': 'Poll', 'pick-recap': 'Pick Recap' };

function fvSyncComposer() {
    const input = document.getElementById('compInput');
    const count = document.getElementById('fvCount');
    const label = document.getElementById('fvTypeLabel');
    const card = document.getElementById('composerCard');
    const post = document.getElementById('postBtn');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    if (count) count.textContent = input.value.length + '/500';
    if (label) label.textContent = FV_TYPE_LABELS[postType] || 'Post';
    if (postType === 'post') input.placeholder = FV_PLACEHOLDER;
    if (card) card.classList.toggle('is-open', postType !== 'post' || input.value.length > 0 || document.activeElement === input);
    if (post && post.textContent === 'Post') post.disabled = input.value.trim().length === 0;
}

function fvToggleEmoji(ev) {
    if (ev) ev.stopPropagation();
    const panel = document.getElementById('fvEmoji');
    const btn = document.getElementById('fvEmojiBtn');
    if (!panel) return;
    if (!panel.childElementCount) {
        panel.innerHTML = FV_EMOJI.map(e => '<button type="button" onclick="fvInsertEmoji(event, this.textContent)">' + e + '</button>').join('');
        panel.addEventListener('click', e => e.stopPropagation());
    }
    const willOpen = panel.hidden;
    fvCloseMenus();
    panel.hidden = !willOpen;
    if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
}

function fvInsertEmoji(ev, emoji) {
    if (ev) ev.stopPropagation();
    const input = document.getElementById('compInput');
    if (!input) return;
    const start = input.selectionStart != null ? input.selectionStart : input.value.length;
    const end = input.selectionEnd != null ? input.selectionEnd : input.value.length;
    const next = input.value.slice(0, start) + emoji + input.value.slice(end);
    if (next.length > 500) return;
    input.value = next;
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

(function () {
    const origToggle = window.toggleType;
    window.toggleType = function (type) {
        if (typeof origToggle === 'function') origToggle(type);
        fvSyncComposer();
    };
    const origSubmit = window.submitPost;
    window.submitPost = async function () {
        try { if (typeof origSubmit === 'function') await origSubmit(); } finally { fvSyncComposer(); }
    };
    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('compInput');
        if (!input) return;
        ['input', 'focus', 'blur'].forEach(evt => input.addEventListener(evt, fvSyncComposer));
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.submitPost(); }
        });
        fvSyncComposer();
    });
})();

// ==================== LEFT RAIL ====================
async function loadSidebarStats(user) {
    const sc = document.getElementById('myStatsCard');
    const box = document.getElementById('sidebarMyStats');
    if (!sc || !box || !user || !user.username) return;
    try {
        const data = await api.request('/users/' + encodeURIComponent(user.username));
        const u = data.user || {};
        const wins = Number(u.wins || 0), losses = Number(u.losses || 0), pushes = Number(u.pushes || 0);
        const total = Number(u.total_picks || 0);
        /* The win rate the API sends, never one recomputed here: the profile
           divides by wins+losses and this widget must not show another number. */
        const wr = Number(u.win_rate || 0);
        const units = Number(u.net_units || 0);
        const drill = ' data-drill-category="record" data-drill-bucket="" data-drill-user="' + esc(user.username) + '"' +
            ' data-drill-label="Your lifetime record" data-drill-context="Your stats"' +
            ' data-drill-expect="' + total + '|' + wins + '-' + losses + '-' + pushes + '|' + units.toFixed(2) + '" role="button" tabindex="0"';
        box.innerHTML =
            '<div class="fv-rec"' + drill + '>' +
                '<div class="fv-rec-row"><span><b>' + total.toLocaleString('en-US') + '</b> Picks</span><span><b class="fv-pos">' + wr.toFixed(0) + '%</b> Win Rate</span></div>' +
                '<div class="fv-rec-row"><span><b>' + wins + '-' + losses + '-' + pushes + '</b></span><span><b class="' + (units >= 0 ? 'fv-pos' : 'fv-neg') + '">' + fvUnits(units, 1) + '</b></span></div>' +
            '</div>' +
            '<div class="fv-rec-cta"><a class="fv-view-picks" href="/profile/?user=' + encodeURIComponent(user.username) + '&view=picks">View Picks <i class="fas fa-chevron-right"></i></a></div>';
        sc.style.display = 'block';
    } catch (e) {
        sc.style.display = 'none';
    }
}

async function fvLoadMessageBadge() {
    const badge = document.getElementById('fvMsgBadge');
    const viewer = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
    if (!badge || !viewer) return;
    try {
        const data = await api.request('/messages/unread-count');
        const n = Number(data && (data.count != null ? data.count : data.unread_count)) || 0;
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.hidden = n <= 0;
        if (n > 0) badge.setAttribute('aria-label', fvPlural(n, 'unread message'));
    } catch (e) { badge.hidden = true; }
}

// ==================== RIGHT RAIL ====================
/* Record Activity reads the feed's own graded-pick summaries (one row per
   member per grading day, with that batch's units), so a row here always
   matches the card in the timeline. */
let _fvPicksFeedPromise = null;
let _fvPicksFeedAt = 0;
function fvPicksFeed(fresh) {
    if (fresh || !_fvPicksFeedPromise || Date.now() - _fvPicksFeedAt > 60000) {
        _fvPicksFeedAt = Date.now();
        _fvPicksFeedPromise = api.request('/feed?limit=20&offset=0&filter=picks');
        _fvPicksFeedPromise.catch(() => { _fvPicksFeedPromise = null; });
    }
    return _fvPicksFeedPromise;
}

async function loadTrending(fresh) {
    const el = document.getElementById('trendingList');
    if (!el) return;
    try {
        const data = await fvPicksFeed(fresh === true);
        const rows = ((data && data.feed) || [])
            .filter(isRealPublicFeedUser)
            .filter(p => p.username && !['pending', 'locked'].includes(String(p.status || p.pick_status || '').toLowerCase()))
            .slice(0, 3);
        if (rows.length) {
            el.innerHTML = rows.map(p => {
                const display = p.display_name || p.username;
                const n = Number(p.activity_count || p.pick_count || 1) || 1;
                const hasUnits = p.batch_net_units != null && isFinite(Number(p.batch_net_units));
                const bu = Number(p.batch_net_units);
                return '<a class="fv-act" href="/profile/?user=' + encodeURIComponent(p.username) + '&view=picks">' +
                    '<span class="fv-act-ava"><img src="' + esc(fvAva(p.username, p.avatar_url)) + '" alt="" loading="lazy"></span>' +
                    '<span class="fv-act-text"><span><b>' + esc(display) + '</b> graded ' + fvPlural(n, 'pick') + '</span>' +
                        '<small>' + esc(timeAgo(p.graded_at || p.created_at)) + '</small></span>' +
                    (hasUnits ? '<b class="fv-act-units ' + (bu >= 0 ? 'fv-pos' : 'fv-neg') + '">' + fvUnits(bu) + '</b>' : '') +
                '</a>';
            }).join('');
            return;
        }
    } catch (e) {}
    el.innerHTML = '<div class="rs-empty">Public graded picks will surface here as real records update. Pending pick details stay private.</div>';
}

function fvGoToPost(ev, id) {
    const sel = '.feed-item[data-id="' + String(id).replace(/[\\"]/g, '\\$&') + '"]';
    const el = document.querySelector(sel);
    if (!el) return; // not on this tab: let the link navigate to /feed/?post=
    if (ev) ev.preventDefault();
    document.querySelectorAll('.feed-item.is-shared-target').forEach(n => n.classList.remove('is-shared-target'));
    el.classList.add('is-shared-target');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function fvRenderTrend(items) {
    const card = document.getElementById('fvTrendCard');
    const list = document.getElementById('fvTrendList');
    if (!card || !list) return;
    const posts = (items || []).filter(i => {
        const text = String(i.content || i.title || '').trim();
        return text && (i.item_type === 'feed_post' || i.item_type === 'poll' || i.post_type === 'poll' || i.post_type === 'hot_take');
    });
    const score = i => (Number(i.comments_count) || 0) * 2 + (Number(i.likes_count) || 0) + (Number(i.total_votes) || 0);
    const ranked = posts.slice().sort((a, b) => score(b) - score(a)).slice(0, 3);
    if (!ranked.length) { card.hidden = true; return; }
    list.innerHTML = ranked.map((i, idx) => {
        const isPoll = i.item_type === 'poll' || i.post_type === 'poll';
        const id = isPoll ? (i.poll_id || i.item_id) : (i.post_id || i.id || i.item_id);
        const href = isPoll ? '/polls/#poll-' + encodeURIComponent(id) : '/feed/?post=' + encodeURIComponent(id);
        let text = String(i.context_label ? i.content + ' · ' + i.context_label : (i.content || i.title || '')).trim();
        if (text.length > 54) text = text.slice(0, 52).trim() + '…';
        const comments = Number(i.comments_count) || 0;
        const likes = Number(i.likes_count) || 0;
        const votes = Number(i.total_votes) || 0;
        const sub = comments ? fvPlural(comments, 'comment')
            : votes ? fvPlural(votes, 'vote')
            : likes ? fvPlural(likes, 'like')
            : 'New · ' + timeAgo(i.created_at);
        return '<a class="fv-trend" href="' + esc(href) + '" onclick="fvGoToPost(event, ' + esc(jsArg(id)) + ')">' +
            '<span class="fv-trend-rank">' + (idx + 1) + '</span>' +
            '<span class="fv-trend-text"><b>' + esc(text) + '</b><small>' + esc(sub) + '</small></span>' +
            '<i class="fas fa-arrow-trend-up"></i>' +
        '</a>';
    }).join('');
    card.hidden = false;
}

function fvHighRow(href, icon, tone, label, by, value, valueCls) {
    return '<a class="fv-high" href="' + esc(href) + '">' +
        '<span class="fv-high-ico fv-high-ico--' + tone + '"><i class="fas ' + icon + '"></i></span>' +
        '<span class="fv-high-text"><b>' + esc(label) + '</b><small>by ' + esc(by) + '</small></span>' +
        '<b class="fv-high-val ' + (valueCls || 'fv-pos') + '">' + esc(value) + '</b>' +
    '</a>';
}

async function fvRenderHighlights(items) {
    const card = document.getElementById('fvHighCard');
    const list = document.getElementById('fvHighList');
    if (!card || !list) return;
    let html = '';

    // Top Pick (24h): the best single graded win in the last day.
    try {
        const data = await fetchDiscoverTop(12);
        const dayAgo = Date.now() - 24 * 3600 * 1000;
        const best = ((data && data.picks) || [])
            .filter(isRealPublicFeedUser)
            .filter(p => p.is_public !== false && !p.is_private && !['pending', 'locked'].includes(String(p.status || '').toLowerCase()))
            .filter(p => String(p.status || '').toLowerCase() === 'won' && new Date(p.graded_at || 0).getTime() >= dayAgo && Number(p.result_units) > 0)
            .sort((a, b) => Number(b.result_units) - Number(a.result_units))[0];
        if (best) {
            html += fvHighRow('/pick/?id=' + encodeURIComponent(best.id), 'fa-bullseye', 'red', 'Top Pick (24h)',
                best.display_name || best.username, fvUnits(best.result_units));
        }
    } catch (e) {}

    // Most Active: the member with the most entries in the current feed page.
    const counts = {};
    (items || []).forEach(i => {
        const name = getUsername(i);
        if (!name) return;
        const weight = (i.item_type === 'pick' || i.post_type === 'pick') ? (Number(i.pick_count) || 1) : 1;
        counts[name] = counts[name] || { n: 0, display: getDisplayName(i) };
        counts[name].n += weight;
    });
    const top = Object.keys(counts).sort((a, b) => counts[b].n - counts[a].n)[0];
    if (top && counts[top].n > 1) {
        html += fvHighRow('/profile/?user=' + encodeURIComponent(top), 'fa-comment-dots', 'blue', 'Most Active',
            counts[top].display, fvPlural(counts[top].n, 'update'));
    }

    // Best Streak: the longest winning streak announced in the feed.
    const streak = (items || [])
        .filter(i => i.item_type === 'milestone' && i.post_type === 'win_streak' && Number(i.milestone_threshold) > 0 && getUsername(i))
        .sort((a, b) => Number(b.milestone_threshold) - Number(a.milestone_threshold))[0];
    if (streak) {
        html += fvHighRow('/profile/?user=' + encodeURIComponent(getUsername(streak)) + '&view=picks', 'fa-fire', 'gold', 'Best Streak',
            getDisplayName(streak), Number(streak.milestone_threshold) + ' straight');
    }

    list.innerHTML = html;
    card.hidden = !html;
}

/* Called by loadFeedItems after every render. The rail modules describe the
   whole feed, so they only rebuild from the first page of the For You tab; a
   visitor who lands on another tab gets them from one extra For You read. */
let _fvRailBuilt = false;
function fvAfterFeed(items) {
    if (typeof currentFilter !== 'undefined' && currentFilter === 'all' && feedOffset === 0) {
        _fvRailBuilt = true;
        fvRenderTrend(items);
        fvRenderHighlights(items);
        return;
    }
    if (_fvRailBuilt) return;
    _fvRailBuilt = true;
    api.request('/feed?limit=20&offset=0&filter=all').then(data => {
        const rows = ((data && data.feed) || []).filter(isRealPublicFeedUser);
        fvRenderTrend(rows);
        fvRenderHighlights(rows);
    }).catch(() => {});
}

document.addEventListener('DOMContentLoaded', () => {
    // auth resolves inside social-home's own DOMContentLoaded chain; poll briefly.
    let tries = 0;
    const t = setInterval(() => {
        tries += 1;
        const viewer = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
        if (viewer) { clearInterval(t); fvLoadMessageBadge(); }
        else if (tries > 12) clearInterval(t);
    }, 500);
    // "Live": refresh Record Activity once a minute while the tab is visible.
    setInterval(() => { if (!document.hidden) loadTrending(true); }, 60000);
});
