/**
 * tmr-home-ssr — request-time live-data injection for the trustmyrecord.com
 * homepage.
 *
 * The site is a static bake (GitHub Pages behind Cloudflare); its hero stats
 * and Capper of the Week card are baked at prerender time and were up to
 * hours stale at first paint (or, worse, hidden by live-wait gates until a
 * slow API answered). This worker rewrites the origin HTML at request time
 * with the CURRENT values from the backend's cached one-request
 * /api/users/home-bootstrap aggregate, so the first meaningful paint is
 * accurate with zero client-side swap: the page JS writes values only when
 * they differ, and they won't.
 *
 * Injected values use EXACTLY the same formatting as static/js/tmr-home-live.js
 * (en-US thousands separators, sign()/toFixed precision, sub2 sentence shape) —
 * keep the two in lockstep when editing either.
 *
 * Fail-open by design: any error, timeout (1200ms) or non-OK anywhere returns
 * the untouched origin response, and the page behaves exactly as before the
 * worker existed (client fetch + 4s failsafe).
 */

const API_BOOTSTRAP = 'https://trustmyrecord-api.onrender.com/api/users/home-bootstrap';
const API_SLATE = 'https://trustmyrecord-api.onrender.com/api/nav/mlb-slate';
const BOOTSTRAP_CACHE_KEY = 'https://trustmyrecord.com/__edge-cache/home-bootstrap-v1';
const SLATE_CACHE_KEY = 'https://trustmyrecord.com/__edge-cache/mlb-slate-v1';
const EDGE_TTL_SECONDS = 25;
const API_TIMEOUT_MS = 1200;
const SLATE_TZ = 'America/Los_Angeles';

/* The homepage document, and nothing else. The route patterns are narrow, but a
   pattern is configuration and this is the invariant the code depends on. */
const HOME_PATHS = new Set(['/', '/index.html']);

/* ---- /u/<username>/ existence guarantee (EDGE_FALLBACK_20260810) ----------
   /u/<username>/ is the canonical public profile URL and it is a STATIC file
   baked by scripts/build_profile_pages.py in CI. The API hands that URL out
   the instant an account exists (GET /api/users/newest-member returns
   profile_url:"/u/<username>/", and the forum + /handicappers/ newest-member
   widgets link to it immediately), but the file does not exist until the bake
   runs, passes the SEO gate, commits and Pages redeploys. Measured for member
   `whocares67` on 2026-08-10: account created 21:24:53Z, the backend's
   repository_dispatch fired at 21:24:56Z, the workflow finished 21:34:40Z.
   The canonical URL of a real member 404'd for 10m20s.

   Making the dispatch faster cannot fix this — that was the 2026-08-09 attempt
   (services/prerenderNotifier.js notifyMemberJoined + the /u/ branch in
   404.html) and it is why the bug recurred: a shorter race is still a race,
   and 404.html explicitly leaves "not baked yet" as a genuine 404.

   So existence stops depending on the bake. When the origin 404s a /u/ URL and
   the API confirms a real member with that exact canonical username, the edge
   serves the compact profile page with HTTP 200. The page is not written here:
   it is static/prerender/u-fallback.html, produced by the SAME renderer as
   every baked page, with the username as a placeholder. There is no second
   template to drift (the SOFT404_20260809 lesson), nothing is invented (a
   member who registered seconds ago genuinely is 0-0), the URL is unchanged,
   and the real bake replaces this within minutes.

   Fail-open in every direction: no member, an unrecognised username shape, an
   unreachable API or a missing template all return the origin's honest 404. */
const U_PATH_RE = /^\/u\/([^/]+)(\/?)$/;
/* Escaping and URL-encoding are both the identity function on this character
   set, which is what lets the template be filled with a plain substitution.
   Anything outside it is passed through to the origin 404 rather than guessed
   at. Matches the registration validator in the backend's routes/auth.js. */
const U_SAFE_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const API_USER = 'https://trustmyrecord-api.onrender.com/api/users/';
/* The SAME set scripts/build_profile_pages.py discovers members from
   (list_users), which is the backend's canonical publicDirectoryUserWhere
   filter: active, not deleted, is_public, not an official bot, not a
   test/qa/banned account_type. Gating on this instead of on "does
   /api/users/<name> answer" is what keeps the edge and the bake in agreement:
   the edge will only ever serve a page the baker would also have created, so
   a private, retired or QA account stays an honest 404 here exactly as it does
   on disk. ~6KB, edge-cached. */
