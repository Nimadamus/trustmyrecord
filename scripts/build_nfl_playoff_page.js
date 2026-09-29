#!/usr/bin/env node
/**
 * PLAYOFF_BRACKET_20260929: bakes the crawlable sections of /nfl-playoff-simulator/
 * from the live playoff inputs, on the /mlb-playoff-simulator/ model: the real
 * playoff picture today, a bracket picker that opens on the projected field,
 * the playoff odds from 10,000 simulated seasons, and what those simulations say.
 *
 * The interactive regular season simulator on the page is untouched. This only
 * rewrites what sits between the PB_NFL markers, and refreshes the snapshot the
 * page falls back to when the API does not answer.
 *
 * Never fails the bake: if the API is down or the inputs look wrong it prints
 * why and exits 0, leaving the last good bake live.
 *
 * Usage:  node scripts/build_nfl_playoff_page.js [--inputs FILE] [--runs N]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const E = require('../static/js/nfl-playoff-engine.js');
const PB = require('../static/js/playoff-bracket.js');

const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'nfl-playoff-simulator', 'index.html');
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const RUNS = Number(argVal('--runs')) || 10000;
const API = 'https://trustmyrecord-api.onrender.com/api/nfl/public/playoff-inputs?season=';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pctText = (v) => (v >= 0.995 ? '>99%' : v < 0.005 ? '<1%' : Math.round(v * 100) + '%');
const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
const count = (n) => Number(n).toLocaleString('en-US');
const logo = (id) => `https://a.espncdn.com/i/teamlogos/nfl/500/${id.toLowerCase()}.png`;
function ptDate(iso, withTime) {
  const o = { timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric', year: 'numeric' };
  if (withTime) { o.hour = 'numeric'; o.minute = '2-digit'; }
  return new Date(iso).toLocaleString('en-US', o) + (withTime ? ' PT' : '');
}
function seasonNow() {
  const d = new Date();
  return d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}
function assetV(rel) {
  let bytes;
  try { bytes = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { bytes = fs.readFileSync(path.join(ROOT, rel)); }
  return crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
}

async function inputs(season) {
  const file = argVal('--inputs');
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8'));
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(API + season, { signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { last = e; }
  }
  throw last;
}

/* Team strength implied by the model's own game probabilities: the least squares
   fit of logit(p_home) = home edge + rating(home) - rating(away) over every game
   the model priced. The model prices scheduled games only; this is what lets the
   bracket give a January matchup a number rather than a coin flip. */
function fitRatings(teams, games) {
  const priced = games.filter((g) => typeof g.home_win_prob === 'number' && g.home_win_prob > 0 && g.home_win_prob < 1);
  const r = {}; teams.forEach((t) => { r[t.id] = 0; });
  let h = 0;
  const lr = 0.05;
  for (let it = 0; it < 4000; it++) {
    const gr = {}; teams.forEach((t) => { gr[t.id] = 0; });
    let gh = 0;
    for (const g of priced) {
      const y = Math.log(g.home_win_prob / (1 - g.home_win_prob));
      const e = (g.neutral ? 0 : h) + r[g.home] - r[g.away] - y;
      gr[g.home] += e; gr[g.away] -= e;
      if (!g.neutral) gh += e;
    }
    const n = priced.length / teams.length;
    teams.forEach((t) => { r[t.id] -= lr * gr[t.id] / n; });
    h -= lr * gh / priced.length * 4;
    const mean = teams.reduce((s, t) => s + r[t.id], 0) / teams.length;
    teams.forEach((t) => { r[t.id] -= mean; });
  }
  const out = {};
  teams.forEach((t) => { out[t.id] = Math.round(r[t.id] * 10000) / 10000; });
  return { r: out, hfa: Math.round(h * 10000) / 10000, priced: priced.length };
}

function simulate(d, n) {
  const rnd = E.mulberry32(Number(String(d.generated_at).slice(0, 10).replace(/-/g, '')) || 1);
  const open = d.games.filter((g) => !g.completed);
  const acc = {};
  d.teams.forEach((t) => { acc[t.id] = { playoff: 0, division: 0, top: 0, wins: 0, seedSum: 0 }; });
  for (let i = 0; i < n; i++) {
    const sims = {};
    for (const g of open) sims[g.id] = rnd() < (typeof g.home_win_prob === 'number' ? g.home_win_prob : 0.5) ? g.home : g.away;
    const s = E.seedAll(d.teams, d.games, null, sims);
    for (const c of ['AFC', 'NFC']) {
      s[c].seeds.forEach((id, k) => {
        acc[id].playoff++;
        if (k < 4) acc[id].division++;
        if (k === 0) acc[id].top++;
      });
    }
    d.teams.forEach((t) => { const o = s.standings[t.id].overall; acc[t.id].wins += o.w + o.t / 2; });
  }
  const out = {};
  d.teams.forEach((t) => {
    const a = acc[t.id];
    out[t.id] = { playoff: a.playoff / n, division: a.division / n, top: a.top / n, wins: a.wins / n };
  });
  return out;
}

