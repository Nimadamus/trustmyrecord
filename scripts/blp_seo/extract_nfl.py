"""BetLegend Pro SEO pages, step 1 of 2: extract the verified NFL game set.

Runs INSIDE the BetLegend Pro backend (Nimadamus/betlegend-pro, backend/) so
every row comes through the same engine code the live tool answers with:
historical_matchup._team_history_via_index / _filter_team_games / _summarise
for team samples and _gather_historical_sync for head to head samples.

    cd betlegend-pro/backend
    export DATA_FILE_PATH=... HANDICAPPING_TOOL_PATH=... PYTHONPATH=.
    unset RESEND_API_KEY          # a local refresh must never send alarm mail
    python <tmr>/scripts/blp_seo/extract_nfl.py <tmr>/data/blp-seo [--refresh]

--refresh first runs the engine's own insert only dataset refresh for NFL
(dataset_refresh.refresh_dataset), which is what production runs daily, so
the local copy holds the same games the live tool does. build_nfl.py then
proves parity against production before any page is written.

Writes, and nothing else:
  nfl-games.json   one compact record per game (the only game data the
                   page builder reads)
  nfl-engine.json  the engine's own summaries and exact game ID lists per
                   team and per matchup, so build_nfl.py can prove its
                   arithmetic matches the tool
"""
import json
import os
import sys
from datetime import datetime, timezone

from app.services.engine_wrapper import get_query_engine, get_verified_ranges
from app.routers import historical_matchup as hm
from app.routers.matchup import _resolve_team_or_422
from app.routers.query import _franchise_chain

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nfl_teams import TEAMS, division_pairs  # noqa: E402

OUT = sys.argv[1]  # keep OUTSIDE the public trustmyrecord repo: this is the paid dataset
os.makedirs(OUT, exist_ok=True)
engine = get_query_engine()

if "--refresh" in sys.argv:
    if os.environ.get("RESEND_API_KEY"):
        raise SystemExit("unset RESEND_API_KEY first: the refresh alarm would email from a laptop run")
    from app.services.dataset_refresh import refresh_dataset
    report = refresh_dataset(engine, sports=("NFL",))
    nfl = report["sports"]["NFL"]
    print("refresh NFL:", nfl["status"], "inserted", nfl["inserted"], nfl["window"], flush=True)
    if nfl["status"] != "ok":
        raise SystemExit("NFL refresh did not complete cleanly; refusing to extract a partial set")

for team in TEAMS:
    resolved = _resolve_team_or_422(engine, "NFL", team)
    if resolved != team:
        raise SystemExit(f"team resolution drifted: {team!r} -> {resolved!r}")


def team_sample(team):
    raw_games = hm._team_history_via_index(engine, "NFL", team)
    other = next(t for t in TEAMS if t != team)
    body = hm.HistoricalMatchupRequest(sport="NFL", team_1=team, team_2=other,
                                       team_venue="all", sample_size=250)
    rows, *_ = hm._filter_team_games(engine, raw_games, sport="NFL", team=team, body=body,
                                     opponent_names=None, rest_map={}, apply_conditions=False)
    raw = {hm._game_key(g): g for g in raw_games}
    summary = hm._summarise(rows, engine, team, raw, total_available=len(rows))
    return raw_games, rows, summary


games = {}
engine_out = {"teams": {}, "matchups": {}}
conflicts = []
for team in TEAMS:
    raw_games, rows, summary = team_sample(team)
    engine_out["teams"][team] = {
        "summary": summary,
        "ids": sorted(r["game_id"] for r in rows),
        "franchise_names": [n for n in _franchise_chain(team, "NFL") if n],
    }
    for r in rows:
        home = r["venue"] == "Home"
        line = r["closing_line"] if r["closing_line_available"] else None
        rec = {
            "id": r["game_id"],
            "date": r["date"],
            "season_type": r["season_type"],
            "home": team if home else None,
            "away": None if home else team,
            "hs": r["team_score"] if home else r["opponent_score"],
            "as": r["opponent_score"] if home else r["team_score"],
            "home_line": (line if home else -line) if line is not None else None,
            "total": r["closing_total"] if r["closing_total_available"] else None,
            "home_ml": (r["moneyline"] if home else r["opponent_moneyline"]) if r["moneyline_available"] else None,
            "away_ml": (r["opponent_moneyline"] if home else r["moneyline"]) if r["moneyline_available"] else None,
            "venue": r["venue_name"],
            "_names": {("away" if home else "home"): r["opponent"]},
        }
        prev = games.get(rec["id"])
        if prev is None:
            games[rec["id"]] = rec
            continue
        for k in ("date", "hs", "as", "home_line", "total", "home_ml", "away_ml", "season_type", "venue"):
            if prev[k] != rec[k]:
                conflicts.append({"id": rec["id"], "field": k, "a": prev[k], "b": rec[k]})
        prev["home"] = prev["home"] or rec["home"]
        prev["away"] = prev["away"] or rec["away"]
        prev["_names"].update(rec["_names"])
    print("team", team, len(rows), summary["record"], flush=True)

if conflicts:
    raise SystemExit(f"{len(conflicts)} two-sided conflicts, first: {conflicts[:3]}")
half = [g["id"] for g in games.values() if not (g["home"] and g["away"])]
if half:
    raise SystemExit(f"{len(half)} games seen from one side only, first: {half[:3]}")

# The name each franchise played under in that game, as the dataset prints it
# (St. Louis Cardinals, Oakland Raiders ...). Current franchise stays in home/away.
for g in games.values():
    names = g.pop("_names")
    g["home_name"] = names.get("home", g["home"])
    g["away_name"] = names.get("away", g["away"])

for a, b in division_pairs():
    body = hm.HistoricalMatchupRequest(sport="NFL", team_1=a, team_2=b, team_venue="all",
                                       head_to_head_only=True, sample_size=hm.MAX_RETURNED_GAMES)
    p = hm._gather_historical_sync(engine, body)
    listed = [r["game_id"] for r in p["team_1_report"].get("games", [])]
    engine_out["matchups"][f"{a}|{b}"] = {
        "qualifying_games": p["matchup_summary"]["qualifying_games"],
        "matchup_summary": p["matchup_summary"],
        "qualifying_span": p["qualifying_span"],
        "request": body.model_dump(exclude={"idempotency_key"}),
        "ids": sorted(listed),
    }
    print("pair", a, b, p["matchup_summary"]["qualifying_games"], flush=True)

meta = {
    "sport": "NFL",
    "extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "games": len(games),
    "first_date": min(g["date"] for g in games.values()),
    "latest_date": max(g["date"] for g in games.values()),
    "engine_data_file": os.path.basename(os.environ.get("DATA_FILE_PATH", "")),
    # The engine's own statement of which seasons each market is verified for.
    # build_nfl.py publishes a market figure only from seasons inside it.
    "verified_ranges": {k: list(v) for k, v in get_verified_ranges()["NFL"].items()},
}
ordered = sorted(games.values(), key=lambda g: (g["date"], g["id"]))
with open(os.path.join(OUT, "nfl-games.json"), "w", encoding="utf-8", newline="\n") as fh:
    json.dump({"meta": meta, "games": ordered}, fh, separators=(",", ":"), sort_keys=True)
with open(os.path.join(OUT, "nfl-engine.json"), "w", encoding="utf-8", newline="\n") as fh:
    json.dump({"meta": meta, **engine_out}, fh, separators=(",", ":"), sort_keys=True, default=str)
print("wrote", len(games), "games, latest", meta["latest_date"])