const API_DIRECTORY = 'https://trustmyrecord-api.onrender.com/api/users/directory-usernames';
const DIRECTORY_CACHE_KEY = 'https://trustmyrecord.com/__edge-cache/directory-usernames-v1';
const DIRECTORY_TTL_SECONDS = 60;
const U_TEMPLATE_PATH = '/static/prerender/u-fallback.html';
const U_TEMPLATE_CACHE_KEY = 'https://trustmyrecord.com/__edge-cache/u-fallback-v1';
const U_TEMPLATE_TTL_SECONDS = 300;
const U_PLACEHOLDER = '__TMR_USERNAME__';
const DIRECTORY_PAGE_SIZE = 200;

/* RACE_20260811 — why the existence guarantee above still 404'd intermittently.
   Every lookup on this path used API_TIMEOUT_MS, which is 1.2s because it
   budgets a HOMEPAGE injection: there the origin document is already a complete
   page, so a slow API just means the un-injected bake ships and nothing is lost.
   Here the trade is the opposite — the alternative to waiting is publishing a
   404 for a URL the site is actively linking to — and a brand-new member needs
   TWO serial API calls (the 60s-cached directory list cannot yet contain them,
   so the force-refresh in handleUserProfile always fires), which doubled the
   exposure for exactly the members this path exists to protect.

   Measured on 2026-08-11 for member `diddy` (registered 15:11:24Z): the edge
   rendered the fallback (HTTP 200, 13207 bytes = the 13537-byte template with
   its 30 placeholders filled) and the very next request to the same URL seconds
   later returned the origin's 404 page. Same member, same URL, same minute.

   So the /u/ path gets its own generous budget plus one retry. API_TIMEOUT_MS
   is left alone: the homepage's fail-open is correct and must stay fast. */
const U_API_TIMEOUT_MS = 5000;
const U_API_ATTEMPTS = 2;

/* One retry, for timeouts and network errors only. A non-2xx response is an
   ANSWER (that member or that template really is absent) and is handed back
   as-is rather than retried. */
