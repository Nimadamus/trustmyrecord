#!/usr/bin/env python3
"""Everything the redesigned handicapping pages need that the old builder never
asked for: club colours, venue, broadcast, real player photography, current
season team and player rates, and TrustMyRecord's own simulation of the game.

HANDICAP_REDESIGN_20260909.

WHERE EACH THING COMES FROM, AND WHY THAT SOURCE
  club colour, mark   ESPN site API team record. It is the club's OWN primary
                      and secondary, so a page is branded by the league's data
                      rather than by a colour somebody typed in.
  venue, broadcast    ESPN scoreboard for the kickoff date. The odds board
                      carries neither, which is why the old page could not say
                      where the game was or who was showing it.
  headshots           ESPN roster, which publishes a headshot href per athlete.
                      Football has no licensable still-photo feed, and this is
                      the league's own image, used the same way the site
                      already hotlinks the league's team marks.
  team rates          ESPN season statistics. The CURRENT season is asked for
                      first; if it has zero games played, which is the whole of
                      the preseason and week one, the page falls back to the
                      season just finished AND SAYS SO. It never prints a
                      last-year number as if it were this year's.
  player rates        ESPN athlete season statistics, same fallback rule.
  the model           TrustMyRecord's own NFL simulator, /api/nfl/public. It is
                      the same engine, the same rosters and the same 10,000
                      runs the visitor gets on /nfl-simulator/, so the model
                      block on a matchup page and the simulator agree by
                      construction rather than by coincidence.

NOTHING HERE IS INVENTED. Every function returns None or an empty dict when its
feed does not answer, and every caller renders nothing at all in that case
rather than filling the hole with an estimate. A failed enrichment call must
never fail a build: the page degrades to the data it does have.
"""

import base64
import hashlib
import json
import os
import re
import time
import unicodedata
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

# Cache lives OUTSIDE the published tree on purpose: it is scratch, it is large,
# and it must never be committed or crawled.
CACHE = os.environ.get(
    "TMR_HX_CACHE", os.path.join(os.path.dirname(REPO), "work", "handicap-cache"))
CACHE_TTL = int(os.environ.get("TMR_HX_CACHE_TTL", "10800"))  # 3h
# NO User-Agent override. Measured against ESPN's public API on 2026-09-09:
#   no header (python-urllib default)  200
#   curl/8.4.0                         200
#   TrustMyRecord-handicapping/1.0     403
#   a full Chrome UA string             403
# Their edge rejects both a named crawler agent and a browser agent that arrives
# without a browser's other headers, and answers a plain client. The first cut
# of this file sent a polite named agent, every enrichment call 403'd, and the
# page rendered with no colours, no photography and no venue - silently, because
# enrichment failures are caught. Leave this empty.
UA = {}

TMR_API = os.environ.get("TMR_API", "https://trustmyrecord-api.onrender.com/api")

# ESPN's own path segments per sport. A sport that is not in here simply gets no
# enrichment, which is what keeps tennis and soccer from crashing the builder.
ESPN_PATH = {
    "nfl": "football/nfl",
    "nba": "basketball/nba",
    "nhl": "hockey/nhl",
    "mlb": "baseball/mlb",
    "ncaaf": "football/college-football",
    "ncaab": "basketball/mens-college-basketball",
}
SITE_API = "https://site.api.espn.com/apis/site/v2/sports/%s"
CORE_API = "https://sports.core.api.espn.com/v2/sports/%s/leagues/%s"
CORE_LEAGUE = {
    "nfl": ("football", "nfl"),
    "nba": ("basketball", "nba"),
    "nhl": ("hockey", "nhl"),
    "mlb": ("baseball", "mlb"),
    "ncaaf": ("football", "college-football"),
}


# ---------------------------------------------------------------- transport

def _cache_path(url):
    return os.path.join(CACHE, hashlib.sha1(url.encode("utf-8")).hexdigest() + ".json")


