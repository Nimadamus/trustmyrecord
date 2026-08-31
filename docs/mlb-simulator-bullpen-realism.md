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
