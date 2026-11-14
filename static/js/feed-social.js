/* =============================================================================
   FEED_SOCIAL_20261114 -- the feed's social layer. Loads after feed-v2.js and
   wraps its renderers; nothing in the card markup is rebuilt here.

     * Disagree     a second reaction on a post, exclusive with Like
     * @mentions    real members named in a post become profile links
     * Quote posts  "Quote post" in a post's menu, shown as an embedded card
     * Ride / Fade  an opinion on a handicapper, on their record cards. It never
                    shows or uses a pick.
     * Brag card    "Share My Record" turns your verified record into an image
                    in the composer, ready to post

   API: services/feedSocial.js in the backend.
   ============================================================================= */
(function () {
    'use strict';
    if (window.TMRFeedSocial) return;

    const viewer = () => ((typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null);
    const needLogin = () => {
        if (viewer()) return false;
        if (typeof openModal === 'function') openModal('login'); else location.href = '/login/?next=%2Ffeed%2F';
        return true;
    };
    const num = v => Number(v) || 0;
    const items = new Map(); // post id -> item, for the quote menu

    // ---------------------------------------------------------------- mentions
    function linkMentions(escapedText, names) {
        let out = escapedText;
        (names || []).forEach(name => {
            if (!/^[A-Za-z0-9_]{2,30}$/.test(name)) return;
            const re = new RegExp('(^|[^A-Za-z0-9_@])@(' + name + ')(?![A-Za-z0-9_])', 'gi');
            out = out.replace(re, (m, pre, n) => pre + '<a class="fs-mention" href="/profile/?user=' + encodeURIComponent(name) + '">@' + n + '</a>');
        });
        return out;
    }

    // ------------------------------------------------------------------ quotes
    function quoteHtml(q) {
        if (!q) return '';
        if (q.deleted) return '<div class="fs-quote is-gone"><i class="fas fa-quote-left"></i> This post is no longer available.</div>';
        if (!/^\d+$/.test(String(q.id))) return '';
        const img = (typeof fvPhotoUrl === 'function') ? fvPhotoUrl({ image_url: q.image_url }) : '';
        const text = String(q.content || '');
        return '<a class="fs-quote" href="/feed/?post=' + encodeURIComponent(String(q.id)) + '">' +
            '<span class="fs-quote-body">' +
                '<span class="fs-quote-who"><i class="fas fa-quote-left"></i> <b>' + esc(q.display_name || q.username || 'Member') + '</b>' +
                    (q.username ? ' <em>@' + esc(q.username) + '</em>' : '') + '</span>' +
                (text ? '<span class="fs-quote-text">' + esc(text) + (q.truncated ? '&hellip;' : '') + '</span>' : '') +
            '</span>' +
            (img ? '<img class="fs-quote-img" src="' + esc(img) + '" alt="" loading="lazy">' : '') +
        '</a>';
    }

    let quote = null; // { id, name, text }

    function quoteTray() {
        let tray = document.getElementById('fsQuoteTray');
        if (tray) return tray;
        const anchor = document.getElementById('fvPhotoTray') || document.getElementById('compInput');
        if (!anchor) return null;
        tray = document.createElement('div');
        tray.id = 'fsQuoteTray';
        tray.className = 'fs-quote-tray';
        tray.hidden = true;
        anchor.insertAdjacentElement('afterend', tray);
        return tray;
    }

    function clearQuote() {
        quote = null;
        const tray = document.getElementById('fsQuoteTray');
        if (tray) { tray.hidden = true; tray.innerHTML = ''; }
        const input = document.getElementById('compInput');
        if (input && input.dataset.fsPlaceholder != null) { input.placeholder = input.dataset.fsPlaceholder; delete input.dataset.fsPlaceholder; }
    }

    function startQuote(itemId) {
        if (needLogin()) return;
        const item = items.get(String(itemId));
        if (!item) return;
        const tray = quoteTray();
        const input = document.getElementById('compInput');
        if (!tray || !input) return;
        if (typeof postType !== 'undefined' && postType === 'poll' && typeof toggleType === 'function') toggleType('poll');
        const text = String(item.content || '').trim();
        quote = { id: String(itemId), name: getDisplayName(item), text };
        tray.innerHTML = '<div class="fs-quote-chip"><i class="fas fa-quote-left"></i>' +
            '<span><b>Quoting ' + esc(quote.name) + '</b>' + (text ? '<em>' + esc(text.slice(0, 140)) + (text.length > 140 ? '&hellip;' : '') + '</em>' : '<em>Photo post</em>') + '</span></div>' +
            '<button type="button" class="fs-quote-x" aria-label="Remove quote"><i class="fas fa-xmark"></i></button>';
        tray.hidden = false;
        tray.querySelector('.fs-quote-x').addEventListener('click', clearQuote);
        if (input.dataset.fsPlaceholder == null) input.dataset.fsPlaceholder = input.placeholder;
        input.placeholder = 'Add your take on this post...';
        if (typeof fvCloseMenus === 'function') fvCloseMenus();
        const card = document.getElementById('composerCard');
        if (card) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
        input.focus();
    }

    async function submitQuote() {
        const input = document.getElementById('compInput');
        const btn = document.getElementById('postBtn');
        if (!input || !btn || !quote) return;
        if (needLogin()) return;
        const photo = (typeof fvPhoto !== 'undefined') ? fvPhoto : null;
        if (photo && photo.busy) { showComposerStatus('error', 'Your photo is still uploading.'); return; }
        if (photo && !photo.id) { showComposerStatus('error', 'That photo did not upload. Remove it or add it again.'); return; }
        const content = input.value.trim();
        if (!content && !photo) { showComposerStatus('error', 'Add your take before posting a quote.'); return; }
        const sportSel = document.getElementById('sportPick');
        const body = {
            content,
            post_type: resolveBackendPostType(postType),
            sport: (sportSel && sportSel.value) || null,
            quote_id: quote.id
        };
        if (photo && photo.id) body.image_id = photo.id;
        btn.disabled = true;
        btn.textContent = 'Posting...';
        try {
            await api.request('/feed', { method: 'POST', body });
        } catch (e) {
            btn.textContent = 'Post';
            btn.disabled = false;
            showComposerStatus('error', (e && e.message) ? String(e.message) : 'Failed to post. Please try again.');
            return;
        }
        input.value = '';
        btn.textContent = 'Post';
        if (sportSel) sportSel.value = '';
        if (photo && typeof fvRemovePhoto === 'function') fvRemovePhoto();
        clearQuote();
        if (postType !== 'post' && typeof toggleType === 'function') toggleType(postType);
        showComposerStatus('success', 'Posted to feed.');
        feedOffset = 0;
        await loadFeed();
    }

    // ---------------------------------------------------------------- disagree
    function disagreeBtn(id, item) {
        const on = !!item.disagreed_by_user;
        return '<button type="button" class="fi-action fs-disagree' + (on ? ' is-on' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '"' +
            ' onclick="TMRFeedSocial.disagree(' + jsArg(id) + ', this)"><i class="fas fa-thumbs-down"></i> Disagree <span>' + num(item.disagrees_count) + '</span></button>';
    }

    function setCount(btn, n) {
        const span = btn && btn.querySelector('span');
        if (span) span.textContent = String(Math.max(0, num(n)));
    }

    async function disagree(id, btn) {
        if (needLogin() || !btn || btn.dataset.busy) return;
        const on = !btn.classList.contains('is-on');
        btn.dataset.busy = '1';
        try {
            const res = await api.request('/feed/' + encodeURIComponent(String(id)) + '/disagree', { method: on ? 'POST' : 'DELETE' });
            btn.classList.toggle('is-on', !!res.disagreed);
            btn.setAttribute('aria-pressed', res.disagreed ? 'true' : 'false');
            setCount(btn, res.disagrees_count);
            const like = btn.parentElement && btn.parentElement.querySelector('.fv-like');
            if (like) {
                if (res.disagreed) like.classList.remove('is-liked', 'liked');
                setCount(like, res.likes_count);
            }
        } catch (e) { /* the button keeps its state */ }
        delete btn.dataset.busy;
    }

    // A like clears the member's disagree (the server does the same).
    function afterLike(btn) {
        const row = btn && btn.closest && btn.closest('.fi-actions');
        const dis = row && row.querySelector('.fs-disagree.is-on');
        if (dis && btn.classList.contains('liked')) {
            dis.classList.remove('is-on');
            dis.setAttribute('aria-pressed', 'false');
            setCount(dis, num((dis.querySelector('span') || {}).textContent) - 1);
        }
    }

    // ------------------------------------------------------------- ride / fade
    const stances = {};      // lowercased username -> { ride, fade, mine }
    const displayNames = {}; // lowercased username -> display name
    let hydrateTimer = null;

    function stanceSlot(item) {
        const username = getUsername(item);
        const me = viewer();
        if (!username) return '';
        if (me && String(me.username || '').toLowerCase() === String(username).toLowerCase()) return '';
        displayNames[String(username).toLowerCase()] = getDisplayName(item);
        return '<div class="fs-stance" data-user="' + esc(username) + '"></div>';
    }

    function paintStance(el) {
        const key = String(el.getAttribute('data-user') || '').toLowerCase();
        const s = stances[key];
        if (!s) return;
        const name = esc(displayNames[key] || el.getAttribute('data-user'));
        const b = (kind, label, icon, tip) =>
            '<button type="button" class="fs-st fs-st--' + kind + (s.mine === kind ? ' is-on' : '') + '" data-stance="' + kind + '" aria-pressed="' + (s.mine === kind ? 'true' : 'false') + '" title="' + tip + '">' +
            '<i class="fas ' + icon + '"></i> ' + label + ' <span>' + num(s[kind]) + '</span></button>';
        el.innerHTML = '<span class="fs-stance-q">Ride or fade <b>' + name + '</b>?</span>' +
            '<span class="fs-stance-btns">' +
                b('ride', 'Ride', 'fa-arrow-trend-up', 'You back this record going forward') +
                b('fade', 'Fade', 'fa-arrow-trend-down', 'You would go the other way') +
            '</span>';
        el.classList.add('is-ready');
    }

    function paintAll(key) {
        document.querySelectorAll('.fs-stance[data-user]').forEach(el => {
            if (!key || String(el.getAttribute('data-user')).toLowerCase() === key) paintStance(el);
        });
    }

    async function hydrateStances() {
        const need = new Set();
        document.querySelectorAll('.fs-stance[data-user]:not(.is-ready)').forEach(el => {
            const key = String(el.getAttribute('data-user')).toLowerCase();
            if (stances[key]) paintStance(el); else need.add(key);
        });
        if (!need.size) return;
        const names = Array.from(need).filter(n => /^[a-z0-9_.-]{1,40}$/.test(n)).slice(0, 60);
        if (!names.length) return;
        try {
            const data = await api.request('/feed/stances?users=' + encodeURIComponent(names.join(',')));
            const got = (data && data.stances) || {};
            names.forEach(n => { stances[n] = got[n] || stances[n] || null; });
            paintAll();
        } catch (e) { /* the row stays closed */ }
    }

    async function setStance(el, kind) {
        if (needLogin() || el.dataset.busy) return;
        const username = el.getAttribute('data-user');
        const key = String(username).toLowerCase();
        const cur = stances[key];
        if (!cur) return;
        el.dataset.busy = '1';
        try {
            const res = await api.request('/feed/stance/' + encodeURIComponent(username), {
                method: 'PUT',
                body: { stance: cur.mine === kind ? 'none' : kind }
            });
            stances[key] = { ride: num(res.ride), fade: num(res.fade), mine: res.mine || null };
            paintAll(key);
        } catch (e) { /* unchanged */ }
        document.querySelectorAll('.fs-stance[data-user]').forEach(n => { delete n.dataset.busy; });
    }

    document.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('.fs-st[data-stance]');
        if (!b) return;
        const el = b.closest('.fs-stance');
        if (el) setStance(el, b.getAttribute('data-stance'));
    });

    // -------------------------------------------------------------- brag card
    function drawBrag(d) {
        const W = 1200, H = 630;
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const g = cv.getContext('2d');
        const disp = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
        const body = 'Inter, "Segoe UI", Arial, sans-serif';

        const bg = g.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#040a18'); bg.addColorStop(.55, '#0a1a36'); bg.addColorStop(1, '#06122a');
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        const glow = g.createRadialGradient(W * .78, -40, 20, W * .78, -40, 620);
        glow.addColorStop(0, 'rgba(47,155,255,.42)'); glow.addColorStop(1, 'rgba(47,155,255,0)');
        g.fillStyle = glow; g.fillRect(0, 0, W, H);
        const glow2 = g.createRadialGradient(120, H + 60, 20, 120, H + 60, 520);
        glow2.addColorStop(0, 'rgba(255,190,60,.20)'); glow2.addColorStop(1, 'rgba(255,190,60,0)');
        g.fillStyle = glow2; g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(120,170,255,.35)'; g.lineWidth = 3;
        roundRect(g, 18, 18, W - 36, H - 36, 28); g.stroke();

        // wordmark
        g.textBaseline = 'alphabetic'; g.textAlign = 'left';
        g.font = '800 40px ' + disp;
        let x = 70;
        [['TRUST', '#ffffff'], ['MY', '#3aa0ff'], ['RECORD', '#ffffff']].forEach(p => {
            g.fillStyle = p[1]; g.fillText(p[0], x, 96); x += g.measureText(p[0]).width + 4;
        });
        g.textAlign = 'right'; g.font = '700 22px ' + body; g.fillStyle = '#8fb4e8';
        g.fillText('VERIFIED RECORD', W - 70, 92);

        // name
        g.textAlign = 'left'; g.fillStyle = '#ffffff';
        let size = 104;
        const name = String(d.displayName || d.username || '').toUpperCase();
        do { g.font = '800 ' + size + 'px ' + disp; size -= 4; } while (g.measureText(name).width > W - 140 && size > 48);
        g.fillText(name, 68, 232);
        g.font = '600 30px ' + body; g.fillStyle = '#9db7dc';
        g.fillText('@' + d.username + '  ·  ' + d.total.toLocaleString('en-US') + ' graded picks', 70, 282);

        // tiles
        const units = Number(d.units) || 0;
        const tiles = [
            ['RECORD', d.wins + '-' + d.losses + (d.pushes ? '-' + d.pushes : ''), '#ffffff'],
            ['WIN RATE', Number(d.winRate).toFixed(1) + '%', '#5fd1ff'],
            ['NET UNITS', (units > 0 ? '+' : '') + units.toFixed(2) + 'u', units >= 0 ? '#3ddc84' : '#ff6b6b']
        ];
        const gap = 26, tw = (W - 140 - gap * 2) / 3, ty = 330, th = 190;
        tiles.forEach((t, i) => {
            const tx = 70 + i * (tw + gap);
            const tg = g.createLinearGradient(0, ty, 0, ty + th);
            tg.addColorStop(0, 'rgba(26,52,98,.92)'); tg.addColorStop(1, 'rgba(10,24,52,.92)');
            g.fillStyle = tg; roundRect(g, tx, ty, tw, th, 22); g.fill();
            g.strokeStyle = 'rgba(110,165,255,.45)'; g.lineWidth = 2; roundRect(g, tx, ty, tw, th, 22); g.stroke();
            g.textAlign = 'center';
            g.fillStyle = '#8fb4e8'; g.font = '700 24px ' + body; g.fillText(t[0], tx + tw / 2, ty + 52);
            let fs = 92;
            do { g.font = '800 ' + fs + 'px ' + disp; fs -= 4; } while (g.measureText(t[1]).width > tw - 40 && fs > 40);
            g.fillStyle = t[2]; g.fillText(t[1], tx + tw / 2, ty + 142);
        });

        // footer
        g.textAlign = 'left'; g.font = '600 24px ' + body; g.fillStyle = '#7f9cc8';
        const right = 'trustmyrecord.com  ·  ' + d.asOf;
        const room = W - 140 - g.measureText(right).width - 40;
        const left = ['Every pick locked before the game and graded by TrustMyRecord', 'Locked before the game. Graded by TrustMyRecord.', 'Graded by TrustMyRecord']
            .find(s => g.measureText(s).width <= room);
        if (left) g.fillText(left, 70, 574);
        g.textAlign = 'right'; g.fillStyle = '#c9dcf7';
        g.fillText(right, W - 70, 574);
        return cv;
    }

    function roundRect(g, x, y, w, h, r) {
        g.beginPath();
        g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }

    async function brag(btn) {
        const me = viewer();
        if (!me || !me.username) { needLogin(); return; }
        if (btn) { btn.disabled = true; }
        try {
            const data = await api.request('/users/' + encodeURIComponent(me.username));
            const u = (data && data.user) || {};
            const graded = num(u.wins) + num(u.losses) + num(u.pushes);
            if (!graded) { showComposerStatus('error', 'Your record card is ready once your first pick is graded.'); return; }
            try { await Promise.all([document.fonts.load('800 96px "Barlow Condensed"'), document.fonts.load('600 24px Inter')]); } catch (e) {}
            const cv = drawBrag({
                username: me.username,
                displayName: u.display_name || me.display_name || me.username,
                wins: num(u.wins), losses: num(u.losses), pushes: num(u.pushes),
                total: graded,
                winRate: num(u.win_rate),
                units: num(u.net_units),
                asOf: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            });
            const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
            if (!blob) throw new Error('no image');
            const file = new File([blob], 'my-record.png', { type: 'image/png' });
            if (typeof postType !== 'undefined' && postType === 'poll' && typeof toggleType === 'function') toggleType('poll');
            await fvAttachPhoto(file);
            const input = document.getElementById('compInput');
            if (input && !input.value.trim()) {
                input.value = 'My verified record on TrustMyRecord.';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const card = document.getElementById('composerCard');
            if (card) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
            if (input) input.focus();
        } catch (e) {
            showComposerStatus('error', 'Could not build your record card. Try again in a moment.');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function addBragButton() {
        const box = document.getElementById('sidebarMyStats');
        if (!box || box.querySelector('.fs-brag')) return;
        const cta = box.querySelector('.fv-rec-cta');
        if (!cta) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'fs-brag';
        b.innerHTML = '<i class="fas fa-share-nodes"></i> Share My Record';
        b.addEventListener('click', () => brag(b));
        cta.insertAdjacentElement('afterend', b);
    }

    // ------------------------------------------------- @mention suggestions
    // FEED_MENTION_SUGGEST_20261114: typing "@ke" in the composer lists members
    // whose username starts that way. Arrow keys move, Enter or Tab picks.
    const MENTION_TOKEN = /(^|[^A-Za-z0-9_@])@([A-Za-z0-9_]{1,30})$/;
    let mention = { list: null, rows: [], at: -1, active: 0, seq: 0, timer: null };

    function mentionToken(input) {
        const caret = input.selectionStart != null ? input.selectionStart : input.value.length;
        const m = MENTION_TOKEN.exec(input.value.slice(0, caret));
        return m ? { text: m[2], start: caret - m[2].length - 1, end: caret } : null;
    }

    function closeMentions() {
        mention.rows = [];
        mention.seq++;
        clearTimeout(mention.timer);
        if (mention.list) { mention.list.hidden = true; mention.list.innerHTML = ''; }
    }

    function paintMentions() {
        const list = mention.list;
        if (!list) return;
        if (!mention.rows.length) { list.hidden = true; list.innerHTML = ''; return; }
        list.innerHTML = mention.rows.map((r, i) =>
            '<button type="button" role="option" class="fs-mention-opt' + (i === mention.active ? ' is-active' : '') + '" aria-selected="' + (i === mention.active ? 'true' : 'false') + '" data-i="' + i + '">' +
            '<b>@' + esc(r.username) + '</b>' + (r.display_name && r.display_name !== r.username ? '<em>' + esc(r.display_name) + '</em>' : '') + '</button>').join('');
        list.hidden = false;
    }

    function pickMention(input, i) {
        const row = mention.rows[i];
        const tok = mentionToken(input);
        if (!row || !tok) { closeMentions(); return; }
        const insert = '@' + row.username + ' ';
        const next = input.value.slice(0, tok.start) + insert + input.value.slice(tok.end);
        closeMentions();
        if (next.length > 500) return;
        input.value = next;
        input.focus();
        input.selectionStart = input.selectionEnd = tok.start + insert.length;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function watchMentions(input) {
        const tok = mentionToken(input);
        if (!tok) { closeMentions(); return; }
        const seq = ++mention.seq;
        clearTimeout(mention.timer);
        mention.timer = setTimeout(async () => {
            try {
                const data = await api.request('/feed/mention-search?q=' + encodeURIComponent(tok.text));
                if (seq !== mention.seq) return; // a newer keystroke owns the list
                const now = mentionToken(input);
                if (!now || now.text !== tok.text) return;
                mention.rows = ((data && data.members) || []).filter(r => r && /^[A-Za-z0-9_]{2,30}$/.test(r.username)).slice(0, 6);
                mention.active = 0;
                paintMentions();
            } catch (e) { closeMentions(); }
        }, 160);
    }

    function bootMentions() {
        const input = document.getElementById('compInput');
        if (!input || mention.list) return;
        const list = document.createElement('div');
        list.id = 'fsMentionList';
        list.className = 'fs-mention-list';
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', 'Members');
        list.hidden = true;
        // under the composer's top row; the field itself is a single-line flex row
        const top = input.closest('.composer-top') || input;
        top.insertAdjacentElement('afterend', list);
        mention.list = list;
        input.addEventListener('input', () => watchMentions(input));
        input.addEventListener('click', () => watchMentions(input));
        input.addEventListener('blur', () => setTimeout(closeMentions, 180));
        input.addEventListener('keydown', e => {
            if (!mention.rows.length) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const n = mention.rows.length;
                mention.active = (mention.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
                paintMentions();
            } else if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
                e.preventDefault();
                e.stopImmediatePropagation();
                pickMention(input, mention.active);
            } else if (e.key === 'Escape') {
                e.stopPropagation();
                closeMentions();
            }
        }, true);
        list.addEventListener('mousedown', e => {
            const b = e.target.closest('.fs-mention-opt');
            if (!b) return;
            e.preventDefault(); // keep the caret in the box
            pickMention(input, Number(b.getAttribute('data-i')));
        });
    }

    // ------------------------------------------------------------------ wraps
    const ACTIONS = '<div class="fi-actions">';
    const COMMENT_BTN = '<button type="button" class="fi-action" onclick="toggleComments(';

    const baseText = window.renderTextPost;
    if (typeof baseText === 'function') {
        window.renderTextPost = function (item) {
            let html = baseText(item);
            try {
                const id = item.post_id || item.id || item.item_id;
                const real = /^\d+$/.test(String(id));
                if (real) items.set(String(id), item);
                if (Array.isArray(item.mentions) && item.mentions.length) {
                    html = html.replace(/(<div class="fi-content[^>]*>(?:<i class="fas fa-fire"><\/i>)?<span>)([\s\S]*?)(<\/span><\/div>)/,
                        (m, a, text, z) => a + linkMentions(text, item.mentions) + z);
                }
                const at = html.lastIndexOf(ACTIONS);
                if (at > -1) {
                    let tail = html.slice(at);
                    if (real) tail = tail.replace(COMMENT_BTN, disagreeBtn(id, item) + COMMENT_BTN);
                    html = html.slice(0, at) + quoteHtml(item.quoted) + tail;
                }
            } catch (e) {}
            return html;
        };
    }

    const basePick = window.renderPickCard;
    if (typeof basePick === 'function') {
        window.renderPickCard = function (item) {
            let html = basePick(item);
            try {
                const at = html.lastIndexOf(ACTIONS);
                const slot = stanceSlot(item);
                if (at > -1 && slot) html = html.slice(0, at) + slot + html.slice(at);
            } catch (e) {}
            return html;
        };
    }

    const baseMore = window.fvOpenMore;
    if (typeof baseMore === 'function') {
        window.fvOpenMore = function (ev, itemId) {
            const btn = ev && ev.currentTarget;
            baseMore(ev, itemId);
            try {
                const row = btn && btn.closest('.fi-actions');
                const card = btn && btn.closest('.feed-item');
                const menu = row && row.querySelector('.fv-menu--float');
                if (!menu || !card || card.dataset.type !== 'feed_post' || !items.has(String(itemId))) return;
                if (card.querySelector('.tmrp, [data-poll-id]')) return;
                const q = document.createElement('button');
                q.type = 'button';
                q.setAttribute('role', 'menuitem');
                q.innerHTML = '<i class="fas fa-quote-left"></i> Quote post';
                q.addEventListener('click', e => { e.stopPropagation(); startQuote(itemId); });
                menu.insertBefore(q, menu.firstChild);
            } catch (e) {}
        };
    }

    const baseSubmit = window.submitPost;
    window.submitPost = async function () {
        if (quote && (typeof postType === 'undefined' || postType !== 'poll')) {
            try { await submitQuote(); } finally { if (typeof fvSyncComposer === 'function') fvSyncComposer(); }
            return;
        }
        if (typeof baseSubmit === 'function') return baseSubmit.apply(this, arguments);
    };

    const baseLike = window.likeFeedPost;
    if (typeof baseLike === 'function') {
        window.likeFeedPost = function (id, btn) {
            const out = baseLike.apply(this, arguments);
            Promise.resolve(out).then(() => afterLike(btn), () => {});
            setTimeout(() => afterLike(btn), 900);
            return out;
        };
    }

    const baseStats = window.loadSidebarStats;
    if (typeof baseStats === 'function') {
        window.loadSidebarStats = async function () {
            const out = await baseStats.apply(this, arguments);
            try { addBragButton(); } catch (e) {}
            return out;
        };
    }

    function boot() {
        const list = document.getElementById('feedList');
        if (list && typeof MutationObserver === 'function') {
            new MutationObserver(() => {
                clearTimeout(hydrateTimer);
                hydrateTimer = setTimeout(hydrateStances, 60);
            }).observe(list, { childList: true });
        }
        hydrateStances();
        addBragButton();
        try { bootMentions(); } catch (e) {}
        const stats = document.getElementById('sidebarMyStats');
        if (stats && typeof MutationObserver === 'function') {
            new MutationObserver(() => { try { addBragButton(); } catch (e) {} }).observe(stats, { childList: true });
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

    window.TMRFeedSocial = {
        disagree, startQuote, clearQuote, brag,
        _mentionToken: mentionToken, _linkMentions: linkMentions, _quoteHtml: quoteHtml, _drawBrag: drawBrag, _hydrate: hydrateStances
    };
})();
