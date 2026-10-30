'use strict';
/* NFL_ACCURACY_ONE_SOURCE_20261030. Every accuracy figure printed on the NFL simulator
   pages (FAQ, FAQ structured data, holdout table, playoff page paragraph, the graded
   live predictions table) is rendered here from ONE object: the snapshot of
   GET /api/nfl/public/accuracy that scripts/build_nfl_accuracy_copy.js saves as
   nfl-simulator/accuracy-public.json. Before this, the numbers were typed into the
   HTML (0.2177) and drifted from the API (0.2178). tests/nfl-accuracy-copy-test.js
   fails when a page holds anything other than what this module renders from the
   committed snapshot. Pure functions, no I/O. */

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f4 = (v) => (v == null ? 'n/a' : Number(v).toFixed(4));
const pc1 = (v) => (v == null ? 'n/a' : (v * 100).toFixed(1) + '%');
const pc2 = (v) => (v == null ? 'n/a' : (v * 100).toFixed(2) + '%');
const pts = (v) => (v == null ? 'n/a' : Number(v).toFixed(1) + ' points');
const ptDate = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric', year: 'numeric' });

/** The subset of the API response the pages print. */
function snapshotOf(api) {
  const h = api.holdout || {};
  const pick = (o) => (o ? { brier: o.brier, log_loss: o.log_loss, winner_accuracy: o.winner_accuracy, winner_n: o.winner_n, margin_mae: o.margin_mae,
    ats_accuracy: o.ats_accuracy, ats_n: o.ats_n, totals_accuracy: o.totals_accuracy, totals_n: o.totals_n, games: o.games } : null);
  const s = api.served || null;
  return {
    source: 'https://trustmyrecord-api.onrender.com/api/nfl/public/accuracy',
    report_generated_at: api.generated_at || null,
    model_version: api.model_version || null,
    holdout: { season: h.season, model: pick(h.model), coin_flip: pick(h.coin_flip), home_team: pick(h.home_team), market_favourite: pick(h.market_favourite) },
    served: s && s.graded_games ? {
      season: s.season, graded_games: s.graded_games, period: s.period, model: s.model, market_same_games: s.market_same_games,
      model_same_games: s.model_same_games, model_versions: s.model_versions, config_hashes: s.config_hashes, engine_commits: s.engine_commits,
      sources: s.sources, methodology: s.methodology, games: s.games,
    } : null,
  };
}

function servedSentence(s) {
  if (!s) return '';
  const p = s.period || {};
  return `Graded live: the win probabilities this simulator served before kickoff for ${s.graded_games} completed ${s.season} games (${p.first_pt} to ${p.last_pt}) scored a Brier score of ${f4(s.model.brier)} (lower is better; a coin flip scores 0.25) against ${f4(s.market_same_games.brier)} for the no-vig betting market on the ${s.market_same_games.games} of those games with a market price, and picked the winner ${pc1(s.model.winner_accuracy)} of the time. A sample this size cannot separate the model from the market. `;
}

function faqText(snap) {
  const h = snap.holdout; const m = h.model;
  return servedSentence(snap.served)
    + `In a backtest on ${m.games} held-out ${h.season} games (a research configuration of the model re-run with only data available before each kickoff, not the predictions served on this page), calibrated win probabilities produced a Brier score of ${f4(m.brier)}, compared with about 0.25 for a coin flip, ${f4(h.home_team.brier)} for always selecting the home team and ${f4(h.market_favourite.brier)} for the closing market favourite. The closing market was more accurate, and across the 2022 to 2025 seasons the model does not beat it. Its mean absolute margin error was ${pts(m.margin_mae)}. The model did not demonstrate a profitable advantage against the spread or game totals in this test. Player-level box-score accuracy has not yet been validated. Results are shown as ranges, not guarantees, and this is not betting advice or a prediction of exact future results.`;
}

