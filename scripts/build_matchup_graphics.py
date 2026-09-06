#!/usr/bin/env python3
"""
build_matchup_graphics.py - original TMR artwork for a Game File.

MATCHUP_OF_THE_DAY. Article presentation pass.

Everything here is drawn by TMR: no photography, no club marks, no third-party
asset of any kind. That is not only a licensing decision - a generated asset can
be regenerated per matchup from the same values the provenance record holds, so
the artwork can never drift from the article beside it.

Two kinds of output:

  g1000-stadium.svg   an atmospheric hero backdrop: floodlight towers, stand
                      tiers, field arcs. Abstract on purpose. It evokes a
                      ballpark at first pitch without claiming to be one, and it
                      depicts no identifiable person or venue.

  g1000-card-*.svg    a graphic card per starter, standing in for the headshot
                      we cannot license. Oversized cropped monogram, team
                      accent, position and hand: a designed object rather than a
                      placeholder for a missing photograph.

SVG throughout: a few KB each, sharp at any density, no srcset, diffable.

    python scripts/build_matchup_graphics.py
"""
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "static", "media", "matchups")

INK, MUT = "#F2F6FA", "#6B7885"
FONT = "Inter, 'Segoe UI', Arial, sans-serif"
COND = "'Barlow Condensed', Inter, sans-serif"


def write(name, body):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(body + "</svg>\n")
    print("%-30s %6d bytes" % (name, os.path.getsize(path)))


def stadium(away_hex, home_hex, out_name="g1000-stadium.svg"):
    """Hero backdrop.

    Deliberately low-contrast: this sits BEHIND headline type, so every value is
    chosen to keep text contrast clear of the AA threshold. It should read as
    atmosphere, not as a picture competing with the words on top of it.
    """
    W, H = 1600, 620
    s = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
         f'preserveAspectRatio="xMidYMid slice" role="presentation" aria-hidden="true">')
    s += '<defs>'
    s += ('<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
          '<stop offset="0%" stop-color="#0A1017"/><stop offset="55%" stop-color="#080C12"/>'
          '<stop offset="100%" stop-color="#05070A"/></linearGradient>')
    s += ('<radialGradient id="bloomL" cx="18%" cy="8%" r="46%">'
          '<stop offset="0%" stop-color="#FFFFFF" stop-opacity=".26"/>'
          '<stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>')
    s += ('<radialGradient id="bloomR" cx="82%" cy="6%" r="46%">'
          '<stop offset="0%" stop-color="#FFFFFF" stop-opacity=".22"/>'
          '<stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>')
    s += (f'<radialGradient id="tintA" cx="6%" cy="96%" r="52%">'
          f'<stop offset="0%" stop-color="{away_hex}" stop-opacity=".20"/>'
          f'<stop offset="100%" stop-color="{away_hex}" stop-opacity="0"/></radialGradient>')
    s += (f'<radialGradient id="tintH" cx="94%" cy="96%" r="52%">'
          f'<stop offset="0%" stop-color="{home_hex}" stop-opacity=".22"/>'
          f'<stop offset="100%" stop-color="{home_hex}" stop-opacity="0"/></radialGradient>')
    s += ('<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">'
          '<stop offset="0%" stop-color="#05070A" stop-opacity="0"/>'
          '<stop offset="100%" stop-color="#05070A" stop-opacity=".80"/></linearGradient>')
    # Stand texture: one seat block, tiled. Cheaper and cleaner than 4,000 rects.
    s += ('<pattern id="seats" width="14" height="9" patternUnits="userSpaceOnUse">'
          '<rect width="9" height="4.5" rx="1.5" fill="#FFFFFF" opacity=".10"/></pattern>')
    s += '</defs>'

    s += f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'

    # --- floodlight towers -------------------------------------------------
    for cx, scale in ((196, 1.0), (1404, 1.0), (560, .72), (1040, .72)):
        bw, bh = 128 * scale, 62 * scale
        top = 82 - (1 - scale) * 26
        s += f'<rect x="{cx-3}" y="{top+bh}" width="6" height="{150*scale}" fill="#0E141B" opacity=".9"/>'
        s += (f'<rect x="{cx-bw/2}" y="{top}" width="{bw}" height="{bh}" rx="4" '
              f'fill="#0C1219" stroke="#FFFFFF" stroke-opacity=".07"/>')
        for r in range(3):
            for c in range(6):
                s += (f'<circle cx="{cx-bw/2+12*scale+c*(bw-24*scale)/5:.1f}" '
                      f'cy="{top+13*scale+r*(bh-26*scale)/2:.1f}" r="{4.2*scale:.1f}" '
                      f'fill="#FFF8E7" opacity=".85"/>')
    s += f'<rect width="{W}" height="{H}" fill="url(#bloomL)"/>'
    s += f'<rect width="{W}" height="{H}" fill="url(#bloomR)"/>'

    # --- stand tiers -------------------------------------------------------
    s += (f'<path d="M0,330 L{W},300 L{W},430 L0,452 Z" fill="#101822"/>'
          f'<path d="M0,330 L{W},300 L{W},430 L0,452 Z" fill="url(#seats)"/>')
    s += (f'<path d="M0,452 L{W},430 L{W},520 L0,536 Z" fill="#0C121A"/>'
          f'<path d="M0,452 L{W},430 L{W},520 L0,536 Z" fill="url(#seats)" opacity=".7"/>')
    s += f'<rect y="298" width="{W}" height="2" fill="#FFFFFF" opacity=".05"/>'

    # --- field: mowing arcs ------------------------------------------------
    s += f'<path d="M0,536 L{W},520 L{W},{H} L0,{H} Z" fill="#070C0B"/>'
    for i in range(9):
        s += (f'<path d="M{-200+i*230},{H} Q{-40+i*230},528 {120+i*230},{H} Z" '
              f'fill="#FFFFFF" opacity=".016"/>')
    s += f'<rect y="519" width="{W}" height="1.5" fill="#FFFFFF" opacity=".07"/>'

    s += f'<rect width="{W}" height="{H}" fill="url(#tintA)"/>'
    s += f'<rect width="{W}" height="{H}" fill="url(#tintH)"/>'
    s += f'<rect width="{W}" height="{H}" fill="url(#fade)"/>'
    write(out_name, s)


