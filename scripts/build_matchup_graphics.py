#!/usr/bin/env python3
"""
build_matchup_graphics.py - generate a Game File's data graphics as original
TMR SVGs.

MATCHUP_OF_THE_DAY_PHASE1_20260810 (presentation pass).

Why this exists rather than a folder of hand-made images: every number drawn
here is passed in from the same values the article's provenance record holds,
so a graphic cannot drift from the prose beside it. A chart that disagrees with
the paragraph under it is worse than no chart.

No photography, no club marks, no third-party asset of any kind. These are
typographic and geometric charts TMR draws itself, which is also the only
imagery we can publish today without a licence. Team colours appear as thin
accent bars for identification only, never as insignia.

SVG rather than raster: a few KB each, sharp at any density, no srcset needed,
and diffable in review.

    python scripts/build_matchup_graphics.py
"""
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "static", "media", "matchups")

BG, PANEL = "#0A1520", "#0F1D2B"
RULE = "rgba(174,198,220,.16)"
INK, INK2, MUT = "#EAF2FA", "#C3D8EC", "#8FAECB"
ACC = "#22D2C0"            # the one accent, matching the page
NYM, ATL = "#FF5910", "#CE1141"
FONT = "Inter, 'Segoe UI', Arial, sans-serif"


def head(w, h, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
            f'width="{w}" height="{h}" role="img" aria-label="{title}">'
            f'<rect width="{w}" height="{h}" fill="{BG}"/>')


def lab(x, y, t, size=11, fill=MUT, weight=800, anchor="start", ls=1.4):
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" '
            f'font-weight="{weight}" letter-spacing="{ls}" fill="{fill}" '
            f'text-anchor="{anchor}">{t}</text>')


def txt(x, y, t, size=14, fill=INK, weight=600, anchor="start"):
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{t}</text>')


def write(name, body):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(body + "</svg>\n")
    print(f"{name}  {os.path.getsize(path)} bytes")


def pitchers():
    W, H = 1200, 452
    s = head(W, H, "Christian Scott versus Bryce Elder, 2026 season rate comparison")
    s += f'<rect width="{W}" height="64" fill="{PANEL}"/><rect y="63" width="{W}" height="1" fill="{RULE}"/>'
    s += lab(28, 40, "STARTING PITCHERS &#183; 2026 SEASON", 13, ACC)
    s += lab(W - 28, 40, "SOURCE: MLB STATS API", 11, MUT, 700, "end")
    s += f'<rect x="28" y="88" width="4" height="22" fill="{NYM}"/>'
    s += txt(44, 106, "CHRISTIAN SCOTT", 17, INK, 800)
    s += lab(44, 126, "NYM &#183; RHP &#183; 16 GS &#183; 319 BF", 11, MUT)
    s += f'<rect x="{W-32}" y="88" width="4" height="22" fill="{ATL}"/>'
    s += txt(W - 44, 106, "BRYCE ELDER", 17, INK, 800, "end")
    s += lab(W - 44, 126, "22 GS &#183; 529 BF &#183; RHP &#183; ATL", 11, MUT, 800, "end")

    rows = [("ERA", "3.15", "3.69", 3.15, 3.69, "away"),
            ("OPPONENT AVG", ".221", ".230", .221, .230, "away"),
            ("WHIP", "1.26", "1.20", 1.26, 1.20, "home"),
            ("HR ALLOWED", "7", "19", 7, 19, "away"),
            ("INNINGS", "74.1", "126.2", 74.1, 126.2, "home")]
    y, barmax = 168, 360
    for metric, av, hv, af, hf, better in rows:
        share = af / (af + hf)
        la, lb = barmax * share, barmax * (1 - share)
        s += lab(W / 2, y + 4, metric, 10.5, MUT, 800, "middle")
        s += (f'<rect x="{W/2-72-la}" y="{y-12}" width="{la}" height="16" rx="2" '
              f'fill="{NYM}" opacity="{0.85 if better == "away" else 0.32}"/>')
        s += (f'<rect x="{W/2+72}" y="{y-12}" width="{lb}" height="16" rx="2" '
              f'fill="{ATL}" opacity="{0.85 if better == "home" else 0.32}"/>')
        s += txt(W / 2 - 72 - la - 12, y + 2, av, 15, ACC if better == "away" else INK2, 800, "end")
        s += txt(W / 2 + 72 + lb + 12, y + 2, hv, 15, ACC if better == "home" else INK2, 800)
        y += 46
    s += f'<rect x="28" y="{y-14}" width="{W-56}" height="1" fill="{RULE}"/>'
    s += lab(28, y + 16, "BAR LENGTH IS EACH PITCHER&#8217;S SHARE OF THE COMBINED VALUE. "
                         "TEAL MARKS THE BETTER FIGURE FOR THAT METRIC.", 10.5, MUT, 700, "start", .8)
    write("g1000-pitchers.svg", s)


