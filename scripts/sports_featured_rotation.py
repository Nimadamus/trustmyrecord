#!/usr/bin/env python3
"""Schedule rotation for every featured sport except the NFL.

The NFL already rotates in nfl_featured_rotation.py. MLB, college football,
soccer and tennis were still a list of Matchup of the Day articles, so once
the writer stopped the Featured Matchups menu kept opening a finished game.

This module reads the real schedule, retires a game when the feed says it is
over, and queues the next one. Each featured game gets one permanent URL,
minted once from a measured angle. The same two clubs meeting again get a
different angle and a different URL. A published URL is never renamed, never
given a date, a week stamp, a sequence suffix or an event id.

A sport added later rotates with no new code when its registry entry carries
a "feed" object: {"kind": "days"|"weeks", "boards": [["Label", "https://..."]],
"days": 6}. Kind "weeks" walks an ESPN calendar the way the NFL does.
"""

import datetime as dt
import html
import json
import os
import re
import unicodedata

import nfl_featured_rotation as nfl

SOURCE = "rotation"
URL_STORE = "data/featured-urls.json"
SITEMAP = "sitemap.xml"
SITEMAP_BEGIN = "<!-- BEGIN_FEATURED_ANGLE_URLS -->"
SITEMAP_END = "<!-- END_FEATURED_ANGLE_URLS -->"
SITE = "https://trustmyrecord.com"
SLOTS = 3
DAY_SPAN = 6
RESERVED = {"mlb", "nfl", "ncaaf", "nba", "nhl", "tennis", "soccer", "today", "index"}
FILLER = {"fc", "cf", "sc", "afc", "ac", "the"}
US = {"USA", "US", "UNITED STATES"}
DATE_IN_TITLE = re.compile(
    r"\b(week\s+\d+|january|february|march|april|may|june|july|august|"
    r"september|october|november|december|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2})\b",
    re.I)
MARK = "FEATURED_ANGLE_PAGE"

MLB = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard"
NCAAF = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
SOCCER = "https://site.api.espn.com/apis/site/v2/sports/soccer/%s/scoreboard"
TENNIS = "https://site.api.espn.com/apis/site/v2/sports/tennis/%s/scoreboard"

# Boards already on the Featured Matchups menu. A later sport is one "feed"
# object on its registry entry, not a change here.
CATALOG = {
    "mlb": {"kind": "days", "days": DAY_SPAN, "boards": [["MLB", MLB]],
            "simulator": "/mlb-simulator/"},
    "ncaaf": {"kind": "weeks", "boards": [["College Football", NCAAF]],
              "simulator": None},
    "soccer": {"kind": "days", "days": DAY_SPAN, "boards": [
        ["Premier League", SOCCER % "eng.1"],
        ["LaLiga", SOCCER % "esp.1"],
        ["Bundesliga", SOCCER % "ger.1"],
        ["Serie A", SOCCER % "ita.1"],
        ["Ligue 1", SOCCER % "fra.1"],
        ["Champions League", SOCCER % "uefa.champions"],
        ["MLS", SOCCER % "usa.1"],
    ], "simulator": None},
    "tennis": {"kind": "days", "days": DAY_SPAN, "boards": [
        ["ATP", TENNIS % "atp"],
        ["WTA", TENNIS % "wta"],
    ], "simulator": None},
}


def catalog_for(reg):
    """Feeds for sports the registry actually features. NFL stays on its own."""
    out = {}
    sports = (reg or {}).get("sports") or {}
    for sport, cfg in CATALOG.items():
        if sport in sports:
            out[sport] = cfg
    for sport, spec in sports.items():
        if sport == "nfl" or sport in out:
            continue
        feed = spec.get("feed") if isinstance(spec, dict) else None
        if isinstance(feed, dict) and feed.get("boards") and feed.get("kind") in ("days", "weeks"):
            out[sport] = feed
    return out


# ---------------------------------------------------------------- schedule

def _flatten(data, league):
    """ESPN events, plus tennis matches that live under tournament groupings."""
    out = []
    for event in data.get("events") or []:
        groups = event.get("groupings") or []
        if groups and not event.get("competitions"):
            for group in groups:
                for comp in group.get("competitions") or []:
                    synth = {
                        "id": comp.get("id") or event.get("id"),
                        "date": comp.get("date") or comp.get("startDate") or event.get("date"),
                        "status": comp.get("status") or event.get("status"),
                        "season": event.get("season") or {},
                        "competitions": [comp],
                        "league": league,
                        "round": comp.get("round"),
                        "notes": event.get("name") or "",
                    }
                    out.append(synth)
            continue
        event = dict(event)
        event["league"] = league
        out.append(event)
    return out


def _fetch_days(boards, now, days, get):
    start = nfl.et(now).date() - dt.timedelta(days=1)
    events, seen = [], set()
    for i in range(days):
        stamp = (start + dt.timedelta(days=i)).strftime("%Y%m%d")
        for league, url in boards:
            try:
                data = get("%s?dates=%s" % (url, stamp))
            except Exception:
                try:
                    data = get(url)
                except Exception:
                    continue
            for event in _flatten(data, league):
                key = str(event.get("id"))
                if key and key not in seen:
                    seen.add(key)
                    events.append(event)
    return events


