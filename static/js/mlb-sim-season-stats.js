(function () {
    'use strict';
    var API_PREFIX = '/mlb-sim-season';

    function byId(id) { return document.getElementById(id); }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    async function apiRequest(path, options) {
        if (!window.api || typeof window.api.request !== 'function') {
            throw new Error('Backend client unavailable (static/js/backend-api.js did not load).');
        }
        return window.api.request(API_PREFIX + path, options || {});
    }
    function fmt3(v) { return v == null ? '-' : v.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.'); }
    function fmt2(v) { return v == null ? '-' : v.toFixed(2); }

    var seasonId = null;
    var battingRows = [], pitchingRows = [], teamRows = [], availabilityRows = [];
    var battingSort = { key: 'ops', dir: -1 };
    var pitchingSort = { key: 'era', dir: 1 };
    var qualifiedOnly = { batting: false, pitching: false };
    var MIN_QUALIFIED_PA = 10;
    var MIN_QUALIFIED_OUTS = 15; // 5 innings

    // ---- Player Stats ----
    var BATTING_COLS = [
        { key: 'player_name', label: 'Player', get: function (r) { return r.player_name || r.player_key; } },
        { key: 'team_abbr', label: 'Team', get: function (r) { return r.team_abbr; } },
        { key: 'games', label: 'G', get: function (r) { return r.batting.games; } },
        { key: 'plate_appearances', label: 'PA', get: function (r) { return r.batting.plate_appearances; } },
        { key: 'at_bats', label: 'AB', get: function (r) { return r.batting.at_bats; } },
        { key: 'runs', label: 'R', get: function (r) { return r.batting.runs; } },
        { key: 'hits', label: 'H', get: function (r) { return r.batting.hits; } },
        { key: 'home_runs', label: 'HR', get: function (r) { return r.batting.home_runs; } },
        { key: 'rbi', label: 'RBI', get: function (r) { return r.batting.rbi; } },
        { key: 'stolen_bases', label: 'SB', get: function (r) { return r.batting.stolen_bases; } },
        { key: 'walks', label: 'BB', get: function (r) { return r.batting.walks; } },
        { key: 'strikeouts', label: 'SO', get: function (r) { return r.batting.strikeouts; } },
        { key: 'avg', label: 'AVG', get: function (r) { return r.batting.avg; }, fmt: fmt3 },
        { key: 'obp', label: 'OBP', get: function (r) { return r.batting.obp; }, fmt: fmt3 },
        { key: 'slg', label: 'SLG', get: function (r) { return r.batting.slg; }, fmt: fmt3 },
        { key: 'ops', label: 'OPS', get: function (r) { return r.batting.ops; }, fmt: fmt3 },
    ];
    var PITCHING_COLS = [
        { key: 'player_name', label: 'Player', get: function (r) { return r.player_name || r.player_key; } },
        { key: 'team_abbr', label: 'Team', get: function (r) { return r.team_abbr; } },
        { key: 'games', label: 'G', get: function (r) { return r.pitching.games; } },
        { key: 'starts', label: 'GS', get: function (r) { return r.pitching.starts; } },
        { key: 'innings_pitched', label: 'IP', get: function (r) { return r.pitching.innings_pitched; } },
        { key: 'wins', label: 'W', get: function (r) { return r.pitching.wins; } },
        { key: 'losses', label: 'L', get: function (r) { return r.pitching.losses; } },
        { key: 'saves', label: 'SV', get: function (r) { return r.pitching.saves; } },
        { key: 'holds', label: 'H', get: function (r) { return r.pitching.holds; } },
        { key: 'strikeouts', label: 'SO', get: function (r) { return r.pitching.strikeouts; } },
        { key: 'walks', label: 'BB', get: function (r) { return r.pitching.walks; } },
        { key: 'era', label: 'ERA', get: function (r) { return r.pitching.era; }, fmt: fmt2 },
        { key: 'whip', label: 'WHIP', get: function (r) { return r.pitching.whip; }, fmt: fmt2 },
        { key: 'k_per_9', label: 'K/9', get: function (r) { return r.pitching.k_per_9; }, fmt: fmt2 },
    ];

    function sortRows(rows, cols, sortState) {
        var col = cols.filter(function (c) { return c.key === sortState.key; })[0];
        if (!col) return rows;
        return rows.slice().sort(function (a, b) {
            var av = col.get(a), bv = col.get(b);
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === 'string') return sortState.dir * String(av).localeCompare(String(bv));
            return sortState.dir * (av - bv) * -1;
        });
    }

    function renderStatsTable(containerEl, rows, cols, sortState, caption, qualifiedKey) {
        var visible = rows;
        if (qualifiedKey === 'batting' && qualifiedOnly.batting) visible = visible.filter(function (r) { return r.batting.plate_appearances >= MIN_QUALIFIED_PA; });
        if (qualifiedKey === 'pitching' && qualifiedOnly.pitching) visible = visible.filter(function (r) { return r.pitching.outs >= MIN_QUALIFIED_OUTS; });
        var sorted = sortRows(visible, cols, sortState);
        if (!sorted.length) { containerEl.innerHTML = '<p class="season-card-meta">No qualifying players yet.</p>'; return; }
        var head = '<thead><tr>' + cols.map(function (c) {
            var active = c.key === sortState.key;
            return '<th data-sort-key="' + c.key + '"' + (active ? ' data-sort-active data-sort-arrow="' + (sortState.dir === -1 ? '▼' : '▲') + '"' : '') + '>' + escapeHtml(c.label) + '</th>';
        }).join('') + '</tr></thead>';
        var body = '<tbody>' + sorted.map(function (r) {
            return '<tr>' + cols.map(function (c) {
                var v = c.get(r);
                return '<td>' + escapeHtml(c.fmt ? c.fmt(v) : (v == null ? '-' : v)) + '</td>';
            }).join('') + '</tr>';
        }).join('') + '</tbody>';
        containerEl.innerHTML = '<div class="stats-table-wrap"><table class="stats-table"><caption>' + escapeHtml(caption) + '</caption>' + head + body + '</table></div>';
        containerEl.querySelectorAll('th[data-sort-key]').forEach(function (th) {
            th.addEventListener('click', function () {
                var key = th.getAttribute('data-sort-key');
                if (sortState.key === key) sortState.dir *= -1; else { sortState.key = key; sortState.dir = -1; }
                renderStatsTable(containerEl, rows, cols, sortState, caption, qualifiedKey);
            });
        });
    }

    async function loadPlayerStats() {
        var battingEl = byId('battingLeadersContent');
        var pitchingEl = byId('pitchingLeadersContent');
        battingEl.setAttribute('data-state', 'loading'); battingEl.innerHTML = '<p>Loading batting leaders…</p>';
        pitchingEl.setAttribute('data-state', 'loading'); pitchingEl.innerHTML = '<p>Loading pitching leaders…</p>';
        var team = byId('statsTeamFilter') ? byId('statsTeamFilter').value : '';
        try {
            var resp = await apiRequest('/seasons/' + seasonId + '/player-stats' + (team ? '?team=' + encodeURIComponent(team) : ''));
            var players = resp.players || [];
            battingRows = players.filter(function (p) { return p.batting.plate_appearances > 0; });
            pitchingRows = players.filter(function (p) { return p.pitching.games > 0; });
            if (!players.length) {
                battingEl.setAttribute('data-state', 'empty'); battingEl.innerHTML = '<p>No player stats yet - complete a game with a box score to populate this.</p>';
                pitchingEl.setAttribute('data-state', 'empty'); pitchingEl.innerHTML = '<p>No player stats yet.</p>';
                return;
            }
            battingEl.setAttribute('data-state', 'loaded');
            pitchingEl.setAttribute('data-state', 'loaded');
            renderStatsTable(battingEl, battingRows, BATTING_COLS, battingSort, 'Batting Leaders (Simulated Season)', 'batting');
            renderStatsTable(pitchingEl, pitchingRows, PITCHING_COLS, pitchingSort, 'Pitching Leaders (Simulated Season)', 'pitching');
        } catch (e) {
            [battingEl, pitchingEl].forEach(function (el) {
                el.setAttribute('data-state', 'error');
                el.innerHTML = '<p data-tone="error">Could not load player stats. Please try again.</p>';
            });
            console.error('[mlb-sim-season-stats] loadPlayerStats failed', e);
        }
    }

    // ---- Team Stats ----
    var TEAM_STAT_COLS = [
        { key: 'team_abbr', label: 'Team', get: function (r) { return r.team_abbr; } },
        { key: 'wins', label: 'W', get: function (r) { return r.wins; } },
        { key: 'losses', label: 'L', get: function (r) { return r.losses; } },
        { key: 'batting_avg', label: 'AVG', get: function (r) { return r.batting.avg; }, fmt: fmt3 },
        { key: 'batting_ops', label: 'OPS', get: function (r) { return r.batting.ops; }, fmt: fmt3 },
        { key: 'era', label: 'ERA', get: function (r) { return r.pitching.era; }, fmt: fmt2 },
        { key: 'starter_era', label: 'Starter ERA', get: function (r) { return r.starter_pitching.era; }, fmt: fmt2 },
        { key: 'bullpen_era', label: 'Bullpen ERA', get: function (r) { return r.bullpen_pitching.era; }, fmt: fmt2 },
        { key: 'one_run', label: '1-Run', get: function (r) { return r.one_run_wins + '-' + r.one_run_losses; } },
        { key: 'extra_inning', label: 'Extras', get: function (r) { return r.extra_inning_wins + '-' + r.extra_inning_losses; } },
        { key: 'shutouts_pitched', label: 'ShO', get: function (r) { return r.shutouts_pitched; } },
        { key: 'comebacks', label: 'Comebacks', get: function (r) { return r.comebacks; } },
        { key: 'blown_leads', label: 'Blown Leads', get: function (r) { return r.blown_leads; } },
    ];
    var teamSort = { key: 'wins', dir: -1 };

    async function loadTeamStats() {
        var el = byId('teamStatsContent');
        el.setAttribute('data-state', 'loading'); el.innerHTML = '<p>Loading team stats…</p>';
        try {
            var resp = await apiRequest('/seasons/' + seasonId + '/team-stats');
            teamRows = resp.teams || [];
            if (!teamRows.length) { el.setAttribute('data-state', 'empty'); el.innerHTML = '<p>No team stats yet.</p>'; return; }
            el.setAttribute('data-state', 'loaded');
            var head = '<thead><tr>' + TEAM_STAT_COLS.map(function (c) {
                var active = c.key === teamSort.key;
                return '<th data-sort-key="' + c.key + '"' + (active ? ' data-sort-active data-sort-arrow="' + (teamSort.dir === -1 ? '▼' : '▲') + '"' : '') + '>' + escapeHtml(c.label) + '</th>';
            }).join('') + '</tr></thead>';
            var sorted = sortRows(teamRows, TEAM_STAT_COLS, teamSort);
            var body = '<tbody>' + sorted.map(function (r) {
                return '<tr>' + TEAM_STAT_COLS.map(function (c) {
                    var v = c.get(r);
                    return '<td>' + escapeHtml(c.fmt ? c.fmt(v) : (v == null ? '-' : v)) + '</td>';
                }).join('') + '</tr>';
            }).join('') + '</tbody>';
            el.innerHTML = '<div class="stats-table-wrap"><table class="stats-table"><caption>Team Stats (Simulated Season)</caption>' + head + body + '</table></div>';
            el.querySelectorAll('th[data-sort-key]').forEach(function (th) {
                th.addEventListener('click', function () {
                    var key = th.getAttribute('data-sort-key');
                    if (teamSort.key === key) teamSort.dir *= -1; else { teamSort.key = key; teamSort.dir = -1; }
                    loadTeamStats();
                });
            });
        } catch (e) {
            el.setAttribute('data-state', 'error');
            el.innerHTML = '<p data-tone="error">Could not load team stats. Please try again.</p>';
            console.error('[mlb-sim-season-stats] loadTeamStats failed', e);
        }
    }

    // ---- Roster, Pitcher Availability, Injury Report (all from ONE /availability call) ----
    function daysSince(iso) {
        if (!iso) return null;
        var d = (typeof iso === 'string' && iso.length > 10) ? iso.slice(0, 10) : iso;
        var then = new Date(d + 'T00:00:00Z').getTime();
        var now = new Date().getTime();
        return Math.round((now - then) / 86400000);
    }
    function availabilityBadge(p) {
        if (p.injured) return '<span class="availability-badge" data-state="injured">Injured</span>';
        var since = daysSince(p.last_pitched_date);
        if (since != null && since <= 1) return '<span class="availability-badge" data-state="rest-watch">Recent outing</span>';
        return '<span class="availability-badge" data-state="active">Active</span>';
    }

    async function loadAvailability() {
        var rosterEl = byId('rosterContent');
        var pitcherEl = byId('pitcherAvailabilityContent');
        var injuryEl = byId('injuryReportContent');
        [rosterEl, pitcherEl, injuryEl].forEach(function (el) { el.setAttribute('data-state', 'loading'); el.innerHTML = '<p>Loading…</p>'; });
        var team = byId('statsTeamFilter') ? byId('statsTeamFilter').value : '';
        try {
            var resp = await apiRequest('/seasons/' + seasonId + '/availability' + (team ? '?team=' + encodeURIComponent(team) : ''));
            availabilityRows = resp.players || [];
            if (!availabilityRows.length) {
                [rosterEl, pitcherEl, injuryEl].forEach(function (el) { el.setAttribute('data-state', 'empty'); el.innerHTML = '<p>No players have appeared in a completed game yet.</p>'; });
                return;
            }
            // Roster
            rosterEl.setAttribute('data-state', 'loaded');
            rosterEl.innerHTML = '<div class="stats-table-wrap"><table class="stats-table"><caption>Roster (players who have appeared this season)</caption><thead><tr>' +
                '<th>Player</th><th>Team</th><th>Status</th><th>Availability</th>' +
                '</tr></thead><tbody>' + availabilityRows.map(function (p) {
                    return '<tr><td>' + escapeHtml(p.player_name || p.player_key) + '</td><td>' + escapeHtml(p.team_abbr) + '</td>' +
                        '<td>' + escapeHtml(p.roster_status) + '</td><td>' + availabilityBadge(p) + '</td></tr>';
                }).join('') + '</tbody></table></div>';

            // Pitcher availability (anyone with a recorded pitching appearance)
            var pitchers = availabilityRows.filter(function (p) { return p.last_pitched_date != null; });
            if (!pitchers.length) {
                pitcherEl.setAttribute('data-state', 'empty');
                pitcherEl.innerHTML = '<p>No pitching appearances recorded yet.</p>';
            } else {
                pitcherEl.setAttribute('data-state', 'loaded');
                pitcherEl.innerHTML = '<div class="stats-table-wrap"><table class="stats-table"><caption>Pitcher Availability</caption><thead><tr>' +
                    '<th>Pitcher</th><th>Team</th><th>Last Pitched</th><th>Outs Last Outing</th><th>Status</th>' +
                    '</tr></thead><tbody>' + pitchers.map(function (p) {
                        var since = daysSince(p.last_pitched_date);
                        var lastText = (typeof p.last_pitched_date === 'string' ? p.last_pitched_date.slice(0, 10) : p.last_pitched_date) + (since != null ? ' (' + since + 'd ago)' : '');
                        return '<tr><td>' + escapeHtml(p.player_name || p.player_key) + '</td><td>' + escapeHtml(p.team_abbr) + '</td>' +
                            '<td>' + escapeHtml(lastText) + '</td><td>' + escapeHtml(p.last_pitched_outs == null ? '-' : p.last_pitched_outs) + '</td>' +
                            '<td>' + availabilityBadge(p) + '</td></tr>';
                    }).join('') + '</tbody></table></div>' +
                    '<p class="season-card-meta">' + escapeHtml(availabilityRows[0].note || '') + '</p>';
            }

            // Injury report
            var injured = availabilityRows.filter(function (p) { return p.injured; });
            if (!injured.length) {
                injuryEl.setAttribute('data-state', 'empty');
                injuryEl.innerHTML = '<p>No active injuries.</p>';
            } else {
                injuryEl.setAttribute('data-state', 'loaded');
                injuryEl.innerHTML = '<div class="stats-table-wrap"><table class="stats-table"><caption>Injury Report</caption><thead><tr>' +
                    '<th>Player</th><th>Team</th><th>Severity</th><th>Reported</th><th>Games Remaining</th>' +
                    '</tr></thead><tbody>' + injured.map(function (p) {
                        var inj = p.injury || {};
                        return '<tr><td>' + escapeHtml(p.player_name || p.player_key) + '</td><td>' + escapeHtml(p.team_abbr) + '</td>' +
                            '<td>' + escapeHtml((inj.severity || '').replace('_', ' ')) + '</td>' +
                            '<td>' + escapeHtml(typeof inj.reported_date === 'string' ? inj.reported_date.slice(0, 10) : (inj.reported_date || '-')) + '</td>' +
                            '<td>' + escapeHtml(inj.games_remaining == null ? '-' : inj.games_remaining) + '</td></tr>';
                    }).join('') + '</tbody></table></div>' +
                    '<p class="sim-data-disclaimer">Simulated injuries are a simplified plausibility model (games-out based recovery), not a claim of real-world injury accuracy.</p>';
            }
        } catch (e) {
            [rosterEl, pitcherEl, injuryEl].forEach(function (el) {
                el.setAttribute('data-state', 'error');
                el.innerHTML = '<p data-tone="error">Could not load roster/availability data. Please try again.</p>';
            });
            console.error('[mlb-sim-season-stats] loadAvailability failed', e);
        }
    }

    function loadAllStatsSections() {
        loadPlayerStats();
        loadTeamStats();
        loadAvailability();
    }

    function wireStatsControls() {
        var qualBat = byId('qualifiedBattingToggle');
        var qualPit = byId('qualifiedPitchingToggle');
        if (qualBat) qualBat.addEventListener('change', function () { qualifiedOnly.batting = qualBat.checked; renderStatsTable(byId('battingLeadersContent'), battingRows, BATTING_COLS, battingSort, 'Batting Leaders (Simulated Season)', 'batting'); });
        if (qualPit) qualPit.addEventListener('change', function () { qualifiedOnly.pitching = qualPit.checked; renderStatsTable(byId('pitchingLeadersContent'), pitchingRows, PITCHING_COLS, pitchingSort, 'Pitching Leaders (Simulated Season)', 'pitching'); });
        var teamFilter = byId('statsTeamFilter');
        if (teamFilter) teamFilter.addEventListener('change', loadAllStatsSections);
    }

    // Exposed so mlb-sim-season-calendar.js's init2() can call this once the
    // season is confirmed to have a schedule/games worth showing stats for -
    // this file does not run its own auth-gate/seasonId resolution, it rides
    // on the calendar page's existing one.
    window.MlbSimSeasonStats = {
        init: function (resolvedSeasonId) {
            seasonId = resolvedSeasonId;
            wireStatsControls();
            loadAllStatsSections();
        },
    };
})();
