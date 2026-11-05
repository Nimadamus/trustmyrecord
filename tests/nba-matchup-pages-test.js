'use strict';
/* NBA_MATCHUP_BAKE_20261105: the bake gate for the 30 NBA matchup pages. A page baked from the
   live cards carries <!--NBA_MATCHUP_BAKE-->: its printed odds add up, it names the data time,
   no odds sit in any description, and old claims are gone. A page the bake has not reached yet
   (the API route not live) is left alone so this gate cannot stop an unrelated bake. Every
   page always keeps its URL, title and canonical. Fails on the August pages once marked. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const dir = path.join(ROOT, 'nba-simulator');
const urls = fs.readFileSync(path.join(ROOT, 'scripts', 'sim-matchup-urls.txt'), 'utf8')
  .split(/\r?\n/).filter((u) => /\/nba-simulator\/[a-z0-9-]+-vs-[a-z0-9-]+\/$/.test(u));
assert.strictEqual(urls.length, 30, '30 NBA matchup URLs');
let baked = 0;
for (const url of urls) {
  const slug = url.split('/').slice(-2)[0];
  const html = fs.readFileSync(path.join(dir, slug, 'index.html'), 'utf8');
  assert.ok(html.includes(`<link rel="canonical" href="${url}" />`), slug + ': canonical');
  const [a, h] = slug.split('-vs-');
  assert.ok(/<title>[^<]* vs [^<]* Simulation: Score Prediction &amp; Box Score \| TrustMyRecord<\/title>/.test(html), slug + ': title ' + a + h);
  if (!html.includes('<!--NBA_MATCHUP_BAKE-->')) continue;
  baked += 1;
  for (const re of [/<meta name="description" content="([^"]*)"/, /<meta property="og:description" content="([^"]*)"/, /<meta name="twitter:description" content="([^"]*)"/]) {
    const m = html.match(re);
    assert.ok(m && !/\d%|\d+\.\d/.test(m[1]), slug + ': a description freezes a number: ' + (m && m[1]));
  }
  const ld = html.match(/"@type":"WebPage".*?"description":"([^"]*)"/);
  assert.ok(ld && !/\d%/.test(ld[1]), slug + ': JSON-LD description freezes odds');
  const wp = [...html.matchAll(/<div class="wp">([\d.]+)% win probability<\/div>/g)].map((m) => Number(m[1]));
  assert.strictEqual(wp.length, 2, slug + ': two win probabilities');
  assert.ok(Math.abs(wp[0] + wp[1] - 100) < 0.11, slug + ': odds add to 100, got ' + wp);
  assert.ok(/Model projection, updated [A-Z][a-z]{2} \d{1,2}, /.test(html), slug + ': names when the data is from');
  assert.ok(!/pinned run|not a forecast of a scheduled game|who is available tonight/.test(html), slug + ': old claim');
  assert.ok(html.includes('<!--MK:leagueSimMatchup-->'), slug + ': season block kept');
  assert.ok(html.includes('tmr-ds-nav'), slug + ': shell kept');
}
console.log('NBA_MATCHUP_PAGES PASSED (' + baked + ' of 30 baked from live cards)');