def _fetch_weeks(boards, now, get):
    events, seen = [], set()
    for league, url in boards:
        try:
            base = get(url)
        except Exception:
            continue
        league_meta = (base.get("leagues") or [{}])[0]
        year = (league_meta.get("season") or base.get("season") or {}).get("year")
        weeks = []
        for season_type in league_meta.get("calendar") or []:
            stype = str(season_type.get("value") or "")
            if stype not in ("2", "3"):
                continue
            for week in season_type.get("entries") or []:
                end = nfl.parse_utc(week.get("endDate"))
                if end is not None and end >= now - dt.timedelta(days=1):
                    weeks.append((stype, week.get("value")))
        picked = []
        for stype, week in weeks[:nfl.WEEKS_AHEAD]:
            try:
                data = get("%s?dates=%s&seasontype=%s&week=%s" % (url, year, stype, week))
            except Exception:
                continue
            picked.extend(_flatten(data, league))
        if not picked:
            picked = _flatten(base, league)
        for event in picked:
            key = str(event.get("id"))
            if key and key not in seen:
                seen.add(key)
                events.append(event)
    return events


def fetch_events(sport, cfg, now, get=None):
    get = get or nfl._get_json
    boards = cfg.get("boards") or []
    if cfg.get("kind") == "weeks":
        return _fetch_weeks(boards, now, get)
    return _fetch_days(boards, now, int(cfg.get("days") or DAY_SPAN), get)


def _record(comp, name=None):
    for rec in comp.get("records") or []:
        if name and (rec.get("type") or rec.get("name") or "").lower() != name:
            continue
        match = re.match(r"^(\d+)-(\d+)(?:-(\d+))?$", str(rec.get("summary") or "").strip())
        if match:
            return int(match.group(1)), int(match.group(2)), int(match.group(3) or 0)
    return None


def _spread(comp):
    for odds in comp.get("odds") or []:
        if not isinstance(odds, dict):
            continue
        favored = None
        home = odds.get("homeTeamOdds") or {}
        if home.get("favorite") is True:
            favored = "home"
        elif home.get("favorite") is False:
            favored = "away"
        raw = odds.get("spread")
        if raw is not None:
            try:
                return abs(float(raw)), favored
            except (TypeError, ValueError):
                pass
        details = str(odds.get("details") or "").strip().upper()
        if details in ("EVEN", "PK", "PICK"):
            return 0.0, favored
        # "ATL +125" is a moneyline. A spread is a small number, often with a
        # half point. Three digits and up are a price, not a line.
        if re.search(r"[A-Z]{2,}\s+[+-]\d{3,}(?:\.\d+)?$", details):
            continue
        match = re.search(r"(-?\d+(?:\.\d+)?)\s*$", details)
        if match and abs(float(match.group(1))) < 60:
            return abs(float(match.group(1))), favored
    return None, None


def _round_name(comp, event):
    raw = comp.get("round") if isinstance(comp, dict) else None
    raw = raw if raw is not None else event.get("round")
    if isinstance(raw, dict):
        return str(raw.get("displayName") or raw.get("name") or "")
    return str(raw or "")


def _logo(side):
    athlete = side.get("athlete") or {}
    flag = athlete.get("flag") or {}
    if isinstance(flag, dict) and flag.get("href"):
        return flag["href"]
    team = side.get("team") or {}
    if team.get("logo"):
        return team["logo"]
    logos = team.get("logos") or []
    if logos and isinstance(logos[0], dict):
        return logos[0].get("href") or ""
    return ""


def _side(side):
    athlete = side.get("athlete") or {}
    team = side.get("team") or {}
    display = athlete.get("displayName") or team.get("displayName") or team.get("name") or ""
    short = athlete.get("shortName") or team.get("shortDisplayName") or team.get("name") or display
    abbr = (team.get("abbreviation") or "") 
    return {
        "abbr": abbr.upper(),
        "name": short,
        "display": display,
        "record": _record(side, "total") or _record(side) or (0, 0, 0),
        "home_record": _record(side, "home"),
        "road_record": _record(side, "road"),
        "logo": _logo(side),
    }


def normalize(event, sport):
    """One ESPN event or tennis match, or None when it is not a real fixture."""
    try:
        comp = event["competitions"][0]
        sides = {x.get("homeAway"): x for x in comp.get("competitors") or []}
        away, home = sides.get("away"), sides.get("home")
        if away is None or home is None:
            comps = comp.get("competitors") or []
            if len(comps) < 2:
                return None
            away, home = comps[0], comps[1]
    except (KeyError, IndexError, TypeError):
        return None
    kickoff = nfl.parse_utc(event.get("date") or comp.get("date"))
    if kickoff is None:
        return None
    state = nfl._game_state((event.get("status") or comp.get("status") or {}).get("type") or {})
    status_name = str(((event.get("status") or comp.get("status") or {}).get("type") or {}).get("name") or "").upper()
    if "FULL_TIME" in status_name or status_name in ("STATUS_FINAL_PEN", "STATUS_FINAL_AET", "STATUS_ABANDONED"):
        state = "final" if "ABANDONED" not in status_name else "canceled"
    spread, favored = _spread(comp)
    addr = (comp.get("venue") or event.get("venue") or {}).get("address") or {}
    if not addr and isinstance(event.get("venue"), dict):
        addr = event["venue"].get("address") or {}
    away_s, home_s = _side(away), _side(home)
    if not away_s["display"] or not home_s["display"]:
        return None
    if any(side["display"].strip().upper() in ("TBD", "TBA", "UNKNOWN") or side["display"].strip().upper().startswith("TBD")
           for side in (away_s, home_s)):
        return None
    ident = str(event.get("id") or "")
    league = event.get("league") or ""
    if league:
        ident = "%s:%s" % (league, ident)
    return {
        "id": ident,
        "sport": sport,
        "kickoff": kickoff,
        "time_valid": comp.get("timeValid", True) is not False,
        "state": state,
        "season_type": 2,
        "week": 0,
        "away": away_s,
        "home": home_s,
        "neutral": bool(comp.get("neutralSite")) or sport == "tennis",
        "country": addr.get("country") or "",
        "city": addr.get("city") or "",
        "notes": str(event.get("notes") or ""),
        "spread": spread,
        "favored": favored,
        "league": league,
        "round": _round_name(comp, event),
        "starters": {"away": _starter(away), "home": _starter(home)},
        "passers": {"away": _passer(away), "home": _passer(home)},
    }


