#!/usr/bin/env python3
"""NFL FEATURED GAME ROTATION: the real schedule picks the feature, game status
retires it. NFL_SCHEDULE_ROTATION_20260915.

Why this exists. On Tuesday 2026-09-15 the sportsbook banner still showed
Broncos at Chiefs, the Monday night game played the night before. The registry
(data/featured-matchups.json) could only feature a game somebody had registered
by hand, and nobody had registered Thursday's game, so the resolver fell back to
the latest article it knew: the finished one. Every Tuesday, Friday and Monday
would have needed a person.

The rule now, with no dates, teams or matchups written anywhere in code:

  SELECT THE NEXT MOST APPROPRIATE FEATURED NFL GAME FROM THE REAL SCHEDULE AND
  NEVER DISPLAY A FINISHED GAME AS THE CURRENT FEATURE.

  1. Read the schedule from ESPN (the current week and the next two, straight
     across the regular season into the playoffs): kickoff, status, teams,
     spread, records, venue.
  2. Drop what cannot be featured: finished, postponed, canceled or suspended
     games, preseason, the Pro Bowl, and a "scheduled" game whose kickoff is
     more than 12 hours gone (a feed that never updated).
  3. Group what is left by its calendar day in US Eastern time, the NFL's own
     clock. Each game day is one slot, so Thursday night, Sunday, Monday night,
     a December Saturday, Thanksgiving, Christmas and a playoff weekend all come
     from the schedule itself rather than from an assumed weekday.
  4. In each of the next three slots pick one game: a game with its own hand
     built feature page first (an editor chose it), then primetime (the
     national standalone window), then team quality and the closest spread.
     A game already queued for a slot keeps it while it is still upcoming or in
     progress, so a moving spread cannot flip the banner back and forth.
  5. Every pick becomes one registry entry with source "rotation". Label, teams,
     logos, date, week, kickoff and the article link are all written into that
     SAME entry from the SAME schedule event, so text from one game can never
     sit next to a link or logo from another.
  6. The article is the best one that exists for that exact game: a hand built
     /nfl/ page, then a Matchup of the Day Game File, then the automatic
     /handicapping/nfl/ breakdown the sport hub cron bakes for every fixture on
     the board (every one runs the simulator). Never a door, never another game.

The browser half (static/js/tmr-featured.js) resolves only these entries for the
NFL: the earliest one that is not final, postponed or canceled and not past its
safety cap. Game status is what retires a game; the cap (grace_minutes, six
hours for the NFL) only matters if this job ever stops running.

Runs on every prerender refresh (about every 30 minutes, scripts/prerender_run.py)
and on every sport hub bake. A feed failure changes nothing and fails nothing.

  python scripts/featured_matchups.py rotate          fetch, pick, write, bake
  python scripts/featured_matchups.py rotate --dry    print the plan only
"""

import datetime as dt
import gzip
import html
import io
import json
import os
import re
import urllib.request
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
PT = ZoneInfo("America/Los_Angeles")
SPORT = "nfl"
SOURCE = "rotation"
SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
LOGO = "https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/%s.png&h=96&w=96"
SAFETY_CAP_MINUTES = 360
SLOTS = 3
WEEKS_AHEAD = 3
STALE_PRE_HOURS = 12
LOG_KEEP = 40

ENDED = ("final", "postponed", "canceled")
NOT_FEATURABLE = ("final", "postponed", "canceled", "suspended")
POSTSEASON_ROUNDS = {1: "Wild Card Round", 2: "Divisional Round", 3: "Conference Championship", 5: "Super Bowl"}


# ------------------------------------------------------------------ schedule

def _get_json(url, timeout=20):
    # No custom User-Agent: site.api.espn.com answers 403 to browser and branded
    # agents alike, and accepts urllib's own.
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))


