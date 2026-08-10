/**
 * u-profile-edge-fallback-test — the /u/<username>/ existence guarantee.
 *
 * THE BUG THIS LOCKS DOWN (recurred 2026-08-10, member `whocares67`):
 *
 *   /u/<username>/ is the canonical public profile URL and it is a STATIC file
 *   baked by scripts/build_profile_pages.py in CI. The backend publishes that
 *   exact URL the instant an account exists — GET /api/users/newest-member
 *   returns profile_url:"/u/<username>/" and the forum + /handicappers/
 *   "newest member" widgets link straight to it. The file, however, only
 *   appears after the bake runs, passes the SEO gate, commits, and GitHub
 *   Pages redeploys.
 *
 *   Measured: `whocares67` registered 21:24:53Z, the backend's
 *   repository_dispatch fired 21:24:56Z (3s — the notifier works fine), the
 *   workflow finished 21:34:40Z, the page went live ~21:35:13Z. For 10m20s the
 *   canonical URL of a real, verified member returned a genuine 404 while the
 *   newest-member widget pointed at it.
 *
 *   The 2026-08-09 attempt (services/prerenderNotifier.js notifyMemberJoined in
 *   the backend, plus the /u/ branch in 404.html) only made the window smaller.
 *   404.html deliberately leaves "member is real but the page is not baked yet"
 *   as a genuine 404. A shorter race is still a race — which is exactly why the
 *   bug came back.
 *
 * THE FIX UNDER TEST: workers/home-ssr/worker.mjs serves the compact profile
 * template (static/prerender/u-fallback.html, produced by the SAME renderer as
 * every baked page) with HTTP 200 whenever the origin 404s a /u/ URL AND the
 * backend confirms a real public-directory member. Existence stops depending
 * on the bake; the bake still overwrites it minutes later.
 *
 * These cases are the registration pipeline in miniature: "account exists in
 * the API but has no baked page" IS the post-registration state, and it is the
 * state that 404'd. The complementary live check against production is
 * tests/u-profile-live-proof.cjs.
 *
 * Run: node tests/u-profile-edge-fallback-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = fs.readFileSync(
  path.join(ROOT, 'static', 'prerender', 'u-fallback.html'), 'utf8');

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const fail = (m) => { failures += 1; console.log('  FAIL  ' + m); };
function check(name, fn) {
  return fn().then(() => ok(name)).catch((e) => fail(name + ' — ' + e.message));
}

/* Cloudflare's Cache API. The worker only ever uses match/put, and every test
   starts from a cold cache so one case cannot leak a payload into the next. */
let cacheStore = new Map();
globalThis.caches = {
  default: {
    async match(req) {
      const hit = cacheStore.get(typeof req === 'string' ? req : req.url);
      return hit == null ? undefined : new Response(hit);
    },
    async put(req, res) {
      cacheStore.set(typeof req === 'string' ? req : req.url, await res.text());
    },
  },
};
const ctx = { waitUntil: (p) => p };

const worker = (await import('../workers/home-ssr/worker.mjs')).default;

/**
 * Stand up a fake internet for one request.
 *   opts.baked      – usernames whose /u/<name>/index.html exists at the origin
 *   opts.members    – username -> canonical username answered by /api/users/<x>
 *                     (keys are matched case-insensitively, like the real DB)
 *   opts.directory  – usernames in /api/users/directory-usernames
 *   opts.template   – body served for the fallback template (null = 404)
 *   opts.apiDown    – every API call rejects
 */
