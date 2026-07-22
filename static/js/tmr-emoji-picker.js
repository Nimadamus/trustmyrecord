/* ===================================================================
   TMR Emoji Picker v2  (Jul 11, 2026)
   Full forum emoji library: 1,897 Unicode emojis in 9 category tabs
   + Betting tab + 129 animated GIF reactions + 199 classic shortcodes,
   with search, recent/frequent, keyboard navigation and lazy loading.

   Art: Twemoji 15.1 (CC-BY 4.0, (c) Twitter/jdecked contributors) for
   consistent cross-device rendering; Google Noto Animated Emoji
   (CC-BY 4.0, fonts.gstatic.com) for the animated reactions tab.
   Data: /static/js/tmr-emoji-data.js (names from Unicode CLDR, MIT).

   API (backwards compatible with v1):
     TMREmoji.attach(textarea, opts)  - add emoji/media bar to a textarea
       opts: { media:true, anim:true } (pass false to disable per page)
     TMREmoji.insert(el, text)        - insert text at cursor
     TMREmoji.watch(rootNode)         - render all emojis in posted content
                                        as Twemoji images (keeps rendering
                                        consistent on every device)
=================================================================== */
(function () {
  if (window.TMREmoji && window.TMREmoji.v2) return;

  var VER = '20260722a';
  var TW_JS = '/static/js/twemoji.min.js?v=20260711b';
  var DATA_JS = '/static/js/tmr-emoji-data.js?v=20260711b';
  var SMILIE_JS = '/static/js/tmr-smilies.js?v=' + VER;
  var NOTO = 'https://fonts.gstatic.com/s/e/notoemoji/latest/';
  var TW_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/';
  var LS_RECENT = 'tmrEmojiRecent2';
  var LS_FREQ = 'tmrEmojiFreq2';

  /* ---------- script lazy-loaders ---------- */
  var loading = {};
  function loadScript(src, cb) {
    if (loading[src] === true) { cb && cb(); return; }
    if (loading[src]) { loading[src].push(cb); return; }
    loading[src] = [cb];
    var s = document.createElement('script');
    s.src = src;
    s.onload = function () {
      var q = loading[src]; loading[src] = true;
      (q || []).forEach(function (f) { f && f(); });
    };
    s.onerror = function () { loading[src] = false; };
    document.head.appendChild(s);
  }
  function withData(cb) {
    if (window.TMR_EMOJI_DATA) { cb(); return; }
    loadScript(DATA_JS, function () { if (window.TMR_EMOJI_DATA) cb(); });
  }
  function withTwemoji(cb) {
    if (window.twemoji) { cb(); return; }
    loadScript(TW_JS, function () { if (window.twemoji) cb(); });
  }
  function withSmilies(cb) {
    if (window.TMRSmilies) { cb(); return; }
    loadScript(SMILIE_JS, function () { cb(); });
  }

  /* ---------- consistent rendering of posted content ---------- */
  function parseNode(node) {
    if (!window.twemoji || !node) return;
    try {
      twemoji.parse(node, { folder: '72x72', ext: '.png', base: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/' });
    } catch (e) {}
  }
  var watchTimer = null, watchRoots = [];
  function watch(root) {
    root = root || document.body;
    if (watchRoots.indexOf(root) !== -1) return;
    watchRoots.push(root);
    withTwemoji(function () {
      parseNode(root);
      var mo = new MutationObserver(function (muts) {
        var dirty = false;
        for (var i = 0; i < muts.length; i++) {
          var t = muts[i].target;
          if (t && t.closest && t.closest('.tmr-emoji-panel,.tmr-emoji-bar,textarea,input')) continue;
          dirty = true; break;
        }
        if (!dirty) return;
        clearTimeout(watchTimer);
        watchTimer = setTimeout(function () {
          watchRoots.forEach(function (r) {
            // re-parse only content areas, never the picker itself
            parseNode(r);
          });
        }, 180);
      });
      mo.observe(root, { childList: true, subtree: true });
    });
  }

  /* ---------- css ---------- */
  function injectCSS() {
    if (document.getElementById('tmr-emoji-css')) return;
    var s = document.createElement('style');
    s.id = 'tmr-emoji-css';
    s.textContent =
      'img.emoji{height:1.25em;width:1.25em;margin:0 .06em;vertical-align:-0.28em;display:inline-block;border:0;background:none;box-shadow:none;cursor:inherit}'
    + '.fpost-media img.emoji{max-height:1.25em}'
    /* animated reactions inside posts: render inline at reaction size */
    + '.fpost-media:has(> img[src*="fonts.gstatic.com/s/e/notoemoji"]){display:inline-block;margin:0 3px;vertical-align:middle}'
    + '.fpost-media img[src*="fonts.gstatic.com/s/e/notoemoji"]{width:56px;height:56px;border:none;background:none;cursor:default;border-radius:0}'
    + '.tmr-emoji-bar{display:flex;align-items:center;gap:6px;margin:4px 0 4px;flex-wrap:wrap}'
    + '.tmr-emoji-open,.tmr-media-btn{cursor:pointer;border:1px solid #aaa;background:#f4f4f4;color:#222;border-radius:4px;padding:2px 8px;font-size:13px;line-height:1.5}'
    + '.tmr-emoji-open:hover,.tmr-media-btn:hover{background:#e7eef7}'
    + '.tmr-emoji-quick{cursor:pointer;line-height:1;padding:2px;border-radius:4px;display:inline-flex}'
    + '.tmr-emoji-quick img{width:19px;height:19px;display:block}'
    + '.tmr-emoji-quick:hover{background:#e7eef7}'
    + '.tmr-emoji-panel{position:fixed;z-index:99999;width:400px;max-width:96vw;display:flex;flex-direction:column;'
    + 'background:#fff;border:1px solid #99a;border-radius:10px;box-shadow:0 10px 34px rgba(0,0,0,.32);'
    + 'font:13px Arial,Helvetica,sans-serif;color:#222;overflow:hidden}'
    + '.tmr-emoji-head{display:flex;align-items:center;justify-content:space-between;padding:7px 10px 0}'
    + '.tmr-emoji-title{font-weight:700;font-size:12px;color:#345}'
    + '.tmr-emoji-close{cursor:pointer;border:none;background:transparent;font-size:16px;line-height:1;color:#667;padding:2px 6px}'
    + '.tmr-emoji-tabs{display:flex;overflow-x:auto;border-bottom:1px solid #ddd;background:#f6f7f9;scrollbar-width:thin}'
    + '.tmr-emoji-tab{flex:0 0 auto;cursor:pointer;padding:7px 9px;border:none;background:transparent;display:flex;align-items:center}'
    + '.tmr-emoji-tab img{width:19px;height:19px;display:block;pointer-events:none}'
    + '.tmr-emoji-tab span{font-size:12px;font-weight:700;pointer-events:none}'
    + '.tmr-emoji-tab.on{background:#dbe7f5;box-shadow:inset 0 -2px 0 #14365b}'
    + '.tmr-emoji-search{padding:7px 8px 4px}.tmr-emoji-search input{width:100%;box-sizing:border-box;'
    + 'padding:6px 8px;border:1px solid #bbb;border-radius:5px;font-size:13px}'
    + '.tmr-emoji-secname{grid-column:1/-1;font-size:11px;font-weight:700;color:#567;text-transform:uppercase;'
    + 'letter-spacing:.4px;padding:6px 2px 2px}'
    + '.tmr-emoji-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:2px;padding:6px 8px;'
    + 'height:300px;max-height:44vh;overflow-y:auto;overscroll-behavior:contain;align-content:start}'
    + '.tmr-emoji-cell{cursor:pointer;text-align:center;padding:5px 0;border:none;background:transparent;border-radius:6px;'
    + 'display:flex;align-items:center;justify-content:center;min-height:38px}'
    + '.tmr-emoji-cell img{width:26px;height:26px;display:block;pointer-events:none}'
    + '.tmr-emoji-cell:hover,.tmr-emoji-cell:focus{background:#e7eef7;outline:2px solid #4a7dbd;outline-offset:-2px}'
    + '.tmr-emoji-grid.anim{grid-template-columns:repeat(auto-fill,minmax(62px,1fr))}'
    + '.tmr-emoji-grid.anim .tmr-emoji-cell{min-height:64px}'
    + '.tmr-emoji-grid.anim .tmr-emoji-cell img{width:52px;height:52px}'
    /* board smilies: bigger cells, animated GIFs render at natural size */
    + '.tmr-emoji-grid.smilies{grid-template-columns:repeat(auto-fill,minmax(48px,1fr))}'
    + '.tmr-emoji-grid.smilies .tmr-emoji-cell{min-height:48px}'
    + '.tmr-emoji-cell img.tmr-sm{width:auto;height:auto;max-width:40px;max-height:40px}'
    + '.tmr-emoji-grid.classic{grid-template-columns:repeat(auto-fill,minmax(88px,1fr))}'
    + '.tmr-emoji-grid.classic .tmr-emoji-cell{flex-direction:column;gap:2px;font-size:11px;color:#456;border:1px solid #e4e8ee;min-height:52px}'
    + '.tmr-emoji-empty{grid-column:1/-1;color:#789;text-align:center;padding:18px 6px;font-size:12px}'
    + '.tmr-emoji-foot{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e2e6ec;'
    + 'padding:4px 10px;font-size:10.5px;color:#8a97a8;background:#fafbfc}'
    + '@media (max-width:640px){.tmr-emoji-panel{left:2vw!important;right:2vw;width:96vw;top:auto!important;bottom:0;'
    + 'border-radius:12px 12px 0 0;max-height:70vh}.tmr-emoji-grid{max-height:38vh}}'
    /* dark forum redesign theme */
    + 'body.tmr-forum-live-redesign .tmr-emoji-panel{background:#0d1a2b;color:#e8eef7;border-color:#2a4a72}'
    + 'body.tmr-forum-live-redesign .tmr-emoji-title{color:#cfe0f4}'
    + 'body.tmr-forum-live-redesign .tmr-emoji-tabs{background:#10233a;border-color:#1d3a5a}'
    + 'body.tmr-forum-live-redesign .tmr-emoji-tab.on{background:#1b3a5c}'
    + 'body.tmr-forum-live-redesign .tmr-emoji-cell:hover,body.tmr-forum-live-redesign .tmr-emoji-cell:focus,'
    + 'body.tmr-forum-live-redesign .tmr-emoji-quick:hover{background:#1b3a5c}'
    + 'body.tmr-forum-live-redesign .tmr-emoji-open,body.tmr-forum-live-redesign .tmr-media-btn{background:#16283f;border-color:#2a4a72;color:#e8eef7}'
    + 'body.tmr-forum-live-redesign .tmr-emoji-open:hover,body.tmr-forum-live-redesign .tmr-media-btn:hover{background:#1b3a5c}'
    + 'body.tmr-forum-live-redesign .tmr-emoji-search input{background:#0a1422;border-color:#2a4a72;color:#e8eef7}'
    + 'body.tmr-forum-live-redesign .tmr-emoji-grid.classic .tmr-emoji-cell{border-color:#1d3a5a;color:#9fb4cd}'
    + 'body.tmr-forum-live-redesign .tmr-emoji-secname{color:#8fa9c8}'
    + 'body.tmr-forum-live-redesign .tmr-emoji-foot{background:#0a1422;border-color:#1d3a5a;color:#6d84a1}';
    document.head.appendChild(s);
  }

  /* ---------- insertion ---------- */
  function insertAtCursor(el, text) {
    if (!el) return;
    el.focus();
    var s = el.selectionStart, e = el.selectionEnd, v = el.value;
    if (typeof s === 'number') {
      el.value = v.slice(0, s) + text + v.slice(e);
      var pos = s + text.length;
      el.selectionStart = el.selectionEnd = pos;
    } else {
      el.value = v + text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* ---------- recent / frequent ---------- */
  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function noteUse(item) { // item = {t:'u'|'a', v:char|animCode, n:name, f:twemojiFile}
    var rec = lsGet(LS_RECENT, []);
    rec = rec.filter(function (r) { return r.v !== item.v; });
    rec.unshift(item);
    lsSet(LS_RECENT, rec.slice(0, 36));
    var fq = lsGet(LS_FREQ, {});
    var key = item.t + '|' + item.v;
    fq[key] = (fq[key] || 0) + 1;
    lsSet(LS_FREQ, fq);
  }
  function frequentItems() {
    var fq = lsGet(LS_FREQ, {});
    var rec = lsGet(LS_RECENT, []);
    var byKey = {};
    rec.forEach(function (r) { byKey[r.t + '|' + r.v] = r; });
    return Object.keys(fq)
      .filter(function (k) { return byKey[k]; })
      .sort(function (a, b) { return fq[b] - fq[a]; })
      .slice(0, 18)
      .map(function (k) { return byKey[k]; });
  }

  /* ---------- panel ---------- */
  var openPanel = null;
  function closePanel() { if (openPanel) { openPanel.remove(); openPanel = null; } }
  document.addEventListener('click', function (ev) {
    if (openPanel && !openPanel.contains(ev.target) && !ev.target.closest('.tmr-emoji-open')) closePanel();
  });
  window.addEventListener('resize', closePanel);
  window.addEventListener('scroll', function (ev) {
    if (openPanel && ev.target && openPanel.contains(ev.target)) return;
    closePanel();
  }, true);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && openPanel) { closePanel(); }
  });

  function twImg(file, name, cls) {
    var i = document.createElement('img');
    i.src = TW_BASE + file + '.png';
    i.alt = name || '';
    i.loading = 'lazy';
    i.decoding = 'async';
    if (cls) i.className = cls;
    return i;
  }

  function makeCell(title, onPick) {
    var c = document.createElement('button');
    c.type = 'button';
    c.className = 'tmr-emoji-cell';
    c.title = title;
    c.setAttribute('aria-label', title);
    c.tabIndex = -1;
    c.addEventListener('click', function () { onPick(); });
    return c;
  }

  // Chunked append so 300+ cell tabs never jank the main thread.
  function appendChunked(grid, nodes) {
    var i = 0, gen = grid._gen = (grid._gen || 0) + 1;
    (function step() {
      if (gen !== grid._gen) return; // tab switched mid-render
      var end = Math.min(i + 120, nodes.length);
      var frag = document.createDocumentFragment();
      for (; i < end; i++) frag.appendChild(nodes[i]);
      grid.appendChild(frag);
      if (i < nodes.length) requestAnimationFrame(step);
    })();
  }

  function cellsForUnicode(list, target) {
    return list.map(function (it) {
      var ch = it[0], name = it[1], file = it[2];
      var c = makeCell(name, function () {
        insertAtCursor(target, ch);
        noteUse({ t: 'u', v: ch, n: name, f: file });
      });
      c.appendChild(twImg(file, name));
      return c;
    });
  }
  function cellsForAnim(list, target, allowBB) {
    return list.map(function (it) {
      var name = it[0], code = it[1];
      var c = makeCell(name + ' (animated)', function () {
        if (!allowBB) return;
        insertAtCursor(target, ' [img]' + NOTO + code + '/512.gif[/img] ');
        noteUse({ t: 'a', v: code, n: name });
      });
      var i = document.createElement('img');
      i.src = NOTO + code + '/512.gif';
      i.alt = name; i.loading = 'lazy'; i.decoding = 'async';
      c.appendChild(i);
      return c;
    });
  }
  // Board smilies (Covers/SBR-style animated GIF pack). Inserts the :shortcode:
  // so posts stay readable and editable; forumRenderContent expands it.
  function cellsForSmilies(list, target) {
    return list.map(function (s) {
      var file = s[0], code = s[1], label = s[2];
      var c = makeCell(label + '  :' + code + ':', function () {
        insertAtCursor(target, ' :' + code + ': ');
        noteUse({ t: 's', v: code, n: label, f: file });
      });
      var i = document.createElement('img');
      i.src = window.TMRSmilies.url(file);
      i.alt = label; i.loading = 'lazy'; i.decoding = 'async';
      i.className = 'tmr-sm';
      c.appendChild(i);
      return c;
    });
  }
  function cellsForClassic(list, target) {
    return list.map(function (pair) {
      var code = pair[0], ch = pair[1];
      var c = makeCell(code, function () {
        insertAtCursor(target, ch);
        noteUse({ t: 'u', v: ch, n: code, f: null });
      });
      var big = document.createElement('span');
      big.textContent = ch;
      big.style.fontSize = '19px';
      c.appendChild(big);
      var lbl = document.createElement('span');
      lbl.textContent = code;
      c.appendChild(lbl);
      parseNode(c);
      return c;
    });
  }
  function secName(txt) {
    var d = document.createElement('div');
    d.className = 'tmr-emoji-secname';
    d.textContent = txt;
    d.tabIndex = -1;
    return d;
  }

  function buildTabList(D, allowAnim) {
    var tabs = [{ id: 'recent', name: 'Recently & frequently used', label: '🕘' }];
    if (window.TMRSmilies) tabs.push({ id: 'smilies', name: 'Board smilies (classic forum pack)', label: 'BOARD', text: true });
    D.tabs.forEach(function (t) { tabs.push({ id: t.id, name: t.name, label: t.icon }); });
    tabs.push({ id: 'betting', name: 'Betting & winning', label: '💰' });
    if (allowAnim) tabs.push({ id: 'anim', name: 'Animated reactions', label: 'GIF', text: true });
    tabs.push({ id: 'classic', name: 'Classic emoticons & shortcodes', label: ':-)', text: true });
    return tabs;
  }

  function renderTab(grid, D, tabId, target, allowAnim) {
    grid._gen = (grid._gen || 0) + 1;
    grid.className = 'tmr-emoji-grid' + (tabId === 'anim' ? ' anim' : tabId === 'classic' ? ' classic' : tabId === 'smilies' ? ' smilies' : '');
    grid.innerHTML = '';
    grid.scrollTop = 0;
    var nodes = [];
    if (tabId === 'recent') {
      var freq = frequentItems(), rec = lsGet(LS_RECENT, []);
      if (!freq.length && !rec.length) {
        var d = document.createElement('div');
        d.className = 'tmr-emoji-empty';
        d.textContent = 'Emojis you use will show up here.';
        nodes.push(d);
      }
      function recCells(list) {
        return list.map(function (r) {
          if (r.t === 'a') return cellsForAnim([[r.n, r.v]], target, allowAnim)[0];
          if (r.t === 's') {
            if (!window.TMRSmilies) return document.createTextNode('');
            return cellsForSmilies([[r.f, r.v, r.n, '']], target)[0];
          }
          var c = makeCell(r.n || r.v, function () {
            insertAtCursor(target, r.v);
            noteUse(r);
          });
          if (r.f) c.appendChild(twImg(r.f, r.n));
          else { c.textContent = r.v; c.style.fontSize = '19px'; parseNode(c); }
          return c;
        });
      }
      if (freq.length) { nodes.push(secName('Frequently used')); nodes = nodes.concat(recCells(freq)); }
      if (rec.length) { nodes.push(secName('Recently used')); nodes = nodes.concat(recCells(rec)); }
    } else if (tabId === 'smilies') {
      var S = window.TMRSmilies;
      S.GROUPS.forEach(function (g) {
        var inGroup = S.LIST.filter(function (s) { return s[3] === g; });
        if (!inGroup.length) return;
        nodes.push(secName(g));
        nodes = nodes.concat(cellsForSmilies(inGroup, target));
      });
    } else if (tabId === 'betting') {
      nodes = cellsForUnicode(D.betting, target);
    } else if (tabId === 'anim') {
      nodes = cellsForAnim(D.anim, target, allowAnim);
    } else if (tabId === 'classic') {
      nodes = cellsForClassic(D.classic, target);
    } else {
      nodes = cellsForUnicode(D.cats[tabId] || [], target);
    }
    appendChunked(grid, nodes);
  }

  function searchAll(D, q, target, allowAnim, grid) {
    grid._gen = (grid._gen || 0) + 1;
    grid.className = 'tmr-emoji-grid';
    grid.innerHTML = '';
    q = q.toLowerCase();
    var nodes = [], seen = {};
    // board smilies first -- they are what people hunt for by name
    if (window.TMRSmilies) {
      var sm = window.TMRSmilies.LIST.filter(function (s) {
        return s[1].indexOf(q) !== -1 || s[2].toLowerCase().indexOf(q) !== -1;
      }).slice(0, 60);
      if (sm.length) {
        nodes.push(secName('Board smilies'));
        nodes = nodes.concat(cellsForSmilies(sm, target));
        nodes.push(secName('Emojis'));
      }
    }
    // classic shortcode exact-ish matches first
    var cl = D.classic.filter(function (p) { return p[0].toLowerCase().indexOf(q) !== -1; }).slice(0, 24);
    if (cl.length) {
      grid.className = 'tmr-emoji-grid classic';
      nodes.push(secName('Shortcodes'));
      nodes = nodes.concat(cellsForClassic(cl, target));
      nodes.push(secName('Emojis'));
    }
    var uni = [];
    Object.keys(D.cats).forEach(function (k) {
      D.cats[k].forEach(function (it) {
        if (uni.length > 400) return;
        var hay = (it[1] + ' ' + (it[3] || '')).toLowerCase();
        if (hay.indexOf(q) !== -1 && !seen[it[0]]) { seen[it[0]] = 1; uni.push(it); }
      });
    });
    D.betting.forEach(function (it) {
      if (it[1].toLowerCase().indexOf(q) !== -1 && !seen[it[0]]) { seen[it[0]] = 1; uni.push(it); }
    });
    nodes = nodes.concat(cellsForUnicode(uni, target));
    if (allowAnim) {
      var an = D.anim.filter(function (a) { return a[0].toLowerCase().indexOf(q) !== -1; });
      if (an.length) {
        nodes.push(secName('Animated'));
        nodes = nodes.concat(cellsForAnim(an, target, allowAnim));
      }
    }
    if (!nodes.length) {
      var d = document.createElement('div');
      d.className = 'tmr-emoji-empty';
      d.textContent = 'No emojis found for "' + q + '"';
      nodes.push(d);
    }
    appendChunked(grid, nodes);
  }

  function gridKeyNav(grid, searchInput) {
    grid.addEventListener('keydown', function (ev) {
      var cells = Array.prototype.filter.call(grid.children, function (n) { return n.classList.contains('tmr-emoji-cell'); });
      if (!cells.length) return;
      var idx = cells.indexOf(document.activeElement);
      var cols = Math.max(1, Math.floor(grid.clientWidth / (cells[0].offsetWidth + 2)));
      var next = null;
      if (ev.key === 'ArrowRight') next = idx + 1;
      else if (ev.key === 'ArrowLeft') next = idx - 1;
      else if (ev.key === 'ArrowDown') next = idx + cols;
      else if (ev.key === 'ArrowUp') { if (idx - cols < 0) { searchInput.focus(); ev.preventDefault(); return; } next = idx - cols; }
      else return;
      ev.preventDefault();
      if (next === null || idx === -1) next = 0;
      next = Math.max(0, Math.min(cells.length - 1, next));
      cells[next].focus();
      cells[next].scrollIntoView({ block: 'nearest' });
    });
  }

  function openFor(btn, target, opts) {
    closePanel();
    injectCSS();
    withTwemoji(function () { withData(function () { withSmilies(function () {
      if (openPanel) return;
      var D = window.TMR_EMOJI_DATA;
      var allowAnim = opts.anim !== false;
      var tabs = buildTabList(D, allowAnim);
      var panel = document.createElement('div');
      panel.className = 'tmr-emoji-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Emoji picker');

      var head = document.createElement('div');
      head.className = 'tmr-emoji-head';
      head.innerHTML = '<span class="tmr-emoji-title">Emojis & Reactions</span>';
      var close = document.createElement('button');
      close.type = 'button'; close.className = 'tmr-emoji-close';
      close.innerHTML = '✕'; close.title = 'Close'; close.setAttribute('aria-label', 'Close emoji picker');
      close.onclick = closePanel;
      head.appendChild(close);
      panel.appendChild(head);

      var tabBar = document.createElement('div');
      tabBar.className = 'tmr-emoji-tabs';
      tabBar.setAttribute('role', 'tablist');
      panel.appendChild(tabBar);

      var searchWrap = document.createElement('div');
      searchWrap.className = 'tmr-emoji-search';
      var search = document.createElement('input');
      search.type = 'text';
      search.placeholder = 'Search emojis, reactions, :shortcodes:';
      search.setAttribute('aria-label', 'Search emojis');
      searchWrap.appendChild(search);
      panel.appendChild(searchWrap);

      var grid = document.createElement('div');
      grid.className = 'tmr-emoji-grid';
      grid.setAttribute('role', 'listbox');
      panel.appendChild(grid);

      var total = Object.keys(D.cats).reduce(function (a, k) { return a + D.cats[k].length; }, 0)
        + D.anim.length + D.classic.length
        + (window.TMRSmilies ? window.TMRSmilies.LIST.length : 0);
      var foot = document.createElement('div');
      foot.className = 'tmr-emoji-foot';
      foot.innerHTML = '<span>' + total + '+ emojis & reactions</span><span>Twemoji · Noto Animated (CC-BY 4.0)</span>';
      panel.appendChild(foot);

      var current = 'recent';
      var tabEls = {};
      tabs.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tmr-emoji-tab';
        b.title = t.name;
        b.setAttribute('aria-label', t.name);
        b.setAttribute('role', 'tab');
        if (t.text) b.innerHTML = '<span>' + t.label + '</span>';
        else b.appendChild(twImg(twemojiFileOf(t.label), t.name));
        b.onclick = function () {
          current = t.id;
          Object.keys(tabEls).forEach(function (k) { tabEls[k].classList.remove('on'); });
          b.classList.add('on');
          search.value = '';
          renderTab(grid, D, t.id, target, allowAnim);
        };
        tabEls[t.id] = b;
        tabBar.appendChild(b);
      });
      tabEls.recent.classList.add('on');

      var debounce = null;
      search.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          var q = search.value.trim();
          if (!q) renderTab(grid, D, current, target, allowAnim);
          else searchAll(D, q, target, allowAnim, grid);
        }, 120);
      });
      search.addEventListener('keydown', function (ev) {
        if (ev.key === 'ArrowDown' || ev.key === 'Enter') {
          var first = grid.querySelector('.tmr-emoji-cell');
          if (first) { ev.preventDefault(); first.focus(); }
        }
      });
      gridKeyNav(grid, search);

      document.body.appendChild(panel);
      renderTab(grid, D, 'recent', target, allowAnim);

      // position: under the button, clamped to viewport (desktop);
      // CSS pins it as a bottom sheet on small screens.
      if (window.innerWidth > 640) {
        var r = btn.getBoundingClientRect();
        var W = 400, H = Math.min(430, window.innerHeight * 0.8);
        var left = Math.max(6, Math.min(r.left, window.innerWidth - W - 10));
        var top = r.bottom + 6;
        if (top + H > window.innerHeight) top = Math.max(6, r.top - H - 6);
        panel.style.top = top + 'px';
        panel.style.left = left + 'px';
      }
      openPanel = panel;
      if (window.innerWidth > 640) setTimeout(function () { search.focus(); }, 0);
    }); }); });
  }

  // Compute a twemoji filename for a single emoji char (tab icons only).
  function twemojiFileOf(ch) {
    var cps = [];
    for (var i = 0; i < ch.length;) {
      var cp = ch.codePointAt(i);
      cps.push(cp);
      i += cp > 0xFFFF ? 2 : 1;
    }
    if (cps.indexOf(0x200D) === -1) cps = cps.filter(function (c) { return c !== 0xFE0F; });
    return cps.map(function (c) { return c.toString(16); }).join('-');
  }

  /* ---------- media buttons (unchanged behavior from v1) ---------- */
  var MEDIA = [
    { tag: 'img', icon: '🖼️', label: 'Image', hint: 'Insert an image by URL', prompt: 'Paste an image URL (.jpg .png .webp):' },
    { tag: 'gif', icon: '🎞️', label: 'GIF', hint: 'Insert a GIF by URL (Giphy/Tenor/.gif)', prompt: 'Paste a GIF URL or Giphy/Tenor link:' },
    { tag: 'video', icon: '🎬', label: 'Video', hint: 'Insert a video (YouTube or .mp4/.webm)', prompt: 'Paste a YouTube link or a direct video URL (.mp4 .webm):' }
  ];

  var QUICK = [
    ['🔥', '1f525'], ['💰', '1f4b0'], ['👍', '1f44d'], ['😂', '1f602'],
    ['😭', '1f62d'], ['🤑', '1f911'], ['🎯', '1f3af'], ['🚀', '1f680']
  ];

  function attach(el, opts) {
    if (!el || el.dataset.tmrEmoji) return;
    el.dataset.tmrEmoji = '1';
    opts = opts || {};
    injectCSS();
    var bar = document.createElement('div');
    bar.className = 'tmr-emoji-bar';
    var open = document.createElement('button');
    open.type = 'button';
    open.className = 'tmr-emoji-open';
    open.innerHTML = '😀 Emoji';
    open.title = 'Open the emoji picker';
    open.onclick = function (e) {
      e.stopPropagation();
      if (openPanel) closePanel();
      else openFor(open, el, opts);
    };
    bar.appendChild(open);
    parseNode(open);
    QUICK.forEach(function (q) {
      var s = document.createElement('button');
      s.type = 'button';
      s.className = 'tmr-emoji-quick';
      s.title = 'Insert ' + q[0];
      s.setAttribute('aria-label', 'Insert ' + q[0]);
      s.appendChild(twImg(q[1], q[0]));
      s.onclick = function () {
        insertAtCursor(el, q[0]);
        noteUse({ t: 'u', v: q[0], n: q[0], f: q[1] });
      };
      bar.appendChild(s);
    });
    if (opts.media !== false) {
      MEDIA.forEach(function (md) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tmr-media-btn';
        b.innerHTML = md.icon + ' ' + md.label;
        b.title = md.hint;
        b.onclick = function (ev) {
          ev.stopPropagation();
          var url = window.prompt(md.prompt, 'https://');
          if (!url) return;
          url = url.trim();
          if (!/^https?:\/\//i.test(url)) { alert('Please paste a full http(s) link.'); return; }
          insertAtCursor(el, '\n[' + md.tag + ']' + url + '[/' + md.tag + ']\n');
        };
        bar.appendChild(b);
      });
      // Upload Video -> Cloudflare Stream (needs the forum backend api client)
      if (window.api && api.request) (function () {
        var UPLOAD_LABEL = '📤 Upload Video';
        var MAX_BYTES = 200 * 1024 * 1024;
        var up = document.createElement('button');
        up.type = 'button';
        up.className = 'tmr-media-btn';
        up.innerHTML = UPLOAD_LABEL;
        up.title = 'Upload a video file from your device (max 200MB)';
        var fileIn = document.createElement('input');
        fileIn.type = 'file';
        fileIn.accept = 'video/*';
        fileIn.style.display = 'none';
        function setState(txt, busy) {
          up.innerHTML = txt;
          up.disabled = !!busy;
          up.style.opacity = busy ? '.65' : '';
        }
        up.onclick = function (ev) {
          ev.stopPropagation();
          if (up.disabled) return;
          if (typeof isUserLoggedIn === 'function' && !isUserLoggedIn()) { window.location.href = '/login/'; return; }
          fileIn.click();
        };
        fileIn.onchange = function () {
          var f = fileIn.files && fileIn.files[0];
          fileIn.value = '';
          if (!f) return;
          if (f.size > MAX_BYTES) { alert('That video is too large. Max size is 200MB.'); return; }
          uploadVideo(f);
        };
        async function uploadVideo(f) {
          try {
            setState('⏳ Preparing…', true);
            var t = await api.request('/forum/video-upload-url', { method: 'POST' });
            if (!t || !t.uploadURL || !t.uid) throw new Error((t && t.error) || 'no upload URL');
            setState('⏳ Uploading…', true);
            var fd = new FormData();
            fd.append('file', f);
            var resp = await fetch(t.uploadURL, { method: 'POST', body: fd });
            if (!resp.ok) throw new Error('upload failed (HTTP ' + resp.status + ')');
            setState('⏳ Processing…', true);
            for (var i = 0; i < 100; i++) {
              await new Promise(function (r) { setTimeout(r, 3000); });
              var st = null;
              try { st = await api.request('/forum/video-status/' + encodeURIComponent(t.uid)); } catch (e) {}
              if (st && st.error) throw new Error(st.error);
              if (st && st.ready) break;
            }
            insertAtCursor(el, '\n[video]https://iframe.cloudflarestream.com/' + t.uid + '[/video]\n');
            setState(UPLOAD_LABEL, false);
          } catch (e) {
            setState(UPLOAD_LABEL, false);
            alert('Video upload failed: ' + ((e && e.message) || 'unknown error') + '. Please try again.');
          }
        }
        bar.appendChild(up);
        bar.appendChild(fileIn);
      })();
    }
    // opts.barBefore: insert the toolbar before a different element (e.g. a
    // flex input row) instead of directly before the textarea.
    var anchor = opts.barBefore || el;
    anchor.parentNode.insertBefore(bar, anchor);
  }

  window.TMREmoji = { attach: attach, insert: insertAtCursor, watch: watch, v2: true };

  function init() {
    injectCSS();
    var nt = document.getElementById('ntContent');
    if (nt) attach(nt);
    watch(document.body);
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