def fetch_events(now, get=_get_json):
    """Raw ESPN events for the week in progress and the next WEEKS_AHEAD - 1.

    ESPN refuses long date ranges, so this walks its own season calendar week
    by week, which also carries the regular season into the postseason."""
    base = get(SCOREBOARD)
    league = (base.get("leagues") or [{}])[0]
    year = (league.get("season") or base.get("season") or {}).get("year")
    weeks = []
    for season_type in league.get("calendar") or []:
        stype = str(season_type.get("value") or "")
        if stype not in ("2", "3"):
            continue
        for w in season_type.get("entries") or []:
            end = parse_utc(w.get("endDate"))
            if end is not None and end >= now - dt.timedelta(days=1):
                weeks.append((stype, w.get("value")))
    events, seen = [], set()
    for stype, week in weeks[:WEEKS_AHEAD]:
        data = get("%s?dates=%s&seasontype=%s&week=%s" % (SCOREBOARD, year, stype, week))
        for e in data.get("events") or []:
            if e.get("id") not in seen:
                seen.add(e.get("id"))
                events.append(e)
    if not weeks:
        # Offseason, or a calendar ESPN has not published yet: the default board.
        events = list(base.get("events") or [])
    return events


def parse_utc(value):
    if not value or not isinstance(value, str):
        return None
    try:
        t = dt.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return t.astimezone(dt.timezone.utc) if t.tzinfo else None


def _game_state(status_type):
    name = (status_type.get("name") or "").upper()
    if status_type.get("completed") or name in ("STATUS_FINAL", "STATUS_FINAL_OVERTIME"):
        return "final"
    if "POSTPONED" in name:
        return "postponed"
    if "CANCEL" in name:
        return "canceled"
    if "SUSPENDED" in name:
        return "suspended"
    if status_type.get("state") == "in" or name in ("STATUS_IN_PROGRESS", "STATUS_HALFTIME", "STATUS_END_PERIOD"):
        return "in_progress"
    if status_type.get("state") == "post":
        return "final"
    return "scheduled"


def _record(comp):
    for r in comp.get("records") or []:
        m = re.match(r"^(\d+)-(\d+)(?:-(\d+))?$", str(r.get("summary") or "").strip())
        if m:
            w, l, t = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
            return w, l, t
    return 0, 0, 0


def normalize(e):
    """One ESPN event -> the flat game this module works with, or None."""
    try:
        c = e["competitions"][0]
        sides = {x["homeAway"]: x for x in c["competitors"]}
        away, home = sides["away"], sides["home"]
    except (KeyError, IndexError, TypeError):
        return None
    kickoff = parse_utc(e.get("date"))
    if kickoff is None:
        return None
    season = e.get("season") or {}
    notes = " ".join(str(n.get("headline") or "") for n in c.get("notes") or [])

    def team(x):
        t = x.get("team") or {}
        return {"abbr": (t.get("abbreviation") or "").upper(), "name": t.get("name") or t.get("shortDisplayName") or "",
                "display": t.get("displayName") or "", "record": _record(x)}

    spread = None
    for o in c.get("odds") or []:
        d = str(o.get("details") or "").strip().upper()
        if d in ("EVEN", "PK", "PICK"):
            spread = 0.0
        m = re.search(r"(-?\d+(?:\.\d+)?)\s*$", d)
        if m:
            spread = abs(float(m.group(1)))
        if spread is not None:
            break
    addr = (c.get("venue") or {}).get("address") or {}
    return {
        "id": str(e.get("id")),
        "kickoff": kickoff,
        "time_valid": c.get("timeValid", True) is not False,
        "state": _game_state((e.get("status") or {}).get("type") or {}),
        "season_type": int(season.get("type") or 0),
        "week": int((e.get("week") or {}).get("number") or 0),
        "away": team(away), "home": team(home),
        "neutral": bool(c.get("neutralSite")),
        "country": addr.get("country") or "", "city": addr.get("city") or "",
        "notes": notes, "spread": spread,
    }


# ------------------------------------------------------------------ selection

def et(t):
    return t.astimezone(ET)


def featurable(g, now):
    if g["season_type"] not in (2, 3):
        return False
    if g["away"]["abbr"] in ("AFC", "NFC") or "PRO BOWL" in g["notes"].upper():
        return False
    if g["state"] in NOT_FEATURABLE:
        return False
    if g["state"] == "scheduled" and now - g["kickoff"] > dt.timedelta(hours=STALE_PRE_HOURS):
        return False
    return True


def primetime(g):
    return g["time_valid"] and et(g["kickoff"]).hour >= 19


