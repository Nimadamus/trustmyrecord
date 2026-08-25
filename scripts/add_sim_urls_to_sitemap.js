#!/usr/bin/env node
'use strict';

/**
 * add_sim_urls_to_sitemap.js -- adds the NBA and NHL simulator URLs to
 * sitemap.xml, but ONLY after checking that every one of them is live and
 * returns 200.
 *
 * This exists because of the May 2026 incident recorded in
 * SEO_INDEXING_PROTOCOL.md: three page directories were added to the sitemap
 * while still untracked, so they 404'd live while sitting in the sitemap, and
 * Search Console filled with "Not found (404)" and "Discovered, not indexed".
 * The rule that came out of it is that a URL goes in the sitemap only after the
 * page is committed, deployed, and returns 200. This script enforces that rule
 * instead of trusting anyone to remember it.
 *
 *   node scripts/add_sim_urls_to_sitemap.js --check   verify only, write nothing
 *   node scripts/add_sim_urls_to_sitemap.js           verify, then write
 *   node scripts/add_sim_urls_to_sitemap.js --offline skip the live check
 *                                                     (only for a local dry run)
 *
 * Run it AFTER the pages are pushed and live, never before.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const URL_LIST = path.join(ROOT, 'scripts', 'sim-matchup-urls.txt');
const CHECK = process.argv.includes('--check');
const OFFLINE = process.argv.includes('--offline');

const HUBS = [
  'https://trustmyrecord.com/nba-simulator/',
  'https://trustmyrecord.com/nhl-simulator/',
];

const today = new Date().toISOString().slice(0, 10);

async function status(url) {
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(20000) });
    return r.status;
  } catch (e) {
    return 0;
  }
}

(async function main() {
  if (!fs.existsSync(URL_LIST)) {
    process.stderr.write('Run scripts/build_sim_matchup_pages.js first.\n');
    process.exit(1);
  }
  const matchups = fs.readFileSync(URL_LIST, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const urls = HUBS.concat(matchups);

  if (!OFFLINE) {
    process.stdout.write('Checking ' + urls.length + ' URLs are live and 200...\n');
    const bad = [];
    for (let i = 0; i < urls.length; i += 1) {
      const code = await status(urls[i]);
      if (code !== 200) bad.push(urls[i] + '  -> ' + (code || 'no response'));
      if ((i + 1) % 10 === 0) process.stdout.write('  ' + (i + 1) + '/' + urls.length + '\n');
    }
    if (bad.length) {
      process.stderr.write('\nREFUSING TO WRITE. These are not live 200:\n  ' + bad.join('\n  ') + '\n');
      process.stderr.write('Deploy the pages first, then run this again.\n');
      process.exit(2);
    }
    process.stdout.write('All ' + urls.length + ' URLs returned 200.\n');
  } else {
    process.stdout.write('--offline: skipping the live check. Do NOT commit a sitemap written this way.\n');
  }

  const xml = fs.readFileSync(SITEMAP, 'utf8');
  const already = new Set();
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) already.add(m[1]);

  const toAdd = urls.filter((u) => !already.has(u));
  if (!toAdd.length) {
    process.stdout.write('Nothing to add; all ' + urls.length + ' URLs are already in the sitemap.\n');
    return;
  }

  const block = toAdd.map((u) => '  <url><loc>' + u + '</loc><lastmod>' + today + '</lastmod></url>').join('\n');
  const next = xml.replace('</urlset>', block + '\n</urlset>');
  if (next === xml) {
    process.stderr.write('Could not find </urlset> in sitemap.xml.\n');
    process.exit(3);
  }

  process.stdout.write((CHECK ? '[check] would add ' : 'adding ') + toAdd.length + ' URLs\n');
  toAdd.forEach((u) => process.stdout.write('  ' + u + '\n'));
  if (!CHECK) {
    fs.writeFileSync(SITEMAP, next);
    process.stdout.write('sitemap.xml updated.\n');
  }
}());
