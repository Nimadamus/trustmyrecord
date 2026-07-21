/**
 * SHARE_SYSTEM_PHASE1_20260721 - TrustMyRecord share-metadata Worker.
 *
 * Half of a deliberately hybrid design:
 *   - Public profiles (/u/<user>/) and forum threads (/forum/thread/<id>/<slug>/)
 *     are STATIC pages whose social metadata is baked by the existing Python
 *     prerenderers. This Worker does not touch them.
 *   - Individual picks (/pick/?id=<n>) and individual forum replies
 *     (/forum/thread/<id>/<slug>/?post=<n>) are unbounded in number and change
 *     the moment they are graded or posted, so baking them would mean either a
 *     stale preview or thousands of generated files. For those two cases only,
 *     this Worker rewrites the <head> of the origin response with per-item
 *     metadata read from /api/share/meta.
 *
 * Non-negotiables encoded here:
 *   - FAIL OPEN. Any error, timeout, non-HTML response, non-GET method or
 *     missing metadata returns the untouched origin response. The Worker can
 *     only ever add correct tags; it can never take the site down or blank a
 *     page.
 *   - No redirects, no route changes, no noindex. It rewrites <head> in place
 *     and nothing else. The URL the visitor requested is the URL they get.
 *   - Everything injected is escaped before it reaches an attribute.
 */

const API_BASE = 'https://trustmyrecord-api.onrender.com/api';
const META_TIMEOUT_MS = 1500;

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Which share item, if any, does this request describe? */
function resolveTarget(url) {
  const path = url.pathname;
  const params = url.searchParams;

  if (/^\/pick\/?$/.test(path)) {
    const id = params.get('id') || params.get('pick');
    if (id && /^\d+$/.test(id)) return { type: 'pick', id };
    return null;
  }

  if (/^\/forum\/thread\/\d+\//.test(path)) {
    const post = params.get('post');
    if (post && /^\d+$/.test(post)) return { type: 'post', id: post };
    return null; // the baked thread page already carries its own metadata
  }

  return null;
}

async function fetchMeta(target) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), META_TIMEOUT_MS);
  try {
    const resp = await fetch(`${API_BASE}/share/meta/${target.type}/${target.id}`, {
      signal: controller.signal,
      cf: { cacheTtl: 120, cacheEverything: true },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data && data.ok ? data : null;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Drops the page's default social tags so the injected ones are unambiguous. */
class DropTag {
  element(element) {
    element.remove();
  }
}

class HeadInjector {
  constructor(meta, requestUrl) {
    this.meta = meta;
    this.requestUrl = requestUrl;
  }

  element(head) {
    const m = this.meta;
    const image = m.image || 'https://trustmyrecord.com/static/og/og-home.png';
    // Canonical is the clean, parameter-free URL the API declares - never the
    // tagged link the visitor happened to click.
    const canonical = m.canonical || m.url || this.requestUrl;
    const tags = [
      `<title>${esc(m.title)}</title>`,
      `<meta name="description" content="${esc(m.description)}">`,
      `<link rel="canonical" href="${esc(canonical)}">`,
      `<meta name="robots" content="index, follow">`,
      `<meta property="og:site_name" content="TrustMyRecord">`,
      `<meta property="og:type" content="${esc(m.ogType || 'article')}">`,
      `<meta property="og:title" content="${esc(m.title)}">`,
      `<meta property="og:description" content="${esc(m.description)}">`,
      `<meta property="og:url" content="${esc(m.url || canonical)}">`,
      `<meta property="og:image" content="${esc(image)}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta property="og:image:alt" content="${esc(m.imageAlt || m.title)}">`,
      `<meta name="twitter:card" content="${esc(m.twitterCard || 'summary_large_image')}">`,
      `<meta name="twitter:title" content="${esc(m.title)}">`,
      `<meta name="twitter:description" content="${esc(m.description)}">`,
      `<meta name="twitter:image" content="${esc(image)}">`,
      `<meta name="twitter:image:alt" content="${esc(m.imageAlt || m.title)}">`,
    ].join('\n');
    head.append(`\n<!-- tmr-share-meta -->\n${tags}\n<!-- /tmr-share-meta -->\n`, { html: true });
  }
}

export default {
  async fetch(request, env, ctx) {
    // Anything this Worker is not certain about goes straight to the origin.
    let originResponse;
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return fetch(request);
      }

      const url = new URL(request.url);
      const target = resolveTarget(url);
      originResponse = await fetch(request);
      if (!target) return originResponse;

      const contentType = originResponse.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) return originResponse;
      if (!originResponse.ok) return originResponse;

      const meta = await fetchMeta(target);
      if (!meta) return originResponse;

      const rewritten = new HTMLRewriter()
        .on('title', new DropTag())
        .on('meta[name="description"]', new DropTag())
        .on('meta[property^="og:"]', new DropTag())
        .on('meta[name^="twitter:"]', new DropTag())
        .on('link[rel="canonical"]', new DropTag())
        .on('head', new HeadInjector(meta, url.toString()))
        .transform(originResponse);

      const response = new Response(rewritten.body, rewritten);
      response.headers.set('x-tmr-share-meta', `${target.type}:${target.id}`);
      return response;
    } catch (err) {
      // Fail open in every direction: reuse the origin response if we already
      // have it, otherwise go back to the origin one more time.
      if (originResponse) return originResponse;
      try {
        return await fetch(request);
      } catch (fatal) {
        return new Response('Upstream unavailable', { status: 502 });
      }
    }
  },
};
