#!/usr/bin/env python3
"""
schema_event.py - the single place TrustMyRecord builds Event structured data.

WHY THIS EXISTS
---------------
Google Search Console flagged two Event issues site wide on 2026-08-27:
"Missing field description" and "Missing field eventStatus". The cause was that
Event JSON-LD was being written in three separate places by hand
(build_mlb_matchup_pages.py wrote one shape on the matchup page and a second,
thinner shape inside the hub ItemList; build_matchup_articles.py wrote a third),
so a field added to one shape never reached the other two.

Every SportsEvent node on the site is now built here, by one function, so the
required fields cannot be present on one page type and absent on another.

THE RULE THIS FILE ENFORCES
---------------------------
Nothing here is invented to satisfy a validator. A field is emitted only when
the underlying fact is real and held:

  * description  is composed from facts we already publish on the page - the
                 two clubs, the date, first pitch, the venue, the probable
                 starters, the moneyline - and never from filler. It always has
                 at least the clubs and the date, which are the facts that make
                 the fixture a fixture, so it is always present.
  * eventStatus  is read from the game status the data feed gives us. schema.org
                 has no value for "already played", so a game that went ahead as
                 scheduled stays EventScheduled; postponed, cancelled and
                 suspended games are reported as what they are.
  * startDate    is emitted only when we hold a real first pitch.
  * location     is emitted only when the venue is known. Its postal address is
                 emitted only when the feed hands us a real one for that venue.
  * performer    is the two clubs. They are the fixture's participants, which is
                 exactly what schema.org means by performer, and they are the
                 one recommended field a fixture always holds.
  * organizer    is emitted only when the governing body is known AND we hold a
                 real homepage for it. Search Console reported "Missing field
                 url (in organizer)" site wide on 2026-09-01 because the
                 organizer was written as a bare name. An organizer without a
                 url can no longer leave this file: organizer_node() returns
                 None rather than emit a half node, so the warning cannot come
                 back through a caller that forgets the url.
"""

EVENT_STATUS = {
    "postponed": "https://schema.org/EventPostponed",
    "suspended": "https://schema.org/EventPostponed",
    "cancelled": "https://schema.org/EventCancelled",
    "canceled": "https://schema.org/EventCancelled",
    "rescheduled": "https://schema.org/EventRescheduled",
    "moved": "https://schema.org/EventMovedOnline",
}
EVENT_SCHEDULED = "https://schema.org/EventScheduled"
OFFLINE = "https://schema.org/OfflineEventAttendanceMode"

# The governing bodies whose fixtures this site publishes, each with its own
# homepage. A name that is not in here has no url we hold, so it gets no
# organizer node at all rather than a nameless-url one Search Console will
# report. Add a league here when the site starts publishing its fixtures.
ORGANIZER_URLS = {
    "major league baseball": "https://www.mlb.com/",
    "mlb": "https://www.mlb.com/",
    "national football league": "https://www.nfl.com/",
    "nfl": "https://www.nfl.com/",
    "national basketball association": "https://www.nba.com/",
    "nba": "https://www.nba.com/",
    "national hockey league": "https://www.nhl.com/",
    "nhl": "https://www.nhl.com/",
    "trustmyrecord": "https://trustmyrecord.com/",
}

# The governing body a league code names. Used where a caller holds the league
# rather than the body's full name. Only codes with exactly one governing body
# appear here; a college or international code names none.
SPORT_ORGANIZERS = {
    "mlb": "Major League Baseball",
    "nba": "National Basketball Association",
    "nfl": "National Football League",
    "nhl": "National Hockey League",
}


# Which schema.org type a given organizer is. A league governs sport, so it is a
# SportsOrganization; TrustMyRecord is not a league, so it is an Organization.
ORGANIZER_TYPES = {
    "trustmyrecord": "Organization",
}


def organizer_node(organizer, url=None):
    """Build a complete organizer node, or none at all.

    Accepts either the organizer's name or an already shaped dict. The rule is
    absolute: a node comes back only when it has BOTH a name and a url, because
    a bare name is exactly what Search Console flagged. An organizer we hold no
    homepage for is dropped, since organizer is a recommended field and an
    absent one costs nothing while an incomplete one is an open warning.
    """
    if not organizer:
        return None
    node = dict(organizer) if isinstance(organizer, dict) else {"name": organizer}
    name = (node.get("name") or "").strip()
    if not name:
        return None
    key = name.lower()
    node["name"] = name
    node["@type"] = node.get("@type") or ORGANIZER_TYPES.get(key, "SportsOrganization")
    href = (url or node.get("url") or ORGANIZER_URLS.get(key) or "").strip()
    if not href:
        return None
    node["url"] = href
    return {k: node[k] for k in ("@type", "name", "url") if node.get(k)}


# The postal address fields schema.org names, in the order a reader reads them,
# mapped from the keys the MLB venue feed uses.
ADDRESS_FIELDS = (
    ("streetAddress", ("streetAddress", "address1")),
    ("addressLocality", ("addressLocality", "city")),
    ("addressRegion", ("addressRegion", "stateAbbrev", "state")),
    ("postalCode", ("postalCode",)),
    ("addressCountry", ("addressCountry", "country")),
)