function projectedSeeds(d, P) {
  const seeds = {};
  for (const c of ['AFC', 'NFC']) {
    const conf = d.teams.filter((t) => t.conference === c);
    const divs = [...new Set(conf.map((t) => t.division))];
    const winners = divs.map((dv) => conf.filter((t) => t.division === dv).sort((a, b) => P[b.id].division - P[a.id].division || P[b.id].wins - P[a.id].wins)[0].id);
    winners.sort((a, b) => P[b].wins - P[a].wins || P[b].top - P[a].top);
    const wc = conf.map((t) => t.id).filter((id) => winners.indexOf(id) < 0).sort((a, b) => P[b].playoff - P[a].playoff || P[b].wins - P[a].wins).slice(0, 3);
    wc.sort((a, b) => P[b].wins - P[a].wins || P[b].playoff - P[a].playoff);
    seeds[c] = winners.concat(wc);
  }
  return seeds;
}

function build(d) {
  const T = {};
  d.teams.forEach((t) => { T[t.id] = t; });
  const done = d.games.filter((g) => g.completed);
  const week = done.reduce((m, g) => Math.max(m, g.week || 0), 0);
  const now = E.seedAll(d.teams, d.games, null, null);
  const P = simulate(d, RUNS);
  const fit = fitRatings(d.teams, d.games);
  const seeds = projectedSeeds(d, P);

  const cfg = {
    league: 'nfl', season: String(d.season), confs: ['AFC', 'NFC'], trophy: 'Super Bowl',
    teams: {}, seeds, prob: { r: fit.r, hfa: fit.hfa },
  };
  d.teams.forEach((t) => {
    cfg.teams[t.id] = { n: t.name, s: t.nickname || t.name, l: logo(t.id), c: t.conference, d: t.conference + ' ' + t.division, r: Math.round(P[t.id].wins * 10) / 10 };
  });
  const fav = PB.fill(cfg, { seeds, picks: {} }, 'fav');
  const favChamp = PB.build(cfg, fav).champion;

  const rec = (id) => E.recLabel(now.standings[id].overall);
  const img = (id) => `<img src="${logo(id)}" alt="" width="22" height="22" loading="lazy">`;
  const teamCell = (id) => `<span class="lt">${img(id)}<span class="ln">${esc(T[id].name)}</span><span class="ls">${esc(T[id].nickname || id)}</span></span>`;

  const picture = ['AFC', 'NFC'].map((c) => {
    const s = now[c];
    const rows = s.seeds.map((id, k) => `<tr><td>${k + 1}</td><td>${teamCell(id)}</td><td class="num">${rec(id)}</td><td>${k < 4 ? esc(T[id].conference + ' ' + T[id].division) + ' leader' : 'Wild card'}</td></tr>`).join('');
    return `<div class="pbn-card"><h3>${c}</h3><div class="tscroll"><table class="pbn"><thead><tr><th scope="col">Seed</th><th scope="col">Team</th><th scope="col">Record</th><th scope="col">Spot</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }).join('');

  const oddsRows = (c) => d.teams.filter((t) => t.conference === c).sort((a, b) => P[b.id].playoff - P[a.id].playoff || P[b.id].wins - P[a.id].wins)
    .map((t) => `<tr><td>${teamCell(t.id)}</td><td class="num">${rec(t.id)}</td><td class="num">${P[t.id].wins.toFixed(1)}</td><td class="num">${pctText(P[t.id].division)}</td><td class="num">${pctText(P[t.id].top)}</td><td class="num"><b>${pctText(P[t.id].playoff)}</b></td></tr>`).join('');
  const odds = ['AFC', 'NFC'].map((c) => `<div class="pbn-card"><h3>${c}</h3><div class="tscroll"><table class="pbn"><thead><tr><th scope="col">Team</th><th scope="col">Now</th><th scope="col">Proj. wins</th><th scope="col">Win division</th><th scope="col">1 seed</th><th scope="col">Playoffs</th></tr></thead><tbody>${oddsRows(c)}</tbody></table></div></div>`).join('');

  /* What the simulations are saying: facts read off the tables above. */
  const all = d.teams.map((t) => t.id);
  const byTop = all.slice().sort((a, b) => P[b].top - P[a].top);
  const lock = all.filter((id) => P[id].playoff >= 0.8).sort((a, b) => P[b].playoff - P[a].playoff);
  const bubble = all.filter((id) => P[id].playoff > 0.35 && P[id].playoff < 0.65).sort((a, b) => P[b].playoff - P[a].playoff);
  const upside = all.filter((id) => {
    const r = now.standings[id].overall; return r.w < r.l && P[id].playoff >= 0.3;
  }).sort((a, b) => P[b].playoff - P[a].playoff);
  const say = [];
  const topOf = (c) => byTop.filter((id) => T[id].conference === c)[0];
  say.push(`<li><strong>The race for the bye.</strong> Only the 1 seed in each conference skips the wild card round. The ${esc(T[topOf('AFC')].name)} finish first in the AFC in ${pctText(P[topOf('AFC')].top)} of simulated seasons and the ${esc(T[topOf('NFC')].name)} finish first in the NFC in ${pctText(P[topOf('NFC')].top)}${Math.max(P[topOf('AFC')].top, P[topOf('NFC')].top) < 0.5 ? ', so even the favorites miss the bye more often than not' : ''}.</li>`);
  if (lock.length) say.push(`<li><strong>Closest to safe.</strong> ${cap(lock.slice(0, 5).map((id) => `the ${esc(T[id].name)} (${pctText(P[id].playoff)})`).join(', '))} make the field in at least eight of every ten simulated seasons.</li>`);
  if (bubble.length) say.push(`<li><strong>Too close to call.</strong> ${cap(bubble.slice(0, 6).map((id) => `the ${esc(T[id].name)} (${pctText(P[id].playoff)})`).join(', '))} are in between 35% and 65%. Fourteen of 32 clubs get in, so every week moves this group the most.</li>`);
  if (upside.length) say.push(`<li><strong>A losing record is not the end.</strong> ${upside.slice(0, 3).map((id) => `The ${esc(T[id].name)} are ${rec(id)} and still reach the playoffs ${pctText(P[id].playoff)} of the time`).join('. ')}. The model thinks the schedule ahead is kinder than the one behind.</li>`);
  say.push(`<li><strong>The model's bracket.</strong> Advance the favorite in every game from the projected field and the ${esc(T[favChamp].name)} win the Super Bowl. The chance of that exact bracket is the product of every game in it, which the bracket above shows as you change picks.</li>`);

  const stamp = `Standings after Week ${week}, ${done.length} games final. Odds from ${count(RUNS)} simulated seasons, read ${ptDate(d.generated_at, true)}.`;

  const html = `<!-- PB_NFL:start (baked by scripts/build_nfl_playoff_page.js, do not edit by hand) -->
  <section class="panel pbn" id="picture">
    <h2>The ${d.season} NFL playoff picture after Week ${week}</h2>
    <p class="muted">If the season ended today, with the league's tiebreakers applied to the ${done.length} games already final. Seeds 1 to 4 are the division leaders, 5 to 7 the wild cards, and only the 1 seed gets a bye.</p>
    <div class="pbn-grid">${picture}</div>
  </section>
  <section class="panel pbn" id="build-bracket">
    <h2>Build your ${d.season} NFL playoff bracket</h2>
    <p class="muted">The bracket opens on the projected field, every club's most likely finish across ${count(RUNS)} simulated seasons, with the model's favorite advanced in every game. Click a team to change any pick, edit the seeds, or bring in the seeds from your own regular season picks above. The Divisional round reseeds automatically, exactly as the league does.</p>
    ${PB.widget(cfg, fav)}
  </section>
  <section class="panel pbn" id="odds">
    <h2>${d.season} NFL playoff odds</h2>
    <p class="muted">${esc(stamp)} Completed games keep their real result; every other game is drawn from the TrustMyRecord NFL model's win probability for it.</p>
    <div class="pbn-grid">${odds}</div>
  </section>
  <section class="seo pbn">
    <h2>What the simulations are saying</h2>
    <ul class="pbn-say">${say.join('\n')}</ul>
    <h2>The ${d.season} NFL playoff format</h2>
    <p>Fourteen teams make the playoffs, seven from each conference. The four division winners are seeded one through four by record and the three best remaining records are seeded five through seven. Only the 1 seed has a bye. The wild card round is 2 against 7, 3 against 6 and 4 against 5, every game at the better seed. After that the bracket reseeds: in the Divisional round the 1 seed hosts the lowest seed left and the other two survivors meet, then the conference championship, then the Super Bowl at a neutral site. Every round is one game.</p>
    <h2>How the bracket odds are produced</h2>
    <p>The model prices every scheduled regular season game. To price a January matchup that is not on the schedule, the page fits one strength number per club and one home field edge to the model's own ${count(fit.priced)} game probabilities, so a Wild Card or Divisional game gets the chance the model would give it at the better seed's stadium, and the Super Bowl gets the same without home field. The percentage beside each team in the bracket is that number, and your champion card multiplies every pick into the model's odds of that exact bracket. The playoff odds table above does not use those fitted numbers: it only simulates the regular season and applies the league's seeding and tiebreakers.</p>
  </section>
<!-- PB_NFL:end -->`;
  return { html, week, seeds, favChamp, fit };
}

const STYLE = `<!-- PB_NFL_HEAD:start -->
<link rel="stylesheet" href="/static/css/tmr-playoff-bracket.css?v=${assetV('static/css/tmr-playoff-bracket.css')}">
<script src="/static/js/tmr-analytics.js?v=${assetV('static/js/tmr-analytics.js')}"></script>
<style>
  .pbn-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));gap:12px}
  .pbn-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;min-width:0}
  .pbn-card h3{margin:2px 0 8px;font-size:1rem}
  .pbn .tscroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
  table.pbn{width:100%;border-collapse:collapse;font-size:.86rem}
  table.pbn th,table.pbn td{padding:6px 7px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
  table.pbn th{color:var(--mut);font-weight:600;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em}
  table.pbn td.num,table.pbn th:nth-child(n+3){text-align:right;font-variant-numeric:tabular-nums}
  .pbn .lt{display:inline-flex;align-items:center;gap:7px}
  .pbn .lt img{width:22px;height:22px;object-fit:contain}
  .pbn .lt .ls{display:none}
  @media (max-width:640px){.pbn .lt .ln{display:none}.pbn .lt .ls{display:inline}table.pbn{font-size:.8rem}table.pbn th,table.pbn td{padding:5px 4px}}
  ul.pbn-say{padding-left:1.1em}
  ul.pbn-say li{margin:0 0 10px;line-height:1.6}
</style>
<!-- PB_NFL_HEAD:end -->`;
const TAIL = `<!-- PB_NFL_TAIL:start -->
<script defer src="/static/js/playoff-bracket.js?v=${assetV('static/js/playoff-bracket.js')}"></script>
<!-- PB_NFL_TAIL:end -->`;

function patch(html, start, end, block, anchor, before) {
  const a = html.indexOf(start), b = html.indexOf(end);
  if (a >= 0 && b > a) return html.slice(0, a) + block + html.slice(b + end.length);
  const i = html.indexOf(anchor);
  if (i < 0) throw new Error('anchor not found: ' + anchor);
  return before ? html.slice(0, i) + block + '\n' + html.slice(i) : html.slice(0, i + anchor.length) + '\n  ' + block + html.slice(i + anchor.length);
}

(async () => {
  const season = seasonNow();
  let d;
  try { d = await inputs(season); } catch (e) { console.log('nfl playoff page: inputs unavailable (' + e.message + '), last bake left live'); return; }
  if (!d.teams || d.teams.length !== 32 || !d.games || d.games.length < 250) {
    console.log(`nfl playoff page: inputs look incomplete (${(d.teams || []).length} teams, ${(d.games || []).length} games), last bake left live`);
    return;
  }
  const out = build(d);
  let html = fs.readFileSync(PAGE, 'utf8');
  html = patch(html, '<!-- PB_NFL_HEAD:start -->', '<!-- PB_NFL_HEAD:end -->', STYLE, '</head>', true);
  html = patch(html, '<!-- PB_NFL:start', '<!-- PB_NFL:end -->', out.html, '<div id="app" aria-live="polite"><p class="muted">Loading the 2026 schedule&hellip;</p></div>', false);
  html = patch(html, '<!-- PB_NFL_TAIL:start -->', '<!-- PB_NFL_TAIL:end -->', TAIL, '</body>', true);
  fs.writeFileSync(PAGE, html);
  // The snapshot the page falls back to when the API does not answer.
  const snap = path.join(ROOT, 'nfl-playoff-simulator', 'data', `playoff-inputs-${season}.json`);
  fs.writeFileSync(snap, JSON.stringify(d));
  console.log(`nfl playoff page: week ${out.week}, ${out.fit.priced} priced games, home edge ${out.fit.hfa}, favorite path champion ${out.favChamp}`);
})().catch((e) => { console.error('nfl playoff page FAILED:', e.stack || e.message); process.exit(1); });