function installFetch(opts) {
  const baked = new Set(opts.baked || []);
  const members = new Map(Object.entries(opts.members || {})
    .map(([k, v]) => [k.toLowerCase(), v]));
  const directory = opts.directory === undefined
    ? Object.values(opts.members || {}) : opts.directory;
  const template = opts.template === undefined ? TEMPLATE : opts.template;
  const calls = [];

  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    calls.push(url.pathname);

    if (url.hostname.endsWith('onrender.com')) {
      if (opts.apiDown) throw new Error('API unreachable');
      if (url.pathname === '/api/users/directory-usernames') {
        return new Response(JSON.stringify({
          users: directory.map((u) => ({ username: u })),
        }), { status: 200 });
      }
      const m = /^\/api\/users\/(.+)$/.exec(url.pathname);
      const canonical = m && members.get(decodeURIComponent(m[1]).toLowerCase());
      return canonical
        ? new Response(JSON.stringify({ user: { username: canonical } }), { status: 200 })
        : new Response('{"error":"not found"}', { status: 404 });
    }

    // The origin (GitHub Pages behind Cloudflare).
    if (url.pathname === '/static/prerender/u-fallback.html') {
      return template == null
        ? new Response('not found', { status: 404 })
        : new Response(template, { status: 200 });
    }
    const u = /^\/u\/([^/]+)\/?$/.exec(url.pathname);
    if (u && baked.has(decodeURIComponent(u[1]))) {
      return new Response('<html>baked page for ' + decodeURIComponent(u[1]) + '</html>',
        { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return new Response('<html>We couldn’t find that page.</html>',
      { status: 404, headers: { 'content-type': 'text/html' } });
  };
  return calls;
}

const get = (p) => worker.fetch(
  new Request('https://trustmyrecord.com' + p, { redirect: 'manual' }), {}, ctx);

function reset() { cacheStore = new Map(); }

console.log('\n/u/ edge fallback — a member exists the moment they register');

/* ------------------------------------------------------------------ 1 */
await check(
  'brand-new member (API yes, no baked page) gets 200 with their own profile page',
  async () => {
    reset();
    installFetch({ baked: [], members: { whocares67: 'whocares67' } });
    const res = await get('/u/whocares67/');
    assert.equal(res.status, 200, 'expected 200, got ' + res.status);
    assert.equal(res.headers.get('x-tmr-u'), 'edge-rendered');
    const html = await res.text();
    assert.ok(html.includes('whocares67'), 'page does not name the member');
    assert.ok(!html.includes('__TMR_USERNAME__'), 'placeholder left unsubstituted');
    assert.ok(html.includes('<link rel="canonical" href="https://trustmyrecord.com/u/whocares67/"'),
      'page is not self-canonical to the requested URL');
    assert.ok(!/We couldn.t find that page/i.test(html), 'served the 404 body');
  });

/* ------------------------------------------------------------------ 2 */
await check(
  'the URL the backend publishes as newest_member.profile_url is the one that works',
  async () => {
    reset();
    // Exactly the shape routes/users.js and routes/forum.js emit:
    //   profile_url: `/u/${encodeURIComponent(username)}/`
    const username = 'whocares67';
    const publishedUrl = `/u/${encodeURIComponent(username)}/`;
    installFetch({ baked: [], members: { [username]: username } });
    const res = await get(publishedUrl);
    assert.equal(res.status, 200,
      'the newest-member link itself 404s — this is the reported bug');
    assert.ok((await res.text()).includes(username));
  });

/* ------------------------------------------------------------------ 3 */
await check(
  'once the page is baked the origin serves it untouched (no edge involvement)',
  async () => {
    reset();
    const calls = installFetch({ baked: ['makaveli66'], members: { makaveli66: 'makaveli66' } });
    const res = await get('/u/makaveli66/');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-tmr-u'), null, 'edge rewrote a baked page');
    assert.ok((await res.text()).includes('baked page for makaveli66'));
    assert.ok(!calls.some((c) => c.startsWith('/api/')),
      'hit the API for a page that was already baked');
  });

/* ------------------------------------------------------------------ 4 */
await check(
  'a username that is not a member stays a genuine 404 (no soft-404 concealment)',
  async () => {
    reset();
    installFetch({ baked: [], members: {} });
    const res = await get('/u/zzz_nonexistent_zzz/');
    assert.equal(res.status, 404);
  });

/* ------------------------------------------------------------------ 5 */
await check(
  'a member the public directory excludes (private / QA / retired) stays a 404',
  async () => {
    reset();
    // The account answers /api/users/<name> but publicDirectoryUserWhere drops
    // it, so build_profile_pages.py would never bake a page for it either.
    installFetch({ baked: [], members: { qa_probe_1: 'qa_probe_1' }, directory: [] });
    const res = await get('/u/qa_probe_1/');
    assert.equal(res.status, 404, 'edge published a page the baker refuses to publish');
  });

/* ------------------------------------------------------------------ 6 */
await check(
  'wrong-case link for a real member 301s to the canonical URL, not two live copies',
  async () => {
    reset();
    installFetch({ baked: [], members: { WHOCARES67: 'whocares67' } });
    const res = await get('/u/WHOCARES67/');
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), 'https://trustmyrecord.com/u/whocares67/');
  });

/* ------------------------------------------------------------------ 7 */
await check(
  'missing trailing slash 301s to the canonical trailing-slash URL',
  async () => {
    reset();
    installFetch({ baked: [], members: { whocares67: 'whocares67' } });
    const res = await get('/u/whocares67');
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), 'https://trustmyrecord.com/u/whocares67/');
  });

/* ------------------------------------------------------------------ 8 */
await check(
  'API unreachable: the honest origin 404 is returned, nothing is invented',
  async () => {
    reset();
    installFetch({ baked: [], members: { whocares67: 'whocares67' }, apiDown: true });
    const res = await get('/u/whocares67/');
    assert.equal(res.status, 404);
  });

