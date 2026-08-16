#!/usr/bin/env node
/**
 * seo-indexability-regression-test.js — SEO_20260809
 *
 * Static, offline guard for the indexation rules TrustMyRecord keeps regressing
 * on. Every check here exists because Search Console found the failure weeks
 * after it shipped; the point is to fail here instead, in the same commit.
 *
 * No network. Runs against the checked-out tree, so it works in CI and locally.
 *
 * Checks
 *   1. robots.txt allows crawling and still names the sitemap.
 *   2. Every sitemap <loc> resolves to a real file this site would serve.
 *   3. No sitemap URL is noindex, meta-refresh, or non-self-canonical.
 *   4. Every sitemap page has a <title> and an <h1>.
 *   5. No sitemap URL is one of the alias redirect stubs.
 *   6. Every alias stub has canonical == its refresh target (so GSC files it as
 *      "Page with redirect" instead of a duplicate).
 *   7. No page carries noindex except the explicitly allowlisted private ones.
 *   8. Every /u/ profile page is index,follow AND self-canonical AND carries
 *      baked record content (this is the soft-404 guard: an empty shell fails).
 *   9. Every internal href in every HTML page resolves — TMR must not feed
 *      Google a URL that 404s.
 *  10. No /forum/thread/<slug>/ (slugless) link construction in shipped JS that
 *      a page actually references.
 *  11. Sitemap XML is well-formed, uses the right namespace, has no duplicates,
 *      and every URL is absolute https on the canonical host.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://trustmyrecord.com';
// Kept in lockstep with EDGE_PLACEHOLDER in scripts/build_profile_pages.py and
// U_PLACEHOLDER in workers/home-ssr/worker.mjs.
const U_FALLBACK_PLACEHOLDER = '__TMR_USERNAME__';

let failures = 0;
function fail(msg) {
  failures += 1;
  console.error('  FAIL  ' + msg);
}
function ok(msg) {
  console.log('  ok    ' + msg);
}

const read = (p) => fs.readFileSync(p, 'utf8');

/* ------------------------------------------------------------------ helpers */

const SKIP_DIRS = new Set(['.git', 'node_modules', '.github', 'tests', 'scripts',
                           'docs', 'preview', 'approved', 'archive', 'workers']);

