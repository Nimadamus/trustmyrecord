/**
 * MLB_SIM_CONVERSION_20260728 - post-result signup/save panel for the MLB
 * Simulator page (mlb-simulator/index.html).
 *
 * Deliberately kept in its own file, loaded `defer` at the very bottom of
 * the page, and never touches static/js/mlb-simulator.js. Everything below
 * is DOM-based: a MutationObserver watches #boxScorePanel's
 * data-box-score-state attribute (the simulator's own signal that a result
 * finished rendering - see mlb-simulator.js renderBoxScore()) and reads
 * team/score/projection values back out of known element ids. This keeps
 * the ranking page's existing markup, script, and rendering path completely
 * untouched; a future edit to mlb-simulator.js's internals can't break this
 * file unless it also renames these specific ids.
 *
 * Kill switch: window.SIMULATOR_FLAGS.conversionPanel === false (set inline
 * in mlb-simulator/index.html, right before this script tag) makes this
 * entire file a no-op - flip the one literal + redeploy to roll back
 * instantly, no code change needed. The backend independently honors
 * SIMULATOR_CONVERSION_ENABLED=false the same way.
 */
(function () {
  'use strict';

  var FLAGS = window.SIMULATOR_FLAGS || {};
  if (FLAGS.conversionPanel === false) return;

  var API_BASE_ENDPOINT = '/mlb-simulator-save';
  var FIELD_IDS = ['awayPoolSelect', 'awayTeamSelect', 'awayPitcherSelect', 'homePoolSelect', 'homeTeamSelect', 'homePitcherSelect', 'simWeatherSelect', 'simulationCountSelect'];
  var MODE_BUTTON_IDS = { current: 'currentModeButton', historical: 'historicalModeButton', mixed: 'mixedModeButton' };

  function qs(id) { return document.getElementById(id); }
  function txt(id) { var el = qs(id); return el ? el.textContent.trim() : null; }

  function isLoggedIn() {
    return !!(window.api && typeof window.api.isLoggedIn === 'function' && window.api.isLoggedIn());
  }

  function deviceCategory() {
    var w = window.innerWidth || document.documentElement.clientWidth;
    if (w < 768) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  }

  function track(name, params) {
    try {
      if (window.TMRAnalytics && typeof window.TMRAnalytics.track === 'function') {
        window.TMRAnalytics.track(name, Object.assign({ logged_in: isLoggedIn() ? 'yes' : 'no', device: deviceCategory() }, params || {}));
      }
    } catch (e) { /* analytics must never break the page */ }
  }

  async function api(path, opts) {
    if (!window.api || typeof window.api.request !== 'function') throw new Error('API unavailable');
    return window.api.request(API_BASE_ENDPOINT + path, opts || {});
  }

  // ============================================================
  // Reading the live form / result out of the DOM
  // ============================================================
  function currentMode() {
    var btn = document.querySelector('.sim-toggle.three-up button.active[data-mode]');
    return btn ? btn.getAttribute('data-mode') : 'current';
  }

  function captureInputs() {
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

  function teamIdsFromInputs(inputs) {
    return {
      away: { id: inputs.awayTeamSelect || null, name: null },
      home: { id: inputs.homeTeamSelect || null, name: null }
    };
  }

  // Re-applies a saved input set to the live form and (optionally) runs it,
  // mirroring exactly what a real visitor clicking through would do -
  // dispatched DOM events only, no internal mlb-simulator.js coupling.
  function fire(el, type) { if (el) el.dispatchEvent(new Event(type, { bubbles: true })); }

  function applyInputsAndRun(inputs, thenRun) {
    var modeBtnId = MODE_BUTTON_IDS[inputs.mode] || MODE_BUTTON_IDS.current;
    var modeBtn = qs(modeBtnId);
    if (modeBtn && !modeBtn.classList.contains('active')) modeBtn.click();

    setTimeout(function () {
      ['awayPoolSelect', 'homePoolSelect'].forEach(function (id) {
        var el = qs(id);
        if (el && inputs[id] !== undefined) { el.value = inputs[id]; fire(el, 'change'); }
      });
      setTimeout(function () {
        ['awayTeamSelect', 'homeTeamSelect'].forEach(function (id) {
          var el = qs(id);
          if (el && inputs[id] !== undefined) { el.value = inputs[id]; fire(el, 'change'); }
        });
        setTimeout(function () {
          ['awayPitcherSelect', 'homePitcherSelect', 'simWeatherSelect', 'simulationCountSelect'].forEach(function (id) {
            var el = qs(id);
            if (el && inputs[id] !== undefined) { el.value = inputs[id]; fire(el, 'change'); }
          });
          setTimeout(function () {
            if (thenRun) {
              var runBtn = qs('runSimulationButton');
              if (runBtn) runBtn.click();
            }
          }, 200);
        }, 200);
      }, 200);
    }, 200);
  }

  // ============================================================
  // Styling (scoped, reuses the page's existing .sim-panel/.sim-button look)
  // ============================================================
  var STYLE_ID = 'mlb-sim-conversion-style';
  function injectStyle() {
    if (qs(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.simc-panel{grid-column:1/-1;width:100%;box-sizing:border-box;margin-top:18px;padding:20px;border-radius:14px;background:#12121a;border:1px solid #2a2a4a;font-family:Inter,system-ui,sans-serif;color:#e8e8f0;}' +
      '.simc-panel h3{margin:0 0 6px;font-family:Barlow,Inter,sans-serif;font-weight:800;font-size:1.05rem;color:#fff;}' +
      '.simc-panel p{margin:0 0 14px;color:#93a4bf;font-size:0.92rem;line-height:1.5;}' +
      '.simc-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}' +
      '.simc-btn{cursor:pointer;border:none;border-radius:8px;padding:11px 20px;font-weight:700;font-size:0.92rem;font-family:inherit;}' +
      '.simc-btn.primary{background:#00aeff;color:#06121c;}' +
      '.simc-btn.secondary{background:transparent;color:#00aeff;border:1px solid rgba(0,174,255,0.4);}' +
      '.simc-note{font-size:0.82rem;color:#6b7a94;margin-top:10px;}' +
      '.simc-banner{background:rgba(0,174,255,0.12);border:1px solid rgba(0,174,255,0.35);color:#bfe9ff;padding:10px 14px;border-radius:10px;font-size:0.88rem;margin-bottom:12px;}' +
      '.simc-secondary{margin-top:14px;padding-top:14px;border-top:1px solid #2a2a4a;display:flex;flex-wrap:wrap;gap:8px;}' +
      '.simc-secondary button,.simc-secondary a{font-size:0.82rem;padding:8px 12px;}' +
      '.simc-summary{margin-top:14px;padding:14px;border-radius:10px;background:#0c0c14;border:1px solid #23233a;font-size:0.9rem;}' +
      '.simc-summary strong{color:#fff;}' +
      '@media (max-width:600px){.simc-panel{padding:16px;}.simc-row{flex-direction:column;align-items:stretch;}.simc-btn{width:100%;text-align:center;}}';
    document.head.appendChild(s);
  }

  // ============================================================
  // Post-result panel
  // ============================================================
  var panelShown = false;

  function buildSecondaryRow(container, ctx) {
    var row = document.createElement('div');
    row.className = 'simc-secondary';

    var followBtn = document.createElement('button');
    followBtn.type = 'button';
    followBtn.className = 'simc-btn secondary';
    followBtn.textContent = 'Follow ' + (ctx.homeTeamName || 'this team');
    followBtn.addEventListener('click', function () { onFollowTeamClick(ctx, followBtn); });
    row.appendChild(followBtn);

    var forumLink = document.createElement('a');
    forumLink.className = 'simc-btn secondary';
    forumLink.textContent = 'Post This Result in the Forum';
    forumLink.href = forumHref(ctx);
    forumLink.addEventListener('click', function () { track('simulator_forum_clicked', { simulation_type: 'game' }); });
    row.appendChild(forumLink);

    var predictionLink = document.createElement('a');
    predictionLink.className = 'simc-btn secondary';
    predictionLink.textContent = 'Make Your Official Prediction';
    predictionLink.href = '/sportsbook/';
    predictionLink.addEventListener('click', function () { track('simulator_prediction_clicked', { simulation_type: 'game' }); });
    row.appendChild(predictionLink);

    container.appendChild(row);
  }

  function forumHref(ctx) {
    var title = 'MLB Simulator: ' + (ctx.awayTeamName || 'Away') + ' vs ' + (ctx.homeTeamName || 'Home');
    var body = 'Ran a matchup on the TrustMyRecord MLB Simulator: ' + (ctx.awayTeamName || 'Away') + ' vs ' + (ctx.homeTeamName || 'Home') +
      (ctx.result && ctx.result.winner ? ('. Projected: ' + ctx.result.winner) : '') +
      (ctx.result && ctx.result.awayScore && ctx.result.homeScore ? (' (' + ctx.result.awayScore + '-' + ctx.result.homeScore + ')') : '') +
      '. What do you all think?';
    var params = new URLSearchParams({ simThreadTitle: title.slice(0, 160), simThreadBody: body, simCategorySlug: 'mlb' });
    var forumUrl = '/forum/?' + params.toString();
    if (isLoggedIn()) return forumUrl;
    return '/login/?next=' + encodeURIComponent(forumUrl);
  }

  async function onFollowTeamClick(ctx, btn) {
    if (!isLoggedIn()) {
      showInlineExplainer(btn, 'Create a free account to follow teams and get updates.');
      return;
    }
    if (!ctx.homeTeamId) return;
    btn.disabled = true;
    try {
      await api('/follow/teams', { method: 'POST', body: { team_id: ctx.homeTeamId, team_name: ctx.homeTeamName } });
      track('simulator_team_followed', { team_id: ctx.homeTeamId });
      btn.textContent = 'Following ' + (ctx.homeTeamName || 'team');
    } catch (e) {
      btn.disabled = false;
      showInlineExplainer(btn, 'Could not follow this team right now. Please try again.');
    }
  }

  function showInlineExplainer(anchorEl, message) {
    var existing = anchorEl.parentNode.querySelector('.simc-inline-explainer');
    if (existing) existing.remove();
    var note = document.createElement('div');
    note.className = 'simc-inline-explainer simc-note';
    note.textContent = message;
    anchorEl.insertAdjacentElement('afterend', note);
  }

  function renderPanel(target) {
    if (panelShown) return;
    panelShown = true;
    injectStyle();

    var inputs = captureInputs();
    var result = captureResult();
    var ctx = {
      awayTeamName: result.awayTeam, homeTeamName: result.homeTeam,
      homeTeamId: inputs.homeTeamSelect || null, awayTeamId: inputs.awayTeamSelect || null,
      result: result
    };

    var panel = document.createElement('div');
    panel.className = 'simc-panel';
    panel.id = 'simcConversionPanel';

    if (isLoggedIn()) {
      panel.innerHTML =
        '<h3>Save Your Simulation</h3>' +
        '<p>Keep this result in My Simulations so you can reopen or rerun it later.</p>' +
        '<div class="simc-row"><button type="button" class="simc-btn primary" id="simcSaveDirectBtn">Save</button>' +
        '<a class="simc-btn secondary" href="/mlb-simulator/saved/">My Saved Simulations</a></div>';
      target.after(panel);
      qs('simcSaveDirectBtn').addEventListener('click', function () { onSaveDirectClick(inputs, result); });
    } else {
      panel.innerHTML =
        '<h3>Save Your Simulation</h3>' +
        '<p>Create a free TrustMyRecord account to save these results, compare future simulations, follow your favorite teams, and share a permanent results page.</p>' +
        '<div class="simc-row"><button type="button" class="simc-btn primary" id="simcSaveFreeBtn">Save My Results &mdash; Free</button></div>' +
        '<p class="simc-note">No credit card required. Takes less than 30 seconds.</p>';
      target.after(panel);
      qs('simcSaveFreeBtn').addEventListener('click', function () { onSaveFreeClick(inputs, result); });
      track('simulator_signup_panel_viewed', { simulation_type: 'game' });
    }

    buildSecondaryRow(panel, ctx);
  }

  async function onSaveDirectClick(inputs, result) {
    var btn = qs('simcSaveDirectBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      await api('', { method: 'POST', body: { input_parameters: inputs, summarized_result: result, simulation_type: 'game' } });
      track('simulator_result_saved', { method: 'direct' });
      btn.textContent = 'Saved';
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Save';
      showInlineExplainer(btn, 'Could not save right now. Please try again.');
    }
  }

  async function onSaveFreeClick(inputs, result) {
    track('simulator_signup_clicked', { simulation_type: 'game' });
    var btn = qs('simcSaveFreeBtn');
    btn.disabled = true;
    btn.textContent = 'Preparing...';
    try {
      var resp = await api('/pending', { method: 'POST', body: { input_parameters: inputs, summarized_result: result, simulation_type: 'game' } });
      track('simulator_signup_started', { simulation_type: 'game' });
      var returnTo = '/mlb-simulator/';
      window.location.href = '/register/?return=' + encodeURIComponent(returnTo) + '&pendingToken=' + encodeURIComponent(resp.token);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Save My Results — Free';
      showInlineExplainer(btn, 'Could not prepare your save right now. Please try again.');
    }
  }

  // ============================================================
  // Read-only saved-result summary card (used for both "restored after
  // signup" and "reopened from My Simulations" - never writes into the
  // live simulator's own result DOM, so it can never desync/conflict with
  // it. Inserted near the top of the page, above the team-selection form.
  // ============================================================
  function renderSummaryCard(saved, opts) {
    injectStyle();
    var main = document.querySelector('main') || document.body;
    var card = document.createElement('div');
    card.className = 'simc-panel';
    var r = saved.summarized_result || {};
    var bannerHtml = opts && opts.banner ? '<div class="simc-banner">' + opts.banner + '</div>' : '';
    card.innerHTML =
      bannerHtml +
      '<h3>' + (saved.name || 'Saved Simulation') + '</h3>' +
      '<div class="simc-summary">' +
      '<div><strong>' + (r.awayTeam || 'Away') + '</strong> ' + (r.awayScore || '') + ' &nbsp;&ndash;&nbsp; <strong>' + (r.homeTeam || 'Home') + '</strong> ' + (r.homeScore || '') + '</div>' +
      (r.winner ? '<div>Winner: ' + r.winner + '</div>' : '') +
      (r.winProbability ? '<div>Win probability: ' + r.winProbability + '</div>' : '') +
      (saved.created_at ? '<div class="simc-note">Saved ' + new Date(saved.created_at).toLocaleString() + '</div>' : '') +
      '</div>' +
      '<div class="simc-row" style="margin-top:14px;"><button type="button" class="simc-btn primary" id="simcRerunBtn">Run This Simulation Again</button>' +
      '<a class="simc-btn secondary" href="/mlb-simulator/saved/">My Saved Simulations</a></div>';
    main.insertBefore(card, main.firstChild);
    qs('simcRerunBtn').addEventListener('click', function () {
      card.remove();
      applyInputsAndRun(saved.input_parameters, true);
      if (saved.id) { api('/' + saved.id + '/rerun', { method: 'POST' }).catch(function () {}); }
    });
  }

  // ============================================================
  // On-load handling: ?pendingToken= (post-signup restore+save) or
  // ?savedId=&mode=view|rerun (from My Simulations)
  // ============================================================
  async function handlePendingTokenOnLoad() {
    var params = new URLSearchParams(window.location.search);
    var token = params.get('pendingToken');
    if (!token) return;
    try {
      var resp = await api('/claim', { method: 'POST', body: { token: token } });
      track('simulator_signup_completed', { simulation_type: 'game' });
      track('simulator_result_restored', { simulation_type: 'game' });
      track('simulator_result_saved', { method: 'claim' });
      renderSummaryCard(resp.saved, { banner: 'Account created — your simulation was restored and saved to your account.' });
    } catch (e) {
      renderSummaryCard({ summarized_result: {}, name: 'Your saved result' }, { banner: 'That saved result has expired. Please rerun and save again.' });
    } finally {
      var clean = new URL(window.location.href);
      clean.searchParams.delete('pendingToken');
      clean.searchParams.delete('signedUp');
      window.history.replaceState({}, '', clean.toString());
    }
  }

  async function handleSavedIdOnLoad() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('savedId');
    if (!id) return;
    var mode = params.get('mode') || 'view';
    try {
      var resp = await api('/' + encodeURIComponent(id));
      if (mode === 'rerun') {
        applyInputsAndRun(resp.saved.input_parameters, true);
        api('/' + id + '/rerun', { method: 'POST' }).catch(function () {});
      } else {
        renderSummaryCard(resp.saved, {});
      }
    } catch (e) { /* saved result not found/not yours - silently ignore, page still works as a normal simulator */ }
    var clean = new URL(window.location.href);
    clean.searchParams.delete('savedId');
    clean.searchParams.delete('mode');
    window.history.replaceState({}, '', clean.toString());
  }

  // ============================================================
  // Wiring
  // ============================================================
  function watchForResult() {
    var target = qs('boxScorePanel');
    if (!target) return;
    var obs = new MutationObserver(function () {
      if (target.getAttribute('data-box-score-state') === 'projected') {
        track('mlb_simulator_completed', { simulation_type: 'game' });
        renderPanel(target);
      }
    });
    obs.observe(target, { attributes: true, attributeFilter: ['data-box-score-state'] });
  }

  function watchForStart() {
    var btn = qs('runSimulationButton');
    if (btn) btn.addEventListener('click', function () { track('mlb_simulator_started', { simulation_type: 'game' }); });
  }

  function init() {
    track('mlb_simulator_page_view', {});
    watchForResult();
    watchForStart();
    handlePendingTokenOnLoad();
    handleSavedIdOnLoad();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
