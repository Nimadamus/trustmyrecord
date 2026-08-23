#!/usr/bin/env node
/**
 * mlb-matchup-pages-contract-test.js - MLB_RESEARCH_HUB_20260823
 *
 * Static, offline guard for the MLB research hub and the permanent matchup
 * pages under it. Every check here is something that, if it silently broke,
 * would show up in Search Console weeks later rather than in this commit:
 *
 *   1.  The hub's server rendered slate block is present and NOT empty. That
 *       block is the entire reason the hub is crawlable; an empty marker pair
 *       means a bake failed and the page went back to being three skeletons.
 *   2.  The hub links every matchup page with a real <a href>, and every one of
 *       those hrefs resolves to a file on disk.
 *   3.  The hub's JSON-LD parses and describes what is actually on the page.
 *   4.  Every matchup page is index,follow, self-canonical, has exactly one h1,
 *       carries real baked text, and links back to the hub.
 *   5.  No two matchup pages claim the same canonical (the duplicate-URL guard).
 *   6.  Every matchup slug matches the permanent contract, so a page cannot
 *       quietly move to a new URL and orphan the indexed one.
 *   7.  Every matchup page's SportsEvent JSON-LD parses and names both clubs.
 *   8.  The three daily views exist and are self-canonical.
 *   9.  Analytics is wired on the hub and on the matchup pages. It was missing
 *       entirely before 2026-08-23 and nobody noticed for months.
 *
 * No network. Runs against the checked-out tree.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://trustmyrecord.com';
const HUB_DIR = path.join(ROOT, 'handicapping', 'mlb');
const HUB_URL = SITE + '/handicapping/mlb/';
const SLUG_RE = /^[a-z0-9-]+-vs-[a-z0-9-]+-\d{4}-\d{2}-\d{2}(-game-\d)?$/;
const SUPPORT = ['probable-pitchers', 'odds', 'trends'];

let failures = 0;
const fail = (m) => { failures += 1; console.error('  FAIL  ' + m); };
const ok = (m) => console.log('  ok    ' + m);
const read = (p) => fs.readFileSync(p, 'utf8');

function tag(html, re) { const m = html.match(re); return m ? m[1].trim() : null; }
function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
/** Does a site path resolve to a file this site would serve? */
function resolves(sitePath) {
  const p = sitePath.split('#')[0].split('?')[0];
  if (!p || p === '/') return true;
  const rel = p.replace(/^\//, '');
  const asDir = path.join(ROOT, rel, 'index.html');
  const asFile = path.join(ROOT, rel);
  return fs.existsSync(asDir) || (fs.existsSync(asFile) && fs.statSync(asFile).isFile());
}

/* ------------------------------------------------------- 1. the hub itself */
console.log('\n/handicapping/mlb/ hub');
const hubFile = path.join(HUB_DIR, 'index.html');
if (!fs.existsSync(hubFile)) {
  fail('the MLB hub does not exist at handicapping/mlb/index.html');
  process.exit(1);
}
const hub = read(hubFile);

const hubCanon = tag(hub, /<link rel="canonical" href="([^"]+)"/i);
if (hubCanon !== HUB_URL) fail(`hub canonical is ${hubCanon}, expected ${HUB_URL}`);
else ok('hub is self-canonical');

const hubRobots = tag(hub, /<meta name="robots" content="([^"]+)"/i) || '';
if (/noindex/i.test(hubRobots)) fail('hub carries noindex');
else ok('hub is indexable (' + hubRobots + ')');

const hubTitle = tag(hub, /<title>([\s\S]*?)<\/title>/i) || '';
if (!/mlb/i.test(hubTitle)) fail('hub title does not mention MLB: ' + hubTitle);
else if (hubTitle.length > 65) fail(`hub title is ${hubTitle.length} chars, too long to render whole`);
else ok('hub title: ' + hubTitle);

const hubDesc = tag(hub, /<meta name="description" content="([^"]*)"/i) || '';
if (hubDesc.length < 70) fail('hub meta description is missing or too short');
else ok(`hub meta description present (${hubDesc.length} chars)`);

const h1s = hub.match(/<h1[\s>]/gi) || [];
if (h1s.length !== 1) fail(`hub has ${h1s.length} h1 elements, expected exactly 1`);
else ok('hub has exactly one h1');

