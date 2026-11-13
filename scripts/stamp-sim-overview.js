'use strict';
/* SIM_OVERVIEW_ACCURACY_20261113. /sports-simulators/ quotes the live NFL and NHL records in
   its cards and FAQ. Nothing rewrote those sentences, so on 2026-11-13 the overview still said
   "57 games from Oct 8 to Nov 2" (NFL) and "Through November 5, 2026: 208 games" (NHL) while the
   simulator pages and the API were at 73 and 257 games. This stamps them from the same two files
   the simulator pages are baked from:
     nfl-simulator/accuracy-public.json   (scripts/build_nfl_accuracy_copy.js)
     data/nhl-evaluation.json             (scripts/stamp-nhl-evaluation.js)
   Run it after both. Missing input or a sentence it cannot find: changes nothing for that league.

   node scripts/stamp-sim-overview.js [--check]   (--check: exit 1 if the page is not current) */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'sports-simulators', 'index.html');
const NFL = path.join(ROOT, 'nfl-simulator', 'accuracy-public.json');
const NHL = path.join(ROOT, 'data', 'nhl-evaluation.json');

const f4 = (x) => Number(x).toFixed(4);
const p1 = (x) => (Number(x) * 100).toFixed(1) + '%';
const n = (x) => Number(x).toLocaleString('en-US');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const day = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
const side = (model, market) => (f4(model) === f4(market) ? 'level with' : Number(model) > Number(market) ? 'behind' : 'ahead of');

const NFL_RE = /across [\d,]+ games from [A-Z][a-z]{2} \d{1,2}(?:, \d{4})? to [A-Z][a-z]{2} \d{1,2}, \d{4}, recorded before kickoff, the served win probability called [\d.]+% of winners against [\d.]+% for the betting market, with a Brier score of [\d.]+ against [\d.]+ \(lower is better\)\. That is a small sample, and the model is (?:behind|ahead of|level with) the market\./g;
const NHL_RE = /Through [A-Z][a-z]+ \d{1,2}, \d{4}: (<b>)?[\d,]+ games(?:<\/b>)?, with a Brier score of (?:<b>)?[\d.]+(?:<\/b>)? against (?:<b>)?[\d.]+(?:<\/b>)? for the no-vig market price(?: on the [\d,]+ games that had one)? \(lower is better\), so the model is (?:behind|ahead of|level with) the market(?: by [\d.]+)?\. Its favourite won [\d.]+% of games\./g;

function nflSentence(snap) {
  const s = snap && snap.served;
  if (!s || !s.graded_games || !s.model || !s.market_same_games || !s.period || !s.period.first_pt || !s.period.last_pt) return null;
  const y = (t) => t.slice(-4);
  const first = y(s.period.first_pt) === y(s.period.last_pt) ? s.period.first_pt.replace(/, \d{4}$/, '') : s.period.first_pt;
  return `across ${n(s.graded_games)} games from ${first} to ${s.period.last_pt}, recorded before kickoff, the served win probability called ${p1(s.model.winner_accuracy)} of winners against ${p1(s.market_same_games.winner_accuracy)} for the betting market, with a Brier score of ${f4(s.model.brier)} against ${f4(s.market_same_games.brier)} (lower is better). That is a small sample, and the model is ${side(s.model.brier, s.market_same_games.brier)} the market.`;
}

function nhlSentence(ev, bold) {
  const L = ev && ev.live;
  if (!L || !L.games || L.model_brier == null || L.market_brier == null || !L.to || L.winner_accuracy == null) return null;
  const b = (t) => (bold ? '<b>' + t + '</b>' : t);
  const rel = side(L.model_brier, L.market_brier);
  const gap = Math.abs(Number(L.model_brier) - Number(L.market_brier));
  const where = L.market_games != null && L.market_games !== L.games ? ` on the ${n(L.market_games)} games that had one` : '';
  return `Through ${day(L.to)}: ${b(n(L.games) + ' games')}, with a Brier score of ${b(f4(L.model_brier))} against ${b(f4(L.market_brier))} for the no-vig market price${where} (lower is better), so the model is ${rel} the market${rel === 'level with' ? '' : ' by ' + f4(gap)}. Its favourite won ${p1(L.winner_accuracy)} of games.`;
}

function render(html, snap, ev) {
  let out = html;
  const nfl = nflSentence(snap);
  if (nfl) out = out.replace(NFL_RE, () => nfl);
  if (nhlSentence(ev, false)) out = out.replace(NHL_RE, (_, bold) => nhlSentence(ev, !!bold));
  return out;
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

if (require.main === module) {
  const html = fs.readFileSync(PAGE, 'utf8');
  const out = render(html, readJson(NFL), readJson(NHL));
  const found = { nfl: (html.match(NFL_RE) || []).length, nhl: (html.match(NHL_RE) || []).length };
  if (process.argv.includes('--check')) {
    const cur = out === html && found.nfl > 0 && found.nhl > 0;
    console.log('sim overview: ' + (cur ? 'current' : 'NOT current') + ' ' + JSON.stringify(found));
    process.exit(cur ? 0 : 1);
  }
  if (out !== html) fs.writeFileSync(PAGE, out);
  console.log('sim overview: ' + (out !== html ? 'stamped' : 'already current') + ' ' + JSON.stringify(found));
}

module.exports = { render, nflSentence, nhlSentence, NFL_RE, NHL_RE };
