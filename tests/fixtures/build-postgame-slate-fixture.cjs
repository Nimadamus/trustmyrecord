#!/usr/bin/env node
/**
 * Builds tests/fixtures/nav-mlb-slate-postgame.json.
 *
 * The pregame half is taken verbatim from nav-mlb-slate-with-insights.json (the
 * fixture the 2026-08-21 rotation proof already runs on). The FINAL half is
 * REAL: it reads the MLB Stats API record of a real day's finals and runs it
 * through the backend's own services/mlbPostgameInsights.js, so the fixture is
 * the same bytes the live endpoint would emit, frozen.
 *
 * Regenerate (needs the backend checkout beside this one and a network):
 *   node tests/fixtures/build-postgame-slate-fixture.cjs 2026-08-22
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const BACKEND = process.env.TMR_BACKEND_DIR
  || path.resolve(__dirname, '..', '..', '..', 'trustmyrecord-backend');
const pg = require(path.join(BACKEND, 'services', 'mlbPostgameInsights.js'));
const base = require(path.join(BACKEND, 'services', 'mlbGameInsights.js'));

const DATE = process.argv[2] || '2026-08-22';
const OUT = path.join(__dirname, 'nav-mlb-slate-postgame.json');
const SEED = path.join(__dirname, 'nav-mlb-slate-with-insights.json');

const ABBR_BY_NAME = {
  'Arizona Diamondbacks': 'ARI', Athletics: 'ATH', 'Atlanta Braves': 'ATL',
  'Baltimore Orioles': 'BAL', 'Boston Red Sox': 'BOS', 'Chicago Cubs': 'CHC',
  'Cincinnati Reds': 'CIN', 'Cleveland Guardians': 'CLE', 'Colorado Rockies': 'COL',
  'Chicago White Sox': 'CWS', 'Detroit Tigers': 'DET', 'Houston Astros': 'HOU',
  'Kansas City Royals': 'KC', 'Los Angeles Angels': 'LAA', 'Los Angeles Dodgers': 'LAD',
  'Miami Marlins': 'MIA', 'Milwaukee Brewers': 'MIL', 'Minnesota Twins': 'MIN',
  'New York Mets': 'NYM', 'New York Yankees': 'NYY', 'Philadelphia Phillies': 'PHI',
  'Pittsburgh Pirates': 'PIT', 'San Diego Padres': 'SD', 'Seattle Mariners': 'SEA',
  'San Francisco Giants': 'SF', 'St. Louis Cardinals': 'STL', 'Tampa Bay Rays': 'TB',
  'Texas Rangers': 'TEX', 'Toronto Blue Jays': 'TOR', 'Washington Nationals': 'WSH'
};
const LOGO = {
  ARI: 'ari', ATH: 'oak', ATL: 'atl', BAL: 'bal', BOS: 'bos', CHC: 'chc', CIN: 'cin',
  CLE: 'cle', COL: 'col', CWS: 'chw', DET: 'det', HOU: 'hou', KC: 'kc', LAA: 'laa',
  LAD: 'lad', MIA: 'mia', MIL: 'mil', MIN: 'min', NYM: 'nym', NYY: 'nyy', PHI: 'phi',
  PIT: 'pit', SD: 'sd', SEA: 'sea', SF: 'sf', STL: 'stl', TB: 'tb', TEX: 'tex',
  TOR: 'tor', WSH: 'wsh'
};

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function rate(v) {
  if (v === '-' || v == null) return null;
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}

async function standingsBundle(season) {
  const payload = await get('https://statsapi.mlb.com/api/v1/standings?leagueId=103,104'
    + `&season=${season}&standingsTypes=regularSeason&hydrate=team`);
  const idToAbbr = {};
  Object.keys(base.TEAM_ID).forEach((a) => { idToAbbr[base.TEAM_ID[a]] = a; });
  const byTeam = {};
  (payload.records || []).forEach((div) => {
    const rows = div.teamRecords || [];
    const backs = rows.map((r) => rate(r.gamesBack)).filter((n) => n != null && n > 0).sort((a, b) => a - b);
    const lead = backs.length ? backs[0] : 0;
    rows.forEach((r) => {
      const abbr = idToAbbr[r.team && r.team.id];
      if (!abbr) return;
      const isLeader = r.divisionRank === '1';
      byTeam[abbr] = {
        division_id: div.division && div.division.id,
        league_id: div.league && div.league.id,
        wins: r.wins, losses: r.losses,
        division_rank: parseInt(r.divisionRank, 10) || null,
        division_leader: isLeader,
        division_lead: isLeader ? lead : null,
        division_games_back: isLeader ? 0 : rate(r.gamesBack),
        wild_card_rank: parseInt(r.wildCardRank, 10) || null,
        wild_card_games_back: r.wildCardGamesBack === '-' ? 0 : rate(r.wildCardGamesBack)
      };
    });
  });
  return { standings: { byTeam, as_of: DATE }, series: {} };
}

(async () => {
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const sched = await get(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${DATE}`);
  const raw = ((sched.dates[0] && sched.dates[0].games) || [])
    .filter((g) => g.status.abstractGameState === 'Final');
  if (!raw.length) throw new Error(`no finals on ${DATE}`);

  const loader = pg.createPostgameLoader({ fetchJson: get });
  await loader.load(raw.map((g) => g.gamePk));
  const bundle = await standingsBundle(DATE.slice(0, 4));

  const finals = raw.slice(0, 6).map((g) => {
    const away = ABBR_BY_NAME[g.teams.away.team.name];
    const home = ABBR_BY_NAME[g.teams.home.team.name];
    return {
      game_pk: g.gamePk, away, home,
      away_team_name: g.teams.away.team.name,
      home_team_name: g.teams.home.team.name,
      away_logo: `https://a.espncdn.com/i/teamlogos/mlb/500-dark/${LOGO[away]}.png`,
      home_logo: `https://a.espncdn.com/i/teamlogos/mlb/500-dark/${LOGO[home]}.png`,
      start_time_utc: g.gameDate,
      start_time_pt: '4:05 PM',
      start_time_tbd: false,
      status: 'final', status_label: 'FINAL', status_detail: 'Final',
      doubleheader: false, game_number: 1, game_label: null,
      venue: (g.venue && g.venue.name) || null,
      away_pitcher: null, home_pitcher: null,
      away_score: g.teams.away.score, home_score: g.teams.home.score,
      inning: null, trend: null,
      href: `/handicapping/mlb/?away=${away}&home=${home}&date=${DATE}`,
      board_game_id: null,
      insights: [], insight_pool_size: 0
    };
  });

  pg.attachPostgame(finals, null, bundle, loader.cache);

  const pregame = (seed.games || []).slice(0, 3);
  const out = Object.assign({}, seed, {
    slate_date: DATE,
    games: pregame.concat(finals),
    game_count: pregame.length + finals.length,
    total_scheduled: pregame.length + finals.length,
    postgame_available: finals.some((g) => g.insight_mode === 'postgame')
  });
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`wrote ${OUT}: ${pregame.length} pregame/live + ${finals.length} final`);
  finals.forEach((g) => {
    console.log(`  ${g.away} ${g.away_score} @ ${g.home} ${g.home_score}  [${g.insight_mode}] `
      + `${(g.insights || []).length} items`);
  });
})().catch((e) => { console.error(e); process.exit(1); });
