#!/usr/bin/env node
/**
 * NFL_ONE_PROJECTION_20261105. Bake gate: the season page and the playoff page must print the
 * same projection. Each page carries the fingerprint of the result it was built from
 * (<!-- NFL_PROJ:... -->: inputs snapshot, runs, seed, sigma, every club's numbers). This also
 * reads the printed tables, so a page that stamps one thing and prints another still fails.
 * Exit 1 publishes nothing.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const fingerprintOf = (html) => { const m = /<!-- NFL_PROJ:([^>]*?) -->/.exec(html); return m ? m[1] : null; };
const norm = (v) => { const t = String(v).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(); return t === '0%' ? '<1%' : t; };

/** Season page: { team: { wins, division, playoffs, top } } */
function seasonTable(html) {
  const out = {};
  const re = /<span class="ln">([^<]+)<\/span>.*?<\/th><td class="num">([\d.]+)<\/td><td class="rng">[^<]*<\/td><td class="p"[^>]*>(.*?)<\/td><td class="p"[^>]*>(.*?)<\/td><td class="p"[^>]*>(.*?)<\/td>/g;
  let m; while ((m = re.exec(html))) out[m[1]] = { wins: m[2], division: norm(m[3]), playoffs: norm(m[4]), top: norm(m[5]) };
  return out;
}

/** Playoff page odds table (the section with id="odds"). */
function playoffTable(html) {
  const a = html.indexOf('id="odds"'); const sec = html.slice(a, html.indexOf('</section>', a));
  const out = {};
  const re = /<span class="ln">([^<]+)<\/span>.*?<\/td><td class="num">[^<]*<\/td><td class="num">([\d.]+)<\/td><td class="num">(.*?)<\/td><td class="num">(.*?)<\/td><td class="num">(.*?)<\/td>/g;
  let m; while ((m = re.exec(sec))) out[m[1]] = { wins: m[2], division: norm(m[3]), top: norm(m[4]), playoffs: norm(m[5]) };
  return out;
}

/** Returns a list of problems; empty means the pages agree. */
function compare(seasonHtml, playoffHtml) {
  const problems = [];
  const a = fingerprintOf(seasonHtml), b = fingerprintOf(playoffHtml);
  if (!a || !b) problems.push('a page has no NFL_PROJ fingerprint');
  else if (a !== b) problems.push('fingerprints differ: ' + a.slice(0, 70) + ' / ' + b.slice(0, 70));
  const S = seasonTable(seasonHtml), P = playoffTable(playoffHtml);
  const names = Object.keys(S);
  if (names.length !== 32 || Object.keys(P).length !== 32) problems.push(`tables hold ${names.length} and ${Object.keys(P).length} clubs, expected 32`);
  names.forEach((n) => {
    if (!P[n]) return;
    ['wins', 'division', 'playoffs', 'top'].forEach((k) => {
      if (S[n][k] !== P[n][k]) problems.push(`${n} ${k}: season page ${S[n][k]}, playoff page ${P[n][k]}`);
    });
  });
  return problems;
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const problems = compare(read('nfl-season-simulator/index.html'), read('nfl-playoff-simulator/index.html'));
  if (problems.length) { console.error('NFL pages disagree:\n  ' + problems.slice(0, 12).join('\n  ')); process.exit(1); }
  console.log('NFL_PAGES_AGREE PASSED (32 clubs)');
}
module.exports = { compare, fingerprintOf, seasonTable, playoffTable };
