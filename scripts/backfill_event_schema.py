#!/usr/bin/env python3
"""
backfill_event_schema.py - repair Event JSON-LD on pages that are already baked.

WHY THIS EXISTS
---------------
Search Console reported "Missing field description" and "Missing field
eventStatus" on Event structured data across TrustMyRecord on 2026-08-27. The
generators that write new pages are fixed at the source - scripts/schema_event.py
is now the only Event builder on the site - but a matchup page is permanent:
once baked it is never rewritten, because re-running the generator over an
indexed page days later would rebuild it from a live feed and change what it
says about a game that has already been played. So the pages Google actually
crawled and complained about would stay broken.

This script repairs those pages in place and touches nothing else. It rewrites
only the JSON-LD blocks that contain an Event; the visible HTML, the title, the
meta description, the URLs and every other schema node are left alone.

WHERE THE VALUES COME FROM
--------------------------
Nothing is invented. For each Event node that is missing a field:

  description   the page's own WebPage/Article description, which on a matchup
                page already reads "<away> at <home> on <date> at <time> from
                <venue>. <A> starts against <B>. Moneyline ..." followed by a
                clause about what the page contains. That trailing clause is
                dropped, because it describes the page and not the fixture, and
                what remains is exactly the fixture. It is used only when both
                club names in the Event's own name appear in it, so a slate page
                can never hand its summary to one of the games on it. Otherwise
                the description is composed from the Event node's own name,
                startDate and location.

  organizer     the league homepage for the governing body the node already
                names. Search Console reported "Missing field url (in
                organizer)" on 2026-09-01: the node carried
                {"@type":"SportsOrganization","name":"Major League Baseball"}
                and nothing else. Only the url is added; the name is never
                changed, and a name we hold no homepage for is left alone.

  performer     the two clubs, taken from the node's own competitor/awayTeam/
                homeTeam. Nothing new is learned - the same two teams are simply
                also stated under the name Google's Event guidance reads.

  organizer     (where absent) the governing body the node's own `sport` names,
                for the four leagues that have exactly one. A node whose sport
                is a college or international code names no organizer.

  location      the park's real postal address, read from the MLB venue feed and
                cached in scripts/mlb_venue_addresses.json, matched on the venue
                name the node already carries. A venue that is not in that file
                keeps its bare Place, because an address is a fact about a place
                and cannot be composed.

  eventStatus   the game state the page itself displays ("Status <b>Final</b>"),
                mapped by the same table the generators use. A page with no
                displayed state gets EventScheduled, which is what schema.org
                offers for a game that went ahead as scheduled.

Run from the repo root:

    python scripts/backfill_event_schema.py --dry-run
    python scripts/backfill_event_schema.py
"""

import argparse
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schema_event import (  # noqa: E402
    OFFLINE, SPORT_ORGANIZERS, event_status, organizer_node, postal_address,
)

VENUE_ADDRESSES = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "mlb_venue_addresses.json")


def load_venues():
    """The venue name -> postal address map, or an empty map if it is absent."""
    try:
        with io.open(VENUE_ADDRESSES, encoding="utf-8") as fh:
            return json.load(fh)
    except (IOError, OSError, ValueError):
        return {}


VENUES = load_venues()


def venue_address(name):
    """Look a park up by the name the node already carries.

    Some pages name the park as "Truist Park, Atlanta" because that is how the
    research overview writes it. The trailing city is stripped for the lookup
    and for nothing else - the displayed name is never rewritten.
    """
    if not name:
        return None
    key = name.strip()
    if key in VENUES:
        return VENUES[key]
    return VENUES.get(key.rsplit(",", 1)[0].strip())

LD = re.compile(r'(<script[^>]*application/ld\+json[^>]*>)(.*?)(</script>)', re.S | re.I)
STATUS_HTML = re.compile(r'Status\s*<b>(.*?)</b>', re.I)
MONTHS = ("January February March April May June July August September October "
          "November December").split()

# The clause the matchup pages append to their meta description to say what the
# page holds. True of the page, false of the fixture, so it is dropped.
BOILERPLATE = re.compile(
    r'\s*Records, recent form, offense, bullpens and verified trends,\s*'
    r'every number sourced\.?\s*$', re.I)

PAGE_TYPES = ("WebPage", "Article", "NewsArticle", "BlogPosting", "CollectionPage")

EVENT_TYPES = {"event", "sportsevent", "businessevent", "childrensevent",
               "comedyevent", "courseinstance", "danceevent", "deliveryevent",
               "educationevent", "eventseries", "exhibitionevent", "festival",
               "foodevent", "hackathon", "literaryevent", "musicevent",
               "publicationevent", "saleevent", "screeningevent", "socialevent",
               "sportsevent", "theaterevent", "visualartsevent"}


def types_of(node):
    t = node.get("@type")
    return [x for x in (t if isinstance(t, list) else [t]) if isinstance(x, str)]


def is_event(node):
    return isinstance(node, dict) and any(x.lower() in EVENT_TYPES for x in types_of(node))


def collect(node, want, found):
    """Collect matching nodes at any depth.

    Depth matters: Events hide inside ItemList -> ListItem -> item, and that is
    exactly the shape Search Console flagged on the slate pages. A pass over
    @graph alone would miss every one of them.
    """
    if isinstance(node, dict):
        if want(node):
            found.append(node)
        for v in node.values():
            collect(v, want, found)
    elif isinstance(node, list):
        for v in node:
            collect(v, want, found)
    return found


