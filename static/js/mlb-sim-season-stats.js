(function () {
    'use strict';
    var API_PREFIX = '/mlb-sim-season';
    var TEAMS = [
        'ARI', 'ATL', 'BAL', 'BOS', 'CHC', 'CWS', 'CIN', 'CLE', 'COL', 'DET',
        'HOU', 'KC', 'LAA', 'LAD', 'MIA', 'MIL', 'MIN', 'NYM', 'NYY', 'ATH',
        'PHI', 'PIT', 'SD', 'SF', 'SEA', 'STL', 'TB', 'TEX', 'TOR', 'WSH',
    ];
    var seasonId = null;

    function byId(id) { return document.getElementById(id); }
    function qs(name) { return new URLSearchParams(window.location.search).get(name); }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function fmt3(v) { return v == null ? '-' : v.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.'); }
    function fmt2(v) { return v == null ? '-' : v.toFixed(2); }

    async function apiRequest(path, options) {
        if (!window.api || typeof window.api.request !== 'function') {
            throw new Error('Backend client unavailable (static/js/backend-api.js did not load).');
        }
        return window.api.request(API_PREFIX + path, options || {});
    }

    // ---- Team stats ----
    function teamStatsTableHtml(teams) {
        var head = '<table class="standings-table"><caption>Team Batting / Pitching</caption><thead><tr>' +
            '<th>Team</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>ERA</th><th>WHIP</th>' +
            '<th>1-Run W-L</th><th>X-Inn W-L</th><th>SHO (P/S)</th><th>Comebacks</th><th>Blown Leads</th>' +
            '</tr></thead><tbody>';
        var rows = teams.map(function (t) {
            return '<tr>' +
                '<td>' + escapeHtml(t.team_abbr) + '</td>' +
                '<td>' + fmt3(t.batting.avg) + '</td><td>' + fmt3(t.batting.obp) + '</td><td>' + fmt3(t.batting.slg) + '</td><td>' + fmt3(t.batting.ops) + '</td>' +
                '<td>' + fmt2(t.pitching.era) + '</td><td>' + fmt2(t.pitching.whip) + '</td>' +
                '<td>' + t.one_run_wins + '-' + t.one_run_losses + '</td>' +
                '<td>' + t.extra_inning_wins + '-' + t.extra_inning_losses + '</td>' +
                '<td>' + t.shutouts_pitched + '/' + t.shutouts_suffered + '</td>' +
                '<td>' + t.comebacks + '</td><td>' + t.blown_leads + '</td>' +
                '</tr>';
        }).join('');
        return head + rows + '</tbody></table>';
    }
    async function loadTeamStats() {
        var el = byId('teamStatsContent');
        el.setAttribute('data-state', 'loading');
        el.innerHTML = '<p>Loading…</p>';
        try {
            var resp = await apiRequest('/seasons/' + seasonId + '/team-stats');
            var teams = resp.teams || [];
            var team = byId('teamFilter').value;
            if (team) teams = teams.filter(function (t) { return t.team_abbr === team; });
            if (!teams.length) { el.setAttribute('data-state', 'empty'); el.innerHTML = '<p>No team stats yet - complete a game with a box score first.</p>'; return; }
            el.setAttribute('data-state', 'loaded');
            el.innerHTML = '<div class="standings-tables-wrap">' + teamStatsTableHtml(teams) + '</div>';
        } catch (e) {
            el.setAttribute('data-state', 'error');
            el.innerHTML = '<p data-tone="error">Could not load team stats.</p>';
            console.error('[mlb-sim-season-stats] loadTeamStats failed', e);
        }
    }

    // ---- Player stats ----
    function playerStatsTableHtml(players) {
        var batters = players.filter(function (p) { return p.batting.plate_appearances > 0; });
        var pitchers = players.filter(function (p) { return p.pitching.outs > 0; });
        var head1 = '<table class="standings-table"><caption>Batting</caption><thead><tr>' +
            '<th>Player</th><th>Team</th><th>G</th><th>AB</th><th>H</th><th>HR</th><th>RBI</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th>' +
            '</tr></thead><tbody>';
        var body1 = batters.map(function (p) {
            var b = p.batting;
            return '<tr><td>' + escapeHtml(p.player_name || p.player_key) + '</td><td>' + escapeHtml(p.team_abbr) + '</td>' +
                '<td>' + b.games + '</td><td>' + b.at_bats + '</td><td>' + b.hits + '</td><td>' + b.home_runs + '</td><td>' + b.rbi + '</td>' +
                '<td>' + fmt3(b.avg) + '</td><td>' + fmt3(b.obp) + '</td><td>' + fmt3(b.slg) + '</td><td>' + fmt3(b.ops) + '</td></tr>';
        }).join('');
        var head2 = '<table class="standings-table"><caption>Pitching</caption><thead><tr>' +
            '<th>Player</th><th>Team</th><th>G</th><th>GS</th><th>IP</th><th>W-L</th><th>SV</th><th>SO</th><th>ERA</th><th>WHIP</th>' +
            '</tr></thead><tbody>';
        var body2 = pitchers.map(function (p) {
            var pt = p.pitching;
            return '<tr><td>' + escapeHtml(p.player_name || p.player_key) + '</td><td>' + escapeHtml(p.team_abbr) + '</td>' +
                '<td>' + pt.games + '</td><td>' + pt.starts + '</td><td>' + escapeHtml(pt.innings_pitched) + '</td>' +
                '<td>' + pt.wins + '-' + pt.losses + '</td><td>' + pt.saves + '</td><td>' + pt.strikeouts + '</td>' +
                '<td>' + fmt2(pt.era) + '</td><td>' + fmt2(pt.whip) + '</td></tr>';
        }).join('');
        return '<div class="standings-tables-wrap">' + head1 + body1 + '</tbody></table>' + head2 + body2 + '</tbody></table></div>';
    }
    async function loadPlayerStats() {
        var el = byId('playerStatsContent');
        el.setAttribute('data-state', 'loading');
        el.innerHTML = '<p>Loading…</p>';
        try {
            var team = byId('teamFilter').value;
            var resp = await apiRequest('/seasons/' + seasonId + '/player-stats' + (team ? '?team=' + team : ''));
            var players = resp.players || [];
            if (!players.length) { el.setAttribute('data-state', 'empty'); el.innerHTML = '<p>No player stats yet.</p>'; return; }
            el.setAttribute('data-state', 'loaded');
            el.innerHTML = playerStatsTableHtml(players);
        } catch (e) {
            el.setAttribute('data-state', 'error');
            el.innerHTML = '<p data-tone="error">Could not load player stats.</p>';
            console.error('[mlb-sim-season-stats] loadPlayerStats failed', e);
        }
    }

    // ---- Availability / injuries ----
    function availabilityTableHtml(players) {
        var head = '<table class="standings-table"><caption>Roster Availability</caption><thead><tr>' +
            '<th>Player</th><th>Team</th><th>Status</th><th>Injury</th><th>Games Remaining</th><th>Last Pitched</th>' +
            '</tr></thead><tbody>';
        var body = players.map(function (p) {
            var injuryText = p.injury ? escapeHtml(p.injury.severity.replace(/_/g, ' ')) : '-';
            var remaining = p.injury ? p.injury.games_remaining : '-';
            return '<tr><td>' + escapeHtml(p.player_name || p.player_key) + '</td><td>' + escapeHtml(p.team_abbr) + '</td>' +
                '<td>' + statusChip(p.roster_status) + '</td><td>' + injuryText + '</td><td>' + remaining + '</td>' +
                '<td>' + (p.last_pitched_date ? escapeHtml(String(p.last_pitched_date).slice(0, 10)) : '-') + '</td></tr>';
        }).join('');
        return head + body + '</tbody></table>';
    }
    function statusChip(status) {
        return '<span class="season-status-chip" data-status="' + escapeHtml(status) + '">' + escapeHtml(status) + '</span>';
    }
    async function loadAvailability() {
        var el = byId('availabilityContent');
        el.setAttribute('data-state', 'loading');
        el.innerHTML = '<p>Loading…</p>';
        try {
            var team = byId('teamFilter').value;
            var resp = await apiRequest('/seasons/' + seasonId + '/availability' + (team ? '?team=' + team : ''));
            var players = (resp.players || []).filter(function (p) { return p.roster_status === 'injured' || p.injured; });
            if (!players.length) { el.setAttribute('data-state', 'empty'); el.innerHTML = '<p>No injured players' + (team ? ' on ' + escapeHtml(team) : '') + ' right now.</p>'; return; }
            el.setAttribute('data-state', 'loaded');
            el.innerHTML = availabilityTableHtml(players);
        } catch (e) {
            el.setAttribute('data-state', 'error');
            el.innerHTML = '<p data-tone="error">Could not load roster availability.</p>';
            console.error('[mlb-sim-season-stats] loadAvailability failed', e);
        }
    }

    function loadAll() { loadTeamStats(); loadPlayerStats(); loadAvailability(); }

    function wireRebuild(dryBtnId, applyBtnId, resultId, path) {
        byId(dryBtnId).addEventListener('click', function () {
            var out = byId(resultId);
            out.textContent = 'Checking…';
            apiRequest('/seasons/' + seasonId + path, { method: 'POST', body: {} })
                .then(function (resp) {
                    if (resp.discrepancyCount === 0) {
                        out.innerHTML = '<span data-tone="success">Zero discrepancies.</span>';
                        byId(applyBtnId).hidden = true;
                    } else {
                        out.innerHTML = '<span data-tone="error">' + resp.discrepancyCount + ' discrepancies:</span><ul>' +
                            resp.discrepancies.slice(0, 20).map(function (d) { return '<li>' + escapeHtml(d) + '</li>'; }).join('') + '</ul>';
                        byId(applyBtnId).hidden = false;
                    }
                })
                .catch(function (e) { out.innerHTML = '<span data-tone="error">' + escapeHtml((e && e.message) || 'Check failed.') + '</span>'; });
        });
        byId(applyBtnId).addEventListener('click', function () {
            if (!window.confirm('Apply this rebuild? This overwrites cached values with the from-scratch recomputation.')) return;
            var out = byId(resultId);
            apiRequest('/seasons/' + seasonId + path + '?apply=true', { method: 'POST', body: { apply: true } })
                .then(function () { out.innerHTML = '<span data-tone="success">Rebuild applied.</span>'; loadAll(); })
                .catch(function (e) { out.innerHTML = '<span data-tone="error">' + escapeHtml((e && e.message) || 'Apply failed.') + '</span>'; });
        });
    }

    async function init() {
        seasonId = qs('seasonId');
        var gate = byId('authGate');
        var content = byId('statsContent');
        if (!seasonId) { gate.hidden = true; byId('noSeasonIdState').hidden = false; return; }
        if (!window.api || typeof window.api.getCurrentUser !== 'function') {
            gate.setAttribute('data-state', 'error');
            gate.innerHTML = '<div class="auth-gate-prompt"><p>Could not load (backend client unavailable). Please refresh.</p></div>';
            return;
        }
        try {
            var me = await window.api.getCurrentUser();
            var user = me && (me.user || me);
            if (!user || !user.id) throw new Error('not authenticated');
            gate.hidden = true;
            content.hidden = false;
            byId('calendarLink').href = '/mlb-simulator/season/calendar/?seasonId=' + encodeURIComponent(seasonId);

            var teamSel = byId('teamFilter');
            TEAMS.forEach(function (t) {
                var opt = document.createElement('option'); opt.value = t; opt.textContent = t; teamSel.appendChild(opt);
            });
            teamSel.addEventListener('change', loadAll);

            wireRebuild('statsRebuildDryRunBtn', 'statsRebuildApplyBtn', 'statsRebuildResult', '/player-stats/rebuild');
            wireRebuild('injuryRebuildDryRunBtn', 'injuryRebuildApplyBtn', 'injuryRebuildResult', '/injuries/rebuild');

            var seasonResp = await apiRequest('/seasons/' + seasonId);
            byId('pageTitle').textContent = (seasonResp.season ? seasonResp.season.season_name : 'Season') + ' - Stats & Roster';

            loadAll();
        } catch (e) {
            gate.setAttribute('data-state', 'unauthenticated');
            gate.innerHTML = '<div class="auth-gate-prompt">' +
                '<p>Sign in to view this season\'s stats and roster.</p>' +
                '<a class="sim-button primary" href="/login/?redirect=' + encodeURIComponent(window.location.pathname + window.location.search) + '">Sign In</a>' +
                '</div>';
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
