#!/usr/bin/env python3
"""
TMR light-theme transform.

Rewrites the DARK colour values that legacy pages hardcode in their own
<style> blocks (and inline style="" attributes) onto the shared light palette
that /handicappers/ already renders -- the design-system tokens in
static/css/tmr-ds.css.

It is deliberately declaration-aware rather than a blind find/replace: the same
hex means "make this white" as a background and "make this navy" as text, so
every colour is mapped through the ROLE of the property it sits on.

  background / background-color / background-image  -> surface ramp
  color / -webkit-text-fill-color / fill            -> ink ramp
  border* / outline* / stroke                       -> line ramp
  box-shadow / text-shadow / filter drop-shadow     -> softened shadow

Saturated colours keep their hue and are re-anchored onto the light palette's
accent for that hue, so teal stays teal and red stays red -- they just stop
being neon-on-black.

Nothing structural is touched: no selectors, no markup, no JS, no URLs.

Usage:
  python scripts/light_theme_transform.py --list          # show target pages
  python scripts/light_theme_transform.py --dry <files>   # preview diffs
  python scripts/light_theme_transform.py --apply <files>
"""
from __future__ import annotations

import argparse
import colorsys
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --------------------------------------------------------------------------
# Target palette -- lifted verbatim from static/css/tmr-ds.css `body.tmr-ds`.
# --------------------------------------------------------------------------
PAGE      = "#F4F7FA"
PANEL     = "#FFFFFF"
PANEL_2   = "#F6F9FC"
PANEL_3   = "#E6EDF5"
INK       = "#07182A"
INK_2     = "#2E4459"
MUTED     = "#5E7590"
LINE      = "#D2DEEA"
LINE_2    = "#B7C8DA"
NAVY      = "#08192B"

# hue anchors: (accent ink, soft surface tint, line tint)
ACCENTS = {
    "teal":   ("#0C948C", "#DEF4F2", "rgba(12,148,140,.28)"),
    "green":  ("#0A8B4E", "#DFF3E8", "rgba(10,139,78,.28)"),
    "gold":   ("#B98505", "#FBF1D8", "rgba(185,133,5,.30)"),
    "red":    ("#BC372E", "#FAE9E7", "rgba(188,55,46,.28)"),
    "violet": ("#5940AE", "#EBE7F9", "rgba(89,64,174,.26)"),
    "blue":   ("#1E5BBF", "#E3ECFB", "rgba(30,91,191,.26)"),
}


# The on-light ink for each hue when it is carrying TEXT rather than a surface.
TEXT_ACCENTS = {
    "teal": "#07736D",   # --brand-dk
    "blue": "#1B4F9E",
}


def hue_bucket(h: float, s: float) -> str:
    """h in degrees."""
    if h < 16 or h >= 336:
        return "red"
    if h < 46:
        return "gold"
    if h < 70:
        return "gold"
    if h < 160:
        return "green"
    if h < 200:
        return "teal"
    if h < 258:
        return "blue"
    return "violet"


# --------------------------------------------------------------------------
# colour parsing
# --------------------------------------------------------------------------
HEX_RE = re.compile(r"#([0-9a-fA-F]{3,8})\b")
FUNC_RE = re.compile(r"\b(rgba?|hsla?)\(\s*([^()]*?)\s*\)", re.I)

NAMED = {
    "white": (255, 255, 255, 1.0),
    "black": (0, 0, 0, 1.0),
}


def parse_hex(tok: str):
    h = tok.lstrip("#")
    if len(h) == 3:
        r, g, b = (int(c * 2, 16) for c in h)
        return r, g, b, 1.0
    if len(h) == 4:
        r, g, b, a = (int(c * 2, 16) for c in h)
        return r, g, b, round(a / 255, 3)
    if len(h) == 6:
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0
    if len(h) == 8:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16),
                round(int(h[6:8], 16) / 255, 3))
    return None


def parse_func(kind: str, body: str):
    parts = [p.strip() for p in re.split(r"[,/]| +", body) if p.strip()]
    if len(parts) < 3:
        return None
    try:
        if kind.lower().startswith("rgb"):
            vals = []
            for p in parts[:3]:
                vals.append(float(p[:-1]) * 2.55 if p.endswith("%") else float(p))
            r, g, b = vals
        else:
            hh = float(parts[0].replace("deg", ""))
            ss = float(parts[1].rstrip("%")) / 100
            ll = float(parts[2].rstrip("%")) / 100
            rr, gg, bb = colorsys.hls_to_rgb((hh % 360) / 360, ll, ss)
            r, g, b = rr * 255, gg * 255, bb * 255
        a = 1.0
        if len(parts) > 3:
            p = parts[3]
            a = float(p.rstrip("%")) / 100 if p.endswith("%") else float(p)
        return int(round(r)), int(round(g)), int(round(b)), round(a, 4)
    except ValueError:
        return None


