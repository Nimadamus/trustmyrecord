#!/usr/bin/env node
/**
 * Weekly refresh of CURRENT_PITCHERS in static/js/mlb-simulator.js.
 *
 * Player rosters and batting orders in the MLB Simulator are already live: every
 * visitor fetches the MLB Stats API directly with a short TTL, so trades show up
 * on their own. The ONE piece of roster data baked into the file is
 * CURRENT_PITCHERS - five rotation rows per team. It is documented as an
 * emergency fallback, but it ALSO orders the normal starter dropdown, so a stale
 * entry is user-visible on the happy path. This script is what keeps it current.
 *
 * Rebuilds all 30 teams from the live active roster + real season pitching stats
 * (top 5 by games started, then innings), using the engine's OWN quality formula
 * so the numbers cannot drift from what the simulator expects.
 *
 * Refuses to write anything unless every team resolved cleanly. Exits 0 with no
 * change when the table is already current, so a weekly run is a no-op most weeks.
 *
 * Usage: node scripts/regen-current-pitchers.cjs [--check]
 *   --check  report drift and exit 1 if the file would change; never writes.
 */

const fs = require('fs');
const path = require('path');

const ENGINE = path.join(__dirname, '..', 'static', 'js', 'mlb-simulator.js');
const CHECK_ONLY = process.argv.includes('--check');
const SEASON = new Date().getUTCFullYear();

const MLB_TEAM_IDS = {
  ARI: 109, ATH: 133, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CIN: 113, CLE: 114, COL: 115, CWS: 145,
  DET: 116, HOU: 117, KC: 118, LAA: 108, LAD: 119, MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147,
  PHI: 143, PIT: 134, SD: 135, SEA: 136, SF: 137, STL: 138, TB: 139, TEX: 140, TOR: 141, WSH: 120,
};
// Key order is preserved so an unchanged week produces a byte-identical block.
const TEAM_ORDER = Object.keys(MLB_TEAM_IDS);
const ROWS_PER_TEAM = 5;

// Must stay identical to pitcherQualityFromEra() in mlb-simulator.js.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const qualityFromEra = (era) => Math.round(clamp(100 + (4.30 - Number(era)) * 12, 78, 130));

function slugId(name, taken) {
  const parts = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/);
  let id = parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, '') || 'arm';
  while (taken.has(id)) id += 'x';
  taken.add(id);
  return id;
}

// statsapi reports innings as 12.1 / 12.2 (outs), not decimals - convert before sorting.
function inningsToNumber(ip) {
  const m = /^(\d+)\.(\d)$/.exec(String(ip || '0'));
  if (!m) return Number(ip) || 0;
  return Number(m[1]) + Number(m[2]) / 3;
}

async function getJson(url, tries = 5) {
  let lastErr = null;
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'tmr-mlb-simulator-rotation-refresh' } });
      if (r.ok) return await r.json();
      lastErr = new Error('HTTP ' + r.status);
    } catch (e) { lastErr = e; }
    // statsapi throttles bursts; back off rather than give up on a team.
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  throw new Error('MLB Stats API unreachable: ' + url + ' (' + (lastErr && lastErr.message) + ')');
}

// Teams that could not field five active pitchers with a start, and the relief
// lines that were projected into a starting role, both reported at the end of a
// run so the correction is never silent.
const thinRotations = [];
const relievedRows = [];

// League starter-minus-reliever ERA gap for THIS season, weighted by innings and
// measured from the pitchers this script already pulls. Relief innings are
// cheaper than starting innings every season, but by how much moves year to
// year, so it is measured rather than assumed. Clamped to a sane band so a
// half-populated early-season sample cannot produce an absurd correction.
const ROLE_GAP_MIN = 0.35;
const ROLE_GAP_MAX = 1.40;
const ROLE_GAP_FALLBACK = 0.70;
const roleSample = { startIp: 0, startEr: 0, reliefIp: 0, reliefEr: 0 };
let roleGapCache = null;

function observeForRoleGap(row) {
  // Earned runs are reconstructed from ERA and IP because the per-role split is
  // not in this payload; over hundreds of pitchers that is exact enough for a
  // league-level gap.
  if (!Number.isFinite(row.era) || !(row.ip > 0)) return;
  const er = (row.era * row.ip) / 9;
  // A swing man is neither, so only clear roles inform the gap.
  if (row.gs >= 10) { roleSample.startIp += row.ip; roleSample.startEr += er; }
  else if (row.gs === 0) { roleSample.reliefIp += row.ip; roleSample.reliefEr += er; }
}

