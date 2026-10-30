#!/usr/bin/env node
/* =============================================================================
   STAMP NHL EVALUATION                                   NHL_EVALUATION_20261030
   -----------------------------------------------------------------------------
   One source for every accuracy number on /nhl-simulator/: data/nhl-evaluation.json,
   written by --fetch from the API that serves the simulator:
     live       GET /api/nhl/ledger/report + /status  (2026-27 pregame predictions,
                frozen 20-90 min before puck drop, graded after the final)
     backtest   GET /api/nhl/public/accuracy -> report (walk-forward, research)
   The page used to carry hand-typed figures from two different runs ("3,939 games
   across four seasons, 57.6%, 2.15, 1.8%" in the FAQ, "57.6%, 2.14, 1.5%" in the
   section) while the served report said three seasons, 58.3%, 2.139; the live
   ledger was not on the page at all. Now the section between NHL_EVALUATION markers,
   the FAQ answer (visible + JSON-LD) and the starter paragraph are rendered here.

     node scripts/stamp-nhl-evaluation.js --fetch   refresh the data file, then stamp
     node scripts/stamp-nhl-evaluation.js           stamp from the committed data file
     node scripts/stamp-nhl-evaluation.js --check   exit 1 if the page drifted
   ============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'nhl-evaluation.json');
const PAGE = path.join(ROOT, 'nhl-simulator', 'index.html');
const API = process.env.TMR_API || 'https://trustmyrecord-api.onrender.com';
const CHECK = process.argv.includes('--check');
const FETCH = process.argv.includes('--fetch');
const QUESTION = 'How accurate is the NHL simulator?';

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pct = (v, d = 1) => (v == null ? 'n/a' : (v * 100).toFixed(d) + '%');
const f3 = (v) => (v == null ? 'n/a' : Number(v).toFixed(3));
const f4 = (v) => (v == null ? 'n/a' : Number(v).toFixed(4));
const n = (v) => Number(v).toLocaleString('en-US');
const day = (iso) => new Date(String(iso).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'TrustMyRecord bake' }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
  return r.json();
}

async function fetchData() {
  const [report, status, meth] = await Promise.all([
    getJson(API + '/api/nhl/ledger/report'), getJson(API + '/api/nhl/ledger/status'), getJson(API + '/api/nhl/public/accuracy')]);
  const bt = meth && meth.report;
  if (!report || !report.cumulative || !bt || !bt.all) throw new Error('evaluation sources incomplete');
  return {
    fetched_at: new Date().toISOString(),
    source: { live: '/api/nhl/ledger/report', backtest: '/api/nhl/public/accuracy (report)' },
    live: {
      definition_version: report.definition_version, from: report.from, to: report.to, games: report.graded_games,
      model_brier: report.cumulative.model_brier_on_market_games, market_brier: report.cumulative.market_brier,
      market_games: report.cumulative.market_games, gap: report.cumulative.model_minus_market_brier,
      brier: report.cumulative.brier, log_loss: report.cumulative.log_loss, winner_accuracy: report.cumulative.favourite_won,
      home_won: report.cumulative.home_won, goalie_accuracy: report.goalie_accuracy || null,
      goalie_accuracy_at_close: report.goalie_accuracy_at_close || null,
      model_versions: report.model_versions || [], engine_versions: report.engine_versions || [],
      fingerprints: (report.by_model_version || []).length, first_game_utc: status.table && status.table.first_game,
      team_vs_market: report.team_vs_market || [],
    },
    backtest: {
      generated_at: bt.generated_at, model: bt.model, method: bt.method, market_source: bt.market_source,
      all: bt.all, by_season: bt.by_season,
    },
  };
}

/* The 2026-27 regular season opened September 29 2026; the ledger began with the
   Oct 7 games. Opening week has no frozen pregame predictions, so it is not graded. */
const SEASON_OPENED = '2026-09-29';