# The three surfaces the tour plays on, as the colours they actually are.
# These are the court itself, not a brand palette: a clay court is not "orange",
# it is that orange, and a reader who watches tennis will know instantly if the
# hero behind a Roland Garros preview is blue.
SURFACE_PAINT = {
    "hard":  {"court": "#2C6BB5", "apron": "#1B4A80", "line": "#F4F8FC", "glow": "#4C8FD8"},
    "clay":  {"court": "#B4623A", "apron": "#8A4526", "line": "#F6EFE7", "glow": "#D2814F"},
    "grass": {"court": "#3F7A46", "apron": "#2A5730", "line": "#F3F8F1", "glow": "#5FA268"},
}


def court(surface, away_hex, home_hex, out_name="g1000-court.svg"):
    """Hero backdrop for a tennis Game File: the court, in the surface's colour.

    The team-sport hero is a floodlit stand, which is atmosphere for a stadium
    sport and simply wrong here. This draws the thing the match is played on,
    in perspective, painted the colour that surface actually is, with the two
    players' accent colours as the only borrowed element.

    Same contract as stadium(): low contrast, because headline type sits on top
    of it, and no identifiable person or venue anywhere in it.
    """
    W, H = 1600, 620
    paint = SURFACE_PAINT.get(str(surface or "").strip().lower(), SURFACE_PAINT["hard"])
    s = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
         f'preserveAspectRatio="xMidYMid slice" role="presentation" aria-hidden="true">')
    s += '<defs>'
    s += ('<linearGradient id="air" x1="0" y1="0" x2="0" y2="1">'
          '<stop offset="0%" stop-color="#070B11"/><stop offset="60%" stop-color="#0A0F16"/>'
          '<stop offset="100%" stop-color="#05080C"/></linearGradient>')
    s += (f'<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">'
          f'<stop offset="0%" stop-color="{paint["apron"]}" stop-opacity=".55"/>'
          f'<stop offset="100%" stop-color="{paint["court"]}" stop-opacity=".92"/></linearGradient>')
    s += (f'<radialGradient id="lamp" cx="50%" cy="-10%" r="80%">'
          f'<stop offset="0%" stop-color="{paint["glow"]}" stop-opacity=".30"/>'
          f'<stop offset="100%" stop-color="{paint["glow"]}" stop-opacity="0"/></radialGradient>')
    s += (f'<linearGradient id="tintA" x1="0" y1="0" x2="1" y2="0">'
          f'<stop offset="0%" stop-color="{away_hex}" stop-opacity=".16"/>'
          f'<stop offset="45%" stop-color="{away_hex}" stop-opacity="0"/></linearGradient>')
    s += (f'<linearGradient id="tintH" x1="1" y1="0" x2="0" y2="0">'
          f'<stop offset="0%" stop-color="{home_hex}" stop-opacity=".16"/>'
          f'<stop offset="45%" stop-color="{home_hex}" stop-opacity="0"/></linearGradient>')
    s += ('<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">'
          '<stop offset="0%" stop-color="#04070A" stop-opacity=".62"/>'
          '<stop offset="55%" stop-color="#04070A" stop-opacity=".18"/>'
          '<stop offset="100%" stop-color="#04070A" stop-opacity=".72"/></linearGradient>')
    s += '</defs>'

    s += f'<rect width="{W}" height="{H}" fill="url(#air)"/>'
    s += f'<rect width="{W}" height="{H}" fill="url(#lamp)"/>'

    # The apron, then the court inside it, both in one-point perspective with
    # the vanishing point above the middle of the frame.
    s += f'<path d="M120,{H} L{W-120},{H} L{W-470},250 L470,250 Z" fill="url(#floor)"/>'
    s += (f'<path d="M250,{H} L{W-250},{H} L{W-520},292 L520,292 Z" '
          f'fill="{paint["court"]}" opacity=".85"/>')

    ln = paint["line"]
    # Baseline, service line, centre service line, singles tramlines, net.
    s += f'<path d="M250,{H-24} L{W-250},{H-24}" stroke="{ln}" stroke-opacity=".34" stroke-width="5"/>'
    s += f'<path d="M405,436 L{W-405},436" stroke="{ln}" stroke-opacity=".26" stroke-width="4"/>'
    s += f'<path d="M{W//2},436 L{W//2},{H-24}" stroke="{ln}" stroke-opacity=".20" stroke-width="3"/>'
    s += f'<path d="M300,{H} L545,292" stroke="{ln}" stroke-opacity=".24" stroke-width="4"/>'
    s += f'<path d="M{W-300},{H} L{W-545},292" stroke="{ln}" stroke-opacity=".24" stroke-width="4"/>'
    s += f'<path d="M520,292 L{W-520},292" stroke="{ln}" stroke-opacity=".30" stroke-width="4"/>'

    # The net: a band of cord, a tape along the top, and the two posts.
    s += f'<rect x="470" y="243" width="{W-940}" height="52" fill="#05080C" opacity=".55"/>'
    for i in range(56):
        x = 470 + i * ((W - 940) / 55.0)
        s += f'<path d="M{x:.0f},243 L{x:.0f},295" stroke="{ln}" stroke-opacity=".10" stroke-width="1"/>'
    for y in (255, 268, 281):
        s += f'<path d="M470,{y} L{W-470},{y}" stroke="{ln}" stroke-opacity=".08" stroke-width="1"/>'
    s += f'<rect x="470" y="238" width="{W-940}" height="7" fill="{ln}" opacity=".30"/>'
    s += f'<rect x="462" y="236" width="10" height="62" fill="{ln}" opacity=".22"/>'
    s += f'<rect x="{W-472}" y="236" width="10" height="62" fill="{ln}" opacity=".22"/>'

    s += f'<rect width="{W}" height="{H}" fill="url(#tintA)"/>'
    s += f'<rect width="{W}" height="{H}" fill="url(#tintH)"/>'
    s += f'<rect width="{W}" height="{H}" fill="url(#fade)"/>'
    write(out_name, s)