function roleGap() {
  if (roleGapCache != null) return roleGapCache;
  const { startIp, startEr, reliefIp, reliefEr } = roleSample;
  // Guarded because this is only meaningful once the whole league has been
  // read. Calling it mid-sweep once cached a single club's sample as the
  // league gap, which is how a measured correction turns into a made-up one.
  if (startIp < 5000 || reliefIp < 5000) {
    roleGapCache = ROLE_GAP_FALLBACK;
    return roleGapCache;
  }
  const startEra = (startEr * 9) / startIp;
  const reliefEra = (reliefEr * 9) / reliefIp;
  roleGapCache = clamp(Number((startEra - reliefEra).toFixed(2)), ROLE_GAP_MIN, ROLE_GAP_MAX);
  return roleGapCache;
}

async function rotationFor(abbr) {
  const id = MLB_TEAM_IDS[abbr];
  const roster = await getJson('https://statsapi.mlb.com/api/v1/teams/' + id + '/roster?rosterType=active');
  const pitchers = (roster.roster || []).filter((r) => /P/.test((r.position && r.position.abbreviation) || ''));
  if (pitchers.length < ROWS_PER_TEAM) {
    throw new Error(abbr + ' active roster returned only ' + pitchers.length + ' pitchers');
  }
  const people = await getJson(
    'https://statsapi.mlb.com/api/v1/people?personIds=' + pitchers.map((p) => p.person.id).join(',') +
    '&hydrate=stats(group=[pitching],type=[season],season=' + SEASON + ',gameType=R)');

  const rows = (people.people || []).map((p) => {
    const split = (((p.stats || [])[0] || {}).splits || [])[0];
    const stat = split ? split.stat : null;
    const era = stat && stat.era != null && stat.era !== '-.--' ? Number(stat.era) : null;
    return {
      name: p.fullName,
      gs: stat ? Number(stat.gamesStarted || 0) : 0,
      ip: stat ? inningsToNumber(stat.inningsPitched) : 0,
      era: Number.isFinite(era) ? Number(era.toFixed(2)) : null,
    };
  });
  if (rows.length < ROWS_PER_TEAM) throw new Error(abbr + ' resolved only ' + rows.length + ' pitcher stat rows');
  rows.forEach(observeForRoleGap);

  const starters = rows.filter((r) => r.gs >= 1).sort((a, b) => b.gs - a.gs || b.ip - a.ip);
  const rest = rows.filter((r) => r.gs < 1).sort((a, b) => b.ip - a.ip);
  const picked = starters.concat(rest).slice(0, ROWS_PER_TEAM);
  if (picked.length !== ROWS_PER_TEAM) throw new Error(abbr + ' could not fill ' + ROWS_PER_TEAM + ' rotation rows');
  if (starters.length < ROWS_PER_TEAM) {
    thinRotations.push(abbr + ' (' + starters.length + ' active pitchers with a start)');
  }

  return picked;
}

/**
 * Turn one team's picked pitchers into engine rows.
 *
 * Split out of rotationFor so it runs AFTER every team has been read: the
 * relief-to-starting correction is a league measurement, and a league
 * measurement cannot be taken while the league is still being fetched.
 */
function rowsFor(abbr, picked) {
  const taken = new Set();
  return picked.map((row) => {
    // 4.30 is the engine's league-average anchor: a pitcher with no season line
    // gets an exactly average profile rather than an invented one.
    let era = row.era == null ? 4.30 : row.era;
    // A pitcher who has not started is being listed in a rotation slot only
    // because his club cannot field five active starters. His relief ERA is not
    // a starting-role expectation: relievers face a batter once, in short
    // outings, and the same arm gives up more runs per inning as a starter.
    // Publishing the raw relief line hands the club an ace it does not have --
    // measured 2026-08-26, it made a 2.61 relief ERA into a quality of 120,
    // the best rotation row on that team. The correction is the league's OWN
    // starter-minus-reliever ERA gap for this season, measured from the same
    // active rosters this script already reads, never a remembered constant.
    if (row.gs < 1) {
      era = Number((era + roleGap()).toFixed(2));
      relievedRows.push(abbr + ' ' + row.name + ' (' + row.era + ' relief -> ' + era + ' projected starting)');
    }
    return [slugId(row.name, taken), row.name, qualityFromEra(era), era];
  });
}

