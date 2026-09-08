"""
Build /tennis/rundown/ — the day's prominent tennis matchups, as a page.

Nima, Sep 7 2026: "every day you are going to write a rundown of all the
prominent tennis matchups for the day ... talk about rankings history schedules
players ... and always submit to Google Search Console."

WHERE THE WORDS COME FROM. The API composes every sentence from a value that
came out of the checked pipeline, and this script does no writing of its own.
That is deliberate: a rundown covering a dozen matches, rebuilt unattended every
morning, is exactly the page where an invented number would sit unnoticed
longest. The Game Files are the written pieces and they go through the publish
gate; this one is a page that cannot be wrong.

FAIL CLOSED. /api/tennis/rundown answers 409 when any figure is past its own
shelf life, and this script exits non-zero on anything but a 200 WITHOUT
touching the page on disk. A morning with yesterday's rundown still up is a
smaller problem than a morning with today's date over Monday's rankings, and the
runner's own log is where the failure shows.

NO DATE IN THE URL. The address is stable and the page carries the date in its
own copy and in its schema, per the standing rule.

Usage:
    python scripts/build_tennis_rundown.py [--api URL] [--date YYYY-MM-DD] [--limit 12]
"""
import argparse
import datetime
import html
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "tennis", "rundown")
SITE = "https://trustmyrecord.com"
DEFAULT_API = "https://trustmyrecord-api.onrender.com/api"


def esc(value):
    return html.escape("" if value is None else str(value), quote=True)


def get(url, attempts=3):
    last = None
    for i in range(attempts):
        if i:
            import time
            time.sleep(2 * i)
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8")), r.status
        except urllib.error.HTTPError as err:
            # A 409 is the currency gate refusing, and it is not a transient
            # failure: retrying it just asks the same stale question again.
            body = err.read().decode("utf-8", "replace")
            try:
                return json.loads(body), err.code
            except ValueError:
                return {"error": body[:400]}, err.code
        except Exception as err:                                  # noqa: BLE001
            last = err
    raise SystemExit("ABORT: could not reach %s (%s)" % (url, last))


def local_time(iso):
    """The start time as a reader in the United States reads it, with the zone
    named, because a bare clock time on a page read from three time zones is a
    number that is wrong for two of them."""
    if not iso:
        return ""
    try:
        t = datetime.datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return ""
    eastern = t - datetime.timedelta(hours=4)      # US Open runs on EDT
    return eastern.strftime("%-I:%M %p ET") if os.name != "nt" else eastern.strftime("%I:%M %p ET").lstrip("0")


def player_cell(p, surface):
    card = p.get("card") or {}
    rank = card.get("rank")
    rec = card.get("record") or {}
    surf = card.get("surface_record")
    initials = "".join(w[0] for w in str(p.get("name") or "").split()[:2]).upper()
    bits = []
    if rank:
        bits.append("No. %s" % esc(rank))
    if p.get("country"):
        bits.append(esc(p["country"]))
    if card.get("titles"):
        bits.append("%s titles" % esc(card["titles"]))
    stats = []
    if rec:
        stats.append("<span><b>%s-%s</b> season</span>" % (esc(rec.get("wins", 0)), esc(rec.get("losses", 0))))
    if surf and surface:
        stats.append("<span><b>%s-%s</b> on %s</span>" % (
            esc(surf.get("wins", 0)), esc(surf.get("losses", 0)), esc(str(surface).lower())))
    form = card.get("form") or {}
    if form.get("n"):
        stats.append("<span><b>%s-%s</b> last %s</span>" % (
            esc(form.get("wins", 0)), esc(form.get("losses", 0)), esc(form["n"])))
    return (
        '<div class="rd-p">'
        '<span class="rd-face"><span>%s</span>'
        '<img src="%s" alt="%s" loading="lazy" decoding="async" onerror="this.dataset.missing=1"></span>'
        '<div><p class="rd-pn">%s</p><p class="rd-pm">%s</p>'
        '<div class="rd-ps">%s</div></div></div>' % (
            esc(initials), esc(p.get("headshot")), esc(p.get("name")),
            esc(p.get("name")), esc(" · ".join(bits)), "".join(stats)))


def match_html(m):
    surface = m.get("surface")
    where = " · ".join(x for x in [m.get("venue"), m.get("court")] if x)
    meta = " · ".join(x for x in [
        m.get("event"), m.get("round"),
        "best of %s" % m["best_of"] if m.get("best_of") else None,
        local_time(m.get("start_utc")),
    ] if x)
    lines = "".join("<p>%s</p>" % esc(l) for l in m.get("lines") or [])

    market = m.get("market") or {}
    ml = market.get("moneyline") or {}
    price = ""
    if ml.get("a") is not None:
        price = '<p class="rd-price">%s %s &nbsp; %s %s</p>' % (
            esc(m["players"][0]["name"]), esc("+%s" % ml["a"] if ml["a"] > 0 else ml["a"]),
            esc(m["players"][1]["name"]), esc("+%s" % ml["b"] if ml["b"] > 0 else ml["b"]))

    return (
        '<article class="rd-m" id="m-%s">'
        '<p class="rd-meta"><span class="rd-surf %s">%s</span>%s</p>'
        '<div class="rd-ps2">%s%s</div>'
        '%s<div class="rd-copy">%s</div>'
        '<p class="rd-where">%s</p>'
        '</article>' % (
            esc(m.get("match_id")),
            esc(str(surface or "").lower()), esc(surface or "Surface unlisted"), esc(" · " + meta if meta else ""),
            player_cell(m["players"][0], surface), player_cell(m["players"][1], surface),
            price, lines, esc(where)))