function playoffParagraph(snap) {
  const h = snap.holdout; const m = h.model; const s = snap.served;
  const live = s ? ` The predictions the game simulator actually served before kickoff are graded too: ${s.graded_games} completed ${s.season} games so far, Brier ${f4(s.model.brier)} against ${f4(s.market_same_games.brier)} for the betting market on the same games, a sample too small to separate the two.` : '';
  return `<p>The model&rsquo;s accuracy is published on the game simulator.${live} In a backtest on the ${h.season} holdout season, ${m.games} games it never saw while being fitted, re-run with only data available before each kickoff (a backtest, not a grade of live predictions), its calibrated win probabilities scored a Brier of ${f4(m.brier)} against about 0.25 for a coin flip and ${f4(h.market_favourite.brier)} for the closing betting market, and it picked the winner ${pc1(m.winner_accuracy)} of the time. The closing market was more accurate, the model does not beat it across the 2022 to 2025 seasons, and it showed no proven edge against the closing spread or total. Season long playoff odds inherit those game level inputs and have not themselves been scored against a holdout, so they are a projection rather than a measured claim.</p>`;
}

function holdoutTable(snap) {
  const h = snap.holdout; const m = h.model; const k = h.market_favourite;
  const when = snap.report_generated_at ? ptDate(snap.report_generated_at) : 'n/a';
  const row = (label, key, v) => `      <tr><th scope="row">${label}</th><td class="n"${key ? ` data-k="${key}"` : ''}>${v}</td></tr>`;
  return [
    '<table id="nflAccHold">',
    `      <caption id="nflAccHoldCap">Backtest of the research configuration (team ratings as of each kickoff), model ${esc(snap.model_version || 'nfl-sim-drive-v1')}, regraded ${when}. It is not the projected configuration the page serves; that one is graded above. Training 2021 to 2023, validation 2024, holdout test ${h.season}, ${m.games} games.</caption>`,
    row('Brier score, calibrated win probability', 'model.brier', f4(m.brier)),
    row('Log loss, calibrated win probability', 'model.log_loss', f4(m.log_loss)),
    row('Brier score, coin-flip baseline', 'coin_flip.brier', f4(h.coin_flip.brier)),
    row('Brier score, always select the home team', 'home_team.brier', f4(h.home_team.brier)),
    row('Winner accuracy', 'model.winner_accuracy', pc2(m.winner_accuracy)),
    row('Mean absolute margin error', 'model.margin_mae', pts(m.margin_mae)),
    row(`Against the spread, ${m.ats_n} games`, 'model.ats_accuracy', pc2(m.ats_accuracy)),
    row(`Game totals, ${m.totals_n} games`, 'model.totals_accuracy', pc2(m.totals_accuracy)),
    row('Break-even rate at standard pricing', null, '52.38%'),
    row('Brier score, closing market favourite (no vig moneyline)', 'market_favourite.brier', f4(k.brier)),
    row(`Winner accuracy, closing market favourite, ${k.winner_n} decided games`, 'market_favourite.winner_accuracy', pc2(k.winner_accuracy)),
    row('Mean absolute margin error, closing spread', 'market_favourite.margin_mae', pts(k.margin_mae)),
    '    </table>',
  ].join('\n');
}