def page_description(doc):
    """The description this page already publishes, with page boilerplate cut."""
    pages = collect(doc, lambda n: any(t in PAGE_TYPES for t in types_of(n))
                    and isinstance(n.get("description"), str), [])
    if not pages:
        return ""
    return BOILERPLATE.sub("", pages[0]["description"].strip()).strip()


def long_date_from_iso(value):
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", value or "")
    if not m:
        return ""
    return "%s %d, %d" % (MONTHS[int(m.group(2)) - 1], int(m.group(3)), int(m.group(1)))


def describe_from_node(ev):
    """Describe the fixture out of the Event node's own held facts."""
    text = (ev.get("name") or "").strip()
    if not text:
        return ""
    when = long_date_from_iso(ev.get("startDate"))
    if when:
        text += " on %s" % when
    place = ev.get("location")
    if isinstance(place, dict) and place.get("name"):
        text += " at %s" % place["name"]
    return text + "."


def borrowed_description(ev, page_desc):
    """Use the page's description only when it is about THIS fixture.

    A single-fixture page describes one game, so its description is the game's.
    A slate page describes a slate; handing that to one of fifteen games on it
    would be a fabrication, so it is refused.
    """
    if not page_desc:
        return ""
    halves = [h.strip() for h in (ev.get("name") or "").split(" at ")]
    if len(halves) == 2 and all(h and h in page_desc for h in halves):
        return page_desc
    return ""


def repair_doc(doc, status_text):
    page_desc = page_description(doc)
    fixed = 0
    for ev in collect(doc, is_event, []):
        before = json.dumps(ev, sort_keys=True, ensure_ascii=False)
        if not (ev.get("description") or "").strip():
            desc = borrowed_description(ev, page_desc) or describe_from_node(ev)
            if desc:
                ev["description"] = desc
        if not (ev.get("eventStatus") or "").strip():
            ev["eventStatus"] = event_status(status_text)
        if not (ev.get("eventAttendanceMode") or "").strip():
            ev["eventAttendanceMode"] = OFFLINE
        org = ev.get("organizer")
        if isinstance(org, dict) and not (org.get("url") or "").strip():
            # organizer_node returns None for a body we hold no homepage for, in
            # which case the node is left exactly as it was rather than stripped.
            filled = organizer_node(org)
            if filled:
                ev["organizer"] = filled
        if not ev.get("performer"):
            teams = [t for t in (ev.get("awayTeam"), ev.get("homeTeam")) if isinstance(t, dict)]
            if not teams and isinstance(ev.get("competitor"), list):
                teams = [t for t in ev["competitor"] if isinstance(t, dict)]
            if teams:
                ev["performer"] = [dict(t) for t in teams]
        if not ev.get("organizer"):
            body = SPORT_ORGANIZERS.get((ev.get("sport") or "").strip().lower())
            filled = organizer_node(body) if body else None
            if filled:
                ev["organizer"] = filled
        place = ev.get("location")
        if isinstance(place, dict) and not place.get("address"):
            postal = postal_address(venue_address(place.get("name")))
            if postal:
                place["address"] = postal
        if json.dumps(ev, sort_keys=True, ensure_ascii=False) != before:
            fixed += 1
    return fixed


def process(path, dry):
    # newline="" on both ends: these files are a mix of LF and CRLF, and
    # normalising a file's line endings on the way past would turn a two line
    # schema fix into a whole file rewrite in the diff.
    raw = io.open(path, encoding="utf-8", newline="").read()
    eol = "\r\n" if "\r\n" in raw else "\n"
    if "ld+json" not in raw or "Event" not in raw:
        return 0
    m = STATUS_HTML.search(raw)
    status_text = re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else ""

    total = [0]

    def rewrite(block):
        head, body, tail = block.group(1), block.group(2), block.group(3)
        try:
            doc = json.loads(body)
        except ValueError:
            return block.group(0)
        n = repair_doc(doc, status_text)
        if not n:
            return block.group(0)
        total[0] += n
        # the exact whitespace that framed the original JSON, kept so the only
        # thing this script can ever change is the JSON itself
        lead = body[:len(body) - len(body.lstrip())] or eol
        trail = body[len(body.rstrip()):]
        rendered = json.dumps(doc, indent=2, ensure_ascii=False)
        if eol != "\n":
            rendered = rendered.replace("\n", eol)
        return head + lead + rendered + trail + tail

    new = LD.sub(rewrite, raw)
    if not total[0]:
        return 0
    for block in LD.finditer(new):          # syntax gate before anything is written
        json.loads(block.group(2))
    if not dry:
        io.open(path, "w", encoding="utf-8", newline="").write(new)
    return total[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--root", default=".")
    args = ap.parse_args()
    pages = events = 0
    for base, dirs, files in os.walk(args.root):
        dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "dist", "build")]
        for name in files:
            if not name.endswith(".html"):
                continue
            path = os.path.join(base, name)
            n = process(path, args.dry_run)
            if n:
                pages += 1
                events += n
                print("  %s  %d event(s)" % (path.replace("\\", "/"), n))
    print("%s %d event node(s) across %d page(s)"
          % ("would repair" if args.dry_run else "repaired", events, pages))


if __name__ == "__main__":
    main()