function renderLiteral(table) {
  const lines = TEAM_ORDER.map((abbr) => {
    const inner = table[abbr]
      .map((r) => "['" + r[0] + "', \"" + r[1].replace(/"/g, '\\"') + '", ' + r[2] + ', ' + r[3] + ']')
      .join(', ');
    return '        ' + abbr + ': [' + inner + ']';
  });
  return 'var CURRENT_PITCHERS = {\n' + lines.join(',\n') + '\n    };';
}

/** Today in UTC as YYYY-MM-DD. The engine prints this date to users. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Rewrite the two dates the engine SHOWS, and the header comment above the
 * table.
 *
 * Rewriting only the table left these frozen at 2026-08-04 while the data
 * underneath moved every week, so the one line whose whole job is to say how
 * old the fallback is was the only line that was wrong.
 *
 * Deliberately narrow. Three other occurrences of that date live in a comment
 * explaining a past parser bug ("2026-08-04" vs "12-7"); those are prose about
 * a specific historical example and rewriting them would destroy the
 * explanation.
 */
function stampRegenDate(text, date) {
  let n = 0;
  const out = text
    .replace(/(regenerated )\d{4}-\d{2}-\d{2}/g, (m, pre) => { n += 1; return pre + date; })
    .replace(/(season pitching stats on )\d{4}-\d{2}-\d{2}/g, (m, pre) => { n += 1; return pre + date; });
  if (n !== 3) {
    throw new Error('expected to stamp 3 regeneration dates, stamped ' + n + ' - the engine wording moved');
  }
  return out;
}

(async () => {
  const source = fs.readFileSync(ENGINE, 'utf8');
  const start = source.indexOf('var CURRENT_PITCHERS = {');
  if (start < 0) throw new Error('CURRENT_PITCHERS anchor not found in ' + ENGINE);
  const end = source.indexOf('};', start);
  if (end < 0) throw new Error('CURRENT_PITCHERS block is not terminated');

  const picks = {};
  for (const abbr of TEAM_ORDER) {
    picks[abbr] = await rotationFor(abbr);
    process.stderr.write(abbr + ' ');
    await new Promise((r) => setTimeout(r, 300));
  }
  process.stderr.write('\n');
  // Nothing is written unless all 30 teams came back clean - a partial refresh
  // would silently leave some teams on last week's rotation.
  const missing = TEAM_ORDER.filter((a) => !picks[a] || picks[a].length !== ROWS_PER_TEAM);
  if (missing.length) throw new Error('incomplete refresh, refusing to write: ' + missing.join(','));

  // Every team is in hand, so the league gap is now measurable.
  const table = {};
  for (const abbr of TEAM_ORDER) table[abbr] = rowsFor(abbr, picks[abbr]);

  const literal = renderLiteral(table);
  const current = source.slice(start, end + 2);
  if (current === literal) {
    console.log('CURRENT_PITCHERS already current for all 30 teams - no change.');
    process.exit(0);
  }

  const changedTeams = TEAM_ORDER.filter((abbr) => {
    const was = new RegExp('\\n\\s*' + abbr + ': \\[.*', 'g').exec(current);
    const now = new RegExp('\\n\\s*' + abbr + ': \\[.*', 'g').exec(literal);
    return !was || !now || was[0] !== now[0];
  });
  console.log('CURRENT_PITCHERS drift on ' + changedTeams.length + ' team(s): ' + changedTeams.join(', '));
  if (thinRotations.length) {
    console.log('Fewer than ' + ROWS_PER_TEAM + ' active pitchers with a start: ' + thinRotations.join(', '));
    console.log('League starter-minus-reliever ERA gap applied: +' + roleGap().toFixed(2));
    relievedRows.forEach((r) => console.log('  ' + r));
  }

  if (CHECK_ONLY) {
    console.log('--check: not writing.');
    process.exit(1);
  }

  let updated = source.slice(0, start) + literal + source.slice(end + 2);
  updated = stampRegenDate(updated, today());
  fs.writeFileSync(ENGINE, updated);
  // The C: drive has intermittently written files as all-NULL bytes; never leave
  // a corrupted engine behind for a workflow to commit.
  const bytes = fs.readFileSync(ENGINE);
  if (!bytes.length || bytes.includes(0)) throw new Error('engine file wrote back empty or NULL-corrupted - aborting');
  new (require('vm').Script)(bytes.toString('utf8'), { filename: ENGINE });
  console.log('Updated ' + ENGINE + ' (' + bytes.length + ' bytes, parses clean).');
})().catch((error) => {
  console.error('FAIL: ' + error.message);
  process.exit(1);
});
