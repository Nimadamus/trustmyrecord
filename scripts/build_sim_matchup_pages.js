#!/usr/bin/env node
'use strict';

/**
 * build_sim_matchup_pages.js -- generates the indexable NBA and NHL matchup
 * pages, and rewrites the "Popular matchups" grid on the two hub pages so the
 * generated set is always the set that is linked.
 *
 * WHY A CURATED LIST AND NOT EVERY PAIR
 * -------------------------------------
 * Thirty NBA teams make 435 ordered pairs and thirty-two NHL teams make 496. A
 * page per pair would be 931 near-identical pages, which is exactly the thin
 * doorway pattern that gets a whole section discounted. Instead this builds a
 * fixed, hand-picked list of matchups people actually search for: real
 * rivalries, recent Finals and Cup Finals, and the marquee pairings. Every page
 * carries a genuinely different projection, a different team comparison and
 * different players, because the numbers come out of the real model.
 *
 * The projection printed on a matchup page is a PINNED run (a fixed seed), so
 * the page is stable for a crawler and for anyone linking to it. The button on
 * the page opens the live simulator with both teams selected, where every press
 * is a fresh simulation.
 *
 * Re-run this whenever the season snapshots are rebuilt, or the printed season
 * numbers go stale:
 *
 *   node scripts/build_sim_matchup_pages.js
 *   node scripts/build_sim_matchup_pages.js --backend ../trustmyrecord-backend
 *   node scripts/build_sim_matchup_pages.js --check     (writes nothing, reports)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : fallback;
};
const CHECK = process.argv.includes('--check');
const BACKEND = path.resolve(ROOT, arg('--backend', '../trustmyrecord-backend'));

const SITE = 'https://trustmyrecord.com';
// One fixed seed for every generated page, so a rebuild with unchanged data
// produces an unchanged file and git stays quiet.
const PAGE_SEED = 20260824;
const PAGE_SIMS = 25000;

function requireBackend(rel) {
  const p = path.join(BACKEND, rel);
  if (!fs.existsSync(p + '.js')) {
    throw new Error('Backend module not found: ' + p + '.js\n'
      + 'This generator reads the live simulation model. Pass --backend <path> if the\n'
      + 'trustmyrecord-backend checkout is not beside this repo.');
  }
  return require(p);
}

const { simulateNbaGame } = requireBackend('services/nba/nbaSimEngine');
const { getModel: nbaModel } = requireBackend('services/nba/nbaRatings');
const { simulateNhlGame } = requireBackend('services/nhl/nhlSimEngine');
const { getModel: nhlModel } = requireBackend('services/nhl/nhlRatings');

/* ------------------------------------------------------------------------- */
/* The curated matchup lists.                                                 */
/* Away team first, which is how the URL and the title read.                  */
/* ------------------------------------------------------------------------- */

const NBA_MATCHUPS = [
  ['LAL', 'GS'], ['GS', 'LAL'],
  ['BOS', 'NY'], ['NY', 'BOS'],
  ['LAL', 'BOS'], ['BOS', 'LAL'],
  ['OKC', 'DEN'], ['DEN', 'OKC'],
  ['MIA', 'NY'], ['NY', 'MIA'],
  ['LAL', 'LAC'], ['GS', 'BOS'],
  ['PHI', 'BOS'], ['CHI', 'DET'],
  ['DAL', 'PHX'], ['MIL', 'BOS'],
  ['CLE', 'BOS'], ['MIN', 'DEN'],
  ['NY', 'PHI'], ['SA', 'HOU'],
  ['ORL', 'CLE'], ['MEM', 'GS'],
  ['ATL', 'MIA'], ['IND', 'NY'],
  ['POR', 'LAL'], ['SAC', 'GS'],
  ['UTAH', 'DEN'], ['TOR', 'BOS'],
  ['NO', 'DAL'], ['PHX', 'LAL'],
];

const NHL_MATCHUPS = [
  ['NYR', 'BOS'], ['BOS', 'NYR'],
  ['EDM', 'CGY'], ['CGY', 'EDM'],
  ['TOR', 'MTL'], ['MTL', 'TOR'],
  ['COL', 'VGK'], ['VGK', 'COL'],
  ['PIT', 'PHI'], ['PHI', 'PIT'],
  ['TBL', 'FLA'], ['FLA', 'TBL'],
  ['DET', 'CHI'], ['CHI', 'DET'],
  ['WSH', 'PIT'], ['NYR', 'NYI'],
  ['BOS', 'MTL'], ['TOR', 'BOS'],
  ['DAL', 'COL'], ['STL', 'CHI'],
  ['VAN', 'EDM'], ['SEA', 'VAN'],
  ['MIN', 'WPG'], ['NJD', 'NYR'],
  ['CAR', 'WSH'], ['NSH', 'STL'],
  ['LAK', 'ANA'], ['SJS', 'LAK'],
  ['OTT', 'TOR'], ['BUF', 'BOS'],
];

