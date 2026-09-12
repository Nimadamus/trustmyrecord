/* tmr-forum-app.js
 * PERF_SHELL_SPLIT_20260911: lifted verbatim out of the inline <script> at the
 * end of forum/index.html. Not one character of logic changed -- the only
 * difference is that these ~147KB now live in a cacheable file instead of being
 * re-sent inside the HTML on every forum page view, and instead of being
 * re-parsed by document.write() on every /forum/thread/<id>/<slug>/ hit.
 * Loaded WITHOUT defer at the exact position the inline block occupied, so
 * execution order relative to config.js/backend-api.js/auth-persistent.js/
 * notifications.js/forum-notification-bell.js above it, and the small inline
 * block below it, is byte-for-byte the same as before.
 */

// =====================================================================
// 2+2-style render overrides (Apr 30 2026)
// Replaces the old card-based renderCategories / renderSampleThreads /
// renderThreads with real <table> + <td bgcolor> markup that matches
// the classic vBulletin index.
// =====================================================================
function formatForumCountValue(value) {
    if (usingFallbackCategories || value === null || value === undefined || value === '') return '--';
    var n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString() : '--';
}

function forumSportBadge(slug, name) {
    var key = String(slug || name || '').toLowerCase();
    if (key.indexOf('mlb') !== -1 || key.indexOf('baseball') !== -1) return { code: 'MLB', cls: 'mlb' };
    if (key.indexOf('nfl') !== -1 || key.indexOf('football') !== -1 && key.indexOf('college') === -1) return { code: 'NFL', cls: 'nfl' };
    if (key.indexOf('nba') !== -1) return { code: 'NBA', cls: 'nba' };
    if (key.indexOf('nhl') !== -1 || key.indexOf('hockey') !== -1) return { code: 'NHL', cls: 'nhl' };
    if (key.indexOf('college-football') !== -1 || key.indexOf('cfb') !== -1) return { code: 'CFB', cls: 'cfb' };
    if (key.indexOf('college-basketball') !== -1 || key.indexOf('cbb') !== -1 || key.indexOf('ncaab') !== -1) return { code: 'CBB', cls: 'cbb' };
    if (key.indexOf('challenge') !== -1 || key.indexOf('market') !== -1) return { code: '$', cls: 'gen' };
    if (key.indexOf('support') !== -1 || key.indexOf('feedback') !== -1) return { code: '?', cls: 'gen' };
    if (key.indexOf('record') !== -1) return { code: 'REC', cls: 'gen' };
    if (key.indexOf('update') !== -1 || key.indexOf('announce') !== -1) return { code: 'TMR', cls: 'official' };
    return { code: 'TMR', cls: 'gen' };
}

// Build the left sidebar forum list straight from the live categories so a
// sidebar link can never dead-end on a slug the backend doesn't have.
// 2+2-style groups: "Popular Forums" (real thread counts) then the full list,
// each under a bold collapsible group title.
function forumSidebarLink(c) {
    var slug = String(c.slug || '');
    var name = c.name || slug || 'Forum';
    return '<a class="fside-forum" data-cat-slug="' + escHtml(slug) + '" onclick="onSidebarPick(this,\'' + escHtml(slug) + '\',\'' + escHtml(name) + '\')">' + escHtml(name) + '</a>';
}
function tmrToggleSideGroup(el) {
    var body = el.nextElementSibling;
    if (!body) return;
    var closed = body.style.display === 'none';
    body.style.display = closed ? '' : 'none';
    el.classList.toggle('is-closed', !closed);
}
function renderForumSidebar() {
    var list = document.getElementById('forumSidebarList');
    if (!list) return;
    if (forumLoadState === 'loading') {
        list.innerHTML = '<a class="fside-loading">Loading forums&hellip;</a>';
        return;
    }
    if (forumLoadState === 'error') {
        list.innerHTML = '<a class="fside-loading" style="cursor:pointer;text-decoration:underline;" onclick="retryLoadCategories()">Couldn\'t load - retry</a>';
        return;
    }
    var cats = categories || [];
    if (!cats.length) {
        list.innerHTML = '<a class="fside-loading">No forums yet</a>';
        return;
    }
    var popular = cats.slice().filter(function(c) { return Number(c.thread_count) > 0; })
        .sort(function(a, b) { return Number(b.thread_count) - Number(a.thread_count); })
        .slice(0, 6);
    var html = '';
    if (popular.length) {
        html += '<div class="fside-group">'
             + '<a class="fside-gtitle" onclick="tmrToggleSideGroup(this)">Popular Forums <span class="fside-star">&#9733;</span><i class="fside-arrow"></i></a>'
             + '<div class="fside-gbody">' + popular.map(forumSidebarLink).join('') + '</div>'
             + '</div>';
    }
    /* SIDEBAR_SECTIONS_20260812: the sidebar used to dump every forum under one
       flat "Sports Betting" heading, which read as a raw list. It now mirrors
       the section bars in the directory (same groupCategoriesForDisplay source),
       so a heading in the sidebar means the same thing as a bar in the body.
       Every link that existed before still exists. */
    groupCategoriesForDisplay().forEach(function(group) {
        html += '<div class="fside-group">'
             + '<a class="fside-gtitle" onclick="tmrToggleSideGroup(this)">' + escHtml(group.name) + '<i class="fside-arrow"></i></a>'
             + '<div class="fside-gbody">' + group.categories.map(forumSidebarLink).join('') + '</div>'
             + '</div>';
    });
    list.innerHTML = html;
    if (currentCategorySlug) setActiveSidebar(currentCategorySlug);
}

/* ---------------------------------------------------------------------------
   Shared member-link helpers (Jul 15, 2026)

   Every username and avatar in the forum -- thread rows, the Last Post cell,
   the category index, search results, and the post author panel -- clicks
   through to that member's public profile at /u/<username>/, where the Forum
   Activity section lists their full Posts and Threads history. Keep every
   render site going through these helpers so the destination cannot drift
   apart again.

   Rows in the thread/category tables are themselves click targets (the whole
   <tr> carries role="link" + onclick), so links built here stop propagation:
   clicking a name opens the profile, not the thread underneath it.

   TMR_FORUM_SAMPLE_THREADS placeholders ('TrustMyRecord', 'user') are literal
   strings rather than accounts, so they render as plain text, never as a link
   that would 404.
--------------------------------------------------------------------------- */
var FORUM_NON_MEMBER_NAMES = { 'user': 1, 'trustmyrecord': 1, '': 1 };

function forumProfileHref(username) {
    var name = String(username == null ? '' : username).trim();
    if (!name || FORUM_NON_MEMBER_NAMES[name.toLowerCase()]) return '';
    return '/u/' + encodeURIComponent(name) + '/';
}

function forumUserLinkHtml(username, extraClass) {
    var name = String(username == null ? '' : username).trim();
    var href = forumProfileHref(name);
    if (!href) return escHtml(name);
    return '<a class="fuser-link' + (extraClass ? ' ' + extraClass : '') + '"'
        + ' href="' + href + '"'
        + ' title="View ' + escHtml(name) + ' profile"'
        + ' onclick="event.stopPropagation();">' + escHtml(name) + '</a>';
}

/* 28px row avatar, linked when the name is a real member. A linked avatar
   becomes a real tab stop, so it drops aria-hidden and is labelled instead;
   the <img> keeps an empty alt because the adjacent username link already
   names the same destination. */
