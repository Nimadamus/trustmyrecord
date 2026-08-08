/* =============================================================================
   STICKY RUN CTA + A/B EXPERIMENT                        SIM_RUN_CTA_20260808
   -----------------------------------------------------------------------------
   THE EVIDENCE THIS ANSWERS

   57% of configured simulator sessions never reached Run. The first
   classifications from simulator_configured_no_run came back as
   run_never_scrolled_into_view: the Run button was PRESENT, VISIBLE and
   ENABLED, and simply never entered the viewport. People configured a matchup,
   never saw the button, and left.

   So this is a placement problem, not a persuasion problem, and the fix is to
   keep the existing primary action reachable - not to nag, not to auto-run, and
   not to invent urgency.

   WHAT IT DOES

   When the real Run button scrolls out of view AND the visitor has configured a
   matchup, a compact bar appears at the bottom of the viewport showing the
   matchup and a single Run action. It disappears the moment the real button is
   back on screen, and it disappears while a result is rendering.

   IT IS A REMOTE CONTROL, NOT A SECOND BUTTON. Pressing it calls .click() on
   the real Run button, so there is exactly one run path, one set of
   validations, and no way for this file to submit anything the page would not
   have submitted itself. It disables itself while a run is in flight, so a
   double tap cannot produce two runs.

   WHAT IT DELIBERATELY DOES NOT DO

   * No auto-run. The simulation only ever happens because a person pressed a
     button.
   * No countdown, no fake scarcity, no "hurry", no interstitial, nothing that
     obstructs the page. It can always be dismissed, and dismissal sticks for
     the rest of the page view.
   * It never covers content: the page gets bottom padding equal to the bar's
     height while it is shown, so nothing is hidden behind it.
   * It is not shown before the matchup is valid, so it can never invite a click
     that would fail.

   A/B

   Assignment is a coin flip stored per browser, so a visitor sees the same
   experience on every visit and the comparison is not polluted by people
   flipping between arms. Every funnel event already carries the arm via
   TMRSimGate, so CONFIGURE -> RUN can be read per arm with no extra plumbing.
   Control is the page exactly as it is today.

   Kill switch: window.SIM_RUN_CTA_FLAGS = { enabled:false } forces every
   visitor into control. { force:'variant' } / { force:'control' } pins an arm
   for testing.
   ============================================================================= */
