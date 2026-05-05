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

    var state = {
        preset: 'current',
        awayPool: 'current',
        homePool: 'current',
        teams: LOCAL_TEAMS,
        awayTeamId: LOCAL_TEAMS.current[0].id,
        homeTeamId: LOCAL_TEAMS.current[1].id,
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

    function simulate(away, home) {
        var awayRuns = expectedRunsFor(away, home, 0);
        var homeRuns = expectedRunsFor(home, away, 0.18);
        var awayStrength = strength(away);
        var homeStrength = strength(home) + 1.7;
        var homeWin = clamp(1 / (1 + Math.exp(-(((homeRuns - awayRuns) * 0.55) + ((homeStrength - awayStrength) * 0.027)))), 0.17, 0.83);
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
            offensiveEdge: edgeLabel('offense', away, home),
            pitchingEdge: edgeLabel('startingPitching', away, home),
            runPreventionEdge: edgeLabel('runPrevention', away, home),
            bullpenEdge: edgeLabel('bullpen', away, home),
            keyExplanation: reasonParts.join(' ')
        };
    }

    function teamOption(team) {
        return '<option value="' + escapeHtml(team.id) + '">' + escapeHtml(team.name) + '</option>';
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
        setText('awayTeamMeta', teamMeta(away));
        setText('homeTeamMeta', teamMeta(home));
        setText('selectedMatchupTitle', away && home ? away.name + ' vs ' + home.name : 'Choose two teams');
        setText('awayHeaderName', away ? away.name : 'Select Team A');
        setText('homeHeaderName', home ? home.name : 'Select Team B');
        setText('awayHeaderMeta', teamMeta(away));
        setText('homeHeaderMeta', teamMeta(home));
        setText('awayEraBadge', eraLabel(away));
        setText('homeEraBadge', eraLabel(home));
        setText('simDataSourceTitle', 'Local simulator baselines');
        setText('simDataSourceDetail', 'Baseline simulator mode. Uses internal team ratings only, not sportsbook odds or provider projections.');
        setText('simBoardMessage', 'Baseline simulator loaded: Team A has ' + awayTeams.length + ' ' + (state.awayPool === 'historical' ? 'classic' : 'current') + ' teams; Team B has ' + homeTeams.length + ' ' + (state.homePool === 'historical' ? 'classic' : 'current') + ' teams.');

        var run = byId('runSimulationButton');
        if (run) run.disabled = !(away && home && away.id !== home.id);
        var current = byId('currentModeButton');
        var historical = byId('historicalModeButton');
        var mixed = byId('mixedModeButton');
        if (current) current.classList.toggle('active', state.preset === 'current');
        if (historical) historical.classList.toggle('active', state.preset === 'historical');
        if (mixed) mixed.classList.toggle('active', state.preset === 'mixed');
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
        var rows = result ? [
            ['Winner', result.winner.name + ' ' + roundPct(result.winnerPct)],
            ['Run environment', result.runEnvironment + ' / ' + result.totalRange[0] + '-' + result.totalRange[1] + ' runs'],
            ['Offensive edge', result.offensiveEdge],
            ['Pitching edge', result.pitchingEdge],
            ['Run prevention edge', result.runPreventionEdge],
            ['Volatility', result.volatility],
            ['SportsDataIO', 'Not used for this estimate'],
            ['Sportsbook odds', 'Not used / not invented'],
            ['Official records', 'Excluded from picks and records']
        ] : [
            ['Dataset', 'Internal simulator baselines'],
            ['SportsDataIO', 'Optional provider data unavailable'],
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
        var notes = result ? [
            'Simulation-based estimate, not sportsbook odds or provider projection.',
            result.winner.name + ' grades as the simulated winner because of baseline run expectation and team-strength weighting.',
            'Average simulated score: ' + result.away.abbreviation + ' ' + result.awayRuns + ', ' + result.home.abbreviation + ' ' + result.homeRuns + '.',
            'Projected score range: ' + result.away.abbreviation + ' ' + result.awayRange[0] + '-' + result.awayRange[1] + ', ' + result.home.abbreviation + ' ' + result.homeRange[0] + '-' + result.homeRange[1] + '.',
            'Uses internal baseline team rating only; does not yet include live rosters, injuries, weather, confirmed starters, or sportsbook odds.'
        ] : [
            'Choose two teams and run the simulator. Current and historical options are loaded locally, so failed provider data will not block this tool.',
            'Simulator baselines are internal ratings. They are not SportsDataIO data, sportsbook odds, verified betting edges, official picks, or graded records.'
        ];
        list.innerHTML = notes.map(function (note) { return '<li>' + escapeHtml(note) + '</li>'; }).join('');
    }

    function renderResult(result) {
        if (!result) {
            var shell = byId('projectionShell');
            if (shell) shell.setAttribute('data-projection-state', 'not-connected');
            setText('projectedScoreValue', '--');
            setText('winProbabilityValue', '--');
            setText('expectedRunsValue', '--');
            setText('totalRangeValue', '--');
            setText('runEnvironmentValue', '--');
            setText('simulationConfidenceValue', '--');
            setText('awayProbabilityLabel', 'Team A');
            setText('homeProbabilityLabel', 'Team B');
            setText('awayProbabilityValue', '--');
            setText('homeProbabilityValue', '--');
            setText('winnerBadge', 'Run a simulation');
            setText('awayScoreLabel', 'Team A');
            setText('homeScoreLabel', 'Team B');
            setText('awayScoreBig', '--');
            setText('homeScoreBig', '--');
            setText('awayExpectedTile', 'Expected runs --');
            setText('homeExpectedTile', 'Expected runs --');
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
        setText('simulationConfidenceValue', result.volatility + ' volatility');
        setText('awayProbabilityLabel', result.away.name);
        setText('homeProbabilityLabel', result.home.name);
        setText('awayProbabilityValue', roundPct(result.awayWin));
        setText('homeProbabilityValue', roundPct(result.homeWin));
        var awayBar = byId('awayProbabilityBar');
        var homeBar = byId('homeProbabilityBar');
        if (awayBar) awayBar.style.width = clamp(result.awayWin * 100, 2, 98) + '%';
        if (homeBar) homeBar.style.width = clamp(result.homeWin * 100, 2, 98) + '%';
        setText('projectionNotice', 'Simulation-based estimate, not sportsbook odds or provider projection. No SportsDataIO data, betting edge, or official record is created.');
        renderComparison(result);
        renderInputStatus(result);
        renderNotes(result);
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
        state.simulation = simulate(away, home);
        renderResult(state.simulation);
    }

    function wireEvents() {
        var away = byId('awayTeamSelect');
        var home = byId('homeTeamSelect');
        var awayPool = byId('awayPoolSelect');
        var homePool = byId('homePoolSelect');
        var run = byId('runSimulationButton');
        var refresh = byId('refreshTeamsButton');
        var current = byId('currentModeButton');
        var historical = byId('historicalModeButton');
        var mixed = byId('mixedModeButton');
        if (awayPool) awayPool.addEventListener('change', function () { state.awayPool = awayPool.value === 'historical' ? 'historical' : 'current'; state.preset = 'custom'; state.awayTeamId = poolTeams(state.awayPool)[0].id; state.simulation = null; renderSelectors(); renderResult(null); });
        if (homePool) homePool.addEventListener('change', function () { state.homePool = homePool.value === 'historical' ? 'historical' : 'current'; state.preset = 'custom'; state.homeTeamId = poolTeams(state.homePool)[0].id; state.simulation = null; renderSelectors(); renderResult(null); });
        if (away) away.addEventListener('change', function () { state.awayTeamId = away.value; state.simulation = null; renderSelectors(); renderResult(null); });
        if (home) home.addEventListener('change', function () { state.homeTeamId = home.value; state.simulation = null; renderSelectors(); renderResult(null); });
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
    }

    window.TMRMlbSimulator = {
        state: state,
        localTeams: LOCAL_TEAMS,
        runSimulation: runSimulation,
        simulate: simulate
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