async function uFetch(url, accept) {
  let lastErr;
  for (let attempt = 0; attempt < U_API_ATTEMPTS; attempt += 1) {
    try {
      return await fetch(url, {
        headers: { Accept: accept },
        signal: AbortSignal.timeout(U_API_TIMEOUT_MS),
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

const num = (v) => { const n = parseFloat(v); return Number.isNaN(n) ? 0 : n; };
const sign = (n) => (n > 0 ? '+' : '') + n.toFixed(2);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const initials = (name) => String(name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase();

async function getBootstrap(ctx) {
  const cache = caches.default;
  const cacheKey = new Request(BOOTSTRAP_CACHE_KEY);
  const hit = await cache.match(cacheKey);
  if (hit) return hit.json();

  const resp = await fetch(API_BOOTSTRAP, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!resp.ok) return null;
  const body = await resp.text();
  const data = JSON.parse(body);
  if (!data || !data.counts) return null;
  ctx.waitUntil(cache.put(cacheKey, new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${EDGE_TTL_SECONDS}`,
    },
  })));
  return data;
}

/* Today's MLB slate, injected for the same reason the stats are: the client
   fetch used to leave a loading strip above the hero for seconds. Cached at the
   edge for EDGE_TTL_SECONDS, on a short timeout, and entirely optional — if it
   is not here in time the document keeps its skeleton lane and the page JS
   fills it exactly as before. */
async function getSlate(ctx) {
  const cache = caches.default;
  const cacheKey = new Request(SLATE_CACHE_KEY);
  const hit = await cache.match(cacheKey);
  if (hit) return hit.json();

  const resp = await fetch(API_SLATE, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!resp.ok) return null;
  const body = await resp.text();
  const data = JSON.parse(body);
  /* A payload with no MLB row but a live NFL row is still worth baking - the
     strip carries both sports, and one failed feed must not cost the other its
     first paint. Only a payload with neither is refused. */
  if (!data || data.ok === false ||
      (!Array.isArray(data.games) && !Array.isArray(data.nfl_games))) return null;
  ctx.waitUntil(cache.put(cacheKey, new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${EDGE_TTL_SECONDS}`,
    },
  })));
  return data;
}

class TextCell {
  // NOTE: the data property must NOT be named `text` — HTMLRewriter reads a
  // handler object's `text` key as its text-chunk handler and throws
  // "not of type 'function'" at registration if it's a plain value.
  constructor(value) { this.value = value; }
  element(el) { if (this.value != null) el.setInnerContent(String(this.value)); }
}

class SequencedCells {
  // HTMLRewriter has no :nth-child — handlers fire in document order, so a
  // counter distinguishes same-selector siblings (the .g3 record/units/ROI
  // cells, the .lb caption spans).
  constructor(cells) { this.cells = cells; this.i = 0; }
  element(el) {
    const c = this.cells[this.i++];
    if (!c) return;
    if (c.text != null) el.setInnerContent(String(c.text));
    if (c.className != null) el.setAttribute('class', c.className);
  }
}

class HrefCell {
  constructor(href) { this.href = href; }
  element(el) { if (this.href) el.setAttribute('href', this.href); }
}

/* Clears a skeleton container: drops the `is-skel` class and flips aria-busy,
   so a region the worker has just filled does not keep shimmering. */
class SettleCell {
  element(el) {
    const cls = (el.getAttribute('class') || '')
      .split(/\s+/).filter((c) => c && c !== 'is-skel').join(' ');
    el.setAttribute('class', cls);
    el.setAttribute('aria-busy', 'false');
  }
}

/* Adds a class to an element without disturbing the ones already on it. */
class AccentCell {
  constructor(className) { this.className = className; }
  element(el) {
    const have = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    if (!have.includes(this.className)) have.push(this.className);
    el.setAttribute('class', have.join(' '));
    /* The page script reads data-accent to know which class to swap OFF before
       it applies the next one. Without it the edge's accent would stick and the
       card would end up wearing two. */
    el.setAttribute('data-accent', this.className);
  }
}

/* href and text in ONE handler: two handlers on the same selector each get the
   element, but the second one's setInnerContent would run against an element
   the first has already emitted. */
class CtaCell {
  constructor(href, label) { this.href = href; this.label = label; }
  element(el) {
    if (this.href) el.setAttribute('href', this.href);
    if (this.label != null) el.setInnerContent(String(this.label));
  }
}

class AttrCell {
  constructor(attrs) { this.attrs = attrs; }
  element(el) { for (const [k, v] of Object.entries(this.attrs)) el.setAttribute(k, v); }
}

class HtmlCell {
  constructor(html) { this.html = html; }
  element(el) { if (this.html != null) el.setInnerContent(this.html, { html: true }); }
}

class NthHtmlCell {
  constructor(index, html) { this.index = index; this.html = html; this.i = 0; }
  element(el) { if (this.i++ === this.index && this.html != null) el.setInnerContent(this.html, { html: true }); }
}

/* ---- live competition markup ----------------------------------------------
   A port of compRowHtml() / compDelta() / compAvatar() in
   static/js/tmr-home-live.js. The two MUST produce identical markup: the page
   script re-renders the same first view a moment after the edge paints it, and
   any difference between them would flicker a value that did not change.
   Keep them in lockstep. ---------------------------------------------------- */
/* A competitor with no avatar gets initials, not a request that 404s into
   initials. The homepage has been bitten before by an <img> whose onerror
   raced the edge bake and rewrote the card after first paint; there is no
   reason to fire that request when the payload already says there is no
   avatar. */
function compAvatar(c) {
  if (!c) return '<span class="comp-avl"></span>';
  if (c.avatar_url) return `<img class="comp-av" src="${esc(c.avatar_url)}" alt="" ` +
    `onerror="this.outerHTML='&lt;span class=&quot;comp-avl&quot;&gt;${initials(c.username)}&lt;/span&gt;'">`;
  return `<span class="comp-avl">${initials(c.username)}</span>`;
}

function compDelta(row) {
  if (row.is_new) return '<span class="comp-dl nw">NEW</span>';
  const d = row.delta;
  if (d == null) return '';
  if (d > 0) return `<span class="comp-dl up">&#9650;${d}</span>`;
  if (d < 0) return `<span class="comp-dl dn">&#9660;${Math.abs(d)}</span>`;
  return '<span class="comp-dl fl">&mdash;</span>';
}

/* Every one of the eight views renders through this one template, so a
   sportsbook standing and a trivia standing are the same object on screen and
   only the numbers mean different things. `tone` decides the primary value's
   colour: 'signed' where green and red carry real meaning, 'neutral' for a
   points or post count, where green would assert a profit the number is not. */
function compRowHtml(view, row, i) {
  const c = row.competitor || {};
  const href = c.href || (c.username ? `/u/${encodeURIComponent(c.username)}/` : '/handicappers/');
  const tone = view.tone === 'signed' ? (num(row.value) < 0 ? 'neg' : 'pos') : 'flat';
  return `<div class="comp-row${i === 0 ? ' r1' : ''}">` +
    `<span class="comp-rk">${row.rank || i + 1}</span>` +
    compAvatar(c) +
    '<span class="comp-id">' +
      `<a class="comp-nm" href="${esc(href)}">${esc(c.username || '')}</a>` +
      `<span class="comp-meta">${esc(row.meta || '')}</span>` +
    '</span>' +
    '<span class="comp-val">' +
      `<span class="comp-num ${tone}">${esc(row.value_text || '')}</span>` +
      compDelta(row) +
    '</span>' +
  '</div>';
}

/* ---- ticker markup ---------------------------------------------------------
   A byte-for-byte port of renderTicker() in static/js/tmr-home-live.js. The two
   MUST produce identical markup: the page JS re-renders the same slate 90s later
   and any difference between them would show up as a flicker on a value that
   did not actually change. Keep them in lockstep. -------------------------- */
const logoImg = (url) => (url ? `<img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()">` : '');

function statusChip(g) {
  const s = String(g.status || 'scheduled');
  if (s === 'scheduled') {
    return `<span class="st">${esc(g.start_time_tbd ? 'TBD' : (g.start_time_pt || ''))}</span>`;
  }
  const score = (typeof g.away_score === 'number' && typeof g.home_score === 'number')
    ? ` ${g.away_score}-${g.home_score}` : '';
  const text = s === 'live' ? (g.inning || 'Live') + score
    : s === 'final' ? 'Final' + score
    : s === 'postponed' ? 'PPD'
    : s === 'cancelled' ? 'Canceled'
    : s === 'suspended' ? 'Susp'
    : s === 'delayed' ? 'Delayed'
    : (g.start_time_pt || '');
  return `<span class="st is-${esc(s)}">${esc(text)}</span>`;
}

/* Probables are a PREGAME element: a FINAL card carries the real decisions in
   its strip, so the probables line under it would be the one stale thing on a
   finished card. Lockstep with pitcherLine() in tmr-home-live.js. */
function pitcherLine(g) {
  if (g.status === 'final') return '';
  if (!g.away_pitcher || !g.home_pitcher) return '';
  const short = (n) => {
    const p = String(n).trim().split(/\s+/);
    return p.length < 2 ? n : `${p[0].charAt(0)}. ${p.slice(1).join(' ')}`;
  };
  return `<span class="gm-sp">${esc(short(g.away_pitcher))} vs ${esc(short(g.home_pitcher))}</span>`;
}

/* The rotating intel strip - the byte-for-byte port of insightStrip() in
   static/js/tmr-home-live.js. Keep the two in lockstep: the edge markup and the
   client markup must be identical or the first client render visibly reflows
   what the edge already painted.

   Every line ships in the HTML, so the edge response already carries all of the
   card's intel for a crawler even though only the first line is visible. */
/* Lockstep with postgameDwell() in tmr-home-live.js. A FINAL card rotates a
   denser postgame recap and holds each line 11 to 19 seconds, drawn off its own
   game_pk so two finals side by side never flip together. */
const POSTGAME_DWELL_MIN_MS = 11000;
const POSTGAME_DWELL_STEP_MS = 2000;
const POSTGAME_DWELL_STEPS = 5;
const INSIGHT_ROTATE_MS = 5000;

function postgameDwell(g) {
  /* MLB cards are keyed by game_pk; ESPN cards carry espn_event_id instead.
     Lockstep with postgameDwell() in tmr-home-live.js. */
  const raw = (g && g.game_pk) != null ? g.game_pk : (g && g.espn_event_id);
  const pk = parseInt(raw, 10);
  const n = Number.isFinite(pk) ? Math.abs(pk) : 0;
  return POSTGAME_DWELL_MIN_MS + (n % POSTGAME_DWELL_STEPS) * POSTGAME_DWELL_STEP_MS;
}

function insightStrip(g) {
  const list = (g && g.insights) || [];
  if (!list.length) return '';
  let lines = '';
  for (let i = 0; i < list.length; i++) {
    const ins = list[i] || {};
    if (!ins.text) continue;
    const meta = ins.sample
      ? `Sample ${ins.sample}${ins.period ? ` · ${ins.period}` : ''}`
      : (ins.period || '');
    lines += `<span class="gm-in-l${i === 0 ? ' is-on' : ''}"` +
      ` data-cat="${esc(ins.category || '')}"` +
      ` data-href="${esc(ins.href || '')}"` +
      `${meta ? ` title="${esc(meta)}"` : ''}>` +
      '<i class="ts" aria-hidden="true"></i>' +
      `<b>${esc(ins.text)}</b>` +
      '</span>';
  }
  if (!lines) return '';
  const post = g.insight_mode === 'postgame';
  return `<span class="gm-in${post ? ' is-post' : ''}" data-i="0"` +
    ` data-mode="${post ? 'postgame' : 'pregame'}"` +
    ` data-dwell="${post ? postgameDwell(g) : INSIGHT_ROTATE_MS}">${lines}</span>`;
}

function tickerHtml(games) {
  return games.map((g) => {
    const dh = g.game_label ? `<em class="gm-dh">${esc(g.game_label)}</em>` : '';
    const off = g.status === 'postponed' || g.status === 'cancelled';
    let html = `<a class="gm${off ? ' is-off' : ''}"` +
      ` data-game-pk="${esc(String(g.game_pk == null ? '' : g.game_pk))}"` +
      ` href="${esc(g.href || '/handicapping/mlb/')}">` +
      '<span class="gm-top">' +
        `<span class="t">${logoImg(g.away_logo)}${esc(g.away)}</span>` +
        `<span class="t">${logoImg(g.home_logo)}${esc(g.home)}</span>` +
        statusChip(g) + dh +
      '</span>' +
      pitcherLine(g) +
      /* The form rows and the standalone trend row are gone from the card; the
         backend folds both into insights[] (Nima, 2026-08-21). */
      insightStrip(g);
    return html + '</a>';
  }).join('');
}

/* The ESPN rows (football, basketball, hockey) - a byte-for-byte port of the
   client's espnRows loop, same lockstep rule as tickerHtml above. No
   data-game-pk: the MLB preview treatment must never attach to one of these.

   The recap strip is rendered here too. It was missing from the football row,
   so a finished game arrived carrying insights and the card discarded them. */
function espnTickerHtml(games, key) {
  return (games || []).map((g) => (
    `<a class="gm gm--${key}" data-sport="${key}"` +
    ` href="${esc(g.href || '/sportsbook/')}">` +
    '<span class="gm-top">' +
      `<span class="t">${logoImg(g.away_logo)}${esc(g.away)}</span>` +
      `<span class="t">${logoImg(g.home_logo)}${esc(g.home)}</span>` +
      statusChip(g) +
    '</span>' +
    insightStrip(g) +
    '</a>'
  )).join('');
}

/* Kept as a named wrapper so nothing that referenced it has to change. */
function nflTickerHtml(games) {
  return espnTickerHtml(games, 'nfl');
}

/* The slate is Pacific-dated. A payload that raced across the rollover — or one
   the edge cached just before it — must not be baked into the document. */
function slateIsToday(slate) {
  if (!slate || !slate.slate_date) return false;
  try {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: SLATE_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    return slate.slate_date === today;
  } catch (e) { return false; }
}

/* The compact profile template, edge-cached. Fetched from the request's own
   origin so www. and apex both work. Returns null on anything unexpected. */
async function getUTemplate(url, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(U_TEMPLATE_CACHE_KEY);
  const hit = await cache.match(cacheKey);
  if (hit) return hit.text();

  const resp = await uFetch(new URL(U_TEMPLATE_PATH, url).toString(), 'text/html');
  if (!resp.ok) return null;
  const body = await resp.text();
  /* A template that lost its placeholder would render a page named after the
     sentinel for every new member. Refuse it and let the 404 stand. */
  if (!body.includes(U_PLACEHOLDER)) return null;
  ctx.waitUntil(cache.put(cacheKey, new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': `public, max-age=${U_TEMPLATE_TTL_SECONDS}`,
    },
  })));
  return body;
}

