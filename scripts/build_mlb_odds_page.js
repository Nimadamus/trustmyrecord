#!/usr/bin/env node
/**
 * MLB_PLAYOFF_ODDS_20260915 -- /mlb-playoff-odds/: live 2026 MLB playoff odds
 * from the real standings and every remaining game, through the 12 team
 * postseason (bye, Wild Card Series, Division Series, LCS, World Series).
 *
 * DATA, ALL READ LIVE FROM MLB (statsapi.mlb.com) AT BUILD TIME
 *   standings  wins, losses, runs scored and allowed, league and division
 *   schedule   every 2026 regular season game: finals keep their score, games
 *              not yet played are simulated; postponed placeholders are dropped
 *              because the rescheduled game is its own entry
 *
 * THE GAME MODEL, STATED IN FULL ON THE PAGE
 *   Team strength is the Pythagenpat expectation from runs scored and allowed,
 *   exponent ((RS + RA) / G) ^ 0.287, regressed toward .500 by 70 games of
 *   average play. A game between two clubs is log5 of their strengths with a
 *   home field edge that makes the average home team a .540 favourite, the rate
 *   the TrustMyRecord MLB simulator audit measured on a full season. It uses no
 *   betting line.
 *
 * Writes the page and /data/mlb-playoff-odds-inputs.json (what Run reads).
 * Usage: node scripts/build_mlb_odds_page.js [--runs N]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const E = require('../static/js/league-season-engine.js');
const UI = require('../static/js/league-season-sim.js');
const H = require('./build_league_sim_pages.js');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://trustmyrecord.com';
const URL = '/mlb-playoff-odds/';
const DATA = '/data/mlb-playoff-odds-inputs.json';
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const RUNS = Number(argVal('--runs')) || 10000;
const esc = H.esc;
const STATS = 'https://statsapi.mlb.com/api/v1';
const REGRESS_GAMES = 70;
const HOME_RATE = 0.54;

async function getJson(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (r.ok) return await r.json();
    } catch (e) { /* retry */ }
    await new Promise((res) => setTimeout(res, 5000));
  }
  throw new Error('MLB feed did not answer: ' + url);
}

function strength(t) {
  const g = t.w + t.l;
  if (!g) return 0.5;
  const x = Math.pow((t.rs + t.ra) / g, 0.287);
  const pyth = Math.pow(t.rs, x) / (Math.pow(t.rs, x) + Math.pow(t.ra, x));
  return (g * pyth + REGRESS_GAMES * 0.5) / (g + REGRESS_GAMES);
}

function homeWin(th, ta) {
  const p = (th * (1 - ta)) / (th * (1 - ta) + ta * (1 - th));
  const odds = (p / (1 - p)) * (HOME_RATE / (1 - HOME_RATE));
  return odds / (1 + odds);
}