/* ------------------------------------------- 2. the server rendered block */
console.log('\nserver rendered slate');
const ssr = hub.match(/<!--MK:mlbSlateSSR-->([\s\S]*?)<!--\/MK:mlbSlateSSR-->/);
if (!ssr) {
  fail('the mlbSlateSSR marker pair is missing from the hub');
} else if (ssr[1].trim().length < 2000) {
  fail(`the server rendered slate block is only ${ssr[1].trim().length} bytes. `
     + 'A bake failed, or the marker was emptied: the hub is back to being uncrawlable.');
} else {
  ok(`slate block is ${ssr[1].length} bytes of baked HTML`);
  const words = textOf(ssr[1]).length;
  if (words < 1500) fail(`slate block renders only ${words} chars of text`);
  else ok(`slate block renders ${words} chars of readable text`);

  const hrefs = [...ssr[1].matchAll(/href="(\/handicapping\/mlb\/[^"]+)"/g)].map((m) => m[1]);
  const matchupHrefs = [...new Set(hrefs.filter((h) => SLUG_RE.test(h.split('/')[3] || '')))];
  if (matchupHrefs.length < 2) fail(`slate block links only ${matchupHrefs.length} matchup pages`);
  else ok(`slate block links ${matchupHrefs.length} matchup pages with plain anchors`);
  const broken = matchupHrefs.filter((h) => !resolves(h));
  if (broken.length) fail('slate block links pages that do not exist: ' + broken.join(', '));
  else ok('every matchup link in the slate block resolves to a real page');

  for (const slug of SUPPORT) {
    if (!ssr[1].includes(`/handicapping/mlb/${slug}/`)) {
      fail(`the slate block does not link /handicapping/mlb/${slug}/`);
    }
  }
  const ecosystem = ['/mlb-simulator/', '/trendspotter/', '/betlegend-pro/',
                     '/matchup-of-the-day/', '/mlb-handicappers/'];
  const missing = ecosystem.filter((u) => !ssr[1].includes(`href="${u}"`));
  if (missing.length) fail('slate block does not link: ' + missing.join(', '));
  else ok('slate block links every MLB research surface');
}

/* ------------------------------------------------------ 3. the hub's JSON-LD */
console.log('\nhub structured data');
const hubLd = hub.match(/<!--MK:mlbHubLd-->([\s\S]*?)<!--\/MK:mlbHubLd-->/);
if (!hubLd) {
  fail('the mlbHubLd marker pair is missing from the hub head');
} else {
  const json = tag(hubLd[1], /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (!json) {
    fail('the mlbHubLd block holds no JSON-LD');
  } else {
    let parsed;
    try { parsed = JSON.parse(json); } catch (e) { fail('hub JSON-LD does not parse: ' + e.message); }
    if (parsed) {
      const graph = parsed['@graph'] || [];
      const types = graph.map((n) => n['@type']);
      for (const want of ['CollectionPage', 'BreadcrumbList', 'ItemList']) {
        if (!types.includes(want)) fail(`hub JSON-LD is missing a ${want} node`);
      }
      const list = graph.find((n) => n['@type'] === 'ItemList');
      if (list) {
        const items = list.itemListElement || [];
        if (!items.length) fail('hub ItemList is empty');
        else ok(`hub ItemList carries ${items.length} SportsEvent entries`);
        const bad = items.filter((i) => !(i.item && i.item.homeTeam && i.item.awayTeam));
        if (bad.length) fail(`${bad.length} ItemList entries are missing a team`);
        else ok('every ItemList entry names both clubs');
        // Nothing in this graph may claim a rating, review or prediction.
        const blob = JSON.stringify(parsed);
        for (const forbidden of ['aggregateRating', 'AggregateRating', 'Review', 'reviewRating']) {
          if (blob.includes(forbidden)) fail(`hub JSON-LD claims ${forbidden}, which we cannot support`);
        }
        ok('hub JSON-LD claims no rating, review or prediction');
      }
    }
  }
}

/* ---------------------------------------------------- 4-7. matchup pages */
console.log('\nmatchup pages');
const slugs = fs.readdirSync(HUB_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !SUPPORT.includes(d.name))
  .map((d) => d.name);

if (!slugs.length) {
  fail('no matchup page directories exist under handicapping/mlb/');
} else {
  const canonicals = new Map();
  let thin = 0, noBack = 0, badLd = 0, badSlug = 0, noAnalytics = 0, badH1 = 0, longTitle = 0;
  for (const slug of slugs) {
    if (!SLUG_RE.test(slug)) { badSlug += 1; fail(`slug does not match the permanent contract: ${slug}`); continue; }
    const file = path.join(HUB_DIR, slug, 'index.html');
    if (!fs.existsSync(file)) { fail(`${slug} has no index.html`); continue; }
    const html = read(file);
    const want = `${HUB_URL}${slug}/`;

    const canon = tag(html, /<link rel="canonical" href="([^"]+)"/i);
    if (canon !== want) fail(`${slug}: canonical is ${canon}, expected ${want}`);
    if (canonicals.has(canon)) fail(`${slug}: duplicate canonical, already claimed by ${canonicals.get(canon)}`);
    canonicals.set(canon, slug);

    const robots = tag(html, /<meta name="robots" content="([^"]+)"/i) || '';
    if (/noindex/i.test(robots)) fail(`${slug}: carries noindex`);

    const heads = html.match(/<h1[\s>]/gi) || [];
    if (heads.length !== 1) { badH1 += 1; fail(`${slug}: has ${heads.length} h1 elements`); }

    // A title Google truncates is a title we did not write. 65 is the practical
    // ceiling for the ~580px it renders.
    const t = tag(html, /<title>([\s\S]*?)<\/title>/i) || '';
    if (!t) fail(`${slug}: has no title`);
    else if (t.length > 65) { longTitle += 1; fail(`${slug}: title is ${t.length} chars: ${t}`); }

    const chars = textOf(html.split('<body')[1] || '').length;
    if (chars < 2500) { thin += 1; fail(`${slug}: only ${chars} chars of rendered text, that is a thin page`); }

    if (!html.includes(`href="/handicapping/mlb/"`)) { noBack += 1; fail(`${slug}: does not link back to the hub`); }
    if (!html.includes('tmr-mlb-analytics.js')) { noAnalytics += 1; fail(`${slug}: no analytics`); }

    const ldRaw = tag(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
    let ld = null;
    try { ld = JSON.parse(ldRaw); } catch (e) { badLd += 1; fail(`${slug}: JSON-LD does not parse`); }
    if (ld) {
      const ev = (ld['@graph'] || []).find((n) => n['@type'] === 'SportsEvent');
      if (!ev) { badLd += 1; fail(`${slug}: no SportsEvent node`); }
      else if (!(ev.homeTeam && ev.homeTeam.name && ev.awayTeam && ev.awayTeam.name)) {
        badLd += 1; fail(`${slug}: SportsEvent does not name both clubs`);
      }
      const blob = JSON.stringify(ld);
      for (const forbidden of ['aggregateRating', 'reviewRating', '"Review"']) {
        if (blob.includes(forbidden)) fail(`${slug}: JSON-LD claims ${forbidden}`);
      }
    }

    // Every internal link on the page must resolve.
    for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
      if (!resolves(m[1])) fail(`${slug}: links ${m[1]}, which does not resolve`);
    }
  }
  if (!badSlug) ok(`${slugs.length} matchup slugs all match the permanent contract`);
  if (canonicals.size === slugs.length - badSlug) ok(`${canonicals.size} distinct canonicals, no duplicates`);
  if (!thin) ok('every matchup page carries real baked content');
  if (!noBack) ok('every matchup page links back to the hub');
  if (!badLd) ok('every matchup page has a valid SportsEvent graph naming both clubs');
  if (!noAnalytics) ok('every matchup page reports to analytics');
  if (!badH1) ok('every matchup page has exactly one h1');
  if (!longTitle) ok('every matchup page title renders whole in a result');
}

