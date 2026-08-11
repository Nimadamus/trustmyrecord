/*
 * TRIVIA_SEO_CATEGORY_ROUTES_20260811
 *
 * Guards the crawlable league pages at /trivia/<slug>/.
 *
 * The point of this release is that there is still exactly ONE trivia code
 * path. The league pages are generated from trivia/index.html by
 * scripts/build_trivia_categories.py, so the single thing that can silently
 * break the guarantee is a hand-edit to a generated file, or an edit to the
 * master that never got regenerated. Check 1 makes both impossible.
 *
 * The rest asserts what each league page owes Google (unique title/description/
 * h1, self-canonical, indexable, real crawlable links) and what it owes the
 * product (the full trivia engine, not a stripped copy).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://trustmyrecord.com';
const SLUGS = ['nfl', 'nba', 'mlb', 'nhl'];

let failures = 0;
function fail(msg) {
  console.error('  FAIL  ' + msg);
  failures++;
}
function ok(msg) {
  console.log('  ok    ' + msg);
}
const read = (p) => fs.readFileSync(p, 'utf8');
const pagePath = (slug) => path.join(ROOT, 'trivia', slug, 'index.html');

/* ------------------------------------------------- 1. no drift from master */
console.log('\ngenerated pages match trivia/index.html');
// Linux CI runners ship python3; Windows dev boxes ship python / py. Try each.
const GEN = path.join(ROOT, 'scripts', 'build_trivia_categories.py');
let checked = false;
let lastErr = '';
for (const exe of ['python3', 'python', 'py']) {
  try {
    const out = execFileSync(exe, [GEN, '--check'], { cwd: ROOT, encoding: 'utf8' });
    checked = true;
    if (/DRIFT/.test(out)) fail('generated pages have drifted from trivia/index.html:\n' + out);
    else ok('all ' + SLUGS.length + ' league pages regenerate byte-identically (via ' + exe + ')');
    break;
  } catch (e) {
    // ENOENT means "no such interpreter"; anything else is a real check failure.
    if (e && e.code === 'ENOENT') { lastErr = 'no ' + exe; continue; }
    checked = true;
    fail('build_trivia_categories.py --check failed:\n' + String(e.stdout || e.message).slice(0, 600));
    break;
  }
}
if (!checked) fail('could not run the generator drift check - no python3/python/py on PATH (' + lastErr + ')');

/* ------------------------------------------------------ 2. per-page SEO */
console.log('\nper-page SEO invariants');
const titles = new Map();
const descs = new Map();
const master = read(path.join(ROOT, 'trivia', 'index.html'));

