# MLB simulator: the relief tail is a bullpen-depth problem

**Status:** open. Diagnosed 2026-08-31, not fixed. No engine change shipped.
**Symptom:** `tests/mlb-simulator-realism-test.js` fails `realism batch has zero
invalid outputs` on one-inning relief appearances of 9 to 14 hits, against a real
maximum of 7 in 12,782 MLB one-inning relief appearances.
**Owner note:** an attempted fix was measured, found to trade the defect for a
worse one, and reverted. The measurements are below so the next attempt starts
from evidence rather than from the top.

---

## How to reproduce the failure at all

The suite runs 12,000 simulations, about 3.7 hours in one process, which is why
it had effectively never been run to a verdict. Run it as a shard pool instead:

    python tests/run-realism-sharded.py --shards 24 --workers 5
    node tests/mlb-simulator-realism-aggregate.js --dir .realism-shards

The aggregator applies the suite's own assertions to the merged sample and
refuses to report unless all 24 shards are present and their counts sum to
12,000. `node tests/mlb-simulator-realism-aggregate.js --self-check` diffs its
assertion block against the suite's and reports how many match verbatim.

Baseline on a pristine `origin/main` worktree: **8 invalid outputs**, worst line
10 hits. The failure is old and is not caused by any 2026-08-31 work.

---

## Three defects found, all still present in production

### 1. The manager hook is dormant in production

`LAST_ARM_POSITION_PLAYER_20260827` in `maybeChange()` exists precisely to end
these appearances: when the last named arm is being hit, send a position player.
Its first line is

    if (!workloadV2()) return; // no arm available to replace him

and `workloadV2()` reads `window.TMR_MLB_WORKLOAD_V2`, which only the
release-candidate flag sets. In production, and in the realism suite which runs
production defaults, the branch returns immediately every time. The fix written
for this bug does not run where the bug is.

Instrumented over 200 games on the shipped build:

    { blocked: 3013618, wouldAct: 116015, worstBlockedHits: 15 }