def featurable(game, now):
    if game["state"] in nfl.NOT_FEATURABLE:
        return False
    if game["state"] == "scheduled" and now - game["kickoff"] > dt.timedelta(hours=nfl.STALE_PRE_HOURS):
        return False
    return True


def _person(name):
    skip = {"jr", "sr", "ii", "iii", "iv"}
    words = [word for word in slug_words(name) if word not in skip]
    return words[-1] if words else ""


def _starter(side):
    for prob in side.get("probables") or []:
        if not isinstance(prob, dict):
            continue
        athlete = prob.get("athlete") or {}
        name = athlete.get("displayName")
        if not name:
            continue
        stats = {}
        for row in prob.get("statistics") or []:
            if isinstance(row, dict) and row.get("name"):
                stats[str(row["name"]).lower()] = row.get("displayValue")
        return {"name": name, "era": stats.get("era"), "wins": stats.get("wins"), "losses": stats.get("losses")}
    return None


def _passer(side):
    for group in side.get("leaders") or []:
        if not isinstance(group, dict) or group.get("name") != "passingLeader":
            continue
        leaders = group.get("leaders") or []
        if not leaders or not isinstance(leaders[0], dict):
            return None
        return ((leaders[0].get("athlete") or {}).get("displayName")) or None
    return None


def _record_sentence(game):
    parts = []
    for side in (game["away"], game["home"]):
        rec = side.get("record")
        if not rec or rec == (0, 0, 0):
            continue
        parts.append("%s has %d wins and %d losses" % (side["display"], rec[0], rec[1]))
    if len(parts) == 2:
        return "%s. %s." % (parts[0], parts[1][0].upper() + parts[1][1:])
    return ""


def specific_story(game):
    """A slug and title that name this matchup, or None.

    A record gap or a point spread is not enough. The slug has to carry a
    pitcher, a quarterback, or the two players in a tennis match. No dates.
    """
    away, home = game["away"], game["home"]
    starters = game.get("starters") or {}
    left, right = starters.get("away"), starters.get("home")
    if left and right and left.get("name") and right.get("name"):
        angle = "%s-vs-%s" % (_person(left["name"]), _person(right["name"]))
        if _person(left["name"]) and _person(right["name"]) and not re.search(r"\d", angle):
            headline = "%s vs %s Preview: %s Faces %s" % (away["name"], home["name"], left["name"], right["name"])
            lines = []
            for club, arm in ((away["display"], left), (home["display"], right)):
                if arm.get("era") and arm.get("wins") and arm.get("losses"):
                    lines.append("%s starts %s, at %s wins and %s losses with an ERA of %s."
                                 % (club, arm["name"], arm["wins"], arm["losses"], arm["era"]))
                else:
                    lines.append("%s starts %s." % (club, arm["name"]))
            body = [" ".join(lines)]
            rec = _record_sentence(game)
            if rec:
                body.append(rec)
            if not DATE_IN_TITLE.search(headline):
                return angle, headline, body
    passers = game.get("passers") or {}
    pa, ph = passers.get("away"), passers.get("home")
    if pa and ph and _person(pa) and _person(ph) and not re.search(r"\d", _person(pa) + _person(ph)):
        angle = "%s-vs-%s" % (_person(pa), _person(ph))
        headline = "%s vs %s Preview: %s Faces %s" % (away["name"], home["name"], pa, ph)
        body = ["The passing leader for %s is %s. The passing leader for %s is %s."
                % (away["display"], pa, home["display"], ph)]
        rec = _record_sentence(game)
        if rec:
            body.append(rec)
        if not DATE_IN_TITLE.search(headline):
            return angle, headline, body
    if game.get("sport") == "tennis":
        rnd = _round_angle(game.get("round"))
        if not rnd:
            return None
        piece = rnd[0].replace("the-", "")
        if _person(away["display"]) and _person(home["display"]) and not re.search(r"\d", piece):
            headline = "%s vs %s Preview: %s" % (away["display"], home["display"], piece.replace("-", " "))
            body = ["%s plays %s. %s" % (away["display"], home["display"], (rnd[2] if rnd else "Both players are in the draw."))]
            if not DATE_IN_TITLE.search(headline):
                return piece, headline, body
    return None


# ---------------------------------------------------------------- angles

