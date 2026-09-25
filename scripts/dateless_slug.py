#!/usr/bin/env python3
"""Dateless URL slugs (SEO rule: no dates or years in any URL), 2026-09-24.

strip_dates(slug)  removes calendar dates and years from a slug:
                   m-d-yyyy, yyyy-mm-dd, month name + day (+ year), and bare
                   years 2000..2039. A bare "m-d" pair is NOT touched, because
                   in a betting title it is usually a spread ("florida-state-3-5").
is_dated(slug)     True when strip_dates would change the slug.
content_slug(...)  a descriptive slug from a pick card's first play, used when
                   the dateless title slug is generic ("mlb-picks").
public_slug(id, s) the published slug for forum thread <id>: the frozen override
                   from data/forum-slug-overrides.json when one exists, else s.
                   Existing URLs outside the override map are never rewritten.

The backend's create-thread slugger (routes/forum.js, dashless helper
services/datelessSlug.js) applies the same rules to every NEW thread.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OVERRIDES = os.path.join(ROOT, "data", "forum-slug-overrides.json")

MONTHS = ("january|february|march|april|may|june|july|august|september|october|"
          "november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec")
_PATTERNS = [
    re.compile(r"(?:^|-)(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12]\d|3[01])-(?:19|20)\d\d(?=-|$)"),
    re.compile(r"(?:^|-)(?:19|20)\d\d-(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12]\d|3[01])(?=-|$)"),
    re.compile(r"(?:^|-)(?:%s)-(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?(?:-(?:19|20)\d\d)?(?=-|$)" % MONTHS),
    re.compile(r"(?:^|-)20[0-3]\d(?=-|$)"),
]
_TRAIL_STOP = {"for", "in", "of", "the", "on", "at", "and", "a", "to", "since", "from"}
GENERIC = {"mlb-picks", "nfl-picks", "nba-picks", "nhl-picks", "picks", "mlb", "nfl",
           "nba", "nhl", "card", "mlb-card", "todays-picks", "thread"}


def _tidy(slug):
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    words = slug.split("-") if slug else []
    while words and words[-1] in _TRAIL_STOP:
        words.pop()
    while words and words[0] in _TRAIL_STOP:
        words.pop(0)
    return "-".join(words)


def strip_dates(slug):
    s = (slug or "").lower()
    for pat in _PATTERNS:
        s = pat.sub("-", s)
    return _tidy(s)


def is_dated(slug):
    return strip_dates(slug) != (slug or "").lower().strip("-")


def slugify(text, limit=100):
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return re.sub(r"-{2,}", "-", s)[:limit].strip("-")


def is_generic(slug):
    return not slug or slug in GENERIC or len(slug.split("-")) < 3


_NOT_A_PLAY = re.compile(r"\b(today|updated|units total|picks for|units are|odds:|units:)", re.I)


def plays(content):
    """Each play line of a pick card, as a slug ("brewers-vs-cardinals-under-8")."""
    out = []
    for line in (content or "").splitlines():
        line = line.strip()
        if not line or _NOT_A_PLAY.search(line):
            continue
        line = line.split(",")[0]
        line = re.sub(r"\s[+-]\d{3}\b.*$", "", line)            # trailing price
        line = re.sub(r"\s*/\s*", " vs ", line)
        line = re.sub(r"\bml\b", "moneyline", line, flags=re.I)
        line = re.sub(r"\btt\b", "team total", line, flags=re.I)
        line = re.sub(r"\+(?=\d)", " plus ", line)
        line = re.sub(r"(?<![\w.])-(?=\d)", " minus ", line)
        slug = strip_dates(slugify(line))
        if slug:
            out.append(slug)
    return out


def content_slug(prefix, content, taken=(), limit=90):
    """prefix + the card's first play; the second play joins it when the first
    is already taken, so every card gets its own readable URL."""
    ps = plays(content)
    for n in range(1, len(ps) + 1):
        cand = "-".join([prefix] + ps[:n])[:limit].strip("-")
        if cand not in taken:
            return cand
    # Every combination is taken (a one play card repeating an earlier one).
    # The thread id in /forum/thread/<id>/ keeps the URL unique regardless.
    return "-".join([prefix] + ps[:1])[:limit].strip("-") if ps else prefix


def load_overrides():
    try:
        with open(OVERRIDES, encoding="utf-8") as fh:
            return {str(k): v for k, v in json.load(fh).get("threads", {}).items()}
    except (OSError, ValueError):
        return {}


_CACHE = None


def public_slug(tid, slug):
    global _CACHE
    if _CACHE is None:
        _CACHE = load_overrides()
    row = _CACHE.get(str(tid))
    return (row.get("new") if isinstance(row, dict) else row) or slug