def score(g, has_page):
    """Bigger is more worth featuring. Tier first (an editor's own feature page),
    then primetime, then how good the two teams are and how close the spread."""
    s = 0.0
    if primetime(g):
        s += 30
    played = []
    for side in ("away", "home"):
        w, l, t = g[side]["record"]
        n = w + l + t
        played.append((n, (w + 0.5 * t) / n if n else 0.5))
    games = min(n for n, _ in played)
    s += 40 * (sum(p for _, p in played) / 2) * min(1.0, games / 4.0)
    if g["spread"] is not None:
        s += max(0.0, 10 - g["spread"])
    return (1 if has_page else 0, s)


def plan(games, now, page_for=lambda g: None, sticky=(), withdrawn=(), slots=SLOTS):
    """The next `slots` featured games, one per Eastern game day, soonest first."""
    days = {}
    for g in sorted(games, key=lambda x: (x["kickoff"], x["id"])):
        if g["id"] in withdrawn or not featurable(g, now):
            continue
        days.setdefault(et(g["kickoff"]).date(), []).append(g)
    picks = []
    for day in sorted(days)[:slots]:
        ranked = sorted(days[day], key=lambda g: (score(g, bool(page_for(g))), g["kickoff"], g["id"]), reverse=True)
        best = ranked[0]
        held = next((g for g in days[day] if g["id"] in sticky), None)
        if held is not None and score(held, bool(page_for(held)))[0] >= score(best, bool(page_for(best)))[0]:
            best = held
        picks.append(best)
    return picks


# ------------------------------------------------------------------ presentation

def label(g):
    if g["season_type"] == 3:
        n = g["notes"]
        for key, name in (("SUPER BOWL", "Super Bowl"), ("CHAMPIONSHIP", None), ("DIVISIONAL", "Divisional Round"),
                          ("WILD CARD", "Wild Card Round")):
            if key in n.upper():
                if name is None:
                    conf = "AFC" if "AFC" in n.upper() else "NFC" if "NFC" in n.upper() else ""
                    return ("%s Championship" % conf).strip() if conf else "Conference Championship"
                return name
        return POSTSEASON_ROUNDS.get(g["week"], "NFL Playoffs")
    k = et(g["kickoff"])
    if g["time_valid"] and k.month == 11 and k.weekday() == 3 and 22 <= k.day <= 28:
        return "Thanksgiving Football"
    if g["time_valid"] and k.month == 12 and k.day == 25:
        return "Christmas Football"
    if primetime(g):
        return {0: "Monday Night Football", 3: "Thursday Night Football", 6: "Sunday Night Football"}.get(
            k.weekday(), "NFL Featured Matchup")
    return "NFL Featured Matchup"


def clock(t, zone_label):
    h = t.hour % 12 or 12
    return "%d:%02d%s %s" % (h, t.minute, "am" if t.hour < 12 else "pm", zone_label)


def when(g):
    k = et(g["kickoff"])
    parts = ["%s, %s %d" % (k.strftime("%A"), k.strftime("%B"), k.day)]
    parts.append(label(g) if g["season_type"] == 3 else "Week %d" % g["week"])
    parts.append(clock(k, "ET") if g["time_valid"] else "Time TBD")
    if g["country"] and g["country"].upper() not in ("USA", "US", "UNITED STATES"):
        parts.append(g["city"] or g["country"])
    return " · ".join(parts)


def matchup(g):
    return "%s %s %s" % (g["away"]["name"], "vs" if g["neutral"] else "at", g["home"]["name"])


def short(g):
    return "%s @ %s" % (g["away"]["abbr"], g["home"]["abbr"])


# ------------------------------------------------------------------ articles

def _abbrs(entry):
    return set(re.findall(r"/nfl/500/([a-z]+)\.png", (entry.get("away_logo") or "") + (entry.get("home_logo") or "")))


def _names_in(text, g):
    t = (text or "").lower()
    return g["away"]["name"].lower() in t and g["home"]["name"].lower() in t


def entry_is_game(entry, g, window_days=4):
    """A registry entry written for this exact game: same two clubs, kickoff
    within a few days (a rescheduled game keeps its page)."""
    k = parse_utc(entry.get("kickoff_utc"))
    if k is None or abs(k - g["kickoff"]) > dt.timedelta(days=window_days):
        return False
    if entry.get("event_id"):
        return str(entry["event_id"]) == g["id"]
    ab = _abbrs(entry)
    if ab:
        return ab == {g["away"]["abbr"].lower(), g["home"]["abbr"].lower()}
    return _names_in(" ".join(str(entry.get(x) or "") for x in ("matchup", "headline", "href")), g)