def get(url, ttl=None, quiet=True):
    """A cached GET that returns None instead of raising.

    Cached because a 16 game slate would otherwise hit the same roster and the
    same team statistics endpoint a dozen times in one build, and because a
    rebuild minutes later should not re-pull a feed that changes daily."""
    ttl = CACHE_TTL if ttl is None else ttl
    path = _cache_path(url)
    try:
        if ttl > 0 and os.path.exists(path) and (time.time() - os.path.getmtime(path)) < ttl:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
    except (OSError, ValueError):
        pass
    for _ in range(2):
        try:
            req = urllib.request.Request(url)
            for k, v in UA.items():
                req.add_header(k, v)
            req.add_header("Accept", "application/json")
            with urllib.request.urlopen(req, timeout=45) as r:
                data = json.loads(r.read().decode("utf-8"))
            try:
                os.makedirs(CACHE, exist_ok=True)
                with open(path, "w", encoding="utf-8") as fh:
                    json.dump(data, fh)
            except OSError:
                pass
            return data
        except Exception as exc:  # noqa: BLE001 - enrichment is best effort
            last = exc
    if not quiet:
        print("  WARN  enrichment fetch failed: %s (%s)" % (url, last))
    return None


def norm_name(v):
    """Match a person across two feeds that spell them differently.

    TMR's depth chart says "Marcus Jones Jr.", ESPN's roster says "Marcus Jones
    Jr". Punctuation, accents, case and the generational suffix all have to come
    off before the two can be compared."""
    v = unicodedata.normalize("NFKD", str(v or ""))
    v = "".join(c for c in v if not unicodedata.combining(c))
    v = re.sub(r"[^a-z ]", "", v.lower())
    v = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", v)
    return re.sub(r"\s+", " ", v).strip()


# ---------------------------------------------------------------- ESPN clubs

def scoreboard(sport, dates):
    """Every event ESPN is carrying across `dates` (YYYYMMDD-YYYYMMDD)."""
    path = ESPN_PATH.get(sport)
    if not path:
        return {}
    d = get((SITE_API % path) + "/scoreboard?limit=200&dates=" + dates, ttl=3600)
    out = {}
    for e in (d or {}).get("events") or []:
        comps = e.get("competitions") or []
        if not comps:
            continue
        c = comps[0]
        entry = {"venue": None, "city": None, "indoor": None, "network": None,
                 "date": e.get("date"), "teams": {}}
        v = c.get("venue") or {}
        entry["venue"] = v.get("fullName")
        addr = v.get("address") or {}
        entry["city"] = ", ".join([x for x in (addr.get("city"), addr.get("state")) if x]) or None
        entry["indoor"] = v.get("indoor")
        nets = []
        for b in c.get("broadcasts") or []:
            nets += [n for n in (b.get("names") or []) if n]
        entry["network"] = "/".join(dict.fromkeys(nets)) or None
        for comp in c.get("competitors") or []:
            t = comp.get("team") or {}
            rec = None
            for r in comp.get("records") or []:
                if (r.get("type") or r.get("name", "").lower()) in ("total", "overall"):
                    rec = r.get("summary")
                    break
            entry["teams"][norm_name(t.get("displayName"))] = {
                "espn_id": t.get("id"),
                "abbr": t.get("abbreviation"),
                "name": t.get("displayName"),
                "short": t.get("shortDisplayName"),
                "nickname": t.get("name"),
                "location": t.get("location"),
                "color": _hex(t.get("color")),
                "alt": _hex(t.get("alternateColor")),
                "logo": t.get("logo"),
                "record": rec,
                "home": comp.get("homeAway") == "home",
            }
        out[e.get("id")] = entry
        # keyed by both sides' names too, since the odds board and ESPN do not
        # share an event id and the pair is what the builder actually has.
        key = tuple(sorted(entry["teams"].keys()))
        out[key] = entry
    return out


def dedash(v):
    """Take dashes out of prose that arrives from a feed.

    Standing house rule: no dashes in anything TrustMyRecord publishes. The
    engine and the league feeds both write them, so the page cleans the sentence
    on the way in rather than shipping somebody else's punctuation."""
    if v is None:
        return None
    v = str(v)
    for a, b in ((" — ", ", "), (" – ", ", "), ("—", ", "), ("–", ", "),
                 (" - ", ", ")):
        v = v.replace(a, b)
    return v