def page(doc):
    date_iso = doc["date"]
    nice = datetime.date.fromisoformat(date_iso).strftime("%B %-d, %Y") if os.name != "nt" \
        else datetime.date.fromisoformat(date_iso).strftime("%B %d, %Y").replace(" 0", " ")
    matches = doc.get("matches") or []
    retrieved = (doc.get("currency") or {}).get("retrieved") or {}

    schema = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "Tennis Matchups for %s" % nice,
        "url": "%s/tennis/rundown/" % SITE,
        "datePublished": doc.get("built_at"),
        "dateModified": doc.get("built_at"),
        "isPartOf": {"@type": "WebSite", "name": "TrustMyRecord", "url": SITE},
        "about": [{"@type": "SportsEvent",
                   "name": "%s vs %s" % (m["players"][0]["name"], m["players"][1]["name"]),
                   "startDate": m.get("start_utc"),
                   "sport": "Tennis",
                   "location": {"@type": "Place", "name": m.get("venue") or "Unlisted"}}
                  for m in matches],
    }

    src = []
    for name, at in sorted(retrieved.items()):
        src.append("<li><b>%s</b> read %s</li>" % (esc(name), esc(str(at)[:19].replace("T", " ") + " UTC")))

    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="canonical" href="{site}/tennis/rundown/">