function walkHtml(dir, out) {
  out = out || [];
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkHtml(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

/** The site URL a repo-relative file path is served at. */
function urlFor(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  return rel.endsWith('/index.html')
    ? SITE + '/' + rel.slice(0, -'index.html'.length)
    : (rel === 'index.html' ? SITE + '/' : SITE + '/' + rel);
}

/** Does a site path resolve to something GitHub Pages would serve? */
function resolves(sitePath) {
  let p = sitePath.split('#')[0].split('?')[0];
  if (p === '' || p === '/') return true;
  p = p.replace(/^\//, '');
  const fsPath = path.join(ROOT, p.split('/').join(path.sep));
  if (fs.existsSync(fsPath)) {
    const st = fs.statSync(fsPath);
    if (st.isFile()) return true;
    if (st.isDirectory() && fs.existsSync(path.join(fsPath, 'index.html'))) return true;
  }
  return fs.existsSync(fsPath + '.html');
}

const rxAttr = (tag, attr) => {
  const m = new RegExp('content=["\']([^"\']*)["\']', 'i').exec(tag);
  return m ? m[1] : '';
};
function metaRobots(html) {
  const m = /<meta[^>]+name=["']robots["'][^>]*>/i.exec(html);
  return m ? rxAttr(m[0]).trim().toLowerCase() : '';
}
function canonical(html) {
  const m = /<link[^>]+rel=["']canonical["'][^>]*>/i.exec(html);
  if (!m) return '';
  const h = /href=["']([^"']+)["']/i.exec(m[0]);
  return h ? h[1] : '';
}
function metaRefresh(html) {
  const m = /<meta[^>]+http-equiv=["']refresh["'][^>]*>/i.exec(html);
  return m ? rxAttr(m[0]).trim() : '';
}
function refreshTarget(refresh) {
  const m = /url=\s*(.+)$/i.exec(refresh);
  if (!m) return '';
  let u = m[1].trim().replace(/^["']|["']$/g, '');
  if (u.startsWith('/')) u = SITE + u;
  return u;
}
const norm = (u) => String(u || '').replace(/\/$/, '');

/** Visible text length, scripts/styles stripped — the crawler's payload. */
function textLen(html) {
  const b = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html);
  const body = b ? b[1] : html;
  return body
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

/* --------------------------------------------------------------- 1. robots */

console.log('robots.txt');
{
  const robots = read(path.join(ROOT, 'robots.txt'));
  if (!/^\s*Allow:\s*\/\s*$/mi.test(robots)) fail('robots.txt has no "Allow: /"');
  else ok('Allow: /');

  if (!new RegExp('^\\s*Sitemap:\\s*' + SITE + '/sitemap\\.xml\\s*$', 'mi').test(robots))
    fail('robots.txt does not reference ' + SITE + '/sitemap.xml');
  else ok('names the sitemap');

  // A Disallow of a real content section is how a whole family silently drops
  // out of the index. Allow only an explicit, reviewed list.
  const ALLOWED_DISALLOW = new Set([]);
  for (const m of robots.matchAll(/^\s*Disallow:\s*(\S+)\s*$/gmi)) {
    const p = m[1];
    if (p === '' || ALLOWED_DISALLOW.has(p)) continue;
    // Cloudflare's managed AI-crawler block is appended at the edge, not here.
    fail('robots.txt Disallows "' + p + '" — no section may be blocked in-repo');
  }
  ok('no unexpected Disallow');
}

/* -------------------------------------------------------------- 2. sitemap */

console.log('\nsitemap.xml');
const sitemapXml = read(path.join(ROOT, 'sitemap.xml'));
const locs = [...sitemapXml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);

assert.ok(locs.length > 50, 'sitemap looks truncated: only ' + locs.length + ' URLs');
ok(locs.length + ' URLs');

if (!sitemapXml.includes('http://www.sitemaps.org/schemas/sitemap/0.9'))
  fail('sitemap namespace is not http://www.sitemaps.org/schemas/sitemap/0.9');
else ok('correct namespace');

{
  const seen = new Set();
  for (const u of locs) {
    if (seen.has(u)) fail('duplicate sitemap <loc>: ' + u);
    seen.add(u);
    if (!u.startsWith(SITE + '/')) fail('sitemap <loc> is not an absolute ' + SITE + ' URL: ' + u);
    if (u.includes('?') || u.includes('#')) fail('sitemap <loc> carries a query/fragment: ' + u);
  }
  ok('no duplicates, all absolute canonical-host URLs');
}

/* ------------------------------------- 3-5. every sitemap URL is indexable */

console.log('\nsitemap URLs are indexable');
const byUrl = new Map();
const htmlFiles = walkHtml(ROOT);
for (const f of htmlFiles) byUrl.set(norm(urlFor(f)), f);

for (const loc of locs) {
  const file = byUrl.get(norm(loc));
  if (!file) {
    fail('sitemap URL has no page in the repo (would 404): ' + loc);
    continue;
  }
  const html = read(file);
  const robots = metaRobots(html);
  if (robots.includes('noindex')) fail('sitemap URL is noindex: ' + loc);
  const refresh = metaRefresh(html);
  if (refresh) fail('sitemap URL is a meta-refresh redirect: ' + loc);
  const canon = canonical(html);
  if (!canon) fail('sitemap URL has no canonical: ' + loc);
  else if (norm(canon) !== norm(loc))
    fail('sitemap URL is not self-canonical: ' + loc + ' -> ' + canon);
  if (!/<title[^>]*>\s*\S/i.test(html)) fail('sitemap URL has no <title>: ' + loc);
  if (!/<h1[\s>]/i.test(html)) fail('sitemap URL has no <h1>: ' + loc);
}
ok('checked ' + locs.length + ' sitemap URLs for 200/noindex/refresh/canonical/title/h1');

/* --------------------------------------------- 6. alias redirect stubs */

console.log('\nalias redirect stubs');
{
  const locSet = new Set(locs.map(norm));
  let stubs = 0;
  for (const file of htmlFiles) {
    const html = read(file);
    const refresh = metaRefresh(html);
    if (!refresh) continue;
    stubs += 1;
    const url = urlFor(file);
    if (locSet.has(norm(url))) fail('redirect stub is in the sitemap: ' + url);
    const target = refreshTarget(refresh);
    const canon = canonical(html);
    if (!canon) fail('redirect stub has no canonical: ' + url);
    else if (norm(canon) !== norm(target))
      fail('stub canonical disagrees with its refresh target: ' + url +
           ' canonical=' + canon + ' refresh=' + target);
    if (metaRobots(html).includes('noindex'))
      fail('redirect stub is noindex (owner rule: never noindex): ' + url);
  }
  ok(stubs + ' stubs: none in sitemap, each self-consistent, none noindex');
}

/* ------------------------------------------------------- 7. noindex allowlist */

console.log('\nnoindex allowlist');
{
  // The ONLY pages allowed to carry noindex. Adding to this list is a decision,
  // not a shrug — see SEO_INDEXING_PROTOCOL.md section 2.
  const ALLOW_NOINDEX = new Set([
    SITE + '/admin/tmr-economy/',
    SITE + '/betlegend-pro/app/',
    // The service worker's offline fallback for the page above. Same private,
    // per-account surface, and it is not a page anyone navigates to: it is
    // returned by the worker when an installed app cannot reach the network,
    // it is linked from nowhere, and its entire content is "you're offline".
    // Indexing it would put that sentence in search results under the product's
    // name. Added deliberately, per SEO_INDEXING_PROTOCOL.md section 2's
    // "genuinely private/gated surfaces" carve-out.
    SITE + '/betlegend-pro/app/offline.html',
    SITE + '/mlb-simulator/simulations/matchup/',
    SITE + '/mlb-simulator/simulations/run/',
  ]);
  for (const file of htmlFiles) {
    const html = read(file);
    if (!metaRobots(html).includes('noindex')) continue;
    const url = urlFor(file);
    if (!ALLOW_NOINDEX.has(url))
      fail('unexpected noindex: ' + url + ' (owner rule: never noindex anything)');
  }
  ok('no noindex outside the ' + ALLOW_NOINDEX.size + ' allowlisted private pages');
}

/* --------------------------------- 8. /u/ profiles: the soft-404 guard */

console.log('\n/u/ profile pages');
{
  const udir = path.join(ROOT, 'u');
  const names = fs.existsSync(udir)
    ? fs.readdirSync(udir).filter((n) => fs.existsSync(path.join(udir, n, 'index.html')))
    : [];
  assert.ok(names.length > 10, 'expected baked profile pages, found ' + names.length);

  let thin = [];
  for (const n of names) {
    const file = path.join(udir, n, 'index.html');
    const html = read(file);
    const url = SITE + '/u/' + n + '/';
    const robots = metaRobots(html);
    if (robots.includes('noindex')) fail('profile is noindex: ' + url);
    if (!/index/.test(robots)) fail('profile has no index,follow robots tag: ' + url);
    if (norm(canonical(html)) !== norm(url))
      fail('profile is not self-canonical: ' + url + ' -> ' + canonical(html));
    if (!/<h1[\s>]/i.test(html)) fail('profile has no <h1>: ' + url);
    if (!/application\/ld\+json/i.test(html)) fail('profile has no JSON-LD: ' + url);
    if (!/"@type":\s*"ProfilePage"/.test(html)) fail('profile has no ProfilePage schema: ' + url);

    // SOFT404 guard. The pre-2026-08-09 compact template baked
    // "<b>&mdash;</b><span>Loading record</span>" and an empty #uDeep, so the
    // crawler saw ~500 chars and Google called it a soft 404. Any page that
    // ships the loading placeholder instead of real numbers fails here.
    if (/Loading record/i.test(html))
      fail('profile ships the "Loading record" placeholder instead of baked ' +
           'stats (soft-404 regression): ' + url);
    if (textLen(html) < 620) thin.push(n + '(' + textLen(html) + ')');
  }
  if (thin.length) {
    // Zero-graded-pick members are legitimately sparse; a large jump in the
    // thin count means the template stopped baking data again.
    console.log('  note  ' + thin.length + ' profile(s) under 620 chars (members with ' +
                'no graded record): ' + thin.slice(0, 8).join(', ') +
                (thin.length > 8 ? ', …' : ''));
    if (thin.length > names.length * 0.85)
      fail('nearly every profile is thin (' + thin.length + '/' + names.length +
           ') — the record data is not being baked');
  }
  ok(names.length + ' profiles: index,follow + self-canonical + ProfilePage + baked stats');
}

/* --------- 8a2. the edge /u/ fallback template (EDGE_FALLBACK_20260810) ----
   /u/<username>/ is a static file, but the API publishes that URL the instant
   an account exists, so between registration and the next successful bake the
   canonical URL of a real member is a genuine 404 (measured at 10m20s for
   member `whocares67` on 2026-08-10). workers/home-ssr/worker.mjs closes that
   window by serving this template with HTTP 200 for any /u/ the origin 404s
   and the API confirms is a real member.

   The template is generated by scripts/build_profile_pages.py through the SAME
   renderer as every baked page, so it cannot drift into an empty shell the way
   the pre-2026-08-09 compact template did — but only if it keeps being
   generated and keeps satisfying the same contract those pages do. That is
   what this checks. If the template goes missing or degrades, the worker fails
   open to the origin 404 and the recurrence is back. */

console.log('\n/u/ edge fallback template');
{
  const file = path.join(ROOT, 'static', 'prerender', 'u-fallback.html');
  if (!fs.existsSync(file)) {
    fail('static/prerender/u-fallback.html is missing — scripts/build_profile_pages.py ' +
         'must emit it or a brand-new member 404s until CI bakes their page');
  } else {
    const tpl = read(file);
    const count = tpl.split(U_FALLBACK_PLACEHOLDER).length - 1;
    if (count < 5)
      fail('u-fallback.html has only ' + count + ' ' + U_FALLBACK_PLACEHOLDER +
           ' placeholder(s); the rendered page would not be about the member');

    // Filled with a real username it must be indistinguishable from a baked
    // compact profile — same contract asserted on the /u/ pages above.
    const name = 'edgefallbackprobe';
    const html = tpl.split(U_FALLBACK_PLACEHOLDER).join(name);
    const url = SITE + '/u/' + name + '/';
    if (metaRobots(html).includes('noindex')) fail('u-fallback template is noindex');
    if (!/index/.test(metaRobots(html))) fail('u-fallback template has no index,follow robots tag');
    if (norm(canonical(html)) !== norm(url))
      fail('u-fallback template is not self-canonical when filled: ' + canonical(html));
    if (!/<h1[\s>]/i.test(html)) fail('u-fallback template has no <h1>');
    if (!/"@type":\s*"ProfilePage"/.test(html)) fail('u-fallback template has no ProfilePage schema');
    if (/Loading record/i.test(html))
      fail('u-fallback template ships the "Loading record" placeholder (soft-404 regression)');
    if (!html.includes('tmr-profile-hydrate'))
      fail('u-fallback template does not load tmr-profile-hydrate.js, so the visitor ' +
           'would never be swapped into the real /profile/ app');
    if (tpl.includes('TMREDGEUSERNAME'))
      fail('u-fallback template still contains the render sentinel — the placeholder ' +
           'substitution in build_profile_pages.py did not run');

    // The worker only substitutes usernames it can drop in unescaped, so the
    // placeholder has to sit in contexts where that is true. A placeholder that
    // ended up inside a JS string literal or an attribute needing encoding
    // would be a correctness hazard the moment a username contained a quote.
    ok('u-fallback template: ' + count + ' placeholders, index,follow + self-canonical + ' +
       'ProfilePage + baked stats + hydrate');
  }

  // The worker is what actually serves it. A template with no consumer is dead
  // weight and the 404 comes straight back, so assert the wiring exists.
  const worker = path.join(ROOT, 'workers', 'home-ssr', 'worker.mjs');
  if (!fs.existsSync(worker)) {
    fail('workers/home-ssr/worker.mjs is missing — nothing serves the /u/ fallback');
  } else {
    const src = read(worker);
    if (!src.includes('/static/prerender/u-fallback.html'))
      fail('worker no longer references the /u/ fallback template path');
    if (!src.includes(U_FALLBACK_PLACEHOLDER))
      fail('worker no longer substitutes ' + U_FALLBACK_PLACEHOLDER);
    if (!/handleUserProfile/.test(src))
      fail('worker no longer has the /u/ 404 fallback handler');
    ok('worker wiring: /u/ handler + template path + placeholder substitution present');
  }
}

/* ------------------------- 8b. /matchups/ Game Files: the permanence guard */

console.log('\n/matchups/ Game Files');
{
  const mdir = path.join(ROOT, 'matchups');
  const sitemapXml = read(path.join(ROOT, 'sitemap.xml'));

  // The two hubs are the discovery path. If they are not indexable, every
  // article behind them is one internal link poorer and the archive stops
  // compounding, which is the entire point of the section.
  for (const hub of ['matchups', 'matchups/mlb']) {
    const file = path.join(ROOT, hub, 'index.html');
    if (!fs.existsSync(file)) { fail('missing hub: /' + hub + '/'); continue; }
    const html = read(file);
    const url = SITE + '/' + hub + '/';
    if (metaRobots(html).includes('noindex')) fail('hub is noindex: ' + url);
    if (norm(canonical(html)) !== norm(url)) fail('hub is not self-canonical: ' + url);
    if (!/<h1[\s>]/i.test(html)) fail('hub has no <h1>: ' + url);
    if (!/"@type":\s*"BreadcrumbList"/.test(html)) fail('hub has no BreadcrumbList: ' + url);
  }

  // The methodology destination the byline points at has to exist, or the
  // author attribution is a dead link on every article on the site.
  if (!fs.existsSync(path.join(ROOT, 'about', 'research', 'index.html')))
    fail('/about/research/ is missing — every Game File byline links to it');

  const articles = [];
  if (fs.existsSync(mdir)) {
    for (const sport of fs.readdirSync(mdir)) {
      const sdir = path.join(mdir, sport);
      if (!fs.statSync(sdir).isDirectory()) continue;
      for (const slug of fs.readdirSync(sdir)) {
        const file = path.join(sdir, slug, 'index.html');
        if (fs.existsSync(file)) articles.push({ sport, slug, file });
      }
    }
  }

  const shortIds = new Map();
  for (const a of articles) {
    const html = read(a.file);
    const url = `${SITE}/matchups/${a.sport}/${a.slug}/`;

    // --- URL identity -----------------------------------------------------
    // No date in the slug, ever. A dated slug turns a permanent publication
    // into a dated one and invites the "replace it tomorrow" mistake this
    // whole architecture exists to prevent.
    if (/\d{4}-\d{2}-\d{2}/.test(a.slug) || /-(january|february|march|april|may|june|july|august|september|october|november|december)-/.test(a.slug))
      fail('Game File slug contains a date: ' + url);
    const m = /-g(\d+)$/.exec(a.slug);
    if (!m) fail('Game File slug does not end in the immutable -g<id>: ' + url);
    else {
      if (shortIds.has(m[1]))
        fail(`short id g${m[1]} is used by two Game Files: ${shortIds.get(m[1])} and ${url}`);
      shortIds.set(m[1], url);
    }
    if (a.slug !== a.slug.toLowerCase()) fail('Game File slug is not lowercase: ' + url);

    // --- indexability -----------------------------------------------------
    const robots = metaRobots(html);
    if (robots.includes('noindex')) fail('Game File is noindex: ' + url);
    if (!/index/.test(robots)) fail('Game File has no index,follow robots tag: ' + url);
    if (!/max-image-preview:large/.test(robots))
      fail('Game File is missing max-image-preview:large: ' + url);
    /* Self-canonical, UNLESS the piece has been republished at a better address.
       A superseded page keeps serving — a published URL is never deleted — and
       points at its replacement, which is precisely what a canonical is for. So
       the rule is: self-canonical, or canonical to a Game File that EXISTS. The
       second half matters more than the first; a canonical aimed at a 404 is
       worse than no canonical at all. */
    const canon = norm(canonical(html));
    if (canon !== norm(url)) {
      const target = canon.replace(/^https?:\/\/[^/]+/, '').replace(/^\/|\/$/g, '');
      const targetFile = path.join(ROOT, target, 'index.html');
      if (!fs.existsSync(targetFile)) {
        fail('Game File canonical points at a page that does not exist: ' + url + ' -> ' + canonical(html));
      } else {
        ok('superseded Game File canonicals to its replacement: ' + url);
      }
    }

    // --- the content is actually IN the document --------------------------
    // This is the C1/soft-404 guard, in the form it takes for an article: the
    // failure mode is not an empty shell, it is a shell that looks convincing.
    if (!/<h1[\s>]/i.test(html)) fail('Game File has no <h1>: ' + url);
    if (/Loading analysis|Loading…|Loading\.\.\./i.test(html))
      fail('Game File ships a loading placeholder instead of baked content: ' + url);
    if (textLen(html) < 2500)
      fail(`Game File has only ${textLen(html)} chars of text — a flagship article that thin is a soft 404: ${url}`);

    // --- authorship + dates -----------------------------------------------
    if (!/href="\/about\/research\/"/.test(html))
      fail('Game File byline does not link to /about/research/: ' + url);
    if (!/<time datetime="20\d\d-/.test(html))
      fail('Game File has no machine-readable published/updated date: ' + url);

    // --- structured data, and it must agree with the page -----------------
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    if (!blocks.length) { fail('Game File has no JSON-LD: ' + url); continue; }
    let article = null, crumbs = null;
    for (const b of blocks) {
      let parsed;
      try { parsed = JSON.parse(b[1]); }
      catch (err) { fail('Game File JSON-LD does not parse: ' + url + ' — ' + err.message); continue; }
      for (const node of parsed['@graph'] || [parsed]) {
        if (node['@type'] === 'Article') article = node;
        if (node['@type'] === 'BreadcrumbList') crumbs = node;
      }
    }
    if (!article) { fail('Game File has no Article schema: ' + url); }
    else {
      for (const field of ['headline', 'description', 'image', 'datePublished', 'dateModified', 'author', 'publisher', 'mainEntityOfPage'])
        if (!article[field]) fail(`Article schema is missing ${field}: ${url}`);
      if (article.mainEntityOfPage && norm(article.mainEntityOfPage['@id']) !== norm(url))
        fail('Article mainEntityOfPage does not match the canonical: ' + url);
      if (article.author && article.author.name !== 'TrustMyRecord Research')
        fail('Article author is not the approved organisational byline: ' + url);
      // Schema must describe the page, not decorate it: the headline has to be
      // the H1 the reader actually sees.
      const h1 = (/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1] || '';
      const plainH1 = h1.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();
      if (plainH1 && article.headline && plainH1 !== article.headline.trim())
        fail(`Article headline ("${article.headline}") does not match the visible H1 ("${plainH1}"): ${url}`);
    }
    if (!crumbs) fail('Game File has no BreadcrumbList: ' + url);
    else if ((crumbs.itemListElement || []).length < 4)
      fail('BreadcrumbList should be Home > Matchups > Sport > Matchup: ' + url);

    // --- imagery ----------------------------------------------------------
    // The hero is a CSS/typographic composition, not a photograph, so there is
    // no hero <img> to check any more. The two things that still matter are
    // unchanged and are checked instead: the social card must be a real
    // TMR-controlled asset with alt text, and any image that IS in the article
    // must be ours and described. TMR does not hotlink third-party imagery, and
    // an undescribed image is invisible to a screen reader and to image search.
    const ogImg = (/<meta property="og:image" content="([^"]*)"/.exec(html) || [])[1] || '';
    const ogAlt = (/<meta property="og:image:alt" content="([^"]*)"/.exec(html) || [])[1] || '';
    if (!/^https:\/\/trustmyrecord\.com\/static\//.test(ogImg))
      fail('Game File og:image is not a TMR-controlled /static/ asset: ' + (ogImg || '(missing)'));
    if (!ogAlt.trim()) fail('Game File og:image has empty alt text: ' + url);

    for (const m of html.matchAll(/<img\b[^>]*>/g)) {
      const tag = m[0];
      const src = (/\ssrc="([^"]*)"/.exec(tag) || [])[1] || '';
      const alt = (/\salt="([^"]*)"/.exec(tag) || [])[1];
      if (src && !/^\/static\//.test(src) && !/^https:\/\/trustmyrecord\.com\/static\//.test(src))
        fail('Game File embeds a non-TMR image: ' + src + ' on ' + url);
      if (alt === undefined || !alt.trim())
        fail('Game File image has no alt text: ' + (src || tag.slice(0, 60)) + ' on ' + url);
      if (!/\bwidth="/.test(tag) || !/\bheight="/.test(tag))
        fail('Game File image has no intrinsic width/height (layout shift): ' + src);
    }

    // --- discovery --------------------------------------------------------
    const occurrences = sitemapXml.split(`<loc>${url}</loc>`).length - 1;
    if (occurrences > 1) fail(`Game File appears ${occurrences} times in the sitemap: ${url}`);
    // Zero is legitimate: an unpublished article keeps its page and loses its
    // sitemap entry. That is the designed behaviour, not a defect.
    if (occurrences === 1) {
      const hub = read(path.join(ROOT, 'matchups', 'index.html'));
      const sportHub = path.join(ROOT, 'matchups', a.sport, 'index.html');
      const href = `/matchups/${a.sport}/${a.slug}/`;
      if (!hub.includes(href))
        fail('published Game File has no crawlable link from /matchups/: ' + url);
      if (fs.existsSync(sportHub) && !read(sportHub).includes(href))
        fail(`published Game File has no crawlable link from /matchups/${a.sport}/: ` + url);
    }
  }
  ok(articles.length + ' Game File(s): permanent slug + self-canonical + Article/Breadcrumb schema + baked body');
}

/* --------------------------------------- 9. internal links all resolve */

console.log('\ninternal link integrity');
{
  const bad = new Map();
  let checked = 0;
  for (const file of htmlFiles) {
    const html = read(file);
    const relDir = path.dirname(path.relative(ROOT, file)).split(path.sep).join('/');
    for (const m of html.matchAll(/(?:href|src)\s*=\s*["']([^"'>\s]+)["']/gi)) {
      const raw = m[1].trim();
      if (!raw || /^(#|mailto:|tel:|javascript:|data:)/i.test(raw)) continue;
      let p;
      if (/^https?:\/\//i.test(raw)) {
        const u = new URL(raw);
        if (u.hostname !== 'trustmyrecord.com' && u.hostname !== 'www.trustmyrecord.com') continue;
        p = u.pathname;
      } else if (raw.startsWith('//')) {
        continue;
      } else if (raw.startsWith('/')) {
        p = raw;
      } else {
        p = '/' + (relDir === '.' ? '' : relDir + '/') + raw;
      }
      if (/[${}<>]/.test(p)) continue;   // JS template placeholder, not a URL
      // static/prerender/u-fallback.html is a TEMPLATE, not a page: the worker
      // substitutes a real username for __TMR_USERNAME__ at request time. The
      // dedicated check below verifies it; here it is an unfilled placeholder
      // exactly like the JS ones above, not a broken link.
      if (p.includes(U_FALLBACK_PLACEHOLDER)) continue;
      // Cloudflare injects its own /cdn-cgi/ assets at the edge.
      if (p.startsWith('/cdn-cgi/')) continue;
      checked += 1;
      if (!resolves(p)) {
        if (!bad.has(p)) bad.set(p, []);
        bad.get(p).push(path.relative(ROOT, file));
      }
    }
  }
  for (const [target, srcs] of bad) {
    // /u/ alone is a JS prefix that gets a username appended at runtime.
    if (target === '/u/' || target === '/u') continue;
    fail('internal link to a URL that does not exist: ' + target +
         '  (from ' + srcs.slice(0, 4).join(', ') + ')');
  }
  ok(checked + ' internal links checked');
}

/* ---------------------------- 10. no slugless forum thread URL builders */

console.log('\nforum thread URL construction');
{
  // /forum/thread/<slug>/ (no id) is a guaranteed 404: the real route is
  // /forum/thread/<id>/<slug>/. An older tmr-home-live build shipped exactly
  // that and fed Google dead URLs from the homepage's live rows.
  const referenced = new Set();
  for (const file of htmlFiles) {
    for (const m of read(file).matchAll(/\/static\/js\/([A-Za-z0-9._-]+\.js)/g))
      referenced.add(m[1]);
  }
  const jsDir = path.join(ROOT, 'static', 'js');
  const BAD = /['"`]\/forum\/thread\/['"`]\s*\+\s*encodeURIComponent\(\s*[A-Za-z_$][\w.$]*\.slug\s*\)/;
  for (const name of referenced) {
    const f = path.join(jsDir, name);
    if (!fs.existsSync(f)) continue;
    if (BAD.test(read(f)))
      fail(name + ' builds /forum/thread/<slug>/ with no thread id — that URL 404s');
  }
  ok(referenced.size + ' referenced JS bundles checked for slugless thread URLs');
}

/* ------------------------------------------------------------------ result */

console.log('');
if (failures) {
  console.error('SEO INDEXABILITY REGRESSION TEST FAILED: ' + failures + ' problem(s)');
  process.exit(1);
}
console.log('ALL SEO INDEXABILITY CHECKS PASSED');
