'use strict';
/* =============================================================================
   build_mlb_lineup_usage.js                          LINEUP_USAGE_20261105
   Who each hitter really was in the season just ended: starts, average batting
   slot, and starts by position, counted from every regular season box score.

   The simulator reads this ONLY when a club has no posted lineup and no game in
   the last 21 days (the offseason). It turns the current active roster into the
   order and positions that club really used, instead of sorting by position and
   fielding four shortstops and no catcher.

     node scripts/build_mlb_lineup_usage.js --season 2026 [--box <dir of compact box json>]

   Without --box it reads statsapi directly (GET only, about 2,500 calls, one at a
   time). The output is a plain fact table: no projection, no market data.
   ============================================================================= */
const fs = require('fs');
const path = require('path');

const arg = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 ? process.argv[i + 1] : d; };
const SEASON = String(arg('--season', '2026'));
const BOX_DIR = arg('--box', null);
const OUT = path.resolve(__dirname, '..', 'static', 'data', 'mlb-lineup-usage-' + SEASON + '.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  for (let i = 0; ; i += 1) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (i >= 4) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

/* One side of a box score -> [{ id, name, slot, pos }] for the nine who started. */
function startersFromCompact(side) {
  return side.players.filter((p) => p.bo && p.bo % 100 === 0)
    .map((p) => ({ id: String(p.id), name: p.name, slot: p.bo / 100, pos: p.startPos || p.pos }));
}
function startersFromStatsapi(team) {
  const out = [];
  for (const p of Object.values(team.players || {})) {
    const bo = Number(p.battingOrder || 0);
    if (!bo || bo % 100 !== 0) continue;
    const first = p.allPositions && p.allPositions[0];
    out.push({ id: String(p.person.id), name: p.person.fullName, slot: bo / 100, pos: (first && first.abbreviation) || (p.position && p.position.abbreviation) || '' });
  }
  return out;
}

async function allSides() {
  if (BOX_DIR) {
    return fs.readdirSync(BOX_DIR).filter((f) => f.endsWith('.json')).flatMap((f) => {
      const b = JSON.parse(fs.readFileSync(path.join(BOX_DIR, f), 'utf8'));
      return [startersFromCompact(b.away), startersFromCompact(b.home)];
    });
  }
  const sched = await getJson('https://statsapi.mlb.com/api/v1/schedule?sportId=1&gameType=R&season=' + SEASON);
  const ids = [...new Set(sched.dates.flatMap((d) => d.games).filter((g) => g.status.abstractGameState === 'Final').map((g) => g.gamePk))];
  const sides = [];
  for (const id of ids) {
    const b = await getJson('https://statsapi.mlb.com/api/v1/game/' + id + '/boxscore');
    sides.push(startersFromStatsapi(b.teams.away), startersFromStatsapi(b.teams.home));
    await sleep(220);
  }
  return sides;
}

function tally(sides) {
  const by = {};
  let games = 0;
  for (const nine of sides) {
    if (nine.length !== 9) continue;
    games += 1;
    for (const s of nine) {
      const x = by[s.id] = by[s.id] || { n: s.name, s: 0, slotSum: 0, p: {} };
      x.s += 1; x.slotSum += s.slot;
      if (s.pos) x.p[s.pos] = (x.p[s.pos] || 0) + 1;
    }
  }
  const players = {};
  for (const id of Object.keys(by).sort((a, b) => Number(a) - Number(b))) {
    const x = by[id];
    players[id] = { n: x.n, s: x.s, o: Math.round((x.slotSum / x.s) * 100) / 100, p: x.p };
  }
  return { games, players };
}

(async () => {
  const { games, players } = tally(await allSides());
  if (games < 4000) throw new Error('only ' + games + ' team games with nine starters; refusing to write a partial table');
  fs.writeFileSync(OUT, JSON.stringify({ season: Number(SEASON), teamGames: games, source: 'MLB Stats API box scores, regular season starters', players }) + '\n');
  console.log('wrote ' + path.relative(process.cwd(), OUT) + ': ' + Object.keys(players).length + ' hitters from ' + games + ' team games');
})().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { tally, startersFromCompact };
