(function () {
    var FACTORS = [
        { id: 'recent_form', label: 'Recent form', help: 'Recent team/player performance when real data is connected.' },
        { id: 'market_line', label: 'Market line', help: 'Current odds or line context from connected sportsbook data.' },
        { id: 'matchup', label: 'Matchup fit', help: 'Team, player, or style matchup inputs supplied by real data.' },
        { id: 'availability', label: 'Availability', help: 'Injuries, starters, rest, or confirmed lineup inputs when available.' },
        { id: 'venue_context', label: 'Venue/context', help: 'Home/away, park, weather, travel, or schedule context when available.' }
    ];

    var state = {
        models: [],
        editingId: null,
        selectedId: null,
        loading: false
    };

    var forbiddenKeys = new Set([
        'roi', 'win_rate', 'sample_size', 'wins', 'losses', 'pushes',
        'net_units', 'result_units', 'performance', 'stats', 'analytics',
        'comparison', 'record', 'marketplace', 'marketplace_id',
        'leaderboard', 'grading_stats', 'public_profile', 'tracker_id',
        'model_tracker_id', 'tracked_pick_id', 'prediction', 'predictions',
        'backtest', 'backtest_results'
    ]);

    function readStorage(key) {
        try {
            return window.localStorage ? window.localStorage.getItem(key) : null;
        } catch (error) {
            return null;
        }
    }

    function hasPrivateSession() {
        var tokenKeys = ['trustmyrecord_token', 'accessToken', 'access_token', 'token', 'tmr_token'];
        for (var i = 0; i < tokenKeys.length; i += 1) {
            if (readStorage(tokenKeys[i])) return true;
        }
        var sessionKeys = ['trustmyrecord_session', 'tmr_current_user', 'currentUser'];
        for (var j = 0; j < sessionKeys.length; j += 1) {
            var raw = readStorage(sessionKeys[j]);
            if (!raw) continue;
            try {
                var parsed = JSON.parse(raw);
                if (parsed && (parsed.user || parsed.username || parsed.email)) return true;
            } catch (error) {}
        }
        return false;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function stripForbidden(value) {
        if (Array.isArray(value)) return value.map(stripForbidden);
        if (!value || typeof value !== 'object') return value;
        var out = {};
        Object.keys(value).forEach(function (key) {
            if (!forbiddenKeys.has(key)) out[key] = stripForbidden(value[key]);
        });
        return out;
    }

    function setMessage(text, kind) {
        var el = document.getElementById('modelBuilderMessage');
        if (!el) return;
        el.textContent = text || '';
        el.className = 'notice' + (kind ? ' ' + kind : '');
    }

    function getValue(id, fallback) {
        var el = document.getElementById(id);
        if (!el) return fallback || '';
        return (el.value == null ? fallback : el.value) || '';
    }

    function setValue(id, value) {
        var el = document.getElementById(id);
        if (el) el.value = value == null ? '' : value;
    }

    function formatSport(value) {
        var map = {
            baseball_mlb: 'MLB',
            basketball_nba: 'NBA',
            icehockey_nhl: 'NHL',
            americanfootball_nfl: 'NFL',
            basketball_ncaab: 'NCAAB'
        };
        return map[value] || value || 'Sport';
    }

    function formatMarket(value) {
        var map = { h2h: 'Moneyline', spreads: 'Spread/run line', totals: 'Total', team_totals: 'Team total' };
        return map[value] || value || 'Market';
    }

    function numberValue(id, fallback) {
        var value = Number(getValue(id, fallback));
        return Number.isFinite(value) ? value : fallback;
    }

    function selectedFactors() {
        return FACTORS.map(function (factor) {
            var weight = numberValue('factor_' + factor.id, factor.id === 'market_line' ? 30 : 20);
            return {
                id: factor.id,
                label: factor.label,
                weight: Math.max(0, Math.min(100, weight)),
                data_status: 'unavailable_until_connected',
                source: 'No real data source connected in this builder session'
            };
        }).filter(function (factor) {
            return factor.weight > 0;
        });
    }

    function criteriaFromForm() {
        return stripForbidden({
            schema_version: 2,
            builder_mode: 'guided',
            data_mode: 'real_data_required',
            data_status: 'unavailable_until_connected',
            sport_key: getValue('modelSport', 'baseball_mlb'),
            market_type: getValue('modelMarket', 'totals'),
            side_preference: getValue('modelSide', 'any'),
            factors: selectedFactors(),
            filters: {
                min_odds: numberValue('minOdds', -150),
                max_odds: numberValue('maxOdds', 150),
                min_confidence_to_show: numberValue('minConfidence', 0)
            },
            output: {
                type: getValue('modelOutput', 'ranked_shortlist'),
                includes_score: false,
                score_policy: 'No score is generated until real input rows are available and shown with attribution',
                explanation_required: true
            },
            notes: getValue('modelNotes', '').trim()
        });
    }

    function bankrollFromForm() {
        return stripForbidden({
            unit_mode: getValue('unitMode', 'flat'),
            default_units: numberValue('defaultUnits', 1),
            max_units: numberValue('maxUnits', 1),
            risk_note: 'Configuration only. This is not a betting result or public claim.'
        });
    }

    function modelPayloadFromForm() {
        var name = getValue('modelName', '').trim();
        if (!name) throw new Error('Name is required.');
        return {
            name: name,
            description: getValue('modelDescription', '').trim(),
            sport_key: getValue('modelSport', 'baseball_mlb'),
            status: getValue('modelStatus', 'draft'),
            visibility: 'private',
            source_type: 'manual_builder',
            criteria_json: criteriaFromForm(),
            bankroll_json: bankrollFromForm()
        };
    }

    function renderFactorControls() {
        var host = document.getElementById('factorControls');
        if (!host) return;
        host.innerHTML = FACTORS.map(function (factor) {
            var defaultValue = factor.id === 'market_line' ? 30 : 20;
            return [
                '<label class="factor-control">',
                '<span><strong>' + escapeHtml(factor.label) + '</strong><small>' + escapeHtml(factor.help) + '</small></span>',
                '<input id="factor_' + escapeHtml(factor.id) + '" type="number" min="0" max="100" step="5" value="' + defaultValue + '">',
                '</label>'
            ].join('');
        }).join('');
    }

    function renderSummary() {
        var host = document.getElementById('modelSummary');
        if (!host) return;
        var criteria = criteriaFromForm();
        var bankroll = bankrollFromForm();
        var totalWeight = criteria.factors.reduce(function (sum, factor) { return sum + Number(factor.weight || 0); }, 0);
        host.innerHTML = [
            '<div><strong>Inputs</strong><span>' + escapeHtml(formatSport(criteria.sport_key)) + ' · ' + escapeHtml(formatMarket(criteria.market_type)) + ' · ' + escapeHtml(criteria.side_preference) + '</span></div>',
            '<div><strong>Factors</strong><span>' + escapeHtml(criteria.factors.map(function (factor) { return factor.label + ' ' + factor.weight; }).join(', ') || 'None selected') + '</span></div>',
            '<div><strong>Weights</strong><span>' + escapeHtml(String(totalWeight)) + ' total points. Values are configuration weights, not confidence or win probability.</span></div>',
            '<div><strong>Output</strong><span>' + escapeHtml(criteria.output.type.replace(/_/g, ' ')) + '. No result or public claim is generated here.</span></div>',
            '<div><strong>Bankroll</strong><span>' + escapeHtml(bankroll.unit_mode + ' · default ' + bankroll.default_units + ' unit(s), max ' + bankroll.max_units + ' unit(s)') + '</span></div>'
        ].join('');
    }

    function renderDetail(model) {
        var panel = document.getElementById('modelBuilderDetail');
        if (!panel) return;
        if (!model) {
            panel.hidden = true;
            panel.innerHTML = '';
            return;
        }
        var criteria = stripForbidden(model.criteria_json || {});
        var bankroll = stripForbidden(model.bankroll_json || {});
        var factors = Array.isArray(criteria.factors) ? criteria.factors : [];
        panel.hidden = false;
        panel.innerHTML = [
            '<h3>' + escapeHtml(model.name) + '</h3>',
            '<p class="model-meta">' + escapeHtml(model.description || 'No description saved.') + '</p>',
            '<div class="detail-grid">',
            '<div><strong>Sport</strong><span>' + escapeHtml(formatSport(model.sport_key)) + '</span></div>',
            '<div><strong>Status</strong><span>' + escapeHtml(model.status || 'draft') + '</span></div>',
            '<div><strong>Market</strong><span>' + escapeHtml(formatMarket(criteria.market_type)) + '</span></div>',
            '<div><strong>Side</strong><span>' + escapeHtml(criteria.side_preference || 'any') + '</span></div>',
            '<div><strong>Factors</strong><span>' + escapeHtml(factors.map(function (factor) { return factor.label + ' ' + factor.weight; }).join(', ') || 'Not configured') + '</span></div>',
            '<div><strong>Units</strong><span>' + escapeHtml((bankroll.unit_mode || 'flat') + ' · default ' + (bankroll.default_units == null ? 1 : bankroll.default_units) + ', max ' + (bankroll.max_units == null ? 1 : bankroll.max_units)) + '</span></div>',
            '<div><strong>Notes</strong><span>' + escapeHtml(criteria.notes || 'No strategy notes saved.') + '</span></div>',
            '<div><strong>Data Mode</strong><span>Private configuration only; real inputs are not connected here yet.</span></div>',
            '</div>'
        ].join('');
    }

    function renderList() {
        var list = document.getElementById('modelBuilderList');
        if (!list) return;
        if (state.loading) {
            list.innerHTML = '<div class="model-card"><p class="model-meta">Loading private models...</p></div>';
            return;
        }
        if (!state.models.length) {
            list.innerHTML = '<div class="model-card"><h3>No private models yet</h3><p class="model-meta">Use the guided steps to save a private configuration draft.</p></div>';
            return;
        }
        list.innerHTML = state.models.map(function (model) {
            var id = encodeURIComponent(model.id);
            var archived = model.status === 'archived';
            var criteria = stripForbidden(model.criteria_json || {});
            var factors = Array.isArray(criteria.factors) ? criteria.factors : [];
            return [
                '<article class="model-card" data-model-id="' + id + '">',
                '<h3>' + escapeHtml(model.name) + '</h3>',
                '<div class="model-meta">' + escapeHtml(formatSport(model.sport_key)) + ' · ' + escapeHtml(model.status || 'draft') + ' · private configuration</div>',
                model.description ? '<p class="model-meta">' + escapeHtml(model.description) + '</p>' : '',
                '<div class="model-breakdown">',
                '<span>Market: ' + escapeHtml(formatMarket(criteria.market_type)) + '</span>',
                '<span>Factors: ' + escapeHtml(factors.map(function (factor) { return factor.label + ' ' + factor.weight; }).join(', ') || 'not configured') + '</span>',
                '<span>Output: setup details only</span>',
                '</div>',
                '<div class="button-row">',
                '<button type="button" data-action="view" data-id="' + id + '">View</button>',
                archived ? '' : '<button type="button" data-action="edit" data-id="' + id + '">Edit</button>',
                archived ? '' : '<button type="button" data-action="archive" data-id="' + id + '">Archive</button>',
                archived ? '<button type="button" data-action="restore" data-id="' + id + '">Restore</button>' : '',
                '<button class="danger" type="button" data-action="delete" data-id="' + id + '">Delete</button>',
                '</div>',
                '</article>'
            ].join('');
        }).join('');
    }

    function resetForm() {
        state.editingId = null;
        state.selectedId = null;
        setValue('formTitle', 'New model');
        var title = document.getElementById('formTitle');
        if (title) title.textContent = 'New model';
        var form = document.getElementById('modelBuilderForm');
        if (form && typeof form.reset === 'function') form.reset();
        FACTORS.forEach(function (factor) {
            setValue('factor_' + factor.id, factor.id === 'market_line' ? 30 : 20);
        });
        renderSummary();
        setMessage('');
    }

    async function viewModel(id) {
        if (!apiReady()) return setMessage('Private Model Builder API is not available yet.', 'error');
        try {
            var data = await window.api.getModelDefinition(id);
            var model = stripForbidden(data && data.model ? data.model : state.models.find(function (entry) { return String(entry.id) === String(id); }));
            state.selectedId = model && model.id;
            renderDetail(model);
            setMessage('Viewing private model definition.', 'ok');
        } catch (error) {
            setMessage(error && error.message ? error.message : 'Unable to view private model.', 'error');
        }
    }

    function editModel(id) {
        var model = state.models.find(function (entry) { return String(entry.id) === String(id); });
        if (!model) return;
        var criteria = stripForbidden(model.criteria_json || {});
        var bankroll = stripForbidden(model.bankroll_json || {});
        state.editingId = model.id;
        var title = document.getElementById('formTitle');
        if (title) title.textContent = 'Edit private model';
        setValue('modelName', model.name || '');
        setValue('modelDescription', model.description || '');
        setValue('modelSport', model.sport_key || criteria.sport_key || 'baseball_mlb');
        setValue('modelStatus', model.status === 'active' ? 'active' : 'draft');
        setValue('modelMarket', criteria.market_type || (criteria.markets && criteria.markets[0]) || 'totals');
        setValue('modelSide', criteria.side_preference || criteria.side || 'any');
        setValue('minOdds', criteria.filters && criteria.filters.min_odds != null ? criteria.filters.min_odds : -150);
        setValue('maxOdds', criteria.filters && criteria.filters.max_odds != null ? criteria.filters.max_odds : 150);
        setValue('minConfidence', criteria.filters && criteria.filters.min_confidence_to_show != null ? criteria.filters.min_confidence_to_show : 0);
        setValue('modelOutput', criteria.output && criteria.output.type ? criteria.output.type : 'ranked_shortlist');
        setValue('modelNotes', criteria.notes || '');
        setValue('unitMode', bankroll.unit_mode || 'flat');
        setValue('defaultUnits', bankroll.default_units != null ? bankroll.default_units : 1);
        setValue('maxUnits', bankroll.max_units != null ? bankroll.max_units : 1);
        FACTORS.forEach(function (factor) {
            var saved = Array.isArray(criteria.factors)
                ? criteria.factors.find(function (entry) { return entry.id === factor.id; })
                : null;
            setValue('factor_' + factor.id, saved && saved.weight != null ? saved.weight : (factor.id === 'market_line' ? 30 : 20));
        });
        renderSummary();
        setMessage('Editing private model definition. No historical results are loaded.', 'ok');
    }

    function apiReady() {
        return window.api && typeof window.api.listModelDefinitions === 'function';
    }

    async function loadModels() {
        if (!apiReady()) {
            setMessage('Private Model Builder API is not available yet.', 'error');
            state.models = [];
            renderList();
            return;
        }
        state.loading = true;
        renderList();
        try {
            if (window.api.ready) {
                try { await window.api.ready; } catch (error) {}
            }
            var data = await window.api.listModelDefinitions({ include_archived: true });
            state.models = Array.isArray(data && data.models) ? data.models.map(stripForbidden) : [];
            if (state.selectedId) {
                renderDetail(state.models.find(function (model) { return String(model.id) === String(state.selectedId); }));
            }
            setMessage('');
        } catch (error) {
            state.models = [];
            setMessage(error && error.message ? error.message : 'Unable to load private models.', 'error');
        } finally {
            state.loading = false;
            renderList();
        }
    }

    async function saveModel(event) {
        event.preventDefault();
        if (!apiReady()) return setMessage('Private Model Builder API is not available yet.', 'error');
        try {
            var payload = modelPayloadFromForm();
            if (state.editingId) {
                await window.api.updateModelDefinition(state.editingId, payload);
                setMessage('Private model updated.', 'ok');
            } else {
                await window.api.createModelDefinition(payload);
                setMessage('Private model created.', 'ok');
            }
            resetForm();
            await loadModels();
        } catch (error) {
            setMessage(error && error.message ? error.message : 'Unable to save private model.', 'error');
        }
    }

    async function archiveModel(id) {
        if (!apiReady()) return setMessage('Private Model Builder API is not available yet.', 'error');
        try {
            await window.api.archiveModelDefinition(id);
            setMessage('Private model archived.', 'ok');
            await loadModels();
        } catch (error) {
            setMessage(error && error.message ? error.message : 'Unable to archive private model.', 'error');
        }
    }

    async function restoreModel(id) {
        if (!apiReady()) return setMessage('Private Model Builder API is not available yet.', 'error');
        try {
            await window.api.restoreModelDefinition(id);
            setMessage('Private model restored.', 'ok');
            await loadModels();
        } catch (error) {
            setMessage(error && error.message ? error.message : 'Unable to restore private model.', 'error');
        }
    }

    async function deleteModel(id) {
        if (!apiReady()) return setMessage('Private Model Builder API is not available yet.', 'error');
        if (typeof window.confirm === 'function' && !window.confirm('Delete this private model definition? This cannot be undone.')) {
            return;
        }
        try {
            await window.api.deleteModelDefinition(id);
            if (String(state.editingId) === String(id)) resetForm();
            if (String(state.selectedId) === String(id)) {
                state.selectedId = null;
                renderDetail(null);
            }
            setMessage('Private model deleted.', 'ok');
            await loadModels();
        } catch (error) {
            setMessage(error && error.message ? error.message : 'Unable to delete private model.', 'error');
        }
    }

    function wireEvents() {
        var form = document.getElementById('modelBuilderForm');
        if (form) form.addEventListener('submit', saveModel);
        var reset = document.getElementById('resetModelBtn');
        if (reset) reset.addEventListener('click', resetForm);
        var list = document.getElementById('modelBuilderList');
        if (list) {
            list.addEventListener('click', function (event) {
                var button = event.target.closest('button[data-action]');
                if (!button) return;
                var action = button.getAttribute('data-action');
                var id = button.getAttribute('data-id');
                if (action === 'view') viewModel(id);
                if (action === 'edit') editModel(id);
                if (action === 'archive') archiveModel(id);
                if (action === 'restore') restoreModel(id);
                if (action === 'delete') deleteModel(id);
            });
        }
        [
            'modelSport', 'modelMarket', 'modelSide', 'modelOutput', 'unitMode',
            'defaultUnits', 'maxUnits', 'minOdds', 'maxOdds', 'minConfidence', 'modelNotes'
        ].concat(FACTORS.map(function (factor) { return 'factor_' + factor.id; })).forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('input', renderSummary);
            if (el) el.addEventListener('change', renderSummary);
        });
    }

    function renderPrivateShell() {
        var authCheck = document.getElementById('authCheck');
        var loginRequired = document.getElementById('loginRequired');
        var shell = document.getElementById('modelBuilderShell');
        if (authCheck) authCheck.hidden = true;
        if (loginRequired) loginRequired.hidden = true;
        if (shell) shell.hidden = false;
        renderFactorControls();
        wireEvents();
        renderSummary();
        renderList();
        loadModels();
    }

    function showLoginRequired() {
        var authCheck = document.getElementById('authCheck');
        var loginRequired = document.getElementById('loginRequired');
        var shell = document.getElementById('modelBuilderShell');
        if (authCheck) authCheck.hidden = true;
        if (shell) shell.hidden = true;
        if (loginRequired) loginRequired.hidden = false;
    }

    function init() {
        if (!hasPrivateSession()) {
            showLoginRequired();
            return;
        }
        renderPrivateShell();
    }

    window.TMRModelBuilderShell = {
        hasPrivateSession: hasPrivateSession,
        renderPrivateShell: renderPrivateShell,
        loadModels: loadModels,
        viewModel: viewModel,
        saveModel: saveModel,
        archiveModel: archiveModel,
        restoreModel: restoreModel,
        deleteModel: deleteModel,
        init: init
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
