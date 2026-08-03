/**
 * MLB_SIM_HISTORY_20260803 - TrustMyRecord simulation-history Worker.
 *
 * One job: make /mlb-simulator/simulations/YYYY-MM-DD/<away>-vs-<home>/ a real,
 * correctly-titled, correctly-canonicalised page without baking thousands of
 * near-empty HTML files into the repo.
 *
 *   - A deep matchup path is served from the single origin shell at
 *     /mlb-simulator/simulations/matchup/index.html, with its <title>,
 *     description, canonical and robots tags replaced from
 *     /api/mlb-sim-history/meta.
 *   - `indexable` comes from the API and is false whenever the page would be
 *     thin - unknown date, matchup not on that day's schedule, or too few
 *     simulations to say anything. Those pages stay noindex, so the site never
 *     publishes empty matchup pages.
 *   - /mlb-simulator/simulations/ itself, and every other path, is passed
 *     through untouched.
 *
 * Non-negotiables, mirroring workers/share-meta/worker.js:
 *   - FAIL OPEN. Any error, timeout, non-GET, or non-HTML response returns the
 *     untouched origin response. This Worker can add correct tags; it can never
 *     blank a page or take the site down.
 *   - NO REDIRECTS. The URL the visitor requested is the URL they get. The
 *     existing /mlb-simulator/ URL is never touched.
 *   - Everything injected is escaped before it reaches an attribute.
 */

const API_BASE = 'https://trustmyrecord-api.onrender.com/api';
const SHELL_PATH = '/mlb-simulator/simulations/matchup/index.html';
const META_TIMEOUT_MS = 1800;

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Is this a deep matchup path? Returns { date, slug } or null.
 * The list index, the run-detail page and anything unrecognised return null and
 * are passed straight through.
 */
function resolveTarget(url) {
  const m = /^\/mlb-simulator\/simulations\/(\d{4}-\d{2}-\d{2})\/([a-z]{2,3}-vs-[a-z]{2,3}(?:-game-\d)?)\/?$/
    .exec(url.pathname.toLowerCase());
  if (!m) return null;
  return { date: m[1], slug: m[2] };
}

async function fetchMeta(target) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), META_TIMEOUT_MS);
  try {
    const resp = await fetch(
      `${API_BASE}/mlb-sim-history/meta?date=${encodeURIComponent(target.date)}&slug=${encodeURIComponent(target.slug)}`,
      { signal: controller.signal, cf: { cacheTtl: 120, cacheEverything: true } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data && data.ok ? data : null;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Removes the shell's placeholder tag so the injected one is unambiguous. */
class DropTag {
  element(element) { element.remove(); }
}

class HeadInjector {
  constructor(meta, target) {
    this.meta = meta;
    this.target = target;
  }

  element(head) {
    const m = this.meta;
    const canonical = m.canonical ||
      `https://trustmyrecord.com/mlb-simulator/simulations/${this.target.date}/${this.target.slug}/`;
    const image = 'https://trustmyrecord.com/static/og/og-home.png';
    const robots = m.indexable ? 'index, follow' : 'noindex, follow';

    const tags = [
      `<title>${esc(m.title)}</title>`,
      `<meta name="description" content="${esc(m.description)}">`,
      `<link rel="canonical" href="${esc(canonical)}">`,
      `<meta name="robots" content="${robots}">`,
      `<meta property="og:site_name" content="TrustMyRecord">`,
      `<meta property="og:type" content="article">`,
      `<meta property="og:title" content="${esc(m.title)}">`,
      `<meta property="og:description" content="${esc(m.description)}">`,
      `<meta property="og:url" content="${esc(canonical)}">`,
      `<meta property="og:image" content="${image}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${esc(m.title)}">`,
      `<meta name="twitter:description" content="${esc(m.description)}">`,
    ];

    // Breadcrumbs are safe to emit for any resolvable matchup; the richer
    // Dataset markup is only emitted when the page actually has content.
    const crumbs = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://trustmyrecord.com/' },
        { '@type': 'ListItem', position: 2, name: 'MLB Simulator', item: 'https://trustmyrecord.com/mlb-simulator/' },
        { '@type': 'ListItem', position: 3, name: 'Simulation Results', item: 'https://trustmyrecord.com/mlb-simulator/simulations/' },
        { '@type': 'ListItem', position: 4, name: `${m.away} vs ${m.home}`, item: canonical },
      ],
    };
    tags.push(`<script type="application/ld+json">${JSON.stringify(crumbs)}</script>`);

    if (m.indexable) {
      const dataset = {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: m.title,
        description: m.description,
        url: canonical,
        creator: { '@type': 'Organization', name: 'TrustMyRecord', url: 'https://trustmyrecord.com/' },
        isAccessibleForFree: true,
        variableMeasured: ['Average simulated score', 'Simulated win percentage', 'Average total runs'],
      };
      tags.push(`<script type="application/ld+json">${JSON.stringify(dataset)}</script>`);
    }

    head.append(`\n<!-- tmr-sim-history -->\n${tags.join('\n')}\n<!-- /tmr-sim-history -->\n`, { html: true });
  }
}

export default {
  async fetch(request) {
    let originResponse;
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') return fetch(request);

      const url = new URL(request.url);
      const target = resolveTarget(url);

      // Not a deep matchup path (the index, the run page, an asset): untouched.
      if (!target) return fetch(request);

      // Serve the single shell for this pretty URL. No redirect: the visitor
      // stays on the URL they asked for.
      const shellUrl = new URL(request.url);
      shellUrl.pathname = SHELL_PATH;
      shellUrl.search = '';
      originResponse = await fetch(new Request(shellUrl.toString(), {
        method: 'GET',
        headers: request.headers,
        redirect: 'follow',
      }));

      const contentType = originResponse.headers.get('content-type') || '';
      if (!originResponse.ok || !contentType.includes('text/html')) return fetch(request);

      const meta = await fetchMeta(target);

      // Metadata unavailable: still serve the shell (it renders client-side and
      // ships noindex by default), rather than a 404 for a real matchup.
      if (!meta) {
        const plain = new Response(originResponse.body, originResponse);
        plain.headers.set('x-tmr-sim-history', 'shell-no-meta');
        plain.headers.set('Cache-Control', 'public, max-age=60');
        return plain;
      }

      const rewritten = new HTMLRewriter()
        .on('title', new DropTag())
        .on('meta[name="description"]', new DropTag())
        .on('meta[name="robots"]', new DropTag())
        .on('meta[property^="og:"]', new DropTag())
        .on('meta[name^="twitter:"]', new DropTag())
        .on('link[rel="canonical"]', new DropTag())
        .on('head', new HeadInjector(meta, target))
        .transform(originResponse);

      const response = new Response(rewritten.body, rewritten);
      response.headers.set('x-tmr-sim-history', `${target.date}:${target.slug}:${meta.indexable ? 'index' : 'noindex'}`);
      response.headers.set('Cache-Control', 'public, max-age=120');
      return response;
    } catch (err) {
      if (originResponse) return originResponse;
      try {
        return await fetch(request);
      } catch (fatal) {
        return new Response('Upstream unavailable', { status: 502 });
      }
    }
  },
};
