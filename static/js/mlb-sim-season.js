(function () {
    'use strict';
    var API_PREFIX = '/mlb-sim-season';

    function byId(id) { return document.getElementById(id); }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function formatDate(iso) {
        if (!iso) return 'never';
        try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
    }

    async function apiRequest(path, options) {
        if (!window.api || typeof window.api.request !== 'function') {
            throw new Error('Backend client unavailable (static/js/backend-api.js did not load).');
        }
        return window.api.request(API_PREFIX + path, options || {});
    }

    function setMessage(el, text, tone) {
        el.textContent = text || '';
        if (tone) el.setAttribute('data-tone', tone); else el.removeAttribute('data-tone');
    }

    function gameRowHtml(game) {
        var score = (game.final_away_runs != null) ? (game.away_team_abbr + ' ' + game.final_away_runs + ' - ' + game.home_team_abbr + ' ' + game.final_home_runs) : (game.away_team_abbr + ' @ ' + game.home_team_abbr);
        return '<li>' + escapeHtml(score) + ' <span class="season-status-chip" data-status="' + escapeHtml(game.status) + '">' + escapeHtml(game.status) + '</span>' +
            ' <span class="season-card-meta">saved ' + escapeHtml(formatDate(game.saved_at || game.created_at)) + '</span></li>';
    }

    function seasonCardHtml(season) {
        var updated = formatDate(season.updated_at);
        var canArchive = season.status !== 'archived';
        return '<div class="season-card-wrap">' +
            '<div class="season-card" data-season-id="' + season.id + '">' +
            '<div class="season-card-info">' +
            '<span class="season-card-name">' + escapeHtml(season.season_name) +
            '<span class="season-status-chip" data-status="' + escapeHtml(season.status) + '">' + escapeHtml(season.status) + '</span></span>' +
            '<span class="season-card-meta">Year ' + escapeHtml(season.season_year) + ' &middot; last updated ' + escapeHtml(updated) + '</span>' +
            '</div>' +
            '<div class="season-card-actions">' +
            '<button type="button" class="sim-button secondary" data-action="view" data-id="' + season.id + '">View Games</button>' +
            (canArchive ? '<button type="button" class="sim-button secondary" data-action="archive" data-id="' + season.id + '">Archive</button>' : '') +
            '</div></div>' +
            '<div class="season-games-detail" data-season-id="' + season.id + '" hidden></div>' +
            '</div>';
    }

    async function toggleGamesDetail(seasonId, container) {
        if (!container.hidden) { container.hidden = true; return; }
        container.hidden = false;
        container.innerHTML = '<p class="season-card-meta">Loading games…</p>';
        try {
            var resp = await apiRequest('/seasons/' + seasonId);
            var games = (resp && resp.games) || [];
            var listHtml = games.length ? '<ul class="season-games-list">' + games.map(gameRowHtml).join('') + '</ul>' : '<p class="season-card-meta">No games in this season yet.</p>';
            container.innerHTML = listHtml +
                '<p class="season-card-meta season-games-note">Playing a game and saving it into this season is not wired up yet in this foundation phase - creating/saving/resuming individual games already works via the API, but the MLB Simulator page itself does not yet call it. New game shells can be created via the API directly for now.</p>' +
                '<button type="button" class="sim-button secondary" data-action="new-game" data-id="' + seasonId + '">Create a scheduled game shell (ARI @ ATL placeholder)</button>';
        } catch (e) {
            container.innerHTML = '<p class="season-card-meta" data-tone="error">Could not load games for this season.</p>';
        }
    }

    function renderSeasonsList(container, seasons, emptyLabel) {
        if (!seasons.length) {
            container.setAttribute('data-state', 'empty');
            container.innerHTML = '<p>' + escapeHtml(emptyLabel) + '</p>';
            return;
        }
        container.setAttribute('data-state', 'loaded');
        container.innerHTML = seasons.map(seasonCardHtml).join('');
    }

    async function loadSeasons() {
        var activeList = byId('activeSeasonsList');
        var archivedList = byId('archivedSeasonsList');
        activeList.setAttribute('data-state', 'loading');
        archivedList.setAttribute('data-state', 'loading');
        try {
            var resp = await apiRequest('/seasons?limit=100');
            var seasons = (resp && resp.seasons) || [];
            var active = seasons.filter(function (s) { return s.status !== 'archived'; });
            var archived = seasons.filter(function (s) { return s.status === 'archived'; });
            renderSeasonsList(activeList, active, 'No seasons yet. Create one above to get started.');
            renderSeasonsList(archivedList, archived, 'No archived seasons.');
        } catch (e) {
            var offline = (e && /Failed to fetch|NetworkError|network/i.test(e.message || ''));
            var state = offline ? 'offline' : 'error';
            var msg = offline ? 'You appear to be offline. Check your connection and try again.' : 'Could not load your seasons. Please try again.';
            activeList.setAttribute('data-state', state);
            activeList.innerHTML = '<p>' + escapeHtml(msg) + '</p>';
            archivedList.setAttribute('data-state', state);
            archivedList.innerHTML = '<p>' + escapeHtml(msg) + '</p>';
            console.error('[mlb-sim-season] loadSeasons failed', e);
        }
    }

    async function createSeason(name, year) {
        return apiRequest('/seasons', { method: 'POST', body: { season_name: name, season_year: year } });
    }
    async function archiveSeason(id) {
        return apiRequest('/seasons/' + id + '/archive', { method: 'POST' });
    }

    function wireEvents() {
        var form = byId('newSeasonForm');
        var msgEl = byId('createSeasonMessage');
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var name = byId('newSeasonName').value.trim();
            var year = parseInt(byId('newSeasonYear').value, 10) || 2026;
            if (!name) { setMessage(msgEl, 'Season name is required.', 'error'); return; }
            var btn = byId('createSeasonBtn');
            btn.disabled = true;
            setMessage(msgEl, 'Creating season…');
            createSeason(name, year).then(function () {
                setMessage(msgEl, 'Season created.', 'success');
                byId('newSeasonName').value = '';
                loadSeasons();
            }).catch(function (err) {
                setMessage(msgEl, (err && err.message) || 'Failed to create season.', 'error');
            }).finally(function () { btn.disabled = false; });
        });

        // Delegated clicks for view/archive/new-game buttons (lists are re-rendered wholesale on every load).
        ['activeSeasonsList', 'archivedSeasonsList'].forEach(function (id) {
            byId(id).addEventListener('click', function (e) {
                var btn = e.target.closest('[data-action]');
                if (!btn) return;
                var seasonId = btn.getAttribute('data-id');
                var action = btn.getAttribute('data-action');
                if (action === 'view') {
                    var wrap = btn.closest('.season-card-wrap');
                    var detail = wrap.querySelector('.season-games-detail');
                    toggleGamesDetail(seasonId, detail);
                } else if (action === 'archive') {
                    if (!window.confirm('Archive this season? It becomes read-only, but nothing is deleted and you can still view it.')) return;
                    btn.disabled = true;
                    archiveSeason(seasonId).then(function () { loadSeasons(); })
                        .catch(function (err) { window.alert((err && err.message) || 'Failed to archive season.'); btn.disabled = false; });
                } else if (action === 'new-game') {
                    btn.disabled = true;
                    apiRequest('/seasons/' + seasonId + '/games', { method: 'POST', body: { away_team_abbr: 'ARI', home_team_abbr: 'ATL' } })
                        .then(function () { var detail = btn.closest('.season-games-detail'); detail.hidden = true; toggleGamesDetail(seasonId, detail); })
                        .catch(function (err) { window.alert((err && err.message) || 'Failed to create game.'); })
                        .finally(function () { btn.disabled = false; });
                }
            });
        });
    }

    async function init() {
        var gate = byId('authGate');
        var content = byId('seasonHubContent');
        if (!window.api || typeof window.api.getCurrentUser !== 'function') {
            gate.setAttribute('data-state', 'error');
            gate.innerHTML = '<div class="auth-gate-prompt"><p>Season mode could not load (backend client unavailable). Please refresh the page.</p></div>';
            return;
        }
        try {
            var me = await window.api.getCurrentUser();
            var user = me && (me.user || me);
            if (!user || !user.id) throw new Error('not authenticated');
            gate.hidden = true;
            content.hidden = false;
            wireEvents();
            loadSeasons();
        } catch (e) {
            gate.setAttribute('data-state', 'unauthenticated');
            gate.innerHTML = '<div class="auth-gate-prompt">' +
                '<p>Sign in to create and resume simulator seasons.</p>' +
                '<a class="sim-button primary" href="/login/?redirect=' + encodeURIComponent('/mlb-simulator/season/') + '">Sign In</a>' +
                '</div>';
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
