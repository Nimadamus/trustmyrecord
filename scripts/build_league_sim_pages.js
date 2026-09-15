#!/usr/bin/env node
/**
 * NBA_NHL_SIM_CLUSTER_20260915 -- bakes the NBA and NHL season simulator and
 * playoff simulator pages, the same cluster that carries MLB's search traffic
 * (/mlb-season-simulator/, /mlb-playoff-simulator/) and that NFL followed with
 * /nfl-playoff-simulator/.
 *
 *   /nba-season-simulator/   /nba-playoff-simulator/
 *   /nhl-season-simulator/   /nhl-playoff-simulator/
 *
 * Every number on the page is computed at build time from the LIVE inputs
 * (/api/{nba,nhl}/public/season-inputs: the league's own 2026-27 schedule and
 * standings feed plus the calibrated game model) with the same engine and the
 * same renderers the browser uses when a visitor presses Run. Nothing is typed
 * by hand: the opener date, the game count, the conferences and divisions and
 * every probability are read or computed here, so a rebuild is always current.
 *
 * It also keeps the two sport hubs pointed at the cluster, between
 * <!--MK:leagueSimCluster--> markers, with the next slate of real games.
 *
 * Usage:  node scripts/build_league_sim_pages.js [--inputs-dir DIR] [--runs N]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const E = require('../static/js/league-season-engine.js');
const UI = require('../static/js/league-season-sim.js');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://trustmyrecord.com';
const API = 'https://trustmyrecord-api.onrender.com/api/';
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const RUNS = Number(argVal('--runs')) || 10000;
const esc = UI.esc;

const LEAGUE = {
  nba: {
    label: 'NBA', games: 82, cup: 'the Stanley Cup', trophy: 'NBA title', finals: 'NBA Finals',
    hub: '/nba-simulator/', archive: '/nba-simulator/results/', unit: 'wins', other: 'nhl',
  },
  nhl: {
    label: 'NHL', games: 84, cup: 'the Stanley Cup', trophy: 'Stanley Cup', finals: 'Stanley Cup Final',
    hub: '/nhl-simulator/', archive: '/nhl-simulator/results/', unit: 'points', other: 'nba',
  },
};

async function inputsFor(sport) {
  const dir = argVal('--inputs-dir');
  if (dir) return JSON.parse(fs.readFileSync(path.join(dir, sport + '.json'), 'utf8'));
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(API + sport + '/public/season-inputs', { signal: AbortSignal.timeout(180000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { last = e; }
  }
  throw last;
}

/* The shell every simulator page shares: design system, nav, session. Read from
   the live NBA hub so a re-hashed stylesheet is picked up on the next build. */
function shellAssets() {
  const hub = fs.readFileSync(path.join(ROOT, 'nba-simulator', 'index.html'), 'utf8');
  const pick = (re) => (hub.match(re) || [''])[0];
  const head = [
    /<link rel="stylesheet" href="\/static\/css\/tmr-sim-arena\.css[^"]*">/,
    /<link rel="stylesheet" href="\/static\/css\/tmr-ds\.[0-9a-f]+\.css">/,
    /<link rel="stylesheet" href="\/static\/css\/tmr-ds-header\.[0-9a-f]+\.css">/,
    /<link rel="stylesheet" href="\/static\/css\/tmr-light-surface\.css[^"]*">/,
    /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2[^"]*">/,
    /<link rel="stylesheet" href="\/static\/css\/tmr-navbar\.css[^"]*">/,
    /<script src="\/static\/js\/tmr-analytics\.js[^"]*"><\/script>/,
    /<script src="\/static\/js\/config\.js[^"]*"><\/script>/,
    /<script src="\/static\/js\/backend-api\.js[^"]*"><\/script>/,
    /<script defer src="\/static\/js\/sim-auth-gate\.js[^"]*"><\/script>/,
  ].map(pick).filter(Boolean);
  const tail = [
    /<script src="\/static\/js\/tmr-session\.[0-9a-f]+\.js"><\/script>/,
    /<script src="\/static\/js\/tmr-ds-nav\.[0-9a-f]+\.js"><\/script>/,
    /<script src="\/static\/js\/tmr-live-chat\.js[^"]*"><\/script>/,
  ].map(pick).filter(Boolean);
  if (head.length < 8 || tail.length < 2) throw new Error('could not read the simulator shell from nba-simulator/index.html');
  return { head: head.join('\n'), tail: tail.join('\n') };
}

