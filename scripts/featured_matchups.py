#!/usr/bin/env python3
"""FEATURED MATCHUPS: one registry, every surface baked from it.

FEATURED_SOURCE_OF_TRUTH_20260914.

Why this exists. On 2026-09-14 the NFL Featured Matchups menu still opened
49ers at Rams, a game played the previous Thursday. The site had THREE
independent places that each stored "the featured NFL article":

  1. /matchup-of-the-day/nfl/, rewritten by build_matchup_articles.py on every
     hourly Matchup of the Day bake from the newest NFL Game File in the
     database, with no notion of kickoff;
  2. /nfl-game-of-the-week/, a forwarder edited by hand;
  3. the sportsbook strip, a FEATURES list typed into sportsbook/index.html.

The handicapping hub card then copied whatever door 1 said. On 2026-09-11 at
21:21 PT every slot was hand pointed at Bills at Texans (42c5779a52); at
05:06 PT the next morning the MLB lane's bake rewrote door 1 back to the
49ers Game File (1d80343de8) and the hub followed it. Nobody did anything
wrong on the day; the design guaranteed drift.

The rule now:

  * data/featured-matchups.json is the ONLY place a featured article is named.
  * resolve() picks the active one: of the entries with status "active" whose
    kickoff plus grace_minutes is still in the future (and whose optional
    start_utc has arrived), the one with the EARLIEST kickoff. So a game is
    featured up to and through its own broadcast and retires on the clock, and
    the next designated game takes over by itself. A finished game can never be
    the current feature. If nothing qualifies, there is no feature: doors show
    a plain page pointing at the sport's hub, and the card and strip hide.
  * Every surface is baked from resolve() here, and static/js/tmr-featured.js
    runs the SAME rule in the browser against the same JSON, so a page baked
    before kickoff still rolls over at the right minute without a rebuild.
  * tests/featured-matchups-sync-test.js fails if a surface disagrees with the
    registry, if the Python and JS resolvers ever disagree, or if a hand kept
    feature list reappears anywhere.

Editorial workflow: publish the article, append one entry (href, kickoff_utc,
headline, matchup, when, label, logos), run `python scripts/featured_matchups.py
sync`, commit. Nothing else is edited by hand. A published database Game File
for a managed sport that carries featured_on is appended automatically by
build_matchup_articles.py via upsert_game_files().

  python scripts/featured_matchups.py sync            write every surface
  python scripts/featured_matchups.py sync --check    exit 1 if any surface is stale
  python scripts/featured_matchups.py resolve nfl     print the active entry
"""

import datetime as dt
import hashlib
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(ROOT, "data", "featured-matchups.json")
SITE = "https://trustmyrecord.com"
RUNTIME_JS = "static/js/tmr-featured.js"
DEFAULT_GRACE_MINUTES = 210


# ------------------------------------------------------------------ registry

def load(path=None):
    """The registry, or None when the file does not exist (a sandbox tree).

    A file that exists but does not parse is fatal: silently treating a broken
    registry as "nothing featured" would blank every surface on the site."""
    path = path or REGISTRY
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        reg = json.load(fh)
    if not isinstance(reg.get("sports"), dict):
        raise ValueError("%s has no sports object" % path)
    return reg


def save(reg, path=None):
    path = path or REGISTRY
    text = json.dumps(reg, indent=2, ensure_ascii=False) + "\n"
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


def managed_sports(reg):
    return sorted((reg or {}).get("sports", {}).keys())


def parse_utc(value):
    if not value or not isinstance(value, str):
        return None
    try:
        t = dt.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if t.tzinfo is None:
        return None
    return t.astimezone(dt.timezone.utc)


def now_utc():
    return dt.datetime.now(dt.timezone.utc)