def contrast_pair(a_primary, a_alt, h_primary, h_alt):
    """Two club colours that can actually be told apart on one page.

    New England and Seattle both list #002a5c as their primary, so a page keyed
    on primaries alone renders one colour twice and every comparison bar becomes
    unreadable. When the two are close, the away club falls back to its own
    alternate mark before anything generic is considered."""
    def dist(x, y):
        if not x or not y:
            return 999
        xr, xg, xb = int(x[1:3], 16), int(x[3:5], 16), int(x[5:7], 16)
        yr, yg, yb = int(y[1:3], 16), int(y[3:5], 16), int(y[5:7], 16)
        return abs(xr - yr) + abs(xg - yg) + abs(xb - yb)

    a, h = a_primary, h_primary
    if dist(a, h) < 90:
        if a_alt and dist(a_alt, h) >= 90:
            a = a_alt
        elif h_alt and dist(a, h_alt) >= 90:
            h = h_alt
    return a, h


def _hex(v):
    v = (v or "").strip().lstrip("#")
    if not re.fullmatch(r"[0-9a-fA-F]{6}", v or ""):
        return None
    # A club whose primary is effectively black or white cannot carry a page.
    r, g, b = int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if lum < 12 or lum > 240:
        return None
    return "#" + v.lower()


def lift(hexv, floor=86):
    """Raise a club colour until an 8px bar of it is visible on the dark ramp.

    Seattle and New England both list #002a5c, which scores 36 against a #0C2138
    panel: the first render of the comparison bars looked like one club led every
    category, because the other club's bar was the same colour as the track.
    Rejecting a dark mark outright throws the club's identity away, so it is
    mixed toward white instead - still navy, still theirs, now legible. Every
    accent on these pages is drawn on a dark surface, so this applies to all of
    them."""
    if not hexv:
        return hexv
    r, g, b = int(hexv[1:3], 16), int(hexv[3:5], 16), int(hexv[5:7], 16)
    for _ in range(14):
        if 0.2126 * r + 0.7152 * g + 0.0722 * b >= floor:
            break
        r = min(255, int(r + (255 - r) * 0.16) + 6)
        g = min(255, int(g + (255 - g) * 0.16) + 6)
        b = min(255, int(b + (255 - b) * 0.16) + 6)
    return "#%02x%02x%02x" % (r, g, b)


# ---------------------------------------------------------------- ESPN stats

def team_stats(sport, espn_id, season):
    """A club's per-game rates for the current season, or the last completed one.

    Returns (stats, season_used, is_previous). The caller MUST print the season
    it was handed: in week one every one of these numbers is last year's, and a
    page that does not say so is publishing a stale season as if it were live."""
    league = CORE_LEAGUE.get(sport)
    if not league or not espn_id:
        return {}, None, False
    base = CORE_API % league
    for yr, prev in ((season, False), (season - 1, True)):
        d = get("%s/seasons/%d/types/2/teams/%s/statistics" % (base, yr, espn_id), ttl=21600)
        cats = ((d or {}).get("splits") or {}).get("categories") or []
        flat = {}
        for c in cats:
            for s in c.get("stats") or []:
                flat["%s.%s" % (c.get("name"), s.get("name"))] = s
        gp = flat.get("general.gamesPlayed") or {}
        if cats and float(gp.get("value") or 0) > 0:
            flat.update(_record_stats(base, yr, espn_id))
            return flat, yr, prev
    return {}, None, False


def _record_stats(base, season, espn_id):
    """Points for, points against and differential.

    The statistics endpoint carries only what a club DID, never what was done to
    it, so on its own it cannot answer the first question a handicapper asks. The
    record endpoint carries both sides, which is what makes an offence versus
    defence row possible at all."""
    d = get("%s/seasons/%d/types/2/teams/%s/record" % (base, season, espn_id), ttl=21600)
    out = {}
    for item in (d or {}).get("items") or []:
        if (item.get("name") or "").lower() not in ("overall", "total"):
            continue
        for st in item.get("stats") or []:
            out["record.%s" % st.get("name")] = st
        if item.get("summary"):
            out["record.summary"] = {"displayValue": item["summary"], "value": None}
        break
    return out


