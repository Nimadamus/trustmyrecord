/* =============================================================================
   MLB SIMULATOR - AUTH GATE ADAPTER (mlb-simulator-gate.js)   MLB_SIM_GATE_20260808
   -----------------------------------------------------------------------------
   Teaches the shared gate (static/js/sim-auth-gate.js) how to snapshot, restore
   and re-run the MLB Simulator. Nothing here touches mlb-simulator.js: the page
   renders, the selectors populate and every control behaves identically for a
   logged-out visitor. Only pressing "Run Simulation" while logged out is
   intercepted, and the gate itself does that with a document-level capture
   listener - this file just supplies the three adapter functions.

   State is read and re-applied through the exact same <select> values + change
   events a real click produces (the technique already proven by
   mlb-simulator-conversion.js's applyInputsAndRun), so the simulator cannot
   tell a restored run from a hand-made one.

   Also: once a member is logged in, every completed run is written to their
   simulation history automatically (POST /mlb-simulator-save) so "revisit prior
   simulations" needs no extra click. Failures are silent - a history write must
   never interrupt a simulation.

   Kill switches: window.SIM_GATE_FLAGS.gate === false (no gate) and
   window.SIM_GATE_FLAGS.autoSave === false (no history write).
   ============================================================================= */
(function () {
    'use strict';

    if (!window.TMRSimGate) return;

    var FLAGS = window.SIM_GATE_FLAGS || {};
    var FIELD_IDS = ['awayPoolSelect', 'awayTeamSelect', 'awayPitcherSelect',
        'homePoolSelect', 'homeTeamSelect', 'homePitcherSelect',
        'simWeatherSelect', 'simulationCountSelect'];
    var MODE_BUTTON_IDS = { current: 'currentModeButton', historical: 'historicalModeButton', mixed: 'mixedModeButton' };
    var STEP_MS = 220;

    function qs(id) { return document.getElementById(id); }
    function txt(id) { var el = qs(id); return el ? el.textContent.trim() : null; }
    function selText(id) {
        var el = qs(id);
        if (!el || el.selectedIndex < 0 || !el.options) return null;
        var o = el.options[el.selectedIndex];
        return o ? o.textContent.trim() : null;
    }
    function fire(el, type) { try { el.dispatchEvent(new Event(type, { bubbles: true })); } catch (e) { } }
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    function currentMode() {
        var btn = document.querySelector('.sim-toggle.three-up button.active[data-mode]');
        return btn ? btn.getAttribute('data-mode') : 'current';
    }

    /* ------------------------------------------------------------- capture */

    function captureState() {
        var out = { mode: currentMode() };
        FIELD_IDS.forEach(function (id) {
            var el = qs(id);
            if (el) out[id] = el.value;
        });
        return out;
    }

    function captureResult() {
        return {
            winner: txt('winnerBadge'),
            awayTeam: txt('awayHeaderName'), homeTeam: txt('homeHeaderName'),
            awayScore: txt('awayScoreBig'), homeScore: txt('homeScoreBig'),
            projectedScore: txt('projectedScoreValue'), winProbability: txt('winProbabilityValue'),
            expectedRuns: txt('expectedRunsValue'), totalRange: txt('totalRangeValue'),
            runEnvironment: txt('runEnvironmentValue'), confidence: txt('simulationConfidenceValue'),
            simulationMode: txt('simulationModeValue'), dataMode: txt('dataModeValue')
        };
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function describeState() {
        var away = selText('awayTeamSelect');
        var home = selText('homeTeamSelect');
        var count = selText('simulationCountSelect');
        if (!away || !home) return '';
        var line = '<b>' + esc(away) + '</b> at <b>' + esc(home) + '</b>';
        if (count) line += ' &middot; ' + esc(count);
        return line;
    }

    /* ------------------------------------------------------------- restore */

    /* Applied in dependency order - pool rebuilds the team list, team rebuilds
       the pitcher list - with a beat between each so the simulator's own change
       handlers finish re-rendering before the next value is set. */
    function restoreState(state) {
        if (!state) return Promise.resolve();

        var modeBtn = qs(MODE_BUTTON_IDS[state.mode] || MODE_BUTTON_IDS.current);
        if (modeBtn && !modeBtn.classList.contains('active')) modeBtn.click();

        function setGroup(ids) {
            ids.forEach(function (id) {
                var el = qs(id);
                if (el && state[id] !== undefined && state[id] !== null) { el.value = state[id]; fire(el, 'change'); }
            });
        }

        return wait(STEP_MS)
            .then(function () { setGroup(['awayPoolSelect', 'homePoolSelect']); return wait(STEP_MS); })
            .then(function () { setGroup(['awayTeamSelect', 'homeTeamSelect']); return wait(STEP_MS); })
            .then(function () { setGroup(['awayPitcherSelect', 'homePitcherSelect', 'simWeatherSelect', 'simulationCountSelect']); return wait(STEP_MS); });
    }

    function runNow() {
        var btn = qs('runSimulationButton');
        if (btn) btn.click();
    }

    /* -------------------------------------------------- history auto-save */

    var lastSavedSignature = null;

    function signature(inputs, result) {
        try { return JSON.stringify(inputs) + '|' + (result.awayScore || '') + '-' + (result.homeScore || '') + '|' + (result.winner || ''); }
        catch (e) { return null; }
    }

    function autoSave(inputs, result) {
        if (FLAGS.autoSave === false) return;
        if (!window.TMRSimGate.isLoggedIn()) return;
        if (!window.api || typeof window.api.request !== 'function') return;

        var sig = signature(inputs, result);
        if (sig && sig === lastSavedSignature) return;
        lastSavedSignature = sig;

        var name = (result.awayTeam && result.homeTeam) ? (result.awayTeam + ' @ ' + result.homeTeam) : null;

        window.api.request('/mlb-simulator-save', {
            method: 'POST',
            body: { input_parameters: inputs, summarized_result: result, simulation_type: 'game', name: name }
        }).then(function (resp) {
            window.TMRSimHistory = window.TMRSimHistory || {};
            window.TMRSimHistory.lastAutoSaveId = (resp && resp.saved && resp.saved.id) || null;
            window.TMRSimGate.track('simulator_result_auto_saved', { simulation_type: 'game' });
            try { document.dispatchEvent(new CustomEvent('tmr:sim-autosaved', { detail: { id: window.TMRSimHistory.lastAutoSaveId } })); } catch (e) { }
        }).catch(function () { /* history write is best-effort, never user-facing */ });
    }

    /* ------------------------------------------------------------- wiring */

    function watchResult() {
        var panel = qs('boxScorePanel');
        if (!panel) return;
        new MutationObserver(function () {
            if (panel.getAttribute('data-box-score-state') !== 'projected') return;
            var inputs = captureState();
            var result = captureResult();
            window.TMRSimGate.markCompleted({ simulation_type: 'game' });
            autoSave(inputs, result);
        }).observe(panel, { attributes: true, attributeFilter: ['data-box-score-state'] });
    }

    function watchConfigured() {
        var ids = FIELD_IDS.concat([]);
        ids.forEach(function (id) {
            var el = qs(id);
            if (el) el.addEventListener('change', function () { window.TMRSimGate.markConfigured({ control: id }); });
        });
        Object.keys(MODE_BUTTON_IDS).forEach(function (k) {
            var b = qs(MODE_BUTTON_IDS[k]);
            if (b) b.addEventListener('click', function () { window.TMRSimGate.markConfigured({ control: 'mode' }); });
        });
    }

    function boot() {
        watchResult();
        watchConfigured();
    }

    window.TMRSimGate.register({
        simulator: 'mlb',
        label: 'MLB matchup',
        returnPath: '/mlb-simulator/',
        runSelectors: ['#runSimulationButton'],
        runControlSelectors: ['#runSimulationButton'],
        captureState: captureState,
        describeState: describeState,
        restoreState: restoreState,
        runNow: runNow
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
