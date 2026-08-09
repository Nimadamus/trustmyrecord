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
