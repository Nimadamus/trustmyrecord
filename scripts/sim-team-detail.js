'use strict';
/* SIM_TEAM_DETAIL_20261105. One folded table per NFL, NBA and NHL season and playoff page:
   change in printed odds since the last earlier day, what the rest of the schedule looks like,
   and for the NHL the points still needed to reach the projected playoff line.
   Every figure comes from the same bake: printed odds are kept in data/sim-odds-history.json,
   records and remaining games come from the inputs the page was built from. No market input.
   Fewer than two days of history: the change columns are left out. */
const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'data', 'sim-odds-history.json');
const KEEP_DAYS = 14;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const printed = (v) => (v == null ? null : Math.round(v * 100));
/* Same text the odds tables print for the same value. */
const shown = (v) => (!(v > 0) ? '0%' : v >= 0.995 ? '&gt;99%' : v < 0.005 ? '&lt;1%' : Math.round(v * 100) + '%');
const signed = (n) => (n > 0 ? '+' + n : String(n));

/* The Pacific calendar day a bake belongs to. */
function dayOf(when) {
  return new Date(when).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}
function dayLabel(day) {
  return new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
}

function loadHistory(file = FILE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; }
}
/* The last bake of a day wins, so a rebuild never stacks entries. */
function remember(history, sport, day, rows) {
  const s = history[sport] || (history[sport] = {});
  s[day] = {};
  rows.forEach((r) => { s[day][r.id] = [printed(r.playoffs), printed(r.title)]; });
  Object.keys(s).sort().slice(0, -KEEP_DAYS).forEach((d) => { delete s[d]; });
  return history;
}
function saveHistory(history, file = FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(history, null, 0) + '\n');
}
function previousDay(history, sport, day) {
  return Object.keys(history[sport] || {}).filter((d) => d < day).sort().pop() || null;
}

/* Games in one shape: {home, away, done, hs, as, ot}. */
function normalGames(list) {
  return list.map((g) => ({
    home: g.home, away: g.away,
    done: g.final === true || g.completed === true,
    hs: g.home_score, as: g.away_score, ot: g.extra_time === true,
  }));
}

function records(games) {
  const r = {};
  const of = (id) => r[id] || (r[id] = { w: 0, l: 0, otl: 0, t: 0, left: 0, foes: [] });
  games.forEach((g) => {
    const h = of(g.home), a = of(g.away);
    if (!g.done) {
      h.left += 1; a.left += 1; h.foes.push(g.away); a.foes.push(g.home);
      return;
    }
    if (g.hs === g.as) { h.t += 1; a.t += 1; return; }
    const win = g.hs > g.as ? h : a, lose = g.hs > g.as ? a : h;
    win.w += 1;
    if (g.ot) lose.otl += 1; else lose.l += 1;
  });
  return r;
}
const played = (x) => x.w + x.l + x.otl + x.t;
const points = (x) => 2 * x.w + x.otl;
function winPct(sport, x) {
  const gp = played(x);
  if (!gp) return null;
  return sport === 'nhl' ? points(x) / (2 * gp) : (x.w + x.t / 2) / gp;
}
/* Mean current win share of the opponents still to play, one count per game. */
function foesLeft(sport, rec, id) {
  const list = rec[id].foes.map((f) => winPct(sport, rec[f])).filter((v) => v != null);
  return list.length ? list.reduce((s, v) => s + v, 0) / list.length : null;
}

/* NHL: the points the last club in the projected field finishes on, by conference. Top three in
   each division, then the next two. */
function playoffLines(teams) {
  const out = {};
  const confs = Array.from(new Set(teams.map((t) => t.conference)));
  confs.forEach((c) => {
    const inConf = teams.filter((t) => t.conference === c);
    const field = [];
    Array.from(new Set(inConf.map((t) => t.division))).forEach((d) => {
      field.push(...inConf.filter((t) => t.division === d).sort((a, b) => b.points_mean - a.points_mean).slice(0, 3));
    });
    const rest = inConf.filter((t) => !field.includes(t)).sort((a, b) => b.points_mean - a.points_mean);
    field.push(...rest.slice(0, 2));
    out[c] = Math.round(Math.min(...field.map((t) => t.points_mean)));
  });
  return out;
}