function tmrAvaSrc(user) {
    /* ONE RESOLVER (2026-09-08). Never an initial and never a placeholder: the
       API's avatar route resolves upload -> favourite-team club mark -> neutral
       face, so a member wears the same face here as on every other surface. */
    if (window.TMRAvatar && window.TMRAvatar.src) return window.TMRAvatar.src(user);
    var u = user || {};
    var direct = u.avatar_url || u.avatarUrl || u.avatar || '';
    if (direct && typeof direct === 'string') return direct;
    var key = u.id != null ? u.id : (u.username || '');
    if (key === '' || key == null) return '';
    var base = (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api';
    return String(base).replace(/\/+$/, '') + '/users/' + encodeURIComponent(key) + '/avatar';
}

function forumRowAvatarHtml(username, avatarUrl) {
    var name = String(username == null ? '' : username).trim();
    var initials = String(name || '?').slice(0, 1).toUpperCase();
    /* ONE RESOLVER (2026-09-08): a member with no upload gets their
       favourite-team club mark from the avatar route, never an initial. */
    var resolved = tmrAvaSrc({ username: name, avatar_url: avatarUrl });
    var inner = resolved
        ? '<img src="' + escHtml(resolved) + '" alt="" loading="lazy">'
        : escHtml(initials);
    var href = forumProfileHref(name);
    if (!href) return '<span class="fthread-row-avatar" aria-hidden="true">' + inner + '</span>';
    return '<a class="fthread-row-avatar" href="' + href + '"'
        + ' aria-label="View ' + escHtml(name) + ' profile"'
        + ' onclick="event.stopPropagation();">' + inner + '</a>';
}

/* Canonical permalink to a single post. The thread view renders every post in
   one document, so #post-<id> alone locates the reply -- ?thread= and ?post=
   ride along so the link still resolves on a cold load, where the hash by
   itself would not tell the router which thread to open. */
/* Clean canonical thread URL: /forum/thread/<id>/<slug>/ (built by
   scripts/build_forum_threads.py). The ID is authoritative and always present --
   slugs are NOT unique across threads, so the id disambiguates. When no slug is
   known (a payload that doesn't carry one), fall back to the legacy ?thread=
   form, which still works. */
function forumThreadSlug(t) {
    if (!t) return '';
    return String(t.slug || t.thread_slug || '');
}
function forumThreadUrl(threadId, slug) {
    var tid = (threadId != null) ? String(threadId) : '';
    if (!tid) return '/forum/';
    var s = slug ? String(slug) : '';
    if (!s) return '/forum/?thread=' + encodeURIComponent(tid);
    return '/forum/thread/' + encodeURIComponent(tid) + '/' + encodeURIComponent(s) + '/';
}
function forumPostPermalink(threadId, postId, slug) {
    var tid = (threadId != null) ? String(threadId) : '';
    var pid = (postId != null) ? String(postId) : '';
    if (!tid) return '#post-' + encodeURIComponent(pid);
    var base = forumThreadUrl(tid, slug || (cachedThread && cachedThread.id == tid
        ? forumThreadSlug(cachedThread) : ''));
    if (!pid) return base;
    // Clean URL renders every post in one document, so #post-<id> alone locates
    // the reply. The legacy fallback still needs ?post= to survive a cold load.
    if (base.indexOf('?') === -1) return base + '#post-' + encodeURIComponent(pid);
    return base + '&post=' + encodeURIComponent(pid) + '#post-' + encodeURIComponent(pid);
}

/* Scroll one reply into view and flash it so the visitor sees which post the
   link meant. Callers run this after the thread has rendered, so there is no
   timeout racing the paint. Returns true when the post existed. */
function forumScrollToPost(postId) {
    var pid = String(postId == null ? '' : postId).trim();
    if (!pid) return false;
    var esc = (window.CSS && CSS.escape) ? CSS.escape(pid) : pid.replace(/"/g, '\\"');
    var target = document.getElementById('post-' + pid)
        || document.querySelector('#postsContainer .fthread-post[data-post-id="' + esc + '"]');
    if (!target) return false;
    var prev = document.querySelectorAll('#postsContainer .fthread-post.is-target');
    for (var i = 0; i < prev.length; i++) prev[i].classList.remove('is-target');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('is-target');
    setTimeout(function () { target.classList.remove('is-target'); }, 2600);
    return true;
}

function renderCategories() {
    var container = document.getElementById('categoriesContainer');
    if (!container) return;
    // Gate the decorative sample table on a real successful load.
    document.body.classList.toggle('forum-ready', forumLoadState === 'loaded' && categories.length > 0);
    // While the forum data is still loading OR the load failed, never paint the
    // definitive "No forum categories yet" empty state - show a skeleton or a
    // real error with retry instead.
    if (forumLoadState === 'loading') {
        container.innerHTML = '<div class="tmr-loading-state"><div class="tmr-spinner"></div><p>Loading forums&hellip;</p></div>';
        return;
    }
    if (forumLoadState === 'error') {
        container.innerHTML =
            '<div class="tmr-loading-state">' +
            '<p>Could not load the forums right now.</p>' +
            '<p class="tmr-loading-slow" style="display:block;">The server may be warming up. Retrying automatically&hellip;</p>' +
            '<div class="tmr-loading-retry" style="display:block;"><button type="button" onclick="retryLoadCategories()">Try Again</button></div>' +
            '</div>';
        return;
    }
    if (!categories.length) {
        // Reached only after a successful API response that genuinely returned [].
        container.innerHTML = '<div class="fempty">No forum categories yet.</div>';
        return;
    }
    var groups = groupCategoriesForDisplay();
    /* FORUM_INDEX_POSTS_COLUMN_20260711: index shows Forum / Last Post / Threads / Posts,
       2+2-style. Both counts are real values from the categories API (post_count).
       Like 2+2, ONE column-label row sits above the whole listing; each category
       is a black bar followed by its forum rows. */
    /* COLUMN_ALIGNMENT_20260812: the label row and every section live in their
       own <table>, so the four columns had no shared width source and the
       "Threads"/"Posts" headings sat visibly off the numbers under them (Nima's
       item 17). One identical <colgroup> in every table pins Forum / Last Post /
       Threads / Posts to the same widths in all of them, which is what makes the
       statistics line up down the whole page. Widths live in CSS. */
    var COLS = '<colgroup><col class="fcol-forum"><col class="fcol-last"><col class="fcol-thr"><col class="fcol-post"></colgroup>';
    var html = '<table class="fgroup-table f2p2-labels" cellpadding="2" cellspacing="1">' + COLS
             + '<tr class="fcol-head"><td>Forum</td><td class="col-last">Last Post</td><td class="col-num">Threads</td><td class="col-num">Posts</td></tr>'
             + '</table>';
    groups.forEach(function(group) {
        html += '<table class="fgroup-table" cellpadding="2" cellspacing="1">' + COLS;
        html += '<tr class="fgroup-band"><td colspan="3"><span class="fband-txt">' + escHtml(group.name) + '</span></td><td class="fgroup-meta" aria-hidden="true"></td></tr>';
        group.categories.forEach(function(cat, i) {
            var threads = Number(cat.thread_count) || 0;
            /* POST_COUNT_MAPPING_20260812: /api/forum/categories returns
               post_count = COUNT(forum_posts), and a thread's OPENING post has
               no forum_posts row (utils/forumStats.js is the source of truth).
               Printing it raw produced rows like MLB "86 threads / 35 posts",
               i.e. fewer posts than threads, which reads as a broken column
               mapping. Total posts = openers + replies, exactly as the Forum
               Statistics block at the bottom of this page already counts them.
               Display-only fix: no API or schema change. */
            var posts = threads + (Number(cat.post_count) || 0);
            var threadCount = formatForumCountValue(threads);
            var postCount = formatForumCountValue(posts);
            var lastHtml = '<span class="flpost-empty">No live threads yet</span>';
            if (cat.latest_thread) {
                var lt = cat.latest_thread;
                var ltTitle = lt.title || '';
                /* F2P2_PARITY_20260719: 2+2 stacked block - dark bold title / by user / gray time.
                   CSS ellipsizes the title; link stops row-click propagation. */
                lastHtml = '<div class="flpost-title"><a title="' + escHtml(ltTitle) + '" href="' + escHtml(forumThreadUrl(lt.id, forumThreadSlug(lt))) + '" onclick="event.preventDefault();event.stopPropagation();showThreadDetail(' + lt.id + ');">' + escHtml(ltTitle) + '</a></div>'
                         + '<div class="flpost-by">by ' + forumUserLinkHtml(lt.username || '') + '</div>'
                         + '<div class="flpost-meta">' + formatForumStamp(lt.last_post_at || lt.created_at) + '</div>';
            }
            var rowClass = 'frow' + (i % 2 === 1 ? ' row-alt' : '');
            var badge = forumSportBadge(cat.slug, cat.name);
            var openCall = 'showThreadsList(\'' + escHtml(cat.slug) + '\',\'' + escHtml(cat.name) + '\',' + (cat.id == null ? 'null' : (typeof cat.id === 'number' ? cat.id : ('\'' + escHtml(String(cat.id)) + '\''))) + ')';
            html += '<tr class="' + rowClass + '" role="link" tabindex="0" aria-label="Open forum: ' + escHtml(cat.name) + '"'
                + ' onclick="' + openCall + '"'
                + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();' + openCall + ';}">'
                + '<td class="fcell"><div class="frowinner"><span class="sport-icon ' + badge.cls + '">' + escHtml(badge.code) + '</span><div class="frowtext"><div class="fname">' + escHtml(cat.name) + (cat.is_official ? ' <span class="fofficial-tag">Official</span>' : '') + '</div><div class="fdesc">' + escHtml(cat.description || '') + '</div></div></div></td>'
                + '<td class="fcell col-last" data-col="Last Post">' + lastHtml + '</td>'
                + '<td class="fcell col-num" data-col="Threads">' + threadCount + '</td>'
                + '<td class="fcell col-num" data-col="Posts">' + postCount + '</td>'
                + '</tr>';
        });
        html += '</table>';
    });
    container.innerHTML = html;
}

function renderSampleThreads() {
    var body = document.getElementById('sampleThreadBody');
    if (!body) return;
    body.innerHTML = TMR_FORUM_SAMPLE_THREADS.map(function(t, i) {
        var rowClass = 'frow' + (i % 2 === 1 ? ' row-alt' : '');
        var folderClass = 'ffolder' + (t.sticky ? ' is-pinned' : '');
        var stickyTag = t.sticky ? '<span class="fsticky-tag">Sticky</span>' : '';
        return '<tr class="' + rowClass + '" onclick="openNewThread()">'
            + '<td class="fcell"><div class="frowinner"><span class="' + folderClass + '"></span><div>'
            +   stickyTag
            +   '<a class="fname" href="#" onclick="event.preventDefault();event.stopPropagation();openNewThread();">' + escHtml(t.title) + '</a>'
            +   '<div class="fdesc">Started by <b>' + escHtml(t.starter) + '</b></div>'
            + '</div></div></td>'
            + '<td class="fcell col-num">&nbsp;</td>'
            + '<td class="fcell col-last"><span class="flpost-empty">' + escHtml(t.lastTime || '—') + ' · by <b>' + escHtml(t.lastPoster || '—') + '</b></span></td>'
            + '<td class="fcell col-num">' + t.replies + '</td>'
            + '<td class="fcell col-num">' + t.views + '</td>'
            + '</tr>';
    }).join('');
}

// Posts per page for in-thread pagination. Page count in the thread list is
// derived from the real reply_count; clicking a page number opens the thread
// and jumps to that page's first post. Tune here if the thread view changes.
var FORUM_POSTS_PER_PAGE = 20;

function threadTotalPages(t) {
    var replies = Number(t.reply_count != null ? t.reply_count : (t.replies || 0));
    if (!Number.isFinite(replies) || replies < 0) replies = 0;
    return Math.max(1, Math.ceil((replies + 1) / FORUM_POSTS_PER_PAGE));
}

// Compact "1 2 3 4 5 … Last" links beside a multi-page thread title. Returns ''
// for single-page threads so nothing renders. Numbers are real (from reply_count).
function threadPagesHtml(t) {
    var pages = threadTotalPages(t);
    if (pages <= 1) return '';
    var id = t.id;
    var call = function (p, label, extra) {
        return '<a class="fpage' + (extra || '') + '" href="#" title="Page ' + p + '" '
            + 'onclick="event.preventDefault();event.stopPropagation();showThreadDetail(' + id + ',' + p + ');">' + label + '</a>';
    };
    var out = '<span class="fthread-pages" aria-label="Thread pages">';
    if (pages <= 6) {
        for (var p = 1; p <= pages; p++) out += call(p, p);
    } else {
        for (var q = 1; q <= 5; q++) out += call(q, q);
        out += '<span class="fpage-ellip" aria-hidden="true">&hellip;</span>';
        out += call(pages, 'Last', ' fpage-last');
    }
    out += '</span>';
    return out;
}

/* Success-only empty message for feed views (New Posts). Set by
   tmrfhShowThreadFeed, cleared by loadThreads for category views. */
var tmrfhFeedEmptyMsg = null;

function renderThreads() {
    var body = document.getElementById('threadsBody');
    if (!body) return;
    if (!cachedThreads.length) {
        if (tmrfhFeedEmptyMsg) {
            body.innerHTML = '<tr><td class="fcell" colspan="5">'
                + '<div class="fempty"><div class="fempty-cta-msg">' + escHtml(tmrfhFeedEmptyMsg) + '</div></div>'
                + '</td></tr>';
            updateForumJump();
            return;
        }
        var loggedIn = (typeof isUserLoggedIn === 'function') && isUserLoggedIn();
        var ctaMsg = loggedIn
            ? 'No threads here yet. Be the first to start the discussion.'
            : 'No threads here yet. Be the first to start this discussion. Log in to post.';
        var ctaLabel = loggedIn ? '+ Start the First Thread' : 'Log in to Start the First Thread';
        body.innerHTML = '<tr><td class="fcell" colspan="5">'
            + '<div class="fempty fempty-cta">'
            +   '<div class="fempty-cta-msg">' + ctaMsg + '</div>'
            +   '<button type="button" class="fbtn is-primary fempty-cta-btn" onclick="openNewThread()">' + ctaLabel + '</button>'
            + '</div></td></tr>';
        updateForumJump();
        return;
    }
    /* F2P2_SORT_20260719: classic forum order — pinned first, then latest activity. */
    var sortedThreads = cachedThreads.slice().sort(function(a, b) {
        var ap = (a.is_pinned || a.sticky) ? 1 : 0, bp = (b.is_pinned || b.sticky) ? 1 : 0;
        if (ap !== bp) return bp - ap;
        var at = new Date(a.last_post_at || a.last_post_created_at || a.last_activity || a.updated_at || a.created_at || 0).getTime() || 0;
        var bt = new Date(b.last_post_at || b.last_post_created_at || b.last_activity || b.updated_at || b.created_at || 0).getTime() || 0;
        return bt - at;
    });
    body.innerHTML = sortedThreads.map(function(t, i) {
        var rowClass = 'frow' + (i % 2 === 1 ? ' row-alt' : '');
        var folderClass = 'ffolder' + (t.is_pinned || t.sticky ? ' is-pinned' : '');
        var stickyTag = (t.is_pinned || t.sticky) ? '<span class="fsticky-tag">Sticky</span>' : '';
        var starter = t.username || (t.user && t.user.username) || 'user';
        var starterAvatar = t.avatar_url || (t.user && (t.user.avatar_url || t.user.avatar)) || '';
        var avatarHtml = forumRowAvatarHtml(starter, starterAvatar);
        /* LAST_POST_NO_TITLE_20260711: the Last Post cell shows poster + time only.
           Never repeat the thread title here; it already leads the row (2+2 layout). */
        var lastUser = t.last_post_username || t.last_username || starter;
        var lastAvatar = t.last_post_avatar_url || t.last_avatar_url || t.last_user_avatar
            || ((lastUser && starter && lastUser === starter) ? starterAvatar : '');
        var lastAvatarHtml = forumRowAvatarHtml(lastUser, lastAvatar);
        var lastWhen = t.last_post_at || t.last_post_created_at || t.last_activity || t.updated_at;
        var lastHtml = lastWhen
            ? '<div class="flpost-line">' + lastAvatarHtml + '<div class="flpost-text"><div class="flpost-user"><b>' + forumUserLinkHtml(lastUser) + '</b></div><div class="flpost-meta">' + formatForumStamp(lastWhen) + '</div></div></div>'
            : '<span class="flpost-empty">No replies yet</span>';
        var ariaTitle = escHtml(t.title || 'Thread');
        return '<tr class="' + rowClass + '" role="link" tabindex="0" aria-label="Open thread: ' + ariaTitle + '" onclick="showThreadDetail(' + t.id + ')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();showThreadDetail(' + t.id + ');}">'
            + '<td class="fcell"><div class="frowinner"><span class="' + folderClass + '"></span>' + avatarHtml + '<div>'
            +   stickyTag
            +   '<a class="fname" href="' + escHtml(forumThreadUrl(t.id, forumThreadSlug(t))) + '" onclick="event.preventDefault();event.stopPropagation();showThreadDetail(' + t.id + ');">' + escHtml(t.title || 'Thread') + '</a>'
            +   threadPagesHtml(t)
            +   '<div class="fdesc">Started by <b>' + forumUserLinkHtml(starter) + '</b> ' + (t.created_at ? formatForumStamp(t.created_at) : '') + '</div>'
            + '</div></div></td>'
            + '<td class="fcell col-num">&nbsp;</td>'
            + '<td class="fcell col-last">' + lastHtml + '</td>'
            + '<td class="fcell col-num">' + Number(t.reply_count != null ? t.reply_count : (t.replies || 0)).toLocaleString() + '</td>'
            + '<td class="fcell col-num">' + Number(t.view_count != null ? t.view_count : (t.views || 0)).toLocaleString() + '</td>'
            + '</tr>';
    }).join('');
    updateForumJump();
}

function numericValue(value) {
    var n = parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
}

function firstFavoriteTeam(source) {
    var teams = source && (source.favorite_teams || source.favoriteTeams);
    if (Array.isArray(teams) && teams.length) {
        var first = teams[0];
        if (first && typeof first === 'object') return first.team || first.name || first.label || 'Not set';
        return first || 'Not set';
    }
    return source && (source.favorite_team || source.favoriteTeam) || 'Not set';
}

function userIsVerified(source) {
    var status = String(source && (source.verification_status || source.verified_record_status || source.role || '') || '').toLowerCase();
    return !!(source && (source.is_verified || source.verified || status === 'verified' || status === 'trusted' || status === 'premium'));
}

function starterPostFromThread(thread) {
    if (!thread || !String(thread.content || '').trim()) return null;
    return {
        id: 'thread-' + thread.id + '-starter',
        thread_id: thread.id,
        user_id: thread.user_id,
        username: thread.username,
        display_name: thread.display_name || thread.username,
        avatar_url: thread.avatar_url,
        headline: thread.headline,
        forum_undertitle: thread.forum_undertitle,
        user_joined: thread.user_joined,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
        content: thread.content,
        title: thread.title,
        is_thread_starter: true,
        is_edited: !!thread.is_edited,
        edited_at: thread.edited_at,
        moderator_edited: !!thread.moderator_edited,
        author_is_admin: !!thread.author_is_admin,
        author_is_moderator: !!thread.author_is_moderator,
        author_is_official_bot: !!thread.author_is_official_bot,
        like_count: numericValue(thread.like_count) || 0,
        liked_by_me: !!thread.liked_by_me,
        user_post_count: numericValue(thread.user_post_count),
        user_thread_count: numericValue(thread.user_thread_count),
        favorite_teams: thread.favorite_teams,
        favorite_team: thread.favorite_team,
        verification_status: thread.verification_status,
        user: {
            username: thread.username,
            display_name: thread.display_name || thread.username,
            avatar_url: thread.avatar_url,
            headline: thread.headline,
            forum_undertitle: thread.forum_undertitle,
            created_at: thread.user_joined,
            favorite_teams: thread.favorite_teams,
            favorite_team: thread.favorite_team,
            verification_status: thread.verification_status
        }
    };
}

function normalizedThreadPosts(thread, posts) {
    var normalized = [];
    var starter = starterPostFromThread(thread);
    if (starter) normalized.push(starter);
    (posts || []).slice().sort(function(a, b) {
        return new Date(a.created_at || a.createdAt || 0) - new Date(b.created_at || b.createdAt || 0);
    }).forEach(function(post) {
        if (!post || !String(post.content || post.body || '').trim()) return;
        normalized.push(post);
    });
    return normalized;
}

function authorSource(post) {
    var user = post.user || {};
    var username = user.username || user.display_name || post.username || post.display_name || 'user';
    var cached = forumAuthorCache[String(username).toLowerCase()] || {};
    return Object.assign({}, post, user, cached, { username: username });
}

function formatCount(value, fallback) {
    var n = numericValue(value);
    return n == null ? (fallback == null ? '0' : fallback) : String(n);
}

// Role-based badge under the username. Reads the role flags the API attaches
// to every post/thread row (author_is_admin / author_is_moderator from
// users.account_type) plus the /users/:username profile cache (is_admin).
// Never shows for normal users.
function authorIsAdmin(author) {
    return !!(author && (author.author_is_admin || author.is_admin || String(author.account_type || '').toLowerCase() === 'admin'));
}
function authorIsModerator(author) {
    return !!(author && (author.author_is_moderator || author.is_moderator || String(author.account_type || '').toLowerCase() === 'moderator'));
}
function authorRoleBadge(author) {
    if (authorIsAdmin(author)) return '<div><span class="fadmin-badge">ADMIN</span></div>';
    if (authorIsModerator(author)) return '<div><span class="fadmin-badge">MOD</span></div>';
    return '';
}

function renderAuthorPanel(post) {
    var author = authorSource(post);
    var who = author.display_name || author.username || 'user';
    var headline = String(author.headline || '').trim();
    var avatar = author.avatar_url || author.avatar || '';
    var initials = String(who || '?').slice(0, 1).toUpperCase();
    var role = (author.author_is_official_bot || author.is_official_bot)
        ? "TMR's Resident Bot"
        : (author.user_title || (userIsVerified(author) ? 'Verified Handicapper' : 'Member'));
    var favTeam = firstFavoriteTeam(author);
    var hasFavTeam = favTeam && favTeam !== 'Not set';
    var joined = author.user_joined || author.created_at || author.joined_at;
    var threadCount = author.user_thread_count;
    var postCount = author.user_post_count;
    if (post.is_thread_starter) {
        threadCount = numericValue(threadCount);
        if (threadCount == null) threadCount = 1;
        postCount = numericValue(postCount);
        if (postCount == null) postCount = threadCount;
    }
    // Every post author's name/avatar link to their public /u/ profile, never
    // to User CP (User CP is only reachable from the viewer's own nav link).
    // Official community bots (TMRPolls/TMRTrivia) are publicly addressable
    // since Jul 11 2026 (they author official TrustMyRecord Updates threads),
    // so their names/avatars click through to /u/ like any member.
    var isOfficialBot = !!(author.author_is_official_bot || author.is_official_bot);
    var profileUsername = author.username || author.display_name || '';
    var profileHref = profileUsername ? ('/u/' + encodeURIComponent(profileUsername) + '/') : '';
    var profileLabel = 'View ' + who + ' profile';
    var avatarResolved = tmrAvaSrc({ username: author.username || who, avatar_url: avatar });
    var avatarInner = avatarResolved ? '<img src="' + escHtml(avatarResolved) + '" alt="' + escHtml(who) + ' avatar">' : escHtml(initials);
    var avatarHtml = profileHref
        ? '<a class="fthread-avatar" href="' + profileHref + '" title="' + escHtml(profileLabel) + '" aria-label="' + escHtml(profileLabel) + '">' + avatarInner + '</a>'
        : '<div class="fthread-avatar">' + avatarInner + '</div>';
    var nameHtml = profileHref
        ? '<b><a href="' + profileHref + '" title="' + escHtml(profileLabel) + '">' + escHtml(who) + '</a></b>'
        : '<b>' + escHtml(who) + '</b>';
    // Official community bots get a distinct persona card (badge + tagline +
    // styled panel). Presentation only; profileHref/onclick/logic untouched.
    var botClass = isOfficialBot ? ' fthread-author--bot' : '';
    // Follow-the-user control (distinct from the thread-subscription "Follow Thread"
    // button). Lets a member follow this author straight from their forum post.
    var fViewer = (typeof getForumSessionUser === 'function') ? getForumSessionUser() : null;
    var fViewerName = fViewer && fViewer.username ? String(fViewer.username).toLowerCase() : '';
    var fAuthorId = author.user_id || author.id || (author.user && author.user.id) || '';
    var canFollowUser = !!fViewer && !isOfficialBot && profileUsername && String(profileUsername).toLowerCase() !== fViewerName;
    var followUserHtml = canFollowUser
        ? '<div class="fthread-author-row" style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">'
            + '<button type="button" class="fpost-btn ffollow-user-btn" data-username="' + escHtml(profileUsername) + '" data-userid="' + escHtml(String(fAuthorId)) + '" onclick="forumFollowUser(this)">+ Follow</button>'
            + '<a class="fpost-btn fmessage-user-btn" href="/messages/?to=' + encodeURIComponent(profileUsername) + '" title="Send a private message">Message</a>'
          + '</div>'
        : '';
    var botBadge = isOfficialBot ? '<div><span class="fbot-badge">Bot</span></div>' : '';
    // Author-card undertitle. Precedence: the founder/admin account shows the short
    // "Founder" tag (its profile headline is a long bio, unfit for a post card). Every
    // other member shows their saved custom undertitle (users.headline) so short custom
    // titles like "TMR OG" render sitewide. A length cap keeps the card clean if a
    // member sets an over-long headline. Bots keep their fbot-tagline below.
    // users.forum_undertitle is an admin-assigned permanent post undertitle
    // (e.g. "TMR OG", "TMR QUEEN"); it wins over the headline-derived one and
    // never touches the headline, role line, or badges.
    var customUndertitle = String(author.forum_undertitle || '').trim();
    // custom_flair_text is a user-set flair, self-service (routes/users.js PUT
    // /forum-flair), gated on redeeming the TMR Coin 'custom_forum_flair'
    // catalog item -- ranks below the admin-assigned forum_undertitle (which
    // must always win) but above the default headline fallback.
    var customFlair = String(author.custom_flair_text || '').trim();
    var undertitleText = '';
    if (!isOfficialBot) {
        if (customUndertitle) {
            undertitleText = customUndertitle.length > 48 ? (customUndertitle.slice(0, 47).trim() + '…') : customUndertitle;
        } else if (authorIsAdmin(author)) {
            undertitleText = 'Founder';
        } else if (customFlair) {
            undertitleText = customFlair.length > 48 ? (customFlair.slice(0, 47).trim() + '…') : customFlair;
        } else if (headline) {
            undertitleText = headline.length > 48 ? (headline.slice(0, 47).trim() + '…') : headline;
        }
    }
    var undertitle = undertitleText
        ? '<div class="fthread-undertitle">' + escHtml(undertitleText) + '</div>'
        : '';
    var botTagline = isOfficialBot
        ? '<div class="fbot-tagline">' + escHtml((headline || '') || 'Your friendly TMR house bot') + '</div>'
        : '';
    return '<div class="fthread-author' + botClass + '">'
        + avatarHtml
        + nameHtml
        + botBadge
        + undertitle
        + authorRoleBadge(author)
        + '<div class="fthread-role">' + escHtml(role) + '</div>'
        + botTagline
        + (hasFavTeam ? '<div class="fthread-fandom"><span class="fthread-fandom-dot"></span>' + escHtml(favTeam) + '</div>' : '')
        + '<div class="fthread-author-row">Joined: ' + escHtml(joined ? formatJoinedDate(joined) : 'Not available') + '</div>'
        + '<div class="fthread-author-row">Posts: ' + escHtml(formatCount(postCount)) + '</div>'
        + '<div class="fthread-author-row">Threads: ' + escHtml(formatCount(threadCount)) + '</div>'
        + (userIsVerified(author) ? '<span class="fthread-badge">Verified record</span>' : '')
        + followUserHtml
        + '</div>';
}

// Follow (or, once following, open the author's profile to manage preferences)
// straight from a forum post's author panel.
async function forumFollowUser(btn) {
    if (!btn) return;
    var username = btn.getAttribute('data-username') || '';
    var userId = btn.getAttribute('data-userid') || '';
    if (btn.getAttribute('data-following') === '1') {
        window.location.href = '/profile/?user=' + encodeURIComponent(username);
        return;
    }
    btn.disabled = true;
    try {
        if (!userId || userId === 'undefined' || userId === 'null') {
            var prof = await api.getUser(username);
            var u = (prof && (prof.user || prof)) || {};
            userId = u.id;
        }
        if (!userId) throw new Error('no id');
        await api.followUser(userId);
        btn.textContent = '✓ Following';
        btn.setAttribute('data-following', '1');
        btn.setAttribute('data-userid', String(userId));
        btn.title = 'Manage notification preferences on their profile';
    } catch (e) {
        alert((e && e.message) ? e.message : 'Could not follow this user');
    } finally {
        btn.disabled = false;
    }
}

function renderThread() {
    var c = document.getElementById('postsContainer');
    if (!c) return;
    var posts = normalizedThreadPosts(cachedThread, cachedPosts);
    if (!posts.length && cachedThread) {
        c.innerHTML = '<div class="fempty">Thread has no posts.</div>';
        return;
    }
    var sessionUser = (typeof getForumSessionUser === 'function') ? getForumSessionUser() : null;
    var myUsername = sessionUser && sessionUser.username ? String(sessionUser.username).toLowerCase() : '';
    var myUserId = sessionUser && (sessionUser.id != null) ? String(sessionUser.id) : '';
    // Server-confirmed flag (set from GET /forum/threads/:id viewer payload)
    // is the primary source; localStorage role flags are a fallback for fresh
    // logins. The backend re-checks the role on every moderator endpoint.
    var canModerate = window.__forumViewerIsModerator === true
        || !!(sessionUser && (sessionUser.is_admin || sessionUser.is_moderator || sessionUser.role === 'admin' || sessionUser.role === 'moderator'));
    var isLoggedIn = !!sessionUser;
    window.__forumCachedPostsById = {};
    c.innerHTML = posts.map(function(p, idx) {
        // No per-post title row: the thread title is shown once in the thread
        // header above the post list, so repeating it inside post #1 (or echoing
        // it on replies) is redundant. Post body starts directly under the meta.
        var postNo = idx + 1;
        var postId = (p.id != null) ? String(p.id) : '';
        if (postId) window.__forumCachedPostsById[postId] = p;
        var postAuthorName = String((p.user && (p.user.username || p.user.display_name)) || p.username || p.display_name || '').toLowerCase();
        var postAuthorId = (p.user_id != null) ? String(p.user_id) : ((p.user && p.user.id != null) ? String(p.user.id) : '');
        var isOwner = !!myUsername && (postAuthorName === myUsername || (!!myUserId && !!postAuthorId && myUserId === postAuthorId));
        var canEdit = isOwner || canModerate;
        // Regular users can delete their own post only within 15 min of posting.
        // Moderators/admins are exempt. Backend enforces the same rule.
        var withinDeleteWindow = false;
        if (p.created_at) {
            var createdMs = new Date(p.created_at).getTime();
            withinDeleteWindow = !isNaN(createdMs) && (Date.now() - createdMs) <= (15 * 60 * 1000);
        }
        var canDelete = canModerate || (isOwner && withinDeleteWindow);
        var likeCount = numericValue(p.like_count); if (likeCount == null) likeCount = 0;
        var likeTarget = p.is_thread_starter ? (p.thread_id || (cachedThread && cachedThread.id)) : postId;
        /* SHARE_SYSTEM_PHASE1_20260721: per-post share control.
           The thread opener has no forum_posts row (synthetic id
           'thread-<id>-starter'), so it shares the THREAD, not a post. The URL is
           built from forumThreadUrl(), the same builder the address bar and the
           canonical use, so no second URL format is introduced -- the ?post= /
           #post- pair is appended for replies because that is the shape the
           shared-link arrival handlers read. */
        var shareTid = p.thread_id || (cachedThread && cachedThread.id) || currentThreadId;
        var shareSlug = forumThreadSlug(cachedThread);
        var shareIsThread = !!p.is_thread_starter;
        var shareType = shareIsThread ? 'thread' : 'post';
        var shareId = shareIsThread ? String(shareTid == null ? '' : shareTid) : postId;
        var sharePath = '';
        if (shareTid) {
            var shareBase = forumThreadUrl(shareTid, shareSlug);
            sharePath = shareIsThread
                ? shareBase
                : shareBase + (shareBase.indexOf('?') === -1 ? '?' : '&')
                    + 'post=' + encodeURIComponent(postId) + '#post-' + encodeURIComponent(postId);
        }
        var shareLabel = shareIsThread ? 'Share this thread' : 'Share this post';
        /* Deleted / removed content is never rendered here in the first place
           (see normalizedThreadPosts + forumDeletePost), but if a soft-delete or
           moderation flag ever arrives on a post, no share control is emitted. */
        var canShare = !!sharePath && !!shareId
            && !(p.is_deleted || p.deleted_at || p.is_removed || p.is_hidden || p.is_moderated);
        // Tipping only applies to a real forum_posts row (a numeric id) -- the
        // thread starter uses the synthetic 'thread-<id>-starter' id and has no
        // ledger-addressable author to resolve server-side the same way, so it
        // is excluded here the same way canShare/canEdit treat it elsewhere.
        // Self-tip is also excluded client-side as a UX nicety; the server
        // re-checks this authoritatively regardless (SelfTipError).
        var canTip = isLoggedIn && postId && /^\d+$/.test(postId) && !!postAuthorId && postAuthorId !== myUserId;
        var actions = '<div class="fpost-actions">'
            + (likeTarget ? '<button type="button" class="fpost-btn is-like' + (p.liked_by_me ? ' is-liked' : '') + '" onclick="forumLikePost(\'' + escHtml(String(likeTarget)) + '\',' + (p.is_thread_starter ? 'true' : 'false') + ',this)">Like <span class="fpost-like-count">(' + likeCount + ')</span></button>' : '')
            + (isLoggedIn && postId ? '<button type="button" class="fpost-btn" onclick="forumQuotePost(\'' + escHtml(postId) + '\')">Quote</button>' : '')
            + '<button type="button" class="fpost-btn" onclick="forumFocusReply()">Reply</button>'
            + (canTip ? '<button type="button" class="fpost-btn is-tip" onclick="forumTipPost(\'' + escHtml(postId) + '\',this)">🪙 Tip TMR</button>' : '')
            + (isLoggedIn && p.is_thread_starter ? '<button type="button" class="fpost-btn is-sub' + ((cachedThread && cachedThread.subscribed_by_me) ? ' is-subscribed' : '') + '" onclick="forumToggleSubscribe(this)">' + ((cachedThread && cachedThread.subscribed_by_me) ? 'Unfollow Thread' : 'Follow Thread') + '</button>' : '')
            + (canShare ? '<button type="button" class="fpost-btn" data-tmr-share data-share-type="' + shareType + '" data-share-id="' + escHtml(String(shareId)) + '" data-share-url="' + escHtml('https://trustmyrecord.com' + sharePath) + '" title="' + escHtml(shareLabel) + '" aria-label="' + escHtml(shareLabel) + '">Share</button>' : '')
            + (canEdit && postId ? '<button type="button" class="fpost-btn is-edit" onclick="forumEditPost(\'' + escHtml(postId) + '\')">Edit</button>' : '')
            + (canDelete && postId ? '<button type="button" class="fpost-btn is-delete" onclick="forumDeletePost(\'' + escHtml(postId) + '\')">Delete</button>' : '')
            + (canModerate && p.is_thread_starter ? '<button type="button" class="fpost-btn is-mod" onclick="forumLockThread(this)">' + ((cachedThread && cachedThread.is_locked) ? 'Unlock Thread' : 'Lock Thread') + '</button>' : '')
            + (canModerate && p.is_thread_starter ? '<button type="button" class="fpost-btn is-mod" onclick="forumPinThread(this)">' + ((cachedThread && cachedThread.is_pinned) ? 'Unpin Thread' : 'Pin Thread') + '</button>' : '')
            + '</div>';
        var editedLine = (p.is_edited && p.edited_at) ? '<div class="fpost-edited" id="postEdited-' + escHtml(postId) + '">Last edited ' + escHtml(formatEditedDate(p.edited_at)) + (p.moderator_edited ? ' by moderator' : '') + '</div>' : '';
        // The post card itself carries id="post-<id>" so a #post-<id> deep link
        // (from a profile's Forum Activity list, a notification, or a copied
        // permalink) scrolls to AND can highlight the whole reply. The id used to
        // sit on an empty zero-height <a> inside .meta, which scrolled roughly
        // right but could never be highlighted -- do not reintroduce that anchor
        // here or the two nodes collide on a duplicate id.
        // Thread-starter ids are the synthetic string 'thread-<id>-starter'
        // (see starterPostFromThread), so nothing here may assume a numeric id.
        var permalink = forumPostPermalink(p.thread_id || (cachedThread && cachedThread.id), postId,
            forumThreadSlug(cachedThread));
        // TMR tip display: public to every viewer (not just the tipper/author),
        // rendered from the batched per-post summary the backend already
        // attaches to each post (routes/forum.js getTipSummaryForPosts).
        var tipsLine = '';
        if (Array.isArray(p.tips) && p.tips.length) {
            tipsLine = '<div class="fpost-tips" id="postTips-' + escHtml(postId) + '">' + p.tips.map(function(t) {
                return '<span class="fpost-tip-line">🪙 ' + escHtml(t.username) + ' gave ' + Number(t.amount) + ' TMR for this post</span>';
            }).join('') + '</div>';
        }
        return '<div class="fthread-post" data-post-id="' + escHtml(postId) + '"'
            + (postId ? ' id="post-' + escHtml(postId) + '"' : '') + '>'
            + renderAuthorPanel(p)
            + '<div class="fthread-body">'
            +   '<div class="meta"><span>' + (p.created_at ? formatForumDate(p.created_at) : '—') + '</span>'
            +   (postId
                    ? '<a class="fthread-post-num fpost-permalink" href="' + escHtml(permalink) + '" title="Permalink to this post">#' + postNo + '</a>'
                    : '<span class="fthread-post-num">#' + postNo + '</span>')
            +   '</div>'
            +   '<div class="fpost-content" id="postContent-' + escHtml(postId) + '">' + forumRenderContent(p.content || p.body || '') + '</div>'
            +   editedLine
            +   actions
            +   tipsLine
            + '</div></div>';
    }).join('');
}

// Render post body: HTML-escape first (XSS-safe), then turn URLs into clickable
// links and embed videos (YouTube + direct mp4/webm/ogg) so members can post
// links and video. Newlines -> <br>. Embeds are built only from matched, safe
// URL patterns operating on already-escaped text.
function forumRenderContent(raw) {
    var esc = escHtml(String(raw == null ? '' : raw));
    // :shortcode: -> classic board smilie GIF (safe: runs on escaped text).
    if (window.TMRSmilies) esc = TMRSmilies.toHtml(esc);
    // Stash finished media HTML behind placeholder tokens so the bare-URL
    // linkifier can never re-process a URL that already lives inside a tag.
    var slots = [];
    function slot(html) { slots.push(html); return '\u0000M' + (slots.length - 1) + '\u0000'; }
    function ytEmbed(url) {
        var yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
        return yt ? '<span class="fpost-embed"><iframe src="https://www.youtube.com/embed/' + yt[1] + '" title="Video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></span>' : null;
    }
    function cfEmbed(url) {
        var cf = url.match(/(?:iframe|watch|customer-[\w-]+)\.cloudflarestream\.com\/([A-Za-z0-9]{16,64})/);
        return cf ? '<span class="fpost-embed"><iframe src="https://iframe.cloudflarestream.com/' + cf[1] + '" title="Video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></span>' : null;
    }
    function videoEmbed(url) {
        return '<span class="fpost-embed"><video controls preload="metadata" playsinline><source src="' + url.replace(/"/g, '%22') + '"></video></span>';
    }
    function imgEmbed(url, kind) {
        return '<span class="fpost-media"><img src="' + url.replace(/"/g, '%22') + '" alt="' + (kind || 'image') + '" loading="lazy"></span>';
    }
    function giphyDirect(url) {
        var m = url.match(/(?:giphy\.com\/(?:gifs|embed|media|clips)|i\.giphy\.com)\/(?:[\w-]*-)?([A-Za-z0-9]{8,})/);
        if (m) return 'https://media.giphy.com/media/' + m[1] + '/giphy.gif';
        return null;
    }
    function isImageUrl(url) { return /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(url); }

    // 1) Explicit BBCode media tags: [img]/[gif]/[video]...[/...]
    esc = esc.replace(/\[(img|gif)\]\s*(https?:\/\/[^\s\]]+?)\s*\[\/\1\]/gi, function (_m, tag, u) {
        return slot(imgEmbed(u.replace(/&amp;/g, '&'), tag === 'gif' ? 'gif' : 'image'));
    });
    esc = esc.replace(/\[video\]\s*(https?:\/\/[^\s\]]+?)\s*\[\/video\]/gi, function (_m, u) {
        var url = u.replace(/&amp;/g, '&');
        return slot(ytEmbed(url) || cfEmbed(url) || videoEmbed(url));
    });

    // 2) Bare URLs: auto-embed YouTube, video files, images, gifs, Giphy/Tenor.
    esc = esc.replace(/(https?:\/\/[^\s<]+)/g, function (m) {
        var url = m.replace(/&amp;/g, '&');
        var y = ytEmbed(url);
        if (y) return slot(y);
        var cf = cfEmbed(url);
        if (cf) return slot(cf);
        if (/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(url)) return slot(videoEmbed(url));
        var g = giphyDirect(url);
        if (g) return slot(imgEmbed(g, 'gif'));
        if (isImageUrl(url)) return slot(imgEmbed(url, /\.gif(\?|#|$)/i.test(url) ? 'gif' : 'image'));
        var href = url.replace(/"/g, '%22');
        return '<a href="' + href + '" target="_blank" rel="nofollow noopener noreferrer">' + m + '</a>';
    });

    esc = esc.replace(/\n/g, '<br>');
    return esc.replace(/\u0000M(\d+)\u0000/g, function (_m, i) { return slots[i]; });
}

// Delete own post (reply) or own thread (when the post is the thread starter).
// Owner-only is also enforced server-side. FK cascade removes likes/subs/notifs.
async function forumDeletePost(postId) {
    if (typeof isUserLoggedIn === 'function' && !isUserLoggedIn()) { window.location.href = '/login/'; return; }
    var p = window.__forumCachedPostsById && window.__forumCachedPostsById[postId];
    var isStarter = !!(p && p.is_thread_starter);
    var msg = isStarter
        ? 'Delete this entire thread and all of its replies? This cannot be undone.'
        : 'Delete this post? This cannot be undone.';
    if (!window.confirm(msg)) return;
    try {
        if (isStarter) {
            var threadId = (p && p.thread_id) || (cachedThread && cachedThread.id) || currentThreadId;
            await api.request('/forum/threads/' + encodeURIComponent(threadId), { method: 'DELETE' });
            if (currentCategorySlug && typeof showThreadsList === 'function') {
                showThreadsList(currentCategorySlug, (typeof currentCategoryName !== 'undefined' ? currentCategoryName : currentCategorySlug), (typeof currentCategoryId !== 'undefined' ? currentCategoryId : null));
            } else if (typeof showCategories === 'function') {
                showCategories();
            }
        } else {
            await api.request('/forum/posts/' + encodeURIComponent(postId), { method: 'DELETE' });
            if (Array.isArray(cachedPosts)) {
                cachedPosts = cachedPosts.filter(function (x) { return String(x.id) !== String(postId); });
            }
            renderThread();
        }
    } catch (err) {
        console.error('Delete error:', err, err && err.detail);
        alert((err && (err.message || err.detail)) || 'Failed to delete. Please try again.');
    }
}

// Moderator: lock/unlock the current thread. Mod-only server-side.
async function forumLockThread(btn) {
    if (!cachedThread || !cachedThread.id) return;
    var locking = !cachedThread.is_locked;
    if (!window.confirm(locking ? 'Lock this thread? Members will no longer be able to reply.' : 'Unlock this thread and allow replies again?')) return;
    if (btn) btn.disabled = true;
    try {
        var resp = await api.request('/forum/threads/' + encodeURIComponent(cachedThread.id) + '/lock', {
            method: 'POST',
            body: { locked: locking }
        });
        cachedThread.is_locked = !!(resp && resp.is_locked);
        renderThread();
    } catch (err) {
        console.error('Lock thread error:', err, err && err.detail);
        alert((err && (err.message || err.detail)) || 'Failed to lock/unlock thread.');
        if (btn) btn.disabled = false;
    }
}

// Moderator: pin/unpin the current thread. Mod-only server-side.
async function forumPinThread(btn) {
    if (!cachedThread || !cachedThread.id) return;
    var pinning = !cachedThread.is_pinned;
    if (btn) btn.disabled = true;
    try {
        var resp = await api.request('/forum/threads/' + encodeURIComponent(cachedThread.id) + '/pin', {
            method: 'POST',
            body: { pinned: pinning }
        });
        cachedThread.is_pinned = !!(resp && resp.is_pinned);
        renderThread();
    } catch (err) {
        console.error('Pin thread error:', err, err && err.detail);
        alert((err && (err.message || err.detail)) || 'Failed to pin/unpin thread.');
        if (btn) btn.disabled = false;
    }
}

function forumFocusReply() {
    var ta = document.getElementById('replyText');
    if (!ta) {
        var area = document.getElementById('replyArea');
        if (area) area.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }
    ta.focus();
    ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function forumQuotePost(postId) {
    var p = window.__forumCachedPostsById && window.__forumCachedPostsById[postId];
    if (!p) return;
    if (typeof isUserLoggedIn === 'function' && !isUserLoggedIn()) { window.location.href = '/login/'; return; }
    var ta = document.getElementById('replyText');
    if (!ta) return;
    var author = (p.user && (p.user.username || p.user.display_name)) || p.username || p.display_name || 'user';
    var body = String(p.content || p.body || '').trim();
    var quoted = body.split('\n').map(function(line) { return '> ' + line; }).join('\n');
    var prefix = ta.value && ta.value.trim().length ? ta.value.replace(/\s+$/, '') + '\n\n' : '';
    ta.value = prefix + '[quote=' + author + ']\n' + quoted + '\n[/quote]\n\n';
    ta.focus();
    ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch(e) {}
}

async function forumLikePost(targetId, isStarter, btn) {
    if (typeof isUserLoggedIn === 'function' && !isUserLoggedIn()) { window.location.href = '/login/'; return; }
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    var countEl = btn.querySelector('.fpost-like-count');
    try {
        var path = isStarter
            ? '/forum/threads/' + encodeURIComponent(targetId) + '/like'
            : '/forum/posts/' + encodeURIComponent(targetId) + '/like';
        var resp = await api.request(path, { method: 'POST' });
        var n = (resp && typeof resp.like_count === 'number') ? resp.like_count : null;
        if (countEl && n != null) countEl.textContent = '(' + n + ')';
        if (resp && resp.liked) { btn.classList.add('is-liked'); } else { btn.classList.remove('is-liked'); }
        // Keep cache in sync so a later re-render preserves the new count.
        if (n != null) {
            if (isStarter && cachedThread) cachedThread.like_count = n;
            else if (Array.isArray(cachedPosts)) {
                for (var i = 0; i < cachedPosts.length; i++) {
                    if (String(cachedPosts[i].id) === String(targetId)) { cachedPosts[i].like_count = n; break; }
                }
            }
        }
    } catch (err) {
        console.error('Like error:', err, err && err.detail);
        alert((err && (err.message || err.detail)) || 'Failed to like post.');
    } finally {
        btn.disabled = false;
    }
}

// TMR tipping. Opens a small inline box (same pattern as forumEditPost's
// inline edit box, not a separate modal component) showing the tipper's
// current balance, an amount field, and a confirm/cancel pair. The server
// re-validates everything authoritatively (self-tip, balance, frozen
// wallets, account age, daily recipient cap) -- this UI only prevents the
// obvious mistakes before a round trip.
async function forumTipPost(postId, btn) {
    if (typeof isUserLoggedIn === 'function' && !isUserLoggedIn()) { window.location.href = '/login/'; return; }
    var bodyEl = document.querySelector('.fthread-post[data-post-id="' + postId + '"] .fthread-body');
    if (!bodyEl) return;
    if (bodyEl.querySelector('.fpost-tip-box')) return; // already open for this post

    var box = document.createElement('div');
    box.className = 'fpost-tip-box';
    box.innerHTML =
        '<div class="fpost-tip-row">'
        + '<label for="tipAmount-' + postId + '">TMR to send:</label>'
        + '<input type="number" id="tipAmount-' + postId + '" min="1" max="10000" step="1" value="5" class="fpost-tip-input">'
        + '</div>'
        + '<div class="fpost-tip-balance" id="tipBalance-' + postId + '">Loading your balance…</div>'
        + '<div class="fpost-tip-error" id="tipError-' + postId + '" hidden></div>'
        + '<div class="fpost-tip-buttons">'
        + '<button type="button" class="fpost-btn is-tip-confirm" onclick="forumSubmitTip(\'' + postId + '\', this)">Send Tip</button>'
        + '<button type="button" class="fpost-btn" onclick="forumCancelTip(\'' + postId + '\')">Cancel</button>'
        + '</div>';
    bodyEl.appendChild(box);

    try {
        var bal = await api.request('/coins/balance');
        var balEl = document.getElementById('tipBalance-' + postId);
        var balNum = (bal && typeof bal.balance === 'number') ? bal.balance : null;
        if (balEl) {
            balEl.textContent = balNum != null
                ? 'Your balance: ' + balNum.toLocaleString('en-US') + ' TMR' + (bal.is_frozen ? ' (wallet frozen)' : '')
                : 'Could not load your balance.';
        }
        box.dataset.balance = balNum != null ? String(balNum) : '';
    } catch (err) {
        var balEl2 = document.getElementById('tipBalance-' + postId);
        if (balEl2) balEl2.textContent = 'Could not load your balance.';
    }
}

function forumCancelTip(postId) {
    var bodyEl = document.querySelector('.fthread-post[data-post-id="' + postId + '"] .fthread-body');
    var box = bodyEl && bodyEl.querySelector('.fpost-tip-box');
    if (box) box.remove();
}

async function forumSubmitTip(postId, btn) {
    var bodyEl = document.querySelector('.fthread-post[data-post-id="' + postId + '"] .fthread-body');
    var box = bodyEl && bodyEl.querySelector('.fpost-tip-box');
    if (!box || !btn || btn.disabled) return;
    var input = document.getElementById('tipAmount-' + postId);
    var errEl = document.getElementById('tipError-' + postId);
    var amount = parseInt(input && input.value, 10);
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

    if (!Number.isInteger(amount) || amount < 1) {
        if (errEl) { errEl.hidden = false; errEl.textContent = 'Enter a whole number of at least 1 TMR.'; }
        return;
    }
    var knownBalance = box.dataset.balance ? parseInt(box.dataset.balance, 10) : null;
    if (knownBalance != null && amount > knownBalance) {
        if (errEl) { errEl.hidden = false; errEl.textContent = 'You only have ' + knownBalance + ' TMR available.'; }
        return;
    }

    btn.disabled = true;
    // A fresh id per click/submission -- a double-click or network retry of
    // THIS submission replays server-side instead of tipping twice. Sending a
    // separate tip later (even to the same post) uses a new id, which is
    // correct: that is a deliberate second tip, not a duplicate of this one.
    var idemKey = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('tip-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    try {
        var resp = await api.request('/forum/posts/' + encodeURIComponent(postId) + '/tip', {
            method: 'POST',
            body: { amount: amount, idempotencyKey: idemKey },
        });
        var tipsEl = document.getElementById('postTips-' + postId);
        var sessionUser = (typeof getForumSessionUser === 'function') ? getForumSessionUser() : null;
        var myName = (sessionUser && sessionUser.username) || 'You';
        var line = document.createElement('span');
        line.className = 'fpost-tip-line';
        line.textContent = '🪙 ' + myName + ' gave ' + amount + ' TMR for this post';
        if (!tipsEl) {
            tipsEl = document.createElement('div');
            tipsEl.className = 'fpost-tips';
            tipsEl.id = 'postTips-' + postId;
            bodyEl.appendChild(tipsEl);
        }
        tipsEl.appendChild(line);
        if (Array.isArray(cachedPosts)) {
            for (var i = 0; i < cachedPosts.length; i++) {
                if (String(cachedPosts[i].id) === String(postId)) {
                    cachedPosts[i].tip_total = resp.tip_total;
                    if (!Array.isArray(cachedPosts[i].tips)) cachedPosts[i].tips = [];
                    cachedPosts[i].tips.push({ username: myName, amount: amount });
                    break;
                }
            }
        }
        box.remove();
    } catch (err) {
        var msg;
        if (err && err.data && err.data.available != null) {
            msg = 'Insufficient balance: needs ' + err.data.required + ' TMR, you have ' + err.data.available + '.';
        } else {
            msg = (err && err.message) || 'Failed to send tip.';
        }
        var errEl2 = document.getElementById('tipError-' + postId);
        if (errEl2) { errEl2.hidden = false; errEl2.textContent = msg; } else { alert(msg); }
        btn.disabled = false;
    }
}

// Real per-thread subscription toggle. Calls POST /forum/threads/:id/subscribe
// (backend toggles forum_subscriptions and returns {subscribed:bool}). Requires
// login (redirects like the Like button). No fake state: the button reflects
// exactly what the server returns, and cachedThread is kept in sync so a later
// re-render preserves it. Subscribers are notified on new replies server-side.
async function forumToggleSubscribe(btn) {
    if (typeof isUserLoggedIn === 'function' && !isUserLoggedIn()) { window.location.href = '/login/'; return; }
    if (!btn || btn.disabled) return;
    var threadId = cachedThread && cachedThread.id;
    if (!threadId) return;
    btn.disabled = true;
    try {
        var resp = await api.request('/forum/threads/' + encodeURIComponent(threadId) + '/subscribe', { method: 'POST' });
        var subbed = !!(resp && resp.subscribed);
        if (cachedThread) cachedThread.subscribed_by_me = subbed;
        btn.classList.toggle('is-subscribed', subbed);
        btn.textContent = subbed ? 'Unfollow Thread' : 'Follow Thread';
    } catch (err) {
        console.error('Subscribe error:', err, err && err.detail);
        alert((err && (err.message || err.detail)) || 'Failed to update subscription.');
    } finally {
        btn.disabled = false;
    }
}

function forumEditPost(postId) {
    var p = window.__forumCachedPostsById && window.__forumCachedPostsById[postId];
    if (!p) return;
    if (typeof isUserLoggedIn === 'function' && !isUserLoggedIn()) { window.location.href = '/login/'; return; }
    var bodyEl = document.querySelector('.fthread-post[data-post-id="' + postId + '"] .fthread-body');
    if (!bodyEl) return;
    if (bodyEl.querySelector('.fpost-edit-box')) return;
    var actions = bodyEl.querySelector('.fpost-actions');
    if (actions) actions.style.display = 'none';
    var contentEl = document.getElementById('postContent-' + postId);
    if (contentEl) contentEl.style.display = 'none';
    var box = document.createElement('div');
    box.className = 'fpost-edit-box';
    var raw = String(p.content || p.body || '');
    box.innerHTML = '<textarea class="fpost-edit-text"></textarea>'
        + '<div class="fpost-edit-actions">'
        +   '<button type="button" class="fbtn" data-cancel="1">Cancel</button>'
        +   '<button type="button" class="fbtn is-primary" data-save="1">Save</button>'
        + '</div>';
    bodyEl.appendChild(box);
    box.querySelector('.fpost-edit-text').value = raw;
    try { if (window.TMREmoji) TMREmoji.attach(box.querySelector('.fpost-edit-text')); } catch(e){}
    // FORUM_IMAGE_PASTE_20260720: inline post edit keeps paste/drop/upload, so an
    // image can be added (or an existing [img] left untouched) while editing.
    try { if (window.TMRForumImages) TMRForumImages.attach(box.querySelector('.fpost-edit-text')); } catch(e){}
    box.querySelector('[data-cancel]').onclick = function() {
        box.remove();
        if (contentEl) contentEl.style.display = '';
        if (actions) actions.style.display = '';
    };
    box.querySelector('[data-save]').onclick = async function() {
        var newText = box.querySelector('.fpost-edit-text').value.trim();
        if (newText.length < 1) { alert('Post cannot be empty.'); return; }
        var saveBtn = this;
        saveBtn.disabled = true; saveBtn.textContent = 'Saving...';
        try {
            if (p.is_thread_starter) {
                // The thread's first ("starter") post lives on forum_threads, not
                // forum_posts, so it must be edited via the thread endpoint.
                var threadId = p.thread_id || (cachedThread && cachedThread.id);
                var tResp = await api.request('/forum/threads/' + encodeURIComponent(threadId), {
                    method: 'PUT',
                    body: { content: newText }
                });
                var updatedThread = (tResp && tResp.thread) ? tResp.thread : null;
                if (updatedThread && cachedThread) {
                    cachedThread = Object.assign({}, cachedThread, updatedThread);
                }
            } else {
                var resp = await api.request('/forum/posts/' + encodeURIComponent(postId), {
                    method: 'PUT',
                    body: { content: newText }
                });
                var updated = (resp && resp.post) ? resp.post : null;
                if (updated && Array.isArray(cachedPosts)) {
                    for (var i = 0; i < cachedPosts.length; i++) {
                        if (String(cachedPosts[i].id) === String(postId)) {
                            cachedPosts[i] = Object.assign({}, cachedPosts[i], updated);
                            break;
                        }
                    }
                }
            }
            renderThread();
        } catch (err) {
            console.error('Edit save error:', err, err && err.detail);
            alert((err && (err.message || err.detail)) || 'Failed to save edit.');
            saveBtn.disabled = false; saveBtn.textContent = 'Save';
        }
    };
    var ta = box.querySelector('.fpost-edit-text');
    ta.focus();
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch(e) {}
}

async function enrichForumAuthors(thread, posts) {
    var names = [];
    if (thread && thread.username) names.push(thread.username);
    (posts || []).forEach(function(post) {
        var name = (post.user && (post.user.username || post.user.display_name)) || post.username || post.display_name;
        if (name) names.push(name);
    });
    names = Array.from(new Set(names.map(function(name) { return String(name || '').trim(); }).filter(Boolean)));
    await Promise.all(names.map(async function(username) {
        var key = username.toLowerCase();
        if (forumAuthorCache[key]) return;
        var profile = {};
        var threadCount = null;
        try {
            var userData = await api.request('/users/' + encodeURIComponent(username));
            profile = userData.user || userData || {};
        } catch (e) {}
        try {
            var threadData = await api.request('/forum/users/' + encodeURIComponent(username) + '/threads?limit=100');
            if (Array.isArray(threadData.threads)) threadCount = threadData.threads.length;
        } catch (e) {}
        var cacheEntry = Object.assign({}, profile);
        // Only set count fields when we have a real number, so we never clobber
        // the accurate per-post counts the forum API already attaches to each row.
        var resolvedThreadCount = numericValue(profile.user_thread_count) != null ? numericValue(profile.user_thread_count) : threadCount;
        if (numericValue(resolvedThreadCount) != null) cacheEntry.user_thread_count = numericValue(resolvedThreadCount);
        else delete cacheEntry.user_thread_count;
        if (numericValue(profile.user_post_count) != null) cacheEntry.user_post_count = numericValue(profile.user_post_count);
        else delete cacheEntry.user_post_count;
        forumAuthorCache[key] = cacheEntry;
    }));
}
var categories = [];
// Forum data load state. renderCategories()/renderForumSidebar() key off this
// so a still-loading OR failed load can NEVER be painted as a definitive
// "No forum categories yet" empty board. Only a successful API response that
// genuinely returns [] is allowed to show the empty state (req: single source
// of truth; no false empty; no stuck "Loading forums...").
var forumLoadState = 'loading'; // 'loading' | 'loaded' | 'error'
var _forumLoadGen = 0;          // monotonic token: ignore stale responses
var _forumRetryTimer = null;
var fallbackCategories = [
    {
        id: 'cat_general',
        slug: 'general-betting',
        name: 'Sports Betting Forum',
        description: 'Main board for picks, game discussion, polls, trivia, bankroll discipline, and board movement.',
        icon: '\ud83d\udcac',
        thread_count: 0,
        post_count: 0,
        latest_thread: null,
        group: 'TrustMyRecord Forums'
    },
    {
        id: 'cat_nfl',
        slug: 'nfl',
        name: 'NFL',
        description: 'Week-to-week football discussion, matchup reads, and betting angles tied to receipts.',
        icon: '\ud83c\udfc8',
        thread_count: 0,
        post_count: 0,
        latest_thread: null,
        group: 'Sports Betting Forums'
    },
    {
        id: 'cat_nba',
        slug: 'nba',
        name: 'NBA',
        description: 'Talk sides, totals, props, and scheduling edges with a public record behind the takes.',
        icon: '\ud83c\udfc0',
        thread_count: 0,
        post_count: 0,
        latest_thread: null,
        group: 'Sports Betting Forums'
    },
    {
        id: 'cat_nhl',
        slug: 'nhl',
        name: 'NHL',
        description: 'Ice hockey discussion focused on lines, injuries, travel, and long-term win-rate discipline.',
        icon: '\ud83c\udfd2',
        thread_count: 0,
        post_count: 0,
        latest_thread: null,
        group: 'Sports Betting Forums'
    },
    {
        id: 'cat_mlb',
        slug: 'mlb',
        name: 'MLB',
        description: 'Baseball betting discussion, pitchers, bullpens, market movement, and daily grind strategy.',
        icon: '\u26be',
        thread_count: 0,
        post_count: 0,
        latest_thread: null,
        group: 'Sports Betting Forums'
    },
    {
        id: 'cat_challenges',
        slug: 'challenges',
        name: 'Marketplace, Challenges & Arena',
        description: 'Pick seller questions, open challenges, competition talk, and head-to-head formats.',
        icon: '\ud83c\udfaf',
        thread_count: 0,
        post_count: 0,
        latest_thread: null,
        group: 'TrustMyRecord Forums'
    }
];
var usingFallbackCategories = false;
var cachedThreads = [];
var cachedThread = null;
var cachedPosts = [];
var currentCategorySlug = null;
var currentCategoryName = null;
var currentCategoryId = null;
var currentThreadId = null;
var currentThreadTitle = null;
var forumAuthorCache = {};
var searchDebounceTimer = null;

function escHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* All DB timestamps are UTC. Strings without an explicit zone (raw Postgres
   TIMESTAMP serialized inside SQL json_build_object) must be parsed as UTC,
   otherwise viewers west of UTC get a future date and every row clamps to
   "1 sec ago". Returns a Date or null; never guesses. */
function parseForumTimestamp(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    var s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) {
        s = s.replace(' ', 'T') + 'Z';
    }
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

function timeAgo(dateString) {
    var date = parseForumTimestamp(dateString);
    if (!date) {
        if (dateString) console.warn('timeAgo: invalid timestamp from API:', dateString);
        return '--';
    }
    var diff = Date.now() - date.getTime();
    if (diff < -120000) {
        console.warn('timeAgo: timestamp is in the future (server/client zone mismatch?):', dateString);
        return '--';
    }
    var sec = Math.floor(diff / 1000);
    if (sec < 5) return 'just now';
    if (sec < 60) return sec + ' sec ago';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + (min === 1 ? ' min ago' : ' mins ago');
    var hrs = Math.floor(min / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
    var days = Math.floor(hrs / 24);
    if (days < 30) return days + (days === 1 ? ' day ago' : ' days ago');
    var months = Math.floor(days / 30);
    if (months < 12) return months + (months === 1 ? ' month ago' : ' months ago');
    var years = Math.floor(months / 12);
    return years + (years === 1 ? ' year ago' : ' years ago');
}

// Compact absolute stamp in the viewer's LOCAL timezone, 2+2-style:
//   "Today 10:17 PM" / "Yesterday 4:22 PM" / "Jul 10, 8:35 PM" / "Jul 10 2025, 8:35 PM"
// Replaces relative "x hours ago" text for last-post/thread-list displays.
function formatForumStamp(dateString) {
    var date = parseForumTimestamp(dateString);
    if (!date) return '--';
    var now = new Date();
    var time;
    try {
        time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch (e) {
        var h = date.getHours(), m = date.getMinutes();
        var ap = h >= 12 ? 'PM' : 'AM'; var h12 = h % 12; if (h12 === 0) h12 = 12;
        time = h12 + ':' + (m < 10 ? '0' + m : m) + ' ' + ap;
    }
    var startOfDay = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    var dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
    if (dayDiff === 0) return 'Today ' + time;
    if (dayDiff === 1) return 'Yesterday ' + time;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var label = months[date.getMonth()] + ' ' + date.getDate();
    if (date.getFullYear() !== now.getFullYear()) label += ' ' + date.getFullYear();
    return label + ', ' + time;
}

function formatForumDate(dateString) {
    var date = parseForumTimestamp(dateString);
    if (!date) return 'Unknown';
    return date.toLocaleString();
}

function formatEditedDate(dateString) {
    if (!dateString) return '';
    var date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    try {
        return date.toLocaleString('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric', month: 'long', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
        }) + ' ET';
    } catch (e) {
        return date.toLocaleString();
    }
}

function formatJoinedDate(dateString) {
    if (!dateString) return 'New member';
    var date = new Date(dateString);
    if (isNaN(date.getTime())) return 'New member';
    return date.toLocaleDateString();
}

function showLoading(el) {
    if (!el) return;
    el.innerHTML = '<div class="empty-msg">Loading...</div>';
}

function showError(el, message) {
    if (!el) return;
    el.innerHTML = '<div class="empty-msg"><div style="color:var(--danger);">' + escHtml(message || 'Something went wrong.') + '</div></div>';
}
function loadNewestMember() {
    var el = document.getElementById('newestMemberWelcome');
    if (!el) return;
    var base = (window.api && window.api.baseUrl) || (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api';
    fetch(base + '/users/newest-member', { cache: 'no-store' })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(data){
            var m = data && data.member;
            // profile_url is the API's canonical answer (backend utils/profileUrl.js)
            // and it is the URL the edge guarantees a real page for. Re-deriving it
            // here from the username would be a second definition of the same thing
            // that is only equal by coincidence, which is how this drifted before.
            if (!m || !m.username || !m.profile_url) { el.hidden = true; return; }
            var name = m.display_name || m.username;
            var href = m.profile_url;
            /* HEADER_HIERARCHY_20260812: was "Welcome to our newest member, X!"
               set in body copy directly under the H1, where it competed with the
               forum directory for the top of the first viewport. Same data, same
               link, same live source — just demoted to a caption. */
            el.innerHTML = 'Newest member: <a href="' + escHtml(href) + '">' + escHtml(name) + '</a>';
            el.hidden = false;
        })
        .catch(function(){ el.hidden = true; });
}

// Forum Statistics block (bottom of the forum index). Every number is a live
// COUNT(*) from GET /api/forum/stats -- total_posts already includes thread
// starters plus replies, and deleted/test content is excluded server-side.
// The block stays hidden unless real numbers come back, so a failed request
// never paints zeros or placeholders.
function formatStatNumber(value) {
    var n = parseInt(value, 10);
    if (!isFinite(n) || n < 0) return null;
    return n.toLocaleString('en-US');
}
function loadForumStatistics() {
    var block = document.getElementById('forumStatBlock');
    if (!block) return;
    var base = (window.api && window.api.baseUrl) || (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api';
    fetch(base + '/forum/stats', { cache: 'no-store' })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(data){
            if (!data) { block.hidden = true; return; }
            var members = formatStatNumber(data.total_members);
            var threads = formatStatNumber(data.total_threads);
            var posts = formatStatNumber(data.total_posts);
            if (members === null || threads === null || posts === null) { block.hidden = true; return; }
            document.getElementById('fstatMembers').textContent = members;
            document.getElementById('fstatThreads').textContent = threads;
            document.getElementById('fstatPosts').textContent = posts;

            var newestEl = document.getElementById('fstatNewest');
            var m = data.newest_member;
            if (newestEl && m && m.username && m.profile_url) {
                var name = m.display_name || m.username;
                var href = m.profile_url;   // canonical, from the API. See loadNewestMember().
                newestEl.innerHTML = 'Newest Member: <a href="' + escHtml(href) + '">' + escHtml(name) + '</a>';
                newestEl.hidden = false;
            } else if (newestEl) {
                newestEl.hidden = true;
            }
            block.hidden = false;
        })
        .catch(function(){ block.hidden = true; });
}

function updateStats() {
    var threadCount = 0;
    var postCount = 0;
    var categoryCount = categories.length;
    var activeCategoryCount = 0;
    categories.forEach(function(cat) {
        threadCount += parseInt(cat.thread_count || 0);
        postCount += parseInt(cat.post_count || 0);
        if (parseInt(cat.thread_count || 0) > 0 || parseInt(cat.post_count || 0) > 0 || cat.latest_thread) {
            activeCategoryCount += 1;
        }
    });
    document.getElementById('statThreads').textContent = threadCount;
    document.getElementById('statPosts').textContent = postCount;
    document.getElementById('statUsers').textContent = categoryCount;
    document.getElementById('statOnline').textContent = activeCategoryCount;
}

/* F2P2_DIRECTORY_20260812: the categories API returns `group: null` for every
   row, so the old fallback lumped all eleven public forums under one generic
   "Forums" bar. A directory needs real sections, so the section map lives here
   and is keyed on the slugs that already exist in the database. NOTHING is
   invented and nothing is dropped: a slug this map does not know still renders,
   it just lands in Community. If the backend ever starts sending a real
   `group`, that value wins over the map. */
var TMR_FORUM_SECTIONS = [
    { name: 'Official',       slugs: ['updates'] },
    { name: 'Sports Betting', slugs: ['general', 'nfl', 'nba', 'mlb', 'nhl', 'soccer', 'college',
                                      'sportsbooks', 'strategy', 'beats-brags'] },
    { name: 'Community',      slugs: ['off-topic', 'sports-talk', 'contests', 'challenges'] }
];
var TMR_FORUM_SECTION_FALLBACK = 'Community';

function forumSectionFor(cat) {
    if (cat.is_official) return 'Official';
    if (cat.group) return String(cat.group);
    var slug = String(cat.slug || '');
    for (var i = 0; i < TMR_FORUM_SECTIONS.length; i++) {
        if (TMR_FORUM_SECTIONS[i].slugs.indexOf(slug) !== -1) return TMR_FORUM_SECTIONS[i].name;
    }
    return TMR_FORUM_SECTION_FALLBACK;
}

function groupCategoriesForDisplay() {
    var map = {};
    categories.forEach(function(cat) {
        var key = forumSectionFor(cat);
        if (!map[key]) map[key] = [];
        map[key].push(cat);
    });
    /* Within a section, honour the map's order first (that is the order Nima
       specified), then anything unlisted by the API's own display_order. */
    TMR_FORUM_SECTIONS.forEach(function(sec) {
        var rows = map[sec.name];
        if (!rows) return;
        rows.sort(function(a, b) {
            var ai = sec.slugs.indexOf(String(a.slug || ''));
            var bi = sec.slugs.indexOf(String(b.slug || ''));
            if (ai === -1) ai = 900 + (Number(a.display_order) || 0);
            if (bi === -1) bi = 900 + (Number(b.display_order) || 0);
            return ai - bi;
        });
    });
    var order = TMR_FORUM_SECTIONS.map(function(s) { return s.name; });
    return Object.keys(map).sort(function(a, b) {
        var ai = order.indexOf(a), bi = order.indexOf(b);
        if (ai === -1) ai = 500;
        if (bi === -1) bi = 500;
        if (ai !== bi) return ai - bi;
        return a.localeCompare(b);
    }).map(function(groupName) {
        return { name: groupName, categories: map[groupName] };
    });
}

/* History integration (Jul 18, 2026): every in-app navigation writes the REAL
   canonical URL into the address bar -- /forum/thread/<id>/<slug>/ for threads,
   never the old /forum/#thread-<id> form -- via pushState, so refresh, share,
   copy-link, and back/forward all keep the exact view. popstate re-renders the
   view for the entry being returned to. */
var forumHistoryNav = false;   // true while handling popstate: never push, only replace
var forumDefaultTitle = document.title;
function forumSetHistory(url, state, replace) {
    try {
        var here = window.location.pathname + window.location.search + window.location.hash;
        if (forumHistoryNav || replace || here === url) window.history.replaceState(state, '', url);
        else window.history.pushState(state, '', url);
    } catch (e) { /* history API unavailable: address bar just stays put */ }
}
function forumSetCanonical(path) {
    var el = document.querySelector('link[rel="canonical"]');
    if (el) el.setAttribute('href', 'https://trustmyrecord.com' + path);
}

function showCategories() {
    currentCategorySlug = null;
    currentCategoryName = null;
    currentCategoryId = null;
    currentThreadId = null;
    currentThreadTitle = null;

    document.getElementById('viewCategories').style.display = '';
    document.getElementById('viewThreads').style.display = 'none';
    document.getElementById('viewThread').style.display = 'none';

    document.body.classList.add('is-forum-home');
    setForumPageHeader('TrustMyRecord Forums');
    setActiveSidebar('sports-betting');
    document.getElementById('breadcrumb').innerHTML = '<a onclick="showCategories()">TrustMyRecord Forums</a><span class="sep">&rsaquo;</span><span id="forumPageTitleLabel">Forum Home</span>';
    forumSetHistory('/forum/', { fview: 'home' }, false);
    document.title = forumDefaultTitle;
    forumSetCanonical('/forum/');
    renderCategories();
    updateStats();
    updateForumJump();
}

function setForumPageHeader(title) {
    var titleEl = document.getElementById('forumPageTitle');
    if (titleEl) titleEl.textContent = title;
    var crumbLabel = document.getElementById('forumPageTitleLabel');
    if (crumbLabel) crumbLabel.textContent = title;
    var sampleSection = document.getElementById('indexSampleSectionName');
    if (sampleSection) sampleSection.textContent = title.replace(/^TrustMyRecord\s+/, '').replace(/\s+Forums?$/i, '') || title;
}

function setActiveSidebar(slug) {
    var links = document.querySelectorAll('.fside-list a[data-cat-slug]');
    links.forEach(function(a) {
        a.classList.toggle('is-active', a.getAttribute('data-cat-slug') === slug);
    });
}

function onSidebarPick(el, slug, name) {
    setActiveSidebar(slug);
    setForumPageHeader(name);
    var match = (categories || []).find(function(c) { return (c.slug || '') === slug; });
    if (match) {
        showThreadsList(match.slug, match.name, match.id);
    } else {
        // Slug not present in live category list yet — show categories index with title swapped.
        currentCategorySlug = null;
        currentCategoryId = null;
        currentCategoryName = name;
        document.getElementById('viewCategories').style.display = '';
        document.getElementById('viewThreads').style.display = 'none';
        document.getElementById('viewThread').style.display = 'none';
        document.getElementById('breadcrumb').innerHTML = '<a onclick="showCategories()">TrustMyRecord Forums</a><span class="sep">&rsaquo;</span><span>' + escHtml(name) + '</span>';
        forumSetHistory('/forum/#cat-' + encodeURIComponent(slug), { fview: 'cat', slug: slug, name: name }, false);
    }
}

// Sample sticky/recent threads used as a layout demonstration on the index.
// Per Apr 30 2026 spec: only OFFICIAL system starter threads here. No fake
// users, no fake replies, no fake views. Empty board until real users post.
var TMR_FORUM_SAMPLE_THREADS = [
    { title: 'TrustMyRecord Forum Rules and Posting Guidelines', sticky: true, hot: false, sample: true, starter: 'TrustMyRecord', stars: 0, lastPoster: 'TrustMyRecord', lastTitle: 'Rules and Posting Guidelines', lastTime: '—', replies: 0, views: 0 },
    { title: 'How Verified Records Work', sticky: true, hot: false, sample: true, starter: 'TrustMyRecord', stars: 0, lastPoster: 'TrustMyRecord', lastTitle: 'How Verified Records Work', lastTime: '—', replies: 0, views: 0 }
];

/* removed: replaced in renders.js */


async function showThreadsList(slug, name, id, histReplace) {
    currentCategorySlug = slug;
    currentCategoryName = name || slug;
    currentCategoryId = id || null;
    currentThreadId = null;
    currentThreadTitle = null;

    document.getElementById('viewCategories').style.display = 'none';
    document.getElementById('viewThreads').style.display = '';
    document.body.classList.remove('is-forum-home');
    document.getElementById('viewThread').style.display = 'none';
    document.getElementById('threadsCategoryLabel').textContent = currentCategoryName || 'Forum';
    var officialCat = (categories || []).find(function(c) { return (c.slug || '') === slug; });
    var officialLocked = !!(officialCat && officialCat.is_official) && !tmrForumUserIsStaff();
    var ntBtn = document.getElementById('threadsNewBtn');
    if (ntBtn) ntBtn.style.display = officialLocked ? 'none' : '';
    var ntNote = document.getElementById('threadsOfficialNote');
    if (ntNote) ntNote.style.display = officialLocked ? '' : 'none';
    setForumPageHeader(currentCategoryName || 'Forum');
    setActiveSidebar(slug);
    document.getElementById('breadcrumb').innerHTML = '<a onclick="showCategories()">TrustMyRecord Forums</a><span class="sep">&rsaquo;</span><span>' + escHtml(currentCategoryName || slug || 'Forum') + '</span>';
    if (slug) {
        /* F2P2_CAT_ROUTES_20260720: every category lives at a real indexable
           path (/forum/<slug>/, baked by scripts/build_forum_threads.py).
           Legacy /forum/#cat-<slug> links still resolve via
           forumRouteFromLocation; nothing redirects, nothing is renamed. */
        var catPath = '/forum/' + encodeURIComponent(slug) + '/';
        forumSetHistory(catPath,
            { fview: 'cat', slug: slug, name: currentCategoryName, id: currentCategoryId }, !!histReplace);
        document.title = (currentCategoryName || 'Forum') + ' | TrustMyRecord Forums';
        forumSetCanonical(catPath);
    } else {
        document.title = forumDefaultTitle;
        forumSetCanonical('/forum/');
    }
    await loadThreads();
}

async function showThreadDetail(threadId, page, postId, histReplace) {
    currentThreadId = threadId;
    document.getElementById('viewCategories').style.display = 'none';
    document.getElementById('viewThreads').style.display = 'none';
    document.getElementById('viewThread').style.display = '';
    document.body.classList.remove('is-forum-home');
    await loadThread(threadId);
    var detailHeader = document.getElementById('threadDetailHeader');
    if (detailHeader) detailHeader.textContent = currentThreadTitle || 'Thread';
    var crumbParts = ['<a onclick="showCategories()">Forums</a>'];
    if (currentCategorySlug) {
        crumbParts.push('<span class="sep">&raquo;</span><a onclick="showThreadsList(\'' + escHtml(currentCategorySlug) + '\',\'' + escHtml(currentCategoryName || currentCategorySlug) + '\',' + (currentCategoryId || 'null') + ')">' + escHtml(currentCategoryName || currentCategorySlug) + '</a>');
    }
    crumbParts.push('<span class="sep">&raquo;</span><span>' + escHtml(currentThreadTitle || 'Thread') + '</span>');
    document.getElementById('breadcrumb').innerHTML = crumbParts.join('');
    // Address bar always ends up on the permanent thread URL
    // /forum/thread/<id>/<slug>/ (the slug arrives with the thread payload).
    // Legacy entry points (?thread=<id>, #thread-<id>) resolve here and are
    // canonicalized in place; in-app clicks PUSH a new entry so back/forward
    // walk the visit history. When a specific post was requested, keep the
    // shareable permalink so the post anchor survives the render.
    var wantPost = (postId != null && postId !== '') ? String(postId) : '';
    var threadSlug = (cachedThread && String(cachedThread.id) === String(threadId))
        ? forumThreadSlug(cachedThread) : '';
    var cleanUrl = forumThreadUrl(threadId, threadSlug);
    var histState = { fview: 'thread', tid: threadId, slug: threadSlug, post: wantPost || null };
    forumSetHistory(wantPost ? forumPostPermalink(threadId, wantPost, threadSlug) : cleanUrl,
        histState, !!histReplace);
    if (cleanUrl.indexOf('?') === -1) forumSetCanonical(cleanUrl);
    if (currentThreadTitle) document.title = currentThreadTitle + ' | TrustMyRecord Forum';
    // SHARE_SYSTEM_PHASE1_20260721: point the header share control at this thread.
    // Same cleanUrl the address bar/canonical use, so no second URL format exists.
    // Emitted only when the thread actually loaded: a 404 (removed thread) runs
    // forumRenderThreadNotFound(), which nulls cachedThread, so there is nothing
    // to share and the slot stays empty.
    var shareSlot = document.getElementById('threadShareSlot');
    if (shareSlot) {
        shareSlot.innerHTML = (cachedThread && String(cachedThread.id) === String(threadId))
            ? '<button class="fbtn" type="button" data-tmr-share data-share-type="thread"'
                + ' data-share-id="' + escHtml(String(threadId)) + '"'
                + ' data-share-url="' + escHtml('https://trustmyrecord.com' + cleanUrl) + '"'
                + (currentThreadTitle ? ' data-share-title="' + escHtml(currentThreadTitle) + '"' : '')
                + ' title="Share this thread" aria-label="Share this thread">Share</button>'
            : '';
    }
    if (wantPost && forumScrollToPost(wantPost)) return;
    var pg = parseInt(page, 10);
    if (Number.isFinite(pg) && pg > 1) {
        // Jump to the first post of the requested page. All posts render on one
        // page in the thread view, so page N = the (N-1)*PER_PAGE-th post node.
        setTimeout(function () {
            var nodes = document.querySelectorAll('#postsContainer .fthread-post');
            var idx = (pg - 1) * FORUM_POSTS_PER_PAGE;
            var target = nodes[idx] || nodes[nodes.length - 1];
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
    }
}

/* A permalink clicked while its thread is already open should scroll, not
   reload the page for a post that is on screen already. Bound once, delegated,
   and it deliberately falls through to a normal navigation when the post is not
   in this document. */
if (!window.__forumPermalinkBound) {
    window.__forumPermalinkBound = true;
    document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a.fpost-permalink');
        if (!a) return;
        var m = (a.getAttribute('href') || '').match(/#post-(.+)$/);
        if (!m) return;
        var pid = decodeURIComponent(m[1]);
        if (!document.getElementById('post-' + pid)) return;
        e.preventDefault();
        window.history.replaceState(window.history.state || {}, '', a.getAttribute('href'));
        forumScrollToPost(pid);
    });
    // Back/forward between permalinks in an open thread, and #post- links that
    // arrive after load, still resolve. The router only reads the hash once at
    // DOMContentLoaded, so without this a hash change is dropped on the floor.
    window.addEventListener('hashchange', function () {
        var m = (window.location.hash || '').match(/^#post-(.+)$/);
        if (m) forumScrollToPost(decodeURIComponent(m[1]));
    });
    // Real back/forward navigation between forum views. Each pushState carries a
    // state object naming its view; entries without one (older links, hash-only
    // permalink hops) are routed off the URL itself.
    window.addEventListener('popstate', async function (e) {
        var s = e.state || null;
        forumHistoryNav = true;
        try {
            if (s && s.fview === 'thread' && s.tid) {
                await forumOpenThreadFromHistory(s.tid, s.post || '');
            } else if (s && s.fview === 'cat' && s.slug) {
                if (!categories || !categories.length) await loadCategories();
                var c = (categories || []).find(function (x) { return x.slug === s.slug; });
                await showThreadsList(s.slug, (c && c.name) || s.name || s.slug, (c && c.id) || s.id || null, true);
            } else if (s && s.fview === 'home') {
                if (!categories || !categories.length) await loadCategories();
                showCategories();
            } else {
                await forumRouteFromLocation();
            }
        } finally { forumHistoryNav = false; }
    });
}

/* Open a thread for a history entry. When the thread is already on screen the
   render is skipped and only the requested post is scrolled to. */
async function forumOpenThreadFromHistory(tid, post) {
    var threadView = document.getElementById('viewThread');
    if (String(currentThreadId) === String(tid) && threadView && threadView.style.display !== 'none') {
        if (post) forumScrollToPost(post);
        return;
    }
    await showThreadDetail(tid, null, post || null, true);
}

/* Route straight off the current URL: clean /forum/thread/<id>/<slug>/ path,
   legacy ?thread= / #thread- / #cat- forms, else the forum home. Used for
   popstate entries that carry no state object. */
async function forumRouteFromLocation() {
    var mPath = window.location.pathname.match(/^\/forum\/thread\/(\d+)(?:\/|$)/);
    var params = new URLSearchParams(window.location.search);
    var hash = window.location.hash || '';
    var post = '';
    var mPost = hash.match(/^#post-(.+)$/);
    if (mPost) post = decodeURIComponent(mPost[1]);
    // SHARE_SYSTEM_PHASE1_20260721: shared links carry ?post=<id> alongside the
    // #post-<id> fragment; honour the query form too when the fragment is absent.
    if (!post) post = (params.get('post') || '').trim();
    if (mPath) { await forumOpenThreadFromHistory(parseInt(mPath[1], 10), post); return; }
    var mCat = window.location.pathname.match(/^\/forum\/([a-z0-9_-]+)\/?$/i);
    if (mCat && mCat[1].toLowerCase() !== 'thread') {
        var pslug = decodeURIComponent(mCat[1]);
        if (!categories || !categories.length) await loadCategories();
        var pcat = (categories || []).find(function (x) { return x.slug === pslug; });
        if (pcat) { await showThreadsList(pcat.slug, pcat.name, pcat.id, true); return; }
    }
    var qt = parseInt(params.get('thread'), 10);
    if (qt) { await forumOpenThreadFromHistory(qt, post || (params.get('post') || '').trim()); return; }
    if (hash.indexOf('#thread-') === 0) {
        var htid = parseInt(hash.substring(8), 10);
        if (htid) { await forumOpenThreadFromHistory(htid, ''); return; }
    }
    if (hash.indexOf('#cat-') === 0) {
        var hslug = hash.substring(5);
        if (hslug) {
            if (!categories || !categories.length) await loadCategories();
            var hc = (categories || []).find(function (x) { return x.slug === hslug; });
            await showThreadsList(hslug, hc ? hc.name : hslug, hc ? hc.id : null, true);
            return;
        }
    }
    if (!categories || !categories.length) await loadCategories();
    showCategories();
}

function backToThreads() {
    if (currentCategorySlug) {
        showThreadsList(currentCategorySlug, currentCategoryName, currentCategoryId);
    } else {
        showCategories();
    }
}

// Per-member forum contributions view (threads started + replies). Powers the
// /forum/?user=<username> links from the profile Community Activity section.
async function showUserActivity(username) {
    var name = String(username || '').trim();
    if (!name) { showCategories(); return; }
    currentCategorySlug = null; currentCategoryName = null; currentCategoryId = null; currentThreadId = null;
    document.getElementById('viewCategories').style.display = 'none';
    document.getElementById('viewThreads').style.display = 'none';
    document.getElementById('viewThread').style.display = 'none';
    var view = document.getElementById('viewUserActivity');
    view.style.display = '';
    document.body.classList.remove('is-forum-home');
    setForumPageHeader('Forum contributions');
    document.getElementById('breadcrumb').innerHTML = '<a onclick="showCategories()">TrustMyRecord Forums</a><span class="sep">&rsaquo;</span><span>' + escHtml(name) + '</span>';
    var profLink = document.getElementById('uaProfileLink');
    if (profLink) profLink.setAttribute('href', '/profile/?user=' + encodeURIComponent(name));
    var threadsHost = document.getElementById('uaThreads');
    var repliesHost = document.getElementById('uaReplies');
    threadsHost.innerHTML = '<div class="fempty">Loading threads&hellip;</div>';
    repliesHost.innerHTML = '';

    var threads = [], posts = [];
    try {
        var td = await api.request('/forum/users/' + encodeURIComponent(name) + '/threads?limit=100');
        threads = (td && Array.isArray(td.threads)) ? td.threads : [];
    } catch (e) { threads = []; }
    try {
        var pd = await api.request('/forum/users/' + encodeURIComponent(name) + '/posts?limit=100');
        posts = (pd && Array.isArray(pd.posts)) ? pd.posts : [];
    } catch (e) { posts = []; }

    document.getElementById('uaUsername').textContent = name;
    document.getElementById('uaMeta').textContent = threads.length + ' threads · ' + posts.length + ' replies';

    var stamp = function (v) { try { return formatForumStamp(v); } catch (_) { return ''; } };
    var section = function (title, anchor, rowsHtml, emptyMsg) {
        return '<table class="fgroup-table" cellpadding="2" cellspacing="1" id="' + anchor + '">'
            + '<tr class="fgroup-band"><td colspan="2"><span class="fband-txt">' + escHtml(title) + '</span></td></tr></table>'
            + '<table class="fgroup-table thread-table" cellpadding="2" cellspacing="1"><tbody>'
            + (rowsHtml || ('<tr><td class="fcell"><div class="fempty">' + escHtml(emptyMsg) + '</div></td></tr>'))
            + '</tbody></table>';
    };
    var threadRows = threads.map(function (t, i) {
        var rowClass = 'frow' + (i % 2 === 1 ? ' row-alt' : '');
        return '<tr class="' + rowClass + '" role="link" tabindex="0" onclick="showThreadDetail(' + t.id + ')" onkeydown="if(event.key===\'Enter\'){showThreadDetail(' + t.id + ');}">'
            + '<td class="fcell"><a class="fname" href="' + escHtml(forumThreadUrl(t.id, forumThreadSlug(t))) + '" onclick="event.preventDefault();event.stopPropagation();showThreadDetail(' + t.id + ');">' + escHtml(t.title || 'Thread') + '</a>'
            + '<div class="flpost-meta">' + escHtml(t.category_name || 'Forum') + ' · ' + stamp(t.created_at) + ' · ' + (Number(t.reply_count) || 0) + ' replies</div></td></tr>';
    }).join('');
    var replyRows = posts.map(function (p, i) {
        var rowClass = 'frow' + (i % 2 === 1 ? ' row-alt' : '');
        var ex = String(p.content || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        return '<tr class="' + rowClass + '" role="link" tabindex="0" onclick="showThreadDetail(' + p.thread_id + ')" onkeydown="if(event.key===\'Enter\'){showThreadDetail(' + p.thread_id + ');}">'
            + '<td class="fcell"><a class="fname" href="' + escHtml(forumThreadUrl(p.thread_id, p.thread_slug || '')) + '" onclick="event.preventDefault();event.stopPropagation();showThreadDetail(' + p.thread_id + ');">' + escHtml(p.thread_title || 'Thread') + '</a>'
            + '<div class="ua-excerpt">' + escHtml(ex) + '</div>'
            + '<div class="flpost-meta">' + escHtml(p.category_name || 'Forum') + ' · ' + stamp(p.created_at) + '</div></td></tr>';
    }).join('');

    threadsHost.innerHTML = section('Threads started (' + threads.length + ')', 'threads', threadRows, 'No threads started yet.');
    repliesHost.innerHTML = section('Replies (' + posts.length + ')', 'replies', replyRows, 'No replies yet.');

    window.history.replaceState({}, '', '/forum/?user=' + encodeURIComponent(name) + (location.hash || ''));
    var hash = (location.hash || '').replace('#', '');
    if (hash === 'threads' || hash === 'replies') {
        setTimeout(function () { var el = document.getElementById(hash); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
    }
}

// ================================================================
// LOAD & RENDER CATEGORIES
// ================================================================
async function loadCategories() {
    // Monotonic generation token: if loadCategories() is invoked again (nav,
    // retry) while an earlier request is still in flight, only the newest one
    // is allowed to commit results. Prevents a slow stale response (esp. an
    // empty/failed one) from clobbering a later successful render.
    var myGen = ++_forumLoadGen;
    if (_forumRetryTimer) { clearTimeout(_forumRetryTimer); _forumRetryTimer = null; }

    forumLoadState = 'loading';
    renderCategories();
    renderForumSidebar();

    var maxAttempts = 4;      // bounded automatic retry for transient failures
    var lastErr = null;

    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
        if (myGen !== _forumLoadGen) return; // superseded by a newer load
        try {
            var data = await api.request('/forum/categories');
            if (myGen !== _forumLoadGen) return; // stale response, drop it
            var list = (data && Array.isArray(data.categories)) ? data.categories : null;
            if (!list) throw new Error('Malformed categories response');

            // Success. Only NOW may an empty board be shown, and only because
            // the API definitively returned an empty array.
            categories = list;
            usingFallbackCategories = false;
            forumLoadState = 'loaded';
            renderCategories();
            renderForumSidebar();
            updateStats();
            updateForumJump();
            return;
        } catch (err) {
            lastErr = err;
            if (myGen !== _forumLoadGen) return;
            console.warn('[Forum] categories load attempt ' + attempt + '/' + maxAttempts + ' failed:', err && err.message);
            if (attempt < maxAttempts) {
                // exponential backoff: 1s, 2s, 4s
                await new Promise(function (r) { setTimeout(r, 1000 * Math.pow(2, attempt - 1)); });
            }
        }
    }

    if (myGen !== _forumLoadGen) return;
    console.error('[Forum] categories load failed after ' + maxAttempts + ' attempts:', lastErr);
    // Do NOT fall back to a fake/empty board. Show a clear error and keep
    // auto-retrying in the background so the page self-heals with no manual
    // refresh once the backend (e.g. Render cold start) comes up.
    forumLoadState = 'error';
    renderCategories();
    renderForumSidebar();
    _forumRetryTimer = setTimeout(function () {
        if (myGen === _forumLoadGen) loadCategories();
    }, 6000);
}

// Manual "Try again" from the error card. Resets and reloads immediately.
function retryLoadCategories() {
    if (_forumRetryTimer) { clearTimeout(_forumRetryTimer); _forumRetryTimer = null; }
    loadCategories();
}

/* removed: replaced in renders.js */


function updateForumJump() {
    var select = document.getElementById('forumJumpSelect');
    if (!select) return;

    var options = ['<option value="">Select a forum</option>'];
    categories.forEach(function(cat) {
        options.push('<option value="' + escHtml(String(cat.slug || '')) + '">' + escHtml(cat.name || 'Forum') + '</option>');
    });
    select.innerHTML = options.join('');
}

function handleForumJump(slug) {
    if (!slug) return;
    currentCategorySlug = slug;
    var cat = categories.find(function(item) { return item.slug === slug; });
    currentCategoryName = cat ? cat.name : 'Forum';
    showThreadsList(slug, currentCategoryName, cat ? cat.id : null);
}

// ================================================================
// LOAD & RENDER THREADS
// ================================================================
async function loadThreads() {
    var body = document.getElementById('threadsBody');
    tmrfhFeedEmptyMsg = null; // category views keep the start-a-thread empty state
    body.innerHTML = '<tr><td colspan="5" class="empty-msg">Loading threads...</td></tr>';

    try {
        var isFallbackCategory = fallbackCategories.some(function(cat) {
            return cat.slug === currentCategorySlug;
        }) && categories.some(function(cat) {
            return cat.slug === currentCategorySlug;
        });
        if (usingFallbackCategories && isFallbackCategory) {
            cachedThreads = [];
            renderThreads();
            return;
        }
        var data = await api.request('/forum/categories/' + encodeURIComponent(currentCategorySlug));
        cachedThreads = data.threads || [];
        // Update category id from response if we didn't have it
        if (data.category) {
            currentCategoryId = data.category.id;
            currentCategoryName = data.category.name;
        }
        renderThreads();
    } catch (err) {
        body.innerHTML = '<tr><td colspan="4" class="empty-msg"><div style="color:var(--danger);">Failed to load threads.</div></td></tr>';
        console.error('Load threads error:', err);
    }
}

/* removed: replaced in renders.js */


// ================================================================
// LOAD & RENDER THREAD DETAIL
// ================================================================
/* PERF_THREAD_TIMEOUT_20260911: this used to inherit backend-api.js's 65s GET
   budget with no ceiling of its own, so a stalled or restarting API left
   'Loading...' on screen for over a minute and then, on the catch, a dead-end
   error with nothing to click. Now the read is given a hard budget and every
   failure path -- timeout, network, 5xx -- lands on a visible Retry. Nothing is
   cached, nothing stale is shown: a retry is a fresh read of the live thread. */
var FORUM_THREAD_LOAD_BUDGET_MS = 12000;

function forumRenderThreadLoadFailed(threadId, container, message) {
    if (!container) return;
    container.innerHTML =
        '<div class="fthread-loadfail" style="background:#13131c;border:1px solid #262636;'
        + 'border-radius:12px;padding:22px;text-align:center;color:#c9d0e4;">'
        + '<h2 style="margin:0 0 8px;font-family:Barlow,sans-serif;font-size:19px;">Could not load this thread</h2>'
        + '<p style="margin:0 0 14px;color:#8890ad;font-size:14px;">' + escHtml(message || 'The server did not respond in time.') + '</p>'
        + '<p style="margin:0;"><button type="button" class="fbtn is-primary" onclick="loadThread(' + JSON.stringify(String(threadId)) + ')">Retry</button>'
        + ' <a href="/forum/" class="fbtn" style="text-decoration:none;">Back to forums</a></p>'
        + '</div>';
}

/* CLS_RESERVE_20260912: hold the space the thread is about to occupy.
   #postsContainer goes from a one-line "Loading..." placeholder to the full thread
   -- 165px to 4,444px measured on a 390px viewport -- and everything under it moves.
   That single growth was CLS 0.85 of a 0.93 total on mobile, the worst Core Web
   Vitals number on the site.
   tmr-forum-thread-hydrate.js measured the baked page, which had the SAME posts laid
   out at the SAME width moments earlier, and handed the height over. Reserve it, then
   release it once the real content is at least that tall -- releasing a min-height the
   content already exceeds changes nothing on screen, so that release cannot shift.
   If the estimate overshot, the reservation stays and costs a little trailing space
   rather than a jump. Nothing here changes what is fetched or rendered. */
function forumReserveThreadSpace(container) {
    if (!container) return 0;
    var px = parseInt(window.__TMR_FORUM_RESERVE_PX, 10);
    if (!(px > 0)) return 0;
    container.style.minHeight = px + 'px';
    return px;
}
function forumReleaseThreadSpace(container, reserved) {
    if (!container || !reserved) return;
    // Two frames: let the posts lay out before deciding whether the reserve is spent.
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            // Measure the POSTS, not the container: while the reservation is applied
            // the container's own scrollHeight IS the reservation, so comparing
            // against it always succeeded and released the reserve even when the
            // real content was shorter -- which put the jump straight back.
            var rendered = 0;
            var nodes = container.querySelectorAll('.fthread-post');
            for (var i = 0; i < nodes.length; i++) rendered += nodes[i].offsetHeight;
            if (rendered >= reserved) container.style.minHeight = '';
        });
    });
}

async function loadThread(threadId) {
    var container = document.getElementById('postsContainer');
    showLoading(container);
    var reservedPx = forumReserveThreadSpace(container);

    try {
        var data = await api.request('/forum/threads/' + threadId, {
            signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout)
                ? AbortSignal.timeout(FORUM_THREAD_LOAD_BUDGET_MS) : undefined
        });
        cachedThread = data.thread;
        cachedPosts = data.posts || [];
        // Server-confirmed moderator flag for the current viewer (display only;
        // the backend re-checks the role on every moderator endpoint).
        window.__forumViewerIsModerator = !!(data.viewer && data.viewer.is_moderator);
        currentThreadTitle = cachedThread.title;
        // Set category info from thread if not already set
        if (cachedThread.category_slug) {
            currentCategorySlug = cachedThread.category_slug;
            currentCategoryName = cachedThread.category_name || cachedThread.category_slug;
            currentCategoryId = cachedThread.category_id;
        }
        await enrichForumAuthors(cachedThread, cachedPosts);
        renderThread();
        forumReleaseThreadSpace(container, reservedPx);
        renderReplyArea();
        // Update header label
        var detailHeader = document.getElementById('threadDetailHeader');
        if (detailHeader) detailHeader.textContent = currentThreadTitle || 'Thread';
    } catch (err) {
        // A 404 from the API means the thread genuinely does not exist (bad id or
        // removed thread). Render an explicit not-found state instead of a generic
        // failure, so /forum/?thread=999999 reads as gone to visitors and crawlers
        // rather than looking like a working page.
        // NOTE: the HTTP status stays 200 -- /forum/ is a static file on GitHub
        // Pages and a query string cannot change the response status. The honest
        // not-found body is what makes Google treat it as a soft 404 and drop it.
        // No noindex and no redirect are used.
        if (err && err.status === 404) {
            forumRenderThreadNotFound(threadId, container);
            if (container) container.style.minHeight = '';
        } else {
            var timedOut = !!(err && (err.name === 'TimeoutError' || err.name === 'AbortError'));
            forumRenderThreadLoadFailed(threadId, container, timedOut
                ? 'The server did not respond within ' + Math.round(FORUM_THREAD_LOAD_BUDGET_MS / 1000) + ' seconds.'
                : 'The server could not be reached.');
            if (container) container.style.minHeight = '';
        }
        console.error('Load thread error:', err);
    }
}

/* Explicit thread-not-found view: API returned 404 for this thread id, i.e. it
   never existed or was removed. Keeps the visitor inside the forum with real
   links instead of an empty shell or a misleading error. */
function forumRenderThreadNotFound(threadId, container) {
    cachedThread = null;
    cachedPosts = [];
    currentThreadTitle = 'Thread not found';
    document.title = 'Thread not found | TrustMyRecord Forum';
    if (container) {
        container.innerHTML =
            '<div class="fthread-missing" style="background:#13131c;border:1px solid #262636;'
            + 'border-radius:12px;padding:22px;text-align:center;color:#c9d0e4;">'
            + '<h2 style="margin:0 0 8px;font-family:Barlow,sans-serif;font-size:19px;">Thread not found</h2>'
            + '<p style="margin:0 0 14px;color:#8890ad;font-size:14px;">'
            + 'This thread does not exist, or it was removed. Nothing was redirected.</p>'
            + '<p style="margin:0;font-size:14px;">'
            + '<a href="/forum/" style="color:#00aeff;text-decoration:none;">Browse all forums</a></p>'
            + '</div>';
    }
    var replyArea = document.getElementById('replyArea');
    if (replyArea) replyArea.innerHTML = '';
    var detailHeader = document.getElementById('threadDetailHeader');
    if (detailHeader) detailHeader.textContent = 'Thread not found';
    var crumb = document.getElementById('breadcrumb');
    if (crumb) crumb.innerHTML = '<a onclick="showCategories()">Forums</a>'
        + '<span class="sep">&raquo;</span><span>Thread not found</span>';
}

// Quick-Reply box gets rebuilt every time a thread loads. Logged-out
// users see a prompt to sign in instead of the textarea.
function renderReplyArea() {
    var area = document.getElementById('replyArea');
    if (!area) return;
    if (!isUserLoggedIn()) {
        area.innerHTML = '<div style="color:#555;font-size:11px;">'
            + '<a href="/login/" style="color:#14365b;font-weight:700;">Log in</a>'
            + ' or <a href="/register/" style="color:#14365b;font-weight:700;">register</a>'
            + ' to reply to this thread.</div>';
        return;
    }
    area.innerHTML = '<textarea id="replyText" rows="5" placeholder="Type your reply..."></textarea>'
        + '<div style="margin-top:6px;display:flex;justify-content:flex-end;gap:6px;">'
        +   '<button type="button" class="fbtn" onclick="document.getElementById(\'replyText\').value=\'\'">Clear</button>'
        +   '<button type="button" class="fbtn is-primary" onclick="submitReply()">Post Reply</button>'
        + '</div>';
    try { if (window.TMREmoji) TMREmoji.attach(document.getElementById('replyText')); } catch(e){}
    // FORUM_IMAGE_PASTE_20260720: quick reply (and therefore quote reply, which
    // writes into this same box) accepts pasted/dropped/picked images.
    try { if (window.TMRForumImages) TMRForumImages.attach(document.getElementById('replyText')); } catch(e){}
}

/* removed: replaced in renders.js */


// ================================================================
// LIKE POST
// ================================================================
async function likePost(postId) {
    if (!isUserLoggedIn()) {
        alert('Please log in to like posts.');
        return;
    }
    try {
        await api.request('/forum/posts/' + postId + '/like', { method: 'POST' });
        // Reload thread to get updated like counts
        await loadThread(currentThreadId);
    } catch (err) {
        console.error('Like error:', err);
        alert(err.message || 'Failed to like post.');
    }
}

// ================================================================
// CREATE THREAD
// ================================================================
function isUserLoggedIn() {
    // Check backend JWT
    if (api.isLoggedIn()) return true;
    // Check PersistentAuthSystem
    if (typeof auth !== 'undefined' && auth.isLoggedIn && auth.isLoggedIn()) return true;
    // Check localStorage session directly
    try {
        var s = localStorage.getItem('trustmyrecord_session');
        if (s) { var p = JSON.parse(s); var u = p.user || p; if (u && u.username) return true; }
    } catch(e) {}
    return false;
}

function openNewThread() {
    if (!isUserLoggedIn()) {
        try { sessionStorage.setItem('tmr_post_auth_redirect', '/forum/'); } catch (e) {}
        window.location.href = '/login/';
        return;
    }
    var modal = document.getElementById('newThreadModal');
    if (!modal) { console.warn('[forum] newThreadModal missing'); return; }

    // Populate the forum dropdown from live categories. If a category is
    // already selected (user clicked New Thread from inside a thread list),
    // pre-select it. From the index, the user picks a forum here.
    var sel = document.getElementById('ntCategory');
    if (sel) {
        var opts = ['<option value="">Select a forum...</option>'];
        (categories || []).filter(function (c) {
            return !c.is_official || tmrForumUserIsStaff();
        }).forEach(function (c) {
            var label = c.name || c.slug || 'Forum';
            opts.push('<option value="' + escHtml(String(c.id)) + '" data-slug="' + escHtml(c.slug || '') + '" data-name="' + escHtml(label) + '">' + escHtml(label) + '</option>');
        });
        sel.innerHTML = opts.join('');
        if (currentCategoryId) sel.value = String(currentCategoryId);
    }

    modal.classList.add('is-open');
    try { if (window.TMREmoji) TMREmoji.attach(document.getElementById('ntContent')); } catch(e){}
    try { if (window.TMRForumImages) TMRForumImages.attach(document.getElementById('ntContent')); } catch(e){}
    setTimeout(function () {
        var t = document.getElementById('ntTitle');
        if (t) t.focus();
    }, 30);
}

function tmrForumUserIsStaff() {
    // Official sections: only admins/moderators/official bots may start
    // threads. Backend enforces this on POST /forum/threads; this only
    // controls what the composer offers.
    var u = getForumSessionUser();
    if (!u) return false;
    var t = String(u.account_type || '').toLowerCase();
    return t === 'admin' || t === 'moderator' || !!u.is_official_bot;
}

function closeNewThread() {
    var modal = document.getElementById('newThreadModal');
    if (modal) modal.classList.remove('is-open');
    var f = document.getElementById('newThreadForm');
    if (f) f.reset();
}

function getForumSessionUser() {
    try {
        if (window.auth && typeof window.auth.getCurrentUser === 'function') {
            var authUser = window.auth.getCurrentUser();
            if (authUser && (authUser.username || authUser.email)) return authUser;
        }
    } catch(e) {}
    try {
        var raw = localStorage.getItem('trustmyrecord_session') || localStorage.getItem('tmr_current_user') || 'null';
        var parsed = JSON.parse(raw);
        return parsed && parsed.user ? parsed.user : parsed;
    } catch(e) {}
    return null;
}

function pushForumActivity(type, payload) {
    var user = getForumSessionUser();
    if (!user || !user.username) return;

    try {
        var activities = JSON.parse(localStorage.getItem('tmr_social_activity') || '[]');
        activities.unshift({
            id: 'forum_activity_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            type: type,
            username: user.username,
            data: payload || {},
            timestamp: new Date().toISOString(),
            visibility: 'public'
        });
        localStorage.setItem('tmr_social_activity', JSON.stringify(activities.slice(0, 1000)));
    } catch(e) {}
}

async function submitThread(e) {
    e.preventDefault();
    if (!isUserLoggedIn()) { window.location.href = '/login/'; return; }

    var title = document.getElementById('ntTitle').value.trim();
    var content = document.getElementById('ntContent').value.trim();

    if (title.length < 5) { alert('Title must be at least 5 characters.'); return; }
    if (content.length < 10) { alert('Content must be at least 10 characters.'); return; }

    // Read category from the modal selector first, then fall back to the
    // currently-open category if the user came from a thread list view.
    var selEl = document.getElementById('ntCategory');
    var selectedId = selEl && selEl.value ? selEl.value : null;
    var selectedOpt = selEl && selEl.selectedOptions ? selEl.selectedOptions[0] : null;
    var selectedSlug = selectedOpt ? selectedOpt.getAttribute('data-slug') : '';
    var selectedName = selectedOpt ? selectedOpt.getAttribute('data-name') : '';

    var postCategoryId = selectedId || currentCategoryId || null;
    var postCategorySlug = selectedSlug || currentCategorySlug || '';
    var postCategoryName = selectedName || currentCategoryName || '';

    if (!postCategoryId) {
        alert('Please select a forum to post this thread in.');
        if (selEl) selEl.focus();
        return;
    }

    var submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Posting...'; }

    try {
        var data = await api.request('/forum/threads', {
            method: 'POST',
            body: { category_id: postCategoryId, title: title, content: content }
        });
        pushForumActivity('forum_thread_created', {
            title: title,
            category: postCategoryName || postCategorySlug || 'Forum',
            threadId: data && data.thread ? data.thread.id : null
        });
        closeNewThread();

        // After posting, open the NEW THREAD itself so the creator lands on its
        // permanent URL (/forum/thread/<id>/<slug>/) — the address bar holds the
        // shareable link the moment the thread exists. Category context is set
        // first so the breadcrumb and back-to-list navigation stay correct.
        currentCategoryId = postCategoryId;
        currentCategorySlug = postCategorySlug || currentCategorySlug;
        currentCategoryName = postCategoryName || currentCategoryName;
        var newId = data && data.thread ? data.thread.id : null;
        if (newId) {
            await showThreadDetail(newId);
        } else if (typeof showThreadsList === 'function' && currentCategorySlug) {
            await showThreadsList(currentCategorySlug, currentCategoryName, currentCategoryId);
        } else {
            await loadThreads();
        }
    } catch (err) {
        console.error('Create thread error:', err);
        alert((err && err.message) ? err.message : 'Failed to create thread. Please try again.');
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Post Thread'; }
    }
}

// ================================================================
// SUBMIT REPLY
// ================================================================
async function submitReply() {
        if (!isUserLoggedIn()) { window.location.href = '/login/'; return; }

    var textarea = document.getElementById('replyText');
    if (!textarea) return;
    var content = textarea.value.trim();
    if (content.length < 5) { alert('Reply must be at least 5 characters.'); return; }

    // Disable button while posting
    var btns = textarea.parentElement.querySelectorAll('.btn');
    btns.forEach(function(b) { b.disabled = true; b.textContent = 'Posting...'; });

    try {
        await api.request('/forum/threads/' + currentThreadId + '/posts', {
            method: 'POST',
            body: { content: content }
        });
        pushForumActivity('forum_reply_created', {
            threadId: currentThreadId,
            threadTitle: cachedThread && cachedThread.title ? cachedThread.title : 'Forum discussion'
        });
        // Reload thread to show new reply
        await loadThread(currentThreadId);
        // Scroll to bottom
        var posts = document.getElementById('postsContainer');
        if (posts && posts.lastElementChild) {
            posts.lastElementChild.scrollIntoView({ behavior: 'smooth' });
        }
    } catch (err) {
        console.error('Reply error:', err);
        alert(err.message || 'Failed to post reply. Please try again.');
        btns.forEach(function(b) { b.disabled = false; b.textContent = 'Post Reply'; });
    }
}

// ================================================================
// SEARCH
// ================================================================
function handleSearch(query) {
    clearTimeout(searchDebounceTimer);
    if (!query || query.length < 3) {
        return;
    }
    searchDebounceTimer = setTimeout(function() {
        performSearch(query);
    }, 400);
}

async function performSearch(query) {
    // Switch to threads view for results
    currentCategorySlug = null;
    currentCategoryId = null;
    document.getElementById('viewCategories').style.display = 'none';
    document.getElementById('viewThreads').style.display = '';
    document.body.classList.remove('is-forum-home');
    document.getElementById('viewThread').style.display = 'none';

    var bc = document.getElementById('breadcrumb');
    bc.innerHTML = '<a onclick="showCategories()">Forums</a><span class="sep">&raquo;</span><span>Search: "' + escHtml(query) + '"</span>';

    var body = document.getElementById('threadsBody');
    body.innerHTML = '<tr><td colspan="5" class="empty-msg">Searching...</td></tr>';

    try {
        var data = await api.request('/forum/search?q=' + encodeURIComponent(query));
        var results = data.results || [];

        if (results.length === 0) {
            body.innerHTML = '<tr><td colspan="5" class="empty-msg"><div>No threads match your search.</div></td></tr>';
            return;
        }

        body.innerHTML = results.map(function(t) {
            var catName = t.category_name || '';
            var catSlug = t.category_slug || '';
            return '<tr onclick="currentCategorySlug=\'' + escHtml(catSlug) + '\';currentCategoryName=\'' + escHtml(catName) + '\';showThreadDetail(' + t.id + ')">' +
                '<td><div class="tmr-fb-thread-cell"><span class="tmr-fb-thread-icon">T</span><div class="tmr-fb-thread-body">' +
                    '<span class="tag-pill">' + escHtml(catName) + '</span>' +
                    '<a class="tmr-fb-thread-title" href="' + escHtml(forumThreadUrl(t.id, forumThreadSlug(t))) + '" onclick="event.preventDefault();event.stopPropagation();currentCategorySlug=\'' + escHtml(catSlug) + '\';currentCategoryName=\'' + escHtml(catName) + '\';showThreadDetail(' + t.id + ');">' + escHtml(t.title) + '</a>' +
                    '<div class="tmr-fb-thread-meta">Started by <strong>' + forumUserLinkHtml(t.username || '') + '</strong> &middot; ' + formatForumStamp(t.created_at) + '</div>' +
                '</div></div></td>' +
                '<td class="col-rating"></td>' +
                '<td class="col-last"><div class="tmr-fb-lastpost-meta">' + formatForumStamp(t.last_post_at || t.created_at) + '</div></td>' +
                '<td class="col-num">' + (t.reply_count || 0) + '</td>' +
                '<td class="col-num">' + (t.view_count || 0) + '</td>' +
                '</tr>';
        }).join('');
    } catch (err) {
        body.innerHTML = '<tr><td colspan="5" class="empty-msg"><div style="color:var(--danger);">Search failed. Please try again.</div></td></tr>';
        console.error('Search error:', err);
    }
}

// ================================================================
// INIT
// ================================================================
function updateForumNavAuth() {
    var loggedIn = isUserLoggedIn();
    var u = loggedIn ? getForumSessionUser() : null;

    var topLogin = document.getElementById('forumTopLoginLink');
    var topRegister = document.getElementById('forumTopRegisterLink');
    var userWrap = document.getElementById('tmrfhUser');
    var msgBtn = document.getElementById('tmrfhMsgBtn');
    var bellBtn = document.getElementById('notificationsBtn');

    if (topLogin) topLogin.style.display = loggedIn ? 'none' : '';
    if (topRegister) topRegister.style.display = loggedIn ? 'none' : '';
    if (userWrap) userWrap.style.display = loggedIn ? '' : 'none';
    if (msgBtn) msgBtn.style.display = loggedIn ? '' : 'none';
    if (bellBtn) bellBtn.style.display = loggedIn ? '' : 'none';

    if (loggedIn && u) {
        var name = u.displayName || u.display_name || u.username || u.email || 'Account';
        var un = u.username || '';
        var av = u.avatar_url || u.avatar || '';
        var initial = String(name || '?').slice(0, 1).toUpperCase();
        var unameEl = document.getElementById('tmrfhUsername');
        if (unameEl) unameEl.textContent = name;
        var avEl = document.getElementById('tmrfhAvatar');
        if (avEl) {
            var avResolved = tmrAvaSrc({ username: un, avatar_url: av });
            if (avResolved) {
                avEl.innerHTML = '<img src="' + escHtml(avResolved) + '" alt="">';
            } else {
                avEl.textContent = initial;
            }
        }
        var prof = document.getElementById('tmrfhMenuProfile');
        if (prof && un) prof.href = '/profile/?user=' + encodeURIComponent(un);
        tmrfhLoadMsgBadge();
    } else {
        tmrfhSetBadge('msgBadge', 0);
    }
}

/* ================= TMR forum header interactions ================= */
function tmrfhToggleMenu(e) {
    if (e) e.stopPropagation();
    var m = document.getElementById('tmrfhMenu');
    var b = document.getElementById('tmrfhUserBtn');
    if (!m) return;
    var open = m.classList.toggle('is-open');
    if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function tmrfhCloseMenu() {
    var m = document.getElementById('tmrfhMenu');
    var b = document.getElementById('tmrfhUserBtn');
    if (m) m.classList.remove('is-open');
    if (b) b.setAttribute('aria-expanded', 'false');
}
function tmrfhToggleNav() {
    var h = document.getElementById('tmrForumHeader');
    var b = document.getElementById('tmrfhBurger');
    if (!h) return;
    var open = h.classList.toggle('nav-open');
    if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function tmrfhCloseNav() {
    var h = document.getElementById('tmrForumHeader');
    var b = document.getElementById('tmrfhBurger');
    if (h) h.classList.remove('nav-open');
    if (b) b.setAttribute('aria-expanded', 'false');
}
function tmrfhToggleSearch() {
    var s = document.getElementById('tmrfhSearch');
    if (!s) return;
    var open = s.classList.toggle('is-open');
    if (open) { var i = document.getElementById('searchInput'); if (i) setTimeout(function(){ i.focus(); }, 10); }
}
function tmrfhSetActiveNav(which) {
    var map = { 'Forum Home': 'home', 'New Posts': 'new', 'Subscribed Threads': 'subs', 'My Threads': 'home', 'Rules': 'rules' };
    var key = map[which] || 'home';
    var links = document.querySelectorAll('.tmrfh-nav a[data-nav]');
    for (var i = 0; i < links.length; i++) {
        links[i].classList.toggle('is-active', links[i].getAttribute('data-nav') === key);
    }
}
document.addEventListener('click', function(e) {
    var u = document.getElementById('tmrfhUser');
    if (u && !u.contains(e.target)) tmrfhCloseMenu();
    var s = document.getElementById('tmrfhSearch');
    if (s && !s.contains(e.target)) s.classList.remove('is-open');
});
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        tmrfhCloseMenu();
        var s = document.getElementById('tmrfhSearch'); if (s) s.classList.remove('is-open');
        var rm = document.getElementById('tmrfhRulesModal'); if (rm) rm.classList.remove('is-open');
    }
});

/* Messages unread badge — summed from conversations, logged-in only. */
function tmrfhSetBadge(id, n) {
    var b = document.getElementById(id);
    if (!b) return;
    if (n > 0) { b.textContent = n > 99 ? '99+' : String(n); b.style.display = 'inline-flex'; }
    else { b.style.display = 'none'; b.textContent = '0'; }
}
async function tmrfhLoadMsgBadge() {
    try {
        if (!isUserLoggedIn() || !window.api || typeof api.getConversations !== 'function') return;
        try { await api.ready; } catch (e) {}
        var d = await api.getConversations();
        var convs = (d && d.conversations) || [];
        var n = convs.reduce(function(s, c) { return s + (parseInt(c.unread_count, 10) || 0); }, 0);
        tmrfhSetBadge('msgBadge', n);
    } catch (e) {}
}

/* Thread-feed views reusing the existing #viewThreads table.
   Same resilience contract as loadCategories(): bounded retries with backoff
   for transient failures (Render cold start, DB crash-recovery window), a
   success-only empty state, and an error state that is only shown after every
   retry failed — never because of a momentary blip. */
var _feedLoadGen = 0;
async function tmrfhShowThreadFeed(title, filterFn) {
    var myGen = ++_feedLoadGen;
    document.getElementById('viewCategories').style.display = 'none';
    document.getElementById('viewThreads').style.display = '';
    document.body.classList.remove('is-forum-home');
    document.getElementById('viewThread').style.display = 'none';
    var label = document.getElementById('threadsCategoryLabel');
    if (label) label.textContent = title;
    setForumPageHeader(title);
    tmrfhSetActiveNav(title);
    var bc = document.getElementById('breadcrumb');
    if (bc) bc.innerHTML = '<a onclick="showCategories()">TrustMyRecord Forums</a><span class="sep">&rsaquo;</span><span>' + escHtml(title) + '</span>';
    var body = document.getElementById('threadsBody');
    if (body) body.innerHTML = '<tr><td colspan="5" class="empty-msg">Loading threads...</td></tr>';

    var maxAttempts = 3;
    var lastErr = null;
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
        if (myGen !== _feedLoadGen) return; // superseded by newer navigation
        try {
            var data = await api.getForumThreads({ limit: 40 });
            if (myGen !== _feedLoadGen) return;
            var list = (data && Array.isArray(data.threads)) ? data.threads : null;
            if (!list) throw new Error('Malformed threads response');
            if (filterFn) list = list.filter(filterFn);
            cachedThreads = list;
            currentCategorySlug = null;
            tmrfhFeedEmptyMsg = (title === 'New Posts') ? 'No new posts.' : null;
            renderThreads();
            window.history.replaceState({}, '', '/forum/');
            return;
        } catch (err) {
            lastErr = err;
            if (myGen !== _feedLoadGen) return;
            console.warn('[Forum] thread feed attempt ' + attempt + '/' + maxAttempts + ' failed:', err && err.message);
            if (attempt < maxAttempts) {
                await new Promise(function (r) { setTimeout(r, 1500 * attempt); });
            }
        }
    }
    if (myGen !== _feedLoadGen) return;
    console.error('Thread feed error:', lastErr);
    if (body) {
        // Retry re-invokes the named view so per-view filters are preserved.
        var retryCall = { 'New Posts': 'showNewPosts()', 'My Threads': 'showMyThreads()', 'Subscribed Threads': 'showSubscribed()' }[title]
            || ('tmrfhShowThreadFeed(' + JSON.stringify(title) + ')');
        body.innerHTML = '<tr><td colspan="5" class="empty-msg" style="color:var(--danger);">Could not load threads. '
            + '<a href="#" style="text-decoration:underline;" onclick="event.preventDefault();' + retryCall + ';">Retry</a></td></tr>';
    }
    window.history.replaceState({}, '', '/forum/');
}
function showNewPosts() {
    return tmrfhShowThreadFeed('New Posts', null);
}
function showMyThreads() {
    if (!isUserLoggedIn()) { window.location.href = '/login/'; return; }
    var u = getForumSessionUser();
    var me = String((u && u.username) || '').toLowerCase();
    return tmrfhShowThreadFeed('My Threads', function(t) {
        return String(t.username || (t.user && t.user.username) || '').toLowerCase() === me && me !== '';
    });
}
function showSubscribed() {
    if (!isUserLoggedIn()) { window.location.href = '/login/'; return; }
    return tmrfhShowThreadFeed('Subscribed Threads', function(t) {
        return !!(t.subscribed_by_me || t.subscribed || t.is_subscribed);
    });
}
function showRules() {
    tmrfhCloseMenu(); tmrfhCloseNav();
    var m = document.getElementById('tmrfhRulesModal');
    if (!m) {
        m = document.createElement('div');
        m.id = 'tmrfhRulesModal';
        m.className = 'tmrfh-rules-overlay';
        m.innerHTML = '<div class="tmrfh-rules-box">'
            + '<button type="button" class="tmrfh-rules-x" aria-label="Close" onclick="document.getElementById(\'tmrfhRulesModal\').classList.remove(\'is-open\')">&times;</button>'
            + '<h2>Forum Rules &amp; Posting Guidelines</h2>'
            + '<ol>'
            + '<li>Post real picks and real results. Fabricated records, fake screenshots, or doctored receipts are not allowed.</li>'
            + '<li>Stay on topic. Use the forum that matches your sport or discussion.</li>'
            + '<li>No spam, no paid-pick advertising dumps, no affiliate link flooding.</li>'
            + '<li>Be civil. No harassment, hate speech, doxxing, or personal attacks.</li>'
            + '<li>One account per person. No ban evasion or impersonation.</li>'
            + '<li>Keep it legal. Do not solicit illegal activity.</li>'
            + '<li>Moderators may edit, move, lock, or remove posts that break these rules.</li>'
            + '</ol>'
            + '<p>Track your record honestly and let the results speak. That is what TrustMyRecord is about.</p>'
            + '</div>';
        m.addEventListener('click', function(e) { if (e.target === m) m.classList.remove('is-open'); });
        document.body.appendChild(m);
    }
    m.classList.add('is-open');
}

/* Keep the messages badge fresh. */
(function tmrfhMsgBadgeInit() {
    var poll = function() { if (document.visibilityState !== 'hidden') tmrfhLoadMsgBadge(); };
    setInterval(poll, 30000);
    window.addEventListener('focus', poll);
    document.addEventListener('visibilitychange', poll);
    window.addEventListener('tmr-auth-changed', function() { setTimeout(updateForumNavAuth, 0); });
})();

function logoutForumTop() {
    try {
        if (typeof api !== 'undefined' && api.logout) api.logout();
    } catch (e) {}
    try {
        if (typeof auth !== 'undefined' && auth.logout) auth.logout();
    } catch (e) {}
    try {
        localStorage.removeItem('trustmyrecord_session');
        localStorage.removeItem('tmr_current_user');
    } catch (e) {}
    window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', async function() {
    updateForumNavAuth();

    // Close modal on outside click
    document.getElementById('newThreadModal').addEventListener('click', function(e) {
        if (e.target === this) closeNewThread();
    });

    // Show loading state while waiting for backend
    var catContainer = document.getElementById('categoriesContainer');
    catContainer.innerHTML = '<div class="tmr-loading-state" id="forumLoadingState"><div class="tmr-spinner"></div><p>Loading forum...</p><p class="tmr-loading-slow" id="forumLoadingSlow">Warming up servers... this takes ~30 seconds on first visit.</p><div class="tmr-loading-retry" id="forumLoadingRetry"><p>Could not connect to servers.</p><button onclick="location.reload()">Refresh</button></div></div>';
    var _forumSlowTimer = setTimeout(function() { var el = document.getElementById('forumLoadingSlow'); if (el) el.style.display = 'block'; }, 5000);
    var _forumRetryTimer = setTimeout(function() { var el = document.getElementById('forumLoadingRetry'); var sl = document.getElementById('forumLoadingSlow'); if (el) el.style.display = 'block'; if (sl) sl.style.display = 'none'; }, 30000);

    // Wait for backend detection
    await api.ready;
    clearTimeout(_forumSlowTimer); clearTimeout(_forumRetryTimer);

    if (!api || typeof api.request !== 'function') {
        catContainer.innerHTML =
            '<div class="tmr-loading-state">' +
            '<div style="font-size:2.5rem;margin-bottom:12px;opacity:0.5;">&#x1F50C;</div>' +
            '<p>Could not connect to the forum server.</p>' +
            '<p class="tmr-loading-slow" style="display:block;">The server may be warming up. This takes ~30 seconds on first visit.</p>' +
            '<div class="tmr-loading-retry" style="display:block;"><button onclick="location.reload()">Try Again</button></div>' +
            '</div>';
        return;
    }

    // Clean thread URL: /forum/thread/<id>/<slug>/ served a baked static page and
    // tmr-forum-thread-hydrate.js swapped this shell in, setting the thread id.
    // Boot straight into that thread and leave the address bar on the clean URL.
    if (window.__TMR_FORUM_THREAD_ID) {
        var cleanTid = parseInt(window.__TMR_FORUM_THREAD_ID, 10);
        if (cleanTid) {
            var cleanPost = '';
            var cleanHash = (window.location.hash || '').match(/^#post-(.+)$/);
            if (cleanHash) cleanPost = decodeURIComponent(cleanHash[1]);
            // SHARE_SYSTEM_PHASE1_20260721: shared post links are
            // /forum/thread/<id>/<slug>/?post=<pid>#post-<pid>. Read ?post= as
            // well, since a fragment can be dropped in transit (chat apps,
            // redirectors). No new highlight code: showThreadDetail() already
            // routes this through forumScrollToPost().
            if (!cleanPost) {
                cleanPost = (new URLSearchParams(window.location.search).get('post') || '').trim();
            }
            // PERF_SIDEBAR_20260911: every thread entry point used to return from
            // this handler without ever calling loadCategories(), which is the only
            // thing that moves forumLoadState off 'loading' and calls
            // renderForumSidebar(). The left rail therefore sat on the literal string
            // "Loading forums..." forever on /forum/thread/<id>/<slug>/ and on
            // /forum/?thread=<id>, and /api/forum/categories was never requested at
            // all. Fire-and-forget (deliberately NOT awaited) so the rail fills in
            // parallel and can never delay the thread itself -- the same shape the
            // ?view=new branch below already uses.
            loadCategories();
            await showThreadDetail(cleanTid, null, cleanPost || null, true);
            return;
        }
    }

    // Clean category URL: /forum/<slug>/ served a baked static page and
    // tmr-forum-cat-hydrate.js swapped this shell in, setting the slug.
    if (window.__TMR_FORUM_CAT_SLUG) {
        var catSlugBoot = String(window.__TMR_FORUM_CAT_SLUG);
        if (!categories || !categories.length) await loadCategories();
        var catBoot = (categories || []).find(function (x) { return x.slug === catSlugBoot; });
        if (catBoot) { await showThreadsList(catBoot.slug, catBoot.name, catBoot.id, true); return; }
    }

    // Check URL hash for deep link
    var params = new URLSearchParams(window.location.search);
    var queryUser = (params.get('user') || '').trim();
    if (queryUser) {
        await showUserActivity(queryUser);
        return;
    }
    var queryThread = parseInt(params.get('thread'));
    if (queryThread) {
        // ?post=<id> (or a bare #post-<id> riding alongside ?thread=) opens the
        // thread and scrolls to that exact reply. Post ids are not always
        // numeric -- the thread starter is 'thread-<id>-starter' -- so this is
        // read as a string and never parseInt'd.
        var queryPost = (params.get('post') || '').trim();
        if (!queryPost) {
            var postHash = (window.location.hash || '').match(/^#post-(.+)$/);
            if (postHash) queryPost = decodeURIComponent(postHash[1]);
        }
        // PERF_SIDEBAR_20260911: every thread entry point used to return from
        // this handler without ever calling loadCategories(), which is the only
        // thing that moves forumLoadState off 'loading' and calls
        // renderForumSidebar(). The left rail therefore sat on the literal string
        // "Loading forums..." forever on /forum/thread/<id>/<slug>/ and on
        // /forum/?thread=<id>, and /api/forum/categories was never requested at
        // all. Fire-and-forget (deliberately NOT awaited) so the rail fills in
        // parallel and can never delay the thread itself -- the same shape the
        // ?view=new branch below already uses.
        loadCategories();
        await showThreadDetail(queryThread, null, queryPost || null, true);
        return;
    }
    var queryCategory = params.get('category');
    if (queryCategory) {
        await loadCategories();
        var queryCatMatch = categories.find(function(item) { return item.slug === queryCategory; });
        await showThreadsList(queryCategory, queryCatMatch ? queryCatMatch.name : queryCategory, queryCatMatch ? queryCatMatch.id : null, true);
        return;
    }
    // Deep link for the New Posts feed (/forum/new-posts/ redirects here).
    if (params.get('view') === 'new') {
        loadCategories(); // sidebar fills in parallel with the feed
        await showNewPosts();
        return;
    }

    var hash = window.location.hash;
    if (hash && hash.indexOf('#thread-') === 0) {
        var tid = parseInt(hash.substring(8));
        if (tid) {
            loadCategories(); // PERF_SIDEBAR_20260911: see note above
            await showThreadDetail(tid, null, null, true);
            return;
        }
    }
    if (hash && hash.indexOf('#cat-') === 0) {
        var slug = hash.substring(5);
        if (slug) {
            await loadCategories();
            var hashCatMatch = categories.find(function(item) { return item.slug === slug; });
            await showThreadsList(slug, hashCatMatch ? hashCatMatch.name : slug, hashCatMatch ? hashCatMatch.id : null, true);
            return;
        }
    }

    // Default: load and show the live forum index.
    await loadCategories();
    showCategories();
    loadNewestMember();
    loadForumStatistics();
});