def postal_address(address):
    """Shape a feed's venue location into a PostalAddress, or nothing.

    Every field is copied, never derived. A location that carries no locality is
    not an address anyone could stand at, so it comes back as None instead of a
    PostalAddress holding only a country.
    """
    if not address:
        return None
    if isinstance(address, str):
        text = address.strip()
        return {"@type": "PostalAddress", "streetAddress": text} if text else None
    node = {"@type": "PostalAddress"}
    for field, keys in ADDRESS_FIELDS:
        for key in keys:
            value = (address.get(key) or "").strip() if isinstance(address.get(key), str) else address.get(key)
            if value:
                node[field] = value
                break
    return node if node.get("addressLocality") else None


def place_node(venue, address=None):
    """A Place for the venue, carrying its postal address when we hold one."""
    if not venue:
        return None
    place = {"@type": "Place", "name": venue}
    postal = postal_address(address)
    if postal:
        place["address"] = postal
    return place


def event_status(status):
    """Map a feed status string onto a schema.org eventStatus URL.

    Anything we do not recognise - Scheduled, Pre-Game, In Progress, Final,
    Warmup, None - is a game that is on or was on, which schema.org expresses
    as EventScheduled. There is no "completed" value to reach for.
    """
    return EVENT_STATUS.get((status or "").strip().lower(), EVENT_SCHEDULED)


def event_description(away, home, date_long=None, start=None, venue=None,
                      away_sp=None, home_sp=None, ml_away=None, ml_home=None,
                      away_label=None, home_label=None, status=None,
                      extra=None, limit=300):
    """Compose an Event description out of facts the page already states.

    Order is the order a reader needs them: who is playing, when, where, who is
    pitching, what the market says. Every clause is dropped when its fact is
    missing rather than guessed at.
    """
    away_label = away_label or away
    home_label = home_label or home
    opener = "%s at %s" % (away, home)
    if date_long:
        opener += " on %s" % date_long
    if start:
        opener += " at %s" % start
    if venue:
        opener += " from %s" % venue
    bits = [opener]
    if away_sp and home_sp:
        bits.append("%s starts against %s" % (away_sp, home_sp))
    elif away_sp:
        bits.append("%s starts for %s" % (away_sp, away_label))
    elif home_sp:
        bits.append("%s starts for %s" % (home_sp, home_label))
    if ml_away and ml_home:
        bits.append("Moneyline %s %s, %s %s" % (away_label, ml_away, home_label, ml_home))
    state = (status or "").strip()
    if state and event_status(state) != EVENT_SCHEDULED:
        bits.append("This game is %s" % state.lower())
    if extra:
        bits.append(extra.rstrip("."))
    text = ". ".join(b for b in bits if b) + "."
    return text[:limit].strip() if limit else text.strip()


def sports_event(url, away, home, sport, description, node_id=None,
                 start_iso=None, end_iso=None, venue=None, venue_address=None,
                 status=None, organizer=None, organizer_url=None, image=None,
                 offers=None, away_team=None, home_team=None):
    """Build one SportsEvent node. The only Event builder on the site.

    `description` is required on purpose: a caller that has no facts to describe
    the fixture with has no business emitting an Event for it.
    """
    if not description:
        raise ValueError("sports_event requires a real description")
    event = {
        "@type": "SportsEvent",
        "name": "%s at %s" % (away, home),
        "url": url,
        "description": description,
        "sport": sport,
        "eventStatus": event_status(status),
        "eventAttendanceMode": OFFLINE,
        "awayTeam": {"@type": "SportsTeam", "name": away_team or away},
        "homeTeam": {"@type": "SportsTeam", "name": home_team or home},
        "competitor": [{"@type": "SportsTeam", "name": away_team or away},
                       {"@type": "SportsTeam", "name": home_team or home}],
        # The clubs again under the name Google reads. competitor and performer
        # are the same two facts: schema.org calls them competitors, Google's
        # Event guidance asks for performers, and a fixture always holds both.
        "performer": [{"@type": "SportsTeam", "name": away_team or away},
                      {"@type": "SportsTeam", "name": home_team or home}],
    }
    if node_id:
        event["@id"] = node_id
    if start_iso:
        event["startDate"] = start_iso.replace("Z", "+00:00")
    if end_iso:
        event["endDate"] = end_iso.replace("Z", "+00:00")
    if venue:
        event["location"] = place_node(venue, venue_address)
    org = organizer_node(organizer, organizer_url)
    if org:
        event["organizer"] = org
    if image:
        event["image"] = image
    if offers:
        event["offers"] = offers
    ordered = ["@type", "@id", "name", "url", "description", "sport",
               "startDate", "endDate", "eventStatus", "eventAttendanceMode",
               "location", "image", "organizer", "performer", "offers",
               "awayTeam", "homeTeam", "competitor"]
    return {k: event[k] for k in ordered if k in event}