/* ------------------------------------------------------------------------- */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const n1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const n2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
const pctOf = (v) => (v * 100).toFixed(1) + '%';
const signed = (v, d) => { const n = Number(v); return (n > 0 ? '+' : '') + n.toFixed(d == null ? 1 : d); };

/**
 * A team crest, served in the HTML so it is there before any script runs. Width
 * and height are set so the image reserves its box and cannot shift the page in.
 */
function crestImg(team, size) {
  const px = size || 46;
  if (!team.logo) {
    return '<span class="crest-fallback" style="width:' + px + 'px;height:' + px + 'px'
      + (team.color ? ';background:' + esc(team.color) : '') + '">' + esc(team.abbr) + '</span>';
  }
  return '<img class="crest" src="' + esc(team.logo) + '" alt="" aria-hidden="true" width="'
    + px + '" height="' + px + '" loading="lazy">';
}

/** The thin two-colour bar under a scoreline, split by win probability. */
function colorBar(away, home, awayWp, homeWp) {
  const a = esc(away.color || '#38bdf8');
  const h = esc(home.color || '#22d3ee');
  return '<div class="mh-colorbar"><i style="background:' + a + ';flex:' + Math.max(awayWp, 0.05).toFixed(3)
    + '"></i><i style="background:' + h + ';flex:' + Math.max(homeWp, 0.05).toFixed(3) + '"></i></div>';
}

/** A row in the head-to-head table. */
function cmpRows(rows) {
  return rows.map((r) => '<tr><td>' + esc(r.away) + '</td><th scope="row">' + esc(r.label)
    + '</th><td>' + esc(r.home) + '</td></tr>').join('\n        ');
}

/** og:image should be the team crest, not the generic site card, on a matchup page. */
function ogImageFor(away, home) {
  return home.logo || away.logo || (SITE + '/static/og/og-home.png');
}

function pageShell(o) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}" />
<link rel="canonical" href="${o.url}" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta property="og:title" content="${esc(o.ogTitle)}" />
<meta property="og:description" content="${esc(o.description)}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${o.url}" />
<meta property="og:site_name" content="TrustMyRecord" />
<meta property="og:image" content="${SITE}/static/og/og-home.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(o.ogTitle)}" />
<meta name="twitter:description" content="${esc(o.description)}" />
<meta name="twitter:image" content="${SITE}/static/og/og-home.png" />
<link rel="icon" type="image/png" href="/static/favicon.png">
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: o.hubName, item: SITE + o.hubPath },
      { '@type': 'ListItem', position: 3, name: o.crumb, item: o.url },
    ],
  })}
</script>
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: o.title,
    url: o.url,
    description: o.description,
    isPartOf: { '@type': 'WebSite', name: 'TrustMyRecord', url: SITE + '/' },
    primaryImageOfPage: undefined,
    about: o.aboutTeams.map((t) => ({ '@type': 'SportsTeam', name: t })),
    publisher: { '@type': 'Organization', name: 'TrustMyRecord', url: SITE + '/' },
  })}
</script>
<link rel="stylesheet" href="/static/css/tmr-sim-arena.css?v=${o.cssHash}">
<link rel="stylesheet" href="/static/css/tmr-linkhub.css?v=fa4ea64c6c4a">
<script defer src="/static/js/tmr-linkhub.js?v=b4e9b31be5d3"></script>
<script src="/static/js/tmr-analytics.js?v=d9a28154fb06"></script>
<link rel="stylesheet" href="/static/css/tmr-ds.9daf47af9804.css">
</head>
<body class="tmr-ds-shell tmr-ds--dark">
<!-- CLS: the shared header is injected by tmr-ds-nav.js at the end of the body,
     which pushes the page down after first paint. That shift is worth about 0.15
     to 0.30 CLS on its own. This reserves the header's height up front and drops
     the reservation in the SAME frame the real header lands, so the two cancel
     and nothing visibly moves. tmr-ds-nav.js is not modified. -->
<div id="dsNavReserve" aria-hidden="true" style="height:70px"></div>
<script>
(function () {
  var r = document.getElementById('dsNavReserve');
  if (!r) return;
  var drop = function () { if (r && r.parentNode) { r.parentNode.removeChild(r); r = null; } };
  if (document.querySelector('nav.ds-nav')) return drop();
  var o = new MutationObserver(function () {
    if (document.querySelector('nav.ds-nav')) { o.disconnect(); drop(); }
  });
  o.observe(document.documentElement, { childList: true, subtree: true });
  // If the header script never runs, give the space back rather than leaving a gap.
  window.addEventListener('load', function () {
    setTimeout(function () { o.disconnect(); drop(); }, 2000);
  });
}());
</script>

