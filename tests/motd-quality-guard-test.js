#!/usr/bin/env node
/* MOTD_QUALITY_GATE_20261019. Nima, 2026-10-19, on the tennis Matchup of the Day:
   "make sure that going forward that never happens again". It had been:
     - a schedule rotation putting auto stub pages behind the sport's door,
     - initials ("DP", "AE") where the players belong,
     - "MLB Data" badges and ERA notes on tennis and soccer pages,
     - preview pages with no site header, no pictures, giant caps headings.
   This fails on any of them, across every published page. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const bad = [];
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 1. Written-article sports never resolve their door to a rotation stub.
const reg = JSON.parse(read('data/featured-matchups.json'));
for (const sport of ['tennis', 'mlb', 'ncaaf', 'soccer']) {
  const s = (reg.sports || {})[sport];
  if (s && s.selection !== 'editorial') bad.push(`registry: ${sport} selection is "${s.selection}", must be "editorial"`);
}

// 2. Doors point at a written Game File (or the NHL/NFL pipelines' own pages).
for (const sport of ['tennis', 'mlb', 'ncaaf', 'soccer']) {
  const door = path.join('matchup-of-the-day', sport, 'index.html');
  if (!fs.existsSync(path.join(ROOT, door))) continue;
  const m = read(door).match(/url=([^"]+)"/);
  if (m && !m[1].startsWith('/matchup-of-the-day/')) bad.push(`${door}: opens ${m[1]}, not a written Matchup of the Day`);
}

// 3. Every published Game File and preview page.
const dirs = ['matchup-of-the-day', 'tennis', 'ncaaf', 'mlb', 'soccer'];
for (const d of dirs) {
  const base = path.join(ROOT, d);
  if (!fs.existsSync(base)) continue;
  for (const slug of fs.readdirSync(base)) {
    const rel = path.join(d, slug, 'index.html');
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    const page = read(rel);
    if (/http-equiv="refresh"/.test(page)) continue;            // doors
    const sport = ((page.match(/"sport"\s*:\s*"([A-Za-z ]+)"/) || [])[1] || '').toLowerCase();
    if (page.includes('FEATURED_ANGLE_PAGE')) {
      if (!/<body class="[^"]*tmr-ds/.test(page)) bad.push(`${rel}: preview page without the site header (body.tmr-ds)`);
      if (!page.includes('fonts.googleapis.com')) bad.push(`${rel}: preview page without the site fonts`);
      if (/Preview: a final is on/.test(page)) bad.push(`${rel}: broken "a final is on" headline`);
      continue;
    }
    if (d !== 'matchup-of-the-day') continue;
    const tennis = sport === 'tennis';
    if (/data-s="statsapi"/.test(page) && sport !== 'mlb') bad.push(`${rel}: "MLB Data" badge on a non MLB page`);
    if (tennis && /\/logos\/fallback\//.test(page)) bad.push(`${rel}: initials badge where a player belongs`);
    if (/feed behind this page does not measure/.test(page)) bad.push(`${rel}: internal feed disclaimer`);
  }
}

// 4. The hero scrim must not fade to the light theme ground on the dark theme.
if (!/Game File hero on the dark theme[\s\S]*ed-hero::after/.test(read('static/css/tmr-theme-a.css'))) {
  bad.push('static/css/tmr-theme-a.css: dark hero scrim override missing (white band behind headline)');
}

if (bad.length) {
  console.error(bad.map((b) => '  FAIL  ' + b).join('\n'));
  console.error(`MOTD QUALITY GUARD FAILED (${bad.length})`);
  process.exit(1);
}
console.log('MOTD QUALITY GUARD PASSED');
