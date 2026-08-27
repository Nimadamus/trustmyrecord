#!/usr/bin/env node
'use strict';

/**
 * Simulation Archive - page builder.
 *
 * TWO MODES, ONE TEMPLATE.
 *
 *   node scripts/build-sim-archive-pages.cjs
 *       Writes the four fixed archive pages for every sport:
 *         /<sport>-simulator/results/            the hub
 *         /<sport>-simulator/results/matchup/    one matchup, by ?slug= or ?matchup=
 *         /<sport>-simulator/results/team/       one club, by ?slug= or ?team=
 *         /<sport>-simulator/results/run/        one archived simulation, by ?id=
 *
 *   node scripts/build-sim-archive-pages.cjs --seo [--api <base>] [--min-matchup N]
 *       Asks the archive which matchups and clubs have enough simulations behind
 *       them to deserve their own indexable URL, and writes a static page for
 *       each at /<sport>-simulator/results/<slug>/ and
 *       /<sport>-simulator/results/teams/<slug>/.
 *
 * THE SEO RULES THIS ENCODES
 *
 *   1. NO NOINDEX. TrustMyRecord's standing directive is that public pages are
 *      indexable; parameter explosion is controlled with CANONICALS instead. The
 *      four fixed pages above each declare a self-canonical WITHOUT the query
 *      string, so every ?slug=/?id= variant folds into one indexable URL rather
 *      than becoming thousands of near-duplicates.
 *
 *   2. NO THIN PAGES. A static matchup page is only written when that matchup
 *      has passed the archive's threshold, which is enforced server-side in
 *      services/simArchive/query.js. An individual simulation id never gets its
 *      own static URL: there is nothing on it that a search visitor wants, and a
 *      million of them is a crawl budget disaster.
 *
 *   3. NOTHING GOES IN THE SITEMAP FROM HERE. Per SEO_INDEXING_PROTOCOL.md a URL
 *      only enters sitemap.xml after it is committed, deployed and verified 200
 *      live. This script prints what it wrote; adding those URLs is a separate,
 *      verified step.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://trustmyrecord.com';
const DEFAULT_API = 'https://trustmyrecord-api.onrender.com/api';

const CSS_DS = '/static/css/tmr-ds.f85a4f83fb7b.css';
const JS_SESSION = '/static/js/tmr-session.63f50f4d0988.js';
const JS_NAV = '/static/js/tmr-ds-nav.6a5aef783912.js';
const CSS_ARCHIVE = '/static/css/tmr-sim-archive.css';
const JS_ARCHIVE = '/static/js/tmr-sim-archive.js';
const JS_CONFIG = '/static/js/config.js';
const JS_API = '/static/js/backend-api.js';
const JS_ANALYTICS = '/static/js/tmr-analytics.js';

// Cache-buster for the two files this feature owns. Bump when either changes.
const ASSET_V = '20260827a';

const SPORTS = [
  { sport: 'mlb', league: 'MLB', name: 'MLB', noun: 'runs', long: 'baseball' },
  { sport: 'nfl', league: 'NFL', name: 'NFL', noun: 'points', long: 'football' },
  { sport: 'nba', league: 'NBA', name: 'NBA', noun: 'points', long: 'basketball' },
  { sport: 'nhl', league: 'NHL', name: 'NHL', noun: 'goals', long: 'hockey' },
];

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * The one page shell. Matches the arrangement the NBA and NFL simulators
 * already use: the shared design-system nav and footer are injected by
 * tmr-ds-nav.js at the end of the body, with the header's height reserved up
 * front so the injection does not shift the page after first paint.
 */