const STYLE = '<style>.simd{margin:12px 0 0}.simd summary{cursor:pointer;font-weight:700}.simd table{width:100%;border-collapse:collapse;font-size:.86rem;margin-top:8px}'
  + '.simd th,.simd td{padding:6px 8px;text-align:right;border-top:1px solid rgba(130,175,240,.18);white-space:nowrap}.simd th:first-child{text-align:left}.simd p{font-size:.8rem;margin:8px 0 0}</style>';

/* rows: [{id, name, playoffs, title?, conference?}] */
function tableHtml({ sport, rows, games, prev, prevDay, lines }) {
  const rec = records(normalGames(games));
  const hasTitle = rows.some((r) => r.title != null);
  const nhl = sport === 'nhl';
  const heads = ['Team', 'Playoffs'];
  if (prev) heads.push('Day');
  if (hasTitle) { heads.push('Title'); if (prev) heads.push('Day'); }
  heads.push('Foes left');
  if (nhl) heads.push('To line');
  const body = rows.slice().sort((a, b) => b.playoffs - a.playoffs || a.name.localeCompare(b.name)).map((r) => {
    const was = prev && prev[r.id];
    const cells = [`<th scope="row">${esc(r.name)}</th>`, `<td>${shown(r.playoffs)}</td>`];
    if (prev) cells.push(`<td>${was && was[0] != null ? signed(printed(r.playoffs) - was[0]) : ''}</td>`);
    if (hasTitle) {
      cells.push(`<td>${shown(r.title)}</td>`);
      if (prev) cells.push(`<td>${was && was[1] != null ? signed(printed(r.title) - was[1]) : ''}</td>`);
    }
    const foes = rec[r.id] ? foesLeft(sport, rec, r.id) : null;
    cells.push(`<td>${foes == null ? '' : (foes * 100).toFixed(1) + '%'}</td>`);
    if (nhl) {
      const x = rec[r.id];
      const need = x && lines ? Math.max(0, lines[r.conference] - points(x)) : null;
      cells.push(`<td>${need == null ? '' : `${need} of ${2 * x.left}`}</td>`);
    }
    return `<tr>${cells.join('')}</tr>`;
  }).join('');
  const notes = [];
  if (prev) notes.push(`Day: points since ${esc(dayLabel(prevDay))}.`);
  notes.push('Foes left: current win rate of remaining opponents.');
  if (nhl && lines) {
    notes.push(`To line: points needed of points left to reach the projected cut (${Object.keys(lines).sort().map((c) => `${esc(c)} ${lines[c]}`).join(', ')}).`);
  }
  return `${STYLE}<details class="simd"><summary>Team detail</summary><div class="tscroll"><table aria-label="Team detail"><thead><tr>${heads.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div><p>${notes.join(' ')}</p></details>`;
}

/* The one call a builder makes. Never throws: a bake outlives this module. */
function detail({ sport, rows, games, when, teams, file }) {
  try {
    const day = dayOf(when);
    const history = loadHistory(file);
    remember(history, sport, day, rows);
    saveHistory(history, file);
    const prevDay = previousDay(history, sport, day);
    return tableHtml({
      sport, rows, games, prevDay,
      prev: prevDay ? history[sport][prevDay] : null,
      lines: sport === 'nhl' && teams ? playoffLines(teams) : null,
    });
  } catch (e) {
    console.log(`team detail skipped for ${sport}: ${e.message}`);
    return '';
  }
}

module.exports = { detail, tableHtml, remember, previousDay, records, foesLeft, winPct, playoffLines, points, dayOf, printed, FILE };
