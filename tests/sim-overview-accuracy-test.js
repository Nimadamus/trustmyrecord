'use strict';
/* SIM_OVERVIEW_ACCURACY_20261113: /sports-simulators/ must quote the same live NFL and NHL records
   as the simulator pages. Locks scripts/stamp-sim-overview.js and that the page still carries the
   sentences it stamps (2 NFL, 3 NHL), so a copy edit cannot silently unhook them. */
const fs = require('fs'), path = require('path');
const S = require('../scripts/stamp-sim-overview');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log('  FAIL ' + n + (d ? ' :: ' + d : '')); } };
const OLD_NFL = 'NFL: live and graded first: across 57 games from Oct 8 to Nov 2, 2026, recorded before kickoff, the served win probability called 57.1% of winners against 64.3% for the betting market, with a Brier score of 0.2328 against 0.2216 (lower is better). That is a small sample, and the model is behind the market. In the 2025 backtest';
const OLD_NHL = 'Through November 5, 2026: 208 games, with a Brier score of 0.2319 against 0.2263 for the no-vig market price (lower is better), so the model is behind the market by 0.0057. Its favourite won 61.5% of games.';
const OLD_NHL_B = 'Through November 5, 2026: <b>208 games</b>, with a Brier score of <b>0.2319</b> against <b>0.2263</b> for the no-vig market price (lower is better), so the model is behind the market by 0.0057. Its favourite won 61.5% of games.';
const page = '<p>' + OLD_NFL + '</p><p class="simscore">' + OLD_NHL_B + '</p><script type="application/ld+json">{"text":"' + OLD_NFL + ' NHL: ' + OLD_NHL + '"}</script>';
const snap = { served: { graded_games: 73, period: { first_pt: 'Oct 8, 2026', last_pt: 'Nov 12, 2026' }, model: { brier: 0.2189, winner_accuracy: 0.625 }, market_same_games: { brier: 0.2017, winner_accuracy: 0.6944 } } };
const ev = { live: { to: '2026-11-12', games: 257, market_games: 257, model_brier: 0.229993, market_brier: 0.224481, winner_accuracy: 0.607004 } };
const out = S.render(page, snap, ev);
ok('NFL sentence carries the served ledger', (out.match(/across 73 games from Oct 8 to Nov 12, 2026, recorded before kickoff, the served win probability called 62\.5% of winners against 69\.4% for the betting market, with a Brier score of 0\.2189 against 0\.2017 \(lower is better\)\. That is a small sample, and the model is behind the market\./g) || []).length === 2, out);
ok('NHL plain sentence carries the live ledger', out.includes('Through November 12, 2026: 257 games, with a Brier score of 0.2300 against 0.2245 for the no-vig market price (lower is better), so the model is behind the market by 0.0055. Its favourite won 60.7% of games.'));
ok('NHL card keeps its bold figures', out.includes('Through November 12, 2026: <b>257 games</b>, with a Brier score of <b>0.2300</b> against <b>0.2245</b>'));
ok('no old figure survives', !/\b57 games|\b208 games|0\.2328|0\.2319/.test(out));
ok('text around the sentences is untouched', out.includes('In the 2025 backtest') && out.length > 0 && out.startsWith('<p>NFL: live and graded first: across 73'));
ok('stamping twice changes nothing', S.render(out, snap, ev) === out);
ok('a model ahead of the market is written as ahead', /the model is ahead of the market\./.test(S.nflSentence({ served: { ...snap.served, model: { brier: 0.19, winner_accuracy: 0.7 } } })));
ok('a season that spans two years keeps both years', /from Dec 28, 2026 to Jan 3, 2027/.test(S.nflSentence({ served: { ...snap.served, period: { first_pt: 'Dec 28, 2026', last_pt: 'Jan 3, 2027' } } })));
ok('NHL games without a market price are stated', /for the no-vig market price on the 250 games that had one/.test(S.nhlSentence({ live: { ...ev.live, market_games: 250 } }, false)));
ok('that variant is still found on the next stamp', S.render(S.render(page, snap, { live: { ...ev.live, market_games: 250 } }), snap, ev) === out);
ok('missing inputs leave the page alone', S.render(page, null, null) === page && S.render(page, { served: null }, { live: {} }) === page);
const live = fs.readFileSync(path.join(__dirname, '..', 'sports-simulators', 'index.html'), 'utf8');
ok('the page still carries 2 NFL sentences', (live.match(S.NFL_RE) || []).length === 2, String((live.match(S.NFL_RE) || []).length));
ok('the page still carries 3 NHL sentences', (live.match(S.NHL_RE) || []).length === 3, String((live.match(S.NHL_RE) || []).length));
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
