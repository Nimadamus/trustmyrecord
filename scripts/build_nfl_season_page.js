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
const SIMUX = require('./sim-ux.js');   // SIM_UX_20261030: shared UX layer on every sim page
const path = require('path'); const RUN_POLICY = require('./sim-run-policy.js');   // SIM_RUN_POLICY_20261030
const N = require('../static/js/nfl-season-project.js');
const H = require('./build_league_sim_pages.js');
const E = require('../static/js/nfl-playoff-engine.js');
const PK = require('../static/js/nfl-season-picks.js');   // NFL_SEASON_PICKS_20261030
const PB = require('../static/js/playoff-bracket.js');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://trustmyrecord.com';
const URL = '/nfl-season-simulator/';
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const RUNS = Number(argVal('--runs')) || 10000;
const esc = H.esc;

/* The bake commit skips CI, so the page pins its own asset versions (the same 12
   characters CI pins), never an unversioned script a browser could hold for hours. */
function assetV(rel) {
  let bytes;
  try { bytes = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { bytes = fs.readFileSync(path.join(ROOT, rel)); }
  return crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
}

/* NFL_SEASON_PICKS_20261030: the pick the games panel, the playoff picture the picks
   produce and the bracket. Markup comes from static/js/nfl-season-picks.js, the same
   code that redraws it in the browser, so hydrating moves nothing. */
function picksPanels(d, result) {
  const weeks = PK.openWeeks(d);
  if (!weeks.length) return { picks: '', picture: '', data: '' };
  const view = { week: weeks[0], team: null };
  const weekBtns = weeks.map((w) => `<button type="button" class="wkb${w === view.week ? ' on' : ''}" data-week="${w}" aria-pressed="${w === view.week ? 'true' : 'false'}" aria-label="Week ${w}">${w}</button>`).join('');
  const teamOpts = d.teams.slice().sort((a, b) => (a.name < b.name ? -1 : 1)).map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  const picks = `<section class="panel" id="nflPicks">
    <h2>Pick the games</h2>
    <p class="small">Tap the team you think wins any remaining game, week by week or one club at a time. The percentage is the model's win probability for that side. The playoff picture and bracket below redraw from your picks with the NFL tiebreakers, and Run plays every simulated season with your results locked in. Your picks stay on this device; Copy link shares them.</p>
    <div class="nsp-bar"><span class="nsp-lbl">Week</span><div class="nsp-weeks" id="nspWeeks">${weekBtns}</div></div>
    <div class="nsp-bar"><label class="nsp-lbl" for="nspTeam">Or one club</label><select id="nspTeam"><option value="">All games in the week</option>${teamOpts}</select></div>
    <div class="picks" id="nspGames">${PK.gamesHtml(d, view, {})}</div>
    <div class="nsp-bar nsp-act">
      <button type="button" class="btn primary" data-nsp="run">Run the season with my picks</button>
      <button type="button" class="btn" data-nsp="favweek">Model favorites for this view</button>
      <button type="button" class="btn" data-nsp="fav">Model favorites for every game</button>
      <button type="button" class="btn" data-nsp="clear">Clear picks</button>
      <button type="button" class="btn" data-nsp="share" disabled title="Pick at least one game to get a link to your picks">Copy link</button>
    </div>
    <p class="small" role="status" aria-live="polite"><span id="nspCount">No games picked yet.</span> <span id="nspLinkMsg"></span></p>
    <p class="small dim">${esc(RUN_POLICY.INLINE)}</p>
  </section>`;
  const now = E.seedAll(d.teams, d.games, {}, null);
  const fit = E.fitRatings(d.teams, d.games);
  let bracket = '';
  if (now.AFC.seeds.length === 7 && now.NFC.seeds.length === 7) {
    const cfg = { league: 'nfl', season: String(d.season), key: 'tmr-nfl-season-bracket-' + d.season, confs: ['AFC', 'NFC'], trophy: 'Super Bowl', teams: {},
      seeds: { AFC: now.AFC.seeds.slice(), NFC: now.NFC.seeds.slice() }, prob: { r: fit.r, hfa: fit.hfa } };
    const W = {}; result.teams.forEach((t) => { W[t.id] = t.wins_mean; });
    d.teams.forEach((t) => { cfg.teams[t.id] = { n: t.name, s: t.nickname || t.name, l: `https://a.espncdn.com/i/teamlogos/nfl/500/${String(t.id).toLowerCase()}.png`, c: t.conference, d: t.conference + ' ' + t.division, r: Math.round((W[t.id] || 0) * 10) / 10 }; });
    bracket = `<h3 class="nsp-h3">The bracket</h3>
    <p class="small">Seeded from the standings above. Click a team to advance it; every round after the wild card reseeds, as the league does. The percentage beside each club is its chance in that game from strengths fitted to the model's own game probabilities (home field to the better seed, none in the Super Bowl).</p>
    ${PB.widget(cfg, { seeds: cfg.seeds, picks: {} })}`;
  }
  const picture = `<section class="panel" id="nflPicture">
    <h2>Playoff picture with your picks</h2>
    <p class="small" id="nspNote">${esc(PK.noteText(d, {}))}</p>
    <div class="lsim-grid" id="nspSeeds">${PK.seedsHtml(d, {})}</div>
    ${bracket}
  </section>`;
  const compact = { season: d.season,
    teams: d.teams.map((t) => ({ id: t.id, name: t.name, nickname: t.nickname, conference: t.conference, division: t.division })),
    games: d.games.map((g) => {
      const o = { id: g.id, week: g.week, home: g.home, away: g.away, completed: !!g.completed };
      if (g.completed) { o.home_score = g.home_score; o.away_score = g.away_score; } else if (typeof g.home_win_prob === 'number') o.home_win_prob = Math.round(g.home_win_prob * 10000) / 10000;
      return o;
    }) };
  return { picks, picture, data: `<script type="application/json" id="nflSeasonData">${JSON.stringify(compact).replace(/</g, '\\u003c')}</script>` };
}

const PICK_CSS = `
  .nsp-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0}
  .nsp-lbl{font-size:.8rem;color:var(--mut,#9fb0c6);min-width:72px}
  .nsp-weeks{display:flex;flex-wrap:wrap;gap:6px}
  .wkb{font:inherit;font-size:.85rem;min-width:36px;min-height:36px;border:1px solid var(--line,#23324a);border-radius:8px;background:transparent;color:inherit;cursor:pointer}
  .wkb.on{border-color:#38bdf8;background:rgba(56,189,248,.16);font-weight:700}
  .wkb:focus-visible{outline:3px solid #38bdf8;outline-offset:2px}
  #nspTeam{font:inherit;font-size:.9rem;max-width:100%;min-height:36px;background:var(--card,#111a2b);color:inherit;border:1px solid var(--line,#23324a);border-radius:8px;padding:4px 8px}
  .nsp-act .btn{min-height:40px}
  .nsp-act .btn:disabled{opacity:.5;cursor:not-allowed}
  .pick .wkc{font-size:.72rem;color:var(--mut,#9fb0c6);min-width:28px}
  .pick.fin{opacity:.75}
  .pk:disabled{cursor:default}
  .nsp td.cm{font-size:.8rem;white-space:nowrap}
  .nsp td.cm.in{color:#4ade80;font-weight:700}
  .nsp td.cm.out{color:#f87171;font-weight:700}
  .nsp-h3{margin:18px 0 6px}
  #nflPicture .pb{margin-top:8px}
  @media (max-width:520px){.nsp .sp{display:none}}`;

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
  const P = picksPanels(d, result);
  const played = d.games.length - result.open;
  const byWins = result.teams.slice().sort((a, b) => b.wins_mean - a.wins_mean);
  const top = byWins[0], second = byWins[1];
  const weeks = [...new Set(d.games.map((g) => g.week))].sort((a, b) => a - b);
  const nextWeek = (d.games.find((g) => !g.completed) || {}).week;
  const slate = d.games.filter((g) => g.week === nextWeek);
  const team = (id) => d.teams.find((t) => t.id === id) || { name: id };
  const title = `NFL Season Simulator ${season} | Standings and Season Predictor`;
  const desc = `Simulate the rest of the ${season} NFL season ${H.count(result.runs)} times for projected wins, an 80% range and division standings for all 32 teams. A season predictor from the games already played.`;
  const lead = `<p>${played ? `${played} of ${d.games.length} regular season games are final.` : `The ${season} regular season has not kicked off.`} Across ${H.count(result.runs)} simulated seasons the ${esc(top.name)} average ${H.UI_one(top.wins_mean)} wins and the ${esc(second.name)} ${H.UI_one(second.wins_mean)}. Every season is seeded with the same NFL tiebreakers as the <a href="/nfl-playoff-simulator/">NFL Playoff Simulator</a>. Press Run to play a fresh set from the latest results.</p>`;
  const faqs = [
    ['How does the NFL season simulator work?', `It plays every remaining game on the ${season} NFL schedule ${H.count(result.runs)} times. Games already played keep their real result, every other game is decided by that game's own win probability from the TrustMyRecord NFL model, adjusted by a team strength shift drawn once per simulated season, and each simulated season is seeded with the NFL's tiebreakers.`],
    ['What does the 80% range mean?', 'Eight of every ten simulated seasons land inside it. It shows how far a team’s win total can swing on the same schedule, including the chance that the team is stronger or weaker than the model rates it. Tested on the 2019 to 2025 seasons, it covers the real win total about as often as it claims.'.replace('’', "'")],
    ['Which tiebreakers does it use?', 'Head to head, division record, common games, conference record, strength of victory, strength of schedule and the points based steps, in the league’s order. Best net touchdowns and the coin toss cannot be computed from the data held, and a tie that reaches them is left tied rather than guessed.'.replace('’', "'")],
    ['Does it update during the season?', 'Yes. Each rebuild reads the schedule, every final score and the model’s probabilities again, so played games stop being simulated and the ranges narrow week by week.'.replace('’', "'")],
    ['Is it free?', RUN_POLICY.faqAnswer(RUN_POLICY.READ_FREE_SEASON)],
    ['Is this an NFL season predictor?', 'Yes. It is the season predictor and standings simulator for the current NFL season. It replays every remaining game and reports projected wins and division standings for all 32 teams.'],
    ['Can I pick the games myself?', 'Yes. Pick a winner for any remaining game, week by week or one club at a time. The standings, seeds and bracket redraw from your picks with the NFL tiebreakers, Run plays every simulated season with your results locked in, and Copy link gives you a link to exactly those picks. Picking is always free; a Run counts as a simulator run.'],
  ];
  const faq = H.faqBlock(faqs);
  // SIM_DATE_MODIFIED_20261030: the date moves only when a final or a printed projection moves.
  const DM = require('./sim-date-modified.js');
  const dm = DM.resolve(path.join(ROOT, 'nfl-season-simulator', 'index.html'), {
    finals: d.games.filter((g) => g.completed).map((g) => [g.id, g.home, g.away, g.home_score, g.away_score]),
    proj: DM.rounded(result.teams.map((t) => [t.id, t.wins_mean, t.wins_p10, t.wins_p90, t.division_title * 100, t.playoffs * 100]), 1),
  }, d.generated_at);
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'TrustMyRecord NFL Season Simulator', applicationCategory: 'SportsApplication',
      operatingSystem: 'Web', url: SITE + URL, description: desc, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, dateModified: dm.date },
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
${dm.marker}
<script>window.SIM_GATE_FLAGS = { gate: true, resume: true, autoSave: false, meter: true };</script>
${shell.head}
<style>${H.CSS}${PICK_CSS}</style>
<link rel="stylesheet" href="/static/css/tmr-playoff-bracket.css?v=${assetV('static/css/tmr-playoff-bracket.css')}">
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
      <label>Seasons <select id="lsimRuns"><option value="1000">1,000</option><option value="2000">2,000</option><option value="5000">5,000</option><option value="10000" selected>10,000</option></select></label>
      <button class="btn primary" type="button" id="runSim">Run the season</button>
      <span id="lsimStatus" role="status" aria-live="polite"></span>
    </div>
    <p id="lsimStamp">${N.stamp(result, d)}</p>
  </section>

  <section class="panel"><h2>Projected ${season} NFL standings</h2>
  <div id="lsimTables" class="lsim-grid">${N.tables(result)}</div></section>

  ${P.picks}
  ${P.picture}

  <section class="lsim-copy">
    <h2>How the NFL season simulator works</h2>
    <p>The ${season} regular season is ${weeks.length} weeks and ${d.games.length} games, 17 per team. Every game that has been played keeps its real score. Every game that has not is played out ${H.count(result.runs)} times, each time decided by that game's own home win probability from the TrustMyRecord NFL model, the drive level model behind the <a href="/nfl-simulator/">NFL Simulator</a>, trained on the ${esc(String(d.model && d.model.train_season_min))} to ${esc(String(d.model && d.model.train_season_max))} seasons and held out on ${esc(String(d.model && d.model.holdout_season))}.</p>
    <p>Each simulated season also includes team strength uncertainty. Nobody knows exactly how good a team is, so every simulated season draws one strength shift per team and plays all of that team's remaining games with it: in some seasons a club is better than rated all year, in others worse. The size of that shift was fitted on the 2019 to 2025 seasons, replaying each one from midseason with only the information available at the time. Without it, the 80% win ranges held the real win total only 71% of the time; with it, 77%.</p>
    <p>Each simulated season is then seeded the way the league does it: the four division winners in each conference take seeds 1 through 4, the three best remaining records take the wild cards, and ties go through the NFL's tiebreaker steps in order.</p>
    <p>Division title and playoff percentages on this page come from simulating the standings. Pick any remaining games yourself in the Pick the games panel above: the seeds and bracket redraw from your picks, and Run plays every season with them locked in. The <a href="/nfl-playoff-simulator/">NFL Playoff Simulator</a> adds conference and Super Bowl odds and a club by club clinching check.</p>
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
${P.data}
<script defer src="/static/js/nfl-playoff-engine.js?v=${assetV('static/js/nfl-playoff-engine.js')}"></script>
<script defer src="/static/js/nfl-season-project.js?v=${assetV('static/js/nfl-season-project.js')}"></script>
<script defer src="/static/js/nfl-season-picks.js?v=${assetV('static/js/nfl-season-picks.js')}"></script>
<script defer src="/static/js/nfl-season-sim.js?v=${assetV('static/js/nfl-season-sim.js')}"></script>
<script defer src="/static/js/playoff-bracket.js?v=${assetV('static/js/playoff-bracket.js')}"></script>
<script defer src="/static/js/sim-run-gate.js?v=${assetV('static/js/sim-run-gate.js')}" data-sport="nfl_season"></script>
${shell.tail}
</body>
</html>
`;
}

(async () => {
  const d = await inputs();
  if (!require('./nfl-bake-freshness').gate(d, 'nfl-season-simulator')) return;
  const seed = Number(String(d.generated_at || '').slice(0, 10).replace(/-/g, '')) || 1;
  const result = N.project(d, RUNS, seed);
  const out = path.join(ROOT, 'nfl-season-simulator', 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, SIMUX.inject(page(d, result, H.shellAssets())));
  console.log('wrote nfl-season-simulator/index.html');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