def player_card(slug, name, mono, team, pos, hand, accent, sample, out_name=None):
    """Identity card for a starter. Deliberately NOT a stat card.

    The stats live in the comparison block directly beneath this on the page,
    with bars that put the two starters on the same scale. Printing them here as
    well duplicated every number and made the card read as a broken widget, so
    the card now does the one job the comparison cannot: say who this is.

    The monogram is the subject - large, low-contrast, cropped by the frame - so
    the card is a designed object rather than an empty avatar waiting for the
    headshot we cannot license.
    """
    W, H = 520, 190
    alt = f'{name}, {team} {pos}, {hand}, {sample}.'
    s = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
         f'role="img" aria-label="{alt}">')
    s += ('<defs>'
          f'<linearGradient id="bg{slug}" x1="0" y1="0" x2="1" y2="1">'
          '<stop offset="0%" stop-color="#121A24"/><stop offset="100%" stop-color="#0A0E14"/>'
          '</linearGradient>'
          f'<linearGradient id="acc{slug}" x1="0" y1="0" x2="1" y2="0">'
          f'<stop offset="0%" stop-color="{accent}" stop-opacity=".95"/>'
          f'<stop offset="100%" stop-color="{accent}" stop-opacity=".12"/></linearGradient>'
          f'<radialGradient id="glow{slug}" cx="88%" cy="16%" r="62%">'
          f'<stop offset="0%" stop-color="{accent}" stop-opacity=".22"/>'
          f'<stop offset="100%" stop-color="{accent}" stop-opacity="0"/></radialGradient>'
          f'<clipPath id="clip{slug}"><rect width="{W}" height="{H}" rx="6"/></clipPath>'
          '</defs>')
    s += f'<g clip-path="url(#clip{slug})">'
    s += f'<rect width="{W}" height="{H}" fill="url(#bg{slug})"/>'
    s += f'<rect width="{W}" height="{H}" fill="url(#glow{slug})"/>'
    # Cropped monogram: sits behind the type and runs off the bottom-right edge.
    s += (f'<text x="{W-10}" y="{H+52}" text-anchor="end" font-family="{COND}" font-size="215" '
          f'font-weight="900" fill="#FFFFFF" opacity=".055">{mono}</text>')
    s += f'<rect width="{W}" height="4" fill="url(#acc{slug})"/>'
    s += (f'<text x="26" y="52" font-family="{FONT}" font-size="11.5" font-weight="800" '
          f'letter-spacing="2.4" fill="{accent}">{team}</text>')
    s += (f'<text x="26" y="94" font-family="{FONT}" font-size="30" font-weight="800" '
          f'fill="{INK}">{name}</text>')
    s += (f'<text x="26" y="120" font-family="{FONT}" font-size="11.5" font-weight="700" '
          f'letter-spacing="1.8" fill="{MUT}">{pos.upper()} &#183; {hand.upper()}</text>')
    s += f'<rect x="26" y="142" width="86" height="1.5" fill="{accent}" opacity=".65"/>'
    s += (f'<text x="26" y="168" font-family="{FONT}" font-size="12" font-weight="600" '
          f'fill="{MUT}">{sample}</text>')
    s += f'<rect width="{W}" height="{H}" rx="6" fill="none" stroke="#FFFFFF" stroke-opacity=".09"/>'
    s += '</g>'
    write(out_name or f"g1000-card-{slug}.svg", s)