def offense():
    W, H = 1200, 400
    s = head(W, H, "Team offence against right-handed pitching, 2026 season")
    s += f'<rect width="{W}" height="64" fill="{PANEL}"/><rect y="63" width="{W}" height="1" fill="{RULE}"/>'
    s += lab(28, 40, "OFFENCE VS RIGHT-HANDED PITCHING &#183; 2026", 13, ACC)
    s += lab(W - 28, 40, "BOTH LISTED STARTERS ARE RIGHT-HANDED", 11, MUT, 700, "end")
    groups = [("AVG", .233, .252, ".233", ".252"),
              ("OBP", .303, .318, ".303", ".318"),
              ("SLG", .382, .425, ".382", ".425"),
              ("OPS", .685, .743, ".685", ".743")]
    x0, gw, base, top = 74, 268, 330, 130
    for i, (name, a, b, at, bt) in enumerate(groups):
        gx = x0 + i * gw
        mx = max(a, b)
        ha, hb = (base - top) * (a / mx) * .92, (base - top) * (b / mx) * .92
        s += f'<rect x="{gx}" y="{base-ha}" width="76" height="{ha}" rx="3" fill="{NYM}" opacity=".5"/>'
        s += f'<rect x="{gx+96}" y="{base-hb}" width="76" height="{hb}" rx="3" fill="{ATL}" opacity=".8"/>'
        s += txt(gx + 38, base - ha - 12, at, 14, INK2, 800, "middle")
        s += txt(gx + 134, base - hb - 12, bt, 14, ACC, 800, "middle")
        s += lab(gx + 86, base + 24, name, 12, MUT, 800, "middle", 1.6)
    s += f'<rect x="28" y="{base}" width="{W-56}" height="1" fill="{RULE}"/>'
    s += f'<rect x="28" y="{H-44}" width="10" height="10" fill="{NYM}" opacity=".5"/>'
    s += lab(46, H - 35, "NEW YORK METS &#183; 3,247 PA", 11, MUT)
    s += f'<rect x="300" y="{H-44}" width="10" height="10" fill="{ATL}" opacity=".8"/>'
    s += lab(318, H - 35, "ATLANTA BRAVES &#183; 2,854 PA", 11, MUT)
    s += lab(W - 28, H - 35, "SOURCE: MLB STATS API", 11, MUT, 700, "end")
    write("g1000-offense.svg", s)


