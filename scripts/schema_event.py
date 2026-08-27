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
  * location     is emitted only when the venue is known.
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
                 start_iso=None, end_iso=None, venue=None, status=None,
                 organizer=None, image=None, offers=None,
                 away_team=None, home_team=None):
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
    }
    if node_id:
        event["@id"] = node_id
    if start_iso:
        event["startDate"] = start_iso.replace("Z", "+00:00")
    if end_iso:
        event["endDate"] = end_iso.replace("Z", "+00:00")
    if venue:
        event["location"] = {"@type": "Place", "name": venue}
    if organizer:
        event["organizer"] = {"@type": "SportsOrganization", "name": organizer}
    if image:
        event["image"] = image
    if offers:
        event["offers"] = offers
    ordered = ["@type", "@id", "name", "url", "description", "sport",
               "startDate", "endDate", "eventStatus", "eventAttendanceMode",
               "location", "image", "organizer", "offers",
               "awayTeam", "homeTeam", "competitor"]
    return {k: event[k] for k in ordered if k in event}
