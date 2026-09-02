"""Make every matchup title unique, without unfreezing a hook.

Two games in the same series can end up with the same frozen hook: a hook is
chosen once per game and never recomputed, so two Brewers-Cubs games frozen in
different runs both kept "Pete Crow-Armstrong Has 6 Home Runs in His Last 10
Games". Rewriting one of them would break the promise that a title does not
change after the fact.

So the hook stays and the date is appended to the later game instead, which is
both true and the thing that actually distinguishes them. Ordering is by game
id, which is stable, so the same page keeps the same title on every run.

Runs after the builders, over the whole tree, so it also catches a doubleheader
whose two archive pages were published with identical dated titles.
"""
import collections
import datetime
import html as _html
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
TITLE = re.compile(r"<title>(.*?)</title>", re.S)
GAME_ID = re.compile(r"-(\d{5,})$")


def page_date(html):
    """The game date the page already states, so nothing new is invented."""
    m = re.search(r'"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2})', html)
    if not m:
        m = re.search(r"(\d{4}-\d{2}-\d{2})T\d\d:\d\d", html)
    if not m:
        return None
    try:
        d = datetime.date.fromisoformat(m.group(1))
    except ValueError:
        return None
    return d.strftime("%b ") + str(d.day)


def main():
    seen = collections.defaultdict(list)
    for sport in ("mlb", "nfl", "nba", "nhl"):
        root = os.path.join(REPO, "handicapping", sport)
        if not os.path.isdir(root):
            continue
        for name in sorted(os.listdir(root)):
            path = os.path.join(root, name, "index.html")
            if "-vs-" not in name or not os.path.isfile(path):
                continue
            html = io.open(path, encoding="utf-8").read()
            m = TITLE.search(html)
            if not m:
                continue
            seen[_html.unescape(m.group(1)).strip()].append((name, path, html, m.group(1)))

    changed = 0
    for title, entries in seen.items():
        if len(entries) < 2:
            continue
        # Lowest game id keeps the plain title; the rest say which date they are.
        entries.sort(key=lambda e: int(GAME_ID.search(e[0]).group(1))
                     if GAME_ID.search(e[0]) else 0)
        for name, path, html, raw in entries[1:]:
            when = page_date(html)
            if not when:
                print("SKIP %s: no date on the page to disambiguate with" % name)
                continue
            new = "%s (%s)" % (raw, when)
            io.open(path, "w", encoding="utf-8", newline="\n").write(
                html.replace("<title>%s</title>" % raw, "<title>%s</title>" % new, 1))
            print("%-36s -> %s" % (name, _html.unescape(new)[:76]))
            changed += 1
    print("titles disambiguated: %d" % changed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
