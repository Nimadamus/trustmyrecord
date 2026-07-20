/* ===================================================================
   TMR Forum Image Upload  (FORUM_IMAGE_PASTE_20260720)

   Seamless images in every forum composer:
     * Ctrl+V / Cmd+V a screenshot straight into the box
     * drag a file onto the box
     * "Add Image" button -> device file picker (camera roll on mobile)

   The file is re-encoded in the browser, uploaded to
   POST /api/forum/images as raw bytes, and the returned URL is written
   into the textarea at the cursor as [img]...[/img] -- the same BBCode
   the forum renderer, the static thread pages and the profile activity
   previews already understand. The member never sees, types, or pastes
   a URL.

   API:
     TMRForumImages.attach(textarea)   idempotent, safe to call repeatedly

   Requires window.api (backend-api.js) for the auth token.
=================================================================== */
(function () {
  if (window.TMRForumImages) return;

  var ACCEPT = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  var ACCEPT_LABEL = 'PNG, JPG, GIF or WebP';
  // Ceiling on what we will even try to send. The server enforces 6MB; this is
  // the pre-downscale gate so a 40MP phone photo fails fast and locally.
  var MAX_SOURCE_BYTES = 25 * 1024 * 1024;
  var MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
  // Re-encode target. A 4K screenshot at 1600px/q0.82 lands around 200-400KB,
  // which is what keeps the (1 GB, shared) Postgres disk viable at all.
  var MAX_EDGE = 1600;
  var JPEG_QUALITY = 0.82;
  // Animated formats must never go through <canvas> -- it would flatten them to
  // a single still frame. They upload as-is (and are size-checked as-is).
  var NEVER_REENCODE = { 'image/gif': 1, 'image/webp': 1 };
  var MAX_CONCURRENT = 3;

  var seq = 0;
  var inFlight = 0;
  var queue = [];

  /* ---------------- css ---------------- */
  function injectCSS() {
    if (document.getElementById('tmr-fimg-css')) return;
    var s = document.createElement('style');
    s.id = 'tmr-fimg-css';
    s.textContent =
      '.tmr-fimg-btn{cursor:pointer;border:1px solid #aaa;background:#f4f4f4;color:#222;border-radius:4px;'
    + 'padding:2px 8px;font-size:13px;line-height:1.5}'
    + '.tmr-fimg-btn:hover{background:#e7eef7}'
    + '.tmr-fimg-btn[disabled]{opacity:.6;cursor:default}'
    + '.tmr-fimg-hint{font-size:11px;color:#78889c;margin:3px 0 0}'
    + '.tmr-fimg-tray{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 0}'
    + '.tmr-fimg-tray:empty{display:none}'
    + '.tmr-fimg-item{position:relative;width:104px;border:1px solid #c8d2df;border-radius:6px;background:#fff;'
    + 'padding:5px;box-sizing:border-box;font:11px Arial,Helvetica,sans-serif;color:#455}'
    + '.tmr-fimg-item img{display:block;width:100%;height:66px;object-fit:cover;border-radius:4px;background:#eef2f7}'
    + '.tmr-fimg-bar{height:4px;border-radius:3px;background:#dde4ee;margin-top:5px;overflow:hidden}'
    + '.tmr-fimg-bar i{display:block;height:100%;width:0;background:#2f6fb5;transition:width .15s linear}'
    + '.tmr-fimg-label{margin-top:3px;line-height:1.3;word-break:break-word}'
    + '.tmr-fimg-item.is-error{border-color:#c0392b;background:#fdf3f2;color:#a3271b}'
    + '.tmr-fimg-item.is-error .tmr-fimg-bar i{background:#c0392b;width:100%}'
    + '.tmr-fimg-item.is-done{border-color:#2f8f57}'
    + '.tmr-fimg-x{position:absolute;top:-7px;right:-7px;width:19px;height:19px;border-radius:50%;border:1px solid #96a4b6;'
    + 'background:#fff;color:#556;font-size:13px;line-height:1;cursor:pointer;padding:0}'
    + '.tmr-fimg-x:hover{background:#ffe9e6;border-color:#c0392b;color:#c0392b}'
    + '.tmr-fimg-drop{outline:2px dashed #2f6fb5!important;outline-offset:-3px;background:#eef4fb!important}'
    /* dark forum redesign theme (matches .tmr-emoji-* overrides) */
    + 'body.tmr-forum-live-redesign .tmr-fimg-btn{background:#16283f;border-color:#2a4a72;color:#e8eef7}'
    + 'body.tmr-forum-live-redesign .tmr-fimg-btn:hover{background:#1b3a5c}'
    + 'body.tmr-forum-live-redesign .tmr-fimg-item{background:#0d1a2b;border-color:#2a4a72;color:#cfe0f4}'
    + 'body.tmr-forum-live-redesign .tmr-fimg-x{background:#16283f;border-color:#2a4a72;color:#cfe0f4}'
    + 'body.tmr-forum-live-redesign .tmr-fimg-drop{background:#12263d!important}'
    + '@media (max-width:640px){.tmr-fimg-item{width:88px}.tmr-fimg-item img{height:56px}}';
    document.head.appendChild(s);
  }

  /* ---------------- textarea helpers ---------------- */
  // Insert at the caret without disturbing the rest of the draft, and keep the
  // caret after the inserted text so the member can keep typing.
  function insertAtCursor(el, text) {
    var s = el.selectionStart, e = el.selectionEnd, v = el.value;
    if (typeof s === 'number') {
      el.value = v.slice(0, s) + text + v.slice(e);
      var pos = s + text.length;
      try { el.selectionStart = el.selectionEnd = pos; } catch (err) {}
    } else {
      el.value = v + text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // While an upload is running, the post holds a placeholder token. It is
  // swapped for the real BBCode on success and removed on failure/cancel, so a
  // half-finished upload can never be submitted as a broken tag. The token is
  // deliberately not valid BBCode, so even a submit mid-upload degrades to
  // visible text rather than a broken image.
  function tokenFor(id) { return '{{tmr-image-' + id + '}}'; }

  function replaceToken(el, id, replacement) {
    var tok = tokenFor(id);
    var i = el.value.indexOf(tok);
    if (i === -1) return false;
    var caret = el.selectionStart;
    el.value = el.value.slice(0, i) + replacement + el.value.slice(i + tok.length);
    if (typeof caret === 'number' && caret >= i) {
      var pos = Math.max(0, caret + (replacement.length - tok.length));
      try { el.selectionStart = el.selectionEnd = pos; } catch (err) {}
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  /* ---------------- client-side re-encode ---------------- */
  function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Could not read that file.')); };
      r.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('That file is not a readable image.')); };
      img.src = src;
    });
  }

  function canvasToBlob(canvas, mime, q) {
    return new Promise(function (resolve) {
      if (canvas.toBlob) canvas.toBlob(function (b) { resolve(b); }, mime, q);
      else resolve(null);
    });
  }

  // Returns {blob, mime}. Falls back to the original bytes whenever re-encoding
  // is impossible or would make the file bigger (already-optimised small PNGs).
  async function prepare(file) {
    var mime = String(file.type || '').toLowerCase();
    if (NEVER_REENCODE[mime]) return { blob: file, mime: mime };
    var dataUrl, img;
    try {
      dataUrl = await readAsDataURL(file);
      img = await loadImage(dataUrl);
    } catch (e) {
      return { blob: file, mime: mime };
    }
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if (!w || !h) return { blob: file, mime: mime };
    var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    var tw = Math.max(1, Math.round(w * scale));
    var th = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = tw; canvas.height = th;
    var ctx = canvas.getContext('2d');
    if (!ctx) return { blob: file, mime: mime };
    // PNG screenshots are usually flat UI with hard edges; JPEG at q0.82 still
    // reads cleanly and is 5-15x smaller. White backfill because JPEG has no
    // alpha channel and transparent pixels would otherwise go black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(img, 0, 0, tw, th);
    var out = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);
    if (!out || (out.size >= file.size && scale === 1)) return { blob: file, mime: mime };
    return { blob: out, mime: 'image/jpeg' };
  }

  /* ---------------- upload ---------------- */
  // Raw XHR bypasses backend-api.js's request(), and with it the proactive
  // refresh that keeps a 60-minute access token alive. An image upload is
  // exactly the kind of thing a member does after sitting on a thread for an
  // hour, so mirror that refresh here or every long session 401s.
  async function authToken() {
    try {
      if (window.api) {
        if (typeof api.loadTokens === 'function') api.loadTokens();
        if (api.refreshToken && typeof api.isAccessTokenExpired === 'function'
          && api.isAccessTokenExpired() && typeof api.refreshAccessToken === 'function') {
          try { await api.refreshAccessToken(); } catch (e) {}
        }
        if (api.token) return api.token;
      }
    } catch (e) {}
    var keys = ['trustmyrecord_token', 'accessToken', 'access_token', 'token', 'tmr_token'];
    for (var i = 0; i < keys.length; i++) {
      try { var v = localStorage.getItem(keys[i]); if (v) return v; } catch (e) {}
    }
    return null;
  }

  function apiBase() {
    // api.baseUrl reflects any fallback the client already failed over to.
    try {
      if (window.api && api.baseUrl) return String(api.baseUrl).replace(/\/+$/, '');
    } catch (e) {}
    try {
      if (window.CONFIG && CONFIG.api && CONFIG.api.baseUrl) return String(CONFIG.api.baseUrl).replace(/\/+$/, '');
    } catch (e) {}
    return 'https://trustmyrecord-api.onrender.com/api';
  }

  // XHR, not fetch: fetch still has no upload-progress event, and a visible
  // percentage is the whole point of the progress state on a slow phone.
  async function putBytes(blob, mime, onProgress, onXhr) {
    var token = await authToken();
    if (!token) throw new Error('Please log in again to upload images.');
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', apiBase() + '/forum/images', true);
      xhr.setRequestHeader('Content-Type', mime);
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.timeout = 120000;
      if (xhr.upload) {
        xhr.upload.onprogress = function (ev) {
          if (ev.lengthComputable) onProgress(ev.loaded / ev.total);
        };
      }
      xhr.onload = function () {
        var data = null;
        try { data = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300 && data && data.url) { resolve(data); return; }
        var e = new Error((data && data.error) || ('Upload failed (HTTP ' + xhr.status + ')'));
        if (xhr.status === 401) e.authExpired = true;
        reject(e);
      };
      xhr.onerror = function () { reject(new Error('Network error during upload.')); };
      xhr.ontimeout = function () { reject(new Error('Upload timed out. Check your connection.')); };
      xhr.onabort = function () { reject(new Error('Upload cancelled.')); };
      // Hand the live request back so the tray's X can abort it. Passed per
      // call rather than parked in a module variable, which would cross wires
      // between concurrent uploads.
      if (onXhr) onXhr(xhr);
      xhr.send(blob);
    });
  }

  /* ---------------- per-textarea controller ---------------- */
  function attach(el) {
    if (!el || el.dataset.tmrFimg) return;
    el.dataset.tmrFimg = '1';
    injectCSS();

    var tray = document.createElement('div');
    tray.className = 'tmr-fimg-tray';
    var hint = document.createElement('div');
    hint.className = 'tmr-fimg-hint';
    hint.textContent = 'Paste a screenshot with Ctrl+V, drop an image here, or use Add Image. ' + ACCEPT_LABEL + ', up to 6MB.';
    // Tray + hint sit directly under the box they belong to, so a composer that
    // is rebuilt (reply area, inline edit box) carries them along or drops them
    // together with the textarea.
    if (el.parentNode) {
      if (el.nextSibling) { el.parentNode.insertBefore(tray, el.nextSibling); }
      else { el.parentNode.appendChild(tray); }
      el.parentNode.insertBefore(hint, tray);
    }

    var fileIn = document.createElement('input');
    fileIn.type = 'file';
    fileIn.accept = ACCEPT.join(',');
    fileIn.multiple = true;
    fileIn.style.display = 'none';
    if (el.parentNode) el.parentNode.appendChild(fileIn);
    fileIn.onchange = function () {
      var files = Array.prototype.slice.call(fileIn.files || []);
      fileIn.value = '';
      files.forEach(function (f) { handleFile(el, tray, f); });
    };

    // Button goes into the emoji toolbar when there is one, so the composer
    // keeps a single row of controls instead of sprouting a second bar.
    function placeButton() {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tmr-fimg-btn';
      btn.innerHTML = '&#128247; Add Image';
      btn.title = 'Upload an image from this device';
      btn.onclick = function (ev) { ev.stopPropagation(); fileIn.click(); };
      var bar = el.parentNode && el.parentNode.querySelector('.tmr-emoji-bar');
      if (bar) bar.appendChild(btn);
      else if (el.parentNode) el.parentNode.insertBefore(btn, hint);
    }
    // The emoji bar is attached by a deferred script; wait a tick for it so the
    // button lands in the bar rather than orphaned above the hint.
    if (el.parentNode && el.parentNode.querySelector('.tmr-emoji-bar')) placeButton();
    else setTimeout(placeButton, 0);

    el.addEventListener('paste', function (ev) {
      var files = filesFromDataTransfer(ev.clipboardData);
      if (!files.length) return;
      // Only swallow the paste when it really carried an image. A normal text
      // paste (including "copy image address") must behave exactly as before.
      ev.preventDefault();
      files.forEach(function (f) { handleFile(el, tray, f); });
    });

    var dragDepth = 0;
    function hasFiles(dt) {
      if (!dt) return false;
      if (dt.types) {
        for (var i = 0; i < dt.types.length; i++) if (dt.types[i] === 'Files') return true;
      }
      return false;
    }
    el.addEventListener('dragenter', function (ev) {
      if (!hasFiles(ev.dataTransfer)) return;
      ev.preventDefault(); dragDepth++; el.classList.add('tmr-fimg-drop');
    });
    el.addEventListener('dragover', function (ev) {
      if (!hasFiles(ev.dataTransfer)) return;
      ev.preventDefault();
      try { ev.dataTransfer.dropEffect = 'copy'; } catch (e) {}
    });
    el.addEventListener('dragleave', function () {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) el.classList.remove('tmr-fimg-drop');
    });
    el.addEventListener('drop', function (ev) {
      if (!hasFiles(ev.dataTransfer)) return;
      ev.preventDefault();
      dragDepth = 0; el.classList.remove('tmr-fimg-drop');
      filesFromDataTransfer(ev.dataTransfer).forEach(function (f) { handleFile(el, tray, f); });
    });
  }

  function filesFromDataTransfer(dt) {
    var out = [];
    if (!dt) return out;
    var items = dt.items;
    if (items && items.length) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind !== 'file') continue;
        var f = items[i].getAsFile();
        if (f) out.push(f);
      }
    }
    if (!out.length && dt.files && dt.files.length) {
      for (var j = 0; j < dt.files.length; j++) out.push(dt.files[j]);
    }
    // Anything non-image in a mixed drop is ignored rather than erroring, so
    // dragging a folder of mixed files still uploads the pictures.
    return out.filter(function (f) { return f && /^image\//i.test(f.type || ''); });
  }

  /* ---------------- tray item ---------------- */
  function makeItem(tray, name) {
    var it = document.createElement('div');
    it.className = 'tmr-fimg-item';
    it.innerHTML = '<img alt="">'
      + '<div class="tmr-fimg-bar"><i></i></div>'
      + '<div class="tmr-fimg-label"></div>'
      + '<button type="button" class="tmr-fimg-x" title="Remove">&times;</button>';
    tray.appendChild(it);
    var api = {
      el: it,
      thumb: it.querySelector('img'),
      bar: it.querySelector('.tmr-fimg-bar i'),
      label: it.querySelector('.tmr-fimg-label'),
      x: it.querySelector('.tmr-fimg-x'),
      setProgress: function (p) { api.bar.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; },
      setLabel: function (t) { api.label.textContent = t; },
      fail: function (msg) { it.classList.add('is-error'); api.setLabel(msg); },
      done: function () { it.classList.add('is-done'); api.setProgress(1); api.setLabel('Added'); },
      remove: function () { if (it.parentNode) it.parentNode.removeChild(it); },
    };
    api.setLabel(name);
    return api;
  }

  /* ---------------- the actual flow ---------------- */
  function handleFile(el, tray, file) {
    var mime = String(file.type || '').toLowerCase();
    var name = file.name || 'pasted image';
    if (ACCEPT.indexOf(mime) === -1) {
      var bad = makeItem(tray, name);
      bad.fail('Unsupported file type. Use ' + ACCEPT_LABEL + '.');
      bad.x.onclick = bad.remove;
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      var big = makeItem(tray, name);
      big.fail('That file is too large (max 25MB before compression).');
      big.x.onclick = big.remove;
      return;
    }

    var id = 'u' + (++seq) + Date.now().toString(36);
    insertAtCursor(el, tokenFor(id));

    var item = makeItem(tray, 'Preparing…');
    try {
      var url = URL.createObjectURL(file);
      item.thumb.src = url;
      item.thumb.onload = function () { try { URL.revokeObjectURL(url); } catch (e) {} };
    } catch (e) {}

    var cancelled = false;
    var liveXhr = null;
    item.x.onclick = function () {
      cancelled = true;
      if (liveXhr) { try { liveXhr.abort(); } catch (e) {} }
      replaceToken(el, id, '');
      item.remove();
    };

    function run() {
      inFlight++;
      (async function () {
        try {
          item.setLabel('Compressing…');
          var prepped = await prepare(file);
          if (cancelled) throw new Error('cancelled');
          if (prepped.blob.size > MAX_UPLOAD_BYTES) {
            throw new Error('That image is too large. Max size is 6MB.');
          }
          item.setLabel('Uploading… 0%');
          function send() {
            return putBytes(prepped.blob, prepped.mime, function (p) {
              item.setProgress(p * 0.98);
              item.setLabel('Uploading… ' + Math.round(p * 100) + '%');
            }, function (x) { liveXhr = x; });
          }
          var res;
          try {
            res = await send();
          } catch (e1) {
            // One retry after a forced refresh: the access token can expire in
            // the seconds between the pre-flight check and the upload finishing.
            if (!e1 || !e1.authExpired || cancelled) throw e1;
            try {
              if (window.api && api.refreshToken && typeof api.refreshAccessToken === 'function') {
                await api.refreshAccessToken();
              }
            } catch (e) {}
            res = await send();
          }
          if (cancelled) throw new Error('cancelled');
          replaceToken(el, id, '\n[img]' + res.url + '[/img]\n');
          item.done();
          // The X on a finished upload pulls the BBCode back out of the draft.
          item.x.onclick = function () {
            var tag = '[img]' + res.url + '[/img]';
            var i = el.value.indexOf(tag);
            if (i !== -1) {
              el.value = el.value.slice(0, i) + el.value.slice(i + tag.length);
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            item.remove();
          };
        } catch (err) {
          replaceToken(el, id, '');
          if (!cancelled) {
            item.fail((err && err.message) || 'Upload failed. Please try again.');
            item.x.onclick = item.remove;
          }
        } finally {
          inFlight--;
          var next = queue.shift();
          if (next) next();
        }
      })();
    }

    if (inFlight >= MAX_CONCURRENT) { item.setLabel('Queued…'); queue.push(run); }
    else run();
  }

  window.TMRForumImages = { attach: attach, v: 1 };

  // The composers in /forum/ are built by page script; each calls attach()
  // explicitly. This only covers the new-thread box, which exists in the
  // static markup.
  function init() {
    var nt = document.getElementById('ntContent');
    if (nt) attach(nt);
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