<main class="wrap">
  <nav class="dim" aria-label="Breadcrumb" style="padding-top:18px">
    <a href="/">TrustMyRecord</a> &rsaquo; <a href="${o.hubPath}">${esc(o.hubName)}</a> &rsaquo; ${esc(o.crumb)}
  </nav>

  <section class="hero">
    <h1>${esc(o.h1)}</h1>
    <p>${esc(o.standfirst)}</p>
    <div class="againrow">
      <a class="btn" href="${o.runHref}">Run this matchup live</a>
      <a class="btn ghost" href="${o.hubPath}">Open the ${esc(o.sportLabel)} Simulator</a>
    </div>
  </section>

${o.body}

  <div class="disc">${esc(o.disclaimer)}</div>
</main>

<section class="seo" aria-label="More about this simulation">
${o.seo}
</section>

<div class="foot wrap">
  TrustMyRecord ${esc(o.sportLabel)} Simulator &middot; projections update as rosters change &middot;
  <a href="${o.hubPath}#faq">How it works</a>
</div>

<script src="/static/js/tmr-session.63f50f4d0988.js"></script><script src="/static/js/tmr-ds-nav.6a5aef783912.js"></script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------------- */
/* NBA                                                                        */
/* ------------------------------------------------------------------------- */

function nbaPage(awayAbbr, homeAbbr, cssHash, siblings) {
  const model = nbaModel();
  const away = model.byAbbr.get(awayAbbr);
  const home = model.byAbbr.get(homeAbbr);
  if (!away || !home) throw new Error('Unknown NBA team in the matchup list: ' + awayAbbr + ' or ' + homeAbbr);

  const d = simulateNbaGame({ homeKey: homeAbbr, awayKey: awayAbbr, seed: PAGE_SEED, nSims: PAGE_SIMS });
  const p = d.projection;
  const slug = slugify(away.nickname) + '-vs-' + slugify(home.nickname);
  const url = SITE + '/nba-simulator/' + slug + '/';
  const favourite = p.win_probability.home >= p.win_probability.away ? home : away;
  const favWp = Math.max(p.win_probability.home, p.win_probability.away);
  const margin = Math.abs(p.spread.home);

  const topPlayers = (t) => t.rotation.slice(0, 5).map((pl) => '<tr><td>' + esc(pl.name) + '</td><td>'
    + esc(pl.pos || '') + '</td><td>' + n1(pl.season.mpg) + '</td><td>' + n1(pl.season.ppg) + '</td><td>'
    + n1(pl.season.rpg) + '</td><td>' + n1(pl.season.apg) + '</td><td>' + n1(pl.season.fgPct) + '%</td><td>'
    + n1(pl.season.threePct) + '%</td></tr>').join('\n          ');

  const body = `  <div class="panel">
    <div class="sechead">Model projection</div>
    <div class="mh">
      ${colorBar(away, home, p.win_probability.away, p.win_probability.home)}
      <div class="mh-grid">
        <div class="mh-team">
          <div class="role">Away</div>
          ${crestImg(away)}
          <div class="nm">${esc(away.name)}</div>
          <div class="pts">${n1(p.projected_score.away)}</div>
          <div class="wp">${pctOf(p.win_probability.away)} win probability</div>
        </div>
        <div class="mh-mid"><div class="at">at</div><div>${PAGE_SIMS.toLocaleString('en-US')} simulations</div></div>
        <div class="mh-team">
          <div class="role">Home</div>
          ${crestImg(home)}
          <div class="nm">${esc(home.name)}</div>
          <div class="pts">${n1(p.projected_score.home)}</div>
          <div class="wp">${pctOf(p.win_probability.home)} win probability</div>
        </div>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="k">Projected spread</div><div class="v">${margin < 0.5 ? 'Pick &rsquo;em' : esc(favourite.abbr) + ' ' + signed(-margin)}</div><div class="s">Margin standard deviation ${p.spread.sd}</div></div>
      <div class="kpi"><div class="k">Projected total</div><div class="v">${n1(p.total.mean)}</div><div class="s">Middle half ${p.total.p25} to ${p.total.p75}</div></div>
      <div class="kpi"><div class="k">Projected pace</div><div class="v">${n1(d.matchup.projected_pace)}</div><div class="s">Possessions per team</div></div>
      <div class="kpi"><div class="k">Decided by a possession</div><div class="v">${pctOf(p.close_game_share)}</div><div class="s">Within three points</div></div>
    </div>
  </div>

  <div class="panel">
    <div class="sechead">${esc(away.name)} against ${esc(home.name)}, ${esc(d.meta.season)} season</div>
    <div class="tablewrap"><table>
      <thead><tr><th>${crestImg(away, 22)} ${esc(away.abbr)}</th><th>Metric</th><th>${crestImg(home, 22)} ${esc(home.abbr)}</th></tr></thead>
      <tbody>
        ${cmpRows([
    { label: 'Points per game', away: n1(away.ppg), home: n1(home.ppg) },
    { label: 'Points allowed', away: n1(away.oppPpg), home: n1(home.oppPpg) },
    { label: 'Offensive rating', away: n1(away.ortg), home: n1(home.ortg) },
    { label: 'Defensive rating', away: n1(away.drtg), home: n1(home.drtg) },
    { label: 'Net rating', away: signed(away.ortg - away.drtg), home: signed(home.ortg - home.drtg) },
    { label: 'Pace', away: n1(away.pace), home: n1(home.pace) },
    { label: 'Three-point rate', away: pctOf(away.offense.threeShare), home: pctOf(home.offense.threeShare) },
    { label: 'Turnover rate', away: pctOf(away.offense.tovRate), home: pctOf(home.offense.tovRate) },
    { label: 'Offensive rebound rate', away: pctOf(away.offense.orbPct), home: pctOf(home.offense.orbPct) },
  ])}
      </tbody>
    </table></div>
  </div>

  <div class="panel">
    <div class="sechead">Rotations the simulator runs</div>
    <div class="grp">
      <div>
        <div class="teamhead"><div class="nm">${esc(away.name)}</div></div>
        <div class="tablewrap"><table>
          <thead><tr><th>Player</th><th>Pos</th><th>MPG</th><th>PPG</th><th>RPG</th><th>APG</th><th>FG%</th><th>3P%</th></tr></thead>
          <tbody>
          ${topPlayers(away)}
          </tbody>
        </table></div>
      </div>
      <div>
        <div class="teamhead"><div class="nm">${esc(home.name)}</div></div>
        <div class="tablewrap"><table>
          <thead><tr><th>Player</th><th>Pos</th><th>MPG</th><th>PPG</th><th>RPG</th><th>APG</th><th>FG%</th><th>3P%</th></tr></thead>
          <tbody>
          ${topPlayers(home)}
          </tbody>
        </table></div>
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="sechead">Why the model leans this way</div>
    <div class="notecards">
      ${d.drivers.map((x) => '<div class="notecard"><div><b>' + esc(x.label) + ': </b>' + esc(x.detail) + '</div></div>').join('\n      ')}
    </div>
  </div>`;

  const seo = `  <h2>What this ${esc(away.nickname)} vs ${esc(home.nickname)} simulation is</h2>
  <p class="lead">This page runs the TrustMyRecord NBA simulator on ${esc(away.name)} at ${esc(home.name)} and prints the result of ${PAGE_SIMS.toLocaleString('en-US')} simulated games. The numbers above are the average of those runs, not a single guess: the projected score, the win probability, the spread and the total all come out of the same possession-level model that powers the full simulator. To play the game out possession by possession and get a full player box score, open it live.</p>

  <h2>How the projection is built</h2>
  <p>Expected efficiency for each side is the league average moved by that offense's distance from average and by the opposing defense's distance from average, both measured per 100 possessions so speed of play does not distort the comparison. ${esc(away.name)} scored ${n1(away.ortg)} per 100 last season and allowed ${n1(away.drtg)}; ${esc(home.name)} scored ${n1(home.ortg)} and allowed ${n1(home.drtg)}. Projected pace for this matchup is ${n1(d.matchup.projected_pace)} possessions against a league average of ${n1(nbaModel().league.pace)}, which is what sets the total.</p>
  <p>${esc(home.name)} hold the home floor here, worth roughly two and a half to three points. Across ${PAGE_SIMS.toLocaleString('en-US')} runs the model made ${esc(favourite.name)} a ${pctOf(favWp)} favourite by an average of ${n1(margin)} points, with a total of ${n1(p.total.mean)}. The middle half of simulated totals landed between ${p.total.p25} and ${p.total.p75}, and ${pctOf(p.close_game_share)} of runs finished within three points.</p>

  <h2>Run it yourself</h2>
  <p>The projection above is a pinned run so the page stays stable. The live simulator is not: every press of <b>Simulate again</b> is a new random draw, so the same two teams give a different final score, a different box score and a different leading scorer each time. That is the point of a simulator rather than a formula. <a href="/nba-simulator/?away=${away.abbr}&amp;home=${home.abbr}">Open ${esc(away.nickname)} vs ${esc(home.nickname)} in the live simulator</a> to get quarter-by-quarter scoring, both full box scores, shooting splits, rebounds, assists, turnovers, steals, blocks and fouls.</p>

  <h2>Is this a prediction?</h2>
  <p>No. It is a model simulation of a hypothetical game between these two teams, built on last completed season production and current rosters. It is not a forecast of a scheduled game, it does not know about rest, travel, trades since the last data refresh, or who is available tonight, and it is not betting advice. Use it as one research input. On TrustMyRecord, real picks are locked before game time, auto-graded and counted toward a public record that cannot be edited afterwards.</p>

  <hr class="divider" />
  <h2>More NBA matchups to simulate</h2>
  <div class="linkgrid">
${siblings}
  </div>

  <hr class="divider" />
  <h2>Related tools</h2>
  <div class="linkgrid">
    <a href="/nba-simulator/">NBA Simulator<small>Simulate any NBA matchup</small></a>
    <a href="/nhl-simulator/">NHL Simulator<small>Simulate any NHL matchup</small></a>
    <a href="/nfl-simulator/">NFL Simulator<small>Simulate any NFL matchup</small></a>
    <a href="/mlb-simulator/">MLB Simulator<small>Simulate any MLB matchup</small></a>
    <a href="/tools/">All Tools<small>Every TrustMyRecord tool</small></a>
  </div>`;

  return {
    slug,
    url,
    dir: path.join(ROOT, 'nba-simulator', slug),
    label: away.nickname + ' vs ' + home.nickname,
    html: pageShell({
      title: away.nickname + ' vs ' + home.nickname + ' Simulation: Score Prediction & Box Score | TrustMyRecord',
      ogTitle: away.nickname + ' vs ' + home.nickname + ' Simulation',
      description: 'Simulated ' + away.name + ' at ' + home.name + ': projected score '
        + n1(p.projected_score.away) + ' to ' + n1(p.projected_score.home) + ', ' + favourite.nickname + ' '
        + pctOf(favWp) + ' to win, total ' + n1(p.total.mean) + '. Run it live for a full box score.',
      url,
      hubName: 'NBA Simulator',
      hubPath: '/nba-simulator/',
      crumb: away.nickname + ' vs ' + home.nickname,
      h1: away.nickname + ' vs ' + home.nickname + ' Simulation',
      sportLabel: 'NBA',
      aboutTeams: [away.name, home.name],
      standfirst: 'A full simulation of ' + away.name + ' at ' + home.name + ', run '
        + PAGE_SIMS.toLocaleString('en-US') + ' times on current rosters and '
        + d.meta.season + ' production. Projected score, win probability, spread, total and the model drivers, '
        + 'plus a live run for the complete quarter-by-quarter box score.',
      runHref: '/nba-simulator/?away=' + away.abbr + '&amp;home=' + home.abbr,
      cssHash: cssHash,
      body,
      seo,
      disclaimer: d.disclaimer,
    }),
  };
}