function ptDate(iso, withTime) {
  const o = { timeZone: 'America/Los_Angeles', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
  if (withTime) { o.hour = 'numeric'; o.minute = '2-digit'; }
  return new Date(iso).toLocaleString('en-US', o) + (withTime ? ' PT' : '');
}
const pctText = (v) => (v >= 0.995 ? 'better than 99%' : v < 0.005 ? 'under 1%' : Math.round(v * 100) + '%');
const count = (n) => Number(n).toLocaleString('en-US');

function facts(sport, inputs, result) {
  const L = LEAGUE[sport];
  const confs = [...new Set(inputs.teams.map((t) => t.conference))].sort();
  const divs = [...new Set(inputs.teams.map((t) => t.division))].sort();
  const reg = inputs.schedule.filter((g) => g.date);
  const opener = reg[0];
  const openerDay = opener ? opener.date.slice(0, 10) : null;
  const openerGames = opener ? reg.filter((g) => ptDate(g.date) === ptDate(opener.date)) : [];
  const byChamp = result.teams.slice().sort((a, b) => b.champion - a.champion);
  const byPlayoffs = result.teams.slice().sort((a, b) => b.playoffs - a.playoffs);
  const last = reg[reg.length - 1];
  return {
    L, confs, divs, opener, openerDay, openerGames, last,
    teamCount: inputs.teams.length,
    totalGames: sport === 'nba' ? inputs.teams.length * L.games / 2 : inputs.schedule.length,
    scheduled: inputs.schedule.length,
    final: inputs.games_final,
    fav: byChamp[0], fav2: byChamp[1], fav3: byChamp[2],
    bubble: byPlayoffs.filter((t) => t.playoffs > 0.35 && t.playoffs < 0.65),
    builtAt: inputs.model && inputs.model.built_at,
  };
}

const CSS = `
  .lsim-wrap{max-width:1180px}
  .lsim-hero h1{font-size:clamp(1.6rem,3.2vw,2.2rem);margin:0 0 8px;letter-spacing:-.02em}
  .lsim-hero p{max-width:78ch;margin:0 0 8px;color:var(--mut,#9fb0c6)}
  .lsim-run{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0 4px}
  .lsim-run select{font:inherit;padding:8px 10px;border-radius:9px;border:1px solid var(--line,#23324a);background:var(--card,#111a2b);color:inherit}
  .lsim-run .btn{font-weight:800}
  #lsimStatus{font-size:.86rem;color:var(--mut,#9fb0c6)}
  #lsimStamp{font-size:.82rem;color:var(--mut,#9fb0c6);margin:6px 0 0}
  .lsim-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:14px}
  .lsim-card{background:var(--card,#111a2b);border:1px solid var(--line,#23324a);border-radius:14px;padding:12px 14px;min-width:0}
  .lsim-card h3{margin:2px 0 10px;font-size:1rem}
  .lsim-card h3 small{font-weight:600;color:var(--mut,#9fb0c6);font-size:.78rem;margin-left:6px}
  .tscroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
  table.lsim{width:100%;border-collapse:collapse;font-size:.88rem;min-width:520px}
  table.lsim th,table.lsim td{padding:7px 8px;border-bottom:1px solid var(--line,#23324a);text-align:right;white-space:nowrap}
  table.lsim thead th{font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--mut,#9fb0c6);font-weight:700}
  table.lsim th[scope=row],table.lsim thead th:first-child{text-align:left}
  table.lsim td.p{background:rgba(56,189,248,calc(var(--h,0)*.32));font-variant-numeric:tabular-nums}
  table.lsim td.num,table.lsim td.rng{font-variant-numeric:tabular-nums}
  table.lsim td.rng{color:var(--mut,#9fb0c6)}
  .lz{opacity:.45}
  .lt{display:inline-flex;align-items:center;gap:7px}
  a.lt{color:inherit;text-decoration:none}
  a.lt:hover .ln,a.lt:hover .ls{text-decoration:underline}
  .lt img{width:22px;height:22px;object-fit:contain}
  .lt .ls{display:none}
  @media (max-width:640px){.lt .ln{display:none}.lt .ls{display:inline}table.lsim{min-width:0;font-size:.8rem}table.lsim th,table.lsim td{padding:6px 5px}}
  ul.series{list-style:none;margin:0;padding:0}
  ul.series li{padding:6px 0;border-bottom:1px solid var(--line,#23324a);display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  ul.series .sc{margin-left:auto;color:var(--mut,#9fb0c6);font-size:.82rem}
  .champ{display:flex;align-items:center;gap:8px;font-size:1rem;margin:4px 0 12px}
  .champ img{width:30px;height:30px}
  .lsim-copy{max-width:80ch}
  .lsim-copy h2{margin:26px 0 8px}
  .lsim-copy p,.lsim-copy li{line-height:1.65}
  .picks{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:8px;margin:6px 0 12px}
  .pick{display:flex;align-items:center;gap:6px;border:1px solid var(--line,#23324a);border-radius:10px;padding:6px}
  .pick .at{color:var(--mut,#9fb0c6);font-size:.78rem}
  .pk{flex:1;display:flex;align-items:center;gap:6px;font:inherit;font-size:.86rem;background:transparent;color:inherit;border:1px solid transparent;border-radius:8px;padding:6px 8px;cursor:pointer;min-width:0}
  .pk img{width:22px;height:22px}
  .pk small{margin-left:auto;color:var(--mut,#9fb0c6)}
  .pk:hover{border-color:var(--line,#23324a)}
  .pk.on{border-color:#38bdf8;background:rgba(56,189,248,.16);font-weight:700}
  .pk:focus-visible{outline:3px solid #38bdf8;outline-offset:2px}
  .slate{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:8px;margin:8px 0}
  .slate a,.slate div{display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid var(--line,#23324a);border-radius:10px;text-decoration:none;color:inherit;font-size:.88rem}
`;

function faqBlock(items) {
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  const html = items.map(([q, a]) => `<h3>${esc(q)}</h3>\n<p>${esc(a)}</p>`).join('\n');
  return { ld: JSON.stringify(ld), html };
}

function teamLinks(sport) {
  const dir = path.join(ROOT, sport + '-simulator', 'teams');
  if (!fs.existsSync(dir)) return '';
  return fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'index.html'))).sort()
    .map((d) => `<a href="/${sport}-simulator/teams/${d}/">${esc(d.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '))}<small>Team simulator</small></a>`)
    .join('\n    ');
}

