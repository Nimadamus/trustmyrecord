/**
 * TrustMyRecord - /welcome/ first-run checklist.
 *
 * WHAT THIS IS
 *
 * A brand-new account used to land on /sportsbook/: a sixteen
 * league odds board with game lines, halves, quarters, first-five, NRFI/YRFI,
 * team totals, alt lines and player props, under a three-step panel whose
 * every rung pointed at locking a unit-sized pick to a permanent public
 * record. Someone who does not bet had no path at all. This page gives them
 * three things they can finish in about a minute, only one of which involves
 * a pick, and that one is marked optional.
 *
 * WHAT IT DOES NOT DO
 *
 * It builds nothing. Each row links to a feature that already exists and
 * already works; this file only asks three read-only endpoints whether the
 * member has done them yet, so the ticks are real:
 *
 *   GET /api/polls/featured           -> featured.user_answered
 *   GET /api/trivia/v2/me/stats       -> stats.attempts        (auth)
 *   GET /api/picks/activation-status  -> hasPicks              (auth)
 *
 * It writes nothing, anywhere. No pick, grade, unit, ROI value, coin or
 * ledger row is created or touched.
 *
 * THE RULE THAT MATTERS MOST
 *
 * A failed request must never render a tick. "Done" is only ever set from an
 * explicit positive answer; a timeout, a 500, a network drop or an unparseable
 * body all fall back to the neutral, actionable state with a working button.
 * Marking an action complete that the member did not do would corrupt the one
 * thing this page is for, and would send them past the very step we want them
 * to take. Nothing here can trap the user either: every row keeps a live CTA
 * in every state, and the skip link is plain HTML that works with JavaScript
 * broken entirely.
 */