<title>Tennis Matchups Today: {nice} | Odds, Rankings and Head to Head | TrustMyRecord</title>
<meta name="description" content="Every prominent ATP and WTA matchup for {nice}, with the moneyline, both players' rankings and season records, the record on the surface being played, and the full head to head.">
<meta name="robots" content="index, follow">
<meta property="og:title" content="Tennis Matchups Today: {nice}">
<meta property="og:description" content="The day's prominent ATP and WTA matchups with odds, rankings, form and head to head.">
<meta property="og:type" content="website">
<meta property="og:url" content="{site}/tennis/rundown/">
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<script type="application/ld+json">{schema}</script>
<style>
:root{{--rd-bg:#06101f;--rd-panel:rgba(15,27,46,.9);--rd-panel2:rgba(18,31,52,.96);
--rd-line:rgba(148,163,184,.18);--rd-ink:#f8fafc;--rd-mut:#9aa8bc;--rd-teal:#1D7FE8;
--rd-blue:#38bdf8;--rd-hard:#3f83d6;--rd-clay:#d97757;--rd-grass:#4ea45f}}
body{{margin:0;background:radial-gradient(circle at 12% 8%,rgba(29,127,232,.14),transparent 34%),
linear-gradient(180deg,var(--rd-bg) 0%,#0b1220 100%);color:var(--rd-ink);
font-family:Inter,system-ui,sans-serif}}
.rd{{width:min(1100px,calc(100% - 32px));margin:0 auto;padding:108px 0 72px}}
@media(max-width:620px){{.rd{{padding-top:92px}}}}
.rd-h{{background:linear-gradient(135deg,rgba(29,127,232,.12),rgba(56,189,248,.06));
border:1px solid var(--rd-line);border-radius:20px;padding:clamp(24px,4vw,44px);margin-bottom:28px}}
.rd-k{{display:inline-block;margin:0 0 12px;font:800 .72rem/1 "Barlow Condensed",sans-serif;
letter-spacing:.18em;text-transform:uppercase;color:var(--rd-teal)}}
.rd-h h1{{margin:0 0 12px;font:800 clamp(1.9rem,4vw,3rem)/1.05 "Barlow Condensed",sans-serif}}
.rd-h p{{margin:0;max-width:70ch;color:var(--rd-mut);font-size:1.05rem;line-height:1.55}}
.rd-m{{background:var(--rd-panel);border:1px solid var(--rd-line);border-radius:16px;
padding:20px;margin-bottom:16px}}
.rd-meta{{margin:0 0 14px;color:var(--rd-mut);font-size:.82rem}}
.rd-surf{{display:inline-block;padding:3px 9px;border-radius:999px;border:1px solid var(--rd-line);
font:700 .7rem/1.5 Inter,sans-serif;letter-spacing:.04em;text-transform:uppercase;margin-right:4px}}
.rd-surf.hard{{color:var(--rd-hard)}}.rd-surf.clay{{color:var(--rd-clay)}}.rd-surf.grass{{color:var(--rd-grass)}}
.rd-ps2{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}
@media(max-width:720px){{.rd-ps2{{grid-template-columns:1fr}}}}
.rd-p{{display:flex;gap:12px;align-items:flex-start;background:var(--rd-panel2);
border:1px solid var(--rd-line);border-radius:12px;padding:13px}}
.rd-face{{position:relative;flex:none;width:52px;height:52px;border-radius:50%;overflow:hidden;
background:linear-gradient(150deg,rgba(56,189,248,.22),rgba(29,127,232,.10));
border:1px solid var(--rd-line);display:grid;place-items:center}}
.rd-face span{{font:800 .8rem/1 "Barlow Condensed",sans-serif;color:var(--rd-mut)}}
.rd-face img{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
object-position:top center;background:#0d1726}}
.rd-face img[data-missing]{{display:none}}
.rd-pn{{margin:0;font:800 1rem/1.25 Inter,sans-serif}}
.rd-pm{{margin:2px 0 7px;color:var(--rd-mut);font-size:.78rem}}
.rd-ps{{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:.78rem;color:var(--rd-mut)}}
.rd-ps b{{color:var(--rd-ink);font-variant-numeric:tabular-nums}}
.rd-price{{margin:12px 0 0;font:800 .95rem/1.4 Inter,sans-serif;color:var(--rd-blue);
font-variant-numeric:tabular-nums}}
.rd-copy{{margin-top:12px}}
.rd-copy p{{margin:0 0 7px;font-size:.94rem;line-height:1.6;color:#dbe4ef}}
.rd-where{{margin:10px 0 0;color:var(--rd-mut);font-size:.78rem}}
.rd-note{{background:rgba(9,18,33,.6);border:1px solid var(--rd-line);border-radius:12px;
padding:16px 18px;color:var(--rd-mut);font-size:.86rem;line-height:1.6;margin-top:22px}}
.rd-note b{{color:var(--rd-ink)}}.rd-note a{{color:var(--rd-blue);font-weight:700;text-decoration:none}}
.rd-note ul{{margin:8px 0 0;padding-left:18px}}.rd-note li{{margin:2px 0}}
</style>
<link rel="stylesheet" href="/static/css/tmr-ds.d4d41a955166.css">
<link rel="stylesheet" href="/static/css/tmr-ds-header.4de36f3898ee.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@600;700;800;900&family=Inter:wght@400;500;600;700;800;900&display=swap">
<link rel="stylesheet" href="/static/css/tmr-navbar.css?v=68ec3081d29a">
</head>
<body class="tmr-ds tmr-site-shell">
<main class="rd">
<section class="rd-h">
<span class="rd-k">Tennis rundown</span>
<h1>The matchups that matter on {nice}</h1>
<p>{count} matches, chosen the same way the daily Game File chooses one: the tier of the tournament, how deep into the draw it is, and how highly the two are ranked. Every figure below was read from a live feed this morning and checked against its own shelf life before this page was written.</p>
</section>
{body}
<div class="rd-note">
<b>Where these numbers come from.</b> Draws, results and rankings from the ESPN tennis feed; prices from the tennis board TrustMyRecord carries in the <a href="/sportsbook/?sport=Tennis">sportsbook</a>; surfaces from the published tour calendars. Records, surface splits, form and head to head are counted here from every completed singles match of the season, and the head to head reaches back four seasons.
<br><br>
<b>How current it is.</b> Each class of fact has its own shelf life and this page does not build if anything is past it. A price is good for thirty minutes, an order of play for six hours, a ranking until the tours publish again on Monday, a season record for twelve hours. What was read, and when:
<ul>{sources}</ul>
<br>
<b>What is missing on purpose.</b> Serve and return statistics. Aces, first serve percentage and hold and break rates are not carried by the feed behind this page, so they are absent rather than estimated.
<br><br>
The full write up of the day's biggest match is at <a href="/matchup-of-the-day/tennis/">Tennis Matchup of the Day</a>, and the live board with every market is on the <a href="/handicapping/tennis/">tennis hub</a>.
</div>
</main>
<script src="/static/js/tmr-session.63f50f4d0988.js"></script><script src="/static/js/tmr-ds-nav.1e844176998a.js"></script>
</body>
</html>
""".format(
        site=SITE, nice=esc(nice), count=len(matches),
        schema=json.dumps(schema, ensure_ascii=False),
        body="".join(match_html(m) for m in matches),
        sources="".join(src) or "<li>no source times recorded</li>",
    )


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default=os.environ.get("TMR_API", DEFAULT_API))
    ap.add_argument("--date", default="")
    ap.add_argument("--limit", type=int, default=12)
    args = ap.parse_args(argv)

    url = "%s/tennis/rundown?limit=%d%s" % (
        args.api.rstrip("/"), args.limit,
        ("&date=%s" % args.date) if args.date else "")
    doc, status = get(url)

    if status != 200 or not doc.get("ok"):
        print("ABORT: the rundown API refused (HTTP %s): %s" % (status, doc.get("error")))
        for v in (doc.get("currency") or {}).get("violations", [])[:10]:
            print("  %s %s: %s" % (v.get("code"), v.get("module"), v.get("detail")))
        print("Nothing was written. The last good rundown stays live.")
        return 1

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, "index.html")
    body = page(doc)
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(body)
    print("wrote %s  (%d matches, %d bytes)" % (out, doc["count"], len(body)))
    print("built_at %s" % doc.get("built_at"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