def lum(r: int, g: int, b: int) -> float:
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def hsl(r: int, g: int, b: int):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    return h * 360, s, l


def chroma(r: int, g: int, b: int) -> float:
    """How colourful this is, 0..1.

    HSL saturation is useless as an "is this an accent?" test at the ends of the
    ramp -- #dbeafe reads as 90% saturated and #0b1220 as 40%, so a pale tint and
    a near-black both got remapped as brand colours. Chroma does not have that
    failure mode.
    """
    return (max(r, g, b) - min(r, g, b)) / 255.0


ACCENT_CHROMA = 0.20


def fmt_rgba(hex_or_rgb: str, a: float) -> str:
    """Return `hex` when opaque, else rgba() of that hex at alpha a."""
    if a >= 0.999:
        return hex_or_rgb
    r, g, b, _ = parse_hex(hex_or_rgb)
    return f"rgba({r},{g},{b},{round(a, 3)})"


# --------------------------------------------------------------------------
# role-based mapping
# --------------------------------------------------------------------------
def map_background(r, g, b, a):
    L = lum(r, g, b)
    c = chroma(r, g, b)
    if c >= ACCENT_CHROMA:
        h, s, _ = hsl(r, g, b)
        ink, soft, _ = ACCENTS[hue_bucket(h, s)]
        if a < 0.55:
            # a translucent accent wash stays a wash, just lighter
            return fmt_rgba(ink, min(0.14, max(0.08, a)))
        if L < 45:
            # a very dark tinted surface is a SURFACE, not a brand colour --
            # this is what turned every navy card into a solid blue block.
            return PANEL if L >= 20 else PAGE
        if L < 150:
            return ink            # a solid accent block (button, badge) stays solid
        return soft
    # neutral / near-neutral
    if a < 0.6:
        # translucent white "lift" layers only read on a dark ground; on light
        # they have to invert or they vanish entirely.
        if L >= 200:
            return fmt_rgba(INK, round(min(0.06, max(0.02, a * 0.35)), 3))
        return fmt_rgba(INK, round(min(0.06, a * 0.12), 3))
    if L < 14:
        return PAGE
    if L < 26:
        return PANEL
    if L < 46:
        return PANEL_2
    if L < 72:
        return PANEL_3
    if L < 108:
        return LINE
    if L < 150:
        return LINE_2
    return None  # already light enough -- leave alone


def map_text(r, g, b, a):
    L = lum(r, g, b)
    c = chroma(r, g, b)
    if c >= ACCENT_CHROMA:
        if L < 55:
            return None  # already dark enough to read on white (button ink)
        h, s, _ = hsl(r, g, b)
        bucket = hue_bucket(h, s)
        # Text gets the darker anchor of the pair. The design system draws the
        # same distinction: --brand paints surfaces, --brand-dk paints links,
        # because #0C948C on #F4F7FA is 3.5:1 and #07736D is 4.9:1.
        ink = TEXT_ACCENTS.get(bucket, ACCENTS[bucket][0])
        return fmt_rgba(ink, a)
    if L >= 186:
        return fmt_rgba(INK, a)
    if L >= 132:
        return fmt_rgba(INK_2, a)
    if L >= 74:
        return fmt_rgba(MUTED, a)
    return None  # already dark ink -- leave alone


def map_border(r, g, b, a):
    L = lum(r, g, b)
    if chroma(r, g, b) >= ACCENT_CHROMA:
        h, s, _ = hsl(r, g, b)
        _, _, ln = ACCENTS[hue_bucket(h, s)]
        return ln
    if a < 0.55:
        return LINE
    if L < 150:
        return LINE
    if L < 210:
        return LINE_2
    return None


def map_shadow(r, g, b, a):
    # Coloured glows are a dark-UI device: on a light page a 20%-alpha yellow or
    # cyan halo just reads as a smudge. Every shadow becomes the same neutral.
    return f"rgba(7,24,42,{round(min(0.10, max(0.04, a * 0.34)), 3)})"


ROLE_MAP = {
    "bg": map_background,
    "text": map_text,
    "line": map_border,
    "shadow": map_shadow,
}