(function () {
  'use strict';

  if (window.__tmrWelcomeChecklist) return;
  window.__tmrWelcomeChecklist = true;

  var API = (window.TMR_API_BASE || window.API_BASE_URL || 'https://trustmyrecord-api.onrender.com').replace(/\/$/, '');
  var TIMEOUT_MS = 6000;

  function token() {
    try {
      return localStorage.getItem('trustmyrecord_token') ||
             localStorage.getItem('tmr_token') ||
             localStorage.getItem('accessToken') || '';
    } catch (e) { return ''; }
  }

  function track(name, params) {
    /* ARM ON EVERY EVENT: the welcome funnel has to be readable per arm, and
       adding it here rather than at each call site means a future event cannot
       forget it. ARM is resolved once at start(). */
    var payload = Object.assign({}, params || {});
    if (ARM) payload.arm = ARM;
    try { if (typeof window.gtag === 'function') window.gtag('event', name, payload); } catch (e) {}
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: name }, payload));
    } catch (e) {}
  }
  var ARM = '';

  /* fetch with a hard ceiling. A slow cold Render dyno must not leave three
     rows spinning forever - the row falls back to its actionable state. */
  function get(path, authed) {
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (e) {} }, TIMEOUT_MS);
    var opts = { signal: ctrl ? ctrl.signal : undefined, headers: {} };
    if (authed) {
      var t = token();
      if (!t) { clearTimeout(timer); return Promise.reject(new Error('no token')); }
      opts.headers.Authorization = 'Bearer ' + t;
    }
    return fetch(API + path, opts).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function (e) { clearTimeout(timer); throw e; });
  }

  function el(id) { return document.getElementById(id); }

  function setStatus(id, text, cls) {
    var n = el(id);
    if (!n) return;
    n.textContent = text;
    n.className = 'wc-status' + (cls ? ' ' + cls : '');
  }

  function markDone(stepId, statusId, ctaId, doneText, ctaText) {
    var step = el(stepId);
    if (step) step.classList.add('is-done');
    setStatus(statusId, doneText, 'ok');
    var cta = el(ctaId);
    if (cta) cta.textContent = ctaText;
  }

  /* ------------------------------------------------------------ logged out */

  function renderLoggedOut() {
    var t = el('wcTitle'), s = el('wcSub'), e = el('wcEyebrow');
    if (e) e.textContent = 'Free to join';
    if (t) t.textContent = 'Three things you can do on TrustMyRecord today.';
    if (s) s.textContent = 'Answer the daily prediction quiz, play sports trivia, and see today’s board. Create a free account to save your results.';

    [['wcPollStatus', 'Free with an account'],
     ['wcTriviaStatus', 'Free with an account'],
     ['wcPickStatus', 'Optional — only if you want a tracked betting record']]
      .forEach(function (pair) { setStatus(pair[0], pair[1]); });

    var skip = el('wcSkip');
    if (skip) skip.textContent = 'Browse TrustMyRecord first';
    track('welcome_viewed', { authed: 'no' });
  }

  /* -------------------------------------------------------------- logged in */

  function loadPoll() {
    return get('/api/polls/featured', false).then(function (d) {
      var f = d && d.featured;
      if (!f) {
        // Honest empty state. The CTA still works - /polls/ carries previous
        // quizzes and their standings.
        setStatus('wcPollStatus', 'No quiz posted yet today — see the last one', 'warn');
        var c = el('wcPollCta'); if (c) c.textContent = 'See recent quizzes';
        return;
      }
      if (f.user_answered) {
        markDone('wcStepPoll', 'wcPollStatus', 'wcPollCta', 'Done — results grade after the games', 'See the standings');
        return;
      }
      var qs = f.question_count ? (f.question_count + ' questions') : 'Open now';
      var pts = f.points_available ? (' · ' + f.points_available + ' points') : '';
      setStatus('wcPollStatus', qs + pts);
    }).catch(function () {
      // Never a tick on failure. Neutral copy, working button.
      setStatus('wcPollStatus', 'Open the quiz to see today’s questions');
    });
  }

  function loadTrivia() {
    return get('/api/trivia/v2/me/stats', true).then(function (d) {
      var s = d && d.stats;
      if (s && Number(s.attempts) > 0) {
        markDone('wcStepTrivia', 'wcTriviaStatus', 'wcTriviaCta',
          'Done — ' + s.attempts + ' answered, ' + (s.career_points || 0) + ' points', 'Play again');
        return;
      }
      setStatus('wcTriviaStatus', 'Not played yet · 2,000+ questions');
    }).catch(function () {
      setStatus('wcTriviaStatus', 'Pick a category and play');
    });
  }

  function loadPick() {
    return get('/api/picks/activation-status', true).then(function (d) {
      if (d && d.hasPicks) {
        markDone('wcStepPick', 'wcPickStatus', 'wcPickCta',
          'You have ' + (d.pickCount || 0) + ' tracked pick' + ((d.pickCount === 1) ? '' : 's'), 'Open the board');
        return;
      }
      setStatus('wcPickStatus', ARM === 'treatment'
        ? 'No picks on your record yet'
        : 'No tracked picks yet — entirely optional');
    }).catch(function () {
      setStatus('wcPickStatus', ARM === 'treatment'
        ? 'Open the board and lock one'
        : 'Browse the board — entirely optional');
    });
  }

  function renderLoggedIn() {
    track('welcome_viewed', { authed: 'yes' });
    // Independent so one slow or failing endpoint cannot hold up the others.
    loadPoll();
    loadTrivia();
    loadPick();

    // Report completion once, when all three rows have settled, so the effect
    // of this page is visible next to the Release B cohort numbers.
    setTimeout(function () {
      var done = document.querySelectorAll('.wc-step.is-done').length;
      track('welcome_state', { steps_done: done });
    }, TIMEOUT_MS + 500);
  }

  /* ---------------------------------------------------------------------
     WELCOME_ACTIVATION_EXPERIMENT_20260824

     THE QUESTION. This page is where every registration lands, and it puts the
     one action that creates a verified record third, badges it "Optional", and
     tells the member "You can skip this entirely". Measured on comparable
     30-day windows either side of the 2026-08-09 change that introduced this
     page, first pick within 24h went 27% -> 20%. That is suggestive, not proof:
     n=26 against n=49. This experiment is how we find out.

     ASSIGNMENT. 50/50, pinned in localStorage under WELCOME_ARM_KEY, exactly
     the mechanism static/js/sim-run-cta.js already uses for its own arm - same
     shape, same key naming, same force override. Pinned rather than rolled per
     view because a member must not see the page reorder itself between a
     refresh and a back button during their first two minutes on the site.
     Anyone with no localStorage (private window, storage blocked) falls to
     control, so the shipped page is what an unknown visitor gets.

     TREATMENT. No new markup, no new section, no new styles. It reorders the
     THREE ROWS THAT ALREADY EXIST, renumbers their badges, drops the Optional
     pill, rewrites two sentences, and promotes the CTA from .wc-act.secondary
     to .wc-act - a class the page already ships. The skip link stays. Nothing
     is forced.

     READOUT. Every welcome event already carried `action`; they now also carry
     `arm`, so welcome_viewed / welcome_action_clicked / welcome_skipped split
     by arm with no second funnel. The primary metric is first pick within 24h
     of registration, which services/growthMetrics.js already computes.
     --------------------------------------------------------------------- */
  var WELCOME_ARM_KEY = 'tmr_welcome_arm';
  var FORCED_ARM = null;
  try {
    var q = new URLSearchParams(window.location.search).get('welcome_arm');
    if (q === 'control' || q === 'treatment') FORCED_ARM = q;
  } catch (e) {}

  function welcomeArm() {
    if (FORCED_ARM) return FORCED_ARM;
    try {
      var a = localStorage.getItem(WELCOME_ARM_KEY);
      if (a !== 'control' && a !== 'treatment') {
        a = Math.random() < 0.5 ? 'control' : 'treatment';
        localStorage.setItem(WELCOME_ARM_KEY, a);
      }
      return a;
    } catch (e) {
      /* No storage means no stable pin, and an unstable arm is worse than no
         experiment. Such a visitor sees the page exactly as it ships. */
      return 'control';
    }
  }

  /* Reorder and reword the rows this page already renders. Returns false and
     changes nothing if the expected nodes are missing, so a future edit to the
     markup degrades to control rather than to a half-applied page. */
  function applyTreatment() {
    var section = document.querySelector('section[aria-labelledby="wcTitle"]');
    var pick = document.getElementById('wcStepPick');
    var poll = document.getElementById('wcStepPoll');
    var trivia = document.getElementById('wcStepTrivia');
    if (!section || !pick || !poll || !trivia) return false;

    section.insertBefore(pick, poll);

    var nums = [pick, poll, trivia];
    for (var i = 0; i < nums.length; i++) {
      var n = nums[i].querySelector('.wc-num');
      if (n) n.textContent = String(i + 1);
    }

    var optional = pick.querySelector('.wc-optional');
    if (optional && optional.parentNode) optional.parentNode.removeChild(optional);

    var title = pick.querySelector('.wc-title');
    if (title) title.textContent = 'Start your verified record';

    var why = pick.querySelector('.wc-why');
    if (why) why.textContent = 'Lock your first pick and put your record on the board. It grades itself when the game ends.';

    var cta = document.getElementById('wcPickCta');
    if (cta) cta.className = 'wc-act';

    /* The hero line sold all three rows as "none of them require betting",
       which contradicts a promoted first row. Neither version pressures. */
    var sub = document.getElementById('wcSub');
    if (sub) sub.textContent = 'Three things you can do right now.';
    return true;
  }

  function bindClicks() {
    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('[data-action]') : null;
      if (!a) return;
      var action = a.getAttribute('data-action');
      track(action === 'skip' ? 'welcome_skipped' : 'welcome_action_clicked', { action: action });
      /* ARRIVAL_EVENT_20260825: leave the same handoff the activation strips
         leave, carrying the experiment arm, so /sportsbook/ can report an
         arrival that is attributable to this page AND to the variant. Only the
         board row counts as a pick-flow handoff; the quiz and trivia rows go
         somewhere else entirely. */
      if (action === 'pick') {
        try {
          sessionStorage.setItem('tmr_activation_arrival', JSON.stringify({
            source: 'welcome_checklist', cta_location: 'welcome_board_row',
            surface: 'welcome', arm: ARM || null, ts: Date.now()
          }));
        } catch (e) {}
      }
    }, true);
  }

  function start() {
    ARM = welcomeArm();
    if (ARM === 'treatment') {
      /* If the markup has moved on, fall back to control rather than ship a
         half-applied page - and report the arm the member actually saw. */
      if (!applyTreatment()) ARM = 'control';
    }
    track('welcome_arm_assigned', { arm: ARM });
    bindClicks();
    if (token()) renderLoggedIn(); else renderLoggedOut();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
