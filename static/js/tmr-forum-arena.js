/* tmr-forum-arena.js
 * FORUM_ARENA_REDESIGN_20261113: presentation layer for the Community Forum.
 *
 * Loaded directly after tmr-forum-app.js and before its DOMContentLoaded boot.
 * It replaces only the RENDER functions (renderCategories, renderThreads,
 * renderForumSidebar, performSearch) and adds the hero, toolbar and rails.
 * Routing, auth, URLs, history, thread detail, replies, likes, tips, uploads,
 * moderation and every API call stay in tmr-forum-app.js, untouched.
 *
 * Every number on screen comes from the live forum API:
 *   /forum/categories  -> category list and discussion counts
 *   /forum/threads     -> every discussion (paged), used for sorting, trending,
 *                         contributors and the signed-in member's own stats
 *   /forum/search      -> search results
 *   /forum/stats       -> community totals (existing loadForumStatistics)
 * Nothing is invented. A widget with no data is omitted.
 *
 * Rollback: remove the arena tags from forum/index.html (see the comment
 * there). With this file absent the classic forum renders exactly as before.
 */
(function () {
  'use strict';
  if (typeof renderThreads !== 'function' || typeof renderCategories !== 'function') return;

  var A = window.TMRArena = {
    all: null,            // every live discussion, or null until loaded
    allState: 'idle',     // idle | loading | loaded | error
    allAt: 0,
    sort: 'trending',
    mode: 'home',         // home | cat | feed | search
    query: '',
    feedTitle: '',
    shown: 20,
    PAGE: 20
  };

  var ICON = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>',
    fire: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 2c.4 3-1 4.700-2.600 6.300C9.300 9.900 8 11.500 8 13.500c0 .9.200 1.700.600 2.400-1.500-.700-2.400-2.200-2.600-3.900C4.700 13.400 4 15.200 4 17c0 3 2.700 5 8 5s8-2.200 8-6c0-5.500-4.500-7.500-6.500-14Z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.500" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 7.500V12l3 2"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21s-7.500-4.600-9.600-9.100C.900 8.600 2.700 5 6.300 5c2 0 3.400 1 4.200 2.300h3C14.300 6 15.700 5 17.700 5c3.600 0 5.400 3.600 3.900 6.900C19.500 16.400 12 21 12 21Z"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 4 4"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14.500 2 22 9.500l-2 1-3.500 3.500.500 4.500-1.500 1.500-4-4L6 21.500 4.500 20l5.500-5.500-4-4L7.500 9l4.500.500L15.500 6l-1-2Z"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 3h12v2h3v3a4 4 0 0 1-4 4h-.300A5 5 0 0 1 13 14.900V18h3v3H8v-3h3v-3.100A5 5 0 0 1 7.300 12H7a4 4 0 0 1-4-4V5h3V3Zm0 4H5v1a2 2 0 0 0 1 1.700V7Zm12 0v2.700A2 2 0 0 0 19 8V7h-1Z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.400" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m-5-5 5 5-5 5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M2 12s3.600-6.500 10-6.500S22 12 22 12s-3.600 6.500-10 6.500S2 12 2 12Z"/><circle cx="12" cy="12" r="2.800" fill="currentColor"/></svg>',
    shield: '<svg viewBox="0 0 48 54" aria-hidden="true"><path fill="#0b1d38" stroke="#dbe9ff" stroke-width="3" d="M24 2 44 9v17c0 12-8.500 21.500-20 26C12.500 47.500 4 38 4 26V9l20-7Z"/><path fill="#2b8cff" d="M14 15h20v6h-7v19h-6V21h-7v-6Z"/></svg>'
  };

  function esc(v) { return escHtml(v == null ? '' : String(v)); }
  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function compact(v) {
    var n = num(v);
    if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(n);
  }
  function plural(n, one, many) { return compact(n) + ' ' + (num(n) === 1 ? one : many); }
  function tsOf(v) { var d = parseForumTimestamp(v); return d ? d.getTime() : 0; }
  function lastTs(t) { return tsOf(t.last_post_at || t.last_post_created_at || t.updated_at || t.created_at); }
  function isPinned(t) { return !!(t.is_pinned || t.sticky); }
  function starterOf(t) { return t.username || (t.user && t.user.username) || 'user'; }

  /* Trending = real engagement, decayed by how long ago the discussion was last
     active. Replies weigh most, then likes, then views. */
  function trendScore(t) {
    var hours = Math.max(0, (Date.now() - lastTs(t)) / 3600000);
    var engagement = 1 + num(t.reply_count) * 4 + num(t.like_count) * 3 + num(t.view_count) * 0.250;
    return engagement / Math.pow(hours + 12, 1.150);
  }

  function sortThreads(list, mode) {
    var cmp;
    if (mode === 'latest') cmp = function (a, b) { return lastTs(b) - lastTs(a); };
    else if (mode === 'replies') cmp = function (a, b) { return (num(b.reply_count) - num(a.reply_count)) || (lastTs(b) - lastTs(a)); };
    else if (mode === 'likes') cmp = function (a, b) { return (num(b.like_count) - num(a.like_count)) || (num(b.reply_count) - num(a.reply_count)) || (lastTs(b) - lastTs(a)); };
    else cmp = function (a, b) { return (trendScore(b) - trendScore(a)) || (lastTs(b) - lastTs(a)); };
    return list.slice().sort(function (a, b) {
      var ap = isPinned(a) ? 1 : 0, bp = isPinned(b) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return cmp(a, b);
    });
  }

  function excerpt(t) {
    var s = String(t.content || '');
    if (!s) return '';
    s = s.replace(/\[(img|video|youtube|gif)[^\]]*\][\s\S]*?\[\/\1\]/gi, ' ')
         .replace(/\[\/?[a-z*]+(?:=[^\]]*)?\]/gi, ' ')
         .replace(/https?:\/\/\S+/gi, ' ')
         .replace(/\s+/g, ' ').trim();
    if (s.length > 170) s = s.slice(0, 170).replace(/\s+\S*$/, '') + '…';
    return s;
  }

  /* One discussion row. Keeps the thread-list contract from
     docs/forum-workflow-protocol.md: tr.frow with role=link, tabindex,
     aria-label, Enter/Space, the same showThreadDetail(id) route as the click,
     and the starter avatar in .fthread-row-avatar. */
  function rowHtml(t, opts) {
    opts = opts || {};
    var full = (A.byId && A.byId[t.id]) || null;
    if (full) { var m = {}; for (var k in full) m[k] = full[k]; for (var k2 in t) if (t[k2] != null) m[k2] = t[k2]; t = m; }
    var id = Number(t.id);
    var title = t.title || 'Thread';
    var starter = starterOf(t);
    var avatar = t.avatar_url || (t.user && (t.user.avatar_url || t.user.avatar)) || '';
    var replies = num(t.reply_count != null ? t.reply_count : t.replies);
    var views = num(t.view_count != null ? t.view_count : t.views);
    var likes = num(t.like_count);
    var pinned = isPinned(t);
    var ex = excerpt(t);
    var open = 'showThreadDetail(' + id + ')';
    var meta = 'by <b>' + forumUserLinkHtml(starter) + '</b>';
    if (t.created_at) meta += '<span class="tfa-dot">&bull;</span><span title="' + esc(formatForumStamp(t.created_at)) + '">' + esc(timeAgo(t.created_at)) + '</span>';
    meta += '<span class="tfa-dot">&bull;</span>' + plural(views, 'view', 'views');
    meta += '<span class="tfa-dot">&bull;</span>' + plural(replies, 'reply', 'replies');
    if (replies > 0 && t.last_post_username && t.last_post_at) {
      meta += '<span class="tfa-dot tfa-hide-sm">&bull;</span><span class="tfa-hide-sm">last reply by <b>' + forumUserLinkHtml(t.last_post_username) + '</b> ' + esc(timeAgo(t.last_post_at)) + '</span>';
    }
    var chip = '';
    if (opts.showCat && t.category_name) {
      chip = '<a class="tfa-chip" href="/forum/' + encodeURIComponent(t.category_slug || '') + '/" onclick="event.preventDefault();event.stopPropagation();onSidebarPick(this,\'' + esc(t.category_slug || '') + '\',\'' + esc(t.category_name) + '\')">' + esc(t.category_name) + '</a>';
    }
    var tags = '';
    if (pinned) tags += '<span class="fsticky-tag tfa-pin">' + ICON.pin + 'Pinned</span>';
    if (t.is_locked) tags += '<span class="tfa-lock">Locked</span>';
    var side = '<span class="tfa-pill" title="' + replies + (replies === 1 ? ' reply' : ' replies') + '">' + ICON.chat + '<b>' + compact(replies) + '</b></span>';
    if (likes > 0) side += '<span class="tfa-like" title="' + likes + (likes === 1 ? ' like' : ' likes') + '">' + ICON.heart + compact(likes) + '</span>';
    if (opts.hot) side += '<span class="tfa-hot" title="Trending">' + ICON.fire + '</span>';
    return '<tr class="frow tfa-row' + (pinned ? ' is-pinned' : '') + '" role="link" tabindex="0" aria-label="Open thread: ' + esc(title) + '" onclick="' + open + '" onkeydown="if(event.target===this&&(event.key===\'Enter\'||event.key===\' \')){event.preventDefault();' + open + ';}">'
      + '<td class="fcell" colspan="5"><div class="tfa-card">'
      + forumRowAvatarHtml(starter, avatar)
      + '<div class="tfa-card-body">'
      + (tags ? '<div class="tfa-tags">' + tags + '</div>' : '')
      + '<a class="fname tfa-title" href="' + esc(forumThreadUrl(id, forumThreadSlug(t))) + '" onclick="event.preventDefault();event.stopPropagation();' + open + ';">' + esc(title) + '</a>'
      + threadPagesHtml(t)
      + (ex ? '<p class="tfa-ex">' + esc(ex) + '</p>' : '')
      + '<div class="fdesc tfa-meta">' + meta + chip + '</div>'
      + '</div>'
      + '<div class="tfa-side">' + side + '</div>'
      + '</div></td></tr>';
  }

  function msgRow(inner) { return '<tr class="tfa-msgrow"><td class="fcell" colspan="5">' + inner + '</td></tr>'; }
  function skeletonRows(n) {
    var out = '';
    for (var i = 0; i < n; i++) out += '<tr class="tfa-msgrow" aria-hidden="true"><td class="fcell" colspan="5"><div class="tfa-card tfa-skel"><span class="tfa-skel-av"></span><div class="tfa-card-body"><span class="tfa-skel-l w60"></span><span class="tfa-skel-l w90"></span><span class="tfa-skel-l w40"></span></div></div></td></tr>';
    return out;
  }
  function emptyCta() {
    var loggedIn = isUserLoggedIn();
    var msg = loggedIn
      ? 'No threads here yet. Be the first to start the discussion.'
      : 'No threads here yet. Be the first to start this discussion. Log in to post.';
    var label = loggedIn ? '+ Start the First Thread' : 'Log in to Start the First Thread';
    return msgRow('<div class="fempty fempty-cta"><div class="fempty-cta-msg">' + msg + '</div>'
      + '<button type="button" class="fbtn is-primary fempty-cta-btn" onclick="openNewThread()">' + label + '</button></div>');
  }

  function listHtml(base, opts) {
    var sorted = sortThreads(base, A.sort);
    var hotIds = {};
    if (A.sort === 'trending') {
      sorted.filter(function (t) { return !isPinned(t) && (num(t.reply_count) + num(t.like_count)) > 0; })
        .slice(0, 3).forEach(function (t) { hotIds[t.id] = 1; });
    }
    var slice = sorted.slice(0, A.shown);
    var html = slice.map(function (t) { return rowHtml(t, { showCat: opts.showCat, hot: !!hotIds[t.id] }); }).join('');
    if (sorted.length > slice.length) {
      var left = sorted.length - slice.length;
      html += msgRow('<button type="button" class="tfa-more" onclick="TMRArena.more()">Show ' + Math.min(A.PAGE, left) + ' more <span>(' + left + ' remaining)</span></button>');
    }
    return html;
  }

  /* ---------- data: every discussion ---------- */
  var allGen = 0;
  A.loadAll = async function (force) {
    if (A.allState === 'loading') return;
    if (!force && A.all && (Date.now() - A.allAt) < 45000) return;
    var gen = ++allGen;
    A.allState = 'loading';
    if (!A.all) rerender();
    try {
      var out = [], pages = 1;
      for (var p = 1; p <= pages && p <= 15; p++) {
        var d = await api.request('/forum/threads?page=' + p + '&limit=100');
        if (gen !== allGen) return;
        if (!d || !Array.isArray(d.threads)) throw new Error('Malformed threads response');
        out = out.concat(d.threads);
        pages = (d.pagination && num(d.pagination.pages)) || 1;
      }
      A.all = out;
      A.byId = {};
      out.forEach(function (t) { A.byId[t.id] = t; });
      A.allAt = Date.now();
      A.allState = 'loaded';
    } catch (err) {
      if (gen !== allGen) return;
      console.warn('[Forum] discussion load failed:', err && err.message);
      A.allState = A.all ? 'loaded' : 'error';
    }
    rerender();
    renderRails();
  };

  function rerender() {
    var v = currentView();
    if (v === 'home') renderCategories();
    else if (v === 'list') renderThreads();
    updateContext();
  }
  A.more = function () { A.shown += A.PAGE; rerender(); };
  A.setSort = function (mode) {
    A.sort = mode; A.shown = A.PAGE;
    syncTabs();
    rerender();
  };

  /* ---------- render overrides ---------- */
  window.renderCategories = function () {
    var container = document.getElementById('categoriesContainer');
    if (!container) return;
    document.body.classList.toggle('forum-ready', forumLoadState === 'loaded' && categories.length > 0);
    var wrap = function (rows) { return '<table class="fgroup-table thread-table tfa-table" cellpadding="0" cellspacing="0"><tbody id="tfaHomeBody">' + rows + '</tbody></table>'; };
    if (forumLoadState === 'error') {
      container.innerHTML = '<div class="tmr-loading-state"><p>Could not load the forums right now.</p>'
        + '<p class="tmr-loading-slow" style="display:block;">The server may be warming up. Retrying automatically&hellip;</p>'
        + '<div class="tmr-loading-retry" style="display:block;"><button type="button" onclick="retryLoadCategories()">Try Again</button></div></div>';
      return;
    }
    if (forumLoadState === 'loading' && !A.all) { container.innerHTML = wrap(skeletonRows(6)); return; }
    if (forumLoadState === 'loaded' && !categories.length) { container.innerHTML = '<div class="fempty">No forum categories yet.</div>'; return; }
    if (A.allState === 'idle') { A.loadAll(); }
    if (!A.all) {
      if (A.allState === 'error') {
        container.innerHTML = '<div class="tmr-loading-state"><p>Could not load discussions right now.</p>'
          + '<div class="tmr-loading-retry" style="display:block;"><button type="button" onclick="TMRArena.loadAll(true)">Try Again</button></div></div>';
      } else container.innerHTML = wrap(skeletonRows(6));
      return;
    }
    container.innerHTML = wrap(A.all.length ? listHtml(A.all, { showCat: true }) : emptyCta());
  };

  window.renderThreads = function () {
    var body = document.getElementById('threadsBody');
    if (!body) return;
    var base = cachedThreads || [];
    /* A category view shows every discussion in the category. The category
       endpoint pages at 25, so when the full list is in memory it is used. */
    if (A.mode === 'cat' && currentCategorySlug && A.all) {
      var mine = A.all.filter(function (t) { return t.category_slug === currentCategorySlug; });
      if (mine.length >= base.length) base = mine;
    }
    /* Feed views read the latest 40 threads; with the full list in memory the
       member sees all of their own and all of their followed discussions. */
    if (A.mode === 'feed' && A.all) {
      var meU = getForumSessionUser();
      var meName = String((meU && meU.username) || '').toLowerCase();
      var feed = null;
      if (A.feedTitle === 'My Threads' && meName) feed = A.all.filter(function (t) { return String(starterOf(t)).toLowerCase() === meName; });
      else if (A.feedTitle === 'Subscribed Threads') feed = A.all.filter(function (t) { return !!(t.subscribed_by_me || t.subscribed || t.is_subscribed); });
      else if (A.feedTitle === 'New Posts') feed = A.all;
      if (feed && feed.length >= base.length) base = feed;
    }
    if (!base.length) {
      var feedEmpty = A.mode === 'feed' ? ({ 'My Threads': 'You have not started a discussion yet.', 'Subscribed Threads': 'You are not following any threads yet. Open a thread and choose Follow Thread.' })[A.feedTitle] : null;
      if (feedEmpty) body.innerHTML = msgRow('<div class="fempty fempty-cta"><div class="fempty-cta-msg">' + feedEmpty + '</div>'
        + (A.feedTitle === 'My Threads' ? '<button type="button" class="fbtn is-primary fempty-cta-btn" onclick="openNewThread()">+ Start a Discussion</button>' : '') + '</div>');
      else if (tmrfhFeedEmptyMsg) body.innerHTML = msgRow('<div class="fempty"><div class="fempty-cta-msg">' + esc(tmrfhFeedEmptyMsg) + '</div></div>');
      else body.innerHTML = emptyCta();
      updateForumJump();
      updateContext(0);
      return;
    }
    body.innerHTML = listHtml(base, { showCat: A.mode !== 'cat' });
    updateForumJump();
    updateContext(base.length);
  };

  window.performSearch = async function (query) {
    query = String(query || '').trim();
    A.mode = 'search'; A.query = query; A.shown = A.PAGE;
    currentCategorySlug = null;
    currentCategoryId = null;
    document.getElementById('viewCategories').style.display = 'none';
    document.getElementById('viewThreads').style.display = '';
    document.body.classList.remove('is-forum-home');
    document.getElementById('viewThread').style.display = 'none';
    var ua = document.getElementById('viewUserActivity'); if (ua) ua.style.display = 'none';
    setForumPageHeader('Search results');
    setActiveSidebar('');
    var bc = document.getElementById('breadcrumb');
    bc.innerHTML = '<a onclick="showCategories()">Forums</a><span class="sep">&raquo;</span><span>Search: "' + esc(query) + '"</span>';
    var input = document.getElementById('tfaSearch');
    if (input && input.value !== query) input.value = query;
    var body = document.getElementById('threadsBody');
    body.innerHTML = skeletonRows(4);
    updateContext(null);
    try {
      var data = await api.request('/forum/search?q=' + encodeURIComponent(query));
      if (A.mode !== 'search' || A.query !== query) return;
      cachedThreads = (data && data.results) || [];
      tmrfhFeedEmptyMsg = 'No threads match your search.';
      renderThreads();
    } catch (err) {
      body.innerHTML = msgRow('<div class="fempty"><div class="fempty-cta-msg">Search failed. Please try again.</div></div>');
      console.error('Search error:', err);
    }
  };

  window.renderForumSidebar = function () {
    var list = document.getElementById('forumSidebarList');
    if (!list) return;
    if (forumLoadState === 'loading') { list.innerHTML = '<a class="fside-loading">Loading forums&hellip;</a>'; return; }
    if (forumLoadState === 'error') {
      list.innerHTML = '<a class="fside-loading" style="cursor:pointer;text-decoration:underline;" onclick="retryLoadCategories()">Couldn\'t load - retry</a>';
      return;
    }
    var cats = categories || [];
    if (!cats.length) { list.innerHTML = '<a class="fside-loading">No forums yet</a>'; return; }
    var total = 0;
    cats.forEach(function (c) { total += num(c.thread_count); });
    var html = '<a class="fside-forum tfa-cat tfa-cat-all" data-cat-slug="sports-betting" href="/forum/" onclick="event.preventDefault();showCategories();">'
      + '<span class="tfa-cat-ico">' + ICON.chat + '</span><span class="tfa-cat-name">All Discussions</span><b>' + compact(total) + '</b></a>';
    groupCategoriesForDisplay().forEach(function (group) {
      group.categories.forEach(function (c) {
        var slug = String(c.slug || ''), name = c.name || slug || 'Forum';
        html += '<a class="fside-forum tfa-cat" data-cat-slug="' + esc(slug) + '" href="/forum/' + encodeURIComponent(slug) + '/" title="' + esc(c.description || name) + '"'
          + ' onclick="event.preventDefault();onSidebarPick(this,\'' + esc(slug) + '\',\'' + esc(name) + '\')">'
          + '<span class="tfa-cat-ico">' + esc(c.icon || '💬') + '</span><span class="tfa-cat-name">' + esc(name) + '</span><b>' + compact(c.thread_count) + '</b></a>';
      });
    });
    list.innerHTML = html;
    try { if (window.twemoji) twemoji.parse(list, { folder: 'svg', ext: '.svg' }); } catch (e) {}
    setActiveSidebar(currentCategorySlug || (currentView() === 'home' ? 'sports-betting' : ''));
  };

  /* ---------- mode tracking (wraps, never replaces, the routers) ---------- */
  function wrap(name, before) {
    var orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      try { before.apply(null, arguments); } catch (e) {}
      return orig.apply(this, arguments);
    };
  }
  wrap('showCategories', function () {
    A.mode = 'home'; A.query = ''; A.shown = A.PAGE; clearSearchBox();
    var ua = document.getElementById('viewUserActivity'); if (ua) ua.style.display = 'none';
    A.loadAll();
  });
  wrap('showThreadsList', function () {
    A.mode = 'cat'; A.query = ''; A.shown = A.PAGE; clearSearchBox();
    var ua = document.getElementById('viewUserActivity'); if (ua) ua.style.display = 'none';
    if (A.allState === 'idle') A.loadAll();
  });
  wrap('tmrfhShowThreadFeed', function (title) {
    A.mode = 'feed'; A.feedTitle = title || ''; A.query = ''; A.shown = A.PAGE; clearSearchBox();
    setActiveSidebar('');
    var ua = document.getElementById('viewUserActivity'); if (ua) ua.style.display = 'none';
  });
  (function () {
    var orig = window.showThreadDetail;
    if (typeof orig !== 'function') return;
    window.showThreadDetail = async function () {
      var ua = document.getElementById('viewUserActivity'); if (ua) ua.style.display = 'none';
      var out = await orig.apply(this, arguments);
      /* Light the open thread's own category in the rail. */
      try {
        var slug = (typeof cachedThread !== 'undefined' && cachedThread && cachedThread.category_slug) || currentCategorySlug || '';
        if (currentView() === 'thread') setActiveSidebar(slug);
        /* The H1 names the open thread on in-app navigation too, as it
           already does on a direct /forum/thread/<id>/<slug>/ load. */
        var h1 = document.getElementById('forumPageTitle');
        if (h1 && currentThreadTitle && currentView() === 'thread') h1.textContent = currentThreadTitle;
      } catch (e) {}
      return out;
    };
  })();
  function clearSearchBox() { var i = document.getElementById('tfaSearch'); if (i) i.value = ''; syncSearchClear(); }

  /* ---------- chrome ---------- */
  function currentView() {
    var shown = function (id) { var el = document.getElementById(id); return !!el && el.style.display !== 'none'; };
    if (shown('viewThread')) return 'thread';
    if (shown('viewUserActivity')) return 'user';
    if (shown('viewThreads')) return 'list';
    return 'home';
  }
  function syncView() {
    var v = currentView(), cl = document.body.classList;
    ['home', 'list', 'thread', 'user'].forEach(function (k) { cl.toggle('tfa-v-' + k, k === v); });
    updateContext();
    syncBrowse();
  }

  function updateContext(count) {
    var el = document.getElementById('tfaContext');
    if (!el) return;
    var v = currentView();
    if (v !== 'home' && v !== 'list') { el.innerHTML = ''; return; }
    var title, sub = '', n = null, clear = '', more = '';
    if (v === 'home') {
      title = 'All Discussions';
      n = A.all ? A.all.length : null;
    } else if (A.mode === 'search') {
      title = 'Search: “' + A.query + '”';
      n = (count == null) ? null : count;
      clear = '<button type="button" class="tfa-clear" onclick="showCategories()">Clear search</button>';
    } else if (A.mode === 'cat') {
      var cat = (categories || []).find(function (c) { return c.slug === currentCategorySlug; });
      title = (cat && cat.name) || currentCategoryName || 'Forum';
      sub = (cat && cat.description) || '';
      n = (count != null) ? count : (cat ? num(cat.thread_count) : null);
      /* Same totals the classic directory printed for each forum: threads,
         posts (openers + replies, see POST_COUNT_MAPPING_20260812) and the
         latest thread. */
      if (cat) {
        var cPosts = num(cat.thread_count) + num(cat.post_count);
        more = '<span class="tfa-context-n">' + plural(cPosts, 'post', 'posts') + '</span>';
        if (cat.latest_thread && cat.latest_thread.id) {
          var lt = cat.latest_thread;
          more += '<p class="tfa-context-sub tfa-context-last">Latest: <a href="' + esc(forumThreadUrl(lt.id, forumThreadSlug(lt))) + '" onclick="event.preventDefault();showThreadDetail(' + Number(lt.id) + ');">' + esc(lt.title || '') + '</a> by ' + forumUserLinkHtml(lt.username || '') + ', ' + esc(formatForumStamp(lt.last_post_at || lt.created_at)) + '</p>';
        }
      }
    } else {
      title = A.feedTitle || 'Threads';
      n = (count == null) ? null : count;
    }
    el.innerHTML = (n != null ? '<span class="tfa-context-n">' + plural(n, A.mode === 'search' && v === 'list' ? 'result' : 'discussion', A.mode === 'search' && v === 'list' ? 'results' : 'discussions') + '</span>' : '')
      + clear
      + (sub ? '<p class="tfa-context-sub">' + esc(sub) + '</p>' : '')
      + more;
  }

  function syncTabs() {
    var tabs = document.querySelectorAll('#tfaToolbar [data-sort]');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-sort') === A.sort;
      tabs[i].classList.toggle('is-active', on);
      tabs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
  function syncSearchClear() {
    var i = document.getElementById('tfaSearch'), x = document.getElementById('tfaSearchX');
    if (i && x) x.hidden = !i.value;
  }
  function syncBrowse() {
    var links = document.querySelectorAll('#tfaBrowse [data-feed]');
    var v = currentView();
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('is-active', v === 'list' && A.mode === 'feed' && links[i].getAttribute('data-feed') === A.feedTitle);
    }
  }

  var searchTimer = null;
  A.onSearchInput = function (input) {
    syncSearchClear();
    clearTimeout(searchTimer);
    var q = input.value.trim();
    if (!q) { if (A.mode === 'search') showCategories(); return; }
    if (q.length < 3) return;
    searchTimer = setTimeout(function () { performSearch(q); }, 400);
  };
  A.onSearchSubmit = function (e) {
    if (e) e.preventDefault();
    clearTimeout(searchTimer);
    var i = document.getElementById('tfaSearch');
    var q = i ? i.value.trim() : '';
    var hint = document.getElementById('tfaSearchHint');
    if (q.length < 3) { if (hint) hint.hidden = false; return false; }
    if (hint) hint.hidden = true;
    performSearch(q);
    return false;
  };
  A.clearSearch = function () {
    var i = document.getElementById('tfaSearch');
    if (i) { i.value = ''; i.focus(); }
    var hint = document.getElementById('tfaSearchHint'); if (hint) hint.hidden = true;
    syncSearchClear();
    if (A.mode === 'search') showCategories();
  };

  function buildChrome() {
    var shell = document.querySelector('.fshell');
    var main = document.querySelector('.fmain');
    var side = document.querySelector('.fside');
    if (!shell || !main || !side || document.getElementById('tfaHero')) return;

    var hero = document.createElement('section');
    hero.id = 'tfaHero';
    hero.className = 'tfa-hero';
    hero.setAttribute('aria-label', 'Community Forum');
    hero.innerHTML = '<div class="tfa-hero-in"><div class="tfa-hero-copy">'
      + '<p class="tfa-hero-title">Community <span>Forum</span></p>'
      + '<p class="tfa-hero-tag">Discuss <i>&bull;</i> Share <i>&bull;</i> Debate <i>&bull;</i> Win Together</p>'
      + '</div><div class="tfa-hero-art" aria-hidden="true"></div></div>';
    shell.parentNode.insertBefore(hero, shell);

    var bar = document.createElement('div');
    bar.innerHTML = '<div class="tfa-toolbar" id="tfaToolbar">'
      + '<div class="tfa-tabs" role="group" aria-label="Sort discussions">'
      + '<button type="button" class="tfa-tab" data-sort="trending" onclick="TMRArena.setSort(\'trending\')">' + ICON.fire + 'Trending</button>'
      + '<button type="button" class="tfa-tab" data-sort="latest" onclick="TMRArena.setSort(\'latest\')">' + ICON.clock + 'Latest</button>'
      + '<button type="button" class="tfa-tab" data-sort="replies" onclick="TMRArena.setSort(\'replies\')">Most Replies</button>'
      + '<button type="button" class="tfa-tab" data-sort="likes" onclick="TMRArena.setSort(\'likes\')">Most Likes</button>'
      + '</div>'
      + '<form class="tfa-search" role="search" onsubmit="return TMRArena.onSearchSubmit(event)">'
      + '<label class="tfa-sr" for="tfaSearch">Search discussions</label>' + ICON.search
      + '<input type="search" id="tfaSearch" placeholder="Search discussions..." autocomplete="off" oninput="TMRArena.onSearchInput(this)">'
      + '<button type="button" class="tfa-search-x" id="tfaSearchX" aria-label="Clear search" hidden onclick="TMRArena.clearSearch()">&times;</button>'
      + '<span class="tfa-search-hint" id="tfaSearchHint" role="status" hidden>Type at least 3 characters</span>'
      + '</form></div>'
      + '<div class="tfa-headrow" id="tfaHeadrow"><div class="tfa-context" id="tfaContext" aria-live="polite"></div></div>';
    while (bar.firstChild) main.insertBefore(bar.firstChild, document.getElementById('viewCategories'));
    /* The page's single H1 (.ftitle, written by setForumPageHeader) leads the
       head row, so the visible section title IS the H1. */
    var ftitle = main.querySelector('.ftitle');
    var headrow = document.getElementById('tfaHeadrow');
    if (ftitle && headrow) headrow.insertBefore(ftitle, headrow.firstChild);

    var np = document.createElement('button');
    np.type = 'button';
    np.className = 'tfa-newpost';
    np.id = 'tfaNewPost';
    np.innerHTML = ICON.plus + '<span>New Post</span>';
    np.onclick = function () { openNewThread(); };
    side.insertBefore(np, side.firstChild);

    var boxes = side.querySelectorAll('.fside-box');
    if (boxes[0]) { boxes[0].classList.add('tfa-box-cats'); var h = boxes[0].querySelector('.fside-head'); if (h) h.textContent = 'Discussions'; }
    if (boxes[1]) boxes[1].classList.add('tfa-box-site');

    var extra = document.createElement('div');
    extra.className = 'tfa-side-extra';
    extra.innerHTML = '<section class="fside-box tfa-box-browse" id="tfaBrowse"><div class="fside-head">Browse</div><div class="fside-list">'
      + '<a href="/forum/?view=new" data-feed="New Posts" onclick="event.preventDefault();showNewPosts();">New Posts</a>'
      + '<a href="/forum/" data-feed="Subscribed Threads" onclick="event.preventDefault();showSubscribed();">Subscribed Threads</a>'
      + '<a href="/forum/" data-feed="My Threads" onclick="event.preventDefault();showMyThreads();">My Threads</a>'
      + '<a href="/forum/" onclick="event.preventDefault();showRules();">Forum Rules</a>'
      + '<a href="/usercp/">User Control Panel</a>'
      + '<a href="/messages/">Messages</a>'
      + '<a href="/chat/">Chat</a>'
      + '<a href="/sports-talk/">Sports Talk</a>'
      + '</div></section>'
      + '<section class="tfa-widget tfa-stats" id="tfaStats" aria-label="Your stats"></section>'
      + '<section class="tfa-join"><h3>Join the Conversation</h3><p>Share your picks, discuss the latest odds, and connect with the TMR community!</p>'
      + '<button type="button" class="tfa-btn" onclick="openNewThread()">Start a Discussion ' + ICON.arrow + '</button></section>';
    side.insertBefore(extra, boxes[1] || null);

    var right = document.createElement('aside');
    right.className = 'tfa-right';
    right.id = 'tfaRight';
    right.setAttribute('aria-label', 'Community highlights');
    right.innerHTML = '<section class="tfa-widget" id="tfaTrending" hidden></section>'
      + '<section class="tfa-widget" id="tfaContrib" hidden></section>'
      + '<div id="tfaStatSlot"></div>'
      + '<a class="tfa-promo" href="/"><span class="tfa-promo-mark">' + ICON.shield + '</span>'
      + '<span class="tfa-promo-txt"><b>Trust <i>My</i> Record</b><span>The Most Complete Sports Info &amp; Community in the Industry</span>'
      + '<em>Explore More ' + ICON.arrow + '</em></span></a>';
    shell.appendChild(right);
    var stat = document.getElementById('forumStatBlock');
    if (stat) document.getElementById('tfaStatSlot').appendChild(stat);

    ['viewCategories', 'viewThreads', 'viewThread', 'viewUserActivity'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && window.MutationObserver) new MutationObserver(syncView).observe(el, { attributes: true, attributeFilter: ['style'] });
    });
    window.addEventListener('tmr-auth-changed', function () { setTimeout(renderRails, 0); });
    syncTabs();
    syncView();
    renderRails();
  }

  /* ---------- rails (real data only) ---------- */
  function contributors() {
    var map = {};
    (A.all || []).forEach(function (t) {
      var u = starterOf(t);
      if (!forumProfileHref(u)) return;
      var k = u.toLowerCase();
      if (!map[k]) map[k] = { username: u, avatar: t.avatar_url || '', threads: 0, likes: 0, replies: 0 };
      map[k].threads += 1;
      map[k].likes += num(t.like_count);
      map[k].replies += num(t.reply_count);
      if (!map[k].avatar && t.avatar_url) map[k].avatar = t.avatar_url;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      return (b.threads - a.threads) || (b.replies - a.replies) || a.username.localeCompare(b.username);
    });
  }

  function renderRails() {
    var tr = document.getElementById('tfaTrending');
    var co = document.getElementById('tfaContrib');
    var st = document.getElementById('tfaStats');
    if (!tr || !co || !st) return;
    var all = A.all || [];

    var hot = sortThreads(all.filter(function (t) { return !isPinned(t); }), 'trending').slice(0, 5);
    if (hot.length) {
      tr.hidden = false;
      tr.innerHTML = '<h3 class="tfa-widget-h">' + ICON.fire + 'Trending Topics</h3><ol class="tfa-rank">'
        + hot.map(function (t, i) {
          return '<li><span class="tfa-rank-n">' + (i + 1) + '</span><a href="' + esc(forumThreadUrl(t.id, forumThreadSlug(t))) + '" onclick="event.preventDefault();showThreadDetail(' + Number(t.id) + ');" title="' + esc(t.title) + '">' + esc(t.title) + '</a></li>';
        }).join('') + '</ol>';
    } else { tr.hidden = true; tr.innerHTML = ''; }

    var ranks = contributors();
    var top = ranks.slice(0, 5);
    if (top.length) {
      co.hidden = false;
      co.innerHTML = '<h3 class="tfa-widget-h">' + ICON.trophy + 'Top Contributors</h3><ol class="tfa-contrib">'
        + top.map(function (c, i) {
          return '<li><span class="tfa-contrib-n n' + (i + 1) + '">' + (i + 1) + '</span>' + forumRowAvatarHtml(c.username, c.avatar)
            + '<span class="tfa-contrib-name">' + forumUserLinkHtml(c.username) + '</span>'
            + '<span class="tfa-contrib-v" title="' + c.threads + ' discussions started">' + ICON.chat + compact(c.threads) + '</span></li>';
        }).join('') + '</ol><p class="tfa-widget-foot">Ranked by discussions started</p>';
    } else { co.hidden = true; co.innerHTML = ''; }

    var loggedIn = isUserLoggedIn();
    var u = loggedIn ? getForumSessionUser() : null;
    var uname = u && u.username ? String(u.username) : '';
    if (!loggedIn || !uname) {
      st.innerHTML = '<h3 class="tfa-widget-h">Your Stats</h3><p class="tfa-stats-out">Log in to track your discussions, likes and contributor rank.</p>'
        + '<div class="tfa-stats-cta"><a class="tfa-btn" href="/login/">Log In</a><a class="tfa-btn is-ghost" href="/register/">Register</a></div>';
      return;
    }
    var me = null, pos = 0;
    for (var i = 0; i < ranks.length; i++) { if (ranks[i].username.toLowerCase() === uname.toLowerCase()) { me = ranks[i]; pos = i + 1; break; } }
    var ready = !!A.all;
    var cell = function (icon, value, label) { return '<div class="tfa-stat"><b>' + icon + '<span>' + value + '</span></b><small>' + label + '</small></div>'; };
    st.innerHTML = '<h3 class="tfa-widget-h">Your Stats</h3><div class="tfa-stat-row">'
      + cell(ICON.chat, ready ? compact(me ? me.threads : 0) : '&ndash;', 'Discussions')
      + cell(ICON.heart, ready ? compact(me ? me.likes : 0) : '&ndash;', 'Likes')
      + cell(ICON.trophy, ready ? (pos ? '#' + pos : '&ndash;') : '&ndash;', 'Contributor Rank')
      + '</div><a class="tfa-stats-link" href="/forum/?user=' + encodeURIComponent(uname) + '" onclick="event.preventDefault();showUserActivity(\'' + esc(uname).replace(/'/g, '') + '\');">View my forum activity ' + ICON.arrow + '</a>';
  }
  A.renderRails = renderRails;

  /* Deep links (a thread, a member's activity) boot without the home view, so
     the rails would stay empty. Fill them once the page has settled. */
  window.addEventListener('load', function () {
    setTimeout(function () {
      try {
        if (forumLoadState === 'loading' && !categories.length && typeof _forumLoadGen !== 'undefined' && _forumLoadGen === 0) loadCategories();
      } catch (e) {}
      if (A.allState === 'idle') A.loadAll();
    }, 600);
  });

  /* The shell markup sits above this script tag, so the chrome is built now,
     before the app's DOMContentLoaded boot paints its first view. */
  buildChrome();
  if (!document.getElementById('tfaHero')) document.addEventListener('DOMContentLoaded', buildChrome);
})();
