# MLB Simulator — Calibration History & Validated Targets

Engine: plate-appearance Monte Carlo in `static/js/mlb-simulator.js` (the `ev*`
functions). Box scores are simulated PA-by-PA; team run output is anchored to the
expected-run model so totals stay MLB-accurate while box scores, win %, K/BB/HR,
hits, and run distribution emerge from real events.

Validation harness: `scripts/validate-mlb-simulator.cjs`
```
node scripts/validate-mlb-simulator.cjs [engineGames=40000] [endToEndPairs=60]
```
- Track 1 engine integrity (reconciles team↔player totals, pitcher-R↔opponent-R,
  K/BB/H/HR cross-totals, ER≤R, out accounting, runs≤reachers).
- Track 2 distribution calibration (league-average isolation vs MLB baselines).
- Track 1b end-to-end via `simulate()` over a **deterministic** mirror-pair matchup
  set with replication (repeatable home-field % and drift).

## Authoritative baselines — MLB 2025 full regular season (Phase 0)
Source: MLB Stats API (statsapi.mlb.com), pulled 2026-05-27. Rates aggregated over all
30 teams' season hitting/fielding stats; distributions computed from all 2,434 final
regular-season games (4,860 team-games) via the season schedule with line scores.
- Rates: `/api/v1/teams/stats?season=2025&group=hitting&stats=season&sportIds=1` (+ `group=fielding`)
- Games/dist: `/api/v1/schedule?sportId=1&season=2025&gameType=R&hydrate=linescore`

| Metric | 2025 baseline | Engine (current) | Status |
|---|---|---|---|
| Runs / team / game | 4.447 | 4.45 | ok |
| Game total (mean) | 8.893 | 8.90 | ok |
| HR / team | 1.163 | 1.13 | ok |
| K / team | 8.363 | 8.94 | hot +0.58 (within tol; future target) |
| BB / team | 3.164 | 3.36 | hot +0.20 (within tol) |
| SB / team | 0.708 | 0.76 | ok |
| CS / team | 0.203 | 0.21 | ok |
| Errors / team | 0.504 | 0.30 | low -0.20 (engine ROE rate light; future target) |
| Shutout % (team=0) | 6.8% | 6.3% | ok |
| Blowout % (≥5) | 28.7% | 26.6% | ok (-2.1) |
| Extra-inning % | 8.6% | 10% | ok (+1.4) |
| Team-games scoring 7+ | 22.7% | 22.7% | exact match (old 18% estimate was phantom) |
| Home win % (mirror) | 54.3% | 51.4% | -2.9 (within tol; Layer 3 target) |
| End-to-end target drift | 0% | ~+1–3% | ok after #1 |
| Engine integrity violations | 0 | 0 | CLEAN |

Reference-only 2025 baselines (not gated): SB success 77.7%, league BABIP .291,
league AVG .245, real single-team max 24 runs. Harness reports `RESULT: PASS`
(0 calibration misses) against these authoritative targets.

## Calibration corrections
### #1 — Target-aware anchor (DONE, deployed; build `target-aware-anchor-20260527d`)
Replaced the fixed `×0.985` linear-weights anchor correction (tuned only at ~4.4
R/G) with `evAnchorTargetCorrection(t) = clamp(0.985 + 0.02752t − 0.006719t², 0.80, 1.0)`,
fit to the realized-vs-target curve measured by the harness. The engine compounds
above ~4.4 (high-OBP lineups rally more than linear weights predict), which made
lopsided matchups overshoot. Result: per-side realized tracks target within ~1%
across T=3.0–6.5 (was +18.6% at T=6.5); end-to-end drift +8.5% → ~+2–4%; league
mean preserved; integrity clean.

### #2 — 7+ run over-dispersion (ATTEMPTED, NOT SHIPPED — intrinsic, see below)
Goal: pull team-games scoring 7+ from ~22% toward ~18% without moving the mean.
Two tail levers were implemented and measured against the harness:
- Big-inning damping (suppress offense as an inning's run total climbs).
- Reduced discretionary baserunner advancement (lower runs-per-cluster).

**Both moved 7+ by <0.5 pt at fixed mean** (e.g. damp+refit: 22.2% → 21.9% at R/G
4.39). 7+ run *games* come from accumulation across several medium innings, not
single blow-up innings, so tail-tuning + re-anchoring just reshuffles. The
over-dispersion is intrinsic to a faithful PA/Markov process. For context:
Poisson(4.4) → P(7+) ≈ 15.6%; real MLB is over-dispersed (var/mean ≈ 1.2) →
realistic ~19–21%. The engine's ~22% is ~1–2 pts above realistic and far from
Poisson. The harness's 18% baseline is the residual of the 0–6 estimates and is
likely Poisson-low.

**Decision:** reverted both attempts to the clean #1 state (no engine change
shipped). Recommended next step: pull an authoritative real team-game run
distribution to set the true 7+ baseline before deciding whether any action is
warranted; do NOT force 7+ down with structural changes that would reduce realism.

## Not yet built
Betting-market outputs (ML / run-line / total / team-total / F5) — gated until the
distribution calibration is locked. No player props until box-score integrity is
proven over a real-roster sample.

## Game-rules realism pass (June 4, 2026 — build mlb-simulator-game-rules-realism-20260604a)
Real MLB game-ending rules + two known calibration misses fixed in one harness-gated pass:

1. **Walk-off truncation.** The home half of the 9th (and every extra inning) now
   ends the moment the lead is taken, checked at the end of each PA so a walk-off
   HR counts every run. Measured home-win margins in bottom-9/extras-decided games:
   1 run 78%, 2 runs 16%, 3 runs 6%, 4 runs <1% (grand-slam cap).
