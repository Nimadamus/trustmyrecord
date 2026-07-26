(function () {
    'use strict';
    var API_PREFIX = '/mlb-sim-season';
    var TEAMS = [
        { abbr: 'ARI', name: 'Arizona Diamondbacks' }, { abbr: 'ATL', name: 'Atlanta Braves' },
        { abbr: 'BAL', name: 'Baltimore Orioles' }, { abbr: 'BOS', name: 'Boston Red Sox' },
        { abbr: 'CHC', name: 'Chicago Cubs' }, { abbr: 'CWS', name: 'Chicago White Sox' },
        { abbr: 'CIN', name: 'Cincinnati Reds' }, { abbr: 'CLE', name: 'Cleveland Guardians' },
        { abbr: 'COL', name: 'Colorado Rockies' }, { abbr: 'DET', name: 'Detroit Tigers' },
        { abbr: 'HOU', name: 'Houston Astros' }, { abbr: 'KC', name: 'Kansas City Royals' },
        { abbr: 'LAA', name: 'Los Angeles Angels' }, { abbr: 'LAD', name: 'Los Angeles Dodgers' },
        { abbr: 'MIA', name: 'Miami Marlins' }, { abbr: 'MIL', name: 'Milwaukee Brewers' },
        { abbr: 'MIN', name: 'Minnesota Twins' }, { abbr: 'NYM', name: 'New York Mets' },
        { abbr: 'NYY', name: 'New York Yankees' }, { abbr: 'ATH', name: 'Athletics' },
        { abbr: 'PHI', name: 'Philadelphia Phillies' }, { abbr: 'PIT', name: 'Pittsburgh Pirates' },
        { abbr: 'SD', name: 'San Diego Padres' }, { abbr: 'SF', name: 'San Francisco Giants' },
        { abbr: 'SEA', name: 'Seattle Mariners' }, { abbr: 'STL', name: 'St. Louis Cardinals' },
        { abbr: 'TB', name: 'Tampa Bay Rays' }, { abbr: 'TEX', name: 'Texas Rangers' },
        { abbr: 'TOR', name: 'Toronto Blue Jays' }, { abbr: 'WSH', name: 'Washington Nationals' },
    ];

    var seasonId = null;
    var seasonData = null;

    function byId(id) { return document.getElementById(id); }
    function qs(name) { return new URLSearchParams(window.location.search).get(name); }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function todayIso() {
        var d = new Date();
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
    }
    function addDaysIso(iso, delta) {
        var d = new Date(iso + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + delta);
        return d.toISOString().slice(0, 10);
    }
    function setMessage(el, text, tone) {
        el.textContent = text || '';
        if (tone) el.setAttribute('data-tone', tone); else el.removeAttribute('data-tone');
    }

    async function apiRequest(path, options) {
        if (!window.api || typeof window.api.request !== 'function') {
            throw new Error('Backend client unavailable (static/js/backend-api.js did not load).');
        }
        return window.api.request(API_PREFIX + path, options || {});
    }

    function statusChip(status) {
        return '<span class="season-status-chip" data-status="' + escapeHtml(status) + '">' + escapeHtml(status.replace('_', ' ')) + '</span>';
    }

    function gamesPerTeamFromPreset(presetSelect, customInput) {
        var v = presetSelect.value;
        if (v === 'custom') return parseInt(customInput.value, 10) || 81;
        return parseInt(v, 10);
    }

    // ---- Today & Next Game ----
    function renderTodayNext(games) {
        var container = byId('todayNextContent');
        var today = todayIso();
        var todays = games.filter(function (g) { return g.scheduled_date === today; });
        var upcoming = games.filter(function (g) { return g.scheduled_date >= today && (g.status === 'scheduled' || g.status === 'in_progress' || g.status === 'suspended'); })
            .sort(function (a, b) { return a.scheduled_date < b.scheduled_date ? -1 : 1; });
        var next = upcoming.length ? upcoming[0] : null;
        var html = '';
        if (todays.length) {
            html += '<p class="season-card-meta"><strong>Today (' + escapeHtml(today) + '):</strong></p>' +
                '<ul class="season-games-list">' + todays.map(function (g) { return '<li>' + gameLineHtml(g) + '</li>'; }).join('') + '</ul>';
        } else {
            html += '<p class="season-card-meta">No games scheduled today (' + escapeHtml(today) + ').</p>';
        }
        if (next && !todays.some(function (g) { return g.id === next.id; })) {
            html += '<p class="season-card-meta"><strong>Next up:</strong> ' + gameLineHtml(next) + '</p>';
        } else if (!next) {
            html += '<p class="season-card-meta">No further scheduled games remain.</p>';
        }
        container.innerHTML = html;
    }
    function gameLineHtml(g) {
        var label = g.away_team_abbr + ' @ ' + g.home_team_abbr;
        var score = (g.final_away_runs != null) ? ' (' + g.final_away_runs + '-' + g.final_home_runs + ')' : '';
        return escapeHtml(g.scheduled_date) + ' &middot; ' + escapeHtml(label) + escapeHtml(score) + ' ' + statusChip(g.status) + (g.is_doubleheader ? ' <span class="season-card-meta">(DH g' + g.doubleheader_slot + ')</span>' : '');
    }

    // ---- Schedule list ----
    function gameCardHtml(g) {
        var isFinal = g.status === 'final' || g.status === 'official';
        var scoreText = isFinal ? (g.away_team_abbr + ' ' + g.final_away_runs + ' &ndash; ' + g.home_team_abbr + ' ' + g.final_home_runs) : (g.away_team_abbr + ' @ ' + g.home_team_abbr);
        var actionLabel = isFinal ? 'View Result' : (g.status === 'in_progress' ? 'Resume' : 'Start / Manage');
        return '<div class="schedule-row" data-game-id="' + g.id + '">' +
            '<div class="schedule-row-info">' +
            '<span class="schedule-row-date">' + escapeHtml(g.scheduled_date || 'TBD') + (g.is_doubleheader ? ' <span class="season-card-meta">(DH g' + g.doubleheader_slot + ')</span>' : '') + '</span>' +
            '<span class="schedule-row-matchup">' + escapeHtml(scoreText) + '</span>' +
            statusChip(g.status) +
            '</div>' +
            '<button type="button" class="sim-button secondary" data-action="detail" data-id="' + g.id + '">' + escapeHtml(actionLabel) + '</button>' +
            '</div>';
    }

    async function loadSchedule() {
        var listEl = byId('scheduleList');
        listEl.setAttribute('data-state', 'loading');
        listEl.innerHTML = '<p>Loading schedule…</p>';
        var params = new URLSearchParams();
        var team = byId('teamFilter').value;
        var status = byId('statusFilter').value;
        var dateNav = byId('dateNav').value;
        if (team) params.set('team', team);
        if (status) params.set('status', status);
        if (dateNav) { params.set('from', dateNav); params.set('to', dateNav); }
        params.set('limit', '500');
        try {
            var resp = await apiRequest('/seasons/' + seasonId + '/schedule?' + params.toString());
            var games = resp.games || [];
            renderTodayNext(games.length && !team && !status && !dateNav ? games : (await loadAllGamesForToday()));
            if (!games.length) {
                listEl.setAttribute('data-state', 'empty');
                listEl.innerHTML = '<p>No games match these filters.</p>';
                return;
            }
            listEl.setAttribute('data-state', 'loaded');
            listEl.innerHTML = games.map(gameCardHtml).join('');
        } catch (e) {
            listEl.setAttribute('data-state', 'error');
            var offline = (e && /Failed to fetch|NetworkError|network/i.test(e.message || ''));
            listEl.innerHTML = '<p data-tone="error">' + (offline ? 'You appear to be offline.' : 'Could not load the schedule. Please try again.') + '</p>';
            console.error('[mlb-sim-season-calendar] loadSchedule failed', e);
        }
    }
    // Today/Next always reflects the FULL unfiltered schedule, independent of
    // whatever filters the list below is currently applying.
    var _allGamesCache = null;
    async function loadAllGamesForToday() {
        if (_allGamesCache) return _allGamesCache;
        var resp = await apiRequest('/seasons/' + seasonId + '/schedule?limit=2000');
        _allGamesCache = resp.games || [];
        return _allGamesCache;
    }

    async function showGameDetail(gameId) {
        var panel = byId('gameDetailPanel');
        var title = byId('gameDetailTitle');
        var content = byId('gameDetailContent');
        panel.hidden = false;
        content.innerHTML = '<p class="season-card-meta">Loading…</p>';
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        try {
            var resp = await apiRequest('/games/' + gameId);
            var g = resp.game;
            title.textContent = g.away_team_abbr + ' @ ' + g.home_team_abbr + ' (' + (g.scheduled_date || 'TBD') + ')';
            var isFinal = g.status === 'final' || g.status === 'official';
            var isLocked = ['suspended', 'postponed', 'cancelled'].indexOf(g.status) !== -1;
            var html = '<p>' + statusChip(g.status) + (isFinal ? ' &middot; Final score: ' + g.away_team_abbr + ' ' + g.final_away_runs + ' &ndash; ' + g.home_team_abbr + ' ' + g.final_home_runs + (g.innings ? ' (' + g.innings + ' innings)' : '') : '') + '</p>';
            if (isFinal) {
                html += '<p class="season-games-note">Full box score / play-by-play detail is not built yet in this phase - only the final score and innings are recorded.</p>' +
                    '<details class="regen-details"><summary>Correct this result</summary>' +
                    '<form id="correctForm" class="new-season-form">' +
                    '<label class="season-field season-field-narrow"><span>' + escapeHtml(g.away_team_abbr) + ' runs</span><input type="number" min="0" id="correctAway" value="' + g.final_away_runs + '"></label>' +
                    '<label class="season-field season-field-narrow"><span>' + escapeHtml(g.home_team_abbr) + ' runs</span><input type="number" min="0" id="correctHome" value="' + g.final_home_runs + '"></label>' +
                    '<button type="button" class="sim-button primary" id="correctSubmitBtn" data-id="' + g.id + '">Confirm Correction</button>' +
                    '</form><p id="correctMessage" class="season-message" role="status"></p></details>';
            } else if (isLocked) {
                html += '<p class="season-games-note">This game is ' + escapeHtml(g.status) + ' and does not count toward standings.</p>' +
                    '<button type="button" class="sim-button secondary" data-action="unlock" data-id="' + g.id + '">Return to Scheduled</button>';
            } else {
                html += '<p class="season-games-note">Playing this game live through the MLB Simulator engine and having it auto-save back here is not wired up yet in this phase - use the <a href="/mlb-simulator/">MLB Simulator</a> to play it manually, then record the final result below, or mark it suspended/postponed/cancelled.</p>' +
                    '<form id="completeForm" class="new-season-form">' +
                    '<label class="season-field season-field-narrow"><span>' + escapeHtml(g.away_team_abbr) + ' runs</span><input type="number" min="0" id="completeAway" value="0"></label>' +
                    '<label class="season-field season-field-narrow"><span>' + escapeHtml(g.home_team_abbr) + ' runs</span><input type="number" min="0" id="completeHome" value="0"></label>' +
                    '<label class="season-field season-field-narrow"><span>Innings</span><input type="number" min="1" id="completeInnings" value="9"></label>' +
                    '<button type="button" class="sim-button primary" id="completeSubmitBtn" data-id="' + g.id + '">Record Final</button>' +
                    '</form>' +
                    '<div class="season-card-actions" style="margin-top:10px">' +
                    '<button type="button" class="sim-button secondary" data-action="status" data-status="suspended" data-id="' + g.id + '">Mark Suspended</button>' +
                    '<button type="button" class="sim-button secondary" data-action="status" data-status="postponed" data-id="' + g.id + '">Mark Postponed</button>' +
                    '<button type="button" class="sim-button secondary" data-action="status" data-status="cancelled" data-id="' + g.id + '">Mark Cancelled</button>' +
                    '</div>' +
                    '<p id="completeMessage" class="season-message" role="status"></p>';
            }
            content.innerHTML = html;
            wireDetailActions(gameId);
        } catch (e) {
            content.innerHTML = '<p data-tone="error">Could not load this game.</p>';
        }
    }

    function wireDetailActions(gameId) {
        var completeBtn = byId('completeSubmitBtn');
        if (completeBtn) {
            completeBtn.addEventListener('click', function () {
                var body = {
                    final_away_runs: parseInt(byId('completeAway').value, 10) || 0,
                    final_home_runs: parseInt(byId('completeHome').value, 10) || 0,
                    innings: parseInt(byId('completeInnings').value, 10) || 9,
                    status: 'final',
                };
                completeBtn.disabled = true;
                apiRequest('/games/' + gameId + '/complete', { method: 'POST', body: body })
                    .then(function () { _allGamesCache = null; loadSchedule(); loadStandings(); showGameDetail(gameId); })
                    .catch(function (e) { setMessage(byId('completeMessage'), (e && e.message) || 'Failed to record final.', 'error'); })
                    .finally(function () { completeBtn.disabled = false; });
            });
        }
        var correctBtn = byId('correctSubmitBtn');
        if (correctBtn) {
            correctBtn.addEventListener('click', function () {
                if (!window.confirm('This will reverse and reapply this game\'s standings impact. Continue?')) return;
                var body = {
                    final_away_runs: parseInt(byId('correctAway').value, 10) || 0,
                    final_home_runs: parseInt(byId('correctHome').value, 10) || 0,
                    confirmCorrection: true,
                };
                correctBtn.disabled = true;
                apiRequest('/games/' + gameId + '/correct-final', { method: 'POST', body: body })
                    .then(function () { _allGamesCache = null; loadSchedule(); loadStandings(); showGameDetail(gameId); })
                    .catch(function (e) { setMessage(byId('correctMessage'), (e && e.message) || 'Failed to correct result.', 'error'); })
                    .finally(function () { correctBtn.disabled = false; });
            });
        }
        var content = byId('gameDetailContent');
        content.querySelectorAll('[data-action="status"]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                btn.disabled = true;
                apiRequest('/games/' + gameId + '/status', { method: 'PATCH', body: { status: btn.getAttribute('data-status') } })
                    .then(function () { _allGamesCache = null; loadSchedule(); loadStandings(); showGameDetail(gameId); })
                    .catch(function (e) { window.alert((e && e.message) || 'Failed to update status.'); })
                    .finally(function () { btn.disabled = false; });
            });
        });
        var unlockBtn = content.querySelector('[data-action="unlock"]');
        if (unlockBtn) {
            unlockBtn.addEventListener('click', function () {
                unlockBtn.disabled = true;
                apiRequest('/games/' + gameId + '/status', { method: 'PATCH', body: { status: 'scheduled' } })
                    .then(function () { _allGamesCache = null; loadSchedule(); showGameDetail(gameId); })
                    .catch(function (e) { window.alert((e && e.message) || 'Failed to update status.'); })
                    .finally(function () { unlockBtn.disabled = false; });
            });
        }
    }

    // ---- Standings ----
    function standingsTableHtml(rows, title) {
        var head = '<table class="standings-table"><caption>' + escapeHtml(title) + '</caption><thead><tr>' +
            '<th>Team</th><th>W</th><th>L</th><th>PCT</th><th>GB</th><th>Streak</th><th>L10</th><th>Home</th><th>Away</th><th>RS</th><th>RA</th><th>Diff</th>' +
            '</tr></thead><tbody>';
        var body = rows.map(function (r) {
            return '<tr>' +
                '<td>' + escapeHtml(r.team_abbr) + '</td>' +
                '<td>' + r.wins + '</td><td>' + r.losses + '</td>' +
                '<td>' + r.win_pct.toFixed(3).replace(/^0/, '') + '</td>' +
                '<td>' + (r.games_behind === 0 ? '-' : r.games_behind) + '</td>' +
                '<td>' + (r.streak_type ? r.streak_type + r.streak_count : '-') + '</td>' +
                '<td>' + r.last10_wins + '-' + r.last10_losses + '</td>' +
                '<td>' + r.home_wins + '-' + r.home_losses + '</td>' +
                '<td>' + r.away_wins + '-' + r.away_losses + '</td>' +
                '<td>' + r.runs_scored + '</td><td>' + r.runs_allowed + '</td>' +
                '<td>' + (r.run_differential > 0 ? '+' : '') + r.run_differential + '</td>' +
                '</tr>';
        }).join('');
        return head + body + '</tbody></table>';
    }

    async function loadStandings() {
        var container = byId('standingsContent');
        container.setAttribute('data-state', 'loading');
        container.innerHTML = '<p>Loading standings…</p>';
        try {
            var resp = await apiRequest('/seasons/' + seasonId + '/standings');
            byId('standingsTieNote').textContent = 'Tie order: ' + (resp.tieOrder || '');
            var rows = resp.standings || [];
            if (!rows.length) { container.setAttribute('data-state', 'empty'); container.innerHTML = '<p>No standings yet.</p>'; return; }
            var byDiv = {};
            rows.forEach(function (r) { var key = (r.league || '?') + ' ' + (r.division || '?'); (byDiv[key] = byDiv[key] || []).push(r); });
            container.setAttribute('data-state', 'loaded');
            container.innerHTML = '<div class="standings-tables-wrap">' + Object.keys(byDiv).sort().map(function (key) {
                return standingsTableHtml(byDiv[key], key);
            }).join('') + '</div>';
        } catch (e) {
            container.setAttribute('data-state', 'error');
            container.innerHTML = '<p data-tone="error">Could not load standings. Please try again.</p>';
            console.error('[mlb-sim-season-calendar] loadStandings failed', e);
        }
    }

    // ---- Schedule generation ----
    function wireGenerateForm(formId, presetId, customWrapId, customId, btnId, msgId, extraOpts) {
        var form = byId(formId);
        byId(presetId).addEventListener('change', function () { byId(customWrapId).hidden = this.value !== 'custom'; });
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var gamesPerTeam = gamesPerTeamFromPreset(byId(presetId), byId(customId));
            var btn = byId(btnId);
            var msgEl = byId(msgId);
            btn.disabled = true;
            setMessage(msgEl, 'Generating…');
            var body = Object.assign({ gamesPerTeam: gamesPerTeam }, extraOpts());
            apiRequest('/seasons/' + seasonId + '/schedule/generate', { method: 'POST', body: body })
                .then(function (resp) {
                    setMessage(msgEl, 'Schedule generated: ' + resp.gameCount + ' games.', 'success');
                    seasonData = resp.season;
                    init2();
                })
                .catch(function (err) {
                    var details = err && err.data && err.data.details;
                    var detail = (Array.isArray(details) && details.length) ? ' (' + details.slice(0, 3).join('; ') + ')' : '';
                    setMessage(msgEl, ((err && err.message) || 'Failed to generate schedule.') + detail, 'error');
                })
                .finally(function () { btn.disabled = false; });
        });
    }

    async function init2() {
        // Re-fetch season to decide which state to show.
        var seasonResp = await apiRequest('/seasons/' + seasonId);
        seasonData = seasonResp.season;
        byId('pageTitle').textContent = seasonData.season_name + ' - Schedule & Standings';
        _allGamesCache = null;
        if (!seasonData.has_schedule) {
            byId('noScheduleState').hidden = false;
            byId('scheduleExistsState').hidden = true;
            var d = byId('genStartDate');
            if (!d.value) d.value = seasonData.season_year + '-03-26';
        } else {
            byId('noScheduleState').hidden = true;
            byId('scheduleExistsState').hidden = false;
            loadSchedule();
            loadStandings();
        }
    }

    function wireFilters() {
        var teamSel = byId('teamFilter');
        TEAMS.forEach(function (t) {
            var opt = document.createElement('option');
            opt.value = t.abbr; opt.textContent = t.abbr + ' - ' + t.name;
            teamSel.appendChild(opt);
        });
        teamSel.addEventListener('change', loadSchedule);
        byId('statusFilter').addEventListener('change', loadSchedule);
        byId('dateNav').addEventListener('change', loadSchedule);
        byId('prevDayBtn').addEventListener('click', function () {
            var el = byId('dateNav');
            el.value = addDaysIso(el.value || todayIso(), -1);
            loadSchedule();
        });
        byId('nextDayBtn').addEventListener('click', function () {
            var el = byId('dateNav');
            el.value = addDaysIso(el.value || todayIso(), 1);
            loadSchedule();
        });
        byId('clearDateBtn').addEventListener('click', function () { byId('dateNav').value = ''; loadSchedule(); });

        byId('scheduleList').addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action="detail"]');
            if (!btn) return;
            showGameDetail(btn.getAttribute('data-id'));
        });
    }

    function wireRebuild() {
        byId('rebuildDryRunBtn').addEventListener('click', function () {
            var out = byId('rebuildResult');
            out.textContent = 'Checking…';
            apiRequest('/seasons/' + seasonId + '/standings/rebuild', { method: 'POST', body: {} })
                .then(function (resp) {
                    if (resp.discrepancyCount === 0) {
                        out.innerHTML = '<span data-tone="success">Zero discrepancies - standings are already consistent with a from-scratch rebuild.</span>';
                        byId('rebuildApplyBtn').hidden = true;
                    } else {
                        out.innerHTML = '<span data-tone="error">' + resp.discrepancyCount + ' discrepancies found:</span><ul>' +
                            resp.discrepancies.slice(0, 20).map(function (d) { return '<li>' + escapeHtml(d) + '</li>'; }).join('') + '</ul>';
                        byId('rebuildApplyBtn').hidden = false;
                    }
                })
                .catch(function (e) { out.innerHTML = '<span data-tone="error">' + escapeHtml((e && e.message) || 'Rebuild check failed.') + '</span>'; });
        });
        byId('rebuildApplyBtn').addEventListener('click', function () {
            if (!window.confirm('Apply the rebuilt standings? This overwrites stored standings with the from-scratch recomputation.')) return;
            var out = byId('rebuildResult');
            apiRequest('/seasons/' + seasonId + '/standings/rebuild?apply=true', { method: 'POST', body: { apply: true } })
                .then(function () { out.innerHTML = '<span data-tone="success">Rebuild applied.</span>'; loadStandings(); })
                .catch(function (e) { out.innerHTML = '<span data-tone="error">' + escapeHtml((e && e.message) || 'Apply failed.') + '</span>'; });
        });
    }

    async function init() {
        seasonId = qs('seasonId');
        var gate = byId('authGate');
        var content = byId('calendarContent');
        if (!seasonId) {
            gate.hidden = true;
            byId('noSeasonIdState').hidden = false;
            return;
        }
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
            wireGenerateForm('generateForm', 'genPreset', 'genCustomWrap', 'genCustom', 'generateBtn', 'generateMessage', function () {
                return { startDate: byId('genStartDate').value || undefined, allowDoubleheaders: byId('genDoubleheaders').checked };
            });
            wireGenerateForm('regenerateForm', 'regenPreset', 'regenCustomWrap', 'regenCustom', 'regenerateBtn', 'regenerateMessage', function () {
                return { forceReset: true, allowDoubleheaders: true };
            });
            wireFilters();
            wireRebuild();
            await init2();
        } catch (e) {
            gate.setAttribute('data-state', 'unauthenticated');
            gate.innerHTML = '<div class="auth-gate-prompt">' +
                '<p>Sign in to view this season\'s schedule and standings.</p>' +
                '<a class="sim-button primary" href="/login/?redirect=' + encodeURIComponent(window.location.pathname + window.location.search) + '">Sign In</a>' +
                '</div>';
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
