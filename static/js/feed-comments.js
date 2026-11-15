/* =============================================================================
   FEED_INLINE_COMMENTS_20261115 -- conversations visible on the feed.

   Every feed post and single pick card shows its two newest comments under the
   action row, a "View all N comments" link that expands the thread in place,
   nested replies, comment likes and a compact "Write a comment..." box.

   Loaded after feed-v2.js / feed-social.js. It does not edit their renderers:
   it fills the existing empty .comments-section boxes (cs-fp-<id>,
   cs-pick-<id>) as they appear, with one batched request per paint
   (GET /api/feed/comments/preview). Milestone comments keep the old toggle.
   ============================================================================= */
(function () {
    'use strict';
    if (window.__tmrInlineComments) return;
    window.__tmrInlineComments = true;

    var PREVIEW = 2;
    var REPLY_PREVIEW_TEXT = 'Write a reply...';
    var state = {};          // key "fp:12" -> thread state
    var queue = {};          // key -> true, waiting for the next preview batch
    var scanTimer = null;

    function h(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function me() { return (typeof window.auth !== 'undefined' && window.auth) ? window.auth.currentUser : null; }
    function apiBase() { return (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) || 'https://api.trustmyrecord.com/api'; }
    function avatarUrl(u) {
        var url = u && (u.avatar_url || u.avatar || u.avatarUrl);
        if (url && !/^data:/.test(url)) return url;
        return apiBase() + '/users/' + encodeURIComponent((u && u.username) || '') + '/avatar?s=96';
    }
    function ago(d) {
        if (typeof window.timeAgo === 'function') { try { return window.timeAgo(d); } catch (e) {} }
        var s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + 'm';
        if (s < 86400) return Math.floor(s / 3600) + 'h';
        return Math.floor(s / 86400) + 'd';
    }
    function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
    function goLogin() {
        if (typeof window.openModal === 'function') return window.openModal('login');
        window.location.href = '/login/';
    }
    function req(path, opts) {
        var a = window.api;
        if (!a || typeof a.request !== 'function') return Promise.reject(new Error('api not ready'));
        return a.request(path, opts);
    }

    // ------------------------------------------------------------ discovery
    function keyOf(el) {
        var m = /^cs-(fp|pick)-(\d+)$/.exec(el.id || '');
        return m ? { kind: m[1], id: m[2], key: m[1] + ':' + m[2] } : null;
    }

    function scan() {
        scanTimer = null;
        var els = document.querySelectorAll('.comments-section[id^="cs-fp-"]:not([data-ic]), .comments-section[id^="cs-pick-"]:not([data-ic])');
        var need = { fp: [], pick: [] };
        for (var i = 0; i < els.length; i++) {
            var k = keyOf(els[i]);
            if (!k) continue;
            els[i].setAttribute('data-ic', k.key);
            els[i].classList.add('ic-on');
            var st = state[k.key];
            if (st && st.loaded && Date.now() - st.at < 120000) { paint(k.key); continue; }
            if (!queue[k.key]) { queue[k.key] = true; need[k.kind].push(k.id); }
        }
        for (var start = 0; start < Math.max(need.fp.length, need.pick.length); start += 40) {
            fetchPreview(need.fp.slice(start, start + 40), need.pick.slice(start, start + 40));
        }
    }
    function scheduleScan() { if (!scanTimer) scanTimer = setTimeout(scan, 80); }

    function fetchPreview(fp, pick) {
        if (!fp.length && !pick.length) return;
        var q = [];
        if (fp.length) q.push('fp=' + fp.join(','));
        if (pick.length) q.push('pick=' + pick.join(','));
        req('/feed/comments/preview?' + q.join('&')).then(function (d) {
            [['fp', fp, d && d.fp], ['pick', pick, d && d.pick]].forEach(function (t) {
                t[1].forEach(function (id) {
                    var key = t[0] + ':' + id;
                    delete queue[key];
                    var p = (t[2] && t[2][id]) || { total: 0, comments: [] };
                    var st = state[key] || (state[key] = newState(t[0], id));
                    st.total = Number(p.total) || 0;
                    st.preview = p.comments || [];
                    st.loaded = true;
                    st.at = Date.now();
                    paint(key);
                    updateCountButton(st); // the card count matches the conversation shown
                });
            });
        }).catch(function () {
            fp.forEach(function (id) { fallback('fp', id); });
            pick.forEach(function (id) { fallback('pick', id); });
        });
    }

    // The preview endpoint is new: if it is not there (older API), read each
    // thread with the existing comments endpoint so the feed still works.
    function fallback(kind, id) {
        var key = kind + ':' + id;
        delete queue[key];
        loadAll(key).then(function () { paint(key); }).catch(function () {
            var st = state[key] || (state[key] = newState(kind, id));
            st.loaded = true; st.failed = true; paint(key);
        });
    }

    function newState(kind, id) {
        return { kind: kind, id: id, total: 0, preview: [], all: null, expanded: false, open: {}, replyTo: null, loaded: false, at: 0 };
    }

    function listPath(st) { return (st.kind === 'pick' ? '/picks/' : '/feed/') + encodeURIComponent(st.id) + '/comments'; }
    function postPath(st) { return (st.kind === 'pick' ? '/picks/' : '/feed/') + encodeURIComponent(st.id) + '/comment'; }

    function loadAll(key) {
        var st = state[key] || (state[key] = newState(key.split(':')[0], key.split(':')[1]));
        return req(listPath(st)).then(function (d) {
            var rows = (d && d.comments) || [];
            st.all = rows;
            st.total = rows.length;
            st.loaded = true;
            st.at = Date.now();
            var tops = threads(st);
            st.preview = tops.slice(-PREVIEW).map(function (t) { return t.c; });
            return st;
        });
    }

    // Top level comments with their replies. A reply whose parent is a reply
    // (older pick threads) joins the top of its chain.
    function threads(st) {
        var rows = st.all || [];
        var byId = {};
        rows.forEach(function (r) { byId[r.id] = r; });
        function topOf(r) {
            var seen = 0, cur = r;
            while (cur && cur.parent_comment_id && byId[cur.parent_comment_id] && seen++ < 20) cur = byId[cur.parent_comment_id];
            return cur;
        }
        var tops = [], map = {};
        rows.forEach(function (r) {
            var t = topOf(r);
            if (t === r) { map[r.id] = { c: r, replies: [] }; tops.push(map[r.id]); }
        });
        rows.forEach(function (r) {
            var t = topOf(r);
            if (t !== r && map[t.id]) map[t.id].replies.push(r);
        });
        return tops;
    }

    // ------------------------------------------------------------- painting
    function avatarImg(u, cls) {
        return '<a class="' + cls + '" href="/profile/?user=' + encodeURIComponent(u.username || '') + '" aria-hidden="true" tabindex="-1">' +
            '<img src="' + h(avatarUrl(u)) + '" alt="" loading="lazy" width="32" height="32"></a>';
    }

    function commentHtml(st, c, isReply, replyCount) {
        var name = c.display_name || c.username || 'Member';
        var liked = !!c.liked_by_user;
        var likes = Number(c.likes_count) || 0;
        var cid = String(c.id);
        return '<div class="ic-c' + (isReply ? ' ic-c--reply' : '') + (c._pending ? ' is-pending' : '') + '" data-cid="' + h(cid) + '">' +
            avatarImg(c, 'ic-av') +
            '<div class="ic-main">' +
                '<div class="ic-bubble">' +
                    '<a class="ic-name" href="/profile/?user=' + encodeURIComponent(c.username || '') + '">' + h(name) + '</a>' +
                    (c.is_official_bot ? ' <span class="cmt-official" title="Official TrustMyRecord account"><i class="fas fa-circle-check"></i> Official</span>' : '') +
                    '<div class="ic-text">' + h(c.content) + '</div>' +
                '</div>' +
                '<div class="ic-meta">' +
                    '<time datetime="' + h(c.created_at || '') + '">' + h(c._pending ? 'Posting...' : ago(c.created_at)) + '</time>' +
                    (c._pending ? '' :
                    '<button type="button" class="ic-act ic-like' + (liked ? ' is-liked' : '') + '" data-ic-like="' + h(cid) + '" aria-pressed="' + liked + '">Like</button>' +
                    '<button type="button" class="ic-act" data-ic-reply="' + h(cid) + '">Reply</button>' +
                    (likes ? '<span class="ic-likes" title="' + plural(likes, 'like') + '"><i class="fas fa-thumbs-up"></i> ' + likes + '</span>' : '')) +
                '</div>' +
                (!isReply && replyCount ? '<button type="button" class="ic-more ic-more--replies" data-ic-thread="' + h(cid) + '"><i class="fas fa-reply fa-rotate-180"></i> View ' + plural(replyCount, 'reply').replace('replys', 'replies') + '</button>' : '') +
            '</div>' +
        '</div>';
    }

    function composerHtml(st, parentId) {
        var u = me();
        if (!u) {
            return parentId ? '' : '<div class="ic-signin"><a href="/login/" data-ic-login="1">Log in</a> to join the conversation</div>';
        }
        var ph = parentId ? REPLY_PREVIEW_TEXT : 'Write a comment...';
        return '<form class="ic-form' + (parentId ? ' ic-form--reply' : '') + '" data-ic-parent="' + h(parentId || '') + '" autocomplete="off">' +
            avatarImg(u, 'ic-av ic-av--me') +
            '<div class="ic-field">' +
                '<input class="ic-input" type="text" maxlength="1000" placeholder="' + h(ph) + '" aria-label="' + h(ph) + '">' +
                '<button type="submit" class="ic-send" aria-label="Post comment" disabled><i class="fas fa-paper-plane"></i></button>' +
            '</div>' +
        '</form>';
    }

    function paint(key) {
        var st = state[key];
        var el = document.getElementById('cs-' + key.replace(':', '-'));
        if (!el || !st) return;
        el.classList.add('ic-on', 'show');
        var keepFocus = el.contains(document.activeElement) && document.activeElement.classList.contains('ic-input') ? document.activeElement : null;
        var keepVal = keepFocus ? keepFocus.value : '';
        var keepParent = keepFocus ? keepFocus.closest('form').getAttribute('data-ic-parent') : null;

        var html = '';
        var tops, hiddenCount = 0;
        if (st.all) {
            var all = threads(st);
            tops = st.expanded ? all : all.filter(function (t) { return st.preview.some(function (p) { return String(p.id) === String(t.c.id); }); });
            if (!st.expanded && !tops.length) tops = all.slice(-PREVIEW);
        } else {
            tops = st.preview.map(function (c) { return { c: c, replies: null, count: Number(c.reply_count) || 0 }; });
        }
        // Comments not reachable from what is on screen. Replies behind a
        // "View N replies" button already have their own link.
        var shownCount = 0;
        tops.forEach(function (t) { shownCount += 1 + (t.replies ? t.replies.length : (t.count || 0)); });
        hiddenCount = Math.max(0, st.total - shownCount);

        if (st.expanded && st.total > PREVIEW) {
            html += '<button type="button" class="ic-more ic-more--all" data-ic-collapse="1">Show fewer comments</button>';
        } else if (!st.expanded && hiddenCount > 0) {
            html += '<button type="button" class="ic-more ic-more--all" data-ic-expand="1">View all ' + plural(st.total, 'comment') + '</button>';
        }
        if (st.failed && !tops.length) html += '<div class="ic-note">Comments could not load. <button type="button" class="ic-act" data-ic-expand="1">Try again</button></div>';

        html += '<div class="ic-list">';
        tops.forEach(function (t) {
            var replies = t.replies;
            var count = replies ? replies.length : (t.count || 0);
            var open = !!st.open[t.c.id] && !!replies;
            html += '<div class="ic-thread" data-thread="' + h(t.c.id) + '">';
            html += commentHtml(st, t.c, false, open ? 0 : count);
            if (open && replies.length) {
                html += '<div class="ic-replies">' + replies.map(function (r) { return commentHtml(st, r, true, 0); }).join('') + '</div>';
            }
            if (st.replyTo && String(st.replyTo.top) === String(t.c.id)) {
                html += '<div class="ic-replies ic-replies--form">' + composerHtml(st, t.c.id) + '</div>';
            }
            html += '</div>';
        });
        html += '</div>';
        html += composerHtml(st, null);
        html += '<div class="ic-err" role="alert" hidden></div>';
        el.innerHTML = html;

        if (keepFocus) {
            var sel = keepParent ? 'form[data-ic-parent="' + keepParent + '"] .ic-input' : 'form[data-ic-parent=""] .ic-input';
            var again = el.querySelector(sel);
            if (again) { again.value = keepVal; again.focus(); syncSend(again); }
        }
    }

    function updateCountButton(st) {
        var sec = document.getElementById('cs-' + st.kind + '-' + st.id);
        var row = sec && sec.previousElementSibling;
        if (!row || !row.classList || !row.classList.contains('fi-actions')) return;
        var btns = row.querySelectorAll('.fi-action');
        for (var i = 0; i < btns.length; i++) {
            if (/toggleComments\(/.test(btns[i].getAttribute('onclick') || '')) {
                var span = btns[i].querySelector('span');
                if (span) span.textContent = String(st.total);
            }
        }
    }

    function showErr(sec, msg) {
        var e = sec && sec.querySelector('.ic-err');
        if (!e) return;
        e.textContent = msg || '';
        e.hidden = !msg;
    }

    function errText(e) {
        var s = e && e.status;
        if (s === 401 || s === 403) return 'Your session expired. Log in again to comment.';
        if (s === 404) return 'This post is no longer available.';
        if (s === 400 || s === 422) return (e && e.message) || 'Comments must be 1 to 1000 characters.';
        if (s === 429) return 'Slow down a moment, then try again.';
        return 'Could not reach TrustMyRecord. Your comment is still in the box, try again.';
    }

    function syncSend(input) {
        var btn = input && input.parentNode && input.parentNode.querySelector('.ic-send');
        if (btn) btn.disabled = !input.value.trim();
    }

    // ------------------------------------------------------------- actions
    function stateFor(node) {
        var sec = node.closest && node.closest('.comments-section[data-ic]');
        if (!sec) return null;
        var key = sec.getAttribute('data-ic');
        return { key: key, st: state[key], sec: sec };
    }

    function findComment(st, cid) {
        var lists = [st.preview || [], st.all || []];
        var found = [];
        lists.forEach(function (l) { l.forEach(function (c) { if (String(c.id) === String(cid)) found.push(c); }); });
        return found;
    }

    function expand(key, focus) {
        var st = state[key];
        if (!st) return Promise.resolve();
        st.expanded = true;
        st.failed = false;
        var p = st.all ? Promise.resolve() : loadAll(key);
        return p.then(function () { paint(key); if (focus) focusBox(key); })
            .catch(function () { st.expanded = false; st.failed = true; paint(key); });
    }

    function focusBox(key) {
        var el = document.getElementById('cs-' + key.replace(':', '-'));
        var input = el && el.querySelector('form[data-ic-parent=""] .ic-input');
        if (input) { input.focus(); }
        else if (!me()) goLogin();
    }

    var inFlight = {};
    function submit(form) {
        var ctx = stateFor(form);
        if (!ctx || !ctx.st) return;
        var st = ctx.st, key = ctx.key;
        var input = form.querySelector('.ic-input');
        var text = input ? input.value.trim() : '';
        if (!text) return;
        if (!me()) return goLogin();
        var parent = form.getAttribute('data-ic-parent') || '';
        var flightKey = key + '|' + parent;
        if (inFlight[flightKey]) return;
        inFlight[flightKey] = true;
        showErr(ctx.sec, '');
        input.disabled = true;
        var btn = form.querySelector('.ic-send');
        if (btn) btn.disabled = true;

        var body = { content: text };
        if (parent) body.parentCommentId = Number(parent);
        var ready = (parent && !st.all) ? loadAll(key).catch(function () {}) : Promise.resolve();
        ready.then(function () {
            return req(postPath(st), { method: 'POST', body: body });
        }).then(function (res) {
            var u = me() || {};
            var c = Object.assign({
                username: u.username, display_name: u.display_name || u.displayName || u.username,
                avatar_url: u.avatar_url || u.avatar || null, created_at: new Date().toISOString(),
                likes_count: 0, liked_by_user: false, reply_count: 0
            }, (res && res.comment) || {});
            if (!c.display_name) c.display_name = u.display_name || u.username;
            if (!c.avatar_url) c.avatar_url = u.avatar_url || u.avatar || null;
            if (!c.created_at) c.created_at = new Date().toISOString();
            if (parent && !c.parent_comment_id) c.parent_comment_id = Number(parent);
            if (!parent) c.parent_comment_id = null;
            st.total += 1;
            if (st.all) st.all.push(c);
            if (!parent) {
                st.preview.push(c);
            } else {
                st.open[parent] = true;
                findComment(st, parent).forEach(function (p) { p.reply_count = (Number(p.reply_count) || 0) + 1; });
                st.replyTo = null;
            }
            st.at = Date.now();
            paint(key);
            updateCountButton(st);
        }).catch(function (e) {
            input.disabled = false;
            syncSend(input);
            showErr(ctx.sec, errText(e));
        }).then(function () { inFlight[flightKey] = false; });
    }

    var likeFlight = {};
    function toggleLike(btn) {
        var ctx = stateFor(btn);
        if (!ctx || !ctx.st) return;
        if (!me()) return goLogin();
        var cid = btn.getAttribute('data-ic-like');
        var fk = ctx.st.kind + ':' + cid;
        if (likeFlight[fk]) return;
        likeFlight[fk] = true;
        var rows = findComment(ctx.st, cid);
        var was = rows.length ? !!rows[0].liked_by_user : btn.classList.contains('is-liked');
        var before = rows.length ? (Number(rows[0].likes_count) || 0) : 0;
        rows.forEach(function (r) { r.liked_by_user = !was; r.likes_count = Math.max(0, before + (was ? -1 : 1)); });
        paint(ctx.key);
        req('/feed/comments/' + ctx.st.kind + '/' + encodeURIComponent(cid) + '/like', { method: was ? 'DELETE' : 'POST' })
            .then(function (d) {
                rows.forEach(function (r) { r.liked_by_user = !!(d && d.liked); if (d && d.likes_count != null) r.likes_count = Number(d.likes_count); });
            })
            .catch(function (e) {
                rows.forEach(function (r) { r.liked_by_user = was; r.likes_count = before; });
                var sec = document.getElementById('cs-' + ctx.key.replace(':', '-'));
                showErr(sec, e && (e.status === 401 || e.status === 403) ? 'Your session expired. Log in again.' : 'Could not save that like. Try again.');
            })
            .then(function () { likeFlight[fk] = false; paint(ctx.key); });
    }

    function startReply(btn) {
        var ctx = stateFor(btn);
        if (!ctx || !ctx.st) return;
        if (!me()) return goLogin();
        var st = ctx.st;
        var cid = btn.getAttribute('data-ic-reply');
        var thread = btn.closest('.ic-thread');
        var top = thread ? thread.getAttribute('data-thread') : cid;
        var target = findComment(st, cid)[0];
        st.replyTo = { top: top, cid: cid };
        var go = function () {
            st.open[top] = true;
            paint(ctx.key);
            var sec = document.getElementById('cs-' + ctx.key.replace(':', '-'));
            var input = sec && sec.querySelector('form[data-ic-parent="' + top + '"] .ic-input');
            if (input) {
                if (String(cid) !== String(top) && target && target.username) input.value = '@' + target.username + ' ';
                input.focus();
                syncSend(input);
            }
        };
        if (st.all) go();
        else loadAll(ctx.key).then(go, go);
    }

    function openThread(btn) {
        var ctx = stateFor(btn);
        if (!ctx || !ctx.st) return;
        var top = btn.getAttribute('data-ic-thread');
        var st = ctx.st;
        var go = function () { st.open[top] = true; paint(ctx.key); };
        if (st.all) go();
        else { btn.disabled = true; loadAll(ctx.key).then(go, function () { btn.disabled = false; showErr(ctx.sec, 'Replies could not load. Try again.'); }); }
    }

    document.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var b;
        if ((b = t.closest('[data-ic-like]'))) { e.preventDefault(); return toggleLike(b); }
        if ((b = t.closest('[data-ic-reply]'))) { e.preventDefault(); return startReply(b); }
        if ((b = t.closest('[data-ic-thread]'))) { e.preventDefault(); return openThread(b); }
        if ((b = t.closest('[data-ic-expand]'))) { e.preventDefault(); var c1 = stateFor(b); if (c1) expand(c1.key, false); return; }
        if ((b = t.closest('[data-ic-collapse]'))) {
            e.preventDefault();
            var c2 = stateFor(b);
            if (c2 && c2.st) {
                c2.st.expanded = false; c2.st.open = {}; c2.st.replyTo = null;
                var tops = threads(c2.st);
                c2.st.preview = tops.slice(-PREVIEW).map(function (x) { return x.c; });
                paint(c2.key);
                var card = c2.sec.closest('.feed-item, .fi-card, article') || c2.sec;
                if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start' });
            }
            return;
        }
        if ((b = t.closest('[data-ic-login]'))) { e.preventDefault(); goLogin(); }
    });
    document.addEventListener('submit', function (e) {
        var f = e.target;
        if (f && f.classList && f.classList.contains('ic-form')) { e.preventDefault(); submit(f); }
    });
    document.addEventListener('input', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('ic-input')) syncSend(e.target);
    });
    document.addEventListener('keydown', function (e) {
        var t = e.target;
        if (e.key === 'Escape' && t && t.classList && t.classList.contains('ic-input')) {
            var f = t.closest('.ic-form');
            if (f && f.getAttribute('data-ic-parent')) {
                var ctx = stateFor(f);
                if (ctx && ctx.st) { ctx.st.replyTo = null; paint(ctx.key); }
            }
        }
    });

    // The action row's Comment button: open the whole conversation and put the
    // caret in the box. Milestones keep the original toggle.
    var baseToggle = window.toggleComments;
    window.toggleComments = function (id, type) {
        var kind = type === 'pick' ? 'pick' : (type === 'milestone' ? null : 'fp');
        var el = kind && document.getElementById('cs-' + kind + '-' + String(id).replace(/[^A-Za-z0-9_-]/g, ''));
        if (!kind || !el || !el.hasAttribute('data-ic')) {
            return typeof baseToggle === 'function' ? baseToggle.apply(this, arguments) : undefined;
        }
        var key = el.getAttribute('data-ic');
        var st = state[key];
        if (!st || !st.loaded) { focusBox(key); return; }
        if (st.total > PREVIEW && !st.expanded) return expand(key, true);
        focusBox(key);
    };

    // Sign in can finish after the first paint: repaint so the box appears.
    window.addEventListener('tmr-auth-changed', function () { Object.keys(state).forEach(paint); });

    function boot() {
        var root = document.body;
        if (!root) return;
        new MutationObserver(function (muts) {
            for (var i = 0; i < muts.length; i++) {
                if (muts[i].addedNodes && muts[i].addedNodes.length) { scheduleScan(); return; }
            }
        }).observe(root, { childList: true, subtree: true });
        scheduleScan();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    window.TMRInlineComments = { _state: state, scan: scan, paint: paint };
})();