def role_for(prop: str, value: str, clip_text: bool = False) -> str | None:
    p = prop.strip().lower()
    if p.startswith("--"):
        return role_for_varname(p)
    if clip_text and p.startswith("background"):
        # `background-clip:text` means the gradient IS the lettering. Mapping it
        # as a surface is how /today/'s 68px wordmark came out near-white on a
        # near-white page -- technically converted, actually invisible.
        return "text"
    if p in ("box-shadow", "text-shadow", "-webkit-box-shadow"):
        return "shadow"
    if p == "filter" or p == "backdrop-filter":
        return "shadow" if "drop-shadow" in value else None
    if p.startswith("border") or p.startswith("outline") or p in ("stroke", "column-rule", "text-decoration-color", "caret-color"):
        return "line"
    if p in ("color", "-webkit-text-fill-color", "fill", "text-emphasis-color"):
        return "text"
    if p.startswith("background") or p in ("box-shadow", "accent-color"):
        return "bg"
    return None


VAR_BG = re.compile(r"(^|-)(bg|background|page|panel\d?|panel-\d|surface(-\d|-hover)?|card(-bg)?(-solid|-strong|-soft|-hover)?|paper|dark-bg|darker-bg|bg-primary|bg-secondary|bar(-dark)?|soft|tint|fill|wash|glow|dim|shade)($|-|\d)")
VAR_TEXT = re.compile(r"(^|-)(text|ink|muted|fg|foreground|label|heading|link|placeholder)($|-|\d)")
VAR_LINE = re.compile(r"(^|-)(line|border|edge|divider|rule|outline|stroke|glass-border)($|-|\d)")
VAR_SHADOW = re.compile(r"(^|-)(shadow|elevation|sh)($|-|\d)")
VAR_ACCENT = re.compile(r"(^|-)(primary|accent|teal|cyan|brand|neon|gold|amber|green|red|danger|success|warning|purple|violet|blue|justbet|notice|button)($|-|\d)")


def role_for_varname(name: str) -> str | None:
    n = name[2:]
    if VAR_SHADOW.search(n):
        return "shadow"
    if VAR_LINE.search(n):
        return "line"
    if VAR_TEXT.search(n):
        return "text"
    if VAR_ACCENT.search(n):
        return "accent"
    if VAR_BG.search(n):
        return "bg"
    # Unrecognised name. Pages invent their own vocabulary -- blp-pro.css calls
    # its surface ramp --s-0..--s-3 -- and leaving those untouched is what left
    # a converted page with a navy card ramp. Fall back to reading the VALUE:
    # a dark opaque colour is a surface, a light one is ink.
    return "auto"


def map_auto(r, g, b, a):
    if chroma(r, g, b) >= ACCENT_CHROMA:
        return map_accent(r, g, b, a)
    return map_background(r, g, b, a) if lum(r, g, b) < 110 else map_text(r, g, b, a)


def map_accent(r, g, b, a):
    """A named accent token: keep the hue, re-anchor onto the light palette."""
    L = lum(r, g, b)
    if chroma(r, g, b) < ACCENT_CHROMA:
        # a "neutral accent" is really a surface or ink token in disguise
        return map_background(r, g, b, a) if L < 128 else map_text(r, g, b, a)
    h, s, _ = hsl(r, g, b)
    ink, soft, _ = ACCENTS[hue_bucket(h, s)]
    if a < 0.5:
        return fmt_rgba(ink, min(0.16, max(0.08, a)))
    return ink


ROLE_MAP["accent"] = map_accent
ROLE_MAP["auto"] = map_auto


# --------------------------------------------------------------------------
# value rewriting
# --------------------------------------------------------------------------
SKIP_VALUE = re.compile(r"url\(|var\(|currentColor|transparent|inherit|initial|unset", re.I)


def rewrite_value(value: str, role: str) -> str:
    fn = ROLE_MAP[role]

    def repl_hex(m):
        parsed = parse_hex(m.group(0))
        if not parsed:
            return m.group(0)
        out = fn(*parsed)
        return out if out else m.group(0)

    def repl_func(m):
        parsed = parse_func(m.group(1), m.group(2))
        if not parsed:
            return m.group(0)
        out = fn(*parsed)
        return out if out else m.group(0)

    value = HEX_RE.sub(repl_hex, value)
    value = FUNC_RE.sub(repl_func, value)
    return value


DECL_RE = re.compile(r"([-A-Za-z][-A-Za-z0-9_]*)(\s*:\s*)([^;{}]+)")


def rewrite_declarations(css: str, clip_text: bool = False) -> tuple[str, int]:
    hits = [0]

    def repl(m):
        prop, sep, val = m.group(1), m.group(2), m.group(3)
        role = role_for(prop, val, clip_text)
        if not role:
            return m.group(0)
        # `!important`, var() fallbacks and gradient geometry all survive
        # because only the colour literals inside the value are substituted.
        new = rewrite_value(val, role)
        if new != val:
            hits[0] += 1
        return prop + sep + new

    return DECL_RE.sub(repl, css), hits[0]


