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
