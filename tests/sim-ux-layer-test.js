/* =============================================================================
   SIM UX LAYER: ONE PRESENTATION FLOOR ON EVERY SIM PAGE      SIM_UX_20261030
   -----------------------------------------------------------------------------
   Audit 2026-10-30 (CHECKLIST #14 #15 #25 #29, mlb.md M12): wide tables clipped
   with no cue, the Live help bubble over Run buttons, links told apart by colour
   alone (1.09:1), bracket losers at 2.69:1, a tablist with no tabs, no skip
   link, MLB hub CLS 0.34 from a font swap, and dateModified moved on every bake.
   This fails when:
     1. any simulator page lacks the current SIM_UX block (stamp script);
     2. a builder that writes whole sim pages stops calling SIMUX.inject;
     3. the layer loses one of its rules (skip link, link underline, scroll
        region + sticky column + cue, bubble yield, AA contrast floor);
     4. the bracket loser or 0% cell goes back to an opacity fade;
     5. a sim hub labels a button group role="tablist" with no role="tab";
     6. the MLB hub headline face can swap after first paint, or its column is
        sized in ch (moves when the font loads);
     7. dateModified is stamped from the bake time instead of the substance
        fingerprint (sim-date-modified.js), or the helper keeps/changes the date
        wrongly.
   Run: node tests/sim-ux-layer-test.js
   ============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

// 1
const { stale } = require('../scripts/stamp-sim-ux.js').run(true);
ok('1. every sim page carries the current SIM_UX block', !stale.length, stale.slice(0, 5).join(', ') + ' (run: node scripts/stamp-sim-ux.js)');

// 2
const BUILDERS = ['scripts/build_league_sim_pages.js', 'scripts/build_nfl_season_page.js', 'scripts/build_nfl_team_pages.js',
  'scripts/build_mlb_odds_page.js', 'scripts/build_sim_team_pages.js', 'scripts/build_sim_matchup_pages.js', 'scripts/build-sim-archive-pages.cjs'];
for (const b of BUILDERS) ok('2. ' + b + ' injects the layer', /SIMUX\.inject\(/.test(read(b)));

// 3
const css = read('static/css/tmr-sim-ux.css');
const js = read('static/js/tmr-sim-ux.js');
ok('3a. skip link', /simux-skip/.test(js) && /\.simux-skip:focus/.test(css));
ok('3b. links in running text are underlined', /> a:not\(\[class\*="btn"\]\)[\s\S]*?text-decoration:underline/.test(css));
ok('3c. overflowing tables: focusable named region', /setAttribute\('tabindex', '0'\)/.test(js) && /setAttribute\('role', 'region'\)/.test(js) && /aria-label/.test(js));
ok('3d. overflowing tables: sticky first column + edge cue + hint', /position:sticky;left:0/.test(css) && /simux-more-r/.test(css) && /simux-hint/.test(js));
ok('3e. Live help launcher yields over controls and cells', /elementsFromPoint/.test(js) && /simux-yield/.test(css) && /\btd\b/.test(js.match(/COVERS = '[^']*'/)[0]));
ok('3f. AA contrast floor (0% cells, primary buttons, light gold/teal/blue links)', /\.lz\{[^}]*#8b95a5/.test(css) && /#1667c4/.test(css) && /#8a6200/.test(css) && /#0f766e/.test(css) && /#1663bf/.test(css));
ok('3g. shared loading / error-with-retry state', /Try again/.test(js) && /\.simux-state/.test(css));

// 4
const pb = read('static/css/tmr-playoff-bracket.css');
ok('4a. bracket loser is not an opacity fade of its text', !/\.pb-t\.out\{opacity/.test(pb) && /\.pb-t\.out \.pb-n\{text-decoration:line-through/.test(pb));
ok('4b. 0% cells are not an opacity fade', !/\.lz\{opacity/.test(read('scripts/build_league_sim_pages.js')));

// 5
for (const hub of ['nba-simulator/index.html', 'nhl-simulator/index.html']) {
  const h = read(hub);
  const bar = (h.match(/<div class="modebar"[^>]*>[\s\S]*?<\/div>/) || [''])[0];
  ok('5. ' + hub + ' mode bar is a real tab set or a group', !/role="tablist"/.test(bar) || /role="tab"/.test(bar));
}

// 6
const mlb = read('mlb-simulator/index.html');
const land = read('static/css/mlb-sim-landing-v2.css');
ok('6a. MLB hub Barlow loads display=optional (no late swap)', /family=Barlow:wght@700;800&display=optional/.test(mlb) && !/family=Barlow:wght@700;800&family=/.test(mlb));
ok('6b. metric-matched Barlow fallback is declared and used', /font-family: 'Barlow Fallback'[\s\S]*size-adjust/.test(land) && /'Barlow', 'Barlow Fallback'/.test(land));
ok('6c. hero sub line is not sized in ch', !/\.simv2-sub \{[^}]*max-width: \d+ch/.test(land));

// 7
const DM = require('../scripts/sim-date-modified.js');
const a = DM.resolveFrom('', { finals: [1] }, '2026-10-30T10:00:00Z');
const b = DM.resolveFrom('<html>' + a.marker + '</html>', { finals: [1] }, '2026-10-30T18:00:00Z');
const c = DM.resolveFrom('<html>' + a.marker + '</html>', { finals: [1, 2] }, '2026-10-30T18:00:00Z');
ok('7a. same substance keeps the earlier dateModified', b.date === '2026-10-30T10:00:00Z' && !b.changed);
ok('7b. a new final moves dateModified', c.date === '2026-10-30T18:00:00Z' && c.changed);
ok('7c. print-precision noise does not move it', DM.fingerprint(DM.rounded({ p: 0.51234 }, 1)) === DM.fingerprint(DM.rounded({ p: 0.50999 }, 1)));
for (const bld of ['scripts/build_league_sim_pages.js', 'scripts/build_nfl_season_page.js', 'scripts/build_nfl_team_pages.js', 'scripts/build_mlb_odds_page.js']) {
  const s = read(bld);
  ok('7d. ' + bld + ' takes dateModified from the substance fingerprint', !/dateModified:\s*(inputs|inp|d)\.generated_at/.test(s) && /sim-date-modified/.test(s));
}

// 8. Season workers are pinned to the current worker build, and the NFL season page
//    pins its script by content hash at bake time (SIM_WORKER_PIN_20261030).
const crypto = require('crypto');
const wHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'static/js/sim-season-worker.js'))).digest('hex').slice(0, 12);
for (const f of ['static/js/nfl-season-sim.js', 'static/js/league-season-sim.js']) {
  const refs = read(f).match(/sim-season-worker\.js\?v=([0-9a-f]+)/g) || [];
  ok('8a. ' + f + ' pins the current sim-season-worker.js (' + wHash + ')', refs.length > 0 && refs.every((r) => r.endsWith(wHash)), refs.join(','));
}
ok('8b. NFL season builder pins nfl-season-sim.js by content hash', /nfl-season-sim\.js\?v=\$\{assetV\('static\/js\/nfl-season-sim\.js'\)\}/.test(read('scripts/build_nfl_season_page.js')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
