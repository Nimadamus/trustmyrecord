"""BetLegend Pro SEO pages: prove the extracted set IS the live tool's set.

Read only. For every matchup page it asks the LIVE engine's free preview
endpoint (POST /api/matchup/preview: counts only, never billed, never logged
to anyone's research history) the exact request the extractor ran, and
compares the qualifying count and the first and last meeting dates. It also
compares the NFL dataset size against the live public dataset stats.

    BETLEGEND_PRO_SERVICE_KEY=... python scripts/blp_seo/prod_parity.py <data-dir>

Writes <data-dir>/prod-parity.json. build_nfl.py refuses to build without
a parity file that matches every page.
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

DATA = sys.argv[1]
BASE = os.environ.get("BETLEGEND_PRO_API_BASE", "https://betlegend-pro-api.onrender.com")
KEY = os.environ["BETLEGEND_PRO_SERVICE_KEY"]
STATS = "https://trustmyrecord-api.onrender.com/api/betlegend-pro/dataset-stats"


def post(path, body):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "X-TMR-Service-Key": KEY, "X-TMR-User-Id": "1"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


engine = json.load(open(os.path.join(DATA, "nfl-engine.json"), encoding="utf-8"))
games_meta = json.load(open(os.path.join(DATA, "nfl-games.json"), encoding="utf-8"))["meta"]

with urllib.request.urlopen(STATS, timeout=60) as r:
    live_stats = json.load(r)
live_nfl = live_stats["by_sport_games"]["NFL"]

pairs = []
for key, m in engine["matchups"].items():
    live = post("/api/matchup/preview", m["request"])
    local = [m["qualifying_games"], m["qualifying_span"]["first_game"], m["qualifying_span"]["last_game"]]
    prod = [live["qualifying_games"], live["first_game"], live["last_game"]]
    pairs.append({"pair": key, "local": local, "live": prod, "match": local == prod})
    time.sleep(1.0)  # one small scan at a time on a 512Mi instance

out = {
    "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "extracted_at": games_meta["extracted_at"],
    "dataset": {"local_nfl_games": games_meta["games"], "live_nfl_games": live_nfl,
                "match": games_meta["games"] == live_nfl},
    "pairs": pairs,
    "all_match": all(p["match"] for p in pairs) and games_meta["games"] == live_nfl,
}
json.dump(out, open(os.path.join(DATA, "prod-parity.json"), "w", encoding="utf-8"), indent=1)
print("dataset", out["dataset"], "pairs", sum(p["match"] for p in pairs), "/", len(pairs))
for p in pairs:
    if not p["match"]:
        print("MISMATCH", p)
sys.exit(0 if out["all_match"] else 1)
