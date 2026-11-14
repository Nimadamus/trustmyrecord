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

/* FEED_SIM_CARD_20261114: the simulation a Take was written about. `item.sim`
   is built by the API from the archived run itself (never from the browser),
   and `item.stance` is only what the member chose. A figure the run did not
   produce is simply absent, and the row for it is not drawn. */
function fvSimNum(n) {
    const v = Number(n);
    if (!isFinite(v)) return '';
    return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
}

function fvSimWhen(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try {
        return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) { return ''; }
}

function fvSimTeamName(sim, abbr) {
    if (!abbr) return '';
    if (sim.away && sim.away.abbr === abbr) return sim.away.name || abbr;
    if (sim.home && sim.home.abbr === abbr) return sim.home.name || abbr;
    return abbr;
}

/* The member's position in words. Only parts they picked are named. */
function fvSimStance(item, sim) {
    const st = item.stance;
    if (!st || (st.position !== 'agree' && st.position !== 'disagree')) return '';
    const who = '<b>' + esc(getDisplayName(item)) + '</b>';
    const agree = st.position === 'agree';
    let line = who + (agree ? ' agrees with this simulation.' : ' disagrees with this simulation.');
    let own = '';
    if (!agree) {
        const topics = Array.isArray(st.topics) ? st.topics : [];
        const parts = [];
        if (topics.indexOf('winner') > -1) {
            parts.push(sim && sim.predicted_winner ? 'the ' + esc(fvSimTeamName(sim, sim.predicted_winner)) + ' winning' : 'the winner');
        }
        if (topics.indexOf('score') > -1) {
            const ps = sim && (sim.projected_score || sim.simulated_game);
            parts.push('the final score' + (ps ? ' (' + esc(sim.away.abbr) + ' ' + fvSimNum(ps.away) + ', ' + esc(sim.home.abbr) + ' ' + fvSimNum(ps.home) + ')' : ''));
        }
        if (topics.indexOf('spread') > -1) {
            parts.push('the point spread' + (sim && sim.margin && sim.margin.team ? ' (' + esc(sim.margin.team) + ' by ' + fvSimNum(sim.margin.by) + ')' : ''));
        }
        if (topics.indexOf('total') > -1) {
            parts.push('the total' + (sim && sim.total != null ? ' (' + fvSimNum(sim.total) + ')' : ''));
        }
        if (parts.length) {
            const last = parts.pop();
            line = who + ' disagrees with ' + (parts.length ? parts.join(', ') + ' and ' : '') + last + '.';
        }
        const sc = st.score;
        if (sc && isFinite(Number(sc.away)) && isFinite(Number(sc.home))) {
            const aw = sim ? sim.away.abbr : 'Away', hm = sim ? sim.home.abbr : 'Home';
            own = '<div class="fv-sim-own"><span>' + esc(getDisplayName(item)) + '&rsquo;s score</span><b>' +
                esc(aw) + ' ' + fvSimNum(sc.away) + ', ' + esc(hm) + ' ' + fvSimNum(sc.home) + '</b></div>';
        }
    }
    return '<div class="fv-sim-stance fv-sim-stance--' + (agree ? 'agree' : 'disagree') + '">' +
        '<i class="fas ' + (agree ? 'fa-thumbs-up' : 'fa-thumbs-down') + '"></i><span>' + line + '</span></div>' + own;
}

function fvSimTeam(t, score, side, won) {
    /* dark-background mark first, the standard mark second, then leave the slot empty. */
    const gone = "if(this.src.indexOf('/500-dark/')>-1){this.src=this.src.replace('/500-dark/','/500/');return;}this.style.visibility='hidden'";
    const logo = /^https:\/\/a\.espncdn\.com\/i\/teamlogos\/[a-z]+\/500\/[a-z0-9]+\.png$/.test(String(t.logo || ''))
        ? '<img src="' + esc(String(t.logo).replace('/500/', '/500-dark/')) + '" alt="" loading="lazy" onerror="' + gone + '">' : '';
    return '<div class="fv-sim-team fv-sim-team--' + side + (won ? ' is-win' : '') + '">' +
        '<span class="fv-sim-logo">' + logo + '</span>' +
        '<span class="fv-sim-id"><b>' + esc(t.abbr) + '</b><em>' + esc(t.name || '') + '</em></span>' +
        (score === '' ? '' : '<span class="fv-sim-pts">' + score + '</span>') +
    '</div>';
}

