/* =============================================================================
   LIVE ON TMR — homepage activity strip
   -----------------------------------------------------------------------------
   Shows ONE real thing that just happened on TrustMyRecord, then moves on to
   the next one. Every item comes from /api/activity: a pick landing, a streak,
   a units or ROI milestone, a simulation, a registration, a batch of picks, a
   thread, a reply, a poll, a trivia round, a contest entry, a listing, a
   follow. Nothing on this strip is generated, sampled or filled in — if the
   site is quiet, the last real event simply stays put until a new one arrives.
   The SERVER owns the sentence and the destination, so a new activity type is
   a backend-only change and this file never needs to learn a new verb.

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
  var REFRESH_MS = 300000;     // backlog re-read, stream up or not (see startRotation)
  var STALE_MS = 24 * 3600 * 1000;   // how far back the loop is allowed to cycle
  var BOOT_RETRY_MS = 20000;   // first fetch failed: try again before giving up
  var BOOT_RETRIES = 3;
  var MAX_SEEN = 400;          // the id set cannot grow for the life of a tab

  var root = null, slot = null;
  var queue = [];              // front = next to show
  var ring = [];               // every event we still hold, newest first — the loop
  /* id -> freshness (ms) of the copy we hold, NOT a boolean. An event row can
     be rewritten in place by the backend, keeping its id; the freshness marker
     is the only way to tell "already have this" from "have a stale version of
     this". See enqueue(). */
  var seen = Object.create(null);
  var seenOld = Object.create(null);   // previous generation, see enqueue()
  var current = null;          // { data, node }
  var rotateTimer = null, agoTimer = null, graceTimer = null;
  var stream = null, paused = false, dead = false;
  var pollTimer = null, refreshTimer = null, streamOk = false, bootTries = 0;
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
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
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

  /* NO INITIALS, AND THE IMAGE GOES IN IMMEDIATELY (2026-09-08).
     This painted the member's two letters first and only replaced them when the
     picture fired `load` - except the <img> was built DETACHED and marked
     loading="lazy", and a lazy image that is not in the document never starts
     loading. So `load` never fired, the letters never cleared, and "Live on TMR"
     sat there showing FA and WI while every other surface on the site showed a
     face. That is the bug Nima kept seeing after the rest was fixed.

     The image is attached up front now, and the letters are never drawn at all:
     the avatar route always answers with that member's assigned portrait, and if
     the network is down the slot stays empty rather than falling back to the one
     thing this site does not print. */
  function avatarNode(user) {
    var box = document.createElement('span');
    box.className = 'tkact-av';
    var key = (user && user.id) || (user && user.username) || '';
    var src = (user && user.avatar_url)
      || (key !== '' ? API + '/users/' + encodeURIComponent(key) + '/avatar' : '');
    if (!src) return box;
    var img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.src = src;
    box.appendChild(img);
    return box;
  }

  /* A signup is the one event on this strip that is about the PERSON rather
     than about something they did, so it gets its own shape: the announcement
     as the headline, then the member themselves under it. Everything else on
     the strip keeps the sentence layout the server writes. The slot height is
     unchanged - two lines either way - so the ticker row never moves. */
  function welcomeItem(ev) {
    var name = (ev.user && ev.user.username) || 'a new member';
    var node = document.createElement(ev.href ? 'a' : 'div');
    node.className = 'tkact-item tkact-welcome is-in';
    if (ev.href) {
      node.href = ev.href;
      node.setAttribute('aria-label', 'Welcome to our newest member, ' + name);
    }

    var wrap = document.createElement('span');
    wrap.className = 'tkact-wrap';

    var head = document.createElement('span');
    head.className = 'tkact-hail';
    head.textContent = 'Welcome to our newest member';

    var ago = document.createElement('span');
    ago.className = 'tkact-ago';
    ago.textContent = timeAgo(ev.created_at);
    head.appendChild(ago);

    var row = document.createElement('span');
    row.className = 'tkact-mem';
    row.appendChild(avatarNode(ev.user));      // same resolver: upload, then API route, then initials
    var who = document.createElement('b');
    who.textContent = name;
    who.title = name;
    row.appendChild(who);

    wrap.appendChild(head);
    wrap.appendChild(row);
    node.appendChild(wrap);
    node.__ago = ago;
    node.__at = ev.created_at;
    return node;
  }

  function buildItem(ev) {
    if (ev && ev.type === 'user_joined') return welcomeItem(ev);
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
    /* The loop cycles the RECENT events it holds, not everything it has ever
       held. Without this a visitor who leaves the homepage open long enough
       watches yesterday come back round on a five second timer while today's
       events are sitting in the same ring. The whole ring is still used when
       there is nothing fresh enough to rotate through, so a genuinely quiet
       site keeps a strip instead of freezing on one line. */
    var cutoff = Date.now() - STALE_MS;
    var fresh = [];
    for (var i = 0; i < ring.length; i++) {
      if ((Date.parse(ring[i].created_at) || 0) >= cutoff) fresh.push(ring[i]);
    }
    /* Two is the minimum needed to rotate at all, so that is the bar: below
       it the whole ring is used rather than freezing the strip on one line.
       The server already caps the backlog at 24h unless it cannot find 8
       events in that window, so reaching past the cutoff here means the site
       really was that quiet. */
    var loop = fresh.length >= 2 ? fresh : ring;
    for (var k = loop.length - 1; k >= 0; k--) {
      if (loop[k].id !== id) queue.push(loop[k]);
    }
  }

  /* VARIETY LIVES HERE, and only here (2026-09-08). /api/activity/recent used
     to spread its own answer before returning it, which meant an endpoint
     called "recent" could hand back a 1 hr event ahead of a 37 min one. It is
     strictly newest-first now, so the job of not reading the same account, or
     the same category, out twice running belongs to the rotation, where
     reordering two neighbours costs nothing. Look a short way down the queue
     for someone else before giving up, and never further: this must not be
     able to bury a genuinely new event that has just jumped the queue. */
  function nextIndex() {
    if (!queue.length) return 0;
    var lastUser = current && current.data && current.data.user ? current.data.user.id : null;
    var lastType = current && current.data ? current.data.type : null;
    if (lastUser == null && lastType == null) return 0;
    var span = Math.min(4, queue.length);
    var fallback = -1;
    for (var i = 0; i < span; i++) {
      var u = queue[i].user ? queue[i].user.id : null;
      if (u === lastUser) continue;
      if (queue[i].type !== lastType) return i;   // different account AND category: ideal
      if (fallback < 0) fallback = i;             // at least a different account
    }
    return fallback < 0 ? 0 : fallback;
  }

  function advance() {
    if (dead || paused || document.hidden) return;
    if (!queue.length) refill();
    if (!queue.length) return;         // one event, or none: it stays put
    show(queue.splice(nextIndex(), 1)[0]);
  }

  /* What makes a held copy out of date. The backend bumps created_at when it
     folds a new pick into a standing row, and bumps only updated_at when it
     corrects a misgraded result in place; either one has to win over the copy
     already in the queue. */
  function freshnessOf(ev) {
    return Date.parse(ev.updated_at || ev.created_at) || 0;
  }

  /* Remove every copy of an id we are about to supersede. */
  function drop(id) {
    for (var i = queue.length - 1; i >= 0; i--) if (queue[i].id === id) queue.splice(i, 1);
    for (var j = ring.length - 1; j >= 0; j--) if (ring[j].id === id) ring.splice(j, 1);
  }

  /* If the superseded copy is the one being read right now, correct it where it
     stands rather than yanking it: same node, new sentence, new age. */
  function refreshCurrent(ev) {
    if (!current || !current.data || current.data.id !== ev.id || !current.node) return;
    var node = current.node;
    var act = node.querySelector('.tkact-act');
    if (act) { act.textContent = ev.text || ''; act.title = ev.text || ''; }
    node.__at = ev.created_at;
    if (node.__ago) node.__ago.textContent = timeAgo(ev.created_at);
    current.data = ev;
  }

  function enqueue(events, front) {
    if (!events || !events.length) return 0;
    var added = 0;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (!ev || !ev.id) continue;
      var fresh = freshnessOf(ev);
      var held = seen[ev.id] || seenOld[ev.id] || 0;
      /* AN ID IS NOT AN IDENTITY HERE. The backend rewrites an event row in
         place -- tmr_activity_emit() folds a second pick into the standing row,
         keeps its id, sets created_at = now() and re-NOTIFYs that same id --
         so treating a known id as a duplicate threw away the update and left
         the superseded line on the strip with its old text and its old age.
         That was the stale feed reported on 2026-09-08. An id is a duplicate
         only while the copy we already hold is at least as fresh. */
      if (held && fresh <= held) continue;
      if (held) { refreshCurrent(ev); drop(ev.id); }
      /* The id set is bounded for the life of a tab. TWO generations rather
         than one: when the young set fills it becomes the old set and a fresh
         one starts, and a lookup checks both. Clearing a single set instead
         would re-admit the whole current backlog on the very next poll -- the
         visitor would watch the same events cycle round a second time -- and an
         id now has to age out of two full generations before that is even
         possible. Memory is bounded at 2 x MAX_SEEN ids either way. */
      if (seenCount >= MAX_SEEN) { seenOld = seen; seen = Object.create(null); seenCount = 0; }
      if (!seen[ev.id]) seenCount++;
      seen[ev.id] = fresh;
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
    /* The stream is the fast path, not the only guarantee. A slow backlog
       re-read runs whether or not the stream is up: it is what closes the gap
       for anything a single NOTIFY could not deliver -- a notification lost
       while the listener was reconnecting, an instance whose LISTEN dropped,
       or a row corrected in place with no notify at all (the misgrade path
       deliberately does not re-announce). Cheap enough to be unconditional:
       the response is a few KB and this runs twelve times an hour. */
    refreshTimer = setInterval(poll, REFRESH_MS);
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
         oldest first and the newest ends up at the head of the queue. No
         pre-filter on `seen` here: enqueue decides, and it is the only place
         that knows a known id can still carry a NEWER version of the event. */
      var batch = [];
      for (var i = events.length - 1; i >= 0; i--) batch.push(events[i]);
      if (enqueue(batch, true) && !current) advance();
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
      /* AND PAINT, if nothing is up yet. advance() refuses to run while the
         tab is hidden, which is right, but it meant the very first item was
         refused outright on a page that loaded in a BACKGROUND tab, and the
         only thing left to try again was the five second rotation interval,
         which a hidden tab throttles to roughly once a minute. So opening
         TMR in a background tab and then switching to it showed the labelled
         lane over an EMPTY SLOT for up to a minute, which is the one state
         this module is written to avoid. Measured on the live homepage
         2026-09-08. Nothing here changes WHAT is shown, only when: the queue
         was already holding the backlog, it just had nobody asking for it. */
      if (!current) advance();
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
