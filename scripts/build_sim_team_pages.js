#!/usr/bin/env node
'use strict';

/**
 * build_sim_team_pages.js -- one page per club, for the query nobody was
 * answering.
 *
 * The hubs answer "NBA game simulator" and the matchup pages answer "Lakers vs
 * Celtics simulator". Between them sits a family neither covers -- somebody
 * searching for one team, wanting to know what the model makes of it and what
 * they can do with it -- and an empty result there is a visitor who leaves.
 *
 * WHAT KEEPS THIS FROM BEING A DOORWAY PAGE. A page generated per team is the
 * classic way to manufacture thin content, and the only defence is that each one
 * has to be worth reading on its own. Every page below carries that club's real
 * record, its real season profile, its actual rotation or lines with real
 * per-game numbers, where the model's own rating fit places it among thirty or
 * thirty-two, and links to the matchups it appears in. None of that is shared
 * between pages, none of it is spun from a template with the names swapped, and
 * a page that cannot be built from real data is not written at all.
 *
 *   node scripts/build_sim_team_pages.js --check
 *   node scripts/build_sim_team_pages.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : fallback;
};
const CHECK = process.argv.includes('--check');
const BACKEND = path.resolve(ROOT, arg('--backend', '../trustmyrecord-backend'));
const SITE = 'https://trustmyrecord.com';
const NL = String.fromCharCode(10);

function requireBackend(rel) {
  return require(path.join(BACKEND, rel));
}

const nbaTeams = requireBackend('routes/nbaPublic').listTeams;
const nhlTeams = requireBackend('routes/nhlPublic').listTeams;
const nbaModel = requireBackend('services/nba/nbaRatings').getModel;
const nhlModel = requireBackend('services/nhl/nhlRatings').getModel;

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const n1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const n2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
const ord = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const cssHash = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(ROOT, 'static', 'css', 'tmr-sim-arena.css')))
  .digest('hex').slice(0, 12);

/* -------------------------------------------------------------- the shell -- */

function pageShell(o) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}" />
<link rel="canonical" href="${o.url}" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta property="og:title" content="${esc(o.ogTitle)}" />
<meta property="og:description" content="${esc(o.description)}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${o.url}" />
<meta property="og:site_name" content="TrustMyRecord" />
<meta property="og:image" content="${SITE}/static/og/og-home.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(o.ogTitle)}" />
<meta name="twitter:description" content="${esc(o.description)}" />
<meta name="twitter:image" content="${SITE}/static/og/og-home.png" />
<link rel="icon" type="image/png" href="/static/favicon.png">
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: o.hubName, item: SITE + o.hubPath },
      { '@type': 'ListItem', position: 3, name: o.crumb, item: o.url },
    ],
  })}
</script>
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: o.title,
    url: o.url,
    description: o.description,
    isPartOf: { '@type': 'WebSite', name: 'TrustMyRecord', url: SITE + '/' },
    about: { '@type': 'SportsTeam', name: o.teamName, sport: o.sportName },
    publisher: { '@type': 'Organization', name: 'TrustMyRecord', url: SITE + '/' },
  })}
</script>
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: o.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  })}
</script>
<link rel="stylesheet" href="/static/css/tmr-sim-arena.css?v=${cssHash}">
<link rel="stylesheet" href="/static/css/tmr-linkhub.css?v=fa4ea64c6c4a">
<script defer src="/static/js/tmr-linkhub.js?v=b4e9b31be5d3"></script>
<script src="/static/js/tmr-analytics.js?v=d9a28154fb06"></script>
<link rel="stylesheet" href="/static/css/tmr-ds.9daf47af9804.css">
</head>
<body class="tmr-ds-shell tmr-ds--dark">
<div id="dsNavReserve" aria-hidden="true" style="height:70px"></div>
<script>
(function () {
  var r = document.getElementById('dsNavReserve');
  if (!r) return;
  var drop = function () { if (r && r.parentNode) { r.parentNode.removeChild(r); r = null; } };
  if (document.querySelector('nav.ds-nav')) return drop();
  var o = new MutationObserver(function () {
    if (document.querySelector('nav.ds-nav')) { o.disconnect(); drop(); }
  });
  o.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', function () {
    setTimeout(function () { o.disconnect(); drop(); }, 2000);
  });
}());
</script>

