(function () {
    'use strict';

    var SPORT_KEY = 'baseball_mlb';
    var state = {
        games: [],
        selectedGameId: '',
        loading: false
    };

    var MARKET_LABELS = {
        h2h: 'Moneyline',
        spreads: 'Run Line',
        totals: 'Game Total',
        team_totals: 'Team Totals',
        f5_h2h: 'First 5 Moneyline',
        f5_spreads: 'First 5 Run Line',
        f5_totals: 'First 5 Total',
        alt_spreads: 'Alt Run Lines',
        alt_totals: 'Alt Totals'
    };

    var GROUP_PRIORITY = ['full_game', 'spread', 'total', 'team_totals', 'first_5', 'alt_spreads', 'alt_totals'];

    function byId(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setText(id, value) {
        var el = byId(id);
        if (el) el.textContent = value;
    }

    function setMessage(text, kind) {
        var el = byId('simBoardMessage');
        if (!el) return;
        el.textContent = text || '';
        el.className = 'sim-message' + (kind ? ' ' + kind : '');
    }

    function formatDateTime(value) {
        if (!value) return 'Game time unavailable';
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Game time unavailable';
        return date.toLocaleString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    function formatLine(value, signed) {
        if (value == null || value === '') return '';
        var num = Number(value);
        if (!Number.isFinite(num)) return String(value);
        var text = String(num);
        if (text.indexOf('.') !== -1) text = text.replace(/0+$/, '').replace(/\.$/, '');
        return signed && num > 0 ? '+' + text : text;
    }

    function formatOdds(value) {
        if (value == null || value === '') return '';
        var num = Number(value);
        if (!Number.isFinite(num)) return String(value);
        return num > 0 ? '+' + num : String(num);
    }

    function getSelectedGame() {
        return state.games.find(function (game) {
            return String(game.id) === String(state.selectedGameId);
        }) || null;
    }

    function getMarketCount(game) {
        return (game && Array.isArray(game.market_groups) ? game.market_groups : [])
            .reduce(function (sum, group) {
                return sum + (Array.isArray(group.items) ? group.items.length : 0);
            }, 0);
    }

    function normalizeGroupLabel(group) {
        if (!group) return 'Market';
        if (group.label) return group.label;
        var first = Array.isArray(group.items) ? group.items[0] : null;
        return MARKET_LABELS[first && first.market_type] || group.key || 'Market';
    }

    function sortGroups(groups) {
        return groups.slice().sort(function (a, b) {
            var aRank = GROUP_PRIORITY.indexOf(a.key);
            var bRank = GROUP_PRIORITY.indexOf(b.key);
            if (aRank === -1) aRank = 999;
            if (bRank === -1) bRank = 999;
            return aRank - bRank;
        });
    }

    function renderMatchupOptions() {
        var select = byId('mlbMatchupSelect');
        if (!select) return;

        if (state.loading) {
            select.disabled = true;
            select.innerHTML = '<option value="">Loading MLB games...</option>';
            return;
        }

        if (!state.games.length) {
            select.disabled = true;
            select.innerHTML = '<option value="">No MLB matchups available</option>';
            return;
        }

        select.disabled = false;
        select.innerHTML = state.games.map(function (game) {
            var label = (game.away_team || 'Away') + ' at ' + (game.home_team || 'Home') + ' - ' + formatDateTime(game.commence_time);
            return '<option value="' + escapeHtml(game.id) + '">' + escapeHtml(label) + '</option>';
        }).join('');

        if (!state.selectedGameId || !getSelectedGame()) {
            state.selectedGameId = state.games[0].id;
        }
        select.value = state.selectedGameId;
    }

    function renderMarketGroups(game) {
        var container = byId('marketGroups');
        if (!container) return;

        var groups = game && Array.isArray(game.market_groups) ? game.market_groups : [];
        if (!game) {
            container.innerHTML = '<div class="sim-empty">Select a matchup to view moneyline, run line, total, team total, and F5 availability.</div>';
            return;
        }

        if (!groups.length) {
            container.innerHTML = '<div class="sim-empty">No sportsbook-backed market groups are available for this matchup yet. The simulator will not synthesize lines.</div>';
            return;
        }

        container.innerHTML = sortGroups(groups).map(function (group) {
            var items = Array.isArray(group.items) ? group.items : [];
            if (!items.length) return '';
            return [
                '<section class="market-group">',
                '<h3>' + escapeHtml(normalizeGroupLabel(group)) + '</h3>',
                '<div class="market-card-grid">',
                items.map(function (item) {
                    var line = formatLine(item.line, true);
                    var odds = formatOdds(item.odds);
                    var detail = [
                        line ? 'Line ' + line : '',
                        odds ? 'Odds ' + odds : '',
                        item.book_title || item.source_label || ''
                    ].filter(Boolean).join(' | ');
                    return [
                        '<article class="market-card">',
                        '<strong>' + escapeHtml(item.selection_label || item.selection || 'Market') + '</strong>',
                        '<em>' + escapeHtml(MARKET_LABELS[item.market_type] || item.market_type || group.label || 'Market') + '</em>',
                        '<small>' + escapeHtml(detail || 'Line pending') + '</small>',
                        '</article>'
                    ].join('');
                }).join(''),
                '</div>',
                '</section>'
            ].join('');
        }).join('');
    }

    function renderSelectedGame() {
        var game = getSelectedGame();
        setText('selectedMatchupTitle', game ? (game.away_team + ' at ' + game.home_team) : 'No matchup selected');
        setText('awayTeamName', game ? game.away_team : '--');
        setText('homeTeamName', game ? game.home_team : '--');
        setText('gameTimeLabel', game ? formatDateTime(game.commence_time) : 'Game time unavailable');
        var groupCount = game && Array.isArray(game.market_groups) ? game.market_groups.length : 0;
        var marketCount = getMarketCount(game);
        setText('marketCountLabel', groupCount + ' market groups / ' + marketCount + ' selections');
        setText('boardInputStatus', game ? 'Connected to MLB market board' : 'No matchup selected');
        renderMarketGroups(game);
    }

    function updateBoardStatus(data) {
        var summary = data && data.summary ? data.summary : {};
        setText('simDataSourceTitle', 'Existing MLB market board');
        setText('simDataSourceDetail', summary.message || 'Read-only /api/games/board/baseball_mlb data');
    }

    async function loadMlbBoard() {
        state.loading = true;
        renderMatchupOptions();
        setMessage('Loading MLB board from TrustMyRecord market infrastructure...');
        setText('boardInputStatus', 'Loading');

        try {
            if (!window.api || typeof window.api.getMarketBoard !== 'function') {
                throw new Error('TrustMyRecord API client is not available on this page.');
            }
            if (window.api.ready) {
                try { await window.api.ready; } catch (error) {}
            }
            var data = await window.api.getMarketBoard(SPORT_KEY);
            state.games = Array.isArray(data && data.games) ? data.games : [];
            state.selectedGameId = state.games.length ? state.games[0].id : '';
            updateBoardStatus(data);
            setMessage(state.games.length
                ? 'Loaded ' + state.games.length + ' MLB matchup' + (state.games.length === 1 ? '' : 's') + '.'
                : 'No upcoming MLB matchups are available from the existing board right now.');
        } catch (error) {
            state.games = [];
            state.selectedGameId = '';
            setText('simDataSourceDetail', 'Unable to load MLB board.');
            setText('boardInputStatus', 'Unavailable');
            setMessage(error && error.message ? error.message : 'Unable to load MLB board.', 'error');
        } finally {
            state.loading = false;
            renderMatchupOptions();
            renderSelectedGame();
        }
    }

    function wireEvents() {
        var select = byId('mlbMatchupSelect');
        if (select) {
            select.addEventListener('change', function () {
                state.selectedGameId = select.value;
                renderSelectedGame();
            });
        }

        var refresh = byId('refreshMlbBoard');
        if (refresh) {
            refresh.addEventListener('click', loadMlbBoard);
        }
    }

    function init() {
        wireEvents();
        renderSelectedGame();
        loadMlbBoard();
    }

    window.TMRMlbSimulator = {
        SPORT_KEY: SPORT_KEY,
        state: state,
        loadMlbBoard: loadMlbBoard,
        renderSelectedGame: renderSelectedGame,
        renderMarketGroups: renderMarketGroups
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