function page(opts) {
  const crumbs = (opts.crumbs || []).map((c, i, arr) => (
    i === arr.length - 1
      ? `<span aria-current="page">${esc(c.label)}</span>`
      : `<a href="${esc(c.href)}">${esc(c.label)}</a><span class="sep" aria-hidden="true">&rsaquo;</span>`
  )).join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${esc(opts.canonical)}">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${esc(opts.canonical)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<link rel="icon" type="image/png" href="/static/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Barlow+Condensed:wght@700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${CSS_DS}">
<link rel="stylesheet" href="${CSS_ARCHIVE}?v=${ASSET_V}">
<script src="${JS_CONFIG}"></script>
<script src="${JS_API}"></script>
<script src="${JS_ANALYTICS}"></script>
<script defer src="${JS_ARCHIVE}?v=${ASSET_V}"></script>
${opts.jsonld ? `<script type="application/ld+json">${opts.jsonld}</script>` : ''}
</head>
<body class="tmr-ds-shell tmr-ds--dark">
<!-- CLS: the shared header is injected by tmr-ds-nav.js at the end of the body.
     Reserving its height up front and dropping the reservation in the same frame
     the real header lands means nothing visibly moves. Same arrangement as the
     NBA and NFL simulator pages; tmr-ds-nav.js is not modified. -->
<div id="dsNavReserve" aria-hidden="true" style="height:70px"></div>
<script>
(function () {
  var r = document.getElementById('dsNavReserve');
  if (!r) return;
  var drop = function () { if (r && r.parentNode) r.parentNode.removeChild(r); };
  var obs = new MutationObserver(function () {
    if (document.querySelector('.ds-nav')) { obs.disconnect(); requestAnimationFrame(drop); }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(function () { obs.disconnect(); drop(); }, 4000);
})();
</script>

<main class="sa-root">
  <div class="sa-shell">
    <nav class="sa-crumbs" aria-label="Breadcrumb">
        ${crumbs}
    </nav>
${opts.body}
  </div>
</main>

<script src="${JS_SESSION}"></script><script src="${JS_NAV}"></script>
</body>
</html>
`;
}

function breadcrumbJsonLd(items) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem', position: i + 1, name: c.label, item: SITE + c.href,
    })),
  });
}

function write(relDir, html) {
  const dir = path.join(ROOT, relDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  return relDir + '/index.html';
}

/* ================================================================== */
/* The four fixed pages                                                */
/* ================================================================== */

function hubPage(s) {
  const base = `/${s.sport}-simulator/results/`;
  const crumbs = [
    { label: 'TrustMyRecord', href: '/' },
    { label: `${s.name} Simulator`, href: `/${s.sport}-simulator/` },
    { label: 'Simulation Results', href: base },
  ];
  const body = `
    <header class="sa-head">
      <div class="sa-head-row">
        <div>
          <div class="sa-kick">${s.name} Simulation Archive</div>
          <h1>${s.name} Simulation Results</h1>
          <p class="sa-sub">Every completed ${s.name} simulation, kept permanently: the final score, the
             complete box score, and the aggregate picture that builds up as the same matchups are
             simulated again and again. Numbers here are averages of simulator output &mdash; not
             predictions, not forecasts, and not betting advice.
             <a href="/${s.sport}-simulator/">Run a ${s.name} simulation</a>.</p>
        </div>
        <a class="sa-cta" href="/${s.sport}-simulator/">Open the ${s.name} Simulator</a>
      </div>
    </header>

    <div data-sa="overview" data-sport="${s.sport}"></div>

    <div class="sa-grid">
      <div class="sa-stack">
        <div data-sa="recent" data-sport="${s.sport}" data-limit="12"></div>
      </div>
      <div class="sa-stack">
        <div data-sa="leaders" data-sport="${s.sport}" data-limit="10"></div>
        <div data-sa="teams" data-sport="${s.sport}"></div>
      </div>
    </div>

    <p class="sa-foot">
      Simulation activity is public; who ran a simulation is not. TrustMyRecord records whether a
      visitor was signed in and nothing that identifies them. Results produced by materially
      different versions of a simulation engine, or under custom settings, are counted separately
      and are never blended into one average.
    </p>
`;
  return {
    dir: `${s.sport}-simulator/results`,
    html: page({
      title: `${s.name} Simulation Results & Archive | TrustMyRecord`,
      description: `Every completed ${s.name} simulation on TrustMyRecord: simulated scores, full box `
        + `scores, most simulated matchups, and aggregate ${s.noun} and win rates for each matchup and club.`,
      canonical: SITE + base,
      crumbs,
      jsonld: breadcrumbJsonLd(crumbs),
      body,
    }),
  };
}

function matchupPage(s) {
  const base = `/${s.sport}-simulator/results/matchup/`;
  const crumbs = [
    { label: 'TrustMyRecord', href: '/' },
    { label: `${s.name} Simulator`, href: `/${s.sport}-simulator/` },
    { label: 'Simulation Results', href: `/${s.sport}-simulator/results/` },
    { label: 'Matchup', href: base },
  ];
  return {
    dir: `${s.sport}-simulator/results/matchup`,
    html: page({
      title: `${s.name} Matchup Simulation History | TrustMyRecord`,
      description: `Aggregate simulation results for one ${s.name} matchup: win share, average score, `
        + `outcome distribution, and every archived simulation of the two clubs.`,
      // Self-canonical WITHOUT the query string: every ?slug= variant folds into
      // this one indexable URL instead of becoming thousands of near-duplicates.
      // The matchups worth indexing on their own get a real static page from the
      // --seo pass below.
      canonical: SITE + base,
      crumbs,
      jsonld: breadcrumbJsonLd(crumbs),
      body: `
    <div data-sa="matchup" data-sport="${s.sport}"></div>
`,
    }),
  };
}

function teamPage(s) {
  const base = `/${s.sport}-simulator/results/team/`;
  const crumbs = [
    { label: 'TrustMyRecord', href: '/' },
    { label: `${s.name} Simulator`, href: `/${s.sport}-simulator/` },
    { label: 'Simulation Results', href: `/${s.sport}-simulator/results/` },
    { label: 'Club', href: base },
  ];
  return {
    dir: `${s.sport}-simulator/results/team`,
    html: page({
      title: `${s.name} Club Simulation Results | TrustMyRecord`,
      description: `Cumulative simulation results for one ${s.name} club: simulated record, average `
        + `${s.noun} scored and allowed, venue split and every archived simulation it appears in.`,
      canonical: SITE + base,
      crumbs,
      jsonld: breadcrumbJsonLd(crumbs),
      body: `
    <div data-sa="team" data-sport="${s.sport}"></div>
`,
    }),
  };
}

function runPage(s) {
  const base = `/${s.sport}-simulator/results/run/`;
  const crumbs = [
    { label: 'TrustMyRecord', href: '/' },
    { label: `${s.name} Simulator`, href: `/${s.sport}-simulator/` },
    { label: 'Simulation Results', href: `/${s.sport}-simulator/results/` },
    { label: 'Simulation', href: base },
  ];
  return {
    dir: `${s.sport}-simulator/results/run`,
    html: page({
      title: `${s.name} Simulation Box Score | TrustMyRecord`,
      description: `One archived ${s.name} simulation reopened in full: final score, period breakdown, `
        + `team statistics, complete player box score and the settings it ran under.`,
      canonical: SITE + base,
      crumbs,
      jsonld: breadcrumbJsonLd(crumbs),
      body: `
    <div data-sa="run" data-sport="${s.sport}"></div>
`,
    }),
  };
}

/* ================================================================== */
/* The generated SEO pages                                             */
/* ================================================================== */

function seoMatchupPage(s, m) {
  const base = `/${s.sport}-simulator/results/${m.slug}/`;
  const crumbs = [
    { label: 'TrustMyRecord', href: '/' },
    { label: `${s.name} Simulator`, href: `/${s.sport}-simulator/` },
    { label: 'Simulation Results', href: `/${s.sport}-simulator/results/` },
    { label: m.title, href: base },
  ];
  return {
    dir: `${s.sport}-simulator/results/${m.slug}`,
    html: page({
      title: `${m.title} Simulation History | ${s.name} | TrustMyRecord`,
      description: `${m.simulations.toLocaleString('en-US')} simulations of ${m.title}: win share, `
        + `average score, ${s.noun} distribution and every archived box score.`,
      canonical: SITE + base,
      crumbs,
      jsonld: breadcrumbJsonLd(crumbs),
      body: `
    <div data-sa="matchup" data-sport="${s.sport}" data-slug="${esc(m.slug)}"></div>
`,
    }),
  };
}

function seoTeamPage(s, t) {
  const base = `/${s.sport}-simulator/results/teams/${t.slug}/`;
  const crumbs = [
    { label: 'TrustMyRecord', href: '/' },
    { label: `${s.name} Simulator`, href: `/${s.sport}-simulator/` },
    { label: 'Simulation Results', href: `/${s.sport}-simulator/results/` },
    { label: t.title, href: base },
  ];
  return {
    dir: `${s.sport}-simulator/results/teams/${t.slug}`,
    html: page({
      title: `${t.title} Simulation Results | ${s.name} | TrustMyRecord`,
      description: `${t.simulations.toLocaleString('en-US')} simulations featuring ${t.title}: simulated `
        + `record, average ${s.noun} scored and allowed, and results by opponent.`,
      canonical: SITE + base,
      crumbs,
      jsonld: breadcrumbJsonLd(crumbs),
      body: `
    <div data-sa="team" data-sport="${s.sport}" data-slug="${esc(t.slug)}"></div>
`,
    }),
  };
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

/* ================================================================== */

async function main() {
  const args = process.argv.slice(2);
  const seoMode = args.includes('--seo');
  const written = [];

  if (!seoMode) {
    for (const s of SPORTS) {
      for (const build of [hubPage, matchupPage, teamPage, runPage]) {
        const out = build(s);
        written.push(write(out.dir, out.html));
      }
    }
    console.log('Simulation archive pages written:\n  ' + written.join('\n  '));
    console.log('\n' + written.length + ' files. Indexable hub URLs (add to sitemap.xml only after '
      + 'they are committed, deployed and verified 200 live, per SEO_INDEXING_PROTOCOL.md):');
    SPORTS.forEach((s) => console.log('  ' + SITE + '/' + s.sport + '-simulator/results/'));
    return;
  }

  const apiIndex = args.indexOf('--api');
  const apiBase = apiIndex !== -1 ? args[apiIndex + 1] : DEFAULT_API;
  const minIndex = args.indexOf('--min-matchup');
  const minMatchup = minIndex !== -1 ? args[minIndex + 1] : null;

  let total = 0;
  for (const s of SPORTS) {
    let data;
    try {
      data = await getJson(apiBase + '/sim-archive/seo/pages?sport=' + s.sport
        + (minMatchup ? '&min_matchup=' + encodeURIComponent(minMatchup) : ''));
    } catch (e) {
      console.warn('  ' + s.sport + ': could not read the archive (' + e.message + '), skipped');
      continue;
    }
    const matchups = data.matchups || [];
    const teams = data.teams || [];
    matchups.forEach((m) => { written.push(write(seoMatchupPage(s, m).dir, seoMatchupPage(s, m).html)); });
    teams.forEach((t) => { written.push(write(seoTeamPage(s, t).dir, seoTeamPage(s, t).html)); });
    total += matchups.length + teams.length;
    console.log('  ' + s.sport + ': ' + matchups.length + ' matchup pages, ' + teams.length
      + ' club pages (thresholds: ' + JSON.stringify(data.thresholds) + ')');
  }

  if (!total) {
    console.log('\nNothing met the threshold yet. That is the correct outcome for a young archive: '
      + 'a page built on a handful of simulations is a thin page.');
    return;
  }
  console.log('\n' + total + ' pages written. Commit, deploy, verify each returns 200, THEN add to '
    + 'sitemap.xml - never before (SEO_INDEXING_PROTOCOL.md section 1).');
}

main().catch((e) => { console.error(e); process.exit(1); });
