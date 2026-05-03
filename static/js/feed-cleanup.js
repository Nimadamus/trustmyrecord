(function () {
  "use strict";

  let cleanupFilter = "all";
  let cleanupPostType = "status";
  let cleanupOffset = 0;
  const LIMIT = 20;
  const LOCAL_KEY = "tmr_feed_local_interactions_v1";

  function currentUser() {
    return (window.auth && window.auth.currentUser) || null;
  }

  function apiReady() {
    return window.api && typeof window.api.request === "function";
  }

  function esc(value) {
    const d = document.createElement("div");
    d.textContent = value == null ? "" : String(value);
    return d.innerHTML;
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim()) {
      return value.replace(/[{}"]/g, "").split(",").map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  function timeAgo(dateStr) {
    const then = new Date(dateStr || Date.now()).getTime();
    const diff = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m";
    if (diff < 86400) return Math.floor(diff / 3600) + "h";
    if (diff < 604800) return Math.floor(diff / 86400) + "d";
    return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function initials(item) {
    return String(item.display_name || item.username || "?").slice(0, 1).toUpperCase();
  }

  function displayName(item) {
    return esc(item.display_name || item.username || "User");
  }

  function profileBadge(item) {
    const teams = asArray(item.favorite_teams);
    if (!teams.length) return "";
    return `<span class="profile-badge"><i class="fas fa-shield-alt"></i>${esc(teams[0])}</span>`;
  }

  function recordSummary(item) {
    const wins = Number(item.record_wins || 0);
    const losses = Number(item.record_losses || 0);
    const pushes = Number(item.record_pushes || 0);
    const total = wins + losses + pushes;
    if (!total) return "";
    const wr = total ? Math.round((wins / total) * 100) : 0;
    return `<div class="record-strip">
      <span><b>${wins}-${losses}-${pushes}</b> record</span>
      <span><b>${wr}%</b> win rate</span>
    </div>`;
  }

  function getLocal() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function setLocal(data) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  }

  function localState(id) {
    const data = getLocal();
    return data[id] || { liked: false, likes: 0, comments: [] };
  }

  function localActions(item) {
    const id = String(item.item_id);
    const state = localState(id);
    return `<div class="fi-actions">
      <button class="fi-action ${state.liked ? "is-liked" : ""}" onclick="likeLocalFeedItem('${esc(id)}', this)"><i class="fas fa-heart"></i><span>${state.likes}</span></button>
      <button class="fi-action" onclick="toggleLocalComments('${esc(id)}')"><i class="fas fa-comment"></i><span>${state.comments.length}</span></button>
      <button class="fi-action" onclick="sharePost('${esc(id)}', event)"><i class="fas fa-share"></i>Share</button>
    </div>
    <div class="comments-section" id="local-comments-${esc(id)}"></div>`;
  }

  function postActions(item, kind) {
    const id = String(item.item_id || item.poll_id);
    const liked = item.liked_by_user ? "is-liked" : "";
    const likeFn = kind === "feed_post" ? `likeFeedPost('${esc(id)}', this)` : `likeLocalFeedItem('${esc(id)}', this)`;
    const commentsFn = kind === "feed_post" ? `toggleComments('${esc(id)}','feed_post')` : `toggleLocalComments('${esc(id)}')`;
    return `<div class="fi-actions">
      <button class="fi-action ${liked}" onclick="${likeFn}"><i class="fas fa-heart"></i><span>${Number(item.likes_count || 0)}</span></button>
      <button class="fi-action" onclick="${commentsFn}"><i class="fas fa-comment"></i><span>${Number(item.comments_count || 0)}</span></button>
      <button class="fi-action" onclick="sharePost('${esc(id)}', event)"><i class="fas fa-share"></i>Share</button>
    </div>
    <div class="comments-section" id="${kind === "feed_post" ? "cs-fp-" : "local-comments-"}${esc(id)}"></div>`;
  }

  function header(item, iconHtml) {
    const username = item.username || "";
    return `<div class="fi-header">
      <div class="fi-avatar">${iconHtml || initials(item)}</div>
      <div class="fi-meta">
        <div class="fi-top-row">
          <span class="fi-name"><a href="/profile/?user=${encodeURIComponent(username)}">${displayName(item)}</a></span>
          ${username ? `<span class="fi-handle">@${esc(username)}</span>` : ""}
          <span class="fi-dot">&bull;</span>
          <span class="fi-time">${timeAgo(item.created_at)}</span>
        </div>
        <div class="fi-badge-row">${profileBadge(item)}</div>
      </div>
    </div>`;
  }

  function renderTextPost(item) {
    const type = item.post_type || "status";
    const labels = {
      text: "Status",
      status: "Status",
      hot_take: "Hot take",
      article: "Article",
      link: "Link",
      pick_recap: "Pick recap"
    };
    const icon = {
      hot_take: '<i class="fas fa-fire"></i>',
      article: '<i class="fas fa-newspaper"></i>',
      link: '<i class="fas fa-link"></i>',
      pick_recap: '<i class="fas fa-clipboard-check"></i>'
    }[type] || initials(item);
    const label = labels[type] || "Status";
    const link = type === "link" ? findFirstUrl(item.content) : null;
    return `<article class="feed-item" data-id="${esc(item.item_id)}" data-type="feed_post">
      ${header(item, icon)}
      <div class="activity-line">${displayName(item)} posted a ${esc(label.toLowerCase())}</div>
      <div class="fi-content">${esc(item.content || "")}</div>
      ${link ? `<a class="link-preview" href="${esc(link)}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i>${esc(link)}</a>` : ""}
      ${postActions(item, "feed_post")}
    </article>`;
  }

  function renderPickActivity(item) {
    const count = Number(item.activity_count || 1);
    const user = displayName(item);
    const graded = item.post_type === "graded_pick_summary";
    const text = graded
      ? `${user} had ${count} pick${count === 1 ? "" : "s"} graded today`
      : `${user} submitted ${count === 1 ? "a pick" : count + " picks"}`;
    const detail = graded
      ? `${Number(item.wins_count || 0)} won, ${Number(item.losses_count || 0)} lost, ${Number(item.pushes_count || 0)} push`
      : "Pick details stay hidden until graded and public eligible.";
    return `<article class="feed-item" data-id="${esc(item.item_id)}" data-type="pick_activity">
      ${header(item, graded ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-lock"></i>')}
      <div class="activity-line">${text}</div>
      <div class="pick-embed privacy-safe">
        <div class="pe-row">
          <span class="pe-chip ${graded ? "is-won" : "is-sport"}">${graded ? "GRADED SUMMARY" : "PENDING DETAILS HIDDEN"}</span>
          <span class="pe-chip">${esc(detail)}</span>
        </div>
        ${recordSummary(item)}
      </div>
      ${localActions(item)}
    </article>`;
  }

  function renderPoll(item) {
    const opts = Array.isArray(item.options) ? item.options : [];
    return `<article class="feed-item" data-id="${esc(item.item_id || item.poll_id)}" data-type="poll">
      ${header(item, '<i class="fas fa-poll"></i>')}
      <div class="activity-line">${displayName(item)} created a poll</div>
      <div class="fi-content">${esc(item.content || item.title || "Poll")}</div>
      <div class="poll-options">
        ${opts.map(o => `<button class="poll-option" onclick="votePoll('${esc(item.poll_id || item.item_id)}','${esc(o.id)}')">${esc(o.text || o.option_text || "")}</button>`).join("")}
      </div>
      ${postActions(item, "poll")}
    </article>`;
  }

  function renderItem(item) {
    if (!item) return "";
    if (item.item_type === "pick_activity" || item.post_type === "submitted_picks_summary" || item.post_type === "graded_pick_summary") {
      return renderPickActivity(item);
    }
    if (item.item_type === "poll" || item.post_type === "poll") return renderPoll(item);
    if (item.item_type === "pick" || item.post_type === "pick" || item.post_type === "pick_share") {
      const safe = { ...item, item_type: "pick_activity", post_type: item.pick_status === "pending" ? "submitted_picks_summary" : "graded_pick_summary", activity_count: 1 };
      delete safe.pick_selection;
      delete safe.pick_market_type;
      delete safe.pick_odds;
      delete safe.pick_line;
      delete safe.pick_home_team;
      delete safe.pick_away_team;
      return renderPickActivity(safe);
    }
    return renderTextPost(item);
  }

  function findFirstUrl(text) {
    const match = String(text || "").match(/https?:\/\/[^\s]+/i);
    return match ? match[0] : "";
  }

  function composerControls() {
    const actions = document.querySelector(".composer-actions");
    if (!actions || actions.dataset.feedCleanup === "1") return;
    actions.dataset.feedCleanup = "1";
    actions.innerHTML = `
      <button class="composer-action is-active" data-post-type="status" onclick="toggleType('status')"><i class="fas fa-comment-dots"></i> Status</button>
      <button class="composer-action" data-post-type="hot_take" onclick="toggleType('hot_take')"><i class="fas fa-fire"></i> Hot Take</button>
      <button class="composer-action" data-post-type="article" onclick="toggleType('article')"><i class="fas fa-newspaper"></i> Article</button>
      <button class="composer-action" data-post-type="link" onclick="toggleType('link')"><i class="fas fa-link"></i> Link</button>
      <button class="composer-action" data-post-type="poll" onclick="toggleType('poll')"><i class="fas fa-poll"></i> Poll</button>
      <button class="composer-action" data-post-type="pick_recap" onclick="toggleType('pick_recap')"><i class="fas fa-clipboard-check"></i> Recap</button>
      <select class="composer-sport" id="sportPick">
        <option value="">Sport</option><option value="NFL">NFL</option><option value="NBA">NBA</option><option value="MLB">MLB</option><option value="NHL">NHL</option><option value="NCAAB">NCAAB</option><option value="NCAAF">NCAAF</option><option value="Soccer">Soccer</option>
      </select>`;
  }

  window.initAuth = async function initAuth() {
    if (window.api && window.api.ready) {
      try { await window.api.ready; } catch (_) {}
    }
    const user = currentUser();
    const card = document.getElementById("composerCard");
    const avatar = document.getElementById("compAvatar");
    if (card) card.style.display = user ? "block" : "none";
    if (avatar && user) avatar.textContent = String(user.displayName || user.username || "?").slice(0, 1).toUpperCase();
    composerControls();
    const input = document.getElementById("compInput");
    const postBtn = document.getElementById("postBtn");
    if (input && postBtn) {
      input.addEventListener("input", () => { postBtn.disabled = input.value.trim().length === 0; });
    }
  };

  window.toggleType = function toggleType(type) {
    cleanupPostType = type === "post" ? "status" : type;
    document.querySelectorAll(".composer-action").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.postType === cleanupPostType);
    });
    const pb = document.getElementById("pollBuilder");
    if (pb) pb.classList.toggle("is-shown", cleanupPostType === "poll");
    const input = document.getElementById("compInput");
    if (input) {
      input.placeholder = {
        hot_take: "Post a hot take...",
        article: "Write a longer article or blog-style post...",
        link: "Paste a link and add context...",
        poll: "Ask a poll question...",
        pick_recap: "Recap your public graded picks..."
      }[cleanupPostType] || "What's your take?";
    }
  };

  window.addPollOpt = function addPollOpt() {
    const c = document.getElementById("pollOpts");
    if (!c || c.children.length >= 6) return;
    const row = document.createElement("div");
    row.className = "poll-row";
    row.innerHTML = `<input class="poll-input" placeholder="Option ${c.children.length + 1}" maxlength="60"><button class="poll-rm" onclick="rmPollOpt(this)"><i class="fas fa-times"></i></button>`;
    c.appendChild(row);
  };

  window.rmPollOpt = function rmPollOpt(btn) {
    const c = document.getElementById("pollOpts");
    if (c && c.children.length > 2) btn.closest(".poll-row").remove();
  };

  window.submitPost = async function submitPost() {
    const input = document.getElementById("compInput");
    const btn = document.getElementById("postBtn");
    const content = input ? input.value.trim() : "";
    if (!content || !apiReady()) return;
    btn.disabled = true;
    btn.textContent = "Posting...";
    try {
      const sport = (document.getElementById("sportPick") || {}).value || null;
      if (cleanupPostType === "poll") {
        const opts = Array.from(document.querySelectorAll("#pollOpts .poll-input")).map(i => i.value.trim()).filter(Boolean);
        if (opts.length < 2) throw new Error("Need at least 2 poll options.");
        await window.api.request("/polls", { method: "POST", body: { title: content, options: opts.map(text => ({ text })), sport: sport || undefined } });
      } else {
        await window.api.request("/feed", { method: "POST", body: { content, post_type: cleanupPostType, sport } });
      }
      input.value = "";
      window.toggleType("status");
      cleanupOffset = 0;
      await window.loadFeed();
    } catch (error) {
      alert(error.message || "Failed to post");
    } finally {
      btn.textContent = "Post";
      btn.disabled = true;
    }
  };

  window.loadFeed = async function loadFeed() {
    const list = document.getElementById("feedList");
    if (!list || !apiReady()) return;
    list.innerHTML = '<div class="tmr-loading-state"><div class="tmr-spinner"></div><p>Loading feed...</p></div>';
    try {
      const filterParam = cleanupFilter === "hot-takes" ? "posts" : cleanupFilter;
      const data = await window.api.request(`/feed?limit=${LIMIT}&offset=${cleanupOffset}&filter=${encodeURIComponent(filterParam)}`);
      let items = Array.isArray(data.feed) ? data.feed : [];
      if (cleanupFilter === "polls" || cleanupFilter === "all") {
        try {
          const pollData = await window.api.request("/polls/active?limit=5");
          const polls = (pollData.polls || []).map(p => ({
            item_type: "poll",
            post_type: "poll",
            item_id: "poll_" + p.id,
            poll_id: p.id,
            content: p.title,
            username: p.creator_username || p.username,
            display_name: p.creator_display_name || p.display_name || p.username,
            avatar_url: p.avatar_url,
            favorite_teams: p.favorite_teams,
            created_at: p.created_at,
            options: p.options || [],
            likes_count: 0,
            comments_count: Number(p.comments_count || 0)
          }));
          const seen = new Set(items.map(i => String(i.item_id)));
          polls.forEach(p => { if (!seen.has(String(p.item_id))) items.push(p); });
        } catch (_) {}
      }
      if (cleanupFilter === "hot-takes") items = items.filter(i => i.post_type === "hot_take");
      items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      if (!items.length) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-stream"></i><h3>Your feed is ready.</h3><p>Public posts and privacy-safe pick activity will appear here as users participate.</p></div>';
      } else {
        list.innerHTML = items.map(renderItem).join("");
      }
      const more = document.getElementById("loadMore");
      if (more) more.style.display = items.length >= LIMIT ? "block" : "none";
    } catch (error) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-database"></i><h3>Feed unavailable</h3><p>${esc(error.message || "Live feed data is not available right now.")}</p></div>`;
    }
  };

  window.setFilter = function setFilter(filter, btn) {
    cleanupFilter = filter;
    cleanupOffset = 0;
    document.querySelectorAll(".feed-tab").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    window.loadFeed();
  };

  window.loadMorePosts = function loadMorePosts() {
    cleanupOffset += LIMIT;
    window.loadFeed();
  };

  window.loadTrending = async function loadTrending() {
    const el = document.getElementById("trendingList");
    if (el && !el.textContent.trim()) el.innerHTML = '<div class="rs-empty">Trending picks will appear here once real users start posting plays.</div>';
  };

  window.loadSuggested = async function loadSuggested() {
    const el = document.getElementById("suggestedList");
    if (el && !el.textContent.trim()) el.innerHTML = '<div class="rs-empty">Suggested users will appear here as the community grows.</div>';
  };

  window.loadTopCappers = async function loadTopCappers() {
    const el = document.getElementById("topCappersList");
    if (el && !el.textContent.trim()) el.innerHTML = '<div class="rs-empty">Top Cappers will appear once verified public records are created.</div>';
  };

  window.loadArenaWatch = async function loadArenaWatch() {
    const el = document.getElementById("arenaWatchList");
    if (el && !el.textContent.trim()) el.innerHTML = '<div class="rs-empty">Challenge results and live arena battles will appear here once users start competing.</div>';
  };

  window.loadNotificationBadge = async function loadNotificationBadge() {};

  window.likeFeedPost = async function likeFeedPost(id, btn) {
    const user = currentUser();
    if (!user) return alert("Log in to like posts.");
    const liked = btn.classList.contains("is-liked");
    const data = await window.api.request(`/feed/${encodeURIComponent(id)}/like`, { method: liked ? "DELETE" : "POST" });
    btn.classList.toggle("is-liked", !liked);
    const span = btn.querySelector("span");
    if (span) span.textContent = Number(data.likes_count || 0);
  };

  window.likeLocalFeedItem = function likeLocalFeedItem(id, btn) {
    const data = getLocal();
    const state = data[id] || { liked: false, likes: 0, comments: [] };
    state.liked = !state.liked;
    state.likes = Math.max(0, Number(state.likes || 0) + (state.liked ? 1 : -1));
    data[id] = state;
    setLocal(data);
    btn.classList.toggle("is-liked", state.liked);
    const span = btn.querySelector("span");
    if (span) span.textContent = state.likes;
  };

  window.toggleComments = async function toggleComments(id) {
    const el = document.getElementById(`cs-fp-${id}`);
    if (!el) return;
    if (el.classList.toggle("is-shown") === false) return;
    el.innerHTML = '<div class="cmt-loading">Loading comments...</div>';
    const data = await window.api.request(`/feed/${encodeURIComponent(id)}/comments`);
    renderServerComments(id, data.comments || []);
  };

  function renderServerComments(id, comments) {
    const el = document.getElementById(`cs-fp-${id}`);
    if (!el) return;
    const user = currentUser();
    const input = user ? `<div class="cmt-input-row"><input class="cmt-input" id="ci-feed_post-${esc(id)}" placeholder="Write a comment..."><button class="cmt-submit" onclick="postComment('${esc(id)}','feed_post')">Post</button></div>` : "";
    el.innerHTML = input + comments.map(c => commentHtml(c, id)).join("") || input + '<div class="cmt-empty">No comments yet</div>';
  }

  function commentHtml(c, id) {
    const name = esc(c.display_name || c.username || "User");
    const cid = esc(c.id || Date.now());
    return `<div class="cmt-item" id="comment-${cid}">
      <div class="cmt-avatar">${name.slice(0, 1).toUpperCase()}</div>
      <div class="cmt-body"><div class="cmt-author">${name}</div><div class="cmt-text">${esc(c.content)}</div><div class="cmt-time">${timeAgo(c.created_at)} <button class="reply-link" onclick="showReplyBox('${esc(id)}','${cid}')">Reply</button></div><div class="reply-list" id="reply-list-${cid}"></div></div>
    </div>`;
  }

  window.postComment = async function postComment(id) {
    const input = document.getElementById(`ci-feed_post-${id}`);
    if (!input || !input.value.trim()) return;
    await window.api.request(`/feed/${encodeURIComponent(id)}/comment`, { method: "POST", body: { content: input.value.trim() } });
    input.value = "";
    const el = document.getElementById(`cs-fp-${id}`);
    if (el) el.classList.remove("is-shown");
    window.toggleComments(id);
  };

  window.toggleLocalComments = function toggleLocalComments(id) {
    const el = document.getElementById(`local-comments-${id}`);
    if (!el) return;
    if (el.classList.toggle("is-shown") === false) return;
    const state = localState(id);
    el.innerHTML = `<div class="cmt-input-row"><input class="cmt-input" id="ci-local-${esc(id)}" placeholder="Write a comment..."><button class="cmt-submit" onclick="postLocalComment('${esc(id)}')">Post</button></div>` +
      state.comments.map(c => commentHtml(c, id)).join("");
  };

  window.postLocalComment = function postLocalComment(id) {
    const input = document.getElementById(`ci-local-${id}`);
    if (!input || !input.value.trim()) return;
    const data = getLocal();
    const state = data[id] || { liked: false, likes: 0, comments: [] };
    const user = currentUser();
    state.comments.push({ id: Date.now(), username: user ? user.username : "guest", display_name: user ? user.displayName || user.username : "Guest", content: input.value.trim(), created_at: new Date().toISOString() });
    data[id] = state;
    setLocal(data);
    window.toggleLocalComments(id);
    window.toggleLocalComments(id);
  };

  window.showReplyBox = function showReplyBox(id, commentId) {
    const list = document.getElementById(`reply-list-${commentId}`);
    if (!list || list.querySelector(".reply-box")) return;
    list.insertAdjacentHTML("beforeend", `<div class="reply-box"><input class="cmt-input" id="reply-${commentId}" placeholder="Write a reply..."><button class="cmt-submit" onclick="postReply('${esc(id)}','${esc(commentId)}')">Reply</button></div>`);
  };

  window.postReply = function postReply(id, commentId) {
    const input = document.getElementById(`reply-${commentId}`);
    const list = document.getElementById(`reply-list-${commentId}`);
    if (!input || !list || !input.value.trim()) return;
    const user = currentUser();
    const name = user ? user.displayName || user.username : "Guest";
    list.insertAdjacentHTML("beforeend", `<div class="reply-item"><b>${esc(name)}</b> ${esc(input.value.trim())}</div>`);
    input.closest(".reply-box").remove();
  };

  window.votePoll = async function votePoll(pollId, optionId) {
    if (!currentUser()) return alert("Log in to vote.");
    await window.api.request(`/polls/${encodeURIComponent(pollId)}/vote`, { method: "POST", body: { option_id: optionId } });
    window.loadFeed();
  };

  window.sharePost = function sharePost(id, event) {
    const url = `${location.origin}/feed/?post=${encodeURIComponent(id)}`;
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
    const btn = event && event.currentTarget;
    if (btn) {
      const original = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check"></i>Copied';
      setTimeout(() => { btn.innerHTML = original; }, 1400);
    } else {
      prompt("Share link", url);
    }
  };
})();
