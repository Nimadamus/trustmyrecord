(function () {
    'use strict';
    var API_PREFIX = '/mlb-simulator-save';

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

    function track(name, params) {
        try { if (window.TMRAnalytics && typeof window.TMRAnalytics.track === 'function') window.TMRAnalytics.track(name, params || {}); } catch (e) {}
    }

    function savedCardHtml(saved) {
        var r = saved.summarized_result || {};
        var label = (r.awayTeam || 'Away') + ' vs ' + (r.homeTeam || 'Home');
        var score = (r.awayScore && r.homeScore) ? (r.awayScore + ' - ' + r.homeScore) : '';
        return '<div class="season-card-wrap">' +
            '<div class="season-card" data-saved-id="' + saved.id + '">' +
            '<div class="season-card-info">' +
            '<span class="season-card-name">' +
            '<input type="text" class="saved-card-name-input" data-id="' + saved.id + '" value="' + escapeHtml(saved.name || label) + '" maxlength="120">' +
            '</span>' +
            '<span class="season-card-meta">' + escapeHtml(label) + (score ? (' &middot; ' + escapeHtml(score)) : '') +
            ' &middot; saved ' + escapeHtml(formatDate(saved.created_at)) +
            (saved.last_rerun_at ? (' &middot; last rerun ' + escapeHtml(formatDate(saved.last_rerun_at))) : '') + '</span>' +
            '</div>' +
            '<div class="season-card-actions">' +
            '<a class="sim-button secondary" href="/mlb-simulator/?savedId=' + saved.id + '&mode=view">View</a>' +
            '<a class="sim-button secondary" href="/mlb-simulator/?savedId=' + saved.id + '&mode=rerun">Rerun</a>' +
            '<button type="button" class="sim-button secondary" data-action="rename" data-id="' + saved.id + '">Save Name</button>' +
            '<button type="button" class="sim-button secondary" data-tone="danger" data-action="delete" data-id="' + saved.id + '">Delete</button>' +
            '</div></div></div>';
    }

    function followedChipHtml(team) {
        return '<span class="followed-team-chip">' + escapeHtml(team.team_name || team.team_id) +
            '<button type="button" data-action="unfollow" data-team-id="' + escapeHtml(team.team_id) + '" aria-label="Unfollow ' + escapeHtml(team.team_name || team.team_id) + '">&times;</button></span>';
    }

    async function loadSaved() {
        var list = byId('savedResultsList');
        list.setAttribute('data-state', 'loading');
        try {
            var resp = await apiRequest('?limit=100');
            var results = (resp && resp.results) || [];
            if (!results.length) {
                list.setAttribute('data-state', 'empty');
                list.innerHTML = '<p>No saved simulations yet. Run a matchup on the <a href="/mlb-simulator/">MLB Simulator</a> and save it.</p>';
            } else {
                list.setAttribute('data-state', 'loaded');
                list.innerHTML = results.map(savedCardHtml).join('');
                track('simulator_return_visit', { saved_count: results.length });
            }
        } catch (e) {
            var offline = (e && /Failed to fetch|NetworkError|network/i.test(e.message || ''));
            list.setAttribute('data-state', offline ? 'offline' : 'error');
            list.innerHTML = '<p>' + (offline ? 'You appear to be offline. Check your connection and try again.' : 'Could not load your saved simulations. Please try again.') + '</p>';
            console.error('[mlb-sim-saved] loadSaved failed', e);
        }
    }

    async function loadFollowed() {
        var list = byId('followedTeamsList');
        list.setAttribute('data-state', 'loading');
        try {
            var resp = await apiRequest('/follow/teams');
            var teams = (resp && resp.teams) || [];
            if (!teams.length) {
                list.setAttribute('data-state', 'empty');
                list.innerHTML = '<p>You are not following any teams yet. Follow a team from a simulation result.</p>';
            } else {
                list.setAttribute('data-state', 'loaded');
                list.innerHTML = teams.map(followedChipHtml).join('');
            }
        } catch (e) {
            list.setAttribute('data-state', 'error');
            list.innerHTML = '<p>Could not load followed teams.</p>';
        }
    }

    function wireEvents() {
        byId('savedResultsList').addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var id = btn.getAttribute('data-id');
            var action = btn.getAttribute('data-action');
            if (action === 'rename') {
                var input = document.querySelector('.saved-card-name-input[data-id="' + id + '"]');
                var name = input ? input.value.trim() : '';
                btn.disabled = true;
                apiRequest('/' + id, { method: 'PATCH', body: { name: name } })
                    .then(function () { loadSaved(); })
                    .catch(function (err) { window.alert((err && err.message) || 'Failed to rename.'); })
                    .finally(function () { btn.disabled = false; });
            } else if (action === 'delete') {
                if (!window.confirm('Delete this saved simulation? This cannot be undone.')) return;
                btn.disabled = true;
                apiRequest('/' + id, { method: 'DELETE' })
                    .then(function () { loadSaved(); })
                    .catch(function (err) { window.alert((err && err.message) || 'Failed to delete.'); btn.disabled = false; });
            }
        });

        byId('followedTeamsList').addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action="unfollow"]');
            if (!btn) return;
            var teamId = btn.getAttribute('data-team-id');
            btn.disabled = true;
            apiRequest('/follow/teams/' + encodeURIComponent(teamId), { method: 'DELETE' })
                .then(function () { loadFollowed(); })
                .catch(function (err) { window.alert((err && err.message) || 'Failed to unfollow.'); btn.disabled = false; });
        });
    }

    async function init() {
        var gate = byId('authGate');
        var content = byId('savedHubContent');
        if (!window.api || typeof window.api.getCurrentUser !== 'function') {
            gate.setAttribute('data-state', 'error');
            gate.innerHTML = '<div class="auth-gate-prompt"><p>My Saved Simulations could not load (backend client unavailable). Please refresh the page.</p></div>';
            return;
        }
        try {
            var me = await window.api.getCurrentUser();
            var user = me && (me.user || me);
            if (!user || !user.id) throw new Error('not authenticated');
            gate.hidden = true;
            content.hidden = false;
            wireEvents();
            loadSaved();
            loadFollowed();
        } catch (e) {
            gate.setAttribute('data-state', 'unauthenticated');
            gate.innerHTML = '<div class="auth-gate-prompt">' +
                '<p>Sign in to view your saved MLB Simulator results.</p>' +
                '<a class="sim-button primary" href="/login/?next=' + encodeURIComponent('/mlb-simulator/saved/') + '">Sign In</a>' +
                '</div>';
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