def slug_words(text):
    text = unicodedata.normalize("NFKD", str(text or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", " ", text.lower())
    return [word for word in text.split() if word and word not in FILLER]


# Last words that name more than one club. Those keep the word in front
# (red-sox, real-madrid). Everyone else uses the nickname a person would type.
AMBIGUOUS = {"sox", "jays", "madrid", "city", "united", "rovers", "wanderers",
             "town", "athletic", "albion", "palace", "hotspur", "villa", "wednesday", "lake"}


def team_token(name):
    words = slug_words(name)
    if not words:
        return "side"
    if len(words) >= 2 and words[-1] in AMBIGUOUS:
        token = "-".join(words[-2:])
    else:
        token = words[-1]
    return token[:28].strip("-") or "side"


def _be(name):
    """'the Yankees are', 'the Revolution is'."""
    return "are" if str(name).endswith("s") else "is"


def _pct(record):
    if not record:
        return None
    wins, losses, ties = record
    played = wins + losses + ties
    if played <= 0:
        return None
    return (wins + 0.5 * ties) / played, played, wins, losses


def _round_angle(name):
    text = (name or "").lower()
    if not text:
        return None
    if "semi" in text:
        return ("the-semifinals", "This match is in the semifinals",
                "The draw has reached the semifinals. One win puts the winner in the final.")
    if "quarter" in text:
        return ("the-quarterfinals", "This match is in the quarterfinals",
                "The draw has reached the quarterfinals, and the winner plays for a place in the final.")
    if re.search(r"\bfinal\b", text):
        return ("a-final-is-on", "A final is on",
                "This is the final. One match decides the event.")
    if "16" in text or "sixteen" in text:
        return ("the-round-of-sixteen", "The draw is in the round of sixteen",
                "Sixteen players are left, and this match is one of them.")
    if "32" in text or "thirty-two" in text or "thirty two" in text:
        return ("the-round-of-thirty-two", "The draw is in the round of thirty two",
                "This match is in the round of thirty two.")
    if any(bit in text for bit in ("64", "128", "qualif", "first round", "round 1", "r1")):
        return ("the-opening-round", "This is an opening round match",
                "The event is in its opening rounds, and this match is on the board.")
    return None


def angles(game):
    """Measured stories for THIS game. First unused one becomes the URL.

    An angle with a digit is rejected. If none of these fit, the game is not
    featured and another game is chosen. Nothing here appends a date or a -2.
    """
    found = []
    sport = game["sport"]
    away, home = game["away"], game["home"]
    away_pct, home_pct = _pct(away.get("record")), _pct(home.get("record"))
    if away_pct and home_pct and away_pct[1] >= 8 and home_pct[1] >= 8:
        gap = abs(away_pct[0] - home_pct[0])
        better = away if away_pct[0] >= home_pct[0] else home
        worse = home if better is away else away
        better_rec = better.get("record")
        worse_rec = worse.get("record")
        if gap >= 0.08:
            found.append((
                "one-side-is-far-better",
                "%s %s the stronger side in this matchup" % (better["display"], _be(better["display"])),
                "%s has %d wins and %d losses. %s has %d wins and %d losses. "
                "That gap is the story of this matchup."
                % (better["display"], better_rec[0], better_rec[1],
                   worse["display"], worse_rec[0], worse_rec[1]),
            ))
        if away_pct[0] >= 0.58 and home_pct[0] >= 0.58:
            found.append((
                "two-strong-sides-meet",
                "%s and %s both arrive in form" % (away["display"], home["display"]),
                "Both sides are winning more often than they lose, so this is not a matchup with a soft spot to lean on.",
            ))
    home_split, road_split = _pct(home.get("home_record")), _pct(away.get("road_record"))
    if home_split and road_split and home_split[1] >= 6 and road_split[1] >= 6:
        if home_split[0] - road_split[0] >= 0.18:
            found.append((
                "the-home-side-holds",
                "%s is a different team at home" % home["display"],
                "%s wins at home, and %s has been ordinary away from home. The building is part of the matchup."
                % (home["display"], away["display"]),
            ))
        elif road_split[0] - home_split[0] >= 0.18:
            found.append((
                "the-road-side-travels",
                "%s has been the better traveling side" % away["display"],
                "%s wins away from home at a rate %s has not matched in its own building."
                % (away["display"], home["display"]),
            ))
    spread = game.get("spread")
    if spread is not None and sport in ("ncaaf", "nfl", "soccer"):
        favored = home if game.get("favored") == "home" else away if game.get("favored") == "away" else None
        if sport == "soccer" and spread <= 0.25:
            found.append((
                "the-line-is-a-pick",
                "The price on this match is a pick",
                "The number is level. Nothing in the price separates these two before kickoff.",
            ))
        elif sport != "soccer" and spread <= 2.5:
            found.append((
                "the-line-is-a-pick",
                "The price on this game is a pick",
                "The number is inside a field goal. The price is calling this one close.",
            ))
        elif favored is not None and ((sport == "soccer" and spread >= 1.5) or (sport != "soccer" and spread >= 10)):
            found.append((
                "the-price-is-lopsided",
                "%s %s priced as the clear side" % (favored["display"], _be(favored["display"])),
                "The number is wide enough that the market is not treating these two as equals.",
            ))
    if game.get("neutral") and sport != "tennis":
        found.append((
            "neutral-ground",
            "%s and %s meet on neutral ground" % (away["display"], home["display"]),
            "Neither side is at home. The building does not belong to either of them.",
        ))
    country = (game.get("country") or "").upper()
    domestic = US | {"CANADA", "CA", "MEXICO", "MX"}
    if country and country not in domestic and sport != "tennis":
        found.append((
            "the-trip-leaves-home",
            "This matchup is being played away from home soil",
            "The fixture is outside the country these clubs usually play in.",
        ))
    round_angle = _round_angle(game.get("round"))
    if round_angle:
        found.append(round_angle)
    clean = []
    for angle, headline, lede in found:
        if re.search(r"\d", angle):
            continue
        if DATE_IN_TITLE.search(headline) or DATE_IN_TITLE.search(lede):
            continue
        clean.append((angle, headline, lede))
    return clean


def build_slug(away_name, home_name, angle):
    away, home = team_token(away_name), team_token(home_name)
    slug = re.sub(r"-+", "-", "%s-%s-%s" % (away, home, angle)).strip("-")
    if len(slug) > 70:
        away, home = slug_words(away_name)[-1], slug_words(home_name)[-1]
        slug = re.sub(r"-+", "-", "%s-%s-%s" % (away, home, angle)).strip("-")
    if len(slug) > 70 or slug in RESERVED or not slug:
        return None
    return slug


# ---------------------------------------------------------------- pages

def _store_path(root):
    return os.path.join(root, URL_STORE)


def recover_store(root, store):
    """A page on disk is the freeze. If the store file is missing a row, the
    comment written into the page is enough to keep that event on that URL."""
    base = os.path.join(root, "matchup-of-the-day")
    if not os.path.isdir(base):
        return store
    for name in os.listdir(base):
        path = os.path.join(base, name, "index.html")
        if not os.path.isfile(path):
            continue
        try:
            with open(path, encoding="utf-8") as fh:
                text = fh.read()
        except OSError:
            continue
        found = re.search(r"FEATURED_ANGLE_PAGE\s+(\S+)\s+(.+?)\s*-->", text)
        if not found:
            continue
        key = "%s:%s" % (found.group(1), found.group(2).strip())
        if key in store and store[key].get("href"):
            continue
        headline = ""
        title = re.search(r"<h1>(.*?)</h1>", text)
        if title:
            headline = html.unescape(title.group(1))
        store[key] = {"href": _href_for_slug(name), "slug": name, "headline": headline}
    return store


def load_store(root):
    path = _store_path(root)
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def save_store(root, store):
    path = _store_path(root)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(store, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def _taken(reg, store, root):
    taken = {}
    for sport, spec in (reg.get("sports") or {}).items():
        for feature in spec.get("features") or []:
            href = feature.get("href")
            if href:
                taken[href] = feature.get("event_id") or feature.get("id")
    for key, row in store.items():
        href = (row or {}).get("href")
        if href:
            taken[href] = key
    base = os.path.join(root, "matchup-of-the-day")
    if os.path.isdir(base):
        for name in os.listdir(base):
            if os.path.isdir(os.path.join(base, name)):
                href = "/matchup-of-the-day/%s/" % name
                taken.setdefault(href, None)
    return taken


def _href_for_slug(slug):
    return "/matchup-of-the-day/%s/" % slug


def _href_for(sport, slug):
    return "/%s/%s/" % (sport, slug)


def _existing_article(reg, sport, game):
    for feature in (reg.get("sports") or {}).get(sport, {}).get("features") or []:
        if feature.get("source") not in ("page", "game-file"):
            continue
        if (feature.get("status") or "active") != "active" or not feature.get("href"):
            continue
        if nfl.entry_is_game(feature, game, window_days=2):
            return feature["href"], feature.get("headline") or game["away"]["display"], feature.get("cta") or "Read the full breakdown", feature.get("source")
    return None


def _research_page(root, sport, game):
    engine = {"mlb": "MLB", "nba": "NBA", "nhl": "NHL", "nfl": "NFL"}.get(sport)
    if not engine:
        return None
    path = os.path.join(root, "handicapping", "_seo_hooks.json")
    try:
        with open(path, encoding="utf-8") as fh:
            store = json.load(fh)
    except (OSError, ValueError):
        return None
    # ET and UTC can name the same night game. A neighboring calendar day is a
    # different game, and that page must not be reused.
    for day in (nfl.et(game["kickoff"]).strftime("%Y-%m-%d"), game["kickoff"].strftime("%Y-%m-%d")):
        rec = store.get("%s|%s|%s|%s" % (engine, game["away"]["display"], game["home"]["display"], day)) or {}
        page = rec.get("page") or ""
        full = os.path.join(root, page.strip("/").replace("/", os.sep), "index.html") if page else ""
        if page and os.path.exists(full):
            return page
    return None


def _asset(root, src):
    try:
        with open(os.path.join(root, "static", "ds-assets.json"), encoding="utf-8") as fh:
            manifest = json.load(fh)
    except (OSError, ValueError):
        manifest = {}
    return manifest.get(src) or ("/" + src)


def _clock_line(game):
    kick = nfl.et(game["kickoff"])
    clock = nfl.clock(kick, "ET") if game.get("time_valid", True) else "time to be determined"
    return "%s, %s %d, %s" % (kick.strftime("%A"), kick.strftime("%B"), kick.day, clock)


OG_IMAGE = SITE + "/static/og/og-home.png"


def featured_ld(event, name, description, canonical, published):
    """Article + BreadcrumbList + SportsEvent graph for one featured page."""
    org = {"@type": "Organization", "name": "TrustMyRecord", "url": SITE + "/"}
    return {"@context": "https://schema.org", "@graph": [
        {"@type": "Article", "headline": name[:110], "description": description,
         "url": canonical, "mainEntityOfPage": canonical, "image": OG_IMAGE,
         "datePublished": published, "dateModified": published,
         "author": org, "publisher": org},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": "Matchup of the Day",
             "item": SITE + "/matchup-of-the-day/"},
            {"@type": "ListItem", "position": 3, "name": name, "item": canonical}]},
        event]}