(function () {
    'use strict';

    var FLAGS = window.SIM_RUN_CTA_FLAGS || {};
    var ARM_KEY = 'tmr_sim_runcta_arm';
    var DISMISS_ID = 'simRunCtaBar';
    var STYLE_ID = 'sim-run-cta-style';

    var state = { bar: null, dismissed: false, running: false, shown: false, engaged: false };

    /* The page loads with two valid default teams, so "configuration is valid"
       is true before the visitor has done anything. Waiting for a real
       interaction means the bar answers intent instead of pre-empting it. */
    function markEngaged() { state.engaged = true; }

    function runButton() {
        return document.getElementById('runSimulationButton');
    }

    /* Stable per browser: a visitor who bounces between arms would make the
       comparison meaningless. */
    function arm() {
        if (FLAGS.enabled === false) return 'control';
        if (FLAGS.force === 'variant' || FLAGS.force === 'control') return FLAGS.force;
        var a = null;
        try { a = localStorage.getItem(ARM_KEY); } catch (e) { }
        if (a !== 'control' && a !== 'variant') {
            a = Math.random() < 0.5 ? 'control' : 'variant';
            try { localStorage.setItem(ARM_KEY, a); } catch (e) { }
        }
        return a;
    }

    function track(name, params) {
        try {
            if (window.TMRSimGate && typeof window.TMRSimGate.track === 'function') window.TMRSimGate.track(name, params || {});
        } catch (e) { }
    }

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = [
            '#' + DISMISS_ID + '{position:fixed;left:0;right:0;bottom:0;z-index:9500;',
            'display:flex;align-items:center;gap:12px;padding:12px 16px;box-sizing:border-box;',
            'background:rgba(18,18,26,.97);border-top:1px solid #2a2a4a;',
            'box-shadow:0 -8px 24px rgba(0,0,0,.4);font-family:Inter,system-ui,sans-serif;',
            'transform:translateY(100%);transition:transform .18s ease-out;}',
            '#' + DISMISS_ID + '.is-in{transform:translateY(0);}',
            '@media (prefers-reduced-motion:reduce){#' + DISMISS_ID + '{transition:none;}}',
            '#' + DISMISS_ID + ' .src-copy{flex:1 1 auto;min-width:0;color:#a7b4c9;font-size:.85rem;line-height:1.3;}',
            '#' + DISMISS_ID + ' .src-copy b{display:block;color:#fff;font-size:.95rem;font-weight:700;',
            'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '#' + DISMISS_ID + ' .src-go{flex:0 0 auto;cursor:pointer;border:none;border-radius:10px;',
            'padding:14px 26px;min-height:46px;font:800 .95rem Inter,system-ui,sans-serif;color:#04121c;',
            'background:linear-gradient(135deg,#00AEFF,#2DD4BF);}',
            '#' + DISMISS_ID + ' .src-go:disabled{opacity:.55;cursor:default;}',
            '#' + DISMISS_ID + ' .src-x{flex:0 0 auto;background:none;border:none;color:#6b7a94;',
            'font-size:1.25rem;line-height:1;cursor:pointer;padding:8px 10px;border-radius:8px;}',
            '#' + DISMISS_ID + ' .src-x:hover{color:#fff;background:rgba(255,255,255,.06);}',
            '@media (max-width:600px){#' + DISMISS_ID + '{padding:10px 12px;gap:8px;}',
            '#' + DISMISS_ID + ' .src-go{padding:14px 18px;font-size:.9rem;min-height:46px;}',
            '#' + DISMISS_ID + ' .src-copy{font-size:.78rem;}#' + DISMISS_ID + ' .src-copy b{font-size:.86rem;}}'
        ].join('');
        document.head.appendChild(s);
    }

    function matchupText() {
        function sel(id) {
            var el = document.getElementById(id);
            if (!el || el.selectedIndex < 0 || !el.options) return null;
            var o = el.options[el.selectedIndex];
            return o ? o.textContent.trim() : null;
        }
        var a = sel('awayTeamSelect'), h = sel('homeTeamSelect');
        return (a && h) ? (a + ' @ ' + h) : null;
    }

    /* Valid = the page itself would accept this run. Two different teams, and
       its own button enabled. Never offer an action that would fail. */
    function configurationValid() {
        var a = document.getElementById('awayTeamSelect');
        var h = document.getElementById('homeTeamSelect');
        var btn = runButton();
        if (!a || !h || !btn) return false;
        if (!a.value || !h.value || a.value === h.value) return false;
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
        return true;
    }

    function realButtonInView() {
        var btn = runButton();
        if (!btn) return true;                       // nothing to shadow
        var cs = window.getComputedStyle(btn);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        var r = btn.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        return r.bottom > 0 && r.top < (window.innerHeight || 0);
    }

    function build() {
        injectStyle();
        var bar = document.createElement('div');
        bar.id = DISMISS_ID;
        bar.setAttribute('role', 'region');
        bar.setAttribute('aria-label', 'Run simulation');
        bar.innerHTML =
            '<div class="src-copy"><b id="srcMatchup"></b><span>Ready to simulate</span></div>' +
            '<button type="button" class="src-go" id="srcGo">Run Simulation</button>' +
            '<button type="button" class="src-x" id="srcX" aria-label="Hide">&times;</button>';
        document.body.appendChild(bar);

        document.getElementById('srcGo').addEventListener('click', function () {
            if (state.running) return;                                  // no double submits
            var btn = runButton();
            if (!btn || !configurationValid()) return;
            state.running = true;
            var go = document.getElementById('srcGo');
            go.disabled = true;
            go.textContent = 'Running…';
            track('sim_run_cta_clicked', { arm: 'variant' });
            btn.click();                                                // THE page's own single run path
            hide();
            setTimeout(function () {
                state.running = false;
                go.disabled = false;
                go.textContent = 'Run Simulation';
            }, 4000);
        });

        document.getElementById('srcX').addEventListener('click', function () {
            state.dismissed = true;
            track('sim_run_cta_dismissed', { arm: 'variant' });
            hide();
        });

        return bar;
    }

    function show() {
        if (state.shown) return;
        if (!state.bar) state.bar = build();
        state.bar.classList.add('is-in');
        state.shown = true;
        // Never sit on top of content.
        try {
            document.body.style.paddingBottom = (state.bar.offsetHeight || 64) + 'px';
        } catch (e) { }
        track('sim_run_cta_shown', { arm: 'variant' });
    }

    function hide() {
        if (!state.shown || !state.bar) return;
        state.bar.classList.remove('is-in');
        state.shown = false;
        try { document.body.style.paddingBottom = ''; } catch (e) { }
    }

    function tick() {
        if (state.dismissed || state.running) return;
        var el = document.getElementById('srcMatchup');
        var text = matchupText();
        if (el && text) el.textContent = text;

        // Never compete with the signup gate: while it is open, it IS the
        // primary action, and two stacked CTAs is exactly the visual
        // competition this experiment is meant to reduce.
        if (document.querySelector('.tsg-overlay')) { hide(); return; }

        var resultShowing = false;
        try {
            var panel = document.getElementById('boxScorePanel');
            resultShowing = !!(panel && panel.getAttribute('data-box-score-state') === 'projected' && realButtonInView());
        } catch (e) { }

        if (state.engaged && configurationValid() && !realButtonInView() && !resultShowing) show();
        else hide();
    }

    function boot() {
        var assigned = arm();
        // Report the arm on every funnel event, so CONFIGURE -> RUN can be split
        // by arm with no extra reporting path.
        try {
            if (window.TMRSimGate && typeof window.TMRSimGate.setExperiment === 'function') {
                window.TMRSimGate.setExperiment('run_cta', assigned);
            }
        } catch (e) { }
        track('sim_run_cta_assigned', { arm: assigned });
        if (assigned !== 'variant') return;               // control: page untouched
        if (!runButton()) return;                          // not a page with a Run button

        window.addEventListener('scroll', tick, { passive: true });
        window.addEventListener('resize', tick, { passive: true });
        document.addEventListener('change', function (e) {
            var t = e && e.target;
            if (t && t.id && /Select$/.test(t.id)) markEngaged();
            tick();
        }, true);
        // Mode buttons count as configuring too.
        document.addEventListener('click', function (e) {
            var t = e && e.target;
            if (t && t.closest && t.closest('[data-mode]')) markEngaged();
        }, true);
        setInterval(tick, 1200);
        tick();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