def _read(root, href, limit=None):
    path = os.path.join(root, href.strip("/").replace("/", os.sep), "index.html")
    if not os.path.exists(path):
        return None
    with io.open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read(limit) if limit else fh.read()


def research_page(root, g):
    """The automatic /handicapping/nfl/ breakdown for this fixture, from the
    sport hub builder's own URL store (keyed by full club names and UTC date)."""
    path = os.path.join(root, "handicapping", "_seo_hooks.json")
    try:
        with io.open(path, encoding="utf-8") as fh:
            store = json.load(fh)
    except (OSError, ValueError):
        return None
    for shift in (0, -1, 1):
        day = (g["kickoff"] + dt.timedelta(days=shift)).strftime("%Y-%m-%d")
        rec = store.get("NFL|%s|%s|%s" % (g["away"]["display"], g["home"]["display"], day)) or {}
        page = rec.get("page") or ("/handicapping/nfl/%s/" % rec["slug"] if rec.get("slug") else "")
        if page and _read(root, page, 1) is not None:
            return page
    return None


def article_for(reg, root, g):
    """(href, headline, cta, kind) of the best article for this game, or None."""
    features = reg["sports"][SPORT].get("features") or []
    for kind in ("page", "game-file"):
        for f in features:
            if f.get("source") != kind or (f.get("status") or "active") != "active" or not f.get("href"):
                continue
            if entry_is_game(f, g):
                cta = f.get("cta") or "Read the full breakdown"
                return f["href"], f.get("headline") or matchup(g), cta, kind
    page = research_page(root, g)
    if page:
        text = _read(root, page) or ""
        title = re.search(r"<title>([^<]*)</title>", text)
        headline = html.unescape(title.group(1)).split(" | ")[0].strip() if title else matchup(g)
        sims = re.search(r"([\d,]{3,})\s+simulations", text, re.I)
        cta = ("Full Breakdown, Odds & %s Simulations" % sims.group(1)) if sims else "Full Breakdown & Odds"
        return page, headline, cta, "research"
    return None


def has_feature_page(reg, g):
    return any(f.get("source") == "page" and (f.get("status") or "active") == "active" and entry_is_game(f, g)
               for f in reg["sports"][SPORT].get("features") or [])


def build_entry(reg, root, g, hub):
    art = article_for(reg, root, g)
    href, headline, cta, kind = art if art else (hub, matchup(g), "NFL Handicapping Hub", "none")
    return {
        "id": "nfl-event:%s" % g["id"],
        "source": SOURCE,
        "status": "active",
        "href": href,
        "headline": headline,
        "matchup": matchup(g),
        "when": when(g),
        "label": label(g),
        "cta": cta,
        "away_logo": LOGO % g["away"]["abbr"].lower(),
        "home_logo": LOGO % g["home"]["abbr"].lower(),
        "kickoff_utc": g["kickoff"].strftime("%Y-%m-%dT%H:%M:%SZ"),
        "event_id": g["id"],
        "away": g["away"]["abbr"],
        "home": g["home"]["abbr"],
        "game_state": g["state"],
        "article": kind,
    }


# ------------------------------------------------------------------ apply

def _fmt_kick(g):
    k = g["kickoff"]
    if not g["time_valid"]:
        return et(k).strftime("%a %b ") + str(et(k).day) + ", time TBD"
    e, p = et(k), k.astimezone(PT)
    return "%s %d, %s (%s)" % (e.strftime("%a %b"), e.day, clock(e, "ET").upper().replace("AM ", " AM ").replace("PM ", " PM "),
                               clock(p, "PT").upper().replace("AM ", " AM ").replace("PM ", " PM "))


def pacific_stamp(now):
    p = now.astimezone(PT)
    return "%s %d %d, %s" % (p.strftime("%a %b"), p.day, p.year,
                             clock(p, p.tzname()).upper().replace("AM ", " AM ").replace("PM ", " PM "))