async function lookupMember(name) {
  const resp = await uFetch(API_USER + encodeURIComponent(name), 'application/json');
  if (!resp.ok) return null;
  const data = await resp.json();
  const user = data && data.user;
  return user && user.username ? user : null;
}

/* Public-directory usernames, edge-cached. Returns null (not an empty set) on
   any failure so the caller can tell "not a member" from "could not tell" and
   leave the origin's 404 alone rather than guess. */
/* `fresh` skips the 60s edge cache. A member who registered seconds ago cannot
   be in a list that was cached before they existed, so the caller re-asks once
   with fresh=true before concluding "not a member" — otherwise the guarantee
   would not hold for up to a minute at exactly the moment it is needed. */
async function getDirectoryNames(ctx, fresh) {
  const cache = caches.default;
  const cacheKey = new Request(DIRECTORY_CACHE_KEY);
  const hit = fresh ? null : await cache.match(cacheKey);
  const body = hit ? await hit.text() : await (async () => {
    /* PAGINATED: the endpoint caps a page at DIRECTORY_PAGE_SIZE and the bake
       script (scripts/build_profile_pages.py list_users) walks every page. A
       single unpaginated call silently stopped agreeing with the baker the
       moment the site passed one page of members — and it fails on the NEWEST
       members first, because the list is not ordered in their favour. Same loop
       here, so the two can never diverge. */
    const names = [];
    for (let offset = 0; ; offset += DIRECTORY_PAGE_SIZE) {
      const resp = await uFetch(
        `${API_DIRECTORY}?limit=${DIRECTORY_PAGE_SIZE}&offset=${offset}`,
        'application/json',
      );
      if (!resp.ok) return null;
      const page = await resp.json();
      if (!page || !Array.isArray(page.users)) return null;
      names.push(...page.users.map((u) => (typeof u === 'string' ? u : u && u.username)).filter(Boolean));
      if (page.users.length < DIRECTORY_PAGE_SIZE) break;
    }
    const text = JSON.stringify({ users: names.map((username) => ({ username })) });
    ctx.waitUntil(cache.put(cacheKey, new Response(text, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${DIRECTORY_TTL_SECONDS}`,
      },
    })));
    return text;
  })();
  if (!body) return null;
  const data = JSON.parse(body);
  if (!data || !Array.isArray(data.users)) return null;
  return new Set(data.users.map((u) => (typeof u === 'string' ? u : u && u.username)).filter(Boolean));
}

async function handleUserProfile(req, ctx, rawName, trailingSlash) {
  const origin = await fetch(req);
  /* The page is baked: nothing to do. This is the steady state for all but the
     first few minutes of a member's life. */
  if (origin.status !== 404) return origin;

  let typed;
  try { typed = decodeURIComponent(rawName); } catch (e) { return origin; }

  const user = await lookupMember(typed).catch(() => null);
  if (!user) return origin;                       // no such member: honest 404

  if (!U_SAFE_NAME_RE.test(user.username)) return origin;

  /* Only members the baker itself would publish a page for. A private, retired
     or QA account answers /api/users/<name> but is deliberately absent from
     /u/, and must stay absent here too. Checked BEFORE the canonical-case
     redirect below, so a non-public member is never bounced to a URL that then
     404s — that would be a redirect whose destination does not exist, which is
     worse than the honest 404 we already have. */
  let directory = await getDirectoryNames(ctx).catch(() => null);
  if (directory && !directory.has(user.username)) {
    directory = await getDirectoryNames(ctx, true).catch(() => null);
  }
  if (!directory || !directory.has(user.username)) return origin;

  const url = new URL(req.url);

  /* The lookup is case-insensitive but GitHub Pages filenames are not, so a
     link in the wrong case lands here for a real member; so does a missing
     trailing slash on an unbaked page (Pages only adds it for directories that
     exist). Send both to the one canonical URL — this is the router 404.html
     already ran client-side, just as a real 301 — rather than serving the same
     member at two addresses. */
  if (user.username !== typed || !trailingSlash) {
    const canonical = `${url.origin}/u/${encodeURIComponent(user.username)}/${url.search}`;
    return Response.redirect(canonical, 301);
  }

  const template = await getUTemplate(url, ctx).catch(() => null);
  if (!template) return origin;

  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    /* Never cached: the moment CI publishes the real bake, that must be what
       the next request gets. This response is a stopgap for one member for a
       few minutes, not a cacheable document. */
    'Cache-Control': 'no-store, max-age=0, must-revalidate',
    'x-tmr-u': 'edge-rendered',
  });
  return new Response(template.split(U_PLACEHOLDER).join(user.username), {
    status: 200,
    headers,
  });
}

function buildRewriter(data, slate) {
  const rw = new HTMLRewriter();

  /* Today's games, rendered into the reserved lane. Only a same-day slate WITH
     cards is injected: an empty or stale one leaves the skeleton in place and
     lets the page JS report the honest state, which it already knows how to do.
     Cards from EITHER sport count - an MLB outage must not cost the NFL row its
     first paint (2026-08-15). */
  if (slate && slateIsToday(slate) &&
      (((slate.games && slate.games.length) || 0)
        || ((slate.nfl_games && slate.nfl_games.length) || 0)
        || ((slate.nba_games && slate.nba_games.length) || 0)
        || ((slate.nhl_games && slate.nhl_games.length) || 0))) {
    rw.on('.ticker .ticker-games', new AttrCell({
      'data-slate-date': slate.slate_date,
      'aria-busy': 'false',
    }));
    rw.on('.ticker .ticker-games', new HtmlCell(
      `<div class="ticker-track"><div class="ticker-page">${tickerHtml(slate.games || [])}`
      + `${espnTickerHtml(slate.nfl_games, 'nfl')}`
      + `${espnTickerHtml(slate.nba_games, 'nba')}`
      + `${espnTickerHtml(slate.nhl_games, 'nhl')}</div></div>`
    ));
  }

  const metrics = data.metrics || {};
  const eligible = data.total_eligible_handicappers != null ? String(num(data.total_eligible_handicappers)) : null;
  // "Picks tracked" = metrics.total_graded_picks, the single site-wide count
  // (backend services/siteStatsService.js) that /handicappers/ shows as "Total
  // Graded Picks". Must match tmr-home-live.js exactly: the edge paints this
  // number, the script repaints it, and a different source in either place is
  // a visible number-swap on load. Never the raw directory pick total —
  // that is the debug figure (pending + voids + banned/QA accounts) that made
  // this stripe read 3,022 against the Handicappers page's 2,738.
  const picksText = metrics.total_graded_picks != null
    ? num(metrics.total_graded_picks).toLocaleString('en-US')
    : null;
  const members = metrics.total_members != null ? String(num(metrics.total_members)) : null;
  // #tmrStatCappers is labelled "Pick Makers" and carries metrics.pick_makers —
  // the same field under the same label on /handicappers/. It previously showed
  // total_eligible_handicappers (members with a graded pick) under the label
  // "Verified Cappers", which named neither figure: "verified" on /handicappers/
  // means 25+ graded picks. `eligible` stays behind the "public records" badge,
  // which is what it actually counts. Must match tmr-home-live.js exactly.
  const pickMakers = metrics.pick_makers != null ? String(num(metrics.pick_makers)) : null;

  rw.on('#tmrEyebrowPicks', new TextCell(picksText));
  rw.on('#tmrStatPicks', new TextCell(picksText));
  rw.on('#tmrStatCappers', new TextCell(pickMakers));
  rw.on('#tmrStatMembers', new TextCell(members));
  if (eligible != null) {
    rw.on('.explore .ei .badge2', new NthHtmlCell(2, `<span class="bl"></span>${esc(eligible)} public records`));
  }

  /* ---- LIVE COMPETITION card (replaced Capper of the Week, 2026-08-16) -----
     The card rotates through several views in the browser. The edge paints the
     FIRST one — the server's own ordering, so it is the same view tmr-home-live
     .js starts on and there is no swap when the script takes over. Rows are
     built the same way compRowHtml() builds them; keep the two in lockstep.

     If the competition payload is missing or every view was dropped for lack of
     real data, nothing is injected and the card's skeleton stays for the page
     JS to settle honestly. The edge never invents a standing. */
  const competition = data.competition;
  const compViews = (competition && Array.isArray(competition.views))
    ? competition.views.filter((v) => v && Array.isArray(v.rows) && v.rows.length)
    : [];
  const compFooter = competition && competition.footer;

  if (compFooter && compFooter.competitors != null && compFooter.verified_picks != null) {
    rw.on('.spot .comp-foot', new TextCell(
      `${num(compFooter.competitors).toLocaleString('en-US')} competitors · ` +
      `${num(compFooter.verified_picks).toLocaleString('en-US')} verified picks · standings update live`
    ));
  }

  if (compViews.length) {
    const view = compViews[0];
    rw.on('.spot .bd', new SettleCell());
    rw.on('.spot .comp-cat', new TextCell(view.label || ''));
    rw.on('.spot .comp-note', new TextCell(view.note || ''));
    /* The section accent, painted at the edge for the same reason the rows are:
       the page script applies the identical class a moment later, and if the
       first paint carried the default accent the label would visibly change
       colour on load. */
    rw.on('aside.spot', new AccentCell(`comp-acc-${view.section || 'sportsbook'}`));
    /* The footer CTA belongs to the view being painted. The destination comes
       from the payload (services/homeCompetition's CTA map), never from a
       second table in here that could drift out of step with it. */
    if (view.cta && view.cta.href && view.cta.label) {
      rw.on('.spot .comp-cta', new CtaCell(view.cta.href, `${view.cta.label} →`));
    }
    rw.on('.spot .comp-stage', new HtmlCell(
      '<div class="comp-view is-on">' +
      view.rows.map((r, i) => compRowHtml(view, r, i)).join('') +
      '</div>'
    ));
  }

  return rw;
}

export default {
  async fetch(req, env, ctx) {
    try {
      const pathname = new URL(req.url).pathname;

      /* EDGE_FALLBACK_20260810 — guarantee /u/<username>/ exists for a real
         member from the instant the account does. GET/HEAD only; everything
         else about this path is the origin's business. */
      const uMatch = U_PATH_RE.exec(pathname);
      if (uMatch && (req.method === 'GET' || req.method === 'HEAD')) {
        return handleUserProfile(req, ctx, uMatch[1], uMatch[2] === '/');
      }

      if (!HOME_PATHS.has(pathname)) return fetch(req);

      /* Origin document and both data sources in parallel — the injection costs
         whichever of them is slowest, not the sum. */
      const [origin, data, slate] = await Promise.all([
        fetch(req),
        getBootstrap(ctx).catch((e) => { console.log('bootstrap fail:', e && e.message); return null; }),
        getSlate(ctx).catch((e) => { console.log('slate fail:', e && e.message); return null; }),
      ]);
      const contentType = origin.headers.get('content-type') || '';
      if ((!data && !slate) || !contentType.includes('text/html')) {
        console.log('passthrough: data=', !!data, 'slate=', !!slate, 'ct=', contentType.slice(0, 40));
        const passthrough = new Response(origin.body, origin);
        passthrough.headers.set('x-tmr-ssr', 'passthrough');
        return passthrough;
      }
      const out = buildRewriter(data || {}, slate).transform(origin);
      out.headers.set('x-tmr-ssr', 'injected');
      out.headers.set('x-tmr-ssr-parts', `${data ? 'stats' : '-'},${slate ? 'slate' : '-'}`);
      return out;
    } catch (e) {
      console.log('worker fail:', e && e.message);
      return fetch(req);
    }
  },
};