/* ------------------------------------------------------------------------- */
/* NHL                                                                        */
/* ------------------------------------------------------------------------- */

function nhlNickname(team) {
  // "Toronto Maple Leafs" -> "Maple Leafs". The feed's common name is the city
  // for some teams, so the nickname is taken off the end of the full name.
  const parts = team.name.split(' ');
  if (team.common && team.common !== team.name && !team.name.startsWith(team.common)) return team.common;
  const known = ['Maple Leafs', 'Golden Knights', 'Blue Jackets', 'Red Wings'];
  for (const k of known) if (team.name.endsWith(k)) return k;
  return parts[parts.length - 1];
}

/*
 * REVERSE_PAIR_LINKS_20261007 (Nima: strengthen the stronger URL of each reverse
 * pair, keep both URLs). Chosen on Search Console impressions, Jul 9 to Oct 6,
 * 2026; Avalanche/Golden Knights tied on impressions and went to the better
 * average position. The weaker page gets one plain link to the stronger one.
 */
const NHL_PREFERRED = {
  'rangers-vs-bruins': 'bruins-vs-rangers',
  'penguins-vs-flyers': 'flyers-vs-penguins',
  'maple-leafs-vs-canadiens': 'canadiens-vs-maple-leafs',
  'avalanche-vs-golden-knights': 'golden-knights-vs-avalanche',
  'flames-vs-oilers': 'oilers-vs-flames',
  'panthers-vs-lightning': 'lightning-vs-panthers',
  'blackhawks-vs-red-wings': 'red-wings-vs-blackhawks',
};

