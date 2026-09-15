#!/usr/bin/env node
/**
 * NFL_SEASON_SIM_20260915 -- bakes /nfl-season-simulator/, the season sibling of
 * /nfl-playoff-simulator/ that the 2026-09-12 simulator SEO audit ranked first
 * (MLB earns most of its clicks from /mlb-season-simulator/ and NFL had no
 * season page).
 *
 * Every number is computed here from the LIVE /api/nfl/public/playoff-inputs
 * payload with static/js/nfl-season-project.js, the same code the page runs
 * when a visitor presses Run. Shell, CSS and helpers come from
 * build_league_sim_pages.js so the four simulator season pages read as one
 * product.
 *
 * Usage: node scripts/build_nfl_season_page.js [--inputs FILE] [--runs N]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const N = require('../static/js/nfl-season-project.js');
const H = require('./build_league_sim_pages.js');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://trustmyrecord.com';
const URL = '/nfl-season-simulator/';
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const RUNS = Number(argVal('--runs')) || 10000;
const esc = H.esc;

async function inputs() {
  const f = argVal('--inputs');
  if (f) return JSON.parse(fs.readFileSync(f, 'utf8'));
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch('https://trustmyrecord-api.onrender.com/api/nfl/public/playoff-inputs?season=' + seasonNow(),
        { signal: AbortSignal.timeout(180000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (d.projections_available && d.games && d.games.length >= 272) return d;
      last = new Error('projections not ready: ' + d.projection_state);
    } catch (e) { last = e; }
    await new Promise((res) => setTimeout(res, 20000));
  }
  throw last;
}

/* The NFL season is named by the year it kicks off; January and February still
   belong to the season that started the September before. */
function seasonNow() {
  const d = new Date();
  return d.getUTCMonth() <= 1 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
}

