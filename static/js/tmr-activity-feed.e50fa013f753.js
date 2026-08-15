/* =============================================================================
   LIVE ON TMR — homepage activity strip
   -----------------------------------------------------------------------------
   Shows ONE real thing that just happened on TrustMyRecord, then moves on to
   the next one. Every item comes from /api/activity: a registration, a batch of
   picks, a thread, a reply, a poll, a trivia round, a follow. Nothing on this
   strip is generated, sampled or filled in — if the site is quiet, the last
   real event simply stays put until a new one arrives.

   Delivery is the backend's SSE stream (Postgres LISTEN/NOTIFY behind it), so a
   pick entered anywhere on the site is on this strip about a second later with
   no polling at all. One connection, closed on unload.

   Everything here is defensive on purpose: this module shares a row with the
   sports ticker, and the ticker is the part that matters. Any failure — no
   endpoint, no stream, no events, a thrown exception — ends in the strip
   removing itself and giving its width back. It never blocks, never spins
   forever, and never touches a node it does not own.
   ============================================================================= */
(function () {
  'use strict';

  /* One instance per document, whatever happens: a re-executed bundle, a
     double <script>, a framework that mounts twice. A second boot would mean
     two EventSource connections and two rotation timers on one node. */
  if (window.__tmrActivityFeedBooted) return;
  window.__tmrActivityFeedBooted = true;

  var API = window.TMR_API_BASE || 'https://trustmyrecord-api.onrender.com/api';
  var ROTATE_MS = 5000;        // dwell time on each item
  var ANIM_MS = 240;           // must match the CSS transition
  var BACKLOG = 8;             // recent events fetched on load — a strip, not a log
  var MAX_QUEUE = 40;          // a burst can never grow the queue without bound
  var AGO_TICK_MS = 10000;     // "just now" -> "12 sec ago" while an item is up
  var FIRST_EVENT_GRACE_MS = 6000;

  var root = null, slot = null;
  var queue = [];              // front = next to show
  var seen = Object.create(null);
  var current = null;          // { data, node }
  var rotateTimer = null, agoTimer = null, graceTimer = null;
  var stream = null, paused = false, dead = false;
  var reduced = false;
  try {
    reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  function collapse() {
    dead = true;
    stopTimers();
    closeStream();
    if (root) root.hidden = true;
  }

  function stopTimers() {
    if (rotateTimer) { clearInterval(rotateTimer); rotateTimer = null; }
    if (agoTimer) { clearInterval(agoTimer); agoTimer = null; }
    if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
  }

  function closeStream() {
    if (stream) { try { stream.close(); } catch (e) {} stream = null; }
  }

  /* ---- formatting -------------------------------------------------------- */
  function timeAgo(iso) {
    var t = Date.parse(iso);
    if (!t) return '';
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 0) s = 0;
    if (s < 8) return 'just now';
    if (s < 60) return s + ' sec ago';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
    return Math.floor(s / 86400) + ' d ago';
  }

  function initials(name) {
    return String(name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
  }

  /* The site's existing avatar treatment: the stored URL if there is one, the
     API's avatar route otherwise, and the initials tile when neither resolves.
     Built as nodes, never as an HTML string — a username is user input. */
  function avatarNode(user) {
    var box = document.createElement('span');
    box.className = 'tkact-av';
    var text = initials(user && user.username);
    box.textContent = text;
    var src = (user && user.avatar_url) || (user && user.id ? API + '/users/' + user.id + '/avatar' : '');
    if (!src) return box;
    var img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', function () {
      if (img.parentNode) img.parentNode.removeChild(img);
      box.textContent = text;
    });
    img.addEventListener('load', function () { box.textContent = ''; box.appendChild(img); });
    img.src = src;
    return box;
  }

  function buildItem(ev) {
    var node = document.createElement(ev.href ? 'a' : 'div');
    node.className = 'tkact-item is-in';
    if (ev.href) {
      node.href = ev.href;
      node.setAttribute('aria-label', (ev.user && ev.user.username ? ev.user.username + ': ' : '') + ev.text);
    }

    node.appendChild(avatarNode(ev.user));

    var txt = document.createElement('span');
    txt.className = 'tkact-txt';

    var who = document.createElement('span');
    who.className = 'tkact-who';
    var name = document.createElement('b');
    name.textContent = (ev.user && ev.user.username) || 'Someone';
    name.title = name.textContent;          // a truncated handle is still readable
    who.appendChild(name);

    /* No favourite team set is the common case, and it simply omits — no
       placeholder, no empty separator. */
    if (ev.team && ev.team.abbr) {
      var team = document.createElement('span');
      team.className = 'tkact-team';
      if (ev.team.logo) {
        var logo = document.createElement('img');
        logo.alt = '';
        logo.loading = 'lazy';
        logo.decoding = 'async';
        logo.addEventListener('error', function () {
          if (logo.parentNode) logo.parentNode.removeChild(logo);
        });
        logo.src = ev.team.logo;
        team.appendChild(logo);
      }
      /* The abbreviation is the part that gives way first on a narrow desktop
         (see the 1439px rule): the mark alone still says who they root for. */
      var abbr = document.createElement('i');
      abbr.className = 'tkact-abbr';
      abbr.textContent = ev.team.abbr;
      team.appendChild(abbr);
      team.title = ev.team.name || ev.team.abbr;
      who.appendChild(team);
    }

    var ago = document.createElement('span');
    ago.className = 'tkact-ago';
    ago.textContent = timeAgo(ev.created_at);
    who.appendChild(ago);

    var act = document.createElement('span');
    act.className = 'tkact-act';
    act.textContent = ev.text || '';
    act.title = ev.text || '';

    txt.appendChild(who);
    txt.appendChild(act);
    node.appendChild(txt);
    node.__ago = ago;
    node.__at = ev.created_at;
    return node;
  }

  /* ---- rotation ---------------------------------------------------------- */
  function show(ev) {
    var node = buildItem(ev);
    var old = current;
    /* The "LIVE ON TMR" label only appears once there is something real under
       it — a heading over an empty slot reads as broken. The box has held its
       width since first paint either way, so nothing moves when it arrives. */
    if (root) root.classList.add('is-ready');
    slot.appendChild(node);
    /* Next frame, so the browser has painted the entering state before the
       transition to the resting state begins. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { node.classList.remove('is-in'); });
    });
    if (old && old.node) {
      old.node.classList.add('is-out');
      setTimeout(function () {
        if (old.node && old.node.parentNode) old.node.parentNode.removeChild(old.node);
      }, reduced ? 0 : ANIM_MS);
    }
    current = { data: ev, node: node };
  }

  function advance() {
    if (dead || paused || document.hidden) return;
    if (!queue.length) return;         // nothing new: the last real event stays
    show(queue.shift());
  }

  function enqueue(events, front) {
    if (!events || !events.length) return 0;
    var added = 0;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (!ev || !ev.id || seen[ev.id]) continue;   // an id is shown at most once
      seen[ev.id] = 1;
      if (front) queue.unshift(ev); else queue.push(ev);
      added++;
    }
    if (queue.length > MAX_QUEUE) queue.length = MAX_QUEUE;
    return added;
  }

  function startRotation() {
    if (rotateTimer) return;
    rotateTimer = setInterval(advance, ROTATE_MS);
    agoTimer = setInterval(function () {
      if (current && current.node && current.node.__ago) {
        current.node.__ago.textContent = timeAgo(current.node.__at);
      }
    }, AGO_TICK_MS);
  }

  /* ---- realtime ---------------------------------------------------------- */
  function connect() {
    if (!window.EventSource) return;              // backlog-only, still fine
    try {
      stream = new EventSource(API + '/activity/stream');
    } catch (e) { return; }
    stream.addEventListener('activity', function (msg) {
      try {
        var ev = JSON.parse(msg.data);
        /* An event that arrives mid-animation goes to the FRONT of the queue,
           never on screen immediately: the item being read is never yanked. */
        if (enqueue([ev], true) && !current) advance();
        if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
      } catch (e) { /* one malformed frame must not kill the stream */ }
    });
    stream.addEventListener('busy', function () { closeStream(); });
    /* EventSource reconnects on its own and replays Last-Event-ID, which the
       backend answers with only what was missed — so a drop costs nothing and
       cannot duplicate. Nothing to do here but stay quiet. */
    stream.onerror = function () {};
  }

  function wire() {
    /* Reading takes longer than five seconds sometimes; hovering or focusing
       holds the current item so it can be clicked. */
    root.addEventListener('mouseenter', function () { paused = true; });
    root.addEventListener('mouseleave', function () { paused = false; });
    root.addEventListener('focusin', function () { paused = true; });
    root.addEventListener('focusout', function () { paused = false; });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && current && current.node && current.node.__ago) {
        current.node.__ago.textContent = timeAgo(current.node.__at);
      }
    });
    /* No leaked connection, no timer running in a page in the back/forward
       cache. */
    window.addEventListener('pagehide', function () { stopTimers(); closeStream(); });
  }

  function boot() {
    root = document.getElementById('tmrActivity');
    if (!root) return;
    slot = root.querySelector('.tkact-slot');
    if (!slot) return collapse();

    wire();

    var url = API + '/activity/recent?limit=' + BACKLOG;
    var opts = { headers: { Accept: 'application/json' } };
    try { opts.signal = AbortSignal.timeout(8000); } catch (e) {}

    fetch(url, opts)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (dead) return;
        var events = (d && d.events) || [];
        if (enqueue(events, false)) {
          advance();                    // first item paints immediately
          startRotation();
          connect();
        } else {
          /* No qualifying activity yet. Keep the stream open briefly in case
             something happens while the visitor is here; if nothing does, the
             strip removes itself rather than sitting there empty. */
          startRotation();
          connect();
          graceTimer = setTimeout(function () {
            if (!current) collapse();
          }, FIRST_EVENT_GRACE_MS);
        }
      })
      .catch(function () { collapse(); });
  }

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        try { boot(); } catch (e) { collapse(); }
      });
    } else {
      boot();
    }
  } catch (e) { collapse(); }
})();