function nhlPage(awayAbbr, homeAbbr, cssHash, siblings) {
  const model = nhlModel();
  const away = model.byAbbr.get(awayAbbr);
  const home = model.byAbbr.get(homeAbbr);
  if (!away || !home) throw new Error('Unknown NHL team in the matchup list: ' + awayAbbr + ' or ' + homeAbbr);

  const d = simulateNhlGame({ homeKey: homeAbbr, awayKey: awayAbbr, seed: PAGE_SEED, nSims: PAGE_SIMS });
  const p = d.projection;
  const an = nhlNickname(away);
  const hn = nhlNickname(home);
  const slug = slugify(an) + '-vs-' + slugify(hn);
  const url = SITE + '/nhl-simulator/' + slug + '/';
  const favourite = p.win_probability.home >= p.win_probability.away ? home : away;
  const favName = favourite === home ? hn : an;
  const favWp = Math.max(p.win_probability.home, p.win_probability.away);

  const topSkaters = (t) => t.lineup.forwards.slice(0, 4).concat(t.lineup.defence.slice(0, 2))
    .map((pl) => '<tr><td>' + esc(pl.name) + '</td><td>' + esc(pl.pos) + '</td><td>'
      + (pl.season ? pl.season.gp : '--') + '</td><td>' + (pl.season ? pl.season.g : '--') + '</td><td>'
      + (pl.season ? pl.season.a : '--') + '</td><td>' + (pl.season ? pl.season.pts : '--') + '</td><td>'
      + (pl.season ? n1(pl.season.toiPerGame) : '--') + '</td></tr>').join('\n          ');

  const sg = d.matchup.starting_goalies;

  const body = `  <div class="panel">
    <div class="sechead">Model projection</div>
    <div class="mh">
      ${colorBar(away, home, p.win_probability.away, p.win_probability.home)}
      <div class="mh-grid">
        <div class="mh-team">
          <div class="role">Away</div>
          ${crestImg(away)}
          <div class="nm">${esc(away.name)}</div>
          <div class="pts">${n2(p.projected_score.away)}</div>
          <div class="wp">${pctOf(p.win_probability.away)} win probability</div>
        </div>
        <div class="mh-mid"><div class="at">at</div><div>${PAGE_SIMS.toLocaleString('en-US')} simulations</div></div>
        <div class="mh-team">
          <div class="role">Home</div>
          ${crestImg(home)}
          <div class="nm">${esc(home.name)}</div>
          <div class="pts">${n2(p.projected_score.home)}</div>
          <div class="wp">${pctOf(p.win_probability.home)} win probability</div>
        </div>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="k">Projected total</div><div class="v">${n2(p.total.mean)}</div><div class="s">Middle half ${p.total.p25} to ${p.total.p75}</div></div>
      <div class="kpi"><div class="k">Reaches overtime</div><div class="v">${pctOf(p.overtime_share)}</div><div class="s">${pctOf(p.shootout_share)} go to a shootout</div></div>
      <div class="kpi"><div class="k">Shutout in the game</div><div class="v">${pctOf(p.shutout_share)}</div><div class="s">Either goaltender</div></div>
      <div class="kpi"><div class="k">Projected shots</div><div class="v">${n1(d.matchup.projected_shots.away)} - ${n1(d.matchup.projected_shots.home)}</div><div class="s">On goal, per team</div></div>
    </div>
    <div class="goaliecard">
      <div><div class="nm">${esc(sg.away.name)}</div><div class="sub">${esc(away.name)} projected starter${sg.away.replacementLevel ? ', no qualifying season' : ', ' + sg.away.gamesStarted + ' starts'}</div></div>
      <div class="ln">${String(sg.away.savePct).replace(/^0/, '')} SV%</div>
    </div>
    <div class="goaliecard">
      <div><div class="nm">${esc(sg.home.name)}</div><div class="sub">${esc(home.name)} projected starter${sg.home.replacementLevel ? ', no qualifying season' : ', ' + sg.home.gamesStarted + ' starts'}</div></div>
      <div class="ln">${String(sg.home.savePct).replace(/^0/, '')} SV%</div>
    </div>
  </div>

  <div class="panel">
    <div class="sechead">${esc(away.name)} against ${esc(home.name)}, ${esc(d.meta.stats_season)} season</div>
    <div class="tablewrap"><table>
      <thead><tr><th>${crestImg(away, 22)} ${esc(away.abbr)}</th><th>Metric</th><th>${crestImg(home, 22)} ${esc(home.abbr)}</th></tr></thead>
      <tbody>
        ${cmpRows([
    { label: 'Record', away: away.record.wins + '-' + away.record.losses + '-' + away.record.otLosses, home: home.record.wins + '-' + home.record.losses + '-' + home.record.otLosses },
    { label: 'Points', away: away.record.points, home: home.record.points },
    { label: 'Goals for per game', away: n2(away.goalsFor), home: n2(home.goalsFor) },
    { label: 'Goals against per game', away: n2(away.goalsAgainst), home: n2(home.goalsAgainst) },
    { label: 'Shots for per game', away: n1(away.shotsFor), home: n1(home.shotsFor) },
    { label: 'Shots against per game', away: n1(away.shotsAgainst), home: n1(home.shotsAgainst) },
    { label: 'Shooting percentage', away: pctOf(away.shootingPct), home: pctOf(home.shootingPct) },
    { label: 'Power play', away: pctOf(away.powerPlayPct), home: pctOf(home.powerPlayPct) },
    { label: 'Penalty kill', away: pctOf(away.penaltyKillPct), home: pctOf(home.penaltyKillPct) },
    { label: 'Faceoffs won', away: pctOf(away.faceoffPct), home: pctOf(home.faceoffPct) },
  ])}
      </tbody>
    </table></div>
  </div>

  <div class="panel">
    <div class="sechead">Lineups the simulator runs</div>
    <div class="grp">
      <div>
        <div class="teamhead"><div class="nm">${esc(away.name)}</div></div>
        <div class="tablewrap"><table>
          <thead><tr><th>Player</th><th>Pos</th><th>GP</th><th>G</th><th>A</th><th>P</th><th>TOI</th></tr></thead>
          <tbody>
          ${topSkaters(away)}
          </tbody>
        </table></div>
      </div>
      <div>
        <div class="teamhead"><div class="nm">${esc(home.name)}</div></div>
        <div class="tablewrap"><table>
          <thead><tr><th>Player</th><th>Pos</th><th>GP</th><th>G</th><th>A</th><th>P</th><th>TOI</th></tr></thead>
          <tbody>
          ${topSkaters(home)}
          </tbody>
        </table></div>
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="sechead">Why the model leans this way</div>
    <div class="notecards">
      ${d.drivers.map((x) => '<div class="notecard"><div><b>' + esc(x.label) + ': </b>' + esc(x.detail) + '</div></div>').join('\n      ')}
    </div>
  </div>`;

  const seo = `  <h2>What this ${esc(an)} vs ${esc(hn)} simulation is</h2>
  <p class="lead">This page runs the TrustMyRecord NHL simulator on ${esc(away.name)} at ${esc(home.name)} and prints the result of ${PAGE_SIMS.toLocaleString('en-US')} simulated games. The numbers above are the average of those runs: the projected score, win probability, total and overtime share all come out of the same shot-and-conversion model that powers the full simulator. To play one game out period by period and get shots on goal, both goaltender lines and a complete box score, open it live.</p>

  <h2>How the projection is built</h2>
  <p>Each team's shot volume is its own shots-for rate met against the opponent's shots-against rate. ${esc(away.name)} put ${n1(away.shotsFor)} shots on goal a game last season and allowed ${n1(away.shotsAgainst)}; ${esc(home.name)} put up ${n1(home.shotsFor)} and allowed ${n1(home.shotsAgainst)}. Conversion combines each team's shooting with the goaltender actually in the other net, which is why the starter matters here: ${esc(sg.away.name)} and ${esc(sg.home.name)} are the projected starters, and swapping either one in the live simulator visibly moves the projection.</p>
  <p>Special teams are simulated rather than assumed. ${esc(away.name)} ran a ${pctOf(away.powerPlayPct)} power play against a ${pctOf(home.penaltyKillPct)} kill, and ${esc(home.name)} ran ${pctOf(home.powerPlayPct)} against ${pctOf(away.penaltyKillPct)}. Across ${PAGE_SIMS.toLocaleString('en-US')} runs the model made ${esc(favName)} a ${pctOf(favWp)} favourite, projected a total of ${n2(p.total.mean)} goals, and sent ${pctOf(p.overtime_share)} of games past regulation.</p>

  <h2>Run it yourself</h2>
  <p>The projection above is a pinned run so the page stays stable. The live simulator is not: every press of <b>Simulate again</b> is a new random draw, so the same two teams give a different score, different goal scorers and a different goaltender line each time. <a href="/nhl-simulator/?away=${away.abbr}&amp;home=${home.abbr}">Open ${esc(an)} vs ${esc(hn)} in the live simulator</a> for period-by-period scoring, shots on goal, goals and assists, power-play results, penalty minutes, hits, blocked shots and both goaltenders' save totals.</p>

${NHL_PREFERRED[slug] ? `  <p>Home ice the other way round: <a href="/nhl-simulator/${NHL_PREFERRED[slug]}/">${esc(hn)} at ${esc(an)}, simulated</a>.</p>

` : ''}  <h2>Is this a prediction?</h2>
  <p>No. It is a model simulation of a hypothetical game between these two teams, built on current rosters, the players listed out and the projected starting goaltenders. It is not a forecast of a scheduled game, it does not know line combinations or a goaltender change announced on the day, and it is not betting advice. Use it as one research input. On TrustMyRecord, real picks are locked before game time, auto-graded and counted toward a public record that cannot be edited afterwards.</p>

  <hr class="divider" />
  <h2>More NHL matchups to simulate</h2>
  <div class="linkgrid">
${siblings}
  </div>

  <hr class="divider" />
  <h2>Related tools</h2>
  <div class="linkgrid">
    <a href="/nhl-simulator/">NHL Simulator<small>Simulate any NHL matchup</small></a>
    <a href="/nba-simulator/">NBA Simulator<small>Simulate any NBA matchup</small></a>
    <a href="/nfl-simulator/">NFL Simulator<small>Simulate any NFL matchup</small></a>
    <a href="/mlb-simulator/">MLB Simulator<small>Simulate any MLB matchup</small></a>
    <a href="/tools/">All Tools<small>Every TrustMyRecord tool</small></a>
  </div>`;

  return {
    slug,
    url,
    dir: path.join(ROOT, 'nhl-simulator', slug),
    label: an + ' vs ' + hn,
    html: pageShell({
      title: an + ' vs ' + hn + ' Simulation: Score Prediction & Box Score | TrustMyRecord',
      ogTitle: an + ' vs ' + hn + ' Simulation',
      description: 'Simulated ' + away.name + ' at ' + home.name + ': projected score '
        + n2(p.projected_score.away) + ' to ' + n2(p.projected_score.home) + ', ' + favName + ' '
        + pctOf(favWp) + ' to win, total ' + n2(p.total.mean) + '. Run it live for a full box score.',
      url,
      hubName: 'NHL Simulator',
      hubPath: '/nhl-simulator/',
      crumb: an + ' vs ' + hn,
      h1: an + ' vs ' + hn + ' Simulation',
      sportLabel: 'NHL',
      aboutTeams: [away.name, home.name],
      standfirst: 'A full simulation of ' + away.name + ' at ' + home.name + ', run '
        + PAGE_SIMS.toLocaleString('en-US') + ' times on current rosters and ' + d.meta.stats_season
        + ' production. Projected score, win probability, total, goaltending and the model drivers, '
        + 'plus a live run for the complete period-by-period box score.',
      runHref: '/nhl-simulator/?away=' + away.abbr + '&amp;home=' + home.abbr,
      cssHash: cssHash,
      body,
      seo,
      disclaimer: d.disclaimer,
    }),
  };
}