def venue(name, city, away_hex, home_hex, out_name="g1000-venue.svg"):
    """Original TMR venue plate for the head-to-head section.

    A schematic diamond, not a map and not a photograph of anywhere. It exists
    because "this game is at Truist Park" is load-bearing in the argument - the
    home record and the home/road split both hang off it - and that deserved
    something better than another line of text.
    """
    W, H = 1040, 300
    s = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
         f'role="img" aria-label="Schematic of the ballpark hosting this game: {name}, {city}.">')
    s += ('<defs>'
          f'<linearGradient id="vbg" x1="0" y1="0" x2="1" y2="1">'
          '<stop offset="0%" stop-color="#0E1720"/><stop offset="100%" stop-color="#080C12"/></linearGradient>'
          f'<radialGradient id="vglow" cx="72%" cy="86%" r="62%">'
          f'<stop offset="0%" stop-color="{home_hex}" stop-opacity=".20"/>'
          f'<stop offset="100%" stop-color="{home_hex}" stop-opacity="0"/></radialGradient>'
          '<clipPath id="vclip"><rect width="1040" height="300" rx="6"/></clipPath>'
          '</defs>')
    s += '<g clip-path="url(#vclip)">'
    s += f'<rect width="{W}" height="{H}" fill="url(#vbg)"/>'
    s += f'<rect width="{W}" height="{H}" fill="url(#vglow)"/>'

    # Outfield wall + infield, drawn from home plate at the lower right.
    hx, hy = 720, 246
    s += (f'<path d="M{hx},{hy} L{hx-196},{hy-196} A277,277 0 0,1 {hx+0.0},{hy-277} Z" '
          f'fill="#0C1512" stroke="#FFFFFF" stroke-opacity=".05"/>')
    for r in (96, 148, 200, 252):
        s += (f'<path d="M{hx-r*0.7071:.1f},{hy-r*0.7071:.1f} A{r},{r} 0 0,1 {hx},{hy-r} " '
              f'fill="none" stroke="#FFFFFF" stroke-opacity=".045"/>')
    # Infield diamond.
    d = 74
    s += (f'<path d="M{hx},{hy} L{hx-d},{hy-d} L{hx-2*d},{hy} L{hx-d},{hy+d} Z" '
          f'fill="#12202B" stroke="{home_hex}" stroke-opacity=".45"/>')
    for bx, by in ((hx, hy), (hx-d, hy-d), (hx-2*d, hy), (hx-d, hy+d)):
        s += f'<rect x="{bx-4}" y="{by-4}" width="8" height="8" rx="1.5" fill="#FFFFFF" opacity=".30"/>'
    s += f'<circle cx="{hx-d}" cy="{hy}" r="9" fill="#FFFFFF" opacity=".16"/>'

    # Foul lines.
    s += (f'<path d="M{hx},{hy} L{hx-262},{hy-262}" stroke="#FFFFFF" stroke-opacity=".10" fill="none"/>'
          f'<path d="M{hx},{hy} L{hx},{hy-282}" stroke="#FFFFFF" stroke-opacity=".10" fill="none"/>')

    s += f'<rect x="0" y="0" width="4" height="{H}" fill="{home_hex}" opacity=".85"/>'
    s += (f'<text x="40" y="86" font-family="{FONT}" font-size="11.5" font-weight="800" '
          f'letter-spacing="2.4" fill="{home_hex}">TONIGHT&#8217;S BALLPARK</text>')
    s += (f'<text x="40" y="134" font-family="{COND}" font-size="52" font-weight="900" '
          f'letter-spacing="-.01em" fill="{INK}">{name.upper()}</text>')
    s += (f'<text x="40" y="164" font-family="{FONT}" font-size="12.5" font-weight="600" '
          f'fill="{MUT}">{city}</text>')
    s += f'<rect x="40" y="188" width="70" height="1.5" fill="{away_hex}" opacity=".7"/>'
    s += (f'<text x="40" y="222" font-family="{FONT}" font-size="12.5" font-weight="600" '
          f'fill="{MUT}">Home field for the split that decides this game.</text>')
    s += f'<rect width="{W}" height="{H}" rx="6" fill="none" stroke="#FFFFFF" stroke-opacity=".09"/>'
    s += '</g>'
    write(out_name, s)