def _write_page(root, sport, game, spec, href, headline, lede, when_line, body=None):
    path = os.path.join(root, href.strip("/").replace("/", os.sep), "index.html")
    if os.path.exists(path):
        _refresh_clock(path, when_line)
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    label = (spec or {}).get("label") or sport.upper()
    hub = (spec or {}).get("hub") or "/handicapping/%s/" % sport
    sim = (CATALOG.get(sport) or {}).get("simulator")
    canonical = SITE + href
    # UNIQUE_FEATURED_TITLE_20260924: round and price angles ("This match is in
    # the quarterfinals", "The price on this game is a pick") name neither side,
    # so two features firing the same angle shared one <title>. When the
    # headline names neither club, the matchup leads the title.
    a_disp, h_disp = game["away"]["display"], game["home"]["display"]
    if a_disp.lower() in headline.lower() or h_disp.lower() in headline.lower():
        title = "%s | TrustMyRecord" % headline
    else:
        title = "%s %s %s: %s | TrustMyRecord" % (a_disp, "vs" if sport == "tennis" else "at",
                                                  h_disp, headline)
    # UNIQUE_FEATURED_DESC_20260924: the lede is an angle sentence shared by
    # every game that fires the same angle ("The number is wide enough..." sat
    # on four pages). The matchup now leads the meta description.
    description = "%s %s %s. %s" % (game["away"]["display"], "vs" if sport == "tennis" else "at",
                                     game["home"]["display"], lede)
    if DATE_IN_TITLE.search(title) or DATE_IN_TITLE.search(headline):
        raise ValueError("date in featured title")
    links = [("The %s board" % label, hub), ("Make a pick", "/sportsbook/"),
             ("Matchup of the Day", "/matchup-of-the-day/")]
    if sim:
        links.insert(1, ("Run it in the simulator", sim))
    link_html = "".join('<a href="%s">%s</a>' % (html.escape(url), html.escape(text)) for text, url in links)
    # FEATURED_SCHEMA_20260924: tests/matchup-seo-contract-test.js requires
    # every Matchup of the Day page to carry Article + BreadcrumbList +
    # SportsEvent and an og:image. These pages shipped the event alone.
    event = {
        "@type": "SportsEvent",
        "name": headline,
        "sport": label,
        "startDate": game["kickoff"].strftime("%Y-%m-%dT%H:%M:%SZ"),
        "url": canonical,
        "homeTeam": {"@type": "SportsTeam", "name": game["home"]["display"]},
        "awayTeam": {"@type": "SportsTeam", "name": game["away"]["display"]},
    }
    ld = featured_ld(event, title.replace(" | TrustMyRecord", ""), description, canonical,
                     dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    nav = _asset(root, "static/js/tmr-ds-nav.js")
    css = _asset(root, "static/css/tmr-ds.css")
    header = _asset(root, "static/css/tmr-ds-header.css")
    page = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>%s</title>
<meta name="description" content="%s">
<meta name="robots" content="index, follow">
<link rel="canonical" href="%s">
<meta property="og:type" content="article">
<meta property="og:title" content="%s">
<meta property="og:description" content="%s">
<meta property="og:url" content="%s">
<meta property="og:image" content="%s">
<link rel="icon" type="image/png" href="/static/favicon.png">
<link rel="stylesheet" href="%s">
<link rel="stylesheet" href="/static/css/tmr-navbar.css">
<link rel="stylesheet" href="%s">
<script type="application/ld+json">
%s
</script>
<style>
  body{margin:0;background:#070910;color:#e8eef7}
  main{max-width:40rem;margin:0 auto;padding:48px 24px 72px}
  .eyebrow{color:#8A97A8;font:800 12px/1.4 Inter,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase}
  h1{font:800 2rem/1.2 Inter,system-ui,sans-serif;letter-spacing:-.02em;margin:12px 0}
  .when{color:#93a4bb}
  p{font:500 1.05rem/1.6 Inter,system-ui,sans-serif}
  .links{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
  .links a{color:#04101c;background:#35E0CB;text-decoration:none;font-weight:800;border-radius:999px;padding:8px 14px}
</style>
</head>
<body>
<!-- %s %s %s -->
<main>
<p class="eyebrow">%s Featured Matchup</p>
<h1>%s</h1>
<p class="when" data-feat-when>%s</p>
%s
<div class="links">%s</div>
</main>
<script src="/static/js/config.js"></script>
<script src="%s"></script>
</body>
</html>
""" % (
        html.escape(title), html.escape(description), html.escape(canonical),
        html.escape(headline), html.escape(description), html.escape(canonical),
        OG_IMAGE,
        html.escape(css), html.escape(header),
        json.dumps(ld, indent=2),
        MARK, html.escape(sport), html.escape(game["id"]),
        html.escape(label), html.escape(headline), html.escape(when_line),
        "\n".join("<p>%s</p>" % html.escape(part) for part in (body or [lede])),
        link_html, html.escape(nav),
    )
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(page)


def _refresh_clock(path, when_line):
    try:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    except OSError:
        return
    if MARK not in text:
        return
    fresh = '<p class="when" data-feat-when>%s</p>' % html.escape(when_line)
    updated, n = re.subn(r'<p class="when" data-feat-when>.*?</p>', fresh, text, count=1)
    if n and updated != text:
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(updated)


def article_for(reg, root, store, sport, game, spec, taken, write=True):
    """(href, headline, cta, kind) or None when this game has no honest URL."""
    existing = _existing_article(reg, sport, game)
    if existing:
        return existing
    research = _research_page(root, sport, game)
    if research:
        return research, "%s at %s" % (game["away"]["display"], game["home"]["display"]), "Full breakdown and odds", "research"
    key = "%s:%s" % (sport, game["id"])
    frozen = store.get(key) or {}
    if frozen.get("href"):
        headline = frozen.get("headline") or game["away"]["display"]
        return frozen["href"], headline, "Read the full breakdown", "angle"
    owner = {}
    for row_key, row in store.items():
        if row.get("href"):
            owner[row["href"]] = row_key
    story = specific_story(game)
    if story:
        angle, headline, body = story
        slug = build_slug(game["away"]["display"], game["home"]["display"], angle)
        href = _href_for(sport, slug) if slug else ""
        if slug and not (href in owner or href in taken and (owner.get(href) or taken.get(href)) != key):
            when_line = _clock_line(game)
            if write:
                _write_page(root, sport, game, spec, href, headline, body[0], when_line, body)
            store[key] = {"href": href, "slug": slug, "angle": angle, "headline": headline}
        taken[href] = key
        return href, headline, "Read the full breakdown", "angle"
    return None


def _sync_sitemap(root, store):
    path = os.path.join(root, SITEMAP)
    if not os.path.exists(path):
        return False
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    rows = []
    today = dt.datetime.now(nfl.PT).strftime("%Y-%m-%d")
    outside = text
    if SITEMAP_BEGIN in text and SITEMAP_END in text:
        outside = re.sub(re.escape(SITEMAP_BEGIN) + r".*?" + re.escape(SITEMAP_END), "", text, count=1, flags=re.S)
    seen = set(re.findall(r"<loc>\s*([^<]+?)\s*</loc>", outside))
    for row in store.values():
        href = (row or {}).get("href") or ""
        page = os.path.join(root, href.strip("/").replace("/", os.sep), "index.html")
        loc = SITE + href
        if not href or not os.path.exists(page) or loc in seen:
            continue
        seen.add(loc)
        rows.append("  <url><loc>%s</loc><lastmod>%s</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>" % (loc, today))
    block = SITEMAP_BEGIN + "\n" + ("\n".join(rows) + "\n" if rows else "") + SITEMAP_END
    if SITEMAP_BEGIN in text and SITEMAP_END in text:
        pattern = re.compile(re.escape(SITEMAP_BEGIN) + r".*?" + re.escape(SITEMAP_END), re.S)
        updated = pattern.sub(block, text, count=1)
    elif "</urlset>" in text:
        updated = text.replace("</urlset>", block + "\n</urlset>", 1)
    else:
        return False
    if updated == text:
        return False
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(updated)
    return True


HUB_BEGIN = "<!--MK:featuredAngles-->"
HUB_END = "<!--/MK:featuredAngles-->"
HUB_ANCHOR = "<!--/MK:motdByMonth-->"


def _sync_hub_links(root, store):
    """ORPHAN_FEATURED_20260924: link every featured angle page from the
    /matchup-of-the-day/ hub.

    These pages were reachable only through the per sport door while they were
    current; once a game retired from the door no page linked to it (13 pages on
    2026-09-24, tests/matchup-seo-contract-test.js "not linked from the hub").
    The block sits in its own marker, next to the monthly archive, so the daily
    Matchup of the Day bake (which only rewrites its own motd* markers) keeps it."""
    path = os.path.join(root, "matchup-of-the-day", "index.html")
    if not os.path.exists(path):
        return False
    with open(path, encoding="utf-8", newline="") as fh:
        text = fh.read()
    rows = []
    for row in store.values():
        href = (row or {}).get("href") or ""
        page = os.path.join(root, href.strip("/").replace("/", os.sep), "index.html")
        if not href or not os.path.exists(page):
            continue
        with open(page, encoding="utf-8") as fh:
            src = fh.read()
        m = re.search(r"<title>([^<]+)</title>", src)
        label = html.unescape(m.group(1)).replace(" | TrustMyRecord", "").strip() if m else row.get("headline") or href
        k = re.search(r'"startDate":\s*"([^"]+)"', src)
        kick = k.group(1) if k else ""
        rows.append((kick, label, href))
    rows.sort(reverse=True)
    items = "".join('<li><a href="%s">%s</a></li>' % (html.escape(h), html.escape(l)) for _, l, h in rows)
    block = (HUB_BEGIN + ('<h3 class="gf-mo-head">More featured matchups</h3><ul class="gf-mo-list">%s</ul>' % items
                          if items else "") + HUB_END)
    if HUB_BEGIN in text and HUB_END in text:
        updated = re.sub(re.escape(HUB_BEGIN) + r".*?" + re.escape(HUB_END), lambda _m: block, text, count=1, flags=re.S)
    elif HUB_ANCHOR in text:
        updated = text.replace(HUB_ANCHOR, HUB_ANCHOR + block, 1)
    else:
        return False
    if updated == text:
        return False
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(updated)
    return True


# ---------------------------------------------------------------- apply

def _matchup(game):
    join = "vs" if game.get("neutral") else "at"
    return "%s %s %s" % (game["away"]["display"], join, game["home"]["display"])


def _when(game):
    parts = [_clock_line(game)]
    if game.get("league") and game["league"] not in (game["sport"].upper(),):
        parts.insert(0, game["league"])
    return " · ".join(parts)


def _entry(sport, game, href, headline, cta, kind, spec):
    label = game.get("league") or (spec or {}).get("label") or sport.upper()
    return {
        "id": "%s-event:%s" % (sport, game["id"]),
        "source": SOURCE,
        "status": "active",
        "href": href,
        "headline": headline,
        "matchup": _matchup(game),
        "when": _when(game),
        "label": "%s Featured Matchup" % label,
        "cta": cta,
        "away_logo": game["away"].get("logo") or "",
        "home_logo": game["home"].get("logo") or "",
        "kickoff_utc": game["kickoff"].strftime("%Y-%m-%dT%H:%M:%SZ"),
        "event_id": game["id"],
        "away": game["away"].get("abbr") or team_token(game["away"]["display"]),
        "home": game["home"].get("abbr") or team_token(game["home"]["display"]),
        "game_state": game["state"],
        "article": kind,
    }


def _choose(games, now, article_ok, sticky, withdrawn):
    """Next slots, skipping a game that cannot have its own URL."""
    blocked = set(withdrawn)
    picks = []
    for _ in range(24):
        pool = [game for game in games if game["id"] not in blocked and featurable(game, now)]
        picks = nfl.plan(pool, now, page_for=lambda game: False, sticky=sticky, withdrawn=(), slots=SLOTS)
        missing = next((game for game in picks if not article_ok(game)), None)
        if missing is None:
            return picks
        blocked.add(missing["id"])
    return [game for game in picks if article_ok(game)]


def apply_sport(reg, sport, games, now, root, resolver, store, taken, write=True):
    spec = reg["sports"][sport]
    features = spec.setdefault("features", [])
    named = []
    for feature in features:
        text = "%s %s" % (feature.get("matchup") or "", feature.get("headline") or "")
        if feature.get("source") == SOURCE and re.search(r"\bTBD\b|\bTBA\b", text, re.I):
            href = feature.get("href") or ""
            page = os.path.join(root, href.strip("/").replace("/", os.sep), "index.html")
            if write and os.path.exists(page):
                try:
                    with open(page, encoding="utf-8") as fh:
                        body = fh.read(8000)
                except OSError:
                    body = ""
                if MARK in body:
                    os.remove(page)
            continue
        named.append(feature)
    features[:] = named
    for key, row in list(store.items()):
        slug = ((row or {}).get("slug") or "")
        if key.startswith(sport + ":") and slug.startswith("tbd-"):
            del store[key]
    by_id = {game["id"]: game for game in games}
    before = resolver(reg, sport, now)
    snapshot = json.dumps(spec, sort_keys=True)
    ready = {}

    def article_ok(game):
        if game["id"] not in ready:
            ready[game["id"]] = article_for(reg, root, store, sport, game, spec, taken, write=write)
        return ready[game["id"]] is not None

    rotation = [feature for feature in features if feature.get("source") == SOURCE]
    withdrawn = {str(feature.get("event_id")) for feature in rotation if (feature.get("status") or "active") != "active"}
    sticky = {str(feature.get("event_id")) for feature in rotation
              if (feature.get("status") or "active") == "active" and feature.get("game_state") not in nfl.ENDED}
    picks = _choose(games, now, article_ok, sticky, withdrawn)
    if not picks:
        return False, None
    spec["selection"] = "schedule"
    spec["archive"] = True
    pick_ids = {game["id"] for game in picks}
    for feature in rotation:
        game = by_id.get(str(feature.get("event_id")))
        if game is None:
            continue
        feature["game_state"] = game["state"]
        if game["state"] not in nfl.ENDED:
            feature["kickoff_utc"] = game["kickoff"].strftime("%Y-%m-%dT%H:%M:%SZ")
            feature["when"] = _when(game)
            href = feature.get("href") or ""
            if MARK:
                page = os.path.join(root, href.strip("/").replace("/", os.sep), "index.html")
                if write and os.path.exists(page):
                    _refresh_clock(page, _clock_line(game))
    features[:] = [feature for feature in features if not (
        feature.get("source") == SOURCE and (feature.get("status") or "active") == "active"
        and str(feature.get("event_id")) not in pick_ids
        and feature.get("game_state") in ("scheduled", "postponed", "canceled", "suspended")
        and (nfl.parse_utc(feature.get("kickoff_utc")) or now) > now - dt.timedelta(hours=nfl.STALE_PRE_HOURS)
        and str(feature.get("event_id")) in by_id)]
    for game in picks:
        href, headline, cta, kind = ready[game["id"]]
        entry = _entry(sport, game, href, headline, cta, kind, spec)
        current = next((feature for feature in features if feature.get("id") == entry["id"]), None)
        if current is None:
            features.append(entry)
        else:
            for key, value in entry.items():
                if key != "status" and current.get(key) != value:
                    current[key] = value
    after = resolver(reg, sport, now)
    lines = None
    if (before or {}).get("id") != (after or {}).get("id") or (before or {}).get("href") != (after or {}).get("href"):
        reason = "Schedule changed or the previous featured game is no longer the current one"
        if before and (before.get("game_state") == "final" or (by_id.get(str(before.get("event_id"))) or {}).get("state") == "final"):
            reason = "Previous featured game completed"
        elif not before:
            reason = "No current featured game was on the schedule"
        nxt = (after or {}).get("matchup") or "none"
        lines = "featured %s: %s -> %s (%s)" % (sport, (before or {}).get("matchup") or "none", nxt, (after or {}).get("href"))
        log = spec.setdefault("rotation_log", [])
        log.append({"updated_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "previous": (before or {}).get("matchup") or "none",
                    "next": nxt, "article": (after or {}).get("href"), "reason": reason,
                    "updated_pacific": nfl.pacific_stamp(now)})
        del log[:-nfl.LOG_KEEP]
    changed = json.dumps(spec, sort_keys=True) != snapshot
    return changed, lines


def apply_all(reg, now, root, resolver, get=None, write=True):
    """Rotate every catalog sport present in the registry. Feed errors skip that sport."""
    feeds = catalog_for(reg)
    if not feeds:
        return False, []
    store = recover_store(root, load_store(root))
    taken = _taken(reg, store, root)
    changed = False
    lines = []
    store_before = json.dumps(store, sort_keys=True)
    for sport, cfg in feeds.items():
        try:
            raw = fetch_events(sport, cfg, now, get)
        except Exception as exc:
            lines.append("featured %s: WARN schedule unreadable (%s)" % (sport, exc))
            continue
        games = []
        for event in raw:
            game = normalize(event, sport)
            if game:
                games.append(game)
        if not games:
            lines.append("featured %s: WARN schedule returned no games" % sport)
            continue
        try:
            did, line = apply_sport(reg, sport, games, now, root, resolver, store, taken, write=write)
        except Exception as exc:
            lines.append("featured %s: WARN rotation failed (%s)" % (sport, exc))
            continue
        current = resolver(reg, sport, now)
        shown = "%s -> %s" % (current.get("matchup"), current.get("href")) if current else "none"
        lines.append("featured %s: %d games, current %s" % (sport, len(games), shown))
        if line:
            lines.append(line)
        changed = changed or did
    if write and json.dumps(store, sort_keys=True) != store_before:
        save_store(root, store)
        changed = True
    if write and _sync_sitemap(root, store):
        changed = True
    if write and _sync_hub_links(root, store):
        changed = True
    return changed, lines