/* ------------------------------------------------------------------------- */

function cssHashOf() {
  const crypto = require('crypto');
  const file = path.join(ROOT, 'static', 'css', 'tmr-sim-arena.css');
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
}

/** The link grid that every page in a sport shares, minus the page itself. */
function siblingGrid(pages, exclude, hub) {
  return pages
    .filter((p) => p.slug !== exclude)
    .slice(0, 11)
    .map((p) => '    <a href="' + hub + p.slug + '/">' + esc(p.label)
      + '<small>Simulate the matchup</small></a>')
    .join('\n');
}

/** Rewrite the "Popular matchups" grid on a hub page so it links every generated page. */
function updateHub(hubFile, pages, hub) {
  const html = fs.readFileSync(hubFile, 'utf8');
  const grid = pages.map((p) => '    <a href="' + hub + p.slug + '/">' + esc(p.label)
    + '<small>Simulate the matchup</small></a>').join('\n');
  const re = /(<div class="linkgrid" id="matchupLinks">)[\s\S]*?(<\/div>)/;
  // Guard on the MARKER, not on whether the text changed. A second run with the
  // same matchup list produces identical output, which is success, not a
  // missing grid.
  if (!re.test(html)) throw new Error('Could not find the matchupLinks grid in ' + hubFile);
  return html.replace(re, '$1\n' + grid + '\n  $2');
}