function fvSimCard(item) {
    const sim = item.sim;
    const isSim = item.context_source === 'simulator';
    if (!sim || !sim.away || !sim.home) {
        if (!isSim) return '';
        /* No archived run for this post: say so plainly and link the simulator. */
        const url = String(item.context_url || '');
        const safe = /^\/(?!\/)[^\s<>"']*$/.test(url) ? url : '';
        return '<div class="fv-sim fv-sim--bare">' +
            '<div class="fv-sim-head"><span class="fv-sim-kicker"><i class="fas fa-chart-bar"></i> Simulation</span>' +
                (item.context_label ? '<span class="fv-sim-meta">' + esc(String(item.context_label).replace(/\s*simulation$/i, '')) + '</span>' : '') + '</div>' +
            fvSimStance(item, null) +
            '<p class="fv-sim-none">The original simulation result is not available for this post.</p>' +
            (safe ? '<a class="fv-sim-cta fv-sim-cta--ghost" href="' + esc(safe) + '">Open the Simulator <i class="fas fa-chevron-right"></i></a>' : '') +
        '</div>';
    }
    const url = /^\/(?!\/)[^\s<>"']*$/.test(String(sim.url || '')) ? sim.url : '';
    const projected = sim.projected_score || null;
    const shown = projected || sim.simulated_game || null;
    const sims = Number(sim.n_sims) > 1 ? Number(sim.n_sims).toLocaleString() + ' simulations' : 'Single game simulation';
    const when = fvSimWhen(sim.recorded_at);
    const win = sim.predicted_winner;

    let bar = '';
    const wp = sim.win_probability;
    if (wp && isFinite(Number(wp.away)) && isFinite(Number(wp.home))) {
        const a = Math.round(Number(wp.away) * 100), h = Math.round(Number(wp.home) * 100);
        bar = '<div class="fv-sim-wp" role="img" aria-label="Win probability: ' + esc(sim.away.abbr) + ' ' + a + ' percent, ' + esc(sim.home.abbr) + ' ' + h + ' percent">' +
            '<div class="fv-sim-wp-top"><span class="' + (a > h ? 'is-fav' : '') + '">' + esc(sim.away.abbr) + ' <b>' + a + '%</b></span>' +
                '<em>Win probability</em>' +
                '<span class="' + (h > a ? 'is-fav' : '') + '"><b>' + h + '%</b> ' + esc(sim.home.abbr) + '</span></div>' +
            '<div class="fv-sim-wp-bar"><i class="' + (a > h ? 'is-fav' : '') + '" style="width:' + a + '%"></i><i class="' + (h > a ? 'is-fav' : '') + '" style="width:' + h + '%"></i></div>' +
        '</div>';
    }

    const stat = (label, value) => '<div class="fv-sim-stat"><span>' + label + '</span><b>' + value + '</b></div>';
    let stats = '';
    if (win) stats += stat(projected || wp ? 'Predicted winner' : 'Winner', esc(fvSimTeamName(sim, win)));
    if (sim.margin) stats += stat('Point spread', sim.margin.team ? esc(sim.margin.team) + ' &minus;' + fvSimNum(sim.margin.by) : 'Even');
    if (sim.total != null) stats += stat('Projected total', fvSimNum(sim.total));

    let more = '';
    if (projected && sim.simulated_game) {
        more += '<div class="fv-sim-row"><span>Game played out in this run</span><b>' + esc(sim.away.abbr) + ' ' + fvSimNum(sim.simulated_game.away) + ', ' +
            esc(sim.home.abbr) + ' ' + fvSimNum(sim.simulated_game.home) + '</b></div>';
    }
    if (sim.game_date) more += '<div class="fv-sim-row"><span>Game date</span><b>' + esc(sim.game_date) + '</b></div>';
    more += '<div class="fv-sim-row"><span>Sample</span><b>' + esc(sims) + '</b></div>';
    if (when) more += '<div class="fv-sim-row"><span>Simulated</span><b>' + esc(when) + '</b></div>';

    return '<div class="fv-sim" data-sim-run="' + esc(sim.run_id) + '">' +
        '<div class="fv-sim-head">' +
            '<span class="fv-sim-kicker"><i class="fas fa-chart-bar"></i> ' + esc(sim.league || '') + ' Simulation</span>' +
            '<span class="fv-sim-meta">' + esc(when) + '</span>' +
        '</div>' +
        fvSimStance(item, sim) +
        '<div class="fv-sim-score">' +
            fvSimTeam(sim.away, shown ? fvSimNum(shown.away) : '', 'away', win === sim.away.abbr) +
            '<span class="fv-sim-mid">' + (projected ? 'Projected<br>score' : (shown ? 'Simulated<br>final' : 'at')) + '</span>' +
            fvSimTeam(sim.home, shown ? fvSimNum(shown.home) : '', 'home', win === sim.home.abbr) +
        '</div>' +
        bar +
        (stats ? '<div class="fv-sim-stats">' + stats + '</div>' : '') +
        '<div class="fv-sim-foot">' +
            '<details class="fv-sim-more"><summary>Simulation details</summary>' + more + '</details>' +
            (url ? '<a class="fv-sim-cta" href="' + esc(url) + '">View Full Simulation <i class="fas fa-chevron-right"></i></a>' : '') +
        '</div>' +
    '</div>';
}

function renderTextPost(item) {
    const id = item.post_id || item.id || item.item_id;
    const isHotTake = String(item.post_type || '').toLowerCase() === 'hot_take' || String(item.type || '').toLowerCase() === 'hot-take';
    const simCard = fvSimCard(item);
    /* The card carries the matchup, the logos and the link, so the side art
       and the one-line tag stand down when it is there. */
    const art = simCard && item.sim ? '' : fvContextArt(item);
    const autoText = !!(simCard && item.stance && item.stance.auto_text);
    return '<div class="feed-item' + (art ? ' has-art' : '') + '" data-id="' + esc(id) + '" data-type="feed_post">' +
        art +
        '<div class="fv-post-main">' +
            renderFeedHeader(item, '') +
            (!autoText && String(item.content || item.body || item.text || '').trim()
                ? '<div class="fi-content' + (isHotTake ? ' is-take' : '') + '">' + (isHotTake ? '<i class="fas fa-fire"></i>' : '') + '<span>' + esc(item.content || item.body || item.text || '') + '</span></div>'
                : '') +
            (simCard || renderTakeContext(item)) +
            fvPhotoHtml(item) +
            renderActionRow(id, 'feed_post', item.liked_by_user || item.user_liked, item.likes_count, item.comments_count) +
        '</div>' +
    '</div>';
}

/* FEED_PHOTO_POSTS_20261113: a post's photo. Only an image served by this
   site's own image endpoint is ever rendered; anything else is dropped. */
function fvPhotoUrl(item) {
    const url = String(item.image_url || '');
    return /^https:\/\/[a-z0-9.-]*trustmyrecord\.com\/api\/forum\/images\/[0-9a-f-]{36}\.(png|jpe?g|gif|webp)$/i.test(url) ? url : '';
}

function fvPhotoHtml(item) {
    const url = fvPhotoUrl(item);
    if (!url) return '';
    const w = Number(item.image_width) || 0;
    const h = Number(item.image_height) || 0;
    const dims = w > 0 && h > 0 ? ' width="' + w + '" height="' + h + '"' : '';
    const who = getDisplayName(item);
    return '<button type="button" class="fv-photo" onclick="fvOpenPhoto(this)" aria-label="Open photo">' +
        '<img src="' + esc(url) + '" alt="Photo posted by ' + esc(who) + '" loading="lazy"' + dims +
        ' onerror="var b=this.closest(\'.fv-photo\');if(b)b.remove();"></button>';
}

function fvOpenPhoto(btn) {
    const img = btn && btn.querySelector('img');
    if (!img) return;
    fvClosePhoto();
    const box = document.createElement('div');
    box.className = 'fv-lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Photo');
    box.innerHTML = '<button type="button" class="fv-lightbox-x" aria-label="Close photo"><i class="fas fa-xmark"></i></button>';
    const big = document.createElement('img');
    big.src = img.src;
    big.alt = img.alt;
    box.appendChild(big);
    box.addEventListener('click', fvClosePhoto);
    document.body.appendChild(box);
    document.body.classList.add('fv-noscroll');
}

function fvClosePhoto() {
    document.querySelectorAll('.fv-lightbox').forEach(n => n.remove());
    document.body.classList.remove('fv-noscroll');
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
        (profileLink ? '<a role="menuitem" href="' + esc(profileLink.getAttribute('href')) + '"><i class="fas fa-circle-user"></i> View profile</a>' : '') +
        (fvCanDelete(card, itemId) ? '<button type="button" role="menuitem" class="fv-danger" data-act="delete"><i class="fas fa-trash"></i> Delete post</button>' : '');
    menu.addEventListener('click', e => {
        e.stopPropagation();
        const copy = e.target.closest('[data-act="copy"]');
        if (copy) {
            fvCopy(postUrl, copy, '<i class="fas fa-check"></i> Link copied');
            setTimeout(fvCloseMenus, 900);
        }
        const del = e.target.closest('[data-act="delete"]');
        if (del) fvDeletePost(del, card, itemId);
    });
    row.appendChild(menu);
}

document.addEventListener('click', () => fvCloseMenus());
document.addEventListener('keydown', e => { if (e.key === 'Escape') { fvCloseMenus(); fvClosePhoto(); } });

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
    const hasPhoto = !!(fvPhoto && fvPhoto.id) && postType !== 'poll';
    if (card) card.classList.toggle('is-open', postType !== 'post' || input.value.length > 0 || document.activeElement === input || !!fvPhoto);
    if (post && post.textContent === 'Post') post.disabled = (input.value.trim().length === 0 && !hasPhoto) || !!(fvPhoto && fvPhoto.busy);
    const photoBtn = document.getElementById('fvPhotoBtn');
    if (photoBtn) { photoBtn.disabled = postType === 'poll'; photoBtn.classList.toggle('is-on', !!fvPhoto); }
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
        try {
            if (fvPhoto && postType !== 'poll') await fvSubmitWithPhoto();
            else if (typeof origSubmit === 'function') await origSubmit();
        } finally { fvSyncComposer(); }
    };
    // the base listener disables Post on an empty box; a photo alone is enough.
    document.addEventListener('input', e => { if (e.target && e.target.id === 'compInput') setTimeout(fvSyncComposer, 0); });
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