function page(sport, mode, inputs, result, shell) {
  const F = facts(sport, inputs, result);
  const L = F.L;
  const nba = sport === 'nba';
  const url = `/${sport}-${mode}-simulator/`;
  const sib = `/${sport}-${mode === 'season' ? 'playoff' : 'season'}-simulator/`;
  const season = inputs.season_label;
  const title = mode === 'season'
    ? `${L.label} Season Simulator ${season} | Projected Standings, Wins and Playoff Odds`
    : `${L.label} Playoff Simulator ${season} | Bracket, Seeds and ${nba ? 'Title' : 'Stanley Cup'} Odds`;
  const h1 = `${L.label} ${mode === 'season' ? 'Season' : 'Playoff'} Simulator`;
  const fav = F.fav, fav2 = F.fav2;
  const openerLine = F.opener ? `The ${season} regular season opens ${ptDate(F.opener.date)}` : `The ${season} schedule is not published yet`;
  const desc = mode === 'season'
    ? `Simulate the ${season} ${L.label} season ${count(result.runs)} times: projected ${L.unit} for all ${F.teamCount} teams, the 80% range, ${nba ? 'top six, play-in' : 'division title'} and playoff odds, from the real ${L.games} game schedule.`
    : `Simulate the ${season} ${L.label} playoffs ${count(result.runs)} times: ${nba ? 'the play-in tournament, ' : 'wild cards, '}seeds, every series best of seven and each team's odds to win ${nba ? 'the NBA title' : 'the Stanley Cup'}.`;

  const formatNba = `<p>Each conference sends six teams straight to the playoffs. The teams that finish seventh through tenth play the play-in tournament: seven hosts eight and the winner takes the 7 seed, nine hosts ten and the loser goes home, and the loser of seven against eight hosts the winner of nine against ten for the 8 seed. The first round is 1 against 8, 4 against 5, 2 against 7 and 3 against 6, the bracket stays fixed, and every series is best of seven with home court to the team with the better regular season record, played at the higher seed in games one, two, five and seven.</p>`;
  const formatNhl = `<p>Teams earn two points for a win and one for a loss in overtime or a shootout. The top three teams in each of the ${F.divs.length} divisions make the playoffs, and the next two teams in each conference by points take the wild cards. The division winner with more points plays the second wild card, the other division winner plays the first, and the second and third place teams in each division meet. The bracket stays inside the division through the second round, and every series is best of seven with home ice to the team with more points.</p>`;

  const howNba = `<p>Every game on the ${season} schedule is played out ${count(result.runs)} times. A game that is already final keeps its real result. Every other game is decided by the same calibrated win probability the <a href="${L.hub}">NBA Simulator</a> reports for that matchup: team strength solved from three seasons of results against the schedule each team actually played, a home court edge, and a calibration fitted on seasons the model never trained on.</p>
<p>The league publishes ${count(Math.round(F.scheduled * 2 / F.teamCount))} games per team in advance. The last two for each team are set in December once the NBA Cup group stage is decided, so the simulator plays those two against conference opponents until the league names them.</p>`;
  const howNhl = `<p>Every game on the ${season} schedule is played out ${count(result.runs)} times. A game that is already final keeps its real result, including whether it went past regulation. Every other game is decided by the same calibrated win probability the <a href="${L.hub}">NHL Simulator</a> reports for that matchup, and by how often that matchup reaches overtime, because the team that loses in overtime or a shootout still takes a point.</p>
<p>The ${season} season is ${L.games} games per team, ${count(F.scheduled)} games in all, and every one of them is on the schedule the simulator reads.</p>`;

  const tiebreak = nba
    ? `<p>Ties in the standings are settled by head to head winning percentage between the tied teams, then by a random draw. The NBA's later steps, division record, conference record and record against playoff teams, are not applied. Across thousands of simulated seasons they change a seed rarely, and they are listed here rather than approximated.</p>`
    : `<p>Ties in points are settled by regulation wins, then by points in the games between the tied teams, then by a random draw. The NHL's later steps, such as goal differential, are not applied, and they are listed here rather than approximated.</p>`;

  const limits = `<p>The model rates teams on results already played. A trade, a signing or an injury changes a team's rating only once games are played with it, so early in the season a team that rebuilt over the summer is rated on the roster it had. The win probability for a game in March does not know rest, back to backs or ${nba ? 'who sits' : 'the starting goalie'} that night. The model data was last built ${F.builtAt ? ptDate(F.builtAt, true) : 'recently'}.</p>`;

  const lead = mode === 'season'
    ? `<p>${esc(openerLine)}. Across ${count(result.runs)} simulated seasons the ${esc(fav.name)} ${nba ? `average ${UI_one(fav.wins_mean)} wins` : `average ${UI_one(fav.points_mean)} points`} and finish as champions ${pctText(fav.champion)} of the time, ahead of the ${esc(fav2.name)} at ${pctText(fav2.champion)}. Press Run to play a fresh set of seasons from today's schedule and results.</p>`
    : `<p>${esc(openerLine)}. Across ${count(result.runs)} simulated postseasons the ${esc(fav.name)} ${nba ? 'win the NBA title' : 'win the Stanley Cup'} ${pctText(fav.champion)} of the time and reach the ${esc(L.finals)} ${pctText(fav.final)} of the time. Below the odds is one complete simulated bracket, series by series. Press Run for a new set.</p>`;

  const faqs = mode === 'season' ? [
    [`How does the ${L.label} season simulator work?`, `It plays every game on the ${season} ${L.label} schedule ${count(result.runs)} times. Final games keep their real results and every other game is decided by the calibrated win probability from the TrustMyRecord ${L.label} game model, then the standings, seeds and playoffs are played out for each simulated season.`],
    [`How many games are in the ${season} ${L.label} season?`, nba ? `Each NBA team plays 82 games. The league publishes 80 per team in advance and adds two per team in December after the NBA Cup group stage.` : `Each NHL team plays 84 games in ${season}, ${count(F.scheduled)} games in all.`],
    [`What does the 80% range mean?`, `Eight of every ten simulated seasons land inside it. The other two fall above or below. It shows how much a team's ${L.unit} can swing on the same schedule and the same ratings.`],
    [`Does the simulator update during the season?`, `Yes. Each time the page is rebuilt it reads the schedule and every final result again, so completed games stop being simulated and the projection narrows as the season goes on.`],
    [`Is it free?`, `The published projection is free to read with no account. Running your own set of seasons needs a free account and uses the daily free simulator run.`],
  ] : [
    [`How does the ${L.label} playoff simulator work?`, `It plays out the rest of the ${season} regular season, seeds each conference with the real ${L.label} format, ${nba ? 'plays the play-in tournament, ' : ''}and then plays every series game by game, best of seven, with home ${nba ? 'court' : 'ice'} to the better regular season team. It repeats that ${count(result.runs)} times and counts how often each team reaches each round.`],
    [nba ? 'How is the NBA play-in tournament simulated?' : 'How are the NHL wild cards decided?', nba ? `Seven hosts eight for the 7 seed, nine hosts ten to stay alive, and the loser of seven against eight hosts the winner of nine against ten for the 8 seed. Each game uses the same win probability as any other game between those teams at that arena.` : `After the top three teams in each division, the next two teams in each conference by points are the wild cards. The division winner with more points plays the second wild card.`],
    [`Who is favored to win ${nba ? 'the NBA title' : 'the Stanley Cup'}?`, `In the current projection the ${fav.name} win it ${pctText(fav.champion)} of the time, ahead of the ${fav2.name} at ${pctText(fav2.champion)}. Those numbers move as results come in.`],
    [`Why does the simulated bracket change each time?`, `A single bracket is one season out of thousands. The odds table is the summary of all of them; the bracket shows what one of those seasons looked like.`],
    [`Is it free?`, `The published odds and bracket are free to read with no account. Running your own set needs a free account and uses the daily free simulator run.`],
  ];
  const faq = faqBlock(faqs);

  const sportName = nba ? 'NBA' : 'NHL';
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: `TrustMyRecord ${h1}`, applicationCategory: 'SportsApplication',
      operatingSystem: 'Web', url: SITE + url, description: desc, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      dateModified: inputs.generated_at },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Sports Simulators', item: SITE + '/sports-simulators/' },
      { '@type': 'ListItem', position: 3, name: `${sportName} Simulator`, item: SITE + L.hub },
      { '@type': 'ListItem', position: 4, name: h1, item: SITE + url }] },
  ];

  const body = mode === 'season'
    ? `<section class="panel"><h2>Projected ${season} ${sportName} standings</h2>
  <div id="lsimTables" class="lsim-grid">${UI.seasonTables(result)}</div></section>`
    : `<section class="panel"><h2>${season} ${sportName} playoff odds</h2>
  <div id="lsimOdds">${UI.oddsTable(result)}</div></section>
  <section class="panel"><h2>One simulated ${season} postseason</h2>
  <div id="lsimBracket">${UI.bracket(result)}</div></section>`;

  const picks = pickPanel(sport, inputs);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<!-- NBA_NHL_SIM_CLUSTER_20260915. Baked by scripts/build_league_sim_pages.js. Do not edit by hand. -->
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${url}" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(h1)} ${esc(season)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${SITE}${url}" />
<meta property="og:site_name" content="TrustMyRecord" />
<meta property="og:image" content="${SITE}/static/og/og-home.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(h1)} ${esc(season)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${SITE}/static/og/og-home.png" />
<link rel="icon" type="image/png" href="/static/favicon.png">
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n')}
<script type="application/ld+json">${faq.ld}</script>
<script>window.SIM_GATE_FLAGS = { gate: true, resume: true, autoSave: false, meter: true };</script>
${shell.head}
<style>${CSS}</style>
</head>
<body class="tmr-ds-shell tmr-ds--dark">
<main class="wrap lsim-wrap" id="lsim" data-sport="${sport}" data-mode="${mode}">
  <nav class="simcrumb" aria-label="Breadcrumb" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:.8rem;margin:0 0 14px;opacity:.85;">
    <a href="/" style="color:inherit;text-decoration:none;">Home</a><span aria-hidden="true" style="opacity:.45;">&rsaquo;</span>
    <a href="/sports-simulators/" style="color:inherit;text-decoration:none;">Sports Simulators</a><span aria-hidden="true" style="opacity:.45;">&rsaquo;</span>
    <a href="${L.hub}" style="color:inherit;text-decoration:none;">${sportName} Simulator</a><span aria-hidden="true" style="opacity:.45;">&rsaquo;</span>
    <span aria-current="page" style="font-weight:600;">${esc(h1)}</span>
  </nav>
  <section class="hero lsim-hero">
    <h1>${esc(h1)}</h1>
    ${lead}
    <div class="lsim-run">
      <label>Seasons <select id="lsimRuns"><option value="1000">1,000</option><option value="2000" selected>2,000</option><option value="5000">5,000</option><option value="10000">10,000</option></select></label>
      <button class="btn primary" type="button" id="runSim">Run ${mode === 'season' ? 'the season' : 'the playoffs'}</button>
      <span id="lsimStatus" role="status" aria-live="polite"></span>
    </div>
    <p id="lsimStamp">${UI.stamp(result, inputs)}</p>
  </section>

  ${body}

  ${picks}

  <section class="lsim-copy">
    <h2>How the ${sportName} ${mode} simulator works</h2>
    ${nba ? howNba : howNhl}
    <h2>The ${season} ${sportName} playoff format</h2>
    ${nba ? formatNba : formatNhl}
    <h2>Tiebreakers</h2>
    ${tiebreak}
    <h2>What the projection does not know</h2>
    ${limits}

    <h2 id="faq">${esc(h1)} FAQ</h2>
    ${faq.html}
  </section>

  <section class="panel">
    <h2>More ${sportName} simulators</h2>
    <div class="linkgrid">
    <a href="${L.hub}">${sportName} Simulator<small>Simulate any game with a full box score</small></a>
    <a href="${sib}">${sportName} ${mode === 'season' ? 'Playoff' : 'Season'} Simulator<small>${mode === 'season' ? 'Seeds, bracket and title odds' : 'Projected standings and wins'}</small></a>
    <a href="${L.archive}">${sportName} Simulation Results<small>Archived simulations</small></a>
    <a href="/${L.other}-${mode}-simulator/">${LEAGUE[L.other].label} ${mode === 'season' ? 'Season' : 'Playoff'} Simulator<small>The same tool for the ${LEAGUE[L.other].label}</small></a>
    <a href="/mlb-${mode}-simulator/">MLB ${mode === 'season' ? 'Season' : 'Playoff'} Simulator<small>Baseball</small></a>
    <a href="/nfl-playoff-simulator/">NFL Playoff Simulator<small>Football</small></a>
    <a href="/sports-simulators/">All Sports Simulators<small>MLB, NFL, NBA and NHL</small></a>
    </div>
  </section>
  <section class="panel">
    <h2>Simulate a single ${sportName} team</h2>
    <div class="linkgrid">
    ${teamLinks(sport)}
    </div>
  </section>