function render(d) {
  const L = d.live; const B = d.backtest; const A = B.all; const M = A.market || {};
  const ahead = L.gap != null && L.gap < 0;
  const gA = L.goalie_accuracy && L.goalie_accuracy.sides ? L.goalie_accuracy : null;
  const liveP = `Since ${day(L.from)} every NHL game has been frozen 20 to 90 minutes before puck drop and graded after the final; nothing is edited afterwards. Through ${day(L.to)}: <b>${n(L.games)} games</b>. On the ${n(L.market_games)} with a sportsbook moneyline at the freeze, the model's Brier score was <b>${f4(L.model_brier)}</b> against <b>${f4(L.market_brier)}</b> for the no-vig market price (lower is better, a coin flip scores 0.25), so the model is ${ahead ? 'ahead of' : 'behind'} the market by ${f4(Math.abs(L.gap))}. The model's favourite won ${pct(L.winner_accuracy)} of games. ${gA ? `The starting goalie it used was the one who started ${gA.correct} of ${gA.sides} times (${pct(gA.rate)}).` : 'Starting goalie accuracy is being filled in from the league boxscores.'} Ledger ${escHtml(L.definition_version)}, model ${escHtml((L.model_versions || []).join(', ') || 'see report')}, ${n(L.fingerprints)} rating builds. Opening week (${day(SEASON_OPENED)} to October 6) was played before the ledger started and has no frozen predictions, so it is not included and was not backfilled.`;
  const seasons = (B.by_season || []).map((s) => s.label).join(', ');
  const btP = `Separately, as research and not live performance: ${escHtml(B.model)}, replayed walk forward over <b>${n(A.games)} games</b> of ${seasons} (${day(A.from)} to ${day(A.to)}), each projected only from games already played. It picked the winner ${pct(A.winner_accuracy)} of the time against ${pct(A.always_home_accuracy)} for always taking the home team, with a Brier score of ${f4(A.brier)} and a projected margin that missed by ${f3(A.margin_mae)} goals.${M.games ? ` On the ${n(M.games)} games of 2025-26 with a recorded moneyline, its Brier was ${f4(M.model_brier)} against ${f4(M.market_brier)} for the market (gap ${f4(M.brier_gap_model_minus_market)}, 95% interval ${f4(M.brier_gap_95[0])} to ${f4(M.brier_gap_95[1])}): level with the market, not better.` : ''}`;
  const section = `
  <h3>2026-27 live evaluation</h3>
  <p class="lead">${liveP}</p>
  <h3>Backtest (research)</h3>
  <p>${btP}</p>
  <p class="muted">Numbers from <code>data/nhl-evaluation.json</code>, refreshed ${day(d.fetched_at)} from the live ledger and the accuracy report.</p>
`;
  const faq = `Two separate measurements. Live 2026-27: ${L.games} games graded from ${day(L.from)} to ${day(L.to)}, each frozen before puck drop; Brier ${f4(L.model_brier)} for the model against ${f4(L.market_brier)} for the no-vig market price, so the model is ${ahead ? 'ahead of' : 'behind'} the market by ${f4(Math.abs(L.gap))}, and its favourite won ${pct(L.winner_accuracy)}. Backtest (research, not live): ${n(A.games)} games of ${seasons} replayed walk forward, winner ${pct(A.winner_accuracy)} against ${pct(A.always_home_accuracy)} for always picking the home team, margin error ${f3(A.margin_mae)} goals. Hockey is close to a coin flip, so a real edge is a small one, and against the betting market this model is level at best.`;
  return { section, faq };
}

const STARTER_P = 'The starting goalie is the one the club has confirmed when a confirmation has been reported (Daily Faceoff, read every ten minutes on game days); otherwise it is projected from recent starts, weighted toward the latest, and from rest after a back to back, and it is labelled projected. You can pick a different goalie for either side and run it again.';
const GOALIE_FAQ_Q = 'Can I choose the starting goaltender?';
const GOALIE_FAQ_A = 'Yes. Each team starts its confirmed starter when the club has announced one, otherwise the goaltender projected from recent starts and rest, and you can start the other goaltender from the dropdown. The starter\'s save percentage bends the opposing goal rate directly, so the choice genuinely changes the projection rather than just changing a name on the page.';