// ==================== PHOTO POSTS ====================
/* FEED_PHOTO_POSTS_20261113: one photo per post. The file is re-encoded and
   uploaded by the shared forum image uploader the moment it is picked, so Post
   only has to send the returned image id. */
let fvPhoto = null; // { id, url, busy, xhr }

function fvPhotoStatus(html, isError) {
    const tray = document.getElementById('fvPhotoTray');
    if (!tray) return;
    const note = tray.querySelector('.fv-photo-note');
    if (note) { note.innerHTML = html; note.classList.toggle('is-error', !!isError); }
}

function fvPickPhoto() {
    const viewer = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
    if (!viewer) { openModal('login'); return; }
    const input = document.getElementById('fvPhotoInput');
    if (input) { input.value = ''; input.click(); }
}

function fvRemovePhoto() {
    if (fvPhoto && fvPhoto.xhr) { try { fvPhoto.xhr.abort(); } catch (e) {} }
    fvPhoto = null;
    const tray = document.getElementById('fvPhotoTray');
    if (tray) { tray.hidden = true; tray.innerHTML = ''; }
    fvSyncComposer();
}

async function fvAttachPhoto(file) {
    if (!file) return;
    const tray = document.getElementById('fvPhotoTray');
    if (!tray) return;
    if (!window.TMRForumImages || typeof window.TMRForumImages.upload !== 'function') {
        showComposerStatus('error', 'Photo uploads are unavailable right now. Try again in a moment.');
        return;
    }
    fvRemovePhoto();
    const mine = { id: null, url: null, busy: true, xhr: null };
    fvPhoto = mine;
    tray.hidden = false;
    tray.innerHTML = '<div class="fv-photo-thumb"><img alt="Photo to post"></div>' +
        '<div class="fv-photo-note">Preparing photo…</div>' +
        '<button type="button" class="fv-photo-x" onclick="fvRemovePhoto()" aria-label="Remove photo"><i class="fas fa-xmark"></i></button>';
    try {
        const local = URL.createObjectURL(file);
        const thumb = tray.querySelector('img');
        thumb.onload = () => { try { URL.revokeObjectURL(local); } catch (e) {} };
        thumb.src = local;
    } catch (e) {}
    fvSyncComposer();
    try {
        const res = await window.TMRForumImages.upload(file,
            frac => { if (fvPhoto === mine) fvPhotoStatus('Uploading… ' + Math.round(frac * 100) + '%'); },
            xhr => { mine.xhr = xhr; });
        if (fvPhoto !== mine) return; // removed or replaced while uploading
        mine.id = res.id;
        mine.url = res.url;
        mine.busy = false;
        mine.xhr = null;
        fvPhotoStatus('<i class="fas fa-circle-check"></i> Photo ready');
    } catch (e) {
        if (fvPhoto !== mine) return;
        mine.busy = false;
        mine.xhr = null;
        fvPhotoStatus(esc((e && e.message) || 'Upload failed. Please try again.'), true);
    }
    fvSyncComposer();
}