</main>
<div class="foot wrap">TrustMyRecord ${esc(h1)} &middot; a model projection, not betting advice &middot; <a href="${url}#faq">FAQ</a></div>
<script defer src="/static/js/league-season-engine.js"></script>
<script defer src="/static/js/league-season-sim.js"></script>
<script defer src="/static/js/sim-run-gate.js" data-sport="${sport}_${mode}"></script>
${shell.tail}
</body>
</html>
`;
}

function UI_one(v) { return (Math.round(v * 10) / 10).toFixed(1); }

/* PICK THE NEXT GAMES, the NFL Playoff Simulator's interaction for NBA and NHL.
   The next three game days that are not final, each game with the model's win
   probability for both sides. A visitor taps a winner; Run then plays every
   season with that result fixed (engine opts.forced) and the picks are kept on
   the device. Server rendered, so the matchups and probabilities are crawlable. */
function pickPanel(sport, inputs) {
  const L = LEAGUE[sport];
  const now = Date.now();
  const open = inputs.schedule.filter((g) => !g.final && Date.parse(g.date) >= now - 6 * 3600e3);
  const days = [];
  for (const g of open) {
    const day = ptDate(g.date);
    if (days.indexOf(day) < 0) { if (days.length === 3) break; days.push(day); }
  }
  const team = (a) => inputs.teams.find((t) => t.espn_abbr === a);
  const img = (t) => (t && t.logo ? `<img src="${esc(t.logo)}" alt="" width="22" height="22" loading="lazy">` : '');
  const rows = days.map((day) => {
    const games = open.filter((g) => ptDate(g.date) === day).slice(0, 16).map((g) => {
      const h = team(g.home), a = team(g.away);
      const cell = inputs.matchups[g.home] && inputs.matchups[g.home][g.away];
      if (!h || !a || !cell) return '';
      const ph = Math.round(cell.p * 100);
      return `<div class="pick" data-game="${esc(g.id)}">
        <button type="button" class="pk" data-side="away" aria-pressed="false">${img(a)}<span>${esc(a.short)}</span><small>${100 - ph}%</small></button>
        <span class="at">at</span>
        <button type="button" class="pk" data-side="home" aria-pressed="false">${img(h)}<span>${esc(h.short)}</span><small>${ph}%</small></button>
      </div>`;
    }).join('');
    return games ? `<h3>${esc(day)}</h3><div class="picks">${games}</div>` : '';
  }).join('');
  if (!rows) return '';
  return `<section class="panel" id="lsimPicks">
    <h2>Pick the next ${L.label} games</h2>
    <p class="small">Tap the team you think wins. The percentage is the model's win probability for that side. Your picks stay on this device, and the next Run plays every season with those results locked in. <span id="lsimPickCount"></span> <button type="button" class="btn" id="lsimClearPicks" hidden>Clear picks</button></p>
    ${rows}
  </section>`;
}

/* The hub block: links to the cluster plus the next real slate. */
function hubBlock(sport, inputs) {
  const L = LEAGUE[sport];
  const now = Date.now();
  const upcoming = inputs.schedule.filter((g) => !g.final && Date.parse(g.date) >= now - 6 * 3600e3);
  const first = upcoming[0];
  const day = first ? ptDate(first.date) : null;
  const games = first ? upcoming.filter((g) => ptDate(g.date) === day).slice(0, 15) : [];
  const name = (a) => (inputs.teams.find((t) => t.espn_abbr === a) || {}).name || a;
  const hp = (g) => { const c = inputs.matchups[g.home] && inputs.matchups[g.home][g.away]; return c ? ` <small>${esc(name(g.home))} ${Math.round(c.p * 100)}%</small>` : ''; };
  const slate = games.map((g) => `<div>${esc(name(g.away))} at ${esc(name(g.home))}${hp(g)}</div>`).join('');
  return `<!--MK:leagueSimCluster-->
  <section class="panel" id="seasonPlayoffSims">
    <h2>${L.label} season and playoff simulators</h2>
    <div class="linkgrid">
      <a href="/${sport}-season-simulator/">${L.label} Season Simulator<small>Projected ${inputs.season_label} standings and ${L.unit}</small></a>
      <a href="/${sport}-playoff-simulator/">${L.label} Playoff Simulator<small>${sport === 'nba' ? 'Play-in, seeds and title odds' : 'Wild cards, bracket and Stanley Cup odds'}</small></a>
    </div>
    ${slate ? `<h3>Next ${L.label} games, ${esc(day)}</h3><div class="slate" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:8px">${slate}</div>` : ''}
  </section>
  <!--/MK:leagueSimCluster-->`;
}

function patchHub(sport, inputs) {
  const file = path.join(ROOT, sport + '-simulator', 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  const block = hubBlock(sport, inputs);
  const re = /<!--MK:leagueSimCluster-->[\s\S]*?<!--\/MK:leagueSimCluster-->/;
  if (re.test(html)) html = html.replace(re, block);
  else html = html.replace(/(<div id="result"><\/div>)/, `$1\n  ${block}`);
  if (!re.test(html)) throw new Error(`${sport} hub: no place for the cluster block`);
  fs.writeFileSync(file, html);
}

/* Each existing team simulator page gets that club's own season projection,
   between <!--MK:leagueSimTeam--> markers, linking into the cluster. Real,
   per club numbers, so no two blocks read alike. A page missing from disk is
   skipped, never created here. */
function slugOf(name) {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function patchTeams(sport, inputs, result) {
  const L = LEAGUE[sport];
  const re = /<!--MK:leagueSimTeam-->[\s\S]*?<!--\/MK:leagueSimTeam-->\s*/;
  let n = 0;
  for (const t of result.teams) {
    const file = path.join(ROOT, sport + '-simulator', 'teams', slugOf(t.name), 'index.html');
    if (!fs.existsSync(file)) continue;
    let html = fs.readFileSync(file, 'utf8');
    const nick = t.short || t.name;
    const line = sport === 'nba'
      ? `Across ${count(result.runs)} simulated ${esc(inputs.season_label)} seasons the ${esc(t.name)} average ${UI_one(t.wins_mean)} wins, and eight of every ten seasons land between ${t.wins_p10} and ${t.wins_p90}. They finish in the top six of the ${esc(t.conference)} Conference ${pctText(t.direct)} of the time, make the playoffs ${pctText(t.playoffs)} of the time, reach the NBA Finals ${pctText(t.final)} and win the title ${pctText(t.champion)}.`
      : `Across ${count(result.runs)} simulated ${esc(inputs.season_label)} seasons the ${esc(t.name)} average ${UI_one(t.points_mean)} points, and eight of every ten seasons land between ${t.points_p10} and ${t.points_p90}. They win the ${esc(t.division)} Division ${pctText(t.division_title)} of the time, make the playoffs ${pctText(t.playoffs)}, reach the Stanley Cup Final ${pctText(t.final)} and win the Cup ${pctText(t.champion)}.`;
    const block = `<!--MK:leagueSimTeam-->
  <section class="panel">
    <h2>${esc(nick)} ${esc(inputs.season_label)} season projection</h2>
    <p>${line}</p>
    <div class="linkgrid">
      <a href="/${sport}-season-simulator/">${L.label} Season Simulator<small>All ${inputs.teams.length} teams, projected</small></a>
      <a href="/${sport}-playoff-simulator/">${L.label} Playoff Simulator<small>Every team's odds, round by round</small></a>
    </div>
  </section>
  <!--/MK:leagueSimTeam-->
  `;
    if (re.test(html)) html = html.replace(re, block);
    else {
      const first = html.indexOf('<section class="panel">');
      const second = first >= 0 ? html.indexOf('<section class="panel">', first + 10) : -1;
      if (second < 0) continue;
      html = html.slice(0, second) + block + html.slice(second);
    }
    fs.writeFileSync(file, html);
    n++;
  }
  return n;
}

/* Each existing matchup page (/nba-simulator/76ers-vs-celtics/) gets the two
   clubs' season projections and their real meetings on the 2026-27 schedule,
   between <!--MK:leagueSimMatchup--> markers. Placed before the "More matchups"
   list. A slug that does not resolve to two clubs is skipped. */
function patchMatchups(sport, inputs, result) {
  const L = LEAGUE[sport];
  const byShort = new Map(result.teams.map((t) => [slugOf(t.short || t.name), t]));
  const dir = path.join(ROOT, sport + '-simulator');
  const re = /<!--MK:leagueSimMatchup-->[\s\S]*?<!--\/MK:leagueSimMatchup-->\s*/;
  let n = 0;
  for (const d of fs.readdirSync(dir)) {
    const m = d.match(/^(.+)-vs-(.+)$/);
    const file = path.join(dir, d, 'index.html');
    if (!m || !fs.existsSync(file)) continue;
    const a = byShort.get(m[1]), h = byShort.get(m[2]);
    if (!a || !h) continue;
    const meets = inputs.schedule.filter((g) => (g.home === a.abbr && g.away === h.abbr) || (g.home === h.abbr && g.away === a.abbr));
    const proj = (t) => sport === 'nba'
      ? `the ${esc(t.name)} average ${UI_one(t.wins_mean)} wins, make the playoffs ${pctText(t.playoffs)} of the time and win the title ${pctText(t.champion)}`
      : `the ${esc(t.name)} average ${UI_one(t.points_mean)} points, make the playoffs ${pctText(t.playoffs)} of the time and win the Stanley Cup ${pctText(t.champion)}`;
    const list = meets.map((g) => {
      const home = g.home === a.abbr ? a : h, away = home === a ? h : a;
      const res = g.final && g.home_score != null ? ` <small>final ${g.away_score} to ${g.home_score}</small>` : '';
      return `<li>${esc(ptDate(g.date))}: ${esc(away.short)} at ${esc(home.short)}${res}</li>`;
    }).join('');
    let html = fs.readFileSync(file, 'utf8');
    const block = `<!--MK:leagueSimMatchup-->
  <h2>${esc(a.short)} and ${esc(h.short)} in the ${esc(inputs.season_label)} season</h2>
  <p>Across ${count(result.runs)} simulated ${esc(inputs.season_label)} seasons ${proj(a)}. Over the same seasons ${proj(h)}.</p>
  ${meets.length ? `<p>They meet ${meets.length === 1 ? 'once' : meets.length + ' times'} on the ${esc(inputs.season_label)} regular season schedule:</p>
  <ul>${list}</ul>` : ''}
  <div class="linkgrid">
    <a href="/${sport}-season-simulator/">${L.label} Season Simulator<small>Every team's projected ${L.unit}</small></a>
    <a href="/${sport}-playoff-simulator/">${L.label} Playoff Simulator<small>Every team's odds, round by round</small></a>
  </div>
  <!--/MK:leagueSimMatchup-->
  `;
    if (re.test(html)) html = html.replace(re, block);
    else {
      const hit = new RegExp('<hr class="divider" />' + String.fromCharCode(92) + 's*<h2>More ' + L.label + ' matchups').exec(html);
      if (!hit) continue;
      html = html.slice(0, hit.index) + block + html.slice(hit.index);
    }
    fs.writeFileSync(file, html);
    n++;
  }
  return n;
}

module.exports = { shellAssets, CSS, faqBlock, ptDate, pctText, count, slugOf, esc, UI_one };

if (require.main === module) (async () => {
  const shell = shellAssets();
  for (const sport of ['nba', 'nhl']) {
    const inputs = await inputsFor(sport);
    if (!inputs.teams || inputs.teams.length < 30 || !inputs.schedule || inputs.schedule.length < 1000) {
      throw new Error(`${sport}: inputs look incomplete (${(inputs.teams || []).length} teams, ${(inputs.schedule || []).length} games); nothing written`);
    }
    // A stable seed per day: a rebuild the same day bakes the same numbers.
    const seed = Number(String(inputs.generated_at || '').slice(0, 10).replace(/-/g, '')) || 1;
    const result = E.project(inputs, RUNS, seed);
    for (const mode of ['season', 'playoff']) {
      const out = path.join(ROOT, `${sport}-${mode}-simulator`, 'index.html');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, page(sport, mode, inputs, result, shell));
      console.log(`wrote ${path.relative(ROOT, out)}`);
    }
    patchHub(sport, inputs);
    console.log(`${sport}: ${patchTeams(sport, inputs, result)} team pages carry the projection`);
    console.log(`${sport}: ${patchMatchups(sport, inputs, result)} matchup pages carry both projections`);
    console.log(`patched ${sport}-simulator/index.html`);
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
