#!/usr/bin/env node
/* SPORTSBOOK_NEXT_LOGOS_20260904
 *
 * Generates static/js/sportsbook-next-logos.js: a team -> crest URL map for
 * every league the board serves.
 *
 * Why generated rather than hand-written: NCAAF alone is 670 programmes and
 * college crests are keyed by ESPN's numeric team id, not a guessable slug. The
 * map is built here, at build time, from ESPN's public team endpoints, and only
 * the finished map ships. The browser therefore never calls site.api.espn.com,
 * which answers 403 to browser user agents and sends no CORS headers; it only
 * loads images from a.espncdn.com, which is an image host.
 *
 *   node scripts/build-sportsbook-logos.cjs
 *
 * Re-run when a league adds or renames teams. The board falls back to an
 * initials badge for anything unmapped, so a stale map degrades quietly.
 */
const fs = require('fs');
const path = require('path');

const LEAGUES = [
    ['baseball_mlb', 'baseball/mlb'],
    ['americanfootball_nfl', 'football/nfl'],
    ['americanfootball_ncaaf', 'football/college-football'],
    ['basketball_nba', 'basketball/nba'],
    ['basketball_ncaab', 'basketball/mens-college-basketball'],
    ['basketball_wnba', 'basketball/wnba'],
    ['icehockey_nhl', 'hockey/nhl'],
    // our soccer board aggregates these competitions
    ['soccer', 'soccer/usa.1'],
    ['soccer', 'soccer/eng.1'],
    ['soccer', 'soccer/ita.1'],
    ['soccer', 'soccer/ger.1'],
    ['soccer', 'soccer/esp.1'],
    ['soccer', 'soccer/fra.1'],
    ['soccer', 'soccer/uefa.champions'],
    ['soccer', 'soccer/por.1'],
    ['soccer', 'soccer/ned.1'],
    ['soccer', 'soccer/mex.1'],
    ['soccer', 'soccer/eng.2'],
    ['soccer', 'soccer/ita.2'],
    ['soccer', 'soccer/esp.2'],
    ['soccer', 'soccer/fra.2'],
    ['soccer', 'soccer/ger.2'],
    ['soccer', 'soccer/uefa.europa'],
    ['soccer', 'soccer/bra.1'],
    ['soccer', 'soccer/arg.1'],
];

// Japan's NPB is not in ESPN's team endpoints at all. These are the club codes
// the live board's own NPB helper already uses against npb.jp, which is where
// the real crests are published. Never fall back to the ESPN map here: several
// NPB clubs share a nickname with an MLB club (Giants, Tigers, Lions) and would
// render the wrong league's crest.
const NPB_BASE = 'https://npb.jp/img/common/logo/';
const NPB = {
    'yomiuri giants': 'g', 'hanshin tigers': 't',
    'yokohama dena baystars': 'db', 'yokohama baystars': 'db',
    'hiroshima toyo carp': 'c', 'tokyo yakult swallows': 's',
    'chunichi dragons': 'd', 'fukuoka softbank hawks': 'h',
    'hokkaido nippon-ham fighters': 'f', 'chiba lotte marines': 'm',
    'tohoku rakuten golden eagles': 'e', 'saitama seibu lions': 'l',
    'orix buffaloes': 'b',
};