def build_for_article(slug, spec):
    """Every graphic for one Game File, named after its permanent slug.

    Called by build_matchup_articles.py during the bake, so a new article's
    artwork appears in the same commit as the article. Output is deterministic:
    the same article regenerates byte-identical files, so re-running the bake
    produces no diff and no pointless Pages rebuild.

    `spec` comes straight off the published record — team colours, the two
    starters, the venue — so the artwork cannot drift from the piece beside it.
    """
    away_hex = spec.get("away_color") or "#FF5910"
    home_hex = spec.get("home_color") or "#CE1141"

    # Tennis gets the court it is played on, under the same file name the
    # article already references, so the hero improves without the article
    # having to know anything changed.
    if str(spec.get("sport") or "").lower() == "tennis":
        court(spec.get("surface"), away_hex, home_hex, out_name="%s-stadium.svg" % slug)
    else:
        stadium(away_hex, home_hex, out_name="%s-stadium.svg" % slug)

    # No monogram cards. They existed to stand in for photography the article
    # was not using; the starters' real headshots are now on the page, and a
    # generated card of the same two men beside them is the same information
    # twice, once for real and once not. player_card() is kept — a sport
    # without a headshot feed will want it.

    # Player cards, when the article asked for them. A sport with no headshot
    # feed says who it wants drawn in its `cards` block and gets a designed
    # object rather than an empty frame; the file name is the src the article
    # already published, so the two can never point at different things.
    for card in spec.get("cards") or []:
        name = os.path.basename(card["src"])
        key = name.rsplit("-", 1)[-1].rsplit(".", 1)[0]
        player_card(key, card["name"], card.get("mono") or "", card.get("team") or "",
                    card.get("role") or "", card.get("note") or "",
                    card.get("accent") or "#B3A369", card.get("sample") or "",
                    out_name=name)

    if spec.get("venue_name"):
        venue(spec["venue_name"], spec.get("venue_city") or "",
              away_hex, home_hex, out_name="%s-venue.svg" % slug)


if __name__ == "__main__":
    NYM, ATL = "#FF5910", "#CE1141"
    stadium(NYM, ATL)
    # No stats on the card: they are in the comparison block below it.
    player_card("scott", "Christian Scott", "CS", "NEW YORK METS", "Starting pitcher",
                "Right-handed", NYM, "16 starts this season")
    player_card("elder", "Bryce Elder", "BE", "ATLANTA BRAVES", "Starting pitcher",
                "Right-handed", ATL, "22 starts this season")
    venue("Truist Park", "Atlanta, Georgia", NYM, ATL)
    print("done")