async function buildInputs() {
  const season = new Date().getUTCFullYear();
  const [teamsFeed, divs, standings, sched] = await Promise.all([
    getJson(`${STATS}/teams?sportId=1&season=${season}`),
    getJson(`${STATS}/divisions?sportId=1`),
    getJson(`${STATS}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`),
    getJson(`${STATS}/schedule?sportId=1&season=${season}&gameType=R&startDate=${season}-03-01&endDate=${season}-11-15`),
  ]);
  const divName = Object.fromEntries(divs.divisions.map((d) => [d.id, d.nameShort]));
  const meta = Object.fromEntries(teamsFeed.teams.map((t) => [t.id, t]));
  const teams = [];
  for (const rec of standings.records) {
    for (const r of rec.teamRecords) {
      const m = meta[r.team.id] || {};
      teams.push({
        espn_abbr: m.abbreviation || String(r.team.id), mlb_id: r.team.id,
        name: m.name || r.team.name, short: m.teamName || r.team.name,
        logo: `https://www.mlbstatic.com/team-logos/${r.team.id}.svg`,
        conference: rec.league.id === 103 ? 'American League' : 'National League',
        division: divName[rec.division.id] || String(rec.division.id),
        w: r.wins, l: r.losses, rs: r.runsScored, ra: r.runsAllowed,
      });
    }
  }
  if (teams.length !== 30) throw new Error(`standings returned ${teams.length} teams`);
  const abbrOf = Object.fromEntries(teams.map((t) => [t.mlb_id, t.espn_abbr]));
  const schedule = [];
  for (const day of sched.dates || []) {
    for (const g of day.games) {
      if (g.status.detailedState === 'Postponed' || g.status.detailedState === 'Cancelled') continue;
      const home = abbrOf[g.teams.home.team.id], away = abbrOf[g.teams.away.team.id];
      if (!home || !away) continue;
      const final = g.status.abstractGameState === 'Final';
      schedule.push({ id: String(g.gamePk), date: g.gameDate, home, away, final,
        home_score: final ? g.teams.home.score : null, away_score: final ? g.teams.away.score : null });
    }
  }
  /* The results in the schedule have to reproduce the standings. If they do
     not, something in the feed changed and nothing is published. */
  const tally = {};
  schedule.filter((g) => g.final && g.home_score !== g.away_score).forEach((g) => {
    const wHome = g.home_score > g.away_score;
    (tally[g.home] = tally[g.home] || { w: 0, l: 0 })[wHome ? 'w' : 'l']++;
    (tally[g.away] = tally[g.away] || { w: 0, l: 0 })[wHome ? 'l' : 'w']++;
  });
  const off = teams.filter((t) => !tally[t.espn_abbr] || Math.abs(tally[t.espn_abbr].w - t.w) > 1 || Math.abs(tally[t.espn_abbr].l - t.l) > 1);
  if (off.length) throw new Error('schedule results do not match standings for ' + off.map((t) => `${t.espn_abbr} ${t.w}-${t.l} vs ${JSON.stringify(tally[t.espn_abbr])}`).join(', '));
  const str = Object.fromEntries(teams.map((t) => [t.espn_abbr, strength(t)]));
  const matchups = {};
  teams.forEach((h) => {
    matchups[h.espn_abbr] = {};
    teams.forEach((a) => {
      if (h !== a) matchups[h.espn_abbr][a.espn_abbr] = { p: Math.round(homeWin(str[h.espn_abbr], str[a.espn_abbr]) * 10000) / 10000 };
    });
  });
  teams.forEach((t) => { t.strength = Math.round(str[t.espn_abbr] * 1000) / 1000; });
  return {
    sport: 'mlb', season, season_label: String(season), generated_at: new Date().toISOString(),
    teams, schedule, games_final: schedule.filter((g) => g.final).length, matchups,
    model: { method: 'Pythagenpat 0.287, regressed 70 games, log5, home .540' },
    source: 'statsapi.mlb.com',
  };
}

