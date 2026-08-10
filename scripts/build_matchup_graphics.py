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


def stadium(away_hex, home_hex):
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
    write("g1000-stadium.svg", s)


def player_card(slug, name, mono, team, pos, hand, accent, sample):
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
    write(f"g1000-card-{slug}.svg", s)


if __name__ == "__main__":
    NYM, ATL = "#FF5910", "#CE1141"
    stadium(NYM, ATL)
    # No stats on the card: they are in the comparison block below it.
    player_card("scott", "Christian Scott", "CS", "NEW YORK METS", "Starting pitcher",
                "Right-handed", NYM, "16 starts this season")
    player_card("elder", "Bryce Elder", "BE", "ATLANTA BRAVES", "Starting pitcher",
                "Right-handed", ATL, "22 starts this season")
    print("done")