`wouldAct` counts the times the hook's own criteria (`apptRuns >= 3 ||
lastHits >= 4`) were already satisfied and it still could not act. The worst
blocked appearance had reached 15 hits.

`REAL_BULLPEN_DEPTH_20260827` (up to five arms instead of three) is behind the
same flag, so production ships a three-arm bullpen.

### 2. A pitching change can resolve to the pitcher himself

The swap took its target from `defSide.posPitcherIdx`:

    var nextIdx = lastArm ? defSide.posPitcherIdx : idx + 1;

That is not the index of the man just chosen. When the fallback reused an arm
already on the staff, or when `posPitcherIdx` already pointed at the pitcher
being hit, `pitchers[nextIdx]` was the outgoing pitcher. He was flagged
`removed`, the box score logged a pitching change, and the same arm kept
pitching. Observed twice in 300 games:

    SELF-REPLACE Ian Price (C, position player) nextIdx=6 posIdx=6
    SELF-REPLACE Joc Pederson (DH, position player) nextIdx=5 posIdx=5

### 3. Pulled pitchers re-enter, and their stints merge

The `NEVER_LEAVE_HIM_IN_20260827` fallback reuses a position player already on
the staff. A re-entering pitcher is not a second box-score line: it is the same
`acc` object, so his stints merge into one row. Meanwhile `apptStartHits` resets
each time he takes the mound, so the hook never sees more than a few hits.

**This is the mechanism behind the extreme lines.** A "one-inning" row showing
11 hits is several short stints by one man, each individually under the hook's
threshold, summed into a single row. The hook is working correctly on every
stint; the row is the artefact.

Instrumented over 300 games: **1,628 re-entries**.

Also note `if (!emergency) return;` fired **254 times in a single game**, because
the fallback requires `!alt.removed` and every position player who has already
pitched is marked removed. Once the pool has been through once the fallback finds
nobody and the shelled arm simply stays in.

---

## The attempted fix, and why it was reverted

Three changes were made together: ungate the last-arm emergency, target the swap
at the man actually chosen (refusing a no-op), and stop re-entry by filtering on
who is already on the staff rather than on a pid map that collapses on curated
lineups.

Measured over 1,500 games at production defaults:

| metric | real MLB | before | after |
|---|---|---|---|
| one-inning 5+ hit rate | 0.54% | 0.804% | 0.67% |
| worst one-inning line | 7 H | 7 H | 7 H |
| worst relief line, any length | | 11 H | 10 H |
| runs / game | ~8.6 | 8.302 | 8.535 |
| starter outs | | 17.67 | 17.67 |
| pitchers / team-game | 4.29 | 2.735 | 2.808 |
| position-player appearances / game | 0.054 | 0.077 | **0.185** |

Full 12,000-simulation aggregate, invalid outputs by class:

| | pristine main | before this work | after the attempted fix |
|---|---|---|---|
| total | 8 | 4 | 7 |
| relief tail | 6 | 2 | 3 (all 9 H) |
| short outing | 2 | 2 | 2 |
| **runs exceed hits** | 0 | 0 | **2** |

The worst line came down from 14 to 9 hits and the 5+ rate improved, but:

- **a new invariant violation appeared** - teams scoring 7 and 8 more runs than
  hits, a class absent from every baseline run;
- position-player pitching tripled to 3.4x the real rate;
- runs per game rose 2.8%.

Trading a 9-hit inning for a new violated invariant and a visibly wrong bullpen
is not a fix, so none of it shipped. `static/js/mlb-simulator.js` on `main` is
byte-identical to the pre-work baseline apart from the recap wording helpers.

---

## Why this is a roster-depth problem, not a threshold problem

Every symptom traces to the same structural fact: **the engine names three relief
arms.** With three arms the "last arm" state is reached constantly, so:

- the emergency path is load-bearing rather than exceptional;
- ending appearances correctly forces position players onto the mound at 3.4x the
  real rate, which is what produces the runs-exceed-hits games;
- the third reliever absorbs everything the schedule has nowhere else to put.

Two attempts to tune around it both failed:

- **Raising the last-arm threshold** to 4 runs / 5 hits lowered position-player
  usage to 0.112/game but pushed relief appearances of 9+ hits to 12, worse than
  the 6 in the untouched baseline.
- **Ungating `REAL_BULLPEN_DEPTH_20260827`** to five arms inflated scoring to
  8.575 runs/game, reintroduced an eight-hit inning, and left the position-player
  rate unchanged at 0.177. The code's own comment records a June 2026 four-arm
  test reverted for the same reason.

A real staff is 4.29 pitchers a game: 4 in 32.7% of games, 5 in 26.1%, six or
more in 15.3%. A three-arm engine cannot reach that distribution from below, and
41% of it is structurally unreachable.

## What a real fix probably has to do

1. Model a bullpen deep enough that "last arm" is rare rather than routine, and
   re-calibrate scoring against that, rather than bolting depth onto the current
   scheduler and accepting the run inflation.
2. Make the appearance the unit of record: a pitcher who leaves does not return,
   and if the engine ever must reuse a man, that has to open a NEW box-score row
   rather than merging into his old one.
3. Only then ungate the last-arm emergency, where it will be the exception it was
   written to be.

Each step needs its own 12,000-simulation aggregate. The shard pool makes that a
90-minute job rather than a 3.7-hour one.

## Also open, same suite, not investigated here

Failing identically on a pristine `origin/main`, so pre-existing and untouched:
away scoring average 3.82 against a 3.9 floor, 16+ run games at 6.12% against a
3.5% cap, and 21+ run games at 1.03% against 0.5%. These are distribution-width
questions and may share a cause with the bullpen model; they may equally be
thresholds calibrated on a smaller sample than the 12,000 the suite now runs.

---

## 2026-10-23: pitching management audit (World Series Game 1 report)

**Report:** Rays at Brewers, WS Game 1. Jacob Misiorowski lifted after 4 2/3 IP,
1 H, 1 ER, 0 BB, 62 pitches; Trevor Megill (closer) used for 2 2/3 IP, 41 pitches.

**Was it the engine or the display?** The engine. Box score, play-by-play and
pitching lines are folds of one event log (`elReconcile` clean); the decisions
were made in `evActivePitcher`, `evDefPitcher` and `maybeChange`.

**Benchmarks** are measured from statsapi boxscores, not estimated: all 171
postseason games 2022-2025 and 600 spread 2025 regular season games (closer =
club saves leader; dominant start = 12+ outs, <=1 ER, <=3 H).

### Root causes and fixes (all gated on `workloadV2()`, which production sets)

| # | Root cause | Fix |
|---|---|---|
| 1 | Starter hook was an out count drawn before the first pitch; nothing about how he was pitching could extend it, and the mid-inning "past target with a runner on" pull fired on cruising starters (the 4 2/3 IP / 62 pitch line). | `STARTER_EFFECTIVENESS_20261023`: `evStarterCruising` (pitches left for an inning, runs, baserunners per inning); a per-game `_spRide` draw keeps the quick-hook nights. Bounded to +2 innings over plan. |
| 2 | Pitches per PA 3.66 vs MLB ~3.9, so hooks happened at 60-70 pitches. | `PITCH_ECONOMY_20261023`: more fouls on balls in play (pitch counts only). |
| 3 | Mid-inning change always took `idx + 1`; the top rung is the closer, and the floor ratchet then kept him in (the Megill line). | `MID_INNING_MANAGER_20261023` (`maybeChangeV2`): decide whether (damage, pitch count, leverage), then who; `closerEntryOk` gates the closer; four-out save modeled explicitly. |
| 4 | Closer could start an inning with 5 outs already recorded; no reliever pitch limits. | `RELIEVER_ROLE_WORKLOAD_20261023`: CL cap 4 outs to start an inning, role pitch ceilings, also applied to the man already on the mound. |
| 5 | Postseason ladder was SHORTENED to 3 middle arms (real October clubs use more pitchers: 5.03 vs 4.26). | `POSTSEASON_PEN_DEPTH_20261023`: 5 middle arms; roster relievers outside the ladder and (October only) idle rotation starters are the depth arms before any generic arm. |
| 6 | Leverage test read `endLead`, null except in walk-off halves, so every game counted as close. | Real score context (`_defLeadAtHalf`). |
| 7 | Illegal re-entry: early-return branches in `evDefPitcher` and the injury replacement (`idx + 1`) could send a replaced pitcher back out. 267 of 1,500 simulated WS games before the fix. | `evDefPitcher` wrapper marks every outgoing arm; injury replacement uses the same chooser. |
| 8 | Appearance snapshots (`_apptStartHits/Runs`) never reset between games, so the displayed game's hit/run hooks used stale values from the win-probability sample. | Reset per game. |
| 9 | Automatic extra-inning runner was removed on the false premise MLB dropped it after 2022. It is permanent in the regular season since 2023 (not used in the postseason). Without it 9.5% of extra-inning games reached the 15th (real 2024-25: 0 of 426). | `EXTRA_INNING_RUNNER_20261023`, regular season only, unearned, logged as a `PLACED_RUNNER` play. |
| 10 | No-reliever-stats staff (every historical club, failed feeds) was SP + 1 middle arm + closer: closer started before the 8th in 30% of outings, position players pitched in 16% of team-games. | `FAIL_OPEN_PEN_DEPTH_20261023`: 3 middle + setup + closer, unnamed arms labeled as unnamed. |
| 11 | Changes carried no reason. | Every SUB event records the reason the engine acted on; shown in play-by-play and a new Pitching Changes box score section; pitcher rows carry `exitReason`/`entryReason`. |

### Before / after, same seeds, real TB/MIL inputs (`tests/mlb-simulator-pitching-management-test.js`)

| WS Game 1 (postseason) | before | after | real |
|---|---|---|---|
| closer outings 7+ outs | 19.6% | 0.0% | 1.2% |
| closer outings 35+ pitches | 15.4% | ~3% | 2.4% |
| closer outings 4+ outs | 50.2% | ~31% | 31.5% |
| closer entered before the 8th | 34.6% | 0.0% | rare |
| dominant start lifted < 6 IP under 80 pitches | 55.3% | ~25% | 30.6% |
| pitchers per team-game | 4.42 | ~4.9 | 5.03 |
| starter pitch count p50 | 72 | 83 | 82 |
| position player pitched, game within 4 runs | 7.3% | 0.1% | ~0 |
| team-games with an illegal re-entry | 267/3000 | 0 | 0 |

Regular season, same clubs: dominant early hook 43.5% -> 19.6% (real 19.8%),
closer 4+ outs 13.8% -> 11.0% (real 10.0%), starter p50 pitches 77 -> 88 (real 88).

### Second pass (same day)

| # | Finding | Fix |
|---|---|---|
| 12 | The two page-test "BOX SCORE RECONCILIATION FAILED" warnings: pre-existing (identical on pristine main). Every roster-less current matchup (feed down, synthetic unnamed lineup) failed: 300 of 300. The fold keeps every slot; the comparison used display rows, which drop unnamed batters. The game state was consistent; the check was wrong. | `RECONCILE_UNNAMED_ROWS_20261023`: reconcile against unfiltered rows; display unchanged. 0 of 900 after. |
| 13 | Single games ignored recent reliever usage. | `BULLPEN_WORKLOAD_LEDGER_20261023`: reads the live backend ledger (`/api/mlb-data/teams/:id/bullpen`, CORS-open to trustmyrecord.com, verified current against statsapi game logs 2026-10-23). Unavailable arms sit, limited arms are one-inning arms, the result names them. No ledger = identical game (tested). |
| 14 | Series: ledger applies to the first game only, then the series rule; the "fewer than two rested" fallback reinstated the WHOLE pen and depth arms ignored series rest. | Only the least-worked arms needed come back (recorded as `forcedFatigued`); depth arms obey the rule. 0 rule breaks over 5,134 simulated series relief outings. |
| 15 | Marathons: when the depth arm on the mound was lifted, `evDepthArm` returned the same man, so a tie game "ran out" of pitchers with starters unused. | Fixed; idle starters are the last reserve in both modes (skipped if the ledger shows they pitched within 3 days). 0 position players in close extra-inning games over 908 extra-inning team-games. |
| 16 | Regular season used 4.62 pitchers a team-game (real 4.21-4.26, 2023-2025). | Regular season leverage changes from the 7th within a run (October unchanged): 4.29 on live inputs. |

| 17 | The 12,000-game realism suite (first full run on this branch) found 3 one-inning relief lines of 9 hits. Reproduced: a blowout position player, kept in by the "he finishes" rule, allowing 8-10 hits (old build max 10 on the seeded stress set). | Position player lifted at 6 hits or 6 runs; in a blowout another position player takes over, not a real arm. Seeded stress max now 7 (the real maximum in 12,782 appearances). |
| 18 | Two realism-suite assertions failed on every build, pristine included: 16+ run games <= 3.5% and 21+ <= 0.5%. Real regular seasons (statsapi linescores) run 7.6-9.5% and 1.15-1.89% (2023-2025), so a realistic engine fails them by construction. | Bounds corrected to bracket the record (5-11%, <= 2.5%), in the suite and the aggregator (self-check verbatim). |

**Overfitting check.** Postseason parameters were fitted to 2022-2025 (171 games).
Holdout 2016-2019 + 2021 (180 games, never used in fitting):

| metric | fit 2022-25 | holdout | sim (WS G1) |
|---|---|---|---|
| closer 4+ outs | 31.5% | 30.3% | 30.7% |
| closer 7+ outs | 1.2% | 2.4% | 0.0% |
| closer 35+ pitches | 2.4% | 7.2% | 3.3% |
| dominant start lifted early | 30.6% | 26.4% | 25.4% |
| pitchers per team-game | 5.03 | 5.01 | 4.9 |
| starter pitches p50 | 82 | 82 | 83 |

Single postseasons swing widely (closer 4+ outs 7.5% in 2021, 43.5% in 2016;
dominant early hook 15% to 50% on 11-26 starts), so no single-season target is
meaningful. Regular season holdout 2023-2024 (1,200 games): closer 4+ outs 10.7%
(sim 12.0%), dominant early hook 14.4% (sim 17.5%), pitchers 4.23 (sim 4.29),
starter pitches p50 90 (sim 89).

### Known limitations (not fixed here)

- The ledger has no game-time context for hypothetical matchups: it describes
  today's real bullpens and is applied to any current-era single game.
- Opener detection only from season ip/gs; no announced bullpen games.
- Postseason specifics (ride rate, pitch limit 97, leverage rules) are fitted to
  four postseasons of boxscores; small sample.
- A club whose roster feed fails, or a historical club, has no named depth:
  its marathon fallback is one unnamed "emergency reliever" (labeled as such).

### 12,000-game realism suite, final build (production flags: TMR_MLB_RC + batted-ball table)

24 shards, one worker (memory), 12,095 s. Every rate/average assertion passes:
19+ team scores 0.133%, 26+ totals 0.167%, home 4.71 / away 4.15 / total 8.85,
relief 5+ hit outings 0.343% (real 0.540%), 8+ hit outings 0, 16+ run games
7.80%, 21+ run games 1.28%. One instance flag: "away runs exceed hits by 7" in
one of 24,000 team-games (mixed HOU at 2001 SEA). Not a pitching defect: real
2021-2025 regular seasons reach 6 (2023) and produce 5+ about once per 4,900
team-games; the displayed-game engine produces 5+ about once per 12,000. The
earlier full runs on this branch did not produce it. Left as the one open item.

### Follow-up analysis (2026-10-24)

**"Runs exceed hits by 7" (1 of 24,000 team-games).** The suite is unseeded, so
that exact game cannot be replayed. 44,000 seeded team-games of the same matchup
(HOU at 2001 SEA, event-logged, `_audit/over_trace.cjs`) produced runs - hits >= 5
three times (1 per ~14,700; real 2021-2025: about 1 per 4,900, max 6) and never
>= 6. Scoring trace of seed `nd|3782`: 11 R on 6 H = HR 5, 2B 2, 1B 1, error 1,
sac fly 1, wild pitch 1, with 4 fielding errors; legal baseball. New invariant
(`auditRunScoring` in the pitching suite): every run must be a runner who reached
base in that half by a recorded event or the placed extra-inning runner, and must
reach again before scoring again. 0 violations over 6,000 fixture games and
3,000 random pairings with forced injuries; the auditor self-test catches a run
by a runner who never reached. Conclusion: legal tail event, not fixed by any
runs <= hits clamp.

**Game total 9.43 vs 8.89 (production flags, offline end-to-end set).** Same
960 games (`_audit/total_attrib.cjs`), expected total / box-score total:

| layers | expected | box |
|---|---|---|
| neither | 8.94 | 8.83 |
| starter residual only | 9.24 | 9.25 |
| batted-ball table only | 9.00 | 9.06 |
| both (production) | 9.30 | 9.38 |

The residual layer is +0.30 of the +0.36 expected-run gap. Mechanism: with the
residual on, `simulate()` skips `selectedPitcherRunAdjustment` +
`starterEraAdjustment` and applies only the residual against the club's own
starting-pitching rating. The offline default starters average quality 105.7
(all offered starters 102.6), so the legacy terms subtracted about 0.4 runs a
game; the residual subtracts 0.095. The base run model was effectively centered
with that subtraction in it. Re-centering the static club ratings to 100 only
moves the total to 9.21, so it is the baseline anchor, not the rating table. The
batted-ball table adds +0.06 expected, +0.22 in the box (sac flies, double plays,
errors gated on ground/air). Not a pitching-management defect; a fix is a
league-mean re-anchor of the run model under the residual, which needs a live
slate backtest before it can be called right. Not staged.

### Out-of-sample backtest, pilot (2026-10-24)

Scripts: `scripts/mlb-sim-backtest/` (`bt_fetch.cjs` data, `bt_run.cjs` sims,
`bt_eval.cjs` grading); data `pilot-games-2025-2026.json`. 84 real regular-season
games, 6 per month, deterministic spread by gamePk; train 2025 (42), holdout 2026
(42). Inputs are pre-game only: the announced probable starters (statsapi
schedule `hydrate=probablePitcher`) and each starter's season line through the
day BEFORE the game (`stats=byDateRange`, endDate = gameDate - 1). Final scores
are the target only. Same seed per game in every configuration; reruns are
byte-identical (verified). Two team-input modes: neutral ratings (no leakage;
removes all team signal) and the static rating table (a 2026 snapshot: ex post
for 2026, a different season for 2025; leakage-prone, shown for comparison).

Expected game total vs actual, 2026 holdout (n=42, 95% bootstrap CI):

| engine / layers | neutral teams | static ratings |
|---|---|---|
| production main, residual+BB | -0.01 [-1.33,+1.23] | +0.30 [-1.01,+1.56] |
| production main, legacy starter terms | -0.54 [-1.87,+0.67] | -0.15 [-1.49,+1.05] |
| staged, residual+BB | -0.15 [-1.51,+1.13] | +0.15 [-1.23,+1.46] |
| staged, legacy starter terms | -0.57 [-1.87,+0.67] | -0.18 [-1.46,+1.06] |
| staged, residual only | -0.25 [-1.63,+1.02] | +0.05 [-1.32,+1.38] |

- The offline +0.54 (synthetic default starters) does not appear on real games:
  every holdout bias CI contains zero.
- A league-mean re-anchor fitted on 2025 (x0.970-1.027 depending on config) made
  the 2026 holdout bias WORSE in every configuration. Not warranted; not staged.
- Starter sensitivity (expected minus actual runs scored against the starter,
  per 10 quality points): residual +0.41 to +0.50, legacy +0.14 to +0.23. A
  positive slope means the good starter is under-credited, so the residual does
  NOT double count on this sample; it weights the starter less than outcomes
  support. With n=168 starts this is suggestive, not conclusive.
- Win-probability log-loss on the holdout is within noise across configurations
  (0.676 to 0.699).
- Not scaled to >= 300 games: the run guard (>= 1500 MB free RAM, >= 8 GiB disk)
  was not met (581 MB, 6 GB).

---

## 2026-10-30: release integration onto main, strikeout trim, shelled-starter leash

Integrated onto origin/main 83ee8d02 by cherry-picking 30ce580aa, e49e6ef9d and
bf8ff2e0b (only conflict: mlb-simulator/index.html; main's header reserve,
roster clock and season banner kept). Two measured fixes on top, both under
`workloadV2()`:

* `K_TRIM_RECAL_20261030`: `EV_K_TRIM` 0.88 (fitted in June) over-trimmed after
  later engine changes. 0.95 under the flag.
* `SHELLED_STARTER_LEASH_20261030`: mid-inning run hook 7 runs (5 at 75+
  pitches), hit hook 9 (7 at 75+), boundary rocky hook needs 70+ pitches.

Sample: 700 real 2025-26 matchups (the `_audit/bt/games600.json` set), 4 games
each, REAL current rosters captured through the engine's own fetch path
(30 clubs, 684 player lines), same seeds for live and candidate. Real column =
the same 700 statsapi boxscores. Default starters (as a visitor runs it):

| metric | real | live (main) | this release |
|---|---|---|---|
| runs / team-game | 4.50 | 4.42 | 4.51 |
| hits | 8.19 | 8.56 | 8.49 |
| HR | 1.17 | 1.27 | 1.25 |
| walks | 3.34 | 3.32 | 3.35 |
| strikeouts (K%) | 8.43 (~22%) | 7.89 (20.3%) | 8.35 (21.6%) |
| pitchers / team-game | 4.32 | 4.85 | 4.55 |
| starter pitches p10/50/90 | 64/88/100 | 48/76/102 | 65/87/101 |
| starts 100+ / 105+ pitches | 10.2% / 2.8% | 15.5% / 6.3% | 13.8% / 3.3% |
| starts under 70 pitches | 14.0% | 38.5% | 13.5% |
| 5+ ER starts under 70 pitches | 16.2% | 60.4% | 17.1% |
| starts of 6+ IP | 35.6% | 26.6% | 27.5% |
| closer 7+ outs / 35+ pitches | ~0 / ~1.5% | 4.1% / 5.5% | 0 / 1.8% |
| position player pitched | 2.7-2.9% | 8.9% | 3.9% |
| extra innings / halves with runner | 9.7% / all | 10.5% / 0 of 1,396 | 10.0% / 840 of 840 |

Misiorowski (WS fixture, 1,000 seeded games each, regular / postseason):
live p50 78 / 74 pitches, 31.8% / 40.2% of starts under 70, dominant starts
lifted before 6 IP under 80 pitches 44.7% / 58.5%. This release: p50 89 / 84
(real 2026: 93 regular, 88 postseason), under 70 10.9% / 22.2% (real 3 of 30),
dominant early lift 18.4% / 27.6% (real league 19.8% / 30.6%).

Open (measured, not fixed): 6+ IP starts 27.5% vs 35.6% and 100-pitch starts
13.8% vs 10.2% (pitches per out run high late in starts); hits +0.3 and HR +0.07
a team-game; elite hit suppression is capped (`hitFactor` floor 0.78), so
Misiorowski allows 4.3 H a start against a real 3.3 and the 7-hit hook fires in
~10% of his starts.
