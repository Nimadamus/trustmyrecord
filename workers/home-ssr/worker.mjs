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
  if (!data || data.ok === false || !Array.isArray(data.games)) return null;
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

function pitcherLine(g) {
  if (!g.away_pitcher || !g.home_pitcher) return '';
  const short = (n) => {
    const p = String(n).trim().split(/\s+/);
    return p.length < 2 ? n : `${p[0].charAt(0)}. ${p.slice(1).join(' ')}`;
  };
  return `<span class="gm-sp">${esc(short(g.away_pitcher))} vs ${esc(short(g.home_pitcher))}</span>`;
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
      pitcherLine(g);
    if (g.trend && g.trend.text) {
      html += `<span class="gm-tr" data-href="${esc(g.trend.href || '')}" title="` +
        `${esc(`Sample ${g.trend.sample} games · ${g.trend.period}`)}">` +
        `<span class="ts" aria-hidden="true"></span>${esc(g.trend.text)}</span>`;
    }
    return html + '</a>';
  }).join('');
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

function buildRewriter(data, slate) {
  const rw = new HTMLRewriter();

  /* Today's games, rendered into the reserved lane. Only a same-day slate WITH
     games is injected: an empty or stale one leaves the skeleton in place and
     lets the page JS report the honest state, which it already knows how to do. */
  if (slate && slateIsToday(slate) && slate.games && slate.games.length) {
    rw.on('.ticker .ticker-games', new AttrCell({
      'data-slate-date': slate.slate_date,
      'aria-busy': 'false',
    }));
    rw.on('.ticker .ticker-games', new HtmlCell(
      `<div class="ticker-track"><div class="ticker-page">${tickerHtml(slate.games)}</div></div>`
    ));
  }

  const counts = data.counts || {};
  const metrics = data.metrics || {};
  const eligible = data.total_eligible_handicappers != null ? String(num(data.total_eligible_handicappers)) : null;
  const picksText = counts.total_valid_picks != null ? num(counts.total_valid_picks).toLocaleString('en-US') : null;
  const members = metrics.total_members != null ? String(num(metrics.total_members)) : null;

  rw.on('#tmrEyebrowPicks', new TextCell(picksText));
  rw.on('#tmrStatPicks', new TextCell(picksText));
  rw.on('#tmrStatCappers', new TextCell(eligible));
  rw.on('#tmrStatMembers', new TextCell(members));
  if (eligible != null) {
    rw.on('.explore .ei .badge2', new NthHtmlCell(2, `<span class="bl"></span>${esc(eligible)} public records`));
  }

  const card = data.capper;
  const u = card && card.user;
  if (card && card.username && u) {
    const username = card.username;
    const profileHref = `/u/${encodeURIComponent(username)}/`;

    rw.on('.spot .bd', new SettleCell());
    rw.on('.spot .avbox', new TextCell(initials(username)));
    rw.on('.spot .nmrow b', new TextCell(username));
    rw.on('.spot .nmrow a', new HrefCell(`/profile/?user=${encodeURIComponent(username)}`));
    rw.on('.spot .hd a', new HrefCell(profileHref));
    rw.on('.spot .ft a:not(#tmrCapperBuy)', new HrefCell(profileHref));
    // Buy-picks link follows the featured capper to their marketplace storefront
    // (keep in lockstep with tmr-home-live.js applyCapper).
    rw.on('#tmrCapperBuy', new HrefCell(`/marketplace/seller/?u=${encodeURIComponent(username)}`));

    const W = u.wins, L = u.losses, P = num(u.pushes);
    const netUnits = num(u.net_units), roi = num(u.roi);
    rw.on('.spot .g3 b', new SequencedCells([
      { text: (W == null || L == null) ? `${num(u.total_picks)} picks` : `${W}-${L}${P ? '-' + P : ''}` },
      { text: sign(netUnits), className: `num ${netUnits >= 0 ? 'pos' : 'neg'}` },
      { text: `${roi.toFixed(1)}%`, className: `num ${roi >= 0 ? 'pos' : 'neg'}` },
    ]));
    rw.on('.spot .ft span:not(.ftlinks)', new TextCell(`${num(u.total_picks)} picks, every one locked pre-game`));

    const s = card.summary || {};
    const winRate = num(s.win_rate);
    const avgOdds = Math.round(num(s.avg_odds));
    const streak = num(u.current_streak);
    const streakTxt = streak > 0 ? `W${streak}` : streak < 0 ? `L${Math.abs(streak)}` : 'no active streak';
    const sports = (u.favorite_sports && u.favorite_sports.length) ? u.favorite_sports.join(', ') : 'All sports';
    rw.on('.spot .sub2', new TextCell(
      `${sports} · ${num(u.total_picks)} tracked picks · ${winRate.toFixed(1)}% win rate · ${avgOdds > 0 ? '+' : ''}${avgOdds} avg odds · ${streakTxt}`
    ));

    const picks = card.recent_graded || [];
    if (picks.length) {
      const mx = Math.max(...picks.map((p) => Math.abs(num(p.result_units)) || 1)) || 1;
      const bars = picks.map((p) => {
        const v = num(p.result_units);
        const h = Math.max(18, Math.round(Math.abs(v) / mx * 100));
        return `<i class="${v < 0 ? 'dn' : ''}" style="height:${h}%"></i>`;
      }).join('');
      rw.on('.spot .spark', new HtmlCell(bars));
      const wCount = picks.filter((p) => /won/i.test(p.status)).length;
      rw.on('.spot .lb', new HtmlCell(
        `<span>Last ${picks.length} graded picks</span><span>${wCount}W &middot; ${picks.length - wCount}L</span>`
      ));
    }
  }

  return rw;
}

export default {
  async fetch(req, env, ctx) {
    try {
      if (!HOME_PATHS.has(new URL(req.url).pathname)) return fetch(req);

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
