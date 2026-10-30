/* =============================================================================
   SIM RUN POLICY: the ONE source of the free run / pricing rules and the words
   that describe them.                                     SIM_RUN_POLICY_20261030
   -----------------------------------------------------------------------------
   Before this file every simulator page wrote its own sentence about what is
   free. They drifted apart: "free with no account", "your first simulation
   needs no account", "needs a free account", and no page said what an extra
   run costs. The rule itself never changed; only the copy did.

   The rule (Nima, ANON_FREE_RUN_20260928 + SIM_RUN_METER_20260914):
     * A signed out visitor gets ONE free simulation on the whole site.
     * A member gets one free run per simulator per day (resets at midnight
       Pacific). Each extra run costs 5 TMR. TMR Pro is unlimited.
     * A run only counts once its result appears (SIM_RUN_SETTLE_20261005 for
       members, ANON_RUN_SETTLE_20261030 for the anonymous run). A failed or
       unfinished run costs nothing.

   Prices live in the backend (services/tmrCoin.js SIMULATOR_RUN_COST). This
   file only DESCRIBES them; tests/sim-run-policy-test.js fails if the two ever
   disagree with the copy or the runtime gate.

   Who reads it:
     scripts/build_league_sim_pages.js, build_nfl_season_page.js (FAQ text)
     scripts/stamp-sim-run-policy.js (hand maintained pages and the runtime
       block inside static/js/sim-auth-gate.js)
   No dashes in this copy: it is published writing.
   ============================================================================= */
'use strict';

const POLICY = Object.freeze({
  anonFreeRuns: 1,                 // per browser, across every simulator
  memberFreeRunsPerSimPerDay: 1,   // resets at midnight Pacific
  extraRunCostTmr: 5,              // must equal backend SIMULATOR_RUN_COST
  proUnlimited: true
});

const BODY = 'Your first simulation on TrustMyRecord is free, with no account needed. ' +
  'After that, a free account gives you one free run a day on every simulator, and each extra run costs ' +
  POLICY.extraRunCostTmr + ' TMR. TMR Pro members run every simulator without limits. ' +
  'A run only counts once its result appears, so a run that fails or never finishes costs nothing.';

/* Short line for modals and small print. */
const SHORT = 'One free run a day on every simulator, then ' + POLICY.extraRunCostTmr + ' TMR a run';

/* FAQ answers: one shared body, a lead that fits each page's question. */
function faqAnswer(lead) {
  return (lead ? lead + ' ' : '') + BODY;
}
const READ_FREE_SEASON = 'The published projection is always free to read.';
const READ_FREE_ODDS = 'The published odds and bracket are always free to read.';

/* Every page whose FAQ states the rule: [file, question, answer]. The stamp
   script rewrites these answers (visible FAQ and FAQPage JSON-LD) and the
   policy test fails when any of them drifts. */
const PAGES = [
  ['nba-simulator/index.html', 'Is the NBA simulator free?', faqAnswer('Yes.')],
  ['nhl-simulator/index.html', 'Is the NHL simulator free?', faqAnswer('Yes.')],
  ['nfl-simulator/index.html', 'Is the NFL simulator free?', faqAnswer('Yes.')],
  ['nfl-playoff-simulator/index.html', 'Do I need an account?', faqAnswer('Not to start. Picking games and building a bracket never need an account.')],
  ['nfl-season-simulator/index.html', 'Is it free?', faqAnswer(READ_FREE_SEASON)],
  ['nba-season-simulator/index.html', 'Is it free?', faqAnswer(READ_FREE_SEASON)],
  ['nhl-season-simulator/index.html', 'Is it free?', faqAnswer(READ_FREE_SEASON)],
  ['nba-playoff-simulator/index.html', 'Is the NBA playoff simulator free?', faqAnswer('Yes. The bracket picker, the projected field and the published odds are always free.')],
  ['nhl-playoff-simulator/index.html', 'Is the NHL playoff simulator free?', faqAnswer('Yes. The bracket picker, the projected field and the published odds are always free.')]
];

/* Inline mentions in page prose, between <!--SIM_RUN_POLICY:inline--> and
   <!--/SIM_RUN_POLICY--> markers. */
const INLINE = 'Picking games is always free. Your first simulation needs no account, then a free account gives you ' +
  'one free run a day on every simulator, and each extra run costs ' + POLICY.extraRunCostTmr + ' TMR.';
const INLINE_PAGES = ['nfl-playoff-simulator/index.html'];

/* Phrases that contradict the rule. Any simulator page carrying one fails the
   policy test. */
const BANNED = [
  /free to use with no account required/i,
  /your first simulation need no account/i,
  /free with a TrustMyRecord account\. Creating one/i,
  /uses the daily free simulator run/i
];

/* The block stamped into static/js/sim-auth-gate.js, so the runtime gate reads
   the same numbers and words as the pages. */
function runtimeBlock() {
  return 'var SIM_RUN_POLICY = ' + JSON.stringify({
    anonFreeRuns: POLICY.anonFreeRuns,
    memberFreeRunsPerSimPerDay: POLICY.memberFreeRunsPerSimPerDay,
    extraRunCostTmr: POLICY.extraRunCostTmr,
    short: SHORT,
    body: BODY
  }) + ';';
}

module.exports = { POLICY, BODY, SHORT, INLINE, INLINE_PAGES, faqAnswer, READ_FREE_SEASON, READ_FREE_ODDS, PAGES, BANNED, runtimeBlock };