function page(d, result, shell) {
  const season = d.season;
  const played = d.games.length - result.open;
  const byWins = result.teams.slice().sort((a, b) => b.wins_mean - a.wins_mean);
  const top = byWins[0], second = byWins[1];
  const weeks = [...new Set(d.games.map((g) => g.week))].sort((a, b) => a - b);
  const nextWeek = (d.games.find((g) => !g.completed) || {}).week;
  const slate = d.games.filter((g) => g.week === nextWeek);
  const team = (id) => d.teams.find((t) => t.id === id) || { name: id };
  const title = `NFL Season Simulator ${season} | Projected Wins, Division Titles and Playoff Odds`;
  const desc = `Simulate the rest of the ${season} NFL season ${H.count(result.runs)} times: projected wins and the 80% range for all 32 teams, division title, playoff and 1 seed odds, with real NFL tiebreakers.`;
  const lead = `<p>${played ? `${played} of ${d.games.length} regular season games are final.` : `The ${season} regular season has not kicked off.`} Across ${H.count(result.runs)} simulated seasons the ${esc(top.name)} average ${H.UI_one(top.wins_mean)} wins and the ${esc(second.name)} ${H.UI_one(second.wins_mean)}. Every season is seeded with the same NFL tiebreakers as the <a href="/nfl-playoff-simulator/">NFL Playoff Simulator</a>. Press Run to play a fresh set from the latest results.</p>`;
  const faqs = [
    ['How does the NFL season simulator work?', `It plays every remaining game on the ${season} NFL schedule ${H.count(result.runs)} times. Games already played keep their real result, every other game is decided by that game's own win probability from the TrustMyRecord NFL model, and each simulated season is seeded with the NFL's tiebreakers.`],
    ['What does the 80% range mean?', 'Eight of every ten simulated seasons land inside it. It shows how far a team’s win total can swing on the same schedule and the same model.'.replace('’', "'")],
    ['Which tiebreakers does it use?', 'Head to head, division record, common games, conference record, strength of victory, strength of schedule and the points based steps, in the league’s order. Best net touchdowns and the coin toss cannot be computed from the data held, and a tie that reaches them is left tied rather than guessed.'.replace('’', "'")],
    ['Does it update during the season?', 'Yes. Each rebuild reads the schedule, every final score and the model’s probabilities again, so played games stop being simulated and the ranges narrow week by week.'.replace('’', "'")],
    ['Is it free?', 'The published projection is free to read with no account. Running your own set of seasons needs a free account and uses the daily free simulator run.'],
  ];
  const faq = H.faqBlock(faqs);
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'TrustMyRecord NFL Season Simulator', applicationCategory: 'SportsApplication',
      operatingSystem: 'Web', url: SITE + URL, description: desc, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, dateModified: d.generated_at },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Sports Simulators', item: SITE + '/sports-simulators/' },
      { '@type': 'ListItem', position: 3, name: 'NFL Simulator', item: SITE + '/nfl-simulator/' },
      { '@type': 'ListItem', position: 4, name: 'NFL Season Simulator', item: SITE + URL }] },
  ];
  const slateHtml = slate.map((g) => `<div>${esc(team(g.away).name)} at ${esc(team(g.home).name)}${typeof g.home_win_prob === 'number' ? ` <small>${esc(team(g.home).nickname || '')} ${Math.round(g.home_win_prob * 100)}%</small>` : ''}</div>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<!-- NFL_SEASON_SIM_20260915. Baked by scripts/build_nfl_season_page.js. Do not edit by hand. -->
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${URL}" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta property="og:type" content="website" />
<meta property="og:title" content="NFL Season Simulator ${season}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${SITE}${URL}" />
<meta property="og:site_name" content="TrustMyRecord" />
<meta property="og:image" content="${SITE}/static/og/og-home.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="NFL Season Simulator ${season}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${SITE}/static/og/og-home.png" />
<link rel="icon" type="image/png" href="/static/favicon.png">
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n')}
<script type="application/ld+json">${faq.ld}</script>
<script>window.SIM_GATE_FLAGS = { gate: true, resume: true, autoSave: false, meter: true };</script>
${shell.head}
<style>${H.CSS}</style>
</head>
<body class="tmr-ds-shell tmr-ds--dark">
<main class="wrap lsim-wrap" id="nflSeason">
  <nav class="simcrumb" aria-label="Breadcrumb" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:.8rem;margin:0 0 14px;opacity:.85;">
    <a href="/" style="color:inherit;text-decoration:none;">Home</a><span aria-hidden="true" style="opacity:.45;">&rsaquo;</span>
    <a href="/sports-simulators/" style="color:inherit;text-decoration:none;">Sports Simulators</a><span aria-hidden="true" style="opacity:.45;">&rsaquo;</span>
    <a href="/nfl-simulator/" style="color:inherit;text-decoration:none;">NFL Simulator</a><span aria-hidden="true" style="opacity:.45;">&rsaquo;</span>
    <span aria-current="page" style="font-weight:600;">NFL Season Simulator</span>
  </nav>
  <section class="hero lsim-hero">
    <h1>NFL Season Simulator</h1>
    ${lead}
    <div class="lsim-run">
      <label>Seasons <select id="lsimRuns"><option value="1000">1,000</option><option value="2000" selected>2,000</option><option value="5000">5,000</option></select></label>
      <button class="btn primary" type="button" id="runSim">Run the season</button>
      <span id="lsimStatus" role="status" aria-live="polite"></span>
    </div>
    <p id="lsimStamp">${N.stamp(result, d)}</p>
  </section>

  <section class="panel"><h2>Projected ${season} NFL standings</h2>
  <div id="lsimTables" class="lsim-grid">${N.tables(result)}</div></section>

  <section class="lsim-copy">
    <h2>How the NFL season simulator works</h2>
    <p>The ${season} regular season is ${weeks.length} weeks and ${d.games.length} games, 17 per team. Every game that has been played keeps its real score. Every game that has not is played out ${H.count(result.runs)} times, each time decided by that game's own home win probability from the TrustMyRecord NFL model, the drive level model behind the <a href="/nfl-simulator/">NFL Simulator</a>, trained on the ${esc(String(d.model && d.model.train_season_min))} to ${esc(String(d.model && d.model.train_season_max))} seasons and held out on ${esc(String(d.model && d.model.holdout_season))}.</p>
    <p>Each simulated season is then seeded the way the league does it: the four division winners in each conference take seeds 1 through 4, the three best remaining records take the wild cards, and ties go through the NFL's tiebreaker steps in order.</p>
    <h2>Tiebreakers</h2>
    <p>Head to head, division record, common games with a four game minimum, conference record, strength of victory, strength of schedule and the points based steps are all applied, in the league's order, and a tie among three or more clubs reduces to two and starts over. Best net touchdowns and the coin toss cannot be computed from the data held; a tie that reaches them stays tied rather than being settled by an invented number.</p>
    <h2>What the projection does not know</h2>
    <p>A game's probability is set by the model before kickoff. It does not know about an injury or a quarterback change announced after the inputs were read, and the projection is only as current as its last rebuild, stamped above in Pacific time.</p>
    ${slateHtml ? `<h2>Week ${esc(String(nextWeek))} games</h2>\n    <div class="slate">${slateHtml}</div>\n    <p>The percentage is the home team's win probability. Simulate any of these games with a full box score in the <a href="/nfl-simulator/">NFL Simulator</a>, or pick them yourself in the <a href="/nfl-playoff-simulator/">NFL Playoff Simulator</a>.</p>` : ''}
    <h2 id="faq">NFL Season Simulator FAQ</h2>
    ${faq.html}
  </section>

  <section class="panel">
    <h2>More simulators</h2>
    <div class="linkgrid">
    <a href="/nfl-simulator/">NFL Simulator<small>Simulate any game with a full box score</small></a>
    <a href="/nfl-playoff-simulator/">NFL Playoff Simulator<small>Pick games, seeds and the bracket</small></a>
    <a href="/mlb-season-simulator/">MLB Season Simulator<small>Baseball</small></a>
    <a href="/nba-season-simulator/">NBA Season Simulator<small>Basketball</small></a>
    <a href="/nhl-season-simulator/">NHL Season Simulator<small>Hockey</small></a>
    <a href="/sports-simulators/">All Sports Simulators<small>MLB, NFL, NBA and NHL</small></a>
    </div>
  </section>
</main>
<div class="foot wrap">TrustMyRecord NFL Season Simulator &middot; a model projection, not betting advice &middot; <a href="${URL}#faq">FAQ</a></div>
<script defer src="/static/js/nfl-playoff-engine.js"></script>
<script defer src="/static/js/nfl-season-project.js"></script>
<script defer src="/static/js/nfl-season-sim.js"></script>
<script defer src="/static/js/sim-run-gate.js" data-sport="nfl_season"></script>
${shell.tail}
</body>
</html>
`;
}

(async () => {
  const d = await inputs();
  const seed = Number(String(d.generated_at || '').slice(0, 10).replace(/-/g, '')) || 1;
  const result = N.project(d, RUNS, seed);
  const out = path.join(ROOT, 'nfl-season-simulator', 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, page(d, result, H.shellAssets()));
  console.log('wrote nfl-season-simulator/index.html');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
