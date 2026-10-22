#!/usr/bin/env python3
"""Rebuild the existing tennis Game File pages (tennis/<slug>/) in place.

URLs never change. For each page the title, H1, meta description, JSON-LD and
lede are rewritten to name the tournament and the real round from the ESPN feed,
the filler sentences are removed, and the research preview is rebuilt through
featured_preview.build (which blocks a page whose data is missing and never
writes a pregame preview after the match has started).

    python scripts/tennis_game_files.py [--root .] [--limit N] [--dry]
"""

import argparse
import datetime as dt
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import featured_matchups  # noqa: E402,F401
import featured_preview as fp  # noqa: E402
import nfl_featured_rotation as nfl  # noqa: E402
import sports_featured_rotation as rot  # noqa: E402

# Sentences the old builder wrote that say nothing about the match.
FILLER = (
    "The event is in its opening rounds, and this match is on the board.",
    "The draw has reached the semifinals. One win puts the winner in the final.",
    "The draw has reached the quarterfinals, and the winner plays for a place in the final.",
    "This is the final. One match decides the event.",
    "Sixteen players are left, and this match is one of them.",
    "This match is in the round of thirty two.",
    "That is how the matchup profiled on the numbers. The final result is at the top of the page.",
)


def strip_filler(text):
    """Remove the filler sentences, and any <p> left empty by doing so."""
    for line in FILLER:
        text = text.replace(" " + line, "").replace(line, "")
    return re.sub(r"<p>\s*</p>\n?", "", text)


def drop_mismatched_preview(text):
    """Remove a research preview whose player cards are not the two players in
    the page's own H1. ESPN reused match ids, and a few pages carried another
    match's players; a wrong preview is worse than none."""
    h1 = re.search(r"<h1>(.*?)</h1>", text, flags=re.S)
    pair = re.match(r"(.+?) vs (.+?) Preview", html.unescape(h1.group(1))) if h1 else None
    cards = [html.unescape(x) for x in re.findall(r'<p class="fp-name">(.*?)</p>', text)]
    if not pair or not cards or sorted(cards[:2]) == sorted(pair.groups()):
        return text
    return re.sub(re.escape(fp_begin) + r".*?" + re.escape(fp_end), "", text, count=1, flags=re.S)


fp_begin, fp_end = rot.PREVIEW_BEGIN, rot.PREVIEW_END


def _both(old, new, text):
    """Swap a string in its HTML-escaped and JSON-escaped spellings."""
    for a, b in ((html.escape(old), html.escape(new)),
                 (json.dumps(old)[1:-1], json.dumps(new)[1:-1])):
        text = text.replace(a, b)
    return text


def retitle(text, game):
    """New text for one page, or the page unchanged when nothing can be said."""
    h1 = re.search(r"<h1>(.*?)</h1>", text, flags=re.S)
    desc = re.search(r'<meta name="description" content="(.*?)">', text, flags=re.S)
    if not h1 or not desc:
        return text
    old_head, old_desc = html.unescape(h1.group(1)), html.unescape(desc.group(1))
    story = rot.specific_story(game)
    if not story:
        return text
    _angle, new_head, body = story
    new_desc = "%s vs %s. %s" % (game["away"]["display"], game["home"]["display"], body[0])
    if rot.DATE_IN_TITLE.search(new_head):
        return text
    text = _both(old_head, new_head, text)
    text = _both(old_desc, new_desc, text)
    lede = re.search(r'(<p class="when" data-feat-when>.*?</p>\n)(.*?)(?=<!--FEATURED_PREVIEW-->|<div class="links">)',
                     text, flags=re.S)
    if lede:
        paras = "\n".join("<p>%s</p>" % html.escape(part) for part in body) + "\n"
        text = text[:lede.start(2)] + paras + text[lede.end(2):]
    return text


def _game(league, event_id, kickoff, old_h1, get):
    """(game, resolved match id) for the page, or None. The players come from
    the page's own H1 and must be the two players in the feed's match."""
    pair = re.match(r"(.+?) vs (.+?) Preview", old_h1)
    if not pair:
        return None
    away, home = pair.group(1), pair.group(2)
    found = fp._find_tennis_match(league, event_id, kickoff, get, names=[away, home])
    if not found:
        return None
    ev, comp, _events = found
    return str(comp.get("id")), {"sport": "tennis", "away": {"display": away, "name": away}, "home": {"display": home, "name": home},
            "round": (comp.get("round") or {}).get("displayName") or "", "notes": ev.get("name") or "",
            "venue": (comp.get("venue") or {}).get("fullName") or "", "starters": {}, "passers": {}}


def rebuild(root, now=None, get=None, limit=None, dry=False):
    now = now or dt.datetime.now(dt.timezone.utc)
    store = rot.load_store(root) if hasattr(rot, "load_store") else {}
    tennis = {k: v for k, v in sorted(store.items()) if k.startswith("tennis:")}
    resolved = {}
    stats = {"pages": 0, "retitled": 0, "stripped": 0, "previews": 0, "skipped": 0}
    for key, row in tennis.items():
        if limit and stats["pages"] >= limit:
            break
        href = (row or {}).get("href") or ""
        page = os.path.join(root, href.strip("/").replace("/", os.sep), "index.html")
        if not href or not os.path.isfile(page):
            continue
        stats["pages"] += 1
        with open(page, encoding="utf-8", newline="") as fh:
            text = fh.read()
        before = text
        _sport, league, event_id = key.split(":", 2)
        found = re.search(r'"startDate":\s*"([^"]+)"', text)
        kickoff = nfl.parse_utc(found.group(1)) if found else None
        h1 = re.search(r"<h1>(.*?)</h1>", text, flags=re.S)
        hit = _game(league, event_id, kickoff, html.unescape(h1.group(1)), get or nfl._get_json) if h1 else None
        if hit:
            resolved[key] = "tennis:%s:%s" % (league, hit[0])
            text = retitle(text, hit[1])
            if text != before:
                stats["retitled"] += 1
        wrong = drop_mismatched_preview(text)
        if wrong != text:
            stats["dropped"] = stats.get("dropped", 0) + 1
        text = wrong
        stripped = strip_filler(text)
        if stripped != text:
            stats["stripped"] += 1
        text = stripped
        if text == before:
            stats["skipped"] += 1
        if not dry and text != before:
            with open(page, "w", encoding="utf-8", newline="") as fh:
                fh.write(text)
    if not dry:
        # preview rebuild, forced, through the normal enrich path
        # only pages whose match was confirmed by player names get a rebuilt preview
        sub = {resolved[k]: v for k, v in tennis.items() if k in resolved}
        limited = dict(list(sub.items())[:limit]) if limit else sub
        stats["previews"] = rot.enrich_pages(root, limited, now=now, get=get, force=True)
    return stats


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.dirname(HERE))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args(argv)
    print(json.dumps(rebuild(args.root, limit=args.limit, dry=args.dry)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