function build() {
  const cssHash = cssHashOf();
  const written = [];

  const make = (list, fn, hub, hubFile) => {
    // Two passes: the first to learn every slug and label, the second to write
    // the pages with a sibling grid that can reference all of them.
    const stubs = list.map((m) => fn(m[0], m[1], cssHash, ''));
    const pages = list.map((m, i) => fn(m[0], m[1], cssHash, siblingGrid(stubs, stubs[i].slug, hub)));
    for (const p of pages) {
      const file = path.join(p.dir, 'index.html');
      const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (existing === p.html) { written.push({ url: p.url, status: 'unchanged' }); continue; }
      if (!CHECK) {
        fs.mkdirSync(p.dir, { recursive: true });
        fs.writeFileSync(file, p.html);
      }
      written.push({ url: p.url, status: existing ? 'updated' : 'created' });
    }
    const hubHtml = updateHub(hubFile, pages, hub);
    if (!CHECK) fs.writeFileSync(hubFile, hubHtml);
    return pages;
  };

  const nba = make(NBA_MATCHUPS, nbaPage, '/nba-simulator/', path.join(ROOT, 'nba-simulator', 'index.html'));
  const nhl = make(NHL_MATCHUPS, nhlPage, '/nhl-simulator/', path.join(ROOT, 'nhl-simulator', 'index.html'));

  const counts = written.reduce((a, w) => { a[w.status] = (a[w.status] || 0) + 1; return a; }, {});
  process.stdout.write(
    (CHECK ? '[check] ' : '') + 'NBA ' + nba.length + ' pages, NHL ' + nhl.length + ' pages. '
    + JSON.stringify(counts) + '\n',
  );

  // The URL list, for the sitemap step.
  const urls = [...nba, ...nhl].map((p) => p.url);
  fs.writeFileSync(path.join(ROOT, 'scripts', 'sim-matchup-urls.txt'), urls.join('\n') + '\n');
  process.stdout.write('URL list written to scripts/sim-matchup-urls.txt\n');
  return urls;
}

build();