async function fvSubmitWithPhoto() {
    const input = document.getElementById('compInput');
    const btn = document.getElementById('postBtn');
    if (!input || !btn || !fvPhoto) return;
    if (fvPhoto.busy) { showComposerStatus('error', 'Your photo is still uploading.'); return; }
    if (!fvPhoto.id) { showComposerStatus('error', 'That photo did not upload. Remove it or add it again.'); return; }
    const viewer = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!viewer) { showComposerStatus('error', 'Sign in to post to the feed.'); return; }
    const content = input.value.trim();
    const sport = (document.getElementById('sportPick') || {}).value || null;
    btn.disabled = true;
    btn.textContent = 'Posting...';
    try {
        await api.request('/feed', {
            method: 'POST',
            body: { content, post_type: resolveBackendPostType(postType), sport, image_id: fvPhoto.id }
        });
    } catch (e) {
        btn.textContent = 'Post';
        btn.disabled = false;
        showComposerStatus('error', (e && e.message) ? String(e.message) : 'Failed to post. Please try again.');
        return;
    }
    input.value = '';
    btn.textContent = 'Post';
    const sportSel = document.getElementById('sportPick');
    if (sportSel) sportSel.value = '';
    fvRemovePhoto();
    if (postType !== 'post') toggleType(postType);
    showComposerStatus('success', 'Posted to feed.');
    feedOffset = 0;
    await loadFeed();
}