for (const slug of SLUGS) {
  const p = pagePath(slug);
  if (!fs.existsSync(p)) { fail('missing page: trivia/' + slug + '/index.html'); continue; }
  const html = read(p);
  const url = SITE + '/trivia/' + slug + '/';
  const at = (re) => { const m = re.exec(html); return m ? m[1] : null; };

  const canon = at(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (canon !== url) fail(slug + ': canonical is ' + canon + ', expected ' + url);

  if (/noindex/i.test(html)) fail(slug + ': carries noindex (owner rule: never noindex)');
  if (/<meta[^>]+http-equiv=["']refresh["']/i.test(html)) fail(slug + ': carries a meta refresh');

  const h1s = html.match(/<h1[^>]*>/g) || [];
  if (h1s.length !== 1) fail(slug + ': has ' + h1s.length + ' h1 tags, expected exactly 1');
  const h1text = at(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (!h1text || h1text.toLowerCase().indexOf(slug) === -1)
    fail(slug + ': h1 "' + h1text + '" does not name the league');

  const title = at(/<title>([^<]+)<\/title>/i);
  if (!title || title.toLowerCase().indexOf(slug) === -1)
    fail(slug + ': title does not name the league: ' + title);
  if (titles.has(title)) fail(slug + ': title duplicates ' + titles.get(title));
  titles.set(title, slug);

  const desc = at(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (!desc) fail(slug + ': no meta description');
  else {
    if (desc.length > 165) fail(slug + ': meta description is ' + desc.length + ' chars (>165)');
    if (!/[.!?]$/.test(desc)) fail(slug + ': meta description is not a finished sentence');
    if (descs.has(desc)) fail(slug + ': description duplicates ' + descs.get(desc));
    descs.set(desc, slug);
  }

  const ogUrl = at(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
  if (ogUrl !== url) fail(slug + ': og:url is ' + ogUrl + ', expected ' + url);
  for (const tag of ['og:title', 'og:image', 'twitter:card', 'twitter:image']) {
    if (html.indexOf(tag) === -1) fail(slug + ': missing ' + tag);
  }

  // structured data: breadcrumb must be 3 deep and end on this page
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
    .map((m) => { try { return JSON.parse(m[1]); } catch (e) { return { '@type': 'PARSE_ERROR' }; } });
  const crumb = blocks.find((b) => b['@type'] === 'BreadcrumbList');
  const app = blocks.find((b) => b['@type'] === 'WebApplication');
  if (!crumb) fail(slug + ': no BreadcrumbList');
  else {
    const items = crumb.itemListElement || [];
    if (items.length !== 3) fail(slug + ': breadcrumb has ' + items.length + ' levels, expected 3');
    else if (items[2].item !== url) fail(slug + ': breadcrumb leaf is ' + items[2].item);
  }
  if (!app) fail(slug + ': no WebApplication schema');
  else if (app.url !== url) fail(slug + ': WebApplication url is ' + app.url);

  // this shell must tell the engine which league it is
  if (html.indexOf('<script>window.TMR_TRIVIA_CATEGORY = "' + slug + '";</script>') === -1)
    fail(slug + ': does not set window.TMR_TRIVIA_CATEGORY');

  // real crawlable links out: the hub plus the other three leagues
  if (html.indexOf('href="/trivia/"') === -1) fail(slug + ': no crawlable link back to /trivia/');
  for (const other of SLUGS) {
    if (other === slug) {
      if (html.indexOf('href="/trivia/' + slug + '/"') !== -1)
        fail(slug + ': links to itself');
    } else if (html.indexOf('href="/trivia/' + other + '/"') === -1) {
      fail(slug + ': no crawlable link to sibling /trivia/' + other + '/');
    }
  }

  // supporting copy: enough to be useful, not a keyword wall
  const about = /<h2[^>]*>About [^<]*<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/.exec(html);
  if (!about) fail(slug + ': no league copy block');
  else {
    const words = about[1].replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length;
    if (words < 90 || words > 210) fail(slug + ': league copy is ' + words + ' words (want 90-210)');
  }

  // it is the real engine, not a stripped duplicate
  for (const token of ['id="categoriesGrid"', 'id="quizOverlay"', 'id="leaderboardList"',
    'id="historyList"', 'id="createQuestionCard"', 'TRIVIA_BACKEND_UI_GUARD_20260509',
    "api.request('/trivia/v2/sessions'"]) {
    if (html.indexOf(token) === -1) fail(slug + ': generated page is missing engine token ' + token);
  }
}
if (!failures) ok(SLUGS.length + ' league pages: unique title/description/h1, self-canonical, indexable, 3-level breadcrumb, engine intact');

/* ---------------------------------------------- 3. hub + flag + sitemap */
console.log('\nhub, kill switch and sitemap');

const flag = /var TRIVIA_SEO_CATEGORY_ROUTES = \[([^\]]*)\];/.exec(master);
if (!flag) fail('TRIVIA_SEO_CATEGORY_ROUTES kill switch is gone from trivia/index.html');
else {
  const listed = flag[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
  const missing = SLUGS.filter((s) => listed.indexOf(s) === -1);
  const extra = listed.filter((s) => SLUGS.indexOf(s) === -1);
  if (missing.length) fail('kill switch does not list: ' + missing.join(', '));
  if (extra.length) fail('kill switch lists slugs with no generated page: ' + extra.join(', '));
  if (!missing.length && !extra.length) ok('kill switch lists exactly the generated leagues');
}
if (master.indexOf('<a class="category-card" href="/trivia/') === -1)
  fail('hub no longer renders league cards as crawlable anchors');
else ok('hub renders league cards as real <a href> elements');
if (master.indexOf("event.preventDefault();startQuiz(") === -1)
  fail('anchor cards no longer preventDefault into startQuiz - click UX regressed');
else ok('a plain left-click on a league card still opens the quiz overlay');
if (master.indexOf('<link rel="canonical" href="' + SITE + '/trivia/">') === -1)
  fail('hub canonical regressed');

const sitemap = read(path.join(ROOT, 'sitemap.xml'));
for (const slug of SLUGS) {
  if (sitemap.indexOf('<loc>' + SITE + '/trivia/' + slug + '/</loc>') === -1)
    fail('sitemap is missing ' + SITE + '/trivia/' + slug + '/');
}
// nothing beyond the four intended pages may appear
const strayTrivia = [...sitemap.matchAll(/<loc>https:\/\/trustmyrecord\.com\/trivia\/([^<]*)<\/loc>/g)]
  .map((m) => m[1]).filter((tail) => tail !== '' && SLUGS.indexOf(tail.replace(/\/$/, '')) === -1
    && tail !== 'history/');
if (strayTrivia.length) fail('unexpected trivia URLs in sitemap: ' + strayTrivia.join(', '));
else ok('sitemap carries exactly /trivia/, /trivia/history/ and the 4 league pages');

/* -------------------------------------------------------------------- */
if (failures) {
  console.error('\nTrivia category pages test FAILED (' + failures + ' problem(s)).');
  process.exit(1);
}
console.log('\nTrivia category pages test passed.');
