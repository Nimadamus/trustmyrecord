(function () {
    'use strict';

    var CURRENT_TEAMS = [
        ['current-ari', 'Arizona Diamondbacks', 'ARI', 'NL', 'West', 102, 99, 98, 98, 1.03],
        ['current-atl', 'Atlanta Braves', 'ATL', 'NL', 'East', 108, 103, 104, 101, 1.05],
        ['current-bal', 'Baltimore Orioles', 'BAL', 'AL', 'East', 106, 101, 100, 100, 1.04],
        ['current-bos', 'Boston Red Sox', 'BOS', 'AL', 'East', 101, 97, 96, 97, 1.06],
        ['current-chc', 'Chicago Cubs', 'CHC', 'NL', 'Central', 101, 100, 99, 100, 1.01],
        ['current-cws', 'Chicago White Sox', 'CWS', 'AL', 'Central', 90, 88, 89, 88, 1.08],
        ['current-cin', 'Cincinnati Reds', 'CIN', 'NL', 'Central', 100, 96, 96, 97, 1.07],
        ['current-cle', 'Cleveland Guardians', 'CLE', 'AL', 'Central', 99, 104, 102, 106, 0.96],
        ['current-col', 'Colorado Rockies', 'COL', 'NL', 'West', 94, 87, 87, 89, 1.14],
        ['current-det', 'Detroit Tigers', 'DET', 'AL', 'Central', 99, 102, 103, 100, 0.99],
        ['current-hou', 'Houston Astros', 'HOU', 'AL', 'West', 104, 101, 100, 101, 1.01],
        ['current-kc', 'Kansas City Royals', 'KC', 'AL', 'Central', 100, 103, 103, 100, 0.98],
        ['current-laa', 'Los Angeles Angels', 'LAA', 'AL', 'West', 96, 92, 92, 92, 1.07],
        ['current-lad', 'Los Angeles Dodgers', 'LAD', 'NL', 'West', 114, 107, 106, 105, 1.03],
        ['current-mia', 'Miami Marlins', 'MIA', 'NL', 'East', 89, 90, 91, 90, 1.05],
        ['current-mil', 'Milwaukee Brewers', 'MIL', 'NL', 'Central', 101, 104, 102, 105, 0.97],
        ['current-min', 'Minnesota Twins', 'MIN', 'AL', 'Central', 101, 100, 100, 100, 1.02],
        ['current-nym', 'New York Mets', 'NYM', 'NL', 'East', 103, 100, 99, 101, 1.03],
        ['current-nyy', 'New York Yankees', 'NYY', 'AL', 'East', 109, 104, 103, 104, 1.02],
        ['current-ath', 'Athletics', 'ATH', 'AL', 'West', 94, 91, 91, 91, 1.08],
        ['current-phi', 'Philadelphia Phillies', 'PHI', 'NL', 'East', 107, 105, 106, 102, 1.01],
        ['current-pit', 'Pittsburgh Pirates', 'PIT', 'NL', 'Central', 94, 97, 99, 95, 1.04],
        ['current-sd', 'San Diego Padres', 'SD', 'NL', 'West', 103, 101, 101, 100, 1.02],
        ['current-sf', 'San Francisco Giants', 'SF', 'NL', 'West', 98, 99, 99, 99, 1.00],
        ['current-sea', 'Seattle Mariners', 'SEA', 'AL', 'West', 98, 106, 107, 103, 0.98],
        ['current-stl', 'St. Louis Cardinals', 'STL', 'NL', 'Central', 99, 98, 97, 99, 1.01],
        ['current-tb', 'Tampa Bay Rays', 'TB', 'AL', 'East', 100, 102, 101, 103, 0.98],
        ['current-tex', 'Texas Rangers', 'TEX', 'AL', 'West', 104, 98, 97, 98, 1.06],
        ['current-tor', 'Toronto Blue Jays', 'TOR', 'AL', 'East', 101, 101, 101, 100, 1.00],
        ['current-wsh', 'Washington Nationals', 'WSH', 'NL', 'East', 93, 92, 92, 92, 1.06]
    ];

    var HISTORICAL_TEAMS = [
        ['classic-1927-nyy', '1927 New York Yankees', 'NYY', 1927, 124, 112, 110, 101, 1.08],
        ['classic-1939-nyy', '1939 New York Yankees', 'NYY', 1939, 121, 118, 114, 106, 1.00],
        ['classic-1955-bkn', '1955 Brooklyn Dodgers', 'BKN', 1955, 113, 105, 103, 104, 1.04],
        ['classic-1961-nyy', '1961 New York Yankees', 'NYY', 1961, 118, 109, 107, 104, 1.07],
        ['classic-1969-nym', '1969 New York Mets', 'NYM', 1969, 100, 114, 116, 107, 0.94],
        ['classic-1975-cin', '1975 Cincinnati Reds', 'CIN', 1975, 115, 106, 103, 105, 0.98],
        ['classic-1984-det', '1984 Detroit Tigers', 'DET', 1984, 112, 111, 108, 110, 0.97],
        ['classic-1986-nym', '1986 New York Mets', 'NYM', 1986, 110, 112, 111, 106, 0.97],
        ['classic-1988-lad', '1988 Los Angeles Dodgers', 'LAD', 1988, 99, 112, 113, 108, 0.95],
        ['classic-1995-atl', '1995 Atlanta Braves', 'ATL', 1995, 104, 116, 119, 107, 0.93],
        ['classic-1998-nyy', '1998 New York Yankees', 'NYY', 1998, 113, 113, 110, 111, 0.95],
        ['classic-2001-sea', '2001 Seattle Mariners', 'SEA', 2001, 112, 110, 106, 111, 0.96],
        ['classic-2004-bos', '2004 Boston Red Sox', 'BOS', 2004, 114, 104, 103, 106, 1.04],
        ['classic-2016-chc', '2016 Chicago Cubs', 'CHC', 2016, 108, 114, 113, 108, 0.96],
        ['classic-2017-hou', '2017 Houston Astros', 'HOU', 2017, 116, 108, 107, 106, 1.02],
        ['classic-2019-wsh', '2019 Washington Nationals', 'WSH', 2019, 108, 105, 109, 100, 1.05],
        ['classic-2020-lad', '2020 Los Angeles Dodgers', 'LAD', 2020, 116, 112, 110, 110, 0.98],
        ['classic-2021-atl', '2021 Atlanta Braves', 'ATL', 2021, 106, 103, 104, 104, 1.04],
        ['classic-2022-hou', '2022 Houston Astros', 'HOU', 2022, 109, 114, 113, 112, 0.95],
        ['classic-2023-tex', '2023 Texas Rangers', 'TEX', 2023, 115, 101, 102, 99, 1.08]
    ];

    var CURRENT_PITCHER_PROFILES = [
        ['ace', 'Ace profile', 114, 3.25, 'Modeled simulator profile'],
        ['above', 'Above average starter', 106, 3.75, 'Modeled simulator profile'],
        ['average', 'League average starter', 100, 4.20, 'Modeled simulator profile'],
        ['backend', 'Back end starter', 92, 4.85, 'Modeled simulator profile'],
        ['bullpen', 'Bullpen game', 94, 4.65, 'Modeled simulator profile']
    ];

    var HISTORICAL_PITCHERS = {
        'classic-1927-nyy': [['hoyt', 'Waite Hoyt', 116, 2.63], ['pennock', 'Herb Pennock', 112, 3.00], ['ruether', 'Dutch Ruether', 101, 3.38]],
        'classic-1939-nyy': [['ruffing', 'Red Ruffing', 118, 2.93], ['gomez', 'Lefty Gomez', 110, 3.41], ['russo', 'Marius Russo', 104, 2.41]],
        'classic-1955-bkn': [['newcombe', 'Don Newcombe', 116, 3.20], ['podres', 'Johnny Podres', 106, 3.95], ['craig', 'Roger Craig', 99, 4.10]],
        'classic-1961-nyy': [['ford', 'Whitey Ford', 121, 3.21], ['terry', 'Ralph Terry', 107, 3.15], ['stafford', 'Bill Stafford', 102, 2.68]],
        'classic-1969-nym': [['seaver', 'Tom Seaver', 124, 2.21], ['koosman', 'Jerry Koosman', 114, 2.28], ['gentry', 'Gary Gentry', 106, 3.43]],
        'classic-1975-cin': [['nolan', 'Gary Nolan', 108, 3.16], ['gullett', 'Don Gullett', 106, 2.42], ['billingham', 'Jack Billingham', 99, 4.11]],
        'classic-1984-det': [['morris', 'Jack Morris', 113, 3.60], ['petry', 'Dan Petry', 107, 3.24], ['wilcox', 'Milt Wilcox', 101, 4.00]],
        'classic-1986-nym': [['gooden', 'Dwight Gooden', 121, 2.84], ['darling', 'Ron Darling', 109, 2.81], ['fernandez', 'Sid Fernandez', 108, 3.52]],
        'classic-1988-lad': [['hershiser', 'Orel Hershiser', 125, 2.26], ['leary', 'Tim Leary', 105, 2.91], ['belcher', 'Tim Belcher', 103, 2.91]],
        'classic-1995-atl': [['maddux', 'Greg Maddux', 130, 1.63], ['glavine', 'Tom Glavine', 116, 3.08], ['smoltz', 'John Smoltz', 112, 3.18]],
        'classic-1998-nyy': [['cone', 'David Cone', 117, 3.55], ['pettitte', 'Andy Pettitte', 111, 4.24], ['wells', 'David Wells', 115, 3.49]],
        'classic-2001-sea': [['garcia', 'Freddy Garcia', 116, 3.05], ['moyer', 'Jamie Moyer', 109, 3.43], ['sele', 'Aaron Sele', 103, 3.60]],
        'classic-2004-bos': [['schilling', 'Curt Schilling', 122, 3.26], ['martinez', 'Pedro Martinez', 118, 3.90], ['wakefield', 'Tim Wakefield', 99, 4.87]],
        'classic-2016-chc': [['arrieta', 'Jake Arrieta', 115, 3.10], ['hendricks', 'Kyle Hendricks', 120, 2.13], ['lester', 'Jon Lester', 116, 2.44]],
        'classic-2017-hou': [['keuchel', 'Dallas Keuchel', 114, 2.90], ['verlander', 'Justin Verlander', 118, 1.06], ['mccullers', 'Lance McCullers Jr.', 105, 4.25]],
        'classic-2019-wsh': [['scherzer', 'Max Scherzer', 122, 2.92], ['strasburg', 'Stephen Strasburg', 118, 3.32], ['corbin', 'Patrick Corbin', 108, 3.25]],
        'classic-2020-lad': [['kershaw', 'Clayton Kershaw', 118, 2.16], ['buehler', 'Walker Buehler', 113, 3.44], ['urias', 'Julio Urias', 107, 3.27]],
        'classic-2021-atl': [['fried', 'Max Fried', 115, 3.04], ['morton', 'Charlie Morton', 109, 3.34], ['anderson', 'Ian Anderson', 103, 3.58]],
        'classic-2022-hou': [['verlander', 'Justin Verlander', 124, 1.75], ['valdez', 'Framber Valdez', 115, 2.82], ['javier', 'Cristian Javier', 111, 2.54]],
        'classic-2023-tex': [['eovaldi', 'Nathan Eovaldi', 111, 3.63], ['montgomery', 'Jordan Montgomery', 110, 2.79], ['gray', 'Jon Gray', 101, 4.12]]
    };

    function makeCurrent(row) {
        return {
            id: row[0], era: 'current', name: row[1], abbreviation: row[2], league: row[3], division: row[4],
            offense: row[5], runPrevention: row[6], startingPitching: row[7], bullpen: row[8], volatility: row[9]
        };
    }

    function makeHistorical(row) {
        return {
            id: row[0], era: 'historical', name: row[1], abbreviation: row[2], season: row[3], league: 'Classic', division: 'Curated',
            offense: row[4], runPrevention: row[5], startingPitching: row[6], bullpen: row[7], volatility: row[8]
        };
    }

    var LOCAL_TEAMS = {
        current: CURRENT_TEAMS.map(makeCurrent),
        historical: HISTORICAL_TEAMS.map(makeHistorical)
    };

    var LIVE_INPUT_SOURCES = [
        ['scheduleFinals', 'MLB schedule/finals', 'Unavailable', 'No verified current schedule or final score match is connected.'],
        ['teamRecords', 'Team records', 'Unavailable', 'No verified team record match is connected.'],
        ['startingPitchers', 'Probable starters', 'Unavailable', 'No probable starter feed is connected.'],
        ['confirmedStarters', 'Confirmed starter status', 'Unavailable', 'No confirmed-starter status feed is connected.'],
        ['ballpark', 'Ballpark', 'Unavailable', 'No verified venue feed is connected.'],
        ['weather', 'Weather', 'Unavailable', 'No verified weather feed is connected.'],
        ['sportsbookOdds', 'Sportsbook odds', 'Unavailable', 'No verified sportsbook source is connected.'],
        ['injuryReport', 'Injury report', 'Unavailable', 'No verified injury report feed is connected.'],
        ['rosterContext', 'Roster context', 'Unavailable', 'No verified player roster feed is connected.'],
        ['recentForm', 'Recent scoring form', 'Unavailable', 'No verified recent final-score feed is connected.'],
        ['bullpenContext', 'Bullpen context', 'Unavailable', 'No verified bullpen availability feed is connected.']
    ].map(function (row) { return { key: row[0], label: row[1], status: row[2], detail: row[3], verified: false }; });

    var state = {
        preset: 'current',
        awayPool: 'current',
        homePool: 'current',
        teams: LOCAL_TEAMS,
        dataMode: 'baseline',
        liveInputs: LIVE_INPUT_SOURCES,
        liveContext: {
            status: 'idle',
            loadedAt: null,
            scheduleGames: [],
            boardGames: [],
            espnEvents: [],
            espnSummaries: {},
            recentEvents: [],
            error: null
        },
        awayTeamId: LOCAL_TEAMS.current[0].id,
        homeTeamId: LOCAL_TEAMS.current[1].id,
        awayPitcherId: '',
        homePitcherId: '',
        awayPitcherTouched: false,
        homePitcherTouched: false,
        simulation: null
    };

    function byId(id) { return document.getElementById(id); }
    function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
    function round1(value) { return Math.round(value * 10) / 10; }
    function roundPct(value) { return (value * 100).toFixed(1).replace(/\.0$/, '') + '%'; }
    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function setText(id, value) { var el = byId(id); if (el) el.textContent = value; }
    function normalizeName(value) { return String(value || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, ''); }
    function todayEspnDate() { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }
    function espnDateOffset(daysBack) {
        var d = new Date();
        d.setDate(d.getDate() - daysBack);
        return d.toISOString().slice(0, 10).replace(/-/g, '');
    }
    function recentEspnDates() {
        var dates = [];
        for (var i = 0; i <= 6; i += 1) dates.push(espnDateOffset(i));
        return dates;
    }
    function apiBaseUrl() {
        if (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.api && CONFIG.api.baseUrl) return CONFIG.api.baseUrl;
        return 'https://trustmyrecord-api.onrender.com/api';
    }
    function fetchJson(url) {
        if (typeof fetch !== 'function') return Promise.reject(new Error('fetch unavailable'));
        return fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        });
    }

    function poolTeams(pool) { return state.teams[pool] || []; }
    function activeTeams() { return poolTeams(state.awayPool).concat(poolTeams(state.homePool)); }
    function findTeamInPool(id, pool) { return poolTeams(pool).filter(function (team) { return team.id === id; })[0] || null; }
    function findTeam(id) {
        return poolTeams('current').concat(poolTeams('historical')).filter(function (team) { return team.id === id; })[0] || null;
    }
    function eraLabel(team) {
        if (!team) return 'Select team';
        return team.era === 'historical' ? 'Classic ' + team.season : 'Current MLB';
    }
    function teamMeta(team) {
        if (!team) return 'No team selected';
        return team.era === 'historical' ? [team.abbreviation, team.season, 'Historical'].join(' / ') : [team.abbreviation, team.league, team.division].join(' / ');
    }
    function pitcherId(side, slug) { return side + '-pitcher-' + slug; }
    function slugify(value) { return normalizeName(value).slice(0, 40) || 'starter'; }
    function currentPitchersForTeam(team, side, context) {
        var liveStarter = context && context.espnGame ? (side === 'away' ? context.espnGame.awayStarter : context.espnGame.homeStarter) : null;
        var options = [];
        if (liveStarter && liveStarter.name) {
            options.push({
                id: pitcherId(side, 'live-' + slugify(liveStarter.name)),
                name: liveStarter.name,
                quality: 104 + clamp((4.2 - (Number.isFinite(liveStarter.era) ? liveStarter.era : 4.2)) * 8, -12, 16),
                era: Number.isFinite(liveStarter.era) ? liveStarter.era : null,
                source: 'Verified ESPN probable starter',
                verified: true,
                note: liveStarter.record || 'Listed by ESPN as probable'
            });
        }
        var profileRows = liveStarter && liveStarter.name ? CURRENT_PITCHER_PROFILES.filter(function (row) { return row[0] !== 'ace'; }) : CURRENT_PITCHER_PROFILES;
        profileRows.forEach(function (row) {
            options.push({
                id: pitcherId(side, team.id + '-' + row[0]),
                name: team.abbreviation + ' ' + row[1],
                quality: row[2],
                era: row[3],
                source: row[4],
                verified: false,
                note: 'Manual simulator profile; not a real named starter'
            });
        });
        return options;
    }
    function historicalPitchersForTeam(team, side) {
        var rows = HISTORICAL_PITCHERS[team.id] || [];
        if (!rows.length) {
            rows = [['ace', team.season + ' baseline ace', team.startingPitching + 6, 3.2], ['mid', team.season + ' baseline starter', team.startingPitching, 4.0], ['depth', team.season + ' depth starter', team.startingPitching - 8, 4.7]];
        }
        rows = rows.slice();
        if (rows.length < 5) rows.push(['era-average', team.season + ' era-average starter', team.startingPitching - 3, 4.05]);
        if (rows.length < 5) rows.push(['staff-game', team.season + ' staff game', team.startingPitching - 10, 4.75]);
        return rows.map(function (row) {
            return {
                id: pitcherId(side, team.id + '-' + row[0]),
                name: row[1],
                quality: row[2],
                era: row[3],
                source: 'Historical simulator input',
                verified: false,
                note: 'Curated historical simulator input; not live verified starter data'
            };
        });
    }
    function pitcherOptionsFor(team, side, context) {
        if (!team) return [];
        return team.era === 'historical' ? historicalPitchersForTeam(team, side) : currentPitchersForTeam(team, side, context);
    }
    function selectedPitcher(side, team, context) {
        var options = pitcherOptionsFor(team, side, context);
        var selectedId = side === 'away' ? state.awayPitcherId : state.homePitcherId;
        return options.filter(function (pitcher) { return pitcher.id === selectedId; })[0] || options[0] || null;
    }
    function pitcherMeta(pitcher) {
        if (!pitcher) return 'No pitcher selected.';
        return pitcher.source + (pitcher.era != null ? ' / model ERA ' + pitcher.era : '') + ' / rating ' + Math.round(pitcher.quality) + (pitcher.note ? ' / ' + pitcher.note : '');
    }
    function pitcherChoiceButton(pitcher, selected) {
        return '<button type="button" class="pitcher-choice' + (selected ? ' selected' : '') + '" data-pitcher-id="' + escapeHtml(pitcher.id) + '" aria-checked="' + (selected ? 'true' : 'false') + '" role="radio">' +
            '<strong>' + escapeHtml(pitcher.name) + '</strong>' +
            '<span>' + escapeHtml(pitcher.verified ? 'Verified probable starter' : pitcher.source) + '</span>' +
            '<small>' + escapeHtml((pitcher.era != null ? 'Model ERA ' + pitcher.era + ' / ' : '') + 'Rating ' + Math.round(pitcher.quality)) + '</small>' +
            '</button>';
    }
    function strength(team) {
        return (team.offense * 0.38) + (team.runPrevention * 0.25) + (team.startingPitching * 0.22) + (team.bullpen * 0.15);
    }
    function edgeLabel(metric, away, home) {
        var gap = away[metric] - home[metric];
        if (Math.abs(gap) < 2.5) return 'Near even';
        return (gap > 0 ? away.name : home.name) + ' +' + Math.abs(Math.round(gap));
    }
    function expectedRunsFor(offenseTeam, defenseTeam, homeBonus) {
        var offenseLift = (offenseTeam.offense - 100) * 0.047;
        var starterDrag = (100 - defenseTeam.startingPitching) * 0.029;
        var bullpenDrag = (100 - defenseTeam.bullpen) * 0.019;
        var preventionDrag = (100 - defenseTeam.runPrevention) * 0.021;
        return clamp(4.3 + offenseLift + starterDrag + bullpenDrag + preventionDrag + homeBonus, 1.7, 9.2);
    }
    function volatilityLabel(value) {
        if (value >= 1.07) return 'High';
        if (value <= 0.97) return 'Low';
        return 'Medium';
    }
    function confidenceLabel(winPct, strengthGap) {
        if (winPct >= 0.64 || strengthGap >= 9) return 'Strong lean';
        if (winPct >= 0.56 || strengthGap >= 5) return 'Moderate lean';
        return 'Tight matchup';
    }
    function eraAdjustmentNote(away, home) {
        if (away.era === 'historical' && home.era === 'historical') return 'Classic teams normalized by era';
        if (away.era === 'historical' || home.era === 'historical') return 'Cross-era ratings normalized';
        return 'Same-era current baseline';
    }
    function modeHelpText() {
        if (state.preset === 'historical') return 'Classic Teams mode compares curated historical clubs on era-normalized baseline ratings.';
        if (state.preset === 'mixed') return 'Mixed Era Matchup mode normalizes current and classic teams into one simulator baseline.';
        if (state.preset === 'custom') return 'Custom mode uses the selected pool for each side.';
        return 'Current Teams mode compares two modern MLB baseline profiles.';
    }
    function simulationModeLabel() {
        if (state.preset === 'historical') return 'Classic baseline';
        if (state.preset === 'mixed') return 'Mixed-era baseline';
        if (state.preset === 'custom') return 'Custom baseline';
        return 'Current baseline';
    }
    function verifiedLiveInputs() {
        return state.liveInputs.filter(function (source) { return source.verified; });
    }
    function dataModeLabel() {
        return verifiedLiveInputs().length ? 'Verified live inputs' : 'Baseline ratings';
    }
    function dataModeDetail() {
        if (state.awayPool === 'historical' || state.homePool === 'historical') return 'Classic and mixed-era matchups use historical baseline model ratings; live inputs are current-game only.';
        if (verifiedLiveInputs().length) return 'Verified live inputs are connected for this simulation where explicitly listed.';
        return 'Verified live inputs are unavailable, so this matchup will use internal baseline ratings.';
    }

    function parseRecord(summary) {
        var match = String(summary || '').match(/(\d+)\s*-\s*(\d+)/);
        if (!match) return null;
        var wins = Number(match[1]);
        var losses = Number(match[2]);
        var total = wins + losses;
        if (!total) return null;
        return { wins: wins, losses: losses, pct: wins / total, summary: wins + '-' + losses };
    }
    function recordFromCompetitor(comp) {
        var records = Array.isArray(comp && comp.records) ? comp.records : [];
        var overall = records.filter(function (record) { return record && (record.name === 'overall' || record.type === 'total'); })[0] || records[0];
        return parseRecord(overall && overall.summary);
    }
    function probableFromCompetitor(comp) {
        var probable = Array.isArray(comp && comp.probables) ? comp.probables[0] : null;
        if (!probable) return null;
        var eraStat = (probable.statistics || []).filter(function (stat) { return stat && String(stat.abbreviation || stat.name).toUpperCase() === 'ERA'; })[0];
        var era = eraStat ? Number(eraStat.displayValue) : null;
        return {
            name: probable.athlete && (probable.athlete.displayName || probable.athlete.fullName) || probable.displayName || 'Probable starter',
            record: probable.record || '',
            era: Number.isFinite(era) ? era : null
        };
    }
    function extractWeather(event) {
        var weather = event && event.weather || null;
        if (!weather) return null;
        var temp = Number(weather.temperature != null ? weather.temperature : weather.highTemperature);
        return {
            display: weather.displayValue || '',
            temperature: Number.isFinite(temp) ? temp : null,
            precipitation: Number(weather.precipitation),
            gust: Number(weather.gust)
        };
    }
    function extractEspnEvent(event) {
        var comp = event && event.competitions && event.competitions[0];
        var competitors = comp && Array.isArray(comp.competitors) ? comp.competitors : [];
        var home = competitors.filter(function (team) { return team.homeAway === 'home'; })[0];
        var away = competitors.filter(function (team) { return team.homeAway === 'away'; })[0];
        if (!home || !away) return null;
        var homeName = home.team && (home.team.displayName || home.team.name);
        var awayName = away.team && (away.team.displayName || away.team.name);
        return {
            id: event.id,
            homeTeam: homeName,
            awayTeam: awayName,
            commenceTime: event.date || comp.date,
            completed: !!(event.status && event.status.type && event.status.type.completed),
            statusDetail: event.status && event.status.type && (event.status.type.shortDetail || event.status.type.detail || event.status.type.description) || 'Scheduled',
            homeScore: home.score != null ? Number(home.score) : null,
            awayScore: away.score != null ? Number(away.score) : null,
            venue: comp.venue && comp.venue.fullName ? {
                name: comp.venue.fullName,
                city: comp.venue.address && comp.venue.address.city || '',
                state: comp.venue.address && comp.venue.address.state || '',
                indoor: comp.venue.indoor === true
            } : null,
            weather: extractWeather(event),
            homeRecord: recordFromCompetitor(home),
            awayRecord: recordFromCompetitor(away),
            homeStarter: probableFromCompetitor(home),
            awayStarter: probableFromCompetitor(away)
        };
    }
    function summaryForEvent(id) {
        return id && state.liveContext.espnSummaries ? state.liveContext.espnSummaries[id] || null : null;
    }
    function injuryStatus(item) {
        return item && (item.status || item.shortStatus || item.type && (item.type.abbreviation || item.type.description) || item.athlete && item.athlete.status && (item.athlete.status.abbreviation || item.athlete.status.name)) || '';
    }
    function injuryDetail(item) {
        return item && item.details && (item.details.type || item.details.detail || item.details.displayDetail || item.details.displayDescription) || '';
    }
    function injuryPosition(item) {
        return item && item.athlete && item.athlete.position && (item.athlete.position.abbreviation || item.athlete.position.displayName) || '';
    }
    function teamInjuryReport(summary, team) {
        var groups = Array.isArray(summary && summary.injuries) ? summary.injuries : [];
        var group = groups.filter(function (entry) { return entry && entry.team && normalizeName(entry.team.displayName) === normalizeName(team.name); })[0];
        var injuries = group && Array.isArray(group.injuries) ? group.injuries : [];
        if (!injuries.length) return null;
        var ilCount = injuries.filter(function (item) { return /IL|injured/i.test(injuryStatus(item)); }).length;
        var dayToDay = injuries.filter(function (item) { return /day/i.test(injuryStatus(item)); }).length;
        var rpCount = injuries.filter(function (item) { return /RP|Relief/i.test(injuryPosition(item)); }).length;
        var notable = injuries.slice(0, 3).map(function (item) {
            var name = item && item.athlete && (item.athlete.displayName || item.athlete.fullName) || 'Listed player';
            var pos = injuryPosition(item);
            var status = injuryStatus(item);
            var detail = injuryDetail(item);
            return name + (pos ? ' ' + pos : '') + (status ? ' ' + status : '') + (detail ? ' - ' + detail : '');
        });
        return {
            count: injuries.length,
            ilCount: ilCount,
            dayToDay: dayToDay,
            relieverCount: rpCount,
            notable: notable,
            summary: injuries.length + ' listed' + (ilCount ? ', ' + ilCount + ' IL' : '') + (rpCount ? ', ' + rpCount + ' RP' : '')
        };
    }
    function collectRosterPlayers(entry) {
        var players = [];
        function add(item) {
            if (!item) return;
            var athlete = item.athlete || item;
            var name = athlete.displayName || athlete.fullName || athlete.name;
            if (!name) return;
            players.push({
                name: name,
                position: athlete.position && (athlete.position.abbreviation || athlete.position.displayName) || item.position && item.position.abbreviation || ''
            });
        }
        (entry.roster || []).forEach(add);
        (entry.athletes || []).forEach(add);
        (entry.groups || []).forEach(function (group) { (group.athletes || group.roster || []).forEach(add); });
        var seen = {};
        return players.filter(function (player) {
            var key = normalizeName(player.name);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
    }
    function teamRosterContext(summary, team) {
        var groups = Array.isArray(summary && summary.rosters) ? summary.rosters : [];
        var group = groups.filter(function (entry) { return entry && entry.team && normalizeName(entry.team.displayName) === normalizeName(team.name); })[0];
        var players = group ? collectRosterPlayers(group) : [];
        if (!players.length) return null;
        var relievers = players.filter(function (player) { return /RP|Relief/i.test(player.position); }).length;
        return { count: players.length, relievers: relievers, summary: players.length + ' roster players' + (relievers ? ', ' + relievers + ' RP' : '') };
    }
    function summaryContext(summary, away, home) {
        if (!summary) return null;
        var injuries = {
            away: teamInjuryReport(summary, away),
            home: teamInjuryReport(summary, home)
        };
        var rosters = {
            away: teamRosterContext(summary, away),
            home: teamRosterContext(summary, home)
        };
        if (!injuries.away && !injuries.home && !rosters.away && !rosters.home) return null;
        return { injuries: injuries, rosters: rosters };
    }
    function teamsMatch(gameLike, away, home) {
        if (!gameLike || !away || !home) return false;
        var awayNames = [gameLike.away_team, gameLike.awayTeam].map(normalizeName);
        var homeNames = [gameLike.home_team, gameLike.homeTeam].map(normalizeName);
        return awayNames.indexOf(normalizeName(away.name)) !== -1 && homeNames.indexOf(normalizeName(home.name)) !== -1;
    }
    function getMarket(game, key) {
        var bookmakers = Array.isArray(game && game.bookmakers) ? game.bookmakers : [];
        for (var b = 0; b < bookmakers.length; b += 1) {
            var markets = Array.isArray(bookmakers[b].markets) ? bookmakers[b].markets : [];
            for (var m = 0; m < markets.length; m += 1) {
                if (markets[m].key === key) return { bookmaker: bookmakers[b], market: markets[m] };
            }
        }
        return null;
    }
    function marketOddsFor(game, away, home) {
        var h2h = getMarket(game, 'h2h');
        var totals = getMarket(game, 'totals');
        if (!h2h || !Array.isArray(h2h.market.outcomes)) return null;
        var awayOutcome = h2h.market.outcomes.filter(function (outcome) { return normalizeName(outcome.name) === normalizeName(away.name); })[0];
        var homeOutcome = h2h.market.outcomes.filter(function (outcome) { return normalizeName(outcome.name) === normalizeName(home.name); })[0];
        if (!awayOutcome || !homeOutcome) return null;
        var totalOutcome = totals && totals.market && Array.isArray(totals.market.outcomes) ? totals.market.outcomes[0] : null;
        return {
            book: h2h.bookmaker.title || h2h.bookmaker.key || 'Sportsbook board',
            updatedAt: game.updated_at || h2h.bookmaker.last_update || null,
            awayPrice: awayOutcome.price,
            homePrice: homeOutcome.price,
            total: totalOutcome && totalOutcome.point != null ? totalOutcome.point : null
        };
    }
    function impliedFromAmerican(price) {
        var n = Number(price);
        if (!Number.isFinite(n) || n === 0) return null;
        return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
    }
    function selectedLiveContext(away, home) {
        if (!away || !home || away.era !== 'current' || home.era !== 'current') return null;
        var espnGame = (state.liveContext.espnEvents || []).filter(function (game) { return teamsMatch(game, away, home); })[0] || null;
        var scheduleGame = (state.liveContext.scheduleGames || []).filter(function (game) { return teamsMatch(game, away, home); })[0] || null;
        var boardGame = (state.liveContext.boardGames || []).filter(function (game) { return teamsMatch(game, away, home); })[0] || null;
        var recentForm = buildRecentForm(away, home);
        var summary = summaryForEvent(espnGame && espnGame.id);
        var extraContext = summaryContext(summary, away, home);
        if (!espnGame && !scheduleGame && !boardGame && !recentForm && !extraContext) return null;
        var odds = boardGame ? marketOddsFor(boardGame, away, home) : null;
        return { espnGame: espnGame, scheduleGame: scheduleGame, boardGame: boardGame, odds: odds, recentForm: recentForm, summary: summary, extraContext: extraContext };
    }
    function completedTeamResult(event, team) {
        if (!event || !event.completed || !team) return null;
        var isAway = normalizeName(event.awayTeam) === normalizeName(team.name);
        var isHome = normalizeName(event.homeTeam) === normalizeName(team.name);
        if (!isAway && !isHome) return null;
        var scored = isAway ? event.awayScore : event.homeScore;
        var allowed = isAway ? event.homeScore : event.awayScore;
        if (!Number.isFinite(scored) || !Number.isFinite(allowed)) return null;
        return {
            date: event.commenceTime,
            opponent: isAway ? event.homeTeam : event.awayTeam,
            scored: scored,
            allowed: allowed,
            won: scored > allowed,
            differential: scored - allowed
        };
    }
    function recentForTeam(team) {
        var games = (state.liveContext.recentEvents || [])
            .map(function (event) { return completedTeamResult(event, team); })
            .filter(Boolean)
            .sort(function (a, b) { return new Date(b.date).getTime() - new Date(a.date).getTime(); })
            .slice(0, 5);
        if (!games.length) return null;
        var wins = games.filter(function (game) { return game.won; }).length;
        var runsFor = games.reduce(function (sum, game) { return sum + game.scored; }, 0);
        var runsAgainst = games.reduce(function (sum, game) { return sum + game.allowed; }, 0);
        return {
            games: games.length,
            wins: wins,
            losses: games.length - wins,
            runsFor: runsFor,
            runsAgainst: runsAgainst,
            runDiff: runsFor - runsAgainst,
            avgFor: round1(runsFor / games.length),
            avgAgainst: round1(runsAgainst / games.length),
            summary: wins + '-' + (games.length - wins) + ', ' + (runsFor - runsAgainst >= 0 ? '+' : '') + (runsFor - runsAgainst) + ' run diff'
        };
    }
    function buildRecentForm(away, home) {
        var awayForm = recentForTeam(away);
        var homeForm = recentForTeam(home);
        if (!awayForm && !homeForm) return null;
        return { away: awayForm, home: homeForm };
    }
    function liveInputsForContext(context) {
        var espnGame = context && context.espnGame;
        var scheduleGame = context && context.scheduleGame;
        var odds = context && context.odds;
        var recentForm = context && context.recentForm;
        var extra = context && context.extraContext;
        var weather = espnGame && espnGame.weather;
        var injuryAvailable = !!(extra && extra.injuries && (extra.injuries.away || extra.injuries.home));
        var rosterAvailable = !!(extra && extra.rosters && extra.rosters.away && extra.rosters.home);
        var bullpenAvailable = !!(extra && ((extra.injuries && ((extra.injuries.away && extra.injuries.away.relieverCount) || (extra.injuries.home && extra.injuries.home.relieverCount))) || (extra.rosters && extra.rosters.away && extra.rosters.home && (extra.rosters.away.relievers || extra.rosters.home.relievers))));
        var startersAvailable = !!(espnGame && espnGame.awayStarter && espnGame.homeStarter);
        var recordsAvailable = !!(espnGame && espnGame.awayRecord && espnGame.homeRecord);
        var recentAvailable = !!(recentForm && recentForm.away && recentForm.home);
        return [
            {
                key: 'scheduleFinals',
                label: 'MLB schedule/finals',
                verified: !!(espnGame || scheduleGame),
                status: (espnGame || scheduleGame) ? ((espnGame && espnGame.completed) || (scheduleGame && scheduleGame.completed) ? 'Final score available' : 'Scheduled game found') : 'Unavailable',
                detail: (espnGame && espnGame.statusDetail) || (scheduleGame && scheduleGame.commence_time ? 'Scheduled ' + new Date(scheduleGame.commence_time).toLocaleString() : 'No matching current MLB game found.')
            },
            {
                key: 'teamRecords',
                label: 'Team records',
                verified: recordsAvailable,
                status: recordsAvailable ? 'Available from ESPN scoreboard' : 'Unavailable',
                detail: recordsAvailable ? espnGame.awayTeam + ' ' + espnGame.awayRecord.summary + ' / ' + espnGame.homeTeam + ' ' + espnGame.homeRecord.summary : 'No verified record match available.'
            },
            {
                key: 'startingPitchers',
                label: 'Probable starters',
                verified: startersAvailable,
                status: startersAvailable ? 'Probable starters available' : 'Unavailable',
                detail: startersAvailable ? espnGame.awayStarter.name + ' vs ' + espnGame.homeStarter.name : 'No confirmed or probable starter match available.'
            },
            {
                key: 'confirmedStarters',
                label: 'Confirmed starter status',
                verified: false,
                status: 'Unavailable',
                detail: startersAvailable ? 'ESPN lists probable starters; confirmed starter status is not connected.' : 'No confirmed starter status match available.'
            },
            {
                key: 'ballpark',
                label: 'Ballpark',
                verified: !!(espnGame && espnGame.venue),
                status: espnGame && espnGame.venue ? 'Ballpark available' : 'Unavailable',
                detail: espnGame && espnGame.venue ? espnGame.venue.name + (espnGame.venue.city ? ', ' + espnGame.venue.city : '') + '.' : 'No verified venue match available.'
            },
            {
                key: 'weather',
                label: 'Weather',
                verified: !!weather,
                status: weather ? 'Available from ESPN scoreboard' : 'Unavailable',
                detail: weather ? [weather.temperature != null ? weather.temperature + 'F' : '', weather.display || '', Number.isFinite(weather.gust) ? 'gust ' + weather.gust + ' mph' : ''].filter(Boolean).join(' / ') : 'No verified weather match available.'
            },
            {
                key: 'sportsbookOdds',
                label: 'Sportsbook odds',
                verified: !!odds,
                status: odds ? 'Available from backend board' : 'Unavailable',
                detail: odds ? odds.book + ' moneyline snapshot; used as market context, not a betting edge.' : 'No verified sportsbook odds match available.'
            },
            {
                key: 'injuryReport',
                label: 'Injury report',
                verified: injuryAvailable,
                status: injuryAvailable ? 'Available from ESPN summary' : 'Unavailable',
                detail: injuryAvailable ? [extra.injuries.away ? espnGame.awayTeam + ': ' + extra.injuries.away.summary : espnGame.awayTeam + ': none listed', extra.injuries.home ? espnGame.homeTeam + ': ' + extra.injuries.home.summary : espnGame.homeTeam + ': none listed'].join(' / ') : 'No verified injury report match available.'
            },
            {
                key: 'recentForm',
                label: 'Recent scoring form',
                status: recentAvailable ? 'Available from ESPN final scores' : 'Unavailable',
                detail: recentAvailable ? 'Last ' + recentForm.away.games + ': ' + recentForm.away.summary + ' / Last ' + recentForm.home.games + ': ' + recentForm.home.summary : 'No verified recent final-score sample matched both teams.',
                verified: recentAvailable
            },
            { key: 'rosterContext', label: 'Roster context', status: rosterAvailable ? 'Available from ESPN roster payload' : 'Unavailable', detail: rosterAvailable ? espnGame.awayTeam + ': ' + extra.rosters.away.summary + ' / ' + espnGame.homeTeam + ': ' + extra.rosters.home.summary : 'No verified player roster list is connected for this matchup.', verified: rosterAvailable },
            { key: 'bullpenContext', label: 'Bullpen context', status: bullpenAvailable ? 'Bullpen injury/depth context available' : 'Unavailable', detail: bullpenAvailable ? 'Derived from ESPN roster/injury context only; workload and availability are not connected.' : 'No verified bullpen depth, workload, or availability feed is connected.', verified: bullpenAvailable }
        ];
    }
    function setLiveInputsForMatchup(away, home) {
        state.activeLiveContext = selectedLiveContext(away, home);
        state.liveInputs = liveInputsForContext(state.activeLiveContext);
        state.dataMode = verifiedLiveInputs().length ? 'live' : 'baseline';
    }

    function starterEraAdjustment(starter) {
        if (!starter || !Number.isFinite(starter.era)) return 0;
        return clamp((starter.era - 4.2) * 0.22, -0.45, 0.55);
    }
    function selectedPitcherRunAdjustment(pitcher) {
        if (!pitcher) return 0;
        return clamp((100 - pitcher.quality) * 0.028, -0.58, 0.52);
    }
    function selectedPitcherStrengthAdjustment(pitcher) {
        if (!pitcher) return 0;
        return clamp((pitcher.quality - 100) * 0.24, -4.2, 5.4);
    }
    function recordStrengthAdjustment(record) {
        if (!record || !Number.isFinite(record.pct)) return 0;
        return clamp((record.pct - 0.5) * 9, -3.5, 3.5);
    }
    function injuryStrengthPenalty(report) {
        if (!report) return 0;
        return clamp((report.ilCount * 0.32) + (report.dayToDay * 0.12) + (report.relieverCount * 0.12), 0, 2.8);
    }
    function simulate(away, home, context) {
        var awayRuns = expectedRunsFor(away, home, 0);
        var homeRuns = expectedRunsFor(home, away, 0.18);
        var liveFactors = [];
        var awayPitcher = selectedPitcher('away', away, context);
        var homePitcher = selectedPitcher('home', home, context);
        awayRuns = clamp(awayRuns + selectedPitcherRunAdjustment(homePitcher), 1.7, 9.2);
        homeRuns = clamp(homeRuns + selectedPitcherRunAdjustment(awayPitcher), 1.7, 9.2);
        var awayStrength = strength(away);
        var homeStrength = strength(home) + 1.7;
        awayStrength += selectedPitcherStrengthAdjustment(awayPitcher);
        homeStrength += selectedPitcherStrengthAdjustment(homePitcher);
        if (awayPitcher && homePitcher) {
            liveFactors.push('Starting Pitchers: ' + away.name + ': ' + awayPitcher.name + ' (' + awayPitcher.source + ', ' + (awayPitcher.verified ? 'verified probable' : 'modeled input') + '); ' + home.name + ': ' + homePitcher.name + ' (' + homePitcher.source + ', ' + (homePitcher.verified ? 'verified probable' : 'modeled input') + ').');
        }
        if (awayPitcher && homePitcher && Math.abs(awayPitcher.quality - homePitcher.quality) >= 7) {
            liveFactors.push('Starting pitching matchup: ' + (awayPitcher.quality > homePitcher.quality ? awayPitcher.name : homePitcher.name) + ' grades higher in this simulator profile and moves the run projection.');
        }
        if (context && context.espnGame) {
            awayStrength += recordStrengthAdjustment(context.espnGame.awayRecord);
            homeStrength += recordStrengthAdjustment(context.espnGame.homeRecord);
            if (context.espnGame.awayRecord && context.espnGame.homeRecord) {
                liveFactors.push('Team records: ' + away.abbreviation + ' ' + context.espnGame.awayRecord.summary + ', ' + home.abbreviation + ' ' + context.espnGame.homeRecord.summary + '.');
            }
            if (context.espnGame.venue) {
                liveFactors.push('Ballpark context: ' + context.espnGame.venue.name + ' is verified from ESPN.');
            }
            if (context.espnGame.weather) {
                var weather = context.espnGame.weather;
                if (weather.temperature != null && weather.temperature >= 80) {
                    awayRuns = clamp(awayRuns + 0.08, 1.7, 9.2);
                    homeRuns = clamp(homeRuns + 0.08, 1.7, 9.2);
                }
                if (Number.isFinite(weather.precipitation) && weather.precipitation > 0) {
                    awayRuns = clamp(awayRuns - 0.04, 1.7, 9.2);
                    homeRuns = clamp(homeRuns - 0.04, 1.7, 9.2);
                }
                liveFactors.push('Weather context from ESPN: ' + [weather.temperature != null ? weather.temperature + 'F' : '', weather.display || '', Number.isFinite(weather.gust) ? 'gust ' + weather.gust + ' mph' : ''].filter(Boolean).join(' / ') + '.');
            }
        }
        if (context && context.extraContext && context.extraContext.injuries) {
            var awayInjuries = context.extraContext.injuries.away;
            var homeInjuries = context.extraContext.injuries.home;
            if (awayInjuries) awayStrength -= injuryStrengthPenalty(awayInjuries);
            if (homeInjuries) homeStrength -= injuryStrengthPenalty(homeInjuries);
            if (awayInjuries || homeInjuries) {
                liveFactors.push('ESPN injury report: ' + away.abbreviation + ' ' + (awayInjuries ? awayInjuries.summary : 'none listed') + '; ' + home.abbreviation + ' ' + (homeInjuries ? homeInjuries.summary : 'none listed') + '.');
            }
        }
        if (context && context.extraContext && context.extraContext.rosters && context.extraContext.rosters.away && context.extraContext.rosters.home) {
            liveFactors.push('Roster context from ESPN: ' + away.abbreviation + ' ' + context.extraContext.rosters.away.summary + '; ' + home.abbreviation + ' ' + context.extraContext.rosters.home.summary + '.');
        }
        if (context && context.extraContext && context.extraContext.injuries && ((context.extraContext.injuries.away && context.extraContext.injuries.away.relieverCount) || (context.extraContext.injuries.home && context.extraContext.injuries.home.relieverCount))) {
            liveFactors.push('Bullpen context is limited to reliever injury listings; live workload and availability are not connected.');
        }
        if (context && context.recentForm) {
            if (context.recentForm.away) {
                awayRuns = clamp(awayRuns + clamp((context.recentForm.away.avgFor - 4.4) * 0.08, -0.28, 0.28), 1.7, 9.2);
                awayStrength += clamp(context.recentForm.away.runDiff * 0.12, -2.5, 2.5);
            }
            if (context.recentForm.home) {
                homeRuns = clamp(homeRuns + clamp((context.recentForm.home.avgFor - 4.4) * 0.08, -0.28, 0.28), 1.7, 9.2);
                homeStrength += clamp(context.recentForm.home.runDiff * 0.12, -2.5, 2.5);
            }
            if (context.recentForm.away && context.recentForm.home) {
                liveFactors.push('Recent scoring form from ESPN finals: ' + away.abbreviation + ' ' + context.recentForm.away.summary + '; ' + home.abbreviation + ' ' + context.recentForm.home.summary + '.');
            }
        }
        var homeWin = clamp(1 / (1 + Math.exp(-(((homeRuns - awayRuns) * 0.55) + ((homeStrength - awayStrength) * 0.027)))), 0.17, 0.83);
        if (context && context.odds) {
            var awayImp = impliedFromAmerican(context.odds.awayPrice);
            var homeImp = impliedFromAmerican(context.odds.homePrice);
            if (awayImp != null && homeImp != null) {
                var noVigHome = homeImp / (homeImp + awayImp);
                homeWin = clamp((homeWin * 0.85) + (noVigHome * 0.15), 0.17, 0.83);
                liveFactors.push('Market context: ' + context.odds.book + ' moneyline snapshot is included, but no betting edge is claimed.');
            }
            if (context.odds.total != null) {
                liveFactors.push('Market total snapshot: ' + context.odds.total + ' runs.');
            }
        }
        var awayWin = 1 - homeWin;
        var winner = homeWin >= awayWin ? home : away;
        var winnerPct = Math.max(homeWin, awayWin);
        var volatility = clamp((away.volatility + home.volatility) / 2, 0.92, 1.16);
        var spread = round1(1.1 * volatility);
        var totalRuns = awayRuns + homeRuns;
        var projectedAwayScore = Math.max(1, Math.round(awayRuns + (awayWin > homeWin ? 0.24 : -0.08)));
        var projectedHomeScore = Math.max(1, Math.round(homeRuns + (homeWin >= awayWin ? 0.24 : -0.08)));
        if (projectedAwayScore === projectedHomeScore) {
            if (homeWin >= awayWin) projectedHomeScore += 1;
            else projectedAwayScore += 1;
        }
        var reasonParts = [];
        reasonParts.push(winner.name + ' projects ahead because the run expectation and composite team rating lean their way.');
        if (Math.abs(away.offense - home.offense) >= 4) reasonParts.push(edgeLabel('offense', away, home) + ' on offense.');
        if (Math.abs(away.startingPitching - home.startingPitching) >= 4) reasonParts.push(edgeLabel('startingPitching', away, home) + ' in starting pitching.');
        if (Math.abs(away.bullpen - home.bullpen) >= 4) reasonParts.push(edgeLabel('bullpen', away, home) + ' in bullpen baseline.');
        if (awayPitcher && homePitcher) reasonParts.push('Selected starters: ' + awayPitcher.name + ' vs ' + homePitcher.name + '.');
        return {
            status: 'estimated',
            away: away,
            home: home,
            winner: winner,
            winnerPct: winnerPct,
            awayWin: awayWin,
            homeWin: homeWin,
            awayRuns: round1(awayRuns),
            homeRuns: round1(homeRuns),
            projectedAwayScore: projectedAwayScore,
            projectedHomeScore: projectedHomeScore,
            awayRange: [round1(Math.max(0.5, awayRuns - spread)), round1(awayRuns + spread)],
            homeRange: [round1(Math.max(0.5, homeRuns - spread)), round1(homeRuns + spread)],
            totalRange: [round1(Math.max(2, totalRuns - spread * 1.35)), round1(totalRuns + spread * 1.35)],
            runEnvironment: totalRuns >= 9.8 ? 'Elevated' : (totalRuns <= 7.4 ? 'Suppressed' : 'Balanced'),
            volatility: volatilityLabel(volatility),
            strengthGap: round1(Math.abs(homeStrength - awayStrength)),
            confidence: confidenceLabel(winnerPct, Math.abs(homeStrength - awayStrength)),
            confidenceBand: confidenceLabel(winnerPct, Math.abs(homeStrength - awayStrength)),
            eraAdjustment: eraAdjustmentNote(away, home),
            simulationMode: simulationModeLabel(),
            dataMode: dataModeLabel(),
            dataLimitations: dataModeDetail(),
            dataSourcesUsed: verifiedLiveInputs().map(function (source) { return source.label; }),
            missingDataSources: state.liveInputs.filter(function (source) { return !source.verified; }).map(function (source) { return source.label; }),
            liveFactors: liveFactors,
            offensiveEdge: edgeLabel('offense', away, home),
            pitchingEdge: edgeLabel('startingPitching', away, home),
            runPreventionEdge: edgeLabel('runPrevention', away, home),
            bullpenEdge: edgeLabel('bullpen', away, home),
            keyExplanation: reasonParts.join(' '),
            awayPitcher: awayPitcher,
            homePitcher: homePitcher
        };
    }

    function teamOption(team) {
        return '<option value="' + escapeHtml(team.id) + '">' + escapeHtml(team.name) + '</option>';
    }
    function ensurePitcherSelection(side, team, context) {
        var options = pitcherOptionsFor(team, side, context);
        var key = side === 'away' ? 'awayPitcherId' : 'homePitcherId';
        var touchedKey = side === 'away' ? 'awayPitcherTouched' : 'homePitcherTouched';
        if (!options.length) {
            state[key] = '';
            return null;
        }
        if (!options.filter(function (pitcher) { return pitcher.id === state[key]; })[0] || (!state[touchedKey] && options[0].verified)) state[key] = options[0].id;
        return options;
    }
    function renderPitcherOptions(side, team, context) {
        var options = ensurePitcherSelection(side, team, context) || [];
        var container = byId(side === 'away' ? 'awayPitcherOptions' : 'homePitcherOptions');
        var meta = byId(side === 'away' ? 'awayPitcherMeta' : 'homePitcherMeta');
        var key = side === 'away' ? 'awayPitcherId' : 'homePitcherId';
        var pitcher = selectedPitcher(side, team, context);
        if (container) {
            container.innerHTML = options.length ? options.map(function (option) { return pitcherChoiceButton(option, option.id === state[key]); }).join('') : '<div class="pitcher-empty">Choose a team to load starter profiles.</div>';
        }
        if (meta) meta.textContent = pitcherMeta(pitcher);
    }

    function renderSelectors() {
        var awayTeams = poolTeams(state.awayPool);
        var homeTeams = poolTeams(state.homePool);
        if (!findTeamInPool(state.awayTeamId, state.awayPool)) state.awayTeamId = awayTeams[0] ? awayTeams[0].id : '';
        if (!findTeamInPool(state.homeTeamId, state.homePool)) state.homeTeamId = homeTeams[1] ? homeTeams[1].id : (homeTeams[0] ? homeTeams[0].id : '');
        if (state.awayTeamId === state.homeTeamId && homeTeams.length > 1) state.homeTeamId = homeTeams.filter(function (team) { return team.id !== state.awayTeamId; })[0].id;

        var awayPoolSelect = byId('awayPoolSelect');
        var homePoolSelect = byId('homePoolSelect');
        var awaySelect = byId('awayTeamSelect');
        var homeSelect = byId('homeTeamSelect');
        if (awayPoolSelect) awayPoolSelect.value = state.awayPool;
        if (homePoolSelect) homePoolSelect.value = state.homePool;
        if (awaySelect) {
            awaySelect.disabled = false;
            awaySelect.innerHTML = awayTeams.map(teamOption).join('');
            awaySelect.value = state.awayTeamId;
        }
        if (homeSelect) {
            homeSelect.disabled = false;
            homeSelect.innerHTML = homeTeams.map(teamOption).join('');
            homeSelect.value = state.homeTeamId;
        }

        var away = findTeamInPool(state.awayTeamId, state.awayPool);
        var home = findTeamInPool(state.homeTeamId, state.homePool);
        setLiveInputsForMatchup(away, home);
        renderPitcherOptions('away', away, state.activeLiveContext);
        renderPitcherOptions('home', home, state.activeLiveContext);
        setText('awayTeamMeta', teamMeta(away));
        setText('homeTeamMeta', teamMeta(home));
        setText('selectedMatchupTitle', away && home ? away.name + ' vs ' + home.name : 'Choose two teams');
        setText('awayHeaderName', away ? away.name : 'Select Team A');
        setText('homeHeaderName', home ? home.name : 'Select Team B');
        setText('awayHeaderMeta', teamMeta(away));
        setText('homeHeaderMeta', teamMeta(home));
        setText('awayEraBadge', eraLabel(away));
        setText('homeEraBadge', eraLabel(home));
        renderDataModeStatus();
        setText('simBoardMessage', 'Baseline simulator loaded: Team A has ' + awayTeams.length + ' ' + (state.awayPool === 'historical' ? 'classic' : 'current') + ' teams; Team B has ' + homeTeams.length + ' ' + (state.homePool === 'historical' ? 'classic' : 'current') + ' teams.');
        setText('modeHelpText', modeHelpText());

        var run = byId('runSimulationButton');
        if (run) run.disabled = !(away && home && away.id !== home.id);
        var current = byId('currentModeButton');
        var historical = byId('historicalModeButton');
        var mixed = byId('mixedModeButton');
        if (current) current.classList.toggle('active', state.preset === 'current');
        if (historical) historical.classList.toggle('active', state.preset === 'historical');
        if (mixed) mixed.classList.toggle('active', state.preset === 'mixed');
    }

    function renderDataModeStatus() {
        var verifiedCount = verifiedLiveInputs().length;
        setText('simDataSourceTitle', verifiedCount ? 'Verified input mode' : 'Baseline ratings mode');
        setText('simDataSourceDetail', verifiedCount ? 'Using verified live inputs where available plus baseline ratings.' : 'Using internal baseline team ratings and historical context only.');
        setText('dataModeBadge', dataModeLabel());
        setText('dataModeDetail', dataModeDetail());
        var grid = byId('liveInputGrid');
        if (!grid) return;
        grid.innerHTML = state.liveInputs.map(function (source) {
            var statusClass = source.verified ? 'available' : 'unavailable';
            return '<div class="' + statusClass + '"><strong>' + escapeHtml(source.label) + '</strong><span>' + escapeHtml(source.status) + '</span><small>' + escapeHtml(source.detail) + '</small></div>';
        }).join('');
    }

    function renderComparison(result) {
        var container = byId('comparisonGrid');
        if (!container) return;
        if (!result) {
            container.innerHTML = '<div class="sim-empty">Run a simulation to compare team strength, offense, pitching/run prevention, and volatility.</div>';
            return;
        }
        var rows = [
            ['Overall Strength', Math.round(strength(result.away)), Math.round(strength(result.home))],
            ['Offense', result.away.offense, result.home.offense],
            ['Run Prevention', result.away.runPrevention, result.home.runPrevention],
            ['Starting Pitching', result.away.startingPitching, result.home.startingPitching],
            ['Bullpen', result.away.bullpen, result.home.bullpen],
            ['Volatility', Math.round(result.away.volatility * 100), Math.round(result.home.volatility * 100)]
        ];
        container.innerHTML = rows.map(function (row) {
            return '<article class="comparison-card"><h3>' + escapeHtml(row[0]) + '</h3>' +
                '<div class="comparison-bar"><span style="width:' + clamp(row[1], 8, 100) + '%"></span><strong>' + row[1] + '</strong></div>' +
                '<div class="comparison-bar home"><span style="width:' + clamp(row[2], 8, 100) + '%"></span><strong>' + row[2] + '</strong></div></article>';
        }).join('');
    }

    function renderInputStatus(result) {
        var container = byId('inputSummary');
        if (!container) return;
        var usedSources = result && result.dataSourcesUsed && result.dataSourcesUsed.length ? result.dataSourcesUsed.join(', ') : 'Internal baseline team ratings';
        var missingSources = result && result.missingDataSources && result.missingDataSources.length ? result.missingDataSources.join(', ') : 'None listed';
        var rows = result ? [
            ['Winner', result.winner.name + ' ' + roundPct(result.winnerPct)],
            ['Starting pitchers', result.away.name + ': ' + result.awayPitcher.name + ' / ' + result.home.name + ': ' + result.homePitcher.name],
            ['Run environment', result.runEnvironment + ' / ' + result.totalRange[0] + '-' + result.totalRange[1] + ' runs'],
            ['Simulation mode', result.simulationMode],
            ['Data mode', result.dataMode],
            ['Data sources used', usedSources],
            ['Missing data', missingSources],
            ['Offensive edge', result.offensiveEdge],
            ['Pitching edge', result.pitchingEdge],
            ['Run prevention edge', result.runPreventionEdge],
            ['Era adjustment', result.eraAdjustment],
            ['Confidence band', result.confidenceBand],
            ['Volatility', result.volatility],
            ['SportsDataIO', 'Not used for this estimate'],
            ['Sportsbook odds', result.dataSourcesUsed.indexOf('Sportsbook odds') !== -1 ? 'Verified backend board snapshot used as context' : 'Not used / not invented'],
            ['Official records', 'Excluded from picks and records']
        ] : [
            ['Dataset', 'Internal baseline team ratings'],
            ['Starting pitchers', 'Choose starters for both teams'],
            ['Data mode', dataModeLabel()],
            ['Live inputs', 'Shown only when matched to verified sources'],
            ['Sportsbook odds', 'Not used / not invented'],
            ['Official records', 'Excluded from picks and records']
        ];
        container.innerHTML = rows.map(function (row) {
            return '<div><strong>' + escapeHtml(row[0]) + '</strong><span>' + escapeHtml(row[1]) + '</span></div>';
        }).join('');
    }

    function renderNotes(result) {
        var list = byId('matchupNotes');
        if (!list) return;
        var liveFactorNotes = result && result.liveFactors && result.liveFactors.length ? result.liveFactors : [];
        var fallbackOnly = !result || !result.dataSourcesUsed || !result.dataSourcesUsed.length;
        var notes = result ? [
            result.dataSourcesUsed.indexOf('Sportsbook odds') !== -1 ? 'Simulation-based estimate with a verified market snapshot included as context; this is not a betting edge.' : 'Simulation-based estimate, not sportsbook odds or provider projection.',
            result.winner.name + ' grades as the simulated winner because of baseline run expectation and team-strength weighting.',
            'Starting Pitchers: ' + result.away.name + ': ' + result.awayPitcher.name + '; ' + result.home.name + ': ' + result.homePitcher.name + '.',
            'Average simulated score: ' + result.away.abbreviation + ' ' + result.awayRuns + ', ' + result.home.abbreviation + ' ' + result.homeRuns + '.',
            'Projected score range: ' + result.away.abbreviation + ' ' + result.awayRange[0] + '-' + result.awayRange[1] + ', ' + result.home.abbreviation + ' ' + result.homeRange[0] + '-' + result.homeRange[1] + '.',
            'Simulation mode used: ' + result.simulationMode + '.',
            'Data mode used: ' + result.dataMode + '.',
            'Era adjustment: ' + result.eraAdjustment + '.',
            'Confidence band: ' + result.confidenceBand + ' based only on internal simulation strength.',
            'Data sources used: ' + (result.dataSourcesUsed.length ? result.dataSourcesUsed.join(', ') : 'Internal baseline team ratings only') + '.',
            'Missing data sources: ' + (result.missingDataSources.length ? result.missingDataSources.join(', ') : 'None listed') + '.',
            'Data limitations: ' + result.dataLimitations,
            fallbackOnly ? 'Uses internal baseline team rating only; does not yet include live rosters, injuries, weather, confirmed starters, or sportsbook odds.' : 'Live context is used only for the verified sources listed above; unavailable roster lists, confirmed starter status, bullpen workload, and bullpen availability remain excluded.'
        ].concat(liveFactorNotes) : [
            'Choose a mode, select two teams, and run the simulator. Current and historical options are loaded locally, so failed provider data will not block this tool.',
            'Simulator baselines are internal ratings. They are not SportsDataIO data, sportsbook odds, betting-edge claims, official picks, or graded records.'
        ];
        list.innerHTML = notes.map(function (note) { return '<li>' + escapeHtml(note) + '</li>'; }).join('');
    }

    function renderResult(result) {
        if (!result) {
            var shell = byId('projectionShell');
            if (shell) shell.setAttribute('data-projection-state', 'not-connected');
            setText('projectedScoreValue', 'Awaiting matchup');
            setText('winProbabilityValue', 'Select teams');
            setText('expectedRunsValue', 'Choose starters');
            setText('totalRangeValue', 'Pending');
            setText('runEnvironmentValue', 'Pending');
            setText('simulationConfidenceValue', 'Pending');
            setText('eraAdjustmentValue', 'Pending');
            setText('simulationModeValue', 'Ready');
            setText('dataModeValue', dataModeLabel());
            setText('awayProbabilityLabel', 'Team A');
            setText('homeProbabilityLabel', 'Team B');
            setText('awayProbabilityValue', 'Ready');
            setText('homeProbabilityValue', 'Ready');
            setText('winnerBadge', 'Run a simulation');
            setText('awayScoreLabel', 'Team A');
            setText('homeScoreLabel', 'Team B');
            setText('awayScoreBig', 'Ready');
            setText('homeScoreBig', 'Ready');
            setText('awayExpectedTile', 'Choose team and starter');
            setText('homeExpectedTile', 'Choose team and starter');
            setText('keyExplanationValue', 'Select a matchup and run the simulator to generate a projected winner, score range, win probability, and notes.');
            var emptyCard = byId('resultCard');
            if (emptyCard) emptyCard.setAttribute('data-result-state', 'empty');
            setText('projectionNotice', 'Simulation-based estimate mode is ready. Select two teams and click Run Simulation.');
            renderComparison(null);
            renderInputStatus(null);
            renderNotes(null);
            return;
        }
        var shellProjected = byId('projectionShell');
        if (shellProjected) shellProjected.setAttribute('data-projection-state', 'projected');
        var resultCard = byId('resultCard');
        if (resultCard) resultCard.setAttribute('data-result-state', 'projected');
        setText('winnerBadge', result.winner.name + ' ' + roundPct(result.winnerPct));
        setText('awayScoreLabel', result.away.name);
        setText('homeScoreLabel', result.home.name);
        setText('awayScoreBig', result.projectedAwayScore);
        setText('homeScoreBig', result.projectedHomeScore);
        setText('awayExpectedTile', 'Expected runs ' + result.awayRuns);
        setText('homeExpectedTile', 'Expected runs ' + result.homeRuns);
        setText('keyExplanationValue', result.keyExplanation);
        setText('projectedScoreValue', result.away.abbreviation + ' ' + result.awayRange[0] + '-' + result.awayRange[1] + ' / ' + result.home.abbreviation + ' ' + result.homeRange[0] + '-' + result.homeRange[1]);
        setText('winProbabilityValue', result.winner.abbreviation + ' ' + roundPct(result.winnerPct));
        setText('expectedRunsValue', result.away.abbreviation + ' ' + result.awayRuns + ' / ' + result.home.abbreviation + ' ' + result.homeRuns);
        setText('totalRangeValue', result.totalRange[0] + '-' + result.totalRange[1]);
        setText('runEnvironmentValue', result.runEnvironment);
        setText('simulationConfidenceValue', result.confidenceBand);
        setText('eraAdjustmentValue', result.eraAdjustment);
        setText('simulationModeValue', result.simulationMode);
        setText('dataModeValue', result.dataMode);
        setText('awayProbabilityLabel', result.away.name);
        setText('homeProbabilityLabel', result.home.name);
        setText('awayProbabilityValue', roundPct(result.awayWin));
        setText('homeProbabilityValue', roundPct(result.homeWin));
        var awayBar = byId('awayProbabilityBar');
        var homeBar = byId('homeProbabilityBar');
        if (awayBar) awayBar.style.width = clamp(result.awayWin * 100, 2, 98) + '%';
        if (homeBar) homeBar.style.width = clamp(result.homeWin * 100, 2, 98) + '%';
        setText('projectionNotice', result.dataSourcesUsed.length ? 'Verified live inputs are included where listed. No SportsDataIO data, betting edge, or official record is created.' : 'Simulation-based estimate, not sportsbook odds or provider projection. No SportsDataIO data, betting edge, or official record is created.');
        renderComparison(result);
        renderInputStatus(result);
        renderNotes(result);
    }

    function renderLoading(away, home) {
        var shell = byId('projectionShell');
        var resultCard = byId('resultCard');
        if (shell) shell.setAttribute('data-projection-state', 'loading');
        if (resultCard) resultCard.setAttribute('data-result-state', 'loading');
        setText('winnerBadge', 'Running baseline sim...');
        setText('awayScoreLabel', away ? away.name : 'Team A');
        setText('homeScoreLabel', home ? home.name : 'Team B');
        setText('keyExplanationValue', 'Calculating internal baseline ratings, run environment, era context, and matchup strength.');
        setText('projectionNotice', 'Running simulation from internal baseline team ratings. No live odds, injuries, weather, or starters are being loaded.');
        renderDataModeStatus();
    }

    function switchMode(mode) {
        state.preset = mode === 'historical' || mode === 'mixed' ? mode : 'current';
        if (state.preset === 'historical') {
            state.awayPool = 'historical';
            state.homePool = 'historical';
        } else if (state.preset === 'mixed') {
            state.awayPool = 'current';
            state.homePool = 'historical';
        } else {
            state.awayPool = 'current';
            state.homePool = 'current';
        }
        state.awayTeamId = poolTeams(state.awayPool)[0].id;
        state.homeTeamId = poolTeams(state.homePool)[1] ? poolTeams(state.homePool)[1].id : poolTeams(state.homePool)[0].id;
        state.awayPitcherId = '';
        state.homePitcherId = '';
        state.awayPitcherTouched = false;
        state.homePitcherTouched = false;
        state.simulation = null;
        renderSelectors();
        renderResult(null);
    }

    function runSimulation() {
        var away = findTeamInPool(state.awayTeamId, state.awayPool);
        var home = findTeamInPool(state.homeTeamId, state.homePool);
        if (!away || !home || away.id === home.id) {
            setText('projectionNotice', 'Select two different teams to run a simulation. No output was generated.');
            return;
        }
        renderLoading(away, home);
        setLiveInputsForMatchup(away, home);
        state.simulation = simulate(away, home, state.activeLiveContext);
        renderResult(state.simulation);
    }

    function normalizeBoardResponse(data) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.games)) return data.games;
        return [];
    }

    function loadLiveContext() {
        state.liveContext.status = 'loading';
        renderDataModeStatus();
        var base = apiBaseUrl();
        var espnUrls = recentEspnDates().map(function (date) {
            return 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=' + date;
        });
        return Promise.allSettled([
            fetchJson(base + '/games?sport=baseball_mlb'),
            fetchJson(base + '/games/board/baseball_mlb')
        ].concat(espnUrls.map(fetchJson))).then(function (results) {
            var schedule = results[0].status === 'fulfilled' && results[0].value && Array.isArray(results[0].value.games) ? results[0].value.games : [];
            var board = results[1].status === 'fulfilled' ? normalizeBoardResponse(results[1].value) : [];
            var espnEventsByDate = results.slice(2).map(function (result) {
                return result.status === 'fulfilled' && result.value && Array.isArray(result.value.events) ? result.value.events.map(extractEspnEvent).filter(Boolean) : [];
            });
            var espnEvents = espnEventsByDate[0] || [];
            var recentEvents = espnEventsByDate.reduce(function (all, events) { return all.concat(events); }, []).filter(function (event) { return event && event.completed; });
            var summaryRequests = espnEvents.slice(0, 20).filter(function (event) { return event && event.id; }).map(function (event) {
                return fetchJson('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=' + encodeURIComponent(event.id)).then(function (summary) {
                    return { id: event.id, summary: summary };
                });
            });
            return Promise.allSettled(summaryRequests).then(function (summaryResults) {
                var summaries = {};
                summaryResults.forEach(function (result) {
                    if (result.status === 'fulfilled' && result.value && result.value.id) summaries[result.value.id] = result.value.summary;
                });
                state.liveContext = {
                    status: schedule.length || board.length || espnEvents.length ? 'available' : 'unavailable',
                    loadedAt: new Date().toISOString(),
                    scheduleGames: schedule,
                    boardGames: board,
                    espnEvents: espnEvents,
                    espnSummaries: summaries,
                    recentEvents: recentEvents,
                    error: null
                };
                renderSelectors();
                if (state.simulation) {
                    var away = findTeamInPool(state.awayTeamId, state.awayPool);
                    var home = findTeamInPool(state.homeTeamId, state.homePool);
                    state.simulation = simulate(away, home, state.activeLiveContext);
                    renderResult(state.simulation);
                }
            });
        }).catch(function (error) {
            state.liveContext.status = 'unavailable';
            state.liveContext.error = error && error.message || 'Live context unavailable';
            renderSelectors();
        });
    }

    function wireEvents() {
        var away = byId('awayTeamSelect');
        var home = byId('homeTeamSelect');
        var awayPool = byId('awayPoolSelect');
        var homePool = byId('homePoolSelect');
        var awayPitcherOptions = byId('awayPitcherOptions');
        var homePitcherOptions = byId('homePitcherOptions');
        var run = byId('runSimulationButton');
        var refresh = byId('refreshTeamsButton');
        var current = byId('currentModeButton');
        var historical = byId('historicalModeButton');
        var mixed = byId('mixedModeButton');
        if (awayPool) awayPool.addEventListener('change', function () { state.awayPool = awayPool.value === 'historical' ? 'historical' : 'current'; state.preset = 'custom'; state.awayTeamId = poolTeams(state.awayPool)[0].id; state.awayPitcherId = ''; state.awayPitcherTouched = false; state.simulation = null; renderSelectors(); renderResult(null); });
        if (homePool) homePool.addEventListener('change', function () { state.homePool = homePool.value === 'historical' ? 'historical' : 'current'; state.preset = 'custom'; state.homeTeamId = poolTeams(state.homePool)[0].id; state.homePitcherId = ''; state.homePitcherTouched = false; state.simulation = null; renderSelectors(); renderResult(null); });
        if (away) away.addEventListener('change', function () { state.awayTeamId = away.value; state.awayPitcherId = ''; state.awayPitcherTouched = false; state.simulation = null; renderSelectors(); renderResult(null); });
        if (home) home.addEventListener('change', function () { state.homeTeamId = home.value; state.homePitcherId = ''; state.homePitcherTouched = false; state.simulation = null; renderSelectors(); renderResult(null); });
        if (awayPitcherOptions) awayPitcherOptions.addEventListener('click', function (event) {
            var button = event.target && event.target.closest ? event.target.closest('[data-pitcher-id]') : null;
            if (!button) return;
            state.awayPitcherId = button.getAttribute('data-pitcher-id');
            state.awayPitcherTouched = true;
            state.simulation = null;
            renderPitcherOptions('away', findTeamInPool(state.awayTeamId, state.awayPool), state.activeLiveContext);
            renderResult(null);
        });
        if (homePitcherOptions) homePitcherOptions.addEventListener('click', function (event) {
            var button = event.target && event.target.closest ? event.target.closest('[data-pitcher-id]') : null;
            if (!button) return;
            state.homePitcherId = button.getAttribute('data-pitcher-id');
            state.homePitcherTouched = true;
            state.simulation = null;
            renderPitcherOptions('home', findTeamInPool(state.homeTeamId, state.homePool), state.activeLiveContext);
            renderResult(null);
        });
        if (run) run.addEventListener('click', runSimulation);
        if (refresh) refresh.addEventListener('click', function () { switchMode('current'); });
        if (current) current.addEventListener('click', function () { switchMode('current'); });
        if (historical) historical.addEventListener('click', function () { switchMode('historical'); });
        if (mixed) mixed.addEventListener('click', function () { switchMode('mixed'); });
    }

    function init() {
        wireEvents();
        renderSelectors();
        renderResult(null);
        loadLiveContext();
    }

    window.TMRMlbSimulator = {
        state: state,
        localTeams: LOCAL_TEAMS,
        liveInputs: LIVE_INPUT_SOURCES,
        loadLiveContext: loadLiveContext,
        selectedLiveContext: selectedLiveContext,
        runSimulation: runSimulation,
        simulate: simulate
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