def resolve(reg, sport, now=None):
    """The active featured entry for `sport`, or None. Mirrors resolve() in
    static/js/tmr-featured.js line for line; the sync test holds them equal."""
    now = now or now_utc()
    s = (reg or {}).get("sports", {}).get(sport)
    if not s:
        return None
    grace = dt.timedelta(minutes=float(reg.get("grace_minutes", DEFAULT_GRACE_MINUTES)))
    best, best_k = None, None
    for f in s.get("features") or []:
        if not isinstance(f, dict) or (f.get("status") or "active") != "active":
            continue
        if not f.get("href"):
            continue
        k = parse_utc(f.get("kickoff_utc"))
        if k is None:
            continue
        if f.get("start_utc"):
            st = parse_utc(f.get("start_utc"))
            if st is None or now < st:
                continue
        if now >= k + grace:
            continue
        if best is None or k < best_k:
            best, best_k = f, k
    return best


def upsert_game_files(reg, articles):
    """Register every published, featured database Game File of a managed sport.

    Returns True when the registry changed. Existing entries keep their status,
    so an editor can withdraw a Game File from the feature without the next bake
    putting it back."""
    if not reg:
        return False
    changed = False
    for a in articles or []:
        sport = a.get("sport")
        s = reg["sports"].get(sport)
        if not s or not a.get("angle_key") or not a.get("featured_on"):
            continue
        if (a.get("status") or "published") not in ("published", "updated"):
            continue
        k = parse_utc(a.get("game_time_utc"))
        if k is None:
            continue
        href = "/%s/%s/" % ("matchup-of-the-day", a["slug"])
        entry = {
            "id": "game-file-%s" % a.get("id"),
            "source": "game-file",
            "status": "active",
            "href": href,
            "headline": a.get("h1") or "%s vs. %s" % (a.get("away_team"), a.get("home_team")),
            "matchup": "%s vs. %s" % (a.get("away_team"), a.get("home_team")),
            "when": "",
            "label": "%s Matchup of the Day" % s.get("label", sport.upper()),
            "cta": "Read the full breakdown",
            "away_logo": "",
            "home_logo": "",
            "kickoff_utc": k.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        features = s.setdefault("features", [])
        current = next((f for f in features if f.get("id") == entry["id"]), None)
        if current is None:
            features.append(entry)
            changed = True
            continue
        for key in ("href", "headline", "matchup", "kickoff_utc"):
            if current.get(key) != entry[key]:
                current[key] = entry[key]
                changed = True
    return changed


# ----------------------------------------------------------------- rendering

def esc(value):
    return html.escape("" if value is None else str(value), quote=True)


def runtime_src(root=ROOT):
    """/static/js/tmr-featured.js pinned to its content hash, computed exactly as
    scripts/version_static_refs.py does, so the asset workflow never re-pins it."""
    path = os.path.join(root, RUNTIME_JS)
    try:
        with open(path, "rb") as fh:
            tag = hashlib.sha256(fh.read()).hexdigest()[:12]
        return "/%s?v=%s" % (RUNTIME_JS, tag)
    except OSError:
        return "/" + RUNTIME_JS


DOOR_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="index, follow">
<!-- FEATURED_SOURCE_OF_TRUTH_20260914. Baked by scripts/featured_matchups.py
     from data/featured-matchups.json. Do not edit by hand: the next bake
     overwrites it, and tmr-featured.js re-resolves the registry on load. -->
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{canonical}">
{refresh}<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
<style>
  html,body{{margin:0;background:#070910;color:#CBD5E1;
    font:500 15px/1.6 Inter,system-ui,-apple-system,'Segoe UI',sans-serif}}
  .t{{max-width:34rem;margin:0 auto;padding:22vh 24px 0}}
  .t p{{color:#8A97A8;margin:0 0 14px;font-size:12px;font-weight:800;
    letter-spacing:.16em;text-transform:uppercase}}
  .t a{{color:#F7F9FC;font-size:1.4rem;font-weight:800;line-height:1.25;
    letter-spacing:-.02em;text-decoration:none;border-bottom:2px solid #35E0CB}}
  .t small{{display:block;margin-top:18px;color:#8A97A8;font-size:.9rem}}
</style>
</head>
<body>
<main class="t" data-tmr-featured-door="{sport}" data-baked-href="{baked}" data-baked-kickoff="{kickoff}" data-hub="{hub}">
  <p>{eyebrow}</p>
  <a href="{target}">{headline}</a>{note}
</main>
<script src="{runtime}"></script>
<script>window.TMRFeatured&&TMRFeatured.door(document.querySelector('[data-tmr-featured-door]'));</script>
</body>
</html>
"""


def door_html(reg, sport, door, feature, root=ROOT):
    s = reg["sports"][sport]
    hub = s.get("hub") or "/"
    if feature:
        return DOOR_TEMPLATE.format(
            title=esc("%s: %s | TrustMyRecord" % (door["eyebrow"], feature.get("matchup") or feature.get("headline"))),
            description=esc("%s: %s. Opening the full analysis." % (door["eyebrow"], feature.get("matchup") or feature.get("headline"))),
            canonical=esc(SITE + feature["href"]),
            target=esc(feature["href"]),
            kickoff=esc(feature.get("kickoff_utc") or ""),
            hub=esc(hub), sport=esc(sport), eyebrow=esc(door["eyebrow"]),
            headline=esc(feature.get("headline") or feature.get("matchup")),
            note="", runtime=esc(runtime_src(root)), baked=esc(feature["href"]),
            refresh='<noscript><meta http-equiv="refresh" content="0; url=%s"></noscript>\n'
                    % esc(feature["href"]))
    # Nothing featured: a plain, self canonical page that links the hub. No
    # refresh, because a stub whose canonical and refresh disagree is exactly
    # what tests/seo-indexability-regression-test.js forbids.
    return DOOR_TEMPLATE.format(
        title=esc("%s | TrustMyRecord" % door["eyebrow"]),
        description=esc("%s: the next featured matchup publishes ahead of its kickoff. Every game on the board is in the %s handicapping hub." % (door["eyebrow"], s.get("label", sport.upper()))),
        canonical=esc(SITE + door["url"]),
        target=esc(hub), kickoff="", hub=esc(hub), sport=esc(sport),
        eyebrow=esc(door["eyebrow"]),
        headline=esc("%s handicapping: every game on the board" % s.get("label", sport.upper())),
        note="\n  <small>The next featured matchup publishes ahead of its kickoff.</small>",
        runtime=esc(runtime_src(root)), baked="", refresh="")


CARD_CSS = (
    ".mm-gotw[hidden]{display:none!important}"
    ".mm-gotw-card{display:block;text-decoration:none;color:inherit;padding:18px 20px;"
    "border-radius:16px;background:linear-gradient(120deg,rgba(255,201,60,.13),"
    "rgba(0,53,148,.16) 58%,rgba(170,0,0,.15));border:1px solid rgba(255,201,60,.4)}"
    ".mm-gotw-card:hover{border-color:#FFC93C}"
    ".mm-gotw-tag{display:inline-block;font:800 .68rem/1 'Barlow Condensed',Inter,sans-serif;"
    "letter-spacing:.18em;text-transform:uppercase;color:#04101c;background:#FFC93C;"
    "padding:6px 10px;border-radius:5px}"
    ".mm-gotw-teams{display:block;margin:13px 0 9px}"
    ".mm-gotw-teams b{font:900 1.25rem/1.15 'Barlow Condensed',Inter,sans-serif;"
    "text-transform:uppercase}"
    ".mm-gotw-when{display:block;color:#93a4bb;font-size:.9rem;margin:-4px 0 8px}"
    ".mm-gotw-when:empty{display:none}"
    ".mm-gotw-cta{display:inline-block;margin-top:4px;font-weight:800;color:#FFC93C;font-size:.9rem}"
    ".mm-gotw-archive{margin:10px 2px 0;font-size:.84rem;line-height:1.7;color:#93a4bb}"
    ".mm-gotw-archive span{font-weight:800;color:#cbd5e1;margin-right:6px}"
    ".mm-gotw-archive a{color:#9fc6ff!important;text-decoration:none}"
    ".mm-gotw-archive a:hover{text-decoration:underline}")


def card_html(reg, sport, feature, root=ROOT, now=None):
    """The hub card, wrapped in MK markers so sync can refresh it between hub
    rebakes. Rendered hidden when nothing is featured, so the browser can still
    fill it if the registry moves on before the next bake."""
    f = feature or {}
    hidden = "" if feature else " hidden"
    when = " · ".join(x for x in (f.get("matchup"), f.get("when")) if x)
    return (
        '        <!--MK:featured-card-%s-->\n'
        '        <section class="mm-sec mm-gotw" data-tmr-featured="%s" data-tmr-featured-role="card"%s>\n'
        '            <a class="mm-gotw-card" data-feat-link href="%s">\n'
        '                <span class="mm-gotw-tag" data-feat="label">%s</span>\n'
        '                <span class="mm-gotw-teams"><b data-feat="headline">%s</b></span>\n'
        '                <span class="mm-gotw-when" data-feat="matchup_when">%s</span>\n'
        '                <span class="mm-gotw-cta"><span data-feat="cta">%s</span> &rsaquo;</span>\n'
        '            </a>\n'
        '        </section>\n'
        '%s'
        '        <style>%s</style>\n'
        '        <script src="%s" defer></script>\n'
        '        <!--/MK:featured-card-%s-->\n'
    ) % (esc(sport), esc(sport), hidden,
         esc(f.get("href") or reg["sports"][sport].get("hub") or "/"),
         esc(f.get("label") or "%s Featured Matchup" % reg["sports"][sport].get("label", "")),
         esc(f.get("headline") or ""), esc(when),
         esc(f.get("cta") or "Read the full breakdown"),
         archive_html(reg, sport, now), CARD_CSS, esc(runtime_src(root)), esc(sport))


def archive_html(reg, sport, now=None, limit=12):
    """Every finished feature of the sport, newest first. A featured article
    leaves the card when its game ends; this list keeps it one click from its
    hub for good, so a retired feature never becomes an orphan page."""
    now = now or now_utc()
    s = reg["sports"][sport]
    grace = dt.timedelta(minutes=float(reg.get("grace_minutes", DEFAULT_GRACE_MINUTES)))
    past = []
    for f in s.get("features") or []:
        k = parse_utc(f.get("kickoff_utc"))
        if (f.get("href") and k is not None and now >= k + grace
                and (f.get("status") or "active") != "withdrawn"):
            past.append((k, f))
    past.sort(key=lambda kf: kf[0], reverse=True)
    if not past:
        return ""
    links = " &middot; ".join('<a href="%s">%s</a>' % (esc(f["href"]), esc(f.get("headline") or f.get("matchup")))
                              for _, f in past[:limit])
    return ('        <p class="mm-gotw-archive"><span>Earlier %s features</span> %s</p>\n'
            % (esc(s.get("label", sport.upper())), links))


def strip_html(reg, sport, feature, root=ROOT):
    """The sportsbook strip body. The strip's CSS stays in sportsbook/index.html."""
    f = feature or {}
    hidden = "" if feature else " hidden"
    return (
        '\n        <a class="sb-gotw" id="sbFeatureStrip" data-tmr-featured="%s" data-tmr-featured-role="strip" data-feat-link href="%s"%s>\n'
        '            <span class="sb-gotw-tag" data-feat="label">%s</span>\n'
        '            <span class="sb-gotw-main">\n'
        '                <img data-feat-img="away_logo" src="%s" alt="" width="32" height="32" loading="lazy">\n'
        '                <b data-feat="matchup">%s</b>\n'
        '                <img data-feat-img="home_logo" src="%s" alt="" width="32" height="32" loading="lazy">\n'
        '                <em data-feat="when">%s</em>\n'
        '            </span>\n'
        '            <span class="sb-gotw-cta"><span data-feat="cta">%s</span> <i class="fas fa-arrow-right" aria-hidden="true"></i></span>\n'
        '        </a>\n'
        '        <script src="%s" defer></script>\n        '
    ) % (esc(sport), esc(f.get("href") or reg["sports"][sport].get("hub") or "/"), hidden,
         esc(f.get("label") or ""), esc(f.get("away_logo") or ""), esc(f.get("matchup") or ""),
         esc(f.get("home_logo") or ""), esc(f.get("when") or ""),
         esc(f.get("cta") or "Read the full breakdown"), esc(runtime_src(root)))


def _replace_marker(text, key, payload, path):
    pattern = re.compile(r"(<!--MK:%s-->)(.*?)(<!--/MK:%s-->)" % (re.escape(key), re.escape(key)), re.S)
    if not pattern.search(text):
        raise RuntimeError("marker MK:%s not found in %s" % (key, path))
    return pattern.sub(lambda m: m.group(1) + payload + m.group(3), text, count=1)


LEGACY_CARD = re.compile(r'        <section class="mm-sec mm-gotw">.*?</section>\n        <style>[^<]*</style>\n', re.S)
CARD_BLOCK = re.compile(r"        <!--MK:featured-card-(\w+)-->\n.*?<!--/MK:featured-card-\1-->\n", re.S)


def render_surfaces(reg, now=None, root=ROOT, read=None):
    """Every featured surface as (absolute path, new text). Pure: writes nothing.

    `read(path)` returns the current text of a file that is patched in place
    (hub, sportsbook); doors are whole files and are always regenerated."""
    if not reg:
        return []
    read = read or (lambda p: open(p, encoding="utf-8").read())
    writes = []
    for sport in managed_sports(reg):
        s = reg["sports"][sport]
        feature = resolve(reg, sport, now)
        for door in s.get("doors") or []:
            writes.append((os.path.join(root, door["file"]), door_html(reg, sport, door, feature, root)))
        hub_file = s.get("hub_file")
        if hub_file and os.path.exists(os.path.join(root, hub_file)):
            path = os.path.join(root, hub_file)
            text = read(path)
            card = card_html(reg, sport, feature, root, now)
            m = CARD_BLOCK.search(text)
            if m and m.group(1) == sport:
                writes.append((path, text[:m.start()] + card + text[m.end():]))
            else:
                # A hub baked before this system carries the old unmarked card,
                # which copied the door. Swap it for the marked one in place.
                legacy = LEGACY_CARD.search(text)
                if legacy:
                    writes.append((path, text[:legacy.start()] + card + text[legacy.end():]))
        for strip in s.get("strips") or []:
            path = os.path.join(root, strip["file"])
            if os.path.exists(path):
                writes.append((path, _replace_marker(read(path), strip["marker"],
                                                     strip_html(reg, sport, feature, root), path)))
    return writes


def write_preserving_newlines(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    newline = "\n"
    if os.path.exists(path):
        with open(path, "rb") as fh:
            existing = fh.read()
        crlf = existing.count(b"\r\n")
        if crlf > existing.count(b"\n") - crlf:
            newline = "\r\n"
    with open(path, "w", encoding="utf-8", newline=newline) as fh:
        fh.write(text)


def _normalise(text):
    return text.replace("\r\n", "\n")


def sync(check=False, now=None, root=ROOT):
    reg = load(os.path.join(root, "data", "featured-matchups.json"))
    if not reg:
        print("featured: no registry at data/featured-matchups.json; nothing to sync")
        return 0
    stale = []
    for path, text in render_surfaces(reg, now=now, root=root):
        current = open(path, encoding="utf-8").read() if os.path.exists(path) else None
        if current is not None and _normalise(current) == _normalise(text):
            continue
        stale.append(os.path.relpath(path, root))
        if not check:
            write_preserving_newlines(path, text)
    for sport in managed_sports(reg):
        f = resolve(reg, sport, now)
        print("featured: %s -> %s" % (sport, f["href"] + " (" + f["id"] + ")" if f else "none active"))
    if check and stale:
        print("featured: STALE surfaces: " + ", ".join(stale))
        return 1
    print("featured: %s" % ("rewrote " + ", ".join(stale) if stale else "every surface already current"))
    return 0


def main(argv):
    if len(argv) >= 2 and argv[1] == "resolve":
        reg = load()
        sport = argv[2] if len(argv) > 2 else "nfl"
        print(json.dumps(resolve(reg, sport), indent=2, ensure_ascii=False))
        return 0
    if len(argv) >= 2 and argv[1] == "sync":
        return sync(check="--check" in argv)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