/* ------------------------------------------------------------------ 9 */
await check(
  'template missing or placeholder-less: fail open to the origin 404',
  async () => {
    reset();
    installFetch({ baked: [], members: { whocares67: 'whocares67' }, template: null });
    assert.equal((await get('/u/whocares67/')).status, 404);
    reset();
    installFetch({
      baked: [], members: { whocares67: 'whocares67' },
      template: '<html>template that lost its placeholder</html>',
    });
    const res = await get('/u/whocares67/');
    assert.equal(res.status, 404, 'served a template with no placeholder to substitute');
  });

/* ----------------------------------------------------------------- 10 */
await check(
  'a username outside the safe character set is passed through, never substituted raw',
  async () => {
    reset();
    installFetch({
      baked: [],
      members: { 'we<ird': 'we<ird' },
      directory: ['we<ird'],
    });
    const res = await get('/u/' + encodeURIComponent('we<ird') + '/');
    assert.equal(res.status, 404, 'substituted an unescaped username into HTML');
  });

/* ----------------------------------------------------------------- 11 */
await check(
  'non-/u/ paths are untouched (the homepage injector keeps its own behaviour)',
  async () => {
    reset();
    const calls = installFetch({ baked: [], members: {} });
    const res = await get('/u/whocares67/picks/');   // deeper path, not a profile URL
    assert.equal(res.status, 404);
    assert.ok(!calls.some((c) => c.startsWith('/api/users/')),
      'treated a sub-path as a profile URL');
  });

/* ----------------------------------------------------------------- 12 */
await check(
  'the served page is not cacheable, so the real bake replaces it immediately',
  async () => {
    reset();
    installFetch({ baked: [], members: { whocares67: 'whocares67' } });
    const cc = (await get('/u/whocares67/')).headers.get('cache-control') || '';
    assert.ok(/no-store/.test(cc), 'edge fallback is cacheable: ' + cc);
  });

/* --------------------------------------------------------------------------
   One canonical profile URL shape, everywhere.

   /u/ links are built in ~20 places (the forum, /handicappers/, /leaderboards/,
   /pick/, /chat/, the season simulator, the newest-member widgets, …). They all
   have to agree on the identifier AND its encoding, or "fix the profile link"
   becomes a per-component chore forever — which is exactly the complaint that
   opened this investigation.

   The canonical shape is: /u/ + encodeURIComponent(username) + /
   - the identifier is the API's canonical `username` (there is no slug, no
     normalized handle and no id in this URL — the baked directory names under
     u/ are the usernames verbatim, and the backend publishes
     profile_url: `/u/${encodeURIComponent(username)}/`);
   - the encoding is encodeURIComponent, never an HTML-escaper. Three files
     used an HTML `esc()` here, which produces the wrong bytes for any username
     needing percent-encoding and is a different function from what the
     backend, the sitemap and the bake all use.
   -------------------------------------------------------------------------- */
console.log('\ncanonical /u/ URL construction');
{
  const SKIP_DIRS = new Set(['.git', 'node_modules', 'artifacts', 'u', 'approved',
    'tmr_homepage_backups', '.github']);
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name));
      } else if (/\.(html|js|mjs|cjs)$/.test(e.name) && !/\.min\.js$/.test(e.name)) {
        files.push(path.join(dir, e.name));
      }
    }
  })(ROOT);

  const bad = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (rel.startsWith('tests/')) continue;          // this file describes the rule
    const src = fs.readFileSync(file, 'utf8');
    // "/u/" + <expr>   — the concatenation form
    for (const m of src.matchAll(/\/u\/['"`]\s*\+\s*([\s\S]{0,30})/g)) {
      const expr = m[1].trim();
      if (/^encodeURIComponent\s*\(/.test(expr)) continue;
      // A local already holding the encoded name (…var safe = encodeURIComponent(user))
      // is the same thing spelled over two lines.
      const ident = /^([A-Za-z_$][\w$]*)\s*(?:\+|$|[^\w$(])/.exec(expr);
      if (ident && new RegExp(`\\b${ident[1]}\\s*=\\s*encodeURIComponent\\s*\\(`).test(src)) continue;
      bad.push(`${rel}: /u/' + ${expr.split('\n')[0].slice(0, 40)}`);
    }
    // `/u/${<expr>}/` — the template-literal form
    for (const m of src.matchAll(/\/u\/\$\{([^}]{0,60})\}/g)) {
      if (!/encodeURIComponent\s*\(/.test(m[1])) {
        bad.push(`${rel}: /u/\${${m[1].trim().slice(0, 40)}}`);
      }
    }
  }
  if (bad.length) {
    for (const b of bad.slice(0, 12)) fail('non-canonical /u/ URL construction — ' + b);
    if (bad.length > 12) fail(`…and ${bad.length - 12} more`);
  } else {
    ok(`${files.length} source files: every /u/ link uses encodeURIComponent(username)`);
  }
}

console.log(failures === 0
  ? '\nU PROFILE EDGE FALLBACK: ALL CHECKS PASSED'
  : `\nU PROFILE EDGE FALLBACK FAILED: ${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);
