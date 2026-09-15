#!/usr/bin/env node
/**
 * NFL_TEAM_SIM_PAGES_20260915 -- /nfl-simulator/teams/<team>/ for all 32 clubs
 * and /nfl-simulator/<a>-vs-<b>/ for the 48 division rivalries: the page family
 * NBA and NHL already have (and already rank with) that NFL did not, item 2 of
 * the 2026-09-12 simulator SEO audit.
 *
 * WHAT KEEPS THEM FROM BEING DOORWAY PAGES. Every page is built from that club's
 * own live data and nothing is shared text with a name swapped in: its projected
 * wins and the 80% range, its division, playoff and 1 seed odds from the same
 * season simulation as /nfl-season-simulator/, and its real 2026 schedule week
 * by week with each final score or the model's win probability for that game.
 * A rivalry page carries both clubs' projections and every meeting on the
 * schedule. A club or a pair the feed cannot resolve is not written.
 *
 * Also maintains the NFL hub's team and rivalry link grids between
 * <!--MK:nflTeamSims--> markers, and the sitemap entries.
 *
 * Usage: node scripts/build_nfl_team_pages.js [--inputs FILE] [--runs N]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const N = require('../static/js/nfl-season-project.js');
const H = require('./build_league_sim_pages.js');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://trustmyrecord.com';
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const RUNS = Number(argVal('--runs')) || 10000;
const esc = H.esc;

function seasonNow() {
  const d = new Date();
  return d.getUTCMonth() <= 1 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
}

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

const logo = (abbr) => `https://a.espncdn.com/i/teamlogos/nfl/500/${String(abbr).toLowerCase()}.png`;
const pct = (v) => (v >= 0.995 ? 'better than 99%' : v < 0.005 ? 'under 1%' : Math.round(v * 100) + '%');
const dateOf = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric' });
const teamSlug = (t) => H.slugOf(t.name);
const nickSlug = (t) => H.slugOf(t.nickname);
const pairSlug = (a, b) => [nickSlug(a), nickSlug(b)].sort().join('-vs-');

const EXTRA_CSS = `
  table.sched{width:100%;border-collapse:collapse;font-size:.88rem}
  table.sched th,table.sched td{padding:7px 8px;border-bottom:1px solid var(--line,#23324a);text-align:left;white-space:nowrap}
  table.sched thead th{font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--mut,#9fb0c6)}
  table.sched td.r{text-align:right;font-variant-numeric:tabular-nums}
  .w{color:#34d399;font-weight:700}.l{color:#f87171;font-weight:700}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:10px;margin:10px 0}
  .kpi{background:var(--card,#111a2b);border:1px solid var(--line,#23324a);border-radius:12px;padding:10px 12px}
  .kpi b{display:block;font-size:1.35rem}
  .kpi span{font-size:.78rem;color:var(--mut,#9fb0c6)}
  .tlogo{width:56px;height:56px;vertical-align:middle;margin-right:10px}
`;

function shell(title, desc, url, crumbs, h1, bodyHtml, faqs, shellAssets, dateModified) {
  const faq = H.faqBlock(faqs);
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: h1, url: SITE + url, description: desc, dateModified },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[1], item: SITE + c[0] })) },
  ];
  const crumbHtml = crumbs.map((c, i) => (i === crumbs.length - 1
    ? `<span aria-current="page" style="font-weight:600;">${esc(c[1])}</span>`
    : `<a href="${c[0]}" style="color:inherit;text-decoration:none;">${esc(c[1])}</a><span aria-hidden="true" style="opacity:.45;">&rsaquo;</span>`)).join('\n    ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<!-- NFL_TEAM_SIM_PAGES_20260915. Baked by scripts/build_nfl_team_pages.js. Do not edit by hand. -->
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${url}" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(h1)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${SITE}${url}" />
<meta property="og:site_name" content="TrustMyRecord" />
<meta property="og:image" content="${SITE}/static/og/og-home.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/png" href="/static/favicon.png">
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n')}
<script type="application/ld+json">${faq.ld}</script>
${shellAssets.head}
<style>${H.CSS}${EXTRA_CSS}</style>
</head>
<body class="tmr-ds-shell tmr-ds--dark">
<main class="wrap lsim-wrap">
  <nav class="simcrumb" aria-label="Breadcrumb" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:.8rem;margin:0 0 14px;opacity:.85;">
    ${crumbHtml}
  </nav>
${bodyHtml}
  <section class="lsim-copy">
    <h2 id="faq">Common questions</h2>
    ${faq.html}
  </section>
</main>
<div class="foot wrap">TrustMyRecord NFL Simulator &middot; a model projection, not betting advice</div>
${shellAssets.tail}
</body>
</html>
`;
}

function scheduleRows(d, team) {
  const byId = Object.fromEntries(d.teams.map((t) => [t.id, t]));
  return d.games.filter((g) => g.home === team.id || g.away === team.id)
    .sort((a, b) => a.week - b.week)
    .map((g) => {
      const home = g.home === team.id;
      const opp = byId[home ? g.away : g.home];
      let res;
      if (g.completed && g.home_score != null) {
        const us = home ? g.home_score : g.away_score, them = home ? g.away_score : g.home_score;
        res = `<span class="${us > them ? 'w' : us < them ? 'l' : ''}">${us > them ? 'W' : us < them ? 'L' : 'T'} ${us} to ${them}</span>`;
      } else if (typeof g.home_win_prob === 'number') {
        res = `${Math.round((home ? g.home_win_prob : 1 - g.home_win_prob) * 100)}% to win`;
      } else res = 'not yet projected';
      return `<tr><td>Week ${g.week}</td><td>${esc(dateOf(g.kickoff))}</td><td>${home ? 'vs' : 'at'} <a href="/nfl-simulator/teams/${teamSlug(opp)}/">${esc(opp.name)}</a></td><td class="r">${res}</td></tr>`;
    }).join('');
}

function teamPage(d, t, proj, all, shellAssets) {
  const p = proj.find((x) => x.id === t.id);
  const div = d.teams.filter((x) => x.conference === t.conference && x.division === t.division && x.id !== t.id);
  const open = d.games.filter((g) => !g.completed && (g.home === t.id || g.away === t.id) && typeof g.home_win_prob === 'number');
  const probFor = (g) => (g.home === t.id ? g.home_win_prob : 1 - g.home_win_prob);
  const hardest = open.slice().sort((a, b) => probFor(a) - probFor(b))[0];
  const byId = Object.fromEntries(d.teams.map((x) => [x.id, x]));
  const rec = N.project ? null : null; // eslint quiet
  void rec;
  const played = d.games.filter((g) => g.completed && (g.home === t.id || g.away === t.id));
  let w = 0, l = 0, tie = 0;
  played.forEach((g) => { const us = g.home === t.id ? g.home_score : g.away_score, them = g.home === t.id ? g.away_score : g.home_score; if (us > them) w++; else if (us < them) l++; else tie++; });
  const url = `/nfl-simulator/teams/${teamSlug(t)}/`;
  const title = `${t.name} Simulator ${d.season} | Projected Record, Playoff Odds and Schedule`;
  const desc = `${t.name} ${d.season} season simulation: ${H.UI_one(p.wins_mean)} projected wins, ${pct(p.playoffs)} playoff odds, ${pct(p.division_title)} to win the ${t.conference} ${t.division}, and every game on the schedule with the model's win probability.`;
  const body = `
  <section class="hero lsim-hero">
    <h1><img class="tlogo" src="${logo(t.abbr)}" alt="" width="56" height="56">${esc(t.name)} Simulator</h1>
    <p>${played.length ? `The ${esc(t.nickname)} are ${w} and ${l}${tie ? ` with ${tie} tie${tie > 1 ? 's' : ''}` : ''} through ${played.length} game${played.length > 1 ? 's' : ''}. ` : ''}Across ${H.count(proj.runs)} simulated ${d.season} seasons they average ${H.UI_one(p.wins_mean)} wins, and eight of every ten seasons land between ${p.wins_p10} and ${p.wins_p90}.</p>
    <div class="kpis">
      <div class="kpi"><b>${H.UI_one(p.wins_mean)}</b><span>projected wins</span></div>
      <div class="kpi"><b>${pct(p.division_title)}</b><span>win the ${esc(t.conference)} ${esc(t.division)}</span></div>
      <div class="kpi"><b>${pct(p.playoffs)}</b><span>make the playoffs</span></div>
      <div class="kpi"><b>${pct(p.top_seed)}</b><span>earn the 1 seed</span></div>
    </div>
  </section>
  <section class="panel">
    <h2>${esc(t.nickname)} ${d.season} schedule, simulated</h2>
    <p class="small">Final games show the score. Every other game shows the TrustMyRecord NFL model's probability that the ${esc(t.nickname)} win it.</p>
    <div class="tscroll"><table class="sched"><thead><tr><th>Week</th><th>Date</th><th>Opponent</th><th class="r">Result or odds</th></tr></thead><tbody>${scheduleRows(d, t)}</tbody></table></div>
    ${hardest ? `<p>The toughest game left on the model's numbers is week ${hardest.week}, ${hardest.home === t.id ? 'home against' : 'at'} the ${esc(byId[hardest.home === t.id ? hardest.away : hardest.home].name)}, where the ${esc(t.nickname)} win ${Math.round(probFor(hardest) * 100)}% of the time.</p>` : ''}
  </section>
  <section class="panel">
    <h2>The ${esc(t.conference)} ${esc(t.division)} race</h2>
    <div class="linkgrid">
      ${div.map((o) => { const q = proj.find((x) => x.id === o.id); return `<a href="/nfl-simulator/${pairSlug(t, o)}/">${esc(t.nickname)} vs ${esc(o.nickname)}<small>${esc(o.nickname)}: ${H.UI_one(q.wins_mean)} wins, ${pct(q.division_title)} division</small></a>`; }).join('\n      ')}
    </div>
  </section>
  <section class="panel">
    <h2>Simulate the ${esc(t.nickname)}</h2>
    <div class="linkgrid">
      <a href="/nfl-simulator/">NFL Simulator<small>Any ${esc(t.nickname)} game with a full box score</small></a>
      <a href="/nfl-season-simulator/">NFL Season Simulator<small>All 32 teams, projected</small></a>
      <a href="/nfl-playoff-simulator/">NFL Playoff Simulator<small>Pick the games, build the bracket</small></a>
    </div>
  </section>`;
  const faqs = [
    [`How many games will the ${t.name} win in ${d.season}?`, `Across ${H.count(proj.runs)} simulated seasons the ${t.name} average ${H.UI_one(p.wins_mean)} wins, with eight of every ten seasons between ${p.wins_p10} and ${p.wins_p90}. Games already played count at their real result.`],
    [`What are the ${t.name}' playoff odds?`.replace("s' playoff", "s' playoff"), `They make the playoffs in ${pct(p.playoffs)} of simulated seasons, win the ${t.conference} ${t.division} in ${pct(p.division_title)} and earn the 1 seed in ${pct(p.top_seed)}, with every season seeded by the NFL's tiebreakers.`],
    [`How is the ${t.nickname} simulation built?`, `Each remaining game is decided by that game's own win probability from the TrustMyRecord NFL model, the drive level model behind the NFL Simulator, and the season is replayed ${H.count(proj.runs)} times. The page is rebuilt twice a day from the latest schedule and results.`],
  ];
  return { url, html: shell(title, desc, url, [['/', 'Home'], ['/sports-simulators/', 'Sports Simulators'], ['/nfl-simulator/', 'NFL Simulator'], [url, `${t.name} Simulator`]], `${t.name} Simulator`, body, faqs, shellAssets, d.generated_at) };
}

function rivalryPage(d, a, b, proj, shellAssets) {
  const pa = proj.find((x) => x.id === a.id), pb = proj.find((x) => x.id === b.id);
  const meets = d.games.filter((g) => (g.home === a.id && g.away === b.id) || (g.home === b.id && g.away === a.id)).sort((x, y) => x.week - y.week);
  const byId = { [a.id]: a, [b.id]: b };
  const url = `/nfl-simulator/${pairSlug(a, b)}/`;
  const h1 = `${a.nickname} vs ${b.nickname} Simulator`;
  const title = `${a.nickname} vs ${b.nickname} Simulation ${d.season} | Win Probability and Division Odds`;
  const desc = `${a.name} vs ${b.name} in ${d.season}: both meetings with the model's win probability or final score, and each team's projected wins, ${a.conference} ${a.division} title and playoff odds.`;
  const rows = meets.map((g) => {
    const home = byId[g.home], away = byId[g.away];
    const res = g.completed && g.home_score != null
      ? `Final: ${esc(away.nickname)} ${g.away_score}, ${esc(home.nickname)} ${g.home_score}`
      : typeof g.home_win_prob === 'number' ? `${esc(home.nickname)} ${Math.round(g.home_win_prob * 100)}%, ${esc(away.nickname)} ${100 - Math.round(g.home_win_prob * 100)}%` : 'not yet projected';
    return `<tr><td>Week ${g.week}</td><td>${esc(dateOf(g.kickoff))}</td><td>${esc(away.name)} at ${esc(home.name)}</td><td class="r">${res}</td></tr>`;
  }).join('');
  const kp = (t, p) => `<div class="kpi"><b><img src="${logo(t.abbr)}" alt="" width="22" height="22"> ${H.UI_one(p.wins_mean)}</b><span>${esc(t.nickname)} projected wins, ${pct(p.division_title)} division, ${pct(p.playoffs)} playoffs</span></div>`;
  const body = `
  <section class="hero lsim-hero">
    <h1>${esc(h1)}</h1>
    <p>The ${esc(a.name)} and the ${esc(b.name)} share the ${esc(a.conference)} ${esc(a.division)} and meet ${meets.length === 2 ? 'twice' : meets.length + ' time' + (meets.length === 1 ? '' : 's')} in ${d.season}. Across ${H.count(proj.runs)} simulated seasons the ${esc(a.nickname)} win the division ${pct(pa.division_title)} of the time and the ${esc(b.nickname)} ${pct(pb.division_title)}.</p>
    <div class="kpis">${kp(a, pa)}${kp(b, pb)}</div>
  </section>
  <section class="panel">
    <h2>${esc(a.nickname)} and ${esc(b.nickname)} meetings in ${d.season}</h2>
    <div class="tscroll"><table class="sched"><thead><tr><th>Week</th><th>Date</th><th>Game</th><th class="r">Result or model odds</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p>Simulate either game play by play with a full box score in the <a href="/nfl-simulator/">NFL Simulator</a>, or pick the result and see what it does to the seeds in the <a href="/nfl-playoff-simulator/">NFL Playoff Simulator</a>.</p>
  </section>
  <section class="panel">
    <h2>More</h2>
    <div class="linkgrid">
      <a href="/nfl-simulator/teams/${teamSlug(a)}/">${esc(a.name)} Simulator<small>Full schedule, simulated</small></a>
      <a href="/nfl-simulator/teams/${teamSlug(b)}/">${esc(b.name)} Simulator<small>Full schedule, simulated</small></a>
      <a href="/nfl-season-simulator/">NFL Season Simulator<small>All 32 teams, projected</small></a>
    </div>
  </section>`;
  const faqs = [
    [`Who wins ${a.nickname} vs ${b.nickname}?`, meets.map((g) => {
      const home = byId[g.home], away = byId[g.away];
      return g.completed && g.home_score != null ? `Week ${g.week} finished ${away.nickname} ${g.away_score}, ${home.nickname} ${g.home_score}.`
        : typeof g.home_win_prob === 'number' ? `In week ${g.week} the model makes the ${home.nickname} a ${Math.round(g.home_win_prob * 100)}% chance at home.` : `Week ${g.week} is not yet projected.`;
    }).join(' ')],
    [`Who is favored to win the ${a.conference} ${a.division}?`, `Across ${H.count(proj.runs)} simulated seasons the ${a.nickname} win it ${pct(pa.division_title)} of the time and the ${b.nickname} ${pct(pb.division_title)}.`],
  ];
  return { url, html: shell(title, desc, url, [['/', 'Home'], ['/sports-simulators/', 'Sports Simulators'], ['/nfl-simulator/', 'NFL Simulator'], [url, h1]], h1, body, faqs, shellAssets, d.generated_at) };
}

function patchHub(d, pages) {
  const file = path.join(ROOT, 'nfl-simulator', 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  const teams = d.teams.slice().sort((x, y) => x.name.localeCompare(y.name));
  const block = `<!--MK:nflTeamSims-->
  <hr class="divider" />
  <h2>Simulate a single NFL team</h2>
  <div class="linkgrid">
    ${teams.map((t) => `<a href="/nfl-simulator/teams/${teamSlug(t)}/">${esc(t.name)}<small>Schedule and season simulation</small></a>`).join('\n    ')}
  </div>
  <h2>NFL division rivalries</h2>
  <div class="linkgrid">
    ${pages.rivalries.map((r) => `<a href="${r.url}">${esc(r.label)}<small>${esc(r.div)}</small></a>`).join('\n    ')}
  </div>
  <!--/MK:nflTeamSims-->`;
  const re = /<!--MK:nflTeamSims-->[\s\S]*?<!--\/MK:nflTeamSims-->/;
  if (re.test(html)) html = html.replace(re, block);
  else {
    const at = html.search(/<hr class="divider" \/>\s*<h2>Related TrustMyRecord tools<\/h2>/);
    if (at < 0) throw new Error('nfl hub: no place for the team grid');
    html = html.slice(0, at) + block + '\n\n  ' + html.slice(at);
  }
  fs.writeFileSync(file, html);
}

function patchSitemap(urls) {
  const file = path.join(ROOT, 'sitemap.xml');
  let xml = fs.readFileSync(file, 'utf8');
  const nl = xml.includes('\r\n') ? '\r\n' : '\n';
  const today = new Date().toISOString().slice(0, 10);
  const add = urls.filter((u) => !xml.includes(`<loc>${SITE}${u}</loc>`))
    .map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod></url>`);
  if (!add.length) return 0;
  const anchor = `  <url><loc>${SITE}/nfl-season-simulator/</loc>`;
  const at = xml.indexOf(anchor);
  if (at < 0) throw new Error('sitemap: /nfl-season-simulator/ anchor missing');
  xml = xml.slice(0, at) + add.join(nl) + nl + xml.slice(at);
  fs.writeFileSync(file, xml);
  return add.length;
}

(async () => {
  const d = await inputs();
  const seed = Number(String(d.generated_at || '').slice(0, 10).replace(/-/g, '')) || 1;
  const proj = N.project(d, RUNS, seed);
  const teams = proj.teams;
  teams.runs = proj.runs;
  const shellAssets = H.shellAssets();
  const written = [];
  for (const t of d.teams) {
    const pg = teamPage(d, t, teams, d.teams, shellAssets);
    const out = path.join(ROOT, pg.url.replace(/^\//, ''), 'index.html');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, pg.html);
    written.push(pg.url);
  }
  const rivalries = [];
  const groups = {};
  d.teams.forEach((t) => { (groups[t.conference + ' ' + t.division] || (groups[t.conference + ' ' + t.division] = [])).push(t); });
  Object.keys(groups).sort().forEach((k) => {
    const g = groups[k].slice().sort((x, y) => x.nickname.localeCompare(y.nickname));
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        const pg = rivalryPage(d, g[i], g[j], teams, shellAssets);
        const out = path.join(ROOT, pg.url.replace(/^\//, ''), 'index.html');
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, pg.html);
        written.push(pg.url);
        rivalries.push({ url: pg.url, label: `${g[i].nickname} vs ${g[j].nickname}`, div: k });
      }
    }
  });
  patchHub(d, { rivalries });
  const added = patchSitemap(written);
  console.log(`nfl: ${d.teams.length} team pages, ${rivalries.length} rivalry pages, ${added} new sitemap entries`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