def athlete_stats(sport, athlete_id, season):
    league = CORE_LEAGUE.get(sport)
    if not league or not athlete_id:
        return {}, None, False
    base = CORE_API % league
    for yr, prev in ((season, False), (season - 1, True)):
        d = get("%s/seasons/%d/types/2/athletes/%s/statistics" % (base, yr, athlete_id), ttl=21600)
        cats = ((d or {}).get("splits") or {}).get("categories") or []
        flat = {}
        for c in cats:
            for s in c.get("stats") or []:
                flat["%s.%s" % (c.get("name"), s.get("name"))] = s
        gp = flat.get("general.gamesPlayed") or {}
        if cats and float(gp.get("value") or 0) > 0:
            return flat, yr, prev
    return {}, None, False


def stat(flat, key, default=None):
    s = (flat or {}).get(key) or {}
    return s.get("displayValue", default)


def statf(flat, key):
    s = (flat or {}).get(key) or {}
    try:
        return float(s.get("value"))
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- ESPN people

def roster(sport, espn_id):
    """{normalised name: athlete} for one club, carrying the league's headshot."""
    path = ESPN_PATH.get(sport)
    if not path or not espn_id:
        return {}
    d = get((SITE_API % path) + "/teams/%s/roster" % espn_id, ttl=21600)
    out = {}
    groups = (d or {}).get("athletes") or []
    items = []
    for g in groups:
        if isinstance(g, dict) and g.get("items") is not None:
            items += g.get("items") or []
        elif isinstance(g, dict):
            items.append(g)
    for a in items:
        name = a.get("fullName") or a.get("displayName")
        if not name:
            continue
        pos = (a.get("position") or {})
        out[norm_name(name)] = {
            "id": a.get("id"),
            "name": name,
            "short": a.get("shortName"),
            "pos": pos.get("abbreviation") or pos.get("name"),
            "jersey": a.get("jersey"),
            "headshot": ((a.get("headshot") or {}).get("href")),
            "height": a.get("displayHeight"),
            "weight": a.get("displayWeight"),
            "age": a.get("age"),
            "college": ((a.get("college") or {}).get("name")
                        if isinstance(a.get("college"), dict) else a.get("college")),
            "experience": ((a.get("experience") or {}).get("years")
                           if isinstance(a.get("experience"), dict) else None),
        }
    return out


def initials(name):
    parts = [p for p in re.split(r"\s+", str(name or "").strip()) if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


# ---------------------------------------------------------------- TMR model

SIM_API = TMR_API + "/nfl/public"


def sim_ref(event_id):
    """The simulator addresses a game by the base64 of the board's own event id.

    Derived rather than looked up, so a matchup page never has to pull the whole
    weekly schedule to find the reference for the one game it is about."""
    raw = str(event_id or "")
    if not raw:
        return None
    return base64.b64encode(raw.encode("ascii")).decode("ascii").rstrip("=")


def simulate(event_id, sims=10000, seed=None, window=None):
    """TrustMyRecord's own projection for this game, or None.

    A page is baked once and read for a week, so the run is SEEDED off the event
    id: the projection printed on the page is reproducible, and a rebuild does
    not silently move the projected score by a point because the sampler drew
    differently. Anyone can re-run it live on /nfl-simulator/."""
    ref = sim_ref(event_id)
    if not ref:
        return None
    if seed is None:
        seed = int(hashlib.sha1(str(event_id).encode()).hexdigest()[:8], 16)
    q = "sims=%d&seed=%d" % (sims, seed)
    if window:
        q += "&window=%s" % window
    return get("%s/simulate/%s?%s" % (SIM_API, ref, q), ttl=21600)


# ---------------------------------------------------------------- derived

def implied(price):
    """American price to implied probability. Arithmetic, not a model."""
    try:
        p = float(price)
    except (TypeError, ValueError):
        return None
    if p == 0:
        return None
    return (-p) / ((-p) + 100.0) if p < 0 else 100.0 / (p + 100.0)


def novig(a, b):
    """Two implied probabilities with the book's margin taken out of both."""
    if a is None or b is None:
        return None, None
    s = a + b
    if s <= 0:
        return None, None
    return a / s, b / s


def pct(v, digits=0):
    if v is None:
        return None
    return ("%." + str(digits) + "f%%") % (v * 100.0)