2. **True extra innings.** Extra-inning runs are tracked per inning (real 10/11/...
   columns, no more folding into the 9th) and extras use the 2020+ placed-runner
   rule (previous batter starts on 2B; scores as an unearned run). The harness
   reachers check now allows placed runners (engine returns aPlaced/hPlaced).
3. **Skipped bottom 9.** When the home team leads after 8.5, its line score has 8
   entries and the box/scoreboard renders X (baseball convention), never a fake 0.
   boxScore gains additive fields: totalInnings, homeSkippedFinal.
4. **Error-rate calibration.** ROE base 0.017 -> 0.027 (clamp 0.012-0.05):
   errors/team 0.31 -> 0.50 vs real 0.504.
5. **K trim.** EV_K_TRIM = 0.93 inside evCombine (mass moved to in-play outs):
   K/team 8.96 -> 8.23 vs real 8.36.
6. **Anchor rescale x0.969.** Items 2/4/5 added unanchored baserunners (+3.2%
   realized runs, end-to-end drift +3.5%); evAnchorTargetCorrection rescaled by
   the measured overshoot.

Harness after the pass (40000 games / 120 mirror): integrity 0 violations,
calibration misses 0, R/team 4.43 (real 4.45), errors 0.50, K 8.23, 7+ bucket
22.2% (real 22.7%), end-to-end drift +0.5%, home win 53.3% (real 54.3%).

Open after this pass: BB/team +0.10 hot (within tol), blowout% 26.0 vs 28.7
(within tol), extra-inning% 10.1 vs 8.6 (within tol). Next roadmap layer:
per-reliever bullpen (Layer 1) — NOT built yet.

## Accuracy + event-sourced outputs pass (June 4, 2026 — build mlb-simulator-accuracy-outputs-20260604b)
Driven by Nima directive: rosters/batting orders 100% accurate, outputs fixed, more realism.

**Roster/lineup accuracy (30/30 verified):**
- FIXED teamSideInGame shape bug: it read schedule shape (teams.home.team.id) but
  collectRecentStartingLineup passes live-feed gameData (teams.home.id) — the
  recent-game batting order NEVER matched a side, so every team without a posted
  lineup silently fell to the unordered active-roster fallback. Now handles both.
- FIXED stale manual blocklist { ARI: nolanarenado }: statsapi lists Arenado on
  ARI active roster (3B, status A); the entry dropped a real lineup hitter and
  broke ARI to the roster fallback. Blocklist now empty with a hard re-verify rule.
- FIXED loadLiveContext wiping playerStats/playerProfiles/playerSplits/todaySchedule/
  teamInjured when replacing state.liveContext (threw in in-flight fetch callbacks and
  silently degraded lineup slots from real stats to synthetic vectors).
- Audit (_roster_audit.cjs, engine vs raw statsapi ground truth): 30/30 batting
  orders MATCH, 0 roster membership issues.

**Event-sourced outputs (no estimates / random garnish left):**
- RISP X-for-Y, 2-out RBI, LISP-2out, GIDP (per batter + team), SF (AB-excluded,
  official scoring), pickoffs (live event ~0.05/team), outfield assists (runner
  thrown out at home on a single, ~0.13/team), DP turned (defense mirror of GIDP),
  per-PA pitch counts (staff ~146/game) — all tracked from simulated events.
- W/L/SV: starter needs 5+ IP for the W; SV only in close games (margin <= 3) or
  3+ inning finishes. Verified 600 games: 600 Ws, 0 blowout saves.
- GIDP rate calibrated 0.11 -> 0.21 per opportunity => 0.70/team (real 0.72).

**Layer 1 — per-reliever bullpen (SHIPPED, fail-open):** when verified reliever
season stats are cached, setup man = best remaining ERA and closer = saves leader
pitch with their OWN real K/BB/HR rates and real names; otherwise team bullpen
profile (evRelieverArms).

**Anchor re-measured twice:** x1.003 (after pickoff/assist outs ran cold) then
x1.024 (after GIDP rate removed ~2.7% of runs). Final harness: R/team 4.45 (+0.00),
integrity 0 violations, 0 calibration misses, end-to-end drift +1.0%, home win 53.6%.
Rule unchanged: ANY layer adding/removing baserunners or outs must re-measure.

## Roster/pitcher polish pass (June 4, 2026 — build mlb-simulator-roster-pitcher-polish-20260604c)
- Standardized lineup labels: CONFIRMED LINEUP (only live/final source) / PROJECTED
  LINEUP (posted/recent/roster/historical, with detail) / LINEUP UNAVAILABLE chip.
- normalizeName now accent-folds (NFD) — accented active-roster vs plain lineup-feed
  names ("Teoscar Hernandez") previously failed dedupe.
- Final cross-list dedupe in collectMlbTeamRoster — two-way player (Ohtani, TWP
  matches the pitcher regex via /P$/) appeared in BOTH lineup and pitcher lists.
- Per-game starter outing variance: starterOutsGame = mean +/- 8 outs (clamped
  8-25), inning-quantized at pitching changes => 8 distinct outing lengths (4-9 IP),
  mean 6.30 IP; mean-preserving so the bullpen anchor share is unchanged.
- Extended _roster_audit.cjs: lineup structure rules (9 unique, no pitcher in the
  order unless the feed says so, no roster duplicates), label-honesty checks
  (confirmed/posted only when today's feed has it), probable-starter cross-check
  vs schedule hydrate=probablePitcher. Result: 30/30 orders MATCH, 0 membership,
  0 rule fails, 0 label overclaims, 18/18 probables MATCH (12 teams idle today).
- Harness after pass: R/team 4.53 (+0.08, in tol), integrity 0, misses 0, drift
  +1.3%, home win 53.6%. No anchor retune needed (within tolerance).
