# TrustMyRecord — session instructions

Read `DEVELOPMENT_RULES.md` before changing anything. It is the hard-rule ledger for this
repo and its first section governs the Handicapping Hub.

## Handicapping Hub architecture is LOCKED

`HANDICAPPING_HUB_ARCHITECTURE_20260909`. Multiple Claude sessions work on this repo at the
same time and have overwritten each other. The architecture is settled. Do not redesign it,
do not expand it, do not "improve" it into something larger.

    ONE HANDICAPPING HUB PER SPORT
    + USEFUL AUTOMATED DATA FOR EVERY GAME ON THAT HUB
    + OCCASIONAL MATCHUP OF THE DAY ARTICLES, WHEN WE CHOOSE TO FEATURE ONE

- **Not** a deep editorial preview for every fixture. That system is frozen where it stands.
- **There is no editorial quota.** A Matchup of the Day is optional and occasional. It is not
  required every day, not required for every sport, and not required just because games
  exist. Some days carry several across different sports, some days carry none. The hub must
  be complete and valuable on a day when ZERO articles are published. TMR is not a daily
  article factory.
- **Never** rename, delete or de-index an existing matchup page. MLB's 212 pages carried
  17,307 impressions in the 89 days to Sep 7, 2026.
- Every matchup page renders through `scripts/handicap_page.py` and
  `static/css/tmr-handicap.css`. One design system for every sport.
- NCAAF, soccer and tennis are hub-first. No permanent per-game pages for a sport the
  graded-game engine cannot answer.
- The featured game comes from `featured_article()`, which reads
  `/matchup-of-the-day/<sport>/`. There is no second hand-maintained featured system.

Full detail, including what to keep and what not to re-wire, is in the first section of
`DEVELOPMENT_RULES.md`.

The full fifteen point plan is the first section of `DEVELOPMENT_RULES.md`. The four points
most often missed by a session that only skims this file:

- **Point 3, automation.** The hub refreshes itself: current slate, current data, on a schedule.
  A hub that needs a Claude terminal opened to show tomorrow's games has failed. Acceptance
  test: if nobody opens a terminal tomorrow, does the hub still update?
- **Point 9, data integrity.** No fabricated stats, no new or paid data provider without
  Nima's approval, and every derived metric traceable to real source data.
- **Point 10, design standard.** A serious research product: logos and headshots, matchup
  cards, comparison bars, form, filters, sorting, readable on desktop and phone. Never let a
  hub regress to a plain odds dump.
- **Point 11, identity.** TMR is verified picks, records, handicappers, accountability,
  leaderboards, community, contests and the sportsbook. Handicapping supports that; it does
  not replace it.

## Never explain the backend to a visitor

`NO_INTERNAL_DISCLAIMERS_20260909`. No database limitations, no missing-engine explanations, no
"there are no permanent matchup pages for this sport yet", no "left blank rather than filled with
an estimate", no staleness caveats, no architecture commentary. If a data feature is unavailable,
**omit the module silently** and let the page close up around it.

Sourcing and sample size are not disclaimers and stay: name the book, state how many graded games
a record was counted from. Phrase it as what we have, never as what we lack.


## Run the acceptance gate before you say done

`python scripts/handicap_qa.py` prints PASS/FAIL per sport with evidence and exits 1 on any
failure. It is the governing quality gate for every hub and matchup page: data freshness in
Eastern time, one H1, no internal disclaimers, no broken links or images, team and player
imagery, full slate coverage against the live board, and the sport-specific research modules.

Two items print as MANUAL because a script cannot settle them: the desktop and 390px render,
and whether a REAL scheduled run has fired (`event: schedule`, not workflow_dispatch and not
a local build). Supply that evidence yourself. Never report complete with a FAIL or an
unproven MANUAL outstanding. Full requirement list: `DEVELOPMENT_RULES.md`.


## Session model: ONE coordinator, no new Handicapping sessions

`HANDICAPPING_SESSION_CONSOLIDATION_20260909`. Nima, 2026-09-09: "The goal now is REDUCING
coordination overhead, not creating more parallel workers."

There is ONE master Handicapping coordinator. It owns the shared builders, reconciliation,
cron verification, seven-sport QA, final integration and the push. Everything else hands off
to it and stops.

- **Do not spawn a new Handicapping session.** Not for a sport, not for a fix, not for a
  "quick" check. If you are reading this and were about to start one, message the coordinator
  instead.
- The NCAAF and Tennis specialist sessions completed on 2026-09-09 and stood down. Soccer
  settled earlier the same day. None of the three should be reopened unless the final QA
  finds a specific defect in that sport.
- MLB, NFL, NBA and NHL get no dedicated session at all unless QA turns one up.
- A session that does finish a piece of Handicapping work hands off by: committing, telling
  the coordinator exactly what changed and at which SHA, and then stopping.

The coordinator is the single authority for the final combined state.


## Working alongside other sessions

`scripts/build_sport_matchup_pages.py` is edited by more than one session. Before you touch
it: `git fetch`, check its mtime, and re-read it. Match on exact text when editing; never
replace a line range. On Sep 9, 2026 a range replacement silently dropped `BODY_TAG`,
`SHELL_STYLE` and `next_game_block` from another session's work.

## The product

TrustMyRecord is pick tracking, verified records, handicappers, leaderboards, community,
contests and the sportsbook. The Handicapping Hub exists to give a user research before they
make a pick. It does not become the identity of the site.