function page(inp, result, shell) {
  const nl = (s) => s;
  const remaining = inp.schedule.length - inp.games_final;
  const byTitle = result.teams.slice().sort((a, b) => b.champion - a.champion);
  const bubble = result.teams.filter((t) => t.playoffs > 0.1 && t.playoffs < 0.9).sort((a, b) => b.playoffs - a.playoffs);
  const last = inp.schedule[inp.schedule.length - 1];
  const ptDay = (iso) => H.ptDate(iso);
  const title = `MLB Playoff Odds ${inp.season} | Live Postseason Chances, Byes and World Series Odds`;
  const desc = `Live ${inp.season} MLB playoff odds for all 30 teams from ${H.count(result.runs)} simulations of the ${remaining} games left: division titles, first round byes, the Wild Card Series and World Series chances.`;
  const lead = `<p>${remaining} regular season games are left, the last on ${esc(ptDay(last.date))}. Across ${H.count(result.runs)} simulated finishes the ${esc(byTitle[0].name)} win the World Series ${H.pctText(byTitle[0].champion)} of the time, ahead of the ${esc(byTitle[1].name)} at ${H.pctText(byTitle[1].champion)}. ${bubble.length ? `The races still open: ${bubble.slice(0, 6).map((t) => `${esc(t.name)} ${Math.round(t.playoffs * 100)}%`).join(', ')}.` : ''}</p>`;
  const faqs = [
    [`What are the ${inp.season} MLB playoff odds?`, `Each team's chance comes from ${H.count(result.runs)} simulations of the rest of the ${inp.season} regular season and the postseason. The current favourite to win the World Series is the ${byTitle[0].name} at ${H.pctText(byTitle[0].champion)}.`],
    ['How does the MLB playoff format work?', 'Twelve teams make it, six per league. The three division winners take seeds 1 to 3 by record and the three best remaining records are seeds 4 to 6. Seeds 1 and 2 get a bye. The Wild Card Series is best of three with every game at the higher seed, the Division Series best of five, and the League Championship Series and World Series best of seven.'],
    ['How is each game decided?', `A team's strength is its Pythagorean record from runs scored and allowed (the Pythagenpat method, exponent 0.287), pulled toward .500 by ${REGRESS_GAMES} games of average play so a hot or cold stretch does not overstate it. A game is log5 of the two strengths with a home field edge worth a .540 home winning rate. No betting line is used.`],
    ['Which tiebreakers are applied?', 'Head to head record between the tied teams, then a random draw. MLB’s later steps, such as intradivision record, are not applied and are listed here rather than approximated. There is no tiebreaker game.'.replace('’', "'")],
    ['How often is it updated?', 'The standings, results and schedule are read from MLB twice a day, so finished games stop being simulated and the odds tighten every day to the end of the season.'],
  ];
  const faq = H.faqBlock(faqs);
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: `MLB Playoff Odds ${inp.season}`, url: SITE + URL, description: desc, dateModified: inp.generated_at },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Sports Simulators', item: SITE + '/sports-simulators/' },
      { '@type': 'ListItem', position: 3, name: 'MLB Simulator', item: SITE + '/mlb-simulator/' },
      { '@type': 'ListItem', position: 4, name: 'MLB Playoff Odds', item: SITE + URL }] },
  ];
  const picks = H.pickPanel ? H.pickPanel('mlb', inp) : '';
  return nl(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<!-- MLB_PLAYOFF_ODDS_20260915. Baked by scripts/build_mlb_odds_page.js. Do not edit by hand. -->
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${URL}" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta property="og:type" content="website" />
<meta property="og:title" content="MLB Playoff Odds ${inp.season}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${SITE}${URL}" />
<meta property="og:site_name" content="TrustMyRecord" />
<meta property="og:image" content="${SITE}/static/og/og-home.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/png" href="/static/favicon.png">
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n')}
<script type="application/ld+json">${faq.ld}</script>
<script>window.SIM_GATE_FLAGS = { gate: true, resume: true, autoSave: false, meter: true };</script>
${shell.head}
<style>${H.CSS}</style>
</head>
<body class="tmr-ds-shell tmr-ds--dark">
<main class="wrap lsim-wrap" id="lsim" data-sport="mlb" data-mode="odds" data-inputs="${DATA}">
  <nav class="simcrumb" aria-label="Breadcrumb" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:.8rem;margin:0 0 14px;opacity:.85;">
    <a href="/" style="color:inherit;text-decoration:none;">Home</a><span aria-hidden="true" style="opacity:.45;">&rsaquo;</span>
    <a href="/sports-simulators/" style="color:inherit;text-decoration:none;">Sports Simulators</a><span aria-hidden="true" style="opacity:.45;">&rsaquo;</span>
    <a href="/mlb-simulator/" style="color:inherit;text-decoration:none;">MLB Simulator</a><span aria-hidden="true" style="opacity:.45;">&rsaquo;</span>
    <span aria-current="page" style="font-weight:600;">MLB Playoff Odds</span>
  </nav>
  <section class="hero lsim-hero">
    <h1>MLB Playoff Odds ${inp.season}</h1>
    ${lead}
    <div class="lsim-run">
      <label>Simulations <select id="lsimRuns"><option value="2000">2,000</option><option value="5000" selected>5,000</option><option value="10000">10,000</option></select></label>
      <button class="btn primary" type="button" id="runSim">Run the rest of the season</button>
      <span id="lsimStatus" role="status" aria-live="polite"></span>
    </div>
    <p id="lsimStamp">${UI.stamp(result, inp)}</p>
  </section>

  <section class="panel"><h2>${inp.season} World Series and playoff odds</h2>
  <div id="lsimOdds">${UI.oddsTable(result)}</div></section>

  <section class="panel"><h2>Projected final standings</h2>
  <div id="lsimTables" class="lsim-grid">${UI.seasonTables(result)}</div></section>

  ${picks}

  <section class="panel"><h2>One simulated ${inp.season} postseason</h2>
  <div id="lsimBracket">${UI.bracket(result)}</div></section>

  <section class="lsim-copy">
    <h2>How the MLB playoff odds are calculated</h2>
    <p>Every game that is final keeps its real score. The ${remaining} games left are each played out ${H.count(result.runs)} times. A team's strength is its Pythagorean record from the runs it has scored and allowed this season, using the Pythagenpat exponent of 0.287, pulled toward .500 by ${REGRESS_GAMES} games of average play so a hot or cold month does not overstate it. A single game is log5 of the two strengths, with a home field edge worth a .540 home winning rate. No betting line is used.</p>
    <p>After each simulated regular season the ${inp.season} postseason is seeded and played: division winners take seeds 1 to 3 by record, the three best remaining records take 4 to 6, seeds 1 and 2 get a bye, and the Wild Card Series, Division Series, League Championship Series and World Series are played game by game at the correct home parks.</p>
    <h2>Tiebreakers</h2>
    <p>Ties in the standings are settled by head to head record between the tied teams, then by a random draw. MLB's later steps, such as intradivision record, are not applied, and they are listed here rather than approximated.</p>
    <h2>What the odds do not know</h2>
    <p>Run differential says nothing about who is starting tonight, an injured star or a September callup. The odds are as current as the last read of MLB's standings, stamped above in Pacific time.</p>
    <h2 id="faq">MLB Playoff Odds FAQ</h2>
    ${faq.html}
  </section>

  <section class="panel">
    <h2>More MLB simulators</h2>
    <div class="linkgrid">
    <a href="/mlb-simulator/">MLB Simulator<small>Simulate any game pitch by pitch</small></a>
    <a href="/mlb-playoff-simulator/">MLB Playoff Simulator<small>Build and lock your bracket</small></a>
    <a href="/mlb-season-simulator/">MLB Season Simulator<small>Predict the season, track your record</small></a>
    <a href="/handicapping/mlb/">MLB Matchups Today<small>Today's board, game by game</small></a>
    <a href="/nfl-season-simulator/">NFL Season Simulator<small>Football</small></a>
    <a href="/sports-simulators/">All Sports Simulators<small>MLB, NFL, NBA and NHL</small></a>
    </div>
  </section>
</main>
<div class="foot wrap">TrustMyRecord MLB Playoff Odds &middot; a model projection, not betting advice &middot; <a href="${URL}#faq">FAQ</a></div>
<script defer src="/static/js/league-season-engine.js"></script>
<script defer src="/static/js/league-season-sim.js"></script>
<script defer src="/static/js/sim-run-gate.js" data-sport="mlb_odds"></script>
${shell.tail}
</body>
</html>
`);
}

(async () => {
  const inp = await buildInputs();
  const seed = Number(inp.generated_at.slice(0, 10).replace(/-/g, '')) || 1;
  const result = E.project(inp, RUNS, seed);
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, DATA.replace(/^\//, '')), JSON.stringify(inp));
  const out = path.join(ROOT, 'mlb-playoff-odds', 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, page(inp, result, H.shellAssets()));
  const sum = (k) => result.teams.reduce((s, t) => s + t[k], 0);
  console.log(`mlb odds: ${inp.games_final} final, ${inp.schedule.length - inp.games_final} left, playoffs sum ${sum('playoffs').toFixed(2)}, champion sum ${sum('champion').toFixed(3)}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