def apply(reg, games, now, root, resolver):
    """Write the plan into the registry. Returns (changed, log lines or None)."""
    s = reg["sports"][SPORT]
    features = s.setdefault("features", [])
    by_id = {g["id"]: g for g in games}
    before = resolver(reg, SPORT, now)
    before_snapshot = json.dumps(s, sort_keys=True)

    s["selection"] = "schedule"
    s["grace_minutes"] = SAFETY_CAP_MINUTES

    rotation = [f for f in features if f.get("source") == SOURCE]
    withdrawn = {str(f.get("event_id")) for f in rotation if (f.get("status") or "active") != "active"}
    sticky = {str(f.get("event_id")) for f in rotation
              if (f.get("status") or "active") == "active" and f.get("game_state") not in ENDED}
    picks = plan(games, now, page_for=lambda g: has_feature_page(reg, g), sticky=sticky, withdrawn=withdrawn)
    pick_ids = {g["id"] for g in picks}
    hub = s.get("hub") or "/handicapping/nfl/"

    # Status of every rotation entry the schedule still carries.
    for f in rotation:
        g = by_id.get(str(f.get("event_id")))
        if g is None:
            continue
        if f.get("game_state") != g["state"]:
            f["game_state"] = g["state"]
        k = g["kickoff"].strftime("%Y-%m-%dT%H:%M:%SZ")
        if f.get("kickoff_utc") != k and g["state"] not in ENDED:
            f["kickoff_utc"] = k

    # A queued pick that lost its slot before it was ever played goes away.
    features[:] = [f for f in features if not (
        f.get("source") == SOURCE and (f.get("status") or "active") == "active"
        and str(f.get("event_id")) not in pick_ids
        and f.get("game_state") in ("scheduled", "postponed", "canceled", "suspended")
        and (parse_utc(f.get("kickoff_utc")) or now) > now - dt.timedelta(hours=STALE_PRE_HOURS)
        and str(f.get("event_id")) in by_id)]

    for g in picks:
        entry = build_entry(reg, root, g, hub)
        current = next((f for f in features if f.get("id") == entry["id"]), None)
        if current is None:
            features.append(entry)
        else:
            for key, value in entry.items():
                if key != "status" and current.get(key) != value:
                    current[key] = value

    after = resolver(reg, SPORT, now)
    lines = None
    if (before or {}).get("href") != (after or {}).get("href") or (before or {}).get("id") != (after or {}).get("id"):
        prev_game = None
        if before:
            prev_game = by_id.get(str(before.get("event_id"))) or next(
                (g for g in games if entry_is_game(before, g, window_days=1)), None)
        prev_state = (prev_game or {}).get("state") or (before or {}).get("game_state") or ""
        prev_text = ("%s, %s" % (short(prev_game), prev_state.replace("_", " ").upper()) if prev_game
                     else (before or {}).get("matchup") or "none")
        next_game = by_id.get(str((after or {}).get("event_id")))
        next_text = "%s, %s" % (short(next_game), _fmt_kick(next_game)) if next_game else (after or {}).get("matchup") or "none"
        if not before:
            reason = "No featured game was active"
        elif prev_state in ("final",):
            reason = "Previous featured game completed"
        elif prev_state in ("postponed", "canceled", "suspended"):
            reason = "Previous featured game %s" % prev_state
        elif before.get("source") != SOURCE:
            reason = "Schedule rotation took over from a hand registered feature"
        else:
            reason = "Schedule changed or a higher priority matchup was designated"
        lines = ["Featured NFL rotation:", "Previous: %s" % prev_text, "Next: %s" % next_text,
                 "Article: %s" % ((after or {}).get("href") or "none"), "Reason: %s" % reason,
                 "Updated: %s" % pacific_stamp(now)]
        log = s.setdefault("rotation_log", [])
        log.append({"updated_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "previous": prev_text, "next": next_text,
                    "article": (after or {}).get("href"), "reason": reason, "updated_pacific": pacific_stamp(now)})
        del log[:-LOG_KEEP]
    changed = json.dumps(s, sort_keys=True) != before_snapshot
    return changed, lines, picks


def describe(picks, reg, root):
    out = []
    for i, g in enumerate(picks):
        art = article_for(reg, root, g)
        out.append("  slot %d: %s  %s  [%s]  %s  -> %s" % (
            i + 1, short(g), _fmt_kick(g), g["state"], label(g), art[0] if art else "NO ARTICLE (hub)"))
    return "\n".join(out)
