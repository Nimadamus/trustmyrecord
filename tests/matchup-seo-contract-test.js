#!/usr/bin/env node
/**
 * MATCHUP_OF_THE_DAY — the SEO contract, asserted against the baked tree.
 *
 * The daily pipeline's whole product is a permanent, indexable, uniquely
 * addressed article per day. Every one of those adjectives is a thing that can
 * quietly stop being true after a template edit: a canonical that points at the
 * hub instead of the article, a noindex inherited from a shared head, a title
 * that fell back to the site name, a schema block that lost its Article node,
 * an article that dropped out of the sitemap.
 *
 * None of those break the build and none of them are visible on the page. They
 * are only visible here, or in Search Console six weeks later.
 *
 * So this reads what the bake actually WROTE and holds it to the contract:
 *
 *   - every /matchup-of-the-day/<slug>/ page is indexable,
 *   - self-canonical, absolute, https, trailing slash,
 *   - has a real, distinct <title> and meta description,
 *   - carries Article (or NewsArticle) + BreadcrumbList + SportsEvent JSON-LD,
 *     with datePublished and dateModified,
 *   - has Open Graph title, description, url and image,
 *   - is listed in sitemap.xml with a lastmod,
 *   - is reachable from the hub,
 *   - has a URL nobody else has.
 *
 * Offline. No network, no database: it reads the working tree.
 *
 *   node tests/matchup-seo-contract-test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'matchup-of-the-day');
const SITE = 'https://trustmyrecord.com';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m) => { failures += 1; console.error('  FAIL  ' + m); };

if (!fs.existsSync(DIR)) {
  console.error('  FAIL  no matchup-of-the-day/ directory to check');
  process.exit(1);
}

const hub = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');

/* `today` is the deliberate exception and is documented as one: a stable
   address that redirects to whichever article is current. It is canonical'd TO
   that article, is kept out of the sitemap on purpose, and would fail the
   self-canonical rule for exactly the right reason.

   The per-sport doors added 2026-09-03 are the same object with a narrower
   question. /matchup-of-the-day/ncaaf/ exists because /today/ is newest-wins
   across every sport, so a nav entry that says NCAAF has to land on the NCAAF
   piece even when baseball published later the same morning. They carry the
   same contract as `today`: canonical'd to the article, out of the sitemap, and
   never noindexed. The list is the sports the generator can write a door for,
   so a typo'd directory under matchup-of-the-day/ is still caught as an article
   that failed to build. */
const EXEMPT = new Set(['today', 'mlb', 'nba', 'nfl', 'nhl', 'soccer', 'ncaaf', 'ncaab']);

const slugs = fs.readdirSync(DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !EXEMPT.has(e.name))
  .map((e) => e.name)
  .filter((s) => fs.existsSync(path.join(DIR, s, 'index.html')))
  .sort();

if (!slugs.length) {
  console.log('  ok    no published Game Files on disk; nothing to check');
  process.exit(0);
}

const first = (html, re) => {
  const m = html.match(re);
  return m ? m[1].trim() : null;
};

function ldTypes(html) {
  const types = new Set();
  const blocks = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  const nodes = [];
  for (const block of blocks) {
    const body = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
    let data;
    try { data = JSON.parse(body); } catch (err) { continue; }
    (function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') {
        if (typeof node['@type'] === 'string') { types.add(node['@type']); nodes.push(node); }
        else if (Array.isArray(node['@type'])) {
          node['@type'].forEach((t) => types.add(t)); nodes.push(node);
        }
        Object.values(node).forEach(walk);
      }
    })(data);
  }
  return { types, nodes };
}

const titles = new Map();

console.log('matchup SEO contract: %d Game File(s)', slugs.length);

for (const slug of slugs) {
  const url = `${SITE}/matchup-of-the-day/${slug}/`;
  const html = fs.readFileSync(path.join(DIR, slug, 'index.html'), 'utf8');
  const say = (m) => `${slug}: ${m}`;

  // ---- indexable ----------------------------------------------------------
  const robots = first(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)/i);
  if (robots && /noindex|none/i.test(robots)) bad(say(`robots meta is "${robots}"`));

  // ---- canonical ----------------------------------------------------------
  const canonical = first(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i);
  if (canonical !== url) bad(say(`canonical is ${canonical}, expected ${url}`));

  // ---- title and description ---------------------------------------------
  const title = first(html, /<title>([\s\S]*?)<\/title>/i);
  if (!title || title.length < 15) bad(say(`title is missing or too short: ${title}`));
  if (title && /^(trustmyrecord|matchup of the day)\s*(\|.*)?$/i.test(title)) {
    bad(say(`title fell back to a site-level default: ${title}`));
  }
  if (title) {
    if (titles.has(title)) bad(say(`shares a <title> with ${titles.get(title)}`));
    else titles.set(title, slug);
  }
  const desc = first(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i);
  if (!desc) bad(say('no meta description'));

  // ---- Open Graph ---------------------------------------------------------
  for (const prop of ['og:title', 'og:description', 'og:url', 'og:image']) {
    const re = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)`, 'i');
    const v = first(html, re);
    if (!v) bad(say(`missing ${prop}`));
    if (prop === 'og:url' && v && v !== url) bad(say(`og:url is ${v}, expected ${url}`));
  }

  // ---- structured data ----------------------------------------------------
  const { types, nodes } = ldTypes(html);
  if (!types.has('Article') && !types.has('NewsArticle')) bad(say('no Article/NewsArticle JSON-LD'));
  if (!types.has('BreadcrumbList')) bad(say('no BreadcrumbList JSON-LD'));
  if (!types.has('SportsEvent')) bad(say('no SportsEvent JSON-LD'));

  const article = nodes.find((n) => n['@type'] === 'Article' || n['@type'] === 'NewsArticle');
  if (article) {
    if (!article.datePublished) bad(say('Article has no datePublished'));
    if (!article.dateModified) bad(say('Article has no dateModified'));
    if (!article.headline) bad(say('Article has no headline'));
  }
  const event = nodes.find((n) => n['@type'] === 'SportsEvent');
  if (event) {
    if (!event.startDate) bad(say('SportsEvent has no startDate'));
    if (!event.homeTeam || !event.awayTeam) bad(say('SportsEvent is missing a club'));
    if (event.url && event.url !== url) bad(say(`SportsEvent url is ${event.url}`));
  }

  // ---- discovery ----------------------------------------------------------
  if (!sitemap.includes(`<loc>${url}</loc>`)) bad(say('not in sitemap.xml'));
  else {
    const entry = sitemap.match(
      new RegExp(`<loc>${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>\\s*<lastmod>([^<]+)</lastmod>`));
    if (!entry) bad(say('sitemap entry has no lastmod'));
  }
  if (!hub.includes(`/matchup-of-the-day/${slug}/`)) bad(say('not linked from the hub'));
}

if (!failures) {
  ok(`${slugs.length} article(s): indexable, self-canonical, unique titles, Article + BreadcrumbList + SportsEvent, in the sitemap, linked from the hub`);
}

console.log('');
if (failures) {
  console.error(`matchup SEO contract: ${failures} failure(s)`);
  process.exit(1);
}
console.log('matchup SEO contract: every published Game File meets it');