<main class="wrap">
  <nav class="dim" aria-label="Breadcrumb" style="padding-top:18px">
    <a href="/">TrustMyRecord</a> &rsaquo; <a href="${o.hubPath}">${esc(o.hubName)}</a> &rsaquo; ${esc(o.crumb)}
  </nav>

  <section class="hero">
    <h1>${esc(o.h1)}</h1>
    <p>${esc(o.standfirst)}</p>
    <p><a class="btn" href="${o.simLink}">Simulate a ${esc(o.nickname)} game</a></p>
  </section>

${o.body}

  <section class="panel">
    <h2>Common questions</h2>
${o.faq.map((f) => `    <div class="qa"><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join(NL)}
  </section>

  <p class="disc">${esc(o.disclaimer)}</p>
</main>
<script src="/static/js/tmr-session.63f50f4d0988.js"></script><script src="/static/js/tmr-ds-nav.6a5aef783912.js"></script>
</body>
</html>
`;
}

const table = (cols, rows) => `  <div class="tablewrap"><table>
    <thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>
${rows.map((r) => `      <tr>${r.map((c, i) => `<td${i === 0 ? ' class="name"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join(NL)}
    </tbody>
  </table></div>`;

/* ----------------------------------------------------------------- pages -- */

function rankOf(list, key, higherIsBetter) {
  const sorted = list.slice().sort((a, b) => (higherIsBetter ? key(b) - key(a) : key(a) - key(b)));
  const index = new Map();
  sorted.forEach((t, i) => index.set(t.abbr, i + 1));
  return index;
}

function nbaPages(matchupsBySlug) {
  const teams = nbaTeams();
  const fit = (nbaModel().ratingFit) || null;
  const netRank = rankOf(teams, (t) => t.season.netRating, true);
  const paceRank = rankOf(teams, (t) => t.season.pace, true);
  const out = [];

  for (const t of teams) {
    const s = t.season;
    const rec = t.record;
    const rot = (t.rotation || []).slice(0, 10);
    if (!rot.length) continue;   // no rotation, no page

    const nr = netRank.get(t.abbr);
    const pr = paceRank.get(t.abbr);
    const fitNet = fit && fit.offense && fit.offense[t.abbr] !== undefined
      ? (fit.offense[t.abbr] + (fit.defense[t.abbr] || 0)) : null;

    const lead = rot[0];
    const links = matchupsBySlug.get(t.abbr) || [];

    const body = `  <section class="panel">
    <h2>How the model sees the ${esc(t.nickname)}</h2>
    <p>The simulator does not rate a team on its record. It solves every club's
    offence and defence together from results, so the ${esc(t.nickname)} are measured
    against the opponents they actually faced rather than the ones they were lucky
    or unlucky to draw. On that basis they rank ${esc(ord(nr))} of ${teams.length}
    by net rating${fitNet !== null ? `, and the opponent-adjusted fit puts them ${fitNet >= 0 ? '+' : ''}${n1(fitNet)} points a game against an average side` : ''}.</p>
${table(['Season profile', 'Team', 'Rank of ' + teams.length], [
    ['Points per game', n1(s.ppg), ord(rankOf(teams, (x) => x.season.ppg, true).get(t.abbr))],
    ['Points allowed', n1(s.oppPpg), ord(rankOf(teams, (x) => x.season.oppPpg, false).get(t.abbr))],
    ['Offensive rating', n1(s.offensiveRating), ord(rankOf(teams, (x) => x.season.offensiveRating, true).get(t.abbr))],
    ['Defensive rating', n1(s.defensiveRating), ord(rankOf(teams, (x) => x.season.defensiveRating, false).get(t.abbr))],
    ['Net rating', (s.netRating >= 0 ? '+' : '') + n1(s.netRating), ord(nr)],
    ['Pace', n1(s.pace), ord(pr)],
  ])}
    <p class="disc">Season figures from the current data snapshot. Ranks are among
    the ${teams.length} clubs in that snapshot.</p>
  </section>

  <section class="panel">
    <h2>The rotation the simulator dresses</h2>
    <p>Every simulated ${esc(t.nickname)} game is played by these men, at these
    minutes, at their own per-minute rates. ${esc(lead.name)} carries the largest
    share at ${n1(lead.minutes)} minutes a night. A player listed out is removed and
    his minutes pass to the next man up, which changes the projection rather than
    only the box score.</p>
${table(['Player', 'Pos', 'MIN', 'PPG', 'RPG', 'APG'],
    rot.map((p) => [p.name, p.pos, n1(p.minutes), n1(p.season.ppg), n1(p.season.rpg), n1(p.season.apg)]))}
${(t.unavailable && t.unavailable.length)
    ? `    <p class="pill warn">Currently listed out: ${esc(t.unavailable.map((x) => x.name).join(', '))}.</p>`
    : '    <p class="dim">Nobody in this rotation is currently listed out.</p>'}
  </section>

  <section class="panel">
    <h2>Simulate a ${esc(t.nickname)} matchup</h2>
    <p>Pick an opponent and the simulator plays the game possession by possession:
    a full box score, a quarter-by-quarter line, win probability, and the range of
    outcomes behind the projection.</p>
${links.length ? `    <ul class="linklist">
${links.map((l) => `      <li><a href="${l.href}">${esc(l.label)}</a></li>`).join(NL)}
    </ul>` : '    <p class="dim">Build any matchup from the simulator itself.</p>'}
    <p><a class="btn" href="/nba-simulator/?home=${esc(t.slug)}">Open the simulator with the ${esc(t.nickname)} at home</a></p>
  </section>`;

    out.push({
      dir: path.join(ROOT, 'nba-simulator', 'teams', t.slug),
      url: `${SITE}/nba-simulator/teams/${t.slug}/`,
      html: pageShell({
        title: `${t.name} Simulator: Simulate ${t.nickname} Games & Box Scores | TrustMyRecord`,
        ogTitle: `${t.name} game simulator`,
        description: `Simulate any ${t.name} matchup. ${rec ? `${rec.wins}-${rec.losses} this season, ` : ''}`
          + `${n1(s.ppg)} points a game at a ${n1(s.pace)} pace, ${ord(nr)} of ${teams.length} by net rating. `
          + `Full box score, quarter scores and win probability.`,
        url: `${SITE}/nba-simulator/teams/${t.slug}/`,
        hubName: 'NBA Simulator',
        hubPath: '/nba-simulator/',
        crumb: t.name,
        teamName: t.name,
        sportName: 'Basketball',
        h1: `${t.name} Simulator`,
        nickname: t.nickname,
        simLink: `/nba-simulator/?home=${t.slug}`,
        standfirst: `${rec ? `${rec.wins}-${rec.losses}. ` : ''}`
          + `${n1(s.ppg)} points a game, ${n1(s.oppPpg)} allowed, ${ord(nr)} of ${teams.length} by net rating. `
          + `Simulate any ${t.nickname} matchup with the current rotation and get a full box score.`,
        body,
        faq: [
          {
            q: `How does the ${t.nickname} simulator decide a score?`,
            a: `It plays the game possession by possession with the ${t.nickname} rotation on the floor. `
              + `Each possession ends in a shot, a turnover or a foul drawn by a named player at his own rate, `
              + `so the box score adds up to the final score rather than being distributed to fit it. `
              + `Team strength comes from an opponent-adjusted fit solved from results, which currently ranks `
              + `the ${t.nickname} ${ord(nr)} of ${teams.length}.`,
          },
          {
            q: `Does it use the current ${t.nickname} roster?`,
            a: `Yes. Rosters, rotations and injury designations are refreshed from the data provider several `
              + `times a day, and every simulation states how old its data is. `
              + `${(t.unavailable && t.unavailable.length) ? `${t.unavailable.map((x) => x.name).join(', ')} `
                + `${t.unavailable.length === 1 ? 'is' : 'are'} currently listed out and removed from the rotation.`
                : 'Nobody in the rotation is currently listed out.'}`,
          },
          {
            q: `Can I sit a ${t.nickname} player and see what changes?`,
            a: `Yes. Any player can be held out or put on a minutes restriction, and the projection, the box `
              + `score and the player ranges are all rebuilt without him. The page reports how far the answer `
              + `moved rather than leaving two screens to be compared.`,
          },
        ],
        disclaimer: 'Simulated results are model output, not predictions of real games, and not betting advice.',
      }),
    });
  }
  return out;
}

function nhlPages(matchupsBySlug) {
  const teams = nhlTeams();
  const out = [];
  const diffRank = rankOf(teams, (t) => t.season.goalsFor - t.season.goalsAgainst, true);
  const ppRank = rankOf(teams, (t) => t.season.powerPlayPct, true);
  const pkRank = rankOf(teams, (t) => t.season.penaltyKillPct, true);

  for (const t of teams) {
    const s = t.season;
    const rec = t.record;
    const fwd = (t.lineup && t.lineup.forwards) || [];
    const def = (t.lineup && t.lineup.defence) || [];
    const goalies = (t.goalies || []).slice(0, 2);
    if (!fwd.length || !def.length) continue;

    const dr = diffRank.get(t.abbr);
    const starter = goalies[0];
    const links = matchupsBySlug.get(t.abbr) || [];

    const body = `  <section class="panel">
    <h2>How the model sees the ${esc(t.nickname)}</h2>
    <p>Hockey is a small number of rare events, so the simulator is built on shot
    volume and the rate at which shots become goals rather than on possessions.
    The ${esc(t.nickname)} generate ${n1(s.shotsFor)} shots a game and concede
    ${n1(s.shotsAgainst)}, and they sit ${esc(ord(dr))} of ${teams.length} on goal
    difference.</p>
${table(['Season profile', 'Team', 'Rank of ' + teams.length], [
    ['Goals for', n2(s.goalsFor), ord(rankOf(teams, (x) => x.season.goalsFor, true).get(t.abbr))],
    ['Goals against', n2(s.goalsAgainst), ord(rankOf(teams, (x) => x.season.goalsAgainst, false).get(t.abbr))],
    ['Shots for', n1(s.shotsFor), ord(rankOf(teams, (x) => x.season.shotsFor, true).get(t.abbr))],
    ['Shots against', n1(s.shotsAgainst), ord(rankOf(teams, (x) => x.season.shotsAgainst, false).get(t.abbr))],
    ['Power play', n1(s.powerPlayPct) + '%', ord(ppRank.get(t.abbr))],
    ['Penalty kill', n1(s.penaltyKillPct) + '%', ord(pkRank.get(t.abbr))],
    ['Faceoffs', n1(s.faceoffPct) + '%', ord(rankOf(teams, (x) => x.season.faceoffPct, true).get(t.abbr))],
  ])}
  </section>

  <section class="panel">
    <h2>The lineup the simulator dresses</h2>
    <p>Twelve forwards and six defencemen, at the ice time their roles carry, each
    scoring, shooting, hitting and taking penalties at his own per-sixty rate.
    ${starter ? `${esc(starter.name)} is the projected starter on a ${starter.savePct.toFixed(3).replace(/^0/, '')} save percentage` : 'The starting goaltender is chosen on the simulator itself'}.</p>
${table(['Forward', 'Line', 'TOI', 'G', 'A', 'P'],
    fwd.slice(0, 12).map((p) => [p.name, 'F' + (p.line || 1), n1(p.toi),
      p.season ? p.season.g : '--', p.season ? p.season.a : '--', p.season ? p.season.pts : '--']))}
${table(['Defence', 'Pair', 'TOI', 'G', 'A', 'P'],
    def.slice(0, 6).map((p) => [p.name, 'D' + (p.pair || 1), n1(p.toi),
      p.season ? p.season.g : '--', p.season ? p.season.a : '--', p.season ? p.season.pts : '--']))}
${goalies.length ? table(['Goaltender', 'GS', 'SV%', 'GAA'],
    goalies.map((g) => [g.name, g.gamesStarted, g.savePct.toFixed(3).replace(/^0/, ''), n2(g.gaa)])) : ''}
  </section>

  <section class="panel">
    <h2>Simulate a ${esc(t.nickname)} matchup</h2>
    <p>Pick an opponent and the game is played on a clock, five skaters a side
    until somebody takes a penalty: a scoring summary with the strength on every
    goal, a penalty summary, full skater and goaltender lines, and the range of
    outcomes behind the projection. The starting goaltender is a control, and
    changing him moves the projection.</p>
${links.length ? `    <ul class="linklist">
${links.map((l) => `      <li><a href="${l.href}">${esc(l.label)}</a></li>`).join(NL)}
    </ul>` : '    <p class="dim">Build any matchup from the simulator itself.</p>'}
    <p><a class="btn" href="/nhl-simulator/?home=${esc(t.slug)}">Open the simulator with the ${esc(t.nickname)} at home</a></p>
  </section>`;

    out.push({
      dir: path.join(ROOT, 'nhl-simulator', 'teams', t.slug),
      url: `${SITE}/nhl-simulator/teams/${t.slug}/`,
      html: pageShell({
        title: `${t.name} Simulator: Simulate ${t.nickname} Games & Box Scores | TrustMyRecord`,
        ogTitle: `${t.name} game simulator`,
        description: `Simulate any ${t.name} matchup. `
          + `${rec ? `${rec.wins}-${rec.losses}-${rec.otLosses}, ` : ''}`
          + `${n2(s.goalsFor)} goals for and ${n2(s.goalsAgainst)} against, ${ord(dr)} of ${teams.length} on goal difference. `
          + `Scoring summary, skater and goaltender lines, win probability.`,
        url: `${SITE}/nhl-simulator/teams/${t.slug}/`,
        hubName: 'NHL Simulator',
        hubPath: '/nhl-simulator/',
        crumb: t.name,
        teamName: t.name,
        sportName: 'Ice Hockey',
        h1: `${t.name} Simulator`,
        nickname: t.nickname,
        simLink: `/nhl-simulator/?home=${t.slug}`,
        standfirst: `${rec ? `${rec.wins}-${rec.losses}-${rec.otLosses}. ` : ''}`
          + `${n2(s.goalsFor)} goals a game, ${n2(s.goalsAgainst)} allowed, ${ord(dr)} of ${teams.length} on goal difference. `
          + `Simulate any ${t.nickname} matchup with the current lineup and starting goaltender.`,
        body,
        faq: [
          {
            q: `How does the ${t.nickname} simulator decide a score?`,
            a: `It plays the game on a clock with five skaters a side until somebody takes a penalty. Shots are `
              + `generated by the men on the ice, converted at their own finishing rates against the opposing `
              + `goaltender, and every goal in the summary is an event the simulation played, at the strength it `
              + `was played at. The ${t.nickname} currently sit ${ord(dr)} of ${teams.length} on goal difference.`,
          },
          {
            q: `Does the starting goaltender matter?`,
            a: `Yes, and it is a control rather than an assumption. `
              + `${starter ? `${starter.name} is the projected starter on a ${starter.savePct.toFixed(3).replace(/^0/, '')} save percentage. ` : ''}`
              + `Choosing a different goaltender changes the expected goals against and moves the projection, `
              + `because his save percentage is an input to the model rather than a note on the page. `
              + `Starters are labelled projected, not confirmed.`,
          },
          {
            q: `Can I scratch a ${t.nickname} skater?`,
            a: `Yes. Any skater can be scratched: the next man up comes off the pool, the ice time is `
              + `re-allocated across the lineup, and the goal projection loses the difference between what the `
              + `scratch produced per sixty and what his position-mates produce. The page reports what the change `
              + `was worth.`,
          },
        ],
        disclaimer: 'Simulated results are model output, not predictions of real games, and not betting advice.',
      }),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ main -- */

(function main() {
  // Which matchup pages each club already appears in, so a team page links to
  // the pages that exist rather than to guesses.
  const listFile = path.join(ROOT, 'scripts', 'sim-matchup-urls.txt');
  const bySlugNba = new Map();
  const bySlugNhl = new Map();
  if (fs.existsSync(listFile)) {
    const slugOf = new Map();
    for (const t of nbaTeams()) slugOf.set('nba:' + t.slug.split('-').pop(), t.abbr);
    for (const t of nhlTeams()) slugOf.set('nhl:' + t.slug.split('-').pop(), t.abbr);
    for (const raw of fs.readFileSync(listFile, 'utf8').split(NL)) {
      const u = raw.trim();
      if (!u) continue;
      const m = /\/(nba|nhl)-simulator\/([a-z0-9-]+)-vs-([a-z0-9-]+)\/$/.exec(u);
      if (!m) continue;
      const sport = m[1];
      const bucket = sport === 'nba' ? bySlugNba : bySlugNhl;
      const label = m[2].replace(/-/g, ' ') + ' vs ' + m[3].replace(/-/g, ' ');
      const pretty = label.replace(/\b\w/g, (c) => c.toUpperCase()) + ' simulation';
      for (const part of [m[2], m[3]]) {
        const abbr = slugOf.get(sport + ':' + part.split('-').pop());
        if (!abbr) continue;
        if (!bucket.has(abbr)) bucket.set(abbr, []);
        if (bucket.get(abbr).length < 8) {
          bucket.get(abbr).push({ href: u.replace(SITE, ''), label: pretty });
        }
      }
    }
  }

  const pages = [...nbaPages(bySlugNba), ...nhlPages(bySlugNhl)];
  const urls = [];
  for (const p of pages) {
    urls.push(p.url);
    if (CHECK) continue;
    fs.mkdirSync(p.dir, { recursive: true });
    fs.writeFileSync(path.join(p.dir, 'index.html'), p.html);
  }

  if (!CHECK) {
    fs.writeFileSync(path.join(ROOT, 'scripts', 'sim-team-urls.txt'), urls.join(NL) + NL);
  }
  const words = pages.length
    ? Math.round(pages.reduce((t, p) => t + p.html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length, 0) / pages.length)
    : 0;
  process.stdout.write((CHECK ? '[check] ' : '') + pages.length + ' team pages, '
    + words + ' words each on average' + NL);
}());
