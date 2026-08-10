#!/usr/bin/env node
/**
 * MATCHUP_OF_THE_DAY_PHASE1_20260810 — hub-reset guard.
 *
 * A hub has to be able to go back to empty.
 *
 * The first version of build_matchup_articles.py drove hub rewriting from
 * `sports_present` — the set of sports that currently have something published.
 * A hub was therefore only ever rewritten while it HAD articles. Withdraw the
 * last MLB Game File and /matchups/mlb/ kept serving the stale lead card, the
 * stale ItemList JSON-LD and a link to the article we had just withdrawn:
 * an unpublish that leaves the public surface advertising the unpublished
 * thing, which is worse than not having an unpublish at all.
 *
 * This test runs the real generator twice against a temp copy of the repo:
 *   1. one published MLB article  -> card, link and ItemList entry appear
 *   2. that article unpublished   -> all three are gone, hub reads "prepared"
 *
 * The article FILE is expected to survive step 2 untouched. That is the
 * permanence rule: unpublish removes discovery, never the publication.
 *
 * Offline. No network, no database. Runs the generator with --from-file
 * against a throwaway tree, so it cannot touch the real site.
 *
 *   node tests/matchup-hub-reset-test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SLUG = 'hubreset-away-vs-home-g9001';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m) => { failures += 1; console.error('  FAIL  ' + m); };

/* A throwaway tree with only what the generator touches. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmr-hubreset-'));
for (const rel of ['matchups', 'matchups/mlb', 'scripts']) {
  fs.mkdirSync(path.join(tmp, rel), { recursive: true });
}
fs.copyFileSync(path.join(ROOT, 'scripts', 'build_matchup_articles.py'),
                path.join(tmp, 'scripts', 'build_matchup_articles.py'));
fs.copyFileSync(path.join(ROOT, 'matchups', 'index.html'),
                path.join(tmp, 'matchups', 'index.html'));
fs.copyFileSync(path.join(ROOT, 'matchups', 'mlb', 'index.html'),
                path.join(tmp, 'matchups', 'mlb', 'index.html'));
fs.writeFileSync(path.join(tmp, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n');
// A homepage stub carrying only the cover marker.
fs.writeFileSync(path.join(tmp, 'index.html'),
  '<!DOCTYPE html><html><body>\n<!--MK:motdCover--><!--/MK:motdCover-->\n</body></html>\n');

const ARTICLE = {
  id: 9001, short_id: 9001, sport: 'mlb', slug: SLUG,
  away_team: 'Hub Reset Away', home_team: 'Hub Reset Home',
  game_time_utc: '2026-08-10T23:15:00.000Z', venue_name: 'Test Park',
  status: 'published',
  title: 'Hub reset probe | TMR', h1: 'Hub reset probe',
  meta_description: 'Fixture used by the hub-reset regression test.',
  og_image_url: 'https://trustmyrecord.com/static/og/matchups/g1000.png',
  hero_image_url: '/static/media/matchups/g1000-hero.svg',
  hero_image_alt: 'Hub reset probe cover',
  dek: 'Fixture used by the hub-reset regression test.',
  published_at: '2026-08-10T16:00:00.000Z',
  content_modified_at: '2026-08-10T16:00:00.000Z',
  body_json: [{ module: 'probe', heading: 'Probe',
                blocks: [{ type: 'p', claim_kind: 'analysis', text: 'Fixture body.' }] }],
  provenance: [],
};

function bake(payload, label) {
  const file = path.join(tmp, `${label}.json`);
  fs.writeFileSync(file, JSON.stringify(payload));
  execFileSync('python', [path.join(tmp, 'scripts', 'build_matchup_articles.py'),
                          '--from-file', file],
               { cwd: tmp, stdio: 'pipe' });
}

const read = (rel) => fs.readFileSync(path.join(tmp, rel), 'utf8');

try {
  const homeBefore = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');

  /* ---- 1. published ---------------------------------------------------- */
  bake({ ok: true, count: 1, featured: ARTICLE, articles: [ARTICLE] }, 'published');

  const mlb1 = read('matchups/mlb/index.html');
  const hub1 = read('matchups/index.html');
  const map1 = read('sitemap.xml');
  const home1 = read('index.html');

  if (mlb1.includes(`/matchups/mlb/${SLUG}/`)) ok('published: MLB hub links the article');
  else bad('published: MLB hub has no link to the article');
  if (/<article class="gf-card/.test(mlb1)) ok('published: MLB hub renders a card');
  else bad('published: MLB hub renders no card');
  if (/"@type":\s*"ItemList"/.test(mlb1) && /"numberOfItems":\s*1/.test(mlb1))
    ok('published: MLB hub ItemList has 1 item');
  else bad('published: MLB hub ItemList missing or wrong count');
  if (hub1.includes(`/matchups/mlb/${SLUG}/`)) ok('published: /matchups/ links the article');
  else bad('published: /matchups/ has no link to the article');
  if (map1.includes(`/matchups/mlb/${SLUG}/`)) ok('published: sitemap contains the article');
  else bad('published: sitemap is missing the article');
  /* The homepage cover was rejected and its generator deleted. These two
     assertions used to check that publishing INJECTED a cover; they now check
     the opposite, and check it as a property of the file rather than of one
     class name: publishing a Game File must leave index.html byte-for-byte
     alone. That is the guarantee worth locking, and it does not depend on
     remembering which markup a future promo module might use. */
  if (home1 === homeBefore) ok('published: homepage is byte-identical (never written)');
  else bad('published: the bake MODIFIED the homepage');
  if (!home1.includes('class="motd"')) ok('published: no cover markup on the homepage');
  else bad('published: rejected cover markup is back on the homepage');

  const articleFile = path.join(tmp, 'matchups', 'mlb', SLUG, 'index.html');
  assert.ok(fs.existsSync(articleFile), 'article file should exist after publish');

  /* ---- 2. unpublished: the API stops returning it ---------------------- */
  // This is exactly what /api/matchups serves once status='unpublished':
  // listPublished() filters to published|updated, so the article disappears
  // from the payload entirely.
  bake({ ok: true, count: 0, featured: null, articles: [] }, 'withdrawn');

  const mlb2 = read('matchups/mlb/index.html');
  const hub2 = read('matchups/index.html');
  const map2 = read('sitemap.xml');
  const home2 = read('index.html');

  if (!mlb2.includes(`/matchups/mlb/${SLUG}/`)) ok('withdrawn: MLB hub link is gone');
  else bad('withdrawn: MLB hub STILL links the withdrawn article');
  if (!/<article class="gf-card/.test(mlb2)) ok('withdrawn: MLB hub card is gone');
  else bad('withdrawn: MLB hub STILL renders a card');
  if (!/"@type":\s*"ItemList"/.test(mlb2)) ok('withdrawn: MLB hub ItemList is empty');
  else bad('withdrawn: MLB hub STILL carries stale ItemList JSON-LD');
  if (/is being prepared/.test(mlb2)) ok('withdrawn: MLB hub reads "being prepared"');
  else bad('withdrawn: MLB hub did not return to the prepared state');
  if (!hub2.includes(`/matchups/mlb/${SLUG}/`)) ok('withdrawn: /matchups/ link is gone');
  else bad('withdrawn: /matchups/ STILL links the withdrawn article');
  if (!map2.includes(`/matchups/mlb/${SLUG}/`)) ok('withdrawn: sitemap entry is gone');
  else bad('withdrawn: sitemap STILL contains the withdrawn article');
  if (home2 === homeBefore) ok('withdrawn: homepage still byte-identical');
  else bad('withdrawn: the bake MODIFIED the homepage');

  // PERMANENCE. Discovery went away; the publication did not.
  if (fs.existsSync(articleFile)) ok('withdrawn: the article FILE survives (permanence rule)');
  else bad('withdrawn: the article file was DELETED — a bake must never do that');

} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures) { console.error(`\n${failures} failing`); process.exit(1); }
console.log('\nmatchup hub reset: hubs and sitemap return to empty; homepage untouched; the article file stays');