CLIP_TEXT = re.compile(r"(?:-webkit-)?background-clip\s*:\s*text", re.I)
INNER_RULE = re.compile(r"([^{}]*)\{([^{}]*)\}")

# Selectors that live inside a band which STAYS navy (see section 3 of
# static/css/tmr-light-base.css). Their colours are already correct for a dark
# ground, so converting them is not a no-op -- it is the bug. This is what
# produced #07182A body copy sitting on a #0D273F hero.
#
# The trailing [-_a-z0-9]* is the naming convention doing real work: .feed-hero
# is the band and .feed-hero-point is inside it, so one pattern covers both.
DARK_SCOPE = re.compile(
    r"\.(?:tmr-dark|tmr-hero-dark|hero|ss-hero|about-hero|as-hero|cl-hero|"
    r"og-hero|wc-hero|tmrc-hero|blp-hero|feed-hero|premium-hero|page-hero|"
    r"nv-head)[-_a-z0-9]*\b", re.I)


def rewrite_css(css: str) -> tuple[str, int]:
    """Rewrite a stylesheet rule by rule.

    Declaration-at-a-time is not quite enough. Two things are only knowable at
    rule level: whether `background` paints a surface or paints letterforms
    (that depends on a sibling `background-clip`), and whether the rule targets
    something inside a band that stays dark.

    Only the innermost braces are matched, which is exactly where declarations
    live -- @media wrappers pass through untouched.
    """
    total = [0]

    def rule(m):
        sel, body = m.group(1), m.group(2)
        dark, light = [], []
        for one in split_selector(sel):
            (dark if DARK_SCOPE.search(one) else light).append(one)
        if not light:
            return m.group(0)
        clip = bool(CLIP_TEXT.search(body))
        out, n = rewrite_declarations(body, clip_text=clip)
        total[0] += n
        if not dark:
            return sel + "{" + out + "}"
        # A MIXED rule. `.premium-hero p, .feature-row .feature-name { color:#97a8bc }`
        # is one declaration serving a navy band and a white card at once; keeping
        # it whole means one of the two ends up unreadable. Split it in place.
        lead = sel[:len(sel) - len(sel.lstrip())]
        return (lead + ",".join(dark) + "{" + body + "}\n"
                + lead + ",".join(light) + "{" + out + "}")

    return INNER_RULE.sub(rule, css), total[0]


def split_selector(sel: str) -> list[str]:
    """Split a selector list on top-level commas only."""
    parts, depth, buf = [], 0, []
    for ch in sel:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    tail = "".join(buf).strip()
    if tail:
        parts.append(tail)
    return [p for p in parts if p]


STYLE_BLOCK = re.compile(r"(?is)(<style[^>]*>)(.*?)(</style>)")
STYLE_ATTR = re.compile(r"""(?is)\bstyle\s*=\s*(['"])(.*?)\1""")
SCRIPT_BLOCK = re.compile(r"(?is)<script[^>]*>.*?</script>")


def transform_html(html: str) -> tuple[str, int]:
    total = 0

    # Protect <script> bodies: they can contain style strings we must not touch
    # through the attribute pass.
    scripts: list[str] = []

    def stash(m):
        scripts.append(m.group(0))
        return f"\x00SCRIPT{len(scripts) - 1}\x00"

    html = SCRIPT_BLOCK.sub(stash, html)

    def do_style(m):
        nonlocal total
        css, n = rewrite_css(m.group(2))
        total += n
        return m.group(1) + css + m.group(3)

    html = STYLE_BLOCK.sub(do_style, html)

    def do_attr(m):
        nonlocal total
        css, n = rewrite_declarations(m.group(2))
        total += n
        return f'style={m.group(1)}{css}{m.group(1)}'

    html = STYLE_ATTR.sub(do_attr, html)

    for i, s in enumerate(scripts):
        html = html.replace(f"\x00SCRIPT{i}\x00", s)
    return html, total


def transform_css_file(css: str) -> tuple[str, int]:
    return rewrite_css(css)


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    for rel in args.files:
        path = os.path.join(ROOT, rel.replace("/", os.sep))
        with io.open(path, "r", encoding="utf-8", newline="") as fh:
            src = fh.read()
        if path.endswith(".css"):
            out, n = transform_css_file(src)
        else:
            out, n = transform_html(src)
        if args.apply and out != src:
            with io.open(path, "w", encoding="utf-8", newline="") as fh:
                fh.write(out)
        print(f"{n:5d} declarations  {rel}")


if __name__ == "__main__":
    sys.exit(main())