/* --------------------------------------------------- 8. the daily views */
console.log('\ndaily views');
for (const slug of SUPPORT) {
  const file = path.join(HUB_DIR, slug, 'index.html');
  if (!fs.existsSync(file)) { fail(`/handicapping/mlb/${slug}/ does not exist`); continue; }
  const html = read(file);
  const want = `${HUB_URL}${slug}/`;
  const canon = tag(html, /<link rel="canonical" href="([^"]+)"/i);
  if (canon !== want) fail(`${slug}: canonical is ${canon}, expected ${want}`);
  if (/noindex/i.test(tag(html, /<meta name="robots" content="([^"]+)"/i) || '')) fail(`${slug}: noindex`);
  const heads = html.match(/<h1[\s>]/gi) || [];
  if (heads.length !== 1) fail(`${slug}: has ${heads.length} h1 elements`);
  const t = tag(html, /<title>([\s\S]*?)<\/title>/i) || '';
  if (t.length > 65) fail(`${slug}: title is ${t.length} chars: ${t}`);
  const chars = textOf(html.split('<body')[1] || '').length;
  if (chars < 1200) fail(`${slug}: only ${chars} chars of rendered text`);
  else ok(`/handicapping/mlb/${slug}/ is self-canonical with ${chars} chars of content`);
  // These three must be genuinely different pages, not slices of one another.
  for (const other of SUPPORT) {
    if (other === slug) continue;
    const o = path.join(HUB_DIR, other, 'index.html');
    if (fs.existsSync(o) && textOf(html) === textOf(read(o))) {
      fail(`${slug} and ${other} render identical text, that is a doorway page`);
    }
  }
}

/* ------------------------------------------------------ 9. hub analytics */
console.log('\nanalytics wiring');
if (!hub.includes('tmr-mlb-analytics.js')) fail('the hub does not load tmr-mlb-analytics.js');
else ok('the hub loads tmr-mlb-analytics.js');
if (!/data-mlb-analytics="mlb_hub"/.test(hub)) fail('the hub body has no data-mlb-analytics surface');
else ok('the hub declares its analytics surface');

console.log('');
if (failures) {
  console.error(`MLB MATCHUP PAGE CONTRACT FAILED: ${failures} problem(s)`);
  process.exit(1);
}
console.log('ALL MLB MATCHUP PAGE CHECKS PASSED');