function stampFaq(html, question, answer, problems) {
  let out = html;
  const ldRe = new RegExp('("name"\\s*:\\s*' + reEsc(JSON.stringify(question)) +
    '\\s*,\\s*"acceptedAnswer"\\s*:\\s*\\{\\s*"@type"\\s*:\\s*"Answer"\\s*,\\s*"text"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"', 'g');
  const ld = (out.match(ldRe) || []).length;
  if (ld !== 1) problems.push(question + ': JSON-LD answer found ' + ld + ' times');
  out = out.replace(ldRe, (_, head) => head + JSON.stringify(answer));
  const visRe = new RegExp('(<summary>' + reEsc(escHtml(question)) + '</summary>\\s*<p>)[\\s\\S]*?(</p>)', 'g');
  const vis = (out.match(visRe) || []).length;
  if (vis !== 1) problems.push(question + ': visible answer found ' + vis + ' times');
  return out.replace(visRe, (_, h, t) => h + escHtml(answer) + t);
}

const SEC_RE = /(<h2 id="accuracy">How accurate is it\?<\/h2>)[\s\S]*?(<p>That is a real edge)/;
const MARK_RE = /(<!--NHL_EVALUATION-->)[\s\S]*?(<!--\/NHL_EVALUATION-->)/;
const STARTER_RE = /<p>The starting goalie is (?:projected from each club|the one the club has confirmed)[\s\S]*?<\/p>/;

function stamp(html, d) {
  const problems = [];
  const r = render(d);
  let out = html;
  if (MARK_RE.test(out)) out = out.replace(MARK_RE, (_, a, b) => a + r.section + '  ' + b);
  else if (SEC_RE.test(out)) out = out.replace(SEC_RE, (_, h, tail) => h + '\n  <!--NHL_EVALUATION-->' + r.section + '  <!--/NHL_EVALUATION-->\n  ' + tail);
  else problems.push('accuracy section not found');
  out = out.replace('<p>That is a real edge and a small one, and hockey is the reason.', '<p>The edge is small, and hockey is the reason.');
  out = out.replace('The live figures, including the reliability curve, are on the tool above under <b>Measured accuracy</b>.',
    'The backtest season by season, with the market beside it, is on the tool above under <b>Measured accuracy</b>; the live 2026-27 record is the section above.');
  out = stampFaq(out, QUESTION, r.faq, problems);
  out = stampFaq(out, GOALIE_FAQ_Q, GOALIE_FAQ_A, problems);
  if (STARTER_RE.test(out)) out = out.replace(STARTER_RE, '<p>' + escHtml(STARTER_P) + '</p>');
  else problems.push('starter paragraph not found');
  return { text: out, problems };
}

async function main() {
  if (FETCH) {
    const d = await fetchData();
    fs.writeFileSync(DATA, JSON.stringify(d, null, 1) + '\n');
  }
  const d = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const html = fs.readFileSync(PAGE, 'utf8');
  const { text, problems } = stamp(html, d);
  if (problems.length) { console.error('stamp-nhl-evaluation: ' + problems.join('; ')); process.exit(1); }
  if (CHECK) {
    if (text !== html) { console.error('stamp-nhl-evaluation: page drifted from data/nhl-evaluation.json'); process.exit(1); }
    console.log('stamp-nhl-evaluation: page matches the data file');
    return;
  }
  if (text !== html) fs.writeFileSync(PAGE, text);
  console.log('stamp-nhl-evaluation: ' + (text !== html ? 'stamped' : 'unchanged') + ' (live ' + d.live.games + ' games to ' + d.live.to + ')');
}

if (require.main === module) main().catch((e) => { console.error('stamp-nhl-evaluation: ' + e.message); process.exit(1); });
module.exports = { render, stamp, SEASON_OPENED };
