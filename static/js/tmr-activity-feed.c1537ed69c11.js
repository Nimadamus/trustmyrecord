/* =============================================================================
   LIVE ON TMR — homepage activity strip
   -----------------------------------------------------------------------------
   Shows ONE real thing that just happened on TrustMyRecord, then moves on to
   the next one. Every item comes from /api/activity: a registration, a batch of
   picks, a thread, a reply, a poll, a trivia round, a follow. Nothing on this
   strip is generated, sampled or filled in — if the site is quiet, the last
   real event simply stays put until a new one arrives.

   Delivery is the backend's SSE stream (Postgres LISTEN/NOTIFY behind it), so a
   pick graded anywhere on the site is on this strip about a second later. One
   connection, closed on unload. When that stream is unavailable — no
   EventSource, a `busy` refusal from a backend at its connection cap, or a
   proxy that swallows text/event-stream — a once-a-minute poll of the same
   backlog endpoint takes over, so the strip keeps refreshing for as long as
   the visitor is on the page instead of freezing on first paint.

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
  var BACKLOG = 28;            // recent events fetched on load — enough to cycle
  var MAX_QUEUE = 60;          // a burst can never grow the queue without bound
  var AGO_TICK_MS = 10000;     // "just now" -> "12 sec ago" while an item is up
  var FIRST_EVENT_GRACE_MS = 6000;
  var POLL_MS = 60000;         // fallback refresh when the stream is not up
  var BOOT_RETRY_MS = 20000;   // first fetch failed: try again before giving up
  var BOOT_RETRIES = 3;
  var MAX_SEEN = 400;          // the id set cannot grow for the life of a tab

  var root = null, slot = null;
  var queue = [];              // front = next to show
  var ring = [];               // every event we still hold, newest first — the loop
  var seen = Object.create(null);
  var current = null;          // { data, node }
  var rotateTimer = null, agoTimer = null, graceTimer = null;
  var stream = null, paused = false, dead = false;
  var pollTimer = null, streamOk = false, bootTries = 0;
  var seenCount = 0;
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
    stopPolling();
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

  /* A quiet site must not freeze the strip on whatever happened last. When the
     queue drains, the events we already hold go round again, oldest of them
     first, skipping the one on screen — so the only thing that can sit still is
     a site with a single event to show. Live events still arrive by SSE and
     jump the queue, so the loop always yields to something new. */
  function refill() {
    if (ring.length < 2) return;
    var id = current && current.data ? current.data.id : null;
    for (var i = ring.length - 1; i >= 0; i--) {
      if (ring[i].id !== id) queue.push(ring[i]);
    }
  }

  /* The backlog already arrives spread by the API, but live events jump the
     queue in whatever order they happen, so the same account can end up next
     to itself. Look a short way down the queue for someone else before giving
     up — never further, so this cannot bury a genuinely new event. */
  function nextIndex() {
    var lastUser = current && current.data && current.data.user ? current.data.user.id : null;
    if (lastUser == null) return 0;
    for (var i = 0; i < Math.min(4, queue.length); i++) {
      var u = queue[i].user ? queue[i].user.id : null;
      if (u !== lastUser) return i;
    }
    return 0;
  }

  function advance() {
    if (dead || paused || document.hidden) return;
    if (!queue.length) refill();
    if (!queue.length) return;         // one event, or none: it stays put
    show(queue.splice(nextIndex(), 1)[0]);
  }

  function enqueue(events, front) {
    if (!events || !events.length) return 0;
    var added = 0;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (!ev || !ev.id || seen[ev.id]) continue;   // an id is shown at most once
      /* The id set is the ONLY duplicate guard, so it is reset rather than
         trimmed: dropping arbitrary ids would let an old event back in, and a
         tab left open for a week would otherwise accumulate them forever. A
         reset can at worst re-admit something already dropped from the ring. */
      if (seenCount >= MAX_SEEN) { seen = Object.create(null); seenCount = 0; }
      seen[ev.id] = 1;
      seenCount++;
      if (front) { queue.unshift(ev); ring.unshift(ev); }
      else { queue.push(ev); ring.push(ev); }
      added++;
    }
    if (queue.length > MAX_QUEUE) queue.length = MAX_QUEUE;
    if (ring.length > MAX_QUEUE) ring.length = MAX_QUEUE;   // newest kept, oldest dropped
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

  /* ---- refresh without the stream ---------------------------------------
     SSE is the fast path, not the only one. It is unavailable in a browser
     with no EventSource, refused with an explicit `busy` frame when the
     backend is at its connection cap, and simply dead behind some corporate
     proxies that buffer text/event-stream to nothing. In every one of those
     cases the strip used to freeze on the backlog it loaded at first paint and
     stay frozen for as long as the visitor sat on the homepage.

     So: whenever the stream is not known to be up, poll the same backlog
     endpoint once a minute and take whatever ids are new. `seen` makes that
     idempotent — a poll that returns the same twenty-eight events adds
     nothing, and an event cannot be shown twice whichever path delivered it.
     The poll stops the moment the stream reports itself open. */
  function fetchRecent() {
    var opts = { headers: { Accept: 'application/json' } };
    try { opts.signal = AbortSignal.timeout(8000); } catch (e) {}
    return fetch(API + '/activity/recent?limit=' + BACKLOG, opts)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return (d && d.events) || []; });
  }

  function poll() {
    if (dead || document.hidden) return;
    fetchRecent().then(function (events) {
      if (dead || !events.length) return;
      /* Newest first on the wire; enqueue(front) unshifts, so hand it the
         oldest first and the newest ends up at the head of the queue. */
      var fresh = [];
      for (var i = events.length - 1; i >= 0; i--) {
        if (!seen[events[i].id]) fresh.push(events[i]);
      }
      if (!fresh.length) return;
      if (enqueue(fresh, true) && !current) advance();
      if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
    }).catch(function () { /* one failed poll changes nothing */ });
  }

  function startPolling() {
    if (dead || pollTimer) return;
    pollTimer = setInterval(poll, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  /* ---- realtime ---------------------------------------------------------- */
  function connect() {
    if (!window.EventSource) return startPolling();   // no stream: poll instead
    try {
      stream = new EventSource(API + '/activity/stream');
    } catch (e) { return startPolling(); }
    stream.onopen = function () { streamOk = true; stopPolling(); };
    stream.addEventListener('activity', function (msg) {
      try {
        var ev = JSON.parse(msg.data);
        streamOk = true;
        stopPolling();
        /* An event that arrives mid-animation goes to the FRONT of the queue,
           never on screen immediately: the item being read is never yanked. */
        if (enqueue([ev], true) && !current) advance();
        if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
      } catch (e) { /* one malformed frame must not kill the stream */ }
    });
    /* Explicit refusal: the backend is at capacity and told us to stop asking.
       Do not reconnect — fall back to polling for the rest of the visit. */
    stream.addEventListener('busy', function () {
      streamOk = false;
      closeStream();
      startPolling();
    });
    /* EventSource reconnects on its own and replays Last-Event-ID, which the
       backend answers with only what was missed — so a drop costs nothing and
       cannot duplicate. What it does NOT do is tell us it has given up in a
       way worth trusting, so any error arms the poll; a successful reconnect
       disarms it again on the next frame. */
    stream.onerror = function () {
      streamOk = false;
      startPolling();
    };
    /* A stream that never opens at all (buffered to death by a proxy) reports
       nothing. If it has not opened by the time the first poll would have run,
       assume it never will. */
    setTimeout(function () { if (!streamOk) startPolling(); }, 15000);
  }

  function wire() {
    /* Reading takes longer than five seconds sometimes; hovering or focusing
       holds the current item so it can be clicked. */
    root.addEventListener('mouseenter', function () { paused = true; });
    root.addEventListener('mouseleave', function () { paused = false; });
    root.addEventListener('focusin', function () { paused = true; });
    root.addEventListener('focusout', function () { paused = false; });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      if (current && current.node && current.node.__ago) {
        current.node.__ago.textContent = timeAgo(current.node.__at);
      }
      /* Back from another tab. If the stream carried us through, its events
         are already queued; if it did not, this is the catch-up. */
      if (!streamOk) poll();
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
    load();
  }

  /* A cold Render instance answers the first request of the day in ten or
     fifteen seconds, and the abort above is set at eight. Treating that as
     "this site has no activity" and deleting the strip for the whole visit was
     wrong: retry a few times, quietly, and only then give the width back. */
  function load() {
    fetchRecent()
      .then(function (events) {
        if (dead) return;
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
      .catch(function () {
        if (dead) return;
        if (++bootTries > BOOT_RETRIES) return collapse();
        graceTimer = setTimeout(load, BOOT_RETRY_MS);
      });
  }

  /* AFTER THE PAGE IS PAINTED (2026-08-25). This strip's backlog request is the
     heaviest thing the homepage asks for - 20 events measured at ~484KB - and
     it was fired at DOMContentLoaded, alongside the slate behind the ticker and
     the bootstrap behind the stats stripe and the competition card. On a phone
     connection those three shared one pipe and the strip's payload, which
     nobody is looking at in the first second, was winning bandwidth from the
     two that are.

     Nothing is removed: the same backlog, the same rotation, the same live
     stream. It simply starts once the page has finished loading and the main
     thread is idle, which on a warm connection is a few hundred milliseconds
     later and is not visible - the strip has its own reserved lane and fades
     its first item in either way. */
  function start() {
    try { boot(); } catch (e) { collapse(); }
  }
  function whenIdle() {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 1500 });
    else setTimeout(start, 200);
  }
  try {
    if (document.readyState === 'complete') whenIdle();
    else window.addEventListener('load', whenIdle, { once: true });
  } catch (e) { collapse(); }
})();