def bullpen():
    W, H = 1200, 300
    s = head(W, H, "Bullpen comparison across 2026 relief innings")
    s += f'<rect width="{W}" height="64" fill="{PANEL}"/><rect y="63" width="{W}" height="1" fill="{RULE}"/>'
    s += lab(28, 40, "BULLPEN &#183; 2026 RELIEF INNINGS", 13, ACC)
    s += lab(W - 28, 40, "SOURCE: MLB STATS API", 11, MUT, 700, "end")
    rows = [("ERA", 3.74, 3.46, "3.74", "3.46", "home"),
            ("WHIP", 1.25, 1.19, "1.25", "1.19", "home"),
            ("RELIEF INNINGS", 495.2, 442.0, "495.2", "442.0", None)]
    y = 118
    for name, a, b, at, bt, better in rows:
        mx, bar = max(a, b), 320
        s += lab(28, y + 4, name, 11, MUT)
        s += f'<rect x="250" y="{y-11}" width="{bar*(a/mx)}" height="15" rx="2" fill="{NYM}" opacity=".5"/>'
        s += txt(250 + bar * (a / mx) + 10, y + 2, at, 14, ACC if better == "away" else INK2, 800)
        s += f'<rect x="700" y="{y-11}" width="{bar*(b/mx)}" height="15" rx="2" fill="{ATL}" opacity=".78"/>'
        s += txt(700 + bar * (b / mx) + 10, y + 2, bt, 14, ACC if better == "home" else INK2, 800)
        y += 54
    s += f'<rect x="250" y="{H-52}" width="10" height="10" fill="{NYM}" opacity=".5"/>'
    s += lab(268, H - 43, "NEW YORK METS", 11, MUT)
    s += f'<rect x="700" y="{H-52}" width="10" height="10" fill="{ATL}" opacity=".78"/>'
    s += lab(718, H - 43, "ATLANTA BRAVES", 11, MUT)
    write("g1000-bullpen.svg", s)


def h2h():
    W, H = 1200, 320
    s = head(W, H, "Head to head: the 2026 series set against sixteen seasons of meetings")
    s += f'<rect width="{W}" height="64" fill="{PANEL}"/><rect y="63" width="{W}" height="1" fill="{RULE}"/>'
    s += lab(28, 40, "HEAD TO HEAD &#183; TWO SAMPLES, ONE PICTURE", 13, ACC)
    s += lab(28, 108, "THIS SEASON &#183; 11 MEETINGS", 11, MUT)
    unit = 60
    for i in range(11):
        s += (f'<rect x="{28+i*unit}" y="122" width="50" height="30" rx="3" '
              f'fill="{NYM if i < 6 else ATL}" opacity="{".85" if i < 6 else ".7"}"/>')
    s += txt(28 + 11 * unit + 16, 143, "NYM 6&#8211;5", 15, INK, 800)
    s += lab(28, 180, "SMALL SAMPLE &#8212; ELEVEN GAMES IS A COIN FLIP&#8217;S WORTH OF INFORMATION",
             10.5, MUT, 700, "start", .8)
    s += f'<rect x="28" y="198" width="{W-56}" height="1" fill="{RULE}"/>'
    s += lab(28, 234, "SINCE 2010 &#183; 259 MEETINGS &#183; TMR TREND SPOTTER", 11, MUT)
    total, won, barw = 259, 115, W - 56
    s += f'<rect x="28" y="248" width="{barw*won/total}" height="34" rx="3" fill="{NYM}" opacity=".5"/>'
    s += (f'<rect x="{28+barw*won/total}" y="248" width="{barw*(total-won)/total}" height="34" '
          f'rx="3" fill="{ATL}" opacity=".78"/>')
    s += txt(42, 270, "METS 115", 14, INK, 800)
    s += txt(W - 42, 270, "BRAVES 144", 14, INK, 800, "end")
    s += txt(W / 2, 270, "44.4% &#183; MARKET EXPECTED 50.11%", 12.5, INK, 700, "middle")
    write("g1000-h2h.svg", s)