document.addEventListener('DOMContentLoaded', () => {
    const pick = document.getElementById('fvPhotoInput');
    if (pick) pick.addEventListener('change', () => { if (pick.files && pick.files[0]) fvAttachPhoto(pick.files[0]); });
    const input = document.getElementById('compInput');
    const card = document.getElementById('composerCard');
    if (input) {
        // paste a screenshot straight into the box
        input.addEventListener('paste', e => {
            const items = (e.clipboardData && e.clipboardData.items) || [];
            for (let i = 0; i < items.length; i++) {
                if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
                    const f = items[i].getAsFile();
                    if (f) { e.preventDefault(); fvAttachPhoto(f); }
                    return;
                }
            }
        });
    }
    if (card) {
        // or drop a file on the composer
        ['dragenter', 'dragover'].forEach(evt => card.addEventListener(evt, e => {
            if (e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') !== -1) { e.preventDefault(); card.classList.add('is-drop'); }
        }));
        ['dragleave', 'drop'].forEach(evt => card.addEventListener(evt, () => card.classList.remove('is-drop')));
        card.addEventListener('drop', e => {
            const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f && /^image\//.test(f.type)) { e.preventDefault(); fvAttachPhoto(f); }
        });
    }
});

// ==================== DELETE POST ====================
function fvCanDelete(card, itemId) {
    const viewer = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
    if (!viewer || !card || card.dataset.type !== 'feed_post' || !/^\d+$/.test(String(itemId))) return false;
    if (card.querySelector('.tmrp, [data-poll-id]')) return false; // a poll card is not a feed post
    const link = card.querySelector('.fi-name a');
    const author = link ? (new URLSearchParams((link.getAttribute('href') || '').split('?')[1] || '').get('user') || '') : '';
    const isOwner = author && String(author).toLowerCase() === String(viewer.username || '').toLowerCase();
    const isAdmin = String(viewer.account_type || viewer.accountType || '').toLowerCase() === 'admin' || viewer.is_admin === true || viewer.isAdmin === true;
    return !!(isOwner || isAdmin);
}

async function fvDeletePost(btn, card, itemId) {
    // two taps, no browser dialog: the first arms the button, the second deletes.
    if (!btn.dataset.armed) {
        btn.dataset.armed = '1';
        btn.innerHTML = '<i class="fas fa-trash"></i> Tap again to delete';
        return;
    }
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting…';
    try {
        await api.request('/feed/' + encodeURIComponent(String(itemId)), { method: 'DELETE' });
        fvCloseMenus();
        if (card) card.remove();
    } catch (e) {
        btn.disabled = false;
        delete btn.dataset.armed;
        btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Could not delete, try again';
    }
}

// ==================== LOAD MORE ====================
// FEED_LOAD_MORE_20261113: one page per click. A second click while a page is
// still loading used to skip a page (the offset moved twice, one response won).
function loadMorePosts() {
    const list = document.getElementById('feedList');
    if (list && list.getAttribute('aria-busy') === 'true') return;
    feedOffset += FEED_LIMIT;
    loadFeed();
}