function servedSection(snap) {
  const s = snap.served;
  const head = '<h2 id="live-accuracy">Live accuracy: the predictions this page served</h2>';
  if (!s) return `${head}\n  <p class="acc-prov"><b>Live, graded:</b> every game's default prediction is recorded before kickoff and graded after the final. The first graded games appear here after they finish.</p>`;
  const p = s.period || {}; const M = s.model; const K = s.market_same_games; const Ms = s.model_same_games;
  const meth = s.methodology || {};
  const src = s.sources || {};
  const back = src.qb_shadow_arm_a ? ` ${src.qb_shadow_arm_a} of the ${s.graded_games} games were recorded by the earlier pre-kickoff record of the same public path; ${src.capture || 0} by the current recorder.` : '';
  const row = (l, a, b) => `<tr><th scope="row">${l}</th><td class="n">${a}</td><td class="n">${b}</td></tr>`;
  const games = (s.games || []).slice().reverse().map((g) => {
    const won = g.final.home > g.final.away ? g.home : (g.final.away > g.final.home ? g.away : null);
    const pick = g.home_win_prob >= 0.5 ? g.home : g.away;
    const mk = g.market_home_win_prob == null ? 'n/a' : (g.market_home_win_prob >= 0.5 ? g.home : g.away) + ' ' + pc1(Math.max(g.market_home_win_prob, 1 - g.market_home_win_prob));
    return `<tr><td>${esc(g.week)}</td><td>${esc(g.away)} at ${esc(g.home)}</td><td class="n">${esc(g.final.away)} to ${esc(g.final.home)}</td><td>${esc(pick)} ${pc1(Math.max(g.home_win_prob, 1 - g.home_win_prob))}${won === pick ? ' ✓' : ''}</td><td>${esc(mk)}</td><td class="n">${esc(g.minutes_before_kickoff)} min</td></tr>`;
  }).join('');
  return `${head}
  <p class="acc-prov" id="nflServedProv"><b>Live, graded:</b> ${esc(meth.what)} ${esc(meth.when_recorded)}</p>
  <div class="acc" id="nflServed">
    <table>
      <caption>${esc(s.season)} season, ${s.graded_games} graded games, ${esc(p.first_pt)} to ${esc(p.last_pt)} (weeks ${esc((p.weeks || []).join(', '))}). Model ${esc((s.model_versions || []).join(', '))}; configuration ${esc((s.config_hashes || []).length ? s.config_hashes.join(', ') : 'hash not recorded for these games')}; engine ${esc((s.engine_commits || []).join(', '))}.</caption>
      <tr><th scope="col">Measure</th><th scope="col" class="n">Served model</th><th scope="col" class="n">Betting market, same games</th></tr>
      ${row('Brier score, win probability (lower is better)', f4(Ms.brier), f4(K.brier))}
      ${row('Log loss, win probability', f4(Ms.log_loss), f4(K.log_loss))}
      ${row('Winner accuracy', pc1(Ms.winner_accuracy), pc1(K.winner_accuracy))}
      ${row('Games', Ms.games, K.games)}
      ${M.games !== Ms.games ? row('All graded games (Brier, model only)', f4(M.brier) + ', ' + M.games + ' games', 'n/a') : ''}
    </table>
  </div>
  <p class="acc-note">${esc(meth.market)}${esc(back)} ${esc(meth.not_included)} ${s.graded_games} games is a small sample, so a gap between the model and the market in either direction is normal variation, not evidence of an edge.</p>
  <details class="acc"><summary style="cursor:pointer;color:var(--ink)">Every graded game</summary><table><tr><th scope="col">Week</th><th scope="col">Game</th><th scope="col">Final</th><th scope="col">Served pick</th><th scope="col">Market favourite</th><th scope="col" class="n">Recorded before kickoff</th></tr>${games}</table></details>`;
}

const MARK = {
  served: ['<!-- NFL_SERVED:start -->', '<!-- NFL_SERVED:end -->'],
  hold: ['<!-- NFL_ACC_HOLD:start -->', '<!-- NFL_ACC_HOLD:end -->'],
  faq: ['<!-- NFL_ACC_FAQ:start -->', '<!-- NFL_ACC_FAQ:end -->'],
  playoff: ['<!-- NFL_ACC_PLAYOFF:start -->', '<!-- NFL_ACC_PLAYOFF:end -->'],
};

function between(html, [a, b], block) {
  const i = html.indexOf(a); const j = html.indexOf(b);
  if (i < 0 || j < i) throw new Error('marker missing: ' + a);
  return html.slice(0, i + a.length) + block + html.slice(j);
}

/** The structured-data answer: replace the text of the "How accurate" question. */
function patchJsonLd(html, text) {
  const re = /("name":"How accurate are the simulations\?","acceptedAnswer":\{"@type":"Answer","text":)"(?:[^"\\]|\\.)*"/;
  if (!re.test(html)) throw new Error('JSON-LD accuracy answer not found');
  return html.replace(re, (_, pre) => pre + JSON.stringify(text));
}

function renderSimulatorPage(html, snap) {
  html = between(html, MARK.served, '\n  ' + servedSection(snap) + '\n  ');
  html = between(html, MARK.hold, '\n    ' + holdoutTable(snap) + '\n    ');
  html = between(html, MARK.faq, esc(faqText(snap)));
  return patchJsonLd(html, faqText(snap));
}

function renderPlayoffPage(html, snap) {
  return between(html, MARK.playoff, '\n    ' + playoffParagraph(snap) + '\n    ');
}

module.exports = { snapshotOf, faqText, playoffParagraph, holdoutTable, servedSection, renderSimulatorPage, renderPlayoffPage, MARK };