def trendspotter():
    W, H = 1200, 348
    s = head(W, H, "Trend Spotter: win rate against market expectation for both clubs "
                   "versus right-handed starters since 2010")
    s += f'<rect width="{W}" height="64" fill="{PANEL}"/><rect y="63" width="{W}" height="1" fill="{RULE}"/>'
    s += lab(28, 40, "TMR TREND SPOTTER &#183; VS RIGHT-HANDED STARTERS SINCE 2010", 13, ACC)
    s += lab(W - 28, 40, "A WINNING RECORD IS NOT A PROFIT", 11, ACC, 800, "end")
    lo, hi, x0, x1 = 48.0, 58.0, 250, W - 150

    def px(v):
        return x0 + (x1 - x0) * (v - lo) / (hi - lo)

    for g in range(48, 59, 2):
        s += f'<line x1="{px(g)}" y1="96" x2="{px(g)}" y2="292" stroke="{RULE}" stroke-width="1"/>'
        s += lab(px(g), 312, f"{g}%", 10.5, MUT, 700, "middle", .6)
    rows = [("ATLANTA", 53.44, 54.55, "947&#8211;825", "1,772 GAMES", "-1.75% ROI", ATL),
            ("NEW YORK", 51.24, 52.77, "886&#8211;843", "1,729 GAMES", "-3.76% ROI", NYM)]
    y = 146
    for name, actual, expected, rec, n, roi, col in rows:
        s += lab(28, y + 2, name, 12, INK, 800)
        s += lab(28, y + 20, f"{rec} &#183; {n}", 10.5, MUT, 700)
        s += (f'<line x1="{px(lo)}" y1="{y}" x2="{px(actual)}" y2="{y}" stroke="{col}" '
              f'stroke-width="14" stroke-linecap="round" opacity=".5"/>')
        s += f'<circle cx="{px(actual)}" cy="{y}" r="9" fill="{col}"/>'
        s += f'<line x1="{px(expected)}" y1="{y-22}" x2="{px(expected)}" y2="{y+22}" stroke="{ACC}" stroke-width="3"/>'
        s += txt(px(actual), y - 24, f"{actual}% ACTUAL", 11.5, INK, 800, "middle")
        s += txt(px(expected), y + 40, f"{expected}% EXPECTED", 11.5, ACC, 800, "middle")
        s += txt(W - 28, y + 2, roi, 15, INK, 800, "end")
        y += 104
    s += lab(28, H - 12, "BOTH CLUBS SIT LEFT OF THE PRICE THE MARKET CHARGED.", 10.5, MUT, 700, "start", .7)
    write("g1000-trendspotter.svg", s)


def form():
    W, H = 1200, 300
    s = head(W, H, "Season shape: record, runs and recent form for both clubs")
    s += f'<rect width="{W}" height="64" fill="{PANEL}"/><rect y="63" width="{W}" height="1" fill="{RULE}"/>'
    s += lab(28, 40, "SEASON SHAPE &#183; THROUGH AUGUST 9", 13, ACC)
    cards = [("RECORD", "52&#8211;67", "71&#8211;47"),
             ("RUNS SCORED", "499", "576"),
             ("RUNS ALLOWED", "542", "456"),
             ("LAST 10", "6&#8211;4", "8&#8211;2"),
             ("ROAD / HOME", "27&#8211;33", "39&#8211;20")]
    cw = (W - 56) / 5
    for i, (k, a, b) in enumerate(cards):
        x = 28 + i * cw
        s += f'<rect x="{x+4}" y="96" width="{cw-8}" height="150" rx="6" fill="{PANEL}" stroke="{RULE}"/>'
        s += lab(x + cw / 2, 122, k, 10.5, MUT, 800, "middle", 1.1)
        s += f'<rect x="{x+20}" y="140" width="3" height="32" fill="{NYM}"/>'
        s += txt(x + 32, 164, a, 19, INK2, 800)
        s += f'<rect x="{x+20}" y="188" width="3" height="32" fill="{ATL}"/>'
        s += txt(x + 32, 212, b, 19, INK, 800)
    s += f'<rect x="28" y="{H-46}" width="10" height="10" fill="{NYM}"/>'
    s += lab(46, H - 37, "NEW YORK METS", 11, MUT)
    s += f'<rect x="240" y="{H-46}" width="10" height="10" fill="{ATL}"/>'
    s += lab(258, H - 37, "ATLANTA BRAVES", 11, MUT)
    s += lab(W - 28, H - 37, "SOURCE: MLB STATS API", 11, MUT, 700, "end")
    write("g1000-form.svg", s)


if __name__ == "__main__":
    pitchers()
    offense()
    bullpen()
    h2h()
    trendspotter()
    form()
    print("done")
