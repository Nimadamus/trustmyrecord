/**
 * TrustMyRecord - /welcome/ first-run checklist.
 *
 * WHAT THIS IS
 *
 * A brand-new account used to land on /sportsbook/?first_pick=1: a sixteen
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
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {}
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: name }, params || {}));
    } catch (e) {}
  }

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
      setStatus('wcPickStatus', 'No tracked picks yet — entirely optional');
    }).catch(function () {
      setStatus('wcPickStatus', 'Browse the board — entirely optional');
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

  function bindClicks() {
    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('[data-action]') : null;
      if (!a) return;
      var action = a.getAttribute('data-action');
      track(action === 'skip' ? 'welcome_skipped' : 'welcome_action_clicked', { action: action });
    }, true);
  }

  function start() {
    bindClicks();
    if (token()) renderLoggedIn(); else renderLoggedOut();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