// Our feed and ESPN spell the same club differently often enough that a light
// normalisation misses one NCAAF team in thirteen and a third of the soccer
// board: "San Jose State" against "San Jose State", "Miami (FL)" against
// "Miami", "Tarleton St" against "Tarleton State", "SSC Napoli" against
// "Napoli". This canonical form folds those together, and the identical
// function is emitted into the runtime file so both sides always agree.
function canon(s) {
    return String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[.'’]/g, '')
        .replace(/&/g, 'and')
        .replace(/\(([^)]*)\)/g, ' ')
        .replace(/\bst\b/g, 'state')
        .replace(/\b(fc|afc|cf|sc|ssc|ac|as|ss|cd|ud|rc|bk|if|sk|club)\b/g, ' ')
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Clubs neither source spells the same way even after canonicalising.
const ALIAS = {
    americanfootball_ncaaf: {
        'app state mountaineers': 'appalachian state mountaineers',
        'louisiana monroe warhawks': 'ul monroe warhawks',
        'hawaii rainbow warriors': 'hawaii warriors',
    },
    icehockey_nhl: {
        // ESPN renamed the franchise; our feed may still send either spelling
        'utah hockey club': 'utah mammoth',
        'utah hc': 'utah mammoth',
    },
    soccer: {
        'inter': 'internazionale', 'inter milan': 'internazionale',
        'spurs': 'tottenham hotspur', 'wolves': 'wolverhampton wanderers',
        'atletico madrid': 'atletico de madrid',
        'athletic bilbao': 'athletic club',
        'los angeles fc': 'lafc',
        'new york red bulls': 'ny red bulls',
    },
};

async function fetchTeams(pathPart) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${pathPart}/teams?limit=1000`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const out = [];
    (((d.sports || [])[0] || {}).leagues || []).forEach((lg) => {
        (lg.teams || []).forEach((w) => {
            const t = w.team || {};
            const logo = (t.logos || []).map((l) => l.href).find(Boolean) || t.logo;
            if (!logo) return;
            out.push({
                logo,
                keys: [t.displayName, t.shortDisplayName, t.location, t.nickname, t.name,
                    t.location && t.name ? `${t.location} ${t.name}` : null].filter(Boolean),
            });
        });
    });
    return out;
}

(async () => {
    const map = {};
    for (const [sportKey, pathPart] of LEAGUES) {
        let teams = [];
        try { teams = await fetchTeams(pathPart); }
        catch (e) { console.log(`WARN ${pathPart}: ${e.message}`); continue; }
        map[sportKey] = map[sportKey] || {};
        let added = 0;
        teams.forEach((t) => {
            // index each name twice where a German umlaut is involved: our feed
            // transliterates o-umlaut as "oe", ESPN strips it to "o"
            const keys = [];
            t.keys.forEach((k) => {
                keys.push(k);
                const de = String(k).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
                if (de !== k) keys.push(de);
            });
            keys.forEach((k) => {
                const n = canon(k);
                // first writer wins, so a full display name is never displaced by a
                // shorter alias another club might also answer to
                if (n && !map[sportKey][n]) { map[sportKey][n] = t.logo; added++; }
            });
        });
        console.log(`${pathPart.padEnd(30)} ${String(teams.length).padStart(4)} teams, ${added} keys`);
    }

    Object.keys(ALIAS).forEach((sk) => {
        if (!map[sk]) return;
        Object.keys(ALIAS[sk]).forEach((from) => {
            const a = canon(from), b = canon(ALIAS[sk][from]);
            if (!a || !b) return;
            if (map[sk][b] && !map[sk][a]) map[sk][a] = map[sk][b];
            else if (map[sk][a] && !map[sk][b]) map[sk][b] = map[sk][a];
        });
    });

    // the club marks are re-published each season, so the path carries the year
    const NPB_YEAR = new Date().getFullYear();
    map.baseball_npb = {};
    Object.keys(NPB).forEach((k) => {
        map.baseball_npb[canon(k)] = `${NPB_BASE}${NPB_YEAR}/logo_${NPB[k]}_s.gif`;
    });

    // Nearly every URL shares one prefix, so it is stored once and the runtime
    // puts it back. That is the difference between a 255KB asset and a 90KB one.
    const PREFIX = 'https://a.espncdn.com/i/teamlogos/';
    let shortened = 0;
    Object.keys(map).forEach((sk) => {
        Object.keys(map[sk]).forEach((n) => {
            if (map[sk][n].indexOf(PREFIX) === 0) { map[sk][n] = '~' + map[sk][n].slice(PREFIX.length); shortened++; }
        });
    });

    const head = [
        '/* GENERATED by scripts/build-sportsbook-logos.cjs - do not edit by hand.',
        ' * Team crest URLs for every league the board serves, keyed by a canonical',
        ' * team name. Built from ESPN\'s public team endpoints at build time, so the',
        ' * browser only ever loads images and never calls site.api.espn.com, which',
        ' * answers 403 to browser user agents and sends no CORS headers.',
        ' * A leading ~ stands for ' + PREFIX,
        ' */',
    ].join('\n');
    const body = head + '\n' +
        'window.TMR_SBN_LOGO_PREFIX = ' + JSON.stringify(PREFIX) + ';\n' +
        'window.TMR_SBN_LOGO_CANON = ' + canon.toString() + ';\n' +
        'window.TMR_SBN_LOGOS = ' + JSON.stringify(map) + ';\n';

    const out = path.join(__dirname, '..', 'static', 'js', 'sportsbook-next-logos.js');
    fs.writeFileSync(out, body);
    const total = Object.values(map).reduce((a, m) => a + Object.keys(m).length, 0);
    console.log(`\nwrote ${out}`);
    console.log(`leagues ${Object.keys(map).length}, keys ${total}, shortened ${shortened}, ${(body.length / 1024).toFixed(1)} KB`);
})();
